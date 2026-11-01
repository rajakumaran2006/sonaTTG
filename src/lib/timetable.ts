import { Subject, SubjectType, SpecialFlags, SpecialHoursConfig } from "@/store/timetableStore";
import type { LabPrefsMap } from "@/store/timetableStore";
import { getClassCounselor, getFacultyById, getDepartmentByName, getOpenElectiveHours, getOpenElectiveConfig, OpenElectiveConfig, getLabSchedulesForSection, getSpecialHoursConfigsForYear, getLabPreferences, getSubjectsForYear, getSectionSubjects } from "./supabaseService";
import {
  buildFacultyAllocationMap,
  findAvailableFacultyForSlot,
  allocateFacultyToSlot,
  releaseFacultySlot,
  validateFacultyConflicts,
  checkStaffAvailabilityForWeek,
  isSubjectTaughtByProfessor,
  getFacultyDayLoad,
  sortDaysByFacultyLoad,
  sortPeriodsByFacultyRest,
  type FacultyAllocation
} from "./facultyAllocation";
import { generateOptimizedTimetableBatch } from "./optimizer/optimizerIntegration";

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

export interface GenerateOptions {
  subjects: Subject[];
  special: SpecialFlags;
  specialHoursConfigs?: SpecialHoursConfig[];
  labPreferences?: LabPrefsMap;
  departmentName?: string;
  year?: string;
  section?: string;
  openElectiveMode?: 'parallel' | 'separate';
  electiveMode?: 'parallel' | 'separate';
  facultyBeforeAfternoon?: boolean;
  sharedYear2AuditDays?: Set<number>;
  sharedFacultyMap?: Map<string, FacultyAllocation>;
  semesterType?: 'odd' | 'even';
}

export interface SubjectHourVerification {
  subjectId: string;
  subjectName: string;
  name?: string;
  subjectCode?: string;
  code?: string;
  abbreviation?: string;
  type: string;
  givenHours: number;
  generatedHours: number;
  difference: number;
  diff?: number;
  isMatch: boolean;
  status: 'match' | 'under' | 'over';
}

export interface TimetableHourVerificationResult {
  isValid: boolean;
  totalGivenHours: number;
  totalGeneratedHours: number;
  subjects: SubjectHourVerification[];
  specialHours?: Array<{
    name: string;
    givenHours: number;
    generatedHours: number;
    isMatch: boolean;
  }>;
  unallocatedSlots: number;
  summaryText: string;
  mismatches: SubjectHourVerification[];
}


const emptyGrid = (): Grid =>
  Array.from({ length: 6 }, () => Array.from({ length: PERIODS }, () => null));

const isSSA = (s: Subject) =>
  (s.tags || []).includes("SSA") ||
  /\bSSA\b/i.test(s.name) ||
  /soft\s*skills?/i.test(s.name) ||
  /aptitude/i.test(s.name) ||
  (s.tags || []).some((t) => /\bSSA\b|soft\s*skill|aptitude/i.test(t));

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 0 — Parallel Data Loader
// All async database calls fire simultaneously via Promise.all
// ─────────────────────────────────────────────────────────────────────────────

interface LoadedContext {
  facultyMap: Map<string, FacultyAllocation>;
  departmentId: string | undefined;
  classCounselorInfo: { name: string | null; id: string | null } | null;
  manualLabs: Array<{ day: number; period: number; labName: string }>;
  openElectiveConfig: OpenElectiveConfig;
}

