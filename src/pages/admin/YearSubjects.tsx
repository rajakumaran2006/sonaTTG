import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSubjectsForYear } from "@/lib/supabaseService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import Navbar from "@/components/navbar/Navbar";

interface SubjectRow {
  id: string;
  name: string;
  type: 'theory' | 'lab' | 'elective' | 'open elective';
  hours_per_week: number;
  year: string;
  code: string | null;
  max_faculty_count?: number;
  credits?: number;
}

const YearSubjects = () => {
  const { id, year } = useParams();
  const navigate = useNavigate();
  const isLoggedIn = useMemo(() => localStorage.getItem("superAdmin") === "true", []);
  const [deptName, setDeptName] = useState<string>("");
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [facultyInYear, setFacultyInYear] = useState<number>(0);

  // form state for add/edit
  const [name, setName] = useState("");
  const [type, setType] = useState<'theory' | 'lab' | 'elective' | 'open elective'>("theory");
  const [hours, setHours] = useState<number>(1);
  const [code, setCode] = useState("");
  const [maxFacultyCount, setMaxFacultyCount] = useState<number>(1);
  const [credits, setCredits] = useState<number>(3);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState<boolean>(true);

  const totalHours = subjects.reduce((s, r) => s + (r.hours_per_week || 0), 0);
  
  // Calculate hours by type for better breakdown
  const hoursByType = subjects.reduce((acc, subject) => {
    const type = subject.type;
    acc[type] = (acc[type] || 0) + (subject.hours_per_week || 0);
    return acc;
  }, {} as Record<string, number>);

  useEffect(() => {
    document.title = `Manage Subjects - ${year}`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Add, update, and delete subjects for the selected department year.");
  }, [year]);

  useEffect(() => {
    if (!isLoggedIn) { navigate('/super-admin-login', { replace: true }); return; }
    if (!id || !year) return;
    (async () => {
      const { data: d } = await (supabase as any).from('departments').select('*').eq('id', id).single();
      if (d?.name) setDeptName(d.name);
      const list = await (async () => {
        try {
                  const arr = await getSubjectsForYear(id, year);
        return (arr || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          type: s.type,
          hours_per_week: s.hoursPerWeek,
          year: year,
          code: s.code || null,
          max_faculty_count: s.maxFacultyCount || 1,
        }));
        } catch {
          return [] as SubjectRow[];
        }
      })();
      setSubjects(list);
      const [ttRes, fsaRes] = await Promise.all([
        (supabase as any).from('timetables').select('section').eq('department_id', id).eq('year', year),
        (supabase as any).from('faculty_subject_assignments').select('*', { count: 'exact', head: true }).eq('department_id', id).eq('year', year),
      ]);
      const secs: string[] = Array.from(new Set<string>((ttRes.data || []).map((t: any) => String(t.section))));
      setSections(secs);
      setFacultyInYear(fsaRes?.count || 0);
      setLoading(false);
    })();
  }, [isLoggedIn, id, year]);

  const resetForm = () => { setName(""); setType("theory"); setHours(1); setCode(""); setMaxFacultyCount(1); setCredits(3); setEditingId(null); };

  const handleAdd = async () => {
    if (!name.trim()) { toast.error("Subject name is required"); return; }
    
    const nextTotal = totalHours + hours;
    if (nextTotal > 42) { toast.error("Total hours for this year cannot exceed 42"); return; }
    
    try {
      const subjectData: any = {
        department_id: id,
        year,
        name: name.trim(),
        type,
        hours_per_week: hours,
        code: code.trim() || null,
        credits: credits,
      };
      
      // Add max_faculty_count for lab subjects
      if (type === 'lab') {
        subjectData.max_faculty_count = maxFacultyCount;
      }
      
      const { data, error } = await (supabase as any).from('subjects').insert(subjectData).select().single();
      if (error) { 
        console.error('Subject addition error:', error);
        toast.error(`Failed to add subject: ${error.message}`); 
        return; 
      }
      setSubjects((s) => [...s, data as SubjectRow]);
      toast.success("Subject added");
      resetForm();
    } catch (err: any) {
      console.error('Unexpected error:', err);
      toast.error(`Failed to add subject: ${err.message || 'Unknown error'}`);
    }
  };

  const handleDelete = async (sid: string) => {
    const { error } = await (supabase as any).from('subjects').delete().eq('id', sid);
    if (error) { toast.error("Failed to delete"); return; }
    setSubjects((s) => s.filter((x) => x.id !== sid));
    toast.success("Deleted");
  };

  const startEdit = (s: SubjectRow) => {
    setEditingId(s.id);
    setName(s.name);
    setType(s.type);
    setHours(s.hours_per_week);
    setCode(s.code || "");
    setMaxFacultyCount(s.max_faculty_count || 1);
    setCredits(s.credits || 3);
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    const original = subjects.find((s) => s.id === editingId);
    const nextTotal = totalHours - (original?.hours_per_week || 0) + hours;
    if (nextTotal > 42) { toast.error("Total hours for this year cannot exceed 42"); return; }

    try {
      const updateData: any = { 
        name, 
        type, 
        hours_per_week: hours, 
        code: code || null,
        credits: credits
      };
      
      // Update max_faculty_count for lab subjects
      if (type === 'lab') {
        updateData.max_faculty_count = maxFacultyCount;
      }

      const { error } = await (supabase as any)
        .from('subjects')
        .update(updateData)
        .eq('id', editingId);

      if (error) throw error;

      setSubjects((list) => list.map((x) =>
        x.id === editingId ? { ...x, name, type, hours_per_week: hours, code: code || null, credits: credits, max_faculty_count: type === 'lab' ? maxFacultyCount : x.max_faculty_count } : x
      ));
      toast.success("Subject updated successfully");
      setEditOpen(false);
      resetForm();
    } catch (e: any) {
      console.error('Update error:', e);
      toast.error(e?.message || "Failed to update subject");
    }
  };

  // Edit modal UI
  // Simple dialog to edit a subject row
  // Reuses the same state variables (name, type, hours, code)

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <section className="container py-10 md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80 md:pt-16">
        <Breadcrumbs
          segments={[
            { label: 'Super Admin', href: '/super-admin' },
            { label: 'Departments', href: '/super-admin/departments' },
            { label: deptName || 'Department', href: `/super-admin/departments/${id}` },
            { label: `Year ${year}` },
          ]}
        />
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{deptName || 'Department'} — Year {year}</h1>
            <div className="text-sm text-muted-foreground">
              <div>Total hours: {totalHours}/42</div>
              {Object.keys(hoursByType).length > 0 && (
                <div className="flex gap-4 mt-1">
                  {Object.entries(hoursByType).map(([type, hours]) => (
                    <span key={type} className="capitalize">
                      {type}: {hours}h
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate(`/super-admin/departments/${id}`)}>Back</Button>
        </header>

        <Card className="rounded-xl mb-6">
          <CardHeader>
            <CardTitle className="text-base">Add new subject</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-5">
              <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="theory">Theory</SelectItem>
                  <SelectItem value="lab">Lab</SelectItem>
                  <SelectItem value="elective">Elective</SelectItem>
                  <SelectItem value="open elective">Open Elective</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" min={0} max={42} value={hours} onChange={(e) => setHours(parseInt(e.target.value || '0', 10))} placeholder="Hours/week" />
              <Input type="number" min={1} max={6} value={credits} onChange={(e) => setCredits(parseInt(e.target.value || '3', 10))} placeholder="Credits" />
              <Input placeholder="Code (optional)" value={code} onChange={(e) => setCode(e.target.value)} />
              <Button onClick={handleAdd} disabled={!name.trim()}>Add</Button>
            </div>
            
            {/* Max Faculty Count for Lab Subjects */}
            {type === 'lab' && (
              <div className="mt-3">
                <div className="flex items-center space-x-3">
                  <label className="text-sm font-medium">Maximum Faculty Members:</label>
                  <Select value={maxFacultyCount.toString()} onValueChange={(v: string) => setMaxFacultyCount(parseInt(v))}>
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                      <SelectItem value="4">4</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">
                    Maximum number of faculty members that can be assigned to this lab subject
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl mb-6">
          <CardHeader>
            <CardTitle className="text-base">Sections</CardTitle>
          </CardHeader>
          <CardContent>
            {sections.length === 0 && <div className="text-sm text-muted-foreground">No sections yet. Generate a timetable to create sections.</div>}
            <div className="grid gap-2 md:grid-cols-3">
              {sections.map((sec) => (
                <div key={sec} className="flex items-center justify-between border rounded-md px-3 py-2">
                  <div className="font-medium">Section {sec}</div>
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/super-admin/departments/${id}/years/${encodeURIComponent(year || '')}/sections/${encodeURIComponent(sec)}`)}>Open</Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl mb-6">
          <CardHeader>
            <CardTitle className="text-base">Year statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <div className="text-xs text-muted-foreground">Total sections</div>
                <div className="text-2xl font-semibold">{sections.length}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Faculty teaching</div>
                <div className="text-2xl font-semibold">{facultyInYear}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total hours/week</div>
                <div className="text-2xl font-semibold">{totalHours}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Theory vs Lab hours</div>
                <div className="text-2xl font-semibold">
                  {subjects.filter(s=>s.type==='theory').reduce((a,b)=>a+(b.hours_per_week||0),0)} / {subjects.filter(s=>s.type==='lab').reduce((a,b)=>a+(b.hours_per_week||0),0)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="text-base">Subjects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 max-w-sm">
              <Input placeholder="Search subjects..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Hours/week</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Max Faculty</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  subjects
                    .filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
                    .map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.name}</TableCell>
                        <TableCell className="capitalize">{s.type}</TableCell>
                        <TableCell>{s.hours_per_week}</TableCell>
                        <TableCell>{s.credits || 3}</TableCell>
                        <TableCell>{s.code || '-'}</TableCell>
                        <TableCell>{s.type === 'lab' ? (s.max_faculty_count || 1) : '-'}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button size="sm" variant="outline" onClick={() => startEdit(s)}>Edit</Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="destructive">Delete</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete subject?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove the subject and related assignments. You can’t undo this action.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(s.id)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="mt-6">
          <Link className="text-sm underline text-muted-foreground hover:text-foreground" to="/super-admin/departments">Back to Departments</Link>
        </div>
      </section>

      {/* Edit Subject Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit subject</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-4">
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Select value={type} onValueChange={(v: any) => setType(v)}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="theory">Theory</SelectItem>
                <SelectItem value="lab">Lab</SelectItem>
                <SelectItem value="elective">Elective</SelectItem>
                <SelectItem value="open elective">Open Elective</SelectItem>
              </SelectContent>
            </Select>
            <Input type="number" min={0} max={42} value={hours} onChange={(e) => setHours(parseInt(e.target.value || '0', 10))} placeholder="Hours/week" />
            <Input type="number" min={1} max={6} value={credits} onChange={(e) => setCredits(parseInt(e.target.value || '3', 10))} placeholder="Credits" />
            <Input placeholder="Code (optional)" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          
          {/* Max Faculty Count for Lab Subjects in Edit */}
          {type === 'lab' && (
            <div className="mt-3">
              <div className="flex items-center space-x-3">
                <label className="text-sm font-medium">Maximum Faculty Members:</label>
                <Select value={maxFacultyCount.toString()} onValueChange={(v: string) => setMaxFacultyCount(parseInt(v))}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="4">4</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                  Maximum number of faculty members that can be assigned to this lab subject
                </span>
              </div>
            </div>
          )}
          <div className="mt-4 flex items-center gap-2 justify-end">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default YearSubjects;
