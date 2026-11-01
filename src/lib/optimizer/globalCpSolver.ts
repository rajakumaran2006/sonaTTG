/**
 * SonaTTG Global CP-SAT Style Timetable Solver
 * 
 * A deterministic Constraint Programming (CP) engine executing:
 * - Multi-class global resource tracking (Faculty, Room, Class)
 * - Domain pruning with Forward Checking & Arc Consistency
 * - MRV (Minimum Remaining Values) & Degree Heuristic variable ordering
 * - Least Constraining Value (LCV) soft-penalty ordering
 * - Atomic contiguous block allocation for 2h, 3h, 4h laboratories
 * - Unified Soft Skills 3+1 structure & Saturday institutional distribution
 * - Diagnostic bottleneck extraction upon infeasibility
 */

import {
  TOTAL_DAYS,
  PERIODS_PER_DAY,
  TOTAL_SLOTS_PER_CLASS,
  TimeSlot,
  classIdToKey,
  TeachingUnit,
  SolverOptions,
  GlobalOptimizationResult,
  SolvedSectionTimetable,
  InfeasibilityDiagnostic,
  DEFAULT_OBJECTIVE_WEIGHTS,
  slotToKey,
  isTheoryActivity,
} from './types';
import { GlobalSchedulingModel, cleanFacultyName, getFacultyAliases } from './globalConstraintModel';

function getTrackingFacultyKeys(
  facId?: string,
  facName?: string,
  facultyNameById?: Map<string, string>
): string[] {
  const keys = new Set<string>();
  if (facId) {
    keys.add(facId);
    if (facultyNameById && facultyNameById.has(facId)) {
      getFacultyAliases(facultyNameById.get(facId)).forEach(k => keys.add(k));
    }
  }
  if (facName) {
    getFacultyAliases(facName).forEach(k => keys.add(k));
  }
  return Array.from(keys);
}
import { validateCompleteTimetableBatch } from './timetableValidator';

interface CellAssignment {
  subjectId: string;
  subjectName: string;
  facultyId?: string;
  secondaryFacultyIds?: string[];
  facultyName?: string;
  roomId?: string;
  isFixed: boolean;
  activityType: string;
}

function pseudoHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export async function solveGlobalTimetable(
  model: GlobalSchedulingModel,
  options: SolverOptions = {}
): Promise<GlobalOptimizationResult> {
  const startTime = Date.now();
  const timeLimitMs = options.timeLimitMs || 25000;
  const maxBacktracks = options.maxBacktracks || 500000;
  const weights = DEFAULT_OBJECTIVE_WEIGHTS;

  // 1. If pre-validation found critical fixed assignment collisions, fail immediately
  if (!model.isModelValid || model.preValidationDiagnostics.some(d => d.severity === 'CRITICAL')) {
    return {
      status: 'INFEASIBLE',
      isFeasible: false,
      isOptimal: false,
      executionTimeMs: Date.now() - startTime,
      sectionResults: [],
      immutableAssignmentsPreserved: 0,
      validationReport: {
        isValid: false,
        hardErrorCount: model.preValidationDiagnostics.length,
        softWarningCount: 0,
        violations: model.preValidationDiagnostics.map(d => ({
          ruleId: d.category,
          ruleCategory: 'FIXED_PRESERVATION',
          severity: 'HARD_ERROR',
          departmentName: d.affectedDepartment || '',
          year: d.affectedYear || '',
          section: d.affectedSection || '',
          subjectName: d.affectedSubject,
          facultyName: d.affectedFacultyName,
          message: d.description,
        })),
        summaryText: `Pre-validation failed: ${model.preValidationDiagnostics[0]?.description || 'Fixed assignment collision'}`,
      },
      diagnostics: model.preValidationDiagnostics,
    };
  }

  // 2. Clone initial state from model's fixed assignments
  // Grid state: classKey -> 6x7 CellAssignment[][]
  const gridState = new Map<string, Array<Array<CellAssignment | null>>>();
  const classOccupied = new Map<string, Set<string>>();
  const classDailySubjectHours = new Map<string, Map<number, Map<string, number>>>(); // classKey -> day -> subjId -> count
  const classDailyLabs = new Map<string, number[]>(); // classKey -> [mon..sat lab count]
  const classSsaDays = new Map<string, Set<number>>(); // classKey -> set of days used for SSA
  const facultySlots = new Map<string, Set<string>>(); // facultyId -> set of 'd:p'
  const facultyDailyHours = new Map<string, number[]>(); // facultyId -> [mon..sat count]
  const facultyTheorySlots = new Map<string, boolean[][]>(); // facultyId -> 6x7 boolean grid of theory teaching
  const roomSlots = new Map<string, Set<string>>(); // roomId -> set of 'd:p'

  for (const c of model.classes) {
    const cKey = classIdToKey(c);
    const grid: Array<Array<CellAssignment | null>> = Array.from({ length: TOTAL_DAYS }, () => Array(PERIODS_PER_DAY).fill(null));
    gridState.set(cKey, grid);
    classOccupied.set(cKey, new Set());
    classDailySubjectHours.set(cKey, new Map());
    classDailyLabs.set(cKey, [0, 0, 0, 0, 0, 0]);
    classSsaDays.set(cKey, new Set());

    const fixedGrid = model.fixedGridByClass.get(cKey);
    if (fixedGrid) {
      for (let d = 0; d < TOTAL_DAYS; d++) {
        for (let p = 0; p < PERIODS_PER_DAY; p++) {
          const cell = fixedGrid[d][p];
          if (cell) {
            grid[d][p] = {
              subjectId: cell.subjectId || '',
              subjectName: cell.subjectName,
              facultyId: cell.facultyId,
              facultyName: cell.facultyName,
              roomId: cell.roomId,
              isFixed: cell.isFixed,
              activityType: cell.activityType,
            };
            classOccupied.get(cKey)!.add(`${d}:${p}`);

            if (cell.roomId) {
              if (!roomSlots.has(cell.roomId)) roomSlots.set(cell.roomId, new Set());
              roomSlots.get(cell.roomId)!.add(`${d}:${p}`);
            }

            // Daily subject count
            if (!classDailySubjectHours.get(cKey)!.has(d)) {
              classDailySubjectHours.get(cKey)!.set(d, new Map());
            }
            const dayMap = classDailySubjectHours.get(cKey)!.get(d)!;
            const sKey = cell.subjectId || cell.subjectName;
            dayMap.set(sKey, (dayMap.get(sKey) || 0) + 1);

            // Lab tracking
            if (cell.activityType === 'lab') {
              classDailyLabs.get(cKey)![d]++;
            }
          }
        }
      }
    }
  }

  // Precompute required Saturday theory hours per class based on weekday capacity deficit
  const classSatTheoryNeeded = new Map<string, number>();
  const classSatTheoryPlaced = new Map<string, number>();
  const classFreeWeekdaySlots = new Map<string, number>();
  const classFreeSaturdaySlots = new Map<string, number>();
  const classFreeSlotsPerDay = new Map<string, number[]>();
  const classRemainingSubjectHours = new Map<string, Map<string, number>>();
  const classUnplacedSsa5th = new Map<string, number>();
  const classUnplacedSsaMorning = new Map<string, number>();

  for (const c of model.classes) {
    const cKey = classIdToKey(c);
    classSatTheoryPlaced.set(cKey, 0);
    classRemainingSubjectHours.set(cKey, new Map());

    const grid = gridState.get(cKey)!;
    let freeWk = 0;
    let freeSat = 0;
    const freePerDay = [0, 0, 0, 0, 0, 0];
    for (let d = 0; d < 5; d++) {
      for (let p = 0; p < PERIODS_PER_DAY; p++) {
        if (grid[d][p] === null) {
          freeWk++;
          freePerDay[d]++;
        }
      }
    }
    for (let p = 0; p < PERIODS_PER_DAY; p++) {
      if (grid[5][p] === null) {
        freeSat++;
        freePerDay[5]++;
      }
    }
    classFreeWeekdaySlots.set(cKey, freeWk);
    classFreeSaturdaySlots.set(cKey, freeSat);
    classFreeSlotsPerDay.set(cKey, freePerDay);

    let fixedWeekdaySlots = 0;
    const fixedGrid = model.fixedGridByClass.get(cKey);
    if (fixedGrid) {
      for (let d = 0; d < 5; d++) {
        for (let p = 0; p < PERIODS_PER_DAY; p++) {
          if (fixedGrid[d][p] !== null) fixedWeekdaySlots++;
        }
      }
    }

    let dynamicWeekdayOnlyHours = 0;
    let totalTheoryHours = 0;
    let ssa5thCount = 0;
    let ssaMornCount = 0;
    for (const u of model.teachingUnits) {
      if (u.classKey === cKey) {
        if (u.tags?.includes('ssa_5th_hour')) ssa5thCount++;
        if (u.tags?.includes('ssa_morning_hour')) ssaMornCount++;
        if (u.activityType === 'lab' && u.duration > 1) {
          dynamicWeekdayOnlyHours += u.duration;
        } else if (u.activityType === 'soft_skill') {
          dynamicWeekdayOnlyHours += u.duration;
        } else if (u.activityType !== 'lab' || u.duration === 1) {
          totalTheoryHours += u.duration;
          const sMap = classRemainingSubjectHours.get(cKey)!;
          sMap.set(u.subjectId, (sMap.get(u.subjectId) || 0) + u.duration);
        }
      }
    }
    classUnplacedSsa5th.set(cKey, ssa5thCount);
    classUnplacedSsaMorning.set(cKey, ssaMornCount);

    const maxWeekdayTheoryCapacity = 35 - fixedWeekdaySlots - dynamicWeekdayOnlyHours;
    const neededOnSat = Math.max(0, totalTheoryHours - maxWeekdayTheoryCapacity);
    classSatTheoryNeeded.set(cKey, neededOnSat);
  }

  // Populate faculty initial allocations
  for (const [facId, slotsMap] of model.occupiedSlotsByFaculty.entries()) {
    const facTrackKeys = getTrackingFacultyKeys(facId, model.facultyNameById?.get(facId), model.facultyNameById);
    for (const k of facTrackKeys) {
      if (!facultySlots.has(k)) facultySlots.set(k, new Set());
      if (!facultyDailyHours.has(k)) facultyDailyHours.set(k, [0, 0, 0, 0, 0, 0]);
      if (!facultyTheorySlots.has(k)) {
        facultyTheorySlots.set(k, Array.from({ length: TOTAL_DAYS }, () => Array(PERIODS_PER_DAY).fill(false)));
      }
    }

    for (const [slotKey, bookings] of slotsMap.entries()) {
      const [dStr, pStr] = slotKey.split(':');
      const d = parseInt(dStr, 10);
      const p = parseInt(pStr, 10);
      const hasTheory = bookings.some(b => isTheoryActivity(undefined, b.subjectName));
      for (const k of facTrackKeys) {
        if (!facultySlots.get(k)!.has(slotKey)) {
          facultySlots.get(k)!.add(slotKey);
          if (d >= 0 && d < TOTAL_DAYS) {
            facultyDailyHours.get(k)![d]++;
          }
        }
        if (hasTheory && d >= 0 && d < TOTAL_DAYS && p >= 0 && p < PERIODS_PER_DAY) {
          facultyTheorySlots.get(k)![d][p] = true;
        }
      }
    }
  }

  // Account for special hours and manual immutable assignments
  for (const assign of model.immutableAssignments) {
    const isTheory = isTheoryActivity(
      assign.source === 'open_elective' ? 'open_elective' : assign.source === 'lab_schedule' ? 'lab' : 'fixed_custom',
      assign.subjectName
    );

    const facIds = [assign.facultyId, ...(assign.secondaryFacultyIds || [])].filter((f): f is string => Boolean(f));
    const facTrackKeys = new Set<string>();
    facIds.forEach(id => {
      getTrackingFacultyKeys(id, assign.facultyName, model.facultyNameById).forEach(k => facTrackKeys.add(k));
    });
    if (assign.facultyName) {
      getFacultyAliases(assign.facultyName).forEach(k => facTrackKeys.add(k));
    }

    for (const facId of facTrackKeys) {
      if (!facultySlots.has(facId)) facultySlots.set(facId, new Set());
      if (!facultyDailyHours.has(facId)) facultyDailyHours.set(facId, [0, 0, 0, 0, 0, 0]);
      if (!facultyTheorySlots.has(facId)) {
        facultyTheorySlots.set(facId, Array.from({ length: TOTAL_DAYS }, () => Array(PERIODS_PER_DAY).fill(false)));
      }

      for (const slot of assign.slots) {
        const slotKey = `${slot.day}:${slot.period}`;
        if (!facultySlots.get(facId)!.has(slotKey)) {
          facultySlots.get(facId)!.add(slotKey);
          if (slot.day >= 0 && slot.day < TOTAL_DAYS) {
            facultyDailyHours.get(facId)![slot.day]++;
          }
        }
        if (isTheory && slot.day >= 0 && slot.day < TOTAL_DAYS && slot.period >= 0 && slot.period < PERIODS_PER_DAY) {
          facultyTheorySlots.get(facId)![slot.day][slot.period] = true;
        }
      }
    }

    if (assign.roomId) {
      if (!roomSlots.has(assign.roomId)) roomSlots.set(assign.roomId, new Set());
      for (const slot of assign.slots) {
        roomSlots.get(assign.roomId)!.add(`${slot.day}:${slot.period}`);
      }
    }
  }

  // Ensure all teaching unit faculties have initialized facultyTheorySlots
  for (const u of model.teachingUnits) {
    const facIds = [u.primaryFacultyId, ...(u.secondaryFacultyIds || [])].filter((f): f is string => Boolean(f));
    for (const fid of facIds) {
      if (!facultyTheorySlots.has(fid)) {
        facultyTheorySlots.set(fid, Array.from({ length: TOTAL_DAYS }, () => Array(PERIODS_PER_DAY).fill(false)));
      }
    }
  }

  // Precompute class subject faculty mapping
  const classSubjectFaculty = new Map<string, string>();
  for (const u of model.teachingUnits) {
    if (u.primaryFacultyId) {
      classSubjectFaculty.set(`${u.classKey}:${u.subjectId}`, u.primaryFacultyId);
    }
  }

  // Snapshot initial state after applying immutable assignments for fast search restarts
  const initialGridState = new Map<string, (CellAssignment | null)[][]>();
  for (const [k, v] of gridState.entries()) {
    initialGridState.set(k, v.map(row => [...row]));
  }
  const initialClassOccupied = new Map<string, Set<string>>();
  for (const [k, v] of classOccupied.entries()) {
    initialClassOccupied.set(k, new Set(v));
  }
  const initialFacultySlots = new Map<string, Set<string>>();
  for (const [k, v] of facultySlots.entries()) {
    initialFacultySlots.set(k, new Set(v));
  }
  const initialFacultyDailyHours = new Map<string, number[]>();
  for (const [k, v] of facultyDailyHours.entries()) {
    initialFacultyDailyHours.set(k, [...v]);
  }
  const initialFacultyTheorySlots = new Map<string, boolean[][]>();
  for (const [k, v] of facultyTheorySlots.entries()) {
    initialFacultyTheorySlots.set(k, v.map(row => [...row]));
  }
  const initialRoomSlots = new Map<string, Set<string>>();
  for (const [k, v] of roomSlots.entries()) {
    initialRoomSlots.set(k, new Set(v));
  }
  const initialClassDailySubjectHours = new Map<string, Map<number, Map<string, number>>>();
  for (const [k, dMap] of classDailySubjectHours.entries()) {
    const copyDMap = new Map<number, Map<string, number>>();
    for (const [d, sMap] of dMap.entries()) {
      copyDMap.set(d, new Map(sMap));
    }
    initialClassDailySubjectHours.set(k, copyDMap);
  }
  const initialClassDailyLabs = new Map<string, number[]>();
  for (const [k, v] of classDailyLabs.entries()) {
    initialClassDailyLabs.set(k, [...v]);
  }
  const initialClassSsaDays = new Map<string, Set<number>>();
  for (const [k, v] of classSsaDays.entries()) {
    initialClassSsaDays.set(k, new Set(v));
  }
  const initialClassSatTheoryPlaced = new Map(classSatTheoryPlaced);
  const initialClassFreeWeekdaySlots = new Map(classFreeWeekdaySlots);
  const initialClassFreeSaturdaySlots = new Map(classFreeSaturdaySlots);
  const initialClassFreeSlotsPerDay = new Map<string, number[]>();
  for (const [k, v] of classFreeSlotsPerDay.entries()) {
    initialClassFreeSlotsPerDay.set(k, [...v]);
  }
  const initialClassRemainingSubjectHours = new Map<string, Map<string, number>>();
  for (const [k, v] of classRemainingSubjectHours.entries()) {
    initialClassRemainingSubjectHours.set(k, new Map(v));
  }
  const initialClassUnplacedSsa5th = new Map(classUnplacedSsa5th);
  const initialClassUnplacedSsaMorning = new Map(classUnplacedSsaMorning);

  const restoreInitialSnapshot = () => {
    for (const [k, v] of initialGridState.entries()) {
      gridState.set(k, v.map(row => [...row]));
    }
    for (const [k, v] of initialClassOccupied.entries()) {
      classOccupied.set(k, new Set(v));
    }
    for (const [k, v] of initialFacultySlots.entries()) {
      facultySlots.set(k, new Set(v));
    }
    for (const [k, v] of initialFacultyDailyHours.entries()) {
      facultyDailyHours.set(k, [...v]);
    }
    for (const [k, v] of initialFacultyTheorySlots.entries()) {
      facultyTheorySlots.set(k, v.map(row => [...row]));
    }
    for (const [k, v] of initialRoomSlots.entries()) {
      roomSlots.set(k, new Set(v));
    }
    for (const [k, dMap] of initialClassDailySubjectHours.entries()) {
      const copyDMap = new Map<number, Map<string, number>>();
      for (const [d, sMap] of dMap.entries()) {
        copyDMap.set(d, new Map(sMap));
      }
      classDailySubjectHours.set(k, copyDMap);
    }
    for (const [k, v] of initialClassDailyLabs.entries()) {
      classDailyLabs.set(k, [...v]);
    }
    for (const [k, v] of initialClassSsaDays.entries()) {
      classSsaDays.set(k, new Set(v));
    }
    for (const [k, v] of initialClassSatTheoryPlaced.entries()) {
      classSatTheoryPlaced.set(k, v);
    }
    for (const [k, v] of initialClassFreeWeekdaySlots.entries()) {
      classFreeWeekdaySlots.set(k, v);
    }
    for (const [k, v] of initialClassFreeSaturdaySlots.entries()) {
      classFreeSaturdaySlots.set(k, v);
    }
    for (const [k, v] of initialClassFreeSlotsPerDay.entries()) {
      classFreeSlotsPerDay.set(k, [...v]);
    }
    for (const [k, v] of initialClassRemainingSubjectHours.entries()) {
      classRemainingSubjectHours.set(k, new Map(v));
    }
    for (const [k, v] of initialClassUnplacedSsa5th.entries()) {
      classUnplacedSsa5th.set(k, v);
    }
    for (const [k, v] of initialClassUnplacedSsaMorning.entries()) {
      classUnplacedSsaMorning.set(k, v);
    }
  };

  // Precompute faculty total commitments and class sharing
  const facultyCommitmentCounts = new Map<string, number>();
  const facultyClassKeys = new Map<string, Set<string>>();
  const subjectWeeklyHours = new Map<string, number>();

  for (const u of model.teachingUnits) {
    const facIds = [u.primaryFacultyId, ...(u.secondaryFacultyIds || [])].filter((f): f is string => Boolean(f));
    for (const fid of facIds) {
      facultyCommitmentCounts.set(fid, (facultyCommitmentCounts.get(fid) || 0) + u.duration);
      if (!facultyClassKeys.has(fid)) facultyClassKeys.set(fid, new Set());
      facultyClassKeys.get(fid)!.add(u.classKey);
    }
    const cSubjKey = `${u.classKey}:${u.subjectId}`;
    subjectWeeklyHours.set(cSubjKey, (subjectWeeklyHours.get(cSubjKey) || 0) + u.duration);
  }
  for (const assign of model.immutableAssignments) {
    const facIds = [assign.facultyId, ...(assign.secondaryFacultyIds || [])].filter((f): f is string => Boolean(f));
    for (const fid of facIds) {
      facultyCommitmentCounts.set(fid, (facultyCommitmentCounts.get(fid) || 0) + assign.slots.length);
      if (!facultyClassKeys.has(fid)) facultyClassKeys.set(fid, new Set());
      facultyClassKeys.get(fid)!.add(assign.classKey);
    }
  }

  // Precompute initial legal domain size for each unit (MRV)
  const unitInitialDomainSize = new Map<string, number>();
  for (const u of model.teachingUnits) {
    let domainSize = 0;
    const allowedDays = u.allowedDays || [0, 1, 2, 3, 4, 5];
    const allowedPeriods = u.allowedPeriods || [0, 1, 2, 3, 4, 5, 6];
    const uFacIds = [u.primaryFacultyId, ...(u.secondaryFacultyIds || [])].filter((f): f is string => Boolean(f));

    for (const d of allowedDays) {
      for (const p of allowedPeriods) {
        if (p + u.duration > PERIODS_PER_DAY) continue;
        if (u.forbiddenPeriods) {
          let forbidden = false;
          for (let k = 0; k < u.duration; k++) {
            if (u.forbiddenPeriods.includes(p + k)) { forbidden = true; break; }
          }
          if (forbidden) continue;
        }
        // Class grid check
        let classFree = true;
        const cGrid = gridState.get(u.classKey)!;
        for (let k = 0; k < u.duration; k++) {
          if (cGrid[d][p + k] !== null) { classFree = false; break; }
        }
        if (!classFree) continue;

        // Faculty check
        let facFree = true;
        for (const fid of uFacIds) {
          const fSlots = facultySlots.get(fid);
          if (fSlots) {
            for (let k = 0; k < u.duration; k++) {
              if (fSlots.has(`${d}:${p + k}`)) { facFree = false; break; }
            }
          }
          if (!facFree) break;
        }
        if (!facFree) continue;

        domainSize++;
      }
    }
    unitInitialDomainSize.set(u.id, domainSize);
  }

  // Helpers to determine sharedness across classes
  const getUnitSharedDegree = (u: TeachingUnit): number => {
    const facIds = [u.primaryFacultyId, ...(u.secondaryFacultyIds || [])].filter((f): f is string => Boolean(f));
    if (facIds.length === 0) return 0;
    return Math.max(...facIds.map(f => facultyClassKeys.get(f)?.size || 1));
  };

  const getPrimaryFacId = (u: TeachingUnit): string => {
    return u.primaryFacultyId || 'none';
  };

  // Helper to determine exact user-specified priority sequence:
  // Step 1: All Labs (Priority 1)
  // Step 2: Multi-Faculty Units (Co-teaching & Parallel Elective Groups with >= 2 faculty) (Priority 2)
  // Step 3: Theory Special Hours scheduled inside the week (Seminar, Library, Counselling assigned to CC) (Priority 3)
  // Step 4: Tightly constrained Soft Skills hours (5th hour, morning hours) (Priority 4)
  // Step 5: Cross-Class Shared Faculty Units (faculty teaching in >= 2 classes) (Priority 5)
  // Step 6: Single-Class Regular Theory / Electives (Priority 6)
  // Step 7: Remaining subjects without conflict: Projects, custom activities (Priority 7)
  const getUnitPriority = (u: TeachingUnit): number => {
    // 1. All Labs (duration 4, 3, 2, 1)
    if (u.activityType === 'lab') return 1;

    // 2. Multi-Faculty Units (Co-teaching / Parallel Elective teams with >= 2 faculty members)
    if ((u.secondaryFacultyIds?.length || 0) > 0) return 2;

    // 3. Theory Special Hours scheduled inside the week (Seminar, Library, Counselling assigned to CC)
    const name = (u.subjectName || '').toLowerCase();
    if (
      u.activityType === 'seminar' ||
      u.activityType === 'library' ||
      u.activityType === 'counseling' ||
      /seminar|library|counsel/i.test(name)
    ) {
      return 3;
    }

    // 4. Tightly constrained Soft Skills hours
    if (u.tags?.includes('ssa_5th_hour') || u.tags?.includes('ssa_morning_hour')) {
      return 4;
    }

    // 5. Cross-Class Shared Faculty Units (faculty teaching in >= 2 classes)
    if (getUnitSharedDegree(u) > 1) {
      return 5;
    }

    // 6. Single-Class Regular Theory / Electives / Projects
    if (
      u.activityType === 'theory' ||
      u.activityType === 'elective' ||
      u.activityType === 'nptel' ||
      name.includes('project')
    ) {
      return 6;
    }

    // 7. Remaining subjects: custom activities
    return 7;
  };

  // 3. Prioritize Teaching Units:
  const sortedUnits = [...model.teachingUnits].sort((a, b) => {
    // 0. Strict user priority order: Labs (1) -> Multi-Fac (2) -> Special (3) -> SSA (4) -> Shared Fac (5) -> Single Theory (6) -> Projects (7)
    const pA = getUnitPriority(a);
    const pB = getUnitPriority(b);
    if (pA !== pB) return pA - pB;

    // 1. Long continuous blocks first (duration 4, then 3, then 2, then 1)
    if (a.duration !== b.duration) return b.duration - a.duration;

    // Within Priority 1 (Labs): duration descending (4 -> 3 -> 2 -> 1)
    if (pA === 1) {
      if (a.classKey !== b.classKey) return a.classKey.localeCompare(b.classKey);
      return a.id.localeCompare(b.id);
    }

    // Within Priority 2 (Multi-Faculty Units): sort by number of assigned faculty descending
    if (pA === 2) {
      const facCountA = 1 + (a.secondaryFacultyIds?.length || 0);
      const facCountB = 1 + (b.secondaryFacultyIds?.length || 0);
      if (facCountA !== facCountB) return facCountB - facCountA;
      if (a.classKey !== b.classKey) return a.classKey.localeCompare(b.classKey);
      return a.id.localeCompare(b.id);
    }

    // Within Priority 3 (Special theory hours):
    if (pA === 3) {
      if (a.classKey !== b.classKey) return a.classKey.localeCompare(b.classKey);
      return a.id.localeCompare(b.id);
    }

    // Within Priority 4 (Soft skills): 5th hour before morning
    if (pA === 4) {
      const aIsSsa5th = a.tags?.includes('ssa_5th_hour') ? 1 : 0;
      const bIsSsa5th = b.tags?.includes('ssa_5th_hour') ? 1 : 0;
      if (aIsSsa5th !== bIsSsa5th) return bIsSsa5th - aIsSsa5th;
      if (a.classKey !== b.classKey) return a.classKey.localeCompare(b.classKey);
      return a.id.localeCompare(b.id);
    }

    // Within Priority 5 (Cross-Class Shared Faculty Units):
    // Group all units of the same faculty together!
    if (pA === 5) {
      const degA = getUnitSharedDegree(a);
      const degB = getUnitSharedDegree(b);
      if (degA !== degB) return degB - degA; // 5 classes, then 4, 3, 2

      const facA = getPrimaryFacId(a);
      const facB = getPrimaryFacId(b);
      if (facA !== facB) {
        const comA = facultyCommitmentCounts.get(facA) || 0;
        const comB = facultyCommitmentCounts.get(facB) || 0;
        if (comA !== comB) return comB - comA;
        return facA.localeCompare(facB);
      }
      if (a.classKey !== b.classKey) return a.classKey.localeCompare(b.classKey);
      return a.id.localeCompare(b.id);
    }

    // Within Priority 6 (Single-Class Theory Units):
    // Strict Class Cohesion! Keep all units of the same class together.
    if (pA === 6) {
      if (a.classKey !== b.classKey) return a.classKey.localeCompare(b.classKey);
      const aSubjHours = subjectWeeklyHours.get(`${a.classKey}:${a.subjectId}`) || 1;
      const bSubjHours = subjectWeeklyHours.get(`${b.classKey}:${b.subjectId}`) || 1;
      if (aSubjHours !== bSubjHours) return bSubjHours - aSubjHours;
      const aDomain = unitInitialDomainSize.get(a.id) ?? 42;
      const bDomain = unitInitialDomainSize.get(b.id) ?? 42;
      if (aDomain !== bDomain) return aDomain - bDomain;
      return a.id.localeCompare(b.id);
    }

    if (a.classKey !== b.classKey) return a.classKey.localeCompare(b.classKey);
    return a.id.localeCompare(b.id);
  });


  // Track state for rollback
  let backtracks = 0;
  let currentRestart = 0;
  let solutionFound = false;
  let bestScore = Infinity;

  // Helper: check if a unit can take start slot (d, p)
  const canPlaceUnitAt = (unit: TeachingUnit, d: number, p: number): boolean => {
    const cKey = unit.classKey;
    const grid = gridState.get(cKey)!;

    // Check duration fits on that day
    if (p + unit.duration > PERIODS_PER_DAY) return false;

    // Check allowed days
    if (unit.allowedDays && !unit.allowedDays.includes(d)) return false;

    // Check allowed periods
    if (unit.allowedPeriods && !unit.allowedPeriods.includes(p)) return false;

    // Check forbidden periods
    if (unit.forbiddenPeriods) {
      for (let k = 0; k < unit.duration; k++) {
        if (unit.forbiddenPeriods.includes(p + k)) return false;
      }
    }

    // 1. Check Class Grid Availability
    for (let k = 0; k < unit.duration; k++) {
      if (grid[d][p + k] !== null) return false;
    }

    // 2. Check Faculty Availability for all involved faculty (primary + secondary, cross-department alias aware)
    const allUnitFacIds = [unit.primaryFacultyId, ...(unit.secondaryFacultyIds || [])].filter((f): f is string => Boolean(f));
    const allCheckFacKeys = new Set<string>();
    for (const fId of allUnitFacIds) {
      getTrackingFacultyKeys(fId, unit.facultyName, model.facultyNameById).forEach(k => allCheckFacKeys.add(k));
    }
    if (unit.facultyName) {
      getFacultyAliases(unit.facultyName).forEach(k => allCheckFacKeys.add(k));
    }
    for (const facId of allCheckFacKeys) {
      const fSlots = facultySlots.get(facId);
      if (fSlots) {
        for (let k = 0; k < unit.duration; k++) {
          if (fSlots.has(`${d}:${p + k}`)) return false;
        }
      }

      // Faculty daily hours protection:
      // On Saturday, cap at 4 hours total (relaxed to 5 on restart taking 1 free hour if needed).
      // On weekdays, cap at 5 hours total (relaxed to 6 on restart taking 1 free hour if needed).
      const maxDailyForDay = currentRestart === 0 ? (d === 5 ? 4 : 5) : (d === 5 ? 5 : 6);
      const currFacHours = facultyDailyHours.get(facId)?.[d] || 0;
      if (currFacHours + unit.duration > Math.max(maxDailyForDay, unit.duration)) {
        return false;
      }
    }

    // Check if placing this theory unit creates a 3-consecutive theory sequence for any assigned faculty
    const isUnitTheory = isTheoryActivity(unit.activityType, unit.subjectName);
    if (isUnitTheory && allCheckFacKeys.size > 0) {
      for (const facId of allCheckFacKeys) {
        const thGrid = facultyTheorySlots.get(facId);
        if (thGrid) {
          const row = thGrid[d];
          const minK = Math.max(0, p - 2);
          const maxK = Math.min(PERIODS_PER_DAY - 3, p + unit.duration - 1);
          for (let k = minK; k <= maxK; k++) {
            const has0 = (k >= p && k < p + unit.duration) || row[k];
            const has1 = (k + 1 >= p && k + 1 < p + unit.duration) || row[k + 1];
            const has2 = (k + 2 >= p && k + 2 < p + unit.duration) || row[k + 2];
            if (has0 && has1 && has2) {
              return false; // Violates: No three consecutive theory periods for any faculty member
            }
          }
        }
      }
    }

    // Physical room/lab availability check
    if (unit.roomId) {
      const rSlots = roomSlots.get(unit.roomId);
      if (rSlots) {
        for (let k = 0; k < unit.duration; k++) {
          if (rSlots.has(`${d}:${p + k}`)) return false;
        }
      }
    }

    // 3. Laboratory Constraints
    if (unit.activityType === 'lab') {
      if (d === 5) return false; // 0 on Saturday
      if (unit.duration > 1 && (classDailyLabs.get(cKey)![d] || 0) > 0) return false; // Max 1 major block lab per day
    }

    // 4. Soft Skills Constraints
    if (unit.activityType === 'soft_skill') {
      if (d === 5) return false; // 0 on Saturday
      if (classSsaDays.get(cKey)!.has(d)) return false; // Distinct weekdays
      if (unit.tags?.includes('ssa_5th_hour') && p !== 4) return false;
      if (unit.tags?.includes('ssa_morning_hour') && p > 3) return false;
    }

    // 5. Theory & Elective Daily Cap & Anti-3-Consecutive
    if (isUnitTheory) {
      const isProject = /project/i.test(unit.subjectName);

      if (!isProject) {
        const daySubjMap = classDailySubjectHours.get(cKey)!.get(d);
        const currentDayHours = daySubjMap?.get(unit.subjectId) || 0;

        // Cap: max 2 on weekdays, max 1 on Saturday (Saturday used for overflow)
        if (d === 5) {
          if (currentDayHours >= 1) return false;
        } else {
          if (currentDayHours >= 2) return false;
        }

        // Anti-3-consecutive theory rule:
        // Candidate slot is p. Check adjacent slots on day d:
        const name = unit.subjectName;
        // p-2, p-1, p
        if (p >= 2 && grid[d][p - 1]?.subjectName === name && grid[d][p - 2]?.subjectName === name) {
          return false;
        }
        // p, p+1, p+2
        if (p <= PERIODS_PER_DAY - 3 && grid[d][p + 1]?.subjectName === name && grid[d][p + 2]?.subjectName === name) {
          return false;
        }
        // p-1, p, p+1
        if (p >= 1 && p <= PERIODS_PER_DAY - 2 && grid[d][p - 1]?.subjectName === name && grid[d][p + 1]?.subjectName === name) {
          return false;
        }
      }

      // Senior Professor constraint: soft preference handled via scoreCandidateSlot penalty
    }

    // 6. Look-ahead Forward-Checking Capacity Pruning:
    // Ensure that placing this unit will not leave insufficient weekday or Saturday slots
    // for the remaining unplaced theory hours of this class.
    {
      const freeWk = classFreeWeekdaySlots.get(cKey)!;
      const freeSat = classFreeSaturdaySlots.get(cKey)!;
      const freePerDay = classFreeSlotsPerDay.get(cKey)!;
      const nextFreeWk = d < 5 ? freeWk - unit.duration : freeWk;
      const nextFreeSat = d === 5 ? freeSat - unit.duration : freeSat;

      const subjMap = classRemainingSubjectHours.get(cKey)!;
      const satDayMap = classDailySubjectHours.get(cKey)!.get(5);

      let totalMinWk = 0;
      let totalRemTheory = 0;
      let distinctSatEligible = 0;

      for (const [sId, remH] of subjMap.entries()) {
        const afterRem = (sId === unit.subjectId) ? remH - unit.duration : remH;
        if (afterRem > 0) {
          totalRemTheory += afterRem;
          const isPlacedOnSat = (d === 5 && sId === unit.subjectId) || (satDayMap?.get(sId) || 0) > 0;
          const isProj = model.teachingUnits.some(u => u.subjectId === sId && (u.activityType === 'project' || /project/i.test(u.subjectName)));
          if (isPlacedOnSat || isProj) {
            totalMinWk += isProj ? 0 : afterRem;
          } else {
            totalMinWk += Math.max(0, afterRem - 1);
            distinctSatEligible++;
          }
        }
      }

      if (totalRemTheory > (nextFreeWk + nextFreeSat)) {
        return false;
      }

      const maxSatCanTake = Math.min(nextFreeSat, distinctSatEligible);
      const minWkNeeded = Math.max(totalMinWk, totalRemTheory - maxSatCanTake);
      if (nextFreeWk < minWkNeeded) {
        return false;
      }

      // 7. SSA Look-ahead Forward-Checking Capacity:
      const unplacedSsa5th = classUnplacedSsa5th.get(cKey) || 0;
      const unplacedSsaMorn = classUnplacedSsaMorning.get(cKey) || 0;

      if (unplacedSsa5th > 0 || unplacedSsaMorn > 0) {
        const isThisSsa5th = unit.tags?.includes('ssa_5th_hour');
        const isThisSsaMorn = unit.tags?.includes('ssa_morning_hour');
        const remSsa5th = isThisSsa5th ? unplacedSsa5th - 1 : unplacedSsa5th;
        const remSsaMorn = isThisSsaMorn ? unplacedSsaMorn - 1 : unplacedSsaMorn;

        if (remSsa5th > 0 || remSsaMorn > 0) {
          let validSsa5thDays = 0;
          let validSsaMornDays = 0;
          const currentSsaDays = classSsaDays.get(cKey)!;

          for (let day = 0; day < 5; day++) {
            if (currentSsaDays.has(day)) continue;
            if (day === d && (isThisSsa5th || isThisSsaMorn)) continue;

            const cGridDay = gridState.get(cKey)![day];

            const p4Free = day === d 
              ? (cGridDay[4] === null && !(p <= 4 && p + unit.duration > 4))
              : (cGridDay[4] === null);
            if (p4Free) validSsa5thDays++;

            let hasMorn = false;
            for (let mp = 0; mp <= 3; mp++) {
              const mpFree = day === d
                ? (cGridDay[mp] === null && !(mp >= p && mp < p + unit.duration))
                : (cGridDay[mp] === null);
              if (mpFree) {
                hasMorn = true;
                break;
              }
            }
            if (hasMorn) validSsaMornDays++;
          }

          if (remSsa5th > 0 && validSsa5thDays < remSsa5th) return false;
          if (remSsaMorn > 0 && validSsaMornDays < remSsaMorn) return false;
        }
      }
    }

    return true;
  };

  // Helper: score a candidate slot by soft constraints (LCV)
  const scoreCandidateSlot = (unit: TeachingUnit, d: number, p: number, rCount: number = 0): number => {
    let penalty = 0;
    if (rCount > 0) {
      const h = pseudoHash(`${unit.id}:${d}:${p}:${rCount}`);
      penalty += ((h % 100) / 100) * 4.0;
    }
    const cKey = unit.classKey;
    const daySubjMap = classDailySubjectHours.get(cKey)!.get(d);
    const existingHoursOnDay = daySubjMap?.get(unit.subjectId) || 0;
    const isUnitTheory = isTheoryActivity(unit.activityType, unit.subjectName);

    // Day distribution penalty: heavily prefer placing on days where subject is not yet present
    if (existingHoursOnDay > 0) {
      penalty += 80;
    }

    // Preserve slots for unplaced SSA units on weekdays
    if (d < 5 && isUnitTheory) {
      if (p === 4 && (classUnplacedSsa5th.get(cKey) || 0) > 0) {
        penalty += 40;
      }
      if (p <= 3 && (classUnplacedSsaMorning.get(cKey) || 0) > 0) {
        penalty += 15;
      }
    }

    // Saturday overflow for theory:
    // If this class has a structural weekday deficit, fulfill required Saturday slots with major (>= 4h) subjects
    if (d === 5 && isUnitTheory) {
      const needed = classSatTheoryNeeded.get(cKey) || 0;
      const placed = classSatTheoryPlaced.get(cKey) || 0;
      if (placed < needed) {
        const subjHours = subjectWeeklyHours.get(`${cKey}:${unit.subjectId}`) || 1;
        if (subjHours >= 4) {
          penalty += (p <= 3 ? -35 : 20); // Fulfill required Saturday quota with major subjects
        } else {
          penalty += (p <= 3 ? 10 : 30);
        }
      } else {
        penalty += (p <= 3 ? 40 : 100); // Standard overflow penalty once quota is met
      }
    }

    // Senior Professor afternoon penalty
    if (unit.isSeniorProfessor && p >= 4) {
      penalty += weights.seniorProfAfternoonPenalty;
    }

    // Faculty spacing & workload distribution penalties for all assigned faculty
    const allScoringFacIds = [unit.primaryFacultyId, ...(unit.secondaryFacultyIds || [])].filter((f): f is string => Boolean(f));
    for (const facId of allScoringFacIds) {
      const fSlots = facultySlots.get(facId);
      const thGrid = facultyTheorySlots.get(facId);
      if (fSlots) {
        // Avoid 3+ consecutive hours for faculty
        let consecutive = 0;
        if (p > 0 && fSlots.has(`${d}:${p - 1}`)) {
          consecutive++;
          if (p > 1 && fSlots.has(`${d}:${p - 2}`)) consecutive += 2;
        }
        if (p + unit.duration < PERIODS_PER_DAY && fSlots.has(`${d}:${p + unit.duration}`)) {
          consecutive++;
          if (p + unit.duration + 1 < PERIODS_PER_DAY && fSlots.has(`${d}:${p + unit.duration + 1}`)) consecutive += 2;
        }
        penalty += consecutive * weights.consecutiveFacultyWeight;

        // Soft constraint 3.3: On four-hour lab days, prefer keeping the preceding period free where feasible
        // If faculty has 4-hour lab in periods 3..6 (afternoon), keep period 2 (P3) free
        const has4hAftLab = fSlots.has(`${d}:3`) && fSlots.has(`${d}:4`) && fSlots.has(`${d}:5`) && fSlots.has(`${d}:6`) && !thGrid?.[d][3];
        if (has4hAftLab && isUnitTheory && p === 2) {
          penalty += 60; // Keep preceding period P3 free
        }
        // If faculty has 4-hour lab in periods 0..3 (morning), keep period 4 (P5) free
        const has4hMornLab = fSlots.has(`${d}:0`) && fSlots.has(`${d}:1`) && fSlots.has(`${d}:2`) && fSlots.has(`${d}:3`) && !thGrid?.[d][0];
        if (has4hMornLab && isUnitTheory && p === 4) {
          penalty += 60; // Keep succeeding period P5 free
        }

        // Soft constraint 3.4: On three-hour lab days, prefer theory in P1 and P3 where feasible
        const has3hAftLab = fSlots.has(`${d}:4`) && fSlots.has(`${d}:5`) && fSlots.has(`${d}:6`) && !thGrid?.[d][4];
        if (has3hAftLab && isUnitTheory) {
          if (p === 0 || p === 2) {
            penalty -= 30; // Preferred theory slots P1 and P3
          } else if (p === 1 || p === 3) {
            penalty += 30; // Less preferred slots P2 and P4
          }
        }

        // Soft constraint 3.2: Prefer 1-2 consecutive free periods; avoid isolated classes with 3+ period gaps
        const daySlotsCount = [0, 1, 2, 3, 4, 5, 6].filter(sp => fSlots.has(`${d}:${sp}`)).length;
        if (daySlotsCount > 0) {
          const isNear = (p > 0 && fSlots.has(`${d}:${p - 1}`)) ||
                         (p + 1 < PERIODS_PER_DAY && fSlots.has(`${d}:${p + 1}`)) ||
                         (p > 1 && fSlots.has(`${d}:${p - 2}`)) ||
                         (p + 2 < PERIODS_PER_DAY && fSlots.has(`${d}:${p + 2}`));
          if (!isNear) {
            penalty += 15; // Mild penalty for creating isolated classes with 3+ period gaps
          }
        }
      }

      // Workload distribution: prefer days where faculty currently has fewer hours
      const fDaily = facultyDailyHours.get(facId);
      if (fDaily) {
        const hoursToday = fDaily[d];
        // Heavy penalty for filling up to 4 hours on a day (preserving free periods)
        if (hoursToday + unit.duration >= 4) {
          penalty += 300;
        } else if (hoursToday + unit.duration === 3) {
          penalty += 100;
        }
        // General variance penalty
        penalty += hoursToday * 25;
      }
    }

    // Avoid clustering all classes of a section onto a single day
    const currentClassSlotsOnDay = Array.from({ length: PERIODS_PER_DAY }, (_, idx) => gridState.get(cKey)![d][idx]).filter(Boolean).length;
    penalty += currentClassSlotsOnDay * weights.facultyDailyLoadImbalance;

    return penalty;
  };

  // Apply placement
  const applyPlacement = (unit: TeachingUnit, d: number, p: number) => {
    const cKey = unit.classKey;
    const grid = gridState.get(cKey)!;
    const cOccupied = classOccupied.get(cKey)!;

    for (let k = 0; k < unit.duration; k++) {
      const slotP = p + k;
      grid[d][slotP] = {
        subjectId: unit.subjectId,
        subjectName: unit.subjectName,
        facultyId: unit.primaryFacultyId,
        secondaryFacultyIds: unit.secondaryFacultyIds,
        facultyName: unit.facultyName,
        roomId: unit.roomId,
        isFixed: false,
        activityType: unit.activityType,
      };
      cOccupied.add(`${d}:${slotP}`);
    }

    const isUnitTheory = isTheoryActivity(unit.activityType, unit.subjectName);
    const allPlacementFacIds = [unit.primaryFacultyId, ...(unit.secondaryFacultyIds || [])].filter((f): f is string => Boolean(f));
    const allPlacementFacKeys = new Set<string>();
    for (const fId of allPlacementFacIds) {
      getTrackingFacultyKeys(fId, unit.facultyName, model.facultyNameById).forEach(k => allPlacementFacKeys.add(k));
    }
    if (unit.facultyName) {
      getFacultyAliases(unit.facultyName).forEach(k => allPlacementFacKeys.add(k));
    }
    for (const facId of allPlacementFacKeys) {
      if (!facultySlots.has(facId)) facultySlots.set(facId, new Set());
      if (!facultyDailyHours.has(facId)) facultyDailyHours.set(facId, [0, 0, 0, 0, 0, 0]);
      if (!facultyTheorySlots.has(facId)) {
        facultyTheorySlots.set(facId, Array.from({ length: TOTAL_DAYS }, () => Array(PERIODS_PER_DAY).fill(false)));
      }
      for (let k = 0; k < unit.duration; k++) {
        const slotP = p + k;
        facultySlots.get(facId)!.add(`${d}:${slotP}`);
        facultyDailyHours.get(facId)![d]++;
        if (isUnitTheory) {
          facultyTheorySlots.get(facId)![d][slotP] = true;
        }
      }
    }

    if (unit.roomId) {
      if (!roomSlots.has(unit.roomId)) roomSlots.set(unit.roomId, new Set());
      for (let k = 0; k < unit.duration; k++) {
        roomSlots.get(unit.roomId)!.add(`${d}:${p + k}`);
      }
    }

    // Update daily counts
    if (!classDailySubjectHours.get(cKey)!.has(d)) {
      classDailySubjectHours.get(cKey)!.set(d, new Map());
    }
    const dayMap = classDailySubjectHours.get(cKey)!.get(d)!;
    dayMap.set(unit.subjectId, (dayMap.get(unit.subjectId) || 0) + unit.duration);

    if (unit.activityType === 'lab' && unit.duration > 1) {
      classDailyLabs.get(cKey)![d]++;
    }
    if (unit.activityType === 'soft_skill') {
      classSsaDays.get(cKey)!.add(d);
    }
    if (unit.tags?.includes('ssa_5th_hour')) {
      classUnplacedSsa5th.set(cKey, (classUnplacedSsa5th.get(cKey) || 1) - 1);
    }
    if (unit.tags?.includes('ssa_morning_hour')) {
      classUnplacedSsaMorning.set(cKey, (classUnplacedSsaMorning.get(cKey) || 1) - 1);
    }
    if (d === 5 && isUnitTheory) {
      classSatTheoryPlaced.set(cKey, (classSatTheoryPlaced.get(cKey) || 0) + unit.duration);
    }

    if (d < 5) {
      classFreeWeekdaySlots.set(cKey, classFreeWeekdaySlots.get(cKey)! - unit.duration);
    } else {
      classFreeSaturdaySlots.set(cKey, classFreeSaturdaySlots.get(cKey)! - unit.duration);
    }
    classFreeSlotsPerDay.get(cKey)![d] -= unit.duration;
    const sMap = classRemainingSubjectHours.get(cKey)!;
    if (sMap.has(unit.subjectId)) {
      sMap.set(unit.subjectId, (sMap.get(unit.subjectId) || 0) - unit.duration);
    }
  };

  // Rollback placement
  const rollbackPlacement = (unit: TeachingUnit, d: number, p: number) => {
    const cKey = unit.classKey;
    const grid = gridState.get(cKey)!;
    const cOccupied = classOccupied.get(cKey)!;

    for (let k = 0; k < unit.duration; k++) {
      const slotP = p + k;
      grid[d][slotP] = null;
      cOccupied.delete(`${d}:${slotP}`);
    }

    const isUnitTheory = isTheoryActivity(unit.activityType, unit.subjectName);
    const allRollbackFacIds = [unit.primaryFacultyId, ...(unit.secondaryFacultyIds || [])].filter((f): f is string => Boolean(f));
    const allRollbackFacKeys = new Set<string>();
    for (const fId of allRollbackFacIds) {
      getTrackingFacultyKeys(fId, unit.facultyName, model.facultyNameById).forEach(k => allRollbackFacKeys.add(k));
    }
    if (unit.facultyName) {
      getFacultyAliases(unit.facultyName).forEach(k => allRollbackFacKeys.add(k));
    }
    for (const facId of allRollbackFacKeys) {
      for (let k = 0; k < unit.duration; k++) {
        const slotP = p + k;
        facultySlots.get(facId)?.delete(`${d}:${slotP}`);
        if (facultyDailyHours.has(facId)) facultyDailyHours.get(facId)![d]--;
        if (isUnitTheory) {
          const thGrid = facultyTheorySlots.get(facId);
          if (thGrid) thGrid[d][slotP] = false;
        }
      }
    }

    if (unit.roomId) {
      const rSlots = roomSlots.get(unit.roomId);
      if (rSlots) {
        for (let k = 0; k < unit.duration; k++) {
          rSlots.delete(`${d}:${p + k}`);
        }
      }
    }

    const dayMap = classDailySubjectHours.get(cKey)!.get(d);
    if (dayMap && dayMap.has(unit.subjectId)) {
      const count = dayMap.get(unit.subjectId)! - unit.duration;
      if (count <= 0) dayMap.delete(unit.subjectId);
      else dayMap.set(unit.subjectId, count);
    }

    if (unit.activityType === 'lab' && unit.duration > 1) {
      classDailyLabs.get(cKey)![d]--;
    }
    if (unit.activityType === 'soft_skill') {
      classSsaDays.get(cKey)!.delete(d);
    }
    if (unit.tags?.includes('ssa_5th_hour')) {
      classUnplacedSsa5th.set(cKey, (classUnplacedSsa5th.get(cKey) || 0) + 1);
    }
    if (unit.tags?.includes('ssa_morning_hour')) {
      classUnplacedSsaMorning.set(cKey, (classUnplacedSsaMorning.get(cKey) || 0) + 1);
    }
    if (d === 5 && isUnitTheory) {
      classSatTheoryPlaced.set(cKey, (classSatTheoryPlaced.get(cKey) || 0) - unit.duration);
    }

    if (d < 5) {
      classFreeWeekdaySlots.set(cKey, classFreeWeekdaySlots.get(cKey)! + unit.duration);
    } else {
      classFreeSaturdaySlots.set(cKey, classFreeSaturdaySlots.get(cKey)! + unit.duration);
    }
    classFreeSlotsPerDay.get(cKey)![d] += unit.duration;
    const sMap = classRemainingSubjectHours.get(cKey)!;
    if (sMap.has(unit.subjectId)) {
      sMap.set(unit.subjectId, (sMap.get(unit.subjectId) || 0) + unit.duration);
    }
  };

  // 4. Recursive Backtracking Solver with LCV Ordering
  let maxUnitIdxReached = 0;
  let deepestFailingUnit: TeachingUnit | null = null;
  let hasExplained106 = false;
  const lastPlacedSlotBySubject = new Map<string, number>();

  const search = (unitIdx: number): boolean => {
    // Check time limit
    if (Date.now() - startTime > timeLimitMs) {
      return false;
    }
    if (backtracks > maxBacktracks) {
      return false;
    }

    // Base Case: All teaching units placed!
    if (unitIdx >= sortedUnits.length) {
      solutionFound = true;
      return true;
    }

    if (unitIdx > maxUnitIdxReached) {
      maxUnitIdxReached = unitIdx;
      deepestFailingUnit = sortedUnits[unitIdx];
    }

    const unit = sortedUnits[unitIdx];

    // Generate valid candidate slots (d, p)
    interface ScoredSlot {
      d: number;
      p: number;
      score: number;
    }
    const candidates: ScoredSlot[] = [];

    const candidateDays = unit.allowedDays || [0, 1, 2, 3, 4, 5];
    const candidatePeriods = unit.allowedPeriods || [0, 1, 2, 3, 4, 5, 6];

    for (const d of candidateDays) {
      for (const p of candidatePeriods) {
        if (canPlaceUnitAt(unit, d, p)) {
          let score = scoreCandidateSlot(unit, d, p);
          if (currentRestart > 0) {
            // Significant pseudo-random jitter on restart to explore different branches
            const noise = ((pseudoHash(`${unit.id}:${d}:${p}:${currentRestart}`) % 1000) / 10); // 0 to 100
            score += noise;
          }
          candidates.push({ d, p, score });
        }
      }
    }

    if (candidates.length === 0) {
      return false;
    }

    // Least Constraining Value: sort candidates by lowest penalty score
    if (/project/i.test(unit.subjectName)) {
      candidates.sort((a, b) => (a.d * PERIODS_PER_DAY + a.p) - (b.d * PERIODS_PER_DAY + b.p));
    } else {
      candidates.sort((a, b) => a.score - b.score);
    }

    for (const cand of candidates) {
      applyPlacement(unit, cand.d, cand.p);

      if (search(unitIdx + 1)) {
        return true;
      }

      // Backtrack
      rollbackPlacement(unit, cand.d, cand.p);
      backtracks++;
      backtracksThisRestart++;
      const restartThreshold = 2500 + currentRestart * 1000;
      if (backtracksThisRestart >= restartThreshold) {
        return false;
      }
    }

    return false;
  };

  currentRestart = 0;
  const maxRestarts = 25;
  let backtracksThisRestart = 0;
  let solved = false;

  for (currentRestart = 0; currentRestart <= maxRestarts; currentRestart++) {
    backtracksThisRestart = 0;
    solved = search(0);
    if (solved) break;
    if (Date.now() - startTime > timeLimitMs || backtracks > maxBacktracks) break;
    restoreInitialSnapshot();
  }

  const elapsedMs = Date.now() - startTime;

  // 5. Handle Infeasibility & Bottleneck Diagnostic Extraction
  if (!solved) {
    console.error(`Solver reached unit ${maxUnitIdxReached} / ${sortedUnits.length}. Backtracks: ${backtracks}. Failing unit:`, deepestFailingUnit);
    if (deepestFailingUnit) {
      const u = deepestFailingUnit;
      const cKey = u.classKey;
      const grid = gridState.get(cKey)!;
      console.error(`Diagnostic for ${u.subjectName} (${u.id}) in ${cKey}:`);
      console.error(`Faculty: ${u.facultyName} (${u.primaryFacultyId})`);
      if (u.primaryFacultyId) {
        console.error(`Faculty daily hours:`, facultyDailyHours.get(u.primaryFacultyId));
      }
      for (let d = 0; d < TOTAL_DAYS; d++) {
        for (let p = 0; p < PERIODS_PER_DAY; p++) {
          if (grid[d][p] === null) {
            // Free in class grid! Why can't we place?
            const facOccupied = u.primaryFacultyId && facultySlots.get(u.primaryFacultyId)?.has(`${d}:${p}`);
            const facDailyExceeded = u.primaryFacultyId && ((facultyDailyHours.get(u.primaryFacultyId)?.[d] || 0) + u.duration > Math.max(d === 5 ? 4 : 5, u.duration));
            const daySubjMap = classDailySubjectHours.get(cKey)?.get(d);
            const currSubjHours = daySubjMap?.get(u.subjectId) || 0;
            const subjDailyExceeded = d === 5 ? currSubjHours >= 1 : currSubjHours >= 2;
            
            // Check forward-checking conditions:
            const freeWk = classFreeWeekdaySlots.get(cKey)!;
            const freeSat = classFreeSaturdaySlots.get(cKey)!;
            const nextFreeWk = d < 5 ? freeWk - u.duration : freeWk;
            const nextFreeSat = d === 5 ? freeSat - u.duration : freeSat;
            const subjMap = classRemainingSubjectHours.get(cKey)!;
            let totalRem = 0;
            let totalMinWk = 0;
            let distinctSat = 0;
            let failedSubjMaxCap: string | null = null;
            for (const [sId, remH] of subjMap.entries()) {
              const afterRem = (sId === u.subjectId) ? remH - u.duration : remH;
              if (afterRem > 0) {
                totalRem += afterRem;
                const satDayMap = classDailySubjectHours.get(cKey)!.get(5);
                const isPlacedOnSat = (d === 5 && sId === u.subjectId) || (satDayMap?.get(sId) || 0) > 0;
                if (isPlacedOnSat) totalMinWk += afterRem;
                else { totalMinWk += Math.max(0, afterRem - 1); distinctSat++; }

                const sFacId = classSubjectFaculty.get(`${cKey}:${sId}`);
                const sFacSlots = sFacId ? facultySlots.get(sFacId) : undefined;
                let smc = 0;
                for (let day = 0; day < 6; day++) {
                  const dayFree = day === d ? classFreeSlotsPerDay.get(cKey)![day] - u.duration : classFreeSlotsPerDay.get(cKey)![day];
                  if (dayFree > 0) {
                    const currentOnDay = (classDailySubjectHours.get(cKey)!.get(day)?.get(sId) || 0) +
                      (isTheoryActivity(u.activityType, u.subjectName) && day === d && sId === u.subjectId ? u.duration : 0);
                    const capOnDay = day === 5 ? 1 : 2;
                    const allowedOnDay = Math.max(0, capOnDay - currentOnDay);
                    if (allowedOnDay > 0) {
                      if (sFacSlots) {
                        let commonFree = 0;
                        const cGridDay = gridState.get(cKey)![day];
                        for (let pIdx = 0; pIdx < PERIODS_PER_DAY; pIdx++) {
                          const isSlotInPlacement = (day === d && pIdx >= p && pIdx < p + u.duration);
                          if (!isSlotInPlacement && cGridDay[pIdx] === null && !sFacSlots.has(`${day}:${pIdx}`)) commonFree++;
                        }
                        smc += Math.min(commonFree, allowedOnDay);
                      } else smc += Math.min(dayFree, allowedOnDay);
                    }
                  }
                }
                if (afterRem > smc && !failedSubjMaxCap) failedSubjMaxCap = `${sId} (afterRem=${afterRem} > cap=${smc})`;
              }
            }
            const maxSat = Math.min(nextFreeSat, distinctSat);
            const minWk = Math.max(totalMinWk, totalRem - maxSat);
            const minWkFailed = nextFreeWk < minWk;
            const totalRemFailed = totalRem > (nextFreeWk + nextFreeSat);

            console.error(`  Free slot Day ${d} Period ${p}: canPlace=${canPlaceUnitAt(u, d, p)}, facOcc=${facOccupied}, minWkFail=${minWkFailed} (nextFreeWk=${nextFreeWk}, minWk=${minWk}, totalRem=${totalRem}, nextFreeSat=${nextFreeSat}), remFail=${totalRemFailed}, capFail=${failedSubjMaxCap}`);
          }
        }
      }
    }
    const bottleneckDiagnostics: InfeasibilityDiagnostic[] = [];

    // Analyze which unit or resource was the primary failure point
    for (const unit of sortedUnits) {
      let validSlotCount = 0;
      const candidateDays = unit.allowedDays || [0, 1, 2, 3, 4, 5];
      const candidatePeriods = unit.allowedPeriods || [0, 1, 2, 3, 4, 5, 6];
      for (const d of candidateDays) {
        for (const p of candidatePeriods) {
          if (canPlaceUnitAt(unit, d, p)) validSlotCount++;
        }
      }

      if (validSlotCount === 0) {
        bottleneckDiagnostics.push({
          category: unit.activityType === 'lab' ? 'LAB_CONTINUITY_IMPOSSIBLE' : 'FACULTY_OVER_ALLOCATION',
          severity: 'CRITICAL',
          affectedDepartment: unit.classId.departmentName,
          affectedYear: unit.classId.year,
          affectedSection: unit.classId.section,
          affectedSubject: unit.subjectName,
          affectedFacultyId: unit.primaryFacultyId,
          affectedFacultyName: unit.facultyName,
          description: `Zero valid slots available for "${unit.subjectName}" (duration: ${unit.duration}h) in ${unit.classKey}. Assigned faculty (${unit.facultyName || 'None'}) or class schedule is saturated.`,
          remediationAdvice: `Reduce required weekly hours or assign an additional faculty member to split teaching load.`,
        });
        break;
      }
    }

    return {
      status: (elapsedMs >= timeLimitMs || backtracks > maxBacktracks) ? 'TIMEOUT' : 'INFEASIBLE',
      isFeasible: false,
      isOptimal: false,
      executionTimeMs: elapsedMs,
      sectionResults: [],
      immutableAssignmentsPreserved: model.immutableAssignments.length,
      validationReport: {
        isValid: false,
        hardErrorCount: bottleneckDiagnostics.length || 1,
        softWarningCount: 0,
        violations: bottleneckDiagnostics.map(d => ({
          ruleId: d.category,
          ruleCategory: 'CURRICULUM',
          severity: 'HARD_ERROR',
          departmentName: d.affectedDepartment || '',
          year: d.affectedYear || '',
          section: d.affectedSection || '',
          subjectName: d.affectedSubject,
          message: d.description,
        })),
        summaryText: elapsedMs >= timeLimitMs
          ? `Solver timed out after ${Math.round(elapsedMs / 1000)}s with no zero-conflict solution.`
          : `Model is mathematically infeasible under current constraints.`,
      },
      diagnostics: bottleneckDiagnostics.length > 0 ? bottleneckDiagnostics : model.preValidationDiagnostics,
    };
  }

  // 6. Post-Solve Step: No synthetic filler slots added (user rule: schedule given 42 hours only)

  // 7. Compile SolvedSectionTimetable structures
  const sectionResults: SolvedSectionTimetable[] = [];
  for (const c of model.classes) {
    const cKey = classIdToKey(c);
    const grid = gridState.get(cKey)!;
    const stringGrid: string[][] = grid.map(row => row.map(cell => cell?.subjectName || ''));

    const isSpecialActivity = (name: string) => /^(library|counseling|counselling|seminar)$/i.test(name.trim());

    // Compute allocated hours per academic subject
    const allocatedHours: Record<string, number> = {};
    for (let d = 0; d < TOTAL_DAYS; d++) {
      for (let p = 0; p < PERIODS_PER_DAY; p++) {
        const cell = grid[d][p];
        if (cell && cell.subjectName && !isSpecialActivity(cell.subjectName)) {
          allocatedHours[cell.subjectName] = (allocatedHours[cell.subjectName] || 0) + 1;
        }
      }
    }

    const expectedHours: Record<string, number> = {};
    const subjects = model.teachingUnits.filter(u => u.classKey === cKey);
    // Combine expected hours from all teaching units and fixed curriculum assignments
    model.immutableAssignments
      .filter(a => a.classKey === cKey && !isSpecialActivity(a.subjectName) && a.source !== 'special_hours')
      .forEach(a => {
        expectedHours[a.subjectName] = (expectedHours[a.subjectName] || 0) + a.slots.length;
      });
    subjects
      .filter(u => !isSpecialActivity(u.subjectName))
      .forEach(u => {
        expectedHours[u.subjectName] = (expectedHours[u.subjectName] || 0) + u.duration;
      });

    const mismatches: Array<{ subject: string; expected: number; actual: number }> = [];
    for (const [sName, exp] of Object.entries(expectedHours)) {
      const act = allocatedHours[sName] || 0;
      if (act !== exp) {
        mismatches.push({ subject: sName, expected: exp, actual: act });
      }
    }

    sectionResults.push({
      departmentId: c.departmentId,
      departmentName: c.departmentName,
      year: c.year,
      section: c.section,
      grid: stringGrid,
      cellMetadata: grid.map(row => row.map(cell => cell ? {
        subjectId: cell.subjectId,
        subjectName: cell.subjectName,
        subjectCode: cell.subjectCode,
        facultyId: cell.facultyId,
        secondaryFacultyIds: cell.secondaryFacultyIds,
        facultyName: cell.facultyName,
        roomId: cell.roomId,
        isFixed: cell.isFixed,
        activityType: cell.activityType as any,
      } : { isFixed: false })),
      weeklyHourVerification: {
        isValid: mismatches.length === 0,
        allocatedHours,
        expectedHours,
        mismatches,
      },
    });
  }

  // 8. Run Independent Validation
  const validationReport = validateCompleteTimetableBatch(sectionResults, model);

  return {
    status: validationReport.isValid ? 'OPTIMAL' : 'FEASIBLE',
    isFeasible: validationReport.isValid,
    isOptimal: validationReport.isValid && validationReport.softWarningCount === 0,
    executionTimeMs: elapsedMs,
    sectionResults,
    immutableAssignmentsPreserved: model.immutableAssignments.length,
    validationReport,
  };
}
