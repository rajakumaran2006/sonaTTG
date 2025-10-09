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
import { createPullRequest } from "@/lib/supabaseService";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle } from "lucide-react";
import AdminNavbar from "@/components/navbar/AdminNavbar";

const cellClass = (type: string) => {
  switch (type) {
    case 'lab':
      return 'bg-primary/15 ring-1 ring-primary/30';
    case 'special':
      return 'bg-accent/25 ring-1 ring-accent/40';
    case 'break':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-secondary';
  }
};

const DISPLAY_COLUMNS = ['PERIOD 1','PERIOD 2','BREAK','PERIOD 3','PERIOD 4','LUNCH','PERIOD 5','PERIOD 6','BREAK','PERIOD 7'] as const;
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

  const subjectTypeByName = (name?: string | null) => {
    if (!name) return 'theory';
    if (name === 'BREAK' || name === 'LUNCH') return 'break';
    // Check for special subjects (including those with class counselor names)
    if (name === 'Seminar' || name === 'Library' || name === 'Student Counselling' ||
        name.startsWith('Seminar (') || name.startsWith('Library (') || name.startsWith('Student Counselling (')) {
      return 'special';
    }
    const found = selected.find((s) => s.name === name);
    return found?.type || 'theory';
  };

  // Function to format cell content based on subject type
  const formatCellContent = (cell: string | null): string => {
    if (!cell || !cell.trim()) return '';
    if (cell === 'BREAK' || cell === 'LUNCH') return cell;
    
    const subjectName = cell.trim();
    const subject = selected.find(s => s.name === subjectName);
    
    if (subject?.type === 'open elective' || subjectName === 'Open Elective') {
      return 'Open Elective';
    }
    
    return subjectName;
  };

  const regenerate = async () => {
    try {
      const grid = await generateTimetable({ 
        subjects: selected, 
        special, 
        specialHoursConfigs,
        labPreferences,
        departmentName: selection.department,
        year: selection.year,
        section: selection.section
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
      styles: { header: { fontSize: 16, bold: true, margin: [0,0,0,10] }, subheader: { fontSize: 12, bold: true, margin: [0,10,0,6] } }
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
    } catch (e) {}

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
    <div className="min-h-screen bg-background">
      <AdminNavbar />
      <main className="md:pl-72">
        <section className="container py-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold" style={{fontFamily: 'Poppins'}}>Generated Timetable</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {selection.department ? `${selection.department}` : 'Department not selected'}
                {selection.year ? ` • Year: ${selection.year}` : ''}
                {selection.section ? ` • Section: ${selection.section}` : ''}
              </p>
            </div>
          <div className="flex gap-2">
            <Button variant="soft" onClick={regenerate}>Regenerate</Button>
            <Button variant="outline" onClick={exportPDF}>Export PDF</Button>
            <Button variant="outline" onClick={exportXLSX}>Export Excel</Button>
            <Button variant="hero" onClick={() => setOpen(true)}>Create Pull Request</Button>
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

        <Card className="rounded-2xl p-4 overflow-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left p-2 align-bottom">Day</th>
                {DISPLAY_COLUMNS.map((label, i) => (
                  <th key={i} className="text-left p-2 align-bottom">
                    <div className="flex flex-col">
                      <span className="font-medium">{label}</span>
                      {PERIOD_TIME_LABELS[label] && (
                        <span className="text-xs text-muted-foreground">{PERIOD_TIME_LABELS[label]}</span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timetable.map((row, dayIdx) => (
                <tr key={dayIdx} className="border-t">
                  <td className="p-2 font-medium">{DAYS[dayIdx]}</td>
                  {(() => {
                    const displayRow = [row[0], row[1], 'BREAK', row[2], row[3], 'LUNCH', row[4], row[5], 'BREAK', row[6]];
                    return displayRow.map((cell, i) => {
                      const type = subjectTypeByName(cell);
                      const subj = selected.find((s) => s.name === cell);
                      let staff = subj ? (subjectToFaculty[subj.id] || subj.staff || '') : '';
                      
                      // Check if this is a special activity with class counselor
                      if (classCounselorName && 
                          (cell === 'Seminar' || cell === 'Library' || cell === 'Student Counselling' ||
                           cell?.startsWith('Seminar (') || cell?.startsWith('Library (') || cell?.startsWith('Student Counselling ('))) {
                        staff = classCounselorName;
                      }
                      
                      const isOpenElective = subj?.type === 'open elective';
                      return (
                        <td key={i} className="p-2">
                          <div className={`h-12 rounded-md flex flex-col items-center justify-center text-center text-sm ${
                            cell ? 
                              isOpenElective ? 'bg-purple-100 text-purple-900 ring-1 ring-purple-300' : cellClass(type) 
                              : 'bg-muted'
                          }`} title={`${cell || ''}${staff ? ' — ' + staff : ''}`}>
                            <span>{formatCellContent(cell)}</span>
                            {staff && <span className="text-[10px] text-muted-foreground leading-none mt-0.5">{staff}</span>}
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
                  const otherSubjects = selected.filter((s) => s.type !== 'open elective');
                  return (
                    <>
                      {otherSubjects.map((s, idx) => (
                        <tr key={s.id || idx} className="border-b">
                          <td className="p-2">{s.code || '-'}</td>
                          <td className="p-2">{s.abbreviation || s.id}</td>
                          <td className="p-2">{s.name}</td>
                          <td className="p-2">{s.type === 'open elective' ? '-' : s.hoursPerWeek}</td>
                          <td className="p-2 capitalize">{s.type}</td>
                          <td className="p-2">{subjectToFaculty[s.id] || s.staff || '-'}</td>
                        </tr>
                      ))}
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
                                  <span className="text-xs text-muted-foreground">-</span>
                                  <span className="text-xs text-muted-foreground">•</span>
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
                {(special.seminar || special.library || special.counselling) && (
                  <tr className="border-b">
                    <td className="p-2">-</td>
                    <td className="p-2">SC/SEM/LIB</td>
                    <td className="p-2">Student Counselling / Seminar / Library</td>
                    <td className="p-2">{(special.seminar ? 2 : 0) + (special.library ? 1 : 0) + (special.counselling ? 2 : 0)}</td>
                    <td className="p-2">special</td>
                    <td className="p-2">{classCounselorName || '-'}</td>
                  </tr>
                )}
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
