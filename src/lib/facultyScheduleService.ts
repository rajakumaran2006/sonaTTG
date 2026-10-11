import { supabase } from "@/integrations/supabase/client";
import { getCleanSectionName, getTimetableSemester } from "./supabaseService";
import { getExternalFacultySlots } from "./facultyExternalSlotsService";
import { getDeptShortName } from "./timetablePdfExport";

export function formatClassWithDept(
  year: string,
  section: string,
  deptName?: string,
  courseCode?: string
): string {
  let deptShort = deptName ? getDeptShortName(deptName) : '';
  if (!deptShort || deptShort === 'DEPT') {
    const c = (courseCode || '').toUpperCase();
    if (c.includes('ADS') || c.includes('AID')) deptShort = 'AI&DS';
    else if (c.includes('IT')) deptShort = 'IT';
    else if (c.includes('CSE') || c.includes('CS')) deptShort = 'CSE';
    else if (c.includes('ECE') || c.includes('EC')) deptShort = 'ECE';
    else if (c.includes('EEE') || c.includes('EE')) deptShort = 'EEE';
    else if (c.includes('MECH') || c.includes('ME')) deptShort = 'MECH';
    else if (c.includes('CIVIL') || c.includes('CE')) deptShort = 'CIVIL';
  }
  const deptPart = deptShort && deptShort !== 'DEPT' ? ` ${deptShort}` : '';
  return `Yr ${year}${deptPart} - Sec ${section}`;
}

export interface FacultyPeriodSlot {
  subject: string;
  code?: string;
  type?: 'theory' | 'lab' | 'special' | 'elective';
  day: number; // 0..5 (Mon..Sat)
  period: number; // 0..6 (P1..P7)
  year: string;
  section: string;
  cleanSection: string;
  department_name: string;
  department_id: string;
  is_special?: boolean;
  is_lab?: boolean;
  is_counselor_hour?: boolean;
  is_external?: boolean;
  external_id?: string;
  sections?: string[];
  rawCellText: string;
}

export interface SubjectSummaryItem {
  code: string;
  name: string;
  abbreviation: string;
  type: string;
  hoursCount: number;
  classes: string[];
}

export interface FacultyWeeklyScheduleResult {
  faculty: {
    id: string;
    name: string;
    email?: string | null;
    designation?: string | null;
    department_id?: string;
    department_name?: string;
  };
  semesterType: 'odd' | 'even';
  grid: (FacultyPeriodSlot | null)[][]; // 6 days x 7 periods
  slots: FacultyPeriodSlot[];
  teachingHours: number; // regular theory + lab
  specialHours: number;  // CC special hours
  labHours: number;
  theoryHours: number;
  totalHours: number;
  subjectsSummary: SubjectSummaryItem[];
  classesTaught: string[];
  departmentsTaught: string[];
  counselorClasses: Array<{
    department_id: string;
    department_name?: string;
    year: string;
    section: string;
  }>;
}

const parseYearNum = (y: any): number => {
  if (y === null || y === undefined) return -1;
  const s = String(y).trim().toUpperCase();
  const map: Record<string, number> = {
    '1': 1, 'I': 1, 'FIRST': 1, 'YEAR I': 1, 'YEAR 1': 1, 'YR 1': 1,
    '2': 2, 'II': 2, 'SECOND': 2, 'YEAR II': 2, 'YEAR 2': 2, 'YR 2': 2,
    '3': 3, 'III': 3, 'THIRD': 3, 'YEAR III': 3, 'YEAR 3': 3, 'YR 3': 3,
    '4': 4, 'IV': 4, 'FOURTH': 4, 'YEAR IV': 4, 'YEAR 4': 4, 'YR 4': 4,
  };
  if (map[s] !== undefined) return map[s];
  const num = parseInt(s.replace(/\D/g, ''), 10);
  return isNaN(num) ? -1 : num;
};

const normalizeSec = (sec: any): string => {
  if (!sec) return '';
  const clean = getCleanSectionName(String(sec));
  return clean.trim().toUpperCase().replace(/^SEC(TION)?\s*/i, '');
};

const parseGrid = (data: any): string[][] => {
  if (!data) return [];
  if (Array.isArray(data)) {
    if (data.length > 0 && Array.isArray(data[0])) return data;
    return [];
  }
  if (typeof data === 'object') {
    if (Array.isArray(data.grid)) return data.grid;
    if (Array.isArray(data.data)) return data.data;
  }
  return [];
};

/**
 * Normalizes text by removing non-alphanumeric noise and 'lab' / 'laboratory'
 * to enable fuzzy matching for practical subjects.
 */
