/**
 * SonaTTG Global Scheduling Model Builder
 * 
 * Ingests academic data across all selected departments, academic years, sections,
 * faculty, rooms, and institutional configurations.
 * 
 * Responsibilities:
 * 1. Identifies and anchors all immutable assignments (Fixed OE, Manual Labs, Saturday Specials).
 * 2. Pre-validates fixed assignments for conflicts before starting the solver.
 * 3. Decomposes all curriculum teaching requirements into discrete Teaching Units with pruned domains.
 * 4. Precomputes valid candidate slots and conflict constraints.
 */

import {
  TOTAL_DAYS,
  PERIODS_PER_DAY,
  TimeSlot,
  ClassIdentifier,
  classIdToKey,
  TeachingUnit,
  ImmutableAssignment,
  InfeasibilityDiagnostic,
  slotToKey,
  ActivityType,
  cleanSubjectName,
} from './types';
import type { Subject, SpecialHoursConfig } from '@/store/timetableStore';
import type { FacultyAllocation } from '../facultyAllocation';
import type { OpenElectiveConfig } from '../supabaseService';

export interface ModelInputData {
  semesterType: 'odd' | 'even';
  classes: ClassIdentifier[];
  subjectsByClass: Map<string, Subject[]>; // classKey -> subjects
  facultyMap: Map<string, FacultyAllocation>;
  specialHoursConfigs: Map<string, SpecialHoursConfig[]>; // `${deptId}_${year}` -> configs
  classCounselorsMap: Map<string, { facultyId: string; facultyName: string }>; // classKey -> counselor
  manualLabsMap: Map<string, Array<{ day: number; period: number; labName: string; labId?: string }>>; // classKey -> labs
  openElectiveConfigs: Map<string, OpenElectiveConfig>; // `${deptId}_${year}` -> OE config
  preferSeniorProfMorning?: boolean;
}

export interface GlobalSchedulingModel {
  classes: ClassIdentifier[];
  immutableAssignments: ImmutableAssignment[];
  teachingUnits: TeachingUnit[];
  preValidationDiagnostics: InfeasibilityDiagnostic[];
  isModelValid: boolean;
  fixedGridByClass: Map<string, Array<Array<{
    subjectName: string;
    subjectId: string;
    facultyId?: string;
    facultyName?: string;
    roomId?: string;
    isFixed: boolean;
    activityType: ActivityType;
  } | null>>>;
  occupiedSlotsByClass: Map<string, Set<string>>; // classKey -> Set of 'd:p'
  occupiedSlotsByFaculty: Map<string, Map<string, Array<{ classKey: string; subjectName: string }>>>; // facultyId -> slotKey -> bookings
  facultyMap?: Map<string, FacultyAllocation>;
  facultyNameById?: Map<string, string>;
}

/**
 * Resolves faculty allocation with strict section-specific precedence:
 * 1. Matching subjectId, year, and exact section
 * 2. Matching subjectId and year
 * 3. Matching subjectId generic
 */
export function resolveFacultyForSection(
  facultyMap: Map<string, FacultyAllocation>,
  subjectId: string,
  year: string,
  section: string,
  candidateSlots?: TimeSlot[],
  occupiedSlotsByFaculty?: Map<string, Map<string, Array<{ classKey: string; subjectName: string }>>>,
  departmentId?: string
): FacultyAllocation | undefined {
  const isFacultyFreeAtSlots = (facId: string): boolean => {
    if (!candidateSlots || candidateSlots.length === 0 || !occupiedSlotsByFaculty) return true;
    const facBookings = occupiedSlotsByFaculty.get(facId);
    if (!facBookings) return true;
    for (const slot of candidateSlots) {
      const sKey = `${slot.day}:${slot.period}`;
      const existing = facBookings.get(sKey);
      if (existing && existing.length > 0) {
        return false;
      }
    }
    return true;
  };

  const idSet = new Set([subjectId, ...subjectId.split('_')]);

  // 1. Precise section-specific assignments
  const sectionCandidates: FacultyAllocation[] = [];
  for (const f of facultyMap.values()) {
    const hasSectionAssignment = f.assignments?.some(a =>
      idSet.has(a.subjectId) &&
      (!a.year || a.year === year) &&
      (!a.section || a.section.trim().toUpperCase() === section.trim().toUpperCase()) &&
      (!departmentId || !a.departmentId || a.departmentId === departmentId)
    );
    if (hasSectionAssignment) {
      sectionCandidates.push(f);
    }
  }

  const secOffset = Math.max(0, (section || 'A').trim().toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0));

  const filterByDept = (list: FacultyAllocation[]) => {
    if (!departmentId) return list;
    const sameDept = list.filter(f => !f.departmentId || f.departmentId === departmentId);
    return sameDept.length > 0 ? sameDept : list;
  };

  const getLoad = (f: FacultyAllocation) =>
    (occupiedSlotsByFaculty?.get(f.facultyId)?.size || 0) + (f.assignedSlots?.size || 0);

  const sortByLoad = (list: FacultyAllocation[]) =>
    [...filterByDept(list)].sort((a, b) => getLoad(a) - getLoad(b));

  if (sectionCandidates.length > 0) {
    if (candidateSlots && candidateSlots.length > 0) {
      const freeCandidate = sectionCandidates.find(f => isFacultyFreeAtSlots(f.facultyId));
      if (freeCandidate) return freeCandidate;
    }
    const sorted = sortByLoad(sectionCandidates);
    return sorted[secOffset % sorted.length];
  }

  // 2. Year-specific assignments
  const yearCandidates: FacultyAllocation[] = [];
  for (const f of facultyMap.values()) {
    const hasYearAssignment = f.assignments?.some(a =>
      idSet.has(a.subjectId) &&
      (!a.year || a.year === year) &&
      (!departmentId || !a.departmentId || a.departmentId === departmentId)
    );
    if (hasYearAssignment) {
      yearCandidates.push(f);
    }
  }
  if (yearCandidates.length > 0) {
    if (candidateSlots && candidateSlots.length > 0) {
      const freeCandidate = yearCandidates.find(f => isFacultyFreeAtSlots(f.facultyId));
      if (freeCandidate) return freeCandidate;
    }
    const sorted = sortByLoad(yearCandidates);
    return sorted[secOffset % sorted.length];
  }

  // 3. Fallback to general subject assignment
  const genericCandidates: FacultyAllocation[] = [];
  for (const f of facultyMap.values()) {
    if (f.subjectIds && Array.from(idSet).some(id => f.subjectIds.has(id))) {
      genericCandidates.push(f);
    }
  }
  if (genericCandidates.length > 0) {
    if (candidateSlots && candidateSlots.length > 0) {
      const freeCandidate = genericCandidates.find(f => isFacultyFreeAtSlots(f.facultyId));
      if (freeCandidate) return freeCandidate;
    }
    const sorted = sortByLoad(genericCandidates);
    return sorted[secOffset % sorted.length];
  }

  return undefined;
}

