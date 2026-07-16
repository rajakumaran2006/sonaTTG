import { Subject, SubjectType, SpecialFlags, SpecialHoursConfig } from "@/store/timetableStore";
import type { LabPrefsMap } from "@/store/timetableStore";
import { getClassCounselor, getFacultyById, getDepartmentByName, getOpenElectiveHours, getLabSchedulesForSection, getSpecialHoursConfigsForYear, getLabPreferences, getSubjectsForYear, getSectionSubjects } from "./supabaseService";
import {
  buildFacultyAllocationMap,
  findAvailableFacultyForSlot,
  allocateFacultyToSlot,
  validateFacultyConflicts,
  checkStaffAvailabilityForWeek,
  type FacultyAllocation
} from "./facultyAllocation";

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Fisher-Yates shuffle — returns a new shuffled array */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
  openElectiveMode?: 'parallel' | 'separate';
  electiveMode?: 'parallel' | 'separate';
}

const emptyGrid = (): Grid =>
  Array.from({ length: 6 }, () => Array.from({ length: PERIODS }, () => null));

const isSSA = (s: Subject) =>
  (s.tags || []).includes("SSA") || /\bSSA\b/i.test(s.name);

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 0 — Parallel Data Loader
// All async database calls fire simultaneously via Promise.all
// ─────────────────────────────────────────────────────────────────────────────

interface LoadedContext {
  facultyMap: Map<string, FacultyAllocation>;
  departmentId: string | undefined;
  classCounselorName: string | null;
  manualLabs: Array<{ day: number; period: number; labName: string }>;
  openElectiveHours: number;
}