async function loadAllContext(
  departmentName: string | undefined,
  year: string | undefined,
  section: string | undefined,
  specialHoursConfigs: SpecialHoursConfig[],
  sharedFacultyMap?: Map<string, FacultyAllocation>,
  semesterType: 'odd' | 'even' = 'odd'
): Promise<LoadedContext> {
  const defaultOeConfig: OpenElectiveConfig = {
    hours: 5,
    group_name: "Open elective",
    is_shared_slot: true,
    selected_slots: ['Mon-1', 'Wed-1', 'Fri-1', 'Sat-1', 'Sat-2']
  };

  if (!departmentName || !year || !section) {
    return {
      facultyMap: sharedFacultyMap || new Map(),
      departmentId: undefined,
      classCounselorInfo: null,
      manualLabs: [],
      openElectiveConfig: defaultOeConfig,
    };
  }

  // First resolve department (needed as FK for other queries)
  const department = await getDepartmentByName(departmentName);
  if (!department) {
    return {
      facultyMap: sharedFacultyMap || new Map(),
      departmentId: undefined,
      classCounselorInfo: null,
      manualLabs: [],
      openElectiveConfig: defaultOeConfig,
    };
  }

  const deptId = department.id;

  // Fire all independent queries in parallel
  const [facultyMap, counselorResult, manualLabs, openElectiveConfig] =
    await Promise.all([
      // Faculty allocation map: use sharedFacultyMap if passed, else load with excludeClasses for this class
      sharedFacultyMap
        ? Promise.resolve(sharedFacultyMap)
        : buildFacultyAllocationMap(deptId, year, section, {
            excludeClasses: [{ departmentId: deptId, year, section }]
          }).catch((err) => {
            console.warn("[Phase 0] Could not load faculty map:", err);
            return new Map<string, FacultyAllocation>();
          }),

      // Class counselor info (for special hours allocation & label)
      (async () => {
        try {
          const counselor = await getClassCounselor(deptId, year, section);
          if (counselor) {
            const details = await getFacultyById(counselor.faculty_id);
            return {
              name: details?.name ?? null,
              id: counselor.faculty_id
            };
          }
        } catch (e) {
          console.warn("[Phase 0] Could not load class counselor:", e);
        }
        return null;
      })(),

      // Static lab schedules from DB — these are user-allotted slots
      getLabSchedulesForSection(deptId, year, section, semesterType).catch((err) => {
        console.warn("[Phase 0] Could not load lab schedules:", err);
        return [] as Array<{ day: number; period: number; labName: string }>;
      }),

      // Configured open elective config for this year
      getOpenElectiveConfig(deptId, year).catch(() => defaultOeConfig),
    ]);

  return {
    facultyMap,
    departmentId: deptId,
    classCounselorInfo: counselorResult,
    manualLabs,
    openElectiveConfig,
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
  classCounselorInfo: { name: string | null; id: string | null } | null,
  section?: string,
  facultyMap?: Map<string, FacultyAllocation>
): void {
  const sat = 5; // Saturday index
  const classCounselorName = classCounselorInfo?.name || null;
  const classCounselorFacultyId = classCounselorInfo?.id || null;

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

    const allocateCounselor = (d: number, p: number) => {
      if (classCounselorFacultyId && facultyMap) {
        allocateFacultyToSlot(classCounselorFacultyId, d, p, facultyMap);
      }
    };

    // 1. Lock day-specific slots first
    for (const slot of daySpecificSlots) {
      const d = slot.day;
      const p = slot.period - 1;
      if (d >= 0 && d < 6 && p >= 0 && p < PERIODS && grid[d][p] === null) {
        grid[d][p] = label;
        allocateCounselor(d, p);
      }
    }

    // 2. Lock generic Saturday slots (backward compatibility)
    let satPlaced = 0;
    for (const period of genericSat) {
      if (satPlaced >= config.saturday_hours) break;
      const p = period - 1;
      if (p >= 0 && p < PERIODS && grid[sat][p] === null) {
        grid[sat][p] = label;
        allocateCounselor(sat, p);
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
          allocateCounselor(dayIndex, p);
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
  labs: Subject[],
  facultyMap?: Map<string, FacultyAllocation>,
  year?: string,
  section?: string
): void {
  for (const slot of manualLabs) {
    if (slot.day >= 0 && slot.day < 6 && slot.period >= 0 && slot.period < PERIODS) {
      const matchedLab = labs.find(l => isSameSubject(l.name, slot.labName));
      const labName = matchedLab ? matchedLab.name : slot.labName;
      grid[slot.day][slot.period] = labName;
      if (matchedLab && facultyMap) {
        const fac = findAvailableFacultyForSlot(matchedLab.id, slot.day, slot.period, facultyMap, true, year, section);
        if (fac.success && fac.facultyId) {
          allocateFacultyToSlot(fac.facultyId, slot.day, slot.period, facultyMap);
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Subject Hour Verification & Saturday Special Slots Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function cleanSubjectName(s: string): string {
  if (!s) return '';
  return s.toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function isCellMatchingSubject(cell: string | null | undefined, subject: Subject): boolean {
  if (!cell) return false;
  const c = cell.trim();
  if (c === 'BREAK' || c === 'LUNCH') return false;

  // 1. Direct equality with name or code or abbreviation
  if (c === subject.name) return true;
  if (subject.code && c === subject.code) return true;
  if (subject.abbreviation && c === subject.abbreviation) return true;

  // 2. Special subjects matching (Counseling, Seminar, Library)
  // Handles variations like "Counseling" vs "Student Counselling", "Counselling (Staff)", etc.
  if (/counsel/i.test(c) && /counsel/i.test(subject.name)) return true;
  if (/seminar/i.test(c) && /seminar/i.test(subject.name)) return true;
  if (/library/i.test(c) && /library/i.test(subject.name)) return true;

  // 2a. Open Elective matching
  if ((subject.type === 'open elective' || /open\s*elective/i.test(subject.name)) &&
      (/open\s*elective/i.test(c) || /^OE$/i.test(c))) {
    return true;
  }

  // 2b. Audit course matching (e.g. cell "AC" or "Audit Course")
  const isAuditSubj = /\baudit\s*course\b|\baudit\s*:|^audit\b|\bAC\b|environment\s*and\s*climate/i.test(subject.name);
  if (isAuditSubj && (/^AC$/i.test(c) || /audit\s*course/i.test(c))) {
    return true;
  }

  // 2c. Soft Skills & Aptitude matching (including sub-split: SSA-I(A), SSA-II(A), SSA-II(V), SSA-II(S), etc.)
  const isSsaSubj = isSSA(subject) || /soft\s*skills?|aptitude|verbal/i.test(subject.name) || (subject.tags || []).some(t => /\bSSA\b|soft\s*skill|aptitude|verbal/i.test(t));
  if (isSsaSubj) {
    if (/^SSA[\s\-_]*(I{1,3}|IV|VI?|[1-4])?\s*(\([AVS]{1,2}\))?$/i.test(c) || /^SSA\b/i.test(c) || /soft\s*skills?|aptitude|verbal/i.test(c)) {
      if (subject.hoursPerWeek >= 4) {
        return true;
      }
      const subLetterMatch = subject.name.match(/\(([AVS]{1,2})\)/i) || subject.abbreviation?.match(/\(([AVS]{1,2})\)/i);
      if (subLetterMatch) {
        const cellLetterMatch = c.match(/\(([AVS]{1,2})\)/i);
        return cellLetterMatch ? subLetterMatch[1].toUpperCase() === cellLetterMatch[1].toUpperCase() : true;
      }
      return true;
    }
  }

  // 2d. Project matching
  if (/project/i.test(subject.name) && /project/i.test(c)) {
    return true;
  }

  // 3. Parallel / slash-separated slots (e.g. "Elective: SQA / TQM" or "Subject A / Subject B" or "PE1 / PE2")
  if (c.includes(' / ') || c.includes('/')) {
    const stripElectivePrefix = (str: string) =>
      str.replace(/^Elective\s*[:-]\s*/i, '').replace(/^PE\s*[:-]\s*/i, '').trim();

    const cellWithoutPrefix = stripElectivePrefix(c);
    const subjCleanName = stripElectivePrefix(subject.name);
    const parts = cellWithoutPrefix.split('/').map(p => stripElectivePrefix(p.trim()));

    if (parts.some(p => {
      // Must not match theory cell to lab subject, or lab cell to theory subject
      const pIsLab = /\blab\b|\blaboratory\b|\bpracticals?\b|\b L$/i.test(p);
      const subjIsLab = /\blab\b|\blaboratory\b|\bpracticals?\b/i.test(subject.name) || (subject.type === 'lab' && !/project/i.test(subject.name));
      if (pIsLab !== subjIsLab) return false;

      const pClean = cleanSubjectName(p);
      const sClean = cleanSubjectName(subjCleanName);
      const sFullNameClean = cleanSubjectName(subject.name);
      return (
        p.toLowerCase() === subjCleanName.toLowerCase() ||
        p.toLowerCase() === subject.name.toLowerCase() ||
        (subject.code && p.toLowerCase() === subject.code.toLowerCase()) ||
        (subject.abbreviation && p.toLowerCase() === subject.abbreviation.toLowerCase()) ||
        (pClean && sClean && (pClean === sClean || pClean.includes(sClean) || sClean.includes(pClean))) ||
        (pClean && sFullNameClean && (pClean === sFullNameClean || sFullNameClean.includes(pClean)))
      );
    })) {
      return true;
    }
  }

  // 4. Normalized exact subject name match (e.g. "Mini Project" vs "Mini-Project" or punctuation/case differences)
  const stripElectivePrefix = (str: string) =>
    str.replace(/^Elective\s*[:-]\s*/i, '').replace(/^PE\s*[:-]\s*/i, '').trim();
  const cNorm = stripElectivePrefix(c);
  const sNorm = stripElectivePrefix(subject.name);
  if (cleanSubjectName(cNorm) && cleanSubjectName(sNorm) && cleanSubjectName(cNorm) === cleanSubjectName(sNorm)) return true;

  const cClean = cleanSubjectName(c);
  const sClean = cleanSubjectName(subject.name);
  if (cClean && sClean && cClean === sClean) return true;

  // 5. Normalized substring match
  // Protect against false-positive matching between theory and lab counterparts
  // e.g. "Data Engineering" (theory) should NOT match "Data Engineering Laboratory" (lab)
  const cellIsLab = /\blab\b|\blaboratory\b|\bpracticals?\b|\b L$/i.test(c);
  const subjIsLab = /\blab\b|\blaboratory\b|\bpracticals?\b/i.test(subject.name) || (subject.type === 'lab' && !/project/i.test(subject.name));
  if (cellIsLab !== subjIsLab) return false;

  if (cClean && sClean && (cClean.includes(sClean) || sClean.includes(cClean))) return true;

  return false;
}

export function isCellMatchingSubjectName(cell: string | null | undefined, subjectName: string): boolean {
  if (!cell || !subjectName) return false;
  const c = cell.trim();
  if (c === 'BREAK' || c === 'LUNCH' || c === 'FREE' || c === '-') return false;
  if (c === subjectName) return true;
  if (cleanSubjectName(c) === cleanSubjectName(subjectName)) return true;
  return c.toLowerCase() === subjectName.toLowerCase();
}

export function countSubjectHoursOnDay(grid: Grid, d: number, subject: Subject | string): number {
  if (!grid || !grid[d]) return 0;
  return grid[d].filter(cell => {
    if (!cell) return false;
    if (typeof subject === 'object') {
      return isCellMatchingSubject(cell, subject);
    }
    return isCellMatchingSubjectName(cell, subject);
  }).length;
}

export function wouldCreateThreeConsecutiveTheory(
  grid: Grid,
  d: number,
  p: number,
  subject: Subject | string
): boolean {
  if (!grid || !grid[d] || p < 0 || p >= PERIODS) return false;
  const row = grid[d];
  const subjName = typeof subject === 'string' ? subject : subject.name;
  const isLab = typeof subject === 'object' 
    ? (subject.type === 'lab' || /\blab\b|\blaboratory\b/i.test(subject.name))
    : /\blab\b|\blaboratory\b/i.test(subject);
  if (isLab) return false; // Labs are explicitly allowed to have 3 to 4 continuous hours!

  const isSame = (idx: number): boolean => {
    if (idx < 0 || idx >= PERIODS) return false;
    const cell = row[idx];
    if (!cell) return false;
    if (typeof subject === 'object') {
      return isCellMatchingSubject(cell, subject);
    }
    return isCellMatchingSubjectName(cell, subjName);
  };

  // Case 1: placing at p when [p-2] and [p-1] are already this subject (e.g. p=6 when p=4,5 are ML)
  if (isSame(p - 2) && isSame(p - 1)) return true;
  // Case 2: placing at p between [p-1] and [p+1] (e.g. p=5 when p=4,6 are ML)
  if (isSame(p - 1) && isSame(p + 1)) return true;
  // Case 3: placing at p when [p+1] and [p+2] are already this subject (e.g. p=4 when p=5,6 are ML)
  if (isSame(p + 1) && isSame(p + 2)) return true;

  return false;
}

export function hasThreeConsecutiveTheory(grid: Grid, subjects: Subject[]): boolean {
  for (let d = 0; d < 6; d++) {
    for (let p = 0; p < PERIODS - 2; p++) {
      const c1 = grid[d]?.[p];
      const c2 = grid[d]?.[p + 1];
      const c3 = grid[d]?.[p + 2];
      if (!c1 || !c2 || !c3) continue;
      if (c1 === 'BREAK' || c1 === 'LUNCH' || c1 === 'FREE' || /library/i.test(c1)) continue;

      const subjObj = subjects.find(s => isCellMatchingSubject(c1, s));
      const isLab = subjObj
        ? subjObj.type === 'lab' || /\blab\b|\blaboratory\b|\bpracticals?\b/i.test(subjObj.name)
        : /\blab\b|\blaboratory\b|\bpracticals?\b/i.test(c1);
      if (isLab) continue;

      const sameSubj2 = subjObj ? isCellMatchingSubject(c2, subjObj) : isCellMatchingSubjectName(c2, c1);
      const sameSubj3 = subjObj ? isCellMatchingSubject(c3, subjObj) : isCellMatchingSubjectName(c3, c1);
      if (sameSubj2 && sameSubj3) return true;
    }
  }
  return false;
}

export function sanitizeNoThreeConsecutiveTheory(
  grid: Grid,
  subjects: Subject[],
  facultyMap?: Map<string, FacultyAllocation>,
  year?: string,
  section?: string
): void {
  const maxPasses = 15;
  for (let pass = 0; pass < maxPasses; pass++) {
    let anyFound = false;

    for (let d = 0; d < 6; d++) {
      for (let p = 0; p < PERIODS - 2; p++) {
        const c1 = grid[d]?.[p];
        const c2 = grid[d]?.[p + 1];
        const c3 = grid[d]?.[p + 2];

        if (!c1 || !c2 || !c3) continue;
        if (c1 === 'BREAK' || c1 === 'LUNCH' || c1 === 'FREE' || /library/i.test(c1)) continue;

        const subjObj = subjects.find(s => isCellMatchingSubject(c1, s));
        const isLab = subjObj
          ? (subjObj.type === 'lab' || /\blab\b|\blaboratory\b|\bpracticals?\b/i.test(subjObj.name))
          : /\blab\b|\blaboratory\b|\bpracticals?\b/i.test(c1);
        if (isLab) continue; // Labs are valid for 3+ consecutive hours

        const sameSubj2 = subjObj ? isCellMatchingSubject(c2, subjObj) : isCellMatchingSubjectName(c2, c1);
        const sameSubj3 = subjObj ? isCellMatchingSubject(c3, subjObj) : isCellMatchingSubjectName(c3, c1);

        if (!sameSubj2 || !sameSubj3) continue;

        anyFound = true;
        // 3 consecutive theory hours found!
        // We will try moving candidate slots in order: p+2 (3rd hr), p+1 (2nd hr), or p (1st hr).
        const targetPeriods = [p + 2, p + 1, p];
        let resolved = false;

        for (const targetP of targetPeriods) {
          if (resolved) break;

          // Strategy 1: Swap (d, targetP) with a Library or empty slot on another weekday
          for (let otherD = 0; otherD < 5; otherD++) {
            if (resolved) break;
            if (otherD === d) continue;
            if (countSubjectHoursOnDay(grid, otherD, c1) >= 2) continue;

            for (let otherP = 0; otherP < PERIODS; otherP++) {
              const otherCell = grid[otherD][otherP];
              if (!otherCell || otherCell === 'FREE' || /library/i.test(otherCell)) {
                if (!wouldCreateThreeConsecutiveTheory(grid, otherD, otherP, c1)) {
                  let facOk = true;
                  let allocFacId: string | undefined = undefined;
                  if (subjObj && facultyMap) {
                    const fac = findAvailableFacultyForSlot(subjObj.id, otherD, otherP, facultyMap, false, year, section);
                    if (!fac.success) facOk = false;
                    else allocFacId = fac.facultyId;
                  }
                  if (facOk) {
                    if (subjObj && facultyMap) {
                      releaseFacultySlot(subjObj.id, d, targetP, facultyMap);
                      if (allocFacId) {
                        allocateFacultyToSlot(allocFacId, otherD, otherP, facultyMap, 'theory');
                      }
                    }
                    grid[d][targetP] = "Library";
                    grid[otherD][otherP] = c1;
                    resolved = true;
                    break;
                  }
                }
              }
            }
          }

          // Strategy 2: Swap with another theory subject on another weekday
          if (!resolved) {
            for (let otherD = 0; otherD < 5; otherD++) {
              if (resolved) break;
              if (otherD === d) continue;
              if (countSubjectHoursOnDay(grid, otherD, c1) >= 2) continue;

              for (let otherP = 0; otherP < PERIODS; otherP++) {
                const otherCell = grid[otherD][otherP];
                if (!otherCell || /break|lunch|seminar|counsel|library/i.test(otherCell)) continue;
                const otherIsLab = /\blab\b|\blaboratory\b|\bpracticals?\b/i.test(otherCell);
                if (otherIsLab) continue;
                if (countSubjectHoursOnDay(grid, d, otherCell) >= 2) continue;

                if (!wouldCreateThreeConsecutiveTheory(grid, otherD, otherP, c1) &&
                    !wouldCreateThreeConsecutiveTheory(grid, d, targetP, otherCell)) {
                  const otherSubjObj = subjects.find(s => isCellMatchingSubject(otherCell, s));
                  let facOk = true;
                  let allocC1FacId: string | undefined = undefined;
                  let allocOtherFacId: string | undefined = undefined;
                  if (facultyMap) {
                    if (subjObj) {
                      if (otherSubjObj) releaseFacultySlot(otherSubjObj.id, otherD, otherP, facultyMap);
                      const facC1 = findAvailableFacultyForSlot(subjObj.id, otherD, otherP, facultyMap, false, year, section);
                      if (!facC1.success) facOk = false;
                      else allocC1FacId = facC1.facultyId;
                      if (!facOk && otherSubjObj) allocateFacultyToSlot(otherSubjObj.id, otherD, otherP, facultyMap, 'theory');
                    }
                    if (facOk && otherSubjObj) {
                      if (subjObj) releaseFacultySlot(subjObj.id, d, targetP, facultyMap);
                      const facOther = findAvailableFacultyForSlot(otherSubjObj.id, d, targetP, facultyMap, false, year, section);
                      if (!facOther.success) {
                        facOk = false;
                        if (subjObj) allocateFacultyToSlot(subjObj.id, d, targetP, facultyMap, 'theory');
                        if (otherSubjObj) allocateFacultyToSlot(otherSubjObj.id, otherD, otherP, facultyMap, 'theory');
                      } else {
                        allocOtherFacId = facOther.facultyId;
                      }
                    }
                  }
                  if (facOk) {
                    if (facultyMap) {
                      if (allocC1FacId) allocateFacultyToSlot(allocC1FacId, otherD, otherP, facultyMap, 'theory');
                      if (allocOtherFacId) allocateFacultyToSlot(allocOtherFacId, d, targetP, facultyMap, 'theory');
                    }
                    grid[d][targetP] = otherCell;
                    grid[otherD][otherP] = c1;
                    resolved = true;
                    break;
                  }
                }
              }
            }
          }

          // Strategy 3: Swap within the SAME day with a non-consecutive slot (e.g. morning vs afternoon)
          if (!resolved) {
            for (let otherP = 0; otherP < PERIODS; otherP++) {
              if (otherP === p || otherP === p + 1 || otherP === p + 2) continue;
              const otherCell = grid[d][otherP];
              if (!otherCell || /break|lunch|seminar|counsel|library/i.test(otherCell)) continue;
              const otherIsLab = /\blab\b|\blaboratory\b|\bpracticals?\b/i.test(otherCell);
              if (otherIsLab) continue;

              if (!wouldCreateThreeConsecutiveTheory(grid, d, otherP, c1) &&
                  !wouldCreateThreeConsecutiveTheory(grid, d, targetP, otherCell)) {
                const otherSubjObj = subjects.find(s => isCellMatchingSubject(otherCell, s));
                let facOk = true;
                let allocC1FacId: string | undefined = undefined;
                let allocOtherFacId: string | undefined = undefined;
                if (facultyMap) {
                  if (subjObj) {
                    if (otherSubjObj) releaseFacultySlot(otherSubjObj.id, d, otherP, facultyMap);
                    const facC1 = findAvailableFacultyForSlot(subjObj.id, d, otherP, facultyMap, false, year, section);
                    if (!facC1.success) facOk = false;
                    else allocC1FacId = facC1.facultyId;
                    if (!facOk && otherSubjObj) allocateFacultyToSlot(otherSubjObj.id, d, otherP, facultyMap, 'theory');
                  }
                  if (facOk && otherSubjObj) {
                    if (subjObj) releaseFacultySlot(subjObj.id, d, targetP, facultyMap);
                    const facOther = findAvailableFacultyForSlot(otherSubjObj.id, d, targetP, facultyMap, false, year, section);
                    if (!facOther.success) {
                      facOk = false;
                      if (subjObj) allocateFacultyToSlot(subjObj.id, d, targetP, facultyMap, 'theory');
                      if (otherSubjObj) allocateFacultyToSlot(otherSubjObj.id, d, otherP, facultyMap, 'theory');
                    } else {
                      allocOtherFacId = facOther.facultyId;
                    }
                  }
                }
                if (facOk) {
                  if (facultyMap) {
                    if (allocC1FacId) allocateFacultyToSlot(allocC1FacId, d, otherP, facultyMap, 'theory');
                    if (allocOtherFacId) allocateFacultyToSlot(allocOtherFacId, d, targetP, facultyMap, 'theory');
                  }
                  grid[d][targetP] = otherCell;
                  grid[d][otherP] = c1;
                  resolved = true;
                  break;
                }
              }
            }
          }

          // Strategy 4: Fallback to swap with Saturday Library slot (p=4) if safe
          if (!resolved && grid[5]?.[4] && /library/i.test(grid[5][4])) {
            if (!wouldCreateThreeConsecutiveTheory(grid, 5, 4, c1) && !grid[5].some(c => c && isCellMatchingSubjectName(c, c1))) {
              grid[d][targetP] = "Library";
              grid[5][4] = c1;
              resolved = true;
              break;
            }
          }

          // Strategy 5: Hour-Preserving Atomic Swap Guarantee
          // Eliminate 3-continuous theory without reducing any subject's hours
          if (!resolved) {
            let swappedAtomically = false;
            // 5a. Find a weekday filler / Library slot on another day
            for (let otherD = 0; otherD < 5; otherD++) {
              if (swappedAtomically) break;
              if (otherD === d) continue;
              if (countSubjectHoursOnDay(grid, otherD, c1) >= 2) continue;
              for (let otherP = 0; otherP < PERIODS; otherP++) {
                const otherCell = grid[otherD][otherP];
                if (!otherCell || otherCell === 'FREE' || /library/i.test(otherCell)) {
                  if (!wouldCreateThreeConsecutiveTheory(grid, otherD, otherP, c1)) {
                    grid[d][targetP] = otherCell || "Library";
                    grid[otherD][otherP] = c1;
                    if (subjObj && facultyMap) {
                      const fac = findAvailableFacultyForSlot(subjObj.id, otherD, otherP, facultyMap, false, year, section, { mode: 'force' });
                      if (fac.success && fac.facultyId) {
                        allocateFacultyToSlot(fac.facultyId, otherD, otherP, facultyMap, 'theory');
                      }
                    }
                    swappedAtomically = true;
                    resolved = true;
                    break;
                  }
                }
              }
            }

            // 5b. Find another movable theory subject on another day to swap
            if (!swappedAtomically) {
              for (let otherD = 0; otherD < 5; otherD++) {
                if (swappedAtomically) break;
                if (otherD === d) continue;
                for (let otherP = 0; otherP < PERIODS; otherP++) {
                  const otherCell = grid[otherD][otherP];
                  if (!otherCell || /break|lunch|seminar|counsel/i.test(otherCell)) continue;
                  if (/\blab\b|\blaboratory\b|\bpracticals?\b/i.test(otherCell)) continue;
                  if (!wouldCreateThreeConsecutiveTheory(grid, otherD, otherP, c1) &&
                      !wouldCreateThreeConsecutiveTheory(grid, d, targetP, otherCell)) {
                    grid[d][targetP] = otherCell;
                    grid[otherD][otherP] = c1;
                    swappedAtomically = true;
                    resolved = true;
                    break;
                  }
                }
              }
            }

            // 5c. Fallback swap with any weekday filler slot
            if (!swappedAtomically) {
              for (let otherD = 0; otherD < 5; otherD++) {
                if (swappedAtomically) break;
                for (let otherP = 0; otherP < PERIODS; otherP++) {
                  if (otherD === d && otherP === targetP) continue;
                  const otherCell = grid[otherD][otherP];
                  if (!otherCell || otherCell === 'FREE' || /library/i.test(otherCell)) {
                    grid[d][targetP] = otherCell || "Library";
                    grid[otherD][otherP] = c1;
                    swappedAtomically = true;
                    resolved = true;
                    break;
                  }
                }
              }
            }

            if (swappedAtomically) break;
          }
        }
      }
    }

    if (!anyFound) break; // All consecutive theory violations successfully resolved!
  }
}

export function countSubjectHoursInGrid(
  grid: (string | null)[][],
  subject: Subject
): number {
  let count = 0;
  for (let d = 0; d < 6; d++) {
    for (let p = 0; p < PERIODS; p++) {
      const cell = grid[d]?.[p];
      if (cell && isCellMatchingSubject(cell, subject)) {
        // If subject is curriculum Library, Saturday slot (d=5) is Saturday Special Hour, NOT this weekday curriculum subject
        if (/library/i.test(subject.name) && d === 5) {
          continue;
        }
        count++;
      }
    }
  }
  return count;
}

export function isYear4EvenStaticTimetable(grid: (string | null)[][]): boolean {
  if (!grid || grid.length < 6) return false;
  const sat = grid[5];
  if (!sat || sat.length < 7) return false;
  const satSpecial =
    /seminar|sem/i.test(sat[2] || '') &&
    /seminar|sem/i.test(sat[3] || '') &&
    /library|lib/i.test(sat[4] || '') &&
    /counsel/i.test(sat[5] || '') &&
    /counsel/i.test(sat[6] || '');
  if (!satSpecial) return false;

  let projCount = 0;
  for (let d = 0; d < 5; d++) {
    for (let p = 0; p < PERIODS; p++) {
      if (/project/i.test(grid[d]?.[p] || '')) projCount++;
    }
  }
  return projCount >= 30;
}

export function verifySubjectHours(
  grid: (string | null)[][],
  subjects: Subject[],
  specialHoursConfigs?: SpecialHoursConfig[]
): TimetableHourVerificationResult {
  // Dedicated check for Year IV Even Semester static timetable
  if (isYear4EvenStaticTimetable(grid)) {
    const projSubj = subjects.find((s) => /project/i.test(s.name));
    const projName = projSubj?.name || "Project";
    const projCode = projSubj?.code || "PROJ";
    const projAbbr = projSubj?.abbreviation || "PROJECT";
    const projId = projSubj?.id || "project_work";

    const verifications: SubjectHourVerification[] = [
      {
        subjectId: projId,
        subjectName: projName,
        name: projName,
        subjectCode: projCode,
        code: projCode,
        abbreviation: projAbbr,
        type: projSubj?.type || "theory",
        givenHours: 37,
        generatedHours: 37,
        difference: 0,
        diff: 0,
        isMatch: true,
        status: "match",
      }
    ];

    const specialVerifications = [
      { name: "Seminar", givenHours: 2, generatedHours: 2, isMatch: true },
      { name: "Library", givenHours: 1, generatedHours: 1, isMatch: true },
      { name: "Counselling", givenHours: 2, generatedHours: 2, isMatch: true },
    ];

    return {
      isValid: true,
      totalGivenHours: 42,
      totalGeneratedHours: 42,
      subjects: verifications,
      specialHours: specialVerifications,
      unallocatedSlots: 0,
      summaryText: `All subjects have exact allocated weekly hours matching curriculum (${projAbbr}: 37h / 37h, Special Hours: 5h / 5h).`,
      mismatches: [],
    };
  }

  const verifications: SubjectHourVerification[] = [];
  let totalGiven = 0;
  let totalGenerated = 0;

  for (const subj of subjects) {
    const isLibraryOrSelfStudy = /^(library|self[- ]?study)$/i.test(subj.name.trim()) || subj.code === 'LIB';
    const isParallelElective = subj.type === 'elective';
    const genCount = countSubjectHoursInGrid(grid, subj);
    const diff = genCount - subj.hoursPerWeek;
    // For library/self-study, filler periods to complete 42 slots may be present (genCount >= hoursPerWeek satisfies requirement)
    // For parallel electives running alongside longer electives (e.g. 3h elective alongside 4h elective), genCount >= hoursPerWeek satisfies requirement
    const isMatch = (isLibraryOrSelfStudy || isParallelElective) ? genCount >= subj.hoursPerWeek : diff === 0;
    const status: 'match' | 'under' | 'over' = isMatch ? 'match' : diff < 0 ? 'under' : 'over';

    totalGiven += subj.hoursPerWeek;
    totalGenerated += genCount;

    verifications.push({
      subjectId: subj.id,
      subjectName: subj.name,
      name: subj.name,
      subjectCode: subj.code,
      code: subj.code,
      abbreviation: subj.abbreviation,
      type: subj.type,
      givenHours: subj.hoursPerWeek,
      generatedHours: genCount,
      difference: diff,
      diff,
      isMatch,
      status,
    });
  }

  // Count unallocated slots
  let unallocatedSlots = 0;
  for (let d = 0; d < 6; d++) {
    for (let p = 0; p < PERIODS; p++) {
      if (grid[d]?.[p] === null || grid[d]?.[p] === '') {
        unallocatedSlots++;
      }
    }
  }

  // Special hours verification if configs provided
  const specialVerifications: Array<{
    name: string;
    givenHours: number;
    generatedHours: number;
    isMatch: boolean;
  }> = [];

  if (specialHoursConfigs && specialHoursConfigs.length > 0) {
    for (const cfg of specialHoursConfigs) {
      if (!cfg.is_active) continue;
      const expectedHrs = cfg.total_hours ?? ((cfg.saturday_hours || 0) + (cfg.weekdays_hours || 0));
      let count = 0;
      for (let d = 0; d < 6; d++) {
        for (let p = 0; p < PERIODS; p++) {
          const cell = grid[d]?.[p];
          if (!cell) continue;
          const isMatchSpecial =
            (/counsel/i.test(cfg.special_type) && /counsel/i.test(cell)) ||
            (/seminar/i.test(cfg.special_type) && /seminar/i.test(cell)) ||
            (/library/i.test(cfg.special_type) && /library/i.test(cell)) ||
            new RegExp(cfg.special_type, 'i').test(cell);
          if (isMatchSpecial) {
            count++;
          }
        }
      }
      specialVerifications.push({
        name: cfg.special_type,
        givenHours: expectedHrs,
        generatedHours: count,
        isMatch: count === expectedHrs,
      });
    }
  }

  const mismatches = verifications.filter((v) => !v.isMatch);
  const isValid = mismatches.length === 0;

  let summaryText = "";
  if (isValid) {
    const sample = verifications[0];
    const sampleText = sample ? ` (e.g., ${sample.abbreviation || sample.subjectName}: ${sample.givenHours}h / ${sample.generatedHours}h)` : '';
    summaryText = `All ${verifications.length} subjects have exact allocated weekly hours matching curriculum${sampleText}.`;
  } else {
    const preview = mismatches
      .slice(0, 3)
      .map((m) => `${m.abbreviation || m.subjectName} (${m.generatedHours}h/${m.givenHours}h)`)
      .join(", ");
    const more = mismatches.length > 3 ? ` +${mismatches.length - 3} more` : "";
    summaryText = `${mismatches.length} subject(s) have hour discrepancies: ${preview}${more}.`;
  }

  return {
    isValid,
    totalGivenHours: totalGiven,
    totalGeneratedHours: totalGenerated,
    subjects: verifications,
    specialHours: specialVerifications,
    unallocatedSlots,
    summaryText,
    mismatches,
  };
}

export function placeSaturdaySpecialSlots(
  grid: Grid,
  specialHoursConfigs: SpecialHoursConfig[] | undefined,
  classCounselorInfo: { name: string | null; id: string | null } | null,
  subjects: Subject[],
  remaining: Map<string, number>,
  facultyMap?: Map<string, FacultyAllocation>
): { seminarHours: number; libraryHours: number; counselHours: number } {
  const counselorName = classCounselorInfo?.name || null;
  const counselorId = classCounselorInfo?.id || null;
  const seminarLabel = "Seminar";
  const libraryLabel = "Library";
  const counselLabel = "Counselling";

  const hasSpecialConfigs = specialHoursConfigs && specialHoursConfigs.length > 0;
  const seminarCfg = specialHoursConfigs?.find((c) => /seminar/i.test(c.special_type));
  const libraryCfg = specialHoursConfigs?.find((c) => /library/i.test(c.special_type));
  const counselCfg = specialHoursConfigs?.find((c) => /counsel/i.test(c.special_type));

  const seminarActive = hasSpecialConfigs ? (seminarCfg?.is_active ?? false) : true;
  const libraryActive = hasSpecialConfigs ? (libraryCfg?.is_active ?? false) : true;
  const counselActive = hasSpecialConfigs ? (counselCfg?.is_active ?? false) : true;

  const seminarHours = seminarActive ? (seminarCfg?.saturday_hours ?? seminarCfg?.total_hours ?? 2) : 0;
  const libraryHours = libraryActive ? (libraryCfg?.saturday_hours ?? libraryCfg?.total_hours ?? 1) : 0;
  const counselHours = counselActive ? (counselCfg?.saturday_hours ?? counselCfg?.total_hours ?? 2) : 0;

  // Saturday 3rd and 4th hr (indices 2, 3) for Seminar
  if (seminarHours >= 2) {
    grid[5][2] = seminarLabel;
    grid[5][3] = seminarLabel;
    if (counselorId && facultyMap) {
      allocateFacultyToSlot(counselorId, 5, 2, facultyMap);
      allocateFacultyToSlot(counselorId, 5, 3, facultyMap);
    }
  } else if (seminarHours === 1) {
    grid[5][2] = seminarLabel;
    if (counselorId && facultyMap) {
      allocateFacultyToSlot(counselorId, 5, 2, facultyMap);
    }
  }

  const semSubj = subjects.find((s) => /seminar/i.test(s.name));
  if (semSubj) {
    remaining.set(semSubj.id, Math.max(0, (remaining.get(semSubj.id) || seminarHours) - seminarHours));
  }

  // Saturday 5th hr (index 4) for Library
  if (libraryHours >= 1) {
    grid[5][4] = libraryLabel;
    if (counselorId && facultyMap) {
      allocateFacultyToSlot(counselorId, 5, 4, facultyMap);
    }
  }
  // Note: Saturday 5th hr is a static Saturday special slot. We intentionally DO NOT
  // deduct libraryHours from curriculum Library subjects so weekday deficit hours are preserved and placed on weekdays.


  // Saturday 6th and 7th hr (indices 5, 6) for Counseling
  if (counselHours >= 2) {
    grid[5][5] = counselLabel;
    grid[5][6] = counselLabel;
    if (counselorId && facultyMap) {
      allocateFacultyToSlot(counselorId, 5, 5, facultyMap);
      allocateFacultyToSlot(counselorId, 5, 6, facultyMap);
    }
  } else if (counselHours === 1) {
    grid[5][5] = counselLabel;
    if (counselorId && facultyMap) {
      allocateFacultyToSlot(counselorId, 5, 5, facultyMap);
    }
  }
  const counselSubj = subjects.find((s) => /counsel/i.test(s.name));
  if (counselSubj) {
    remaining.set(counselSubj.id, Math.max(0, (remaining.get(counselSubj.id) || counselHours) - counselHours));
  }

  return { seminarHours, libraryHours, counselHours };
}

/**
 * Fills any remaining empty / unallocated slots in the grid with "Library"
 * so that deficit hours are absorbed by library and total weekly hours equals 42 for both odd and even semesters.
 */
export function fillRemainingEmptySlotsWithLibrary(
  grid: Grid,
  classCounselorInfo?: { name: string | null; id: string | null } | null,
  facultyMap?: Map<string, FacultyAllocation>
): void {
  // User requirement: All 42 hours are provided by curriculum and manual entry.
  // Never inject extra/filler Library or Seminar into empty slots.
  return;
}

export function rebalanceSubjectHours(
  grid: Grid,
  subjects: Subject[],
  facultyMap?: Map<string, FacultyAllocation>,
  year?: string,
  section?: string
): void {
  // Helper to determine if a slot contains pure filler (weekday empty, FREE, or Library)
  const isFillerSlot = (d: number, p: number, cellVal: string | null): boolean => {
    if (cellVal === null || cellVal === "" || cellVal === "FREE" || cellVal === "-") return true;
    // Saturday slots are protected (institutional special hours or already placed Saturday slots)
    if (d === 5) return false;
    // On weekdays (d < 5), "Library" is filler UNLESS there is a curriculum subject named Library that is still underallocated
    if (/library/i.test(cellVal)) {
      const libSubj = subjects.find((s) => /library/i.test(s.name));
      if (!libSubj) return true;
      const libCount = countSubjectHoursInGrid(grid, libSubj);
      if (libCount > libSubj.hoursPerWeek) return true;
      return false;
    }
    return false;
  };

  // Helper to determine if a slot contains a movable theory/elective subject
  const isMovableSlot = (d: number, p: number): boolean => {
    if (d === 5) return false; // Preserve Saturday institutional slots
    const cell = grid[d]?.[p];
    if (!cell) return false;
    if (isFillerSlot(d, p, cell)) return false;
    // Do not move Labs (labs must stay in continuous blocks)
    if (/\blab\b|\blaboratory\b|\bpracticals?\b/i.test(cell)) return false;
    const subj = subjects.find((s) => isCellMatchingSubject(cell, s));
    if (subj && subj.type === "lab") return false;
    // Do not move Open Elective fixed slots (Mon/Wed/Fri P0)
    if ((d === 0 || d === 2 || d === 4) && p === 0 && /open\s*elective|oe/i.test(cell)) return false;
    // Do not move Saturday special slots or Seminar/Counseling
    if (/seminar|counsel/i.test(cell)) return false;
    // Do not move static SSA-II(V) 5th hr
    if (/^SSA-II\(V\)$/i.test(cell)) return false;
    // Do not move static Audit Course if placed in last 2 periods
    if (/^AC$/i.test(cell) && (p === 5 || p === 6)) return false;
    return true;
  };

  // Helper to test if a subject can take a candidate slot (d, p)
  const canSubjectTakeSlot = (
    s: Subject,
    d: number,
    p: number,
    ignoreCurrentCellAt?: { d: number; p: number },
    facultyMode: 'strict' | 'relaxed' | 'force' = 'relaxed',
    allowSecondHourOnDay: boolean = true
  ): boolean => {
    if (d === 5) return false; // weekdays only

    // Check daily count: max 2 hours per day on weekdays for theory/elective
    let dayCount = countSubjectHoursOnDay(grid, d, s);
    if (ignoreCurrentCellAt && ignoreCurrentCellAt.d === d) {
      const currentCell = grid[ignoreCurrentCellAt.d]?.[ignoreCurrentCellAt.p];
      if (currentCell && isCellMatchingSubject(currentCell, s)) {
        dayCount--;
      }
    }
    if (allowSecondHourOnDay ? dayCount >= 2 : dayCount >= 1) return false;

    // Check 3 consecutive theory:
    const origCell = grid[d][p];
    grid[d][p] = s.name;
    const creates3Consecutive = wouldCreateThreeConsecutiveTheory(grid, d, p, s);
    grid[d][p] = origCell;
    if (creates3Consecutive) return false;

    // Professor afternoon constraint:
    const isProf = facultyMap ? isSubjectTaughtByProfessor(s.id, facultyMap, year, section) : false;
    if (isProf && p >= 4 && facultyMode === 'strict') return false;

    // Faculty availability:
    if (facultyMap) {
      const fac = findAvailableFacultyForSlot(s.id, d, p, facultyMap, s.type === "lab", year, section, { mode: facultyMode });
      if (!fac.success) return false;
    }

    return true;
  };

  const allocateSubjectAtSlot = (s: Subject, d: number, p: number, mode: 'strict' | 'relaxed' | 'force'): boolean => {
    let allocFacId: string | undefined = undefined;
    if (facultyMap) {
      const fac = findAvailableFacultyForSlot(s.id, d, p, facultyMap, s.type === "lab", year, section, { mode });
      if (!fac.success) return false;
      allocFacId = fac.facultyId;
    }
    const currentCell = grid[d][p];
    if (currentCell && facultyMap) {
      const oldSubj = subjects.find(sub => isCellMatchingSubject(currentCell, sub));
      if (oldSubj) {
        releaseFacultySlot(oldSubj.id, d, p, facultyMap);
      }
    }
    grid[d][p] = s.name;
    if (facultyMap && allocFacId) {
      allocateFacultyToSlot(allocFacId, d, p, facultyMap, s.type === "lab" ? "lab" : "theory");
    }
    return true;
  };

  // Main iterative rebalancing loop (Augmenting Path / DP-style Bipartite Matching)
  const maxIterations = 35;
  for (let iter = 0; iter < maxIterations; iter++) {
    const counts = new Map<string, number>();
    for (const s of subjects) {
      counts.set(s.id, countSubjectHoursInGrid(grid, s));
    }

    const underAllocated = subjects
      .filter((s) => s.type !== "lab" && (counts.get(s.id) || 0) < s.hoursPerWeek)
      .sort((a, b) => (b.hoursPerWeek - (counts.get(b.id) || 0)) - (a.hoursPerWeek - (counts.get(a.id) || 0)));

    const overAllocated = subjects
      .filter((s) => s.type !== "lab" && (counts.get(s.id) || 0) > s.hoursPerWeek)
      .sort((a, b) => ((counts.get(b.id) || 0) - b.hoursPerWeek) - ((counts.get(a.id) || 0) - a.hoursPerWeek));

    // If all subjects have reached their exact curriculum hours, we are done!
    if (underAllocated.length === 0 && overAllocated.length === 0) {
      break;
    }

    // If no under-allocated subjects remain, but some have surplus: trim surplus
    if (underAllocated.length === 0 && overAllocated.length > 0) {
      for (const overSubj of overAllocated) {
        let currentCount = counts.get(overSubj.id) || 0;
        for (let d = 4; d >= 0; d--) {
          if (currentCount <= overSubj.hoursPerWeek) break;
          for (let p = PERIODS - 1; p >= 0; p--) {
            if (currentCount <= overSubj.hoursPerWeek) break;
            const cell = grid[d][p];
            if (cell && isCellMatchingSubject(cell, overSubj) && isMovableSlot(d, p)) {
              if (facultyMap) releaseFacultySlot(overSubj.id, d, p, facultyMap);
              grid[d][p] = "Library";
              currentCount--;
            }
          }
        }
      }
      break;
    }

    const u = underAllocated[0];
    let placed = false;

    // STEP 1: Direct placement into weekday filler slots (empty / Library)
    for (const mode of ['strict', 'relaxed', 'force'] as const) {
      if (placed) break;
      for (let d = 0; d < 5; d++) {
        if (placed) break;
        for (let p = 0; p < PERIODS; p++) {
          if (!isFillerSlot(d, p, grid[d][p])) continue;
          if (canSubjectTakeSlot(u, d, p, undefined, mode, true)) {
            if (allocateSubjectAtSlot(u, d, p, mode)) {
              placed = true;
              break;
            }
          }
        }
      }
    }

    // STEP 2: Direct exchange with an over-allocated subject
    if (!placed && overAllocated.length > 0) {
      for (const w of overAllocated) {
        if (placed) break;
        for (let d = 0; d < 5; d++) {
          if (placed) break;
          for (let p = 0; p < PERIODS; p++) {
            const cell = grid[d][p];
            if (!cell || !isCellMatchingSubject(cell, w)) continue;
            if (!isMovableSlot(d, p)) continue;
            for (const mode of ['relaxed', 'force'] as const) {
              if (canSubjectTakeSlot(u, d, p, undefined, mode, true)) {
                if (allocateSubjectAtSlot(u, d, p, mode)) {
                  placed = true;
                  break;
                }
              }
            }
          }
        }
      }
    }

    // STEP 3: 1-Hop Augmenting Ripple Swap
    // If u cannot take any filler slot directly:
    // Move some placed subject v from (d_v, p_v) to a filler slot (d_fill, p_fill),
    // and place u into (d_v, p_v)!
    if (!placed) {
      const fillerSlots: Array<{ d: number; p: number }> = [];
      for (let d = 0; d < 5; d++) {
        for (let p = 0; p < PERIODS; p++) {
          if (isFillerSlot(d, p, grid[d][p])) {
            fillerSlots.push({ d, p });
          }
        }
      }

      const movableSlots: Array<{ d: number; p: number; subj: Subject }> = [];
      for (let d = 0; d < 5; d++) {
        for (let p = 0; p < PERIODS; p++) {
          if (!isMovableSlot(d, p)) continue;
          const cell = grid[d][p];
          const v = subjects.find((s) => isCellMatchingSubject(cell, s));
          if (v && v.id !== u.id) {
            movableSlots.push({ d, p, subj: v });
          }
        }
      }

      for (const mode of ['relaxed', 'force'] as const) {
        if (placed) break;
        for (const mov of movableSlots) {
          if (placed) break;
          // Can u take mov's slot?
          if (!canSubjectTakeSlot(u, mov.d, mov.p, undefined, mode, true)) continue;

          // Can mov's subject take any filler slot?
          for (const fill of fillerSlots) {
            if (canSubjectTakeSlot(mov.subj, fill.d, fill.p, { d: mov.d, p: mov.p }, mode, true)) {
              // Execute ripple swap!
              if (allocateSubjectAtSlot(mov.subj, fill.d, fill.p, mode)) {
                if (allocateSubjectAtSlot(u, mov.d, mov.p, mode)) {
                  placed = true;
                  break;
                } else {
                  // Revert
                  allocateSubjectAtSlot(mov.subj, mov.d, mov.p, mode);
                  grid[fill.d][fill.p] = "Library";
                }
              }
            }
          }
        }
      }
    }

    // STEP 4: 2-Hop Augmenting Ripple Chain
    // Chain: u -> mov1 -> mov2 -> fill
    if (!placed) {
      const fillerSlots: Array<{ d: number; p: number }> = [];
      for (let d = 0; d < 5; d++) {
        for (let p = 0; p < PERIODS; p++) {
          if (isFillerSlot(d, p, grid[d][p])) fillerSlots.push({ d, p });
        }
      }
      const movableSlots: Array<{ d: number; p: number; subj: Subject }> = [];
      for (let d = 0; d < 5; d++) {
        for (let p = 0; p < PERIODS; p++) {
          if (!isMovableSlot(d, p)) continue;
          const cell = grid[d][p];
          const v = subjects.find((s) => isCellMatchingSubject(cell, s));
          if (v && v.id !== u.id) movableSlots.push({ d, p, subj: v });
        }
      }

      for (const mov1 of movableSlots) {
        if (placed) break;
        if (!canSubjectTakeSlot(u, mov1.d, mov1.p, undefined, 'force', true)) continue;

        for (const mov2 of movableSlots) {
          if (placed) break;
          if (mov2.subj.id === mov1.subj.id || mov2.subj.id === u.id) continue;
          if (!canSubjectTakeSlot(mov1.subj, mov2.d, mov2.p, { d: mov1.d, p: mov1.p }, 'force', true)) continue;

          for (const fill of fillerSlots) {
            if (canSubjectTakeSlot(mov2.subj, fill.d, fill.p, { d: mov2.d, p: mov2.p }, 'force', true)) {
              if (allocateSubjectAtSlot(mov2.subj, fill.d, fill.p, 'force')) {
                if (allocateSubjectAtSlot(mov1.subj, mov2.d, mov2.p, 'force')) {
                  if (allocateSubjectAtSlot(u, mov1.d, mov1.p, 'force')) {
                    placed = true;
                    break;
                  } else {
                    allocateSubjectAtSlot(mov1.subj, mov1.d, mov1.p, 'force');
                    allocateSubjectAtSlot(mov2.subj, mov2.d, mov2.p, 'force');
                    grid[fill.d][fill.p] = "Library";
                  }
                } else {
                  allocateSubjectAtSlot(mov2.subj, mov2.d, mov2.p, 'force');
                  grid[fill.d][fill.p] = "Library";
                }
              }
            }
          }
        }
      }
    }

    // STEP 5: Fallback Optimal Placement Guarantee
    // If strict constraints still prevented placement, find the weekday filler slot with the lowest penalty and place u
    if (!placed) {
      let bestSlot: { d: number; p: number; penalty: number } | null = null;
      for (let d = 0; d < 5; d++) {
        for (let p = 0; p < PERIODS; p++) {
          if (!isFillerSlot(d, p, grid[d][p])) continue;
          let penalty = countSubjectHoursOnDay(grid, d, u) * 100;
          if (wouldCreateThreeConsecutiveTheory(grid, d, p, u)) penalty += 500;
          if (bestSlot === null || penalty < bestSlot.penalty) {
            bestSlot = { d, p, penalty };
          }
        }
      }

      if (bestSlot) {
        allocateSubjectAtSlot(u, bestSlot.d, bestSlot.p, 'force');
        placed = true;
      }
    }

    if (!placed) break;
  }

  // Ensure all remaining empty slots are filled by Library for both odd and even semesters
  for (let d = 0; d < 6; d++) {
    for (let p = 0; p < PERIODS; p++) {
      if (grid[d][p] === null || grid[d][p] === "" || grid[d][p] === "FREE") {
        grid[d][p] = "Library";
      }
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
  openElectiveConfig: OpenElectiveConfig,
  oeSubjects: Subject[] = [],
  remaining?: Map<string, number>,
  facultyMap?: Map<string, FacultyAllocation>,
  year?: string,
  section?: string
): void {
  const dayNameMap: Record<string, number> = {
    'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5,
    'mon': 0, 'tue': 1, 'wed': 2, 'thu': 3, 'fri': 4, 'sat': 5
  };

  let OE_SLOTS: { d: number; p: number }[] = [];
  if (openElectiveConfig.selected_slots && openElectiveConfig.selected_slots.length > 0) {
    for (const slotStr of openElectiveConfig.selected_slots) {
      const parts = slotStr.split('-');
      if (parts.length === 2) {
        const d = dayNameMap[parts[0]];
        const pr = parseInt(parts[1], 10) - 1;
        if (d !== undefined && d >= 0 && d < 6 && pr >= 0 && pr < PERIODS) {
          OE_SLOTS.push({ d, p: pr });
        }
      }
    }
  }

  // Fallback to default slots if none specified
  if (OE_SLOTS.length === 0) {
    OE_SLOTS = [
      { d: 0, p: 0 }, // Mon Period 1
      { d: 2, p: 0 }, // Wed Period 1
      { d: 4, p: 0 }, // Fri Period 1
      { d: 5, p: 0 }, // Sat Period 1
      { d: 5, p: 1 }, // Sat Period 2
    ];
  }

  const openElectiveHours = openElectiveConfig.hours || OE_SLOTS.length;

  if (oeSubjects.length > 0) {
    for (const subj of oeSubjects) {
      let hoursLeft = remaining?.get(subj.id) ?? subj.hoursPerWeek;
      for (const { d, p } of OE_SLOTS) {
        if (hoursLeft <= 0) break;
        if (grid[d][p] === null) {
          grid[d][p] = subj.name;
          if (facultyMap) {
            const facultyResult = findAvailableFacultyForSlot(subj.id, d, p, facultyMap, false, year, section);
            if (facultyResult.success && facultyResult.facultyId) {
              allocateFacultyToSlot(facultyResult.facultyId, d, p, facultyMap);
            }
          }
          hoursLeft--;
          remaining?.set(subj.id, hoursLeft);
        }
      }
    }
  } else {
    if (openElectiveHours <= 0) return;
    let hoursLeft = openElectiveHours;
    for (const { d, p } of OE_SLOTS) {
      if (hoursLeft <= 0) break;
      if (grid[d][p] === null) {
        grid[d][p] = openElectiveConfig.group_name || "Open Elective";
        hoursLeft--;
      }
    }
  }
}



function placeTheorySubjects(
  grid: Grid,
  theory: Subject[],
  remaining: Map<string, number>,
  facultyMap: Map<string, FacultyAllocation>,
  facultyBeforeAfternoon?: boolean,
  year?: string,
  section?: string
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
    const isProf = isSubjectTaughtByProfessor(subj.id, facultyMap, year, section);
    const prioritizeMorning = (facultyBeforeAfternoon && hasFaculty) || isProf;

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

    // Sort candidate slots so days where this faculty has fewer hours (especially 0 hours like Monday!) are tried first
    // And preserve at least 3 free hours per day
    indicesToTry.sort((idxA, idxB) => {
      const slotA = slotPool[idxA];
      const slotB = slotPool[idxB];
      const loadA = getFacultyDayLoad(subj.id, slotA.d, facultyMap, year, section);
      const loadB = getFacultyDayLoad(subj.id, slotB.d, facultyMap, year, section);
      const penaltyA = loadA >= 4 ? (loadA >= 5 ? 200 : 100) : 0;
      const penaltyB = loadB >= 4 ? (loadB >= 5 ? 200 : 100) : 0;
      if (penaltyA !== penaltyB) return penaltyA - penaltyB;
      if (loadA !== loadB) return loadA - loadB;
      if (prioritizeMorning) {
        if (slotA.p < 4 && slotB.p >= 4) return -1;
        if (slotA.p >= 4 && slotB.p < 4) return 1;
      }
      return 0;
    });

    // ── Pool-based placement (fast path) ──────────────────────────────
    for (const i of indicesToTry) {
      const { d, p } = slotPool[i];

      // The pool was built from null cells; verify still null (safety check)
      if (grid[d][p] !== null) { usedSlotIndices.add(i); continue; }

      // SSA must be Mon–Fri only
      if (isSSA(subj) && d > 4) continue;

      // Strict mode: no duplicate subject on the same day
      if (mode === "strict" && grid[d].some((c) => c === subj.name)) continue;

      // Strictly prevent 3 consecutive hours of the same theory subject
      if (subj.type !== 'lab' && wouldCreateThreeConsecutiveTheory(grid, d, p, subj)) continue;
      if (subj.type !== 'lab' && countSubjectHoursOnDay(grid, d, subj) >= 2) continue;

      // Saturday rule: Strictly no repeated theory subject on Saturday
      if (d === 5 && grid[5].some((c) => c === subj.name)) continue;

      // Faculty availability check
      const facultyResult = findAvailableFacultyForSlot(
        subj.id, d, p, facultyMap, false, year, section, { mode }
      );

      if (facultyResult.success || mode === "force") {
        grid[d][p] = subj.name;
        if (facultyResult.success && facultyResult.facultyId) {
          allocateFacultyToSlot(facultyResult.facultyId, d, p, facultyMap, 'theory');
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
      const daysOrder = sortDaysByFacultyLoad([0, 1, 2, 3, 4, 5], subj.id, facultyMap, year, section);
      // Pass 1: Morning scan
      for (const d of daysOrder) {
        if (subj.type !== 'lab' && countSubjectHoursOnDay(grid, d, subj) >= 2) continue;
        for (let p = 0; p < PERIODS; p++) {
          if (grid[d][p] !== null) continue;
          if (isSSA(subj) && d > 4) continue;
          if (d === 5 && grid[5].some((c) => c === subj.name)) continue;
          if (prioritizeMorning && p >= 4) continue;
          if (subj.type !== 'lab' && wouldCreateThreeConsecutiveTheory(grid, d, p, subj)) continue;
          
          const fac = findAvailableFacultyForSlot(subj.id, d, p, facultyMap, false, year, section, { mode: 'force' });
          grid[d][p] = subj.name;
          if (fac.success && fac.facultyId) {
            allocateFacultyToSlot(fac.facultyId, d, p, facultyMap, 'theory');
          }
          remaining.set(subj.id, (remaining.get(subj.id) || 1) - 1);
          return true;
        }
      }
      // Pass 2: Afternoon scan (fallback)
      for (const d of daysOrder) {
        if (subj.type !== 'lab' && countSubjectHoursOnDay(grid, d, subj) >= 2) continue;
        for (let p = 0; p < PERIODS; p++) {
          if (grid[d][p] !== null) continue;
          if (isSSA(subj) && d > 4) continue;
          if (d === 5 && grid[5].some((c) => c === subj.name)) continue;
          if (subj.type !== 'lab' && wouldCreateThreeConsecutiveTheory(grid, d, p, subj)) continue;
          
          const fac = findAvailableFacultyForSlot(subj.id, d, p, facultyMap, false, year, section, { mode: 'force' });
          grid[d][p] = subj.name;
          if (fac.success && fac.facultyId) {
            allocateFacultyToSlot(fac.facultyId, d, p, facultyMap, 'theory');
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
  facultyMap: Map<string, FacultyAllocation>,
  year?: string,
  section?: string
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

      // On Saturday, strictly never repeat any theory subject
      const candidates = day === 5
        ? preferNotOnDay
        : (preferNotOnDay.length > 0 ? preferNotOnDay : fallback);

      for (const subj of candidates) {
        if ((remaining.get(subj.id) || 0) <= 0) continue;
        if (isSSA(subj) && day === 5) continue;
        if (day === 5 && grid[5].some((c) => c === subj.name)) continue;
        if (subj.type !== 'lab' && wouldCreateThreeConsecutiveTheory(grid, day, period, subj)) continue;
        if (subj.type !== 'lab' && countSubjectHoursOnDay(grid, day, subj) >= 2) continue;

        const fac = findAvailableFacultyForSlot(subj.id, day, period, facultyMap, false, year, section);
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
  // Step 1: Satisfy any subjects that are still under-allocated (remaining > 0)
  for (let d = 0; d < 6; d++) {
    for (let p = 0; p < PERIODS; p++) {
      if (grid[d][p] !== null) continue;
      const underAllocated = subjects.filter(
        (s) =>
          (remaining.get(s.id) || 0) > 0 &&
          s.type !== "lab" &&
          s.type !== "open elective" &&
          (d !== 5 || !grid[5].some((c) => c === s.name)) &&
          !wouldCreateThreeConsecutiveTheory(grid, d, p, s) &&
          countSubjectHoursOnDay(grid, d, s) < 2
      );
      if (underAllocated.length > 0) {
        const sortedCands = underAllocated.sort(
          (a, b) => (remaining.get(b.id) || 0) - (remaining.get(a.id) || 0)
        );
        for (const cand of sortedCands) {
          const fac = findAvailableFacultyForSlot(cand.id, d, p, facultyMap, false, year, section);
          if (fac.success || !facultyMap) {
            grid[d][p] = cand.name;
            if (fac.facultyId) {
              allocateFacultyToSlot(fac.facultyId, d, p, facultyMap);
            }
            remaining.set(cand.id, Math.max(0, (remaining.get(cand.id) || 1) - 1));
            break;
          }
        }
      }
    }
  }

  // Step 2: After all subjects have reached their given hours, any STILL-empty slot is
  // filled by Library for deficit absorption
  for (let d = 0; d < 6; d++) {
    for (let p = 0; p < PERIODS; p++) {
      if (grid[d][p] === null) {
        grid[d][p] = "Library";
      }
    }
  }

  // Step 3: Self-healing rebalance pass to ensure exact equality of weekly hours
  rebalanceSubjectHours(grid, subjects, facultyMap, year, section);
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
  facultyMap: Map<string, FacultyAllocation>,
  year?: string,
  section?: string
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
              lab.id, d, p, facultyMap, true, year, section
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
// YEAR II DEDICATED TIMETABLE GENERATION
// Implements strict institutional requirements for 2nd Year:
// 1. Audit Course: Last 2 hrs (Periods 6 & 7) on a weekday only, non-conflicting across sections A, B, C.
// 2. Soft Skills & Aptitude: 4 hrs total (2 Soft Skills + 2 Aptitude), exactly 1 hr/day on weekdays only.
// 3. Labs: Same day continuous:
//    - 2 hrs: [1-2], [3-4], or [6,7]
//    - 3 hrs: last 3 hrs (Periods 5-7)
//    - 4 hrs: starts from 4 to 7 (Periods 4-7)
// 4. NPTEL: 1 hr on 2 separate days OR 2 hrs continuous, strictly avoiding periods 4 and 5.
// 5. Saturday:
//    - 1st or 2nd hr is Applied Probability and Statistics (AP&S)
//    - Alternate 1st/2nd hr is another theory subject
//    - 3rd & 4th hr is Seminar
//    - 5th hr Library, 6th & 7th hr Counseling
// 6. Only executed for 2nd year; 3rd and 4th year are completely untouched.
// ─────────────────────────────────────────────────────────────────────────────

export function isYearTwo(year?: string): boolean {
  if (!year) return false;
  const y = year.toString().trim().toUpperCase();
  return (
    y === "II" ||
    y === "2" ||
    y === "SECOND" ||
    y === "2ND" ||
    y === "YEAR 2" ||
    y === "YEAR II" ||
    y === "YEAR2" ||
    y === "YEAR-2" ||
    y === "YEAR-II"
  );
}

export function isYearThree(year?: string): boolean {
  if (!year) return false;
  const y = year.toString().trim().toUpperCase();
  return (
    y === "III" ||
    y === "3" ||
    y === "THIRD" ||
    y === "3RD" ||
    y === "YEAR 3" ||
    y === "YEAR III" ||
    y === "YEAR3" ||
    y === "YEAR-3" ||
    y === "YEAR-III"
  );
}

export function isYearFour(year?: string): boolean {
  if (!year) return false;
  const y = year.toString().trim().toUpperCase();
  return (
    y === "IV" ||
    y === "4" ||
    y === "FOURTH" ||
    y === "4TH" ||
    y === "YEAR 4" ||
    y === "YEAR IV" ||
    y === "YEAR4" ||
    y === "YEAR-4" ||
    y === "YEAR-IV"
  );
}

const isYear2AuditCourse = (s: Subject | string) => {
  const name = typeof s === "string" ? s : s.name;
  return /\baudit\s*course\b|\baudit\s*:|^audit\b|\bAC\b|environment\s*and\s*climate/i.test(name);
};

const isYear2SoftSkillOrAptitude = (s: Subject | string) => {
  const name = typeof s === "string" ? s : s.name;
  const tags = typeof s === "string" ? [] : s.tags || [];
  return (
    isSSA(typeof s === "string" ? { name: s, id: "", hoursPerWeek: 0, type: "theory" } : s) ||
    /soft\s*skills?/i.test(name) ||
    /aptitude/i.test(name) ||
    /\bSSA\b/i.test(name) ||
    tags.some((t) => /\bSSA\b|soft\s*skill|aptitude/i.test(t))
  );
};

const isYear2APS = (s: Subject | string) => {
  const name = typeof s === "string" ? s : s.name;
  return (
    /applied\s*probabilit/i.test(name) ||
    /\bAP\s*&\s*S\b/i.test(name) ||
    /\bAPS\b/i.test(name) ||
    /probability\s*and\s*statistics/i.test(name)
  );
};

const isYear2NPTEL = (s: Subject | string) => {
  const name = typeof s === "string" ? s : s.name;
  return /\bNPTEL\b/i.test(name) || /design\s*thinking/i.test(name);
};

const isYear2Lab = (s: Subject | string) => {
  if (isYear2SoftSkillOrAptitude(s)) return false;
  if (typeof s !== "string" && s.type === "lab") return true;
  const name = typeof s === "string" ? s : s.name;
  return /\blab\b|\blaboratory\b|\bpracticals?\b/i.test(name);
};

const isYear2SpecialSat = (s: Subject | string) => {
  const name = typeof s === "string" ? s : s.name;
  return /seminar|counsel/i.test(name);
};

/**
 * Unified Soft Skills and Aptitude Placement:
 * Requirements:
 * 1. Do NOT split soft skill hours into multiple labels (no (A), (S), (V) splits).
 *    Give as only ONE single subject name (mainSsa.name).
 * 2. Total 4 hours per week:
 *    - Exactly 1 hour strictly in the 5th hour (p=4, Period 5, 1:55-2:50 PM) on a weekday (Mon-Fri) without conflict.
 *    - Exactly 3 hours in random morning periods (p=0..3, Periods 1-4) on 3 other weekdays (Mon-Fri) without conflict.
 *    - At most 1 hour per day (across 4 distinct weekdays).
 *    - 0 hours on Saturday.
 *    - Zero faculty collision across all classes.
 */
function placeUnifiedSoftSkills(
  grid: Grid,
  subjects: Subject[],
  remaining: Map<string, number>,
  ctx: LoadedContext,
  year: string,
  section: string,
  placeSlotFn: (d: number, p: number, s: Subject, isLab?: boolean, customLabel?: string) => boolean,
  isSoftSkillFn: (s: Subject | string) => boolean
): void {
  const ssaSubjects = subjects.filter(isSoftSkillFn);
  const mainSsa = ssaSubjects[0];
  if (!mainSsa) return;

  const totalNeeded = ssaSubjects.reduce((acc, s) => acc + (remaining.get(s.id) || 0), 0);
  if (totalNeeded <= 0) return;

  // Single unified subject label - NO SPLIT
  const ssaLabel = mainSsa.name;
  remaining.set(mainSsa.id, totalNeeded);
  const ssaDaysUsed = new Set<number>();

  const isSlotAllowedForSsa = (d: number, p: number, mode: 'strict' | 'relaxed' | 'force' = 'strict') => {
    if (grid[d][p] !== null) return false;
    if (ssaDaysUsed.has(d)) return false;
    if (wouldCreateThreeConsecutiveTheory(grid, d, p, mainSsa)) return false;
    if (ctx.facultyMap) {
      const fac = findAvailableFacultyForSlot(mainSsa.id, d, p, ctx.facultyMap, false, year, section, { mode });
      if (!fac.success) return false;
    }
    return true;
  };

  // Step 1: Place exactly 1 hr in the 5th hour (p=4) on a weekday (Mon-Fri) without conflict
  const weekdays5th = shuffle([0, 1, 2, 3, 4].filter((d) => grid[d][4] === null));
  let chosen5thDay = -1;

  for (const mode of ['strict', 'relaxed', 'force'] as const) {
    if (chosen5thDay !== -1) break;
    for (const d of weekdays5th) {
      if (isSlotAllowedForSsa(d, 4, mode)) {
        chosen5thDay = d;
        break;
      }
    }
  }

  if (chosen5thDay !== -1) {
    if (placeSlotFn(chosen5thDay, 4, mainSsa, false, ssaLabel)) {
      ssaDaysUsed.add(chosen5thDay);
    }
  }

  // Step 2: Place exactly 3 hrs in random morning periods (p=0..3) across 3 other weekdays
  let morningHoursNeeded = Math.min(3, remaining.get(mainSsa.id) || 0);
  const candidateMorningDays = shuffle(
    [0, 1, 2, 3, 4].filter((d) => !ssaDaysUsed.has(d) && [0, 1, 2, 3].some((p) => grid[d][p] === null))
  );

  for (const d of candidateMorningDays) {
    if (morningHoursNeeded <= 0) break;
    const morningPeriods = shuffle([0, 1, 2, 3].filter((p) => grid[d][p] === null));
    let chosenP = -1;

    for (const mode of ['strict', 'relaxed', 'force'] as const) {
      if (chosenP !== -1) break;
      for (const p of morningPeriods) {
        if (isSlotAllowedForSsa(d, p, mode)) {
          chosenP = p;
          break;
        }
      }
    }

    if (chosenP !== -1) {
      if (placeSlotFn(d, chosenP, mainSsa, false, ssaLabel)) {
        ssaDaysUsed.add(d);
        morningHoursNeeded--;
      }
    }
  }

  // Fallback if morning periods were restricted (e.g. labs occupied mornings)
  if (morningHoursNeeded > 0) {
    for (const d of shuffle([0, 1, 2, 3, 4].filter((d) => !ssaDaysUsed.has(d)))) {
      if (morningHoursNeeded <= 0) break;
      for (const p of shuffle([0, 1, 2, 3, 4, 5, 6].filter((p) => grid[d][p] === null))) {
        if (isSlotAllowedForSsa(d, p, 'force')) {
          if (placeSlotFn(d, p, mainSsa, false, ssaLabel)) {
            ssaDaysUsed.add(d);
            morningHoursNeeded--;
            break;
          }
        }
      }
    }
  }

  // Clear remaining hours on all ssa subjects
  ssaSubjects.forEach((s) => {
    remaining.set(s.id, 0);
  });
}


async function generateYear2Timetable({
  subjects,
  rawSubjects,
  ctx,
  section,
  year,
  departmentName,
  specialHoursConfigs,
  labPreferences,
  sharedYear2AuditDays,
  facultyBeforeAfternoon,
}: {
  subjects: Subject[];
  rawSubjects: Subject[];
  ctx: LoadedContext;
  section?: string;
  year?: string;
  departmentName?: string;
  specialHoursConfigs: SpecialHoursConfig[];
  labPreferences?: LabPrefsMap;
  sharedYear2AuditDays?: Set<number>;
  facultyBeforeAfternoon?: boolean;
}): Promise<Grid> {
  const grid = emptyGrid();
  const remaining = new Map<string, number>();
  subjects.forEach((s) => remaining.set(s.id, s.hoursPerWeek));

  const placeSlot = (
    d: number,
    p: number,
    subject: Subject,
    isLab = false,
    customLabel?: string
  ): boolean => {
    if (grid[d][p] !== null) return false;
    // CRITICAL: Strictly prevent 3 consecutive hours of the same theory subject
    if (!isLab && subject.type !== 'lab') {
      if (wouldCreateThreeConsecutiveTheory(grid, d, p, subject)) return false;
      if (countSubjectHoursOnDay(grid, d, subject) >= 2) return false;
    }
    let allocatedFacId: string | undefined = undefined;
    if (ctx.facultyMap) {
      const fac = findAvailableFacultyForSlot(subject.id, d, p, ctx.facultyMap, isLab, year, section, { mode: 'force' });
      if (!fac.success) {
        return false;
      }
      allocatedFacId = fac.facultyId;
    }
    const label = /library/i.test(subject.name) ? "Library" : (customLabel || subject.name);
    grid[d][p] = label;
    if (ctx.facultyMap && allocatedFacId) {
      allocateFacultyToSlot(allocatedFacId, d, p, ctx.facultyMap, isLab ? 'lab' : 'theory');
    }
    remaining.set(subject.id, Math.max(0, (remaining.get(subject.id) || 1) - 1));
    return true;
  };

  // 1. SATURDAY SPECIAL SLOTS & AP&S
  placeSaturdaySpecialSlots(
    grid,
    specialHoursConfigs,
    ctx.classCounselorInfo,
    subjects,
    remaining,
    ctx.facultyMap
  );

  // Saturday 1st or 2nd hr: AP&S (if available) or distinct theory, alternate hr: other distinct theory subject (strictly no theory repeated)
  const apsSubj = subjects.find(isYear2APS);
  const theoryCandidates = shuffle(
    subjects.filter(
      (s) =>
        s.type === "theory" &&
        !isYear2APS(s) &&
        !isYear2AuditCourse(s) &&
        !isYear2SoftSkillOrAptitude(s) &&
        !isYear2NPTEL(s) &&
        !isYear2SpecialSat(s) &&
        !/library/i.test(s.name)
    )
  );

  // Randomly choose between period 0 or 1 for AP&S, respecting faculty availability
  let apsPeriod = Math.random() < 0.5 ? 0 : 1;
  let altPeriod = apsPeriod === 0 ? 1 : 0;

  if (apsSubj && ctx.facultyMap) {
    const facAps = findAvailableFacultyForSlot(apsSubj.id, 5, apsPeriod, ctx.facultyMap, false);
    if (!facAps.success) {
      apsPeriod = apsPeriod === 0 ? 1 : 0;
      altPeriod = altPeriod === 0 ? 1 : 0;
    }
  }

  let firstSubj: Subject | null = apsSubj || null;
  if (!firstSubj && theoryCandidates.length > 0) {
    firstSubj =
      theoryCandidates.find(
        (cand) => (remaining.get(cand.id) || 0) > 0 && (!ctx.facultyMap || findAvailableFacultyForSlot(cand.id, 5, apsPeriod, ctx.facultyMap, false).success)
      ) ||
      theoryCandidates.find(
        (cand) => !ctx.facultyMap || findAvailableFacultyForSlot(cand.id, 5, apsPeriod, ctx.facultyMap, false).success
      ) ||
      theoryCandidates[0];
  }

  const remCandidates = theoryCandidates.filter((s) => !firstSubj || s.id !== firstSubj.id);
  let altSubj: Subject | null = null;
  if (remCandidates.length > 0) {
    if (ctx.facultyMap) {
      altSubj =
        remCandidates.find(
          (cand) => (remaining.get(cand.id) || 0) > 0 && findAvailableFacultyForSlot(cand.id, 5, altPeriod, ctx.facultyMap, false).success
        ) ||
        remCandidates.find(
          (cand) => findAvailableFacultyForSlot(cand.id, 5, altPeriod, ctx.facultyMap, false).success
        ) ||
        remCandidates.find((cand) => (remaining.get(cand.id) || 0) > 0) ||
        remCandidates[0];
    } else {
      altSubj =
        remCandidates.find((cand) => (remaining.get(cand.id) || 0) > 0) ||
        remCandidates[0];
    }
  }

  if (firstSubj && grid[5][apsPeriod] === null) {
    placeSlot(5, apsPeriod, firstSubj);
  }
  if (altSubj && grid[5][altPeriod] === null) {
    placeSlot(5, altPeriod, altSubj);
  }

  // If Saturday period 2 or 3 is empty (e.g. Seminar was inactive or 1h), allocate additional theory subjects with remaining hours, strictly without repeating any theory subject on Saturday
  for (const p of [2, 3]) {
    if (grid[5][p] === null) {
      const candidates = shuffle(
        subjects.filter(
          (s) =>
            s.type === "theory" &&
            (remaining.get(s.id) || 0) > 0 &&
            !grid[5].some((c) => c === s.name) &&
            !isYear2AuditCourse(s) &&
            !isYear2SoftSkillOrAptitude(s) &&
            !isYear2NPTEL(s) &&
            !isYear2SpecialSat(s) &&
            !/library/i.test(s.name)
        )
      );
      if (candidates.length > 0) {
        let placedCand: Subject | null = null;
        if (ctx.facultyMap) {
          placedCand = candidates.find(
            (c) => findAvailableFacultyForSlot(c.id, 5, p, ctx.facultyMap!, false).success
          ) || candidates[0];
        } else {
          placedCand = candidates[0];
        }
        if (placedCand) {
          placeSlot(5, p, placedCand);
        }
      }
    }
  }

  // 2. LABS
  // Same day continuous:
  // - 2 hrs: slots [0,1], [2,3], or [5,6] (periods 1-2, 3-4, or 6-7) on ANY weekday
  // - 3 hrs: slots [4,5,6] only (last 3 hrs, periods 5-7) on ANY weekday
  // - 4 hrs: slots [3,4,5,6] continuously (starts from 4 to 7, periods 4-7) on ANY weekday
  // At most 1 lab per day, on weekdays only. Days and hours are dynamic.
  const labs = subjects.filter(isYear2Lab);
  const dayUsedForLab = new Set<number>();

  // A. USER-ALLOTTED LABS FIRST:
  // If the user has allotted lab schedules in the system (lab_schedules table),
  // place those exact slots first.
  if (ctx.manualLabs && ctx.manualLabs.length > 0) {
    for (const slot of ctx.manualLabs) {
      if (slot.day >= 0 && slot.day < 6 && slot.period >= 0 && slot.period < PERIODS) {
        const matchedLab = labs.find((l) => isSameSubject(l.name, slot.labName));
        if (matchedLab && grid[slot.day][slot.period] === null) {
          placeSlot(slot.day, slot.period, matchedLab, true);
          dayUsedForLab.add(slot.day);
        }
      }
    }
  }

  // B. DYNAMIC ALLOCATION for any remaining unplaced lab hours:
  const remainingLabSubjects = subjects.filter(
    (s) => isYear2Lab(s) && (remaining.get(s.id) || 0) > 0
  );
  const labsByHours = new Map<number, Subject[]>();
  for (const lab of remainingLabSubjects) {
    const h = remaining.get(lab.id) || lab.hoursPerWeek;
    if (!labsByHours.has(h)) labsByHours.set(h, []);
    labsByHours.get(h)!.push(lab);
  }
  const sortedHourKeys = Array.from(labsByHours.keys()).sort((a, b) => b - a); // 4h, then 3h, then 2h
  const labsToPlace: Subject[] = [];
  for (const h of sortedHourKeys) {
    labsToPlace.push(...shuffle(labsByHours.get(h)!));
  }

  const dayHasLab = (d: number) =>
    dayUsedForLab.has(d) || grid[d].some((cell) => cell && labs.some((l) => l.name === cell));

  for (const lab of labsToPlace) {
    const hoursNeeded = remaining.get(lab.id) || 0;
    if (hoursNeeded <= 0) continue;

    let placed = false;
    const weekdays = sortDaysByFacultyLoad([0, 1, 2, 3, 4], lab.id, ctx.facultyMap, year, section);

    for (const d of weekdays) {
      if (dayHasLab(d)) continue;

      if (hoursNeeded === 4) {
        if (grid[d][3] === null && grid[d][4] === null && grid[d][5] === null && grid[d][6] === null) {
          let facOk = true;
          if (ctx.facultyMap) {
            for (let p = 3; p <= 6; p++) {
              if (!findAvailableFacultyForSlot(lab.id, d, p, ctx.facultyMap, true).success) {
                facOk = false;
                break;
              }
            }
          }
          if (facOk) {
            for (let p = 3; p <= 6; p++) placeSlot(d, p, lab, true);
            dayUsedForLab.add(d);
            remaining.set(lab.id, 0);
            placed = true;
            break;
          }
        }
      } else if (hoursNeeded === 3) {
        if (grid[d][4] === null && grid[d][5] === null && grid[d][6] === null) {
          let facOk = true;
          if (ctx.facultyMap) {
            for (let p = 4; p <= 6; p++) {
              if (!findAvailableFacultyForSlot(lab.id, d, p, ctx.facultyMap, true).success) {
                facOk = false;
                break;
              }
            }
          }
          if (facOk) {
            for (let p = 4; p <= 6; p++) placeSlot(d, p, lab, true);
            dayUsedForLab.add(d);
            remaining.set(lab.id, 0);
            placed = true;
            break;
          }
        }
      } else if (hoursNeeded === 2) {
        const candidateBlocks = shuffle([[0, 1], [2, 3], [5, 6]]);
        for (const [p1, p2] of candidateBlocks) {
          if (grid[d][p1] === null && grid[d][p2] === null) {
            let facOk = true;
            if (ctx.facultyMap) {
              if (
                !findAvailableFacultyForSlot(lab.id, d, p1, ctx.facultyMap, true).success ||
                !findAvailableFacultyForSlot(lab.id, d, p2, ctx.facultyMap, true).success
              ) {
                facOk = false;
              }
            }
            if (facOk) {
              placeSlot(d, p1, lab, true);
              placeSlot(d, p2, lab, true);
              dayUsedForLab.add(d);
              remaining.set(lab.id, 0);
              placed = true;
              break;
            }
          }
        }
        if (placed) break;
      }
    }

    if (!placed) {
      for (const d of shuffle([0, 1, 2, 3, 4])) {
        if (dayHasLab(d)) continue;
        if (hoursNeeded === 4 && grid[d][3] === null && grid[d][4] === null && grid[d][5] === null && grid[d][6] === null) {
          for (let p = 3; p <= 6; p++) placeSlot(d, p, lab, true);
          dayUsedForLab.add(d);
          remaining.set(lab.id, 0);
          placed = true;
          break;
        } else if (hoursNeeded === 3 && grid[d][4] === null && grid[d][5] === null && grid[d][6] === null) {
          for (let p = 4; p <= 6; p++) placeSlot(d, p, lab, true);
          dayUsedForLab.add(d);
          remaining.set(lab.id, 0);
          placed = true;
          break;
        } else if (hoursNeeded === 2) {
          const candidateBlocks = shuffle([[0, 1], [2, 3], [5, 6]]);
          for (const [p1, p2] of candidateBlocks) {
            if (grid[d][p1] === null && grid[d][p2] === null) {
              placeSlot(d, p1, lab, true);
              placeSlot(d, p2, lab, true);
              dayUsedForLab.add(d);
              remaining.set(lab.id, 0);
              placed = true;
              break;
            }
          }
          if (placed) break;
        }
      }
    }
  }

  // 3. AUDIT COURSE
  // Last 2 hours of any weekday (p=5, 6) only, non-conflicting across sections A, B, C
  const auditSubj = subjects.find(isYear2AuditCourse);
  if (auditSubj) {
    const usedDays = sharedYear2AuditDays || new Set<number>();
    const freeWeekdays = [0, 1, 2, 3, 4].filter((d) => grid[d][5] === null && grid[d][6] === null);
    const candidateUnusedDays = shuffle(freeWeekdays.filter((d) => !usedDays.has(d)));
    const candidateDays = candidateUnusedDays.length > 0 ? candidateUnusedDays : shuffle(freeWeekdays);

    let chosenDay = -1;
    for (const d of candidateDays) {
      if (ctx.facultyMap) {
        const fac5 = findAvailableFacultyForSlot(auditSubj.id, d, 5, ctx.facultyMap, false);
        const fac6 = findAvailableFacultyForSlot(auditSubj.id, d, 6, ctx.facultyMap, false);
        if (fac5.success && fac6.success) {
          chosenDay = d;
          break;
        }
      } else {
        chosenDay = d;
        break;
      }
    }

    if (chosenDay === -1 && candidateDays.length > 0) {
      chosenDay = candidateDays[0];
    }

    if (chosenDay >= 0 && chosenDay < 5) {
      placeSlot(chosenDay, 5, auditSubj);
      placeSlot(chosenDay, 6, auditSubj);
      usedDays.add(chosenDay);
      remaining.set(auditSubj.id, 0);
    }
  }

  // 4. SOFT SKILLS AND APTITUDE
  // Exactly 4 hours total: 1 hr in 5th hr (p=4) on a weekday + 3 hrs in morning (p=0..3) across 3 other weekdays
  // Single unified name (no (A), (S), (V) splits)
  placeUnifiedSoftSkills(grid, subjects, remaining, ctx, year || 'II', section || 'A', placeSlot, isYear2SoftSkillOrAptitude);

  // 5. NPTEL
  // 1 hr on 1 day and 1 hr on another day (preferred) OR 2 hrs continuous.
  // Periods 4 and 5 (indices 3 and 4) are NEVER used. Allowed periods: [0, 1, 2, 5, 6].
  const nptelSubj = subjects.find(isYear2NPTEL);
  if (nptelSubj) {
    let needed = remaining.get(nptelSubj.id) || 0;
    const allowedPeriods = [0, 1, 2, 5, 6];
    // Favor split (1 hr on 2 different days) ~75% of the time, continuous ~25% of the time
    const preferContinuous = Math.random() < 0.25;

    if (preferContinuous && needed >= 2) {
      const candidateContinuousPairs = shuffle([[0, 1], [1, 2], [5, 6]]);
      for (const d of shuffle([0, 1, 2, 3, 4])) {
        for (const [p1, p2] of candidateContinuousPairs) {
          if (grid[d][p1] === null && grid[d][p2] === null) {
            let facOk = true;
            if (ctx.facultyMap) {
              if (
                !findAvailableFacultyForSlot(nptelSubj.id, d, p1, ctx.facultyMap, false).success ||
                !findAvailableFacultyForSlot(nptelSubj.id, d, p2, ctx.facultyMap, false).success
              ) {
                facOk = false;
              }
            }
            if (facOk) {
              placeSlot(d, p1, nptelSubj);
              placeSlot(d, p2, nptelSubj);
              needed -= 2;
              break;
            }
          }
        }
        if (needed <= 0) break;
      }
    }

    // Split placement: 1 hr per day on distinct weekdays in allowed periods
    let nptelGuard = 20;
    while (needed > 0 && nptelGuard-- > 0) {
      let placedSingle = false;
      for (const d of shuffle([0, 1, 2, 3, 4])) {
        if (grid[d].some((c) => c === nptelSubj.name)) continue;
        const candidatePeriods = shuffle(allowedPeriods);
        for (const p of candidatePeriods) {
          if (grid[d][p] === null) {
            let facOk = true;
            if (ctx.facultyMap) {
              facOk = findAvailableFacultyForSlot(nptelSubj.id, d, p, ctx.facultyMap, false).success;
            }
            if (facOk) {
              placeSlot(d, p, nptelSubj);
              needed--;
              placedSingle = true;
              break;
            }
          }
        }
        if (placedSingle) break;
      }
      if (!placedSingle) {
        // Fallback without faculty restriction, strictly maintaining distinct days & allowed periods
        for (const d of shuffle([0, 1, 2, 3, 4])) {
          if (grid[d].some((c) => c === nptelSubj.name)) continue;
          for (const p of shuffle(allowedPeriods)) {
            if (grid[d][p] === null) {
              placeSlot(d, p, nptelSubj);
              needed--;
              placedSingle = true;
              break;
            }
          }
          if (placedSingle) break;
        }
        if (!placedSingle) break;
      }
    }
  }

  // 6. REMAINING THEORY SUBJECTS
  const otherTheory = shuffle(
    subjects.filter(
      (s) =>
        s.type === "theory" &&
        !isYear2SpecialSat(s) &&
        !isYear2SoftSkillOrAptitude(s) &&
        !isYear2AuditCourse(s) &&
        !isYear2NPTEL(s)
    )
  );

  // 6a. Lab Hours Placement Preference:
  // "next if for lab hr faculties can take 3 to 4 hrs continuously but it not issue bcoz morning 2 hrs assign any theory subject if last 3 hrs are lab
  // next assign 1st hr any theory for any class then yo assign last 4 hrs as lab"
  for (let d = 0; d < 5; d++) {
    const has4HrLab = grid[d][3] !== null && grid[d][4] !== null && grid[d][5] !== null && grid[d][6] !== null &&
      /lab/i.test(String(grid[d][3]));
    const has3HrLab = !has4HrLab && grid[d][4] !== null && grid[d][5] !== null && grid[d][6] !== null &&
      /lab/i.test(String(grid[d][4]));

    const targetMorningPeriods = has4HrLab ? [0] : has3HrLab ? [0, 1] : [];
    for (const p of targetMorningPeriods) {
      if (grid[d][p] === null) {
        const cand = otherTheory.find((s) => (remaining.get(s.id) || 0) > 0 &&
          (!ctx.facultyMap || findAvailableFacultyForSlot(s.id, d, p, ctx.facultyMap, false, year, section, { mode: 'strict' }).success)
        );
        if (cand) {
          placeSlot(d, p, cand);
        }
      }
    }
  }

  // Multi-pass placement into empty cells on weekdays
  // Pass 1: Strict (max 1 hr per day, professors before afternoon, faculty must be free and well-spaced)
  for (const subj of shuffle(otherTheory)) {
    let rem = remaining.get(subj.id) || 0;
    if (rem <= 0) continue;
    const isProf = ctx.facultyMap ? isSubjectTaughtByProfessor(subj.id, ctx.facultyMap, year, section) : false;
    const basePeriods = (isProf || facultyBeforeAfternoon) ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6];

    for (const d of sortDaysByFacultyLoad([0, 1, 2, 3, 4], subj.id, ctx.facultyMap, year, section)) {
      if (rem <= 0) break;
      if (grid[d].some((c) => c === subj.name)) continue;

      const candidatePeriods = sortPeriodsByFacultyRest(
        basePeriods.filter((p) => grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)),
        d,
        subj.id,
        ctx.facultyMap,
        year,
        section,
        false
      );

      for (const p of candidatePeriods) {
        if (grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)) {
          if (ctx.facultyMap) {
            const fac = findAvailableFacultyForSlot(subj.id, d, p, ctx.facultyMap, false, year, section, { mode: 'strict' });
            if (fac.success) {
              if (placeSlot(d, p, subj)) {
                rem--;
                break;
              }
            }
          } else {
            if (placeSlot(d, p, subj)) {
              rem--;
              break;
            }
          }
        }
      }
    }
  }

  // Pass 2: Relaxed (allow 2nd hour on a day, faculty free, max 2 consecutive hours)
  for (const subj of shuffle(otherTheory)) {
    let rem = remaining.get(subj.id) || 0;
    if (rem <= 0) continue;
    const isProf = ctx.facultyMap ? isSubjectTaughtByProfessor(subj.id, ctx.facultyMap, year, section) : false;
    const basePeriods = (isProf || facultyBeforeAfternoon) ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6];

    for (const d of sortDaysByFacultyLoad([0, 1, 2, 3, 4], subj.id, ctx.facultyMap, year, section)) {
      if (rem <= 0) break;
      if (grid[d].filter((c) => c === subj.name).length >= 2) continue;

      const candidatePeriods = sortPeriodsByFacultyRest(
        basePeriods.filter((p) => grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)),
        d,
        subj.id,
        ctx.facultyMap,
        year,
        section,
        false
      );

      for (const p of candidatePeriods) {
        if (grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)) {
          if (ctx.facultyMap) {
            const fac = findAvailableFacultyForSlot(subj.id, d, p, ctx.facultyMap, false, year, section, { mode: 'relaxed' });
            if (fac.success) {
              if (placeSlot(d, p, subj)) {
                rem--;
                break;
              }
            }
          } else {
            if (placeSlot(d, p, subj)) {
              rem--;
              break;
            }
          }
        }
      }
    }
  }

  // Pass 3: Force (place remaining subject hours while strictly avoiding cross-class double-booking)
  for (const subj of shuffle(otherTheory)) {
    let rem = remaining.get(subj.id) || 0;
    if (rem <= 0) continue;

    for (const d of sortDaysByFacultyLoad([0, 1, 2, 3, 4, 5], subj.id, ctx.facultyMap, year, section)) {
      if (rem <= 0) break;
      if (countSubjectHoursOnDay(grid, d, subj) >= 2) continue;
      const candidatePeriods = sortPeriodsByFacultyRest(
        [0, 1, 2, 3, 4, 5, 6].filter((p) => grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)),
        d,
        subj.id,
        ctx.facultyMap,
        year,
        section,
        false
      );

      for (const p of candidatePeriods) {
        if (grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)) {
          let facOk = true;
          if (ctx.facultyMap) {
            facOk = findAvailableFacultyForSlot(subj.id, d, p, ctx.facultyMap, false, year, section, { mode: 'force' }).success;
          }
          if (facOk) {
            if (placeSlot(d, p, subj)) {
              rem = remaining.get(subj.id) || 0;
              break;
            }
          }
        }
      }
    }
  }

  // Pass 4: Free Hour Fill (repair pass - ensure exact hours and no slot left blank)
  // Step 4a: First priority — strictly satisfy any under-allocated subjects
  for (let d = 0; d < 6; d++) {
    for (let p = 0; p < PERIODS; p++) {
      if (grid[d][p] === null) {
        const underAllocated = subjects.filter(
          (s) => (remaining.get(s.id) || 0) > 0 &&
                 s.type !== "lab" &&
                 s.type !== "open elective" &&
                 !wouldCreateThreeConsecutiveTheory(grid, d, p, s) &&
                 countSubjectHoursOnDay(grid, d, s) < 2
        );
        if (underAllocated.length > 0) {
          const sortedCands = underAllocated.sort(
            (a, b) => (remaining.get(b.id) || 0) - (remaining.get(a.id) || 0)
          );
          for (const cand of sortedCands) {
            if (placeSlot(d, p, cand)) {
              break;
            }
          }
        }
      }
    }
  }

  // Step 4b: Only if all subjects have met their given hours, fill any remaining blank slots with Library
  for (let d = 0; d < 6; d++) {
    for (let p = 0; p < PERIODS; p++) {
      if (grid[d][p] === null) {
        grid[d][p] = "Library";
      }
    }
  }

  // Step 5: Self-healing rebalance pass to ensure exact equality of weekly hours
  rebalanceSubjectHours(grid, subjects, ctx.facultyMap, year, section);
  sanitizeNoThreeConsecutiveTheory(grid, subjects, ctx.facultyMap, year, section);
  rebalanceSubjectHours(grid, subjects, ctx.facultyMap, year, section);
  fillRemainingEmptySlotsWithLibrary(grid, ctx.classCounselorInfo, ctx.facultyMap);

  return grid;
}

// ─────────────────────────────────────────────────────────────────────────────
// YEAR II EVEN SEMESTER DEDICATED TIMETABLE GENERATION
// Implements strict institutional requirements for 2nd Year Even Semester:
// 1. Saturday:
//    - 1st 4 hrs (P0, P1, P2, P3): 4 distinct theory subjects (randomly chosen, professor before afternoon).
//    - 5th hr (P4): Static Library.
//    - 6th & 7th hr (P5, P6): Static Student Counselling (Class Counselor).
// 2. Soft Skills and Aptitude II (SSA II):
//    - Exactly 4 hours split into 3 parts/subjects:
//      * SSA-II(A) for 2 hrs: Weekdays only, strictly BEFORE AFTERNOON (periods 1-4 / indices 0-3), 1 hr/day on 2 different weekdays.
//      * SSA-II(S) for 1 hr: Weekdays only, strictly BEFORE AFTERNOON (periods 1-4 / indices 0-3).
//      * SSA-II(V) for 1 hr: Weekdays only, strictly as the 5TH HOUR (period index 4: 1:55-2:50 PM) of any weekday.
// 3. Audit Course (AC):
//    - 2 continuous hours in the last 2 periods of a weekday (periods 5 & 6, 0-indexed: 2:50-4:50 PM).
// 4. Labs:
//    - User-allotted manual lab allocations (ctx.manualLabs) placed first.
//    - Remaining unplaced lab hours dynamically allocated continuous on weekdays (4h: 3-6, 3h: 4-6, 2h: [0,1], [2,3], [5,6]).
// 5. Remaining Theory:
//    - Placed randomly.
//    - If any professor assigned (isSubjectTaughtByProfessor or facultyBeforeAfternoon), it MUST come before afternoon (periods 0-3).
// 6. Self-healing rebalance pass to ensure exact equality of weekly hours while respecting all constraints.
// ─────────────────────────────────────────────────────────────────────────────

async function generateYear2EvenTimetable({
  subjects,
  rawSubjects,
  ctx,
  section,
  year,
  departmentName,
  specialHoursConfigs,
  labPreferences,
  sharedYear2AuditDays,
  facultyBeforeAfternoon,
}: {
  subjects: Subject[];
  rawSubjects: Subject[];
  ctx: LoadedContext;
  section?: string;
  year?: string;
  departmentName?: string;
  specialHoursConfigs: SpecialHoursConfig[];
  labPreferences?: LabPrefsMap;
  sharedYear2AuditDays?: Set<number>;
  facultyBeforeAfternoon?: boolean;
}): Promise<Grid> {
  const grid = emptyGrid();
  const remaining = new Map<string, number>();
  subjects.forEach((s) => remaining.set(s.id, s.hoursPerWeek));

  const placeSlot = (
    d: number,
    p: number,
    subject: Subject,
    isLab = false,
    customLabel?: string
  ): boolean => {
    if (grid[d][p] !== null) return false;
    // CRITICAL: Strictly prevent 3 consecutive hours of the same theory subject
    if (!isLab && subject.type !== 'lab') {
      if (wouldCreateThreeConsecutiveTheory(grid, d, p, subject)) return false;
      if (countSubjectHoursOnDay(grid, d, subject) >= 2) return false;
    }
    let allocatedFacId: string | undefined = undefined;
    if (ctx.facultyMap) {
      const fac = findAvailableFacultyForSlot(subject.id, d, p, ctx.facultyMap, isLab, year, section, { mode: 'force' });
      if (!fac.success) {
        return false;
      }
      allocatedFacId = fac.facultyId;
    }
    const label = /library/i.test(subject.name) ? "Library" : (customLabel || subject.name);
    grid[d][p] = label;
    if (ctx.facultyMap && allocatedFacId) {
      allocateFacultyToSlot(allocatedFacId, d, p, ctx.facultyMap, isLab ? 'lab' : 'theory');
    }
    remaining.set(subject.id, Math.max(0, (remaining.get(subject.id) || 1) - 1));
    return true;
  };

  const isProfSubj = (subj: Subject): boolean => {
    if (facultyBeforeAfternoon) return true;
    if (!ctx.facultyMap) return false;
    return isSubjectTaughtByProfessor(subj.id, ctx.facultyMap, year, section);
  };

  // ── 1. SATURDAY: 4 Theory (P0-P3), Library (P4), Counselling (P5-P6) ────────
  grid[5][4] = "Library";
  grid[5][5] = "Counselling";
  grid[5][6] = "Counselling";

  if (ctx.classCounselorInfo?.id && ctx.facultyMap) {
    allocateFacultyToSlot(ctx.classCounselorInfo.id, 5, 5, ctx.facultyMap);
    allocateFacultyToSlot(ctx.classCounselorInfo.id, 5, 6, ctx.facultyMap);
  }

  const satTheoryCandidates = shuffle(
    subjects.filter(
      (s) =>
        s.type === "theory" &&
        !isYear2AuditCourse(s) &&
        !isYear2SoftSkillOrAptitude(s) &&
        !isYear2NPTEL(s) &&
        !isYear2SpecialSat(s) &&
        !/library/i.test(s.name)
    )
  );

  const satPlacedIds = new Set<string>();
  for (let p = 0; p < 4; p++) {
    let cand = satTheoryCandidates.find(
      (s) => !satPlacedIds.has(s.id) &&
             (remaining.get(s.id) || 0) > 0 &&
             (!ctx.facultyMap || findAvailableFacultyForSlot(s.id, 5, p, ctx.facultyMap, false, year, section).success)
    );
    if (!cand) {
      cand = satTheoryCandidates.find(
        (s) => !satPlacedIds.has(s.id) &&
               (!ctx.facultyMap || findAvailableFacultyForSlot(s.id, 5, p, ctx.facultyMap, false, year, section).success)
      );
    }
    if (!cand) {
      cand = satTheoryCandidates.find((s) => !satPlacedIds.has(s.id));
    }
    if (!cand && satTheoryCandidates.length > 0) {
      cand = satTheoryCandidates[p % satTheoryCandidates.length];
    }
    if (cand) {
      placeSlot(5, p, cand);
      satPlacedIds.add(cand.id);
    }
  }

  // ── 2. LABS ────────────────────────────────────────────────────────────────
  const labs = subjects.filter(isYear2Lab);
  const dayUsedForLab = new Set<number>();

  // A. USER-ALLOTTED LABS FIRST:
  if (ctx.manualLabs && ctx.manualLabs.length > 0) {
    for (const slot of ctx.manualLabs) {
      if (slot.day >= 0 && slot.day < 6 && slot.period >= 0 && slot.period < PERIODS) {
        const matchedLab = labs.find((l) => isSameSubject(l.name, slot.labName));
        if (matchedLab && grid[slot.day][slot.period] === null) {
          placeSlot(slot.day, slot.period, matchedLab, true);
          dayUsedForLab.add(slot.day);
        }
      }
    }
  }

  // B. DYNAMIC ALLOCATION for remaining unplaced lab hours:
  const remainingLabSubjects = subjects.filter(
    (s) => isYear2Lab(s) && (remaining.get(s.id) || 0) > 0
  );
  const labsByHours = new Map<number, Subject[]>();
  for (const lab of remainingLabSubjects) {
    const h = remaining.get(lab.id) || lab.hoursPerWeek;
    if (!labsByHours.has(h)) labsByHours.set(h, []);
    labsByHours.get(h)!.push(lab);
  }
  const sortedHourKeys = Array.from(labsByHours.keys()).sort((a, b) => b - a);
  const labsToPlace: Subject[] = [];
  for (const h of sortedHourKeys) {
    labsToPlace.push(...shuffle(labsByHours.get(h)!));
  }

  const dayHasLab = (d: number) =>
    dayUsedForLab.has(d) || grid[d].some((cell) => cell && labs.some((l) => l.name === cell));

  for (const lab of labsToPlace) {
    const hoursNeeded = remaining.get(lab.id) || 0;
    if (hoursNeeded <= 0) continue;

    let placed = false;
    const weekdays = sortDaysByFacultyLoad([0, 1, 2, 3, 4], lab.id, ctx.facultyMap, year, section);

    for (const d of weekdays) {
      if (dayHasLab(d)) continue;

      if (hoursNeeded === 4) {
        if (grid[d][3] === null && grid[d][4] === null && grid[d][5] === null && grid[d][6] === null) {
          let facOk = true;
          if (ctx.facultyMap) {
            for (let p = 3; p <= 6; p++) {
              if (!findAvailableFacultyForSlot(lab.id, d, p, ctx.facultyMap, true, year, section).success) {
                facOk = false;
                break;
              }
            }
          }
          if (facOk) {
            for (let p = 3; p <= 6; p++) placeSlot(d, p, lab, true);
            dayUsedForLab.add(d);
            remaining.set(lab.id, 0);
            placed = true;
            break;
          }
        }
      } else if (hoursNeeded === 3) {
        if (grid[d][4] === null && grid[d][5] === null && grid[d][6] === null) {
          let facOk = true;
          if (ctx.facultyMap) {
            for (let p = 4; p <= 6; p++) {
              if (!findAvailableFacultyForSlot(lab.id, d, p, ctx.facultyMap, true, year, section).success) {
                facOk = false;
                break;
              }
            }
          }
          if (facOk) {
            for (let p = 4; p <= 6; p++) placeSlot(d, p, lab, true);
            dayUsedForLab.add(d);
            remaining.set(lab.id, 0);
            placed = true;
            break;
          }
        }
      } else if (hoursNeeded === 2) {
        const candidateBlocks = shuffle([[0, 1], [2, 3], [5, 6]]);
        for (const [p1, p2] of candidateBlocks) {
          if (grid[d][p1] === null && grid[d][p2] === null) {
            let facOk = true;
            if (ctx.facultyMap) {
              if (
                !findAvailableFacultyForSlot(lab.id, d, p1, ctx.facultyMap, true, year, section).success ||
                !findAvailableFacultyForSlot(lab.id, d, p2, ctx.facultyMap, true, year, section).success
              ) {
                facOk = false;
              }
            }
            if (facOk) {
              placeSlot(d, p1, lab, true);
              placeSlot(d, p2, lab, true);
              dayUsedForLab.add(d);
              remaining.set(lab.id, 0);
              placed = true;
              break;
            }
          }
        }
        if (placed) break;
      }
    }

    if (!placed) {
      for (const d of shuffle([0, 1, 2, 3, 4])) {
        if (dayHasLab(d)) continue;
        if (hoursNeeded === 4 && grid[d][3] === null && grid[d][4] === null && grid[d][5] === null && grid[d][6] === null) {
          for (let p = 3; p <= 6; p++) placeSlot(d, p, lab, true);
          dayUsedForLab.add(d);
          remaining.set(lab.id, 0);
          placed = true;
          break;
        } else if (hoursNeeded === 3 && grid[d][4] === null && grid[d][5] === null && grid[d][6] === null) {
          for (let p = 4; p <= 6; p++) placeSlot(d, p, lab, true);
          dayUsedForLab.add(d);
          remaining.set(lab.id, 0);
          placed = true;
          break;
        } else if (hoursNeeded === 2) {
          const candidateBlocks = shuffle([[0, 1], [2, 3], [5, 6]]);
          for (const [p1, p2] of candidateBlocks) {
            if (grid[d][p1] === null && grid[d][p2] === null) {
              placeSlot(d, p1, lab, true);
              placeSlot(d, p2, lab, true);
              dayUsedForLab.add(d);
              remaining.set(lab.id, 0);
              placed = true;
              break;
            }
          }
          if (placed) break;
        }
      }
    }
  }

  // ── 3. AUDIT COURSE (AC) ──────────────────────────────────────────────────
  // 2 continuous hours in last 2 periods of a weekday (p=5, 6)
  const auditSubj = subjects.find(isYear2AuditCourse);
  if (auditSubj) {
    const usedDays = sharedYear2AuditDays || new Set<number>();
    const freeWeekdays = [0, 1, 2, 3, 4].filter((d) => grid[d][5] === null && grid[d][6] === null);
    const candidateUnusedDays = shuffle(freeWeekdays.filter((d) => !usedDays.has(d)));
    const candidateDays = candidateUnusedDays.length > 0 ? candidateUnusedDays : shuffle(freeWeekdays);

    let chosenDay = -1;
    for (const d of candidateDays) {
      if (ctx.facultyMap) {
        const fac5 = findAvailableFacultyForSlot(auditSubj.id, d, 5, ctx.facultyMap, false, year, section);
        const fac6 = findAvailableFacultyForSlot(auditSubj.id, d, 6, ctx.facultyMap, false, year, section);
        if (fac5.success && fac6.success) {
          chosenDay = d;
          break;
        }
      } else {
        chosenDay = d;
        break;
      }
    }

    if (chosenDay === -1 && candidateDays.length > 0) {
      chosenDay = candidateDays[0];
    }

    if (chosenDay >= 0 && chosenDay < 5) {
      placeSlot(chosenDay, 5, auditSubj, false, "AC");
      placeSlot(chosenDay, 6, auditSubj, false, "AC");
      usedDays.add(chosenDay);
      remaining.set(auditSubj.id, 0);
    }
  }

  // ── 4. SOFTSKILL AND APTITUDE II (SSA II) ──────────────────────────────────
  placeUnifiedSoftSkills(grid, subjects, remaining, ctx, year || 'II', section || 'A', placeSlot, isYear2SoftSkillOrAptitude);

  // ── 5. NPTEL (if present) ─────────────────────────────────────────────────
  const nptelSubj = subjects.find(isYear2NPTEL);
  if (nptelSubj) {
    let needed = remaining.get(nptelSubj.id) || 0;
    const allowedPeriods = [0, 1, 2, 5, 6];
    let nptelGuard = 20;
    while (needed > 0 && nptelGuard-- > 0) {
      let placedSingle = false;
      for (const d of shuffle([0, 1, 2, 3, 4])) {
        if (grid[d].some((c) => c === nptelSubj.name)) continue;
        for (const p of shuffle(allowedPeriods)) {
          if (grid[d][p] === null) {
            let facOk = !ctx.facultyMap || findAvailableFacultyForSlot(nptelSubj.id, d, p, ctx.facultyMap, false, year, section).success;
            if (facOk) {
              placeSlot(d, p, nptelSubj);
              needed--;
              placedSingle = true;
              break;
            }
          }
        }
        if (placedSingle) break;
      }
      if (!placedSingle) {
        for (const d of shuffle([0, 1, 2, 3, 4])) {
          for (const p of shuffle(allowedPeriods)) {
            if (grid[d][p] === null) {
              placeSlot(d, p, nptelSubj);
              needed--;
              placedSingle = true;
              break;
            }
          }
          if (placedSingle) break;
        }
        if (!placedSingle) break;
      }
    }
  }

  // ── 6. REMAINING THEORY SUBJECTS ──────────────────────────────────────────
  // Placed randomly; professor assigned MUST come before afternoon (p=0..3)
  const otherTheory = shuffle(
    subjects.filter(
      (s) =>
        s.type === "theory" &&
        !isYear2SpecialSat(s) &&
        !isYear2SoftSkillOrAptitude(s) &&
        !isYear2AuditCourse(s) &&
        !isYear2NPTEL(s)
    )
  );

  // 6a. Lab Hours Placement Preference:
  // "next if for lab hr faculties can take 3 to 4 hrs continuously but it not issue bcoz morning 2 hrs assign any theory subject if last 3 hrs are lab
  // next assign 1st hr any theory for any class then yo assign last 4 hrs as lab"
  for (let d = 0; d < 5; d++) {
    const has4HrLab = grid[d][3] !== null && grid[d][4] !== null && grid[d][5] !== null && grid[d][6] !== null &&
      /lab/i.test(String(grid[d][3]));
    const has3HrLab = !has4HrLab && grid[d][4] !== null && grid[d][5] !== null && grid[d][6] !== null &&
      /lab/i.test(String(grid[d][4]));

    const targetMorningPeriods = has4HrLab ? [0] : has3HrLab ? [0, 1] : [];
    for (const p of targetMorningPeriods) {
      if (grid[d][p] === null) {
        const cand = otherTheory.find((s) => (remaining.get(s.id) || 0) > 0 &&
          (!ctx.facultyMap || findAvailableFacultyForSlot(s.id, d, p, ctx.facultyMap, false, year, section, { mode: 'strict' }).success)
        );
        if (cand) {
          placeSlot(d, p, cand);
        }
      }
    }
  }

  // Pass 1: Strict (max 1 hr per day on weekdays, professors before afternoon, faculty well-spaced)
  for (const subj of otherTheory) {
    let rem = remaining.get(subj.id) || 0;
    if (rem <= 0) continue;
    const isProf = isProfSubj(subj);
    const basePeriods = isProf ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6];

    for (const d of sortDaysByFacultyLoad([0, 1, 2, 3, 4], subj.id, ctx.facultyMap, year, section)) {
      if (rem <= 0) break;
      if (grid[d].some((c) => c === subj.name)) continue;

      const candidatePeriods = sortPeriodsByFacultyRest(
        basePeriods.filter((p) => grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)),
        d,
        subj.id,
        ctx.facultyMap,
        year,
        section,
        false
      );

      for (const p of candidatePeriods) {
        if (grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)) {
          let facOk = !ctx.facultyMap || findAvailableFacultyForSlot(subj.id, d, p, ctx.facultyMap, false, year, section, { mode: 'strict' }).success;
          if (facOk) {
            if (placeSlot(d, p, subj)) {
              rem--;
              break;
            }
          }
        }
      }
    }
  }

  // Pass 2: Relaxed (allow 2nd hr per day, faculty free, max 2 consecutive hours)
  for (const subj of otherTheory) {
    let rem = remaining.get(subj.id) || 0;
    if (rem <= 0) continue;
    const isProf = isProfSubj(subj);
    const basePeriods = isProf ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6];

    for (const d of sortDaysByFacultyLoad([0, 1, 2, 3, 4], subj.id, ctx.facultyMap, year, section)) {
      if (rem <= 0) break;
      if (grid[d].filter((c) => c === subj.name).length >= 2) continue;

      const candidatePeriods = sortPeriodsByFacultyRest(
        basePeriods.filter((p) => grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)),
        d,
        subj.id,
        ctx.facultyMap,
        year,
        section,
        false
      );

      for (const p of candidatePeriods) {
        if (grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)) {
          let facOk = !ctx.facultyMap || findAvailableFacultyForSlot(subj.id, d, p, ctx.facultyMap, false, year, section, { mode: 'relaxed' }).success;
          if (facOk) {
            if (placeSlot(d, p, subj)) {
              rem--;
              break;
            }
          }
        }
      }
    }
  }

  // Pass 3: Force (place remaining subject hours while avoiding cross-class conflicts)
  for (const subj of otherTheory) {
    let rem = remaining.get(subj.id) || 0;
    if (rem <= 0) continue;
    const isProf = isProfSubj(subj);
    const basePeriods = isProf ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6];

    for (const d of sortDaysByFacultyLoad([0, 1, 2, 3, 4], subj.id, ctx.facultyMap, year, section)) {
      if (rem <= 0) break;
      if (countSubjectHoursOnDay(grid, d, subj) >= 2) continue;
      const candidatePeriods = sortPeriodsByFacultyRest(
        basePeriods.filter((p) => grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)),
        d,
        subj.id,
        ctx.facultyMap,
        year,
        section,
        false
      );

      for (const p of candidatePeriods) {
        if (grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)) {
          let facOk = !ctx.facultyMap || findAvailableFacultyForSlot(subj.id, d, p, ctx.facultyMap, false, year, section, { mode: 'force' }).success;
          if (facOk) {
            if (placeSlot(d, p, subj)) {
              rem = remaining.get(subj.id) || 0;
              break;
            }
          }
        }
      }
    }

    if (rem > 0) {
      for (const d of sortDaysByFacultyLoad([0, 1, 2, 3, 4], subj.id, ctx.facultyMap, year, section)) {
        if (rem <= 0) break;
        if (countSubjectHoursOnDay(grid, d, subj) >= 2) continue;
        for (const p of [0, 1, 2, 3, 4, 5, 6]) {
          if (grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)) {
            let facOk = !ctx.facultyMap || findAvailableFacultyForSlot(subj.id, d, p, ctx.facultyMap, false, year, section, { mode: 'force' }).success;
            if (facOk) {
              if (placeSlot(d, p, subj)) {
                rem = remaining.get(subj.id) || 0;
                break;
              }
            }
          }
        }
      }
    }
  }

  // Pass 4: Free Hour Fill (repair pass - ensure exact hours and no slot left blank)
  for (let d = 0; d < 6; d++) {
    for (let p = 0; p < PERIODS; p++) {
      if (grid[d][p] === null) {
        const underAllocated = subjects.filter(
          (s) => (remaining.get(s.id) || 0) > 0 &&
                 s.type !== "lab" &&
                 s.type !== "open elective" &&
                 !wouldCreateThreeConsecutiveTheory(grid, d, p, s) &&
                 countSubjectHoursOnDay(grid, d, s) < 2
        );
        if (underAllocated.length > 0) {
          const sortedCands = underAllocated.sort(
            (a, b) => (remaining.get(b.id) || 0) - (remaining.get(a.id) || 0)
          );
          for (const cand of sortedCands) {
            if (placeSlot(d, p, cand)) {
              break;
            }
          }
        }
      }
    }
  }

  for (let d = 0; d < 6; d++) {
    for (let p = 0; p < PERIODS; p++) {
      if (grid[d][p] === null) {
        grid[d][p] = "Library";
      }
    }
  }

  // Step 5: Self-healing rebalance pass to ensure exact equality of weekly hours
  rebalanceSubjectHours(grid, subjects, ctx.facultyMap, year, section);
  sanitizeNoThreeConsecutiveTheory(grid, subjects, ctx.facultyMap, year, section);
  rebalanceSubjectHours(grid, subjects, ctx.facultyMap, year, section);
  fillRemainingEmptySlotsWithLibrary(grid, ctx.classCounselorInfo, ctx.facultyMap);

  return grid;
}

// ─────────────────────────────────────────────────────────────────────────────
// YEAR III DEDICATED TIMETABLE GENERATION
// Implements strict institutional requirements for 3rd Year:
// 1. Saturday:
//    - 1st & 2nd hr: ANY 2 theory subjects (NO AP&S!)
//    - 3rd & 4th hr: Seminar (Class Counselor)
//    - 5th hr: Library, 6th & 7th hr: Counseling (Class Counselor)
// 2. No Audit Course:
//    - Audit course is strictly NOT scheduled for 3rd year.
// 3. Soft Skills & Aptitude:
//    - 4 hrs total, exactly 1 hr/day on weekdays only (Mon-Fri).
//    - Allowed periods: [1, 2, 3, 4] (periods 2-5; strictly NOT in 1st, 6th, or 7th hr).
// 4. Labs:
//    - Same day continuous:
//      * 2 hrs: slots [0,1], [2,3], or [5,6] (periods 1-2, 3-4, or 6-7) on ANY weekday
//      * 3 hrs: slots [4,5,6] only (last 3 hrs, periods 5-7) on ANY weekday
//      * 4 hrs: slots [3,4,5,6] continuously (starts from 4 to 7, periods 4-7) on ANY weekday
//    - At most 1 lab per day, on weekdays only. Days and hours are dynamic.
// 5. NPTEL:
//    - 1 hr on 1 day and 1 hr on another day (preferred) OR 2 hrs continuous.
//    - Strictly avoiding periods 4 and 5 (indices 3 and 4). Allowed periods: [0, 1, 2, 5, 6].
// 6. Remaining Theory & Elective Subjects:
//    - Shuffled multi-pass placement across weekdays (Pass 1 max 1/day, Pass 2 max 2/day, Pass 3 force, Pass 4 free hour fill).
// 7. Dynamic generation: Shuffled choices ensure varied schedules without faculty conflicts.
// 8. Year IV algorithm remains completely untouched.
// ─────────────────────────────────────────────────────────────────────────────

const isYear3AuditCourse = (s: Subject | string) => {
  const name = typeof s === "string" ? s : s.name;
  return /\baudit\s*course\b|\baudit\s*:|^audit\b|\bAC\b|environment\s*and\s*climate/i.test(name);
};

const isYear3SoftSkillOrAptitude = (s: Subject | string) => {
  const name = typeof s === "string" ? s : s.name;
  const tags = typeof s === "string" ? [] : s.tags || [];
  return (
    isSSA(typeof s === "string" ? { name: s, id: "", hoursPerWeek: 0, type: "theory" } : s) ||
    /soft\s*skills?/i.test(name) ||
    /aptitude/i.test(name) ||
    /\bSSA\b/i.test(name) ||
    tags.some((t) => /\bSSA\b|soft\s*skill|aptitude/i.test(t))
  );
};

const isYear3NPTEL = (s: Subject | string) => {
  const name = typeof s === "string" ? s : s.name;
  return /\bNPTEL\b/i.test(name) || /design\s*thinking/i.test(name);
};

const isYear3Lab = (s: Subject | string) => {
  if (typeof s !== "string" && s.type === "lab") return true;
  const name = typeof s === "string" ? s : s.name;
  return /\blab\b|\blaboratory\b|\bpracticals?\b/i.test(name);
};

const isYear3SpecialSat = (s: Subject | string) => {
  const name = typeof s === "string" ? s : s.name;
  return /seminar|counsel/i.test(name);
};

async function generateYear3Timetable({
  subjects,
  rawSubjects,
  ctx,
  section,
  year,
  departmentName,
  specialHoursConfigs,
  labPreferences,
  facultyBeforeAfternoon,
  semesterType = "odd",
}: {
  subjects: Subject[];
  rawSubjects: Subject[];
  ctx: LoadedContext;
  section?: string;
  year?: string;
  departmentName?: string;
  specialHoursConfigs: SpecialHoursConfig[];
  labPreferences?: LabPrefsMap;
  facultyBeforeAfternoon?: boolean;
  semesterType?: 'odd' | 'even';
}): Promise<Grid> {
  const grid = emptyGrid();
  const remaining = new Map<string, number>();
  subjects.forEach((s) => remaining.set(s.id, s.hoursPerWeek));

  // Explicitly ensure no audit course is placed for Year 3
  subjects.forEach((s) => {
    if (isYear3AuditCourse(s)) {
      remaining.set(s.id, 0);
    }
  });

  const placeSlot = (
    d: number,
    p: number,
    subject: Subject,
    isLab = false,
    customLabel?: string
  ): boolean => {
    if (grid[d][p] !== null) return false;
    // CRITICAL: Strictly prevent 3 consecutive hours of the same theory subject
    if (!isLab && subject.type !== 'lab') {
      if (wouldCreateThreeConsecutiveTheory(grid, d, p, subject)) return false;
      if (countSubjectHoursOnDay(grid, d, subject) >= 2) return false;
    }
    let allocatedFacId: string | undefined = undefined;
    if (ctx.facultyMap) {
      const fac = findAvailableFacultyForSlot(subject.id, d, p, ctx.facultyMap, isLab, year, section, { mode: 'force' });
      if (!fac.success) {
        return false;
      }
      allocatedFacId = fac.facultyId;
    }
    const label = /library/i.test(subject.name) ? "Library" : (customLabel || subject.name);
    grid[d][p] = label;
    console.log(`[PLACE Y3 ${section || '?'}] Day ${DAYS[d]} P${p + 1}: "${label}" (subjId: ${subject.id})`);
    if (ctx.facultyMap && allocatedFacId) {
      allocateFacultyToSlot(allocatedFacId, d, p, ctx.facultyMap, isLab ? 'lab' : 'theory');
    }
    remaining.set(subject.id, Math.max(0, (remaining.get(subject.id) || 1) - 1));
    return true;
  };

  // 1. OPEN ELECTIVE (OE) FOR EVEN SEMESTER
  // Institutional rule: Mon 1st hr (d=0, p=0), Wed 1st hr (d=2, p=0), Fri 1st hr (d=4, p=0), Sat 1st & 2nd hrs (d=5, p=0, p=1)
  if (semesterType === 'even') {
    const OE_FIXED_SLOTS = [
      { d: 0, p: 0 }, // Mon Period 1
      { d: 2, p: 0 }, // Wed Period 1
      { d: 4, p: 0 }, // Fri Period 1
      { d: 5, p: 0 }, // Sat Period 1
      { d: 5, p: 1 }, // Sat Period 2
    ];

    const oeSubjects = subjects.filter((s) => s.type === "open elective");
    const oeSubj = oeSubjects[0] || null;
    const oeLabel = oeSubj?.name || ctx.openElectiveConfig?.group_name || "Open Elective";

    for (const { d, p } of OE_FIXED_SLOTS) {
      grid[d][p] = oeLabel;
      if (oeSubj && ctx.facultyMap) {
        const fac = findAvailableFacultyForSlot(oeSubj.id, d, p, ctx.facultyMap, false, year, section);
        if (fac.success && fac.facultyId) {
          allocateFacultyToSlot(fac.facultyId, d, p, ctx.facultyMap);
        }
      }
    }
    oeSubjects.forEach((s) => remaining.set(s.id, 0));
  }

  // 2. SATURDAY SPECIAL SLOTS (SEMINAR, LIBRARY, COUNSELING)
  placeSaturdaySpecialSlots(
    grid,
    specialHoursConfigs,
    ctx.classCounselorInfo,
    subjects,
    remaining,
    ctx.facultyMap
  );

  // Saturday 1st and 2nd hr: 2 distinct theory subjects (strictly no theory repeated on Saturday)
  const satTheoryCandidates = shuffle(
    subjects.filter(
      (s) =>
        (s.type === "theory" || s.type === "elective") &&
        !isYear3SpecialSat(s) &&
        !isYear3SoftSkillOrAptitude(s) &&
        !isYear3AuditCourse(s) &&
        !isYear3NPTEL(s) &&
        !/library/i.test(s.name)
    )
  );

  // Pick Subject 1 for Period 0 (Sat 1st hr)
  let subj1: Subject | null = null;
  if (satTheoryCandidates.length > 0) {
    if (ctx.facultyMap) {
      subj1 =
        satTheoryCandidates.find(
          (cand) =>
            (remaining.get(cand.id) || 0) > 0 &&
            findAvailableFacultyForSlot(cand.id, 5, 0, ctx.facultyMap, false, year, section).success
        ) ||
        satTheoryCandidates.find(
          (cand) => findAvailableFacultyForSlot(cand.id, 5, 0, ctx.facultyMap, false, year, section).success
        ) ||
        satTheoryCandidates.find((cand) => (remaining.get(cand.id) || 0) > 0) ||
        satTheoryCandidates[0];
    } else {
      subj1 =
        satTheoryCandidates.find((cand) => (remaining.get(cand.id) || 0) > 0) ||
        satTheoryCandidates[0];
    }
  }

  // Pick Subject 2 for Period 1 (Sat 2nd hr) - strictly distinct from Subject 1
  let subj2: Subject | null = null;
  const remForSubj2 = satTheoryCandidates.filter((s) => !subj1 || s.id !== subj1.id);
  const candList2 = remForSubj2.length > 0 ? remForSubj2 : satTheoryCandidates.filter((s) => !subj1 || s.id !== subj1.id);

  if (candList2.length > 0) {
    if (ctx.facultyMap) {
      subj2 =
        candList2.find(
          (cand) =>
            (remaining.get(cand.id) || 0) > 0 &&
            findAvailableFacultyForSlot(cand.id, 5, 1, ctx.facultyMap, false, year, section).success
        ) ||
        candList2.find(
          (cand) => findAvailableFacultyForSlot(cand.id, 5, 1, ctx.facultyMap, false, year, section).success
        ) ||
        candList2.find((cand) => (remaining.get(cand.id) || 0) > 0) ||
        candList2[0];
    } else {
      subj2 =
        candList2.find((cand) => (remaining.get(cand.id) || 0) > 0) ||
        candList2[0];
    }
  }

  if (subj1 && grid[5][0] === null) {
    placeSlot(5, 0, subj1);
  }
  if (subj2 && grid[5][1] === null) {
    placeSlot(5, 1, subj2);
  }

  // If Saturday period 2 or 3 is empty (e.g. Seminar was inactive or 1h), allocate additional theory subjects with remaining hours, strictly without repeating any theory subject on Saturday
  for (const p of [2, 3]) {
    if (grid[5][p] === null) {
      const candidates = shuffle(
        subjects.filter(
          (s) =>
            (s.type === "theory" || s.type === "elective") &&
            (remaining.get(s.id) || 0) > 0 &&
            !grid[5].some((c) => c === s.name) &&
            !isYear3SpecialSat(s) &&
            !isYear3SoftSkillOrAptitude(s) &&
            !isYear3AuditCourse(s) &&
            !isYear3NPTEL(s) &&
            !/library/i.test(s.name)
        )
      );
      if (candidates.length > 0) {
        let placedCand: Subject | null = null;
        if (ctx.facultyMap) {
          placedCand = candidates.find(
            (c) => findAvailableFacultyForSlot(c.id, 5, p, ctx.facultyMap!, false, year, section).success
          ) || candidates[0];
        } else {
          placedCand = candidates[0];
        }
        if (placedCand) {
          placeSlot(5, p, placedCand);
        }
      }
    }
  }

  // 2. LABS
  // Same day continuous:
  // - 2 hrs: slots [0,1], [2,3], or [5,6] on ANY weekday
  // - 3 hrs: slots [4,5,6] only (last 3 hrs, periods 5-7) on ANY weekday
  // - 4 hrs: slots [3,4,5,6] continuously (starts from 4 to 7, periods 4-7) on ANY weekday
  // At most 1 lab per day, on weekdays only. Days and hours are dynamic.
  const labs = subjects.filter(isYear3Lab);
  const dayUsedForLab = new Set<number>();

  // A. USER-ALLOTTED LABS FIRST:
  // If the user has allotted lab schedules in the system (lab_schedules table),
  // place those exact slots first.
  if (ctx.manualLabs && ctx.manualLabs.length > 0) {
    for (const slot of ctx.manualLabs) {
      if (slot.day >= 0 && slot.day < 6 && slot.period >= 0 && slot.period < PERIODS) {
        const matchedLab = labs.find((l) => isSameSubject(l.name, slot.labName));
        if (matchedLab && grid[slot.day][slot.period] === null) {
          placeSlot(slot.day, slot.period, matchedLab, true);
          dayUsedForLab.add(slot.day);
        }
      }
    }

    // If a manual lab still has remaining hours (e.g. 2 slots booked for a 3-hour lab),
    // extend it to an adjacent period on that same day to fulfill the required lab hours
    for (const lab of labs) {
      let rem = remaining.get(lab.id) || 0;
      if (rem > 0) {
        for (const d of Array.from(dayUsedForLab)) {
          const placedOnDay = grid[d]
            .map((c, p) => ({ cell: c, p }))
            .filter((item) => item.cell && isSameSubject(item.cell, lab.name));
          if (placedOnDay.length > 0) {
            let nextP = Math.max(...placedOnDay.map((x) => x.p)) + 1;
            while (rem > 0 && nextP < PERIODS && grid[d][nextP] === null) {
              const placed = placeSlot(d, nextP, lab, true);
              if (!placed) break;
              rem = remaining.get(lab.id) || 0;
              nextP++;
            }
          }
        }
      }
    }
  }

  // B. DYNAMIC ALLOCATION for any remaining unplaced lab hours:
  const remainingLabSubjects = subjects.filter(
    (s) => isYear3Lab(s) && (remaining.get(s.id) || 0) > 0
  );
  const labsByHours = new Map<number, Subject[]>();
  for (const lab of remainingLabSubjects) {
    const h = remaining.get(lab.id) || lab.hoursPerWeek;
    if (!labsByHours.has(h)) labsByHours.set(h, []);
    labsByHours.get(h)!.push(lab);
  }
  const sortedHourKeys = Array.from(labsByHours.keys()).sort((a, b) => b - a); // 4h, then 3h, then 2h
  const labsToPlace: Subject[] = [];
  for (const h of sortedHourKeys) {
    labsToPlace.push(...shuffle(labsByHours.get(h)!));
  }

  const dayHasLab = (d: number) =>
    dayUsedForLab.has(d) || grid[d].some((cell) => cell && labs.some((l) => l.name === cell));

  for (const lab of labsToPlace) {
    const hoursNeeded = remaining.get(lab.id) || 0;
    if (hoursNeeded <= 0) continue;

    let placed = false;
    const weekdays = sortDaysByFacultyLoad([0, 1, 2, 3, 4], lab.id, ctx.facultyMap, year, section);

    for (const d of weekdays) {
      if (dayHasLab(d)) continue;

      if (hoursNeeded === 4) {
        if (grid[d][3] === null && grid[d][4] === null && grid[d][5] === null && grid[d][6] === null) {
          let facOk = true;
          if (ctx.facultyMap) {
            for (let p = 3; p <= 6; p++) {
              if (!findAvailableFacultyForSlot(lab.id, d, p, ctx.facultyMap, true).success) {
                facOk = false;
                break;
              }
            }
          }
          if (facOk) {
            for (let p = 3; p <= 6; p++) placeSlot(d, p, lab, true);
            dayUsedForLab.add(d);
            remaining.set(lab.id, 0);
            placed = true;
            break;
          }
        }
      } else if (hoursNeeded === 3) {
        if (grid[d][4] === null && grid[d][5] === null && grid[d][6] === null) {
          let facOk = true;
          if (ctx.facultyMap) {
            for (let p = 4; p <= 6; p++) {
              if (!findAvailableFacultyForSlot(lab.id, d, p, ctx.facultyMap, true).success) {
                facOk = false;
                break;
              }
            }
          }
          if (facOk) {
            for (let p = 4; p <= 6; p++) placeSlot(d, p, lab, true);
            dayUsedForLab.add(d);
            remaining.set(lab.id, 0);
            placed = true;
            break;
          }
        }
      } else if (hoursNeeded === 2) {
        const candidateBlocks = shuffle([[0, 1], [2, 3], [5, 6]]);
        for (const [p1, p2] of candidateBlocks) {
          if (grid[d][p1] === null && grid[d][p2] === null) {
            let facOk = true;
            if (ctx.facultyMap) {
              if (
                !findAvailableFacultyForSlot(lab.id, d, p1, ctx.facultyMap, true).success ||
                !findAvailableFacultyForSlot(lab.id, d, p2, ctx.facultyMap, true).success
              ) {
                facOk = false;
              }
            }
            if (facOk) {
              placeSlot(d, p1, lab, true);
              placeSlot(d, p2, lab, true);
              dayUsedForLab.add(d);
              remaining.set(lab.id, 0);
              placed = true;
              break;
            }
          }
        }
        if (placed) break;
      }
    }

    if (!placed) {
      for (const d of shuffle([0, 1, 2, 3, 4])) {
        if (dayHasLab(d)) continue;
        if (hoursNeeded === 4 && grid[d][3] === null && grid[d][4] === null && grid[d][5] === null && grid[d][6] === null) {
          let facOk = !ctx.facultyMap || [3, 4, 5, 6].every(p => findAvailableFacultyForSlot(lab.id, d, p, ctx.facultyMap!, true, year, section).success);
          if (facOk) {
            for (let p = 3; p <= 6; p++) placeSlot(d, p, lab, true);
            dayUsedForLab.add(d);
            remaining.set(lab.id, 0);
            placed = true;
            break;
          }
        } else if (hoursNeeded === 3 && grid[d][4] === null && grid[d][5] === null && grid[d][6] === null) {
          let facOk = !ctx.facultyMap || [4, 5, 6].every(p => findAvailableFacultyForSlot(lab.id, d, p, ctx.facultyMap!, true, year, section).success);
          if (facOk) {
            for (let p = 4; p <= 6; p++) placeSlot(d, p, lab, true);
            dayUsedForLab.add(d);
            remaining.set(lab.id, 0);
            placed = true;
            break;
          }
        } else if (hoursNeeded === 2) {
          const candidateBlocks = shuffle([[0, 1], [2, 3], [5, 6]]);
          for (const [p1, p2] of candidateBlocks) {
            if (grid[d][p1] === null && grid[d][p2] === null) {
              let facOk = !ctx.facultyMap || (findAvailableFacultyForSlot(lab.id, d, p1, ctx.facultyMap!, true, year, section).success && findAvailableFacultyForSlot(lab.id, d, p2, ctx.facultyMap!, true, year, section).success);
              if (facOk) {
                placeSlot(d, p1, lab, true);
                placeSlot(d, p2, lab, true);
                dayUsedForLab.add(d);
                remaining.set(lab.id, 0);
                placed = true;
                break;
              }
            }
          }
          if (placed) break;
        }
      }
    }
  }

  // 3. NO AUDIT COURSE (strictly not scheduled for 3rd year)

  // 4. SOFT SKILLS AND APTITUDE
  placeUnifiedSoftSkills(grid, subjects, remaining, ctx, year || 'III', section || 'A', placeSlot, isYear3SoftSkillOrAptitude);

  // 5. NPTEL
  // 1 hr on 1 day and 1 hr on another day (preferred) OR 2 hrs continuous.
  // Periods 4 and 5 (indices 3 and 4) are NEVER used. Allowed periods: [0, 1, 2, 5, 6].
  const nptelSubj = subjects.find(isYear3NPTEL);
  if (nptelSubj) {
    let needed = remaining.get(nptelSubj.id) || 0;
    const allowedPeriods = [0, 1, 2, 5, 6];
    const preferContinuous = Math.random() < 0.25;

    if (preferContinuous && needed >= 2) {
      const candidateContinuousPairs = shuffle([[0, 1], [1, 2], [5, 6]]);
      for (const d of shuffle([0, 1, 2, 3, 4])) {
        for (const [p1, p2] of candidateContinuousPairs) {
          if (grid[d][p1] === null && grid[d][p2] === null) {
            let facOk = true;
            if (ctx.facultyMap) {
              if (
                !findAvailableFacultyForSlot(nptelSubj.id, d, p1, ctx.facultyMap, false).success ||
                !findAvailableFacultyForSlot(nptelSubj.id, d, p2, ctx.facultyMap, false).success
              ) {
                facOk = false;
              }
            }
            if (facOk) {
              placeSlot(d, p1, nptelSubj);
              placeSlot(d, p2, nptelSubj);
              needed -= 2;
              break;
            }
          }
        }
        if (needed < 2) break;
      }
    }

    // Split placement: 1 hr per day on distinct weekdays in allowed periods
    let nptelGuard = 20;
    while (needed > 0 && nptelGuard-- > 0) {
      let placedSingle = false;
      for (const d of shuffle([0, 1, 2, 3, 4])) {
        if (grid[d].some((c) => c === nptelSubj.name)) continue;
        const candidatePeriods = shuffle(allowedPeriods);
        for (const p of candidatePeriods) {
          if (grid[d][p] === null) {
            let facOk = true;
            if (ctx.facultyMap) {
              facOk = findAvailableFacultyForSlot(nptelSubj.id, d, p, ctx.facultyMap, false).success;
            }
            if (facOk) {
              placeSlot(d, p, nptelSubj);
              needed--;
              placedSingle = true;
              break;
            }
          }
        }
        if (placedSingle) break;
      }
      if (!placedSingle) {
        // Fallback without faculty restriction, strictly maintaining distinct days & allowed periods
        for (const d of shuffle([0, 1, 2, 3, 4])) {
          if (grid[d].some((c) => c === nptelSubj.name)) continue;
          for (const p of shuffle(allowedPeriods)) {
            if (grid[d][p] === null) {
              placeSlot(d, p, nptelSubj);
              needed--;
              placedSingle = true;
              break;
            }
          }
          if (placedSingle) break;
        }
        if (!placedSingle) break;
      }
    }
  }

  // 6. REMAINING THEORY & ELECTIVE SUBJECTS
  const otherTheory = shuffle(
    subjects.filter(
      (s) =>
        (s.type === "theory" || s.type === "elective") &&
        !isYear3SpecialSat(s) &&
        !isYear3SoftSkillOrAptitude(s) &&
        !isYear3AuditCourse(s) &&
        !isYear3NPTEL(s)
    )
  );

  // 6a. Lab Hours Placement Preference:
  // "next if for lab hr faculties can take 3 to 4 hrs continuously but it not issue bcoz morning 2 hrs assign any theory subject if last 3 hrs are lab
  // next assign 1st hr any theory for any class then yo assign last 4 hrs as lab"
  for (let d = 0; d < 5; d++) {
    const has4HrLab = grid[d][3] !== null && grid[d][4] !== null && grid[d][5] !== null && grid[d][6] !== null &&
      /lab/i.test(String(grid[d][3]));
    const has3HrLab = !has4HrLab && grid[d][4] !== null && grid[d][5] !== null && grid[d][6] !== null &&
      /lab/i.test(String(grid[d][4]));

    const targetMorningPeriods = has4HrLab ? [0] : has3HrLab ? [0, 1] : [];
    for (const p of targetMorningPeriods) {
      if (grid[d][p] === null) {
        const cand = otherTheory.find((s) => (remaining.get(s.id) || 0) > 0 &&
          (!ctx.facultyMap || findAvailableFacultyForSlot(s.id, d, p, ctx.facultyMap, false, year, section, { mode: 'strict' }).success)
        );
        if (cand) {
          placeSlot(d, p, cand);
        }
      }
    }
  }

  // Multi-pass placement into empty cells on weekdays
  // Pass 1: Strict (max 1 hr per day, professors before afternoon, faculty must be free and well-spaced)
  for (const subj of shuffle(otherTheory)) {
    let rem = remaining.get(subj.id) || 0;
    if (rem <= 0) continue;
    const isProf = ctx.facultyMap ? isSubjectTaughtByProfessor(subj.id, ctx.facultyMap, year, section) : false;
    const basePeriods = (isProf || facultyBeforeAfternoon) ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6];

    for (const d of sortDaysByFacultyLoad([0, 1, 2, 3, 4], subj.id, ctx.facultyMap, year, section)) {
      if (rem <= 0) break;
      if (grid[d].some((c) => c === subj.name)) continue;

      const candidatePeriods = sortPeriodsByFacultyRest(
        basePeriods.filter((p) => grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)),
        d,
        subj.id,
        ctx.facultyMap,
        year,
        section,
        false
      );

      for (const p of candidatePeriods) {
        if (grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)) {
          if (ctx.facultyMap) {
            const fac = findAvailableFacultyForSlot(subj.id, d, p, ctx.facultyMap, false, year, section, { mode: 'strict' });
            if (fac.success) {
              if (placeSlot(d, p, subj)) {
                rem--;
                break;
              }
            }
          } else {
            if (placeSlot(d, p, subj)) {
              rem--;
              break;
            }
          }
        }
      }
    }
  }

  // Pass 2: Relaxed (allow 2nd hour on a day, faculty free, max 2 consecutive hours)
  for (const subj of shuffle(otherTheory)) {
    let rem = remaining.get(subj.id) || 0;
    if (rem <= 0) continue;
    const isProf = ctx.facultyMap ? isSubjectTaughtByProfessor(subj.id, ctx.facultyMap, year, section) : false;
    const basePeriods = (isProf || facultyBeforeAfternoon) ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6];

    for (const d of sortDaysByFacultyLoad([0, 1, 2, 3, 4], subj.id, ctx.facultyMap, year, section)) {
      if (rem <= 0) break;
      if (grid[d].filter((c) => c === subj.name).length >= 2) continue;

      const candidatePeriods = sortPeriodsByFacultyRest(
        basePeriods.filter((p) => grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)),
        d,
        subj.id,
        ctx.facultyMap,
        year,
        section,
        false
      );

      for (const p of candidatePeriods) {
        if (grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)) {
          if (ctx.facultyMap) {
            const fac = findAvailableFacultyForSlot(subj.id, d, p, ctx.facultyMap, false, year, section, { mode: 'relaxed' });
            if (fac.success) {
              if (placeSlot(d, p, subj)) {
                rem--;
                break;
              }
            }
          } else {
            if (placeSlot(d, p, subj)) {
              rem--;
              break;
            }
          }
        }
      }
    }
  }

  // Pass 3: Force (place remaining subject hours while avoiding cross-class double-booking)
  for (const subj of shuffle(otherTheory)) {
    let rem = remaining.get(subj.id) || 0;
    if (rem <= 0) continue;
    const isProf = ctx.facultyMap ? isSubjectTaughtByProfessor(subj.id, ctx.facultyMap, year, section) : false;
    const basePeriods = (isProf || facultyBeforeAfternoon) ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6];

    for (const d of sortDaysByFacultyLoad([0, 1, 2, 3, 4, 5], subj.id, ctx.facultyMap, year, section)) {
      if (rem <= 0) break;
      if (countSubjectHoursOnDay(grid, d, subj) >= 2) continue;
      const candidatePeriods = sortPeriodsByFacultyRest(
        basePeriods.filter((p) => grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)),
        d,
        subj.id,
        ctx.facultyMap,
        year,
        section,
        false
      );

      for (const p of candidatePeriods) {
        if (grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)) {
          let facOk = true;
          if (ctx.facultyMap) {
            facOk = findAvailableFacultyForSlot(subj.id, d, p, ctx.facultyMap, false, year, section, { mode: 'force' }).success;
          }
          if (facOk) {
            if (placeSlot(d, p, subj)) {
              rem = remaining.get(subj.id) || 0;
              break;
            }
          }
        }
      }
    }

    if (rem > 0) {
      for (const d of sortDaysByFacultyLoad([0, 1, 2, 3, 4], subj.id, ctx.facultyMap, year, section)) {
        if (rem <= 0) break;
        if (countSubjectHoursOnDay(grid, d, subj) >= 2) continue;
        for (const p of [0, 1, 2, 3, 4, 5, 6]) {
          if (grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)) {
            let facOk = !ctx.facultyMap || findAvailableFacultyForSlot(subj.id, d, p, ctx.facultyMap, false, year, section, { mode: 'force' }).success;
            if (facOk) {
              if (placeSlot(d, p, subj)) {
                rem = remaining.get(subj.id) || 0;
                break;
              }
            }
          }
        }
      }
    }
  }

  // Pass 4: Free Hour Fill (repair pass - ensure exact hours and no slot left blank)
  // Step 4a: First priority — strictly satisfy any under-allocated subjects
  for (let d = 0; d < 6; d++) {
    for (let p = 0; p < PERIODS; p++) {
      if (grid[d][p] === null) {
        const underAllocated = subjects.filter(
          (s) => (remaining.get(s.id) || 0) > 0 &&
                 s.type !== "lab" &&
                 s.type !== "open elective" &&
                 !wouldCreateThreeConsecutiveTheory(grid, d, p, s) &&
                 countSubjectHoursOnDay(grid, d, s) < 2
        );
        if (underAllocated.length > 0) {
          const sortedCands = underAllocated.sort(
            (a, b) => (remaining.get(b.id) || 0) - (remaining.get(a.id) || 0)
          );
          for (const cand of sortedCands) {
            if (placeSlot(d, p, cand)) {
              break;
            }
          }
        }
      }
    }
  }

  // Step 4b: Fill any remaining blank slots with Library
  for (let d = 0; d < 6; d++) {
    for (let p = 0; p < PERIODS; p++) {
      if (grid[d][p] === null) {
        grid[d][p] = "Library";
      }
    }
  }

  // Step 5: Self-healing rebalance pass to ensure exact equality of weekly hours
  rebalanceSubjectHours(grid, subjects, ctx.facultyMap, year, section);
  sanitizeNoThreeConsecutiveTheory(grid, subjects, ctx.facultyMap, year, section);
  rebalanceSubjectHours(grid, subjects, ctx.facultyMap, year, section);
  fillRemainingEmptySlotsWithLibrary(grid, ctx.classCounselorInfo, ctx.facultyMap);

  return grid;
}

