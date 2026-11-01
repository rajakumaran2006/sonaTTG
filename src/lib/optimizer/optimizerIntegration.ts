/**
 * SonaTTG Optimizer Integration Service
 * 
 * High-level orchestration bridge connecting:
 * - Supabase data layer (departments, subjects, faculty, lab schedules, OE configs)
 * - GlobalConstraintModel
 * - GlobalCpSolver
 * - TimetableValidator
 * 
 * Replaces the fragile per-section greedy loops and blind 5-attempt random retries
 * with a unified, holistic multi-department solver.
 */

import {
  ClassIdentifier,
  classIdToKey,
  GlobalOptimizationResult,
  SolvedSectionTimetable,
} from './types';
import { buildGlobalSchedulingModel, ModelInputData } from './globalConstraintModel';
import { solveGlobalTimetable } from './globalCpSolver';
import {
  getDepartmentByName,
  getSubjectsForYear,
  getSectionSubjects,
  getSpecialHoursConfigsForYear,
  getLabSchedulesForSection,
  getOpenElectiveConfig,
  OpenElectiveConfig,
} from '../supabaseService';
import { buildFacultyAllocationMap, FacultyAllocation } from '../facultyAllocation';
import type { Subject, SpecialHoursConfig } from '@/store/timetableStore';
import { supabase } from '@/integrations/supabase/client';

export interface BatchSelectionItem {
  departmentName: string;
  selectedYears: Array<{
    year: string;
    sections: string[];
  }>;
}

export interface OptimizeBatchOptions {
  selections: BatchSelectionItem[];
  semesterType: 'odd' | 'even';
  facultyBeforeAfternoon?: boolean;
  onProgress?: (departmentName: string, year: string, section: string, status: 'running' | 'ok' | 'error', error?: string) => void;
}

