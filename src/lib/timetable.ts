import { Subject, SubjectType, SpecialFlags, SpecialHoursConfig } from "@/store/timetableStore";
import type { LabPrefsMap } from "@/store/timetableStore";
import { getClassCounselor, getFacultyById, getDepartmentByName, getOpenElectiveHours, getLabSchedulesForSection } from "./supabaseService";
import { 
  buildFacultyAllocationMap, 
  findAvailableFacultyForSlot, 
  allocateFacultyToSlot,
  validateFacultyConflicts,
  type FacultyAllocation 
} from "./facultyAllocation";

/** Fisher-Yates shuffle — returns a new shuffled array */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Returns indices of all null cells in a day row, shuffled randomly */
function randomEmptySlots(dayRow: (string | null)[]): number[] {
  const empties = dayRow.map((c, i) => (c === null ? i : -1)).filter(i => i !== -1);
  return shuffle(empties);
}

export type Grid = (string | null)[][]; // [day][period]

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const PERIODS = 7;

interface GenerateOptions {
  subjects: Subject[];
  special: SpecialFlags;
  specialHoursConfigs?: SpecialHoursConfig[];
  labPreferences?: LabPrefsMap;
  departmentName?: string;
  year?: string;
  section?: string;
}

const emptyGrid = (): Grid => Array.from({ length: 6 }, () => Array.from({ length: PERIODS }, () => null));

const isSSA = (s: Subject) => (s.tags || []).includes("SSA") || /\bSSA\b/i.test(s.name);

const placeSpecialHours = async (
  grid: Grid, 
  flags: SpecialFlags,
  specialHoursConfigs: SpecialHoursConfig[] = [],
  departmentName?: string,
  year?: string,
  section?: string
) => {
  const sat = 5; // index for Saturday
  let classCounselorName: string | null = null;

  // Try to find class counselor for this class
  if (departmentName && year && section) {
    try {
      const department = await getDepartmentByName(departmentName);
      if (department) {
        const counselor = await getClassCounselor(department.id, year, section);
        if (counselor) {
          const facultyDetails = await getFacultyById(counselor.faculty_id);
          if (facultyDetails) {
            classCounselorName = facultyDetails.name;
          }
        }
      }
    } catch (error) {
      console.warn('Could not fetch class counselor:', error);
    }
  }

  // ONLY place special hours from active configurations - ignore legacy flags
  for (const config of specialHoursConfigs) {
    if (!config.is_active) continue;

    const label = classCounselorName 
      ? `${config.special_type} (${classCounselorName})` 
      : config.special_type;

    // Place exact Saturday hours as specified in config
    let saturdayHoursPlaced = 0;
    for (const period of config.saturday_periods) {
      if (saturdayHoursPlaced >= config.saturday_hours) break;
      
      const periodIndex = period - 1; // Convert to 0-based index
      if (periodIndex >= 0 && periodIndex < 7 && grid[sat][periodIndex] === null) {
        grid[sat][periodIndex] = label;
        saturdayHoursPlaced++;
      }
    }

    // Place exact weekdays hours as specified in config
    let weekdaysHoursPlaced = 0;
    let dayIndex = 0;
    
    while (weekdaysHoursPlaced < config.weekdays_hours && dayIndex < 5) {
      for (const period of config.weekdays_periods) {
        if (weekdaysHoursPlaced >= config.weekdays_hours) break;
        
        const periodIndex = period - 1; // Convert to 0-based index
        if (periodIndex >= 0 && periodIndex < 7) {
          if (grid[dayIndex][periodIndex] === null) {
            grid[dayIndex][periodIndex] = label;
            weekdaysHoursPlaced++;
          }
        }
      }
      dayIndex++;
    }
  }
};

/**
 * Calculates remaining available periods after special hours allocation
 */
const calculateAvailablePeriods = (
  grid: Grid,
  specialHoursConfigs: SpecialHoursConfig[] = []
): { totalAvailable: number; dayCapacities: number[] } => {
  const dayCapacities = Array.from({ length: 6 }, (_, d) => 
    grid[d].filter((c) => c == null).length
  );
  
  const totalAvailable = dayCapacities.reduce((sum, cap) => sum + cap, 0);
  
  return { totalAvailable, dayCapacities };
};