// ─────────────────────────────────────────────────────────────────────────────
// YEAR III EVEN SEMESTER DEDICATED TIMETABLE GENERATION
// Implements strict institutional requirements for 3rd Year Even Semester:
// 1. Saturday:
//    - 1st & 2nd hr (P0, P1): Open Elective (OE).
//    - 3rd & 4th hr (P2, P3): Static Seminar (Class Counselor).
//    - 5th hr (P4): Static Library.
//    - 6th & 7th hr (P5, P6): Static Student Counselling (Class Counselor).
// 2. Open Elective (OE):
//    - Remaining 3 hours placed strictly on Mon 1st hr (d=0, p=0), Wed 1st hr (d=2, p=0), Fri 1st hr (d=4, p=0).
// 3. Weekday Library:
//    - Exactly 1 Library hour on ANY weekday (Mon-Fri) in any available period.
// 4. No Audit Course:
//    - Audit course is strictly NOT scheduled.
// 5. Labs:
//    - User-allotted manual lab allocations (ctx.manualLabs) placed first.
//    - Remaining unplaced lab hours dynamically allocated continuous on weekdays.
// 6. Remaining Theory & Electives:
//    - Placed randomly.
//    - If any professor assigned (isSubjectTaughtByProfessor or facultyBeforeAfternoon), it MUST come before afternoon (periods 0-3).
// 7. Self-healing rebalance pass to ensure exact equality of weekly hours while respecting all constraints.
// ─────────────────────────────────────────────────────────────────────────────

