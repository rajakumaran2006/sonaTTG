import { supabase } from "@/integrations/supabase/client";
import { Subject, SpecialFlags, LabPrefsMap } from "@/store/timetableStore";

// Use loose DB types to avoid dependency on generated types
type DbSubject = {
  id: string;
  department_id: string;
  year: string;
  name: string;
  hours_per_week: number;
  type: string;
  tags: string[] | null;
  code: string | null;
  abbreviation: string | null;
  staff: string | null;
  max_faculty_count?: number;
  credits?: number;
};

type DbDepartment = { id: string; name: string };

type DbTimetable = {
  id: string;
  department_id: string;
  year: string;
  section: string;
  grid_data: any;
  special_flags: any;
  updated_at: string;
};

// Department operations
export async function getDepartments(): Promise<DbDepartment[]> {
  const { data, error } = await (supabase as any)
    .from('departments')
    .select('*')
    .order('name');
  
  if (error) throw error;
  return data || [];
}

export async function getDepartmentByName(name: string): Promise<DbDepartment | null> {
  const { data, error } = await (supabase as any)
    .from('departments')
    .select('*')
    .eq('name', name)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function ensureDepartment(name: string): Promise<DbDepartment> {
  const existing = await getDepartmentByName(name);
  if (existing) return existing;
  const { data, error } = await (supabase as any)
    .from('departments')
    .insert({ name })
    .select()
    .single();
  if (error) throw error;
  return data as DbDepartment;
}

// Subject operations
export async function getSubjectsForYear(departmentId: string, year: string): Promise<Subject[]> {
  const { data, error } = await (supabase as any)
    .from('subjects')
    .select('*')
    .eq('department_id', departmentId)
    .eq('year', year)
    .order('name');
  
  if (error) throw error;
  
  return (data || []).map(dbSubjectToSubject);
}

export async function addSubject(subject: Omit<Subject, 'id'> & { departmentId: string; year: string }): Promise<Subject> {
  const { data, error } = await (supabase as any)
    .from('subjects')
    .insert({
      name: subject.name,
      hours_per_week: subject.hoursPerWeek,
      type: subject.type,
      tags: subject.tags || [],
      code: subject.code,
      abbreviation: subject.abbreviation,
      staff: subject.staff,
      department_id: subject.departmentId,
      year: subject.year,
      max_faculty_count: subject.maxFacultyCount,
      credits: subject.credits || 3,
    })
    .select()
    .single();
  
  if (error) throw error;
  return dbSubjectToSubject(data);
}

export async function addSubjectsBulk(subjects: (Omit<Subject, 'id'> & { departmentId: string; year: string })[]): Promise<Subject[]> {
  if (!subjects?.length) return [];
  const rows = subjects.map((s) => ({
    name: s.name,
    hours_per_week: s.hoursPerWeek,
    type: s.type,
    tags: s.tags || [],
    code: s.code,
    abbreviation: s.abbreviation,
    staff: s.staff,
    department_id: s.departmentId,
    year: s.year,
    max_faculty_count: s.maxFacultyCount,
    credits: s.credits || 3,
  }));
  const { data, error } = await (supabase as any)
    .from('subjects')
    .insert(rows)
    .select();
  if (error) throw error;
  return (data || []).map(dbSubjectToSubject);
}

 // Upsert Open Elective hours for a given department + year.
// If hours > 0: ensure a single 'open elective' subject exists with the specified hours.
// If hours === 0: remove any existing 'open elective' subjects for that selection.
// Open Elective settings per department-year
export async function getOpenElectiveHours(departmentId: string, year: string): Promise<number> {
  try {
    const { data, error } = await (supabase as any)
      .from('open_elective_settings')
      .select('hours')
      .eq('department_id', departmentId)
      .eq('year', year)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    if (data && typeof data.hours === 'number') return data.hours;
  } catch (e: any) {
    // Fallback to local storage if table doesn't exist or DB call fails
  }
  try {
    const key = `oe_hours:${departmentId}:${year}`;
    const v = localStorage.getItem(key);
    return v ? Number(v) || 0 : 0;
  } catch {
    return 0;
  }
}

export async function setOpenElectiveHours(
  departmentId: string,
  year: string,
  hours: number,
): Promise<void> {
  try {
    // Upsert hours into open_elective_settings
    const { error } = await (supabase as any)
      .from('open_elective_settings')
      .upsert({ department_id: departmentId, year, hours })
      .select('hours')
      .maybeSingle();
    if (error) throw error;
  } catch (e: any) {
    // Fallback to local storage if table not found or DB call fails
    try {
      const key = `oe_hours:${departmentId}:${year}`;
      localStorage.setItem(key, String(Math.max(0, Math.min(42, Number(hours) || 0))));
    } catch {}
  }
}

export async function deleteSubject(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('subjects')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
}

// Timetable operations
export async function saveTimetable(
  departmentId: string,
  year: string,
  section: string,
  gridData: string[][],
  specialFlags: SpecialFlags
): Promise<void> {
  const payload = {
    department_id: departmentId,
    year,
    section,
    grid_data: gridData as any,
    special_flags: (specialFlags as unknown) as any,
    updated_at: new Date().toISOString(),
  } as any;

  const { error } = await (supabase as any)
    .from('timetables')
    .upsert(payload);
  
  if (error) throw error;
}

export async function getTimetable(
  departmentId: string,
  year: string,
  section: string
): Promise<{ gridData: string[][]; specialFlags: SpecialFlags } | null> {
  const { data, error } = await (supabase as any)
    .from('timetables')
    .select('grid_data, special_flags')
    .eq('department_id', departmentId)
    .eq('year', year)
    .eq('section', section)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  if (!data) return null;
  
  return {
    gridData: data.grid_data as any as string[][],
    specialFlags: data.special_flags as unknown as SpecialFlags,
  };
}

// Lab preferences operations
export async function saveLabPreferences(
  departmentId: string,
  year: string,
  section: string,
  preferences: LabPrefsMap
): Promise<void> {
  // First, delete existing preferences for this selection
  await (supabase as any)
    .from('lab_preferences')
    .delete()
    .eq('department_id', departmentId)
    .eq('year', year)
    .eq('section', section);
  
  // Insert new preferences
  const inserts = Object.entries(preferences).map(([subjectId, pref]) => ({
    department_id: departmentId,
    year,
    section,
    subject_id: subjectId,
    morning_enabled: pref.morningEnabled || false,
    morning_start: pref.morningStart || null,
    evening_two_hour_start_at_5: pref.eveningTwoHourStartAt5 || false,
    priority: pref.priority || null,
  }));
  
  if (inserts.length > 0) {
    const { error } = await (supabase as any)
      .from('lab_preferences')
      .insert(inserts as any);
    
    if (error) throw error;
  }
}

export async function getLabPreferences(
  departmentId: string,
  year: string,
  section: string
): Promise<LabPrefsMap> {
  const { data, error } = await (supabase as any)
    .from('lab_preferences')
    .select('*')
    .eq('department_id', departmentId)
    .eq('year', year)
    .eq('section', section);
  
  if (error) throw error;
  
  const preferences: LabPrefsMap = {};
  (data || []).forEach((pref) => {
    preferences[pref.subject_id] = {
      morningEnabled: pref.morning_enabled || false,
      morningStart: pref.morning_start || undefined,
      eveningTwoHourStartAt5: pref.evening_two_hour_start_at_5 || false,
      priority: pref.priority || undefined,
    };
  });
  
  return preferences;
}

// Helper functions
function dbSubjectToSubject(dbSubject: DbSubject): Subject {
  return {
    id: dbSubject.id,
    name: dbSubject.name,
    hoursPerWeek: dbSubject.hours_per_week,
    type: dbSubject.type as Subject['type'],
    tags: dbSubject.tags || [],
    code: dbSubject.code || undefined,
    abbreviation: dbSubject.abbreviation || undefined,
    staff: dbSubject.staff || undefined,
    maxFacultyCount: dbSubject.max_faculty_count,
    credits: dbSubject.credits || 3,
  };
}

// Phase 8: Service Layer Extensions
// Types kept loose to avoid coupling to generated types
export type Section = {
  id?: string;
  departmentId: string;
  year: string;
  name: string;
  hasTimetable?: boolean;
};

export type Faculty = {
  id: string;
  name: string;
  email?: string | null;
  designation?: string | null;
  takesElectives?: boolean;
  departmentId: string;
};

export type DeptStats = {
  departmentId: string;
  subjectsCount: number;
  facultyCount: number;
  timetablesCount: number;
  sectionsCount: number;
  totalWeeklyHours: number;
  activeYearsCount: number;
};

export type DeptAnalytics = {
  departmentId: string;
  totalSections: number;
  facultyCount: number;
  totalWeeklyPeriods: number;
  activeYears: string[];
  subjectsCount: number;
  timetablesCount: number;
};

// Department analytics
export async function getDepartmentAnalytics(deptId: string): Promise<DeptAnalytics> {
  const [{ data: subjects, error: subjectsError }, { data: faculty, error: facultyError }, { data: timetables, error: ttError }] = await Promise.all([
    (supabase as any)
      .from('subjects')
      .select('id, hours_per_week, year')
      .eq('department_id', deptId),
    (supabase as any)
      .from('faculty_members')
      .select('id')
      .eq('department_id', deptId),
    (supabase as any)
      .from('timetables')
      .select('id, year, section')
      .eq('department_id', deptId),
  ]);

  if (subjectsError) throw subjectsError;
  if (facultyError) throw facultyError;
  if (ttError) throw ttError;

  const subjectsArr = (subjects || []) as Array<{ id: string; hours_per_week: number; year: string }>;
  const ttArr = (timetables || []) as Array<{ id: string; year: string; section: string }>; 
  const totalWeeklyPeriods = subjectsArr.reduce((sum, s) => sum + (s.hours_per_week || 0), 0);
  const activeYears = Array.from(new Set(subjectsArr.map((s) => s.year))).filter(Boolean);

  return {
    departmentId: deptId,
    totalSections: ttArr.length,
    facultyCount: (faculty || []).length,
    totalWeeklyPeriods,
    activeYears,
    subjectsCount: subjectsArr.length,
    timetablesCount: ttArr.length,
  };
}

export async function getAllDepartmentStats(): Promise<DeptStats[]> {
  const departments = await getDepartments();

  const analytics = await Promise.all(
    departments.map((d) => getDepartmentAnalytics(d.id))
  );

  return analytics.map((a) => ({
    departmentId: a.departmentId,
    subjectsCount: a.subjectsCount,
    facultyCount: a.facultyCount,
    timetablesCount: a.timetablesCount,
    sectionsCount: a.totalSections,
    totalWeeklyHours: a.totalWeeklyPeriods,
    activeYearsCount: a.activeYears.length,
  }));
}

// Section management
export async function getSectionsForYear(deptId: string, year: string): Promise<Section[]> {
  const [{ data: ttData, error: ttError }, { data: ssData, error: ssError }] = await Promise.all([
    (supabase as any)
      .from('timetables')
      .select('id, section')
      .eq('department_id', deptId)
      .eq('year', year),
    (supabase as any)
      .from('section_subjects')
      .select('section')
      .eq('department_id', deptId)
      .eq('year', year),
  ]);

  if (ttError) throw ttError;
  if (ssError) throw ssError;

  const sectionsFromTimetables = (ttData || []).map((r: any) => r.section as string);
  const sectionsFromAssignments = (ssData || []).map((r: any) => r.section as string);

  const allNames = Array.from(new Set([...sectionsFromTimetables, ...sectionsFromAssignments])).filter(Boolean);
  const byName = new Map<string, { id?: string }>();
  (ttData || []).forEach((r: any) => {
    if (r.section) byName.set(r.section, { id: r.id });
  });

  return allNames
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      id: byName.get(name)?.id,
      departmentId: deptId,
      year,
      name,
      hasTimetable: Boolean(byName.get(name)?.id),
    }));
}

