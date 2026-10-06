import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { DAYS, generateTimetable, validateLabPlacement, verifySubjectHours } from "@/lib/timetable";
import { SubjectHoursVerificationCard } from "@/components/admin/SubjectHoursVerificationCard";
import { getSubjectFacultyMapByDeptName, getClassCounselor, getFacultyById, getDepartmentByName } from "@/lib/supabaseService";
import { useTimetableStore } from "@/store/timetableStore";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { createPullRequest } from "@/lib/supabaseService";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle, LayoutGrid, List, Pencil, ArrowLeftRight, X, FileDown, FileText, Printer, ChevronDown, Loader2 } from "lucide-react";
import AdminNavbar from "@/components/navbar/AdminNavbar";
import SelectionHeader from "@/components/admin/SelectionHeader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { getSubjectsForYear } from "@/lib/supabaseService";
import { exportTimetablesToPdf, TimetableExportClassItem } from "@/lib/timetablePdfExport";
import { useDarkMode } from "@/context/DarkModeContext";

const cellClass = (type: string) => {
  switch (type) {
    case 'lab':
      return 'bg-primary/15 ring-1 ring-primary/30';
    case 'special':
      return 'bg-accent/25 ring-1 ring-accent/40';
    case 'extra-class':
      return 'bg-pink-100 text-pink-900 ring-1 ring-pink-300';
    case 'break':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-secondary';
  }
};

const DISPLAY_COLUMNS = ['PERIOD 1', 'PERIOD 2', 'BREAK', 'PERIOD 3', 'PERIOD 4', 'LUNCH', 'PERIOD 5', 'PERIOD 6', 'BREAK', 'PERIOD 7'] as const;
const PERIOD_TIME_LABELS: Record<(typeof DISPLAY_COLUMNS)[number], string> = {
  'PERIOD 1': '9:00–9:55',
  'PERIOD 2': '9:55–10:50',
  BREAK: '',
  'PERIOD 3': '11:05–12:00',
  'PERIOD 4': '12:00–12:55',
  LUNCH: '12:55–1:55',
  'PERIOD 5': '1:55–2:50',
  'PERIOD 6': '2:50–3:45',
  'PERIOD 7': '3:55–4:50',
};

