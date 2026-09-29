import { supabase } from "@/integrations/supabase/client";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DISPLAY_COLUMNS = [
  'PERIOD 1', 'PERIOD 2', 'BREAK', 'PERIOD 3', 'PERIOD 4', 'LUNCH',
  'PERIOD 5', 'PERIOD 6', 'BREAK', 'PERIOD 7'
] as const;

export const TIME_LABELS: Record<string, string> = {
  'PERIOD 1': '9:00–9:55',
  'PERIOD 2': '9:55–10:50',
  'BREAK': '',
  'PERIOD 3': '11:05–12:00',
  'PERIOD 4': '12:00–12:55',
  'LUNCH': '12:55–1:55',
  'PERIOD 5': '1:55–2:50',
  'PERIOD 6': '2:50–3:45',
  'PERIOD 7': '3:55–4:50',
};

// Map display column (0..9) to actual data period (0..6)
export const DISPLAY_COL_TO_PERIOD: (number | null)[] = [0, 1, null, 2, 3, null, 4, 5, null, 6];

// Map actual data period (0..6) to display column (0..9)
export const PERIOD_TO_DISPLAY_COL: number[] = [0, 1, 3, 4, 6, 7, 9];

export function displayColToPeriod(displayColIdx: number): number | null {
  return DISPLAY_COL_TO_PERIOD[displayColIdx] ?? null;
}

export function periodToDisplayCol(periodIdx: number): number {
  return PERIOD_TO_DISPLAY_COL[periodIdx] ?? 0;
}

export function formatSlotLabel(dayIdx: number, periodIdx: number) {
  const dayName = DAYS[dayIdx] || `Day ${dayIdx + 1}`;
  const periodLabel = `P${periodIdx + 1}`;
  const time = TIME_LABELS[`PERIOD ${periodIdx + 1}`] || '';
  return { dayIdx, periodIdx, dayName, periodLabel, time, text: `${dayName} ${periodLabel} (${time})` };
}

/**
 * Normalizes subject names for accurate cross-matching.
 */
export function cleanSubjectName(s: string): string {
  if (!s) return '';
  return s.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(laboratory|lab|practicals|practical)$/, '');
}

export function isSameSubject(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false;
  const n1 = name1.trim().toLowerCase();
  const n2 = name2.trim().toLowerCase();
  if (n1 === n2) return true;
  const c1 = cleanSubjectName(n1);
  const c2 = cleanSubjectName(n2);
  if (c1 && c2 && (c1 === c2 || c1.includes(c2) || c2.includes(c1))) return true;
  return false;
}

/**
 * Normalizes faculty names to detect matches regardless of titles, initials, or spacing.
 */
export function cleanFacultyName(name: string): string {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/^(dr\.|dr|mr\.|mr|mrs\.|mrs|ms\.|ms|prof\.|prof)\s+/i, '')
    .replace(/[^a-z0-9]/g, '');
}

export function isSameFaculty(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false;
  const c1 = cleanFacultyName(name1);
  const c2 = cleanFacultyName(name2);
  if (!c1 || !c2) return false;
  if (c1 === c2) return true;
  if (c1.length > 3 && c2.length > 3 && (c1.includes(c2) || c2.includes(c1))) return true;
  return false;
}

export interface FacultyConflict {
  facultyName: string;
  movingSubject: string;
  sourceSlot: { day: number; period: number; dayName: string; periodLabel: string; time: string };
  targetSlot: { day: number; period: number; dayName: string; periodLabel: string; time: string };
  conflictingSection: {
    department: string;
    year: string;
    section: string;
    subject: string;
  };
  reason: string;
}

export interface SwapConflictCheckResult {
  hasConflict: boolean;
  conflicts: FacultyConflict[];
  sourceFaculties: string[];
  targetFaculties: string[];
}

export interface TimetableResultLike {
  departmentName: string;
  year: string;
  section: string;
  grid: string[][];
  status?: string;
}