export async function createSection(deptId: string, year: string, sectionName: string): Promise<Section> {
  const { data, error } = await (supabase as any)
    .from('timetables')
    .insert({
      department_id: deptId,
      year,
      section: sectionName,
      grid_data: [],
      special_flags: {},
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    departmentId: deptId,
    year,
    name: sectionName,
    hasTimetable: true,
  };
}

// Faculty management
export async function getFacultyByDepartment(deptId: string): Promise<Faculty[]> {
  const { data, error } = await (supabase as any)
    .from('faculty_members')
    .select('id, name, email, designation, takes_electives, department_id')
    .eq('department_id', deptId)
    .order('name');
  
  if (error) throw error;
  
  return (data || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    email: f.email ?? null,
    designation: f.designation ?? null,
    takesElectives: Boolean(f.takes_electives),
    departmentId: f.department_id,
  }));
}

// Get faculty assigned to a specific section
export async function getFacultyBySection(deptId: string, year: string, section: string): Promise<Faculty[]> {
  const { data, error } = await (supabase as any)
    .from('faculty_members')
    .select(`
      id, name, email, designation, takes_electives, department_id,
      faculty_subject_assignments!inner(section)
    `)
    .eq('department_id', deptId)
    .eq('faculty_subject_assignments.year', year)
    .eq('faculty_subject_assignments.section', section)
    .order('name');
  
  if (error) throw error;
  
  return (data || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    email: f.email ?? null,
    designation: f.designation ?? null,
    takesElectives: Boolean(f.takes_electives),
    departmentId: f.department_id,
  }));
}

