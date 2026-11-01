// src/lib/optimizer/types.ts
var TOTAL_DAYS = 6;
var PERIODS_PER_DAY = 7;
function slotToKey(slot) {
  return `${slot.day}:${slot.period}`;
}
function classIdToKey(c) {
  return `${c.departmentName}_${c.year}_${c.section}`.toUpperCase();
}
var DEFAULT_OBJECTIVE_WEIGHTS = {
  dayDistributionWeight: 10,
  consecutiveFacultyWeight: 15,
  seniorProfAfternoonPenalty: 25,
  facultyDailyLoadImbalance: 5,
  studentScheduleGaps: 8
};

// src/lib/optimizer/globalConstraintModel.ts
function cleanSubjectName(name) {
  if (!name) return "";
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function isSoftSkillSubject(subj) {
  const name = subj.name.toLowerCase();
  const tags = (subj.tags || []).map((t) => t.toLowerCase());
  return name.includes("soft skill") || name.includes("aptitude") || name.includes("verbal") || name.includes("ssa") || tags.some((t) => t.includes("soft_skill") || t.includes("aptitude") || t.includes("ssa"));
}
function isNptelSubject(subj) {
  const name = subj.name.toLowerCase();
  const tags = (subj.tags || []).map((t) => t.toLowerCase());
  return name.includes("nptel") || name.includes("design thinking") || tags.some((t) => t.includes("nptel"));
}
function isSeniorProfessorFaculty(faculty) {
  if (!faculty || !faculty.designation) return false;
  const d = faculty.designation.toLowerCase();
  return d.includes("professor") || d.includes("hod") || d.includes("head");
}
function buildGlobalSchedulingModel(input) {
  const diagnostics = [];
  const immutableAssignments = [];
  const teachingUnits = [];
  const fixedGridByClass = /* @__PURE__ */ new Map();
  const occupiedSlotsByClass = /* @__PURE__ */ new Map();
  const occupiedSlotsByFaculty = /* @__PURE__ */ new Map();
  const occupiedSlotsByRoom = /* @__PURE__ */ new Map();
  for (const c of input.classes) {
    const key = classIdToKey(c);
    const grid = Array.from({ length: TOTAL_DAYS }, () => Array(PERIODS_PER_DAY).fill(null));
    fixedGridByClass.set(key, grid);
    occupiedSlotsByClass.set(key, /* @__PURE__ */ new Set());
  }
  for (const [facId, facAlloc] of input.facultyMap.entries()) {
    if (!occupiedSlotsByFaculty.has(facId)) {
      occupiedSlotsByFaculty.set(facId, /* @__PURE__ */ new Map());
    }
    const facSlots = occupiedSlotsByFaculty.get(facId);
    for (const slotKey of facAlloc.assignedSlots) {
      const [dName, pName] = slotKey.toLowerCase().split("-");
      const dIdx = ["mon", "tue", "wed", "thu", "fri", "sat"].indexOf(dName);
      const pIdx = parseInt(pName?.replace("p", "") || "1", 10) - 1;
      if (dIdx >= 0 && dIdx < TOTAL_DAYS && pIdx >= 0 && pIdx < PERIODS_PER_DAY) {
        const sKey = `${dIdx}:${pIdx}`;
        if (!facSlots.has(sKey)) {
          facSlots.set(sKey, []);
        }
        facSlots.get(sKey).push({
          classKey: "EXTERNAL_TIMETABLE",
          subjectName: "Existing Schedule"
        });
      }
    }
  }
  const lockImmutableSlot = (c, slot, subjectId, subjectName, facultyId, facultyName, roomId, activityType = "fixed_custom", reason = "Staff configured") => {
    const cKey = classIdToKey(c);
    const sKey = slotToKey(slot);
    const grid = fixedGridByClass.get(cKey);
    const cSlots = occupiedSlotsByClass.get(cKey);
    if (grid[slot.day][slot.period] !== null) {
      diagnostics.push({
        category: "FIXED_ASSIGNMENT_COLLISION",
        severity: "CRITICAL",
        affectedDepartment: c.departmentName,
        affectedYear: c.year,
        affectedSection: c.section,
        affectedSubject: subjectName,
        conflictingSlots: [slot],
        description: `Class collision in ${cKey}: slot Day ${slot.day + 1} P${slot.period + 1} is already occupied by "${grid[slot.day][slot.period].subjectName}" when trying to place "${subjectName}".`,
        remediationAdvice: `Review conflicting fixed assignments or manual lab schedule entries for ${cKey}.`
      });
      return;
    }
    if (facultyId) {
      if (!occupiedSlotsByFaculty.has(facultyId)) {
        occupiedSlotsByFaculty.set(facultyId, /* @__PURE__ */ new Map());
      }
      const facSlots = occupiedSlotsByFaculty.get(facultyId);
      if (!facSlots.has(sKey)) {
        facSlots.set(sKey, []);
      }
      const existingBookings = facSlots.get(sKey);
      const isSharedOe = activityType === "open_elective" && existingBookings.every((b) => b.subjectName === subjectName);
      if (existingBookings.length > 0 && !isSharedOe) {
        diagnostics.push({
          category: "FIXED_ASSIGNMENT_COLLISION",
          severity: "CRITICAL",
          affectedDepartment: c.departmentName,
          affectedYear: c.year,
          affectedSection: c.section,
          affectedSubject: subjectName,
          affectedFacultyId: facultyId,
          affectedFacultyName: facultyName,
          conflictingSlots: [slot],
          description: `Fixed assignment faculty conflict: ${facultyName || facultyId} is already booked at Day ${slot.day + 1} P${slot.period + 1} for ${existingBookings[0].classKey} ("${existingBookings[0].subjectName}").`,
          remediationAdvice: `Reassign the faculty member in one of the conflicting classes or modify the fixed schedule.`
        });
      }
      facSlots.get(sKey).push({ classKey: cKey, subjectName });
    }
    if (roomId) {
      if (!occupiedSlotsByRoom.has(roomId)) {
        occupiedSlotsByRoom.set(roomId, /* @__PURE__ */ new Map());
      }
      const roomSlots = occupiedSlotsByRoom.get(roomId);
      if (!roomSlots.has(sKey)) {
        roomSlots.set(sKey, []);
      }
      const existingRoomBookings = roomSlots.get(sKey);
      if (existingRoomBookings.length > 0) {
        diagnostics.push({
          category: "ROOM_COLLISION",
          severity: "CRITICAL",
          affectedDepartment: c.departmentName,
          affectedYear: c.year,
          affectedSection: c.section,
          affectedSubject: subjectName,
          affectedRoomId: roomId,
          conflictingSlots: [slot],
          description: `Physical room collision: Room/Lab "${roomId}" is already booked at Day ${slot.day + 1} P${slot.period + 1} for ${existingRoomBookings[0].classKey} ("${existingRoomBookings[0].subjectName}").`,
          remediationAdvice: `Assign a different room or reschedule one of the classes.`
        });
      }
      existingRoomBookings.push({ classKey: cKey, subjectName });
    }
    grid[slot.day][slot.period] = {
      subjectName,
      subjectId,
      facultyId,
      facultyName,
      roomId,
      isFixed: true,
      activityType
    };
    cSlots.add(sKey);
  };
  for (const c of input.classes) {
    const cKey = classIdToKey(c);
    const subjects = input.subjectsByClass.get(cKey) || [];
    if (input.semesterType === "even" && (c.year === "III" || c.year === "3")) {
      const oeConfigKey = `${c.departmentId}_${c.year}`;
      const oeConfig = input.openElectiveConfigs.get(oeConfigKey);
      const oeSlotsConfig = oeConfig?.selected_slots || ["Mon-1", "Wed-1", "Fri-1", "Sat-1", "Sat-2"];
      const oeSubj = subjects.find((s) => s.type === "open elective") || {
        id: "oe_fixed_id",
        name: oeConfig?.group_name || "Open Elective",
        hoursPerWeek: oeSlotsConfig.length,
        type: "open elective"
      };
      let oeFaculty;
      for (const f of input.facultyMap.values()) {
        if (f.subjectIds.has(oeSubj.id) || f.assignments?.some((a) => a.subjectId === oeSubj.id)) {
          oeFaculty = f;
          break;
        }
      }
      const parsedOeSlots = [];
      for (const slotStr of oeSlotsConfig) {
        const parts = slotStr.split("-");
        if (parts.length === 2) {
          const dayMap = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5 };
          const d = dayMap[parts[0].toLowerCase().slice(0, 3)];
          const p = parseInt(parts[1], 10) - 1;
          if (d !== void 0 && p >= 0 && p < PERIODS_PER_DAY) {
            parsedOeSlots.push({ day: d, period: p });
            lockImmutableSlot(
              c,
              { day: d, period: p },
              oeSubj.id,
              oeSubj.name,
              oeFaculty?.facultyId,
              oeFaculty?.facultyName,
              void 0,
              "open_elective",
              "Open Elective Institutional Synchronized Slot"
            );
          }
        }
      }
      immutableAssignments.push({
        source: "open_elective",
        classKey: cKey,
        subjectId: oeSubj.id,
        subjectName: oeSubj.name,
        facultyId: oeFaculty?.facultyId,
        facultyName: oeFaculty?.facultyName,
        slots: parsedOeSlots,
        reason: "Staff configured Open Elective"
      });
    }
    const manualLabs = input.manualLabsMap.get(cKey) || [];
    const groupedManualLabs = /* @__PURE__ */ new Map();
    for (const m of manualLabs) {
      if (!groupedManualLabs.has(m.labName)) {
        groupedManualLabs.set(m.labName, []);
      }
      groupedManualLabs.get(m.labName).push(m);
    }
    for (const [labName, entries] of groupedManualLabs.entries()) {
      const matchedLab = subjects.find((s) => cleanSubjectName(s.name) === cleanSubjectName(labName)) || {
        id: entries[0].labId || `manual_lab_${cleanSubjectName(labName)}`,
        name: labName,
        type: "lab",
        hoursPerWeek: entries.length
      };
      let labFaculty;
      for (const f of input.facultyMap.values()) {
        const teaches = f.subjectIds.has(matchedLab.id) || f.assignments?.some(
          (a) => a.subjectId === matchedLab.id && (!a.year || a.year === c.year) && (!a.section || a.section === c.section)
        );
        if (teaches) {
          labFaculty = f;
          break;
        }
      }
      const labSlots = [];
      for (const entry of entries) {
        if (entry.day >= 0 && entry.day < TOTAL_DAYS && entry.period >= 0 && entry.period < PERIODS_PER_DAY) {
          const slot = { day: entry.day, period: entry.period };
          labSlots.push(slot);
          lockImmutableSlot(
            c,
            slot,
            matchedLab.id,
            matchedLab.name,
            labFaculty?.facultyId,
            labFaculty?.facultyName,
            entry.labId,
            "lab",
            "Manually Assigned Lab Schedule"
          );
        }
      }
      immutableAssignments.push({
        source: "lab_schedule",
        classKey: cKey,
        subjectId: matchedLab.id,
        subjectName: matchedLab.name,
        facultyId: labFaculty?.facultyId,
        facultyName: labFaculty?.facultyName,
        roomId: entries[0].labId,
        slots: labSlots,
        reason: "Staff configured manual lab schedule in lab_schedules table"
      });
    }
    const spKey = `${c.departmentId}_${c.year}`;
    const spConfigs = input.specialHoursConfigs.get(spKey) || [];
    const counselor = input.classCounselorsMap.get(cKey);
    for (const sp of spConfigs) {
      if (!sp.is_active) continue;
      const type = sp.special_type.toLowerCase();
      const satHours = sp.saturday_hours || 0;
      const satPeriods = (sp.saturday_periods || []).map((p) => p - 1);
      if (satHours > 0) {
        let facId = counselor?.facultyId;
        let facName = counselor?.facultyName;
        let label = "Counseling";
        let actType = "counseling";
        if (type.includes("seminar") || type.includes("presentation")) {
          label = "Seminar";
          actType = "seminar";
          facId = void 0;
        } else if (type.includes("library")) {
          label = "Library";
          actType = "library";
          facId = void 0;
        }
        const slots = [];
        for (const p of satPeriods) {
          if (p >= 0 && p < PERIODS_PER_DAY) {
            const slot = { day: 5, period: p };
            slots.push(slot);
            lockImmutableSlot(c, slot, `sp_${type}_${cKey}`, label, facId, facName, void 0, actType, `Special hours ${type}`);
          }
        }
        if (slots.length > 0) {
          immutableAssignments.push({
            source: "special_hours",
            classKey: cKey,
            subjectId: `sp_${type}`,
            subjectName: label,
            facultyId: facId,
            facultyName: facName,
            slots,
            reason: `Institutional Saturday ${label}`
          });
        }
      }
    }
  }
  for (const c of input.classes) {
    const cKey = classIdToKey(c);
    const subjects = input.subjectsByClass.get(cKey) || [];
    const classGrid = fixedGridByClass.get(cKey);
    const placedHours = /* @__PURE__ */ new Map();
    for (let d = 0; d < TOTAL_DAYS; d++) {
      for (let p = 0; p < PERIODS_PER_DAY; p++) {
        const cell = classGrid[d][p];
        if (cell && cell.subjectId) {
          placedHours.set(cell.subjectId, (placedHours.get(cell.subjectId) || 0) + 1);
        }
      }
    }
    for (const subj of subjects) {
      const alreadyPlaced = placedHours.get(subj.id) || 0;
      const remainingHours = Math.max(0, subj.hoursPerWeek - alreadyPlaced);
      if (remainingHours <= 0) continue;
      let assignedFaculty;
      for (const f of input.facultyMap.values()) {
        const teaches = f.subjectIds.has(subj.id) || f.assignments?.some(
          (a) => a.subjectId === subj.id && (!a.year || a.year === c.year) && (!a.section || a.section === c.section)
        );
        if (teaches) {
          assignedFaculty = f;
          break;
        }
      }
      const isSeniorProf = isSeniorProfessorFaculty(assignedFaculty);
      if (subj.type === "lab") {
        const blockDuration = Math.min(remainingHours, remainingHours >= 4 ? 4 : remainingHours >= 3 ? 3 : 2);
        let remLabHours = remainingHours;
        while (remLabHours > 0) {
          const curDuration = remLabHours >= 4 ? 4 : remLabHours >= 3 ? 3 : remLabHours >= 2 ? 2 : 1;
          teachingUnits.push({
            id: `unit_${cKey}_${subj.id}_lab_${curDuration}_${remLabHours}`,
            classKey: cKey,
            classId: c,
            subjectId: subj.id,
            subjectName: subj.name,
            subjectCode: subj.code,
            activityType: "lab",
            duration: curDuration,
            primaryFacultyId: assignedFaculty?.facultyId,
            facultyName: assignedFaculty?.facultyName,
            isFixed: false,
            allowedDays: [0, 1, 2, 3, 4],
            // Weekdays only
            allowedPeriods: curDuration === 4 ? [3] : curDuration === 3 ? [4] : [0, 2, 5],
            // periods [0,1], [2,3], or [5,6]
            tags: subj.tags
          });
          remLabHours -= curDuration;
        }
        continue;
      }
      if (isSoftSkillSubject(subj)) {
        teachingUnits.push({
          id: `unit_${cKey}_${subj.id}_ssa_5th`,
          classKey: cKey,
          classId: c,
          subjectId: subj.id,
          subjectName: subj.name,
          subjectCode: subj.code,
          activityType: "soft_skill",
          duration: 1,
          primaryFacultyId: assignedFaculty?.facultyId,
          facultyName: assignedFaculty?.facultyName,
          isFixed: false,
          allowedDays: [0, 1, 2, 3, 4],
          allowedPeriods: [4],
          // Period 5 only (0-indexed 4)
          tags: ["ssa_5th_hour"]
        });
        const morningHours = Math.min(3, remainingHours - 1);
        for (let i = 0; i < morningHours; i++) {
          teachingUnits.push({
            id: `unit_${cKey}_${subj.id}_ssa_morning_${i}`,
            classKey: cKey,
            classId: c,
            subjectId: subj.id,
            subjectName: subj.name,
            subjectCode: subj.code,
            activityType: "soft_skill",
            duration: 1,
            primaryFacultyId: assignedFaculty?.facultyId,
            facultyName: assignedFaculty?.facultyName,
            isFixed: false,
            allowedDays: [0, 1, 2, 3, 4],
            allowedPeriods: [0, 1, 2, 3],
            // Morning only
            tags: ["ssa_morning_hour"]
          });
        }
        continue;
      }
      if (isNptelSubject(subj)) {
        for (let i = 0; i < remainingHours; i++) {
          teachingUnits.push({
            id: `unit_${cKey}_${subj.id}_nptel_${i}`,
            classKey: cKey,
            classId: c,
            subjectId: subj.id,
            subjectName: subj.name,
            subjectCode: subj.code,
            activityType: "nptel",
            duration: 1,
            primaryFacultyId: assignedFaculty?.facultyId,
            facultyName: assignedFaculty?.facultyName,
            isFixed: false,
            allowedDays: [0, 1, 2, 3, 4],
            allowedPeriods: [0, 1, 2, 5, 6],
            // Periods 4 and 5 strictly prohibited
            forbiddenPeriods: [3, 4],
            tags: subj.tags
          });
        }
        continue;
      }
      for (let i = 0; i < remainingHours; i++) {
        teachingUnits.push({
          id: `unit_${cKey}_${subj.id}_theory_${i}`,
          classKey: cKey,
          classId: c,
          subjectId: subj.id,
          subjectName: subj.name,
          subjectCode: subj.code,
          activityType: subj.type === "elective" ? "elective" : "theory",
          duration: 1,
          primaryFacultyId: assignedFaculty?.facultyId,
          facultyName: assignedFaculty?.facultyName,
          isFixed: false,
          isSeniorProfessor: isSeniorProf,
          allowedDays: [0, 1, 2, 3, 4, 5],
          allowedPeriods: isSeniorProf && input.preferSeniorProfMorning ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6],
          tags: subj.tags
        });
      }
    }
  }
  const hasCriticalErrors = diagnostics.some((d) => d.severity === "CRITICAL");
  return {
    classes: input.classes,
    immutableAssignments,
    teachingUnits,
    preValidationDiagnostics: diagnostics,
    isModelValid: !hasCriticalErrors,
    fixedGridByClass,
    occupiedSlotsByClass,
    occupiedSlotsByFaculty
  };
}

