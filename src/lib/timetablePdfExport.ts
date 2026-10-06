import { getClassCounselor, getFacultyById, getDepartmentByName } from "./supabaseService";
import { supabase } from "@/integrations/supabase/client";

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
  allDbSubjects?: TimetableExportSubject[];
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

/** Expands short/abbreviated department names to full official names */
export function getFullDepartmentName(deptName: string): string {
  const n = (deptName || '').toLowerCase().trim();
  // Already long enough — return as-is in uppercase
  if (n.length > 20) return (deptName || '').toUpperCase().trim();
  // Short-name expansions
  if (n === 'it' || n === 'information technology') return 'INFORMATION TECNOLOGY';
  if (n === 'aids' || n === 'ai&ds' || n === 'ad' || n === 'ai & ds') return 'ARTIFICIAL INTELLIGENCE AND DATA SCIENCE';
  if (n === 'cse' || n === 'cs') return 'COMPUTER SCIENCE AND ENGINEERING';
  if (n === 'ece') return 'ELECTRONICS AND COMMUNICATION ENGINEERING';
  if (n === 'eee') return 'ELECTRICAL AND ELECTRONICS ENGINEERING';
  if (n === 'mech' || n === 'me') return 'MECHANICAL ENGINEERING';
  if (n === 'civil' || n === 'ce') return 'CIVIL ENGINEERING';
  if (n === 'ft') return 'FASHION TECHNOLOGY';
  if (n === 'mct') return 'MECHATRONICS ENGINEERING';
  if (n.includes('artificial intelligence') || n.includes('ai')) return 'ARTIFICIAL INTELLIGENCE AND DATA SCIENCE';
  if (n.includes('information tech')) return 'INFORMATION TECNOLOGY';
  if (n.includes('computer science')) return 'COMPUTER SCIENCE AND ENGINEERING';
  if (n.includes('electronics and comm')) return 'ELECTRONICS AND COMMUNICATION ENGINEERING';
  if (n.includes('electrical')) return 'ELECTRICAL AND ELECTRONICS ENGINEERING';
  if (n.includes('mechanical')) return 'MECHANICAL ENGINEERING';
  if (n.includes('fashion')) return 'FASHION TECHNOLOGY';
  if (n.includes('mechatronics')) return 'MECHATRONICS ENGINEERING';
  if (n.includes('civil')) return 'CIVIL ENGINEERING';
  return (deptName || '').toUpperCase().trim();
}

export function getDegreeTitle(deptName: string): string {
  const fullName = getFullDepartmentName(deptName);
  const n = (deptName || '').toUpperCase().trim();
  // If already prefixed with B.TECH / B TECH / B.E, return as-is
  if (n.startsWith('B TECH') || n.startsWith('B.TECH') || n.startsWith('B E') || n.startsWith('B.E')) {
    return n;
  }
  // Use full expanded name
  if (fullName.includes('ARTIFICIAL INTELLIGENCE')) {
    return 'B TECH ARTIFICIAL INTELLIGENCE AND DATA SCIENCE';
  }
  if (fullName.includes('INFORMATION')) {
    return 'B TECH INFORMATION TECHNOLOGY';
  }
  return `B TECH ${fullName}`;
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
    'applied probability and statistics': 'APAS I',
    'applied probability and statistics -i': 'APAS I',
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

let activeVfs: Record<string, string> = {};
let activeFonts: any = {
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf'
  }
};
let timesFontsLoaded = false;
let timesFontsLoadingPromise: Promise<boolean> | null = null;

function extractRawVfs(vfsFontsModule: any): Record<string, string> {
  if (vfsFontsModule?.pdfMake?.vfs) return vfsFontsModule.pdfMake.vfs;
  if (vfsFontsModule?.default?.pdfMake?.vfs) return vfsFontsModule.default.pdfMake.vfs;
  if (vfsFontsModule?.default && typeof vfsFontsModule.default === 'object' && !Array.isArray(vfsFontsModule.default)) {
    return vfsFontsModule.default;
  }
  if (typeof vfsFontsModule === 'object' && vfsFontsModule !== null) {
    return vfsFontsModule;
  }
  return {};
}