/**
 * Reallocates subjects to fill gaps left by removed special hours
 */
const reallocateSubjects = (
  grid: Grid,
  subjects: Subject[],
  remaining: Map<string, number>,
  facultyMap: Map<string, FacultyAllocation>
): void => {
  // Find all empty periods
  const emptySlots: { day: number; period: number }[] = [];
  
  for (let day = 0; day < 6; day++) {
    for (let period = 0; period < PERIODS; period++) {
      if (grid[day][period] === null) {
        emptySlots.push({ day, period });
      }
    }
  }
  
  // Sort subjects by remaining hours (highest first)
  const subjectsToReallocate = subjects
    .filter(s => (remaining.get(s.id) || 0) > 0)
    .sort((a, b) => (remaining.get(b.id) || 0) - (remaining.get(a.id) || 0));
  
  // Try to fill empty slots with remaining subject hours
  for (const subject of subjectsToReallocate) {
    let subjectRemaining = remaining.get(subject.id) || 0;
    const isSSASubject = (subject.tags || []).includes("SSA") || /\bSSA\b/i.test(subject.name);

    // Build a shuffled list of days so we spread subjects randomly
    const dayOrder = shuffle([...Array(6).keys()]);

    for (const d of dayOrder) {
      if (subjectRemaining <= 0) break;

      // Skip Saturday for SSA subjects
      if (isSSASubject && d === 5) continue;

      // Enforce one-subject-per-day: skip if subject already placed on this day
      if (grid[d].some((cell) => cell === subject.name)) continue;

      // Pick a random empty slot on this day
      const slots = randomEmptySlots(grid[d]);
      for (const period of slots) {
        if (subjectRemaining <= 0) break;

        // Check faculty availability
        const facultyResult = findAvailableFacultyForSlot(
          subject.id, d, period, facultyMap, false
        );

        if (facultyResult.success) {
          grid[d][period] = subject.name;
          if (facultyResult.facultyId) {
            allocateFacultyToSlot(facultyResult.facultyId, d, period, facultyMap);
          }
          subjectRemaining--;
          remaining.set(subject.id, subjectRemaining);
          break; // move to next day after placing one per day
        }
      }
    }
  }
};

function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