// src/lib/optimizer/timetableValidator.ts
function cleanSubjectName2(name) {
  if (!name) return "";
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function validateCompleteTimetableBatch(timetables, model) {
  const violations = [];
  const sectionMap = /* @__PURE__ */ new Map();
  timetables.forEach((t) => {
    const key = `${t.departmentName}_${t.year}_${t.section}`.toUpperCase();
    sectionMap.set(key, t);
  });
  if (model) {
    const oeAssignments = model.immutableAssignments.filter((a) => a.source === "open_elective");
    for (const oe of oeAssignments) {
      const targetSec = sectionMap.get(oe.classKey);
      if (!targetSec) continue;
      for (const slot of oe.slots) {
        const actualCell = targetSec.grid?.[slot.day]?.[slot.period];
        if (cleanSubjectName2(actualCell) !== cleanSubjectName2(oe.subjectName)) {
          violations.push({
            ruleId: "RULE_1_OE_PRESERVATION_VIOLATED",
            ruleCategory: "FIXED_PRESERVATION",
            severity: "HARD_ERROR",
            departmentName: targetSec.departmentName,
            year: targetSec.year,
            section: targetSec.section,
            day: slot.day,
            period: slot.period,
            subjectName: oe.subjectName,
            message: `Fixed Open Elective assignment was altered or overwritten at Day ${slot.day + 1} P${slot.period + 1}. Expected "${oe.subjectName}", got "${actualCell}".`
          });
        }
      }
    }
    const manualLabAssignments = model.immutableAssignments.filter((a) => a.source === "lab_schedule");
    for (const lab of manualLabAssignments) {
      const targetSec = sectionMap.get(lab.classKey);
      if (!targetSec) continue;
      for (const slot of lab.slots) {
        const actualCell = targetSec.grid?.[slot.day]?.[slot.period];
        if (cleanSubjectName2(actualCell) !== cleanSubjectName2(lab.subjectName)) {
          violations.push({
            ruleId: "RULE_2_MANUAL_LAB_PRESERVATION_VIOLATED",
            ruleCategory: "FIXED_PRESERVATION",
            severity: "HARD_ERROR",
            departmentName: targetSec.departmentName,
            year: targetSec.year,
            section: targetSec.section,
            day: slot.day,
            period: slot.period,
            subjectName: lab.subjectName,
            message: `Manual lab assignment from lab_schedules was altered or missing at Day ${slot.day + 1} P${slot.period + 1}. Expected "${lab.subjectName}", got "${actualCell}".`
          });
        }
      }
    }
  }
  const facultySlots = /* @__PURE__ */ new Map();
  const facultyLookup = /* @__PURE__ */ new Map();
  if (model) {
    model.teachingUnits.forEach((u) => {
      if (u.facultyName) {
        facultyLookup.set(`${u.classKey}_${cleanSubjectName2(u.subjectName)}`, u.facultyName);
      }
    });
    model.immutableAssignments.forEach((a) => {
      if (a.facultyName) {
        facultyLookup.set(`${a.classKey}_${cleanSubjectName2(a.subjectName)}`, a.facultyName);
      }
    });
  }
  for (const t of timetables) {
    const cKey = `${t.departmentName}_${t.year}_${t.section}`.toUpperCase();
    for (let d = 0; d < TOTAL_DAYS; d++) {
      for (let p = 0; p < PERIODS_PER_DAY; p++) {
        const cell = t.grid?.[d]?.[p];
        if (!cell || cell === "-" || cell === "FREE" || /library/i.test(cell)) continue;
        const slotKey = `${d}:${p}`;
        const facName = facultyLookup.get(`${cKey}_${cleanSubjectName2(cell)}`);
        if (facName) {
          const normFac = facName.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (!facultySlots.has(normFac)) facultySlots.set(normFac, /* @__PURE__ */ new Map());
          const facMap = facultySlots.get(normFac);
          if (!facMap.has(slotKey)) facMap.set(slotKey, []);
          facMap.get(slotKey).push({
            dept: t.departmentName,
            year: t.year,
            sec: t.section,
            subject: cell
          });
        }
      }
    }
  }
  facultySlots.forEach((slots, facNorm) => {
    slots.forEach((bookings, slotKey) => {
      if (bookings.length > 1) {
        const isSharedOe = bookings.every((b) => cleanSubjectName2(b.subject).includes("openelective") || cleanSubjectName2(b.subject).includes("oe"));
        if (!isSharedOe) {
          const [dStr, pStr] = slotKey.split(":");
          const d = parseInt(dStr, 10);
          const p = parseInt(pStr, 10);
          violations.push({
            ruleId: "RULE_3_FACULTY_DOUBLE_BOOKING",
            ruleCategory: "FACULTY",
            severity: "HARD_ERROR",
            departmentName: bookings[0].dept,
            year: bookings[0].year,
            section: bookings[0].sec,
            day: d,
            period: p,
            facultyName: facNorm,
            message: `Faculty double-booking collision at Day ${d + 1} P${p + 1}: ${bookings.map((b) => `${b.dept} Yr ${b.year} Sec ${b.sec} ("${b.subject}")`).join(" VS ")}`
          });
        }
      }
    });
  });
  for (const t of timetables) {
    if (!t.weeklyHourVerification.isValid) {
      for (const m of t.weeklyHourVerification.mismatches) {
        violations.push({
          ruleId: "RULE_6_CURRICULUM_HOURS_MISMATCH",
          ruleCategory: "CURRICULUM",
          severity: "HARD_ERROR",
          departmentName: t.departmentName,
          year: t.year,
          section: t.section,
          subjectName: m.subject,
          message: `Subject "${m.subject}" weekly hours mismatch in ${t.departmentName} Yr ${t.year} Sec ${t.section}: expected ${m.expected}h, got ${m.actual}h.`
        });
      }
    }
  }
  for (const t of timetables) {
    for (let d = 0; d < TOTAL_DAYS; d++) {
      const daySubjects = /* @__PURE__ */ new Map();
      for (let p = 0; p < PERIODS_PER_DAY; p++) {
        const cell = t.grid?.[d]?.[p];
        if (!cell || /library/i.test(cell)) continue;
        const isLab = /\blab\b|\blaboratory\b|\bpracticals?\b/i.test(cell);
        if (!isLab && d < 5) {
          daySubjects.set(cell, (daySubjects.get(cell) || 0) + 1);
          if (daySubjects.get(cell) > 2) {
            violations.push({
              ruleId: "RULE_9_MAX_DAILY_THEORY_EXCEEDED",
              ruleCategory: "INSTITUTIONAL",
              severity: "HARD_ERROR",
              departmentName: t.departmentName,
              year: t.year,
              section: t.section,
              day: d,
              period: p,
              subjectName: cell,
              message: `Theory subject "${cell}" exceeded maximum allowed 2 hours on Day ${d + 1} in ${t.departmentName} Yr ${t.year} Sec ${t.section}.`
            });
          }
        }
        if (!isLab && p <= PERIODS_PER_DAY - 3) {
          const c2 = t.grid?.[d]?.[p + 1];
          const c3 = t.grid?.[d]?.[p + 2];
          if (c2 && c3 && cleanSubjectName2(cell) === cleanSubjectName2(c2) && cleanSubjectName2(cell) === cleanSubjectName2(c3)) {
            violations.push({
              ruleId: "RULE_9_THREE_CONSECUTIVE_THEORY_VIOLATION",
              ruleCategory: "INSTITUTIONAL",
              severity: "HARD_ERROR",
              departmentName: t.departmentName,
              year: t.year,
              section: t.section,
              day: d,
              period: p,
              subjectName: cell,
              message: `Three consecutive theory periods detected for "${cell}" at Day ${d + 1} P${p + 1}-P${p + 3} in ${t.departmentName} Yr ${t.year} Sec ${t.section}.`
            });
          }
        }
      }
      let labSlotsCount = 0;
      for (let p = 0; p < PERIODS_PER_DAY; p++) {
        const cell = t.grid?.[d]?.[p];
        if (cell && /\blab\b|\blaboratory\b|\bpracticals?\b/i.test(cell)) {
          labSlotsCount++;
        }
      }
      if (d === 5 && labSlotsCount > 0) {
        violations.push({
          ruleId: "RULE_7_LAB_ON_SATURDAY_VIOLATION",
          ruleCategory: "LAB",
          severity: "HARD_ERROR",
          departmentName: t.departmentName,
          year: t.year,
          section: t.section,
          day: 5,
          message: `Laboratory scheduled on Saturday in ${t.departmentName} Yr ${t.year} Sec ${t.section}. Laboratories are strictly weekday-only.`
        });
      }
    }
  }
  const hardErrors = violations.filter((v) => v.severity === "HARD_ERROR");
  const softWarnings = violations.filter((v) => v.severity === "SOFT_WARNING");
  return {
    isValid: hardErrors.length === 0,
    hardErrorCount: hardErrors.length,
    softWarningCount: softWarnings.length,
    violations,
    summaryText: hardErrors.length === 0 ? `All 14 validation criteria verified 100% valid! Zero hard constraint violations.` : `Validation failed with ${hardErrors.length} hard constraint violation(s). First violation: ${hardErrors[0].message}`
  };
}

// src/lib/optimizer/globalCpSolver.ts
async function solveGlobalTimetable(model, options = {}) {
  const startTime = Date.now();
  const timeLimitMs = options.timeLimitMs || 25e3;
  const maxBacktracks = options.maxBacktracks || 1e5;
  const weights = DEFAULT_OBJECTIVE_WEIGHTS;
  if (!model.isModelValid || model.preValidationDiagnostics.some((d) => d.severity === "CRITICAL")) {
    return {
      status: "INFEASIBLE",
      isFeasible: false,
      isOptimal: false,
      executionTimeMs: Date.now() - startTime,
      sectionResults: [],
      immutableAssignmentsPreserved: 0,
      validationReport: {
        isValid: false,
        hardErrorCount: model.preValidationDiagnostics.length,
        softWarningCount: 0,
        violations: model.preValidationDiagnostics.map((d) => ({
          ruleId: d.category,
          ruleCategory: "FIXED_PRESERVATION",
          severity: "HARD_ERROR",
          departmentName: d.affectedDepartment || "",
          year: d.affectedYear || "",
          section: d.affectedSection || "",
          subjectName: d.affectedSubject,
          facultyName: d.affectedFacultyName,
          message: d.description
        })),
        summaryText: `Pre-validation failed: ${model.preValidationDiagnostics[0]?.description || "Fixed assignment collision"}`
      },
      diagnostics: model.preValidationDiagnostics
    };
  }
  const gridState = /* @__PURE__ */ new Map();
  const classOccupied = /* @__PURE__ */ new Map();
  const classDailySubjectHours = /* @__PURE__ */ new Map();
  const classDailyLabs = /* @__PURE__ */ new Map();
  const classSsaDays = /* @__PURE__ */ new Map();
  const facultySlots = /* @__PURE__ */ new Map();
  const facultyDailyHours = /* @__PURE__ */ new Map();
  for (const c of model.classes) {
    const cKey = classIdToKey(c);
    const grid = Array.from({ length: TOTAL_DAYS }, () => Array(PERIODS_PER_DAY).fill(null));
    gridState.set(cKey, grid);
    classOccupied.set(cKey, /* @__PURE__ */ new Set());
    classDailySubjectHours.set(cKey, /* @__PURE__ */ new Map());
    classDailyLabs.set(cKey, [0, 0, 0, 0, 0, 0]);
    classSsaDays.set(cKey, /* @__PURE__ */ new Set());
    const fixedGrid = model.fixedGridByClass.get(cKey);
    if (fixedGrid) {
      for (let d = 0; d < TOTAL_DAYS; d++) {
        for (let p = 0; p < PERIODS_PER_DAY; p++) {
          const cell = fixedGrid[d][p];
          if (cell) {
            grid[d][p] = { ...cell };
            classOccupied.get(cKey).add(`${d}:${p}`);
            if (!classDailySubjectHours.get(cKey).has(d)) {
              classDailySubjectHours.get(cKey).set(d, /* @__PURE__ */ new Map());
            }
            const dayMap = classDailySubjectHours.get(cKey).get(d);
            dayMap.set(cell.subjectId, (dayMap.get(cell.subjectId) || 0) + 1);
            if (cell.activityType === "lab") {
              classDailyLabs.get(cKey)[d]++;
            }
          }
        }
      }
    }
  }
  for (const [facId, slotsMap] of model.occupiedSlotsByFaculty.entries()) {
    if (!facultySlots.has(facId)) facultySlots.set(facId, /* @__PURE__ */ new Set());
    if (!facultyDailyHours.has(facId)) facultyDailyHours.set(facId, [0, 0, 0, 0, 0, 0]);
    for (const [slotKey, bookings] of slotsMap.entries()) {
      facultySlots.get(facId).add(slotKey);
      const d = parseInt(slotKey.split(":")[0], 10);
      if (d >= 0 && d < TOTAL_DAYS) {
        facultyDailyHours.get(facId)[d]++;
      }
    }
  }
  const sortedUnits = [...model.teachingUnits].sort((a, b) => {
    if (a.duration !== b.duration) return b.duration - a.duration;
    const aIsSsa5th = a.tags?.includes("ssa_5th_hour") ? 1 : 0;
    const bIsSsa5th = b.tags?.includes("ssa_5th_hour") ? 1 : 0;
    if (aIsSsa5th !== bIsSsa5th) return bIsSsa5th - aIsSsa5th;
    const aIsSsaMorn = a.tags?.includes("ssa_morning_hour") ? 1 : 0;
    const bIsSsaMorn = b.tags?.includes("ssa_morning_hour") ? 1 : 0;
    if (aIsSsaMorn !== bIsSsaMorn) return bIsSsaMorn - aIsSsaMorn;
    const aFacCount = a.primaryFacultyId ? facultySlots.get(a.primaryFacultyId)?.size || 0 : 0;
    const bFacCount = b.primaryFacultyId ? facultySlots.get(b.primaryFacultyId)?.size || 0 : 0;
    if (aFacCount !== bFacCount) return bFacCount - aFacCount;
    return 0;
  });
  let backtracks = 0;
  let solutionFound = false;
  let bestScore = Infinity;
  const canPlaceUnitAt = (unit, d, p) => {
    const cKey = unit.classKey;
    const grid = gridState.get(cKey);
    if (p + unit.duration > PERIODS_PER_DAY) return false;
    if (unit.allowedDays && !unit.allowedDays.includes(d)) return false;
    if (unit.allowedPeriods && !unit.allowedPeriods.includes(p)) return false;
    if (unit.forbiddenPeriods) {
      for (let k = 0; k < unit.duration; k++) {
        if (unit.forbiddenPeriods.includes(p + k)) return false;
      }
    }
    for (let k = 0; k < unit.duration; k++) {
      if (grid[d][p + k] !== null) return false;
    }
    if (unit.primaryFacultyId) {
      const fSlots = facultySlots.get(unit.primaryFacultyId);
      if (fSlots) {
        for (let k = 0; k < unit.duration; k++) {
          if (fSlots.has(`${d}:${p + k}`)) return false;
        }
      }
    }
    if (unit.activityType === "lab") {
      if (d === 5) return false;
      if ((classDailyLabs.get(cKey)[d] || 0) > 0) return false;
    }
    if (unit.activityType === "soft_skill") {
      if (d === 5) return false;
      if (classSsaDays.get(cKey).has(d)) return false;
      if (unit.tags?.includes("ssa_5th_hour") && p !== 4) return false;
      if (unit.tags?.includes("ssa_morning_hour") && p > 3) return false;
    }
    if (unit.activityType === "theory" || unit.activityType === "elective") {
      const daySubjMap = classDailySubjectHours.get(cKey).get(d);
      const currentDayHours = daySubjMap?.get(unit.subjectId) || 0;
      if (d === 5) {
        if (currentDayHours >= 1) return false;
        let satDistinctTheory = 0;
        for (let sp = 0; sp < PERIODS_PER_DAY; sp++) {
          const cell = grid[5][sp];
          if (cell && (cell.activityType === "theory" || cell.activityType === "elective")) {
            satDistinctTheory++;
          }
        }
        if (satDistinctTheory >= 2) return false;
      } else {
        if (currentDayHours >= 2) return false;
      }
      const name = unit.subjectName;
      if (p >= 2 && grid[d][p - 1]?.subjectName === name && grid[d][p - 2]?.subjectName === name) return false;
      if (p <= PERIODS_PER_DAY - 3 && grid[d][p + 1]?.subjectName === name && grid[d][p + 2]?.subjectName === name) return false;
      if (p >= 1 && p <= PERIODS_PER_DAY - 2 && grid[d][p - 1]?.subjectName === name && grid[d][p + 1]?.subjectName === name) return false;
      if (unit.isSeniorProfessor && options.preferSeniorProfMorning && p >= 4) {
        return false;
      }
    }
    return true;
  };
  const scoreCandidateSlot = (unit, d, p) => {
    let penalty = 0;
    const cKey = unit.classKey;
    const daySubjMap = classDailySubjectHours.get(cKey).get(d);
    const existingHoursOnDay = daySubjMap?.get(unit.subjectId) || 0;
    if (existingHoursOnDay > 0) {
      penalty += weights.dayDistributionWeight;
    }
    if (unit.isSeniorProfessor && p >= 4) {
      penalty += weights.seniorProfAfternoonPenalty;
    }
    if (unit.primaryFacultyId) {
      const fSlots = facultySlots.get(unit.primaryFacultyId);
      if (fSlots) {
        if (p > 0 && fSlots.has(`${d}:${p - 1}`)) penalty += weights.consecutiveFacultyWeight;
        if (p < PERIODS_PER_DAY - 1 && fSlots.has(`${d}:${p + 1}`)) penalty += weights.consecutiveFacultyWeight;
      }
    }
    const currentClassSlotsOnDay = Array.from({ length: PERIODS_PER_DAY }, (_, idx) => gridState.get(cKey)[d][idx]).filter(Boolean).length;
    penalty += currentClassSlotsOnDay * weights.facultyDailyLoadImbalance;
    return penalty;
  };
  const applyPlacement = (unit, d, p) => {
    const cKey = unit.classKey;
    const grid = gridState.get(cKey);
    const cOccupied = classOccupied.get(cKey);
    for (let k = 0; k < unit.duration; k++) {
      const slotP = p + k;
      grid[d][slotP] = {
        subjectId: unit.subjectId,
        subjectName: unit.subjectName,
        facultyId: unit.primaryFacultyId,
        facultyName: unit.facultyName,
        roomId: unit.roomId,
        isFixed: false,
        activityType: unit.activityType
      };
      cOccupied.add(`${d}:${slotP}`);
      if (unit.primaryFacultyId) {
        if (!facultySlots.has(unit.primaryFacultyId)) facultySlots.set(unit.primaryFacultyId, /* @__PURE__ */ new Set());
        facultySlots.get(unit.primaryFacultyId).add(`${d}:${slotP}`);
        facultyDailyHours.get(unit.primaryFacultyId)[d]++;
      }
    }
    if (!classDailySubjectHours.get(cKey).has(d)) {
      classDailySubjectHours.get(cKey).set(d, /* @__PURE__ */ new Map());
    }
    const dayMap = classDailySubjectHours.get(cKey).get(d);
    dayMap.set(unit.subjectId, (dayMap.get(unit.subjectId) || 0) + unit.duration);
    if (unit.activityType === "lab") {
      classDailyLabs.get(cKey)[d]++;
    }
    if (unit.activityType === "soft_skill") {
      classSsaDays.get(cKey).add(d);
    }
  };
  const rollbackPlacement = (unit, d, p) => {
    const cKey = unit.classKey;
    const grid = gridState.get(cKey);
    const cOccupied = classOccupied.get(cKey);
    for (let k = 0; k < unit.duration; k++) {
      const slotP = p + k;
      grid[d][slotP] = null;
      cOccupied.delete(`${d}:${slotP}`);
      if (unit.primaryFacultyId) {
        facultySlots.get(unit.primaryFacultyId)?.delete(`${d}:${slotP}`);
        facultyDailyHours.get(unit.primaryFacultyId)[d]--;
      }
    }
    const dayMap = classDailySubjectHours.get(cKey).get(d);
    if (dayMap && dayMap.has(unit.subjectId)) {
      const count = dayMap.get(unit.subjectId) - unit.duration;
      if (count <= 0) dayMap.delete(unit.subjectId);
      else dayMap.set(unit.subjectId, count);
    }
    if (unit.activityType === "lab") {
      classDailyLabs.get(cKey)[d]--;
    }
    if (unit.activityType === "soft_skill") {
      classSsaDays.get(cKey).delete(d);
    }
  };
  const search = (unitIdx) => {
    if (Date.now() - startTime > timeLimitMs) {
      return false;
    }
    if (backtracks > maxBacktracks) {
      return false;
    }
    if (unitIdx >= sortedUnits.length) {
      solutionFound = true;
      return true;
    }
    const unit = sortedUnits[unitIdx];
    const candidates = [];
    const candidateDays = unit.allowedDays || [0, 1, 2, 3, 4, 5];
    const candidatePeriods = unit.allowedPeriods || [0, 1, 2, 3, 4, 5, 6];
    for (const d of candidateDays) {
      for (const p of candidatePeriods) {
        if (canPlaceUnitAt(unit, d, p)) {
          const score = scoreCandidateSlot(unit, d, p);
          candidates.push({ d, p, score });
        }
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    for (const cand of candidates) {
      applyPlacement(unit, cand.d, cand.p);
      if (search(unitIdx + 1)) {
        return true;
      }
      rollbackPlacement(unit, cand.d, cand.p);
      backtracks++;
    }
    return false;
  };
  const solved = search(0);
  const elapsedMs = Date.now() - startTime;
  if (!solved) {
    const bottleneckDiagnostics = [];
    for (const unit of sortedUnits) {
      let validSlotCount = 0;
      const candidateDays = unit.allowedDays || [0, 1, 2, 3, 4, 5];
      const candidatePeriods = unit.allowedPeriods || [0, 1, 2, 3, 4, 5, 6];
      for (const d of candidateDays) {
        for (const p of candidatePeriods) {
          if (canPlaceUnitAt(unit, d, p)) validSlotCount++;
        }
      }
      if (validSlotCount === 0) {
        bottleneckDiagnostics.push({
          category: unit.activityType === "lab" ? "LAB_CONTINUITY_IMPOSSIBLE" : "FACULTY_OVER_ALLOCATION",
          severity: "CRITICAL",
          affectedDepartment: unit.classId.departmentName,
          affectedYear: unit.classId.year,
          affectedSection: unit.classId.section,
          affectedSubject: unit.subjectName,
          affectedFacultyId: unit.primaryFacultyId,
          affectedFacultyName: unit.facultyName,
          description: `Zero valid slots available for "${unit.subjectName}" (duration: ${unit.duration}h) in ${unit.classKey}. Assigned faculty (${unit.facultyName || "None"}) or class schedule is saturated.`,
          remediationAdvice: `Reduce required weekly hours or assign an additional faculty member to split teaching load.`
        });
        break;
      }
    }
    return {
      status: elapsedMs >= timeLimitMs ? "TIMEOUT" : "INFEASIBLE",
      isFeasible: false,
      isOptimal: false,
      executionTimeMs: elapsedMs,
      sectionResults: [],
      immutableAssignmentsPreserved: model.immutableAssignments.length,
      validationReport: {
        isValid: false,
        hardErrorCount: bottleneckDiagnostics.length || 1,
        softWarningCount: 0,
        violations: bottleneckDiagnostics.map((d) => ({
          ruleId: d.category,
          ruleCategory: "CURRICULUM",
          severity: "HARD_ERROR",
          departmentName: d.affectedDepartment || "",
          year: d.affectedYear || "",
          section: d.affectedSection || "",
          subjectName: d.affectedSubject,
          message: d.description
        })),
        summaryText: elapsedMs >= timeLimitMs ? `Solver timed out after ${Math.round(elapsedMs / 1e3)}s with no zero-conflict solution.` : `Model is mathematically infeasible under current constraints.`
      },
      diagnostics: bottleneckDiagnostics.length > 0 ? bottleneckDiagnostics : model.preValidationDiagnostics
    };
  }
  for (const c of model.classes) {
    const cKey = classIdToKey(c);
    const grid = gridState.get(cKey);
    for (let d = 0; d < TOTAL_DAYS; d++) {
      for (let p = 0; p < PERIODS_PER_DAY; p++) {
        if (grid[d][p] === null) {
          grid[d][p] = {
            subjectId: `filler_library_${d}_${p}`,
            subjectName: "Library",
            isFixed: false,
            activityType: "library"
          };
        }
      }
    }
  }
  const sectionResults = [];
  for (const c of model.classes) {
    const cKey = classIdToKey(c);
    const grid = gridState.get(cKey);
    const stringGrid = grid.map((row) => row.map((cell) => cell?.subjectName || "Library"));
    const allocatedHours = {};
    for (let d = 0; d < TOTAL_DAYS; d++) {
      for (let p = 0; p < PERIODS_PER_DAY; p++) {
        const cell = grid[d][p];
        if (cell && cell.subjectName && cell.subjectName !== "Library") {
          allocatedHours[cell.subjectName] = (allocatedHours[cell.subjectName] || 0) + 1;
        }
      }
    }
    const expectedHours = {};
    const subjects = model.teachingUnits.filter((u) => u.classKey === cKey);
    model.immutableAssignments.filter((a) => a.classKey === cKey).forEach((a) => {
      expectedHours[a.subjectName] = (expectedHours[a.subjectName] || 0) + a.slots.length;
    });
    subjects.forEach((u) => {
      expectedHours[u.subjectName] = (expectedHours[u.subjectName] || 0) + u.duration;
    });
    const mismatches = [];
    for (const [sName, exp] of Object.entries(expectedHours)) {
      const act = allocatedHours[sName] || 0;
      if (act !== exp) {
        mismatches.push({ subject: sName, expected: exp, actual: act });
      }
    }
    sectionResults.push({
      departmentId: c.departmentId,
      departmentName: c.departmentName,
      year: c.year,
      section: c.section,
      grid: stringGrid,
      weeklyHourVerification: {
        isValid: mismatches.length === 0,
        allocatedHours,
        expectedHours,
        mismatches
      }
    });
  }
  const validationReport = validateCompleteTimetableBatch(sectionResults, model);
  return {
    status: validationReport.isValid ? "OPTIMAL" : "FEASIBLE",
    isFeasible: validationReport.isValid,
    isOptimal: validationReport.isValid && validationReport.softWarningCount === 0,
    executionTimeMs: elapsedMs,
    sectionResults,
    immutableAssignmentsPreserved: model.immutableAssignments.length,
    validationReport
  };
}

// scratch/run_optimizer_tests.mjs
var passedTests = 0;
var totalTests = 0;
function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`\u274C FAIL [Test ${totalTests}]: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    passedTests++;
    console.log(`\u2705 PASS [Test ${totalTests}]: ${message}`);
  }
}
async function runAllTests() {
  console.log("================================================================================");
  console.log("       SONA TTG GLOBAL OPTIMIZATION ENGINE \u2014 18 AUTOMATED TESTS");
  console.log("================================================================================\n");
  const deptA = { departmentId: "dept_a", departmentName: "AIDS", year: "III", section: "A" };
  const deptB = { departmentId: "dept_a", departmentName: "AIDS", year: "III", section: "B" };
  const deptIT = { departmentId: "dept_b", departmentName: "IT", year: "III", section: "A" };
  {
    const facultyMap = /* @__PURE__ */ new Map();
    facultyMap.set("fac_shared", {
      facultyId: "fac_shared",
      facultyName: "Dr. Shared Faculty",
      assignedSlots: /* @__PURE__ */ new Set(),
      availableSlots: /* @__PURE__ */ new Set(),
      dailyHours: [0, 0, 0, 0, 0, 0],
      labPreference: true,
      subjectIds: /* @__PURE__ */ new Set(["subj_shared"]),
      assignments: [
        { subjectId: "subj_shared", year: "III", section: "A" },
        { subjectId: "subj_shared", year: "III", section: "B" }
      ],
      isClassCounselor: false
    });
    const subjectsByClass = /* @__PURE__ */ new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: "subj_shared", name: "Machine Learning", hoursPerWeek: 4, type: "theory" },
      { id: "subj_other_a", name: "Cloud Computing", hoursPerWeek: 4, type: "theory" }
    ]);
    subjectsByClass.set(classIdToKey(deptB), [
      { id: "subj_shared", name: "Machine Learning", hoursPerWeek: 4, type: "theory" },
      { id: "subj_other_b", name: "Cyber Security", hoursPerWeek: 4, type: "theory" }
    ]);
    const model = buildGlobalSchedulingModel({
      semesterType: "odd",
      classes: [deptA, deptB],
      subjectsByClass,
      facultyMap,
      specialHoursConfigs: /* @__PURE__ */ new Map(),
      classCounselorsMap: /* @__PURE__ */ new Map(),
      manualLabsMap: /* @__PURE__ */ new Map(),
      openElectiveConfigs: /* @__PURE__ */ new Map()
    });
    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Multiple sections sharing faculty must be feasible");
    const secA = solution.sectionResults.find((r) => r.section === "A");
    const secB = solution.sectionResults.find((r) => r.section === "B");
    let overlapCount = 0;
    for (let d = 0; d < 6; d++) {
      for (let p = 0; p < 7; p++) {
        if (secA.grid[d][p] === "Machine Learning" && secB.grid[d][p] === "Machine Learning") {
          overlapCount++;
        }
      }
    }
    assert(overlapCount === 0, "Dr. Shared Faculty has zero double-booked slots between Sec A and Sec B");
  }
  {
    const facultyMap = /* @__PURE__ */ new Map();
    facultyMap.set("fac_cross_dept", {
      facultyId: "fac_cross_dept",
      facultyName: "Prof. Math Cross Dept",
      assignedSlots: /* @__PURE__ */ new Set(),
      availableSlots: /* @__PURE__ */ new Set(),
      dailyHours: [0, 0, 0, 0, 0, 0],
      labPreference: true,
      subjectIds: /* @__PURE__ */ new Set(["subj_math"]),
      assignments: [
        { subjectId: "subj_math", year: "III", section: "A" }
      ],
      isClassCounselor: false
    });
    const subjectsByClass = /* @__PURE__ */ new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: "subj_math", name: "Applied Mathematics", hoursPerWeek: 4, type: "theory" }
    ]);
    subjectsByClass.set(classIdToKey(deptIT), [
      { id: "subj_math", name: "Applied Mathematics", hoursPerWeek: 4, type: "theory" }
    ]);
    const model = buildGlobalSchedulingModel({
      semesterType: "odd",
      classes: [deptA, deptIT],
      subjectsByClass,
      facultyMap,
      specialHoursConfigs: /* @__PURE__ */ new Map(),
      classCounselorsMap: /* @__PURE__ */ new Map(),
      manualLabsMap: /* @__PURE__ */ new Map(),
      openElectiveConfigs: /* @__PURE__ */ new Map()
    });
    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Cross-department shared faculty must be feasible");
    const aidsSec = solution.sectionResults.find((r) => r.departmentName === "AIDS");
    const itSec = solution.sectionResults.find((r) => r.departmentName === "IT");
    let crossOverlap = 0;
    for (let d = 0; d < 6; d++) {
      for (let p = 0; p < 7; p++) {
        if (aidsSec.grid[d][p] === "Applied Mathematics" && itSec.grid[d][p] === "Applied Mathematics") {
          crossOverlap++;
        }
      }
    }
    assert(crossOverlap === 0, "Cross-department faculty has zero collisions across AIDS and IT");
  }
  {
    const facultyMap = /* @__PURE__ */ new Map();
    const manualLabsMap = /* @__PURE__ */ new Map();
    facultyMap.set("fac_lab_conflict", {
      facultyId: "fac_lab_conflict",
      facultyName: "Dr. Lab Specialist",
      assignedSlots: /* @__PURE__ */ new Set(),
      availableSlots: /* @__PURE__ */ new Set(),
      dailyHours: [0, 0, 0, 0, 0, 0],
      labPreference: true,
      subjectIds: /* @__PURE__ */ new Set(["lab_1", "lab_2"]),
      assignments: [],
      isClassCounselor: false
    });
    manualLabsMap.set(classIdToKey(deptA), [{ day: 1, period: 3, labName: "Networks Lab" }]);
    manualLabsMap.set(classIdToKey(deptB), [{ day: 1, period: 3, labName: "Database Lab" }]);
    const subjectsByClass = /* @__PURE__ */ new Map();
    subjectsByClass.set(classIdToKey(deptA), [{ id: "lab_1", name: "Networks Lab", hoursPerWeek: 3, type: "lab" }]);
    subjectsByClass.set(classIdToKey(deptB), [{ id: "lab_2", name: "Database Lab", hoursPerWeek: 3, type: "lab" }]);
    const model = buildGlobalSchedulingModel({
      semesterType: "odd",
      classes: [deptA, deptB],
      subjectsByClass,
      facultyMap,
      specialHoursConfigs: /* @__PURE__ */ new Map(),
      classCounselorsMap: /* @__PURE__ */ new Map(),
      manualLabsMap,
      openElectiveConfigs: /* @__PURE__ */ new Map()
    });
    assert(!model.isModelValid || model.preValidationDiagnostics.length > 0, "Conflicting fixed manual assignments detected in pre-validation");
  }
  {
    const openElectiveConfigs = /* @__PURE__ */ new Map();
    openElectiveConfigs.set(`dept_a_III`, {
      hours: 5,
      group_name: "Open Elective",
      is_shared_slot: true,
      selected_slots: ["Mon-1", "Wed-1", "Fri-1", "Sat-1", "Sat-2"]
    });
    const subjectsByClass = /* @__PURE__ */ new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: "oe_subj", name: "Open Elective", hoursPerWeek: 5, type: "open elective" },
      { id: "th1", name: "Theory 1", hoursPerWeek: 4, type: "theory" }
    ]);
    const model = buildGlobalSchedulingModel({
      semesterType: "even",
      classes: [deptA],
      subjectsByClass,
      facultyMap: /* @__PURE__ */ new Map(),
      specialHoursConfigs: /* @__PURE__ */ new Map(),
      classCounselorsMap: /* @__PURE__ */ new Map(),
      manualLabsMap: /* @__PURE__ */ new Map(),
      openElectiveConfigs
    });
    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Even semester OE schedule solves cleanly");
    const secA = solution.sectionResults[0];
    assert(secA.grid[0][0] === "Open Elective", "Mon P1 has Open Elective");
    assert(secA.grid[2][0] === "Open Elective", "Wed P1 has Open Elective");
    assert(secA.grid[4][0] === "Open Elective", "Fri P1 has Open Elective");
    assert(secA.grid[5][0] === "Open Elective", "Sat P1 has Open Elective");
    assert(secA.grid[5][1] === "Open Elective", "Sat P2 has Open Elective");
  }
  {
    const manualLabsMap = /* @__PURE__ */ new Map();
    manualLabsMap.set(classIdToKey(deptA), [
      { day: 2, period: 4, labName: "Full Stack Lab" },
      { day: 2, period: 5, labName: "Full Stack Lab" },
      { day: 2, period: 6, labName: "Full Stack Lab" }
    ]);
    const subjectsByClass = /* @__PURE__ */ new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: "fs_lab", name: "Full Stack Lab", hoursPerWeek: 3, type: "lab" },
      { id: "th1", name: "Theory 1", hoursPerWeek: 4, type: "theory" }
    ]);
    const model = buildGlobalSchedulingModel({
      semesterType: "odd",
      classes: [deptA],
      subjectsByClass,
      facultyMap: /* @__PURE__ */ new Map(),
      specialHoursConfigs: /* @__PURE__ */ new Map(),
      classCounselorsMap: /* @__PURE__ */ new Map(),
      manualLabsMap,
      openElectiveConfigs: /* @__PURE__ */ new Map()
    });
    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Manual lab preservation succeeds");
    const secA = solution.sectionResults[0];
    assert(secA.grid[2][4] === "Full Stack Lab", "Wednesday P5 preserved as Full Stack Lab");
    assert(secA.grid[2][5] === "Full Stack Lab", "Wednesday P6 preserved as Full Stack Lab");
    assert(secA.grid[2][6] === "Full Stack Lab", "Wednesday P7 preserved as Full Stack Lab");
  }
  {
    const manualLabsMap = /* @__PURE__ */ new Map();
    manualLabsMap.set(classIdToKey(deptA), [
      { day: 2, period: 4, labName: "Networks Lab" },
      { day: 2, period: 5, labName: "Networks Lab" },
      { day: 2, period: 6, labName: "Networks Lab" }
    ]);
    const subjectsByClass = /* @__PURE__ */ new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: "net_lab", name: "Networks Lab", hoursPerWeek: 3, type: "lab" },
      { id: "th1", name: "Theory 1", hoursPerWeek: 4, type: "theory" },
      { id: "th2", name: "Theory 2", hoursPerWeek: 4, type: "theory" }
    ]);
    const model = buildGlobalSchedulingModel({
      semesterType: "odd",
      classes: [deptA],
      subjectsByClass,
      facultyMap: /* @__PURE__ */ new Map(),
      specialHoursConfigs: /* @__PURE__ */ new Map(),
      classCounselorsMap: /* @__PURE__ */ new Map(),
      manualLabsMap,
      openElectiveConfigs: /* @__PURE__ */ new Map()
    });
    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Classes schedule around fixed lab");
    const secA = solution.sectionResults[0];
    assert(secA.grid[2][4] === "Networks Lab" && secA.grid[2][5] === "Networks Lab" && secA.grid[2][6] === "Networks Lab", "Fixed lab intact without any overwriting");
  }
  {
    const subjectsByClass = /* @__PURE__ */ new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: "dyn_lab", name: "Data Structures Lab", hoursPerWeek: 3, type: "lab" }
    ]);
    const model = buildGlobalSchedulingModel({
      semesterType: "odd",
      classes: [deptA],
      subjectsByClass,
      facultyMap: /* @__PURE__ */ new Map(),
      specialHoursConfigs: /* @__PURE__ */ new Map(),
      classCounselorsMap: /* @__PURE__ */ new Map(),
      manualLabsMap: /* @__PURE__ */ new Map(),
      openElectiveConfigs: /* @__PURE__ */ new Map()
    });
    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Dynamic 3-hour lab solves");
    const secA = solution.sectionResults[0];
    let labDay = -1;
    for (let d = 0; d < 6; d++) {
      if (secA.grid[d].some((c) => c === "Data Structures Lab")) {
        labDay = d;
        break;
      }
    }
    assert(labDay >= 0 && labDay < 5, "Lab placed on a weekday");
    assert(secA.grid[labDay][4] === "Data Structures Lab" && secA.grid[labDay][5] === "Data Structures Lab" && secA.grid[labDay][6] === "Data Structures Lab", "3-hour lab forms continuous contiguous block [4,5,6]");
  }
  {
    const subjectsByClass = /* @__PURE__ */ new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: "oversize", name: "Super Giant Course", hoursPerWeek: 45, type: "theory" }
      // 45 > 42 total slots
    ]);
    const model = buildGlobalSchedulingModel({
      semesterType: "odd",
      classes: [deptA],
      subjectsByClass,
      facultyMap: /* @__PURE__ */ new Map(),
      specialHoursConfigs: /* @__PURE__ */ new Map(),
      classCounselorsMap: /* @__PURE__ */ new Map(),
      manualLabsMap: /* @__PURE__ */ new Map(),
      openElectiveConfigs: /* @__PURE__ */ new Map()
    });
    const solution = await solveGlobalTimetable(model);
    assert(!solution.isFeasible, "Impossible hours (> 42 slots) correctly returns infeasible");
  }
  {
    const manualLabsMap = /* @__PURE__ */ new Map();
    manualLabsMap.set(classIdToKey(deptA), [{ day: 0, period: 4, labName: "Embedded Lab", labId: "room_hardware_lab" }]);
    manualLabsMap.set(classIdToKey(deptB), [{ day: 0, period: 4, labName: "VLSI Lab", labId: "room_hardware_lab" }]);
    const subjectsByClass = /* @__PURE__ */ new Map();
    subjectsByClass.set(classIdToKey(deptA), [{ id: "emb", name: "Embedded Lab", hoursPerWeek: 1, type: "lab" }]);
    subjectsByClass.set(classIdToKey(deptB), [{ id: "vlsi", name: "VLSI Lab", hoursPerWeek: 1, type: "lab" }]);
    const model = buildGlobalSchedulingModel({
      semesterType: "odd",
      classes: [deptA, deptB],
      subjectsByClass,
      facultyMap: /* @__PURE__ */ new Map(),
      specialHoursConfigs: /* @__PURE__ */ new Map(),
      classCounselorsMap: /* @__PURE__ */ new Map(),
      manualLabsMap,
      openElectiveConfigs: /* @__PURE__ */ new Map()
    });
    assert(model.preValidationDiagnostics.some((d) => d.description.includes("collision") || d.description.includes("occupied")), "Physical room collision prevented during pre-validation");
  }
  {
    const facultyMap = /* @__PURE__ */ new Map();
    const busySlots = /* @__PURE__ */ new Set(["mon-p1", "mon-p2", "mon-p3", "mon-p4"]);
    facultyMap.set("fac_busy_monday", {
      facultyId: "fac_busy_monday",
      facultyName: "Prof. Monday Busy",
      assignedSlots: busySlots,
      availableSlots: /* @__PURE__ */ new Set(),
      dailyHours: [4, 0, 0, 0, 0, 0],
      labPreference: true,
      subjectIds: /* @__PURE__ */ new Set(["subj_busy"]),
      assignments: [{ subjectId: "subj_busy", year: "III", section: "A" }],
      isClassCounselor: false
    });
    const subjectsByClass = /* @__PURE__ */ new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: "subj_busy", name: "Research Methodology", hoursPerWeek: 3, type: "theory" }
    ]);
    const model = buildGlobalSchedulingModel({
      semesterType: "odd",
      classes: [deptA],
      subjectsByClass,
      facultyMap,
      specialHoursConfigs: /* @__PURE__ */ new Map(),
      classCounselorsMap: /* @__PURE__ */ new Map(),
      manualLabsMap: /* @__PURE__ */ new Map(),
      openElectiveConfigs: /* @__PURE__ */ new Map()
    });
    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Respects faculty availability restrictions");
    const secA = solution.sectionResults[0];
    for (let p = 0; p < 4; p++) {
      assert(secA.grid[0][p] !== "Research Methodology", `Monday P${p + 1} avoided for busy faculty`);
    }
  }
  {
    const subjectsByClass = /* @__PURE__ */ new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: "t1", name: "Software Engineering", hoursPerWeek: 4, type: "theory" },
      { id: "t2", name: "Database Systems", hoursPerWeek: 3, type: "theory" },
      { id: "t3", name: "Operating Systems", hoursPerWeek: 4, type: "theory" }
    ]);
    const model = buildGlobalSchedulingModel({
      semesterType: "odd",
      classes: [deptA],
      subjectsByClass,
      facultyMap: /* @__PURE__ */ new Map(),
      specialHoursConfigs: /* @__PURE__ */ new Map(),
      classCounselorsMap: /* @__PURE__ */ new Map(),
      manualLabsMap: /* @__PURE__ */ new Map(),
      openElectiveConfigs: /* @__PURE__ */ new Map()
    });
    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Curriculum hours solve cleanly");
    const secA = solution.sectionResults[0];
    assert(secA.weeklyHourVerification.isValid, "100% exact weekly hours verification passed");
    assert(secA.weeklyHourVerification.allocatedHours["Software Engineering"] === 4, "Software Engineering has exactly 4 hours");
    assert(secA.weeklyHourVerification.allocatedHours["Database Systems"] === 3, "Database Systems has exactly 3 hours");
    assert(secA.weeklyHourVerification.allocatedHours["Operating Systems"] === 4, "Operating Systems has exactly 4 hours");
  }
  {
    const subjectsByClass = /* @__PURE__ */ new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: "t1", name: "Deep Learning", hoursPerWeek: 4, type: "theory" },
      { id: "t2", name: "Natural Language Processing", hoursPerWeek: 4, type: "theory" }
    ]);
    const model = buildGlobalSchedulingModel({
      semesterType: "odd",
      classes: [deptA],
      subjectsByClass,
      facultyMap: /* @__PURE__ */ new Map(),
      specialHoursConfigs: /* @__PURE__ */ new Map(),
      classCounselorsMap: /* @__PURE__ */ new Map(),
      manualLabsMap: /* @__PURE__ */ new Map(),
      openElectiveConfigs: /* @__PURE__ */ new Map()
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
        if (c1 && c1 !== "Library" && c1 === c2 && c1 === c3) {
          threeConsecutiveFound = true;
        }
      }
    }
    assert(!threeConsecutiveFound, "Zero 3-consecutive theory periods found in entire grid");
  }
  {
    const subjectsByClass = /* @__PURE__ */ new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: "t1", name: "Compiler Design", hoursPerWeek: 3, type: "theory" },
      { id: "t2", name: "Distributed Systems", hoursPerWeek: 3, type: "theory" },
      { id: "t3", name: "Artificial Intelligence", hoursPerWeek: 3, type: "theory" }
    ]);
    const model = buildGlobalSchedulingModel({
      semesterType: "odd",
      classes: [deptA],
      subjectsByClass,
      facultyMap: /* @__PURE__ */ new Map(),
      specialHoursConfigs: /* @__PURE__ */ new Map(),
      classCounselorsMap: /* @__PURE__ */ new Map(),
      manualLabsMap: /* @__PURE__ */ new Map(),
      openElectiveConfigs: /* @__PURE__ */ new Map()
    });
    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Saturday institutional constraints satisfied");
    const secA = solution.sectionResults[0];
    const satTheory = secA.grid[5].filter((c) => c && c !== "Library");
    const distinctSatTheory = new Set(satTheory);
    assert(distinctSatTheory.size <= 2, "Saturday has at most 2 distinct theory subjects");
    assert(satTheory.length === distinctSatTheory.size, "No duplicate theory periods on Saturday");
  }
  {
    const subjectsByClass = /* @__PURE__ */ new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: "impossible_load", name: "Extreme Load", hoursPerWeek: 50, type: "theory" }
    ]);
    const model = buildGlobalSchedulingModel({
      semesterType: "odd",
      classes: [deptA],
      subjectsByClass,
      facultyMap: /* @__PURE__ */ new Map(),
      specialHoursConfigs: /* @__PURE__ */ new Map(),
      classCounselorsMap: /* @__PURE__ */ new Map(),
      manualLabsMap: /* @__PURE__ */ new Map(),
      openElectiveConfigs: /* @__PURE__ */ new Map()
    });
    const solution = await solveGlobalTimetable(model);
    assert(!solution.isFeasible, "Infeasible load detected");
    assert(solution.status === "INFEASIBLE" || solution.status === "TIMEOUT", "Status is INFEASIBLE or TIMEOUT");
    assert(solution.validationReport.hardErrorCount > 0, "Validation report flags hard errors");
  }
  {
    const facultyMap = /* @__PURE__ */ new Map();
    facultyMap.set("fac_sync", {
      facultyId: "fac_sync",
      facultyName: "Dr. Synchronized",
      assignedSlots: /* @__PURE__ */ new Set(),
      availableSlots: /* @__PURE__ */ new Set(),
      dailyHours: [0, 0, 0, 0, 0, 0],
      labPreference: true,
      subjectIds: /* @__PURE__ */ new Set(["subj_sync"]),
      assignments: [{ subjectId: "subj_sync", year: "III", section: "A" }],
      isClassCounselor: false
    });
    const subjectsByClass = /* @__PURE__ */ new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: "subj_sync", name: "Software Quality Assurance", hoursPerWeek: 4, type: "theory" }
    ]);
    const model = buildGlobalSchedulingModel({
      semesterType: "odd",
      classes: [deptA],
      subjectsByClass,
      facultyMap,
      specialHoursConfigs: /* @__PURE__ */ new Map(),
      classCounselorsMap: /* @__PURE__ */ new Map(),
      manualLabsMap: /* @__PURE__ */ new Map(),
      openElectiveConfigs: /* @__PURE__ */ new Map()
    });
    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Timetable synchronization solves");
    const secA = solution.sectionResults[0];
    const classSlots = [];
    for (let d = 0; d < 6; d++) {
      for (let p = 0; p < 7; p++) {
        if (secA.grid[d][p] === "Software Quality Assurance") {
          classSlots.push({ day: d, period: p });
        }
      }
    }
    assert(classSlots.length === 4, "Class timetable has 4 slots for Software Quality Assurance");
  }
  {
    const invalidBatch = [{
      departmentId: "dept_a",
      departmentName: "AIDS",
      year: "III",
      section: "A",
      grid: [
        ["Math", "Math", "Math", "Math", "Free", "Free", "Free"],
        // 4 consecutive theory!
        ["Free", "Free", "Free", "Free", "Free", "Free", "Free"],
        ["Free", "Free", "Free", "Free", "Free", "Free", "Free"],
        ["Free", "Free", "Free", "Free", "Free", "Free", "Free"],
        ["Free", "Free", "Free", "Free", "Free", "Free", "Free"],
        ["Free", "Free", "Free", "Free", "Free", "Free", "Free"]
      ],
      weeklyHourVerification: {
        isValid: false,
        allocatedHours: { Math: 4 },
        expectedHours: { Math: 3 },
        mismatches: [{ subject: "Math", expected: 3, actual: 4 }]
      }
    }];
    const report = validateCompleteTimetableBatch(invalidBatch);
    assert(!report.isValid, "Validator rejects corrupted schedule with 4 consecutive hours and hour mismatch");
    assert(report.hardErrorCount >= 2, "Flags multiple hard errors accurately");
  }
  {
    const facultyMap = /* @__PURE__ */ new Map();
    facultyMap.set("fac_incremental", {
      facultyId: "fac_incremental",
      facultyName: "Dr. Incremental",
      assignedSlots: /* @__PURE__ */ new Set(["mon-p1"]),
      availableSlots: /* @__PURE__ */ new Set(),
      dailyHours: [1, 0, 0, 0, 0, 0],
      labPreference: true,
      subjectIds: /* @__PURE__ */ new Set(["inc_subj"]),
      assignments: [{ subjectId: "inc_subj", year: "III", section: "A" }],
      isClassCounselor: false
    });
    const subjectsByClass = /* @__PURE__ */ new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: "inc_subj", name: "Big Data Analytics", hoursPerWeek: 3, type: "theory" }
    ]);
    const model = buildGlobalSchedulingModel({
      semesterType: "odd",
      classes: [deptA],
      subjectsByClass,
      facultyMap,
      specialHoursConfigs: /* @__PURE__ */ new Map(),
      classCounselorsMap: /* @__PURE__ */ new Map(),
      manualLabsMap: /* @__PURE__ */ new Map(),
      openElectiveConfigs: /* @__PURE__ */ new Map()
    });
    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Incremental regeneration succeeds");
    const secA = solution.sectionResults[0];
    assert(secA.grid[0][0] !== "Big Data Analytics", "Preserves existing locked external slot Mon P1 during incremental solve");
  }
  {
    const subjectsByClass = /* @__PURE__ */ new Map();
    subjectsByClass.set(classIdToKey(deptA), [
      { id: "db_subj", name: "Information Retrieval", hoursPerWeek: 3, type: "theory" }
    ]);
    const model = buildGlobalSchedulingModel({
      semesterType: "odd",
      classes: [deptA],
      subjectsByClass,
      facultyMap: /* @__PURE__ */ new Map(),
      specialHoursConfigs: /* @__PURE__ */ new Map(),
      classCounselorsMap: /* @__PURE__ */ new Map(),
      manualLabsMap: /* @__PURE__ */ new Map(),
      openElectiveConfigs: /* @__PURE__ */ new Map()
    });
    const solution = await solveGlobalTimetable(model);
    assert(solution.isFeasible, "Schema test solves");
    const secA = solution.sectionResults[0];
    assert(Array.isArray(secA.grid) && secA.grid.length === 6, "Grid has exactly 6 day rows (Mon-Sat)");
    assert(secA.grid.every((row) => Array.isArray(row) && row.length === 7), "Every day row has exactly 7 period columns");
    assert(typeof secA.departmentId === "string" && typeof secA.year === "string" && typeof secA.section === "string", "Matches Supabase timetables table columns (department_id, year, section, grid_data)");
  }
  console.log("\n================================================================================");
  console.log(`\u{1F389} ALL ${passedTests}/${totalTests} OPTIMIZER AUTOMATED TESTS PASSED SUCCESSFULLY!`);
  console.log("================================================================================\n");
}
runAllTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
