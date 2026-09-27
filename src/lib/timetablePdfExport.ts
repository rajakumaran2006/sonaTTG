import { getClassCounselor, getFacultyById } from "./supabaseService";

export interface TimetableExportSubject {
  id?: string;
  code?: string;
  name: string;
  type?: string;
  hoursPerWeek?: number;
  staff?: string;
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
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const DISPLAY_PERIODS = [
  { label: 'P1', time: '9:00–9:55' },
  { label: 'P2', time: '9:55–10:50' },
  { label: 'BREAK', time: '10:50–11:05', isBreak: true },
  { label: 'P3', time: '11:05–12:00' },
  { label: 'P4', time: '12:00–12:55' },
  { label: 'LUNCH', time: '12:55–1:55', isLunch: true },
  { label: 'P5', time: '1:55–2:50' },
  { label: 'P6', time: '2:50–3:45' },
  { label: 'BREAK', time: '3:45–3:55', isBreak: true },
  { label: 'P7', time: '3:55–4:50' },
];

function isSpecialHours(cell: string): boolean {
  return /seminar|library|counsell/i.test(cell);
}

function getSubjectType(cell: string, subjects: TimetableExportSubject[] = []): string {
  if (!cell || cell === 'BREAK' || cell === 'LUNCH') return 'break';
  if (isSpecialHours(cell)) return 'special';
  if (cell.includes(' / ') || cell.toLowerCase().includes('elective')) return 'elective';
  if (cell.toUpperCase().includes('LAB') || cell.toLowerCase().includes('laboratory') || cell.endsWith(' L')) return 'lab';

  const matched = subjects.find(s => s.name?.trim().toLowerCase() === cell.trim().toLowerCase());
  return matched?.type || 'theory';
}

function getCellBgColor(type: string): string {
  switch (type) {
    case 'lab':
      return '#E0F2FE'; // soft sky
    case 'elective':
      return '#F3E8FF'; // soft purple
    case 'special':
      return '#FEF3C7'; // soft amber
    case 'break':
      return '#F1F5F9'; // slate-100
    default:
      return '#FFFFFF';
  }
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
 * Builds the PDF content structure for a single class timetable
 */
function buildClassSectionPdfContent(
  item: TimetableExportClassItem,
  isLastClass: boolean
): any[] {
  const subjects = item.subjects || [];
  const counselorName = item.counselorName || null;

  // Build Grid Header Row
  const tableHeaderRow: any[] = [
    { text: 'Day', style: 'tableHeader', alignment: 'center', bold: true }
  ];

  DISPLAY_PERIODS.forEach(col => {
    tableHeaderRow.push({
      text: col.time ? `${col.label}\n(${col.time})` : col.label,
      style: 'tableHeader',
      alignment: 'center',
      bold: true
    });
  });

  // Build Grid Body Rows
  const gridRows: any[] = [tableHeaderRow];
  const safeGrid = Array.isArray(item.grid) ? item.grid : [];

  safeGrid.forEach((row, dayIdx) => {
    const r = Array.isArray(row) ? row : [];
    const displayCells = [
      r[0] || '',
      r[1] || '',
      'BREAK',
      r[2] || '',
      r[3] || '',
      'LUNCH',
      r[4] || '',
      r[5] || '',
      'BREAK',
      r[6] || ''
    ];

    const rowCells: any[] = [
      { text: DAYS[dayIdx] || `Day ${dayIdx + 1}`, style: 'dayHeader', alignment: 'center', bold: true }
    ];

    displayCells.forEach((cell) => {
      if (!cell || !cell.trim()) {
        rowCells.push({ text: '', style: 'timetableCell', fillColor: '#FFFFFF' });
        return;
      }

      if (cell === 'BREAK' || cell === 'LUNCH') {
        rowCells.push({
          text: cell,
          style: 'breakCell',
          alignment: 'center',
          bold: true,
          fillColor: '#F3F4F6',
          color: '#64748B'
        });
        return;
      }

      const type = getSubjectType(cell, subjects);
      const bg = getCellBgColor(type);

      // Find staff assigned
      const cellParts = cell.includes(' / ') ? cell.split(' / ').map(p => p.trim()) : [cell.trim()];
      const staffList = cellParts.map(part => {
        const found = subjects.find(s => s.name?.trim().toLowerCase() === part.toLowerCase());
        return found?.staff || '';
      }).filter(Boolean);

      let staff = staffList.join(' / ');
      if (isSpecialHours(cell) && counselorName) {
        staff = staff || counselorName;
      }

      // Display formatted text
      let displayTitle = cell;
      if (cell.toLowerCase().includes('open elective')) {
        displayTitle = 'Open Elective';
      }

      rowCells.push({
        stack: [
          { text: displayTitle, bold: true, fontSize: 7, color: '#0F172A', alignment: 'center' },
          staff ? { text: staff.toUpperCase(), fontSize: 5.5, color: '#475569', bold: true, margin: [0, 2, 0, 0], alignment: 'center' } : null
        ].filter(Boolean),
        style: 'timetableCell',
        fillColor: bg,
        alignment: 'center'
      });
    });

    gridRows.push(rowCells);
  });

  // Build Subjects & Faculty Legend
  const legendBody: any[] = [
    [
      { text: 'Course Code', style: 'legendTableHeader', alignment: 'center', bold: true },
      { text: 'Course Title', style: 'legendTableHeader', alignment: 'left', bold: true },
      { text: 'Category', style: 'legendTableHeader', alignment: 'center', bold: true },
      { text: 'Hrs/Wk', style: 'legendTableHeader', alignment: 'center', bold: true },
      { text: 'Faculty In-Charge', style: 'legendTableHeader', alignment: 'left', bold: true }
    ]
  ];

  subjects.forEach((s) => {
    legendBody.push([
      { text: s.code || '-', style: 'legendCell', alignment: 'center' },
      { text: s.name, style: 'legendCell', bold: true },
      { text: (s.type ? s.type.charAt(0).toUpperCase() + s.type.slice(1) : 'Theory'), style: 'legendCell', alignment: 'center' },
      { text: s.hoursPerWeek ? String(s.hoursPerWeek) : '-', style: 'legendCell', alignment: 'center' },
      { text: s.staff || '-', style: 'legendCell', bold: !!s.staff }
    ]);
  });

  // Append special hours if any
  if (item.specialHours && item.specialHours.length > 0) {
    item.specialHours.forEach((sp) => {
      legendBody.push([
        { text: '-', style: 'legendCell', alignment: 'center' },
        { text: sp.title || sp.name || 'Special Hour', style: 'legendCell', bold: true },
        { text: 'Special', style: 'legendCell', alignment: 'center' },
        { text: sp.hours ? String(sp.hours) : '1', style: 'legendCell', alignment: 'center' },
        { text: sp.staff || counselorName || '-', style: 'legendCell' }
      ]);
    });
  }

  // Construct block
  const block: any[] = [
    // Header
    {
      text: 'SONA COLLEGE OF TECHNOLOGY (AUTONOMOUS)',
      style: 'collegeTitle',
      alignment: 'center',
      margin: [0, 0, 0, 2]
    },
    {
      text: `DEPARTMENT OF ${(item.departmentName || 'ENGINEERING').toUpperCase()}`,
      style: 'subCollegeTitle',
      alignment: 'center',
      margin: [0, 0, 0, 2]
    },
    {
      text: `CLASS TIMETABLE — YEAR ${item.year} (SECTION ${item.section})`,
      style: 'sheetTitle',
      alignment: 'center',
      margin: [0, 0, 0, 6]
    },

    // Metadata Bar
    {
      style: 'metaTable',
      table: {
        widths: ['*', '*', '*', '*'],
        body: [
          [
            { text: [{ text: 'Department: ', bold: true }, item.departmentName || '-'], style: 'metaText' },
            { text: [{ text: 'Academic Year: ', bold: true }, `Year ${item.year}`], style: 'metaText' },
            { text: [{ text: 'Class Section: ', bold: true }, `Section ${item.section}`], style: 'metaText' },
            { text: [{ text: 'Class Counselor: ', bold: true }, counselorName || 'Not Assigned'], style: 'metaText' }
          ]
        ]
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 8]
    },

    // Timetable Grid
    {
      table: {
        headerRows: 1,
        widths: [36, '*', '*', 24, '*', '*', 34, '*', '*', 24, '*'],
        body: gridRows
      },
      layout: {
        hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 1.2 : 0.5,
        vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length) ? 1.2 : 0.5,
        hLineColor: () => '#CBD5E1',
        vLineColor: () => '#CBD5E1',
        paddingLeft: () => 2,
        paddingRight: () => 2,
        paddingTop: () => 4,
        paddingBottom: () => 4
      }
    },

    // Legend Header
    {
      text: 'SUBJECTS & FACULTY ALLOCATION',
      style: 'legendHeader',
      margin: [0, 10, 0, 4]
    },

    // Legend Table
    {
      table: {
        headerRows: 1,
        widths: [65, '*', 70, 40, 170],
        body: legendBody
      },
      layout: {
        hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 1.2 : 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => '#E2E8F0',
        vLineColor: () => '#E2E8F0',
        paddingLeft: () => 4,
        paddingRight: () => 4,
        paddingTop: () => 2.5,
        paddingBottom: () => 2.5
      },
      pageBreak: isLastClass ? undefined : 'after'
    }
  ];

  return block;
}

/**
 * Main export function for generating and downloading timetables as PDF
 */
export async function exportTimetablesToPdf(
  items: TimetableExportClassItem[],
  fileName?: string
): Promise<void> {
  if (!items || items.length === 0) {
    throw new Error('No timetables available to export.');
  }

  const { pdfMake, pdfMakeModule } = await loadPdfMake();

  // Pre-load counselors for items that do not have counselorName but have departmentId
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
          // Gracefully continue without counselor
        }
      }
    })
  );

  const content: any[] = [];
  items.forEach((item, index) => {
    const isLast = index === items.length - 1;
    const classContent = buildClassSectionPdfContent(item, isLast);
    content.push(...classContent);
  });

  const defaultFileName = items.length === 1
    ? `Timetable_${items[0].departmentName?.replace(/\s+/g, '_')}_Year${items[0].year}_Sec${items[0].section}.pdf`
    : `Timetables_All_Classes_${items[0]?.departmentName?.replace(/\s+/g, '_') || 'Department'}.pdf`;

  const finalFileName = fileName || defaultFileName;

  const docDefinition: any = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [24, 18, 24, 18],
    content,
    styles: {
      collegeTitle: {
        fontSize: 12,
        bold: true,
        color: '#0F172A'
      },
      subCollegeTitle: {
        fontSize: 9.5,
        bold: true,
        color: '#334155'
      },
      sheetTitle: {
        fontSize: 9,
        bold: true,
        color: '#059669'
      },
      metaText: {
        fontSize: 7.5,
        color: '#334155'
      },
      tableHeader: {
        fontSize: 7,
        bold: true,
        color: '#FFFFFF',
        fillColor: '#1E293B'
      },
      dayHeader: {
        fontSize: 7.5,
        bold: true,
        color: '#1E293B',
        fillColor: '#F8FAFC'
      },
      timetableCell: {
        margin: [0, 1, 0, 1]
      },
      breakCell: {
        fontSize: 7,
        bold: true,
        margin: [0, 4, 0, 4]
      },
      legendHeader: {
        fontSize: 8.5,
        bold: true,
        color: '#0F172A'
      },
      legendTableHeader: {
        fontSize: 7,
        bold: true,
        color: '#FFFFFF',
        fillColor: '#334155',
        margin: [0, 1.5, 0, 1.5]
      },
      legendCell: {
        fontSize: 7,
        color: '#1E293B',
        margin: [0, 1, 0, 1]
      }
    }
  };

  triggerDownload(pdfMake, pdfMakeModule, docDefinition, finalFileName);
}