export async function generateTimetable({ 
  subjects, 
  special, 
  specialHoursConfigs, 
  labPreferences, 
  departmentName, 
  year, 
  section 
}: GenerateOptions): Promise<Grid> {
  const grid = emptyGrid();
  // Pre-lock special hours (both configured and legacy)
  await placeSpecialHours(grid, special, specialHoursConfigs, departmentName, year, section);

  // Place manually allocated labs from Lab Management
  if (departmentName && year && section) {
    try {
      const department = await getDepartmentByName(departmentName);
      if (department) {
        const manualLabs = await getLabSchedulesForSection(department.id, year, section);
        
        // Place manual labs
        for (const slot of manualLabs) {
          if (slot.day >= 0 && slot.day < 6 && slot.period >= 0 && slot.period < PERIODS) {
            // Only place if slot is empty (respect special hours priority if any, though manual labs might should override)
            // For now, let's assume manual labs should fill empty slots or override
            grid[slot.day][slot.period] = slot.labName; 
          }
        }
      }
    } catch (error) {
       console.warn('Could not load manual lab schedules:', error);
    }
  }

  // Initialize faculty allocation tracking
  let facultyMap: Map<string, FacultyAllocation> = new Map();
  let departmentId: string | undefined;
  
  if (departmentName && year && section) {
    try {
      const department = await getDepartmentByName(departmentName);
      if (department) {
        departmentId = department.id;
        facultyMap = await buildFacultyAllocationMap(departmentId, year, section);
      }
    } catch (error) {
      console.warn('Could not load faculty allocation map:', error);
    }
  }

  // Labs come primarily from lab_schedules (manual allocation).
  // However, if a lab is NOT manually allocated (or partially), we should auto-allocate the remaining hours
  // to prevent empty slots in the timetable.
  const labs = subjects.filter((s) => s.type === "lab");
  const openElectiveSubjects = subjects.filter((s) => s.type === "open elective");
  const theory = subjects.filter((s) => s.type === "theory" || s.type === "elective");

  // Remaining hours tracker
  const remaining = new Map<string, number>();
  subjects.forEach((s) => remaining.set(s.id, s.hoursPerWeek));

  // 1. DEDUCT MANUALLY PLACED LAB HOURS
  // We need to count how many periods are already taken by each lab in the grid
  // so we only auto-allocate the *remaining* needed hours.
  const placedLabHours = new Map<string, number>();
  
  for (let d = 0; d < 6; d++) {
    for (let p = 0; p < PERIODS; p++) {
      const cell = grid[d][p];
      if (cell) {
        // Check if this cell matches a lab subject
        const lab = labs.find(l => l.name === cell);
        if (lab) {
          const current = placedLabHours.get(lab.id) || 0;
          placedLabHours.set(lab.id, current + 1);
        }
      }
    }
  }

  // Update remaining hours for labs based on manual placement
  labs.forEach((lab) => {
    const placed = placedLabHours.get(lab.id) || 0;
    const left = Math.max(0, lab.hoursPerWeek - placed);
    remaining.set(lab.id, left);
  });

  // Calculate available periods after special hours placement
  const { dayCapacities } = calculateAvailablePeriods(grid, specialHoursConfigs);
  
  // If we have department/year, fetch configured Open Elective hours and reserve them as 'Open Elective' placeholder periods
  let openElectiveHours = 0;
  if (departmentName && year) {
    try {
      const dept = await getDepartmentByName(departmentName);
      if (dept) {
        openElectiveHours = await getOpenElectiveHours(dept.id, year);
      }
    } catch (e) {
      openElectiveHours = 0;
    }
  }

  // Ensure individual Open Elective subjects are NOT scheduled directly
  // Their hours should not be placed; they are listed only in details
  openElectiveSubjects.forEach((s) => {
    remaining.set(s.id, 0);
  });

  // ── SLOT-POOL PLACEMENT ──────────────────────────────────────────────────
  // Build a flat list of every available (day, period) slot after special
  // hours / labs are locked in.

  // 1. Place Open Elective placeholders first (spread across days, max 2/day)
  if (openElectiveHours > 0) {
    // Collect all free slots, shuffle them
    const oePool = shuffle(
      [...Array(6).keys()].flatMap(d =>
        [...Array(PERIODS).keys()]
          .filter(p => grid[d][p] === null)
          .map(p => ({ d, p }))
      )
    );
    // Track how many OE slots placed per day
    const oePerDay = Array(6).fill(0);
    for (const { d, p } of oePool) {
      if (openElectiveHours <= 0) break;
      if (oePerDay[d] >= 2) continue;
      grid[d][p] = 'Open Elective';
      oePerDay[d]++;
      openElectiveHours--;
    }
  }

  // 2. AUTO-ALLOCATE REMAINING LABS (Greedy Block Placement)
  // Labs prefer consecutive slots (blocks of 2, 3, or 4).
  // We try to place them before theory subjects to ensure they find large enough gaps.
  const activeLabs = labs.filter(l => (remaining.get(l.id) || 0) > 0);
  
  for (const lab of activeLabs) {
    let hoursNeeded = remaining.get(lab.id) || 0;
    
    // Iterate days to find a suitable block
    // We prefer days that don't already have this lab (though if we are here, it likely has 0 placed/remaining mismatch)
    // We also respect "One Lab Per Day" if possible (check if day has ANY lab)
    const availableDays = shuffle([...Array(6).keys()]);

    for (const d of availableDays) {
      if (hoursNeeded <= 0) break;

      // Check if day already has a lab (ANY lab)
      // We perform a quick check on the grid row
      const hasLab = grid[d].some(cell => 
        cell && (cell.toString().toUpperCase().includes('LAB') || labs.some(l => l.name === cell))
      );
      if (hasLab) continue; // Skip this day to enforce 1 lab/day

      // Try to find a continuous block of 'hoursNeeded' (capped at 4 for a single session usually, but let's take what we can)
      // If we need 4 hours, try to find 4 empty slots. If we only find 2, take 2.
      // We scan the day for the largest empty block.
      let bestBlockStart = -1;
      let maxBlockSize = 0;
      
      let currentBlockStart = -1;
      let currentBlockSize = 0;

      for (let p = 0; p < PERIODS; p++) {
        if (grid[d][p] === null) {
          if (currentBlockStart === -1) currentBlockStart = p;
          currentBlockSize++;
        } else {
          if (currentBlockSize > maxBlockSize) {
            maxBlockSize = currentBlockSize;
            bestBlockStart = currentBlockStart;
          }
          currentBlockStart = -1;
          currentBlockSize = 0;
        }
      }
      // Check last block
      if (currentBlockSize > maxBlockSize) {
        maxBlockSize = currentBlockSize;
        bestBlockStart = currentBlockStart;
      }

      // If we found a block, place as many hours as we can/need
      if (maxBlockSize > 0) {
        const placeCount = Math.min(hoursNeeded, maxBlockSize);
        // We typically want labs to be at least 2 hours. If we only have 1 hour slot, maybe skip? 
        // But for avoiding empty slots, we better take it.
        
        for (let i = 0; i < placeCount; i++) {
          const p = bestBlockStart + i;
          
          // Check faculty (optional but good practice)
          const facultyResult = findAvailableFacultyForSlot(lab.id, d, p, facultyMap, true);
          
          // We force placement even if faculty check fails to avoid empty slots (priority is filling the grid)
          // But if we can assign valid faculty, do so.
          grid[d][p] = lab.name;
          if (facultyResult.success && facultyResult.facultyId) {
            allocateFacultyToSlot(facultyResult.facultyId, d, p, facultyMap);
          }
        }
        
        hoursNeeded -= placeCount;
        remaining.set(lab.id, hoursNeeded);
      }
    }

    // fallback: if we still have hours needed after trying to respect one-lab-per-day,
    // just put them anywhere valid constraints allow (or empty slots)
    if (hoursNeeded > 0) {
       // ... (Similar loop but ignoring hasLab check, or just leave for general pool?)
       // Labs are awkward in general pool because they might get scattered. 
       // Let's try one more pass ignoring lab-per-day constraint
       for (const d of availableDays) {
        if (hoursNeeded <= 0) break;
        // Same block finding logic...
         let bestBlockStart = -1;
         let maxBlockSize = 0;
         let currentBlockStart = -1;
         let currentBlockSize = 0;
         for (let p = 0; p < PERIODS; p++) {
           if (grid[d][p] === null) {
             if (currentBlockStart === -1) currentBlockStart = p;
             currentBlockSize++;
           } else {
             if (currentBlockSize > maxBlockSize) { maxBlockSize = currentBlockSize; bestBlockStart = currentBlockStart; }
             currentBlockStart = -1; currentBlockSize = 0;
           }
         }
         if (currentBlockSize > maxBlockSize) { maxBlockSize = currentBlockSize; bestBlockStart = currentBlockStart; }

         if (maxBlockSize > 0) {
            const placeCount = Math.min(hoursNeeded, maxBlockSize);
            for (let i = 0; i < placeCount; i++) {
                const p = bestBlockStart + i;
                grid[d][p] = lab.name;
                // Faculty check...
                const fac = findAvailableFacultyForSlot(lab.id, d, p, facultyMap, true);
                if (fac.success && fac.facultyId) allocateFacultyToSlot(fac.facultyId, d, p, facultyMap);
            }
            hoursNeeded -= placeCount;
            remaining.set(lab.id, hoursNeeded);
         }
       }
    }
  }

  // 3. Build the full slot pool for theory subjects (all remaining null slots)
  //    and shuffle it completely — this is the key to random column placement.
  const slotPool: { d: number; p: number }[] = shuffle(
    [...Array(6).keys()].flatMap(d =>
      [...Array(PERIODS).keys()]
        .filter(p => grid[d][p] === null)
        .map(p => ({ d, p }))
    )
  );

  // 4. IMPROVED PRIORITIZATION
  // Instead of a pure random shuffle, we prioritize:
  // - SSA subjects (MUST be Mon-Fri, so hard constraint)
  // - High volume subjects (easier to place early)
  
  // Flatten assignments
  let allAssignments: Subject[] = theory.flatMap(s => Array(remaining.get(s.id) || 0).fill(s));
  
  // Categorize
  const ssaAssignments = allAssignments.filter(s => isSSA(s));
  const otherAssignments = allAssignments.filter(s => !isSSA(s));
  
  // Shuffle categories internally to maintain randomness within priority groups
  const sortedAssignments = [
    ...shuffle(ssaAssignments),
    ...shuffle(otherAssignments)
  ];

  // 5. Assign subjects
  //    We use a multi-pass approach:
  //    Pass A: Strict (One per day, valid faculty)
  //    Pass B: Relaxed (Allow multiple per day if needed, valid faculty)
  //    Pass C: Force (Fill empty slots no matter what, prioritizing avoiding duplicates if possible)

  const usedSlots = new Set<number>(); // index into slotPool

  const tryPlace = (subj: Subject, mode: 'strict' | 'relaxed' | 'force'): boolean => {
    for (let i = 0; i < slotPool.length; i++) {
      if (usedSlots.has(i)) continue;
      const { d, p } = slotPool[i];

      // CONSTRAINT: SSA strict Mon-Fri
      if (isSSA(subj) && d > 4) continue;

      // CONSTRAINT: One per day (Skipped in relaxed/force modes)
      if (mode === 'strict' && grid[d].some(c => c === subj.name)) continue;

      // FACULTY CHECK
      const facultyResult = findAvailableFacultyForSlot(subj.id, d, p, facultyMap, false);
      
      // In Force mode, we ignore faculty unavailability if we absolutely must, 
      // BUT `findAvailableFacultyForSlot` already acts leniently (returns success=true if no faculty assigned).
      // The only hard fail is if allocated faculty are BUSY.
      // In 'force' mode, we might want to override even that? 
      // For now, let's trust the faculty check but rely on the fact that if it fails, we keep searching.
      // If we run out of valid faculty slots, we might leave it empty.
      // TO FIX EMPTY SLOTS: If mode is 'force', and we can't find a valid faculty slot, 
      // we should arguably just place it anyway and let the conflict validator catch it.
      
      if (facultyResult.success || mode === 'force') { 
        grid[d][p] = subj.name;
        if (facultyResult.success && facultyResult.facultyId) {
          allocateFacultyToSlot(facultyResult.facultyId, d, p, facultyMap);
        }
        usedSlots.add(i);
        remaining.set(subj.id, (remaining.get(subj.id) || 1) - 1);
        return true;
      }
    }
    return false;
  };

  // Pass A — Strict
  const unplacedA: Subject[] = [];
  for (const subj of sortedAssignments) {
    if (!tryPlace(subj, 'strict')) unplacedA.push(subj);
  }

  // Pass B — Relaxed (Multiple per day)
  const unplacedB: Subject[] = [];
  for (const subj of unplacedA) {
    if (!tryPlace(subj, 'relaxed')) unplacedB.push(subj);
  }

  // Pass C — Force / Cleanup
  // If we still have subjects and empty slots, cram them in!
  for (const subj of unplacedB) {
    if (!tryPlace(subj, 'force')) {
       console.warn(`Could not place ${subj.name} even in force mode.`);
    }
  }

  return grid;
}


