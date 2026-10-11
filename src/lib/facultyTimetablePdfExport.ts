import { loadPdfMake, triggerDownload, getFullDepartmentName, getDeptShortName } from "./timetablePdfExport";
import { FacultyWeeklyScheduleResult, getAllFacultySchedulesByDepartment, FacultyPeriodSlot } from "./facultyScheduleService";

export interface FacultyPdfOptions {
  academicYear?: string;
  semesterType?: 'odd' | 'even';
  departmentName?: string;
  hodName?: string;
  wefDate?: string;
  revision?: string;
  institutionName?: string;
  semesterTitle?: string;
}

const DAYS_SHORT = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * Builds the page definition array for a single faculty timetable in official Black & White format.
 */
export function buildFacultyPdfPageContent(
  schedule: FacultyWeeklyScheduleResult,
  options?: FacultyPdfOptions
): any[] {
  const fac = schedule.faculty;
  const semType = schedule.semesterType || options?.semesterType || 'odd';
  const deptName = options?.departmentName || fac.department_name || 'ENGINEERING';
  const fullDept = getFullDepartmentName(deptName);
  const deptShort = getDeptShortName(deptName);
  const acadYear = options?.academicYear || '2026 - 2027';
  const semLabel = semType === 'even' ? 'EVEN SEMESTER' : 'ODD SEMESTER';
  const hodName = options?.hodName || 'Dr.J.Akilandeswari';
  const wefDate = options?.wefDate || 'DD.MM.YYYY';
  const revision = options?.revision || '00';

  // ── 1. Top 5 Header Lines + Sub-header (Strictly Black & White) ────────
  const headerBlock: any[] = [
    {
      text: 'SONA COLLEGE OF TECHNOLOGY (Autonomous), SALEM-5',
      bold: true,
      fontSize: 12,
      alignment: 'center',
      margin: [0, 0, 0, 1]
    },
    {
      text: `DEPARTMENT OF ${fullDept.toUpperCase()}`,
      bold: true,
      fontSize: 10.5,
      alignment: 'center',
      margin: [0, 0, 0, 1]
    },
    {
      text: `ACADEMIC YEAR: ${acadYear}  |  ${semLabel}`,
      bold: true,
      fontSize: 10,
      alignment: 'center',
      margin: [0, 0, 0, 1]
    },
    {
      text: 'FACULTY INDIVIDUAL TIMETABLE',
      bold: true,
      fontSize: 10,
      alignment: 'center',
      margin: [0, 0, 0, 1]
    },
    {
      text: `${fac.name.toUpperCase()} (${(fac.designation || 'FACULTY').toUpperCase()})`,
      bold: true,
      fontSize: 10,
      decoration: 'underline',
      alignment: 'center',
      margin: [0, 0, 0, 3]
    },
    {
      table: {
        widths: ['*', '*'],
        body: [
          [
            { text: `Revision: ${revision}`, bold: true, fontSize: 9, alignment: 'left' },
            { text: `W.e.f.: ${wefDate}`, bold: true, fontSize: 9, alignment: 'right' }
          ]
        ]
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 4]
    }
  ];

  // ── 2. Timetable Grid Table (9 Columns: Day, P1-P4, LUNCH, P5-P7) ───────
  const gridRows: any[] = [
    // Header Row 1: Time, 1..4, Lunch (top: 12.55), 5..7
    [
      { text: 'Time', bold: true, alignment: 'center', fontSize: 9 },
      { text: '1', bold: true, alignment: 'center', fontSize: 9, border: [true, true, true, false] },
      { text: '2', bold: true, alignment: 'center', fontSize: 9, border: [true, true, true, false] },
      { text: '3', bold: true, alignment: 'center', fontSize: 9, border: [true, true, true, false] },
      { text: '4', bold: true, alignment: 'center', fontSize: 9, border: [true, true, true, false] },
      { text: '12.55', bold: true, alignment: 'center', fontSize: 8.5, border: [true, true, true, false] },
      { text: '5', bold: true, alignment: 'center', fontSize: 9, border: [true, true, true, false] },
      { text: '6', bold: true, alignment: 'center', fontSize: 9, border: [true, true, true, false] },
      { text: '7', bold: true, alignment: 'center', fontSize: 9, border: [true, true, true, false] }
    ],
    // Header Row 2: Day, time ranges, Lunch (bottom: to 1.55)
    [
      { text: 'Day', bold: true, alignment: 'center', fontSize: 9 },
      { text: '9:00 to 9:55', bold: true, fontSize: 8, alignment: 'center', border: [true, false, true, true] },
      { text: '9.55 to 10:50', bold: true, fontSize: 8, alignment: 'center', border: [true, false, true, true] },
      { text: '11:05 to 12:00', bold: true, fontSize: 8, alignment: 'center', border: [true, false, true, true] },
      { text: '12:00 to 12.55', bold: true, fontSize: 8, alignment: 'center', border: [true, false, true, true] },
      { text: 'to 1.55', bold: true, fontSize: 8, alignment: 'center', border: [true, false, true, true] },
      { text: '1.55 to 2:50', bold: true, fontSize: 8, alignment: 'center', border: [true, false, true, true] },
      { text: '2.50 to 03:45', bold: true, fontSize: 8, alignment: 'center', border: [true, false, true, true] },
      { text: '3.55 to 4:50', bold: true, fontSize: 8, alignment: 'center', border: [true, false, true, true] }
    ]
  ];

  // Helper to test if two slots are identical for merging
  const areSlotsEqual = (a: FacultyPeriodSlot | null, b: FacultyPeriodSlot | null): boolean => {
    if (!a || !b) return false;
    const classA = `${a.department_name}_${a.year}_${a.cleanSection || a.section}_${a.subject}`;
    const classB = `${b.department_name}_${b.year}_${b.cleanSection || b.section}_${b.subject}`;
    return classA === classB;
  };

  // Helper to format slot contents (Class to go to with Dept + Subject Name, NO subject code)
  const formatSlotCell = (slot: FacultyPeriodSlot, span = 1): any => {
    let deptShort = getDeptShortName(slot.department_name);
    if (!deptShort || deptShort === 'DEPT') {
      const c = (slot.code || '').toUpperCase();
      if (c.includes('ADS') || c.includes('AID')) deptShort = 'AI&DS';
      else if (c.includes('IT')) deptShort = 'IT';
      else if (c.includes('CSE') || c.includes('CS')) deptShort = 'CSE';
      else if (c.includes('ECE') || c.includes('EC')) deptShort = 'ECE';
      else if (c.includes('EEE') || c.includes('EE')) deptShort = 'EEE';
      else if (c.includes('MECH') || c.includes('ME')) deptShort = 'MECH';
      else if (c.includes('CIVIL') || c.includes('CE')) deptShort = 'CIVIL';
    }
    const deptPart = deptShort && deptShort !== 'DEPT' ? ` ${deptShort}` : '';
    const ccSuffix = slot.is_counselor_hour ? ' (CC)' : '';
    const extSuffix = slot.is_external ? ' (Ext)' : '';
    const classInfo = `Yr ${slot.year}${deptPart} - Sec ${slot.cleanSection || slot.section}${ccSuffix}${extSuffix}`;
    const subjectName = slot.subject || slot.rawCellText || '';

    const cellObj: any = {
      text: [
        { text: `${classInfo}\n`, bold: true, fontSize: 7.5 },
        { text: subjectName, bold: false, fontSize: 7 }
      ],
      alignment: 'center'
    };

    if (span > 1) {
      cellObj.colSpan = span;
    }
    return cellObj;
  };

  // Build grid day by day
  for (let d = 0; d < 6; d++) {
    const dayName = DAYS_SHORT[d];
    const dayRow = schedule.grid[d] || [];

    // Merging consecutive identical slots for morning (P1..P4 -> indices 0..3)
    const buildMergedBlock = (startIndex: number, endIndex: number): any[] => {
      const cells: any[] = [];
      let i = startIndex;
      while (i <= endIndex) {
        const currentSlot = dayRow[i];
        if (!currentSlot) {
          cells.push({ text: '', alignment: 'center', fontSize: 8 });
          i++;
          continue;
        }

        let span = 1;
        while (i + span <= endIndex && areSlotsEqual(currentSlot, dayRow[i + span])) {
          span++;
        }

        cells.push(formatSlotCell(currentSlot, span));
        for (let s = 1; s < span; s++) {
          cells.push({});
        }
        i += span;
      }
      return cells;
    };

    const morningCells = buildMergedBlock(0, 3);
    const afternoonCells = buildMergedBlock(4, 6);

    const rowCells: any[] = [
      { text: dayName, bold: true, alignment: 'center', fontSize: 8.5 },
      ...morningCells,
      d === 0
        ? { text: 'L\n\nU\n\nN\n\nC\n\nH', rowSpan: 6, bold: true, alignment: 'center', fontSize: 8.5 }
        : {},
      ...afternoonCells
    ];

    gridRows.push(rowCells);
  }

  const timetableGridTable = {
    table: {
      headerRows: 2,
      widths: [48, '*', '*', '*', '*', 45, '*', '*', '*'],
      body: gridRows
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => '#000000',
      vLineColor: () => '#000000',
      paddingLeft: () => 2,
      paddingRight: () => 2,
      paddingTop: () => 3,
      paddingBottom: () => 3
    },
    margin: [0, 0, 0, 5]
  };

  // ── 3. Teaching Load / Subjects Legend Table (Pure B&W) ─────────────────
  const legendRows: any[][] = [
    [
      { text: 'SL.NO', bold: true, alignment: 'center', fontSize: 8 },
      { text: 'COURSE CODE', bold: true, alignment: 'center', fontSize: 8 },
      { text: 'COURSE / ACTIVITY TITLE', bold: true, alignment: 'center', fontSize: 8 },
      { text: 'CLASS & SECTION', bold: true, alignment: 'center', fontSize: 8 },
      { text: 'HOURS / WEEK', bold: true, alignment: 'center', fontSize: 8 }
    ]
  ];

  let slNo = 1;
  schedule.subjectsSummary.forEach((subj) => {
    legendRows.push([
      { text: String(slNo++), alignment: 'center', fontSize: 8 },
      { text: subj.code || '–', alignment: 'center', fontSize: 8 },
      { text: subj.name, alignment: 'left', fontSize: 8 },
      { text: subj.classes.join(', ') || '–', alignment: 'center', fontSize: 8 },
      { text: String(subj.hoursCount), alignment: 'center', bold: true, fontSize: 8 }
    ]);
  });

  // Total Load footer row (Pure B&W)
  legendRows.push([
    { text: 'TOTAL TEACHING & SPECIAL LOAD', colSpan: 4, bold: true, alignment: 'right', fontSize: 8.5 },
    {}, {}, {},
    { text: `${schedule.totalHours} HRS / WEEK`, bold: true, alignment: 'center', fontSize: 8.5 }
  ]);

  const legendTable = {
    table: {
      headerRows: 1,
      widths: [32, 75, '*', 140, 70],
      body: legendRows
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => '#000000',
      vLineColor: () => '#000000',
      paddingLeft: () => 4,
      paddingRight: () => 4,
      paddingTop: () => 2,
      paddingBottom: () => 2
    },
    margin: [0, 0, 0, 10]
  };

  // ── 4. Signatures (Strictly 2 Signatures ONLY: Faculty & HOD) ───────────
  const signaturesBlock = {
    unbreakable: true,
    margin: [0, 18, 0, 0],
    table: {
      widths: ['*', '*'],
      body: [
        [
          {
            text: [
              { text: 'FACULTY SIGNATURE\n', bold: true, fontSize: 9 },
              { text: fac.name.toUpperCase(), bold: true, fontSize: 8.5 }
            ],
            alignment: 'center'
          },
          {
            text: [
              { text: `HOD / ${deptShort}\n`, bold: true, fontSize: 9 },
              { text: hodName.toUpperCase(), bold: true, fontSize: 8.5 }
            ],
            alignment: 'center'
          }
        ]
      ]
    },
    layout: 'noBorders',
    dontBreakRows: true
  };

  return [
    ...headerBlock,
    timetableGridTable,
    legendTable,
    signaturesBlock
  ];
}