export function resolveAllFacultyForSection(
  facultyMap: Map<string, FacultyAllocation>,
  subjectId: string,
  year: string,
  section: string,
  candidateSlots?: TimeSlot[],
  occupiedSlotsByFaculty?: Map<string, Map<string, Array<{ classKey: string; subjectName: string }>>>,
  departmentId?: string,
  maxFacultyCount?: number
): { primaryFaculty?: FacultyAllocation; secondaryFaculty: FacultyAllocation[] } {
  const isFacultyFreeAtSlots = (facId: string): boolean => {
    if (!candidateSlots || candidateSlots.length === 0 || !occupiedSlotsByFaculty) return true;
    const facBookings = occupiedSlotsByFaculty.get(facId);
    if (!facBookings) return true;
    for (const slot of candidateSlots) {
      const sKey = `${slot.day}:${slot.period}`;
      const existing = facBookings.get(sKey);
      if (existing && existing.length > 0) {
        return false;
      }
    }
    return true;
  };

  // First, always attempt direct resolution for the full subjectId
  const directFaculty = resolveFacultyForSection(
    facultyMap,
    subjectId,
    year,
    section,
    candidateSlots,
    occupiedSlotsByFaculty,
    departmentId
  );

  const resolvedList: FacultyAllocation[] = [];
  const seenFacIds = new Set<string>();

  if (directFaculty) {
    seenFacIds.add(directFaculty.facultyId);
    resolvedList.push(directFaculty);
  }

  const isComposite = subjectId.includes('_');
  const allowedLimit = isComposite ? 99 : (maxFacultyCount !== undefined && maxFacultyCount !== null ? maxFacultyCount : 1);

  // 1. Gather all faculty explicitly assigned to this section for this subject (co-teaching / lab partners)
  const isLab = Boolean(candidateSlots && candidateSlots.length > 0);
  if (allowedLimit > 1 || isLab) {
    const idSet = new Set([subjectId, ...subjectId.split('_').filter(Boolean)]);
    for (const f of facultyMap.values()) {
      if (allowedLimit > 1 && resolvedList.length >= allowedLimit) break;
      if (seenFacIds.has(f.facultyId)) continue;
      if (!isFacultyFreeAtSlots(f.facultyId)) continue;

      const hasSec = f.assignments?.some(a =>
        (idSet.has(a.subjectId) || (a.subjectId && subjectId.includes(a.subjectId))) &&
        (!a.year || a.year === year) &&
        (!a.section || a.section.trim().toUpperCase() === section.trim().toUpperCase()) &&
        (!departmentId || !a.departmentId || a.departmentId === departmentId)
      );
      if (!hasSec) continue;

      // If maxFacultyCount is 1 or unspecified (default 1), only include as secondary co-teacher
      // if faculty is NOT assigned to another section for this subject
      // (meaning they are unique to this section and not part of a shared pool for parallel sections)
      if (!maxFacultyCount || maxFacultyCount === 1) {
        const hasOtherSec = f.assignments?.some(a =>
          (idSet.has(a.subjectId) || (a.subjectId && subjectId.includes(a.subjectId))) &&
          (!a.year || a.year === year) &&
          (a.section && a.section.trim().toUpperCase() !== section.trim().toUpperCase()) &&
          (!departmentId || !a.departmentId || a.departmentId === departmentId)
        );
        if (hasOtherSec) {
          // Shared pool across parallel sections (like IT IV DL Lab), do not add as co-teacher!
          continue;
        }
      }

      seenFacIds.add(f.facultyId);
      resolvedList.push(f);
    }
  }

  // 2. Multi-subject composite (e.g. grouped parallel electives: id1_id2)
  if (isComposite) {
    const subIds = subjectId.split('_').filter(Boolean);
    for (const sId of subIds) {
      const fac = resolveFacultyForSection(
        facultyMap,
        sId,
        year,
        section,
        candidateSlots,
        occupiedSlotsByFaculty,
        departmentId
      );
      if (fac && !seenFacIds.has(fac.facultyId)) {
        seenFacIds.add(fac.facultyId);
        resolvedList.push(fac);
      }
    }
  }

  return {
    primaryFaculty: resolvedList[0],
    secondaryFaculty: resolvedList.slice(1),
  };
}

function isSoftSkillSubject(subj: Subject): boolean {
  const name = subj.name.toLowerCase();
  const tags = (subj.tags || []).map(t => t.toLowerCase());
  return (
    name.includes('soft skill') ||
    name.includes('aptitude') ||
    name.includes('verbal') ||
    name.includes('ssa') ||
    tags.some(t => t.includes('soft_skill') || t.includes('aptitude') || t.includes('ssa'))
  );
}

function isNptelSubject(subj: Subject): boolean {
  const name = subj.name.toLowerCase();
  const tags = (subj.tags || []).map(t => t.toLowerCase());
  return name.includes('nptel') || name.includes('design thinking') || tags.some(t => t.includes('nptel'));
}

function isSeniorProfessorFaculty(faculty?: FacultyAllocation): boolean {
  if (!faculty || !faculty.designation) return false;
  const d = faculty.designation.toLowerCase();
  if (d.includes('assistant') || d.includes('associate')) return false;
  return d.includes('professor') || d.includes('hod') || d.includes('head') || d.includes('dean');
}

export function cleanFacultyName(name?: string): string {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/^(dr|mr|mrs|ms|prof)[\.\s]*/i, '')
    .replace(/[^a-z0-9]/g, '');
}

export function getFacultyAliases(name?: string): string[] {
  if (!name) return [];
  const keys = new Set<string>();
  const parts = name.split(/\/|&|\band\b/i).map(p => p.trim()).filter(Boolean);
  for (const part of parts) {
    const rawClean = part.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (rawClean.length >= 2) {
      keys.add(`norm_fac_${rawClean}`);
    }
    const noTitle = part.toLowerCase()
      .replace(/^(dr|mr|mrs|ms|prof)[\.\s]*/i, '')
      .replace(/[^a-z0-9]/g, '');
    if (noTitle.length >= 2) {
      keys.add(`norm_fac_${noTitle}`);
    }
  }
  return Array.from(keys);
}

/**
 * Builds the complete global constraint model
 */