function canPlaceBlock(grid: Grid, day: number, start: number, end: number, labNames?: Set<string>) {
  // Check if any slot in the requested range is occupied
  for (let p = start; p <= end; p++) {
    if (grid[day][p] !== null) return false;
  }
  
  // Ensure day has no lab already (one lab per day rule)
  // Check all periods for any existing lab content
  const hasLab = grid[day].some((cell) => {
    if (cell === null) return false;
    const cellStr = String(cell);
    
    // If we have lab names from the current context, use them
    if (labNames && labNames.has(cellStr)) {
      return true;
    }
    
    // Fallback: check if it looks like a lab (contains "LAB" or "L" suffix)
    return cellStr.toUpperCase().includes("LAB") || 
           cellStr.endsWith("L") || 
           cellStr.endsWith(" L");
  });
  
  if (hasLab) return false;
  return true;
}

function fillBlock(grid: Grid, day: number, start: number, end: number, name: string) {
  for (let p = start; p <= end; p++) grid[day][p] = name;
}

/**
 * Checks if faculty is available for a block of periods (for labs)
 */
function checkFacultyAvailabilityForBlock(
  subject: Subject,
  day: number,
  startPeriod: number,
  endPeriod: number,
  facultyMap: Map<string, FacultyAllocation>,
  isLabSubject: boolean
): { success: boolean; facultyId?: string; facultyName?: string } {
  // Check each period in the block
  for (let period = startPeriod; period <= endPeriod; period++) {
    const result = findAvailableFacultyForSlot(
      subject.id, day, period, facultyMap, isLabSubject
    );
    
    if (!result.success) {
      return { success: false };
    }
  }
  
  // If we reach here, all periods are available
  const firstPeriodResult = findAvailableFacultyForSlot(
    subject.id, day, startPeriod, facultyMap, isLabSubject
  );
  
  return {
    success: true,
    facultyId: firstPeriodResult.facultyId,
    facultyName: firstPeriodResult.facultyName
  };
}