// Find a faculty by email (exact match)
export async function findFacultyByEmail(email: string): Promise<Faculty | null> {
  const { data, error } = await (supabase as any)
    .from('faculty_members')
    .select('id, name, email, designation, takes_electives, department_id')
    .eq('email', email)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    email: data.email ?? null,
    designation: data.designation ?? null,
    takesElectives: Boolean(data.takes_electives),
    departmentId: data.department_id,
  };
}


// List current timetables for a department
export async function getCurrentTimetablesByDept(deptId: string): Promise<Array<{ department_id: string; year: string; section: string; grid_data: string[][]; updated_at: string }>> {
  const { data, error } = await (supabase as any)
    .from('timetables')
    .select('department_id, year, section, grid_data, updated_at')
    .eq('department_id', deptId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as any[];
}

// For a given section, fetch subject ids taught by a faculty (precise class mapping preferred)
export async function getFacultySubjectIdsForSection(
  departmentId: string,
  year: string,
  section: string,
  facultyId: string,
): Promise<Set<string>> {
  // Try precise mapping table first
  try {
    const { data, error } = await (supabase as any)
      .from('faculty_subject_assignments')
      .select('subject_id')
      .eq('department_id', departmentId)
      .eq('year', year)
      .eq('section', section)
      .eq('faculty_id', facultyId);
    if (!error && data && data.length > 0) {
      return new Set((data as any[]).map((r) => r.subject_id).filter(Boolean));
    }
  } catch (_) {
    // ignore
  }
  // Fallback: year-wide assignments (section may be null)
  try {
    const { data } = await (supabase as any)
      .from('faculty_subject_assignments')
      .select('subject_id, section')
      .eq('department_id', departmentId)
      .eq('year', year)
      .eq('faculty_id', facultyId);
    const relevant = (data || []).filter((r: any) => r.section === section || r.section == null);
    return new Set(relevant.map((r: any) => r.subject_id).filter(Boolean));
  } catch (_) {
    return new Set();
  }
}

export async function getFacultyDetails(facultyId: string): Promise<{
  faculty: Faculty;
  subjects: FacultySubjectClass[];
  classCounselor: { year: string; section: string } | null;
  electives: FacultyElective[];
}> {
  try {
    // Get basic faculty info
    const { data: facultyData, error: facultyError } = await (supabase as any)
      .from('faculty_members')
      .select('*')
      .eq('id', facultyId)
      .single();
    
    if (facultyError) throw facultyError;
    
    const faculty: Faculty = {
      id: facultyData.id,
      name: facultyData.name,
      email: facultyData.email ?? null,
      designation: facultyData.designation ?? null,
      takesElectives: Boolean(facultyData.takes_electives),
      departmentId: facultyData.department_id,
    };

    let subjects: FacultySubjectClass[] = [];
    let classCounselor: { year: string; section: string } | null = null;
    let electives: FacultyElective[] = [];

    // Get assigned subjects (handle table not existing) with fallback to faculty_subject_assignments
    try {
      const { data: subjectsData, error: subjectsError } = await (supabase as any)
        .from('faculty_subject_assignments')
        .select('*')
        .eq('faculty_id', facultyId);
      
      if (!subjectsError && subjectsData) {
        subjects = subjectsData.map((s: any) => ({
          id: s.id,
          departmentId: s.department_id,
          facultyId: s.faculty_id,
          subjectId: s.subject_id,
          year: s.year,
          section: s.section,
        }));
      }
    } catch (error) {
      console.warn('faculty_subject_assignments table not accessible:', error);
      subjects = [];
    }
    // Fallback: faculty_subject_assignments (older mapping)
    if (subjects.length === 0) {
      try {
        const { data: faData, error: faErr } = await (supabase as any)
          .from('faculty_subject_assignments')
          .select('department_id, faculty_id, subject_id, year, section')
          .eq('faculty_id', facultyId);
        if (!faErr && faData) {
          subjects = (faData as any[]).map((s: any) => ({
            id: undefined,
            departmentId: s.department_id,
            facultyId: s.faculty_id,
            subjectId: s.subject_id,
            year: s.year,
            section: s.section ?? '',
          }));
        }
      } catch (e) {
        console.warn('faculty_subject_assignments fallback failed:', e);
      }
    }

    // Get class counselor info (handle table not existing)
    try {
      const { data: ccData, error: ccError } = await (supabase as any)
        .from('class_counselors')
        .select('year, section')
        .eq('faculty_id', facultyId)
        .eq('is_active', true)
        .maybeSingle();
      
      if (!ccError && ccData) {
        classCounselor = { year: ccData.year, section: ccData.section };
      }
    } catch (error) {
      console.warn('class_counselors table not accessible:', error);
      classCounselor = null;
    }

    // Get elective info (handle table not existing)
    try {
      const { data: electivesData, error: electivesError } = await (supabase as any)
        .from('faculty_electives')
        .select('*')
        .eq('faculty_id', facultyId);
      
      if (!electivesError && electivesData) {
        electives = electivesData.map((e: any) => ({
          id: e.id,
          facultyId: e.faculty_id,
          departmentId: e.department_id,
          subjectId: e.subject_id,
          year: e.year,
          section: e.section,
        }));
      }
    } catch (error) {
      console.warn('faculty_electives table not accessible:', error);
      electives = [];
    }

    return {
      faculty,
      subjects,
      classCounselor,
      electives,
    };
  } catch (error) {
    console.error('Error in getFacultyDetails:', error);
    throw new Error(`Failed to load faculty details: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function createFaculty(input: {
  departmentId: string;
  name: string;
  email?: string | null;
  designation?: string | null;
  takesElectives?: boolean;
}): Promise<Faculty> {
  const { data, error } = await (supabase as any)
    .from('faculty_members')
    .insert({
      department_id: input.departmentId,
      name: input.name,
      email: input.email ?? null,
      designation: input.designation ?? null,
      takes_electives: input.takesElectives ?? false,
    })
    .select('id, name, email, designation, takes_electives, department_id')
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    email: data.email ?? null,
    designation: data.designation ?? null,
    takesElectives: Boolean(data.takes_electives),
    departmentId: data.department_id,
  };
}

export async function updateFaculty(id: string, patch: Partial<{ name: string; email: string | null; designation: string | null; takesElectives: boolean; departmentId: string }>): Promise<void> {
  const payload: any = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.email !== undefined) payload.email = patch.email;
  if (patch.designation !== undefined) payload.designation = patch.designation;
  if (patch.takesElectives !== undefined) payload.takes_electives = patch.takesElectives;
  if (patch.departmentId !== undefined) payload.department_id = patch.departmentId;
  const { error } = await (supabase as any)
    .from('faculty_members')
    .update(payload)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteFaculty(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('faculty_members')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function assignFacultyToSubject(facultyId: string, subjectId: string): Promise<void> {
  const { data: subject, error: subjError } = await (supabase as any)
    .from('subjects')
    .select('department_id, year')
    .eq('id', subjectId)
    .maybeSingle();

  if (subjError) throw subjError;
  if (!subject) throw new Error('Subject not found');

  const { error } = await (supabase as any)
    .from('faculty_subject_assignments')
    .insert({
      faculty_id: facultyId,
      subject_id: subjectId,
      department_id: subject.department_id,
      year: subject.year,
      section: null,
    });

  if (error) throw error;
}

// Assign multiple subjects year-wide to a faculty
export async function assignFacultyToSubjectsYearWide(
  facultyId: string,
  departmentId: string,
  year: string,
  section: string,
  subjectIds: string[],
): Promise<void> {
  if (!subjectIds?.length) return;
  const rows = subjectIds.map((sid) => ({
    faculty_id: facultyId,
    subject_id: sid,
    department_id: departmentId,
    year,
    section,
  }));
  const { error } = await (supabase as any)
    .from('faculty_subject_assignments')
    .insert(rows as any);
  if (error) throw error;
}

export async function assignFacultyToSubjectInSection(
  facultyId: string,
  departmentId: string,
  year: string,
  section: string,
  subjectId: string,
): Promise<void> {
  const { error } = await (supabase as any)
    .from('faculty_subject_assignments')
    .insert({ faculty_id: facultyId, subject_id: subjectId, department_id: departmentId, year, section });
  if (error) throw error;
}

// Precise allocation into faculty_subject_assignments
export type FacultySubjectClass = { id?: string; departmentId: string; facultyId: string; subjectId: string; year: string; section: string };

export async function upsertFacultySubjectClassAll(
  departmentId: string,
  facultyId: string,
  allocations: Array<{ subjectId: string; year: string; section: string }>,
): Promise<void> {
  // Remove duplicates, then insert missing pairs
  if (!allocations?.length) return;
  const rows = allocations.map((a) => ({
    department_id: departmentId,
    faculty_id: facultyId,
    subject_id: a.subjectId,
    year: a.year,
    section: a.section,
  }));
  const { error } = await (supabase as any)
    .from('faculty_subject_assignments')
    .insert(rows as any, { upsert: true })
    .select('id');
  if (error) throw error;
}

export async function listFacultySubjectClass(
  departmentId: string,
  facultyId: string,
): Promise<FacultySubjectClass[]> {
  const { data, error } = await (supabase as any)
    .from('faculty_subject_assignments')
    .select('id, department_id, faculty_id, subject_id, year, section')
    .eq('department_id', departmentId)
    .eq('faculty_id', facultyId);
  if (error) throw error;
  return (data || []).map((r: any) => ({
    id: r.id,
    departmentId: r.department_id,
    facultyId: r.faculty_id,
    subjectId: r.subject_id,
    year: r.year,
    section: r.section,
  }));
}

export async function deleteFacultySubjectClass(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('faculty_subject_assignments')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// Electives
export type FacultyElective = {
  id?: string;
  facultyId: string;
  departmentId: string;
  subjectId?: string | null;
  year: string;
  section: string;
};

export async function saveFacultyElectives(
  facultyId: string,
  allocations: FacultyElective[],
): Promise<void> {
  if (!allocations?.length) return;
  
  // First delete existing electives for this faculty
  const { error: deleteError } = await (supabase as any)
    .from('faculty_electives')
    .delete()
    .eq('faculty_id', facultyId);
  
  if (deleteError) throw deleteError;
  
  // Then insert new electives
  const { error: insertError } = await (supabase as any)
    .from('faculty_electives')
    .insert(allocations);
  
  if (insertError) throw insertError;
}

export async function saveFacultyElectiveInfo(
  facultyId: string,
  departmentId: string,
  year: string,
  section: string,
): Promise<void> {
  // Delete existing elective info for this faculty
  const { error: deleteError } = await (supabase as any)
    .from('faculty_electives')
    .delete()
    .eq('faculty_id', facultyId);
  
  if (deleteError) throw deleteError;
  
  // Insert new elective info
  const { error: insertError } = await (supabase as any)
    .from('faculty_electives')
    .insert({
      faculty_id: facultyId,
      department_id: departmentId,
      year,
      section,
      subject_id: null, // No specific subject assigned
    });
  
  if (insertError) throw insertError;
}

export async function listFacultyElectives(facultyId: string): Promise<FacultyElective[]> {
  const { data, error } = await (supabase as any)
    .from('faculty_electives')
    .select('id, faculty_id, department_id, subject_id, year, section')
    .eq('faculty_id', facultyId);
  if (error) throw error;
  return (data || []).map((r: any) => ({
    id: r.id,
    facultyId: r.faculty_id,
    departmentId: r.department_id,
    subjectId: r.subject_id,
    year: r.year,
    section: r.section,
  }));
}

export async function deleteFacultyElective(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('faculty_electives')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// Labs
export type FacultyLab = {
  id?: string;
  facultyId: string;
  departmentId: string;
  subjectId: string;
  year: string;
  section: string;
};

export async function saveFacultyLabs(
  facultyId: string,
  allocations: FacultyLab[],
): Promise<void> {
  if (!allocations?.length) return;
  const rows = allocations.map((a) => ({
    faculty_id: facultyId,
    department_id: a.departmentId,
    subject_id: a.subjectId,
    year: a.year,
    section: a.section,
  }));
  const { error } = await (supabase as any)
    .from('faculty_labs')
    .insert(rows as any, { upsert: true });
  if (error) throw error;
}

export async function listFacultyLabs(facultyId: string): Promise<FacultyLab[]> {
  const { data, error } = await (supabase as any)
    .from('faculty_labs')
    .select('id, faculty_id, department_id, subject_id, year, section')
    .eq('faculty_id', facultyId);
  if (error) throw error;
  return (data || []).map((r: any) => ({
    id: r.id,
    facultyId: r.faculty_id,
    departmentId: r.department_id,
    subjectId: r.subject_id,
    year: r.year,
    section: r.section,
  }));
}

export async function deleteFacultyLab(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('faculty_labs')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function unassignFacultyFromSubject(assignmentId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('faculty_subject_assignments')
    .delete()
    .eq('id', assignmentId);
  if (error) throw error;
}

// Class Counselor helpers
export async function upsertClassCounselor(input: {
  departmentId: string;
  facultyId: string;
  year: string;
  section: string;
  batch?: string | null;
}): Promise<void> {
  // Strategy: deactivate existing active CC for this slot, then upsert new active CC
  const { error: deErr } = await (supabase as any)
    .from('class_counselors')
    .update({ is_active: false })
    .eq('department_id', input.departmentId)
    .eq('year', input.year)
    .eq('section', input.section)
    .eq('is_active', true);
  if (deErr) throw deErr;

  const { error } = await (supabase as any)
    .from('class_counselors')
    .insert({
      department_id: input.departmentId,
      faculty_id: input.facultyId,
      year: input.year,
      section: input.section,
      batch: input.batch ?? null,
      is_active: true,
    });
  if (error) throw error;
}

export async function getClassCounselor(departmentId: string, year: string, section: string): Promise<{ id: string; faculty_id: string; batch: string | null } | null> {
  const { data, error } = await (supabase as any)
    .from('class_counselors')
    .select('id, faculty_id, batch')
    .eq('department_id', departmentId)
    .eq('year', year)
    .eq('section', section)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function deactivateClassCounselor(departmentId: string, year: string, section: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('class_counselors')
    .update({ is_active: false })
    .eq('department_id', departmentId)
    .eq('year', year)
    .eq('section', section)
    .eq('is_active', true);
  if (error) throw error;
}

// Pull Requests - minimal for navbar badge
export async function getPendingPRCount(): Promise<number> {
  const { count, error } = await (supabase as any)
    .from('timetable_pull_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) return 0;
  return count || 0;
}

// Create a timetable Pull Request
export async function createPullRequest(input: {
  title: string;
  description?: string;
  departmentName: string;
  year: string;
  section: string;
  proposedGrid: string[][];
  proposedSpecialFlags: any;
  proposedLabPreferences: any;
  createdBy: string;
}): Promise<string> {
  const dept = await getDepartmentByName(input.departmentName);
  if (!dept) throw new Error('Department not found');

  const current = await getTimetable(dept.id, input.year, input.section);

  const { data, error } = await (supabase as any)
    .from('timetable_pull_requests')
    .insert({
      title: input.title,
      description: input.description || null,
      department_id: dept.id,
      year: input.year,
      section: input.section,
      proposed_grid_data: input.proposedGrid,
      proposed_special_flags: input.proposedSpecialFlags || {},
      proposed_lab_preferences: input.proposedLabPreferences || {},
      current_grid_data: current?.gridData || null,
      current_special_flags: current?.specialFlags || null,
      current_lab_preferences: null,
      created_by: input.createdBy,
      status: 'pending',
    })
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Failed to create pull request');
  return (data as any).id as string;
}

// Fetch a PR by id with maybeSingle
export async function getPullRequestById(id: string): Promise<any | null> {
  const { data, error } = await (supabase as any)
    .from('timetable_pull_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function reviewPullRequest(id: string, action: 'approve' | 'reject', notes?: string, reviewer?: string): Promise<void> {
  const status = action === 'approve' ? 'approved' : 'rejected';
  const { error } = await (supabase as any)
    .from('timetable_pull_requests')
    .update({ status, review_notes: notes || null, reviewed_by: reviewer || null, reviewed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// Approve-and-apply behavior: on approval, write to timetable_approvals and update current timetable
export async function approveAndApplyPullRequest(id: string, reviewer?: string): Promise<void> {
  // Load PR
  const { data: pr, error: prErr } = await (supabase as any)
    .from('timetable_pull_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (prErr) throw prErr;
  if (!pr) throw new Error('PR not found');

  // Write approval record
  try {
    const approvalRow: any = {
      pr_id: pr.id,
      department_id: pr.department_id,
      year: pr.year,
      section: pr.section,
      approved_by: reviewer || null,
      approved_at: new Date().toISOString(),
      proposed_grid_data: pr.proposed_grid_data || [],
      proposed_special_flags: pr.proposed_special_flags || {},
      proposed_lab_preferences: pr.proposed_lab_preferences || {},
    };
    const { error: apprErr } = await (supabase as any)
      .from('timetable_approvals')
      .insert(approvalRow);
    if (apprErr) {
      // Do not block timetable update if log table is missing or restricted
      console.warn('approveAndApplyPullRequest: approvals insert failed (non-fatal):', apprErr);
    }
  } catch (e) {
    console.warn('approveAndApplyPullRequest: approvals insert exception (non-fatal):', e);
  }

  // Apply to current timetable
  const payload = {
    department_id: pr.department_id,
    year: pr.year,
    section: pr.section,
    grid_data: pr.proposed_grid_data,
    special_flags: pr.proposed_special_flags || {},
    updated_at: new Date().toISOString(),
  } as any;
  const { error: ttErr } = await (supabase as any)
    .from('timetables')
    .upsert(payload, { onConflict: 'department_id,year,section' });
  if (ttErr) throw ttErr;

  // Mark PR as approved (no separate merge status)
  const { error: upErr } = await (supabase as any)
    .from('timetable_pull_requests')
    .update({ status: 'approved', reviewed_by: reviewer || null, reviewed_at: new Date().toISOString() })
    .eq('id', id);
  if (upErr) throw upErr;
}

// Subject -> Faculty mapping for a selection
export async function getSubjectFacultyMap(
  departmentId: string,
  year: string,
  section?: string,
): Promise<Record<string, string>> {
  const subjectToFacultyNames: Record<string, string> = {};

  // Try precise class-level mapping first
  try {
    let query = (supabase as any)
      .from('faculty_subject_assignments')
      .select('subject_id, faculty_id')
      .eq('department_id', departmentId)
      .eq('year', year);
    if (section) query = query.eq('section', section);
    const { data: fscRows, error: fscErr } = await query;
    if (fscErr) throw fscErr;
    if (fscRows && fscRows.length > 0) {
      const subjectIds: string[] = Array.from(new Set((fscRows as any[]).map((r) => r.subject_id).filter(Boolean)));
      const facultyIds: string[] = Array.from(new Set((fscRows as any[]).map((r) => r.faculty_id).filter(Boolean)));
      if (facultyIds.length > 0) {
        const { data: facRows } = await (supabase as any)
          .from('faculty_members')
          .select('id, name')
          .in('id', facultyIds);
        const idToName = new Map<string, string>();
        (facRows || []).forEach((r: any) => idToName.set(r.id, r.name));
        // For each subject, choose the first mapped faculty (per section there should be one)
        subjectIds.forEach((sid) => {
          const fIdsForSubject = (fscRows as any[]).filter((r) => r.subject_id === sid).map((r) => r.faculty_id);
          const names = fIdsForSubject.map((fid: string) => idToName.get(fid)).filter(Boolean) as string[];
          if (names.length > 0) subjectToFacultyNames[sid] = names.join(', ');
        });
      }
      // If we found any mapping, return early
      if (Object.keys(subjectToFacultyNames).length > 0) return subjectToFacultyNames;
    }
  } catch (e) {
    // non-fatal; fallback below
    console.warn('getSubjectFacultyMap: faculty_subject_assignments unavailable, falling back');
  }

  // Fallback: year-wide assignments (section may be null)
  try {
    let query = (supabase as any)
      .from('faculty_subject_assignments')
      .select('subject_id, faculty_id')
      .eq('department_id', departmentId)
      .eq('year', year);
    if (section) {
      // Prefer exact section rows; if none, we will still use the results (which might be empty)
      query = query.eq('section', section);
    }
    const { data: assignRows, error: assignErr } = await query;
    if (assignErr) throw assignErr;

    // If we filtered by section and got nothing, try section null (year-wide)
    let rows: any[] = (assignRows || []) as any[];
    if (rows.length === 0 && section) {
      const { data: yearWide } = await (supabase as any)
        .from('faculty_subject_assignments')
        .select('subject_id, faculty_id')
        .eq('department_id', departmentId)
        .eq('year', year)
        .is('section', null);
      rows = (yearWide || []) as any[];
    }

    if (rows.length > 0) {
      const facultyIds: string[] = Array.from(new Set(rows.map((r) => r.faculty_id).filter(Boolean)));
      const { data: facRows } = await (supabase as any)
        .from('faculty_members')
        .select('id, name')
        .in('id', facultyIds);
      const idToName = new Map<string, string>();
      (facRows || []).forEach((r: any) => idToName.set(r.id, r.name));
      const bySubject = new Map<string, Set<string>>();
      rows.forEach((r) => {
        const name = idToName.get(r.faculty_id);
        if (!name) return;
        if (!bySubject.has(r.subject_id)) bySubject.set(r.subject_id, new Set());
        bySubject.get(r.subject_id)!.add(name);
      });
      bySubject.forEach((names, sid) => {
        if (names.size > 0) subjectToFacultyNames[sid] = Array.from(names).join(', ');
      });
    }
  } catch (e) {
    console.warn('getSubjectFacultyMap: faculty_subject_assignments unavailable');
  }

  return subjectToFacultyNames;
}

export async function getSubjectFacultyMapByDeptName(
  departmentName: string,
  year: string,
  section?: string,
): Promise<Record<string, string>> {
  const dept = await getDepartmentByName(departmentName);
  if (!dept) return {};
  return getSubjectFacultyMap(dept.id, year, section);
}

// Year management
export async function getAllYears(): Promise<{ id: string; name: string; display_order: number; is_active: boolean }[]> {
  try {
    // Get distinct years from subjects table since there's no years table
    const { data, error } = await (supabase as any)
      .from('subjects')
      .select('year')
      .order('year');
    
    if (error) throw error;
    
    // Convert to the expected format and remove duplicates
    const uniqueYears = Array.from(new Set((data || []).map((item: any) => item.year)))
      .filter((year): year is string => year && typeof year === 'string') // Type guard for string
      .map((year, index) => ({
        id: year,
        name: year,
        display_order: index + 1,
        is_active: true
      }));
    
    return uniqueYears;
  } catch (error) {
    console.error('Error fetching years:', error);
    return [];
  }
}

export async function addYear(name: string, displayOrder: number): Promise<{ id: string; name: string; display_order: number; is_active: boolean } | null> {
  // Since there's no years table, this function is not applicable
  // Return a mock response to maintain compatibility
  return {
    id: name,
    name: name,
    display_order: displayOrder,
    is_active: true
  };
}

export async function updateYear(id: string, updates: { name?: string; display_order?: number; is_active?: boolean }): Promise<void> {
  // Since there's no years table, this function is not applicable
  // No-op to maintain compatibility
  console.warn('updateYear called but years table does not exist');
}

export async function deleteYear(id: string): Promise<void> {
  // Since there's no years table, this function is not applicable
  // No-op to maintain compatibility
  console.warn('deleteYear called but years table does not exist');
}

export async function ensureDefaultYears(): Promise<void> {
  // Since there's no years table, this function is not applicable
  // No-op to maintain compatibility
  console.warn('ensureDefaultYears called but years table does not exist');
}

// Faculty operations
export type FacultyMember = {
  id: string;
  department_id: string;
  name: string;
  email: string | null;
  designation: string | null;
  takes_electives: string | null;
  created_at: string;
  updated_at: string;
};

export type FacultyScheduleItem = {
  id: string;
  faculty_id: string;
  department_id: string;
  year: string;
  section: string;
  day: number;
  period: number;
  subject_name: string | null;
  is_special: boolean;
  created_at: string;
  updated_at: string;
};

export async function getFacultyByEmail(email: string): Promise<FacultyMember | null> {
  try {
    const { data, error } = await (supabase as any)
      .from('faculty_members')
      .select('*')
      .eq('email', email)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  } catch (error) {
    console.error('Error fetching faculty by email:', error);
    return null;
  }
}

export async function getFacultyById(facultyId: string): Promise<FacultyMember | null> {
  try {
    const { data, error } = await (supabase as any)
      .from('faculty_members')
      .select('*')
      .eq('id', facultyId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  } catch (error) {
    console.error('Error fetching faculty by ID:', error);
    return null;
  }
}

export async function updateFacultyMember(facultyId: string, updates: Partial<FacultyMember>): Promise<void> {
  try {
    const { error } = await (supabase as any)
      .from('faculty_members')
      .update(updates)
      .eq('id', facultyId);

    if (error) throw error;
  } catch (error) {
    console.error('Error updating faculty member:', error);
    throw error;
  }
}

export async function getFacultySchedule(facultyId: string): Promise<FacultyScheduleItem[]> {
  try {
    const { data, error } = await (supabase as any)
      .from('faculty_period_schedule')
      .select('*')
      .eq('faculty_id', facultyId)
      .order('year', { ascending: true })
      .order('section', { ascending: true })
      .order('day', { ascending: true })
      .order('period', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching faculty schedule:', error);
    return [];
  }
}

export async function getFacultyScheduleWithDetails(facultyId: string) {
  try {
    const { data, error } = await (supabase as any)
      .from('faculty_period_schedule')
      .select(`
        *,
        departments!inner(name)
      `)
      .eq('faculty_id', facultyId)
      .order('year', { ascending: true })
      .order('section', { ascending: true })
      .order('day', { ascending: true })
      .order('period', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching faculty schedule with details:', error);
    return [];
  }
}

export async function populateFacultySchedule(departmentId: string, year: string, section: string): Promise<void> {
  try {
    const { error } = await (supabase as any)
      .rpc('populate_faculty_schedule_from_timetable', {
        p_department_id: departmentId,
        p_year: year,
        p_section: section
      });

    if (error) throw error;
  } catch (error) {
    console.error('Error populating faculty schedule:', error);
    throw error;
  }
}

export async function populateAllFacultySchedules(): Promise<void> {
  try {
    // First try the database function
    const { error: rpcError } = await (supabase as any)
      .rpc('populate_all_faculty_schedules');

    if (!rpcError) {
      return; // Success with database function
    }

    // If database function fails, use JavaScript implementation
    console.warn('Database function not available, using JavaScript implementation');
    
    // Get all approved timetables
    const { data: timetables, error: ttError } = await (supabase as any)
      .from('timetables')
      .select('department_id, year, section, grid_data')
      .order('updated_at', { ascending: false });

    if (ttError) throw ttError;
    if (!timetables) return;

    // Clear existing faculty schedules
    const { error: clearError } = await (supabase as any)
      .from('faculty_period_schedule')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (clearError) throw clearError;

    // Process each timetable
    for (const tt of timetables) {
      await populateFacultyScheduleJS(tt.department_id, tt.year, tt.section, tt.grid_data);
    }

  } catch (error) {
    console.error('Error populating all faculty schedules:', error);
    throw error;
  }
}

// JavaScript implementation of faculty schedule population
async function populateFacultyScheduleJS(
  departmentId: string, 
  year: string, 
  section: string, 
  gridData: any[][]
): Promise<void> {
  if (!gridData || !Array.isArray(gridData)) return;

  const scheduleEntries: any[] = [];

  // Get faculty assignments for this class
  const { data: assignments } = await (supabase as any)
    .from('faculty_subject_assignments')
    .select(`
      faculty_id,
      subjects!inner(name, abbreviation, code)
    `)
    .eq('department_id', departmentId)
    .eq('year', year)
    .eq('section', section);

  // Create subject to faculty mapping
  const subjectToFaculty: Record<string, string> = {};
  if (assignments) {
    assignments.forEach((assignment: any) => {
      const subject = assignment.subjects;
      if (subject) {
        subjectToFaculty[subject.name] = assignment.faculty_id;
        if (subject.abbreviation) subjectToFaculty[subject.abbreviation] = assignment.faculty_id;
        if (subject.code) subjectToFaculty[subject.code] = assignment.faculty_id;
      }
    });
  }

  // Process grid data
  for (let dayIdx = 0; dayIdx < Math.min(gridData.length, 6); dayIdx++) {
    const dayRow = gridData[dayIdx];
    if (!Array.isArray(dayRow)) continue;

    for (let periodIdx = 0; periodIdx < Math.min(dayRow.length, 7); periodIdx++) {
      const cell = dayRow[periodIdx];
      if (!cell || cell === '' || cell === null) continue;

      const subjectName = String(cell).trim();
      const facultyId = subjectToFaculty[subjectName];

      if (facultyId) {
        scheduleEntries.push({
          faculty_id: facultyId,
          department_id: departmentId,
          year: year,
          section: section,
          day: dayIdx,
          period: periodIdx,
          subject_name: subjectName,
          is_special: ['Seminar', 'Library', 'Student Counselling'].includes(subjectName)
        });
      }
    }
  }

  // Insert schedule entries
  if (scheduleEntries.length > 0) {
    const { error } = await (supabase as any)
      .from('faculty_period_schedule')
      .insert(scheduleEntries);

    if (error) {
      console.error('Error inserting faculty schedule entries:', error);
      throw error;
    }
  }
}