export async function buildModelFromSelections(
  options: OptimizeBatchOptions
): Promise<{ model: import('./globalConstraintModel').GlobalSchedulingModel; classes: ClassIdentifier[] }> {
  const { selections, semesterType, facultyBeforeAfternoon = false } = options;

  // 1. Gather all ClassIdentifiers
  const classes: ClassIdentifier[] = [];
  const deptCache = new Map<string, any>();

  for (const s of selections) {
    let dept = deptCache.get(s.departmentName);
    if (!dept) {
      dept = await getDepartmentByName(s.departmentName);
      if (dept) deptCache.set(s.departmentName, dept);
    }
    const deptId = dept?.id || s.departmentName;

    for (const yr of s.selectedYears) {
      for (const sec of yr.sections) {
        classes.push({
          departmentId: deptId,
          departmentName: s.departmentName,
          year: yr.year,
          section: sec,
        });
      }
    }
  }

  // 2. Load Unified College-Wide Faculty Allocation Map
  const allSelectedClassesForExclude = classes.map(c => ({
    departmentId: c.departmentId,
    year: c.year,
    section: c.section,
  }));

  const facultyMap = await buildFacultyAllocationMap(
    '',
    undefined,
    undefined,
    { allClasses: true, excludeClasses: allSelectedClassesForExclude }
  );

  // 3. Load Subjects, Special Hours, Manual Labs, OE Configs, Counselors
  const subjectsByClass = new Map<string, Subject[]>();
  const specialHoursConfigs = new Map<string, SpecialHoursConfig[]>();
  const classCounselorsMap = new Map<string, { facultyId: string; facultyName: string }>();
  const manualLabsMap = new Map<string, Array<{ day: number; period: number; labName: string; labId?: string }>>();
  const openElectiveConfigs = new Map<string, OpenElectiveConfig>();

  // Fetch Class Counselors from Supabase
  try {
    const { data: ccData } = await supabase
      .from('class_counselors')
      .select('department_id, year, section, faculty_id, is_active, faculty_members(name)')
      .eq('is_active', true);

    (ccData || []).forEach((cc: any) => {
      // Find matching class
      for (const c of classes) {
        if (c.departmentId === cc.department_id && c.year === cc.year && c.section === cc.section) {
          const cKey = classIdToKey(c);
          classCounselorsMap.set(cKey, {
            facultyId: cc.faculty_id,
            facultyName: cc.faculty_members?.name || 'Class Counselor',
          });
        }
      }
    });
  } catch (err) {
    console.warn('Could not load class counselors:', err);
  }

  // Load per-class and per-year data in parallel
  await Promise.all(
    classes.map(async (c) => {
      const cKey = classIdToKey(c);

      // A. Special Hours Config for Year
      const spKey = `${c.departmentId}_${c.year}`;
      if (!specialHoursConfigs.has(spKey)) {
        const configs = await getSpecialHoursConfigsForYear(c.departmentId, c.year).catch(() => []);
        specialHoursConfigs.set(spKey, configs);
      }

      // B. Open Elective Config for Year
      if (!openElectiveConfigs.has(spKey)) {
        const oeConfig = await getOpenElectiveConfig(c.departmentId, c.year).catch(() => ({
          hours: 5,
          group_name: 'Open Elective',
          is_shared_slot: true,
          selected_slots: ['Mon-1', 'Wed-1', 'Fri-1', 'Sat-1', 'Sat-2'],
        }));
        openElectiveConfigs.set(spKey, oeConfig);
      }

      // C. Subjects for Year + Section
      let yearSubjects = await getSubjectsForYear(c.departmentId, c.year, semesterType).catch(() => []);
      const sectionSubjIds = await getSectionSubjects(c.departmentId, c.year, c.section).catch(() => []);
      if (sectionSubjIds.length > 0 && !(semesterType === 'even' && (c.year === 'IV' || c.year === '4'))) {
        yearSubjects = yearSubjects.filter(s => sectionSubjIds.includes(s.id));
      }

      // Group parallel open electives if present
      const oeSubjs = yearSubjects.filter(s => s.type === 'open elective' || s.elective_group_name?.toLowerCase() === 'open elective');
      let baseSubjs = yearSubjects.filter(s => s.type !== 'open elective' && s.elective_group_name?.toLowerCase() !== 'open elective');

      if (oeSubjs.length > 0) {
        const sorted = [...oeSubjs].sort((a, b) => a.name.localeCompare(b.name));
        const combinedId = sorted.map(s => s.id).join('_');
        const combinedName = sorted.length > 3 ? 'Open Elective' : sorted.map(s => s.name).join(' / ');
        baseSubjs.push({
          id: combinedId,
          name: combinedName,
          hoursPerWeek: sorted[0].hoursPerWeek || 5,
          type: 'open elective',
          tags: Array.from(new Set(sorted.flatMap(s => s.tags || []))),
          credits: sorted[0].credits,
          abbreviation: 'OE',
        } as Subject);
      }

      // Group parallel electives if multiple exist without specific section election
      const peSubjs = baseSubjs.filter(s => s.type === 'elective');
      const nonPeSubjs = baseSubjs.filter(s => s.type !== 'elective');
      if (peSubjs.length > 1) {
        const sorted = [...peSubjs].sort((a, b) => a.name.localeCompare(b.name));
        const combinedId = sorted.map(s => s.id).join('_');
        const combinedName = sorted.map(s => s.name.replace(/^Elective\s*-\s*/i, '')).join(' / ');
        const maxPeHours = Math.max(...peSubjs.map(s => s.hoursPerWeek || 4));
        nonPeSubjs.push({
          id: combinedId,
          name: `Elective: ${combinedName}`,
          hoursPerWeek: maxPeHours,
          type: 'elective',
          tags: Array.from(new Set(sorted.flatMap(s => s.tags || []))),
          credits: sorted[0].credits,
          abbreviation: 'PE',
        } as Subject);
        yearSubjects = nonPeSubjs;
      } else {
        yearSubjects = baseSubjs;
      }

      subjectsByClass.set(cKey, yearSubjects);

      // D. Manual Lab Schedules
      const mlabs = await getLabSchedulesForSection(
        c.departmentId,
        c.year,
        c.section,
        semesterType,
        yearSubjects,
        c.departmentName
      ).catch(() => []);
      manualLabsMap.set(cKey, mlabs);
    })
  );

  // 4. Construct the Global Scheduling Model
  const modelInput: ModelInputData = {
    semesterType,
    classes,
    subjectsByClass,
    facultyMap,
    specialHoursConfigs,
    classCounselorsMap,
    manualLabsMap,
    openElectiveConfigs,
    preferSeniorProfMorning: facultyBeforeAfternoon,
  };

  const model = buildGlobalSchedulingModel(modelInput);
  return { model, classes };
}

