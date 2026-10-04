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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import Navbar from "@/components/navbar/Navbar";
import AdminNavbar from "@/components/navbar/AdminNavbar";
import FacultyNavbar from "@/components/navbar/facultyadmin";
import SelectionHeader from "@/components/admin/SelectionHeader";
import { useDarkMode } from "@/context/DarkModeContext";

interface Subject { id: string; name: string; type: string; hours_per_week: number }
interface Faculty { id: string; name: string }

const SectionManagement = () => {
  const { isDark } = useDarkMode();
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
        (supabase as any).from('departments').select('name').eq('id', id).maybeSingle(),
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

  const cardGlass = isDark
    ? "bg-[#090d1c]/80 backdrop-blur-2xl border border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_12px_-2px_rgba(99,102,241,0.12)] text-white"
    : "bg-white/80 backdrop-blur-2xl border border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06),0_0_10px_-2px_rgba(99,102,241,0.05)] text-slate-900";

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

      {userType === 'super' ? <Navbar /> : userType === 'faculty' ? <FacultyNavbar /> : <AdminNavbar />}
      <main className={`transition-all duration-300 relative z-10 ${
        userType === 'faculty' ? "" : "md:pl-72"
      } ${
        userType === 'super' ? "pt-16 md:pt-16" : userType === 'faculty' ? "" : "pt-16 md:pt-0"
      }`}>
        <SelectionHeader />
        <section className="max-w-7xl mx-auto px-6 sm:px-8 py-8 md:py-10 space-y-8">
        <header className={`flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl backdrop-blur-2xl border transition-all duration-300 ${
          isDark ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.4)]" : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06)]"
        }`}>
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-500 dark:text-indigo-300 text-xs font-bold border border-indigo-500/20 mb-2">
              <span>Section Workspace</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">{deptName || 'Department'} — Year {year} — Section {section}</h1>
            <p className="text-sm text-muted-foreground mt-1">Assign subjects, view timetable metrics, and configure lab allocations</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className={`rounded-xl border font-semibold ${
              isDark ? "border-indigo-500/30 bg-[#0e1326] text-white hover:bg-white/10" : "border-indigo-200 bg-white/80 text-slate-800 hover:bg-indigo-50"
            }`} onClick={() => navigate(userType === 'super' ? `/super-admin/departments/${id}/years/${year}` : '/admin')}>Back</Button>
            <Button className="rounded-xl font-bold shadow-md bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-400/40" onClick={exportXlsx}>Export (Excel)</Button>
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-3">
          <Card className={`rounded-3xl p-3 md:col-span-2 ${cardGlass}`}>
            <CardHeader><CardTitle className="text-lg font-semibold tracking-tight">Subject Assignments</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {subjects.map((s) => (
                  <label 
                    key={s.id} 
                    className={`flex items-center gap-3 border rounded-2xl px-4 py-3 cursor-pointer transition-all hover:shadow-sm ${
                      selected.has(s.id) 
                        ? 'bg-indigo-500/10 border-indigo-500/30 text-foreground shadow-sm' 
                        : 'bg-background/50 border-border/40 text-foreground'
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
                      <span className="font-semibold text-sm text-foreground">{s.name}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize">{s.type}</span>
                        <span className="text-[10px] text-muted-foreground">•</span>
                        <span className="text-[10px] font-medium text-muted-foreground">{s.hours_per_week} hours/week</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="mt-4">
                <Button className="rounded-xl shadow-sm" onClick={async () => { await saveAssignments(); toast.success('Assignments saved'); }}>Save assignments</Button>
              </div>
            </CardContent>
          </Card>

          <Card className={`rounded-3xl p-3 flex flex-col justify-between ${cardGlass}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold tracking-tight">Timetable Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-2xl bg-background/50 border border-border/40 backdrop-blur-md">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Filled Periods</div>
                <div className="text-4xl font-extrabold text-foreground mt-1">{timetableInfo.filled}</div>
              </div>
              <div className="text-[11px] text-muted-foreground font-medium">
                Updated: {timetableInfo.updated_at ? new Date(timetableInfo.updated_at).toLocaleString() : '-'}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 md:grid-cols-2 mt-2">
          <Card className={`rounded-3xl p-3 overflow-hidden ${cardGlass}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold tracking-tight">Faculty Assignments</CardTitle>
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
                        ? "border-indigo-500 shadow-md bg-indigo-500/5 text-foreground"
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
                        className="border-border data-[state=checked]:bg-indigo-600"
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

          <Card className={`rounded-3xl p-3 ${cardGlass}`}>
            <CardHeader className="pb-3"><CardTitle className="text-lg font-semibold tracking-tight">Lab Preferences</CardTitle></CardHeader>
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
                        ? "border-indigo-500 shadow-md bg-indigo-500/5 text-foreground"
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
                        className="border-border data-[state=checked]:bg-indigo-600"
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
      </main>
    </div>
  );
};

export default SectionManagement;