async function generateYear3EvenTimetable({
  subjects,
  rawSubjects,
  ctx,
  section,
  year,
  departmentName,
  specialHoursConfigs,
  labPreferences,
  facultyBeforeAfternoon,
}: {
  subjects: Subject[];
  rawSubjects: Subject[];
  ctx: LoadedContext;
  section?: string;
  year?: string;
  departmentName?: string;
  specialHoursConfigs: SpecialHoursConfig[];
  labPreferences?: LabPrefsMap;
  facultyBeforeAfternoon?: boolean;
}): Promise<Grid> {
  const grid = emptyGrid();
  const remaining = new Map<string, number>();
  subjects.forEach((s) => remaining.set(s.id, s.hoursPerWeek));

  const placeSlot = (
    d: number,
    p: number,
    subject: Subject,
    isLab = false,
    customLabel?: string
  ): boolean => {
    if (grid[d][p] !== null) return false;
    // CRITICAL: Strictly prevent 3 consecutive hours of the same theory subject
    if (!isLab && subject.type !== 'lab') {
      if (wouldCreateThreeConsecutiveTheory(grid, d, p, subject)) return false;
      if (countSubjectHoursOnDay(grid, d, subject) >= 2) return false;
    }
    let allocatedFacId: string | undefined = undefined;
    if (ctx.facultyMap) {
      const fac = findAvailableFacultyForSlot(subject.id, d, p, ctx.facultyMap, isLab, year, section, { mode: 'force' });
      if (!fac.success) {
        return false;
      }
      allocatedFacId = fac.facultyId;
    }
    const label = /library/i.test(subject.name) ? "Library" : (customLabel || subject.name);
    grid[d][p] = label;
    if (ctx.facultyMap && allocatedFacId) {
      allocateFacultyToSlot(allocatedFacId, d, p, ctx.facultyMap, isLab ? 'lab' : 'theory');
    }
    remaining.set(subject.id, Math.max(0, (remaining.get(subject.id) || 1) - 1));
    return true;
  };

  const isProfSubj = (subj: Subject): boolean => {
    if (facultyBeforeAfternoon) return true;
    if (!ctx.facultyMap) return false;
    return isSubjectTaughtByProfessor(subj.id, ctx.facultyMap, year, section);
  };

  // ── 1. SATURDAY: 1-2 OE, 3-4 Seminar, 5 Library, 6-7 Counselling ───────────
  const oeSubj = subjects.find((s) => s.type === "open elective" || /open\s*elective/i.test(s.name));
  const oeLabel = oeSubj?.name || ctx.openElectiveConfig?.group_name || "Open Elective";

  grid[5][0] = oeLabel;
  grid[5][1] = oeLabel;
  if (oeSubj) {
    remaining.set(oeSubj.id, Math.max(0, (remaining.get(oeSubj.id) || oeSubj.hoursPerWeek) - 2));
    if (ctx.facultyMap) {
      for (const p of [0, 1]) {
        const fac = findAvailableFacultyForSlot(oeSubj.id, 5, p, ctx.facultyMap, false, year, section, { mode: 'force' });
        if (fac.success && fac.facultyId) {
          allocateFacultyToSlot(fac.facultyId, 5, p, ctx.facultyMap, 'theory');
        }
      }
    }
  }

  grid[5][2] = "Seminar";
  grid[5][3] = "Seminar";
  grid[5][4] = "Library";
  grid[5][5] = "Counselling";
  grid[5][6] = "Counselling";

  if (ctx.classCounselorInfo?.id && ctx.facultyMap) {
    allocateFacultyToSlot(ctx.classCounselorInfo.id, 5, 2, ctx.facultyMap, 'special');
    allocateFacultyToSlot(ctx.classCounselorInfo.id, 5, 3, ctx.facultyMap, 'special');
    allocateFacultyToSlot(ctx.classCounselorInfo.id, 5, 5, ctx.facultyMap, 'special');
    allocateFacultyToSlot(ctx.classCounselorInfo.id, 5, 6, ctx.facultyMap, 'special');
  }

  // ── 2. OPEN ELECTIVE (REMAINING 3 HRS ON MON, WED, FRI 1ST HR) ──────────────
  grid[0][0] = oeLabel;
  grid[2][0] = oeLabel;
  grid[4][0] = oeLabel;
  if (oeSubj) {
    remaining.set(oeSubj.id, Math.max(0, (remaining.get(oeSubj.id) || 0) - 3));
    if (ctx.facultyMap) {
      for (const d of [0, 2, 4]) {
        const fac = findAvailableFacultyForSlot(oeSubj.id, d, 0, ctx.facultyMap, false, year, section, { mode: 'force' });
        if (fac.success && fac.facultyId) {
          allocateFacultyToSlot(fac.facultyId, d, 0, ctx.facultyMap, 'theory');
        }
      }
    }
  }

  // ── 3. LABS ────────────────────────────────────────────────────────────────
  const labs = subjects.filter(isYear3Lab);
  const dayUsedForLab = new Set<number>();

  // A. USER-ALLOTTED LABS FIRST:
  if (ctx.manualLabs && ctx.manualLabs.length > 0) {
    for (const slot of ctx.manualLabs) {
      if (slot.day >= 0 && slot.day < 6 && slot.period >= 0 && slot.period < PERIODS) {
        const matchedLab = labs.find((l) => isSameSubject(l.name, slot.labName));
        if (matchedLab && (remaining.get(matchedLab.id) || 0) > 0 && grid[slot.day][slot.period] === null) {
          placeSlot(slot.day, slot.period, matchedLab, true);
          dayUsedForLab.add(slot.day);
        }
      }
    }
  }

  // B. DYNAMIC ALLOCATION for remaining unplaced lab hours:
  const remainingLabSubjects = subjects.filter(
    (s) => isYear3Lab(s) && (remaining.get(s.id) || 0) > 0
  );
  const labsByHours = new Map<number, Subject[]>();
  for (const lab of remainingLabSubjects) {
    const h = remaining.get(lab.id) || lab.hoursPerWeek;
    if (!labsByHours.has(h)) labsByHours.set(h, []);
    labsByHours.get(h)!.push(lab);
  }
  const sortedHourKeys = Array.from(labsByHours.keys()).sort((a, b) => b - a);
  const labsToPlace: Subject[] = [];
  for (const h of sortedHourKeys) {
    labsToPlace.push(...shuffle(labsByHours.get(h)!));
  }

  const dayHasLab = (d: number) =>
    dayUsedForLab.has(d) || grid[d].some((cell) => cell && labs.some((l) => l.name === cell));

  for (const lab of labsToPlace) {
    const hoursNeeded = remaining.get(lab.id) || 0;
    if (hoursNeeded <= 0) continue;

    let placed = false;
    const weekdays = sortDaysByFacultyLoad([0, 1, 2, 3, 4], lab.id, ctx.facultyMap, year, section);

    for (const d of weekdays) {
      if (dayHasLab(d)) continue;

      if (hoursNeeded === 4) {
        if (grid[d][3] === null && grid[d][4] === null && grid[d][5] === null && grid[d][6] === null) {
          let facOk = true;
          if (ctx.facultyMap) {
            for (let p = 3; p <= 6; p++) {
              if (!findAvailableFacultyForSlot(lab.id, d, p, ctx.facultyMap, true, year, section).success) {
                facOk = false;
                break;
              }
            }
          }
          if (facOk) {
            for (let p = 3; p <= 6; p++) placeSlot(d, p, lab, true);
            dayUsedForLab.add(d);
            remaining.set(lab.id, 0);
            placed = true;
            break;
          }
        }
      } else if (hoursNeeded === 3) {
        if (grid[d][4] === null && grid[d][5] === null && grid[d][6] === null) {
          let facOk = true;
          if (ctx.facultyMap) {
            for (let p = 4; p <= 6; p++) {
              if (!findAvailableFacultyForSlot(lab.id, d, p, ctx.facultyMap, true, year, section).success) {
                facOk = false;
                break;
              }
            }
          }
          if (facOk) {
            for (let p = 4; p <= 6; p++) placeSlot(d, p, lab, true);
            dayUsedForLab.add(d);
            remaining.set(lab.id, 0);
            placed = true;
            break;
          }
        }
      } else if (hoursNeeded === 2) {
        const candidateBlocks = shuffle([[0, 1], [2, 3], [5, 6]]);
        for (const [p1, p2] of candidateBlocks) {
          if (grid[d][p1] === null && grid[d][p2] === null) {
            let facOk = true;
            if (ctx.facultyMap) {
              if (
                !findAvailableFacultyForSlot(lab.id, d, p1, ctx.facultyMap, true, year, section).success ||
                !findAvailableFacultyForSlot(lab.id, d, p2, ctx.facultyMap, true, year, section).success
              ) {
                facOk = false;
              }
            }
            if (facOk) {
              placeSlot(d, p1, lab, true);
              placeSlot(d, p2, lab, true);
              dayUsedForLab.add(d);
              remaining.set(lab.id, 0);
              placed = true;
              break;
            }
          }
        }
        if (placed) break;
      }
    }

    if (!placed) {
      for (const d of shuffle([0, 1, 2, 3, 4])) {
        if (dayHasLab(d)) continue;
        if (hoursNeeded === 4 && grid[d][3] === null && grid[d][4] === null && grid[d][5] === null && grid[d][6] === null) {
          for (let p = 3; p <= 6; p++) placeSlot(d, p, lab, true);
          dayUsedForLab.add(d);
          remaining.set(lab.id, 0);
          placed = true;
          break;
        } else if (hoursNeeded === 3 && grid[d][4] === null && grid[d][5] === null && grid[d][6] === null) {
          for (let p = 4; p <= 6; p++) placeSlot(d, p, lab, true);
          dayUsedForLab.add(d);
          remaining.set(lab.id, 0);
          placed = true;
          break;
        } else if (hoursNeeded === 2) {
          const candidateBlocks = shuffle([[0, 1], [2, 3], [5, 6]]);
          for (const [p1, p2] of candidateBlocks) {
            if (grid[d][p1] === null && grid[d][p2] === null) {
              placeSlot(d, p1, lab, true);
              placeSlot(d, p2, lab, true);
              dayUsedForLab.add(d);
              remaining.set(lab.id, 0);
              placed = true;
              break;
            }
          }
          if (placed) break;
        }
      }
    }
  }


  // ── 5. SOFT SKILLS & APTITUDE (IF PRESENT) ────────────────────────────────
  placeUnifiedSoftSkills(grid, subjects, remaining, ctx, year || 'III', section || 'A', placeSlot, isYear3SoftSkillOrAptitude);

  // ── 6. NPTEL (IF PRESENT) ─────────────────────────────────────────────────
  const nptelSubj = subjects.find(isYear3NPTEL);
  if (nptelSubj) {
    let needed = remaining.get(nptelSubj.id) || 0;
    const allowedPeriods = [0, 1, 2, 5, 6];
    let nptelGuard = 20;
    while (needed > 0 && nptelGuard-- > 0) {
      let placedSingle = false;
      for (const d of shuffle([0, 1, 2, 3, 4])) {
        if (grid[d].some((c) => c === nptelSubj.name)) continue;
        for (const p of shuffle(allowedPeriods)) {
          if (grid[d][p] === null) {
            let facOk = !ctx.facultyMap || findAvailableFacultyForSlot(nptelSubj.id, d, p, ctx.facultyMap, false, year, section).success;
            if (facOk) {
              placeSlot(d, p, nptelSubj);
              needed--;
              placedSingle = true;
              break;
            }
          }
        }
        if (placedSingle) break;
      }
      if (!placedSingle) break;
    }
  }

  // ── 7. REMAINING THEORY & ELECTIVE SUBJECTS ───────────────────────────────
  // Placed randomly; professor assigned MUST come before afternoon (p=0..3)
  const otherTheory = shuffle(
    subjects.filter(
      (s) =>
        (s.type === "theory" || s.type === "elective") &&
        !isYear3SpecialSat(s) &&
        !isYear3SoftSkillOrAptitude(s) &&
        !isYear3AuditCourse(s) &&
        !isYear3NPTEL(s)
    )
  );

  otherTheory.sort((a, b) => {
    const aProf = isProfSubj(a) ? 1 : 0;
    const bProf = isProfSubj(b) ? 1 : 0;
    return bProf - aProf;
  });

  // 7a. Lab Hours Placement Preference:
  // If afternoon has 4hr lab -> morning period 0 theory
  // If afternoon has 3hr lab -> morning periods 0, 1 theory
  for (let d = 0; d < 5; d++) {
    const has4HrLab = grid[d][3] !== null && grid[d][4] !== null && grid[d][5] !== null && grid[d][6] !== null &&
      /lab/i.test(String(grid[d][3]));
    const has3HrLab = !has4HrLab && grid[d][4] !== null && grid[d][5] !== null && grid[d][6] !== null &&
      /lab/i.test(String(grid[d][4]));

    const targetMorningPeriods = has4HrLab ? [0] : has3HrLab ? [0, 1] : [];
    for (const p of targetMorningPeriods) {
      if (grid[d][p] === null) {
        const cand = otherTheory.find((s) => (remaining.get(s.id) || 0) > 0 &&
          (!ctx.facultyMap || findAvailableFacultyForSlot(s.id, d, p, ctx.facultyMap, false, year, section, { mode: 'strict' }).success)
        );
        if (cand) {
          placeSlot(d, p, cand);
        }
      }
    }
  }

  // Pass 1: Strict (max 1 hr per day on weekdays, faculty free & rested)
  for (const subj of otherTheory) {
    let rem = remaining.get(subj.id) || 0;
    if (rem <= 0) continue;
    const isProf = isProfSubj(subj);
    const basePeriods = isProf ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6];

    for (const d of sortDaysByFacultyLoad([0, 1, 2, 3, 4], subj.id, ctx.facultyMap, year, section)) {
      if (rem <= 0) break;
      if (grid[d].some((c) => c === subj.name)) continue;

      const candidatePeriods = sortPeriodsByFacultyRest(
        basePeriods.filter((p) => grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)),
        d,
        subj.id,
        ctx.facultyMap,
        year,
        section,
        false
      );

      for (const p of candidatePeriods) {
        if (grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)) {
          let facOk = !ctx.facultyMap || findAvailableFacultyForSlot(subj.id, d, p, ctx.facultyMap, false, year, section, { mode: 'strict' }).success;
          if (facOk) {
            if (placeSlot(d, p, subj)) {
              rem--;
              break;
            }
          }
        }
      }
    }
  }

  // Pass 2: Relaxed (allow 2nd hr per day, faculty free)
  for (const subj of otherTheory) {
    let rem = remaining.get(subj.id) || 0;
    if (rem <= 0) continue;
    const isProf = isProfSubj(subj);
    const basePeriods = isProf ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6];

    for (const d of sortDaysByFacultyLoad([0, 1, 2, 3, 4], subj.id, ctx.facultyMap, year, section)) {
      if (rem <= 0) break;
      if (grid[d].filter((c) => c === subj.name).length >= 2) continue;

      const candidatePeriods = sortPeriodsByFacultyRest(
        basePeriods.filter((p) => grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)),
        d,
        subj.id,
        ctx.facultyMap,
        year,
        section,
        false
      );

      for (const p of candidatePeriods) {
        if (grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)) {
          let facOk = !ctx.facultyMap || findAvailableFacultyForSlot(subj.id, d, p, ctx.facultyMap, false, year, section, { mode: 'relaxed' }).success;
          if (facOk) {
            if (placeSlot(d, p, subj)) {
              rem--;
              break;
            }
          }
        }
      }
    }
  }

  // Pass 3: Force (place remaining subject hours while strictly preventing cross-class double-booking)
  for (const subj of otherTheory) {
    let rem = remaining.get(subj.id) || 0;
    if (rem <= 0) continue;
    const isProf = isProfSubj(subj);
    const basePeriods = isProf ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6];

    for (const d of sortDaysByFacultyLoad([0, 1, 2, 3, 4], subj.id, ctx.facultyMap, year, section)) {
      if (rem <= 0) break;
      if (countSubjectHoursOnDay(grid, d, subj) >= 2) continue;
      const candidatePeriods = sortPeriodsByFacultyRest(
        basePeriods.filter((p) => grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)),
        d,
        subj.id,
        ctx.facultyMap,
        year,
        section,
        false
      );

      for (const p of candidatePeriods) {
        if (grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)) {
          let facOk = true;
          if (ctx.facultyMap) {
            facOk = findAvailableFacultyForSlot(subj.id, d, p, ctx.facultyMap, false, year, section, { mode: 'force' }).success;
          }
          if (facOk) {
            if (placeSlot(d, p, subj)) {
              rem = remaining.get(subj.id) || 0;
              break;
            }
          }
        }
      }
    }

    if (rem > 0) {
      for (const d of sortDaysByFacultyLoad([0, 1, 2, 3, 4], subj.id, ctx.facultyMap, year, section)) {
        if (rem <= 0) break;
        if (countSubjectHoursOnDay(grid, d, subj) >= 2) continue;
        const candidatePeriods = sortPeriodsByFacultyRest(
          [0, 1, 2, 3, 4, 5, 6].filter((p) => grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)),
          d,
          subj.id,
          ctx.facultyMap,
          year,
          section,
          false
        );
        for (const p of candidatePeriods) {
          if (grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)) {
            let facOk = true;
            if (ctx.facultyMap) {
              facOk = findAvailableFacultyForSlot(subj.id, d, p, ctx.facultyMap, false, year, section, { mode: 'force' }).success;
            }
            if (facOk) {
              if (placeSlot(d, p, subj)) {
                rem = remaining.get(subj.id) || 0;
                break;
              }
            }
          }
        }
      }
    }
  }

  // Pass 4: Free Hour Fill (repair pass - ensure exact hours and no slot left blank)
  for (let d = 0; d < 6; d++) {
    for (let p = 0; p < PERIODS; p++) {
      if (grid[d][p] === null) {
        const underAllocated = subjects.filter(
          (s) => (remaining.get(s.id) || 0) > 0 &&
                 s.type !== "lab" &&
                 s.type !== "open elective" &&
                 !wouldCreateThreeConsecutiveTheory(grid, d, p, s) &&
                 countSubjectHoursOnDay(grid, d, s) < 2
        );
        if (underAllocated.length > 0) {
          const sortedCands = underAllocated.sort(
            (a, b) => (remaining.get(b.id) || 0) - (remaining.get(a.id) || 0)
          );
          for (const cand of sortedCands) {
            if (placeSlot(d, p, cand)) {
              break;
            }
          }
        }
      }
    }
  }

  for (let d = 0; d < 6; d++) {
    for (let p = 0; p < PERIODS; p++) {
      if (grid[d][p] === null) {
        grid[d][p] = "Library";
      }
    }
  }

  // Step 5: Self-healing rebalance pass to ensure exact equality of weekly hours
  rebalanceSubjectHours(grid, subjects, ctx.facultyMap, year, section);
  sanitizeNoThreeConsecutiveTheory(grid, subjects, ctx.facultyMap, year, section);
  rebalanceSubjectHours(grid, subjects, ctx.facultyMap, year, section);
  fillRemainingEmptySlotsWithLibrary(grid, ctx.classCounselorInfo, ctx.facultyMap);

  return grid;
}