export async function generateOptimizedTimetableBatch(
  options: OptimizeBatchOptions
): Promise<GlobalOptimizationResult> {
  const { facultyBeforeAfternoon = false, onProgress } = options;

  const { model, classes } = await buildModelFromSelections(options);

  // Notify UI: starting all classes
  classes.forEach(c => onProgress?.(c.departmentName, c.year, c.section, 'running'));

  // 5. Run Global Constraint Programming Solver
  const solution = await solveGlobalTimetable(model, {
    timeLimitMs: 25000,
    preferSeniorProfMorning: facultyBeforeAfternoon,
    enableSoftOptimization: true,
  });

  // 6. Update UI Progress
  if (solution.isFeasible && solution.validationReport.isValid) {
    solution.sectionResults.forEach(r => {
      onProgress?.(r.departmentName, r.year, r.section, 'ok');
    });
  } else {
    const errorMsg = solution.diagnostics?.[0]?.description || solution.validationReport.summaryText;
    classes.forEach(c => {
      onProgress?.(c.departmentName, c.year, c.section, 'error', errorMsg);
    });
  }

  return solution;
}

export function toGeneratedTimetableResults(
  solution: GlobalOptimizationResult,
  fallbackClasses: ClassIdentifier[] = []
): Array<{
  departmentId?: string;
  departmentName: string;
  year: string;
  section: string;
  grid: string[][];
  cellMetadata?: any;
  status: 'ok' | 'error';
  error?: string;
  hourVerification?: any;
}> {
  if (solution.isFeasible && solution.sectionResults.length > 0) {
    return solution.sectionResults.map(r => ({
      departmentId: r.departmentId,
      departmentName: r.departmentName,
      year: r.year,
      section: r.section,
      grid: r.grid,
      cellMetadata: r.cellMetadata,
      status: 'ok' as const,
      hourVerification: {
        isValid: r.weeklyHourVerification.isValid,
        totalAllocatedHours: Object.values(r.weeklyHourVerification.allocatedHours).reduce((a, b) => a + b, 0),
        expectedWeeklyHours: Object.values(r.weeklyHourVerification.expectedHours).reduce((a, b) => a + b, 0),
        allocatedHours: r.weeklyHourVerification.allocatedHours,
        expectedHours: r.weeklyHourVerification.expectedHours,
        mismatches: r.weeklyHourVerification.mismatches.map(m => ({
          subject: m.subject,
          expected: m.expected,
          actual: m.actual,
          difference: m.actual - m.expected,
        })),
        summaryText: r.weeklyHourVerification.mismatches.length === 0
          ? 'All subject hours match 100% exactly.'
          : `${r.weeklyHourVerification.mismatches.length} mismatch(es) detected.`,
      },
    }));
  }

  const errorMsg = solution.diagnostics?.[0]?.description || solution.validationReport?.summaryText || 'Infeasible schedule';
  return fallbackClasses.map(c => ({
    departmentName: c.departmentName,
    year: c.year,
    section: c.section,
    grid: [],
    status: 'error' as const,
    error: errorMsg,
  }));
}
