import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { DAYS, generateTimetable, validateLabPlacement } from "@/lib/timetable";
import { getSubjectFacultyMapByDeptName, getClassCounselor, getFacultyById, getDepartmentByName } from "@/lib/supabaseService";
import { useTimetableStore } from "@/store/timetableStore";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { createPullRequest } from "@/lib/supabaseService";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle, LayoutGrid, List } from "lucide-react";
import AdminNavbar from "@/components/navbar/AdminNavbar";
import SelectionHeader from "@/components/admin/SelectionHeader";

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
  const { toast } = useToast();
  const selected = useTimetableStore((s) => s.selectedSubjects);
  const special = useTimetableStore((s) => s.special);
  const specialHoursConfigs = useTimetableStore((s) => s.specialHoursConfigs);
  const timetable = useTimetableStore((s) => s.timetable);
  const setTimetable = useTimetableStore((s) => s.setTimetable);
  const selection = useTimetableStore((s) => s.selection);
  const labPreferences = useTimetableStore((s) => s.labPreferences);
  const [subjectToFaculty, setSubjectToFaculty] = useState<Record<string, string>>({});
  const [classCounselorName, setClassCounselorName] = useState<string | null>(null);

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
      name.startsWith('Seminar (') || name.startsWith('Library (') || name.startsWith('Student Counselling (')
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
        facultyBeforeAfternoon
      });
      const gridAsStrings = grid.map((row) => row.map((c) => c || ''));
      setTimetable(gridAsStrings);

      // Validate lab placement
      const validation = validateLabPlacement(grid, selected, labPreferences);
      setValidationResult(validation);

      if (!validation.valid) {
        toast({
          title: 'Lab placement issues detected',
          description: `${validation.errors.length} issue(s) found. Check the warnings below.`,
          variant: 'destructive'
        });
      } else if (Object.keys(validation.labDays).length > 0) {
        toast({
          title: 'Timetable generated successfully',
          description: 'All lab preferences have been applied correctly.',
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
    const pdfMake = (await import('pdfmake/build/pdfmake')).default;
    const vfsFonts = await import('pdfmake/build/vfs_fonts');
    // @ts-ignore
    pdfMake.vfs = vfsFonts.pdfMake.vfs;

    const body = [
      ['Day', ...Array.from(DISPLAY_COLUMNS)],
      ...timetable.map((row, i) => {
        const displayRow = [row[0], row[1], 'BREAK', row[2], row[3], 'LUNCH', row[4], row[5], 'BREAK', row[6]];
        return [DAYS[i], ...displayRow];
      })
    ];

    // Build subject -> faculty mapping for legend
    let subjectToFaculty: Record<string, string> = {};
    let pdfClassCounselorName: string | null = null;

    try {
      if (selection.department && selection.year && selection.section) {
        subjectToFaculty = await getSubjectFacultyMapByDeptName(selection.department, selection.year, selection.section);

        // Fetch class counselor for PDF
        const department = await getDepartmentByName(selection.department);
        if (department) {
          const counselor = await getClassCounselor(department.id, selection.year, selection.section);
          if (counselor) {
            const facultyDetails = await getFacultyById(counselor.faculty_id);
            pdfClassCounselorName = facultyDetails?.name || null;
          }
        }
      }
    } catch (e) {
      // non-fatal
    }

    const legendBody = [
      ['Course Title', 'Staff Incharge'],
      ...selected.map((s) => [s.name, subjectToFaculty[s.id] || s.staff || '-'])
    ];

    // Add special subjects to legend if they are enabled
    const specialSubjects = [];
    if (special.seminar) specialSubjects.push(['Seminar', pdfClassCounselorName || '-']);
    if (special.library) specialSubjects.push(['Library', pdfClassCounselorName || '-']);
    if (special.counselling) specialSubjects.push(['Student Counselling', pdfClassCounselorName || '-']);

    legendBody.push(...specialSubjects);

    const doc: any = {
      content: [
        { text: 'Class Timetable', style: 'header' },
        { table: { headerRows: 1, body } }
        , { text: '\nSubjects & Staff', style: 'subheader' }
        , { table: { headerRows: 1, body: legendBody } }
      ],
      styles: { header: { fontSize: 16, bold: true, margin: [0, 0, 0, 10] }, subheader: { fontSize: 12, bold: true, margin: [0, 10, 0, 6] } }
    };
    pdfMake.createPdf(doc).download('timetable.pdf');
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
    <div className="min-h-screen bg-background text-foreground">
      <AdminNavbar />
      <main className="md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80 animate-fade-in-up pt-16 md:pt-0">
        <SelectionHeader />
        <section className="container py-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold" style={{ fontFamily: 'Poppins' }}>Generated Timetable</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {selection.department ? `${selection.department}` : 'Department not selected'}
                {selection.year ? ` • Year: ${selection.year}` : ''}
                {selection.section ? ` • Section: ${selection.section}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex bg-muted p-1 rounded-lg border border-border shadow-sm">
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
                <Button variant="soft" size="sm" onClick={regenerate} className="h-10">Regenerate</Button>
                <Button variant="outline" size="sm" onClick={exportPDF} className="h-10">PDF</Button>
                <Button variant="outline" size="sm" onClick={exportXLSX} className="h-10">Excel</Button>
                <Button variant="hero" size="sm" onClick={() => setOpen(true)} className="h-10">Submit Changes</Button>
              </div>
            </div>
          </div>

          {/* Lab Validation Results */}
          {validationResult && (
            <div className="mb-6 space-y-3">
              {validationResult.valid ? (
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
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

          {viewMode === 'table' ? (
            <Card className="rounded-2xl p-4 overflow-auto border-olive-100 shadow-sm bg-white/50 backdrop-blur-sm">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-olive-50/30">
                    <th className="text-left p-2 align-bottom font-bold text-olive-900">Day</th>
                    {DISPLAY_COLUMNS.map((label, i) => (
                      <th key={i} className="text-left p-2 align-bottom">
                        <div className="flex flex-col">
                          <span className="font-bold text-olive-900">{label}</span>
                          {PERIOD_TIME_LABELS[label] && (
                            <span className="text-[10px] text-olive-600/70 font-medium uppercase tracking-tighter">{PERIOD_TIME_LABELS[label]}</span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timetable.map((row, dayIdx) => (
                    <tr key={dayIdx} className="border-t border-olive-100/50 hover:bg-olive-50/20 transition-colors">
                      <td className="p-2 font-bold text-olive-800 bg-olive-50/20">{DAYS[dayIdx]}</td>
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
                          return (
                            <td key={i} className="p-2">
                              <div className={`h-14 min-w-[100px] rounded-xl flex flex-col items-center justify-center text-center text-sm shadow-sm transition-all hover:scale-[1.02] ${cell ?
                                  isOpenElective ? 'bg-purple-100 text-purple-900 border border-purple-200' : cellClass(type)
                                  : 'bg-slate-50 text-slate-400 border border-dashed border-slate-200'
                                }`} title={`${cell || ''}${staff ? ' — ' + staff : ''}`}>
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
                <Card key={dayIdx} className="overflow-hidden border-olive-100 shadow-sm bg-white/50 backdrop-blur-sm group hover:shadow-md transition-all">
                  <CardHeader className="bg-gradient-to-r from-olive-50 to-transparent py-3 px-6 border-b border-olive-100">
                    <h3 className="font-bold text-xl text-olive-900 tracking-tight">{DAYS[dayIdx]}</h3>
                  </CardHeader>
                  <div className="divide-y divide-olive-50">
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

                        return (
                          <div key={i} className="flex items-center justify-between p-5 bg-white/70 hover:bg-olive-50/30 transition-colors">
                            <div className="flex flex-col gap-1.5 flex-1 pr-4">
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-extrabold text-olive-700 bg-olive-100 px-2 py-0.5 rounded-full uppercase tracking-wider">{label}</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{time}</span>
                              </div>
                              <span className={`text-base font-bold tracking-tight ${isOpenElective ? 'text-purple-700' : 'text-slate-900'}`}>{formatCellContent(cell)}</span>
                            </div>
                            {staff && (
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">Staff In-Charge</span>
                                <div className="text-sm font-semibold text-slate-700 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">{staff}</div>
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
                      <td className="p-2 capitalize">{config.special_type}</td>
                      <td className="p-2">{config.total_hours}</td>
                      <td className="p-2">special</td>
                      <td className="p-2">{classCounselorName || '-'}</td>
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