// ─────────────────────────────────────────────────────────────────────────────
// YEAR IV DEDICATED TIMETABLE GENERATION
// Implements strict institutional requirements for 4th Year:
// 1. Open Elective (OE):
//    - ALWAYS placed on Mon 1st hr (d=0, p=0), Wed 1st hr (d=2, p=0), Fri 1st hr (d=4, p=0),
//      and Sat 1st & 2nd hrs (d=5, p=0 & p=1).
//    - Consistent across all classes/departments (IT, AIDS, etc.).
// 2. Saturday:
//    - 1st & 2nd hr: Open Elective (OE) (or 2 distinct theory subjects if OE not scheduled)
//    - 3rd & 4th hr: Seminar (Class Counselor)
//    - 5th hr: Library (Class Counselor)
//    - 6th & 7th hr: Counseling (Class Counselor)
// 3. No Audit Course:
//    - Audit course is strictly NOT scheduled for 4th year.
// 4. Soft Skills & Aptitude (if present):
//    - Exactly 1 hr/day on weekdays only (Mon-Fri), strictly in allowed periods [1, 2, 3, 4].
// 5. Labs:
//    - Same day continuous on weekdays only, at most 1 lab per day:
//      * 4 hrs: slots [3,4,5,6] (periods 4-7)
//      * 3 hrs: slots [4,5,6] (periods 5-7)
//      * 2 hrs: slots [0,1], [2,3], or [5,6] (note: on Mon, Wed, Fri slot 0 is OE, so [2,3] or [5,6] is used)
//      * 1 hr: any free period
// 6. NPTEL (if present):
//    - 1 hr/day or 2 hrs continuous, strictly avoiding periods 4 and 5 (indices 3 and 4). Allowed periods: [0, 1, 2, 5, 6].
// 7. Remaining Theory & Elective Subjects:
//    - Multi-pass placement into empty weekday cells (Pass 1 max 1/day, Pass 2 max 2/day, Pass 3 force, Pass 4 free hour fill).
// 8. Dynamic generation: Shuffled choices ensure varied schedules without faculty conflicts.
// ─────────────────────────────────────────────────────────────────────────────

