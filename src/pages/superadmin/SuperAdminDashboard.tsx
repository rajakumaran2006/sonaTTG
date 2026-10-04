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
import { Calendar, GitPullRequest, Users, BarChart3, Plus, Settings, Upload } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDarkMode } from "@/context/DarkModeContext";

type Department = { id: string; name: string };

type Stat = { label: string; value: number | string };

type Activity = { id: string; type: 'department' | 'subject' | 'faculty' | 'timetable'; title: string; at: string };
async function countTimetablePeriods(departmentId: string): Promise<number> {
  const { data, error } = await (supabase as any)
    .from('timetables')
    .select('grid_data')
    .eq('department_id', departmentId);
  if (error) throw error;
  let total = 0;
  for (const r of data || []) {
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
  const { isDark } = useDarkMode();
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
      const deptPromise = (supabase as any).from('departments').select('*').order('name');
      const overviewPromise = Promise.all([
        (supabase as any).from('faculty_members').select('*', { count: 'exact', head: true }),
        (supabase as any).from('timetables').select('*', { count: 'exact', head: true }),
        (supabase as any).from('subjects').select('*', { count: 'exact', head: true }),
        (supabase as any).from('subjects').select('id,name,updated_at,department_id,year').order('updated_at', { ascending: false }).limit(10),
        (supabase as any).from('faculty_members').select('id,name,updated_at,department_id').order('updated_at', { ascending: false }).limit(10),
        (supabase as any).from('timetables').select('id,updated_at,department_id,year,section').order('updated_at', { ascending: false }).limit(10),
        (supabase as any).from('departments').select('id,name,created_at').order('created_at', { ascending: false }).limit(10),
      ]);

      const deptRes = await deptPromise;
      const deptData = deptRes.data || [];
      setDepartments(deptData);
      if (!deptId && deptData?.[0]?.id) setDeptId(deptData[0].id);

      const [facultyCountRes, ttCountRes, subjCountRes, recentSubjects, recentFaculty, recentTimetables, recentDepartments] = await overviewPromise;

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

  const cardGlass = isDark
    ? "bg-[#090d1c]/80 backdrop-blur-2xl border border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_12px_-2px_rgba(99,102,241,0.12)] text-white hover:border-indigo-400/40 hover:shadow-[0_4px_24px_rgba(99,102,241,0.22)]"
    : "bg-white/80 backdrop-blur-2xl border border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06),0_0_10px_-2px_rgba(99,102,241,0.05)] text-slate-900 hover:border-indigo-300 hover:shadow-[0_4px_20px_rgba(99,102,241,0.14)]";

  const subCardGlass = isDark
    ? "bg-[#0d1229]/70 backdrop-blur-xl border border-indigo-500/20 text-white"
    : "bg-indigo-50/50 backdrop-blur-xl border border-indigo-100 text-slate-900";

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

      <Navbar />
      
      {/* Content wrapper with pt-16 md:pt-16 so fixed header never covers content */}
      <main className="md:pl-72 pt-16 md:pt-16 transition-all duration-300 relative z-10">
        <section className="max-w-7xl mx-auto px-6 sm:px-8 py-8 md:py-10 w-full space-y-8">
          <Tabs defaultValue="overview" className="space-y-8">
            <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-5 p-6 rounded-2xl backdrop-blur-2xl border transition-all duration-300 ${
              isDark ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.4)]" : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06)]"
            }`}>
              <div>
                <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                  isDark ? "text-white" : "bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 bg-clip-text text-transparent"
                }`}>
                  Super Admin Console
                </h1>
                <p className={`text-xs sm:text-sm mt-1.5 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  System-wide oversight, department allocations, faculty staffing, and active timetables.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <Button 
                  onClick={() => setOpenAdd(true)} 
                  className="bg-gradient-to-r from-indigo-600 via-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl shadow-[0_0_12px_-2px_rgba(99,102,241,0.35)] border border-indigo-400/30 transition-all flex items-center gap-2 h-9 font-bold px-4 text-xs"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Department</span>
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/super-admin/admin-management')} 
                  className={`rounded-xl border transition-all flex items-center gap-2 h-9 font-semibold px-3.5 text-xs ${
                    isDark 
                      ? "bg-white/5 border-indigo-500/20 text-slate-200 hover:bg-white/10 hover:border-indigo-400/40" 
                      : "bg-white border-indigo-200/80 text-slate-700 hover:bg-indigo-50 hover:border-indigo-300"
                  }`}
                >
                  <Users className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Manage Admins</span>
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/csv-upload')} 
                  className={`rounded-xl border transition-all flex items-center gap-2 h-9 font-semibold px-3.5 text-xs ${
                    isDark 
                      ? "bg-white/5 border-indigo-500/20 text-slate-200 hover:bg-white/10 hover:border-indigo-400/40" 
                      : "bg-white border-indigo-200/80 text-slate-700 hover:bg-indigo-50 hover:border-indigo-300"
                  }`}
                >
                  <Upload className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Bulk Import</span>
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/super-admin/labs')} 
                  className={`rounded-xl border transition-all flex items-center gap-2 h-9 font-semibold px-3.5 text-xs ${
                    isDark 
                      ? "bg-white/5 border-indigo-500/20 text-slate-200 hover:bg-white/10 hover:border-indigo-400/40" 
                      : "bg-white border-indigo-200/80 text-slate-700 hover:bg-indigo-50 hover:border-indigo-300"
                  }`}
                >
                  <Settings className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Settings</span>
                </Button>
              </div>
            </div>

            <TabsContent value="overview" className="space-y-8">
              <section>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Total Departments */}
                  <Card 
                    className={`rounded-2xl p-6 transition-all duration-300 cursor-pointer flex flex-col justify-between ${cardGlass}`}
                    onClick={() => navigate('/super-admin/departments')}
                  >
                    <div>
                      <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-indigo-300/80" : "text-indigo-900/70"}`}>Total Departments</span>
                      <div className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-2 text-indigo-600 dark:text-indigo-400">{overview.departments}</div>
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground mt-4 flex items-center gap-1 group-hover:text-indigo-400">
                      Manage academic branches →
                    </p>
                  </Card>

                  {/* Total Faculty */}
                  <Card 
                    className={`rounded-2xl p-6 transition-all duration-300 cursor-pointer flex flex-col justify-between ${cardGlass}`}
                    onClick={() => navigate('/super-admin/faculty')}
                  >
                    <div>
                      <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-sky-300/80" : "text-sky-900/70"}`}>Total Faculty</span>
                      <div className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-2 text-sky-600 dark:text-sky-400">{overview.faculty}</div>
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground mt-4">Active teaching staff →</p>
                  </Card>

                  {/* Active Timetables */}
                  <Card 
                    className={`rounded-2xl p-6 transition-all duration-300 cursor-pointer flex flex-col justify-between ${cardGlass}`}
                    onClick={() => navigate('/current-timetables')}
                  >
                    <div>
                      <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-purple-300/80" : "text-purple-900/70"}`}>Active Timetables</span>
                      <div className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-2 text-purple-600 dark:text-purple-400">{overview.timetables}</div>
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground mt-4">Live section schedules →</p>
                  </Card>

                  {/* Total Subjects */}
                  <Card 
                    className={`rounded-2xl p-6 transition-all duration-300 cursor-pointer flex flex-col justify-between ${cardGlass}`}
                  >
                    <div>
                      <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-amber-300/80" : "text-amber-900/70"}`}>Total Subjects</span>
                      <div className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-2 text-amber-500 dark:text-amber-400">{overview.subjects}</div>
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground mt-4">Curriculum courses</p>
                  </Card>
                </div>
              </section>

              {/* Timetable Summary Section */}
              <section className={`p-7 rounded-2xl backdrop-blur-2xl border transition-all duration-300 space-y-6 ${
                isDark ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.4)]" : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06)]"
              }`}>
                <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">
                      Timetable Summary
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Overview of all active timetables across departments</p>
                  </div>
                </header>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className={`rounded-xl p-5 border transition-all shadow-xs ${subCardGlass}`}>
                    <div className="flex flex-row items-center justify-between pb-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Classes</span>
                    </div>
                    <div className="text-3xl font-extrabold text-foreground mt-2">{timetableSummary.totalClasses}</div>
                    <p className="text-[11px] text-muted-foreground mt-2">Active section cohorts</p>
                  </div>

                  <div className={`rounded-xl p-5 border transition-all shadow-xs ${subCardGlass}`}>
                    <div className="flex flex-row items-center justify-between pb-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Periods</span>
                    </div>
                    <div className="text-3xl font-extrabold text-foreground mt-2">{timetableSummary.totalPeriods}</div>
                    <p className="text-[11px] text-muted-foreground mt-2">Weekly instructional slots</p>
                  </div>

                  <div className={`rounded-xl p-5 border transition-all shadow-xs ${subCardGlass}`}>
                    <div className="flex flex-row items-center justify-between pb-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Avg Periods/Class</span>
                    </div>
                    <div className="text-3xl font-extrabold text-foreground mt-2">{timetableSummary.avgPeriodsPerClass}</div>
                    <p className="text-[11px] text-muted-foreground mt-2">Periods per section week</p>
                  </div>

                  <div className={`rounded-xl p-5 border transition-all shadow-xs ${subCardGlass}`}>
                    <div className="flex flex-row items-center justify-between pb-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Active Departments</span>
                    </div>
                    <div className="text-3xl font-extrabold text-foreground mt-2">{timetableSummary.departmentBreakdown.length}</div>
                    <p className="text-[11px] text-muted-foreground mt-2">Scheduled academic branches</p>
                  </div>
                </div>

                {/* Department Breakdown */}
                {timetableSummary.departmentBreakdown.length > 0 && (
                  <div className={`rounded-xl p-5 border ${subCardGlass}`}>
                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Department Breakdown</div>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {timetableSummary.departmentBreakdown.map((dept) => (
                        <div key={dept.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                          isDark 
                            ? "bg-[#111736] border-indigo-500/25 hover:border-indigo-400/40" 
                            : "bg-white border-indigo-100 hover:border-indigo-300 shadow-xs"
                        }`}>
                          <span className="font-bold text-sm text-foreground">{dept.name}</span>
                          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-lg border ${
                            isDark ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" : "bg-indigo-50 text-indigo-700 border-indigo-200"
                          }`}>{dept.count} classes</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <section className="grid gap-8 md:grid-cols-3">
                <div className={`md:col-span-2 p-7 rounded-2xl backdrop-blur-2xl border transition-all duration-300 space-y-6 ${
                  isDark ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.4)]" : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06)]"
                }`}>
                  <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold tracking-tight">Department Summary</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">Overview of the selected department</p>
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={() => navigate('/super-admin/departments')} 
                      className={`h-9 rounded-xl text-xs font-semibold px-4 border ${
                        isDark ? "border-indigo-500/25 bg-white/5 hover:bg-white/10" : "border-indigo-200 bg-white hover:bg-indigo-50"
                      }`}
                    >
                      Manage Departments
                    </Button>
                  </header>

                  <div className="max-w-md">
                    <Select value={deptId} onValueChange={setDeptId}>
                      <SelectTrigger className={`h-11 rounded-xl border text-foreground transition-colors ${
                        isDark ? "bg-[#0e1326] border-indigo-500/25 hover:border-indigo-400/40" : "bg-white border-indigo-200 hover:border-indigo-300"
                      }`}>
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent className={`border rounded-xl backdrop-blur-xl ${
                        isDark ? "bg-[#0d1229] border-indigo-500/30 text-white" : "bg-white border-indigo-200 text-slate-900"
                      }`}>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id} className="rounded-lg py-2 cursor-pointer">{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    {stats.map((s) => (
                      <div key={s.label} className={`rounded-xl p-5 border shadow-xs ${subCardGlass}`}>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground leading-tight">{s.label}</div>
                        <div className="text-3xl font-extrabold text-foreground mt-2">{s.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Quick Action Buttons */}
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <Button
                      onClick={() => navigate('/current-timetables')}
                      className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white h-10 rounded-xl px-4 text-xs font-bold transition-all shadow-[0_0_12px_-2px_rgba(99,102,241,0.3)]"
                    >
                      <Calendar className="h-4 w-4" />
                      View Current Timetables
                    </Button>
                    <Button
                      onClick={() => navigate('/pull-requests')}
                      variant="outline"
                      className={`flex items-center gap-2 border h-10 rounded-xl px-4 text-xs font-semibold transition-all ${
                        isDark ? "border-indigo-500/25 bg-white/5 hover:bg-white/10" : "border-indigo-200 bg-white hover:bg-indigo-50"
                      }`}
                    >
                      <GitPullRequest className="h-4 w-4 text-indigo-400" />
                      Pull Requests
                    </Button>
                  </div>
                </div>

                <aside className={`p-7 rounded-2xl backdrop-blur-2xl border flex flex-col justify-between ${
                  isDark ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.4)]" : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06)]"
                }`}>
                  <div>
                    <h2 className="text-xl font-bold tracking-tight mb-4">
                      Recent Activity
                    </h2>
                    <ul className="space-y-3 max-h-[380px] overflow-y-auto pr-2">
                      {recent.length === 0 && (
                        <li className="text-xs text-muted-foreground py-6 text-center">No recent changes</li>
                      )}
                      {recent.map((a) => (
                        <li key={a.id} className={`flex flex-col gap-1 p-3.5 rounded-xl border transition-colors ${
                          isDark ? "bg-[#0e1326] border-indigo-500/20 hover:bg-[#131a33]" : "bg-indigo-50/40 border-indigo-100 hover:bg-indigo-50/70"
                        }`}>
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
      </main>

      <Dialog open={openAdd} onOpenChange={setOpenAdd}>
        <DialogContent className={`border rounded-2xl shadow-2xl backdrop-blur-2xl transition-all duration-300 ${
          isDark ? "bg-[#090d1c]/95 border-indigo-500/30 text-white" : "bg-white/95 border-indigo-200/80 text-slate-900"
        }`}>
          <DialogHeader>
            <DialogTitle>Add Department</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Input 
              placeholder="Department name" 
              value={newDeptName} 
              onChange={(e) => setNewDeptName(e.target.value)} 
              className={`rounded-xl ${isDark ? "bg-[#0e1326] border-indigo-500/25" : "bg-white border-indigo-200"}`}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenAdd(false)} className="rounded-xl">Cancel</Button>
            <Button 
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-sm shadow-indigo-500/25"
              onClick={async () => {
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
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SuperAdminDashboard;
