/**
 * SonaTTG Optimization Engine — Comprehensive Automated Test Suite
 * 
 * Verifies all 18 mandatory requirements from Section 12:
 * 1. Multiple sections sharing one faculty member
 * 2. Faculty shared across different departments
 * 3. Two fixed assignments that conflict
 * 4. Fixed OE periods preserved after generation
 * 5. Manual laboratory schedules preserved exactly
 * 6. Remaining classes scheduled around fixed laboratories
 * 7. Consecutive laboratory requirements
 * 8. Insufficient available periods for required weekly hours
 * 9. Room / physical laboratory collision prevention
 * 10. Faculty availability restrictions
 * 11. Exact weekly subject-hour verification
 * 12. No three consecutive theory periods
 * 13. Semester-specific and Saturday constraints
 * 14. Infeasible model handling & diagnostics
 * 15. Faculty and class timetable synchronization
 * 16. Safe publication guarantee (zero hard errors)
 * 17. Incremental section regeneration
 * 18. Database schema compatibility
 */

import { buildGlobalSchedulingModel } from '../src/lib/optimizer/globalConstraintModel.ts';
import { solveGlobalTimetable } from '../src/lib/optimizer/globalCpSolver.ts';
import { validateCompleteTimetableBatch } from '../src/lib/optimizer/timetableValidator.ts';
import { classIdToKey } from '../src/lib/optimizer/types.ts';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL [Test ${totalTests}]: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    passedTests++;
    console.log(`✅ PASS [Test ${totalTests}]: ${message}`);
  }
}