export function buildGlobalSchedulingModel(input: ModelInputData): GlobalSchedulingModel {
  const diagnostics: InfeasibilityDiagnostic[] = [];
  const immutableAssignments: ImmutableAssignment[] = [];
  const teachingUnits: TeachingUnit[] = [];

  // Track occupied slots for classes & faculty
  const fixedGridByClass = new Map<string, Array<Array<any | null>>>();
  const occupiedSlotsByClass = new Map<string, Set<string>>();
  const occupiedSlotsByFaculty = new Map<string, Map<string, Array<{ classKey: string; subjectName: string }>>>();
  const occupiedSlotsByRoom = new Map<string, Map<string, Array<{ classKey: string; subjectName: string }>>>();

  // 1. Initialize empty class grids
  for (const c of input.classes) {
    const key = classIdToKey(c);
    const grid: any[][] = Array.from({ length: TOTAL_DAYS }, () => Array(PERIODS_PER_DAY).fill(null));
    fixedGridByClass.set(key, grid);
    occupiedSlotsByClass.set(key, new Set());
  }

  // 2. Register existing external faculty allocations (from other non-selected timetables in DB)
  for (const [facId, facAlloc] of input.facultyMap.entries()) {
    if (!occupiedSlotsByFaculty.has(facId)) {
      occupiedSlotsByFaculty.set(facId, new Map());
    }
    const facSlots = occupiedSlotsByFaculty.get(facId)!;
    for (const slotKey of facAlloc.assignedSlots) {
      // Slot string is e.g. "mon-p1"
      const [dName, pName] = slotKey.toLowerCase().split('-');
      const dIdx = ["mon", "tue", "wed", "thu", "fri", "sat"].indexOf(dName);
      const pIdx = parseInt(pName?.replace('p', '') || '1', 10) - 1;
      if (dIdx >= 0 && dIdx < TOTAL_DAYS && pIdx >= 0 && pIdx < PERIODS_PER_DAY) {
        const sKey = `${dIdx}:${pIdx}`;
        if (!facSlots.has(sKey)) {
          facSlots.set(sKey, []);
        }
        facSlots.get(sKey)!.push({
          classKey: 'EXTERNAL_TIMETABLE',
          subjectName: 'Existing Schedule',
        });
      }
    }
  }

  // Helper to record an immutable assignment
  const lockImmutableSlot = (
    c: ClassIdentifier,
    slot: TimeSlot,
    subjectId: string,
    subjectName: string,
    facultyId?: string,
    facultyName?: string,
    roomId?: string,
    activityType: ActivityType = 'fixed_custom',
    reason = 'Staff configured',
    secondaryFacultyIds?: string[]
  ) => {
    const cKey = classIdToKey(c);
    const sKey = slotToKey(slot);
    const grid = fixedGridByClass.get(cKey)!;
    const cSlots = occupiedSlotsByClass.get(cKey)!;

    // Check Class Overlap
    if (grid[slot.day][slot.period] !== null) {
      const existing = grid[slot.day][slot.period];
      // Idempotent check: if the exact same subject is assigned again to this slot (e.g. duplicate DB rows or repeated registration)
      if (
        existing.subjectId === subjectId ||
        cleanSubjectName(existing.subjectName) === cleanSubjectName(subjectName)
      ) {
        if (!existing.roomId && roomId) existing.roomId = roomId;
        if (!existing.facultyId && facultyId) {
          existing.facultyId = facultyId;
          existing.facultyName = facultyName;
        }
        return;
      }

      diagnostics.push({
        category: 'FIXED_ASSIGNMENT_COLLISION',
        severity: 'CRITICAL',
        affectedDepartment: c.departmentName,
        affectedYear: c.year,
        affectedSection: c.section,
        affectedSubject: subjectName,
        conflictingSlots: [slot],
        description: `Class collision in ${cKey}: slot Day ${slot.day + 1} P${slot.period + 1} is already occupied by "${existing.subjectName}" when trying to place "${subjectName}".`,
        remediationAdvice: `Review conflicting fixed assignments or manual lab schedule entries for ${cKey}.`,
      });
      return;
    }

    // Check Faculty Overlap for all assigned faculty (primary + secondary)
    const allFacIds = [facultyId, ...(secondaryFacultyIds || [])].filter((f): f is string => Boolean(f));
    for (const fId of allFacIds) {
      if (!occupiedSlotsByFaculty.has(fId)) {
        occupiedSlotsByFaculty.set(fId, new Map());
      }
      const facSlots = occupiedSlotsByFaculty.get(fId)!;
      if (!facSlots.has(sKey)) {
        facSlots.set(sKey, []);
      }
      const existingBookings = facSlots.get(sKey)!;

      // Allow if same class and same subject (idempotent registration)
      const isSameClassSameSubj = existingBookings.some(
        b => b.classKey === cKey && cleanSubjectName(b.subjectName) === cleanSubjectName(subjectName)
      );
      // True collision if different subject or independent session
      const isSharedOe = activityType === 'open_elective' && existingBookings.every(
        b => cleanSubjectName(b.subjectName) === cleanSubjectName(subjectName) ||
             b.classKey === 'OPEN_ELECTIVE' ||
             /open elective|\boe\b/i.test(b.subjectName)
      );
      const isSharedSpecial = (activityType === 'counseling' || activityType === 'seminar' || activityType === 'library') &&
        existingBookings.every(b => cleanSubjectName(b.subjectName) === cleanSubjectName(subjectName));

      if (existingBookings.length > 0 && !isSharedOe && !isSharedSpecial && !isSameClassSameSubj) {
        diagnostics.push({
          category: 'FIXED_ASSIGNMENT_COLLISION',
          severity: 'CRITICAL',
          affectedDepartment: c.departmentName,
          affectedYear: c.year,
          affectedSection: c.section,
          affectedSubject: subjectName,
          affectedFacultyId: fId,
          affectedFacultyName: facultyName,
          conflictingSlots: [slot],
          description: `Fixed assignment faculty conflict: Faculty (${fId}) is already booked at Day ${slot.day + 1} P${slot.period + 1} for ${existingBookings[0].classKey} ("${existingBookings[0].subjectName}").`,
          remediationAdvice: `Reassign the faculty member in one of the conflicting classes or modify the fixed schedule.`,
        });
      }
      if (!isSameClassSameSubj) {
        facSlots.get(sKey)!.push({ classKey: cKey, subjectName });
      }
    }

    // Check Room Overlap
    if (roomId) {
      if (!occupiedSlotsByRoom.has(roomId)) {
        occupiedSlotsByRoom.set(roomId, new Map());
      }
      const roomSlots = occupiedSlotsByRoom.get(roomId)!;
      if (!roomSlots.has(sKey)) {
        roomSlots.set(sKey, []);
      }
      const existingRoomBookings = roomSlots.get(sKey)!;
      const isSameClassRoom = existingRoomBookings.some(b => b.classKey === cKey);

      if (existingRoomBookings.length > 0 && !isSameClassRoom) {
        diagnostics.push({
          category: 'ROOM_COLLISION',
          severity: 'CRITICAL',
          affectedDepartment: c.departmentName,
          affectedYear: c.year,
          affectedSection: c.section,
          affectedSubject: subjectName,
          affectedRoomId: roomId,
          conflictingSlots: [slot],
          description: `Physical room collision: Room/Lab "${roomId}" is already booked at Day ${slot.day + 1} P${slot.period + 1} for ${existingRoomBookings[0].classKey} ("${existingRoomBookings[0].subjectName}").`,
          remediationAdvice: `Assign a different room or reschedule one of the classes.`,
        });
      }
      if (!isSameClassRoom) {
        existingRoomBookings.push({ classKey: cKey, subjectName });
      }
    }

    grid[slot.day][slot.period] = {
      subjectName,
      subjectId,
      facultyId,
      secondaryFacultyIds,
      facultyName,
      roomId,
      isFixed: true,
      activityType,
    };
    cSlots.add(sKey);
  };

  // ── PRE-ANCHOR OPEN ELECTIVE (OE) STAFF COLLEGE-WIDE ─────────────────────────
  // Institutional standard slots for Open Elective:
  // Mon 1st hr (0:0), Wed 1st hr (2:0), Fri 1st hr (4:0), Sat 1st hr (5:0), Sat 2nd hr (5:1)
  const STANDARD_OE_SLOTS: TimeSlot[] = [
    { day: 0, period: 0 }, // Monday 1st hr
    { day: 2, period: 0 }, // Wednesday 1st hr
    { day: 4, period: 0 }, // Friday 1st hr
    { day: 5, period: 0 }, // Saturday 1st hr
    { day: 5, period: 1 }, // Saturday 2nd hr
  ];

  // 1. Collect all Open Elective subject IDs across all classes and subjects
  const allOeSubjectIds = new Set<string>();
  for (const [, subjs] of input.subjectsByClass) {
    for (const s of subjs) {
      if (
        s.type === 'open elective' ||
        s.elective_group_name?.toLowerCase() === 'open elective' ||
        /open elective|\boe\b/i.test(s.name) ||
        (s.code && /\boe\b/i.test(s.code))
      ) {
        allOeSubjectIds.add(s.id);
        s.id.split('_').forEach(id => allOeSubjectIds.add(id));
      }
    }
  }

  // 2. Identify all faculty assigned to teach OE across the entire college
  const oeStaffFacultyMap = new Map<string, FacultyAllocation>();
  for (const [, subjs] of input.subjectsByClass) {
    for (const s of subjs) {
      if (
        s.type === 'open elective' ||
        s.elective_group_name?.toLowerCase() === 'open elective' ||
        /open elective|\boe\b/i.test(s.name) ||
        (s.code && /\boe\b/i.test(s.code))
      ) {
        if (s.staff) {
          const staffClean = cleanFacultyName(s.staff);
          for (const [facId, fac] of input.facultyMap) {
            if (cleanFacultyName(fac.facultyName) === staffClean || facId === s.staff) {
              oeStaffFacultyMap.set(facId, fac);
            }
          }
        }
      }
    }
  }
  for (const [facId, fac] of input.facultyMap) {
    const hasOeSubjectId = Array.from(allOeSubjectIds).some(id => fac.subjectIds.has(id));
    const hasOeAssignment = fac.assignments?.some(a =>
      allOeSubjectIds.has(a.subjectId) ||
      (a.subjectId && Array.from(allOeSubjectIds).some(oeId => a.subjectId.includes(oeId)))
    );
    const isOeStaffByDesignation =
      /open elective|\boe staff\b/i.test(fac.designation || '') ||
      /open elective/i.test(fac.facultyName || '');

    if (hasOeSubjectId || hasOeAssignment || isOeStaffByDesignation) {
      oeStaffFacultyMap.set(facId, fac);
    }
  }

  // 3. Pre-book OE slots for ALL identified OE staff so NO other hours can be assigned to them!
  for (const [facId] of oeStaffFacultyMap) {
    if (!occupiedSlotsByFaculty.has(facId)) {
      occupiedSlotsByFaculty.set(facId, new Map());
    }
    const fSlots = occupiedSlotsByFaculty.get(facId)!;
    for (const slot of STANDARD_OE_SLOTS) {
      const sKey = `${slot.day}:${slot.period}`;
      if (!fSlots.has(sKey)) {
        fSlots.set(sKey, []);
      }
      fSlots.get(sKey)!.push({
        classKey: 'OPEN_ELECTIVE',
        subjectName: 'Open Elective',
      });
    }
  }

  // 3. ANCHOR IMMUTABLE ASSIGNMENTS
  for (const c of input.classes) {
    const cKey = classIdToKey(c);
    const rawSubjects = input.subjectsByClass.get(cKey) || [];
    const isYear4Even = input.semesterType === 'even' && (c.year === 'IV' || c.year === '4');
    if (isYear4Even) {
      const projSubj = rawSubjects.find(s => /project/i.test(s.name)) || {
        id: `static_proj_${c.departmentId}_${c.year}`,
        name: 'Project Work',
        code: 'PROJ',
        type: 'theory',
        hoursPerWeek: 37,
        credits: 10,
        abbreviation: 'PROJECT',
        tags: ['even_sem']
      };

      let counselor = input.classCounselorsMap.get(cKey);
      if (!counselor || !counselor.facultyId) {
        const deptFaculty = Array.from(input.facultyMap.values()).find(
          f => !f.departmentId || f.departmentId === c.departmentId
        );
        if (deptFaculty) {
          counselor = { facultyId: deptFaculty.facultyId, facultyName: deptFaculty.facultyName };
        }
      }

      // 1. All 35 weekday hours (Mon-Fri, Day 0 to 4, P0 to P6 = 7 periods each): Project Work (Classroom only, no faculty)
      const weekdaySlots: TimeSlot[] = [];
      for (let d = 0; d < 5; d++) {
        for (let p = 0; p < PERIODS_PER_DAY; p++) {
          lockImmutableSlot(
            c,
            { day: d, period: p },
            projSubj.id,
            projSubj.name,
            undefined, // No faculty -> classroom timetable only
            undefined,
            undefined,
            'project',
            'Year IV Even Sem Project Work'
          );
          weekdaySlots.push({ day: d, period: p });
        }
      }

      // 2. Saturday first 2 hours (Day 5, P0 and P1): Project Work (Classroom only, no faculty)
      const satProjSlots: TimeSlot[] = [];
      for (let p = 0; p < 2; p++) {
        lockImmutableSlot(
          c,
          { day: 5, period: p },
          projSubj.id,
          projSubj.name,
          undefined, // No faculty -> classroom timetable only
          undefined,
          undefined,
          'project',
          'Year IV Even Sem Project Work'
        );
        satProjSlots.push({ day: 5, period: p });
      }

      immutableAssignments.push({
        classKey: cKey,
        classId: c,
        subjectId: projSubj.id,
        subjectName: projSubj.name,
        subjectCode: projSubj.code || 'PROJ',
        activityType: 'project',
        slots: [...weekdaySlots, ...satProjSlots], // Exactly 37 hours
        source: 'fixed_curriculum',
      });

      // 3. Saturday last 5 hours (Day 5, P2 to P6, Period 3 to Period 7): Class Counselor only!
      const spKey = `${c.departmentId}_${c.year}`;
      const spConfigs = (input.specialHoursConfigs.get(spKey) || []).filter(sp => sp.is_active);
      const satCcSlots: TimeSlot[] = [];

      for (let p = 2; p < PERIODS_PER_DAY; p++) {
        const periodNum = p + 1;
        const matchingSp = spConfigs.find(sp => {
          const satP = Array.isArray(sp.saturday_periods) ? sp.saturday_periods : [];
          return satP.includes(p) || satP.includes(periodNum) || satP.includes(50 + p) || satP.includes(50 + periodNum);
        });

        const slotTitle = matchingSp?.special_type
          ? (matchingSp.special_type.charAt(0).toUpperCase() + matchingSp.special_type.slice(1).toLowerCase())
          : (p === 2 || p === 3 ? 'Seminar' : p === 4 ? 'Library' : 'Counseling');

        const actType: ActivityType = /seminar/i.test(slotTitle)
          ? 'seminar'
          : /library/i.test(slotTitle)
          ? 'library'
          : 'counseling';

        lockImmutableSlot(
          c,
          { day: 5, period: p },
          `cc_${cKey}_${p}`,
          slotTitle,
          counselor?.facultyId,
          counselor?.facultyName,
          undefined,
          actType,
          'Year IV Saturday CC Hours'
        );
        satCcSlots.push({ day: 5, period: p });
      }

      immutableAssignments.push({
        classKey: cKey,
        classId: c,
        subjectId: `cc_${cKey}`,
        subjectName: 'Counseling',
        facultyId: counselor?.facultyId,
        facultyName: counselor?.facultyName,
        activityType: 'counseling',
        slots: satCcSlots, // Exactly 5 hours
        source: 'special_hours',
      });

      continue; // Year IV is 100% scheduled, proceed to next class!
    }

    let subjects = [...rawSubjects];

    // A. OPEN ELECTIVE
    const isYear3Even = input.semesterType === 'even' && (c.year === 'III' || c.year === '3');
    const oeSubj = subjects.find(
      s => s.type === 'open elective' ||
           s.name.toLowerCase().includes('open elective') ||
           s.elective_group_name?.toLowerCase() === 'open elective' ||
           (s.code && /\boe\b/i.test(s.code))
    );

    if (isYear3Even || oeSubj) {
      const oeConfigKey = `${c.departmentId}_${c.year}`;
      const oeConfig = input.openElectiveConfigs.get(oeConfigKey);
      const oeSlotsConfig = oeConfig?.selected_slots && oeConfig.selected_slots.length > 0
        ? oeConfig.selected_slots
        : ['Mon-1', 'Wed-1', 'Fri-1', 'Sat-1', 'Sat-2'];

      const targetSubjId = oeSubj?.id || 'open_elective';
      const targetSubjName = oeSubj?.name || 'Open Elective';
      const targetSubjIds = targetSubjId.split('_').concat(targetSubjId);

      // Find faculty assigned to OE for this class/section
      let oeFaculty: FacultyAllocation | undefined;

      // 1. Precise section-specific assignments in facultyMap
      for (const f of input.facultyMap.values()) {
        const hasSec = f.assignments?.some(a =>
          targetSubjIds.includes(a.subjectId) &&
          (!a.year || a.year === c.year) &&
          (!a.section || a.section.trim().toUpperCase() === c.section.trim().toUpperCase()) &&
          (!c.departmentId || !a.departmentId || a.departmentId === c.departmentId)
        );
        if (hasSec) {
          oeFaculty = f;
          break;
        }
      }

      // 2. Year-specific assignments in facultyMap
      if (!oeFaculty) {
        for (const f of input.facultyMap.values()) {
          const hasYr = f.assignments?.some(a =>
            targetSubjIds.includes(a.subjectId) &&
            (!a.year || a.year === c.year) &&
            (!c.departmentId || !a.departmentId || a.departmentId === c.departmentId)
          );
          if (hasYr) {
            oeFaculty = f;
            break;
          }
        }
      }

      // 3. Subject staff property matching
      if (!oeFaculty && oeSubj?.staff) {
        const staffClean = cleanFacultyName(oeSubj.staff);
        for (const f of input.facultyMap.values()) {
          if (cleanFacultyName(f.facultyName) === staffClean || f.facultyId === oeSubj.staff) {
            oeFaculty = f;
            break;
          }
        }
      }

      // 4. OE staff matching department
      if (!oeFaculty) {
        for (const f of oeStaffFacultyMap.values()) {
          if (!f.departmentId || f.departmentId === c.departmentId) {
            oeFaculty = f;
            break;
          }
        }
      }

      // 5. Fallback to any OE staff
      if (!oeFaculty && oeStaffFacultyMap.size > 0) {
        oeFaculty = oeStaffFacultyMap.values().next().value;
      }

      const parsedOeSlots: TimeSlot[] = [];
      for (const slotStr of oeSlotsConfig) {
        const parts = slotStr.split('-');
        if (parts.length === 2) {
          const dayMap: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5 };
          const d = dayMap[parts[0].toLowerCase().slice(0, 3)];
          const p = parseInt(parts[1], 10) - 1;
          if (d !== undefined && p >= 0 && p < PERIODS_PER_DAY) {
            parsedOeSlots.push({ day: d, period: p });
            lockImmutableSlot(
              c,
              { day: d, period: p },
              targetSubjId,
              targetSubjName,
              oeFaculty?.facultyId,
              oeFaculty?.facultyName,
              undefined,
              'open_elective',
              'Open Elective Institutional Synchronized Slot'
            );
          }
        }
      }

      immutableAssignments.push({
        source: 'open_elective',
        classKey: cKey,
        subjectId: targetSubjId,
        subjectName: targetSubjName,
        facultyId: oeFaculty?.facultyId,
        facultyName: oeFaculty?.facultyName,
        slots: parsedOeSlots,
        reason: 'Staff configured Open Elective',
      });
    }

    // B. MANUAL LAB ALLOCATIONS (from lab_schedules)
    const manualLabs = input.manualLabsMap.get(cKey) || [];
    const groupedManualLabs = new Map<string, {
      matchedLab: Subject;
      entries: Array<{ day: number; period: number; labName: string; labId?: string }>;
    }>();

    for (const m of manualLabs) {
      const cleanM = cleanSubjectName(m.labName);
      const matched =
        subjects.find(s => s.type === 'lab' && s.name.trim().toLowerCase() === m.labName.trim().toLowerCase()) ||
        subjects.find(s => s.type === 'lab' && cleanSubjectName(s.name) === cleanM) ||
        subjects.find(s => cleanSubjectName(s.name) === cleanM) || {
        id: m.labId || `manual_lab_${cleanM}`,
        name: m.labName,
        type: 'lab',
        hoursPerWeek: 0,
      } as Subject;

      if (!groupedManualLabs.has(matched.id)) {
        groupedManualLabs.set(matched.id, { matchedLab: matched, entries: [] });
      }
      groupedManualLabs.get(matched.id)!.entries.push(m);
    }

    for (const { matchedLab, entries } of groupedManualLabs.values()) {
      // Find assigned faculty for this lab, preferring one free at the scheduled lab slots
      const labSlotsForCheck: TimeSlot[] = entries.map(e => ({ day: e.day, period: e.period }));
      let { primaryFaculty: labFaculty, secondaryFaculty: labSecondaryFaculty } = resolveAllFacultyForSection(
        input.facultyMap,
        matchedLab.id,
        c.year,
        c.section,
        labSlotsForCheck,
        occupiedSlotsByFaculty,
        c.departmentId,
        matchedLab.maxFacultyCount ?? matchedLab.max_faculty_count
      );

      // Check matchedLab.staff if unassigned
      if (!labFaculty && matchedLab.staff) {
        const staffClean = cleanFacultyName(matchedLab.staff);
        for (const f of input.facultyMap.values()) {
          if (cleanFacultyName(f.facultyName) === staffClean || f.facultyId === matchedLab.staff) {
            labFaculty = f;
            break;
          }
        }
      }

      // If still unassigned, assign from department faculty with lowest load
      if (!labFaculty) {
        const deptFacList = Array.from(input.facultyMap.values()).filter(
          f => !f.departmentId || f.departmentId === c.departmentId
        );
        if (deptFacList.length > 0) {
          deptFacList.sort((a, b) => {
            const loadA = (occupiedSlotsByFaculty.get(a.facultyId)?.size || 0) + (a.assignedSlots?.size || 0);
            const loadB = (occupiedSlotsByFaculty.get(b.facultyId)?.size || 0) + (b.assignedSlots?.size || 0);
            return loadA - loadB;
          });
          labFaculty = deptFacList[0];
        }
      }

      const allLabFacs = [labFaculty, ...labSecondaryFaculty].filter((f): f is FacultyAllocation => Boolean(f));
      const combinedLabFacName = allLabFacs.length > 0
        ? allLabFacs.map(f => f.facultyName).join(' / ')
        : undefined;
      const labSecondaryFacultyIds = labSecondaryFaculty.map(f => f.facultyId);

      const seenLabSlots = new Set<string>();
      const labSlots: TimeSlot[] = [];
      for (const entry of entries) {
        if (entry.day >= 0 && entry.day < TOTAL_DAYS && entry.period >= 0 && entry.period < PERIODS_PER_DAY) {
          const sKey = `${entry.day}:${entry.period}`;
          if (seenLabSlots.has(sKey)) continue;
          seenLabSlots.add(sKey);

          const slot = { day: entry.day, period: entry.period };
          labSlots.push(slot);
          lockImmutableSlot(
            c,
            slot,
            matchedLab.id,
            matchedLab.name,
            labFaculty?.facultyId,
            combinedLabFacName,
            entry.labId,
            'lab',
            'Manually Assigned Lab Schedule',
            labSecondaryFacultyIds
          );
        }
      }

      if (labSlots.length > 0) {
        immutableAssignments.push({
          source: 'lab_schedule',
          classKey: cKey,
          subjectId: matchedLab.id,
          subjectName: matchedLab.name,
          facultyId: labFaculty?.facultyId,
          secondaryFacultyIds: labSecondaryFacultyIds.length > 0 ? labSecondaryFacultyIds : undefined,
          facultyName: combinedLabFacName,
          roomId: entries[0]?.labId,
          slots: labSlots,
          reason: 'Staff configured manual lab schedule in lab_schedules table',
        });
      }
    }

    // C. SATURDAY SPECIAL HOURS & CLASS COUNSELOR
    const spKey = `${c.departmentId}_${c.year}`;
    const spConfigs = input.specialHoursConfigs.get(spKey) || [];
    let counselor = input.classCounselorsMap.get(cKey);
    if (!counselor || !counselor.facultyId) {
      // Find a department faculty to serve as counselor fallback
      const deptFaculty = Array.from(input.facultyMap.values()).find(
        f => !f.departmentId || f.departmentId === c.departmentId
      );
      if (deptFaculty) {
        counselor = { facultyId: deptFaculty.facultyId, facultyName: deptFaculty.facultyName };
      }
    }

    for (const sp of spConfigs) {
      if (!sp.is_active) continue;
      const type = sp.special_type.toLowerCase();
      const satHours = sp.saturday_hours || 0;

      let label = sp.special_type || 'Counseling';
      let actType: ActivityType = 'counseling';

      if (type.includes('seminar') || type.includes('presentation')) {
        label = 'Seminar';
        actType = 'seminar';
      } else if (type.includes('library')) {
        label = 'Library';
        actType = 'library';
      }

      // Assign to the Class Counselor so that faculty timetables sync 100% with class timetable
      const facId = counselor?.facultyId;
      const facName = counselor?.facultyName;

      // 1. Saturday special hours
      let satPeriods: number[] = (sp.saturday_periods || []).map((p: any) => {
        const pr = typeof p === 'number' ? p : parseInt(p, 10);
        return (pr > 10 ? (pr % 10) : pr) - 1;
      });
      if (satPeriods.length === 0 && satHours > 0) {
        if (type.includes('seminar') || type.includes('presentation')) satPeriods = [2, 3].slice(0, satHours);
        else if (type.includes('library')) satPeriods = [4].slice(0, satHours);
        else if (type.includes('counsel')) satPeriods = [5, 6].slice(0, satHours);
      }

      const satSlots: TimeSlot[] = [];
      for (const p of satPeriods) {
        if (p >= 0 && p < PERIODS_PER_DAY) {
          const slot = { day: 5, period: p };
          satSlots.push(slot);
          lockImmutableSlot(c, slot, `sp_${type}_${cKey}`, label, facId, facName, undefined, actType, `Special hours ${type}`);
        }
      }

      // 2. Weekday special hours (if configured)
      const wkSlots: TimeSlot[] = [];
      (sp.weekdays_periods || []).forEach((p: any) => {
        let d = 0;
        let pr = typeof p === 'number' ? p : parseInt(p, 10);
        if (typeof p === 'string' && p.includes('-')) {
          const parts = p.split('-');
          const dayMap: Record<string, number> = { 'mon': 0, 'tue': 1, 'wed': 2, 'thu': 3, 'fri': 4, 'sat': 5 };
          d = dayMap[parts[0].toLowerCase()] ?? 0;
          pr = parseInt(parts[1], 10);
        } else if (pr > 10) {
          d = Math.floor(pr / 10);
          pr = pr % 10;
        }
        const prZero = pr - 1;
        if (d >= 0 && d < 5 && prZero >= 0 && prZero < PERIODS_PER_DAY) {
          const slot = { day: d, period: prZero };
          wkSlots.push(slot);
          lockImmutableSlot(c, slot, `sp_${type}_wk_${cKey}`, label, facId, facName, undefined, actType, `Special hours ${type} weekday`);
        }
      });

      const allSpecialSlots = [...satSlots, ...wkSlots];
      if (allSpecialSlots.length > 0) {
        immutableAssignments.push({
          source: 'special_hours',
          classKey: cKey,
          subjectId: `sp_${type}`,
          subjectName: label,
          facultyId: facId,
          facultyName: facName,
          slots: allSpecialSlots,
          reason: `Institutional Special Hours ${label}`,
        });
      }
    }
  }

  // 4. DECOMPOSE REMAINING CURRICULUM INTO TEACHING UNITS
  for (const c of input.classes) {
    const cKey = classIdToKey(c);
    const rawSubjects = input.subjectsByClass.get(cKey) || [];
    const isYear4Even = input.semesterType === 'even' && (c.year === 'IV' || c.year === '4');
    if (isYear4Even) {
      continue; // Year IV Even Semester is already 100% scheduled and locked in Step 3!
    }

    let subjects = [...rawSubjects];
    const classGrid = fixedGridByClass.get(cKey)!;

    let counselor = input.classCounselorsMap.get(cKey);
    if (!counselor || !counselor.facultyId) {
      const deptFaculty = Array.from(input.facultyMap.values()).find(
        f => !f.departmentId || f.departmentId === c.departmentId
      );
      if (deptFaculty) {
        counselor = { facultyId: deptFaculty.facultyId, facultyName: deptFaculty.facultyName };
      }
    }

    // Count already placed hours for each subject in this class
    const placedHours = new Map<string, number>();
    const placedHoursByName = new Map<string, number>();
    for (let d = 0; d < TOTAL_DAYS; d++) {
      for (let p = 0; p < PERIODS_PER_DAY; p++) {
        const cell = classGrid[d][p];
        if (cell) {
          if (cell.subjectId) {
            placedHours.set(cell.subjectId, (placedHours.get(cell.subjectId) || 0) + 1);
          }
          // Only count towards alreadyPlaced by name if not an institutional special hour slot (sp_*),
          // so that theory subjects like "Seminar" (1h) or "Library" (1h) added by users are fully scheduled!
          if (!cell.subjectId?.startsWith('sp_') && cell.activityType !== 'special' && cell.activityType !== 'counseling' && cell.activityType !== 'seminar' && cell.activityType !== 'library') {
            const cleanN = cleanSubjectName(cell.subjectName);
            placedHoursByName.set(cleanN, (placedHoursByName.get(cleanN) || 0) + 1);
          }
        }
      }
    }

    let freeSlotsInGrid = 0;
    for (let d = 0; d < TOTAL_DAYS; d++) {
      for (let p = 0; p < PERIODS_PER_DAY; p++) {
        if (classGrid[d][p] === null) freeSlotsInGrid++;
      }
    }

    for (const subj of subjects) {
      const alreadyPlaced = Math.max(
        placedHours.get(subj.id) || 0,
        placedHoursByName.get(cleanSubjectName(subj.name)) || 0
      );
      let remainingHours = Math.max(0, subj.hoursPerWeek - alreadyPlaced);
      if (remainingHours <= 0) continue;

      const isProject = /project/i.test(subj.name);
      if (isProject && remainingHours > freeSlotsInGrid) {
        remainingHours = freeSlotsInGrid;
      }

      let assignedFaculty: FacultyAllocation | null = null;
      let secondaryFaculty: FacultyAllocation[] = [];

      if (!isProject) {
        // Find faculty assigned to this subject for this section
        const resolved = resolveAllFacultyForSection(
          input.facultyMap,
          subj.id,
          c.year,
          c.section,
          undefined,
          occupiedSlotsByFaculty,
          c.departmentId,
          subj.maxFacultyCount ?? subj.max_faculty_count
        );
        assignedFaculty = resolved.primaryFaculty;
        secondaryFaculty = resolved.secondaryFaculty;

        // Check subj.staff if not resolved by section assignment
        if (!assignedFaculty && subj.staff) {
          const staffClean = cleanFacultyName(subj.staff);
          for (const f of input.facultyMap.values()) {
            if (cleanFacultyName(f.facultyName) === staffClean || f.facultyId === subj.staff) {
              assignedFaculty = f;
              break;
            }
          }
        }

        // If subject is Seminar, Library, or Counselling, assign to the section's Class Counselor!
        if (/seminar|library|counsel/i.test(subj.name)) {
          const cc = input.classCounselorsMap.get(cKey) || counselor;
          if (cc && cc.facultyName && cc.facultyId) {
            const existingFac = input.facultyMap.get(cc.facultyId);
            if (existingFac) {
              assignedFaculty = existingFac;
            } else {
              assignedFaculty = {
                facultyId: cc.facultyId,
                facultyName: cc.facultyName,
                departmentId: c.departmentId,
                designation: 'Class Counselor',
                assignedSlots: new Set(),
                availableSlots: new Set(),
                dailyHours: [0, 0, 0, 0, 0, 0],
                labPreference: false,
                isClassCounselor: true,
                subjectIds: new Set([subj.id]),
                assignments: [{
                  departmentId: c.departmentId,
                  year: c.year,
                  section: c.section,
                  subjectId: subj.id,
                }],
              };
            }
          }
        }

        // If still unassigned: ensure complete faculty assignment (no hour left unassigned)
        if (!assignedFaculty) {
          const deptFaculty = Array.from(input.facultyMap.values()).filter(
            f => !f.departmentId || f.departmentId === c.departmentId
          );
          if (deptFaculty.length > 0) {
            deptFaculty.sort((a, b) => {
              const loadA = (occupiedSlotsByFaculty.get(a.facultyId)?.size || 0) + (a.assignedSlots?.size || 0);
              const loadB = (occupiedSlotsByFaculty.get(b.facultyId)?.size || 0) + (b.assignedSlots?.size || 0);
              return loadA - loadB;
            });
            assignedFaculty = deptFaculty[0];
          } else if (counselor && counselor.facultyId) {
            const existingFac = input.facultyMap.get(counselor.facultyId);
            if (existingFac) {
              assignedFaculty = existingFac;
            } else {
              assignedFaculty = {
                facultyId: counselor.facultyId,
                facultyName: counselor.facultyName,
                departmentId: c.departmentId,
                designation: 'Faculty',
                assignedSlots: new Set(),
                availableSlots: new Set(),
                dailyHours: [0, 0, 0, 0, 0, 0],
                labPreference: false,
                isClassCounselor: false,
                subjectIds: new Set([subj.id]),
                assignments: [{
                  departmentId: c.departmentId,
                  year: c.year,
                  section: c.section,
                  subjectId: subj.id,
                }],
              };
            }
          }
        }
      }

      const secondaryFacultyIds = secondaryFaculty.map(f => f.facultyId);
      const combinedFacultyName = assignedFaculty
        ? (secondaryFaculty.length > 0
            ? [assignedFaculty.facultyName, ...secondaryFaculty.map(f => f.facultyName)].join(' / ')
            : assignedFaculty.facultyName)
        : undefined;

      const isSeniorProf = isSeniorProfessorFaculty(assignedFaculty);

      // CATEGORY 1: UNPLACED LABORATORIES
      if (subj.type === 'lab') {
        // Continuous block unit: duration 4, 3, or 2
        let remLabHours = remainingHours;
        const labRoomId = subj.id ? `room_${cKey}_${subj.id}` : `lab_${cleanSubjectName(subj.name)}`;

        while (remLabHours > 0) {
          const curDuration = remLabHours >= 4 ? 4 : remLabHours >= 3 ? 3 : remLabHours >= 2 ? 2 : 1;
          teachingUnits.push({
            id: `unit_${cKey}_${subj.id}_lab_${curDuration}_${remLabHours}`,
            classKey: cKey,
            classId: c,
            subjectId: subj.id,
            subjectName: subj.name,
            subjectCode: subj.code,
            activityType: 'lab',
            duration: curDuration,
            primaryFacultyId: assignedFaculty?.facultyId,
            secondaryFacultyIds: secondaryFacultyIds.length > 0 ? secondaryFacultyIds : undefined,
            facultyName: combinedFacultyName,
            roomId: labRoomId,
            isFixed: false,
            allowedDays: [0, 1, 2, 3, 4], // Weekdays only
            allowedPeriods: curDuration === 4
              ? [3, 0] // periods [3,4,5,6] (starts at P4, afternoon standard) or [0,1,2,3] (starts at P1, morning fallback)
              : curDuration === 3
              ? [4, 0, 1] // periods [4,5,6] (starts at P5, afternoon standard), [0,1,2] (starts at P1, morning), or [1,2,3] (starts at P2, morning fallback)
              : curDuration === 2
              ? [0, 1, 2, 4, 5] // periods [0,1], [1,2], [2,3], [4,5], or [5,6]
              : [0, 1, 2, 3, 4, 5, 6], // 1-hour lab/tutorial can fit any period
            tags: subj.tags,
          });
          remLabHours -= curDuration;
        }
        continue;
      }

      // CATEGORY 2: SOFT SKILLS & APTITUDE (SSA)
      if (isSoftSkillSubject(subj)) {
        // Exactly 1 hour in 5th period (p=4) on a weekday
        teachingUnits.push({
          id: `unit_${cKey}_${subj.id}_ssa_5th`,
          classKey: cKey,
          classId: c,
          subjectId: subj.id,
          subjectName: subj.name,
          subjectCode: subj.code,
          activityType: 'soft_skill',
          duration: 1,
          primaryFacultyId: assignedFaculty?.facultyId,
          secondaryFacultyIds: secondaryFacultyIds.length > 0 ? secondaryFacultyIds : undefined,
          facultyName: combinedFacultyName,
          isFixed: false,
          allowedDays: [0, 1, 2, 3, 4],
          allowedPeriods: [4], // Period 5 only (0-indexed 4)
          tags: ['ssa_5th_hour'],
        });

        // Exactly 3 morning hours (p=0..3) across 3 distinct weekdays
        const morningHours = Math.min(3, remainingHours - 1);
        for (let i = 0; i < morningHours; i++) {
          teachingUnits.push({
            id: `unit_${cKey}_${subj.id}_ssa_morning_${i}`,
            classKey: cKey,
            classId: c,
            subjectId: subj.id,
            subjectName: subj.name,
            subjectCode: subj.code,
            activityType: 'soft_skill',
            duration: 1,
            primaryFacultyId: assignedFaculty?.facultyId,
            secondaryFacultyIds: secondaryFacultyIds.length > 0 ? secondaryFacultyIds : undefined,
            facultyName: combinedFacultyName,
            isFixed: false,
            allowedDays: [0, 1, 2, 3, 4],
            allowedPeriods: [0, 1, 2, 3], // Morning only
            tags: ['ssa_morning_hour'],
          });
        }
        continue;
      }

      // CATEGORY 3: NPTEL & SELF STUDY
      if (isNptelSubject(subj)) {
        for (let i = 0; i < remainingHours; i++) {
          teachingUnits.push({
            id: `unit_${cKey}_${subj.id}_nptel_${i}`,
            classKey: cKey,
            classId: c,
            subjectId: subj.id,
            subjectName: subj.name,
            subjectCode: subj.code,
            activityType: 'nptel',
            duration: 1,
            primaryFacultyId: assignedFaculty?.facultyId,
            secondaryFacultyIds: secondaryFacultyIds.length > 0 ? secondaryFacultyIds : undefined,
            facultyName: combinedFacultyName,
            isFixed: false,
            allowedDays: [0, 1, 2, 3, 4, 5],
            allowedPeriods: [0, 1, 2, 3, 4, 5, 6],
            tags: subj.tags,
          });
        }
        continue;
      }

      // CATEGORY 4: STANDARD THEORY, ELECTIVES & PROJECT
      for (let i = 0; i < remainingHours; i++) {
        teachingUnits.push({
          id: `unit_${cKey}_${subj.id}_${isProject ? 'project' : 'theory'}_${i}`,
          classKey: cKey,
          classId: c,
          subjectId: subj.id,
          subjectName: subj.name,
          subjectCode: subj.code,
          activityType: isProject ? 'project' : subj.name.toLowerCase().includes('library') ? 'library' : subj.name.toLowerCase().includes('seminar') ? 'seminar' : subj.name.toLowerCase().includes('counsel') ? 'counseling' : subj.type === 'elective' ? 'elective' : 'theory',
          duration: 1,
          primaryFacultyId: isProject ? undefined : assignedFaculty?.facultyId,
          secondaryFacultyIds: isProject ? undefined : (secondaryFacultyIds.length > 0 ? secondaryFacultyIds : undefined),
          facultyName: isProject ? undefined : combinedFacultyName,
          isFixed: false,
          isSeniorProfessor: isProject ? false : isSeniorProf,
          allowedDays: [0, 1, 2, 3, 4, 5],
          allowedPeriods: [0, 1, 2, 3, 4, 5, 6],
          tags: subj.tags,
        });
      }
    }
  }

  // Check if critical pre-validation errors occurred
  const hasCriticalErrors = diagnostics.some(d => d.severity === 'CRITICAL');

  const facultyNameById = new Map<string, string>();
  for (const [facId, fac] of input.facultyMap.entries()) {
    if (fac.facultyName) {
      facultyNameById.set(facId, fac.facultyName);
    }
  }

  return {
    classes: input.classes,
    immutableAssignments,
    teachingUnits,
    preValidationDiagnostics: diagnostics,
    isModelValid: !hasCriticalErrors,
    fixedGridByClass,
    occupiedSlotsByClass,
    occupiedSlotsByFaculty,
    facultyMap: input.facultyMap,
    facultyNameById,
  };
}
