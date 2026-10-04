import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTimetableStore } from "@/store/timetableStore";
import { getDepartmentByName, getTimetable } from "@/lib/supabaseService";
import AdminNavbar from "@/components/navbar/AdminNavbar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SelectionHeader from "@/components/admin/SelectionHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useDarkMode } from "@/context/DarkModeContext";
import { GeneratedTimetablesGallery } from "@/components/admin/GeneratedTimetablesGallery";
import { GenerateWizardModal, WizardSelection } from "@/components/admin/GenerateWizardModal";
import type { YearSectionResult } from "@/lib/timetable";
import {
  Users,
  BookOpen,
  Calendar,
  Upload,
  ArrowRight,
  Database,
  Sparkles,
  ChevronRight,
  Zap,
  CheckCircle2,
  Loader2,
  AlertCircle,
  X,
  Sun,
  Moon,
} from "lucide-react";
import { ImportEvenSemesterModal } from "@/components/admin/ImportEvenSemesterModal";


const years = ["I", "II", "III", "IV"];
const sections = ["A", "B", "C"];

interface AdminUser {
  id: string;
  name: string;
  email: string;
  department_id: string | null;
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
  const [statsLoading, setStatsLoading] = useState(false);

  // ── Generate Wizard State ───────────────────────────────────────────────
  const [showWizard, setShowWizard] = useState(false);
  const [selectedDashboardDepts, setSelectedDashboardDepts] = useState<string[]>([]);
  const semesterType = useTimetableStore((s) => s.semesterType);
  const setSemesterType = useTimetableStore((s) => s.setSemesterType);
  const [showImportEvenModal, setShowImportEvenModal] = useState(false);

  const handleWizardProceed = useCallback((selections: { departmentName: string; selectedYears: WizardSelection[] }[], semType?: 'odd' | 'even') => {
    navigate("/admin/generate-review", {
      state: {
        selections,
        semesterType: semType || semesterType,
      },
    });
  }, [navigate, semesterType]);

  const ready = selection.department && selection.year && selection.section;


