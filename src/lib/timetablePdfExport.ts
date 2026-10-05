import { getClassCounselor, getFacultyById } from "./supabaseService";

export interface TimetableExportSubject {
  id?: string;
  code?: string;
  name: string;
  abbreviation?: string;
  type?: string;
  hoursPerWeek?: number;
  staff?: string;
  isElectiveGroup?: boolean;
}

export interface TimetableExportClassItem {
  departmentName: string;
  year: string;
  section: string;
  grid: string[][];
  counselorName?: string | null;
  departmentId?: string;
  subjects?: TimetableExportSubject[];
  specialHours?: Array<{
    name?: string;
    title?: string;
    type?: string;
    hours?: number;
    faculty_id?: string;
    staff?: string;
  }>;
  wefDate?: string;
  revision?: string;
  timetableIncharge?: string;
  hodName?: string;
  principalName?: string;
  academicYear?: string;
  semesterType?: 'odd' | 'even';
}

export interface TimetablePdfOptions {
  wefDate?: string;
  revision?: string;
  timetableIncharge?: string;
  counselorName?: string;
  hodName?: string;
  principalName?: string;
  academicYear?: string;
  semesterType?: 'odd' | 'even';
}

const DAYS_SHORT = ["MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

const parseYearOrder = (year: string | number | undefined | null): number => {
  if (year === null || year === undefined) return 1;
  if (typeof year === "number") return year;
  const s = String(year).trim().toUpperCase();
  const directMap: Record<string, number> = {
    "1": 1, "I": 1, "FIRST": 1, "1ST": 1,
    "2": 2, "II": 2, "SECOND": 2, "2ND": 2,
    "3": 3, "III": 3, "THIRD": 3, "3RD": 3,
    "4": 4, "IV": 4, "FOURTH": 4, "4TH": 4,
  };
  if (directMap[s] !== undefined) return directMap[s];
  const matchNum = s.match(/\d+/);
  if (matchNum) return parseInt(matchNum[0], 10);
  const matchRoman = s.match(/\b(IV|III|II|I)\b/i);
  if (matchRoman && directMap[matchRoman[1].toUpperCase()]) {
    return directMap[matchRoman[1].toUpperCase()];
  }
  return 1;
};

export function getSemesterRoman(year: string, semesterType: 'odd' | 'even' = 'odd'): string {
  const y = parseYearOrder(year);
  if (semesterType === 'even') {
    if (y === 1) return 'II';
    if (y === 2) return 'IV';
    if (y === 3) return 'VI';
    if (y === 4) return 'VIII';
  } else {
    if (y === 1) return 'I';
    if (y === 2) return 'III';
    if (y === 3) return 'V';
    if (y === 4) return 'VII';
  }
  return String(year);
}

export function getDeptShortName(deptName: string): string {
  const n = (deptName || '').toLowerCase().trim();
  if (n.includes('information tech') || n === 'it') return 'IT';
  if (n.includes('artificial intelligence') || n.includes('ai&ds') || n.includes('aids') || n.includes('ad')) return 'AI&DS';
  if (n.includes('computer science') || n === 'cse') return 'CSE';
  if (n.includes('mechanical') || n === 'mech') return 'MECH';
  if (n.includes('civil')) return 'CIVIL';
  if (n.includes('electrical') || n === 'eee') return 'EEE';
  if (n.includes('electronics') || n === 'ece') return 'ECE';
  if (n.includes('fashion') || n === 'ft') return 'FT';
  if (n.includes('mechatronics') || n === 'mct') return 'MCT';
  return deptName.split(' ').map(w => w[0]).join('').toUpperCase() || 'DEPT';
}

export function getDegreeTitle(deptName: string): string {
  const n = (deptName || '').toUpperCase().trim();
  if (n.startsWith('B TECH') || n.startsWith('B.TECH') || n.startsWith('B E') || n.startsWith('B.E')) {
    return n;
  }
  if (n.includes('ARTIFICIAL INTELLIGENCE')) {
    return 'B TECH ARTIFICIAL INTELLIGENCE AND DATA SCIENCE';
  }
  if (n.includes('INFORMATION')) {
    return 'B TECH INFORMATION TECHNOLOGY';
  }
  return `B TECH ${n}`;
}

export function resolveSubjectAbbreviation(
  rawName: string,
  subjects: TimetableExportSubject[] = []
): string {
  if (!rawName) return '';
  const cleaned = rawName.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const lower = cleaned.toLowerCase();

  // Special predefined checks
  if (lower.includes('open elective')) return 'OE';
  if (lower.includes('student counsel') || lower.includes('counselling') || lower.includes('counselor')) return 'SC';
  if (lower === 'seminar' || lower.includes('seminar')) return 'SEM';
  if (lower === 'library' || lower.includes('library')) return 'LIB';
  if (lower.includes('mini proj')) return 'MINI PROJ';

  // Check matching subject in subjects array
  const matched = subjects.find(
    s => s.name?.toLowerCase().trim() === lower || s.code?.toLowerCase().trim() === lower
  );
  if (matched?.abbreviation && matched.abbreviation.trim()) {
    return matched.abbreviation.trim();
  }

  // Known standard course abbreviations
  const knownMap: Record<string, string> = {
    'generative ai': 'GAI',
    'generative ai laboratory': 'GAI LAB',
    'generative ai lab laboratory': 'GAI LAB',
    'generative ai lab': 'GAI LAB',
    'data engineering': 'DE',
    'data engineering laboratory': 'DE LAB',
    'data engineering lab': 'DE LAB',
    'software quality assurance': 'SQA',
    'total quality management': 'TQM',
    'professional ethics and human values': 'PE',
    'professional ethics': 'PE',
    'computer networks': 'CN',
    'database management systems': 'DBMS',
    'database management systems lab': 'DBMS LAB',
    'database management systems laboratory': 'DBMS LAB',
    'theory of computation': 'TOC',
    'mobile application development lab': 'MAD LAB',
    'mobile application development laboratory': 'MAD LAB',
    'internet of things laboratory': 'IOT LAB',
    'internet of things lab': 'IOT LAB',
    'elective- nptel internet of things': 'NPTEL (IOT)',
    'nptel internet of things': 'NPTEL (IOT)',
    'computer architecture': 'CA',
    'digital logic design': 'DLD',
    'digital logic design lab': 'DLD LAB',
    'object oriented programming in c++': 'C++',
    'programming in c++ laboratory': 'C++ LAB',
    'communication skills laboratory': 'CS LAB',
    'applied probability and statistics': 'AP&S I',
    'applied probability and statistics -i': 'AP&S I',
    'data structures': 'DS',
    'data structures laboratory': 'DS LAB',
    'soft skills and aptitude - i': 'SSA I(AP)',
    'soft skills and aptitude - iii': 'SSA 3 (AP)',
  };

  if (knownMap[lower]) return knownMap[lower];

  // If already short abbreviation
  if (cleaned.length <= 8 && !cleaned.includes(' ')) {
    return cleaned.toUpperCase();
  }

  // Handle Lab
  if (/lab|laboratory/i.test(cleaned)) {
    const withoutLab = cleaned.replace(/laboratory|lab/gi, '').trim();
    const initials = withoutLab
      .split(/\s+/)
      .filter(w => w.length > 0 && !/and|of|the|in/i.test(w))
      .map(w => w[0].toUpperCase())
      .join('');
    return `${initials || 'PRACT'} LAB`;
  }

  // Handle Electives
  if (/^elective\s*[-:]?\s*/i.test(cleaned)) {
    const rest = cleaned.replace(/^elective\s*[-:]?\s*/i, '').trim();
    const initials = rest
      .split(/\s+/)
      .filter(w => w.length > 0 && !/and|of|the|in/i.test(w))
      .map(w => w[0].toUpperCase())
      .join('');
    return initials || 'ELEC';
  }

  // Fallback: Initial letters
  const words = cleaned.split(/\s+/).filter(w => w.length > 0 && !/and|of|the|in|for/i.test(w));
  if (words.length > 1) {
    return words.map(w => w[0].toUpperCase()).join('');
  }

  return cleaned.substring(0, 6).toUpperCase();
}

async function loadPdfMake() {
  const pdfMakeModule = await import('pdfmake/build/pdfmake');
  const pdfMake: any = pdfMakeModule.default || pdfMakeModule;
  const vfsFonts: any = await import('pdfmake/build/vfs_fonts');

  if (typeof pdfMake.addVirtualFileSystem === 'function') {
    pdfMake.addVirtualFileSystem(vfsFonts);
  } else if (vfsFonts?.pdfMake?.vfs) {
    pdfMake.vfs = vfsFonts.pdfMake.vfs;
  } else if ((vfsFonts as any).default?.pdfMake?.vfs) {
    pdfMake.vfs = (vfsFonts as any).default.pdfMake.vfs;
  } else {
    pdfMake.vfs = vfsFonts.default || vfsFonts;
  }

  return { pdfMake, pdfMakeModule };
}

function triggerDownload(pdfMake: any, pdfMakeModule: any, docDefinition: any, fileName: string) {
  if (typeof pdfMake.createPdf === 'function') {
    pdfMake.createPdf(docDefinition).download(fileName);
  } else {
    const createPdfFn = (pdfMakeModule as any).createPdf || (pdfMakeModule as any).default?.createPdf;
    if (createPdfFn) {
      createPdfFn(docDefinition).download(fileName);
    } else {
      throw new Error('pdfMake.createPdf is not available');
    }
  }
}

/**
 * Builds the formal college timetable PDF content matching the Sona College official template
 */
function buildCollegeClassPdfContent(
  item: TimetableExportClassItem,
  options?: TimetablePdfOptions
): any[] {
  const subjects = item.subjects || [];
  const counselorName = options?.counselorName || item.counselorName || 'Class Counselor';
  const timetableIncharge = options?.timetableIncharge || item.timetableIncharge || 'Mr. P.Dineshkumar';
  const hodName = options?.hodName || item.hodName || 'Dr.J.Akilandeswari';
  const principalName = options?.principalName || item.principalName || 'Dr.S.R.R.Senthil Kumar';
  const wefDate = options?.wefDate || item.wefDate || '29.06.2026';
  const revision = options?.revision || item.revision || '00';
  const semesterType = options?.semesterType || item.semesterType || 'odd';
  const academicYear = options?.academicYear || item.academicYear || '2026 - 2027';

  const deptShort = getDeptShortName(item.departmentName);
  const romanSem = getSemesterRoman(item.year, semesterType);
  const degreeTitle = getDegreeTitle(item.departmentName);

  // ── 1. Document Header Block ──────────────────────────────────────────
  const headerBlock: any[] = [
    {
      text: 'SONA COLLEGE OF TECHNOLOGY (Autonomous), SALEM-5',
      bold: true,
      fontSize: 11,
      alignment: 'center',
      margin: [0, 0, 0, 1.5]
    },
    {
      text: `DEPARTMENT OF ${(item.departmentName || 'INFORMATION TECHNOLOGY').toUpperCase()}`,
      bold: true,
      fontSize: 10.5,
      alignment: 'center',
      margin: [0, 0, 0, 1.5]
    },
    {
      text: degreeTitle,
      bold: true,
      fontSize: 10,
      alignment: 'center',
      margin: [0, 0, 0, 1.5]
    },
    {
      text: `TIME TABLE FOR ${semesterType.toUpperCase()} SEM (${academicYear})`,
      bold: true,
      fontSize: 10,
      alignment: 'center',
      margin: [0, 0, 0, 1.5]
    },
    {
      text: `${romanSem} SEM - ${(item.section || 'A').toUpperCase()} SEC`,
      bold: true,
      fontSize: 10,
      alignment: 'center',
      margin: [0, 0, 0, 5]
    },
  ];

  // ── 2. Revision & W.e.f Sub-header ────────────────────────────────────
  const subHeaderTable = {
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
  };

  // ── 3. Timetable Grid Table (9 Columns: Day, P1-P4, LUNCH, P5-P7) ───────
  const gridRows: any[] = [
    // Header Row 1
    [
      { text: 'Time', bold: true, alignment: 'center', fontSize: 8.5 },
      { text: '1', bold: true, alignment: 'center', fontSize: 8.5 },
      { text: '2', bold: true, alignment: 'center', fontSize: 8.5 },
      { text: '3', bold: true, alignment: 'center', fontSize: 8.5 },
      { text: '4', bold: true, alignment: 'center', fontSize: 8.5 },
      { text: '12.55 to\n1.55', bold: true, alignment: 'center', fontSize: 7.5, rowSpan: 2 },
      { text: '5', bold: true, alignment: 'center', fontSize: 8.5 },
      { text: '6', bold: true, alignment: 'center', fontSize: 8.5 },
      { text: '7', bold: true, alignment: 'center', fontSize: 8.5 }
    ],
    // Header Row 2
    [
      { text: 'Day', bold: true, alignment: 'center', fontSize: 8.5 },
      { text: '9:00 to 9:55', fontSize: 7.5, alignment: 'center' },
      { text: '9.55 to 10:50', fontSize: 7.5, alignment: 'center' },
      { text: '11:05 to 12:00', fontSize: 7.5, alignment: 'center' },
      { text: '12:00 to 12.55', fontSize: 7.5, alignment: 'center' },
      {}, // empty for rowSpan
      { text: '1.55 to 2:50', fontSize: 7.5, alignment: 'center' },
      { text: '2.50 to 03:45', fontSize: 7.5, alignment: 'center' },
      { text: '3.55 to 4:50', fontSize: 7.5, alignment: 'center' }
    ]
  ];

  const safeGrid = Array.isArray(item.grid) ? item.grid : [];

  for (let dayIdx = 0; dayIdx < 6; dayIdx++) {
    const rawRow = Array.isArray(safeGrid[dayIdx]) ? safeGrid[dayIdx] : [];
    const dayLabel = DAYS_SHORT[dayIdx] || `DAY ${dayIdx + 1}`;

    // Map the 7 periods to abbreviations
    const abbreviations: string[] = [];
    for (let p = 0; p < 7; p++) {
      const cellVal = rawRow[p] || '';
      abbreviations.push(resolveSubjectAbbreviation(cellVal, subjects));
    }

    // Helper to merge consecutive identical slots within a range [start..end]
    const buildMergedCells = (startIdx: number, endIdx: number): any[] => {
      const cells: any[] = [];
      let i = startIdx;
      while (i <= endIdx) {
        const current = abbreviations[i];
        let span = 1;
        if (current) {
          while (i + span <= endIdx && abbreviations[i + span] === current) {
            span++;
          }
        }

        if (span > 1) {
          cells.push({
            text: current,
            colSpan: span,
            bold: true,
            fontSize: 8.5,
            alignment: 'center'
          });
          for (let s = 1; s < span; s++) {
            cells.push({});
          }
          i += span;
        } else {
          cells.push({
            text: current || '',
            bold: true,
            fontSize: 8.5,
            alignment: 'center'
          });
          i++;
        }
      }
      return cells;
    };

    const morningCells = buildMergedCells(0, 3); // periods 0..3 (P1..P4)
    const afternoonCells = buildMergedCells(4, 6); // periods 4..6 (P5..P7)

    const rowCells: any[] = [
      { text: dayLabel, bold: true, fontSize: 8.5, alignment: 'center' },
      ...morningCells,
      dayIdx === 0
        ? { text: 'L\n\nU\n\nN\n\nC\n\nH', rowSpan: 6, bold: true, alignment: 'center', fontSize: 8, margin: [0, 4, 0, 0] }
        : {},
      ...afternoonCells
    ];

    gridRows.push(rowCells);
  }

  const timetableGridTable = {
    table: {
      headerRows: 2,
      widths: [44, '*', '*', '*', '*', 22, '*', '*', '*'],
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
    margin: [0, 0, 0, 8]
  };

  // ── 4. Subjects & Faculty Legend Table ─────────────────────────────────
  const legendRows: any[] = [
    // Header Row
    [
      { text: 'SUB. CODE', bold: true, alignment: 'center', fontSize: 8.5 },
      { text: 'Abbreviation', bold: true, alignment: 'center', fontSize: 8.5 },
      { text: 'COURSE TITLE', bold: true, alignment: 'center', fontSize: 8.5 },
      { text: 'NO. OF HRS', bold: true, alignment: 'center', fontSize: 8.5 },
      { text: 'STAFF INCHARGE', bold: true, alignment: 'center', fontSize: 8.5 }
    ]
  ];

  // Helper to detect if a subject is a special hour
  const isSpecialSubject = (s: TimetableExportSubject): boolean => {
    const code = (s.code || '').trim().toUpperCase();
    const name = (s.name || '').trim().toLowerCase();
    const type = (s.type || '').trim().toLowerCase();
    const abbr = (s.abbreviation || '').trim().toUpperCase();

    if (type.includes('special')) return true;
    if (abbr === 'SC' || abbr === 'SEM' || abbr === 'LIB') return true;
    if (code === 'SC' || code === 'SEM' || code === 'LIB') return true;
    if (name.includes('library') || name.includes('seminar') || name.includes('counsel') || name.includes('counselling') || name.includes('mentor')) return true;
    return false;
  };

  // Segregate theory vs practical vs open elective vs special
  const theorySubjects: TimetableExportSubject[] = [];
  const practicalSubjects: TimetableExportSubject[] = [];
  const openElectiveSubjects: TimetableExportSubject[] = [];

  subjects.forEach(s => {
    if (isSpecialSubject(s)) {
      // Exclude from theory and practical; will be rendered deduplicated under special hours
      return;
    }
    const t = (s.type || '').toLowerCase();
    const nameLower = (s.name || '').toLowerCase();
    if (t.includes('open elective') || nameLower.includes('open elective')) {
      openElectiveSubjects.push(s);
    } else if (t.includes('lab') || t.includes('practical') || nameLower.includes('lab') || nameLower.includes('laboratory')) {
      practicalSubjects.push(s);
    } else {
      theorySubjects.push(s);
    }
  });

  // Sort Theory subjects by hoursPerWeek descending (highest hr to lowest)
  theorySubjects.sort((a, b) => {
    const diff = (b.hoursPerWeek || 0) - (a.hoursPerWeek || 0);
    if (diff !== 0) return diff;
    return (a.name || '').localeCompare(b.name || '');
  });

  // Practical subjects sorted by hours descending
  practicalSubjects.sort((a, b) => {
    const diff = (b.hoursPerWeek || 0) - (a.hoursPerWeek || 0);
    if (diff !== 0) return diff;
    return (a.name || '').localeCompare(b.name || '');
  });

  // Build deduplicated Special Hours map (SC, SEM, LIB)
  const specialMap: Record<string, { abbr: string; title: string; hours: string; staff: string }> = {
    SC: { abbr: 'SC', title: 'Student Counseling', hours: '2', staff: counselorName },
    SEM: { abbr: 'SEM', title: 'Seminar', hours: '2', staff: counselorName },
    LIB: { abbr: 'LIB', title: 'Library', hours: '4', staff: counselorName }
  };

  // Merge special hours from subjects if present
  subjects.forEach(s => {
    if (isSpecialSubject(s)) {
      const abbr = (s.abbreviation || resolveSubjectAbbreviation(s.name, subjects)).toUpperCase();
      const staffVal = s.staff && s.staff !== '-' && s.staff !== '—' ? s.staff : counselorName;
      if (abbr.includes('LIB') || s.name.toLowerCase().includes('library')) {
        specialMap.LIB = {
          abbr: 'LIB',
          title: 'Library',
          hours: s.hoursPerWeek ? String(s.hoursPerWeek) : (specialMap.LIB.hours || '4'),
          staff: staffVal
        };
      } else if (abbr.includes('SEM') || s.name.toLowerCase().includes('seminar')) {
        specialMap.SEM = {
          abbr: 'SEM',
          title: 'Seminar',
          hours: s.hoursPerWeek ? String(s.hoursPerWeek) : (specialMap.SEM.hours || '2'),
          staff: staffVal
        };
      } else if (abbr.includes('SC') || s.name.toLowerCase().includes('counsel')) {
        specialMap.SC = {
          abbr: 'SC',
          title: 'Student Counseling',
          hours: s.hoursPerWeek ? String(s.hoursPerWeek) : (specialMap.SC.hours || '2'),
          staff: staffVal
        };
      }
    }
  });

  // Merge special hours from item.specialHours
  (item.specialHours || []).forEach(sp => {
    const rawTitle = sp.title || sp.name || '';
    const nameLower = rawTitle.toLowerCase();
    const staffVal = sp.staff && sp.staff !== '-' && sp.staff !== '—' ? sp.staff : counselorName;
    const hoursVal = sp.hours ? String(sp.hours) : undefined;

    if (nameLower.includes('library') || rawTitle.toUpperCase().includes('LIB')) {
      specialMap.LIB.staff = staffVal || specialMap.LIB.staff;
      if (hoursVal) specialMap.LIB.hours = hoursVal;
    } else if (nameLower.includes('seminar') || rawTitle.toUpperCase().includes('SEM')) {
      specialMap.SEM.staff = staffVal || specialMap.SEM.staff;
      if (hoursVal) specialMap.SEM.hours = hoursVal;
    } else if (nameLower.includes('counsel') || rawTitle.toUpperCase().includes('SC')) {
      specialMap.SC.staff = staffVal || specialMap.SC.staff;
      if (hoursVal) specialMap.SC.hours = hoursVal;
    }
  });

  const specialRowsToRender = [
    specialMap.SC,
    specialMap.SEM,
    specialMap.LIB
  ];

  // ── Two-page balance calculation ───────────────────────────────────────
  // Total subject rows without section headers
  const totalSubjectRows = theorySubjects.length + openElectiveSubjects.length + specialRowsToRender.length + practicalSubjects.length;
  const needsTwoPages = totalSubjectRows > 12;

  // If two pages, determine where to split:
  // We want Page 1 to have ~12-14 rows total (including THEORY header).
  // E.g. 1 (THEORY) + theorySubjects (e.g. 5) + first 7 open electives = 13 rows on Page 1.
  // Page 2 gets remaining 5 open electives + 3 special + 1 (PRACTICAL) + 3 labs = 12 rows!
  const splitOeIndex = openElectiveSubjects.length > 0
    ? Math.min(openElectiveSubjects.length - 2, Math.max(4, 12 - theorySubjects.length))
    : -1;

  // ── THEORY SECTION HEADER ──
  legendRows.push([
    { text: 'THEORY', colSpan: 5, bold: true, alignment: 'center', fontSize: 8.5 },
    {}, {}, {}, {}
  ]);

  // Append Theory Subjects
  theorySubjects.forEach(s => {
    const abbr = s.abbreviation || resolveSubjectAbbreviation(s.name, subjects);
    legendRows.push([
      { text: s.code || '-', bold: true, fontSize: 8, alignment: 'center' },
      { text: abbr, bold: true, fontSize: 8, alignment: 'center' },
      { text: s.name, fontSize: 8, alignment: 'left' },
      { text: s.hoursPerWeek ? String(s.hoursPerWeek) : '-', bold: true, fontSize: 8, alignment: 'center' },
      { text: s.staff || '-', fontSize: 8, alignment: 'left' }
    ]);
  });

  // Append Open Electives if present
  if (openElectiveSubjects.length > 0) {
    openElectiveSubjects.forEach((s, idx) => {
      const isSplitPoint = needsTwoPages && idx === splitOeIndex;
      // On Page 1 first OE row shows 'OE' & '5'. On Page 2 first OE row also shows 'OE' & '5' for clarity.
      const isFirstOnPage = idx === 0 || isSplitPoint;
      legendRows.push([
        {
          text: s.code || '-',
          bold: true,
          fontSize: 8,
          alignment: 'center',
          ...(isSplitPoint ? { pageBreak: 'before' } : {})
        },
        { text: isFirstOnPage ? 'OE' : '', bold: true, fontSize: 8, alignment: 'center' },
        { text: s.name, fontSize: 8, alignment: 'left' },
        { text: isFirstOnPage ? String(s.hoursPerWeek || 5) : '', bold: true, fontSize: 8, alignment: 'center' },
        { text: s.staff || '', fontSize: 8, alignment: 'left' }
      ]);
    });
  }

  // If needsTwoPages but NO open electives exist, split right before Special Hours
  const breakBeforeSpecial = needsTwoPages && openElectiveSubjects.length === 0;

  // Append Special Hours (SC, SEM, LIB)
  specialRowsToRender.forEach((sp, idx) => {
    const isSplit = breakBeforeSpecial && idx === 0;
    legendRows.push([
      {
        text: '',
        bold: true,
        fontSize: 8,
        alignment: 'center',
        ...(isSplit ? { pageBreak: 'before' } : {})
      },
      { text: sp.abbr, bold: true, fontSize: 8, alignment: 'center' },
      { text: sp.title, fontSize: 8, alignment: 'left' },
      { text: sp.hours, bold: true, fontSize: 8, alignment: 'center' },
      { text: sp.staff || counselorName || '-', fontSize: 8, alignment: 'left' }
    ]);
  });

  // ── PRACTICAL SECTION HEADER ──
  legendRows.push([
    { text: 'PRACTICAL', colSpan: 5, bold: true, alignment: 'center', fontSize: 8.5 },
    {}, {}, {}, {}
  ]);

  // Append Practical Subjects
  practicalSubjects.forEach(s => {
    const abbr = s.abbreviation || resolveSubjectAbbreviation(s.name, subjects);
    legendRows.push([
      { text: s.code || '-', bold: true, fontSize: 8, alignment: 'center' },
      { text: abbr, bold: true, fontSize: 8, alignment: 'center' },
      { text: s.name, fontSize: 8, alignment: 'left' },
      { text: s.hoursPerWeek ? String(s.hoursPerWeek) : '-', bold: true, fontSize: 8, alignment: 'center' },
      { text: s.staff || '-', fontSize: 8, alignment: 'left' }
    ]);
  });

  const legendTable = {
    table: {
      headerRows: 1,
      widths: [75, 65, '*', 45, 185],
      body: legendRows
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => '#000000',
      vLineColor: () => '#000000',
      paddingLeft: () => 4,
      paddingRight: () => 4,
      paddingTop: () => 3.2,
      paddingBottom: () => 3.2
    },
    margin: [0, 0, 0, 6]
  };

  // ── 5. Signatures Block with Blank Physical Signing Area ─────────────
  const signaturesBlock = {
    margin: [0, 45, 0, 0], // Leaves 45pt vertical space for staff ink signature!
    table: {
      widths: ['*', '*', '*', '*'],
      body: [
        [
          {
            stack: [
              { text: 'TIMETABLE INCHARGE', bold: true, fontSize: 8.5, alignment: 'center' },
              { text: timetableIncharge, bold: true, fontSize: 8, alignment: 'center', margin: [0, 2, 0, 0] }
            ]
          },
          {
            stack: [
              { text: 'CLASS COUNSELOR', bold: true, fontSize: 8.5, alignment: 'center' },
              { text: counselorName, bold: true, fontSize: 8, alignment: 'center', margin: [0, 2, 0, 0] }
            ]
          },
          {
            stack: [
              { text: `HOD/${deptShort}`, bold: true, fontSize: 8.5, alignment: 'center' },
              { text: hodName, bold: true, fontSize: 8, alignment: 'center', margin: [0, 2, 0, 0] }
            ]
          },
          {
            stack: [
              { text: 'PRINCIPAL', bold: true, fontSize: 8.5, alignment: 'center' },
              { text: principalName, bold: true, fontSize: 8, alignment: 'center', margin: [0, 2, 0, 0] }
            ]
          }
        ]
      ]
    },
    layout: 'noBorders',
    dontBreakRows: true
  };

  return [
    ...headerBlock,
    subHeaderTable,
    timetableGridTable,
    legendTable,
    signaturesBlock
  ];
}

/**
 * Main export function for generating and downloading formal college timetables as PDF
 */
export async function exportTimetablesToPdf(
  items: TimetableExportClassItem[],
  fileName?: string,
  options?: TimetablePdfOptions
): Promise<void> {
  if (!items || items.length === 0) {
    throw new Error('No timetables available to export.');
  }

  const { pdfMake, pdfMakeModule } = await loadPdfMake();

  // Pre-load counselors for items that do not have counselorName
  await Promise.all(
    items.map(async (item) => {
      if (!item.counselorName && item.departmentId) {
        try {
          const counselor = await getClassCounselor(item.departmentId, item.year, item.section);
          if (counselor?.faculty_id) {
            const fac = await getFacultyById(counselor.faculty_id);
            item.counselorName = fac?.name || null;
          }
        } catch (e) {
          // Gracefully continue
        }
      }
    })
  );

  const content: any[] = [];
  items.forEach((item, index) => {
    const classContent = buildCollegeClassPdfContent(item, options);
    content.push(...classContent);
    if (index < items.length - 1) {
      content.push({ text: '', pageBreak: 'after' });
    }
  });

  const defaultFileName = items.length === 1
    ? `Timetable_${items[0].departmentName?.replace(/\s+/g, '_')}_Year${items[0].year}_Sec${items[0].section}.pdf`
    : `Timetables_All_Classes_${items[0]?.departmentName?.replace(/\s+/g, '_') || 'Department'}.pdf`;

  const finalFileName = fileName || defaultFileName;

  const docDefinition: any = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [26, 18, 26, 18],
    content,
    defaultStyle: {
      color: '#000000',
      font: 'Roboto'
    }
  };

  triggerDownload(pdfMake, pdfMakeModule, docDefinition, finalFileName);
}
