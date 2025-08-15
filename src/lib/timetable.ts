import { Subject, SubjectType, SpecialFlags } from "@/store/timetableStore";
import type { LabPrefsMap } from "@/store/timetableStore";
import { getClassCounselor, getFacultyById, getDepartmentByName } from "./supabaseService";

export type Grid = (string | null)[][]; // [day][period]

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const PERIODS = 7;

interface GenerateOptions {
  subjects: Subject[];
  special: SpecialFlags;
  labPreferences?: LabPrefsMap;
  departmentName?: string;
  year?: string;
  section?: string;
}

const emptyGrid = (): Grid => Array.from({ length: 6 }, () => Array.from({ length: PERIODS }, () => null));

const isSSA = (s: Subject) => (s.tags || []).includes("SSA") || /\bSSA\b/i.test(s.name);

const placeSaturdaySpecials = async (
  grid: Grid, 
  flags: SpecialFlags,
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

  if (flags.seminar) {
    const seminarLabel = classCounselorName 
      ? `Seminar (${classCounselorName})` 
      : "Seminar";
    grid[sat][2] = seminarLabel; // P3
    grid[sat][3] = seminarLabel; // P4
  }
  if (flags.library) {
    const libraryLabel = classCounselorName 
      ? `Library (${classCounselorName})` 
      : "Library";
    grid[sat][4] = libraryLabel; // P5
  }
  if (flags.counselling) {
    const counsellingLabel = classCounselorName 
      ? `Student Counselling (${classCounselorName})` 
      : "Student Counselling";
    grid[sat][5] = counsellingLabel; // P6
    grid[sat][6] = counsellingLabel; // P7
  }
};

function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