function Timetable() {
  const { isDark } = useDarkMode();
  const { toast } = useToast();
  const selected = useTimetableStore((s) => s.selectedSubjects);
  const special = useTimetableStore((s) => s.special);
  const specialHoursConfigs = useTimetableStore((s) => s.specialHoursConfigs);
  const timetable = useTimetableStore((s) => s.timetable);
  const setTimetable = useTimetableStore((s) => s.setTimetable);
  const selection = useTimetableStore((s) => s.selection);
  const labPreferences = useTimetableStore((s) => s.labPreferences);
  const semesterType = useTimetableStore((s) => s.semesterType);
  const [subjectToFaculty, setSubjectToFaculty] = useState<Record<string, string>>({});
  const [classCounselorName, setClassCounselorName] = useState<string | null>(null);
  const [exportingAllPdf, setExportingAllPdf] = useState(false);

  // PR modal state
  const [open, setOpen] = useState(false);
  const [prTitle, setPrTitle] = useState("");
  const [prDescription, setPrDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors: string[];
    labDays: Record<string, number[]>;
  } | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'list'>('table');
  const [facultyBeforeAfternoon, setFacultyBeforeAfternoon] = useState(false);

  const hourVerification = useMemo(() => {
    if (!timetable || timetable.length === 0 || !selected || selected.length === 0) return null;
    return verifySubjectHours(timetable, selected, specialHoursConfigs);
  }, [timetable, selected, specialHoursConfigs]);

  // Manual edit mode state
  const [editMode, setEditMode] = useState(false);
  const [swapSource, setSwapSource] = useState<{ day: number; period: number } | null>(null);
  const [editDropdown, setEditDropdown] = useState<{ day: number; period: number; x: number; y: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Map display column index (0-9) to actual data column index (0-6), returns -1 for BREAK/LUNCH
  const displayToDataCol = (displayIdx: number): number => {
    // Display: [P1, P2, BREAK, P3, P4, LUNCH, P5, P6, BREAK, P7]
    // Data:    [0,  1,  -1,    2,  3,  -1,    4,  5,  -1,    6 ]
    const map = [0, 1, -1, 2, 3, -1, 4, 5, -1, 6];
    return map[displayIdx] ?? -1;
  };

  const isEditableCell = (displayIdx: number): boolean => {
    return displayToDataCol(displayIdx) !== -1;
  };

  // Handle cell click in edit mode (swap logic)
  const handleCellClick = useCallback((dayIdx: number, displayColIdx: number) => {
    if (!editMode) return;
    const dataCol = displayToDataCol(displayColIdx);
    if (dataCol === -1) return; // Can't edit BREAK/LUNCH

    if (!swapSource) {
      // First click: select source cell
      setSwapSource({ day: dayIdx, period: dataCol });
      toast({ title: 'Cell selected', description: 'Click another cell to swap, or click the same cell to deselect.' });
    } else if (swapSource.day === dayIdx && swapSource.period === dataCol) {
      // Same cell clicked: deselect
      setSwapSource(null);
    } else {
      // Second click: perform swap
      const newGrid = timetable.map(row => [...row]);
      const temp = newGrid[swapSource.day][swapSource.period];
      newGrid[swapSource.day][swapSource.period] = newGrid[dayIdx][dataCol];
      newGrid[dayIdx][dataCol] = temp;
      setTimetable(newGrid);
      setSwapSource(null);
      toast({ title: 'Cells swapped', description: `Swapped ${DAYS[swapSource.day]} P${swapSource.period + 1} ↔ ${DAYS[dayIdx]} P${dataCol + 1}` });
    }
  }, [editMode, swapSource, timetable, setTimetable, toast]);

  // Handle right-click to open subject picker dropdown
  const handleCellRightClick = useCallback((e: React.MouseEvent, dayIdx: number, displayColIdx: number) => {
    if (!editMode) return;
    const dataCol = displayToDataCol(displayColIdx);
    if (dataCol === -1) return;
    e.preventDefault();
    setEditDropdown({ day: dayIdx, period: dataCol, x: e.clientX, y: e.clientY });
    setSwapSource(null);
  }, [editMode]);

  // Assign a subject to a cell
  const assignSubjectToCell = useCallback((dayIdx: number, dataCol: number, subjectName: string) => {
    const newGrid = timetable.map(row => [...row]);
    newGrid[dayIdx][dataCol] = subjectName;
    setTimetable(newGrid);
    setEditDropdown(null);
    toast({ title: 'Period updated', description: `${DAYS[dayIdx]} Period ${dataCol + 1} → ${subjectName || '(Empty)'}` });
  }, [timetable, setTimetable, toast]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!editDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setEditDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editDropdown]);

  // Exit edit mode resets state
  const toggleEditMode = useCallback(() => {
    setEditMode(prev => {
      if (prev) {
        setSwapSource(null);
        setEditDropdown(null);
      }
      return !prev;
    });
  }, []);

  // Check if a cell is the selected swap source
  const isCellSelected = (dayIdx: number, displayColIdx: number): boolean => {
    if (!swapSource) return false;
    const dataCol = displayToDataCol(displayColIdx);
    return swapSource.day === dayIdx && swapSource.period === dataCol;
  };

  // Build the list of assignable subjects for the dropdown
  const getAssignableSubjects = (): string[] => {
    const subjects = selected.map(s => s.name);
    // Add active special hours types
    specialHoursConfigs.filter(c => c.is_active).forEach(c => {
      if (!subjects.includes(c.special_type)) {
        subjects.push(c.special_type);
      }
    });
    return subjects;
  };

  // Auto-switch to list view on small screens or just let the user toggle
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const checkMobile = () => {
      if (window.innerWidth < 1024) {
        // We could auto-switch, but user preference is better.
        // For now, defaults to table, but user can click list.
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Returns true if a cell label matches any active special hours config type
  const isSpecialHoursCell = (name?: string | null): boolean => {
    if (!name) return false;
    const lowerName = name.toLowerCase();
    // Check against all active special hours config types (with or without counsellor suffix)
    if (specialHoursConfigs.some(c => c.is_active && lowerName.startsWith(c.special_type.toLowerCase()))) {
      return true;
    }
    // Fallback: legacy hardcoded names
    return (
      name === 'Seminar' || name === 'Library' || name === 'Student Counselling' ||
      name === 'Counselling' || name === 'Counseling' ||
      name.startsWith('Seminar (') || name.startsWith('Library (') || name.startsWith('Student Counselling (') ||
      name.startsWith('Counselling (') || name.startsWith('Counseling (')
    );
  };

  const subjectTypeByName = (name?: string | null) => {
    if (!name) return 'theory';
    if (name === 'BREAK' || name === 'LUNCH') return 'break';
    if (name.includes('Extra Class')) return 'extra-class';
    if (isSpecialHoursCell(name)) return 'special';
    
    const parts = name.includes(' / ') ? name.split(' / ').map(p => p.trim()) : [name];
    for (const part of parts) {
      const found = selected.find((s) => s.name === part);
      if (found) return found.type;
    }
    return 'theory';
  };

  // Function to format cell content based on subject type
  const formatCellContent = (cell: string | null): string => {
    if (!cell || !cell.trim()) return '';
    if (cell === 'BREAK' || cell === 'LUNCH') return cell;

    const subjectName = cell.trim();
    if (subjectName.toLowerCase().includes('open elective')) {
      return 'Open Elective';
    }
    const parts = subjectName.includes(' / ') ? subjectName.split(' / ').map(p => p.trim()) : [subjectName];
    
    const formattedParts = parts.map(part => {
      const subject = selected.find(s => s.name === part);
      if (subject?.type === 'open elective' || part === 'Open Elective') {
        // Show actual subject name with OE indicator
        return subject?.name || 'Open Elective';
      }
      if (subject?.type === 'elective') {
        const peTag = (subject.tags || []).find((t: string) =>
          /^(pe\s*\d+|elective\s*\d+|professional\s*elective\s*\d+|pe_group_\d+)$/i.test(t.trim())
        );
        return peTag ? peTag.trim().toUpperCase() : 'Professional Elective';
      }
      return part;
    });

    const uniqueParts = Array.from(new Set(formattedParts));
    return uniqueParts.join(' / ');
  };

  const regenerate = async () => {
    try {
      let openElectiveMode: 'parallel' | 'separate' = 'parallel';
      let electiveMode: 'parallel' | 'separate' = 'parallel';
      try {
        if (selection.department && selection.year) {
          const dep = await getDepartmentByName(selection.department);
          if (dep) {
            const storedOe = localStorage.getItem(`oe_mode:${dep.id}:${selection.year}`);
            if (storedOe === 'parallel' || storedOe === 'separate') {
              openElectiveMode = storedOe;
            }
            const storedPe = localStorage.getItem(`pe_mode:${dep.id}:${selection.year}`);
            if (storedPe === 'parallel' || storedPe === 'separate') {
              electiveMode = storedPe;
            }
          }
        }
      } catch (e) {
        console.warn('Failed to load elective modes for timetable generation:', e);
      }

      const grid = await generateTimetable({
        subjects: selected,
        special,
        specialHoursConfigs,
        labPreferences,
        departmentName: selection.department,
        year: selection.year,
        section: selection.section,
        openElectiveMode,
        electiveMode,
        facultyBeforeAfternoon,
        semesterType,
      });
      const gridAsStrings = grid.map((row) => row.map((c) => c || ''));
      setTimetable(gridAsStrings);

      // Validate lab placement
      const validation = validateLabPlacement(grid, selected, labPreferences);
      setValidationResult(validation);

      // Verify subject hours
      const verificationSubjects = (selection.year === 'IV' && semesterType === 'even' && selected.length === 0)
        ? [{ id: 'proj', name: 'Project', hoursPerWeek: 37, type: 'theory' } as any]
        : selected;
      const verification = verifySubjectHours(gridAsStrings, verificationSubjects, specialHoursConfigs);

      if (!validation.valid) {
        toast({
          title: 'Lab placement issues detected',
          description: `${validation.errors.length} issue(s) found. Check the warnings below.`,
          variant: 'destructive'
        });
      } else if (!verification.isValid) {
        toast({
          title: 'Subject Hours Mismatch Detected',
          description: verification.summaryText,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Timetable generated & verified',
          description: `All ${verification.subjects.length} subjects match their exact weekly hours!`,
          variant: 'default'
        });
      }
    } catch (e: any) {
      toast({ title: 'Generation failed', description: e?.message || 'Please adjust hours and try again.' });
      setValidationResult(null);
    }
  };

  useEffect(() => {
    if (!timetable?.[0]?.[0]) {
      regenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for special hours changes and regenerate timetable
  useEffect(() => {
    const handleSpecialHoursChange = () => {
      regenerate();
    };

    window.addEventListener('specialHoursChanged', handleSpecialHoursChange);
    return () => {
      window.removeEventListener('specialHoursChanged', handleSpecialHoursChange);
    };
  }, [regenerate]);

  // Load mapping from subject id -> faculty names for current selection
  useEffect(() => {
    (async () => {
      try {
        if (selection.department && selection.year && selection.section) {
          const map = await getSubjectFacultyMapByDeptName(selection.department, selection.year, selection.section);
          setSubjectToFaculty(map || {});
        }
      } catch (e) {
        setSubjectToFaculty({});
      }
    })();
  }, [selection.department, selection.year, selection.section, selected.length]);

  // Load class counselor information
  useEffect(() => {
    (async () => {
      try {
        if (selection.department && selection.year && selection.section) {
          const department = await getDepartmentByName(selection.department);
          if (department) {
            const counselor = await getClassCounselor(department.id, selection.year, selection.section);
            if (counselor) {
              const facultyDetails = await getFacultyById(counselor.faculty_id);
              setClassCounselorName(facultyDetails?.name || null);
            } else {
              setClassCounselorName(null);
            }
          }
        } else {
          setClassCounselorName(null);
        }
      } catch (e) {
        console.warn('Failed to load class counselor:', e);
        setClassCounselorName(null);
      }
    })();
  }, [selection.department, selection.year, selection.section]);

  const exportPDF = async () => {
    if (!selection.department || !selection.year || !selection.section) {
      toast({ title: 'Please select department, year, and section first', variant: 'destructive' });
      return;
    }
    try {
      const dept = await getDepartmentByName(selection.department);
      let subjectToFacultyMap: Record<string, string> = {};
      let pdfClassCounselorName: string | null = null;

      if (dept) {
        subjectToFacultyMap = await getSubjectFacultyMapByDeptName(selection.department, selection.year, selection.section).catch(() => ({}));
        const counselor = await getClassCounselor(dept.id, selection.year, selection.section).catch(() => null);
        if (counselor?.faculty_id) {
          const facultyDetails = await getFacultyById(counselor.faculty_id);
          pdfClassCounselorName = facultyDetails?.name || null;
        }
      }

      const exportSubjects = selected.map((s) => ({
        id: s.id,
        code: s.code || '',
        name: s.name,
        type: s.type,
        hoursPerWeek: s.hoursPerWeek,
        staff: subjectToFacultyMap[s.id] || s.staff || '',
        abbreviation: s.abbreviation || '',
      }));

      const item: TimetableExportClassItem = {
        departmentName: selection.department,
        year: selection.year,
        section: selection.section,
        grid: timetable,
        departmentId: dept?.id,
        subjects: exportSubjects,
        counselorName: pdfClassCounselorName,
        semesterType: useTimetableStore.getState().semesterType,
      };

      const pdfFileName = `Timetable_${selection.department.replace(/\s+/g, '_')}_Year${selection.year}_Sec${selection.section}.pdf`;
      await exportTimetablesToPdf([item], pdfFileName);
      toast({ title: 'PDF exported', description: `Timetable exported as ${pdfFileName}` });
    } catch (err: any) {
      console.error('PDF export error:', err);
      toast({ title: 'PDF export failed', description: err?.message || 'Please try again.', variant: 'destructive' });
    }
  };

  const exportAllClassesPDF = async () => {
    if (!selection.department) {
      toast({ title: 'Please select a department first', variant: 'destructive' });
      return;
    }
    setExportingAllPdf(true);
    try {
      const dept = await getDepartmentByName(selection.department);
      if (!dept) throw new Error('Department not found');

      const { data: dbTimetables, error } = await supabase
        .from('timetables')
        .select('*')
        .eq('department_id', dept.id);

      if (error) throw error;
      if (!dbTimetables || dbTimetables.length === 0) {
        toast({ title: 'No timetables found', description: `No saved timetables found for ${selection.department}` });
        return;
      }

      const uniqueYears = Array.from(new Set(dbTimetables.map(t => t.year)));
      const subjectsByYear: Record<string, any[]> = {};
      await Promise.all(
        uniqueYears.map(async (y) => {
          subjectsByYear[y] = await getSubjectsForYear(dept.id, y, useTimetableStore.getState().semesterType).catch(() => []);
        })
      );

      const exportItems: TimetableExportClassItem[] = await Promise.all(
        dbTimetables.map(async (t) => {
          const rawGrid = (t as any).grid_data ?? (t as any).data;
          let grid: string[][] = [];
          if (Array.isArray(rawGrid)) {
            grid = rawGrid;
          } else if (rawGrid && Array.isArray((rawGrid as any).grid)) {
            grid = (rawGrid as any).grid;
          }

          const yearSubjects = subjectsByYear[t.year] || [];
          const facultyMap = await getSubjectFacultyMapByDeptName(selection.department!, t.year, t.section).catch(() => ({}));

          const exportSubjects = yearSubjects.map((s: any) => ({
            id: s.id,
            code: s.code,
            name: s.name,
            type: s.type,
            hoursPerWeek: s.hoursPerWeek,
            staff: facultyMap[s.id] || s.staff || '',
            abbreviation: s.abbreviation || '',
          }));

          return {
            departmentName: selection.department!,
            year: t.year,
            section: t.section,
            grid,
            departmentId: dept.id,
            subjects: exportSubjects
          };
        })
      );

      const yearOrder: Record<string, number> = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4 };
      exportItems.sort((a, b) => {
        const ya = yearOrder[a.year] || 99;
        const yb = yearOrder[b.year] || 99;
        if (ya !== yb) return ya - yb;
        return a.section.localeCompare(b.section);
      });

      await exportTimetablesToPdf(exportItems, `Timetables_All_Classes_${selection.department.replace(/\s+/g, '_')}.pdf`);
      toast({ title: 'PDF Exported', description: `Exported ${exportItems.length} class timetable(s) successfully!` });
    } catch (e: any) {
      console.error('Export all error:', e);
      toast({ title: 'Export failed', description: e?.message || 'Failed to export all timetables', variant: 'destructive' });
    } finally {
      setExportingAllPdf(false);
    }
  };

  const exportXLSX = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([
      ['Day', ...Array.from(DISPLAY_COLUMNS)],
      ...timetable.map((row, i) => {
        const displayRow = [row[0], row[1], 'BREAK', row[2], row[3], 'LUNCH', row[4], row[5], 'BREAK', row[6]];
        return [DAYS[i], ...displayRow];
      })
    ]);
    // Build subject -> faculty mapping for legend
    let subjectToFaculty: Record<string, string> = {};
    let excelClassCounselorName: string | null = null;

    try {
      if (selection.department && selection.year && selection.section) {
        subjectToFaculty = await getSubjectFacultyMapByDeptName(selection.department, selection.year, selection.section);

        // Fetch class counselor for Excel
        const department = await getDepartmentByName(selection.department);
        if (department) {
          const counselor = await getClassCounselor(department.id, selection.year, selection.section);
          if (counselor) {
            const facultyDetails = await getFacultyById(counselor.faculty_id);
            excelClassCounselorName = facultyDetails?.name || null;
          }
        }
      }
    } catch (e) { }

    const legend = [
      ['Course Title', 'Staff Incharge'],
      ...selected.map((s) => [s.name, subjectToFaculty[s.id] || s.staff || '-'])
    ];

    // Add special subjects to Excel legend if enabled
    const excelSpecialSubjects = [];
    if (special.seminar) excelSpecialSubjects.push(['Seminar', excelClassCounselorName || '-']);
    if (special.library) excelSpecialSubjects.push(['Library', excelClassCounselorName || '-']);
    if (special.counselling) excelSpecialSubjects.push(['Student Counselling', excelClassCounselorName || '-']);

    legend.push(...excelSpecialSubjects);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Timetable');
    const legendWs = XLSX.utils.aoa_to_sheet(legend);
    XLSX.utils.book_append_sheet(wb, legendWs, 'Subjects & Staff');
    XLSX.writeFile(wb, 'timetable.xlsx');
  };

  const handleCreatePullRequest = async () => {
    if (!selection.department || !selection.year || !selection.section) {
      toast({ title: 'Missing selection', description: 'Please select department, year, and section.' });
      return;
    }
    if (!prTitle.trim()) {
      toast({ title: 'Title required', description: 'Please enter a pull request title.' });
      return;
    }
    try {
      setSubmitting(true);
      const createdBy = localStorage.getItem('superAdminEmail') || 'anonymous';
      await createPullRequest({
        title: prTitle.trim(),
        description: prDescription.trim() || undefined,
        departmentName: selection.department,
        year: selection.year,
        section: selection.section,
        proposedGrid: timetable,
        proposedSpecialFlags: special,
        proposedLabPreferences: labPreferences,
        createdBy,
      });
      setOpen(false);
      setPrTitle(""); setPrDescription("");
      toast({ title: 'Pull request created', description: 'Your changes were submitted for review.' });
    } catch (e: any) {
      toast({ title: 'Failed to create PR', description: e?.message || 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`min-h-screen relative overflow-x-hidden transition-colors duration-300 ${
      isDark ? "bg-[#060814] text-white" : "bg-[#f8faff] text-slate-900"
    }`}>
      {/* Ambient background light orbs for frosted glass refraction */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {isDark ? (
          <>
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-br from-indigo-600/12 via-purple-600/08 to-transparent blur-3xl opacity-70" />
            <div className="absolute top-1/3 -right-20 w-80 h-80 rounded-full bg-gradient-to-bl from-cyan-600/08 via-indigo-600/08 to-transparent blur-3xl opacity-60" />
            <div className="absolute -bottom-20 left-1/3 w-96 h-96 rounded-full bg-gradient-to-tr from-purple-600/08 via-indigo-600/06 to-transparent blur-3xl opacity-50" />
          </>
        ) : (
          <>
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-br from-indigo-200/40 via-purple-200/30 to-transparent blur-3xl opacity-75" />
            <div className="absolute top-1/4 -right-20 w-80 h-80 rounded-full bg-gradient-to-bl from-purple-200/35 via-indigo-100/40 to-transparent blur-3xl opacity-65" />
            <div className="absolute -bottom-20 left-1/3 w-96 h-96 rounded-full bg-gradient-to-tr from-indigo-100/40 via-purple-100/30 to-transparent blur-3xl opacity-50" />
          </>
        )}
      </div>

      <AdminNavbar />
      <main className="md:pl-72 animate-fade-in-up pt-16 md:pt-0 relative z-10 transition-all duration-300">
        <SelectionHeader />
        <section className="max-w-7xl mx-auto px-6 sm:px-8 py-8 md:py-10 space-y-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-2">
                <span>Timetable Viewer</span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Generated Timetable</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {selection.department ? `${selection.department}` : 'Department not selected'}
                {selection.year ? ` • Year: ${selection.year}` : ''}
                {selection.section ? ` • Section: ${selection.section}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex bg-card/50 backdrop-blur-xl p-1 rounded-2xl border border-border/60 shadow-sm">
                <Button
                  variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('table')}
                  className={`h-8 px-3 gap-2 ${viewMode === 'table' ? 'bg-background shadow-sm' : ''}`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Table</span>
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className={`h-8 px-3 gap-2 ${viewMode === 'list' ? 'bg-background shadow-sm' : ''}`}
                >
                  <List className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">List</span>
                </Button>
              </div>
              <div className="flex items-center gap-2 mr-2 border-r pr-3 border-border">
                <Switch
                  checked={facultyBeforeAfternoon}
                  onCheckedChange={setFacultyBeforeAfternoon}
                  id="faculty-before-afternoon-toggle"
                />
                <Label htmlFor="faculty-before-afternoon-toggle" className="text-xs font-semibold cursor-pointer select-none">
                  Professor before afternoon
                </Label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={editMode ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={toggleEditMode}
                  className={`h-10 gap-2 ${editMode ? 'ring-2 ring-amber-400 shadow-lg' : ''}`}
                >
                  {editMode ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                  {editMode ? 'Exit Edit' : 'Edit'}
                </Button>
                <Button variant="soft" size="sm" onClick={regenerate} className="h-10">Regenerate</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-10 gap-1.5" disabled={exportingAllPdf}>
                      {exportingAllPdf ? (
                        <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                      ) : (
                        <FileDown className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      )}
                      PDF
                      <ChevronDown className="h-3 w-3 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 rounded-xl">
                    <DropdownMenuItem onClick={exportPDF} className="cursor-pointer gap-2 py-2">
                      <Printer className="h-4 w-4 text-blue-500" />
                      <div>
                        <div className="font-semibold text-xs">Current Class ({selection.year ? `Yr ${selection.year}` : ''} {selection.section ? `Sec ${selection.section}` : ''})</div>
                        <div className="text-[10px] text-muted-foreground">Export single timetable</div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportAllClassesPDF} className="cursor-pointer gap-2 py-2">
                      <FileText className="h-4 w-4 text-indigo-500" />
                      <div>
                        <div className="font-semibold text-xs">All Classes in Department</div>
                        <div className="text-[10px] text-muted-foreground">Combined PDF of all saved sections</div>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm" onClick={exportXLSX} className="h-10">Excel</Button>
                <Button variant="hero" size="sm" onClick={() => setOpen(true)} className="h-10">Submit Changes</Button>
              </div>
            </div>
          </div>

          {/* Edit Mode Info Banner */}
          {editMode && (
            <div className="mb-4 rounded-xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50 p-4 shadow-sm animate-fade-in-up">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-100 border border-amber-200">
                  <ArrowLeftRight className="h-4.5 w-4.5 text-amber-700" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-amber-900">Edit Mode Active</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    <strong>Click</strong> a cell to select it, then <strong>click another cell</strong> to swap them.
                    <span className="mx-1.5 text-amber-400">|</span>
                    <strong>Right-click</strong> a cell to assign a specific subject.
                  </p>
                </div>
                {swapSource && (
                  <div className="flex items-center gap-2 bg-amber-100 border border-amber-300 rounded-lg px-3 py-1.5">
                    <span className="text-xs font-bold text-amber-900">
                      Selected: {DAYS[swapSource.day]} P{swapSource.period + 1}
                    </span>
                    <button onClick={() => setSwapSource(null)} className="text-amber-600 hover:text-amber-900 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Lab Validation Results */}
          {validationResult && (
            <div className="mb-6 space-y-3">
              {validationResult.valid ? (
                <Alert className="border-indigo-500/20 bg-indigo-50/50 dark:bg-indigo-950/20">
                  <CheckCircle className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <AlertDescription className="text-indigo-900 dark:text-indigo-200">
                    <strong>Lab settings applied successfully!</strong>
                    {Object.keys(validationResult.labDays).length > 0 && (
                      <div className="mt-2 text-sm">
                        Lab schedule: {Object.entries(validationResult.labDays).map(([lab, days]) =>
                          `${lab} (${days.map(d => DAYS[d]).join(', ')})`
                        ).join(' • ')}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Lab placement issues detected:</strong>
                    <ul className="mt-2 text-sm space-y-1">
                      {validationResult.errors.map((error, i) => (
                        <li key={i} className="flex items-start">
                          <span className="inline-block w-2 h-2 bg-red-500 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                          {error}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Subject Hours Allocation Verification */}
          {hourVerification && (
            <div className="mb-6">
              <SubjectHoursVerificationCard
                verification={hourVerification}
                isDark={false}
                defaultExpanded={!hourVerification.isValid}
              />
            </div>
          )}

          {viewMode === 'table' ? (
            <Card className="rounded-2xl p-4 overflow-auto border-border/60 shadow-sm bg-card/60 backdrop-blur-md">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="text-left p-2 align-bottom font-bold text-foreground">Day</th>
                    {DISPLAY_COLUMNS.map((label, i) => (
                      <th key={i} className="text-left p-2 align-bottom">
                        <div className="flex flex-col">
                          <span className="font-bold text-foreground">{label}</span>
                          {PERIOD_TIME_LABELS[label] && (
                            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">{PERIOD_TIME_LABELS[label]}</span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timetable.map((row, dayIdx) => (
                    <tr key={dayIdx} className="border-t border-border/40 hover:bg-muted/30 transition-colors">
                      <td className="p-2 font-bold text-foreground bg-muted/20">{DAYS[dayIdx]}</td>
                      {(() => {
                        const displayRow = [row[0], row[1], 'BREAK', row[2], row[3], 'LUNCH', row[4], row[5], 'BREAK', row[6]];
                        return displayRow.map((cell, i) => {
                          const type = subjectTypeByName(cell);
                          
                          let staff = '';
                          const cellParts = cell && cell.includes(' / ') ? cell.split(' / ').map(p => p.trim()) : [cell];
                          if (cellParts && cellParts.length > 0) {
                            const staffList = cellParts.map(part => {
                              const subj = selected.find((s) => s.name === part);
                              if (subj) {
                                return subjectToFaculty[subj.id] || subj.staff || '';
                              }
                              return '';
                            }).filter(Boolean);
                            staff = staffList.join(' / ');
                          }

                          if (isSpecialHoursCell(cell)) {
                            staff = classCounselorName || staff;
                          }

                          const isOpenElective = cellParts.some(part => {
                            const subj = selected.find((s) => s.name === part);
                            return subj?.type === 'open elective';
                          });
                          const cellSelected = isCellSelected(dayIdx, i);
                          const editable = editMode && isEditableCell(i);
                          return (
                            <td key={i} className="p-2">
                              <div
                                className={`h-14 min-w-[100px] rounded-xl flex flex-col items-center justify-center text-center text-sm shadow-sm transition-all ${
                                  editable ? 'cursor-pointer hover:scale-105 hover:shadow-md' : 'hover:scale-[1.02]'
                                } ${cellSelected
                                  ? 'ring-3 ring-amber-400 shadow-amber-200 shadow-lg scale-105 bg-amber-50'
                                  : cell
                                    ? isOpenElective ? 'bg-purple-100 text-purple-900 border border-purple-200' : cellClass(type)
                                    : 'bg-indigo-50/40 text-indigo-300 border border-dashed border-indigo-200/60'
                                } ${editable && swapSource && !cellSelected ? 'ring-1 ring-amber-200/60' : ''}`}
                                title={editMode
                                  ? `Click to ${swapSource ? 'swap with' : 'select'} this cell${cell ? ` (${cell})` : ''}`
                                  : `${cell || ''}${staff ? ' — ' + staff : ''}`
                                }
                                onClick={() => handleCellClick(dayIdx, i)}
                                onContextMenu={(e) => handleCellRightClick(e, dayIdx, i)}
                              >
                                {editMode && editable && (
                                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Pencil className="h-2.5 w-2.5 text-white" />
                                  </span>
                                )}
                                <span className="font-semibold px-1 truncate w-full">{formatCellContent(cell)}</span>
                                {staff && <span className="text-[9px] font-bold text-black/40 uppercase tracking-tighter leading-none mt-1 truncate w-full px-1">{staff}</span>}
                              </div>
                            </td>
                          );
                        });
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : (
            <div className="grid gap-6">
              {timetable.map((row, dayIdx) => (
                <Card key={dayIdx} className="overflow-hidden border-border/60 shadow-sm bg-card/60 backdrop-blur-md group hover:shadow-md transition-all">
                  <CardHeader className="bg-muted/30 py-3 px-6 border-b border-border/60">
                    <h3 className="font-bold text-xl text-foreground tracking-tight">{DAYS[dayIdx]}</h3>
                  </CardHeader>
                  <div className="divide-y divide-border/40">
                    {(() => {
                      const displayRow = [row[0], row[1], 'BREAK', row[2], row[3], 'LUNCH', row[4], row[5], 'BREAK', row[6]];
                      const items = displayRow.map((cell, i) => {
                        const label = DISPLAY_COLUMNS[i];
                        const time = PERIOD_TIME_LABELS[label];
                        if (!cell || cell === 'BREAK' || cell === 'LUNCH') return null;

                        const type = subjectTypeByName(cell);
                         
                        let staff = '';
                        const cellParts = cell && cell.includes(' / ') ? cell.split(' / ').map(p => p.trim()) : [cell];
                        if (cellParts && cellParts.length > 0) {
                          const staffList = cellParts.map(part => {
                            const subj = selected.find((s) => s.name === part);
                            if (subj) {
                              return subjectToFaculty[subj.id] || subj.staff || '';
                            }
                            return '';
                          }).filter(Boolean);
                          staff = staffList.join(' / ');
                        }
                        if (isSpecialHoursCell(cell)) staff = classCounselorName || staff;

                        const isOpenElective = cellParts.some(part => {
                          const subj = selected.find((s) => s.name === part);
                          return subj?.type === 'open elective';
                        });

                        const cellSelected = editMode && swapSource && swapSource.day === dayIdx && swapSource.period === displayToDataCol(i);
                        const editable = editMode && isEditableCell(i);

                        return (
                          <div
                            key={i}
                            className={`flex items-center justify-between p-5 bg-card/40 hover:bg-muted/30 transition-all ${
                              editable ? 'cursor-pointer hover:shadow-md' : ''
                            } ${cellSelected ? 'ring-2 ring-amber-400 bg-amber-50 shadow-md' : ''}`}
                            onClick={() => handleCellClick(dayIdx, i)}
                            onContextMenu={(e) => handleCellRightClick(e, dayIdx, i)}
                          >
                            <div className="flex flex-col gap-1.5 flex-1 pr-4">
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/50 dark:border-indigo-800/40 px-2 py-0.5 rounded-full uppercase tracking-wider">{label}</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{time}</span>
                                {cellSelected && (
                                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                                    Selected
                                  </span>
                                )}
                              </div>
                              <span className={`text-base font-bold tracking-tight ${isOpenElective ? 'text-purple-700' : 'text-slate-900'}`}>{formatCellContent(cell)}</span>
                            </div>
                            {staff && (
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-[10px] uppercase font-extrabold tracking-widest text-indigo-900/60 dark:text-slate-400">Staff In-Charge</span>
                                <div className="text-sm font-semibold text-indigo-950 dark:text-slate-200 bg-indigo-50/70 dark:bg-slate-800 px-3 py-1 rounded-lg border border-indigo-100 dark:border-slate-700 shadow-sm">{staff}</div>
                              </div>
                            )}
                          </div>
                        );
                      }).filter(Boolean);

                      return items.length > 0 ? items : (
                        <div className="p-10 text-center text-slate-400 italic bg-white/50">
                          No classes scheduled for this day
                        </div>
                      );
                    })()}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Right-click Subject Picker Dropdown */}
          {editDropdown && (
            <div
              ref={dropdownRef}
              className="fixed z-50 min-w-[240px] max-h-[320px] overflow-y-auto rounded-xl border border-indigo-100 bg-white/95 backdrop-blur-xl shadow-2xl animate-fade-in-up"
              style={{
                left: Math.min(editDropdown.x, window.innerWidth - 260),
                top: Math.min(editDropdown.y, window.innerHeight - 340),
              }}
            >
              <div className="sticky top-0 bg-slate-800 text-white px-4 py-2.5 rounded-t-xl">
                <p className="text-xs font-bold uppercase tracking-wider">Assign Subject</p>
                <p className="text-[10px] text-slate-300 mt-0.5">
                  {DAYS[editDropdown.day]} • Period {editDropdown.period + 1}
                </p>
              </div>
              <div className="p-1.5">
                {/* Clear option */}
                <button
                  className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-red-50 text-red-600 font-medium transition-colors flex items-center gap-2 border-b border-slate-100 mb-1"
                  onClick={() => assignSubjectToCell(editDropdown.day, editDropdown.period, '')}
                >
                  <X className="h-3.5 w-3.5" />
                  Clear Cell
                </button>
                {/* Subject options */}
                {getAssignableSubjects().map((subjectName) => {
                  const subj = selected.find(s => s.name === subjectName);
                  const isCurrentlyAssigned = timetable[editDropdown.day]?.[editDropdown.period] === subjectName;
                  return (
                    <button
                      key={subjectName}
                      className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 ${
                        isCurrentlyAssigned
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 font-bold'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                      onClick={() => assignSubjectToCell(editDropdown.day, editDropdown.period, subjectName)}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        subj?.type === 'lab' ? 'bg-blue-400' :
                        subj?.type === 'elective' || subj?.type === 'open elective' ? 'bg-purple-400' :
                        !subj ? 'bg-amber-400' :
                        'bg-indigo-500'
                      }`} />
                      <span className="truncate">{subjectName}</span>
                      {subj?.type && (
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider ml-auto flex-shrink-0">
                          {subj.type}
                        </span>
                      )}
                      {isCurrentlyAssigned && (
                        <CheckCircle className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 flex-shrink-0 ml-auto" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <Card className="rounded-2xl p-4 mt-6">
            <CardHeader className="px-0 pt-0">
              <CardTitle>Subjects & Staff Details</CardTitle>
            </CardHeader>
            <div className="overflow-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Code</th>
                    <th className="text-left p-2">Abbreviation</th>
                    <th className="text-left p-2">Course Title</th>
                    <th className="text-left p-2">No. of Hrs</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-left p-2">Staff Incharge</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const openElectives = selected.filter((s) => s.type === 'open elective');
                    
                    // Group electives by tag
                    const electiveGroups = new Map<string, typeof selected>();
                    const ungroupedElectives: typeof selected = [];
                    
                    selected.filter(s => s.type === 'elective').forEach(s => {
                      const peTag = (s.tags || []).find((t: string) =>
                        /^(pe\s*\d+|elective\s*\d+|professional\s*elective\s*\d+|pe_group_\d+)$/i.test(t.trim())
                      );
                      if (peTag) {
                        const key = peTag.trim().toUpperCase();
                        if (!electiveGroups.has(key)) electiveGroups.set(key, []);
                        electiveGroups.get(key)!.push(s);
                      } else {
                        ungroupedElectives.push(s);
                      }
                    });

                    const otherSubjects = selected.filter((s) => s.type !== 'open elective' && s.type !== 'elective');
                    
                    return (
                      <>
                        {otherSubjects.map((s, idx) => (
                          <tr key={s.id || idx} className="border-b">
                            <td className="p-2">{s.code || '-'}</td>
                            <td className="p-2">{s.abbreviation || s.id}</td>
                            <td className="p-2">{s.name}</td>
                            <td className="p-2">{s.hoursPerWeek}</td>
                            <td className="p-2 capitalize">{s.type}</td>
                            <td className="p-2">{subjectToFaculty[s.id] || s.staff || '-'}</td>
                          </tr>
                        ))}
                        
                        {Array.from(electiveGroups.entries()).map(([groupName, groupSubjects]) => (
                          <tr key={groupName} className="border-b bg-blue-50/20">
                            <td className="p-2" colSpan={6}>
                              <div className="font-semibold text-blue-900">{groupName} Group</div>
                              <div className="mt-2 space-y-2">
                                {groupSubjects.map((s) => (
                                  <div key={s.id} className="flex flex-wrap items-center gap-3">
                                    <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-200">{s.code || '-'}</span>
                                    <span className="text-xs text-muted-foreground">{s.abbreviation || s.id}</span>
                                    <span className="font-medium">{s.name}</span>
                                    <span className="text-xs text-muted-foreground font-mono bg-blue-50 px-1 py-0.5 rounded border border-blue-100">{s.hoursPerWeek}h ({s.credits || 3} credits)</span>
                                    <span className="text-xs text-muted-foreground font-bold">•</span>
                                    <span className="text-sm">{subjectToFaculty[s.id] || s.staff || '-'}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                        
                        {ungroupedElectives.length > 0 && (
                          <tr className="border-b bg-blue-50/20">
                            <td className="p-2" colSpan={6}>
                              <div className="font-semibold text-blue-900">Professional Electives</div>
                              <div className="mt-2 space-y-2">
                                {ungroupedElectives.map((s) => (
                                  <div key={s.id} className="flex flex-wrap items-center gap-3">
                                    <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-200">{s.code || '-'}</span>
                                    <span className="text-xs text-muted-foreground">{s.abbreviation || s.id}</span>
                                    <span className="font-medium">{s.name}</span>
                                    <span className="text-xs text-muted-foreground font-mono bg-blue-50 px-1 py-0.5 rounded border border-blue-100">{s.hoursPerWeek}h ({s.credits || 3} credits)</span>
                                    <span className="text-xs text-muted-foreground font-bold">•</span>
                                    <span className="text-sm">{subjectToFaculty[s.id] || s.staff || '-'}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}

                        {openElectives.length > 0 && (
                          <tr className="border-b bg-purple-50/40">
                            <td className="p-2" colSpan={6}>
                              <div className="font-semibold text-purple-900">Open Elective</div>
                              <div className="mt-2 space-y-2">
                                {openElectives.map((s) => (
                                  <div key={s.id} className="flex flex-wrap items-center gap-3">
                                    <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-200">{s.code || '-'}</span>
                                    <span className="text-xs text-muted-foreground">{s.abbreviation || s.id}</span>
                                    <span className="font-medium">{s.name}</span>
                                    <span className="text-xs text-muted-foreground font-mono bg-purple-50 px-1 py-0.5 rounded border border-purple-100">{s.hoursPerWeek}h ({s.credits || 3} credits)</span>
                                    <span className="text-xs text-muted-foreground font-bold">•</span>
                                    <span className="text-sm">{subjectToFaculty[s.id] || s.staff || '-'}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })()}
                  {specialHoursConfigs.filter(c => c.is_active).map((config, idx) => (
                    <tr key={config.id || idx} className="border-b">
                      <td className="p-2">-</td>
                      <td className="p-2">-</td>
                      <td className="p-2 capitalize">{(config.special_type || '').replace(/\s*\([^)]*\)\s*$/, '').trim()}</td>
                      <td className="p-2">{config.total_hours}</td>
                      <td className="p-2">special</td>
                      <td className="p-2">{classCounselorName || (config.special_type && config.special_type.includes('(') ? config.special_type.match(/\(([^)]+)\)/)?.[1]?.trim() : '-')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Pull Request</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <Input placeholder="Title" value={prTitle} onChange={(e) => setPrTitle(e.target.value)} />
                <Textarea placeholder="Describe your changes (optional)" value={prDescription} onChange={(e) => setPrDescription(e.target.value)} />
                <div className="text-xs text-muted-foreground">
                  {selection.department || '-'} • {selection.year || '-'} • {selection.section || '-'}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleCreatePullRequest} disabled={submitting}>{submitting ? 'Submitting...' : 'Submit PR'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>
      </main>
    </div>
  );
}

export default Timetable;