/**
 * Allocates faculty for a block of periods (for labs)
 */
function allocateFacultyForBlock(
  subject: Subject,
  day: number,
  startPeriod: number,
  endPeriod: number,
  facultyMap: Map<string, FacultyAllocation>
): void {
  // Find the faculty for this subject
  const result = findAvailableFacultyForSlot(
    subject.id, day, startPeriod, facultyMap, true
  );
  
  if (result.success && result.facultyId) {
    // Allocate all periods in the block to this faculty
    for (let period = startPeriod; period <= endPeriod; period++) {
      allocateFacultyToSlot(result.facultyId, day, period, facultyMap);
    }
  }
}

export function validateTotalHours(subjects: Subject[]): { ok: boolean; total: number; } {
  const total = subjects.reduce((a, s) => a + s.hoursPerWeek, 0);
  return { ok: total <= 42, total };
}

/**
 * Validates that the generated timetable follows lab placement rules
 * - Only one lab per day
 * - Morning labs are placed in P1-P4 when enabled
 * - Evening labs respect their time preferences
 */
/**
 * Validates faculty allocations and conflicts in a timetable
 */
export async function validateTimetableFacultyConflicts(
  grid: Grid,
  subjects: Subject[],
  departmentId: string,
  year: string,
  section: string
): Promise<{ valid: boolean; conflicts: string[]; warnings: string[] }> {
  return await validateFacultyConflicts(grid, subjects, departmentId, year, section);
}

