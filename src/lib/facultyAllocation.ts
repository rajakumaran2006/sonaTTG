import { supabase } from "@/integrations/supabase/client";
import { Subject } from "@/store/timetableStore";
import type { Grid } from "./timetable";

export interface FacultyAllocation {
  facultyId: string;
  facultyName: string;
  assignedSlots: Set<string>; // e.g., "mon-p1", "tue-p3"
  availableSlots: Set<string>;
  labPreference: boolean;
  subjectIds: Set<string>; // subjects this faculty teaches
  isClassCounselor: boolean;
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
function createSlotId(day: number, period: number): string {
  return `${DAYS[day]}-p${period + 1}`;
}

/**
 * Fetches existing faculty allocations from all timetables
 */
export async function fetchFacultyExistingAllocations(
  departmentId: string
): Promise<Map<string, Set<string>>> {
  const facultyAllocations = new Map<string, Set<string>>();
  
  try {
    // Get all timetables for the department
    const { data: timetables, error } = await supabase
      .from('timetables')
      .select('grid_data, year, section')
      .eq('department_id', departmentId);

    if (error) throw error;

    // Get all faculty subject assignments for the department
    const { data: assignments, error: assignError } = await supabase
      .from('faculty_subject_assignments')
      .select(`
        faculty_id,
        subject_id,
        year,
        section,
        faculty_members!inner(name)
      `)
      .eq('department_id', departmentId);

    if (assignError) throw assignError;

    // Build subject-to-faculty mapping
    const subjectToFaculty = new Map<string, { facultyId: string; facultyName: string }>();
    (assignments || []).forEach((assignment: any) => {
      subjectToFaculty.set(assignment.subject_id, {
        facultyId: assignment.faculty_id,
        facultyName: assignment.faculty_members?.name || 'Unknown'
      });
    });

    // Get all subjects to map names to IDs
    const { data: subjects, error: subjectError } = await supabase
      .from('subjects')
      .select('id, name, department_id')
      .eq('department_id', departmentId);

    if (subjectError) throw subjectError;

    const subjectNameToId = new Map<string, string>();
    (subjects || []).forEach((subject: any) => {
      subjectNameToId.set(subject.name, subject.id);
    });

    // Process each timetable
    (timetables || []).forEach((timetable: any) => {
      const grid: string[][] = timetable.grid_data || [];
      
      grid.forEach((dayRow, dayIndex) => {
        if (!dayRow) return;
        
        dayRow.forEach((cell, periodIndex) => {
          if (!cell || cell === null) return;
          
          const cellStr = String(cell).trim();
          if (!cellStr) return;
          
          // Handle special cases like "Seminar (Faculty Name)"
          let facultyInfo: { facultyId: string; facultyName: string } | undefined;
          
          const specialMatch = cellStr.match(/^(.*?)\s*\((.*?)\)$/);
          if (specialMatch) {
            const [, specialType, facultyName] = specialMatch;
            
            // Find faculty by name for special entries
            const facultyAssignment = (assignments || []).find((a: any) => 
              a.faculty_members?.name === facultyName
            );
            
            if (facultyAssignment) {
              facultyInfo = {
                facultyId: facultyAssignment.faculty_id,
                facultyName: facultyName
              };
            }
          } else {
            // Regular subject - find matching subject
            const subjectId = subjectNameToId.get(cellStr);
            if (subjectId) {
              facultyInfo = subjectToFaculty.get(subjectId);
            }
          }
          
          if (!facultyInfo) return;
          
          const slotId = createSlotId(dayIndex, periodIndex);
          
          if (!facultyAllocations.has(facultyInfo.facultyId)) {
            facultyAllocations.set(facultyInfo.facultyId, new Set());
          }
          
          facultyAllocations.get(facultyInfo.facultyId)!.add(slotId);
        });
      });
    });

  } catch (error) {
    console.error('Error fetching faculty allocations:', error);
  }

  return facultyAllocations;
}

/**
 * Builds faculty allocation map with availability and preferences
 */
export async function buildFacultyAllocationMap(
  departmentId: string,
  year: string,
  section: string
): Promise<Map<string, FacultyAllocation>> {
  const facultyMap = new Map<string, FacultyAllocation>();
  
  try {
    // Get existing allocations across all timetables
    const existingAllocations = await fetchFacultyExistingAllocations(departmentId);
    
    // Get faculty members with their preferences
    const { data: faculty, error: facultyError } = await supabase
      .from('faculty_members')
      .select('id, name, takes_electives')
      .eq('department_id', departmentId);

    if (facultyError) throw facultyError;

    // Get class counselor info for this specific class using the new function
    let classCounselor: { faculty_id: string } | null = null;
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

    // Get faculty subject assignments for this specific year/section
    const { data: assignments, error: assignError } = await supabase
      .from('faculty_subject_assignments')
      .select('faculty_id, subject_id')
      .eq('department_id', departmentId)
      .eq('year', year)
      .or(`section.eq.${section},section.is.null`);

    if (assignError) throw assignError;

    // Build faculty-to-subjects mapping
    const facultySubjects = new Map<string, Set<string>>();
    (assignments || []).forEach((assignment: any) => {
      if (!facultySubjects.has(assignment.faculty_id)) {
        facultySubjects.set(assignment.faculty_id, new Set());
      }
      facultySubjects.get(assignment.faculty_id)!.add(assignment.subject_id);
    });

    // Build allocation map for each faculty
    (faculty || []).forEach((f: any) => {
      const assignedSlots = existingAllocations.get(f.id) || new Set();
      const isClassCounselor = classCounselor?.faculty_id === f.id;
      const availableSlots = new Set<string>();
      
      // Calculate available slots (all slots minus assigned ones)
      for (let day = 0; day < 6; day++) {
        for (let period = 0; period < PERIODS; period++) {
          const slotId = createSlotId(day, period);
          
          // Reserve Saturday P3-P7 for class counselor
          if (isClassCounselor && day === 5 && period >= 2) {
            // CC gets Saturday P3-P7 reserved, so these are not available for regular allocation
            continue;
          }
          
          if (!assignedSlots.has(slotId)) {
            availableSlots.add(slotId);
          }
        }
      }
      
      facultyMap.set(f.id, {
        facultyId: f.id,
        facultyName: f.name,
        assignedSlots,
        availableSlots,
        labPreference: Boolean(f.takes_electives), // Using takes_electives as proxy for lab preference
        subjectIds: facultySubjects.get(f.id) || new Set(),
        isClassCounselor,
      });
    });

  } catch (error) {
    console.error('Error building faculty allocation map:', error);
  }

  return facultyMap;
}

/**
 * Finds available faculty for a subject at a specific time slot
 */
export function findAvailableFacultyForSlot(
  subjectId: string,
  day: number,
  period: number,
  facultyMap: Map<string, FacultyAllocation>,
  isLabSubject: boolean = false
): AllocationResult {
  const slotId = createSlotId(day, period);
  
  // Find faculty who teach this subject
  const eligibleFaculty = Array.from(facultyMap.values())
    .filter(faculty => faculty.subjectIds.has(subjectId));
    
  if (eligibleFaculty.length === 0) {
    return {
      success: false,
      day,
      period,
      conflictReason: `No faculty assigned to teach subject ${subjectId}`
    };
  }
  
  // Filter by availability and lab preference
  const availableFaculty = eligibleFaculty.filter(faculty => {
    // Check if slot is available
    if (!faculty.availableSlots.has(slotId)) {
      return false;
    }
    
    // Check lab preference for lab subjects
    if (isLabSubject && !faculty.labPreference) {
      return false;
    }
    
    return true;
  });
  
  if (availableFaculty.length === 0) {
    const reasons = [];
    
    // Analyze why no faculty is available
    eligibleFaculty.forEach(faculty => {
      if (!faculty.availableSlots.has(slotId)) {
        reasons.push(`${faculty.facultyName} already assigned at ${slotId}`);
      }
      if (isLabSubject && !faculty.labPreference) {
        reasons.push(`${faculty.facultyName} doesn't prefer lab sessions`);
      }
    });
    
    return {
      success: false,
      day,
      period,
      conflictReason: reasons.join('; ')
    };
  }
  
  // Prioritize faculty with fewer current assignments (workload balancing)
  const selectedFaculty = availableFaculty.reduce((best, current) => {
    const bestAssigned = best.assignedSlots.size;
    const currentAssigned = current.assignedSlots.size;
    return currentAssigned < bestAssigned ? current : best;
  });
  
  return {
    success: true,
    facultyId: selectedFaculty.facultyId,
    facultyName: selectedFaculty.facultyName,
    day,
    period
  };
}

/**
 * Allocates a faculty to a time slot and updates their availability
 */
export function allocateFacultyToSlot(
  facultyId: string,
  day: number,
  period: number,
  facultyMap: Map<string, FacultyAllocation>
): boolean {
  const faculty = facultyMap.get(facultyId);
  if (!faculty) return false;
  
  const slotId = createSlotId(day, period);
  
  // Check if slot is available
  if (!faculty.availableSlots.has(slotId)) {
    return false;
  }
  
  // Allocate the slot
  faculty.assignedSlots.add(slotId);
  faculty.availableSlots.delete(slotId);
  
  return true;
}

/**
 * Validates that no faculty conflicts exist in a timetable grid
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
    const facultyMap = await buildFacultyAllocationMap(departmentId, year, section);
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
        let facultyInfo: { facultyId: string; facultyName: string } | undefined;
        
        // Handle special cases like "Seminar (Faculty Name)"
        const specialMatch = cellStr.match(/^(.*?)\s*\((.*?)\)$/);
        if (specialMatch) {
          const [, specialType, facultyName] = specialMatch;
          
          // Find faculty by name for special entries
          const faculty = Array.from(facultyMap.values()).find(f => f.facultyName === facultyName);
          if (faculty) {
            facultyInfo = {
              facultyId: faculty.facultyId,
              facultyName: faculty.facultyName
            };
          }
        } else {
          // Regular subject
          const subjectId = subjectNameToId.get(cellStr);
          if (subjectId) {
            // Find faculty for this subject
            const eligibleFaculty = Array.from(facultyMap.values())
              .filter(faculty => faculty.subjectIds.has(subjectId));
              
            if (eligibleFaculty.length === 0) {
              warnings.push(`No faculty assigned for ${cellStr} at ${slotId}`);
              return;
            }
            
            // Check for conflicts with existing assignments (other timetables)
            const availableFaculty = eligibleFaculty.filter(faculty => 
              faculty.availableSlots.has(slotId)
            );
            
            if (availableFaculty.length === 0) {
              conflicts.push(`Faculty conflict for ${cellStr} at ${slotId} - all assigned faculty are busy`);
              return;
            }
            
            facultyInfo = {
              facultyId: availableFaculty[0].facultyId,
              facultyName: availableFaculty[0].facultyName
            };
          }
        }
        
        if (!facultyInfo) return;
        
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