const normalizeSubjectName = (name: string): string => {
  return (name || '')
    .toLowerCase()
    .replace(/laboratory|lab/g, '')
    .replace(/[^a-z0-9]/g, '');
};

/**
 * Robust matching between a grid cell text and candidate subject definitions.
 */
const matchesSubject = (cellText: string, subj: { name?: string; abbreviation?: string; code?: string }): boolean => {
  if (!cellText || !subj) return false;
  const ct = cellText.trim().toLowerCase();
  const sName = (subj.name || '').trim().toLowerCase();
  const sAbbr = (subj.abbreviation || '').trim().toLowerCase();
  const sCode = (subj.code || '').trim().toLowerCase();

  // 1. Direct exact matches
  if (sName && ct === sName) return true;
  if (sAbbr && ct === sAbbr) return true;
  if (sCode && ct === sCode) return true;

  // 2. Direct abbreviations without 'LAB'
  const abbrNoLab = sAbbr.replace(/\s*lab$/i, '').trim();
  if (abbrNoLab && ct === abbrNoLab) return true;
  const ctNoLab = ct.replace(/\s*lab$/i, '').trim();
  if (abbrNoLab && ctNoLab === abbrNoLab) return true;

  // 3. Multi-subject cells (e.g., "MAD LAB / CN LAB" or "CS8611 / CS8612" or "MAD LAB & CN LAB")
  const parts = ct.split(/[/&+,]/).map(p => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    for (const part of parts) {
      if (matchesSubject(part, subj)) return true;
    }
  }

  // 4. Normalized lab names (e.g. "Cloud Computing Laboratory" vs "Cloud Computing Lab")
  const normSubj = normalizeSubjectName(sName);
  const normCell = normalizeSubjectName(ct);
  if (normSubj && normCell && normSubj === normCell) return true;

  // 5. Code in cell text (e.g., "CS8381 (Lab)")
  if (sCode && ct.includes(sCode)) return true;

  return false;
};

/**
 * Checks if a cell text represents a Special Hour (Seminar, Library, Counselling, etc.)
 */
const isSpecialHourCell = (cellText: string): { isSpecial: boolean; label: string } => {
  const ct = (cellText || '').trim().toLowerCase();
  if (!ct) return { isSpecial: false, label: '' };

  if (/counsel/i.test(ct) || /student counselling/i.test(ct) || /^sc$/i.test(ct) || /^cc$/i.test(ct)) {
    return { isSpecial: true, label: 'Student Counselling' };
  }
  if (/seminar/i.test(ct) || /^sem$/i.test(ct)) {
    return { isSpecial: true, label: 'Seminar' };
  }
  if (/library/i.test(ct) || /^lib$/i.test(ct)) {
    return { isSpecial: true, label: 'Library' };
  }
  if (ct.includes('sc/sem/lib') || ct.includes('lib/sem') || ct.includes('sem/lib')) {
    return { isSpecial: true, label: 'SC/SEM/LIB' };
  }

  return { isSpecial: false, label: '' };
};

/**
 * Extracts the complete, dynamic weekly schedule for a single faculty member.
 */
