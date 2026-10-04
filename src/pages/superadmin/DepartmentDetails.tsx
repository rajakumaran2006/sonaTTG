import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getAllYears, addYear, updateYear, deleteYear, ensureDefaultYears, calculateYearGrandTotalHours, getOpenElectiveHours } from '@/lib/supabaseService';
import Navbar from '@/components/navbar/Navbar';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { useDarkMode } from '@/context/DarkModeContext';
import { ArrowLeft, BookOpen, Calendar, Clock, Layers, Plus, Settings2, Users } from 'lucide-react';

interface Year {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
}

interface YearStats {
  year: string;
  subjects: number;
  totalHours: number;
}

const DepartmentDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isDark } = useDarkMode();
  const isLoggedIn = useMemo(() => localStorage.getItem("superAdmin") === "true", []);
  const [deptName, setDeptName] = useState<string>("");
  const [years, setYears] = useState<Year[]>([]);
  const [yearStats, setYearStats] = useState<YearStats[]>([]);
  const [deptStats, setDeptStats] = useState({ sections: 0, faculty: 0, totalWeeklyPeriods: 0 });
  
  // Year management state
  const [addYearOpen, setAddYearOpen] = useState(false);
  const [newYearName, setNewYearName] = useState('');
  const [newYearOrder, setNewYearOrder] = useState(5);
  const [editingYear, setEditingYear] = useState<Year | null>(null);
  const [editYearName, setEditYearName] = useState('');
  const [editYearOrder, setEditYearOrder] = useState(0);

  useEffect(() => {
    document.title = "Department Details - Super Admin";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Year-wise summary of department academic details.");
  }, []);

  useEffect(() => {
    if (!isLoggedIn) { navigate('/', { replace: true }); return; }
    if (!id) return;
    (async () => {
      const [deptRes, subsRes, ttsRes, facRes, settingsRes, specialRes, oeRes] = await Promise.all([
        (supabase as any).from('departments').select('name').eq('id', id).maybeSingle(),
        (supabase as any).from('subjects').select('year,hours_per_week,type,tags').eq('department_id', id),
        (supabase as any).from('timetables').select('section').eq('department_id', id),
        (supabase as any).from('faculty_members').select('id,name,email,designation').eq('department_id', id).order('name'),
        (supabase as any).from('department_settings').select('*').eq('department_id', id).maybeSingle(),
        (supabase as any).from('special_hours_config').select('year,special_type,total_hours,is_active').eq('department_id', id).eq('is_active', true),
        (supabase as any).from('open_elective_settings').select('year,hours').eq('department_id', id),
      ]);

      setDeptName(deptRes?.data?.name || "");

      const subs = subsRes.data || [];
      const specialConfigs = specialRes.data || [];
      const oeSettingsList = oeRes?.data || [];
      const map = new Map<string, { subjects: number; totalHours: number }>();

      const yearsList = ['I', 'II', 'III', 'IV'];
      for (const yr of yearsList) {
        const yrSubs = subs.filter((s: any) => s.year === yr);
        const yrSpecs = specialConfigs.filter((c: any) => c.year === yr);
        const configSpecialHours = yrSpecs.reduce((a: number, b: any) => a + (b.total_hours || 0), 0);

        let oeHoursSetting = 5;
        const foundOe = oeSettingsList.find((o: any) => o.year === yr);
        if (foundOe && typeof foundOe.hours === 'number') {
          oeHoursSetting = foundOe.hours;
        } else {
          oeHoursSetting = await getOpenElectiveHours(id, yr).catch(() => 5);
        }

        const calc = calculateYearGrandTotalHours({
          subjects: yrSubs,
          specialConfigHours: configSpecialHours,
          openElectiveHoursSetting: oeHoursSetting
        });

        map.set(yr, { subjects: calc.subjectsCount, totalHours: calc.grandTotalHours });
      }

      const arr = Array.from(map.entries()).map(([year, v]) => ({ year, ...v }));
      arr.sort((a, b) => a.year.localeCompare(b.year));
      setYearStats(arr);

      const sections = new Set((ttsRes.data || []).map((t: any) => t.section)).size;
      const totalWeeklyPeriods = arr.reduce((acc: number, y: any) => acc + (y.totalHours || 0), 0);
      const facultyList = facRes.data || [];
      setDeptStats({ sections, faculty: facultyList.length, totalWeeklyPeriods });

      if (settingsRes?.data) {
        const s = settingsRes.data;
        // setSettings({
        //   working_days: s.working_days ?? 6,
        //   periods_per_day: s.periods_per_day ?? 7,
        //   period_duration: s.period_duration ?? 50,
        // });
      }
      // setLoading(false);
    })();
  }, [isLoggedIn, id]);

  useEffect(() => {
    loadYears();
  }, []);

  useEffect(() => {
    (async () => {
      await ensureDefaultYears();
      await loadYears();
    })();
  }, []);

  const handleAddYear = async () => {
    if (!newYearName.trim()) return;
    try {
      await addYear(newYearName.trim(), newYearOrder);
      toast.success('Year added successfully');
      setAddYearOpen(false);
      setNewYearName('');
      setNewYearOrder(5);
      loadYears();
    } catch (error) {
      toast.error('Failed to add year');
    }
  };

  const handleEditYear = (year: Year) => {
    setEditingYear(year);
    setEditYearName(year.name);
    setEditYearOrder(year.display_order);
  };

  const handleUpdateYear = async () => {
    if (!editYearName.trim() || !editingYear) return;
    try {
      await updateYear(editingYear.id, { 
        name: editYearName.trim(), 
        display_order: editYearOrder 
      });
      toast.success('Year updated successfully');
      setEditingYear(null);
      setEditYearName('');
      setEditYearOrder(0);
      loadYears();
    } catch (error) {
      toast.error('Failed to update year');
    }
  };

  const handleToggleYearStatus = async (yearId: string, isActive: boolean) => {
    try {
      await updateYear(yearId, { is_active: isActive });
      toast.success('Year status updated');
      loadYears();
    } catch (error) {
      toast.error('Failed to toggle year status');
    }
  };

  const handleDeleteYear = async (yearId: string) => {
    if (!window.confirm('Are you sure you want to delete this year?')) return;
    try {
      await deleteYear(yearId);
      toast.success('Year deleted');
      loadYears();
    } catch (error) {
      toast.error('Failed to delete year');
    }
  };

  const loadYears = async () => {
    try {
      const yearsData = await getAllYears();
      setYears(yearsData);
    } catch (error) {
      console.error('Failed to load years:', error);
    }
  };

  return (
    <div className={`min-h-screen relative overflow-x-hidden transition-colors duration-300 ${
      isDark ? "bg-[#060814] text-white" : "bg-[#f8faff] text-slate-900"
    }`}>
      {/* Ambient background refraction orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {isDark ? (
          <>
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-br from-indigo-600/10 via-purple-600/08 to-transparent blur-3xl opacity-70" />
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

      <main className="md:pl-72 pt-16 md:pt-16 transition-all duration-300 relative z-10">
        <section className="max-w-7xl mx-auto px-6 sm:px-8 py-8 md:py-10 w-full space-y-8">
          <Breadcrumbs
            segments={[
              { label: 'Super Admin', href: '/super-admin' },
              { label: 'Departments', href: '/super-admin/departments' },
              { label: deptName || 'Department' },
            ]}
          />

          {/* Header Banner */}
          <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-5 p-6 rounded-2xl backdrop-blur-2xl border transition-all duration-300 ${
            isDark
              ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
              : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06)]"
          }`}>
            <div>
              <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full border mb-1 inline-block ${
                isDark ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/25" : "bg-indigo-50 text-indigo-700 border-indigo-200"
              }`}>
                Department Details
              </span>
              <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                isDark ? "text-white" : "bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 bg-clip-text text-transparent"
              }`}>
                {deptName || 'Department Details'}
              </h1>
              <p className={`text-xs sm:text-sm mt-1 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Year-wise academic structure, subject hours, and section distribution.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => navigate('/super-admin/departments')}
                className={`h-10 rounded-xl border text-xs font-semibold px-4 transition-all ${
                  isDark
                    ? "bg-white/5 border-indigo-500/20 text-slate-200 hover:bg-white/10"
                    : "bg-white border-indigo-200/80 text-slate-700 hover:bg-indigo-50"
                }`}
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                Back to Departments
              </Button>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid gap-5 sm:grid-cols-3">
            <div className={`relative rounded-2xl p-6 backdrop-blur-2xl border transition-all duration-300 overflow-hidden ${
              isDark
                ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_12px_-2px_rgba(99,102,241,0.12)]"
                : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06),0_0_10px_-2px_rgba(99,102,241,0.05)]"
            }`}>
              <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-400/30 to-transparent" />
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Total Sections
                </span>
                <Layers className={`h-4 w-4 ${isDark ? "text-indigo-400" : "text-indigo-600"}`} />
              </div>
              <div className={`text-3xl sm:text-4xl font-black tracking-tight mt-2.5 ${isDark ? "text-white" : "text-slate-900"}`}>
                {deptStats.sections}
              </div>
              <p className={`text-xs mt-2 font-medium ${isDark ? "text-indigo-300/60" : "text-indigo-600/80"}`}>
                Active cohort groups
              </p>
            </div>

            <div className={`relative rounded-2xl p-6 backdrop-blur-2xl border transition-all duration-300 overflow-hidden ${
              isDark
                ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_12px_-2px_rgba(99,102,241,0.12)]"
                : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06),0_0_10px_-2px_rgba(99,102,241,0.05)]"
            }`}>
              <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Working Faculty
                </span>
                <Users className={`h-4 w-4 ${isDark ? "text-cyan-400" : "text-cyan-600"}`} />
              </div>
              <div className={`text-3xl sm:text-4xl font-black tracking-tight mt-2.5 ${isDark ? "text-cyan-300" : "text-cyan-600"}`}>
                {deptStats.faculty}
              </div>
              <p className={`text-xs mt-2 font-medium ${isDark ? "text-cyan-300/60" : "text-cyan-700/80"}`}>
                Teaching staff allocated
              </p>
            </div>

            <div className={`relative rounded-2xl p-6 backdrop-blur-2xl border transition-all duration-300 overflow-hidden ${
              isDark
                ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_12px_-2px_rgba(99,102,241,0.12)]"
                : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06),0_0_10px_-2px_rgba(99,102,241,0.05)]"
            }`}>
              <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-purple-400/30 to-transparent" />
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Instructional Periods
                </span>
                <Clock className={`h-4 w-4 ${isDark ? "text-purple-400" : "text-purple-600"}`} />
              </div>
              <div className={`text-3xl sm:text-4xl font-black tracking-tight mt-2.5 ${isDark ? "text-purple-300" : "text-purple-600"}`}>
                {deptStats.totalWeeklyPeriods}
              </div>
              <p className={`text-xs mt-2 font-medium ${isDark ? "text-purple-300/60" : "text-purple-700/80"}`}>
                Weekly scheduled hours
              </p>
            </div>
          </div>

          {/* Year Grid */}
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                  Curriculum Years
                </h2>
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Undergraduate degree stages and semester allocations
                </p>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {['I','II','III','IV'].map((yr) => {
                const y = yearStats.find(s => s.year === yr) || { year: yr, subjects: 0, totalHours: 0 };
                return (
                  <div
                    key={yr}
                    className={`group relative rounded-2xl p-6 backdrop-blur-2xl border transition-all duration-300 flex flex-col justify-between overflow-hidden ${
                      isDark
                        ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_12px_-2px_rgba(99,102,241,0.12)] hover:border-indigo-400/40 hover:shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_20px_-2px_rgba(99,102,241,0.25)]"
                        : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06),0_0_10px_-2px_rgba(99,102,241,0.05)] hover:border-indigo-300 hover:shadow-[0_8px_28px_rgba(99,102,241,0.12)]"
                    }`}
                  >
                    <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-400/30 to-transparent" />

                    <div>
                      <div className={`flex items-center justify-between pb-4 border-b ${
                        isDark ? "border-indigo-500/15" : "border-indigo-100"
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className={`h-11 w-11 rounded-xl flex items-center justify-center font-extrabold text-base border shadow-sm ${
                            isDark
                              ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30 shadow-[0_0_10px_-2px_rgba(99,102,241,0.3)]"
                              : "bg-indigo-50 text-indigo-700 border-indigo-200/80"
                          }`}>
                            {yr}
                          </div>
                          <div>
                            <h3 className={`text-base font-bold leading-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                              Year {yr}
                            </h3>
                            <p className={`text-xs mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                              Semester course curriculum
                            </p>
                          </div>
                        </div>
                        <Button 
                          onClick={() => navigate(`/super-admin/departments/${id}/years/${encodeURIComponent(yr)}`)}
                          className="h-9 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-sm shadow-indigo-500/25 border border-indigo-400/30"
                        >
                          Manage Year
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-5">
                        <div className={`p-3.5 rounded-xl border backdrop-blur-md transition-all ${
                          isDark ? "bg-white/[0.03] border-indigo-500/15" : "bg-indigo-50/40 border-indigo-100/80"
                        }`}>
                          <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                            Curriculum Subjects
                          </span>
                          <span className={`text-2xl font-black mt-1 block ${isDark ? "text-cyan-300" : "text-cyan-600"}`}>
                            {y.subjects}
                          </span>
                        </div>
                        <div className={`p-3.5 rounded-xl border backdrop-blur-md transition-all ${
                          isDark ? "bg-white/[0.03] border-indigo-500/15" : "bg-indigo-50/40 border-indigo-100/80"
                        }`}>
                          <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                            Total Hours / Week
                          </span>
                          <span className={`text-2xl font-black mt-1 block ${isDark ? "text-indigo-300" : "text-indigo-600"}`}>
                            {y.totalHours}h
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Year Management Settings */}
          <div className={`relative rounded-2xl p-6 backdrop-blur-2xl border transition-all duration-300 overflow-hidden ${
            isDark
              ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_12px_-2px_rgba(99,102,241,0.12)]"
              : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06),0_0_10px_-2px_rgba(99,102,241,0.05)]"
          }`}>
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b ${
              isDark ? "border-indigo-500/15" : "border-indigo-100"
            }`}>
              <div>
                <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                  Advanced Year Configuration
                </h3>
                <p className={`text-xs mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Extend curriculum beyond standard 4-year cycle (e.g. 5-year dual degrees)
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <Dialog open={addYearOpen} onOpenChange={setAddYearOpen}>
                  <DialogTrigger asChild>
                    <Button className="h-9 rounded-xl text-xs font-bold px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-sm shadow-indigo-500/25 border border-indigo-400/30">
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Add New Year
                    </Button>
                  </DialogTrigger>
                  <DialogContent className={`rounded-2xl border backdrop-blur-2xl shadow-2xl ${
                    isDark ? "bg-[#0a0e1e]/95 border-indigo-500/25 text-white" : "bg-white/95 border-indigo-200/80 text-slate-900"
                  }`}>
                    <DialogHeader>
                      <DialogTitle className="text-lg font-bold">Add New Year</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div>
                        <Label htmlFor="yearName" className="text-xs font-semibold">Year Name</Label>
                        <Input
                          id="yearName"
                          placeholder="e.g. V, VI"
                          value={newYearName}
                          onChange={(e) => setNewYearName(e.target.value)}
                          className="rounded-xl mt-1.5 text-xs h-10"
                        />
                      </div>
                      <div>
                        <Label htmlFor="yearOrder" className="text-xs font-semibold">Display Order</Label>
                        <Input
                          id="yearOrder"
                          type="number"
                          min="5"
                          value={newYearOrder}
                          onChange={(e) => setNewYearOrder(parseInt(e.target.value) || 5)}
                          className="rounded-xl mt-1.5 text-xs h-10"
                        />
                      </div>
                      <div className="flex justify-end space-x-2 pt-2">
                        <Button variant="outline" className="rounded-xl text-xs" onClick={() => setAddYearOpen(false)}>Cancel</Button>
                        <Button className="rounded-xl text-xs bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleAddYear}>Add Year</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className={`h-9 rounded-xl text-xs font-semibold px-4 border transition-all ${
                        isDark ? "bg-white/5 border-indigo-500/20 text-slate-300 hover:bg-white/10" : "bg-white border-indigo-200 text-slate-700 hover:bg-indigo-50"
                      }`}
                    >
                      <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                      Manage Custom Years
                    </Button>
                  </DialogTrigger>
                  <DialogContent className={`max-w-md rounded-2xl border backdrop-blur-2xl shadow-2xl ${
                    isDark ? "bg-[#0a0e1e]/95 border-indigo-500/25 text-white" : "bg-white/95 border-indigo-200/80 text-slate-900"
                  }`}>
                    <DialogHeader>
                      <DialogTitle className="text-lg font-bold">Custom Academic Years</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                      <div className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        Default undergraduate years (I, II, III, IV) are system defaults.
                      </div>
                      {years.filter(year => !['I', 'II', 'III', 'IV'].includes(year.name)).map((year) => (
                        <div key={year.id} className={`flex items-center justify-between p-3 border rounded-xl ${
                          isDark ? "bg-white/[0.03] border-indigo-500/20 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                        }`}>
                          <span className="font-semibold text-xs">Year {year.name}</span>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 rounded-lg text-xs"
                            onClick={() => handleDeleteYear(year.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      ))}
                      {years.filter(year => !['I', 'II', 'III', 'IV'].includes(year.name)).length === 0 && (
                        <div className={`text-xs text-center py-6 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                          No custom additional years registered.
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default DepartmentDetails;
