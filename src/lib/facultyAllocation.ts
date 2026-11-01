import { supabase } from "@/integrations/supabase/client";
import { Subject } from "@/store/timetableStore";
import type { Grid } from "./timetable";

import { getExternalFacultySlots } from "./facultyExternalSlotsService";
import { cleanSubjectName } from "./optimizer/types";

export interface FacultyAssignmentRecord {
  subjectId: string;
  year?: string | null;
  section?: string | null;
  departmentId?: string | null;
}

export interface FacultyAllocation {
  facultyId: string;
  facultyName: string;
  departmentId?: string;
  designation?: string;
  assignedSlots: Set<string>; // e.g., "mon-p1", "tue-p3"
  availableSlots: Set<string>;
  dailyHours: number[]; // teaching hours per day [Mon, Tue, Wed, Thu, Fri, Sat] (indices 0..5)
  labPreference: boolean;
  subjectIds: Set<string>; // subjects this faculty teaches
  assignments?: FacultyAssignmentRecord[]; // detailed assignments with year/section
  isClassCounselor: boolean;
  assignedSlotTypes?: Map<string, 'theory' | 'lab' | 'special'>;
}

export interface FacultySlotConstraintOptions {
  mode?: 'strict' | 'relaxed' | 'force';
  preferBeforeAfternoonForProf?: boolean;
}

export interface Slot {
  day: number;
  period: number;
}