export function validateLabPlacement(grid: Grid, subjects: Subject[], labPreferences?: LabPrefsMap): { 
  valid: boolean; 
  errors: string[]; 
  labDays: Record<string, number[]>; 
} {
  const errors: string[] = [];
  const labDays: Record<string, number[]> = {};
  const labs = subjects.filter(s => s.type === "lab");
  const labNames = new Set(labs.map(l => l.name));

  // Check each day for lab placement violations
  for (let day = 0; day < 6; day++) {
    const dayLabs: string[] = [];
    
    for (let period = 0; period < PERIODS; period++) {
      const cell = grid[day][period];
      if (cell && labNames.has(cell)) {
        dayLabs.push(cell);
        
        // Track which days each lab appears on
        if (!labDays[cell]) labDays[cell] = [];
        if (!labDays[cell].includes(day)) {
          labDays[cell].push(day);
        }
      }
    }
    
    // Check one lab per day rule
    const uniqueLabs = new Set(dayLabs);
    if (uniqueLabs.size > 1) {
      errors.push(`Day ${DAYS[day]} has multiple labs: ${Array.from(uniqueLabs).join(", ")}`);
    }
  }

  // Check morning lab preferences
  if (labPreferences) {
    for (const lab of labs) {
      const pref = labPreferences[lab.id];
      if (pref?.morningEnabled && labDays[lab.name]) {
        for (const day of labDays[lab.name]) {
          // Find the periods where this lab appears on this day
          const labPeriods = [];
          for (let p = 0; p < PERIODS; p++) {
            if (grid[day][p] === lab.name) {
              labPeriods.push(p + 1); // Convert to 1-based
            }
          }
          
          // Check if it's in morning periods (P1-P4)
          const inMorning = labPeriods.some(p => p <= 4);
          const inEvening = labPeriods.some(p => p > 4);
          
          if (!inMorning && pref.morningEnabled) {
            errors.push(`Lab ${lab.name} should be in morning (P1-P4) but found in periods: P${labPeriods.join(", P")}`);
          }
          
          if (inMorning && inEvening) {
            errors.push(`Lab ${lab.name} spans both morning and evening periods: P${labPeriods.join(", P")}`);
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    labDays
  };
}
