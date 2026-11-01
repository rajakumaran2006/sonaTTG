/**
 * SonaTTG Global Optimization Engine — Core Types & Interface Definitions
 * 
 * Defines the mathematical and structural abstractions for:
 * - Decision variables, domains, and teaching units
 * - Global hard and soft constraints
 * - Fixed/immutable assignment structures
 * - Solver options, execution telemetry, and diagnostic reports
 * - Independent verification results
 */

export const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type DayName = typeof DAYS_OF_WEEK[number];

export const TOTAL_DAYS = 6;
export const PERIODS_PER_DAY = 7;
export const TOTAL_SLOTS_PER_CLASS = 42;

export interface TimeSlot {
  day: number;    // 0 = Mon, 1 = Tue, ..., 5 = Sat
  period: number; // 0 = P1, ..., 6 = P7
}

export function slotToKey(slot: TimeSlot): string {
  return `${slot.day}:${slot.period}`;
}

export function keyToSlot(key: string): TimeSlot {
  const [d, p] = key.split(':').map(Number);
  return { day: d, period: p };
}

export interface ClassIdentifier {
  departmentId: string;
  departmentName: string;
  year: string;    // 'II' | 'III' | 'IV'
  section: string; // 'A' | 'B' | 'C'
}

export function classIdToKey(c: ClassIdentifier): string {
  return `${c.departmentName}_${c.year}_${c.section}`.toUpperCase();
}

/**
 * Canonical subject name normalizer for conflict-free matching across
 * curriculum subjects, manual lab schedules, and timetable grids.
 * Strips parentheticals like (integrated)/(even), non-alphanumeric chars,
 * and trailing laboratory/lab/practical variants.
 */
export function cleanSubjectName(name: string): string {
  if (!name) return '';
  let s = name.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
  s = s.replace(/\blabs?\b/g, 'laboratory');
  s = s.replace(/\bpracticals?\b/g, 'laboratory');
  return s.replace(/[^a-z0-9]/g, '');
}

/**
 * Authoritative classification for theory teaching vs practical/non-teaching.
 * Used for enforcing the hard constraint: max 2 consecutive theory periods for any faculty member.
 */
export function isTheoryActivity(activityType?: string, subjectName?: string): boolean {
  if (!activityType && !subjectName) return false;
  if (activityType === 'lab') return false;
  if (activityType === 'project' || (subjectName && /project/i.test(subjectName))) return false;
  if (activityType && /library|counseling|counselling|seminar/i.test(activityType)) return false;
  if (subjectName && /library|counseling|counselling|seminar/i.test(subjectName)) return false;
  if (subjectName && /\blab\b|\blaboratory\b|\bpracticals?\b/i.test(subjectName)) return false;
  return activityType === 'theory' || activityType === 'elective' || activityType === 'open_elective' || activityType === 'nptel';
}

/**
 * Teaching activity types
 */
export type ActivityType =
  | 'theory'
  | 'lab'
  | 'elective'
  | 'open_elective'
  | 'soft_skill'
  | 'nptel'
  | 'seminar'
  | 'counseling'
  | 'library'
  | 'project'
  | 'fixed_custom';

/**
 * Represents a single atomic or multi-slot block to be scheduled
 */
export interface TeachingUnit {
  id: string; // unique unit id
  classKey: string;
  classId: ClassIdentifier;
  subjectId: string;
  subjectName: string;
  subjectCode?: string;
  activityType: ActivityType;
  duration: number; // 1 for theory, 2/3/4 for labs
  primaryFacultyId?: string;
  secondaryFacultyIds?: string[];
  facultyName?: string;
  roomId?: string;
  roomName?: string;
  isFixed: boolean;
  fixedSlot?: TimeSlot;
  fixedBlock?: TimeSlot[]; // For fixed multi-period labs
  isSeniorProfessor?: boolean;
  allowedDays?: number[]; // subset of [0..5]
  allowedPeriods?: number[]; // subset of [0..6]
  forbiddenPeriods?: number[];
  tags?: string[];
}

/**
 * Fixed staff-configured assignment that must NEVER be modified or regenerated
 */
export interface ImmutableAssignment {
  source: 'open_elective' | 'lab_schedule' | 'class_counselor' | 'special_hours' | 'manual_lock';
  classKey: string;
  subjectId: string;
  subjectName: string;
  facultyId?: string;
  secondaryFacultyIds?: string[];
  facultyName?: string;
  roomId?: string;
  roomName?: string;
  slots: TimeSlot[];
  reason: string;
}

/**
 * Solver status
 */
