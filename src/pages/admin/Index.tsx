import { useEffect, useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTimetableStore } from "@/store/timetableStore";
import { getDepartmentByName, getTimetable } from "@/lib/supabaseService";
import AdminNavbar from "@/components/navbar/AdminNavbar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SelectionHeader from "@/components/admin/SelectionHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDarkMode } from "@/context/DarkModeContext";
import {
  Users,
  BookOpen,
  Calendar,
  Upload,
  ArrowRight,
  Database,
  Sparkles,
  ChevronRight,
} from "lucide-react";

const years = ["I", "II", "III", "IV"];
const sections = ["A", "B", "C"];

interface AdminUser {
  id: string;
  name: string;
  email: string;
  department_id: string;
  is_active: boolean;
}

interface DashboardStats {
  subjects: number;
  faculty: number;
  timetables: number;
}

const Index = () => {
  const navigate = useNavigate();
  const { isDark } = useDarkMode();
  const selection = useTimetableStore((s) => s.selection);
  const setSelection = useTimetableStore((s) => s.setSelection);
  const [existingTimetable, setExistingTimetable] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ subjects: 0, faculty: 0, timetables: 0 });
  const [loading, setLoading] = useState(true);
  const loadingRef = useRef(true);

  const ready = selection.department && selection.year && selection.section;

  useEffect(() => {
    const adminData = localStorage.getItem("adminUser");
    if (!adminData) {
      navigate("/", { replace: true });
      return;
    }

    let timeoutId: NodeJS.Timeout;

    try {
      const parsedAdmin = JSON.parse(adminData);
      if (!parsedAdmin || !parsedAdmin.department_id) {
        throw new Error("Invalid admin data");
      }

      setAdminUser(parsedAdmin);

      (async () => {
        try {
          const { data: deptData, error: deptError } = await (supabase as any)
            .from('departments')
            .select('*')
            .eq('id', parsedAdmin.department_id);

          if (deptError) throw deptError;
          if (!deptData || deptData.length === 0) {
            toast.error('No departments found. Please contact your Super Admin.');
            setLoading(false);
            loadingRef.current = false;
            return;
          }

          setDepartments(deptData);
          setSelection({ department: deptData[0].name });

          const [subjectsRes, facultyRes, timetablesRes] = await Promise.all([
            (supabase as any).from('subjects').select('id', { count: 'exact', head: true }).eq('department_id', parsedAdmin.department_id),
            (supabase as any).from('faculty_members').select('id', { count: 'exact', head: true }).eq('department_id', parsedAdmin.department_id),
            (supabase as any).from('timetables').select('id', { count: 'exact', head: true }).eq('department_id', parsedAdmin.department_id)
          ]);

          setStats({
            subjects: subjectsRes.count || 0,
            faculty: facultyRes.count || 0,
            timetables: timetablesRes.count || 0,
          });

          setLoading(false);
          loadingRef.current = false;
        } catch (error) {
          console.error('Error loading dashboard data:', error);
          toast.error('Failed to load dashboard data.');
          setLoading(false);
          loadingRef.current = false;
        }
      })();

      timeoutId = setTimeout(() => {
        if (loadingRef.current) {
          setLoading(false);
          loadingRef.current = false;
        }
      }, 10000);

    } catch (error) {
      console.error('Error parsing admin data:', error);
      toast.error('Invalid admin session.');
      localStorage.removeItem("adminUser");
      navigate("/", { replace: true });
    }

    return () => timeoutId && clearTimeout(timeoutId);
  }, [navigate, setSelection]);

  useEffect(() => {
    (async () => {
      if (!selection.department || !selection.year || !selection.section) {
        setExistingTimetable(false);
        return;
      }
      setChecking(true);
      try {
        const dept = await getDepartmentByName(selection.department);
        if (!dept) { setExistingTimetable(false); return; }
        const tt = await getTimetable(dept.id, selection.year, selection.section);
        setExistingTimetable(Boolean(tt));
      } catch (_) {
        setExistingTimetable(false);
      } finally {
        setChecking(false);
      }
    })();
  }, [selection.department, selection.year, selection.section]);

  // ── Theme tokens ────────────────────────────────────────────────────────────
  const bg = isDark ? "bg-[#0a0a0a]" : "bg-[#f5f5f7]";
  const cardBg = isDark ? "bg-[#141414]" : "bg-white";
  const cardBorder = isDark ? "border-white/[0.06]" : "border-slate-200/80";
  const divider = isDark ? "border-white/[0.06]" : "border-slate-100";
  const textPrimary = isDark ? "text-white" : "text-slate-900";
  const textSecondary = isDark ? "text-white/50" : "text-slate-500";
  const textMuted = isDark ? "text-white/30" : "text-slate-400";
  const inputBg = isDark ? "bg-white/[0.05] border-white/10 text-white" : "bg-slate-50 border-slate-200 text-slate-900";
  const editBtn = isDark ? "bg-white/10 text-white hover:bg-white/15" : "bg-slate-100 text-slate-700 hover:bg-slate-200";
  const actionHoverBg = isDark ? "hover:bg-white/[0.04]" : "";
  // ────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={`min-h-screen ${bg} transition-colors duration-300`}>
        <AdminNavbar />
        <main className="md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80">
          <div className="flex items-center justify-center min-h-screen">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
              <p className={`text-sm font-medium tracking-wide ${textSecondary}`}>Loading dashboard…</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const statCards = [
    {
      label: "Subjects",
      value: stats.subjects,
      icon: BookOpen,
      href: "/admin/subjects",
      linkLabel: "Manage Subjects",
      gradient: isDark ? "from-emerald-500/[0.08] to-teal-500/[0.03]" : "from-emerald-500/10 to-teal-500/5",
      iconColor: "text-emerald-500",
      iconBg: isDark ? "bg-emerald-500/10" : "bg-emerald-500/10",
    },
    {
      label: "Faculty",
      value: stats.faculty,
      icon: Users,
      href: "/admin/faculty",
      linkLabel: "Manage Faculty",
      gradient: isDark ? "from-sky-500/[0.08] to-blue-500/[0.03]" : "from-sky-500/10 to-blue-500/5",
      iconColor: "text-sky-500",
      iconBg: isDark ? "bg-sky-500/10" : "bg-sky-500/10",
    },
    {
      label: "Timetables",
      value: stats.timetables,
      icon: Calendar,
      href: "/current-timetables",
      linkLabel: "View Timetables",
      gradient: isDark ? "from-violet-500/[0.08] to-purple-500/[0.03]" : "from-violet-500/10 to-purple-500/5",
      iconColor: "text-violet-500",
      iconBg: isDark ? "bg-violet-500/10" : "bg-violet-500/10",
    },
  ];

  const quickActions = [
    { label: "Add Subjects", icon: BookOpen, path: "/admin/subjects", color: "emerald" },
    { label: "Manage Faculty", icon: Users, path: "/admin/faculty", color: "sky" },
    { label: "Bulk Import", icon: Upload, path: "/csv-upload", color: "amber" },
    { label: "Lab Allocation", icon: Database, path: "/lab", color: "violet" },
  ];

  const colorMap: Record<string, { icon: string; bg: string; border: string; glow: string }> = {
    emerald: { 
      icon: "text-emerald-500 dark:text-emerald-400", 
      bg: "bg-emerald-500/10 dark:bg-emerald-500/20", 
      border: "border-emerald-500/20 dark:border-emerald-500/10 hover:border-emerald-500/50",
      glow: "hover:shadow-[0_4px_20px_rgba(16,185,129,0.1)]"
    },
    sky: { 
      icon: "text-sky-500 dark:text-sky-400", 
      bg: "bg-sky-500/10 dark:bg-sky-500/20", 
      border: "border-sky-500/20 dark:border-sky-500/10 hover:border-sky-500/50",
      glow: "hover:shadow-[0_4px_20px_rgba(56,189,248,0.1)]"
    },
    amber: { 
      icon: "text-amber-500 dark:text-amber-400", 
      bg: "bg-amber-500/10 dark:bg-amber-500/20", 
      border: "border-amber-500/20 dark:border-amber-500/10 hover:border-amber-500/50",
      glow: "hover:shadow-[0_4px_20px_rgba(245,158,11,0.1)]"
    },
    violet: { 
      icon: "text-violet-500 dark:text-violet-400", 
      bg: "bg-violet-500/10 dark:bg-violet-500/20", 
      border: "border-violet-500/20 dark:border-violet-500/10 hover:border-violet-500/50",
      glow: "hover:shadow-[0_4px_20px_rgba(139,92,246,0.1)]"
    },
  };

  return (
    <div className={`min-h-screen ${bg} ${textPrimary} transition-colors duration-300`}>
      <AdminNavbar />
      <main className="md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80 transition-all duration-300">
        <SelectionHeader />

        {/* Content starts immediately below the header — no extra top gap */}
        <div className="container pt-2 pb-4 space-y-6">

          {/* Stats Row */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {statCards.map((card) => (
              <div
                key={card.label}
                className={`relative overflow-hidden rounded-2xl ${cardBg} border ${cardBorder} p-6 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5`}
              >
                <div className="relative">
                  <p className={`text-sm font-semibold ${textSecondary} mb-3`}>Total {card.label}</p>
                  <p className={`text-5xl font-bold tracking-tight ${textPrimary} mb-2`}>{card.value}</p>
                  <p className={`text-sm ${textMuted} truncate`}>{selection.department || "—"}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Main Content Grid */}
          <div className="grid gap-6 lg:grid-cols-5">

            {/* Generate Timetable — wider */}
            <div className={`lg:col-span-3 rounded-2xl ${cardBg} border ${cardBorder} shadow-sm overflow-hidden`}>
              <div className={`px-6 pt-6 pb-4 border-b ${divider}`}>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className={`text-base font-bold ${textPrimary}`}>Generate Timetable</h2>
                </div>
                <p className={`text-sm ${textMuted}`}>Select parameters to start generating or editing a timetable.</p>
              </div>

              <div className="p-6 space-y-5">
                {/* Department */}
                <div className="space-y-1.5">
                  <label className={`text-[11px] font-bold uppercase tracking-widest ${textMuted}`}>Department</label>
                  <Select onValueChange={(v) => setSelection({ department: v })} value={selection.department}>
                    <SelectTrigger className={`h-11 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 ${inputBg}`}>
                      <SelectValue placeholder="Select Department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Year & Section */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className={`text-[11px] font-bold uppercase tracking-widest ${textMuted}`}>Year</label>
                    <Select onValueChange={(v) => setSelection({ year: v })} value={selection.year}>
                      <SelectTrigger className={`h-11 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 ${inputBg}`}>
                        <SelectValue placeholder="Select Year" />
                      </SelectTrigger>
                      <SelectContent>
                        {years.map((y) => (
                          <SelectItem key={y} value={y}>Year {y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className={`text-[11px] font-bold uppercase tracking-widest ${textMuted}`}>Section</label>
                    <Select onValueChange={(v) => setSelection({ section: v })} value={selection.section}>
                      <SelectTrigger className={`h-11 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 ${inputBg}`}>
                        <SelectValue placeholder="Select Section" />
                      </SelectTrigger>
                      <SelectContent>
                        {sections.map((s) => (
                          <SelectItem key={s} value={s}>Section {s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  {ready && existingTimetable && (
                    <button
                      onClick={() => navigate('/timetable')}
                      className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-200 ${editBtn}`}
                    >
                      Edit
                    </button>
                  )}
                  <button
                    onClick={() => navigate('/subjects')}
                    disabled={!ready || checking}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-emerald-500/20 transition-all duration-200 hover:shadow-emerald-500/30 hover:shadow-md"
                  >
                    {existingTimetable ? 'Edit Schedule' : (checking ? 'Checking…' : 'Generate New')}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Actions — narrower */}
            <div className="lg:col-span-2 space-y-4">
              <div className={`rounded-2xl ${cardBg} border ${cardBorder} shadow-sm overflow-hidden`}>
                <div className={`px-5 pt-5 pb-3 border-b ${divider}`}>
                  <h2 className={`text-base font-bold ${textPrimary}`}>Quick Actions</h2>
                </div>
                <div className="p-3 grid grid-cols-2 gap-2">
                  {quickActions.map((action) => {
                    const Icon = action.icon;
                    const colors = colorMap[action.color];
                    return (
                      <button
                        key={action.label}
                        onClick={() => navigate(action.path)}
                        className={`flex flex-col items-start gap-2.5 p-4 rounded-xl border ${colors.border} ${colors.glow} bg-card/60 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:bg-slate-100/10 active:scale-[0.98] group`}
                      >
                        <div className={`p-2.5 rounded-xl ${colors.bg} transition-transform duration-300 group-hover:scale-110`}>
                          <Icon className={`h-4.5 w-4.5 ${colors.icon}`} />
                        </div>
                        <span className={`text-xs font-semibold leading-tight text-left ${textPrimary}`}>{action.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tip Card */}
              <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-5 text-white shadow-sm shadow-emerald-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-emerald-100">Pro Tip</p>
                </div>
                <p className="text-sm leading-relaxed text-white/90">
                  Export timetables to PDF or Excel from the review page. Smart constraints prevent faculty double-booking.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