async function loadAllContext(
  departmentName: string | undefined,
  year: string | undefined,
  section: string | undefined,
  specialHoursConfigs: SpecialHoursConfig[]
): Promise<LoadedContext> {
  if (!departmentName || !year || !section) {
    return {
      facultyMap: new Map(),
      departmentId: undefined,
      classCounselorName: null,
      manualLabs: [],
      openElectiveHours: 0,
    };
  }

  // First resolve department (needed as FK for other queries)
  const department = await getDepartmentByName(departmentName);
  if (!department) {
    return {
      facultyMap: new Map(),
      departmentId: undefined,
      classCounselorName: null,
      manualLabs: [],
      openElectiveHours: 0,
    };
  }

  const deptId = department.id;

  // Fire all independent queries in parallel
  const [facultyMap, counselorResult, manualLabs, openElectiveHours] =
    await Promise.all([
      // Faculty allocation map (cross-section conflict awareness)
      buildFacultyAllocationMap(deptId, year, section).catch((err) => {
        console.warn("[Phase 0] Could not load faculty map:", err);
        return new Map<string, FacultyAllocation>();
      }),

      // Class counselor name (for special hours label)
      (async () => {
        try {
          const counselor = await getClassCounselor(deptId, year, section);
          if (counselor) {
            const details = await getFacultyById(counselor.faculty_id);
            return details?.name ?? null;
          }
        } catch (e) {
          console.warn("[Phase 0] Could not load class counselor:", e);
        }
        return null;
      })(),

      // Static lab schedules from DB — these are NEVER moved
      getLabSchedulesForSection(deptId, year, section).catch((err) => {
        console.warn("[Phase 0] Could not load lab schedules:", err);
        return [] as Array<{ day: number; period: number; labName: string }>;
      }),

      // Configured open elective hours for this year
      getOpenElectiveHours(deptId, year).catch(() => 0),
    ]);

  return {
    facultyMap,
    departmentId: deptId,
    classCounselorName: counselorResult,
    manualLabs,
    openElectiveHours,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 — Lock Static Slots
// Special hours + DB lab schedules are placed first and never touched again.
// ─────────────────────────────────────────────────────────────────────────────

export function parsePeriodValue(p: any, isSatField: boolean = false): { day: number; period: number; isGeneric?: boolean } | null {
  if (typeof p === 'string') {
    const parts = p.split('-');
    if (parts.length === 2) {
      const dayMap: Record<string, number> = {
        'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5,
        'mon': 0, 'tue': 1, 'wed': 2, 'thu': 3, 'fri': 4, 'sat': 5
      };
      const d = dayMap[parts[0]];
      const pr = parseInt(parts[1]);
      if (d !== undefined && !isNaN(pr)) {
        return { day: d, period: pr };
      }
    }
  } else if (typeof p === 'number') {
    if (p > 10) {
      const d = Math.floor(p / 10);
      const pr = p % 10;
      return { day: d, period: pr };
    } else {
      return { day: isSatField ? 5 : -1, period: p, isGeneric: true };
    }
  }
  return null;
}

function getPeriodsForSection(periodsField: any, section?: string): any[] {
  if (!periodsField) return [];
  if (Array.isArray(periodsField)) {
    return periodsField;
  }
  if (typeof periodsField === 'object' && section) {
    return periodsField[section] || periodsField['all'] || [];
  }
  return [];
}

function lockSpecialHours(
  grid: Grid,
  specialHoursConfigs: SpecialHoursConfig[],
  classCounselorName: string | null,
  section?: string
): void {
  const sat = 5; // Saturday index

  for (const config of specialHoursConfigs) {
    if (!config.is_active) continue;

    const label = classCounselorName
      ? `${config.special_type} (${classCounselorName})`
      : config.special_type;

    const genericSat: number[] = [];
    const genericWd: number[] = [];
    const daySpecificSlots: { day: number; period: number }[] = [];

    const processPeriods = (periodsList: any[], isSatField: boolean) => {
      for (const p of periodsList) {
        const parsed = parsePeriodValue(p, isSatField);
        if (!parsed) continue;

        if (parsed.isGeneric) {
          if (isSatField) {
            genericSat.push(parsed.period);
          } else {
            genericWd.push(parsed.period);
          }
        } else {
          daySpecificSlots.push({ day: parsed.day, period: parsed.period });
        }
      }
    };

    const satPeriods = getPeriodsForSection(config.saturday_periods, section);
    const wdPeriods = getPeriodsForSection(config.weekdays_periods, section);

    processPeriods(satPeriods, true);
    processPeriods(wdPeriods, false);

    // 1. Lock day-specific slots first
    for (const slot of daySpecificSlots) {
      const d = slot.day;
      const p = slot.period - 1;
      if (d >= 0 && d < 6 && p >= 0 && p < PERIODS && grid[d][p] === null) {
        grid[d][p] = label;
      }
    }

    // 2. Lock generic Saturday slots (backward compatibility)
    let satPlaced = 0;
    for (const period of genericSat) {
      if (satPlaced >= config.saturday_hours) break;
      const p = period - 1;
      if (p >= 0 && p < PERIODS && grid[sat][p] === null) {
        grid[sat][p] = label;
        satPlaced++;
      }
    }

    // 3. Lock generic weekday slots (backward compatibility)
    let wdPlaced = 0;
    let dayIndex = 0;
    while (wdPlaced < config.weekdays_hours && dayIndex < 5) {
      for (const period of genericWd) {
        if (wdPlaced >= config.weekdays_hours) break;
        const p = period - 1;
        if (p >= 0 && p < PERIODS && grid[dayIndex][p] === null) {
          grid[dayIndex][p] = label;
          wdPlaced++;
        }
      }
      dayIndex++;
    }
  }
}

function isSameSubject(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false;
  const clean = (s: string) => s.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(laboratory|lab|practicals|practical)$/, '');
  const c1 = clean(name1);
  const c2 = clean(name2);
  return c1 === c2 || c1.includes(c2) || c2.includes(c1);
}

function lockStaticLabs(
  grid: Grid,
  manualLabs: Array<{ day: number; period: number; labName: string }>,
  labs: Subject[]
): void {
  for (const slot of manualLabs) {
    if (slot.day >= 0 && slot.day < 6 && slot.period >= 0 && slot.period < PERIODS) {
      const matchedLab = labs.find(l => isSameSubject(l.name, slot.labName));
      grid[slot.day][slot.period] = matchedLab ? matchedLab.name : slot.labName;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 — Staff Pre-Check
// Before placing anything, verify faculty have free time.
// Subjects with NO free faculty slots are flagged but still placed (force mode).
// ─────────────────────────────────────────────────────────────────────────────

interface StaffPreCheckResult {
  fullyUnavailable: Subject[]; // faculty has zero free slots in the week
  warnings: string[];
}

function staffPreCheck(
  subjects: Subject[],
  facultyMap: Map<string, FacultyAllocation>
): StaffPreCheckResult {
  const fullyUnavailable: Subject[] = [];
  const warnings: string[] = [];

  for (const subj of subjects) {
    if (subj.type === "lab" || subj.type === "open elective") continue; // handled separately

    const check = checkStaffAvailabilityForWeek(subj.id, facultyMap);
    if (!check.hasSlots && check.facultyNames.length === 0) {
      // Faculty is assigned but fully booked across all sections
      warnings.push(
        `[Staff Pre-Check] Faculty for "${subj.name}" appears fully booked across all sections. ` +
        `Will force-place subject (conflict may appear in validation).`
      );
      fullyUnavailable.push(subj);
    }
  }

  if (warnings.length > 0) {
    console.warn(warnings.join("\n"));
  }

  return { fullyUnavailable, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3 — Theory Placement (Multi-Pass Constraint-Satisfying)
// ─────────────────────────────────────────────────────────────────────────────

function placeOpenElectives(
  grid: Grid,
  openElectiveHours: number
): void {
  if (openElectiveHours <= 0) return;

  // Fixed OE slots in priority order:
  // Mon P1 → Wed P1 → Thu P1 → Sat P1 → Sat P2
  // Day indices: Mon=0, Wed=2, Thu=3, Sat=5
  // Period index: 0 = Period 1, 1 = Period 2
  const OE_SLOTS: { d: number; p: number }[] = [
    { d: 0, p: 0 }, // Mon Period 1
    { d: 2, p: 0 }, // Wed Period 1
    { d: 3, p: 0 }, // Thu Period 1
    { d: 5, p: 0 }, // Sat Period 1
    { d: 5, p: 1 }, // Sat Period 2
  ];

  let hoursLeft = openElectiveHours;
  for (const { d, p } of OE_SLOTS) {
    if (hoursLeft <= 0) break;
    if (grid[d][p] === null) {
      grid[d][p] = "Open Elective";
      hoursLeft--;
    }
    // If slot is occupied (e.g. by special hours), skip it — don't force overwrite
  }
}



function placeTheorySubjects(
  grid: Grid,
  theory: Subject[],
  remaining: Map<string, number>,
  facultyMap: Map<string, FacultyAllocation>,
  facultyBeforeAfternoon?: boolean
): void {
  // Build flat assignment list: one entry per needed hour
  const ssaAssignments = theory
    .filter((s) => isSSA(s) && (remaining.get(s.id) || 0) > 0)
    .flatMap((s) => Array(remaining.get(s.id) || 0).fill(s));

  const otherAssignments = theory
    .filter((s) => !isSSA(s) && (remaining.get(s.id) || 0) > 0)
    .sort((a, b) => (remaining.get(b.id) || 0) - (remaining.get(a.id) || 0))
    .flatMap((s) => Array(remaining.get(s.id) || 0).fill(s));

  // Priority order: SSA first, then highest-hour subjects
  const allAssignments: Subject[] = [
    ...shuffle(ssaAssignments),
    ...shuffle(otherAssignments),
  ];

  // Build shuffled slot pool from all currently empty cells
  const slotPool: { d: number; p: number }[] = shuffle(
    [...Array(6).keys()].flatMap((d) =>
      [...Array(PERIODS).keys()]
        .filter((p) => grid[d][p] === null)
        .map((p) => ({ d, p }))
    )
  );

  const usedSlotIndices = new Set<number>();

  type PlacementMode = "strict" | "relaxed" | "force";

  /**
   * Try to place a subject assignment into one pool slot.
   * BUGFIX: force mode now also scans the live grid for any null cell
   * that the pool may have missed (overflow scenario where all pool
   * indices are exhausted but null cells still exist).
   */
  const tryPlace = (subj: Subject, mode: PlacementMode): boolean => {
    // Determine if we should prioritize morning slots for this subject
    const subjectIds = subj.id.includes('_') ? subj.id.split('_') : [subj.id];
    const hasFaculty = subjectIds.some(subId => 
      Array.from(facultyMap.values()).some(fac => fac.subjectIds.has(subId))
    );
    const prioritizeMorning = facultyBeforeAfternoon && hasFaculty;

    // Filter slot pool based on morning preference if prioritizeMorning is true
    const indicesToTry: number[] = [];
    
    // First, try morning slots (period index p < 4, meaning Periods 1-4)
    for (let i = 0; i < slotPool.length; i++) {
      if (usedSlotIndices.has(i)) continue;
      const { p } = slotPool[i];
      if (!prioritizeMorning || p < 4) {
        indicesToTry.push(i);
      }
    }
    
    // If prioritizing morning, try afternoon slots (p >= 4) as fallback
    if (prioritizeMorning) {
      for (let i = 0; i < slotPool.length; i++) {
        if (usedSlotIndices.has(i)) continue;
        const { p } = slotPool[i];
        if (p >= 4) {
          indicesToTry.push(i);
        }
      }
    }

    // ── Pool-based placement (fast path) ──────────────────────────────
    for (const i of indicesToTry) {
      const { d, p } = slotPool[i];

      // The pool was built from null cells; verify still null (safety check)
      if (grid[d][p] !== null) { usedSlotIndices.add(i); continue; }

      // SSA must be Mon–Fri only
      if (isSSA(subj) && d > 4) continue;

      // Strict mode: no duplicate subject on the same day
      if (mode === "strict" && grid[d].some((c) => c === subj.name)) continue;

      // Faculty availability check (always returns success:true for theory)
      const facultyResult = findAvailableFacultyForSlot(
        subj.id, d, p, facultyMap, false
      );

      if (facultyResult.success || mode === "force") {
        grid[d][p] = subj.name;
        if (facultyResult.success && facultyResult.facultyId) {
          allocateFacultyToSlot(facultyResult.facultyId, d, p, facultyMap);
        }
        usedSlotIndices.add(i);
        remaining.set(subj.id, (remaining.get(subj.id) || 1) - 1);
        return true;
      }
    }

    // ── BUGFIX: Force-mode live-grid scan ─────────────────────────────
    // When all pool indices are used but null cells still exist
    // (can happen when demand > pool size due to OE/lab interactions),
    // scan the live grid directly and claim any null cell.
    if (mode === "force") {
      // Pass 1: Morning scan
      for (let d = 0; d < 6; d++) {
        for (let p = 0; p < PERIODS; p++) {
          if (grid[d][p] !== null) continue;
          if (isSSA(subj) && d > 4) continue;
          if (prioritizeMorning && p >= 4) continue;
          
          const fac = findAvailableFacultyForSlot(subj.id, d, p, facultyMap, false);
          grid[d][p] = subj.name;
          if (fac.success && fac.facultyId) {
            allocateFacultyToSlot(fac.facultyId, d, p, facultyMap);
          }
          remaining.set(subj.id, (remaining.get(subj.id) || 1) - 1);
          return true;
        }
      }
      // Pass 2: Afternoon scan (fallback)
      for (let d = 0; d < 6; d++) {
        for (let p = 0; p < PERIODS; p++) {
          if (grid[d][p] !== null) continue;
          if (isSSA(subj) && d > 4) continue;
          
          const fac = findAvailableFacultyForSlot(subj.id, d, p, facultyMap, false);
          grid[d][p] = subj.name;
          if (fac.success && fac.facultyId) {
            allocateFacultyToSlot(fac.facultyId, d, p, facultyMap);
          }
          remaining.set(subj.id, (remaining.get(subj.id) || 1) - 1);
          return true;
        }
      }
    }

    return false;
  };

  // Pass A — Strict (1 subject per day, faculty must be free)
  const unplacedA: Subject[] = [];
  for (const subj of allAssignments) {
    if (!tryPlace(subj, "strict")) unplacedA.push(subj);
  }

  // Pass B — Relaxed (allow duplicate day, faculty must be free)
  const unplacedB: Subject[] = [];
  for (const subj of unplacedA) {
    if (!tryPlace(subj, "relaxed")) unplacedB.push(subj);
  }

  // Pass C — Force (place no matter what; conflict flagged in validation)
  for (const subj of unplacedB) {
    if (!tryPlace(subj, "force")) {
      console.warn(`[Phase 3] Could not place "${subj.name}" even in force mode.`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4 — Free Hour Fill
// After theory placement, scan for any remaining null slots and try to fill
// them with subjects that still have unplaced hours remaining.
// ─────────────────────────────────────────────────────────────────────────────

function fillFreeHours(
  grid: Grid,
  subjects: Subject[],
  remaining: Map<string, number>,
  facultyMap: Map<string, FacultyAllocation>
): void {
  // Collect all still-empty slots
  const emptySlots: { day: number; period: number }[] = [];
  for (let d = 0; d < 6; d++) {
    for (let p = 0; p < PERIODS; p++) {
      if (grid[d][p] === null) emptySlots.push({ day: d, period: p });
    }
  }

  if (emptySlots.length === 0) return;

  // Subjects that still have hours left (theory only — labs & OE handled elsewhere)
  const theoryWithHours = subjects
    .filter(
      (s) =>
        s.type !== "lab" &&
        s.type !== "open elective" &&
        (remaining.get(s.id) || 0) > 0
    )
    .sort((a, b) => (remaining.get(b.id) || 0) - (remaining.get(a.id) || 0));

  // ── BUGFIX: Removed early-exit when theoryWithHours is empty. ────────────
  // Previously: if remaining=0 for all subjects but 1 slot was null,
  // we returned without filling it. Now we fall through to the repair pass.

  if (theoryWithHours.length > 0) {
    // Fill empty slots with subjects that still have remaining hours
    for (const { day, period } of emptySlots) {
      if (grid[day][period] !== null) continue;

      // Prefer subjects not already placed on this day (spread constraint)
      const preferNotOnDay = theoryWithHours.filter(
        (s) => !grid[day].some((c) => c === s.name) && (remaining.get(s.id) || 0) > 0
      );
      const fallback = theoryWithHours.filter(
        (s) => (remaining.get(s.id) || 0) > 0
      );

      const candidates = preferNotOnDay.length > 0 ? preferNotOnDay : fallback;

      for (const subj of candidates) {
        if ((remaining.get(subj.id) || 0) <= 0) continue;
        if (isSSA(subj) && day === 5) continue;

        const fac = findAvailableFacultyForSlot(subj.id, day, period, facultyMap, false);
        if (fac.success) {
          grid[day][period] = subj.name;
          if (fac.facultyId) allocateFacultyToSlot(fac.facultyId, day, period, facultyMap);
          remaining.set(subj.id, (remaining.get(subj.id) || 1) - 1);
          break;
        }
      }
    }
  }

  // ── REPAIR PASS (Phase 4b) ────────────────────────────────────────────────
  // After filling what we can with remaining hours, any STILL-empty slot is
  // filled as an extra repeat period for the most hour-heavy subject.
  // This covers the case where demand < capacity (e.g., 41 hrs for 42 slots)
  // and ensures NO slot is left blank — matching the user's expectation of a
  // fully populated timetable.
  const allTheory = subjects
    .filter((s) => s.type !== "lab" && s.type !== "open elective")
    .sort((a, b) => b.hoursPerWeek - a.hoursPerWeek);

  for (let d = 0; d < 6; d++) {
    for (let p = 0; p < PERIODS; p++) {
      if (grid[d][p] !== null) continue; // slot already filled

      // Prefer a subject not already on this day
      const preferNotOnDay = allTheory.filter(
        (s) => !grid[d].some((c) => c === s.name)
      );
      const candidates = preferNotOnDay.length > 0 ? preferNotOnDay : allTheory;

      // Pass 1: faculty-aware (preferred — no conflict)
      let placed = false;
      for (const subj of candidates) {
        if (isSSA(subj) && d === 5) continue; // SSA can't go on Saturday
        const fac = findAvailableFacultyForSlot(subj.id, d, p, facultyMap, false);
        if (fac.success) {
          grid[d][p] = subj.name;
          if (fac.facultyId) allocateFacultyToSlot(fac.facultyId, d, p, facultyMap);
          placed = true;
          break;
        }
      }

      // Pass 2 (force): all faculty are booked — place anyway so no slot is blank.
      // The timetable validator will flag any conflict for the admin to review.
      if (!placed) {
        for (const subj of candidates) {
          if (isSSA(subj) && d === 5) continue; // still respect SSA rule
          console.warn(
            `[Phase 4b Force] Slot Day ${d} P${p} — all faculty booked; ` +
            `placing "${subj.name}" (conflict flagged for validation).`
          );
          grid[d][p] = subj.name;
          break;
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-allocate remaining lab hours (only if lab has 0 DB-placed hours)
// Labs from DB are already locked in Phase 1 — this handles edge cases where
// a lab subject has hours configured but no DB schedule entry yet.
// ─────────────────────────────────────────────────────────────────────────────

function autoAllocateRemainingLabs(
  grid: Grid,
  labs: Subject[],
  remaining: Map<string, number>,
  facultyMap: Map<string, FacultyAllocation>
): void {
  const activeLabs = labs.filter((l) => (remaining.get(l.id) || 0) > 0);

  for (const lab of activeLabs) {
    let hoursNeeded = remaining.get(lab.id) || 0;
    const availableDays = shuffle([...Array(6).keys()]);

    const tryPlaceLab = (ignoreDayConflict: boolean) => {
      for (const d of availableDays) {
        if (hoursNeeded <= 0) break;

        // One lab per day rule (unless we're in fallback mode)
        if (!ignoreDayConflict) {
          const hasLab = grid[d].some(
            (cell) =>
              cell &&
              (cell.toString().toUpperCase().includes("LAB") ||
                labs.some((l) => l.name === cell))
          );
          if (hasLab) continue;
        }

        // Find the largest consecutive empty block on this day
        let bestStart = -1;
        let maxBlock = 0;
        let curStart = -1;
        let curBlock = 0;

        for (let p = 0; p < PERIODS; p++) {
          if (grid[d][p] === null) {
            if (curStart === -1) curStart = p;
            curBlock++;
          } else {
            if (curBlock > maxBlock) {
              maxBlock = curBlock;
              bestStart = curStart;
            }
            curStart = -1;
            curBlock = 0;
          }
        }
        if (curBlock > maxBlock) {
          maxBlock = curBlock;
          bestStart = curStart;
        }

        if (maxBlock > 0) {
          const placeCount = Math.min(hoursNeeded, maxBlock);
          for (let i = 0; i < placeCount; i++) {
            const p = bestStart + i;
            grid[d][p] = lab.name;
            const fac = findAvailableFacultyForSlot(
              lab.id, d, p, facultyMap, true
            );
            if (fac.success && fac.facultyId) {
              allocateFacultyToSlot(fac.facultyId, d, p, facultyMap);
            }
          }
          hoursNeeded -= placeCount;
          remaining.set(lab.id, hoursNeeded);
        }
      }
    };

    // First pass: respect one-lab-per-day
    tryPlaceLab(false);

    // Second pass: relax the constraint if hours still remain
    if (hoursNeeded > 0) {
      tryPlaceLab(true);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT — generateTimetable
// ─────────────────────────────────────────────────────────────────────────────

export async function generateTimetable({
  subjects: rawSubjects,
  special,
  specialHoursConfigs = [],
  labPreferences,
  departmentName,
  year,
  section,
  openElectiveMode = 'parallel',
  electiveMode = 'parallel',
  facultyBeforeAfternoon = false,
}: GenerateOptions): Promise<Grid> {
  const grid = emptyGrid();

  // ── Group Parallel Electives & Open Electives ──────────────────────────────
  const electiveSubjects = rawSubjects.filter((s) => s.type === "elective");
  
  let openElectiveSubjects: Subject[] = [];
  let otherSubjectsList: Subject[] = [];
  
  if (openElectiveMode === 'parallel') {
    openElectiveSubjects = rawSubjects.filter((s) => s.type === "open elective");
    otherSubjectsList = rawSubjects.filter(
      (s) => s.type !== "elective" && s.type !== "open elective"
    );
  } else {
    otherSubjectsList = rawSubjects.filter((s) => s.type !== "elective");
  }

  const subjects: Subject[] = [...otherSubjectsList];

  if (electiveMode === 'parallel') {
    const peTagGroups = new Map<string, Subject[]>();
    const ungroupedElectives: Subject[] = [];

    for (const s of electiveSubjects) {
      const peTag = (s.tags || []).find((t) =>
        /^(pe\s*\d+|elective\s*\d+|professional\s*elective\s*\d+)$/i.test(t.trim())
      );
      if (peTag) {
        const key = peTag.trim().toUpperCase();
        if (!peTagGroups.has(key)) peTagGroups.set(key, []);
        peTagGroups.get(key)!.push(s);
      } else {
        ungroupedElectives.push(s);
      }
    }

    const addGroup = (group: Subject[]) => {
      if (group.length === 1) {
        subjects.push(group[0]);
      } else if (group.length > 1) {
        const sorted = [...group].sort((a, b) => a.name.localeCompare(b.name));
        const combinedId = sorted.map((s) => s.id).join("_");
        const combinedName = sorted.map((s) => s.name).join(" / ");
        
        subjects.push({
          id: combinedId,
          name: combinedName,
          hoursPerWeek: sorted[0].hoursPerWeek,
          type: "elective",
          tags: Array.from(new Set(sorted.flatMap((s) => s.tags || []))),
          credits: sorted[0].credits,
          abbreviation: sorted.map((s) => s.abbreviation || s.name).join("/"),
        });
      }
    };

    for (const group of peTagGroups.values()) {
      addGroup(group);
    }
    // Ungrouped electives run separately (not parallel)
    subjects.push(...ungroupedElectives);
  } else {
    // Separate mode: add all professional electives directly
    subjects.push(...electiveSubjects);
  }

  // Group parallel open electives if in parallel mode and subjects exist
  const hasOeSubjects = openElectiveSubjects.length > 0 || (openElectiveMode === 'separate' && rawSubjects.some((s) => s.type === "open elective"));
  
  if (openElectiveMode === 'parallel' && openElectiveSubjects.length > 0) {
    const sorted = [...openElectiveSubjects].sort((a, b) => a.name.localeCompare(b.name));
    const combinedId = sorted.map((s) => s.id).join("_");
    const combinedName = sorted.map((s) => s.name).join(" / ");
    
    subjects.push({
      id: combinedId,
      name: combinedName,
      hoursPerWeek: sorted[0].hoursPerWeek,
      type: "open elective",
      tags: Array.from(new Set(sorted.flatMap((s) => s.tags || []))),
      credits: sorted[0].credits,
      abbreviation: sorted.map((s) => s.abbreviation || s.name).join("/"),
    });
  }

  // ── PHASE 0: Parallel DB Load ──────────────────────────────────────────────
  const ctx = await loadAllContext(
    departmentName,
    year,
    section,
    specialHoursConfigs
  );

  // ── PHASE 1: Lock Static Slots ─────────────────────────────────────────────
  // Special hours first (immutable)
  lockSpecialHours(grid, specialHoursConfigs, ctx.classCounselorName, section);

  const labs = subjects.filter((s) => s.type === "lab");

  // DB lab schedules second (immutable — labs are ALWAYS static from DB)
  lockStaticLabs(grid, ctx.manualLabs, labs);

  // ── Initialize remaining-hours tracker ───────────────────────────────────
  const remaining = new Map<string, number>();
  subjects.forEach((s) => remaining.set(s.id, s.hoursPerWeek));

  // If there are no open elective subjects in the list, zero out open elective hours so we can place placeholders
  if (!hasOeSubjects) {
    const openElectiveSubjectsFiltered = subjects.filter(
      (s) => s.type === "open elective"
    );
    openElectiveSubjectsFiltered.forEach((s) => remaining.set(s.id, 0));
  }

  // Deduct hours already placed by static lab locks
  for (let d = 0; d < 6; d++) {
    for (let p = 0; p < PERIODS; p++) {
      const cell = grid[d][p];
      if (cell) {
        const lab = labs.find((l) => l.name === cell);
        if (lab) {
          const placed = (lab.hoursPerWeek - (remaining.get(lab.id) ?? lab.hoursPerWeek)) + 1;
          remaining.set(lab.id, Math.max(0, lab.hoursPerWeek - placed));
        }
      }
    }
  }

  // Recompute properly: count all DB-placed lab cells
  const placedLabCounts = new Map<string, number>();
  for (let d = 0; d < 6; d++) {
    for (let p = 0; p < PERIODS; p++) {
      const cell = grid[d][p];
      if (cell) {
        const lab = labs.find((l) => l.name === cell);
        if (lab) {
          placedLabCounts.set(lab.id, (placedLabCounts.get(lab.id) || 0) + 1);
        }
      }
    }
  }
  labs.forEach((lab) => {
    const placed = placedLabCounts.get(lab.id) || 0;
    remaining.set(lab.id, Math.max(0, lab.hoursPerWeek - placed));
  });

  // ── PHASE 2: Staff Pre-Check ──────────────────────────────────────────────
  // Include open electives in the theory check if they are being scheduled as subjects
  const theory = subjects.filter(
    (s) => s.type === "theory" || s.type === "elective" || (hasOeSubjects && s.type === "open elective")
  );
  staffPreCheck(theory, ctx.facultyMap);

  // ── Open Elective placeholder slots ──────────────────────────────────────
  // Only place generic placeholders if we have no open elective subjects in the list
  if (!hasOeSubjects) {
    placeOpenElectives(grid, ctx.openElectiveHours);
  }

  // ── Auto-allocate remaining lab hours (edge case: no DB entry) ───────────
  autoAllocateRemainingLabs(grid, labs, remaining, ctx.facultyMap);

  // ── PHASE 3: Theory Placement ─────────────────────────────────────────────
  placeTheorySubjects(grid, theory, remaining, ctx.facultyMap, facultyBeforeAfternoon);

  // ── PHASE 4: Free Hour Fill ───────────────────────────────────────────────
  fillFreeHours(grid, subjects, remaining, ctx.facultyMap);

  return grid;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers (unchanged API — used by Timetable.tsx)
// ─────────────────────────────────────────────────────────────────────────────

function canPlaceBlock(
  grid: Grid,
  day: number,
  start: number,
  end: number,
  labNames?: Set<string>
) {
  for (let p = start; p <= end; p++) {
    if (grid[day][p] !== null) return false;
  }

  const hasLab = grid[day].some((cell) => {
    if (cell === null) return false;
    const cellStr = String(cell);
    if (labNames && labNames.has(cellStr)) return true;
    return (
      cellStr.toUpperCase().includes("LAB") ||
      cellStr.endsWith("L") ||
      cellStr.endsWith(" L")
    );
  });

  return !hasLab;
}

function fillBlock(
  grid: Grid,
  day: number,
  start: number,
  end: number,
  name: string
) {
  for (let p = start; p <= end; p++) grid[day][p] = name;
}

export function validateTotalHours(subjects: Subject[]): {
  ok: boolean;
  total: number;
} {
  const total = subjects.reduce((a, s) => a + s.hoursPerWeek, 0);
  return { ok: total <= 42, total };
}

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

export function validateLabPlacement(
  grid: Grid,
  subjects: Subject[],
  labPreferences?: LabPrefsMap
): {
  valid: boolean;
  errors: string[];
  labDays: Record<string, number[]>;
} {
  const errors: string[] = [];
  const labDays: Record<string, number[]> = {};
  const labs = subjects.filter((s) => s.type === "lab");
  const labNames = new Set(labs.map((l) => l.name));

  for (let day = 0; day < 6; day++) {
    const dayLabs: string[] = [];

    for (let period = 0; period < PERIODS; period++) {
      const cell = grid[day][period];
      if (cell && labNames.has(cell)) {
        dayLabs.push(cell);

        if (!labDays[cell]) labDays[cell] = [];
        if (!labDays[cell].includes(day)) {
          labDays[cell].push(day);
        }
      }
    }

    // One lab per day rule
    const uniqueLabs = new Set(dayLabs);
    if (uniqueLabs.size > 1) {
      errors.push(
        `Day ${DAYS[day]} has multiple labs: ${Array.from(uniqueLabs).join(", ")}`
      );
    }
  }

  // Check morning lab preferences
  if (labPreferences) {
    for (const lab of labs) {
      const pref = labPreferences[lab.id];
      if (pref?.morningEnabled && labDays[lab.name]) {
        for (const day of labDays[lab.name]) {
          const labPeriods: number[] = [];
          for (let p = 0; p < PERIODS; p++) {
            if (grid[day][p] === lab.name) {
              labPeriods.push(p + 1);
            }
          }

          const inMorning = labPeriods.some((p) => p <= 4);
          const inEvening = labPeriods.some((p) => p > 4);

          if (!inMorning && pref.morningEnabled) {
            errors.push(
              `Lab ${lab.name} should be in morning (P1-P4) but found in periods: P${labPeriods.join(", P")}`
            );
          }

          if (inMorning && inEvening) {
            errors.push(
              `Lab ${lab.name} spans both morning and evening periods: P${labPeriods.join(", P")}`
            );
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    labDays,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BATCH GENERATION — generateAllYears
// Generates timetables for Year II, III, IV in parallel.
// Years II, III, IV run concurrently; within each year sections run sequentially
// to preserve cross-section faculty conflict awareness.
// Results are returned in-memory — NOT saved to DB.
// ─────────────────────────────────────────────────────────────────────────────

export type YearSectionResult = {
  year: string;
  section: string;
  grid: string[][];
  status: 'ok' | 'error';
  error?: string;
};

export type BatchGenerationResult = {
  results: YearSectionResult[];
  totalOk: number;
  totalError: number;
};

// Sections per year: II → A,B,C  |  III → A,B,C  |  IV → A,B,C
const YEAR_SECTIONS: Record<string, string[]> = {
  'II':  ['A', 'B', 'C'],
  'III': ['A', 'B', 'C'],
  'IV':  ['A', 'B', 'C'],
};

export async function generateAllYears(
  departmentName: string,
  onProgress?: (year: string, section: string, status: 'running' | 'ok' | 'error', error?: string) => void,
  facultyBeforeAfternoon: boolean = false
): Promise<BatchGenerationResult> {
  const department = await getDepartmentByName(departmentName);
  if (!department) {
    return {
      results: [],
      totalOk: 0,
      totalError: Object.values(YEAR_SECTIONS).flat().length,
    };
  }
  const deptId = department.id;

  const allResults: YearSectionResult[] = [];

  // Generate all years concurrently (outer Promise.all)
  await Promise.all(
    Object.entries(YEAR_SECTIONS).map(async ([year, sections]) => {
      // Load subjects + special hours once per year (shared across sections)
      const [subjects, specialHoursConfigs] = await Promise.all([
        getSubjectsForYear(deptId, year).catch(() => [] as Subject[]),
        getSpecialHoursConfigsForYear(deptId, year).catch(() => [] as SpecialHoursConfig[]),
      ]);

      if (subjects.length === 0) {
        // No subjects configured for this year — mark all sections as error
        for (const section of sections) {
          allResults.push({
            year,
            section,
            grid: [],
            status: 'error',
            error: `No subjects configured for Year ${year}`,
          });
          onProgress?.(year, section, 'error', `No subjects configured for Year ${year}`);
        }
        return;
      }

      // Load elective mode from localStorage per year
      const storedOe = localStorage.getItem(`oe_mode:${deptId}:${year}`) as 'parallel' | 'separate' | null;
      const openElectiveMode: 'parallel' | 'separate' = storedOe ?? 'parallel';
      const storedPe = localStorage.getItem(`pe_mode:${deptId}:${year}`) as 'parallel' | 'separate' | null;
      const electiveMode: 'parallel' | 'separate' = storedPe ?? 'parallel';

      // Sections run SEQUENTIALLY within a year (faculty conflict safety)
      for (const section of sections) {
        onProgress?.(year, section, 'running');
        try {
          // Load section subjects to filter curriculum specifically for this section
          const sectionSubjectIds = await getSectionSubjects(deptId, year, section).catch(() => [] as string[]);
          const sectionSubjects = sectionSubjectIds.length > 0
            ? subjects.filter(s => sectionSubjectIds.includes(s.id))
            : subjects;

          // Load lab prefs per section
          const labPreferences = await getLabPreferences(deptId, year, section).catch(() => ({} as LabPrefsMap));

          const grid = await generateTimetable({
            subjects: sectionSubjects,
            special: { seminar: false, library: false, counselling: false },
            specialHoursConfigs,
            labPreferences,
            departmentName,
            year,
            section,
            openElectiveMode,
            electiveMode,
            facultyBeforeAfternoon,
          });

          const gridAsStrings = grid.map((row) => row.map((c) => c || ''));

          allResults.push({ year, section, grid: gridAsStrings, status: 'ok' });
          onProgress?.(year, section, 'ok');
        } catch (err: any) {
          const msg = err?.message ?? 'Unknown error';
          allResults.push({ year, section, grid: [], status: 'error', error: msg });
          onProgress?.(year, section, 'error', msg);
        }
      }
    })
  );

  const totalOk = allResults.filter((r) => r.status === 'ok').length;
  const totalError = allResults.filter((r) => r.status === 'error').length;

  return { results: allResults, totalOk, totalError };
}
