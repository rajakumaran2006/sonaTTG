import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomTable } from "@/components/ui/CustomTable";
import { Checkbox } from "@/components/ui/checkbox";
import * as XLSX from "xlsx";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import Navbar from "@/components/navbar/Navbar";
import AdminNavbar from "@/components/navbar/AdminNavbar";
import SelectionHeader from "@/components/admin/SelectionHeader";

interface Subject { id: string; name: string; type: string; hours_per_week: number }
interface Faculty { id: string; name: string }

const SectionManagement = () => {
  const { id, year, section } = useParams();
  const navigate = useNavigate();
  const superAdmin = useMemo(() => localStorage.getItem("superAdmin") === "true", []);
  const adminUser = useMemo(() => localStorage.getItem("adminUser"), []);
  const isLoggedIn = useMemo(() => superAdmin || !!adminUser, [superAdmin, adminUser]);
  const userType = superAdmin ? 'super' : 'admin';

  const [deptName, setDeptName] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [timetableInfo, setTimetableInfo] = useState<{ filled: number; updated_at?: string }>({ filled: 0 });

  // faculty assignments
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [assignments, setAssignments] = useState<{ id: string; faculty_id: string; subject_id: string }[]>([]);
  const [assignFacultyId, setAssignFacultyId] = useState<string>("");
  const [assignSubjectId, setAssignSubjectId] = useState<string>("");

  // lab preferences
  const [labPrefs, setLabPrefs] = useState<any[]>([]);
  const [labSubjectId, setLabSubjectId] = useState<string>("");
  const [labPriority, setLabPriority] = useState<number>(1);
  const [labMorningEnabled, setLabMorningEnabled] = useState<boolean>(false);

  useEffect(() => {
    document.title = `Section ${section} — ${year}`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Manage section-specific assignments, timetable, and lab preferences.");
  }, [year, section]);

  useEffect(() => {
    if (!isLoggedIn) { navigate('/', { replace: true }); return; }
    if (!id || !year || !section) return;
    (async () => {
      const [deptRes, subjRes, secSubjRes, ttRes, facRes, fsaRes, labRes] = await Promise.all([
        (supabase as any).from('departments').select('name').eq('id', id).single(),
        (supabase as any).from('subjects').select('id,name,type,hours_per_week').eq('department_id', id).eq('year', year).order('name'),
        (supabase as any).from('section_subjects').select('subject_id').eq('department_id', id).eq('year', year).eq('section', section),
        (supabase as any).from('timetables').select('grid_data,updated_at').eq('department_id', id).eq('year', year).eq('section', section).maybeSingle(),
        (supabase as any).from('faculty_members').select('id,name').eq('department_id', id).order('name'),
        (supabase as any).from('faculty_subject_assignments').select('id,faculty_id,subject_id').eq('department_id', id).eq('year', year).eq('section', section),
        (supabase as any).from('lab_preferences').select('*').eq('department_id', id).eq('year', year).eq('section', section),
      ]);

      setDeptName(deptRes?.data?.name || "");
      setSubjects(subjRes.data || []);
      setSelected(new Set((secSubjRes.data || []).map((r: any) => r.subject_id)));

      const grid = (ttRes?.data?.grid_data as any[][]) || [];
      let filled = 0;
      for (const row of grid) for (const cell of (row || [])) if (cell !== null && cell !== undefined && String(cell).trim() !== "") filled++;
      setTimetableInfo({ filled, updated_at: ttRes?.data?.updated_at });

      setFaculty(facRes.data || []);
      setAssignments(fsaRes.data || []);
      setLabPrefs(labRes.data || []);
    })();
  }, [isLoggedIn, id, year, section]);

  const saveAssignments = async () => {
    if (!id || !year || !section) return;
    await (supabase as any).from('section_subjects').delete().eq('department_id', id).eq('year', year).eq('section', section);
    if (selected.size > 0) {
      const inserts = Array.from(selected).map((sid) => ({ department_id: id, year, section, subject_id: sid }));
      await (supabase as any).from('section_subjects').insert(inserts);
    }
  };

  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    const subjSheet = XLSX.utils.json_to_sheet(subjects.map((s) => ({
      id: s.id, name: s.name, type: s.type, hours_per_week: s.hours_per_week, assigned: selected.has(s.id) ? 'yes' : 'no'
    })));
    XLSX.utils.book_append_sheet(wb, subjSheet, 'Subjects');
    const ttSheet = XLSX.utils.aoa_to_sheet([[`Filled periods: ${timetableInfo.filled}`]]);
    XLSX.utils.book_append_sheet(wb, ttSheet, 'Timetable');
    XLSX.writeFile(wb, `section_${section}_year_${year}.xlsx`);
  };

  interface AssignmentRow {
    id: string;
    faculty_id: string;
    faculty_name: string;
    subject_id: string;
    subject_name: string;
  }

  const assignmentRows = useMemo<AssignmentRow[]>(() => {
    return assignments.map(a => {
      const s = subjects.find(sub => sub.id === a.subject_id);
      const f = faculty.find(fac => fac.id === a.faculty_id);
      return {
        id: a.id,
        faculty_id: a.faculty_id,
        faculty_name: f ? f.name : 'Unknown Faculty',
        subject_id: a.subject_id,
        subject_name: s ? s.name : 'Unknown Subject'
      };
    });
  }, [assignments, subjects, faculty]);

  interface LabPrefRow {
    id: string;
    subject_id: string;
    subject_name: string;
    priority: number;
    morning_enabled: boolean;
  }

  const labPrefRows = useMemo<LabPrefRow[]>(() => {
    return labPrefs.map(lp => {
      const s = subjects.find(sub => sub.id === lp.subject_id);
      return {
        id: lp.id,
        subject_id: lp.subject_id,
        subject_name: s ? s.name : 'Unknown Subject',
        priority: lp.priority,
        morning_enabled: lp.morning_enabled
      };
    });
  }, [labPrefs, subjects]);

  const AssignmentTable = CustomTable<AssignmentRow>;
  const LabPrefTable = CustomTable<LabPrefRow>;

  return (
    <main className="min-h-screen bg-background text-foreground">
      {userType === 'super' ? <Navbar /> : <AdminNavbar />}
      <div className={`${userType === 'faculty' ? '' : 'md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80'} animate-fade-in-up`}>
        <SelectionHeader />
        <section className="container py-4">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{deptName || 'Department'} — Year {year} — Section {section}</h1>
            <p className="text-sm text-muted-foreground">Assign subjects, view timetable, manage lab preferences</p>
          </div>
          <div className="space-x-2">
            <Button variant="outline" onClick={() => navigate(userType === 'super' ? `/super-admin/departments/${id}/years/${year}` : '/admin')}>Back</Button>
            <Button onClick={exportXlsx}>Export (Excel)</Button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-xl md:col-span-2">
            <CardHeader><CardTitle className="text-base">Subject assignments</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {subjects.map((s) => (
                  <label 
                    key={s.id} 
                    className={`flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer transition-all hover:bg-slate-50 hover:shadow-sm ${
                      selected.has(s.id) 
                        ? 'bg-olive-50/20 border-olive-500 shadow-sm' 
                        : 'bg-card/50 border-slate-200'
                    }`}
                  >
                    <Checkbox
                      checked={selected.has(s.id)}
                      onCheckedChange={(checked) => {
                        const next = new Set(selected);
                        if (checked) next.add(s.id); else next.delete(s.id);
                        setSelected(next);
                      }}
                    />
                    <div className="flex-1 flex flex-col">
                      <span className="font-semibold text-sm text-slate-800">{s.name}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 capitalize">{s.type}</span>
                        <span className="text-[10px] text-slate-400">•</span>
                        <span className="text-[10px] font-medium text-slate-500">{s.hours_per_week} hours/week</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="mt-4">
                <Button onClick={async () => { await saveAssignments(); toast.success('Assignments saved'); }}>Save assignments</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-none shadow-lg bg-gradient-to-br from-card to-secondary/30 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold">Timetable preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Filled periods</div>
              <div className="text-4xl font-extrabold text-slate-850 mt-1">{timetableInfo.filled}</div>
              <div className="text-[10px] text-muted-foreground mt-3 font-medium">
                Updated: {timetableInfo.updated_at ? new Date(timetableInfo.updated_at).toLocaleString() : '-'}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-2 mt-6">
          <Card className="rounded-2xl border border-slate-100 shadow-lg bg-card overflow-hidden">
            <CardHeader className="border-b bg-slate-50/50 pb-3">
              <CardTitle className="text-base font-bold">Faculty assignments</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid gap-2 md:grid-cols-3">
                <Select value={assignFacultyId} onValueChange={setAssignFacultyId}>
                  <SelectTrigger><SelectValue placeholder="Select faculty" /></SelectTrigger>
                  <SelectContent>
                    {faculty.map((f) => (<SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Select value={assignSubjectId} onValueChange={setAssignSubjectId}>
                  <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Button onClick={async () => {
                  if (!assignFacultyId || !assignSubjectId) return;
                  await (supabase as any).from('faculty_subject_assignments').insert({
                    faculty_id: assignFacultyId,
                    subject_id: assignSubjectId,
                    department_id: id,
                    year,
                    section,
                  });
                  const { data } = await (supabase as any).from('faculty_subject_assignments').select('id,faculty_id,subject_id').eq('department_id', id).eq('year', year).eq('section', section);
                  setAssignments(data || []);
                  setAssignFacultyId(""); setAssignSubjectId("");
                }}>Assign</Button>
              </div>
              <AssignmentTable
                data={assignmentRows}
                getRowId={(row) => row.id}
                searchKey={(row) => `${row.faculty_name} ${row.subject_name}`}
                searchPlaceholder="Search assignments..."
                exportFileName="faculty-assignments"
                onDeleteSelected={async (ids) => {
                  await (supabase as any).from('faculty_subject_assignments').delete().in('id', ids);
                  setAssignments((list) => list.filter((x) => !ids.includes(x.id)));
                  toast.success('Assignments removed');
                }}
                columns={[
                  {
                    key: "faculty_name",
                    header: "Faculty",
                    sortable: true,
                    render: (row) => <span className="font-semibold text-slate-900 dark:text-slate-100">{row.faculty_name}</span>
                  },
                  {
                    key: "subject_name",
                    header: "Subject",
                    sortable: true,
                    render: (row) => <span className="text-slate-600 dark:text-slate-400">{row.subject_name}</span>
                  },
                  {
                    key: "actions",
                    header: "Actions",
                    render: (row) => (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive" className="h-7 text-xs px-2.5">Remove</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove assignment?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will unassign the faculty from the subject in this section.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={async () => {
                              await (supabase as any).from('faculty_subject_assignments').delete().eq('id', row.id);
                              setAssignments((list) => list.filter((x) => x.id !== row.id));
                              toast.success('Assignment removed');
                            }}>Remove</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )
                  }
                ]}
                renderItemCard={(row, isSelected, onToggleSelect) => (
                  <div
                    key={row.id}
                    onClick={onToggleSelect}
                    className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer flex flex-col justify-between bg-card ${
                      isSelected
                        ? "border-emerald-500 shadow-md bg-muted/30 text-foreground"
                        : "border-border hover:border-muted-foreground/35 hover:bg-muted/10 text-foreground"
                    }`}
                  >
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-tight">{row.faculty_name}</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{row.subject_name}</p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleSelect()}
                        onClick={(e) => e.stopPropagation()}
                        className="border-border data-[state=checked]:bg-emerald-500"
                      />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="h-6 px-2.5 rounded-lg text-[10px] font-medium transition-colors bg-destructive/20 hover:bg-destructive/30 text-destructive-foreground"
                          >
                            Remove
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove assignment?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will unassign the faculty from the subject in this section.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={async () => {
                              await (supabase as any).from('faculty_subject_assignments').delete().eq('id', row.id);
                              setAssignments((list) => list.filter((x) => x.id !== row.id));
                              toast.success('Assignment removed');
                            }}>Remove</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                )}
              />
            </CardContent>
          </Card>

          <Card className="rounded-xl">
            <CardHeader><CardTitle className="text-base">Lab preferences</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-4">
                <Select value={labSubjectId} onValueChange={setLabSubjectId}>
                  <SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger>
                  <SelectContent>
                    {subjects.filter(s => s.type === 'lab').map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Input type="number" min={1} max={10} value={labPriority} onChange={(e) => setLabPriority(parseInt(e.target.value || '1', 10))} placeholder="Priority" />
                <Button variant={labMorningEnabled ? 'default' : 'outline'} onClick={() => setLabMorningEnabled(v => !v)}>{labMorningEnabled ? 'Morning' : 'Any time'}</Button>
                <Button onClick={async () => {
                  if (!labSubjectId) return;
                  await (supabase as any).from('lab_preferences').insert({
                    department_id: id,
                    year,
                    section,
                    subject_id: labSubjectId,
                    priority: labPriority,
                    morning_enabled: labMorningEnabled,
                  });
                  const { data } = await (supabase as any).from('lab_preferences').select('*').eq('department_id', id).eq('year', year).eq('section', section);
                  setLabPrefs(data || []);
                  setLabSubjectId(""); setLabPriority(1); setLabMorningEnabled(false);
                }}>Add preference</Button>
              </div>
              <LabPrefTable
                data={labPrefRows}
                getRowId={(row) => row.id}
                searchKey={(row) => row.subject_name}
                searchPlaceholder="Search preferences..."
                exportFileName="lab-preferences"
                onDeleteSelected={async (ids) => {
                  await (supabase as any).from('lab_preferences').delete().in('id', ids);
                  setLabPrefs((list) => list.filter((x) => !ids.includes(x.id)));
                  toast.success('Preferences deleted');
                }}
                columns={[
                  {
                    key: "subject_name",
                    header: "Subject",
                    sortable: true,
                    render: (row) => <span className="font-semibold text-slate-900 dark:text-slate-100">{row.subject_name}</span>
                  },
                  {
                    key: "priority",
                    header: "Priority",
                    sortable: true,
                    render: (row) => <span className="text-slate-600 dark:text-slate-400">{row.priority ?? '-'}</span>
                  },
                  {
                    key: "morning_enabled",
                    header: "Morning",
                    sortable: true,
                    render: (row) => (
                      <Badge variant={row.morning_enabled ? 'default' : 'outline'} className="text-[10px]">
                        {row.morning_enabled ? 'Yes' : 'No'}
                      </Badge>
                    )
                  },
                  {
                    key: "actions",
                    header: "Actions",
                    render: (row) => (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive" className="h-7 text-xs px-2.5">Delete</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete lab preference?</AlertDialogTitle>
                            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={async () => {
                              await (supabase as any).from('lab_preferences').delete().eq('id', row.id);
                              setLabPrefs((list) => list.filter((x) => x.id !== row.id));
                              toast.success('Preference deleted');
                            }}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )
                  }
                ]}
                renderItemCard={(row, isSelected, onToggleSelect) => (
                  <div
                    key={row.id}
                    onClick={onToggleSelect}
                    className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer flex flex-col justify-between bg-card ${
                      isSelected
                        ? "border-emerald-500 shadow-md bg-muted/30 text-foreground"
                        : "border-border hover:border-muted-foreground/35 hover:bg-muted/10 text-foreground"
                    }`}
                  >
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-tight">{row.subject_name}</h4>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">Priority: {row.priority ?? '-'}</span>
                        <span className="text-slate-300 dark:text-slate-600">•</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">Morning: {row.morning_enabled ? 'Yes' : 'No'}</span>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleSelect()}
                        onClick={(e) => e.stopPropagation()}
                        className="border-border data-[state=checked]:bg-emerald-500"
                      />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="h-6 px-2.5 rounded-lg text-[10px] font-medium transition-colors bg-destructive/20 hover:bg-destructive/30 text-destructive-foreground"
                          >
                            Delete
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete lab preference?</AlertDialogTitle>
                            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={async () => {
                              await (supabase as any).from('lab_preferences').delete().eq('id', row.id);
                              setLabPrefs((list) => list.filter((x) => x.id !== row.id));
                              toast.success('Preference deleted');
                            }}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                )}
              />
            </CardContent>
          </Card>
        </section>
      </section>
    </div>
  </main>
);
};

export default SectionManagement;