interface GlobalConflictCache {
  assignments: any[];
  facultyMembers: Map<string, string>; // facultyId -> name
  subjects: Map<string, any>; // subjectId -> subject
  departments: Map<string, string>; // deptId -> name
  dbTimetables: any[]; // all published timetables
  lastFetched: number;
}

let cache: GlobalConflictCache | null = null;
const CACHE_TTL = 30000; // 30 seconds cache

/**
 * Loads all faculty subject assignments, faculty members, subjects, departments,
 * and existing timetables from the database to enable comprehensive cross-timetable checking.
 */
export async function loadGlobalConflictData(forceRefresh = false): Promise<GlobalConflictCache> {
  const now = Date.now();
  if (cache && !forceRefresh && (now - cache.lastFetched < CACHE_TTL)) {
    return cache;
  }

  try {
    const [
      { data: assignments },
      { data: facultyMembers },
      { data: subjects },
      { data: dbTimetables },
      { data: departments }
    ] = await Promise.all([
      supabase.from('faculty_subject_assignments').select('*'),
      supabase.from('faculty_members').select('id, name'),
      supabase.from('subjects').select('*'),
      supabase.from('timetables').select('*, departments(name)'),
      supabase.from('departments').select('id, name')
    ]);

    const facMap = new Map<string, string>();
    (facultyMembers || []).forEach(f => facMap.set(f.id, f.name));

    const subMap = new Map<string, any>();
    (subjects || []).forEach(s => subMap.set(s.id, s));

    const deptMap = new Map<string, string>();
    (departments || []).forEach(d => deptMap.set(d.id, d.name));

    cache = {
      assignments: assignments || [],
      facultyMembers: facMap,
      subjects: subMap,
      departments: deptMap,
      dbTimetables: dbTimetables || [],
      lastFetched: now,
    };
    return cache;
  } catch (error) {
    console.warn("Failed to load global conflict data from database:", error);
    if (cache) return cache;
    return {
      assignments: [],
      facultyMembers: new Map(),
      subjects: new Map(),
      departments: new Map(),
      dbTimetables: [],
      lastFetched: now,
    };
  }
}

/**
 * Resolves all faculty members assigned to a subject in a specific department, year, and section.
 * Checks both database assignment records and locally loaded subjectsData.
 */
export function getFacultyForSubject(
  subjectName: string,
  deptName: string,
  year: string,
  section: string,
  subjectsData?: Record<string, any[]>,
  specialHoursData?: Record<string, any[]>,
  classCounselorMap?: Record<string, string>
): string[] {
  if (!subjectName) return [];
  const trimmed = subjectName.trim();
  if (trimmed === 'BREAK' || trimmed === 'LUNCH') return [];

  const faculties = new Set<string>();

  // Check special cases like "Seminar (Dr. Smith)"
  const specialMatch = trimmed.match(/^(.*?)\s*\((.*?)\)$/);
  if (specialMatch && specialMatch[2]) {
    faculties.add(specialMatch[2].trim());
    return Array.from(faculties);
  }

  // Check if it's Counselling/Library with class counselor
  const counselorKey = `${deptName}_${year}_${section}`;
  if (/counsell|library/i.test(trimmed) && classCounselorMap?.[counselorKey]) {
    faculties.add(classCounselorMap[counselorKey]);
    return Array.from(faculties);
  }

  // Handle composite subjects like "Subject A / Subject B" (parallel electives)
  const parts = trimmed.includes(' / ') ? trimmed.split(' / ').map(p => p.trim()) : [trimmed];

  for (const part of parts) {
    if (!part || part.toLowerCase().includes('open elective')) continue;

    const pClean = cleanSubjectName(part);
    const pLower = part.toLowerCase().trim();

    // 1. Check in cached global DB assignments if available
    if (cache && cache.assignments.length > 0) {
      for (const a of cache.assignments) {
        const dName = cache.departments.get(a.department_id) || '';
        if (dName && deptName && dName.toLowerCase() !== deptName.toLowerCase()) {
          // Check if acronyms match (e.g. "AIDS" vs "Artificial Intelligence and Data Science")
          const isDeptMatch = (deptName === 'AIDS' && dName.includes('Data')) ||
                              (deptName === 'IT' && dName.includes('Technology'));
          if (!isDeptMatch) continue;
        }

        if (a.year !== year) continue;
        if (a.section && a.section !== '*' && section && a.section !== section) continue;

        const sub = cache.subjects.get(a.subject_id);
        if (!sub) continue;

        const subClean = cleanSubjectName(sub.name);
        const subCode = (sub.code || '').toLowerCase().trim();

        if (subClean === pClean || isSameSubject(sub.name, part) || subCode === pLower) {
          const facName = cache.facultyMembers.get(a.faculty_id);
          if (facName && facName.trim()) {
            faculties.add(facName.trim());
          }
        }
      }
    }

    // 2. Check in subjectsData passed from caller
    if (subjectsData) {
      const yearKey = `${deptName}_${year}`;
      const searchLists = [
        subjectsData[yearKey] || [],
        ...Object.values(subjectsData)
      ];

      for (const list of searchLists) {
        const found = list.find((s: any) =>
          isSameSubject(s.name, part) || ((s.code || '').toLowerCase().trim() === pLower)
        );

        if (found) {
          const fac = found.facultyBySection?.[section] || found.staff || '';
          if (fac && typeof fac === 'string' && fac.trim()) {
            faculties.add(fac.trim());
          }
        }
      }
    }
  }

  return Array.from(faculties);
}