async function fetchFontWithFallback(fileName: string): Promise<string> {
  const baseUrl = (typeof window !== 'undefined' && (window as any).__BASE_PATH__)
    || (import.meta as any).env?.BASE_URL
    || '/';
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  const urlsToTry = [
    `${cleanBase}fonts/${fileName}`,
    `/fonts/${fileName}`,
    `./fonts/${fileName}`
  ];

  let lastError: any = null;
  for (const url of urlsToTry) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const len = bytes.byteLength;
        const chunkSize = 8192;
        for (let i = 0; i < len; i += chunkSize) {
          const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
          binary += String.fromCharCode.apply(null, chunk as any);
        }
        return btoa(binary);
      }
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error(`Could not fetch font ${fileName}`);
}

async function loadTimesFonts(pdfMake: any): Promise<boolean> {
  if (timesFontsLoaded) return true;
  if (timesFontsLoadingPromise) return timesFontsLoadingPromise;

  timesFontsLoadingPromise = (async () => {
    try {
      if (typeof window === 'undefined' || typeof fetch === 'undefined') {
        return false;
      }

      const [timesNormalB64, timesBoldB64] = await Promise.all([
        fetchFontWithFallback('times.ttf'),
        fetchFontWithFallback('timesbd.ttf')
      ]);

      activeVfs['times.ttf'] = timesNormalB64;
      activeVfs['timesbd.ttf'] = timesBoldB64;

      activeFonts.Times = {
        normal: 'times.ttf',
        bold: 'timesbd.ttf',
        italics: 'times.ttf',
        bolditalics: 'timesbd.ttf'
      };

      pdfMake.vfs = activeVfs;
      if (typeof pdfMake.addVirtualFileSystem === 'function') {
        pdfMake.addVirtualFileSystem(activeVfs);
      }

      pdfMake.fonts = activeFonts;
      if (typeof pdfMake.setFonts === 'function') {
        pdfMake.setFonts(activeFonts);
      }
      if (typeof pdfMake.addFonts === 'function') {
        pdfMake.addFonts({ Times: activeFonts.Times });
      }

      if (typeof window !== 'undefined') {
        (window as any).pdfMake = (window as any).pdfMake || pdfMake;
        (window as any).pdfMake.vfs = activeVfs;
        (window as any).pdfMake.fonts = activeFonts;
      }

      timesFontsLoaded = true;
      return true;
    } catch (err) {
      console.warn('Could not load custom Times New Roman fonts, falling back to default Roboto:', err);
      timesFontsLoaded = false;
      return false;
    }
  })();

  return timesFontsLoadingPromise;
}

async function loadPdfMake() {
  const pdfMakeModule = await import('pdfmake/build/pdfmake');
  const pdfMake: any = pdfMakeModule.default || pdfMakeModule;
  const vfsFontsModule: any = await import('pdfmake/build/vfs_fonts');

  const baseVfs = extractRawVfs(vfsFontsModule);
  activeVfs = { ...baseVfs, ...activeVfs };

  pdfMake.vfs = activeVfs;
  if (typeof pdfMake.addVirtualFileSystem === 'function') {
    pdfMake.addVirtualFileSystem(activeVfs);
  }

  pdfMake.fonts = activeFonts;
  if (typeof pdfMake.setFonts === 'function') {
    pdfMake.setFonts(activeFonts);
  }

  if (typeof window !== 'undefined') {
    (window as any).pdfMake = pdfMake;
    (window as any).pdfMake.vfs = activeVfs;
    (window as any).pdfMake.fonts = activeFonts;
  }

  await loadTimesFonts(pdfMake);

  return { pdfMake, pdfMakeModule, fonts: activeFonts, vfs: activeVfs };
}

