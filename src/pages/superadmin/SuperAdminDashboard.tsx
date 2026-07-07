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
import { Calendar, GitPullRequest, Clock, Users, BookOpen, BarChart3, Building2, Plus, Settings, Upload, Activity as ActivityIcon } from "lucide-react";
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
      navigate("/", { replace: true });
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
      <div className="md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80 transition-all duration-300">
        <section className="px-6 md:px-10 lg:px-12 py-10 md:pt-24 max-w-[1600px] mx-auto w-full space-y-8">
          <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/60 pb-6 mb-2">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground" style={{ fontFamily: 'Outfit, sans-serif' }}>
                SUPER ADMIN CONSOLE
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Configure system settings, monitor department health, and authorize admins.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => setOpenAdd(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm transition-all flex items-center gap-1.5 h-10">
                <Plus className="h-4.5 w-4.5" />
                <span>Add Department</span>
              </Button>
              <Button variant="outline" onClick={() => navigate('/super-admin/admin-management')} className="rounded-xl border border-input hover:bg-muted/50 transition-all flex items-center gap-1.5 h-10 bg-background text-foreground">
                <Users className="h-4.5 w-4.5" />
                <span>Manage Admins</span>
              </Button>
              <Button variant="outline" onClick={() => navigate('/super-admin/departments?bulk=1')} className="rounded-xl border border-input hover:bg-muted/50 transition-all flex items-center gap-1.5 h-10 bg-background text-foreground">
                <Upload className="h-4.5 w-4.5" />
                <span>Bulk Import</span>
              </Button>
              <Button variant="outline" onClick={() => navigate('/super-admin/settings')} className="rounded-xl border border-input hover:bg-muted/50 transition-all flex items-center gap-1.5 h-10 bg-background text-foreground">
                <Settings className="h-4.5 w-4.5" />
                <span>System Settings</span>
              </Button>
            </div>
          </header>

          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="inline-flex h-11 items-center justify-start rounded-xl bg-muted p-1 text-muted-foreground w-auto min-w-[150px]">
              <TabsTrigger value="overview" className="inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">
                <BarChart3 className="h-4 w-4 mr-2" />
                Overview
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <section className="mb-8">
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Total Departments */}
                  <Card 
                    className="rounded-2xl border border-border bg-card/50 shadow-sm hover:shadow-md hover:border-emerald-500/30 transition-all duration-300 cursor-pointer flex flex-col justify-between"
                    onClick={() => navigate('/super-admin/departments')}
                  >
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                      <span className="text-sm font-semibold text-muted-foreground">Total Departments</span>
                      <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-455">
                        <Building2 className="h-4 w-4" />
                      </div>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <div className="text-3xl font-extrabold tracking-tight text-foreground">{overview.departments}</div>
                      <p className="text-[10px] text-muted-foreground mt-1">Manage academic branches</p>
                    </CardContent>
                  </Card>

                  {/* Total Faculty */}
                  <Card 
                    className="rounded-2xl border border-border bg-card/50 shadow-sm hover:shadow-md hover:border-blue-500/30 transition-all duration-300 cursor-pointer flex flex-col justify-between"
                    onClick={() => navigate('/super-admin/faculty')}
                  >
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                      <span className="text-sm font-semibold text-muted-foreground">Total Faculty</span>
                      <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-450">
                        <Users className="h-4 w-4" />
                      </div>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <div className="text-3xl font-extrabold tracking-tight text-foreground">{overview.faculty}</div>
                      <p className="text-[10px] text-muted-foreground mt-1">Active teaching staff</p>
                    </CardContent>
                  </Card>

                  {/* Active Timetables */}
                  <Card 
                    className="rounded-2xl border border-border bg-card/50 shadow-sm hover:shadow-md hover:border-violet-500/30 transition-all duration-300 cursor-pointer flex flex-col justify-between"
                    onClick={() => navigate('/current-timetables')}
                  >
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                      <span className="text-sm font-semibold text-muted-foreground">Active Timetables</span>
                      <div className="p-2 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-455">
                        <Calendar className="h-4 w-4" />
                      </div>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <div className="text-3xl font-extrabold tracking-tight text-foreground">{overview.timetables}</div>
                      <p className="text-[10px] text-muted-foreground mt-1">Live section schedules</p>
                    </CardContent>
                  </Card>

                  {/* Total Subjects */}
                  <Card 
                    className="rounded-2xl border border-border bg-card/50 shadow-sm hover:shadow-md hover:border-amber-500/30 transition-all duration-300 cursor-pointer flex flex-col justify-between"
                  >
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                      <span className="text-sm font-semibold text-muted-foreground">Total Subjects</span>
                      <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-450">
                        <BookOpen className="h-4 w-4" />
                      </div>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <div className="text-3xl font-extrabold tracking-tight text-foreground">{overview.subjects}</div>
                      <p className="text-[10px] text-muted-foreground mt-1">Curriculum courses</p>
                    </CardContent>
                  </Card>
                </div>
              </section>

              {/* Timetable Summary Section */}
              <section className="mb-8 p-6 rounded-3xl border border-border bg-card/30 backdrop-blur-sm shadow-sm space-y-6">
                <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
                      <BarChart3 className="h-5 w-5 text-emerald-500" />
                      Timetable Summary
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Overview of all active timetables across departments</p>
                  </div>
                </header>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Card className="rounded-2xl border border-border/60 shadow-sm bg-card/50">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                      <span className="text-sm font-semibold text-muted-foreground">Total Classes</span>
                      <Calendar className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent className="pt-2">
                      <div className="text-3xl font-extrabold text-blue-600 dark:text-blue-450">{timetableSummary.totalClasses}</div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border border-border/60 shadow-sm bg-card/50">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                      <span className="text-sm font-semibold text-muted-foreground">Total Periods</span>
                      <Clock className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent className="pt-2">
                      <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-455">{timetableSummary.totalPeriods}</div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border border-border/60 shadow-sm bg-card/50">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                      <span className="text-sm font-semibold text-muted-foreground">Avg Periods/Class</span>
                      <BookOpen className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent className="pt-2">
                      <div className="text-3xl font-extrabold text-purple-600 dark:text-purple-455">{timetableSummary.avgPeriodsPerClass}</div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border border-border/60 shadow-sm bg-card/50">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                      <span className="text-sm font-semibold text-muted-foreground">Active Departments</span>
                      <Users className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent className="pt-2">
                      <div className="text-3xl font-extrabold text-orange-600 dark:text-orange-455">{timetableSummary.departmentBreakdown.length}</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Department Breakdown */}
                {timetableSummary.departmentBreakdown.length > 0 && (
                  <Card className="rounded-2xl border border-border/50 shadow-sm bg-card/40">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold text-muted-foreground">Department Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {timetableSummary.departmentBreakdown.map((dept) => (
                          <div key={dept.id} className="flex items-center justify-between p-3 bg-muted/30 border border-border/30 rounded-xl transition-all hover:bg-muted/50">
                            <span className="font-semibold text-sm text-foreground">{dept.name}</span>
                            <span className="text-xs font-medium px-2 py-1 bg-background border border-border rounded-lg text-muted-foreground">{dept.count} classes</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </section>

              <section className="grid gap-8 md:grid-cols-3">
                <div className="md:col-span-2 p-6 rounded-3xl border border-border bg-card/30 backdrop-blur-sm shadow-sm space-y-6">
                  <header className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-foreground">Department Summary</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">Overview of the selected department</p>
                    </div>
                    <Button variant="secondary" onClick={() => navigate('/super-admin/departments')} className="h-9 rounded-xl text-xs font-semibold px-4">
                      Manage Departments
                    </Button>
                  </header>

                  <div className="max-w-md">
                    <Select value={deptId} onValueChange={setDeptId}>
                      <SelectTrigger className="h-10 rounded-xl bg-background border border-input text-foreground hover:bg-muted/50 transition-colors">
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border border-border text-popover-foreground rounded-xl">
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id} className="rounded-lg py-2 cursor-pointer">{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    {stats.map((s) => (
                      <Card key={s.label} className="rounded-2xl border border-border/60 shadow-sm bg-card/50">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-semibold text-muted-foreground leading-tight">{s.label}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-extrabold text-foreground">{s.value}</div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Quick Action Buttons */}
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <Button
                      onClick={() => navigate('/current-timetables')}
                      className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground h-10 rounded-xl px-4 text-xs font-semibold transition-all shadow-sm"
                    >
                      <Calendar className="h-4 w-4" />
                      View Current Timetables
                    </Button>
                    <Button
                      onClick={() => navigate('/pull-requests')}
                      variant="outline"
                      className="flex items-center gap-2 border border-input bg-background hover:bg-muted/50 h-10 rounded-xl px-4 text-xs font-semibold transition-all"
                    >
                      <GitPullRequest className="h-4 w-4" />
                      Pull Requests
                    </Button>
                  </div>
                </div>

                <aside className="p-6 rounded-3xl border border-border bg-card/30 backdrop-blur-sm shadow-sm flex flex-col justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-4">
                      <ActivityIcon className="h-5 w-5 text-emerald-500" />
                      Recent Activity
                    </h2>
                    <ul className="space-y-4">
                      {recent.length === 0 && (
                        <li className="text-xs text-muted-foreground py-4 text-center">No recent changes</li>
                      )}
                      {recent.map((a) => (
                        <li key={a.id} className="flex flex-col gap-1 p-3 rounded-xl bg-muted/30 border border-border/30 hover:bg-muted/50 transition-colors">
                          <span className="text-sm font-semibold text-foreground leading-snug">{a.title}</span>
                          <time className="text-[10px] text-muted-foreground mt-1 self-end font-mono">
                            {new Date(a.at).toLocaleString()}
                          </time>
                        </li>
                      ))}
                    </ul>
                  </div>
                </aside>
              </section>
            </TabsContent>

          </Tabs>
        </section>
      </div>

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