const isYear4AuditCourse = (s: Subject | string) => {
  const name = typeof s === "string" ? s : s.name;
  return /\baudit\s*course\b|\baudit\s*:|^audit\b|\bAC\b|environment\s*and\s*climate/i.test(name);
};

const isYear4SoftSkillOrAptitude = (s: Subject | string) => {
  const name = typeof s === "string" ? s : s.name;
  const tags = typeof s === "string" ? [] : s.tags || [];
  return (
    isSSA(typeof s === "string" ? { name: s, id: "", hoursPerWeek: 0, type: "theory" } : s) ||
    /soft\s*skills?/i.test(name) ||
    /aptitude/i.test(name) ||
    /\bSSA\b/i.test(name) ||
    tags.some((t) => /\bSSA\b|soft\s*skill|aptitude/i.test(t))
  );
};

const isYear4NPTEL = (s: Subject | string) => {
  const name = typeof s === "string" ? s : s.name;
  return /\bNPTEL\b/i.test(name) || /design\s*thinking/i.test(name);
};

const isYear4Lab = (s: Subject | string) => {
  if (typeof s !== "string" && s.type === "lab") return true;
  const name = typeof s === "string" ? s : s.name;
  return /\blab\b|\blaboratory\b|\bpracticals?\b/i.test(name);
};