export async function generateTimetable({ 
  subjects, 
  special, 
  labPreferences, 
  departmentName, 
  year, 
  section 
}: GenerateOptions): Promise<Grid> {
  const grid = emptyGrid();
  // Pre-lock Saturday specials
  await placeSaturdaySpecials(grid, special, departmentName, year, section);

  // Separate labs and theory
  const labs = subjects.filter((s) => s.type === "lab");
  const theory = subjects.filter((s) => s.type === "theory");

  // Remaining hours tracker
  const remaining = new Map<string, number>();
  subjects.forEach((s) => remaining.set(s.id, s.hoursPerWeek));

  // Track which labs have been placed to ensure one lab per day
  const placedLabs = new Set<string>();

  // Helper function to check if a day has any lab (including specific lab check)
  const labNames = new Set(labs.map((l) => l.name));
  const dayHasAnyLab = (day: number) => grid[day].some((c) => c != null && labNames.has(String(c)));
  const dayHasThisLab = (day: number, labName: string) => grid[day].some((c) => c === labName);

  // Morning placement preferences: place morning labs first within P1..P4 (Mon–Fri)
  if (labPreferences) {
    const prioritizedLabs = [...labs].sort((a, b) => {
      const pa = labPreferences[a.id]?.priority ?? Number.POSITIVE_INFINITY;
      const pb = labPreferences[b.id]?.priority ?? Number.POSITIVE_INFINITY;
      if (pa !== pb) return pa - pb; // lower first
      return b.hoursPerWeek - a.hoursPerWeek; // longer first
    });
    
    for (const lab of prioritizedLabs) {
      const pref = labPreferences[lab.id];
      if (!pref?.morningEnabled) continue;
      
      const length = lab.hoursPerWeek;
      // Allowed start: up to 4 for 2h/3h; up to 3 for 4h
      const maxStartPeriod = length >= 4 ? 3 : 4;
      const startPeriod = Math.max(1, Math.min(maxStartPeriod, pref.morningStart || 1));
      const startIdx = startPeriod - 1;
      const endIdx = startIdx + length - 1;
      
      let placed = false;
      for (let d = 0; d < 5 && !placed; d++) {
        if (dayHasAnyLab(d)) continue; // Skip days that already have any lab
        
        let ok = true;
        for (let p = startIdx; p <= endIdx; p++) {
          if (grid[d][p] !== null) { ok = false; break; }
        }
        
        if (ok) {
          fillBlock(grid, d, startIdx, endIdx, lab.name);
          remaining.set(lab.id, 0); // Mark as fully placed - morning labs place ALL hours
          placedLabs.add(lab.name);
          placed = true;
        }
      }
    }
  }

  // Place remaining labs (those not placed in morning or without morning preference)
  // Rules:
  // - 4h labs: P4-P7 (consecutive)
  // - 3h labs: P5-P7 (consecutive)
  // - 2h labs: only in the last two periods → P6-P7
  let labDay = 0; // start Monday
  
  for (const lab of labs) {
    let hrs = remaining.get(lab.id) || 0; // Check remaining hours
    if (hrs <= 0 || placedLabs.has(lab.name)) continue; // Skip if already placed
    
    while (hrs > 0) {
      // Find next weekday with free lab block
      let placed = false;
      let attempts = 0;
      
      while (!placed && attempts < 5) {
        const day = labDay % 5; // 0..4 Mon-Fri
        
        // Skip if this day already has any lab (one lab per day rule)
        if (dayHasAnyLab(day)) {
          labDay++;
          attempts++;
          continue;
        }
        
        // Determine preferred blocks based on hours
        let tryBlocks: [number, number][] = [];
        if (hrs >= 4) {
          // 4h → P4..P7
          tryBlocks = [[3, 6]];
        } else if (hrs === 3) {
          // 3h → P5..P7 only
          tryBlocks = [[4, 6]];
        } else if (hrs === 2) {
          // 2h → default P6..P7; allow preference to force start at P5 (P5–P6)
          const preferAt5 = !!labPreferences?.[lab.id]?.eveningTwoHourStartAt5;
          tryBlocks = preferAt5 ? [[4, 5]] : [[5, 6]];
        } else {
          // Fallback: try to place the remaining hours as a contiguous block ending at P7
          const start = Math.max(0, 6 - (hrs - 1));
          tryBlocks = [[start, 6]];
        }
        
        for (const [start, end] of tryBlocks) {
          if (canPlaceBlock(grid, day, start, end, labNames)) {
            fillBlock(grid, day, start, end, lab.name);
            const hoursPlaced = end - start + 1;
            remaining.set(lab.id, (remaining.get(lab.id) || 0) - hoursPlaced);
            hrs -= hoursPlaced;
            placedLabs.add(lab.name);
            placed = true;
            break;
          }
        }
        
        labDay++;
        attempts++;
      }
      
      if (!placed) break; // give up to avoid infinite loop
    }
  }

  // Fill theory subjects greedily, balancing across days, SSA only Mon-Fri
  // Build day capacities (exclude locked cells and Saturday if specials enabled)
  const dayCap = Array.from({ length: 6 }, (_, d) => grid[d].filter((c) => c == null).length);

  // Sort subjects by remaining descending to spread larger ones
  const orderedTheory = theory.sort((a, b) => (remaining.get(b.id)! - remaining.get(a.id)!));

  let placedSomething = true;
  let guard = 0;
  while (placedSomething && guard < 1000) {
    placedSomething = false;
    for (const s of orderedTheory) {
      let left = remaining.get(s.id) || 0;
      if (left <= 0) continue;

      // iterate days preferring those with capacity and where the same subject is not already present that day
      const dayOrder = [...Array(6).keys()].sort((a, b) => dayCap[b] - dayCap[a]);
      for (const d of dayOrder) {
        if (isSSA(s) && d > 4) continue; // SSA Mon-Fri only
        if (!grid[d].some((cell) => cell === s.name)) {
          // find first empty slot (limit to P1-2 on Saturday)
          const limit = d === 5 ? 2 : PERIODS;
          const idx = grid[d].findIndex((c, i) => c == null && i < limit);
          if (idx !== -1) {
            grid[d][idx] = s.name;
            remaining.set(s.id, left - 1);
            dayCap[d] -= 1;
            placedSomething = true;
            break;
          }
        }
      }
    }
    guard++;
  }

  // Lightweight backtracking: if any subject has leftover hours, try allowing two in a day
  const unresolved = [...remaining.entries()].filter(([id, r]) => r > 0);
  if (unresolved.length) {
    for (const [id, r] of unresolved) {
      const subj = subjects.find((s) => s.id === id)!;
      let left = r;
      for (let d = 0; d < 6 && left > 0; d++) {
        if (d === 5 && isSSA(subj)) continue; // SSA Mon-Fri only
        const limit = d === 5 ? 2 : PERIODS;
        const idx = grid[d].findIndex((c, i) => c == null && i < limit);
        if (idx !== -1) {
          grid[d][idx] = subj.name;
          left--;
        }
      }
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