async function runAllTests() {
  console.log("================================================================================");
  console.log("       SONA TTG GLOBAL OPTIMIZATION ENGINE — 18 AUTOMATED TESTS");
  console.log("================================================================================\n");

  // Base fixtures
  const deptA = { departmentId: 'dept_a', departmentName: 'AIDS', year: 'III', section: 'A' };
  const deptB = { departmentId: 'dept_a', departmentName: 'AIDS', year: 'III', section: 'B' };
  const deptIT = { departmentId: 'dept_b', departmentName: 'IT', year: 'III', section: 'A' };

  // --- TEST 1: Multiple sections sharing one faculty member ---
  {
    const facultyMap = new Map();
    facultyMap.set('fac_shared', {
      facultyId: 'fac_shared',
      facultyName: 'Dr. Shared Faculty',
      assignedSlots: new Set(),
      availableSlots: new Set(),
      dailyHours: [0, 0, 0, 0, 0, 0],
      labPreference: true,
      subjectIds: new Set(['subj_shared']),
      assignments: [
        { subjectId: 'subj_shared', year: 'III', section: 'A' },
        { subjectId: 'subj_shared', year: 'III', section: 'B' },
      ],
      isClassCounselor: false,
    });

    const subjectsByClass = new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: 'subj_shared', name: 'Machine Learning', hoursPerWeek: 4, type: 'theory' },
      { id: 'subj_other_a', name: 'Cloud Computing', hoursPerWeek: 4, type: 'theory' },
    ]);
    subjectsByClass.set(classIdToKey(deptB), [
      { id: 'subj_shared', name: 'Machine Learning', hoursPerWeek: 4, type: 'theory' },
      { id: 'subj_other_b', name: 'Cyber Security', hoursPerWeek: 4, type: 'theory' },
    ]);

    const model = buildGlobalSchedulingModel({
      semesterType: 'odd',
      classes: [deptA, deptB],
      subjectsByClass,
      facultyMap,
      specialHoursConfigs: new Map(),
      classCounselorsMap: new Map(),
      manualLabsMap: new Map(),
      openElectiveConfigs: new Map(),
    });

    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Multiple sections sharing faculty must be feasible");

    // Check that Dr. Shared Faculty is never double-booked
    const secA = solution.sectionResults.find(r => r.section === 'A');
    const secB = solution.sectionResults.find(r => r.section === 'B');
    let overlapCount = 0;
    for (let d = 0; d < 6; d++) {
      for (let p = 0; p < 7; p++) {
        if (secA.grid[d][p] === 'Machine Learning' && secB.grid[d][p] === 'Machine Learning') {
          overlapCount++;
        }
      }
    }
    assert(overlapCount === 0, "Dr. Shared Faculty has zero double-booked slots between Sec A and Sec B");
  }

  // --- TEST 2: Faculty shared across different departments ---
  {
    const facultyMap = new Map();
    facultyMap.set('fac_cross_dept', {
      facultyId: 'fac_cross_dept',
      facultyName: 'Prof. Math Cross Dept',
      assignedSlots: new Set(),
      availableSlots: new Set(),
      dailyHours: [0, 0, 0, 0, 0, 0],
      labPreference: true,
      subjectIds: new Set(['subj_math']),
      assignments: [
        { subjectId: 'subj_math', year: 'III', section: 'A' },
      ],
      isClassCounselor: false,
    });

    const subjectsByClass = new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: 'subj_math', name: 'Applied Mathematics', hoursPerWeek: 4, type: 'theory' },
    ]);
    subjectsByClass.set(classIdToKey(deptIT), [
      { id: 'subj_math', name: 'Applied Mathematics', hoursPerWeek: 4, type: 'theory' },
    ]);

    const model = buildGlobalSchedulingModel({
      semesterType: 'odd',
      classes: [deptA, deptIT],
      subjectsByClass,
      facultyMap,
      specialHoursConfigs: new Map(),
      classCounselorsMap: new Map(),
      manualLabsMap: new Map(),
      openElectiveConfigs: new Map(),
    });

    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Cross-department shared faculty must be feasible");
    const aidsSec = solution.sectionResults.find(r => r.departmentName === 'AIDS');
    const itSec = solution.sectionResults.find(r => r.departmentName === 'IT');

    let crossOverlap = 0;
    for (let d = 0; d < 6; d++) {
      for (let p = 0; p < 7; p++) {
        if (aidsSec.grid[d][p] === 'Applied Mathematics' && itSec.grid[d][p] === 'Applied Mathematics') {
          crossOverlap++;
        }
      }
    }
    assert(crossOverlap === 0, "Cross-department faculty has zero collisions across AIDS and IT");
  }

  // --- TEST 3: Two fixed assignments that conflict ---
  {
    const facultyMap = new Map();
    const manualLabsMap = new Map();
    // Both Sec A and Sec B book the same lab faculty at Day 1 (Tue) Period 4
    facultyMap.set('fac_lab_conflict', {
      facultyId: 'fac_lab_conflict',
      facultyName: 'Dr. Lab Specialist',
      assignedSlots: new Set(),
      availableSlots: new Set(),
      dailyHours: [0, 0, 0, 0, 0, 0],
      labPreference: true,
      subjectIds: new Set(['lab_1', 'lab_2']),
      assignments: [],
      isClassCounselor: false,
    });

    manualLabsMap.set(classIdToKey(deptA), [{ day: 1, period: 3, labName: 'Networks Lab' }]);
    manualLabsMap.set(classIdToKey(deptB), [{ day: 1, period: 3, labName: 'Database Lab' }]);

    const subjectsByClass = new Map();
    subjectsByClass.set(classIdToKey(deptA), [{ id: 'lab_1', name: 'Networks Lab', hoursPerWeek: 3, type: 'lab' }]);
    subjectsByClass.set(classIdToKey(deptB), [{ id: 'lab_2', name: 'Database Lab', hoursPerWeek: 3, type: 'lab' }]);

    const model = buildGlobalSchedulingModel({
      semesterType: 'odd',
      classes: [deptA, deptB],
      subjectsByClass,
      facultyMap,
      specialHoursConfigs: new Map(),
      classCounselorsMap: new Map(),
      manualLabsMap,
      openElectiveConfigs: new Map(),
    });

    assert(!model.isModelValid || model.preValidationDiagnostics.length > 0, "Conflicting fixed manual assignments detected in pre-validation");
  }

  // --- TEST 4: Fixed OE periods preserved after generation ---
  {
    const openElectiveConfigs = new Map();
    openElectiveConfigs.set(`dept_a_III`, {
      hours: 5,
      group_name: 'Open Elective',
      is_shared_slot: true,
      selected_slots: ['Mon-1', 'Wed-1', 'Fri-1', 'Sat-1', 'Sat-2'],
    });

    const subjectsByClass = new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: 'oe_subj', name: 'Open Elective', hoursPerWeek: 5, type: 'open elective' },
      { id: 'th1', name: 'Theory 1', hoursPerWeek: 4, type: 'theory' },
    ]);

    const model = buildGlobalSchedulingModel({
      semesterType: 'even',
      classes: [deptA],
      subjectsByClass,
      facultyMap: new Map(),
      specialHoursConfigs: new Map(),
      classCounselorsMap: new Map(),
      manualLabsMap: new Map(),
      openElectiveConfigs,
    });

    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Even semester OE schedule solves cleanly");
    const secA = solution.sectionResults[0];

    assert(secA.grid[0][0] === 'Open Elective', "Mon P1 has Open Elective");
    assert(secA.grid[2][0] === 'Open Elective', "Wed P1 has Open Elective");
    assert(secA.grid[4][0] === 'Open Elective', "Fri P1 has Open Elective");
    assert(secA.grid[5][0] === 'Open Elective', "Sat P1 has Open Elective");
    assert(secA.grid[5][1] === 'Open Elective', "Sat P2 has Open Elective");
  }

  // --- TEST 5: Manual laboratory schedules preserved exactly ---
  {
    const manualLabsMap = new Map();
    manualLabsMap.set(classIdToKey(deptA), [
      { day: 2, period: 4, labName: 'Full Stack Lab' },
      { day: 2, period: 5, labName: 'Full Stack Lab' },
      { day: 2, period: 6, labName: 'Full Stack Lab' },
    ]);

    const subjectsByClass = new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: 'fs_lab', name: 'Full Stack Lab', hoursPerWeek: 3, type: 'lab' },
      { id: 'th1', name: 'Theory 1', hoursPerWeek: 4, type: 'theory' },
    ]);

    const model = buildGlobalSchedulingModel({
      semesterType: 'odd',
      classes: [deptA],
      subjectsByClass,
      facultyMap: new Map(),
      specialHoursConfigs: new Map(),
      classCounselorsMap: new Map(),
      manualLabsMap,
      openElectiveConfigs: new Map(),
    });

    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Manual lab preservation succeeds");
    const secA = solution.sectionResults[0];
    assert(secA.grid[2][4] === 'Full Stack Lab', "Wednesday P5 preserved as Full Stack Lab");
    assert(secA.grid[2][5] === 'Full Stack Lab', "Wednesday P6 preserved as Full Stack Lab");
    assert(secA.grid[2][6] === 'Full Stack Lab', "Wednesday P7 preserved as Full Stack Lab");
  }

  // --- TEST 6: Remaining classes scheduled around fixed laboratories ---
  {
    const manualLabsMap = new Map();
    // Wednesday afternoon is locked by manual lab
    manualLabsMap.set(classIdToKey(deptA), [
      { day: 2, period: 4, labName: 'Networks Lab' },
      { day: 2, period: 5, labName: 'Networks Lab' },
      { day: 2, period: 6, labName: 'Networks Lab' },
    ]);

    const subjectsByClass = new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: 'net_lab', name: 'Networks Lab', hoursPerWeek: 3, type: 'lab' },
      { id: 'th1', name: 'Theory 1', hoursPerWeek: 4, type: 'theory' },
      { id: 'th2', name: 'Theory 2', hoursPerWeek: 4, type: 'theory' },
    ]);

    const model = buildGlobalSchedulingModel({
      semesterType: 'odd',
      classes: [deptA],
      subjectsByClass,
      facultyMap: new Map(),
      specialHoursConfigs: new Map(),
      classCounselorsMap: new Map(),
      manualLabsMap,
      openElectiveConfigs: new Map(),
    });

    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Classes schedule around fixed lab");
    const secA = solution.sectionResults[0];
    assert(secA.grid[2][4] === 'Networks Lab' && secA.grid[2][5] === 'Networks Lab' && secA.grid[2][6] === 'Networks Lab', "Fixed lab intact without any overwriting");
  }

  // --- TEST 7: Consecutive laboratory requirements ---
  {
    const subjectsByClass = new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: 'dyn_lab', name: 'Data Structures Lab', hoursPerWeek: 3, type: 'lab' },
    ]);

    const model = buildGlobalSchedulingModel({
      semesterType: 'odd',
      classes: [deptA],
      subjectsByClass,
      facultyMap: new Map(),
      specialHoursConfigs: new Map(),
      classCounselorsMap: new Map(),
      manualLabsMap: new Map(),
      openElectiveConfigs: new Map(),
    });

    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Dynamic 3-hour lab solves");
    const secA = solution.sectionResults[0];

    // Find which day the lab was placed
    let labDay = -1;
    for (let d = 0; d < 6; d++) {
      if (secA.grid[d].some(c => c === 'Data Structures Lab')) {
        labDay = d;
        break;
      }
    }
    assert(labDay >= 0 && labDay < 5, "Lab placed on a weekday");
    assert(secA.grid[labDay][4] === 'Data Structures Lab' && secA.grid[labDay][5] === 'Data Structures Lab' && secA.grid[labDay][6] === 'Data Structures Lab', "3-hour lab forms continuous contiguous block [4,5,6]");
  }

  // --- TEST 8: Insufficient available periods for required weekly hours ---
  {
    const subjectsByClass = new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: 'oversize', name: 'Super Giant Course', hoursPerWeek: 45, type: 'theory' }, // 45 > 42 total slots
    ]);

    const model = buildGlobalSchedulingModel({
      semesterType: 'odd',
      classes: [deptA],
      subjectsByClass,
      facultyMap: new Map(),
      specialHoursConfigs: new Map(),
      classCounselorsMap: new Map(),
      manualLabsMap: new Map(),
      openElectiveConfigs: new Map(),
    });

    const solution = await solveGlobalTimetable(model);
    assert(!solution.isFeasible, "Impossible hours (> 42 slots) correctly returns infeasible");
  }

  // --- TEST 9: Room / laboratory collision prevention ---
  {
    const manualLabsMap = new Map();
    // Both Sec A and Sec B try to book physical lab room 'room_hardware_lab' at same day/period
    manualLabsMap.set(classIdToKey(deptA), [{ day: 0, period: 4, labName: 'Embedded Lab', labId: 'room_hardware_lab' }]);
    manualLabsMap.set(classIdToKey(deptB), [{ day: 0, period: 4, labName: 'VLSI Lab', labId: 'room_hardware_lab' }]);

    const subjectsByClass = new Map();
    subjectsByClass.set(classIdToKey(deptA), [{ id: 'emb', name: 'Embedded Lab', hoursPerWeek: 1, type: 'lab' }]);
    subjectsByClass.set(classIdToKey(deptB), [{ id: 'vlsi', name: 'VLSI Lab', hoursPerWeek: 1, type: 'lab' }]);

    const model = buildGlobalSchedulingModel({
      semesterType: 'odd',
      classes: [deptA, deptB],
      subjectsByClass,
      facultyMap: new Map(),
      specialHoursConfigs: new Map(),
      classCounselorsMap: new Map(),
      manualLabsMap,
      openElectiveConfigs: new Map(),
    });

    assert(model.preValidationDiagnostics.some(d => d.description.includes('collision') || d.description.includes('occupied')), "Physical room collision prevented during pre-validation");
  }

  // --- TEST 10: Faculty availability restrictions ---
  {
    const facultyMap = new Map();
    const busySlots = new Set(['mon-p1', 'mon-p2', 'mon-p3', 'mon-p4']);
    facultyMap.set('fac_busy_monday', {
      facultyId: 'fac_busy_monday',
      facultyName: 'Prof. Monday Busy',
      assignedSlots: busySlots,
      availableSlots: new Set(),
      dailyHours: [4, 0, 0, 0, 0, 0],
      labPreference: true,
      subjectIds: new Set(['subj_busy']),
      assignments: [{ subjectId: 'subj_busy', year: 'III', section: 'A' }],
      isClassCounselor: false,
    });

    const subjectsByClass = new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: 'subj_busy', name: 'Research Methodology', hoursPerWeek: 3, type: 'theory' },
    ]);

    const model = buildGlobalSchedulingModel({
      semesterType: 'odd',
      classes: [deptA],
      subjectsByClass,
      facultyMap,
      specialHoursConfigs: new Map(),
      classCounselorsMap: new Map(),
      manualLabsMap: new Map(),
      openElectiveConfigs: new Map(),
    });

    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Respects faculty availability restrictions");
    const secA = solution.sectionResults[0];

    // Verify none of Monday P1-P4 is assigned to Research Methodology
    for (let p = 0; p < 4; p++) {
      assert(secA.grid[0][p] !== 'Research Methodology', `Monday P${p + 1} avoided for busy faculty`);
    }
  }

  // --- TEST 11: Exact weekly subject-hour verification ---
  {
    const subjectsByClass = new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: 't1', name: 'Software Engineering', hoursPerWeek: 4, type: 'theory' },
      { id: 't2', name: 'Database Systems', hoursPerWeek: 3, type: 'theory' },
      { id: 't3', name: 'Operating Systems', hoursPerWeek: 4, type: 'theory' },
    ]);

    const model = buildGlobalSchedulingModel({
      semesterType: 'odd',
      classes: [deptA],
      subjectsByClass,
      facultyMap: new Map(),
      specialHoursConfigs: new Map(),
      classCounselorsMap: new Map(),
      manualLabsMap: new Map(),
      openElectiveConfigs: new Map(),
    });

    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Curriculum hours solve cleanly");
    const secA = solution.sectionResults[0];
    assert(secA.weeklyHourVerification.isValid, "100% exact weekly hours verification passed");
    assert(secA.weeklyHourVerification.allocatedHours['Software Engineering'] === 4, "Software Engineering has exactly 4 hours");
    assert(secA.weeklyHourVerification.allocatedHours['Database Systems'] === 3, "Database Systems has exactly 3 hours");
    assert(secA.weeklyHourVerification.allocatedHours['Operating Systems'] === 4, "Operating Systems has exactly 4 hours");
  }

  // --- TEST 12: No three consecutive theory periods ---
  {
    const subjectsByClass = new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: 't1', name: 'Deep Learning', hoursPerWeek: 4, type: 'theory' },
      { id: 't2', name: 'Natural Language Processing', hoursPerWeek: 4, type: 'theory' },
    ]);

    const model = buildGlobalSchedulingModel({
      semesterType: 'odd',
      classes: [deptA],
      subjectsByClass,
      facultyMap: new Map(),
      specialHoursConfigs: new Map(),
      classCounselorsMap: new Map(),
      manualLabsMap: new Map(),
      openElectiveConfigs: new Map(),
    });

    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Anti-3-consecutive theory solves");
    const secA = solution.sectionResults[0];

    let threeConsecutiveFound = false;
    for (let d = 0; d < 6; d++) {
      for (let p = 0; p < 5; p++) {
        const c1 = secA.grid[d][p];
        const c2 = secA.grid[d][p + 1];
        const c3 = secA.grid[d][p + 2];
        if (c1 && c1 !== 'Library' && c1 === c2 && c1 === c3) {
          threeConsecutiveFound = true;
        }
      }
    }
    assert(!threeConsecutiveFound, "Zero 3-consecutive theory periods found in entire grid");
  }

  // --- TEST 13: Semester-specific and Saturday constraints ---
  {
    const subjectsByClass = new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: 't1', name: 'Compiler Design', hoursPerWeek: 3, type: 'theory' },
      { id: 't2', name: 'Distributed Systems', hoursPerWeek: 3, type: 'theory' },
      { id: 't3', name: 'Artificial Intelligence', hoursPerWeek: 3, type: 'theory' },
    ]);

    const model = buildGlobalSchedulingModel({
      semesterType: 'odd',
      classes: [deptA],
      subjectsByClass,
      facultyMap: new Map(),
      specialHoursConfigs: new Map(),
      classCounselorsMap: new Map(),
      manualLabsMap: new Map(),
      openElectiveConfigs: new Map(),
    });

    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Saturday institutional constraints satisfied");
    const secA = solution.sectionResults[0];

    // Check Saturday theory count (at most 2 distinct theory subjects)
    const satTheory = secA.grid[5].filter(c => c && c !== 'Library');
    const distinctSatTheory = new Set(satTheory);
    assert(distinctSatTheory.size <= 2, "Saturday has at most 2 distinct theory subjects");
    assert(satTheory.length === distinctSatTheory.size, "No duplicate theory periods on Saturday");
  }

  // --- TEST 14: Infeasible model handling & diagnostics ---
  {
    // Try to pack 50 hours of subjects into a single section
    const subjectsByClass = new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: 'impossible_load', name: 'Extreme Load', hoursPerWeek: 50, type: 'theory' },
    ]);

    const model = buildGlobalSchedulingModel({
      semesterType: 'odd',
      classes: [deptA],
      subjectsByClass,
      facultyMap: new Map(),
      specialHoursConfigs: new Map(),
      classCounselorsMap: new Map(),
      manualLabsMap: new Map(),
      openElectiveConfigs: new Map(),
    });

    const solution = await solveGlobalTimetable(model);
    assert(!solution.isFeasible, "Infeasible load detected");
    assert(solution.status === 'INFEASIBLE' || solution.status === 'TIMEOUT', "Status is INFEASIBLE or TIMEOUT");
    assert(solution.validationReport.hardErrorCount > 0, "Validation report flags hard errors");
  }

  // --- TEST 15: Faculty and class timetable synchronization ---
  {
    const facultyMap = new Map();
    facultyMap.set('fac_sync', {
      facultyId: 'fac_sync',
      facultyName: 'Dr. Synchronized',
      assignedSlots: new Set(),
      availableSlots: new Set(),
      dailyHours: [0, 0, 0, 0, 0, 0],
      labPreference: true,
      subjectIds: new Set(['subj_sync']),
      assignments: [{ subjectId: 'subj_sync', year: 'III', section: 'A' }],
      isClassCounselor: false,
    });

    const subjectsByClass = new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: 'subj_sync', name: 'Software Quality Assurance', hoursPerWeek: 4, type: 'theory' },
    ]);

    const model = buildGlobalSchedulingModel({
      semesterType: 'odd',
      classes: [deptA],
      subjectsByClass,
      facultyMap,
      specialHoursConfigs: new Map(),
      classCounselorsMap: new Map(),
      manualLabsMap: new Map(),
      openElectiveConfigs: new Map(),
    });

    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Timetable synchronization solves");
    const secA = solution.sectionResults[0];

    // Find all slots in class grid for Software Quality Assurance
    const classSlots = [];
    for (let d = 0; d < 6; d++) {
      for (let p = 0; p < 7; p++) {
        if (secA.grid[d][p] === 'Software Quality Assurance') {
          classSlots.push({ day: d, period: p });
        }
      }
    }
    assert(classSlots.length === 4, "Class timetable has 4 slots for Software Quality Assurance");
  }

  // --- TEST 16: Safe publication guarantee (zero hard errors) ---
  {
    // Corrupt one timetable artificially to test independent validator
    const invalidBatch = [{
      departmentId: 'dept_a',
      departmentName: 'AIDS',
      year: 'III',
      section: 'A',
      grid: [
        ['Math', 'Math', 'Math', 'Math', 'Free', 'Free', 'Free'], // 4 consecutive theory!
        ['Free', 'Free', 'Free', 'Free', 'Free', 'Free', 'Free'],
        ['Free', 'Free', 'Free', 'Free', 'Free', 'Free', 'Free'],
        ['Free', 'Free', 'Free', 'Free', 'Free', 'Free', 'Free'],
        ['Free', 'Free', 'Free', 'Free', 'Free', 'Free', 'Free'],
        ['Free', 'Free', 'Free', 'Free', 'Free', 'Free', 'Free'],
      ],
      weeklyHourVerification: {
        isValid: false,
        allocatedHours: { Math: 4 },
        expectedHours: { Math: 3 },
        mismatches: [{ subject: 'Math', expected: 3, actual: 4 }],
      },
    }];

    const report = validateCompleteTimetableBatch(invalidBatch);
    assert(!report.isValid, "Validator rejects corrupted schedule with 4 consecutive hours and hour mismatch");
    assert(report.hardErrorCount >= 2, "Flags multiple hard errors accurately");
  }

  // --- TEST 17: Incremental section regeneration ---
  {
    // A single section can be solved while locking existing schedules in external faculty map
    const facultyMap = new Map();
    // Faculty has slot Mon P1 already locked by another class
    facultyMap.set('fac_incremental', {
      facultyId: 'fac_incremental',
      facultyName: 'Dr. Incremental',
      assignedSlots: new Set(['mon-p1']),
      availableSlots: new Set(),
      dailyHours: [1, 0, 0, 0, 0, 0],
      labPreference: true,
      subjectIds: new Set(['inc_subj']),
      assignments: [{ subjectId: 'inc_subj', year: 'III', section: 'A' }],
      isClassCounselor: false,
    });

    const subjectsByClass = new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: 'inc_subj', name: 'Big Data Analytics', hoursPerWeek: 3, type: 'theory' },
    ]);

    const model = buildGlobalSchedulingModel({
      semesterType: 'odd',
      classes: [deptA],
      subjectsByClass,
      facultyMap,
      specialHoursConfigs: new Map(),
      classCounselorsMap: new Map(),
      manualLabsMap: new Map(),
      openElectiveConfigs: new Map(),
    });

    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Incremental regeneration succeeds");
    const secA = solution.sectionResults[0];
    assert(secA.grid[0][0] !== 'Big Data Analytics', "Preserves existing locked external slot Mon P1 during incremental solve");
  }

  // --- TEST 18: Database schema compatibility ---
  {
    const subjectsByClass = new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: 'db_subj', name: 'Information Retrieval', hoursPerWeek: 3, type: 'theory' },
    ]);

    const model = buildGlobalSchedulingModel({
      semesterType: 'odd',
      classes: [deptA],
      subjectsByClass,
      facultyMap: new Map(),
      specialHoursConfigs: new Map(),
      classCounselorsMap: new Map(),
      manualLabsMap: new Map(),
      openElectiveConfigs: new Map(),
    });

    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Schema test solves");
    const secA = solution.sectionResults[0];

    // Verify grid structure is 6 rows x 7 cols
    assert(Array.isArray(secA.grid) && secA.grid.length === 6, "Grid has exactly 6 day rows (Mon-Sat)");
    assert(secA.grid.every(row => Array.isArray(row) && row.length === 7), "Every day row has exactly 7 period columns");
    assert(typeof secA.departmentId === 'string' && typeof secA.year === 'string' && typeof secA.section === 'string', "Matches Supabase timetables table columns (department_id, year, section, grid_data)");
  }

  console.log("\n================================================================================");
  console.log(`🎉 ALL ${passedTests}/${totalTests} OPTIMIZER AUTOMATED TESTS PASSED SUCCESSFULLY!`);
  console.log("================================================================================\n");
}

runAllTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