export interface AllocationResult {
  success: boolean;
  facultyId?: string;
  facultyName?: string;
  day: number;
  period: number;
  conflictReason?: string;
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat"] as const;
const PERIODS = 7;

/**
 * Creates a slot identifier for quick lookup
 */
export function createSlotId(day: number, period: number): string {
  return `${DAYS[day]}-p${period + 1}`;
}

/**
 * Normalizes year strings (e.g. 'II' -> 'II', '2' -> 'II')
 */
function normYear(y?: string | null): string {
  if (!y) return '';
  const s = String(y).trim().toUpperCase();
  if (s === '1' || s === 'I') return 'I';
  if (s === '2' || s === 'II') return 'II';
  if (s === '3' || s === 'III') return 'III';
  if (s === '4' || s === 'IV') return 'IV';
  return s;
}

/**
 * Normalizes section strings
 */
function normSec(s?: string | null): string {
  if (!s) return '';
  return String(s).trim().toUpperCase().replace(/^SEC(TION)?\s*/i, '');
}

/**
 * Fetches existing faculty allocations from all timetables
 */
export async function fetchFacultyExistingAllocations(
  departmentId?: string,
  excludeClasses?: Array<{ departmentId?: string; year: string; section: string }>,
  semesterType?: 'odd' | 'even'
): Promise<Map<string, Set<string>>> {
  const facultyAllocations = new Map<string, Set<string>>();
  
  try {
    // Get all timetables across all departments to track true global faculty availability
    const { data: timetables, error } = await supabase
      .from('timetables')
      .select('grid_data, year, section, department_id, special_flags');

    if (error) throw error;

    // Get all faculty subject assignments across the department/college
    const { data: assignments, error: assignError } = await supabase
      .from('faculty_subject_assignments')
      .select(`
        faculty_id,
        subject_id,
        year,
        section,
        faculty_members!inner(name, designation)
      `);

    if (assignError) throw assignError;

    // Get all faculty members
    const { data: allFacMembers } = await supabase
      .from('faculty_members')
      .select('id, name');
    const facNameToId = new Map<string, string>();
    (allFacMembers || []).forEach((f: any) => {
      facNameToId.set(f.name.trim().toLowerCase(), f.id);
    });

    // Build section-specific subject-to-faculty mapping
    const subjectSectionToFaculty = new Map<string, { facultyId: string; facultyName: string }[]>();
    const generalSubjectToFaculty = new Map<string, { facultyId: string; facultyName: string }[]>();

    (assignments || []).forEach((assignment: any) => {
      const facObj = {
        facultyId: assignment.faculty_id,
        facultyName: assignment.faculty_members?.name || 'Unknown'
      };

      const y = normYear(assignment.year);
      const s = normSec(assignment.section);
      const specificKey = `${assignment.subject_id}:${y}:${s}`;

      if (!subjectSectionToFaculty.has(specificKey)) {
        subjectSectionToFaculty.set(specificKey, []);
      }
      subjectSectionToFaculty.get(specificKey)!.push(facObj);

      if (!generalSubjectToFaculty.has(assignment.subject_id)) {
        generalSubjectToFaculty.set(assignment.subject_id, []);
      }
      generalSubjectToFaculty.get(assignment.subject_id)!.push(facObj);
    });

    // Get all subjects to map names to IDs and check staff column
    const { data: subjects, error: subjectError } = await supabase
      .from('subjects')
      .select('id, name, department_id, staff, year, type');

    if (subjectError) throw subjectError;

    const subjectNameToId = new Map<string, string>();
    const subjectStaffMap = new Map<string, string>();
    const subjectTypeMap = new Map<string, string>();

    (subjects || []).forEach((subject: any) => {
      subjectNameToId.set(subject.name.trim().toLowerCase(), subject.id);
      if (subject.staff) {
        subjectStaffMap.set(subject.id, subject.staff);
      }
      if (subject.type) {
        subjectTypeMap.set(subject.id, subject.type);
      }
    });

    // Helper to find faculty for a cell text within a specific timetable class
    const resolveFacultiesForCell = (
      cellStr: string,
      ttYear: string,
      ttSection: string
    ): Array<{ facultyId: string; facultyName: string }> => {
      const results: Array<{ facultyId: string; facultyName: string }> = [];

      // Handle special cases like "Seminar (Faculty Name)"
      const specialMatch = cellStr.match(/^(.*?)\s*\((.*?)\)$/);
      if (specialMatch) {
        const [, , facultyName] = specialMatch;
        const trimmedFacName = facultyName.trim();
        const foundId = facNameToId.get(trimmedFacName.toLowerCase());
        if (foundId) {
          return [{ facultyId: foundId, facultyName: trimmedFacName }];
        }
        const assignMatch = (assignments || []).find((a: any) =>
          a.faculty_members?.name?.trim().toLowerCase() === trimmedFacName.toLowerCase()
        );
        if (assignMatch) {
          return [{ facultyId: assignMatch.faculty_id, facultyName: assignMatch.faculty_members?.name }];
        }
      }

      // Handle parallel electives (separated by ' / ')
      const parts = cellStr.includes(' / ') ? cellStr.split(' / ').map(p => p.trim()) : [cellStr];

      for (const part of parts) {
        let subId = subjectNameToId.get(part.toLowerCase());
        if (!subId) {
          const partIsLab = /\blabs?\b|\blaboratory\b|\bpracticals?\b/i.test(part);
          const found = (subjects || []).find((s: any) => {
            const sIsLab = s.type === 'lab' || /\blabs?\b|\blaboratory\b|\bpracticals?\b/i.test(s.name || '');
            if (partIsLab !== sIsLab) return false;
            return (
              (s.abbreviation && s.abbreviation.trim().toLowerCase() === part.toLowerCase()) ||
              (s.code && s.code.trim().toLowerCase() === part.toLowerCase()) ||
              (cleanSubjectName(s.name) === cleanSubjectName(part)) ||
              (/^SSA\b|soft\s*skill|aptitude/i.test(part) && /soft\s*skill|aptitude|\bSSA\b/i.test(s.name) && (!ttYear || !s.year || normYear(s.year) === normYear(ttYear)))
            );
          });
          if (found) subId = found.id;
        }
        if (subId) {
          const specificKey = `${subId}:${ttYear}:${ttSection}`;
          const specificMatches = subjectSectionToFaculty.get(specificKey);
          if (specificMatches && specificMatches.length > 0) {
            results.push(...specificMatches);
            continue;
          }

          const yearKey = `${subId}:${ttYear}:`;
          const yearMatches = subjectSectionToFaculty.get(yearKey);
          if (yearMatches && yearMatches.length > 0) {
            results.push(...yearMatches);
            continue;
          }

          const generalMatches = generalSubjectToFaculty.get(subId);
          if (generalMatches && generalMatches.length > 0) {
            results.push(...generalMatches);
            continue;
          }

          // Fallback to staff column on subject
          const staffName = subjectStaffMap.get(subId);
          if (staffName) {
            const foundId = facNameToId.get(staffName.trim().toLowerCase());
            if (foundId) {
              results.push({ facultyId: foundId, facultyName: staffName });
            }
          }
        }
      }

      return results;
    };

    // Process each timetable
    (timetables || []).forEach((timetable: any) => {
      // Filter by semester if specified
      if (semesterType) {
        const ttSem = timetable.special_flags?.semesterType || 'odd';
        if (ttSem !== semesterType) return;
      }

      // Exclude timetables for classes currently being regenerated so stale data does not block them
      if (excludeClasses && excludeClasses.some(ex =>
        (!ex.departmentId || ex.departmentId === timetable.department_id) &&
        normYear(ex.year) === normYear(timetable.year) &&
        normSec(ex.section) === normSec(timetable.section)
      )) {
        return;
      }

      const grid: string[][] = timetable.grid_data || [];
      const ttYear = normYear(timetable.year);
      const ttSec = normSec(timetable.section);

      grid.forEach((dayRow, dayIndex) => {
        if (!dayRow || dayIndex >= 6) return;

        dayRow.forEach((cell, periodIndex) => {
          if (!cell || cell === null || periodIndex >= PERIODS) return;

          const cellStr = String(cell).trim();
          if (!cellStr || cellStr === '-' || cellStr.toUpperCase() === 'FREE') return;

          const matchedFaculties = resolveFacultiesForCell(cellStr, ttYear, ttSec);
          if (matchedFaculties.length === 0) return;

          const slotId = createSlotId(dayIndex, periodIndex);

          matchedFaculties.forEach(fac => {
            if (!facultyAllocations.has(fac.facultyId)) {
              facultyAllocations.set(fac.facultyId, new Set());
            }
            facultyAllocations.get(fac.facultyId)!.add(slotId);
          });
        });
      });
    });

    // Also include cross-department external slots so global faculty availability is fully conflict-aware
    try {
      const extSlots = await getExternalFacultySlots(undefined, semesterType);
      extSlots.forEach(ext => {
        if (ext.day >= 0 && ext.day < 6 && ext.period >= 0 && ext.period < PERIODS) {
          const slotId = createSlotId(ext.day, ext.period);
          if (!facultyAllocations.has(ext.faculty_id)) {
            facultyAllocations.set(ext.faculty_id, new Set());
          }
          facultyAllocations.get(ext.faculty_id)!.add(slotId);
        }
      });
    } catch (_) {}

  } catch (error) {
    console.error('Error fetching faculty allocations:', error);
  }

  return facultyAllocations;
}

/**
 * Builds faculty allocation map with availability and preferences
 */
export async function buildFacultyAllocationMap(
  departmentId?: string,
  year?: string,
  section?: string,
  options?: {
    allClasses?: boolean;
    excludeClasses?: Array<{ departmentId?: string; year: string; section: string }>;
    semesterType?: 'odd' | 'even';
  }
): Promise<Map<string, FacultyAllocation>> {
  const facultyMap = new Map<string, FacultyAllocation>();
  
  try {
    // Get existing allocations across all active timetables (excluding classes being regenerated)
    const existingAllocations = await fetchFacultyExistingAllocations(departmentId, options?.excludeClasses, options?.semesterType);
    
    // Get faculty members
    let facultyQuery = supabase
      .from('faculty_members')
      .select('id, name, takes_electives, department_id, designation');
    if (departmentId && !options?.allClasses) {
      facultyQuery = facultyQuery.eq('department_id', departmentId);
    }
    if (options?.semesterType === 'even') {
      facultyQuery = facultyQuery.eq('takes_electives', 'even');
    } else if (options?.semesterType === 'odd') {
      facultyQuery = facultyQuery.or('takes_electives.eq.odd,takes_electives.is.null');
    }
    const { data: faculty, error: facultyError } = await facultyQuery;

    if (facultyError) throw facultyError;

    // Get class counselor info for this specific class
    let classCounselor: { faculty_id: string } | null = null;
    if (departmentId && year && section) {
      try {
        const { data, error: ccError } = await supabase
          .rpc('get_class_counselor_info', {
            dept_id: departmentId,
            year_param: year,
            section_param: section
          });
        
        if (!ccError && data && data.length > 0) {
          classCounselor = { faculty_id: data[0].faculty_id };
        }
      } catch (error) {
        console.warn('Could not fetch class counselor, continuing without CC info:', error);
      }
    }

    // Get faculty subject assignments
    let assignQuery = supabase
      .from('faculty_subject_assignments')
      .select('faculty_id, subject_id, year, section, department_id');
    if (departmentId && !options?.allClasses) {
      assignQuery = assignQuery.eq('department_id', departmentId);
      if (year && section) {
        assignQuery = assignQuery.eq('year', year).or(`section.eq.${section},section.is.null`);
      }
    }

    const { data: assignments, error: assignError } = await assignQuery;
    if (assignError) throw assignError;

    // Build faculty-to-subjects mapping and detailed assignment records
    const facultySubjects = new Map<string, Set<string>>();
    const facultyAssignments = new Map<string, FacultyAssignmentRecord[]>();
    (assignments || []).forEach((assignment: any) => {
      if (!facultySubjects.has(assignment.faculty_id)) {
        facultySubjects.set(assignment.faculty_id, new Set());
      }
      facultySubjects.get(assignment.faculty_id)!.add(assignment.subject_id);

      if (!facultyAssignments.has(assignment.faculty_id)) {
        facultyAssignments.set(assignment.faculty_id, []);
      }
      facultyAssignments.get(assignment.faculty_id)!.push({
        subjectId: assignment.subject_id,
        year: assignment.year,
        section: assignment.section,
        departmentId: assignment.department_id,
      });
    });

    // Build allocation map for each faculty
    (faculty || []).forEach((f: any) => {
      const assignedSlots = existingAllocations.get(f.id) || new Set();
      const isClassCounselor = Boolean(classCounselor?.faculty_id === f.id);
      const availableSlots = new Set<string>();
      
      // Calculate available slots (all slots minus assigned ones)
      for (let day = 0; day < 6; day++) {
        for (let period = 0; period < PERIODS; period++) {
          const slotId = createSlotId(day, period);
          
          // Reserve Saturday P3-P7 for class counselor
          if (isClassCounselor && day === 5 && period >= 2) {
            continue;
          }
          
          if (!assignedSlots.has(slotId)) {
            availableSlots.add(slotId);
          }
        }
      }
      
      const dailyHours = [0, 0, 0, 0, 0, 0];
      assignedSlots.forEach(slotId => {
        const prefix = slotId.split('-')[0].toLowerCase();
        const d = DAYS.indexOf(prefix as any);
        if (d >= 0 && d < 6) {
          dailyHours[d]++;
        }
      });

      facultyMap.set(f.id, {
        facultyId: f.id,
        facultyName: f.name,
        departmentId: f.department_id,
        designation: f.designation || undefined,
        assignedSlots,
        availableSlots,
        dailyHours,
        // takes_electives is only for open electives; do not disable lab if null or true
        labPreference: f.takes_electives !== false,
        subjectIds: facultySubjects.get(f.id) || new Set(),
        assignments: facultyAssignments.get(f.id) || [],
        isClassCounselor,
        assignedSlotTypes: new Map(),
      });
    });

  } catch (error) {
    console.error('Error building faculty allocation map:', error);
  }

  return facultyMap;
}

/**
 * Checks if a subject is taught by a Professor or Associate Professor / HOD
 */
export function isSubjectTaughtByProfessor(
  subjectId: string,
  facultyMap: Map<string, FacultyAllocation>,
  year?: string,
  section?: string
): boolean {
  if (!facultyMap || facultyMap.size === 0) return false;
  const subjectIds = subjectId.includes('_') ? subjectId.split('_') : [subjectId];
  for (const subId of subjectIds) {
    for (const faculty of facultyMap.values()) {
      const teachesSubject = faculty.assignments?.some(a =>
        a.subjectId === subId &&
        (!a.year || !year || normYear(a.year) === normYear(year)) &&
        (!a.section || !section || normSec(a.section) === normSec(section))
      ) || faculty.subjectIds.has(subId);

      if (teachesSubject) {
        const desig = (faculty.designation || '').toLowerCase();
        if (
          desig.includes('professor') ||
          desig.includes('prof') ||
          desig.includes('assoc') ||
          desig.includes('hod') ||
          desig.includes('head')
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Evaluates whether a faculty member can take a given slot based on:
 * 1. Hard availability (never double-booked across any classes)
 * 2. Lab preferences
 * 3. Professor morning requirement (must come before afternoon: periods 0..3)
 * 4. Maximum 2 consecutive theory teaching hours (3 consecutive hours strictly forbidden)
 * 5. Rest spacing: if 1st and 2nd hours are taught, 3rd and 4th hours must be free
 * 6. Daily free hours: at least 3 hours free per day (max 4 teaching hours per day, fallback to 5 in rare strict cases)
 */
export function canFacultyTakeSlot(
  faculty: FacultyAllocation,
  day: number,
  period: number,
  isLabSubject: boolean = false,
  mode: 'strict' | 'relaxed' | 'force' = 'strict'
): { allowed: boolean; reason?: string; penalty: number } {
  const slotId = createSlotId(day, period);

  // 1. HARD AVAILABILITY: Absolutely NO double-booking across any class
  if (!faculty.availableSlots.has(slotId)) {
    return { allowed: false, reason: `Faculty is already busy at ${slotId}`, penalty: 10000 };
  }

  // 2. Lab preference
  if (isLabSubject && faculty.labPreference === false) {
    return { allowed: false, reason: `Faculty prefers not to take labs`, penalty: 5000 };
  }

  let penalty = 0;
  const desig = (faculty.designation || '').toLowerCase();
  const isProf =
    desig.includes('professor') ||
    desig.includes('prof') ||
    desig.includes('assoc') ||
    desig.includes('hod') ||
    desig.includes('head');

  // 3. PROFESSOR TIMING: Must come before afternoon (periods 0..3 = P1 to P4; periods >= 4 = afternoon)
  if (isProf && period >= 4) {
    if (mode === 'strict') {
      return { allowed: false, reason: `Professors must teach before afternoon (Periods 1-4)`, penalty: 2000 };
    }
    penalty += 300;
  }

  // Gather assigned periods on this day
  const assignedPeriodsOnDay = new Set<number>();
  for (let pr = 0; pr < PERIODS; pr++) {
    if (faculty.assignedSlots.has(createSlotId(day, pr))) {
      assignedPeriodsOnDay.add(pr);
    }
  }

  const currentDailyLoad = faculty.dailyHours?.[day] || 0;

  // Helper to test if a period on this day was assigned as theory (not lab or special hour)
  const isTheorySlot = (pr: number) => {
    if (!assignedPeriodsOnDay.has(pr)) return false;
    const type = faculty.assignedSlotTypes?.get(createSlotId(day, pr));
    return type !== 'lab' && type !== 'special';
  };

  // 4. THEORY SPACING & REST RULES
  // Applies strictly to regular theory classes on weekdays (days 0..4).
  // Institutional special hours on Saturday (day 5) for Class Counselors and continuous lab sessions are exempted!
  if (!isLabSubject && day !== 5) {
    // 4a. STRICTLY FORBIDDEN: 3 or more consecutive theory teaching hours
    // Check (p-1, p, p+1), (p-2, p-1, p), (p, p+1, p+2)
    const wouldBe3Consecutive =
      (isTheorySlot(period - 1) && isTheorySlot(period + 1)) ||
      (isTheorySlot(period - 1) && isTheorySlot(period - 2)) ||
      (isTheorySlot(period + 1) && isTheorySlot(period + 2));

    if (wouldBe3Consecutive) {
      if (mode !== 'force') {
        return { allowed: false, reason: `Faculty cannot teach 3 consecutive theory hours`, penalty: 1500 };
      }
      penalty += 600;
    }

    // 4b. 2 CONSECUTIVE HOURS REST RULE:
    // If faculty teaches 2 consecutive hours (e.g. 1st and 2nd hr), then subsequent periods (3rd & 4th hr) must be free!
    if (isTheorySlot(period - 1)) {
      // Teaching period-1 and period (e.g. P1 and P2)
      // If period+1 or period+2 is already scheduled, violates the 3rd & 4th hr rest rule
      if (isTheorySlot(period + 1) || isTheorySlot(period + 2)) {
        if (mode === 'strict') {
          return { allowed: false, reason: `Faculty requires 3rd and 4th hr free after 2 consecutive periods`, penalty: 800 };
        }
        penalty += 250;
      }
    }

    if (isTheorySlot(period + 1)) {
      // Teaching period and period+1
      // Previous hours (period-1, period-2) must be free
      if (isTheorySlot(period - 1) || isTheorySlot(period - 2)) {
        if (mode === 'strict') {
          return { allowed: false, reason: `Faculty requires rest around 2 consecutive teaching periods`, penalty: 800 };
        }
        penalty += 250;
      }
    }

    // 4c. If faculty just finished a 2-hour block earlier today (e.g. periods period-2 and period-3 were taught)
    // Then period-1 and candidate period must be free (providing 2 rest periods)
    if (isTheorySlot(period - 2) && isTheorySlot(period - 3)) {
      if (mode === 'strict') {
        return { allowed: false, reason: `Faculty needs 2 consecutive rest periods after prior 2-hour block`, penalty: 700 };
      }
      penalty += 200;
    }

    // 4d. Single-period rest preference:
    // If period-1 or period+1 is already assigned as theory, add moderate penalty in strict mode so isolated slots with rest are chosen first
    if (isTheorySlot(period - 1) || isTheorySlot(period + 1)) {
      penalty += 75;
    }
  }

  // 5. DAILY FREE HOURS RULE:
  // "for 1 day 3 hrs free need to be there"
  // Out of 7 periods, 3 free hours means maximum 4 teaching hours per day (7 - 3 = 4).
  // Applies to weekdays (days 0..4); Saturday institutional special slots for CCs are exempted.
  if (day !== 5 && currentDailyLoad >= 4) {
    if (mode === 'strict') {
      return { allowed: false, reason: `Faculty must have at least 3 free hours per day (max 4 teaching hours)`, penalty: 900 };
    } else if (mode === 'relaxed') {
      if (currentDailyLoad >= 5) {
        return { allowed: false, reason: `Faculty daily teaching limit exceeded (max 5 hrs)`, penalty: 1200 };
      }
      penalty += 350;
    } else {
      // Force mode: Allow up to 5 teaching hours as rare fallback ("strict case")
      if (currentDailyLoad >= 6) {
        return { allowed: false, reason: `Faculty cannot teach 6 or more hours in a day`, penalty: 2000 };
      }
      penalty += 450;
    }
  }

  // Base fitness penalty: prefer faculty with lower daily load and lower total weekly load
  penalty += currentDailyLoad * 15 + faculty.assignedSlots.size;

  return { allowed: true, penalty };
}

/**
 * Finds available faculty for a subject at a specific time slot with complete rest and spacing checks.
 * Supports combined subject IDs (separated by '_') for parallel electives.
 * Supports year and section to match exact teacher-section assignments.
 */
export function findAvailableFacultyForSlot(
  subjectId: string,
  day: number,
  period: number,
  facultyMap: Map<string, FacultyAllocation>,
  isLabSubject: boolean = false,
  year?: string,
  section?: string,
  options?: FacultySlotConstraintOptions
): AllocationResult {
  const slotId = createSlotId(day, period);
  const subjectIds = subjectId.includes('_') ? subjectId.split('_') : [subjectId];
  const reqMode = options?.mode || 'strict';

  const allocatedFacultyIds: string[] = [];
  const allocatedFacultyNames: string[] = [];

  for (const subId of subjectIds) {
    // Find faculty who teach this subject (matching section if available)
    const eligibleFaculty = Array.from(facultyMap.values()).filter(faculty => {
      if (faculty.assignments && faculty.assignments.length > 0) {
        const hasMatchingAssgn = faculty.assignments.some(a =>
          a.subjectId === subId &&
          (!a.year || !year || normYear(a.year) === normYear(year)) &&
          (!a.section || !section || normSec(a.section) === normSec(section))
        );
        if (hasMatchingAssgn) return true;
      }
      return faculty.subjectIds.has(subId);
    });

    if (eligibleFaculty.length === 0) {
      // No faculty assigned — allowed (continue)
      continue;
    }

    // Prioritize section-specific matches if multiple faculty teach this subject
    let candidateFaculty = eligibleFaculty;
    if (year && section && eligibleFaculty.length > 1) {
      const sectionSpecific = eligibleFaculty.filter(faculty =>
        faculty.assignments?.some(a =>
          a.subjectId === subId &&
          a.year && normYear(a.year) === normYear(year) &&
          a.section && normSec(a.section) === normSec(section)
        )
      );
      if (sectionSpecific.length > 0) {
        candidateFaculty = sectionSpecific;
      }
    }

    // Try evaluation in requested mode, then fall back to relaxed, then force if needed
    const modesToTry: Array<'strict' | 'relaxed' | 'force'> =
      reqMode === 'strict'
        ? ['strict', 'relaxed', 'force']
        : reqMode === 'relaxed'
        ? ['relaxed', 'force']
        : ['force'];

    let bestFaculty: FacultyAllocation | null = null;
    let minPenalty = Infinity;

    for (const testMode of modesToTry) {
      const scoredCandidates: Array<{ faculty: FacultyAllocation; penalty: number }> = [];

      for (const fac of candidateFaculty) {
        const check = canFacultyTakeSlot(fac, day, period, isLabSubject, testMode);
        if (check.allowed) {
          scoredCandidates.push({ faculty: fac, penalty: check.penalty });
        }
      }

      if (scoredCandidates.length > 0) {
        scoredCandidates.sort((a, b) => a.penalty - b.penalty);
        bestFaculty = scoredCandidates[0].faculty;
        minPenalty = scoredCandidates[0].penalty;
        break;
      }
    }

    if (!bestFaculty) {
      return {
        success: false,
        day,
        period,
        conflictReason: `Faculty assigned to subject is busy or conflicts at ${slotId}`
      };
    }

    allocatedFacultyIds.push(bestFaculty.facultyId);
    allocatedFacultyNames.push(bestFaculty.facultyName);
  }

  return {
    success: true,
    facultyId: allocatedFacultyIds.length > 0 ? allocatedFacultyIds.join('_') : undefined,
    facultyName: allocatedFacultyNames.length > 0 ? allocatedFacultyNames.join(' / ') : undefined,
    day,
    period,
  };
}

/**
 * Allocates a faculty to a time slot and updates their availability and daily load.
 * Supports combined faculty IDs (separated by '_') for parallel electives.
 */
export function allocateFacultyToSlot(
  facultyId: string,
  day: number,
  period: number,
  facultyMap: Map<string, FacultyAllocation>,
  slotType: 'theory' | 'lab' | 'special' = 'theory'
): boolean {
  const facultyIds = facultyId.includes('_') ? facultyId.split('_') : [facultyId];
  let allSuccess = true;
  const slotId = createSlotId(day, period);

  for (const facId of facultyIds) {
    const faculty = facultyMap.get(facId);
    if (!faculty) {
      allSuccess = false;
      continue;
    }

    // Check if slot is available
    if (!faculty.availableSlots.has(slotId)) {
      allSuccess = false;
    }

    // Allocate the slot
    faculty.assignedSlots.add(slotId);
    faculty.availableSlots.delete(slotId);
    if (!faculty.assignedSlotTypes) {
      faculty.assignedSlotTypes = new Map();
    }
    faculty.assignedSlotTypes.set(slotId, slotType);

    if (!faculty.dailyHours) {
      faculty.dailyHours = [0, 0, 0, 0, 0, 0];
    }
    if (day >= 0 && day < 6) {
      faculty.dailyHours[day] = (faculty.dailyHours[day] || 0) + 1;
    }
  }

  return allSuccess;
}

/**
 * Releases a faculty from a time slot and updates their daily load.
 */
export function releaseFacultySlot(
  facultyId: string,
  day: number,
  period: number,
  facultyMap: Map<string, FacultyAllocation>
): void {
  const facultyIds = facultyId.includes('_') ? facultyId.split('_') : [facultyId];
  const slotId = createSlotId(day, period);
  for (const facId of facultyIds) {
    const faculty = facultyMap.get(facId);
    if (!faculty) continue;
    faculty.assignedSlots.delete(slotId);
    faculty.availableSlots.add(slotId);
    faculty.assignedSlotTypes?.delete(slotId);
    if (faculty.dailyHours && day >= 0 && day < 6) {
      faculty.dailyHours[day] = Math.max(0, (faculty.dailyHours[day] || 0) - 1);
    }
  }
}

/**
 * Returns the assigned faculty's current teaching load for a given day (0..5: Mon..Sat).
 * If multiple faculty teach the subject (e.g. elective or team-teaching), returns the maximum daily load among them.
 */
export function getFacultyDayLoad(
  subjectId: string,
  day: number,
  facultyMap?: Map<string, FacultyAllocation>,
  year?: string,
  section?: string
): number {
  if (!facultyMap || facultyMap.size === 0) return 0;
  const subIds = subjectId.includes('_') ? subjectId.split('_') : [subjectId];
  let maxLoad = 0;
  let found = false;

  for (const subId of subIds) {
    for (const faculty of facultyMap.values()) {
      let teaches = false;
      if (faculty.assignments && faculty.assignments.length > 0) {
        teaches = faculty.assignments.some(a =>
          a.subjectId === subId &&
          (!a.year || !year || normYear(a.year) === normYear(year)) &&
          (!a.section || !section || normSec(a.section) === normSec(section))
        );
      }
      if (!teaches && faculty.subjectIds.has(subId)) {
        teaches = true;
      }

      if (teaches) {
        found = true;
        const load = faculty.dailyHours?.[day] ?? 0;
        if (load > maxLoad) {
          maxLoad = load;
        }
      }
    }
  }

  return found ? maxLoad : 0;
}

/**
 * Sorts candidate periods for a given day and subject so that:
 * 1. For professors, morning periods (P1..P4: indices 0..3) are strictly preferred over afternoon periods (P5..P7).
 * 2. Periods that respect rest periods (isolated slots or respecting rest after 2 hours) come first.
 * 3. Periods creating 3-in-a-row consecutive hours are heavily deprioritized.
 */
export function sortPeriodsByFacultyRest(
  periods: number[],
  day: number,
  subjectId: string,
  facultyMap?: Map<string, FacultyAllocation>,
  year?: string,
  section?: string,
  isLabSubject: boolean = false
): number[] {
  if (!facultyMap || facultyMap.size === 0) {
    const a = [...periods];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const isProf = isSubjectTaughtByProfessor(subjectId, facultyMap, year, section);

  const penalties = new Map<number, number>();
  for (const p of periods) {
    let penalty = 0;

    // Professor morning priority: P0..P3 (morning) gets high bonus; P4..P6 (afternoon) gets penalty
    if (isProf) {
      if (p < 4) penalty -= 150;
      else penalty += 400;
    }

    const testRes = findAvailableFacultyForSlot(
      subjectId,
      day,
      p,
      facultyMap,
      isLabSubject,
      year,
      section,
      { mode: 'strict' }
    );

    if (testRes.success) {
      penalty += 0;
    } else {
      const relaxedRes = findAvailableFacultyForSlot(
        subjectId,
        day,
        p,
        facultyMap,
        isLabSubject,
        year,
        section,
        { mode: 'relaxed' }
      );
      if (relaxedRes.success) {
        penalty += 100;
      } else {
        penalty += 500;
      }
    }

    penalties.set(p, penalty);
  }

  const copy = [...periods];
  return copy.sort((a, b) => {
    const penA = penalties.get(a) ?? 0;
    const penB = penalties.get(b) ?? 0;
    if (penA !== penB) return penA - penB;
    return Math.random() - 0.5;
  });
}

/**
 * Sorts candidate days (e.g. [0, 1, 2, 3, 4] for Mon-Fri or [0..5] for Mon-Sat)
 * to balance faculty teaching workload evenly across the entire week:
 * 1. Days where the faculty currently has 0 hours receive highest priority.
 * 2. Days with lower hours come before days with higher hours.
 * 3. Days where faculty already has >= 4 hours are strongly deprioritized to preserve at least 3 free hours per day!
 * 4. Ties between days with equal load are randomized to ensure natural, realistic distribution.
 */
export function sortDaysByFacultyLoad(
  days: number[],
  subjectId: string,
  facultyMap?: Map<string, FacultyAllocation>,
  year?: string,
  section?: string
): number[] {
  if (!facultyMap || facultyMap.size === 0) {
    const a = [...days];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const dayLoads = new Map<number, number>();
  for (const d of days) {
    dayLoads.set(d, getFacultyDayLoad(subjectId, d, facultyMap, year, section));
  }

  const copy = [...days];
  return copy.sort((a, b) => {
    const loadA = dayLoads.get(a) || 0;
    const loadB = dayLoads.get(b) || 0;

    // Days with 4 or more hours are strictly deprioritized to ensure at least 3 free hours per day
    const penaltyA = loadA >= 4 ? (loadA >= 5 ? 200 : 100) : 0;
    const penaltyB = loadB >= 4 ? (loadB >= 5 ? 200 : 100) : 0;
    if (penaltyA !== penaltyB) return penaltyA - penaltyB;

    // Lower hours come first (0 hours like Monday gets highest priority!)
    if (loadA !== loadB) return loadA - loadB;

    // Random tie-break for days with identical load
    return Math.random() - 0.5;
  });
}

/**
 * Validates that no faculty conflicts exist in a timetable grid.
 * Handles parallel electives represented as combined names (separated by ' / ').
 */
export async function validateFacultyConflicts(
  grid: Grid,
  subjects: Subject[],
  departmentId: string,
  year: string,
  section: string
): Promise<{ valid: boolean; conflicts: string[]; warnings: string[] }> {
  const conflicts: string[] = [];
  const warnings: string[] = [];
  
  try {
    const facultyMap = await buildFacultyAllocationMap(departmentId, year, section, {
      excludeClasses: [{ departmentId, year, section }]
    });
    const subjectNameToId = new Map<string, string>();
    subjects.forEach(subject => {
      subjectNameToId.set(subject.name, subject.id);
    });
    
    // Track faculty assignments within this timetable
    const currentAssignments = new Map<string, string[]>(); // facultyId -> [slotIds]
    
    grid.forEach((dayRow, dayIndex) => {
      if (!dayRow) return;
      
      dayRow.forEach((cell, periodIndex) => {
        if (!cell) return;
        
        const cellStr = String(cell).trim();
        if (!cellStr) return;
        
        const slotId = createSlotId(dayIndex, periodIndex);
        
        // Handle special cases like "Seminar (Faculty Name)"
        const specialMatch = cellStr.match(/^(.*?)\s*\((.*?)\)$/);
        if (specialMatch) {
          const [, , facultyName] = specialMatch;
          
          // Find faculty by name for special entries
          const faculty = Array.from(facultyMap.values()).find(f => f.facultyName === facultyName);
          if (faculty) {
            const facultyInfo = {
              facultyId: faculty.facultyId,
              facultyName: faculty.facultyName
            };
            
            // Track assignments within this timetable
            if (!currentAssignments.has(facultyInfo.facultyId)) {
              currentAssignments.set(facultyInfo.facultyId, []);
            }
            
            const facultySlots = currentAssignments.get(facultyInfo.facultyId)!;
            if (facultySlots.includes(slotId)) {
              conflicts.push(`Faculty ${facultyInfo.facultyName} assigned to multiple subjects at ${slotId}`);
            } else {
              facultySlots.push(slotId);
            }
          }
        } else {
          // Regular subject or parallel electives (separated by ' / ')
          const cellParts = cellStr.includes(' / ') ? cellStr.split(' / ').map(p => p.trim()) : [cellStr];
          
          cellParts.forEach(part => {
            const subjectId = subjectNameToId.get(part);
            if (subjectId) {
              // Find faculty for this subject matching section if available
              const eligibleFaculty = Array.from(facultyMap.values()).filter(faculty => {
                if (faculty.assignments && faculty.assignments.length > 0) {
                  const matches = faculty.assignments.some(a =>
                    a.subjectId === subjectId &&
                    (!a.year || !year || a.year.toUpperCase() === year.toUpperCase()) &&
                    (!a.section || !section || a.section.toUpperCase() === section.toUpperCase())
                  );
                  if (matches) return true;
                }
                return faculty.subjectIds.has(subjectId);
              });

              let candidates = eligibleFaculty;
              if (year && section && eligibleFaculty.length > 1) {
                const sectionSpecific = eligibleFaculty.filter(faculty =>
                  faculty.assignments?.some(a =>
                    a.subjectId === subjectId &&
                    a.year && a.year.toUpperCase() === year.toUpperCase() &&
                    a.section && a.section.toUpperCase() === section.toUpperCase()
                  )
                );
                if (sectionSpecific.length > 0) {
                  candidates = sectionSpecific;
                }
              }
                
              if (candidates.length === 0) {
                warnings.push(`No faculty assigned for ${part} at ${slotId}`);
                return;
              }
              
              // Check for conflicts with existing assignments (other timetables)
              const availableFaculty = candidates.filter(faculty => 
                faculty.availableSlots.has(slotId)
              );
              
              if (availableFaculty.length === 0) {
                conflicts.push(`Faculty conflict for ${part} at ${slotId} - all assigned faculty are busy`);
                return;
              }
              
              const facultyInfo = {
                facultyId: availableFaculty[0].facultyId,
                facultyName: availableFaculty[0].facultyName
              };
              
              // Track assignments within this timetable
              if (!currentAssignments.has(facultyInfo.facultyId)) {
                currentAssignments.set(facultyInfo.facultyId, []);
              }
              
              const facultySlots = currentAssignments.get(facultyInfo.facultyId)!;
              if (facultySlots.includes(slotId)) {
                conflicts.push(`Faculty ${facultyInfo.facultyName} assigned to multiple subjects at ${slotId}`);
              } else {
                facultySlots.push(slotId);
              }
            }
          });
        }
      });
    });

    // Check consecutive hours and daily workload warnings for faculty
    currentAssignments.forEach((slots, facId) => {
      const fac = facultyMap.get(facId);
      const facName = fac?.facultyName || 'Faculty';

      // Group assigned slots by day
      const daySlots = new Map<number, number[]>();
      slots.forEach(s => {
        const parts = s.split('-p');
        const dayPrefix = parts[0].toLowerCase();
        const d = DAYS.indexOf(dayPrefix as any);
        const p = parseInt(parts[1], 10) - 1;
        if (d >= 0 && !isNaN(p)) {
          if (!daySlots.has(d)) daySlots.set(d, []);
          daySlots.get(d)!.push(p);
        }
      });

      daySlots.forEach((pList, d) => {
        pList.sort((a, b) => a - b);
        const dayName = DAYS[d].toUpperCase();

        // 1. Daily teaching limit (> 4 hours leaves < 3 free hours)
        if (pList.length > 4) {
          warnings.push(
            `${facName} is scheduled for ${pList.length} hours on ${dayName} (recommended max 4 hrs to ensure 3 free hours).`
          );
        }

        // 2. Consecutive teaching check (> 2 consecutive hours)
        let consec = 1;
        for (let i = 1; i < pList.length; i++) {
          if (pList[i] === pList[i - 1] + 1) {
            consec++;
            if (consec >= 3) {
              warnings.push(
                `${facName} has ${consec} consecutive teaching hours on ${dayName} around Period ${pList[i] + 1} (recommended max 2 consecutive hours).`
              );
            }
          } else {
            consec = 1;
          }
        }
      });
    });

  } catch (error) {
    console.error('Error validating faculty conflicts:', error);
    conflicts.push('Error occurred during faculty conflict validation');
  }

  return {
    valid: conflicts.length === 0,
    conflicts,
    warnings
  };
}

/**
 * Gets faculty workload summary
 */
export async function getFacultyWorkloadSummary(
  departmentId: string
): Promise<Array<{
  facultyId: string;
  facultyName: string;
  totalSlots: number;
  availableSlots: number;
  workloadPercentage: number;
  isClassCounselor: boolean;
}>> {
  const facultyMap = await buildFacultyAllocationMap(departmentId, '', '');
  const totalPossibleSlots = 6 * PERIODS; // 6 days * 7 periods
  
  return Array.from(facultyMap.values()).map(faculty => {
    const totalSlots = faculty.assignedSlots.size;
    const availableSlots = faculty.availableSlots.size;
    const workloadPercentage = (totalSlots / totalPossibleSlots) * 100;
    
    return {
      facultyId: faculty.facultyId,
      facultyName: faculty.facultyName,
      totalSlots,
      availableSlots,
      workloadPercentage: Math.round(workloadPercentage * 100) / 100,
      isClassCounselor: faculty.isClassCounselor
    };
  }).sort((a, b) => b.workloadPercentage - a.workloadPercentage);
}

/**
 * Finds available slots for a faculty, excluding labs if they don't prefer them
 */
export function findAvailableSlots(
  facultyId: string, 
  timetable: Grid, 
  facultyMap: Map<string, FacultyAllocation>,
  excludeLabs: boolean = false
): Slot[] {
  const faculty = facultyMap.get(facultyId);
  if (!faculty) return [];
  
  const availableSlots: Slot[] = [];
  
  for (let day = 0; day < 6; day++) {
    for (let period = 0; period < PERIODS; period++) {
      const slotId = createSlotId(day, period);
      
      // Skip if not available for this faculty
      if (!faculty.availableSlots.has(slotId)) continue;
      
      // Skip if slot is already occupied in the current timetable
      if (timetable[day] && timetable[day][period] !== null) continue;
      
      // Skip lab periods if excludeLabs is true and faculty doesn't prefer labs
      if (excludeLabs && !faculty.labPreference) {
        // Assume P4-P7 are typically lab periods (can be refined based on actual lab schedule)
        if (period >= 3) continue;
      }
      
      availableSlots.push({ day, period });
    }
  }
  
  return availableSlots;
}

/**
 * Phase 2 pre-check: determines if any faculty assigned to a subject
 * has at least one free slot across the entire week.
 * Used to warn early rather than discovering conflicts after generation.
 * Supports combined subject IDs (separated by '_') for parallel electives.
 */
export function checkStaffAvailabilityForWeek(
  subjectId: string,
  facultyMap: Map<string, FacultyAllocation>
): { hasSlots: boolean; freeSlotCount: number; facultyNames: string[] } {
  const subjectIds = subjectId.includes('_') ? subjectId.split('_') : [subjectId];
  
  let minFreeSlotsAcrossSubjects = Infinity;
  let hasSlots = true;
  const facultyNames: string[] = [];
  
  for (const subId of subjectIds) {
    // Find all faculty assigned to this subject
    const eligibleFaculty = Array.from(facultyMap.values()).filter(f =>
      f.subjectIds.has(subId)
    );

    // No faculty assigned — we still allow placement
    if (eligibleFaculty.length === 0) {
      continue;
    }

    let subFreeSlots = 0;
    for (const faculty of eligibleFaculty) {
      const free = faculty.availableSlots.size;
      subFreeSlots += free;
      if (free > 0 && !facultyNames.includes(faculty.facultyName)) {
        facultyNames.push(faculty.facultyName);
      }
    }
    
    if (subFreeSlots === 0) {
      hasSlots = false;
    }
    minFreeSlotsAcrossSubjects = Math.min(minFreeSlotsAcrossSubjects, subFreeSlots);
  }

  const finalFree = minFreeSlotsAcrossSubjects === Infinity ? 42 : minFreeSlotsAcrossSubjects;

  return {
    hasSlots: hasSlots && finalFree > 0,
    freeSlotCount: finalFree,
    facultyNames,
  };
}