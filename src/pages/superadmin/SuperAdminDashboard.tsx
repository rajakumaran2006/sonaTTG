import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import Navbar from "@/components/navbar/Navbar";
import { Calendar, GitPullRequest, Clock, Users, BookOpen, BarChart3 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Department = { id: string; name: string };

type Stat = { label: string; value: number | string };

type Activity = { id: string; type: 'department' | 'subject' | 'faculty' | 'timetable'; title: string; at: string };
async function countTimetablePeriods(departmentId: string): Promise<number> {
  const { data, error } = await (supabase as any)
    .from('timetables')
    .select('grid_data');
  if (error) throw error;
  const rows = (data || []).filter((r: any) => r.department_id === departmentId || r.departmentId === departmentId);
  let total = 0;
  for (const r of rows) {
    const grid: any[][] = r.grid_data || [];
    for (const row of grid || []) {
      for (const cell of row || []) {
        if (cell !== null && cell !== undefined && String(cell).trim() !== "") total += 1;
      }
    }
  }
  return total;
}

const SuperAdminDashboard = () => {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptId, setDeptId] = useState<string>("");
  const [stats, setStats] = useState<Stat[]>([]);
  const [overview, setOverview] = useState({ departments: 0, faculty: 0, timetables: 0, subjects: 0 });
  const [timetableSummary, setTimetableSummary] = useState({ 
    totalClasses: 0, 
    totalPeriods: 0, 
    avgPeriodsPerClass: 0,
    departmentBreakdown: [] as Array<{ name: string; count: number; id: string }>
  });
  const [recent, setRecent] = useState<Activity[]>([]);
  const [openAdd, setOpenAdd] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const isLoggedIn = useMemo(() => localStorage.getItem("superAdmin") === "true", []);
  useEffect(() => {
    document.title = "Super Admin - Dashboard";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Department summary, subjects and faculty statistics for Super Admin.");
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/super-admin-login", { replace: true });
      return;
    }
    (async () => {
      const [deptRes, facultyCountRes, ttCountRes, subjCountRes, recentSubjects, recentFaculty, recentTimetables, recentDepartments] = await Promise.all([
        (supabase as any).from('departments').select('*').order('name'),
        (supabase as any).from('faculty_members').select('*', { count: 'exact', head: true }),
        (supabase as any).from('timetables').select('*', { count: 'exact', head: true }),
        (supabase as any).from('subjects').select('*', { count: 'exact', head: true }),
        (supabase as any).from('subjects').select('id,name,updated_at,department_id,year').order('updated_at', { ascending: false }).limit(10),
        (supabase as any).from('faculty_members').select('id,name,updated_at,department_id').order('updated_at', { ascending: false }).limit(10),
        (supabase as any).from('timetables').select('id,updated_at,department_id,year,section').order('updated_at', { ascending: false }).limit(10),
        (supabase as any).from('departments').select('id,name,created_at').order('created_at', { ascending: false }).limit(10),
      ]);

      const deptData = deptRes.data || [];
      setDepartments(deptData);
      if (!deptId && deptData?.[0]?.id) setDeptId(deptData[0].id);

      setOverview({
        departments: deptData.length,
        faculty: facultyCountRes?.count || 0,
        timetables: ttCountRes?.count || 0,
        subjects: subjCountRes?.count || 0,
      });

      const acts: Activity[] = [
        ...((recentDepartments.data || []).map((r: any) => ({ id: r.id, type: 'department' as const, title: `Department created: ${r.name}`, at: r.created_at }))),
        ...((recentSubjects.data || []).map((r: any) => ({ id: r.id, type: 'subject' as const, title: `Subject updated: ${r.name} (${r.year})`, at: r.updated_at }))),
        ...((recentFaculty.data || []).map((r: any) => ({ id: r.id, type: 'faculty' as const, title: `Faculty updated: ${r.name}`, at: r.updated_at }))),
        ...((recentTimetables.data || []).map((r: any) => ({ id: r.id, type: 'timetable' as const, title: `Timetable updated: ${r.year}-${r.section}`, at: r.updated_at }))),
      ]
        .filter((a) => a.at)
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 10);
      setRecent(acts);

      // Calculate timetable summary
      const timetableData = recentTimetables.data || [];
      let totalPeriods = 0;
      const deptBreakdown: Record<string, number> = {};
      
      for (const tt of timetableData) {
        // Count filled periods in grid
        if (tt.grid_data && Array.isArray(tt.grid_data)) {
          for (const row of tt.grid_data) {
            if (Array.isArray(row)) {
              for (const cell of row) {
                if (cell && typeof cell === 'string' && cell.trim() && 
                    !['BREAK', 'LUNCH'].includes(cell.trim())) {
                  totalPeriods++;
                }
              }
            }
          }
        }
        
        // Count by department
        if (tt.department_id) {
          deptBreakdown[tt.department_id] = (deptBreakdown[tt.department_id] || 0) + 1;
        }
      }

      const dmap: Record<string, string> = {};
      (deptData || []).forEach((d: any) => dmap[d.id] = d.name);

      const departmentBreakdown = Object.entries(deptBreakdown).map(([deptId, count]) => ({
        id: deptId,
        name: dmap[deptId] || deptId,
        count
      }));

      setTimetableSummary({
        totalClasses: timetableData.length,
        totalPeriods,
        avgPeriodsPerClass: timetableData.length > 0 ? Math.round(totalPeriods / timetableData.length) : 0,
        departmentBreakdown
      });
    })();
  }, [isLoggedIn]);

  useEffect(() => {
    if (!deptId) return;
    (async () => {
      const [{ count: subjCount }, { count: staffCount }] = await Promise.all([
        (supabase as any).from('subjects').select('*', { count: 'exact', head: true }).eq('department_id', deptId),
        (supabase as any).from('faculty_members').select('*', { count: 'exact', head: true }).eq('department_id', deptId),
      ]);
      const periods = await countTimetablePeriods(deptId);
      setStats([
        { label: 'Total weekly periods (all sections)', value: periods || 0 },
        { label: 'Total subjects', value: subjCount || 0 },
         { label: 'Faculty members', value: staffCount || 0 },
      ]);
    })();
  }, [deptId]);

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <section className="container py-10 md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80 md:pt-16">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="secondary" onClick={() => setOpenAdd(true)}>Add Department</Button>
            <Button variant="outline" onClick={() => navigate('/super-admin/admin-management')}>Manage Admins</Button>
            <Button variant="outline" onClick={() => navigate('/super-admin/departments?bulk=1')}>Bulk Import</Button>
            <Button variant="outline" onClick={() => navigate('/super-admin/settings')}>System Settings</Button>
          </div>
        </header>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Overview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <section className="mb-8">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="rounded-xl cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/super-admin/departments')}>
                  <CardHeader>
                    <CardTitle className="text-base">Total Departments</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold">{overview.departments}</div>
                  </CardContent>
                </Card>
                <Card className="rounded-xl">
                  <CardHeader>
                    <CardTitle className="text-base">Total Faculty</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold">{overview.faculty}</div>
                  </CardContent>
                </Card>
                <Card className="rounded-xl">
                  <CardHeader>
                    <CardTitle className="text-base">Active Timetables</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold">{overview.timetables}</div>
                  </CardContent>
                </Card>
                <Card className="rounded-xl">
                  <CardHeader>
                    <CardTitle className="text-base">Total Subjects</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold">{overview.subjects}</div>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* Timetable Summary Section */}
            <section className="mb-8">
              <header className="mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Timetable Summary
                </h2>
                <p className="text-sm text-muted-foreground">Overview of all active timetables across departments</p>
              </header>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
                <Card className="rounded-xl">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Total Classes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold text-blue-600">{timetableSummary.totalClasses}</div>
                  </CardContent>
                </Card>

                <Card className="rounded-xl">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Total Periods
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold text-green-600">{timetableSummary.totalPeriods}</div>
                  </CardContent>
                </Card>

                <Card className="rounded-xl">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BookOpen className="h-4 w-4" />
                      Avg Periods/Class
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold text-purple-600">{timetableSummary.avgPeriodsPerClass}</div>
                  </CardContent>
                </Card>

                <Card className="rounded-xl">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Active Departments
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold text-orange-600">{timetableSummary.departmentBreakdown.length}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Department Breakdown */}
              {timetableSummary.departmentBreakdown.length > 0 && (
                <Card className="rounded-xl">
                  <CardHeader>
                    <CardTitle className="text-base">Department Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {timetableSummary.departmentBreakdown.map((dept) => (
                        <div key={dept.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                          <span className="font-medium">{dept.name}</span>
                          <span className="text-sm text-muted-foreground">{dept.count} classes</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </section>

            <section className="grid gap-8 md:grid-cols-3">
              <div className="md:col-span-2">
                <header className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Department Summary</h2>
                    <p className="text-sm text-muted-foreground">Overview of the selected department</p>
                  </div>
                  <Button variant="secondary" onClick={() => navigate('/super-admin/departments')}>Manage Departments</Button>
                </header>

                <div className="max-w-xl mb-6">
                  <Select value={deptId} onValueChange={setDeptId}>
                    <SelectTrigger className="border-2 border-black">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent className="border-2 border-black">
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id} className="border-b border-gray-200 last:border-b-0">{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 md:grid-cols-3 mb-6">
                  {stats.map((s) => (
                    <Card key={s.label} className="rounded-xl">
                      <CardHeader>
                        <CardTitle className="text-base">{s.label}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-semibold">{s.value}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Quick Action Buttons */}
                <div className="flex items-center gap-4 mb-4">
                  <Button
                    onClick={() => navigate('/current-timetables')}
                    variant="default"
                    className="flex items-center gap-2"
                  >
                    <Calendar className="h-4 w-4" />
                    View Current Timetables
                  </Button>
                  <Button
                    onClick={() => navigate('/pull-requests')}
                    variant="outline"
                    className="flex items-center gap-2 border-2 border-black"
                  >
                    <GitPullRequest className="h-4 w-4" />
                    Pull Requests
                  </Button>
                </div>
              </div>

              <aside>
                <Card className="rounded-xl">
                  <CardHeader>
                    <CardTitle className="text-base">Recent Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3 text-sm">
                      {recent.length === 0 && <li className="text-muted-foreground">No recent changes</li>}
                      {recent.map((a) => (
                        <li key={a.id} className="flex items-start justify-between">
                          <span className="pr-3">{a.title}</span>
                          <time className="text-muted-foreground">{new Date(a.at).toLocaleString()}</time>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </aside>
            </section>
          </TabsContent>

        </Tabs>
      </section>

      <Dialog open={openAdd} onOpenChange={setOpenAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Department</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Input placeholder="Department name" value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenAdd(false)}>Cancel</Button>
            <Button onClick={async () => {
              const name = newDeptName.trim();
              if (!name) { toast.error('Please enter a name'); return; }
              const { error } = await (supabase as any).from('departments').insert({ name });
              if (error) { toast.error('Failed to add department'); return; }
              toast.success('Department added');
              setNewDeptName("");
              setOpenAdd(false);
              // refresh
              const { data } = await (supabase as any).from('departments').select('*').order('name');
              setDepartments(data || []);
              setOverview((o) => ({ ...o, departments: (data || []).length }));
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default SuperAdminDashboard;