export async function getFacultyWeeklySchedule(
  facultyId: string,
  facultyName?: string,
  semesterType: 'odd' | 'even' = 'odd',
  preferredDeptId?: string
): Promise<FacultyWeeklyScheduleResult> {
  // 1. Resolve faculty member info
  let resolvedFaculty: any = null;
  if (facultyId) {
    const { data: fm } = await (supabase as any)
      .from('faculty_members')
      .select('id, name, email, designation, department_id, departments(name)')
      .eq('id', facultyId)
      .maybeSingle();
    resolvedFaculty = fm;
  }
  if (!resolvedFaculty && facultyName) {
    const { data: fm } = await (supabase as any)
      .from('faculty_members')
      .select('id, name, email, designation, department_id, departments(name)')
      .ilike('name', facultyName.trim())
      .maybeSingle();
    resolvedFaculty = fm;
  }

  const fId = resolvedFaculty?.id || facultyId;
  const fName = resolvedFaculty?.name || facultyName || 'Faculty';
  const fEmail = resolvedFaculty?.email || null;
  const fDesignation = resolvedFaculty?.designation || null;
  const fDeptId = resolvedFaculty?.department_id || preferredDeptId;
  const fDeptName = resolvedFaculty?.departments?.name || '';

  // 2. Fetch specific section assignments for this faculty from faculty_subject_assignments
  let facultyAssignments: any[] = [];
  if (fId) {
    const { data: fsaData } = await (supabase as any)
      .from('faculty_subject_assignments')
      .select(`
        faculty_id,
        department_id,
        year,
        section,
        subjects!inner(id, name, abbreviation, code, type, hours_per_week)
      `)
      .eq('faculty_id', fId);
    facultyAssignments = fsaData || [];
  } else {
    const { data: fsaData } = await (supabase as any)
      .from('faculty_subject_assignments')
      .select(`
        faculty_id,
        department_id,
        year,
        section,
        faculty_members!inner(name),
        subjects!inner(id, name, abbreviation, code, type, hours_per_week)
      `)
      .eq('faculty_members.name', fName);
    facultyAssignments = fsaData || [];
  }

  // 3. Fetch subjects where staff column matches faculty
  let staffSubjects: any[] = [];
  try {
    const query = (supabase as any)
      .from('subjects')
      .select('id, name, abbreviation, code, type, hours_per_week, department_id, year, staff');

    if (fId) {
      query.or(`staff.eq.${fName},staff.eq.${fId}`);
    } else {
      query.eq('staff', fName);
    }
    const { data: sData } = await query;
    staffSubjects = sData || [];
  } catch (err) {
    console.warn('Could not fetch staff subjects:', err);
  }

  // 4. Fetch Class Counselor assignments for this faculty
  let counselorData: any[] = [];
  if (fId) {
    const { data: cData } = await (supabase as any)
      .from('class_counselors')
      .select('department_id, year, section, is_active')
      .eq('faculty_id', fId)
      .neq('is_active', false);
    counselorData = cData || [];
  }

  // 5. Fetch all timetables and department names
  const [{ data: timetables }, { data: depts }] = await Promise.all([
    (supabase as any)
      .from('timetables')
      .select(`
        id,
        department_id,
        year,
        section,
        grid_data,
        special_flags,
        updated_at
      `)
      .order('updated_at', { ascending: false }),
    (supabase as any)
      .from('departments')
      .select('id, name')
  ]);

  const deptMap: Record<string, string> = {};
  (depts || []).forEach((d: any) => {
    deptMap[d.id] = d.name;
  });

  // Filter timetables by requested semester ('odd' or 'even')
  const validTimetables = (timetables || []).filter((tt: any) => {
    const ttSemester = getTimetableSemester(tt);
    return ttSemester === semesterType;
  });

  // 6. Build 6x7 schedule grid
  // Days: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat
  // Periods: 0..6 (P1..P7)
  const grid: (FacultyPeriodSlot | null)[][] = Array.from({ length: 6 }, () => 
    Array.from({ length: 7 }, () => null)
  );

  const flatSlots: FacultyPeriodSlot[] = [];
  const subjectsSummaryMap: Record<string, SubjectSummaryItem> = {};
  const classesSet = new Set<string>();
  const deptsSet = new Set<string>();

  // Process timetables to find faculty periods
  for (const tt of validTimetables) {
    const ttDeptId = tt.department_id;
    const ttDeptName = deptMap[ttDeptId] || ttDeptId;
    const ttYear = String(tt.year || '').trim();
    const ttYearNum = parseYearNum(ttYear);
    const ttCleanSec = getCleanSectionName(tt.section);
    const ttSecNorm = normalizeSec(tt.section);

    const parsedGrid = parseGrid(tt.grid_data);
    if (!parsedGrid || parsedGrid.length === 0) continue;

    // Is faculty Class Counselor for this class?
    const isClassCounselor = counselorData.some(c =>
      c.department_id === ttDeptId &&
      parseYearNum(c.year) === ttYearNum &&
      normalizeSec(c.section) === ttSecNorm
    );

    // Matching subject assignments for this class
    const matchingAssignments = facultyAssignments.filter(a => {
      if (a.department_id !== ttDeptId) return false;
      if (parseYearNum(a.year) !== ttYearNum) return false;
      const aSec = normalizeSec(a.section);
      if (aSec && aSec !== 'ALL' && aSec !== ttSecNorm) return false;
      return true;
    });

    // Matching staff subjects (fallback when no specific section assignment exists)
    const matchingStaffSubjects = staffSubjects.filter(s => {
      if (s.department_id !== ttDeptId) return false;
      if (parseYearNum(s.year) !== ttYearNum) return false;
      const hasSpecificAssignment = facultyAssignments.some(a =>
        a.department_id === ttDeptId &&
        parseYearNum(a.year) === ttYearNum &&
        a.subjects?.id === s.id
      );
      if (hasSpecificAssignment) return false;
      return true;
    });

    const hasAnyRole = matchingAssignments.length > 0 || matchingStaffSubjects.length > 0 || isClassCounselor;
    if (!hasAnyRole) continue;

    // Scan the timetable's 6 days
    parsedGrid.forEach((dayRow: string[], dayIdx: number) => {
      if (!Array.isArray(dayRow) || dayIdx >= 6) return;

      dayRow.forEach((cellTextRaw: string, periodIdx: number) => {
        if (periodIdx >= 7) return;
        const cellText = String(cellTextRaw || '').trim();
        if (!cellText || cellText === '-' || cellText.toUpperCase() === 'FREE') return;

        let matchedSlot: FacultyPeriodSlot | null = null;

        // Check A: Class Counselor special hour (Seminar, Library, Counselling, etc.)
        if (isClassCounselor) {
          const specialCheck = isSpecialHourCell(cellText);
          if (specialCheck.isSpecial) {
            matchedSlot = {
              subject: specialCheck.label,
              code: specialCheck.label === 'Seminar' ? 'SEM' : specialCheck.label === 'Library' ? 'LIB' : 'SC',
              type: 'special',
              day: dayIdx,
              period: periodIdx,
              year: ttYear,
              section: tt.section,
              cleanSection: ttCleanSec,
              department_name: ttDeptName,
              department_id: ttDeptId,
              is_special: true,
              is_counselor_hour: true,
              rawCellText: cellText,
            };
          }
        }

        // Check B: Section-specific assignments (Theory & Labs)
        if (!matchedSlot && matchingAssignments.length > 0) {
          for (const a of matchingAssignments) {
            const subj = a.subjects;
            if (!subj) continue;

            if (matchesSubject(cellText, subj)) {
              const isLab = subj.type === 'lab' || /lab/i.test(cellText) || /lab/i.test(subj.name || '');
              matchedSlot = {
                subject: subj.name,
                code: subj.code,
                type: isLab ? 'lab' : (subj.type as any) || 'theory',
                day: dayIdx,
                period: periodIdx,
                year: ttYear,
                section: tt.section,
                cleanSection: ttCleanSec,
                department_name: ttDeptName,
                department_id: ttDeptId,
                is_lab: isLab,
                rawCellText: cellText,
              };
              break;
            }
          }
        }

        // Check C: Staff-assigned subjects (Theory & Labs)
        if (!matchedSlot && matchingStaffSubjects.length > 0) {
          for (const s of matchingStaffSubjects) {
            if (matchesSubject(cellText, s)) {
              const isLab = s.type === 'lab' || /lab/i.test(cellText) || /lab/i.test(s.name || '');
              matchedSlot = {
                subject: s.name,
                code: s.code,
                type: isLab ? 'lab' : (s.type as any) || 'theory',
                day: dayIdx,
                period: periodIdx,
                year: ttYear,
                section: tt.section,
                cleanSection: ttCleanSec,
                department_name: ttDeptName,
                department_id: ttDeptId,
                is_lab: isLab,
                rawCellText: cellText,
              };
              break;
            }
          }
        }

        // If a match was found, place into grid & collect summary
        if (matchedSlot) {
          const classDesc = formatClassWithDept(ttYear, ttCleanSec, ttDeptName, matchedSlot.code);
          classesSet.add(`${ttDeptName} - ${classDesc}`);
          deptsSet.add(ttDeptName);

          const existingSlot = grid[dayIdx][periodIdx];
          if (existingSlot) {
            // Merge parallel classes (e.g., shared elective or combined batch)
            const secs = existingSlot.sections || [existingSlot.cleanSection];
            if (!secs.includes(ttCleanSec)) {
              secs.push(ttCleanSec);
            }
            grid[dayIdx][periodIdx] = {
              ...existingSlot,
              cleanSection: secs.sort().join(', '),
              sections: secs,
            };
          } else {
            grid[dayIdx][periodIdx] = {
              ...matchedSlot,
              sections: [ttCleanSec],
            };
            flatSlots.push(matchedSlot);
          }

          // Aggregate into subjects summary
          const summaryKey = `${matchedSlot.code || matchedSlot.subject}_${matchedSlot.is_counselor_hour ? 'CC' : ''}`;
          if (!subjectsSummaryMap[summaryKey]) {
            subjectsSummaryMap[summaryKey] = {
              code: matchedSlot.code || '-',
              name: matchedSlot.subject,
              abbreviation: matchedSlot.code || matchedSlot.subject.substring(0, 6).toUpperCase(),
              type: matchedSlot.type || 'theory',
              hoursCount: 0,
              classes: [],
            };
          }
          subjectsSummaryMap[summaryKey].hoursCount += 1;
          if (!subjectsSummaryMap[summaryKey].classes.includes(classDesc)) {
            subjectsSummaryMap[summaryKey].classes.push(classDesc);
          }
        }
      });
    });
  }

  // 6b. Merge cross-department external slots assigned to this faculty
  // These slots update this faculty's schedule directly without affecting the original class view
  try {
    const extSlots = await getExternalFacultySlots(fId, semesterType);
    for (const ext of extSlots) {
      const dayIdx = ext.day;
      const periodIdx = ext.period;
      if (dayIdx < 0 || dayIdx >= 6 || periodIdx < 0 || periodIdx >= 7) continue;

      const classDesc = formatClassWithDept(ext.year, ext.section, ext.department_name, ext.subject_code);
      classesSet.add(`${ext.department_name} - ${classDesc} (External)`);
      deptsSet.add(ext.department_name);

      const extSlot: FacultyPeriodSlot = {
        subject: ext.subject_name,
        code: ext.subject_code || ext.subject_name.substring(0, 6).toUpperCase(),
        type: ext.is_lab ? 'lab' : 'theory',
        day: dayIdx,
        period: periodIdx,
        year: ext.year,
        section: ext.section,
        cleanSection: ext.section,
        department_name: ext.department_name,
        department_id: ext.department_id || '',
        is_lab: Boolean(ext.is_lab),
        is_external: true,
        external_id: ext.id,
        rawCellText: `${ext.subject_name} (${ext.department_name})`,
        sections: [ext.section],
      };

      grid[dayIdx][periodIdx] = extSlot;
      flatSlots.push(extSlot);

      const summaryKey = `${extSlot.code || extSlot.subject}_EXT_${ext.department_name}`;
      if (!subjectsSummaryMap[summaryKey]) {
        subjectsSummaryMap[summaryKey] = {
          code: extSlot.code || '-',
          name: `${extSlot.subject} [Ext: ${ext.department_name}]`,
          abbreviation: extSlot.code || extSlot.subject.substring(0, 6).toUpperCase(),
          type: extSlot.type || 'theory',
          hoursCount: 0,
          classes: [],
        };
      }
      subjectsSummaryMap[summaryKey].hoursCount += 1;
      if (!subjectsSummaryMap[summaryKey].classes.includes(classDesc)) {
        subjectsSummaryMap[summaryKey].classes.push(`${classDesc} (${ext.department_name})`);
      }
    }
  } catch (e) {
    console.warn('Could not load external faculty slots:', e);
  }

  // Calculate totals
  const regularSlots = flatSlots.filter(s => !s.is_special);
  const specialSlots = flatSlots.filter(s => s.is_special);
  const labSlots = flatSlots.filter(s => s.is_lab);
  const theorySlots = regularSlots.filter(s => !s.is_lab);

  const counselorClasses = counselorData.map(c => ({
    department_id: c.department_id,
    department_name: deptMap[c.department_id] || c.department_id,
    year: c.year,
    section: getCleanSectionName(c.section),
  }));

  return {
    faculty: {
      id: fId,
      name: fName,
      email: fEmail,
      designation: fDesignation,
      department_id: fDeptId,
      department_name: fDeptName,
    },
    semesterType,
    grid,
    slots: flatSlots,
    teachingHours: regularSlots.length,
    specialHours: specialSlots.length,
    labHours: labSlots.length,
    theoryHours: theorySlots.length,
    totalHours: flatSlots.length,
    subjectsSummary: Object.values(subjectsSummaryMap),
    classesTaught: Array.from(classesSet),
    departmentsTaught: Array.from(deptsSet),
    counselorClasses,
  };
}

/**
 * Fetches weekly schedules for ALL faculty in a given department.
 */
export async function getAllFacultySchedulesByDepartment(
  departmentId: string,
  semesterType: 'odd' | 'even' = 'odd'
): Promise<FacultyWeeklyScheduleResult[]> {
  const { data: facultyMembers, error } = await (supabase as any)
    .from('faculty_members')
    .select('id, name, email, designation, department_id')
    .eq('department_id', departmentId)
    .order('name');

  if (error || !facultyMembers) {
    console.error('Error fetching department faculty members:', error);
    return [];
  }

  const results: FacultyWeeklyScheduleResult[] = [];
  for (const fm of facultyMembers) {
    try {
      const schedule = await getFacultyWeeklySchedule(fm.id, fm.name, semesterType, departmentId);
      results.push(schedule);
    } catch (err) {
      console.warn(`Could not compute schedule for faculty ${fm.name}:`, err);
    }
  }

  return results;
}