async function triggerDownload(
  pdfDoc: any,
  fileName: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      if (typeof window === 'undefined') {
        resolve();
        return;
      }
      let completed = false;
      const done = () => {
        if (!completed) {
          completed = true;
          resolve();
        }
      };

      // 1. Try standard getBlob + anchor download
      pdfDoc.getBlob((blob: Blob) => {
        try {
          if (!blob) {
            throw new Error('Failed to generate PDF blob');
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            try {
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            } catch (e) { }
            done();
          }, 800);
        } catch (downloadErr) {
          console.warn('Anchor download failed, using pdfDoc.download fallback:', downloadErr);
          try {
            pdfDoc.download(fileName, done);
          } catch (e) {
            reject(downloadErr || e);
          }
        }
      });
    } catch (err) {
      console.warn('pdfDoc.getBlob failed, attempting pdfDoc.download:', err);
      try {
        pdfDoc.download(fileName, () => resolve());
      } catch (e) {
        reject(err);
      }
    }
  });
}


/**
 * Builds the formal college timetable PDF content matching the Sona College official template
 */
function buildCollegeClassPdfContent(
  item: TimetableExportClassItem,
  options?: TimetablePdfOptions
): any[] {
  const subjects = item.subjects || [];
  const lookupPool: TimetableExportSubject[] = [
    ...subjects,
    ...(item.allDbSubjects || [])
  ];

  const counselorName = (item.counselorName !== undefined && item.counselorName !== null)
    ? item.counselorName
    : (options?.counselorName || '');
  const timetableIncharge = options?.timetableIncharge || item.timetableIncharge || 'Mr. P.Dineshkumar';
  const hodName = options?.hodName || item.hodName || 'Dr.J.Akilandeswari';
  const principalName = options?.principalName || item.principalName || 'Dr.S.R.R.Senthil Kumar';
  const wefDate = options?.wefDate || item.wefDate || 'DD.MM.YYYY';
  const revision = options?.revision || item.revision || '00';
  const semesterType = options?.semesterType || item.semesterType || 'odd';
  const academicYear = options?.academicYear || item.academicYear || '2026 - 2027';

  const deptShort = getDeptShortName(item.departmentName);
  const fullDeptName = getFullDepartmentName(item.departmentName);
  const romanSem = getSemesterRoman(item.year, semesterType);
  const degreeTitle = getDegreeTitle(item.departmentName);

  // ── 1. Document Header Block (Matching Template Hierarchy) ───────────
  const headerBlock: any[] = [
    {
      text: 'SONA COLLEGE OF TECHNOLOGY (Autonomous), SALEM-5',
      bold: true,
      fontSize: 12,
      alignment: 'center',
      margin: [0, 0, 0, 1]
    },
    {
      text: `DEPARTMENT OF INFORMATION TECHNOLOGY`,
      bold: true,
      fontSize: 10.5,
      alignment: 'center',
      margin: [0, 0, 0, 0]
    },
    {
      text: degreeTitle,
      bold: true,
      fontSize: 10,
      alignment: 'center',
      margin: [0, 0, 0, 0]
    },
    {
      text: `TIMETABLE FOR ${semesterType.toUpperCase()} SEM (${academicYear})`,
      bold: true,
      fontSize: 10,
      alignment: 'center',
      margin: [0, 0, 0, 0]
    },
    {
      text: `${romanSem} SEM - ${(item.section || 'A').toUpperCase()} SEC`,
      bold: true,
      fontSize: 10,
      decoration: 'underline',
      alignment: 'center',
      margin: [0, 0, 0, 2]
    },
  ];

  // ── 2. Revision & W.e.f Sub-header ────────────────────────────────────
  const subHeaderTable = {
    table: {
      widths: ['*', '*'],
      body: [
        [
          { text: `Revision: ${revision}`, bold: true, fontSize: 9.5, alignment: 'left' },
          { text: `W.e.f.:${wefDate}`, bold: true, fontSize: 9.5, alignment: 'right' }
        ]
      ]
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 2]
  };

  // ── 3. Timetable Grid Table (9 Columns: Day, P1-P4, LUNCH, P5-P7) ───────
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

  const safeGrid = Array.isArray(item.grid) ? item.grid : [];

  for (let dayIdx = 0; dayIdx < 6; dayIdx++) {
    const rawRow = Array.isArray(safeGrid[dayIdx]) ? safeGrid[dayIdx] : [];
    const dayLabel = DAYS_SHORT[dayIdx] || `DAY ${dayIdx + 1}`;

    // Map the 7 periods to abbreviations
    const abbreviations: string[] = [];
    for (let p = 0; p < 7; p++) {
      const cellVal = rawRow[p] || '';
      abbreviations.push(resolveSubjectAbbreviation(cellVal, lookupPool));
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
            bold: false,
            fontSize: 9,
            alignment: 'center'
          });
          for (let s = 1; s < span; s++) {
            cells.push({});
          }
          i += span;
        } else {
          cells.push({
            text: current || '',
            bold: false,
            fontSize: 9,
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
      { text: dayLabel, bold: true, fontSize: 9.5, alignment: 'center' },
      ...morningCells,
      dayIdx === 0
        ? {}
        : dayIdx === 1
          ? { text: 'L\n\nU\n\nN\n\nC\n\nH', rowSpan: 5, bold: true, alignment: 'center', fontSize: 8.5 }
          : {},
      ...afternoonCells
    ];

    gridRows.push(rowCells);
  }

  const timetableGridTable = {
    table: {
      headerRows: 2,
      widths: [48, '*', '*', '*', '*', 50, '*', '*', '*'],
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
    margin: [0, 0, 0, 4]
  };

  // ── 4. Subjects & Faculty Legend Table ─────────────────────────────────
  const LG = 8.5; // Legend font size matching official template

  const legendRows: any[] = [
    // Header Row: Abbreviation column width 72 ensures single-line text without wrapping
    [
      { text: 'SUB. CODE', bold: true, alignment: 'center', fontSize: LG },
      { text: 'Abbreviation', bold: true, alignment: 'center', fontSize: LG },
      { text: 'COURSE TITLE', bold: true, alignment: 'center', fontSize: LG },
      { text: 'NO. OF HRS', bold: true, alignment: 'center', fontSize: LG },
      { text: 'STAFF INCHARGE', bold: true, alignment: 'center', fontSize: LG }
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

  // Build Special Hours data (SC, SEM, LIB) for combined row
  const specialHoursData: Record<string, { hours: number; staff: string }> = {
    SC: { hours: 2, staff: counselorName || '-' },
    SEM: { hours: 2, staff: counselorName || '-' },
    LIB: { hours: 4, staff: counselorName || '-' }
  };

  // Merge special hours from subjects if present
  subjects.forEach(s => {
    if (isSpecialSubject(s)) {
      const abbr = (s.abbreviation || resolveSubjectAbbreviation(s.name, lookupPool)).toUpperCase();
      const staffVal = s.staff && s.staff !== '-' && s.staff !== '—' ? s.staff : (counselorName || '-');
      if (abbr.includes('LIB') || s.name.toLowerCase().includes('library')) {
        specialHoursData.LIB.staff = staffVal;
        if (s.hoursPerWeek) specialHoursData.LIB.hours = s.hoursPerWeek;
      } else if (abbr.includes('SEM') || s.name.toLowerCase().includes('seminar')) {
        specialHoursData.SEM.staff = staffVal;
        if (s.hoursPerWeek) specialHoursData.SEM.hours = s.hoursPerWeek;
      } else if (abbr.includes('SC') || s.name.toLowerCase().includes('counsel')) {
        specialHoursData.SC.staff = staffVal;
        if (s.hoursPerWeek) specialHoursData.SC.hours = s.hoursPerWeek;
      }
    }
  });

  // Merge special hours from item.specialHours
  (item.specialHours || []).forEach(sp => {
    const rawTitle = sp.title || sp.name || '';
    const nameLower = rawTitle.toLowerCase();
    const staffVal = sp.staff && sp.staff !== '-' && sp.staff !== '—' ? sp.staff : (counselorName || '-');

    if (nameLower.includes('library') || rawTitle.toUpperCase().includes('LIB')) {
      specialHoursData.LIB.staff = staffVal || specialHoursData.LIB.staff;
      if (sp.hours) specialHoursData.LIB.hours = sp.hours;
    } else if (nameLower.includes('seminar') || rawTitle.toUpperCase().includes('SEM')) {
      specialHoursData.SEM.staff = staffVal || specialHoursData.SEM.staff;
      if (sp.hours) specialHoursData.SEM.hours = sp.hours;
    } else if (nameLower.includes('counsel') || rawTitle.toUpperCase().includes('SC')) {
      specialHoursData.SC.staff = staffVal || specialHoursData.SC.staff;
      if (sp.hours) specialHoursData.SC.hours = sp.hours;
    }
  });

  // Combined total hours for SC/SEM/LIB
  const combinedSpecialHours = specialHoursData.SC.hours + specialHoursData.SEM.hours + specialHoursData.LIB.hours;
  // Use the counselor name as staff for the combined row
  const combinedSpecialStaff = counselorName || specialHoursData.SC.staff || '-';

  // ── Two-page balance calculation ───────────────────────────────────────
  const totalSubjectRows = theorySubjects.length + openElectiveSubjects.length + 1 + practicalSubjects.length;
  const needsTwoPages = totalSubjectRows > 14;

  const splitOeIndex = openElectiveSubjects.length > 0
    ? Math.min(openElectiveSubjects.length - 2, Math.max(4, 14 - theorySubjects.length))
    : -1;

  // ── THEORY SECTION HEADER ──
  legendRows.push([
    { text: 'THEORY', colSpan: 5, bold: true, alignment: 'center', fontSize: LG },
    {}, {}, {}, {}
  ]);

  // Append Theory Subjects
  theorySubjects.forEach(s => {
    const abbr = (s.abbreviation && s.abbreviation.trim())
      ? s.abbreviation.trim().toUpperCase()
      : resolveSubjectAbbreviation(s.name, lookupPool);
    legendRows.push([
      { text: s.code || '-', bold: false, fontSize: LG, alignment: 'center' },
      { text: abbr, bold: false, fontSize: LG, alignment: 'center' },
      { text: s.name, bold: false, fontSize: LG, alignment: 'left' },
      { text: s.hoursPerWeek ? String(s.hoursPerWeek) : '-', bold: false, fontSize: LG, alignment: 'center' },
      { text: s.staff || '-', bold: false, fontSize: LG, alignment: 'left' }
    ]);
  });

  // Append Open Electives if present
  if (openElectiveSubjects.length > 0) {
    openElectiveSubjects.forEach((s, idx) => {
      const isSplitPoint = needsTwoPages && idx === splitOeIndex;
      const isFirstOnPage = idx === 0 || isSplitPoint;
      const oeAbbr = (s.abbreviation && s.abbreviation.trim())
        ? s.abbreviation.trim().toUpperCase()
        : 'OE';
      legendRows.push([
        {
          text: s.code || '-',
          bold: false,
          fontSize: LG,
          alignment: 'center',
          ...(isSplitPoint ? { pageBreak: 'before' } : {})
        },
        { text: isFirstOnPage ? oeAbbr : '', bold: false, fontSize: LG, alignment: 'center' },
        {
          text: isFirstOnPage
            ? { text: [{ text: 'Open Elective: ', bold: false }, s.name] }
            : s.name,
          bold: false,
          fontSize: LG,
          alignment: 'left'
        },
        { text: isFirstOnPage ? String(s.hoursPerWeek || 5) : '', bold: false, fontSize: LG, alignment: 'center' },
        { text: s.staff || '', bold: false, fontSize: LG, alignment: 'left' }
      ]);
    });
  }

  // If needsTwoPages but NO open electives exist, split right before Special Hours
  const breakBeforeSpecial = needsTwoPages && openElectiveSubjects.length === 0;

  // ── Combined SC/SEM/LIB Row (single row, matching official template) ──
  legendRows.push([
    {
      text: '',
      bold: false,
      fontSize: LG,
      alignment: 'center',
      ...(breakBeforeSpecial ? { pageBreak: 'before' } : {})
    },
    { text: 'SC/SEM/LIB', bold: false, fontSize: LG, alignment: 'center' },
    { text: 'Student Counseling/ Seminar/ Library', bold: false, fontSize: LG, alignment: 'left' },
    { text: String(combinedSpecialHours), bold: false, fontSize: LG, alignment: 'center' },
    { text: combinedSpecialStaff, bold: false, fontSize: LG, alignment: 'left' }
  ]);

  // ── PRACTICAL SECTION HEADER ──
  legendRows.push([
    { text: 'PRACTICAL', colSpan: 5, bold: true, alignment: 'center', fontSize: LG },
    {}, {}, {}, {}
  ]);

  // Append Practical Subjects
  practicalSubjects.forEach(s => {
    const abbr = (s.abbreviation && s.abbreviation.trim())
      ? s.abbreviation.trim().toUpperCase()
      : resolveSubjectAbbreviation(s.name, lookupPool);
    legendRows.push([
      { text: s.code || '-', bold: false, fontSize: LG, alignment: 'center' },
      { text: abbr, bold: false, fontSize: LG, alignment: 'center' },
      { text: s.name, bold: false, fontSize: LG, alignment: 'left' },
      { text: s.hoursPerWeek ? String(s.hoursPerWeek) : '-', bold: false, fontSize: LG, alignment: 'center' },
      { text: s.staff || '-', bold: false, fontSize: LG, alignment: 'left' }
    ]);
  });

  const legendTable = {
    table: {
      headerRows: 1,
      widths: [68, 72, '*', 45, 175],
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
    margin: [0, 0, 0, 3]
  };

  // ── 5. Signatures Block with Physical Signing Area ───────────────────
  const signaturesBlock = {
    unbreakable: true,
    margin: [0, 26, 0, 0],
    table: {
      widths: ['*', '*', '*', '*'],
      body: [
        [
          {
            text: [
              { text: 'TIMETABLE INCHARGE\n', bold: true, fontSize: 9 },
              { text: timetableIncharge, bold: true, fontSize: 8.5 }
            ],
            alignment: 'center'
          },
          {
            text: [
              { text: 'CLASS COUNSELOR\n', bold: true, fontSize: 9 },
              { text: counselorName || '', bold: true, fontSize: 8.5 }
            ],
            alignment: 'center'
          },
          {
            text: [
              { text: `HOD/${deptShort}\n`, bold: true, fontSize: 9 },
              { text: hodName, bold: true, fontSize: 8.5 }
            ],
            alignment: 'center'
          },
          {
            text: [
              { text: 'PRINCIPAL\n', bold: true, fontSize: 9 },
              { text: principalName, bold: true, fontSize: 8.5 }
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
    subHeaderTable,
    timetableGridTable,
    legendTable,
    signaturesBlock
  ];
}

/**
 * Enriches export items by fetching real imported subjects and abbreviations from Supabase
 */
export async function enrichItemsWithDatabaseSubjects(
  items: TimetableExportClassItem[]
): Promise<void> {
  const dbSubjectsCache = new Map<string, any[]>();

  for (const item of items) {
    let deptId = item.departmentId;
    if (!deptId && item.departmentName) {
      try {
        const dept = await getDepartmentByName(item.departmentName);
        if (dept) {
          deptId = dept.id;
          item.departmentId = dept.id;
        }
      } catch (e) {
        console.warn('Could not resolve department by name:', item.departmentName, e);
      }
    }

    const cacheKey = `${deptId || item.departmentName}_${item.year}`;
    let dbSubjects = dbSubjectsCache.get(cacheKey);

    if (!dbSubjects && deptId) {
      try {
        let query = (supabase as any)
          .from('subjects')
          .select('id, name, code, abbreviation, type, hours_per_week, staff, year');

        query = query.eq('department_id', deptId);
        if (item.year) {
          query = query.eq('year', item.year);
        }

        const { data, error } = await query;
        if (!error && data && Array.isArray(data)) {
          dbSubjects = data;
          dbSubjectsCache.set(cacheKey, dbSubjects);
        }
      } catch (e) {
        console.warn('Failed to fetch subjects from database for timetable export:', e);
      }
    }

    // Fallback: fetch department-wide subjects if year query returned empty
    if ((!dbSubjects || dbSubjects.length === 0) && deptId) {
      try {
        const { data, error } = await (supabase as any)
          .from('subjects')
          .select('id, name, code, abbreviation, type, hours_per_week, staff, year')
          .eq('department_id', deptId);
        if (!error && data && Array.isArray(data)) {
          dbSubjects = data;
          dbSubjectsCache.set(cacheKey, dbSubjects);
        }
      } catch (e) {
        console.warn('Failed to fetch department subjects fallback:', e);
      }
    }

    const availableDbSubjects = dbSubjects || [];

    const findMatchingDbSubject = (target: { id?: string; code?: string; name: string }) => {
      if (!availableDbSubjects.length) return null;
      if (target.id) {
        const byId = availableDbSubjects.find(s => s.id === target.id);
        if (byId) return byId;
      }
      if (target.code) {
        const c = target.code.trim().toUpperCase();
        const byCode = availableDbSubjects.find(s => (s.code || '').trim().toUpperCase() === c);
        if (byCode) return byCode;
      }
      const rawName = (target.name || '').trim().toLowerCase();
      const cleaned = rawName.replace(/\s*[\(\[][^()\[\]]*[\)\]]\s*$/, '').trim();
      const byName = availableDbSubjects.find(s => {
        const dbName = (s.name || '').trim().toLowerCase();
        const dbCleaned = dbName.replace(/\s*[\(\[][^()\[\]]*[\)\]]\s*$/, '').trim();
        return dbName === rawName || dbCleaned === cleaned || dbName === cleaned || dbCleaned === rawName;
      });
      if (byName) return byName;

      const normRaw = cleaned.replace(/\blaboratory\b/gi, 'lab');
      const byLab = availableDbSubjects.find(s => {
        const normDb = (s.name || '').trim().toLowerCase().replace(/\blaboratory\b/gi, 'lab');
        return normDb === normRaw;
      });
      if (byLab) return byLab;

      return null;
    };

    if (item.subjects && item.subjects.length > 0) {
      item.subjects.forEach(s => {
        const dbMatch = findMatchingDbSubject(s);
        if (dbMatch) {
          if ((!s.abbreviation || !s.abbreviation.trim()) && dbMatch.abbreviation) {
            s.abbreviation = dbMatch.abbreviation;
          }
          if ((!s.code || !s.code.trim()) && dbMatch.code) {
            s.code = dbMatch.code;
          }
          if (!s.id && dbMatch.id) {
            s.id = dbMatch.id;
          }
        }
      });
    } else if (availableDbSubjects.length > 0) {
      item.subjects = availableDbSubjects.map(s => ({
        id: s.id,
        code: s.code || '',
        name: s.name,
        abbreviation: s.abbreviation || '',
        type: s.type,
        hoursPerWeek: s.hours_per_week,
        staff: s.staff || ''
      }));
    }

    // Attach all db subjects for slot lookup pool without polluting section legend
    item.allDbSubjects = availableDbSubjects.map(s => ({
      id: s.id,
      code: s.code || '',
      name: s.name,
      abbreviation: s.abbreviation || '',
      type: s.type,
      hoursPerWeek: s.hours_per_week,
      staff: s.staff || ''
    }));
  }
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

  // 1. Fetch from database: Enrich items with imported subjects & abbreviations
  await enrichItemsWithDatabaseSubjects(items);

  const { pdfMake, pdfMakeModule, fonts, vfs } = await loadPdfMake();

  // Pre-load counselors for items that do not have counselorName
  await Promise.all(
    items.map(async (item) => {
      if (item.counselorName === undefined && item.departmentId) {
        try {
          const counselor = await getClassCounselor(item.departmentId, item.year, item.section);
          if (counselor?.faculty_id) {
            const fac = await getFacultyById(counselor.faculty_id);
            item.counselorName = fac?.name || '';
          } else {
            item.counselorName = '';
          }
        } catch (e) {
          item.counselorName = '';
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
    pageMargins: [26, 12, 26, 12],
    content,
    defaultStyle: {
      color: '#000000',
      font: timesFontsLoaded ? 'Times' : 'Roboto'
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