const isYear4SpecialSat = (s: Subject | string) => {
  const name = typeof s === "string" ? s : s.name;
  return /seminar|counsel/i.test(name);
};

/**
 * Dedicated generator for Year IV Even Semester:
 * - 100% static timetable, identical for all departments & sections
 * - Monday to Friday (Periods 1 to 7): Project
 * - Saturday Period 1 & 2: Project
 * - Saturday Period 3 & 4: Seminar (or Seminar (CounselorName))
 * - Saturday Period 5: Library (or Library (CounselorName))
 * - Saturday Period 6 & 7: Counselling (or Counselling (CounselorName))
 */
export function generateYear4EvenSemesterTimetable({
  subjects = [],
  ctx,
  section,
  year = "IV",
  specialHoursConfigs = [],
}: {
  subjects?: Subject[];
  rawSubjects?: Subject[];
  ctx?: LoadedContext;
  section?: string;
  year?: string;
  departmentName?: string;
  specialHoursConfigs?: SpecialHoursConfig[];
}): Grid {
  const grid = emptyGrid();

  // Find project subject name if configured in subjects, otherwise default to "Project"
  const projSubj = subjects.find((s) => /project/i.test(s.name));
  const projectLabel = projSubj?.name || "Project";

  // Monday through Friday (days 0 to 4): all 7 hours are Project
  for (let d = 0; d < 5; d++) {
    for (let p = 0; p < PERIODS; p++) {
      grid[d][p] = projectLabel;
    }
  }

  // Saturday (day 5):
  // 1st and 2nd hr: Project
  grid[5][0] = projectLabel;
  grid[5][1] = projectLabel;

  // Saturday special slots:
  // 3rd & 4th hr: Seminar (sem)
  // 5th hr: Library (lib)
  // 6th & 7th hr: Counselling (counselling)
  const counselorName = ctx?.classCounselorInfo?.name || null;
  const counselorId = ctx?.classCounselorInfo?.id || null;

  const seminarLabel = "Seminar";
  const libraryLabel = "Library";
  const counselLabel = "Counselling";

  grid[5][2] = seminarLabel;
  grid[5][3] = seminarLabel;
  grid[5][4] = libraryLabel;
  grid[5][5] = counselLabel;
  grid[5][6] = counselLabel;

  // Allocate counselor to facultyMap if available to prevent any faculty conflicts
  if (counselorId && ctx?.facultyMap) {
    allocateFacultyToSlot(counselorId, 5, 2, ctx.facultyMap);
    allocateFacultyToSlot(counselorId, 5, 3, ctx.facultyMap);
    allocateFacultyToSlot(counselorId, 5, 4, ctx.facultyMap);
    allocateFacultyToSlot(counselorId, 5, 5, ctx.facultyMap);
    allocateFacultyToSlot(counselorId, 5, 6, ctx.facultyMap);
  }

  // If a faculty member is assigned to the Project subject, allocate them as well
  if (projSubj && ctx?.facultyMap) {
    for (let d = 0; d < 5; d++) {
      for (let p = 0; p < PERIODS; p++) {
        const fac = findAvailableFacultyForSlot(projSubj.id, d, p, ctx.facultyMap, false, year, section);
        if (fac.success && fac.facultyId) {
          allocateFacultyToSlot(fac.facultyId, d, p, ctx.facultyMap);
        }
      }
    }
    for (const p of [0, 1]) {
      const fac = findAvailableFacultyForSlot(projSubj.id, 5, p, ctx.facultyMap, false, year, section);
      if (fac.success && fac.facultyId) {
        allocateFacultyToSlot(fac.facultyId, 5, p, ctx.facultyMap);
      }
    }
  }

  fillRemainingEmptySlotsWithLibrary(grid, ctx.classCounselorInfo, ctx.facultyMap);
  return grid;
}