/**
 * Deeply checks whether swapping two slots in a section's timetable
 * creates any faculty schedule conflict across:
 * 1. All currently generated timetables (in memory)
 * 2. All saved timetables in the database (across ALL departments, years, and sections)
 */
export async function checkSwapFacultyConflict(
  source: { day: number; period: number },
  target: { day: number; period: number },
  activeClass: { departmentName: string; year: string; section: string },
  generatedResults: TimetableResultLike[],
  subjectsData?: Record<string, any[]>,
  specialHoursData?: Record<string, any[]>,
  classCounselorMap?: Record<string, string>
): Promise<SwapConflictCheckResult> {
  // If dragged onto the exact same slot, no-op
  if (source.day === target.day && source.period === target.period) {
    return { hasConflict: false, conflicts: [], sourceFaculties: [], targetFaculties: [] };
  }

  // Ensure global database cache is loaded
  const dbContext = await loadGlobalConflictData();

  // Find active timetable in generatedResults
  const activeResult = generatedResults.find(
    r => r.departmentName === activeClass.departmentName &&
         r.year === activeClass.year &&
         r.section === activeClass.section
  );

  if (!activeResult || !Array.isArray(activeResult.grid)) {
    return { hasConflict: false, conflicts: [], sourceFaculties: [], targetFaculties: [] };
  }

  // S1 at source slot; S4 at target slot
  const subjectSource = activeResult.grid[source.day]?.[source.period] || '';
  const subjectTarget = activeResult.grid[target.day]?.[target.period] || '';

  // Get faculties for S1 (moving to target slot)
  const sourceFaculties = getFacultyForSubject(
    subjectSource,
    activeClass.departmentName,
    activeClass.year,
    activeClass.section,
    subjectsData,
    specialHoursData,
    classCounselorMap
  );

  // Get faculties for S4 (moving to source slot)
  const targetFaculties = getFacultyForSubject(
    subjectTarget,
    activeClass.departmentName,
    activeClass.year,
    activeClass.section,
    subjectsData,
    specialHoursData,
    classCounselorMap
  );

  const conflicts: FacultyConflict[] = [];

  const sourceSlotInfo = formatSlotLabel(source.day, source.period);
  const targetSlotInfo = formatSlotLabel(target.day, target.period);

  // Helper to compile all comparison timetables across generatedResults + dbTimetables
  // generatedResults takes priority over dbTimetables for the same (dept, year, sec)
  const allTimetablesToCheck: Array<{
    departmentName: string;
    year: string;
    section: string;
    grid: string[][];
  }> = [];

  const seenKeys = new Set<string>();

  // 1. Add all generatedResults
  for (const r of generatedResults) {
    const key = `${r.departmentName}_${r.year}_${r.section}`;
    seenKeys.add(key);
    allTimetablesToCheck.push({
      departmentName: r.departmentName,
      year: r.year,
      section: r.section,
      grid: r.grid,
    });
  }

  // 2. Add all dbTimetables that were not in generatedResults
  for (const dbT of dbContext.dbTimetables) {
    const deptName = dbT.departments?.name || dbContext.departments.get(dbT.department_id) || '';
    const key = `${deptName}_${dbT.year}_${dbT.section}`;
    if (!seenKeys.has(key) && Array.isArray(dbT.grid_data)) {
      seenKeys.add(key);
      allTimetablesToCheck.push({
        departmentName: deptName,
        year: dbT.year,
        section: dbT.section,
        grid: dbT.grid_data,
      });
    }
  }

  // CHECK 1: Subject from target slot (e.g. S4) is moving to source slot (e.g. Monday 2nd hr).
  // Check if any faculty assigned to S4 already has a class on Monday 2nd hr in ANY OTHER timetable!
  for (const fac of targetFaculties) {
    for (const other of allTimetablesToCheck) {
      // Skip the active timetable (the source slot in Section A is being vacated by subjectSource!)
      if (
        other.departmentName === activeClass.departmentName &&
        other.year === activeClass.year &&
        other.section === activeClass.section
      ) {
        continue;
      }

      const occSubject = other.grid?.[source.day]?.[source.period];
      if (!occSubject || occSubject === 'BREAK' || occSubject === 'LUNCH') continue;

      const occFaculties = getFacultyForSubject(
        occSubject,
        other.departmentName,
        other.year,
        other.section,
        subjectsData,
        specialHoursData,
        classCounselorMap
      );

      for (const occFac of occFaculties) {
        if (isSameFaculty(fac, occFac)) {
          conflicts.push({
            facultyName: fac,
            movingSubject: subjectTarget,
            sourceSlot: targetSlotInfo,
            targetSlot: sourceSlotInfo,
            conflictingSection: {
              department: other.departmentName,
              year: other.year,
              section: other.section,
              subject: occSubject,
            },
            reason: `${fac} is already scheduled to teach "${occSubject}" in ${other.departmentName} Year ${other.year} — Section ${other.section} on ${sourceSlotInfo.dayName} ${sourceSlotInfo.periodLabel} (${sourceSlotInfo.time}).`
          });
        }
      }
    }
  }

  // CHECK 2: Subject from source slot (e.g. S1) is moving to target slot (e.g. Monday 3rd hr).
  // Check if any faculty assigned to S1 already has a class on Monday 3rd hr in ANY OTHER timetable!
  for (const fac of sourceFaculties) {
    for (const other of allTimetablesToCheck) {
      // Skip the active timetable (the target slot in Section A is being vacated by subjectTarget!)
      if (
        other.departmentName === activeClass.departmentName &&
        other.year === activeClass.year &&
        other.section === activeClass.section
      ) {
        continue;
      }

      const occSubject = other.grid?.[target.day]?.[target.period];
      if (!occSubject || occSubject === 'BREAK' || occSubject === 'LUNCH') continue;

      const occFaculties = getFacultyForSubject(
        occSubject,
        other.departmentName,
        other.year,
        other.section,
        subjectsData,
        specialHoursData,
        classCounselorMap
      );

      for (const occFac of occFaculties) {
        if (isSameFaculty(fac, occFac)) {
          conflicts.push({
            facultyName: fac,
            movingSubject: subjectSource,
            sourceSlot: sourceSlotInfo,
            targetSlot: targetSlotInfo,
            conflictingSection: {
              department: other.departmentName,
              year: other.year,
              section: other.section,
              subject: occSubject,
            },
            reason: `${fac} is already scheduled to teach "${occSubject}" in ${other.departmentName} Year ${other.year} — Section ${other.section} on ${targetSlotInfo.dayName} ${targetSlotInfo.periodLabel} (${targetSlotInfo.time}).`
          });
        }
      }
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
    sourceFaculties,
    targetFaculties,
  };
}
