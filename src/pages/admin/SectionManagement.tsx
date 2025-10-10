import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import * as XLSX from "xlsx";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import Navbar from "@/components/navbar/Navbar";

interface Subject { id: string; name: string; type: string; hours_per_week: number }
interface Faculty { id: string; name: string }

const SectionManagement = () => {
  const { id, year, section } = useParams();
  const navigate = useNavigate();
  const isLoggedIn = useMemo(() => localStorage.getItem("superAdmin") === "true", []);

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
    if (!isLoggedIn) { navigate('/super-admin-login', { replace: true }); return; }
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

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <section className="container py-10 md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80 md:pt-16">
        <Breadcrumbs
          segments={[
            { label: 'Super Admin', href: '/super-admin' },
            { label: 'Departments', href: '/super-admin/departments' },
            { label: deptName || 'Department', href: `/super-admin/departments/${id}` },
            { label: `Year ${year}`, href: `/super-admin/departments/${id}/years/${year}` },
            { label: `Section ${section}` },
          ]}
        />
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{deptName || 'Department'} — Year {year} — Section {section}</h1>
            <p className="text-sm text-muted-foreground">Assign subjects, view timetable, manage lab preferences</p>
          </div>
          <div className="space-x-2">
            <Button variant="outline" onClick={() => navigate(`/super-admin/departments/${id}/years/${year}`)}>Back</Button>
            <Button onClick={exportXlsx}>Export (Excel)</Button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-xl md:col-span-2">
            <CardHeader><CardTitle className="text-base">Subject assignments</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-2">
                {subjects.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 border rounded-md px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(s.id); else next.delete(s.id);
                        setSelected(next);
                      }}
                    />
                    <span className="flex-1">{s.name} <span className="text-xs text-muted-foreground">({s.type}, {s.hours_per_week}h)</span></span>
                  </label>
                ))}
              </div>
              <div className="mt-3">
                <Button onClick={async () => { await saveAssignments(); toast.success('Assignments saved'); }}>Save assignments</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl">
            <CardHeader><CardTitle className="text-base">Timetable preview</CardTitle></CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">Filled periods</div>
              <div className="text-3xl font-semibold">{timetableInfo.filled}</div>
              <div className="text-xs text-muted-foreground mt-1">Updated: {timetableInfo.updated_at ? new Date(timetableInfo.updated_at).toLocaleString() : '-'}</div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-2 mt-6">
          <Card className="rounded-xl">
            <CardHeader><CardTitle className="text-base">Faculty assignments</CardTitle></CardHeader>
            <CardContent>
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
              <Table className="mt-4">
                <TableHeader>
                  <TableRow>
                    <TableHead>Faculty</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{faculty.find(f => f.id === a.faculty_id)?.name || a.faculty_id}</TableCell>
                      <TableCell>{subjects.find(s => s.id === a.subject_id)?.name || a.subject_id}</TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="destructive">Remove</Button>
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
                                await (supabase as any).from('faculty_subject_assignments').delete().eq('id', a.id);
                                setAssignments((list) => list.filter((x) => x.id !== a.id));
                                toast.success('Assignment removed');
                              }}>Remove</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
              <Table className="mt-4">
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Morning</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {labPrefs.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell>{subjects.find(s => s.id === p.subject_id)?.name || p.subject_id}</TableCell>
                      <TableCell>{p.priority ?? '-'}</TableCell>
                      <TableCell>{p.morning_enabled ? 'Yes' : 'No'}</TableCell>
                      <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="destructive">Delete</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete lab preference?</AlertDialogTitle>
                                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={async () => {
                                  await (supabase as any).from('lab_preferences').delete().eq('id', p.id);
                                  setLabPrefs((list) => list.filter((x) => x.id !== p.id));
                                  toast.success('Preference deleted');
                                }}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      </section>
    </main>
  );
};

export default SectionManagement;