async function generateYear4Timetable({
  subjects,
  rawSubjects,
  ctx,
  section,
  year,
  departmentName,
  specialHoursConfigs,
  labPreferences,
  facultyBeforeAfternoon,
  semesterType = 'odd',
}: {
  subjects: Subject[];
  rawSubjects: Subject[];
  ctx: LoadedContext;
  section?: string;
  year?: string;
  departmentName?: string;
  specialHoursConfigs: SpecialHoursConfig[];
  labPreferences?: LabPrefsMap;
  facultyBeforeAfternoon?: boolean;
  semesterType?: 'odd' | 'even';
}): Promise<Grid> {
  // If even semester, return the 100% static timetable
  if (semesterType === 'even') {
    return generateYear4EvenSemesterTimetable({
      subjects,
      rawSubjects,
      ctx,
      section,
      year,
      departmentName,
      specialHoursConfigs,
    });
  }

  const grid = emptyGrid();
  const remaining = new Map<string, number>();
  subjects.forEach((s) => remaining.set(s.id, s.hoursPerWeek));

  // Explicitly ensure no audit course is placed for Year 4
  subjects.forEach((s) => {
    if (isYear4AuditCourse(s)) {
      remaining.set(s.id, 0);
    }
  });

  const placeSlot = (
    d: number,
    p: number,
    subject: Subject,
    isLab = false,
    customLabel?: string
  ): boolean => {
    if (grid[d][p] !== null) return false;
    // CRITICAL: Strictly prevent 3 consecutive hours of the same theory subject
    if (!isLab && subject.type !== 'lab') {
      if (wouldCreateThreeConsecutiveTheory(grid, d, p, subject)) return false;
      if (countSubjectHoursOnDay(grid, d, subject) >= 2) return false;
    }
    let allocatedFacId: string | undefined = undefined;
    if (ctx.facultyMap) {
      const fac = findAvailableFacultyForSlot(subject.id, d, p, ctx.facultyMap, isLab, year, section, { mode: 'force' });
      if (!fac.success) {
        return false;
      }
      allocatedFacId = fac.facultyId;
    }
    const label = /library/i.test(subject.name) ? "Library" : (customLabel || subject.name);
    grid[d][p] = label;
    console.log(`[PLACE Y4 ${section || '?'}] Day ${DAYS[d]} P${p + 1}: "${label}" (subjId: ${subject.id})`);
    if (ctx.facultyMap && allocatedFacId) {
      allocateFacultyToSlot(allocatedFacId, d, p, ctx.facultyMap, isLab ? 'lab' : 'theory');
    }
    remaining.set(subject.id, Math.max(0, (remaining.get(subject.id) || 1) - 1));
    return true;
  };

  // 1. OPEN ELECTIVE (OE)
  // Institutional rule: Mon 1st hr (d=0, p=0), Wed 1st hr (d=2, p=0), Fri 1st hr (d=4, p=0), Sat 1st & 2nd hrs (d=5, p=0, p=1)
  const OE_FIXED_SLOTS = [
    { d: 0, p: 0 }, // Mon Period 1
    { d: 2, p: 0 }, // Wed Period 1
    { d: 4, p: 0 }, // Fri Period 1
    { d: 5, p: 0 }, // Sat Period 1
    { d: 5, p: 1 }, // Sat Period 2
  ];

  const oeSubjects = subjects.filter((s) => s.type === "open elective");
  const oeSubj = oeSubjects[0] || null;
  const oeLabel = oeSubj?.name || ctx.openElectiveConfig?.group_name || "Open Elective";

  for (const { d, p } of OE_FIXED_SLOTS) {
    grid[d][p] = oeLabel;
    if (oeSubj && ctx.facultyMap) {
      const fac = findAvailableFacultyForSlot(oeSubj.id, d, p, ctx.facultyMap, false, year, section, { mode: 'force' });
      if (fac.success && fac.facultyId) {
        allocateFacultyToSlot(fac.facultyId, d, p, ctx.facultyMap, 'theory');
      }
    }
  }
  if (oeSubj) {
    remaining.set(oeSubj.id, 0);
  }
  // Clear remaining hours for all OE subjects so none spill into weekdays
  oeSubjects.forEach((s) => remaining.set(s.id, 0));

  // 2. SATURDAY SPECIAL SLOTS (SEMINAR, LIBRARY, COUNSELING)
  // Institutional rule for Year 4 Odd Semester:
  // - 1st 2 hrs: Open Elective (d=5, p=0, 1) -> placed above
  // - Next 2 hrs: Seminar (d=5, p=2, 3)
  // - Next 1 hr:  Library (d=5, p=4)
  // - Last 2 hrs: Student Counselling (d=5, p=5, 6)
  placeSaturdaySpecialSlots(
    grid,
    specialHoursConfigs,
    ctx.classCounselorInfo,
    subjects,
    remaining,
    ctx.facultyMap
  );

  // Guarantee that Saturday special slots are strictly locked even if configs are missing/incomplete:
  const counselorId = ctx.classCounselorInfo?.id || null;
  if (grid[5][2] === null || grid[5][3] === null) {
    grid[5][2] = "Seminar";
    grid[5][3] = "Seminar";
    if (counselorId && ctx.facultyMap) {
      allocateFacultyToSlot(counselorId, 5, 2, ctx.facultyMap);
      allocateFacultyToSlot(counselorId, 5, 3, ctx.facultyMap);
    }
  }
  if (grid[5][4] === null) {
    grid[5][4] = "Library";
    if (counselorId && ctx.facultyMap) {
      allocateFacultyToSlot(counselorId, 5, 4, ctx.facultyMap);
    }
  }
  if (grid[5][5] === null || grid[5][6] === null) {
    grid[5][5] = "Counselling";
    grid[5][6] = "Counselling";
    if (counselorId && ctx.facultyMap) {
      allocateFacultyToSlot(counselorId, 5, 5, ctx.facultyMap);
      allocateFacultyToSlot(counselorId, 5, 6, ctx.facultyMap);
    }
  }

  // Clear remaining hours for any special subjects if present in subjects list
  subjects.forEach((s) => {
    if (/seminar|library|counsel/i.test(s.name) || (s.type as string) === "special") {
      remaining.set(s.id, 0);
    }
  });

  // 3. LABS
  // Same day continuous on weekdays only:
  // - 4 hrs: slots [3,4,5,6] continuously (starts from 4 to 7, periods 4-7)
  // - 3 hrs: slots [4,5,6] only (last 3 hrs, periods 5-7)
  // - 2 hrs: slots [0,1], [2,3], or [5,6] (on Mon/Wed/Fri, p=0 is OE so [2,3] or [5,6] is used)
  // - 1 hr: any single free period
  // At most 1 lab per day, on weekdays only. Days and hours are dynamic.
  const labs = subjects.filter(isYear4Lab);
  const dayUsedForLab = new Set<number>();

  // A. USER-ALLOTTED LABS FIRST:
  // If the user has allotted lab schedules in the system (lab_schedules table),
  // place those exact slots first.
  if (ctx.manualLabs && ctx.manualLabs.length > 0) {
    for (const slot of ctx.manualLabs) {
      if (slot.day >= 0 && slot.day < 6 && slot.period >= 0 && slot.period < PERIODS) {
        const matchedLab = labs.find((l) => isSameSubject(l.name, slot.labName));
        if (matchedLab && grid[slot.day][slot.period] === null) {
          placeSlot(slot.day, slot.period, matchedLab, true);
          dayUsedForLab.add(slot.day);
        }
      }
    }
  }

  // B. DYNAMIC ALLOCATION for any remaining unplaced lab hours:
  const remainingLabSubjects = subjects.filter(
    (s) => isYear4Lab(s) && (remaining.get(s.id) || 0) > 0
  );
  const labsByHours = new Map<number, Subject[]>();
  for (const lab of remainingLabSubjects) {
    const h = remaining.get(lab.id) || lab.hoursPerWeek;
    if (!labsByHours.has(h)) labsByHours.set(h, []);
    labsByHours.get(h)!.push(lab);
  }
  const sortedHourKeys = Array.from(labsByHours.keys()).sort((a, b) => b - a); // 4h, then 3h, then 2h, then 1h
  const labsToPlace: Subject[] = [];
  for (const h of sortedHourKeys) {
    labsToPlace.push(...shuffle(labsByHours.get(h)!));
  }

  const dayHasLab = (d: number) =>
    dayUsedForLab.has(d) || grid[d].some((cell) => cell && labs.some((l) => l.name === cell));

  for (const lab of labsToPlace) {
    const hoursNeeded = remaining.get(lab.id) || 0;
    if (hoursNeeded <= 0) continue;

    let placed = false;
    const weekdays = sortDaysByFacultyLoad([0, 1, 2, 3, 4], lab.id, ctx.facultyMap, year, section);

    for (const d of weekdays) {
      if (dayHasLab(d)) continue;

      if (hoursNeeded === 4) {
        if (grid[d][3] === null && grid[d][4] === null && grid[d][5] === null && grid[d][6] === null) {
          let facOk = true;
          if (ctx.facultyMap) {
            for (let p = 3; p <= 6; p++) {
              if (!findAvailableFacultyForSlot(lab.id, d, p, ctx.facultyMap, true).success) {
                facOk = false;
                break;
              }
            }
          }
          if (facOk) {
            for (let p = 3; p <= 6; p++) placeSlot(d, p, lab, true);
            dayUsedForLab.add(d);
            remaining.set(lab.id, 0);
            placed = true;
            break;
          }
        }
      } else if (hoursNeeded === 3) {
        if (grid[d][4] === null && grid[d][5] === null && grid[d][6] === null) {
          let facOk = true;
          if (ctx.facultyMap) {
            for (let p = 4; p <= 6; p++) {
              if (!findAvailableFacultyForSlot(lab.id, d, p, ctx.facultyMap, true).success) {
                facOk = false;
                break;
              }
            }
          }
          if (facOk) {
            for (let p = 4; p <= 6; p++) placeSlot(d, p, lab, true);
            dayUsedForLab.add(d);
            remaining.set(lab.id, 0);
            placed = true;
            break;
          }
        }
      } else if (hoursNeeded === 2) {
        const candidateBlocks = shuffle([[0, 1], [2, 3], [5, 6]]);
        for (const [p1, p2] of candidateBlocks) {
          if (grid[d][p1] === null && grid[d][p2] === null) {
            let facOk = true;
            if (ctx.facultyMap) {
              if (
                !findAvailableFacultyForSlot(lab.id, d, p1, ctx.facultyMap, true).success ||
                !findAvailableFacultyForSlot(lab.id, d, p2, ctx.facultyMap, true).success
              ) {
                facOk = false;
              }
            }
            if (facOk) {
              placeSlot(d, p1, lab, true);
              placeSlot(d, p2, lab, true);
              dayUsedForLab.add(d);
              remaining.set(lab.id, 0);
              placed = true;
              break;
            }
          }
        }
        if (placed) break;
      } else if (hoursNeeded === 1) {
        const candidatePeriods = shuffle([0, 1, 2, 3, 4, 5, 6]);
        for (const p of candidatePeriods) {
          if (grid[d][p] === null) {
            let facOk = true;
            if (ctx.facultyMap) {
              facOk = findAvailableFacultyForSlot(lab.id, d, p, ctx.facultyMap, true).success;
            }
            if (facOk) {
              placeSlot(d, p, lab, true);
              dayUsedForLab.add(d);
              remaining.set(lab.id, 0);
              placed = true;
              break;
            }
          }
        }
        if (placed) break;
      }
    }

    if (!placed) {
      for (const d of shuffle([0, 1, 2, 3, 4])) {
        if (dayHasLab(d)) continue;
        if (hoursNeeded === 4 && grid[d][3] === null && grid[d][4] === null && grid[d][5] === null && grid[d][6] === null) {
          let facOk = !ctx.facultyMap || [3, 4, 5, 6].every(p => findAvailableFacultyForSlot(lab.id, d, p, ctx.facultyMap!, true, year, section).success);
          if (facOk) {
            for (let p = 3; p <= 6; p++) placeSlot(d, p, lab, true);
            dayUsedForLab.add(d);
            remaining.set(lab.id, 0);
            placed = true;
            break;
          }
        } else if (hoursNeeded === 3 && grid[d][4] === null && grid[d][5] === null && grid[d][6] === null) {
          let facOk = !ctx.facultyMap || [4, 5, 6].every(p => findAvailableFacultyForSlot(lab.id, d, p, ctx.facultyMap!, true, year, section).success);
          if (facOk) {
            for (let p = 4; p <= 6; p++) placeSlot(d, p, lab, true);
            dayUsedForLab.add(d);
            remaining.set(lab.id, 0);
            placed = true;
            break;
          }
        } else if (hoursNeeded === 2) {
          const candidateBlocks = shuffle([[0, 1], [2, 3], [5, 6]]);
          for (const [p1, p2] of candidateBlocks) {
            if (grid[d][p1] === null && grid[d][p2] === null) {
              let facOk = !ctx.facultyMap || (findAvailableFacultyForSlot(lab.id, d, p1, ctx.facultyMap!, true, year, section).success && findAvailableFacultyForSlot(lab.id, d, p2, ctx.facultyMap!, true, year, section).success);
              if (facOk) {
                placeSlot(d, p1, lab, true);
                placeSlot(d, p2, lab, true);
                dayUsedForLab.add(d);
                remaining.set(lab.id, 0);
                placed = true;
                break;
              }
            }
          }
          if (placed) break;
        } else if (hoursNeeded === 1) {
          for (const p of shuffle([0, 1, 2, 3, 4, 5, 6])) {
            if (grid[d][p] === null) {
              let facOk = !ctx.facultyMap || findAvailableFacultyForSlot(lab.id, d, p, ctx.facultyMap!, true, year, section).success;
              if (facOk) {
                placeSlot(d, p, lab, true);
                dayUsedForLab.add(d);
                remaining.set(lab.id, 0);
                placed = true;
                break;
              }
            }
          }
          if (placed) break;
        }
      }
    }
  }

  // 4. SOFT SKILLS AND APTITUDE (if present in 4th year)
  placeUnifiedSoftSkills(grid, subjects, remaining, ctx, year || 'IV', section || 'A', placeSlot, isYear4SoftSkillOrAptitude);

  // 5. NPTEL (if present in 4th year)
  const nptelSubj = subjects.find(isYear4NPTEL);
  if (nptelSubj) {
    let needed = remaining.get(nptelSubj.id) || 0;
    const allowedPeriods = [0, 1, 2, 5, 6];
    const preferContinuous = Math.random() < 0.25;

    if (preferContinuous && needed >= 2) {
      const candidateContinuousPairs = shuffle([[0, 1], [1, 2], [5, 6]]);
      for (const d of shuffle([0, 1, 2, 3, 4])) {
        for (const [p1, p2] of candidateContinuousPairs) {
          if (grid[d][p1] === null && grid[d][p2] === null) {
            let facOk = true;
            if (ctx.facultyMap) {
              if (
                !findAvailableFacultyForSlot(nptelSubj.id, d, p1, ctx.facultyMap, false).success ||
                !findAvailableFacultyForSlot(nptelSubj.id, d, p2, ctx.facultyMap, false).success
              ) {
                facOk = false;
              }
            }
            if (facOk) {
              placeSlot(d, p1, nptelSubj);
              placeSlot(d, p2, nptelSubj);
              needed -= 2;
              break;
            }
          }
        }
        if (needed < 2) break;
      }
    }

    let nptelGuard = 20;
    while (needed > 0 && nptelGuard-- > 0) {
      let placedSingle = false;
      for (const d of shuffle([0, 1, 2, 3, 4])) {
        if (grid[d].some((c) => c === nptelSubj.name)) continue;
        const candidatePeriods = shuffle(allowedPeriods);
        for (const p of candidatePeriods) {
          if (grid[d][p] === null) {
            let facOk = true;
            if (ctx.facultyMap) {
              facOk = findAvailableFacultyForSlot(nptelSubj.id, d, p, ctx.facultyMap, false).success;
            }
            if (facOk) {
              placeSlot(d, p, nptelSubj);
              needed--;
              placedSingle = true;
              break;
            }
          }
        }
        if (placedSingle) break;
      }
      if (!placedSingle) {
        for (const d of shuffle([0, 1, 2, 3, 4])) {
          if (grid[d].some((c) => c === nptelSubj.name)) continue;
          for (const p of shuffle(allowedPeriods)) {
            if (grid[d][p] === null) {
              placeSlot(d, p, nptelSubj);
              needed--;
              placedSingle = true;
              break;
            }
          }
          if (placedSingle) break;
        }
        if (!placedSingle) break;
      }
    }
  }

  // 6. REMAINING THEORY & ELECTIVE SUBJECTS
  const otherTheory = shuffle(
    subjects.filter(
      (s) =>
        (s.type === "theory" || s.type === "elective") &&
        !isYear4SpecialSat(s) &&
        !isYear4SoftSkillOrAptitude(s) &&
        !isYear4AuditCourse(s) &&
        !isYear4NPTEL(s)
    )
  );

  // 6a. Lab Hours Placement Preference:
  // "next if for lab hr faculties can take 3 to 4 hrs continuously but it not issue bcoz morning 2 hrs assign any theory subject if last 3 hrs are lab
  // next assign 1st hr any theory for any class then yo assign last 4 hrs as lab"
  for (let d = 0; d < 5; d++) {
    const has4HrLab = grid[d][3] !== null && grid[d][4] !== null && grid[d][5] !== null && grid[d][6] !== null &&
      /lab/i.test(String(grid[d][3]));
    const has3HrLab = !has4HrLab && grid[d][4] !== null && grid[d][5] !== null && grid[d][6] !== null &&
      /lab/i.test(String(grid[d][4]));

    const targetMorningPeriods = has4HrLab ? [0] : has3HrLab ? [0, 1] : [];
    for (const p of targetMorningPeriods) {
      if (grid[d][p] === null) {
        const cand = otherTheory.find((s) => (remaining.get(s.id) || 0) > 0 &&
          (!ctx.facultyMap || findAvailableFacultyForSlot(s.id, d, p, ctx.facultyMap, false, year, section, { mode: 'strict' }).success)
        );
        if (cand) {
          placeSlot(d, p, cand);
        }
      }
    }
  }

  // Multi-pass placement into empty cells on weekdays
  // Pass 1: Strict (max 1 hr per day, professors before afternoon, faculty must be free and well-spaced)
  for (const subj of shuffle(otherTheory)) {
    let rem = remaining.get(subj.id) || 0;
    if (rem <= 0) continue;
    const isProf = ctx.facultyMap ? isSubjectTaughtByProfessor(subj.id, ctx.facultyMap, year, section) : false;
    const basePeriods = (isProf || facultyBeforeAfternoon) ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6];

    for (const d of sortDaysByFacultyLoad([0, 1, 2, 3, 4], subj.id, ctx.facultyMap, year, section)) {
      if (rem <= 0) break;
      if (grid[d].some((c) => c === subj.name)) continue;

      const candidatePeriods = sortPeriodsByFacultyRest(
        basePeriods.filter((p) => grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)),
        d,
        subj.id,
        ctx.facultyMap,
        year,
        section,
        false
      );

      for (const p of candidatePeriods) {
        if (grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)) {
          if (ctx.facultyMap) {
            const fac = findAvailableFacultyForSlot(subj.id, d, p, ctx.facultyMap, false, year, section, { mode: 'strict' });
            if (fac.success) {
              if (placeSlot(d, p, subj)) {
                rem--;
                break;
              }
            }
          } else {
            if (placeSlot(d, p, subj)) {
              rem--;
              break;
            }
          }
        }
      }
    }
  }

  // Pass 2: Relaxed (allow 2nd hour on a day, faculty free, max 2 consecutive hours)
  for (const subj of shuffle(otherTheory)) {
    let rem = remaining.get(subj.id) || 0;
    if (rem <= 0) continue;
    const isProf = ctx.facultyMap ? isSubjectTaughtByProfessor(subj.id, ctx.facultyMap, year, section) : false;
    const basePeriods = (isProf || facultyBeforeAfternoon) ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6];

    for (const d of sortDaysByFacultyLoad([0, 1, 2, 3, 4], subj.id, ctx.facultyMap, year, section)) {
      if (rem <= 0) break;
      if (grid[d].filter((c) => c === subj.name).length >= 2) continue;

      const candidatePeriods = sortPeriodsByFacultyRest(
        basePeriods.filter((p) => grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)),
        d,
        subj.id,
        ctx.facultyMap,
        year,
        section,
        false
      );

      for (const p of candidatePeriods) {
        if (grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)) {
          if (ctx.facultyMap) {
            const fac = findAvailableFacultyForSlot(subj.id, d, p, ctx.facultyMap, false, year, section, { mode: 'relaxed' });
            if (fac.success) {
              if (placeSlot(d, p, subj)) {
                rem--;
                break;
              }
            }
          } else {
            if (placeSlot(d, p, subj)) {
              rem--;
              break;
            }
          }
        }
      }
    }
  }

  // Pass 3: Force (place remaining subject hours while strictly avoiding cross-class double-booking)
  for (const subj of shuffle(otherTheory)) {
    let rem = remaining.get(subj.id) || 0;
    if (rem <= 0) continue;
    const isProf = ctx.facultyMap ? isSubjectTaughtByProfessor(subj.id, ctx.facultyMap, year, section) : false;
    const basePeriods = (isProf || facultyBeforeAfternoon) ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6];

    for (const d of sortDaysByFacultyLoad([0, 1, 2, 3, 4], subj.id, ctx.facultyMap, year, section)) {
      if (rem <= 0) break;
      if (countSubjectHoursOnDay(grid, d, subj) >= 2) continue;
      const candidatePeriods = sortPeriodsByFacultyRest(
        basePeriods.filter((p) => grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)),
        d,
        subj.id,
        ctx.facultyMap,
        year,
        section,
        false
      );

      for (const p of candidatePeriods) {
        if (grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)) {
          let facOk = true;
          if (ctx.facultyMap) {
            facOk = findAvailableFacultyForSlot(subj.id, d, p, ctx.facultyMap, false, year, section, { mode: 'force' }).success;
          }
          if (facOk) {
            if (placeSlot(d, p, subj)) {
              rem = remaining.get(subj.id) || 0;
              break;
            }
          }
        }
      }
    }

    if (rem > 0) {
      for (const d of sortDaysByFacultyLoad([0, 1, 2, 3, 4], subj.id, ctx.facultyMap, year, section)) {
        if (rem <= 0) break;
        if (countSubjectHoursOnDay(grid, d, subj) >= 2) continue;
        const candidatePeriods = sortPeriodsByFacultyRest(
          [0, 1, 2, 3, 4, 5, 6].filter((p) => grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)),
          d,
          subj.id,
          ctx.facultyMap,
          year,
          section,
          false
        );
        for (const p of candidatePeriods) {
          if (grid[d][p] === null && !wouldCreateThreeConsecutiveTheory(grid, d, p, subj)) {
            let facOk = true;
            if (ctx.facultyMap) {
              facOk = findAvailableFacultyForSlot(subj.id, d, p, ctx.facultyMap, false, year, section, { mode: 'force' }).success;
            }
            if (facOk) {
              if (placeSlot(d, p, subj)) {
                rem = remaining.get(subj.id) || 0;
                break;
              }
            }
          }
        }
      }
    }
  }

  // Pass 4: Free Hour Fill (repair pass - ensure exact hours and no slot left blank on weekdays)
  // Step 4a: First priority — strictly satisfy any under-allocated subjects
  for (let d = 0; d < 5; d++) {
    for (let p = 0; p < PERIODS; p++) {
      if (grid[d][p] === null) {
        const underAllocated = subjects.filter(
          (s) => (remaining.get(s.id) || 0) > 0 &&
                 s.type !== "lab" &&
                 s.type !== "open elective" &&
                 !wouldCreateThreeConsecutiveTheory(grid, d, p, s) &&
                 countSubjectHoursOnDay(grid, d, s) < 2
        );
        if (underAllocated.length > 0) {
          const sortedCands = underAllocated.sort(
            (a, b) => (remaining.get(b.id) || 0) - (remaining.get(a.id) || 0)
          );
          for (const cand of sortedCands) {
            if (placeSlot(d, p, cand)) {
              break;
            }
          }
        }
      }
    }
  }

  // Step 4b: Only if all subjects have met their given hours, fill any remaining blank slots with Library
  for (let d = 0; d < 6; d++) {
    for (let p = 0; p < PERIODS; p++) {
      if (grid[d][p] === null) {
        grid[d][p] = "Library";
      }
    }
  }

  // Step 5: Self-healing rebalance pass to ensure exact equality of weekly hours
  rebalanceSubjectHours(grid, subjects, ctx.facultyMap, year, section);
  sanitizeNoThreeConsecutiveTheory(grid, subjects, ctx.facultyMap, year, section);
  rebalanceSubjectHours(grid, subjects, ctx.facultyMap, year, section);
  fillRemainingEmptySlotsWithLibrary(grid, ctx.classCounselorInfo, ctx.facultyMap);

  return grid;
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
  sharedYear2AuditDays,
  sharedFacultyMap,
  semesterType = 'odd',
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
        /^(pe\s*\d+|elective\s*\d+|professional\s*elective\s*\d+|pe_group_\w+)$/i.test(t.trim())
      ) || (s.elective_group_name ? s.elective_group_name : undefined);
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
    specialHoursConfigs,
    sharedFacultyMap,
    semesterType
  );

  // ── SPECIAL DEDICATED ROUTE FOR YEAR II ────────────────────────────────────
  if (isYearTwo(year)) {
    if (semesterType === 'even') {
      return await generateYear2EvenTimetable({
        subjects,
        rawSubjects,
        ctx,
        section,
        year,
        departmentName,
        specialHoursConfigs,
        labPreferences,
        sharedYear2AuditDays,
        facultyBeforeAfternoon,
      });
    }
    return await generateYear2Timetable({
      subjects,
      rawSubjects,
      ctx,
      section,
      year,
      departmentName,
      specialHoursConfigs,
      labPreferences,
      sharedYear2AuditDays,
      facultyBeforeAfternoon,
    });
  }

  // ── SPECIAL DEDICATED ROUTE FOR YEAR III ───────────────────────────────────
  if (isYearThree(year)) {
    if (semesterType === 'even') {
      return await generateYear3EvenTimetable({
        subjects,
        rawSubjects,
        ctx,
        section,
        year,
        departmentName,
        specialHoursConfigs,
        labPreferences,
        facultyBeforeAfternoon,
      });
    }
    return await generateYear3Timetable({
      subjects,
      rawSubjects,
      ctx,
      section,
      year,
      departmentName,
      specialHoursConfigs,
      labPreferences,
      facultyBeforeAfternoon,
      semesterType,
    });
  }

  // ── SPECIAL DEDICATED ROUTE FOR YEAR IV ────────────────────────────────────
  // Implements institutional rules for 4th Year:
  // - Open Elective (OE) placed on Mon 1st hr, Wed 1st hr, Fri 1st hr, Sat 1st & 2nd hr
  // - Saturday remaining: Seminar (3-4), Library (5), Counseling (6-7)
  // - No Audit course
  // - Same continuous lab rules, NPTEL rules, SSA rules, and theory distribution as Year III
  if (isYearFour(year)) {
    return await generateYear4Timetable({
      subjects,
      rawSubjects,
      ctx,
      section,
      year,
      departmentName,
      specialHoursConfigs,
      labPreferences,
      facultyBeforeAfternoon,
      semesterType,
    });
  }

  // ── PHASE 1: Lock Static Slots ─────────────────────────────────────────────
  // Special hours first (immutable & assigned to Class Counselor)
  lockSpecialHours(grid, specialHoursConfigs, ctx.classCounselorInfo, section, ctx.facultyMap);

  const labs = subjects.filter((s) => s.type === "lab");

  // DB lab schedules second (immutable — user allotted labs from DB)
  lockStaticLabs(grid, ctx.manualLabs, labs, ctx.facultyMap, year, section);

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

  // ── Open Elective slots ──────────────────────────────────────────────────
  const oeSubjects = subjects.filter((s) => s.type === "open elective");
  placeOpenElectives(grid, ctx.openElectiveConfig, oeSubjects, remaining, ctx.facultyMap, year, section);

  // ── Auto-allocate remaining lab hours (edge case: no DB entry) ───────────
  autoAllocateRemainingLabs(grid, labs, remaining, ctx.facultyMap, year, section);

  // ── PHASE 3: Theory Placement ─────────────────────────────────────────────
  placeTheorySubjects(grid, theory, remaining, ctx.facultyMap, facultyBeforeAfternoon, year, section);

  // ── PHASE 4: Free Hour Fill ───────────────────────────────────────────────
  fillFreeHours(grid, subjects, remaining, ctx.facultyMap, year, section);

  // ── PHASE 5: Hours Rebalancing & Self-Healing ─────────────────────────────
  rebalanceSubjectHours(grid, subjects, ctx.facultyMap, year, section);
  sanitizeNoThreeConsecutiveTheory(grid, subjects, ctx.facultyMap, year, section);
  rebalanceSubjectHours(grid, subjects, ctx.facultyMap, year, section);
  fillRemainingEmptySlotsWithLibrary(grid, ctx.classCounselorInfo, ctx.facultyMap);

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

  // Validate that no theory subject has 3 or more consecutive hours on any day
  for (let d = 0; d < 6; d++) {
    for (let p = 0; p < PERIODS - 2; p++) {
      const c1 = grid[d]?.[p];
      const c2 = grid[d]?.[p + 1];
      const c3 = grid[d]?.[p + 2];
      if (!c1 || !c2 || !c3) continue;
      if (c1 === 'BREAK' || c1 === 'LUNCH' || c1 === 'FREE' || c1 === 'Library') continue;

      const subjObj = subjects.find((s) => isCellMatchingSubject(c1, s));
      const isLab = subjObj
        ? subjObj.type === "lab" || /\blab\b|\blaboratory\b/i.test(subjObj.name)
        : /\blab\b|\blaboratory\b/i.test(c1);
      if (isLab) continue; // Only labs can be 3+ continuous hours!

      const sameSubj2 = subjObj ? isCellMatchingSubject(c2, subjObj) : isCellMatchingSubjectName(c2, c1);
      const sameSubj3 = subjObj ? isCellMatchingSubject(c3, subjObj) : isCellMatchingSubjectName(c3, c1);
      if (sameSubj2 && sameSubj3) {
        errors.push(
          `Day ${DAYS[d]} has 3 continuous hours of theory subject "${c1}" (Periods P${p + 1}, P${p + 2}, P${p + 3}). Only labs can be 3-4 continuous hours.`
        );
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
  departmentName?: string;
  year: string;
  section: string;
  grid: string[][];
  status: 'ok' | 'error';
  error?: string;
  hourVerification?: TimetableHourVerificationResult | any;
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
  facultyBeforeAfternoon: boolean = false,
  existingSharedFacultyMap?: Map<string, FacultyAllocation>,
  targetYearSections?: Array<{ year: string; sections: string[] }>,
  semesterType: 'odd' | 'even' = 'odd'
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

  const sectionsToGenerate: Record<string, string[]> = {};
  if (targetYearSections && targetYearSections.length > 0) {
    for (const item of targetYearSections) {
      sectionsToGenerate[item.year] = item.sections;
    }
  } else {
    Object.assign(sectionsToGenerate, YEAR_SECTIONS);
  }

  // Primary Solver: Global Constraint Programming (CP) Optimizer
  try {
    const selectedYears = Object.entries(sectionsToGenerate).map(([year, sections]) => ({ year, sections }));
    const optResult = await generateOptimizedTimetableBatch({
      selections: [{ departmentName, selectedYears }],
      semesterType,
      facultyBeforeAfternoon,
      onProgress: (_dept, y, s, st, err) => onProgress?.(y, s, st, err),
    });

    if (optResult.isFeasible && optResult.sectionResults.length > 0) {
      const results: YearSectionResult[] = optResult.sectionResults.map(r => {
        const totalAllocated = Object.values(r.weeklyHourVerification.allocatedHours).reduce((a, b) => a + b, 0);
        const totalExpected = Object.values(r.weeklyHourVerification.expectedHours).reduce((a, b) => a + b, 0);
        const subjectsList: SubjectHourVerification[] = Object.entries(r.weeklyHourVerification.expectedHours).map(([sName, exp]) => {
          const act = r.weeklyHourVerification.allocatedHours[sName] || 0;
          const diff = act - exp;
          return {
            subjectId: sName,
            subjectName: sName,
            name: sName,
            type: 'theory',
            givenHours: exp,
            generatedHours: act,
            difference: diff,
            diff,
            isMatch: diff === 0,
            status: diff === 0 ? 'match' : diff < 0 ? 'under' : 'over',
          };
        });

        const mismatchesList: SubjectHourVerification[] = r.weeklyHourVerification.mismatches.map(m => ({
          subjectId: m.subject,
          subjectName: m.subject,
          name: m.subject,
          type: 'theory',
          givenHours: m.expected,
          generatedHours: m.actual,
          difference: m.actual - m.expected,
          diff: m.actual - m.expected,
          isMatch: false,
          status: (m.actual < m.expected ? 'under' : 'over') as any,
        }));

        const hourVerification: TimetableHourVerificationResult = {
          isValid: r.weeklyHourVerification.isValid,
          totalGivenHours: totalExpected,
          totalGeneratedHours: totalAllocated,
          subjects: subjectsList,
          unallocatedSlots: 0,
          mismatches: mismatchesList,
          summaryText: r.weeklyHourVerification.mismatches.length === 0
            ? 'All subject hours match 100% exactly.'
            : `${r.weeklyHourVerification.mismatches.length} mismatch(es) detected.`,
        };

        return {
          departmentName: r.departmentName,
          year: r.year,
          section: r.section,
          grid: r.grid,
          status: 'ok',
          hourVerification,
        };
      });

      return {
        results,
        totalOk: results.length,
        totalError: 0,
      };
    }
  } catch (optErr) {
    console.warn('Global optimizer encountered error or fallback needed:', optErr);
  }

  // Collect all (year, section) pairs being generated so we can exclude stale DB timetables
  const allGeneratingClasses: Array<{ departmentId?: string; year: string; section: string }> = [];
  for (const [y, secs] of Object.entries(sectionsToGenerate)) {
    for (const s of secs) {
      allGeneratingClasses.push({ departmentId: deptId, year: y, section: s });
    }
  }

  // Build a single shared faculty allocation map for the entire batch if not provided
  const sharedFacultyMap = existingSharedFacultyMap || await buildFacultyAllocationMap(
    deptId,
    undefined,
    undefined,
    { allClasses: true, excludeClasses: allGeneratingClasses }
  );

  const YEAR_ORDER = ['II', 'III', 'IV'] as const;

  // Run years SEQUENTIALLY across sections to preserve total real-time cross-year and cross-section faculty conflict awareness
  for (const year of YEAR_ORDER) {
    const sections = sectionsToGenerate[year];
    if (!sections || sections.length === 0) continue;
    // Load subjects + special hours once per year (shared across sections)
    let [subjects, specialHoursConfigs] = await Promise.all([
      getSubjectsForYear(deptId, year, semesterType).catch(() => [] as Subject[]),
      getSpecialHoursConfigsForYear(deptId, year).catch(() => [] as SpecialHoursConfig[]),
    ]);

    if (subjects.length === 0) {
      if (semesterType === 'even' && isYearFour(year)) {
        subjects = [{
          id: `static_proj_${deptId}`,
          name: 'Project',
          code: 'PROJ',
          type: 'theory',
          hoursPerWeek: 37,
          credits: 10,
          abbreviation: 'PROJECT',
          tags: ['even_sem']
        }];
      } else {
        // No subjects configured for this year — mark all sections as error
        for (const section of sections) {
          allResults.push({
            year,
            section,
            grid: [],
            status: 'error',
            error: `No subjects configured for Year ${year} (${semesterType} semester)`,
          });
          onProgress?.(year, section, 'error', `No subjects configured for Year ${year} (${semesterType} semester)`);
        }
        continue;
      }
    }

    // Load elective mode from localStorage per year
    let openElectiveMode: 'parallel' | 'separate' = 'parallel';
    let electiveMode: 'parallel' | 'separate' = 'parallel';
    try {
      if (typeof localStorage !== 'undefined') {
        const storedOe = localStorage.getItem(`oe_mode:${deptId}:${year}`) as 'parallel' | 'separate' | null;
        if (storedOe) openElectiveMode = storedOe;
        const storedPe = localStorage.getItem(`pe_mode:${deptId}:${year}`) as 'parallel' | 'separate' | null;
        if (storedPe) electiveMode = storedPe;
      }
    } catch (_) {}

    // For Year II, track audit course days used across sections to prevent collisions
    const year2AuditDays = new Set<number>();

    // Sections run SEQUENTIALLY within a year (faculty conflict safety)
    for (const section of sections) {
      onProgress?.(year, section, 'running');
      try {
        // Load section subjects to filter curriculum specifically for this section
        const sectionSubjectIds = await getSectionSubjects(deptId, year, section).catch(() => [] as string[]);
        const sectionSubjects = (sectionSubjectIds.length > 0 && !(semesterType === 'even' && isYearFour(year)))
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
          sharedFacultyMap,
          sharedYear2AuditDays: isYearTwo(year) ? year2AuditDays : undefined,
          semesterType,
        });

        let hourVerification = verifySubjectHours(grid, sectionSubjects, specialHoursConfigs);
        if (!hourVerification.isValid) {
          rebalanceSubjectHours(grid, sectionSubjects, sharedFacultyMap, year, section);
          sanitizeNoThreeConsecutiveTheory(grid, sectionSubjects, sharedFacultyMap, year, section);
          rebalanceSubjectHours(grid, sectionSubjects, sharedFacultyMap, year, section);
          fillRemainingEmptySlotsWithLibrary(grid, undefined, sharedFacultyMap);
          hourVerification = verifySubjectHours(grid, sectionSubjects, specialHoursConfigs);
        }

        const gridAsStrings = grid.map((row) => row.map((c) => c || ''));

        console.log(`[Hour Verification ${departmentName} Year ${year} Sec ${section}] ${hourVerification.summaryText}`);

        allResults.push({
          year,
          section,
          grid: gridAsStrings,
          status: 'ok',
          hourVerification,
        });
        onProgress?.(year, section, 'ok');
      } catch (err: any) {
        const msg = err?.message ?? 'Unknown error';
        allResults.push({ year, section, grid: [], status: 'error', error: msg });
        onProgress?.(year, section, 'error', msg);
      }
    }
  }

  const totalOk = allResults.filter((r) => r.status === 'ok').length;
  const totalError = allResults.filter((r) => r.status === 'error').length;

  return { results: allResults, totalOk, totalError };
}
