import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import AdminNavbar from '@/components/navbar/AdminNavbar';
import SuperNavbar from '@/components/navbar/Navbar';
import FacultyNavbar from '@/components/navbar/facultyadmin';
import SelectionHeader from '@/components/admin/SelectionHeader';
import { Upload, BookOpen, Clock, ChevronRight, Sparkles, BookMarked } from 'lucide-react';
import { toast } from 'sonner';
import { useTimetableStore } from '@/store/timetableStore';
import { calculateYearGrandTotalHours, getOpenElectiveHours } from '@/lib/supabaseService';
import { useDarkMode } from '@/context/DarkModeContext';

interface YearStats {
  year: string;
  subjects: number;
  totalHours: number;
}

const AdminDepartmentYears = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isDark } = useDarkMode();
  const superAdmin = localStorage.getItem("superAdmin") === "true";
  const adminUser = localStorage.getItem("adminUser");
  const facultyUser = localStorage.getItem("facultyUser");
  
  const userType = superAdmin ? 'super' : adminUser ? 'admin' : facultyUser ? 'faculty' : null;
  const sessionUser = useMemo(() => {
    if (adminUser) return JSON.parse(adminUser);
    if (facultyUser) return JSON.parse(facultyUser);
    if (superAdmin) return { role: 'super_admin', email: 'superadmin@sonatech.ac.in' };
    return null;
  }, [adminUser, facultyUser, superAdmin]);

  const [deptName, setDeptName] = useState<string>("");
  const [yearStats, setYearStats] = useState<YearStats[]>([]);
  const [loading, setLoading] = useState(true);

  const [allocatedDepts, setAllocatedDepts] = useState<{ id: string; name: string }[]>([]);
  const [activeDeptId, setActiveDeptId] = useState<string>(() => searchParams.get('deptId') || "");

  useEffect(() => {
    if (superAdmin) {
      (async () => {
        const { data } = await (supabase as any)
          .from('departments')
          .select('id, name')
          .order('name');
        if (data && data.length > 0) {
          setAllocatedDepts(data);
          const qDept = searchParams.get('deptId');
          const matched = data.find((d: any) => d.id === qDept);
          const initialId = matched?.id || data[0].id;
          setActiveDeptId(initialId);
          if (qDept !== initialId) {
            setSearchParams(prev => {
              const next = new URLSearchParams(prev);
              next.set('deptId', initialId);
              return next;
            }, { replace: true });
          }
          const activeDeptObj = data.find((d: any) => d.id === initialId);
          if (activeDeptObj) {
            useTimetableStore.setState(state => ({
              ...state,
              selection: { ...state.selection, department: activeDeptObj.name }
            }));
          }
        }
      })();
      return;
    }

    if (!sessionUser) return;

    // First try admin_departments table for multi-dept support
    (async () => {
      let deptIds: string[] = [];

      if (sessionUser.id) {
        const { data: adminDepts } = await (supabase as any)
          .from('admin_departments')
          .select('department_id')
          .eq('admin_id', sessionUser.id);

        if (adminDepts && adminDepts.length > 0) {
          deptIds = adminDepts.map((d: any) => d.department_id);
        }
      }

      // Fallback: legacy fields
      if (deptIds.length === 0) {
        if (sessionUser.department_ids && sessionUser.department_ids.length > 0) {
          deptIds = sessionUser.department_ids;
        } else if (sessionUser.department_id) {
          deptIds = [sessionUser.department_id];
        }
      }

      if (deptIds.length > 0) {
        const { data } = await (supabase as any)
          .from('departments')
          .select('id, name')
          .in('id', deptIds)
          .order('name');

        if (data && data.length > 0) {
          setAllocatedDepts(data);
          const qDept = searchParams.get('deptId');
          const matchedQ = data.find((d: any) => d.id === qDept);
          const matchedStored = adminUser ? (() => {
            try {
              const p = JSON.parse(adminUser);
              return data.find((d: any) => d.id === p.department_id);
            } catch { return undefined; }
          })() : undefined;
          
          const currentActive = matchedQ?.id || matchedStored?.id || data[0]?.id;
          setActiveDeptId(currentActive || '');

          if (currentActive) {
            if (qDept !== currentActive) {
              setSearchParams(prev => {
                const next = new URLSearchParams(prev);
                next.set('deptId', currentActive);
                return next;
              }, { replace: true });
            }
            if (adminUser) {
              try {
                const parsed = JSON.parse(adminUser);
                if (parsed.department_id !== currentActive) {
                  parsed.department_id = currentActive;
                  localStorage.setItem("adminUser", JSON.stringify(parsed));
                }
              } catch {}
            }
            const activeDeptObj = data.find((d: any) => d.id === currentActive);
            if (activeDeptObj) {
              useTimetableStore.setState(state => ({
                ...state,
                selection: { ...state.selection, department: activeDeptObj.name }
              }));
            }
          }
        }
      }
    })();
  }, [adminUser, facultyUser, sessionUser, superAdmin]);

  const semesterType = useTimetableStore((s) => s.semesterType);
  const setSemesterType = useTimetableStore((s) => s.setSemesterType);
  const [hasEven, setHasEven] = useState(false);
  const [addingLibYear, setAddingLibYear] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!userType || !activeDeptId) return;
    setLoading(true);
    try {
      const [deptRes, subsRes, specialRes] = await Promise.all([
        (supabase as any)
          .from('departments')
          .select('name')
          .eq('id', activeDeptId)
          .maybeSingle(),
        (supabase as any)
          .from('subjects')
          .select('*')
          .eq('department_id', activeDeptId)
          .order('name'),
        (supabase as any)
          .from('special_hours_config')
          .select('*')
          .eq('department_id', activeDeptId)
          .eq('is_active', true)
      ]);

      if (deptRes?.data?.name) {
        setDeptName(deptRes.data.name);
        useTimetableStore.setState(state => ({
          ...state,
          selection: { ...state.selection, department: deptRes.data.name }
        }));
      }

      const allSubs = subsRes?.data || [];
      const specialConfigs = specialRes?.data || [];

      const evenExists = allSubs.some((s: any) =>
        (s.tags || []).some((t: string) => /even_sem|even\b/i.test(t))
      );
      setHasEven(evenExists);

      const activeSem = (!evenExists && semesterType === 'even') ? 'odd' : semesterType;
      if (!evenExists && semesterType === 'even') {
        setSemesterType('odd');
      }

      const years = ['I', 'II', 'III', 'IV'];
      const stats: YearStats[] = [];

      for (const yr of years) {
        const yrSubs = allSubs.filter((s: any) => {
          if (s.year !== yr) return false;
          if (evenExists) {
            const isEven = (s.tags || []).some((t: string) => /even_sem|even\b/i.test(t));
            return activeSem === 'even' ? isEven : !isEven;
          }
          return true;
        });

        const yrSpecs = specialConfigs.filter((c: any) => c.year === yr);
        const satHours = yrSpecs.reduce((a: number, b: any) => a + (b.saturday_hours || 0), 0);
        const defaultSat = yr === 'II' ? 3 : (yr === 'III' || yr === 'IV' ? 5 : 0);
        const configSpecialHours = satHours > 0 ? satHours : defaultSat;

        const oeHours = (await getOpenElectiveHours(activeDeptId, yr).catch(() => 5)) || 5;

        const calc = calculateYearGrandTotalHours({
          subjects: yrSubs,
          specialConfigHours: configSpecialHours,
          openElectiveHoursSetting: oeHours
        });

        stats.push({
          year: yr,
          subjects: calc.subjectsCount,
          totalHours: calc.grandTotalHours,
        });
      }

      setYearStats(stats);
    } catch (err) {
      console.error("Error loading year stats:", err);
    } finally {
      setLoading(false);
    }
  }, [activeDeptId, userType, semesterType, setSemesterType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddLibForYear = async (year: string, currentHours: number) => {
    if (!activeDeptId || currentHours >= 42 || currentHours <= 0) return;
    const deficit = Math.max(0, 42 - currentHours);
    setAddingLibYear(year);

    try {
      const activeSem = (!hasEven && semesterType === 'even') ? 'odd' : semesterType;
      // 1. Search for existing Library subject for this department, year, and active semester
      const { data: existingLibSubs } = await (supabase as any)
        .from('subjects')
        .select('*')
        .eq('department_id', activeDeptId)
        .eq('year', year)
        .ilike('name', '%library%');

      const semLib = (existingLibSubs || []).find((s: any) => {
        const isEven = (s.tags || []).some((t: string) => /even_sem|even\b/i.test(t));
        return activeSem === 'even' ? isEven : !isEven;
      });

      if (semLib) {
        const newHpw = (semLib.hours_per_week || 0) + deficit;
        const { error } = await (supabase as any)
          .from('subjects')
          .update({
            type: 'theory',
            hours_per_week: newHpw,
            updated_at: new Date().toISOString()
          })
          .eq('id', semLib.id);

        if (error) throw error;
      } else {
        const tagList = activeSem === 'even' ? ['even_sem'] : ['odd_sem'];
        const existingNames = new Set((existingLibSubs || []).map((s: any) => String(s.name).trim().toLowerCase()));

        let targetName = activeSem === 'even' ? 'Library (Even)' : 'Library';
        if (existingNames.has(targetName.toLowerCase())) {
          targetName = activeSem === 'even' ? 'Library (Even Sem)' : 'Library (Odd)';
        }

        const { error } = await (supabase as any)
          .from('subjects')
          .insert({
            department_id: activeDeptId,
            year: year,
            name: targetName,
            code: 'LIB',
            abbreviation: 'LIB',
            type: 'theory',
            hours_per_week: deficit,
            credits: 1,
            tags: tagList,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (error) throw error;
      }

      toast.success(`Added ${deficit}h Library for ${activeSem === 'even' ? 'Even' : 'Odd'} Semester. Weekly load is now exactly 42h!`);
      await loadData();
    } catch (err: any) {
      console.error("Failed to add library hours:", err);
      toast.error(`Failed to add library hours: ${err.message || 'Unknown error'}`);
    } finally {
      setAddingLibYear(null);
    }
  };

  const handleManageYear = (year: string) => {
    useTimetableStore.setState(state => ({
      ...state,
      selection: { ...state.selection, year: year, department: deptName }
    }));

    if (userType === 'admin') {
      navigate(`/admin/subjects/${encodeURIComponent(year)}?deptId=${activeDeptId}`);
    } else if (userType === 'super') {
      navigate(`/super-admin/departments/${activeDeptId}/years/${encodeURIComponent(year)}?deptId=${activeDeptId}`);
    } else {
      navigate(`/faculty/subjects/${encodeURIComponent(year)}?deptId=${activeDeptId}`);
    }
  };

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

      {userType === 'admin' ? <AdminNavbar /> : userType === 'super' ? <SuperNavbar /> : <FacultyNavbar />}
      
      <main className={`transition-all duration-300 relative z-10 ${
        userType === 'faculty' ? '' : 'md:pl-72'
      } ${
        userType === 'super' ? 'pt-16 md:pt-16' : userType === 'faculty' ? '' : 'pt-16 md:pt-0'
      }`}>
        <SelectionHeader />
        <section className="max-w-7xl mx-auto px-6 sm:px-8 py-8 md:py-10 space-y-8">
          {allocatedDepts.length > 0 && (
            <div className={`flex p-1.5 rounded-2xl border backdrop-blur-xl gap-2 overflow-x-auto whitespace-nowrap scrollbar-none shadow-sm ${
              isDark ? "bg-[#090d1c]/80 border-indigo-500/20" : "bg-white/80 border-indigo-200/60"
            }`}>
              {allocatedDepts.map((dept) => {
                const isActive = dept.id === activeDeptId;
                return (
                  <button
                    key={dept.id}
                    onClick={() => {
                      setActiveDeptId(dept.id);
                      setSearchParams(prev => {
                        const next = new URLSearchParams(prev);
                        next.set('deptId', dept.id);
                        return next;
                      }, { replace: true });
                      if (adminUser) {
                        try {
                          const parsed = JSON.parse(adminUser);
                          parsed.department_id = dept.id;
                          localStorage.setItem("adminUser", JSON.stringify(parsed));
                        } catch {}
                      }
                      useTimetableStore.setState(state => ({
                        ...state,
                        selection: { ...state.selection, department: dept.name }
                      }));
                    }}
                    className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-200 ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/25 border border-indigo-400/40"
                        : isDark
                          ? "text-slate-400 hover:text-white hover:bg-white/[0.04]"
                          : "text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60"
                    }`}
                  >
                    {dept.name}
                  </button>
                );
              })}
            </div>
          )}

          <header className={`flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl backdrop-blur-2xl border transition-all duration-300 ${
            isDark ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.4)]" : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06)]"
          }`}>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-500 dark:text-indigo-300 text-xs font-bold border border-indigo-500/20 mb-2">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Curriculum Directory</span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight">Course Subjects</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Select an academic year to manage subjects, credits, and syllabus allocations for {deptName || 'selected department'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
              {/* Semester Switcher */}
              <div className={`flex items-center gap-1 p-1 rounded-xl border ${
                isDark ? "bg-[#0e1326] border-indigo-500/20" : "bg-indigo-50/70 border-indigo-100"
              }`}>
                <button
                  type="button"
                  onClick={() => setSemesterType("odd")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    semesterType === "odd"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/30 border border-indigo-400/40"
                      : isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Odd Semester
                </button>
                <button
                  type="button"
                  onClick={() => setSemesterType("even")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    semesterType === "even"
                      ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/30 border border-amber-400/40"
                      : isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Even Semester
                </button>
              </div>

              {userType === 'admin' && (
                <Button onClick={() => navigate(activeDeptId ? `/csv-upload?deptId=${activeDeptId}` : '/csv-upload')} className="rounded-xl shadow-md bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-400/40 flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  <span>Bulk Import CSV</span>
                </Button>
              )}
            </div>
          </header>

          {semesterType === 'even' && !hasEven && !loading && (
            <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isDark ? "bg-amber-950/20 border-amber-500/30 text-amber-200" : "bg-amber-50 border-amber-200 text-amber-800"
            }`}>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold">Notice:</span>
                <span>No Even Semester subjects found for {deptName || 'this department'}. You can switch to Odd Semester or upload Even Semester subjects via Bulk Import CSV.</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSemesterType('odd')}
                className={`text-xs font-bold border shrink-0 ${
                  isDark ? "border-amber-500/40 hover:bg-amber-500/20 text-white" : "border-amber-300 hover:bg-amber-100 text-amber-900"
                }`}
              >
                Switch to Odd Semester
              </Button>
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={`rounded-3xl p-7 border animate-pulse ${
                  isDark ? "bg-[#090d1c]/50 border-indigo-500/10" : "bg-white/50 border-indigo-100"
                }`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-8 w-28 bg-indigo-500/10 rounded-xl" />
                    <div className="h-6 w-36 bg-indigo-500/10 rounded-full" />
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className={`p-4 rounded-2xl ${subCardGlass}`}>
                      <div className="h-4 w-16 bg-indigo-500/10 rounded mb-2" />
                      <div className="h-8 w-12 bg-indigo-500/15 rounded" />
                    </div>
                    <div className={`p-4 rounded-2xl ${subCardGlass}`}>
                      <div className="h-4 w-20 bg-indigo-500/10 rounded mb-2" />
                      <div className="h-8 w-14 bg-indigo-500/15 rounded" />
                    </div>
                  </div>
                  <div className="h-11 bg-indigo-500/15 rounded-xl w-full" />
                </div>
              ))
            ) : yearStats.length === 0 ? (
              <div className="col-span-2 text-center py-16 rounded-3xl border border-dashed border-indigo-300/40 p-8">
                <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <h3 className="text-lg font-bold">No Curriculum Data Found</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Upload subjects using Bulk Import CSV or switch semester to view active courses.
                </p>
              </div>
            ) : (
              yearStats.map((y) => (
              <div 
                key={y.year} 
                className={`group relative rounded-3xl p-7 flex flex-col justify-between transition-all duration-300 ${cardGlass}`}
              >
                {/* Specular highlight */}
                <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-400/30 to-transparent pointer-events-none" />

                <div>
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <h2 className="text-2xl font-bold tracking-tight">
                      Year {y.year}
                    </h2>
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20">
                      Academic Curriculum
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className={`p-4 rounded-2xl ${subCardGlass}`}>
                      <div className="flex items-center gap-2 text-indigo-400 mb-1">
                        <BookOpen className="h-3.5 w-3.5" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Subjects</span>
                      </div>
                      <div className="text-3xl font-bold mt-1 tracking-tight text-foreground">{y.subjects}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Active curriculum courses</div>
                    </div>
                    <div className={`p-4 rounded-2xl ${subCardGlass} relative flex flex-col justify-between`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 text-purple-400">
                          <Clock className="h-3.5 w-3.5" />
                          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Weekly Load</span>
                        </div>
                        {y.totalHours < 42 && y.totalHours > 0 && y.subjects > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            Limited ({y.totalHours}/42h)
                          </span>
                        )}
                      </div>
                      <div className="flex items-baseline justify-between mt-1">
                        <div className="text-3xl font-bold tracking-tight text-foreground">{y.totalHours}h</div>
                        {y.totalHours < 42 && y.totalHours > 0 && y.subjects > 0 && (
                          <Button 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddLibForYear(y.year, y.totalHours);
                            }}
                            disabled={addingLibYear === y.year}
                            className="h-7 px-2.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center gap-1.5"
                          >
                            <BookMarked className="h-3.5 w-3.5" />
                            <span>{addingLibYear === y.year ? "Adding..." : "Add Lib"}</span>
                          </Button>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {y.subjects === 0
                          ? "No active curriculum courses"
                          : y.totalHours < 42 
                            ? `${42 - y.totalHours}h deficit below 42h required`
                            : "Total scheduled instructional hours"}
                      </div>
                    </div>
                  </div>
                </div>

                <Button 
                  onClick={() => handleManageYear(y.year)}
                  className="w-full rounded-xl font-bold shadow-md bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-400/40 flex items-center justify-center gap-2"
                >
                  <span>{userType === 'admin' ? 'Manage Year Curriculum' : 'View Subjects'}</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default AdminDepartmentYears;