export type SolverStatus =
  | 'OPTIMAL'
  | 'FEASIBLE'
  | 'INFEASIBLE'
  | 'TIMEOUT'
  | 'MODEL_INVALID';

/**
 * Detailed diagnostic breakdown for infeasible schedules
 */
export interface InfeasibilityDiagnostic {
  category:
    | 'FIXED_ASSIGNMENT_COLLISION'
    | 'FACULTY_OVER_ALLOCATION'
    | 'FACULTY_UNAVAILABLE'
    | 'INSUFFICIENT_SLOTS'
    | 'ROOM_COLLISION'
    | 'LAB_CONTINUITY_IMPOSSIBLE'
    | 'CURRICULUM_HOURS_EXCEEDS_GRID'
    | 'UNKNOWN_BOTTLENECK';
  severity: 'CRITICAL' | 'ERROR' | 'WARNING';
  affectedDepartment?: string;
  affectedYear?: string;
  affectedSection?: string;
  affectedSubject?: string;
  affectedFacultyId?: string;
  affectedFacultyName?: string;
  affectedRoomId?: string;
  conflictingSlots?: TimeSlot[];
  description: string;
  remediationAdvice: string;
}

/**
 * Solver configuration options
 */
export interface SolverOptions {
  timeLimitMs?: number;            // Max time spent searching (default 15,000 ms)
  maxBacktracks?: number;          // Max backtracks before stopping
  enableSoftOptimization?: boolean;// Minimize penalty metrics after finding feasible
  preferSeniorProfMorning?: boolean;// Strict or soft senior prof morning allocation
  logLevel?: 'verbose' | 'info' | 'warn' | 'silent';
}

/**
 * Soft constraints weights
 */
export interface ObjectiveWeights {
  dayDistributionWeight: number;      // Spreading subject across distinct days
  consecutiveFacultyWeight: number;   // Avoiding excessive consecutive faculty hours (> 2)
  seniorProfAfternoonPenalty: number; // Penalty for senior faculty in afternoon
  facultyDailyLoadImbalance: number;  // Variance in daily faculty workload
  studentScheduleGaps: number;        // Unnecessary holes or poor distribution
}

export const DEFAULT_OBJECTIVE_WEIGHTS: ObjectiveWeights = {
  dayDistributionWeight: 10,
  consecutiveFacultyWeight: 15,
  seniorProfAfternoonPenalty: 25,
  facultyDailyLoadImbalance: 5,
  studentScheduleGaps: 8,
};

/**
 * Global verification issue report item
 */
export interface ValidationViolation {
  ruleId: string;
  ruleCategory: 'FACULTY' | 'SECTION' | 'ROOM' | 'CURRICULUM' | 'LAB' | 'INSTITUTIONAL' | 'FIXED_PRESERVATION';
  severity: 'HARD_ERROR' | 'SOFT_WARNING';
  departmentName: string;
  year: string;
  section: string;
  subjectName?: string;
  facultyName?: string;
  roomName?: string;
  day?: number;
  period?: number;
  message: string;
}

export interface ValidationReport {
  isValid: boolean;
  hardErrorCount: number;
  softWarningCount: number;
  violations: ValidationViolation[];
  summaryText: string;
}

/**
 * Global Solved Result for a Section
 */
export interface SolvedSectionTimetable {
  departmentId: string;
  departmentName: string;
  year: string;
  section: string;
  grid: string[][]; // 6 rows (Mon-Sat) x 7 columns (P1-P7)
  cellMetadata?: Array<Array<{
    subjectId?: string;
    subjectName?: string;
    subjectCode?: string;
    facultyId?: string;
    secondaryFacultyIds?: string[];
    facultyName?: string;
    roomId?: string;
    isFixed?: boolean;
    activityType?: ActivityType;
  }>>;
  weeklyHourVerification: {
    isValid: boolean;
    allocatedHours: Record<string, number>;
    expectedHours: Record<string, number>;
    mismatches: Array<{ subject: string; expected: number; actual: number }>;
  };
}

/**
 * Full Batch Result returned by the optimization engine
 */
export interface GlobalOptimizationResult {
  status: SolverStatus;
  isFeasible: boolean;
  isOptimal: boolean;
  executionTimeMs: number;
  optimizationScore?: number;
  sectionResults: SolvedSectionTimetable[];
  immutableAssignmentsPreserved: number;
  validationReport: ValidationReport;
  diagnostics?: InfeasibilityDiagnostic[];
  facultyScheduleSnapshot?: Map<string, Array<{
    day: number;
    period: number;
    departmentName: string;
    year: string;
    section: string;
    subjectName: string;
  }>>;
}