  // Load combined stats across all allocated departments
  const loadStatsForDepts = useCallback(async (deptIds: string[]) => {
    if (!deptIds || deptIds.length === 0) return;
    setStatsLoading(true);
    try {
      const [subjectsRes, facultyRes, timetablesRes] = await Promise.all([
        (supabase as any).from('subjects').select('id', { count: 'exact', head: true }).in('department_id', deptIds),
        (supabase as any).from('faculty_members').select('id', { count: 'exact', head: true }).in('department_id', deptIds),
        (supabase as any).from('timetables').select('id', { count: 'exact', head: true }).in('department_id', deptIds)
      ]);
      setStats({
        subjects: subjectsRes.count || 0,
        faculty: facultyRes.count || 0,
        timetables: timetablesRes.count || 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    const adminData = localStorage.getItem("adminUser");
    if (!adminData) {
      navigate("/", { replace: true });
      return;
    }

    let timeoutId: NodeJS.Timeout;

    try {
      const parsedAdmin = JSON.parse(adminData);
      if (!parsedAdmin || !parsedAdmin.id) {
        throw new Error("Invalid admin data");
      }

      setAdminUser(parsedAdmin);

      (async () => {
        try {
          // First, try to load all departments from admin_departments table
          const { data: adminDepts, error: adminDeptsError } = await (supabase as any)
            .from('admin_departments')
            .select('department_id')
            .eq('admin_id', parsedAdmin.id);

          let deptIds: string[] = [];

          if (!adminDeptsError && adminDepts && adminDepts.length > 0) {
            deptIds = adminDepts.map((d: any) => d.department_id);
          } else if (parsedAdmin.department_id) {
            // Fallback: use the legacy single department_id
            deptIds = [parsedAdmin.department_id];
          }

          if (deptIds.length === 0) {
            toast.error('No departments found. Please contact your Super Admin.');
            setLoading(false);
            loadingRef.current = false;
            return;
          }

          // Fetch full department details
          const { data: deptData, error: deptError } = await (supabase as any)
            .from('departments')
            .select('*')
            .in('id', deptIds)
            .order('name');

          if (deptError) throw deptError;
          if (!deptData || deptData.length === 0) {
            toast.error('No departments found. Please contact your Super Admin.');
            setLoading(false);
            loadingRef.current = false;
            return;
          }

          setDepartments(deptData);
          setSelection({ department: deptData[0].name });
          setSelectedDashboardDepts(deptData.map(d => d.name));

          // Load stats combined for all allocated departments
          await loadStatsForDepts(deptIds);

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
  }, [navigate, setSelection, loadStatsForDepts]);

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
  }, [selection]);

  // ── Theme tokens (Professional Neon Glassmorphism) ────────────────────────────
  const bg = isDark ? "bg-[#060814]" : "bg-gradient-to-br from-[#f8faff] via-[#f5f8ff] to-[#fbf9ff]";
  const cardBg = isDark ? "bg-[#0c1022]/75 backdrop-blur-2xl" : "bg-white/80 backdrop-blur-2xl";
  const cardBorder = isDark 
    ? "border-indigo-500/20 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5),0_0_12px_-2px_rgba(99,102,241,0.1),inset_0_1px_1px_0_rgba(255,255,255,0.06)]" 
    : "border-indigo-200/60 shadow-[0_4px_20px_-4px_rgba(99,102,241,0.08),0_0_10px_-2px_rgba(99,102,241,0.06),inset_0_1px_1px_0_rgba(255,255,255,0.9)]";
  const divider = isDark ? "border-indigo-500/15" : "border-indigo-100/70";
  const textPrimary = isDark ? "text-slate-100" : "text-slate-900";
  const textSecondary = isDark ? "text-indigo-400/80" : "text-indigo-900/70";
  const textMuted = isDark ? "text-slate-500" : "text-slate-500";
  const inputBg = isDark 
    ? "bg-[#10162e]/60 border-indigo-500/25 text-white backdrop-blur-md hover:border-indigo-400/40 hover:bg-[#141b38]/70" 
    : "bg-indigo-50/40 border-indigo-200/70 text-slate-900 hover:border-indigo-400/60 hover:bg-indigo-50/60";
  const editBtn = isDark 
    ? "bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 border border-indigo-500/30 shadow-[0_0_8px_-2px_rgba(99,102,241,0.3)]" 
    : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 shadow-xs";
  const actionHoverBg = isDark ? "hover:bg-white/[0.04]" : "hover:bg-indigo-50/50";
  // ────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={`min-h-screen ${bg} transition-colors duration-300`}>
        <AdminNavbar />
        <main className="md:pl-72 transition-all duration-300">
          <div className="flex items-center justify-center min-h-screen">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin shadow-[0_0_12px_rgba(99,102,241,0.4)]" />
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
      gradient: isDark ? "from-indigo-500/[0.08] to-purple-500/[0.03]" : "from-indigo-500/[0.08] via-purple-500/[0.04] to-transparent",
      iconColor: isDark ? "text-indigo-400" : "text-indigo-600",
      iconBg: isDark ? "bg-indigo-500/15 border-indigo-500/30 shadow-[0_0_10px_-2px_rgba(99,102,241,0.25)]" : "bg-gradient-to-br from-indigo-500/15 to-purple-500/15 border-indigo-200/80 shadow-sm shadow-indigo-500/10",
    },
    {
      label: "Faculty",
      value: stats.faculty,
      icon: Users,
      href: "/admin/faculty",
      linkLabel: "Manage Faculty",
      gradient: isDark ? "from-sky-500/[0.08] to-blue-500/[0.03]" : "from-purple-500/[0.08] via-indigo-500/[0.04] to-transparent",
      iconColor: isDark ? "text-sky-400" : "text-purple-600",
      iconBg: isDark ? "bg-sky-500/15 border-sky-500/30 shadow-[0_0_10px_-2px_rgba(56,189,248,0.25)]" : "bg-gradient-to-br from-purple-500/15 to-indigo-500/15 border-purple-200/80 shadow-sm shadow-purple-500/10",
    },
    {
      label: "Timetables",
      value: stats.timetables,
      icon: Calendar,
      href: "/current-timetables",
      linkLabel: "View Timetables",
      gradient: isDark ? "from-violet-500/[0.08] to-purple-500/[0.03]" : "from-violet-500/[0.08] via-indigo-500/[0.04] to-transparent",
      iconColor: isDark ? "text-violet-400" : "text-violet-600",
      iconBg: isDark ? "bg-violet-500/15 border-violet-500/30 shadow-[0_0_10px_-2px_rgba(139,92,246,0.25)]" : "bg-gradient-to-br from-violet-500/15 to-indigo-500/15 border-violet-200/80 shadow-sm shadow-violet-500/10",
    },
  ];

  const quickActions = [
    { label: "Add Subjects", desc: "Manage courses", icon: BookOpen, path: "/admin/subjects", color: "indigo" },
    { label: "Manage Faculty", desc: "Staff directory", icon: Users, path: "/admin/faculty", color: "sky" },
    { label: "Bulk Import", desc: "CSV spreadsheet", icon: Upload, path: "/csv-upload", color: "amber" },
    { label: "Lab Allocation", desc: "Room resources", icon: Database, path: "/lab", color: "violet" },
  ];

  const colorMap: Record<string, { icon: string; bg: string; border: string; glow: string }> = {
    indigo: { 
      icon: isDark ? "text-indigo-400" : "text-indigo-600", 
      bg: isDark ? "bg-indigo-500/15 border border-indigo-500/25" : "bg-indigo-50/80 border border-indigo-200/60", 
      border: isDark ? "border-indigo-500/20 hover:border-indigo-400/50" : "border-indigo-200/70 hover:border-indigo-400/80",
      glow: isDark ? "hover:shadow-[0_0_14px_-2px_rgba(99,102,241,0.28)]" : "hover:shadow-[0_0_12px_-2px_rgba(99,102,241,0.18)]"
    },
    sky: { 
      icon: isDark ? "text-sky-400" : "text-sky-600", 
      bg: isDark ? "bg-sky-500/15 border border-sky-500/25" : "bg-sky-50/80 border border-sky-200/60", 
      border: isDark ? "border-sky-500/20 hover:border-sky-400/50" : "border-sky-200/70 hover:border-sky-400/80",
      glow: isDark ? "hover:shadow-[0_0_14px_-2px_rgba(56,189,248,0.28)]" : "hover:shadow-[0_0_12px_-2px_rgba(56,189,248,0.18)]"
    },
    amber: { 
      icon: isDark ? "text-amber-400" : "text-amber-600", 
      bg: isDark ? "bg-amber-500/15 border border-amber-500/25" : "bg-amber-50/80 border border-amber-200/60", 
      border: isDark ? "border-amber-500/20 hover:border-amber-400/50" : "border-amber-200/70 hover:border-amber-400/80",
      glow: isDark ? "hover:shadow-[0_0_14px_-2px_rgba(245,158,11,0.28)]" : "hover:shadow-[0_0_12px_-2px_rgba(245,158,11,0.18)]"
    },
    violet: { 
      icon: isDark ? "text-violet-400" : "text-purple-600", 
      bg: isDark ? "bg-violet-500/15 border border-violet-500/25" : "bg-purple-50/80 border border-purple-200/60", 
      border: isDark ? "border-violet-500/20 hover:border-purple-400/50" : "border-purple-200/70 hover:border-purple-400/80",
      glow: isDark ? "hover:shadow-[0_0_14px_-2px_rgba(168,85,247,0.28)]" : "hover:shadow-[0_0_12px_-2px_rgba(168,85,247,0.18)]"
    },
  };

  return (
    <div className={`min-h-screen ${bg} ${textPrimary} transition-colors duration-300 relative overflow-x-hidden`}>
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

      <AdminNavbar />
      <main className="md:pl-72 transition-all duration-300 min-h-screen relative z-10">
        <SelectionHeader compact />

        {/* Content container — naturally aligned and balanced for single-screen view */}
        <div className="max-w-7xl mx-auto px-6 sm:px-8 py-5 sm:py-6 space-y-5 sm:space-y-6">

          {/* Stats Row */}
          <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {statCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className={`relative overflow-hidden rounded-2xl ${cardBg} border ${cardBorder} p-5 transition-all duration-300 hover:-translate-y-0.5 group ${
                    isDark 
                      ? 'hover:border-indigo-400/40 hover:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.6),0_0_16px_-2px_rgba(99,102,241,0.2)]' 
                      : 'hover:border-indigo-300 hover:shadow-[0_4px_20px_-4px_rgba(99,102,241,0.12),0_0_14px_-2px_rgba(99,102,241,0.12)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? textSecondary : 'text-indigo-600'}`}>Total {card.label}</span>
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${card.iconBg} ${card.iconColor} transition-transform duration-300 group-hover:scale-105`}>
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                  </div>
                  <div className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${textPrimary} mt-2 mb-1 transition-opacity duration-200 ${statsLoading ? 'opacity-30' : 'opacity-100'}`}>
                    {statsLoading ? '—' : card.value}
                  </div>
                  <p className={`text-xs font-semibold ${isDark ? textMuted : 'text-indigo-700/80'} truncate`}>
                    {departments.map(d => d.name).join(", ") || "All Allocated Depts"}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Main Content Grid — equal height matching columns */}
          <div className="grid gap-5 lg:grid-cols-5 items-stretch">

            {/* Generate Timetable — 3 cols */}
            <div className={`lg:col-span-3 rounded-2xl ${cardBg} border ${cardBorder} overflow-hidden flex flex-col justify-between`}>
              <div>
                <div className={`px-6 py-4 border-b ${divider}`}>
                  <h2 className={`text-base font-bold tracking-tight ${textPrimary}`}>Generate Timetable</h2>
                  <p className={`text-xs ${isDark ? textMuted : 'text-slate-500'} mt-0.5 leading-normal`}>Select academic semester and target departments to configure and generate clash-free timetables.</p>
                </div>

                <div className="p-6 space-y-5">
                  {/* Academic Semester Selector */}
                  <div className="space-y-2.5">
                    <div className="relative flex items-center justify-between gap-2 min-h-[32px]">
                      <label className={`text-xs font-bold uppercase tracking-wider ${isDark ? textMuted : 'text-indigo-700'} shrink-0`}>Academic Semester</label>

                      {semesterType === "even" && (
                        <div className="sm:absolute sm:left-1/2 sm:-translate-x-1/2 z-10">
                          <button
                            type="button"
                            onClick={() => setShowImportEvenModal(true)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white transition-all shadow-[0_0_14px_-2px_rgba(99,102,241,0.35)] border border-indigo-300/40 backdrop-blur-md active:scale-95"
                          >
                            <Upload className="h-3.5 w-3.5" />
                            <span>Import Even Sem Subjects</span>
                          </button>
                        </div>
                      )}

                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 shrink-0 text-right">
                        {semesterType === "odd" ? "Odd Sem (Years II, III, IV)" : "Even Sem (Years II, III, IV)"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3.5">
                      <button
                        type="button"
                        onClick={() => setSemesterType("odd")}
                        className={`flex items-center justify-center gap-2.5 p-3 rounded-xl border text-xs sm:text-sm font-semibold transition-all duration-200 select-none ${
                          semesterType === "odd"
                            ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-indigo-400/50 shadow-[0_0_14px_-2px_rgba(99,102,241,0.3)] font-bold"
                            : `${inputBg} text-slate-700 dark:text-muted-foreground`
                        }`}
                      >
                        <Sun className="h-4 w-4" />
                        Odd Semester
                      </button>
                      <button
                        type="button"
                        onClick={() => setSemesterType("even")}
                        className={`flex items-center justify-center gap-2.5 p-3 rounded-xl border text-xs sm:text-sm font-semibold transition-all duration-200 select-none ${
                          semesterType === "even"
                            ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-indigo-400/50 shadow-[0_0_14px_-2px_rgba(99,102,241,0.3)] font-bold"
                            : `${inputBg} text-slate-700 dark:text-muted-foreground`
                        }`}
                      >
                        <Moon className="h-4 w-4" />
                        Even Semester
                      </button>
                    </div>
                  </div>

                  {/* Department */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className={`text-xs font-bold uppercase tracking-wider ${isDark ? textMuted : 'text-indigo-700'}`}>Departments</label>
                      <span className="text-xs font-semibold text-indigo-600 dark:text-muted-foreground">
                        {selectedDashboardDepts.length} of {departments.length} selected
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[140px] overflow-y-auto pr-1">
                      {departments.map((d) => {
                        const isChecked = selectedDashboardDepts.includes(d.name);
                        return (
                          <div
                            key={d.id}
                            onClick={() => {
                              if (isChecked) {
                                setSelectedDashboardDepts(prev => prev.filter(name => name !== d.name));
                              } else {
                                setSelectedDashboardDepts(prev => [...prev, d.name]);
                              }
                            }}
                            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200 select-none ${
                              isChecked
                                ? (isDark 
                                    ? "bg-indigo-500/15 border-indigo-400/50 text-indigo-300 font-semibold shadow-[0_0_12px_-3px_rgba(99,102,241,0.3)]"
                                    : "bg-indigo-50/90 border-indigo-400/80 text-indigo-950 font-bold shadow-[0_0_10px_-2px_rgba(99,102,241,0.16)] ring-1 ring-indigo-400/20")
                                : `${inputBg}`
                            }`}
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => {}}
                              className="border-indigo-300 dark:border-indigo-500/40 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 rounded-md h-4 w-4"
                            />
                            <span className="text-xs sm:text-sm font-semibold truncate">{d.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="px-6 pb-6 pt-2 flex items-center justify-end">
                <button
                  onClick={() => setShowWizard(true)}
                  disabled={selectedDashboardDepts.length === 0}
                  className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-indigo-600 via-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_18px_-2px_rgba(99,102,241,0.35)] border border-indigo-400/30 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
                >
                  <Zap className="h-4 w-4" />
                  Generate Timetable
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Quick Actions & Pro Tip — 2 cols */}
            <div className="lg:col-span-2 flex flex-col justify-between gap-4">
              <div className={`rounded-2xl ${cardBg} border ${cardBorder} overflow-hidden`}>
                <div className={`px-5 py-4 border-b ${divider}`}>
                  <h2 className={`text-base font-bold tracking-tight ${textPrimary}`}>Quick Actions</h2>
                </div>
                <div className="p-4 sm:p-5 grid grid-cols-2 gap-3">
                  {quickActions.map((action) => {
                    const Icon = action.icon;
                    const colors = colorMap[action.color];
                    return (
                      <button
                        key={action.label}
                        onClick={() => navigate(action.path)}
                        className={`flex items-center gap-3 p-3.5 rounded-xl border ${colors.border} ${colors.glow} bg-white/70 dark:bg-white/[0.03] backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] group`}
                      >
                        <div className={`p-2 rounded-lg ${colors.bg} shrink-0 transition-transform duration-300 group-hover:scale-105`}>
                          <Icon className={`h-4 w-4 ${colors.icon}`} />
                        </div>
                        <div className="flex flex-col text-left min-w-0">
                          <span className={`text-xs font-bold leading-tight truncate ${textPrimary}`}>{action.label}</span>
                          <span className={`text-[10px] ${isDark ? textMuted : 'text-slate-500'} truncate mt-0.5`}>{action.desc}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tip Card — aligned to match bottom of left card */}
              <div className={`rounded-2xl border ${isDark ? 'border-indigo-500/25 bg-[#0c1024]/75 shadow-[0_0_16px_-4px_rgba(99,102,241,0.15)] backdrop-blur-xl' : 'border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 via-purple-50/50 to-white/90 shadow-[0_0_16px_-4px_rgba(99,102,241,0.1)] backdrop-blur-xl'} p-5 flex flex-col justify-between`}>
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`h-6 w-6 rounded-lg flex items-center justify-center ${isDark ? 'bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 shadow-[0_0_8px_-2px_rgba(99,102,241,0.4)]' : 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-[0_0_10px_-2px_rgba(99,102,241,0.3)]'}`}>
                        <Zap className="h-3.5 w-3.5" />
                      </div>
                      <p className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-indigo-300' : 'text-indigo-900'}`}>Pro Tip</p>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 shadow-[0_0_8px_-2px_rgba(16,185,129,0.3)] px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Engine Ready
                    </span>
                  </div>
                  <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Export timetables to PDF or Excel from the review page. Smart constraints prevent faculty and room double-booking automatically.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Generate Wizard Modal ── */}
      <GenerateWizardModal
        open={showWizard}
        onClose={() => setShowWizard(false)}
        departments={departments}
        defaultDepartmentNames={selectedDashboardDepts}
        onProceed={handleWizardProceed}
        semesterType={semesterType}
      />

      {/* ── Import Even Semester Subjects Modal ── */}
      <ImportEvenSemesterModal
        open={showImportEvenModal}
        onClose={() => setShowImportEvenModal(false)}
        departmentName={selectedDashboardDepts[0] || "AIDS"}
      />
    </div>
  );
};

export default Index;