/**
 * Exports one or more faculty weekly schedules to a single formal Black & White PDF.
 */
export async function exportFacultyTimetablesToPdf(
  schedules: FacultyWeeklyScheduleResult[],
  fileName?: string,
  options?: FacultyPdfOptions
): Promise<void> {
  if (!schedules || schedules.length === 0) {
    throw new Error('No faculty schedules available to export.');
  }

  const { pdfMake, pdfMakeModule, fonts, vfs } = await loadPdfMake();

  const content: any[] = [];
  schedules.forEach((schedule, index) => {
    const pageContent = buildFacultyPdfPageContent(schedule, options);
    content.push(...pageContent);
    if (index < schedules.length - 1) {
      content.push({ text: '', pageBreak: 'after' });
    }
  });

  const defaultFileName = schedules.length === 1
    ? `Faculty_Timetable_${schedules[0].faculty.name.replace(/\s+/g, '_')}_${(schedules[0].semesterType || 'ODD').toUpperCase()}.pdf`
    : `All_Faculty_Timetables_${(options?.departmentName || 'Department').replace(/\s+/g, '_')}_${(options?.semesterType || 'ODD').toUpperCase()}.pdf`;

  const finalFileName = fileName || defaultFileName;

  const docDefinition: any = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [26, 12, 26, 12],
    content,
    defaultStyle: {
      color: '#000000',
      font: fonts?.Times ? 'Times' : 'Roboto'
    }
  };

  const createPdfFn = typeof pdfMake.createPdf === 'function'
    ? pdfMake.createPdf.bind(pdfMake)
    : (pdfMakeModule as any).createPdf || (pdfMakeModule as any).default?.createPdf;

  if (!createPdfFn) {
    throw new Error('pdfMake.createPdf is not available');
  }

  const pdfDoc = createPdfFn(docDefinition, undefined, fonts, vfs);
  await triggerDownload(pdfDoc, finalFileName);
}

/**
 * Batch downloads all faculty timetables for a department in one click.
 * Supports passing either departmentId (string) or an existing array of schedules.
 */
export async function exportDepartmentAllFacultyTimetables(
  deptIdOrSchedules: string | FacultyWeeklyScheduleResult[],
  departmentName?: string,
  semesterType: 'odd' | 'even' = 'odd',
  options?: FacultyPdfOptions
): Promise<number> {
  let schedules: FacultyWeeklyScheduleResult[] = [];
  if (Array.isArray(deptIdOrSchedules)) {
    schedules = deptIdOrSchedules;
  } else {
    schedules = await getAllFacultySchedulesByDepartment(deptIdOrSchedules, semesterType);
  }

  if (schedules.length === 0) {
    return 0;
  }

  const resolvedDeptName = departmentName || schedules[0]?.faculty?.department_name || 'Department';

  await exportFacultyTimetablesToPdf(schedules, undefined, {
    ...options,
    departmentName: resolvedDeptName,
    semesterType,
  });

  return schedules.length;
}
