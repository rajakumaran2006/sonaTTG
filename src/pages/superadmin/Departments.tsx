import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import Navbar from "@/components/navbar/Navbar";
import { useDarkMode } from "@/context/DarkModeContext";
import { Building2, Search, Trash2, Edit3, ExternalLink, Plus, Filter, Sparkles, Layers } from "lucide-react";

interface Department { id: string; name: string }

type DeptStats = {
  subjects: number;
  staff: number;
  timetables: number;
  sections: number;
  totalWeeklyHours: number;
  activeYears: number;
};

const Departments = () => {
  const navigate = useNavigate();
  const { isDark } = useDarkMode();
  const isLoggedIn = useMemo(() => localStorage.getItem("superAdmin") === "true", []);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [stats, setStats] = useState<{ [id: string]: DeptStats }>({});
  const [search, setSearch] = useState("");

  // Bulk delete state
  const [selectedDepartments, setSelectedDepartments] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState<boolean>(false);
  const [deleteMode, setDeleteMode] = useState<boolean>(false);

  // Single delete state
  const [singleDeleteId, setSingleDeleteId] = useState<string | null>(null);
  const [singleDeleteOpen, setSingleDeleteOpen] = useState(false);

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  const filtered = useMemo(() =>
    departments.filter((d) => d.name.toLowerCase().includes(search.toLowerCase())),
    [departments, search]);

  useEffect(() => {
    document.title = "Departments - Super Admin";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "View and edit departments, staff and subjects counts.");
  }, []);

  useEffect(() => {
    if (!isLoggedIn) { navigate('/', { replace: true }); return; }
    (async () => {
      const { data, error } = await (supabase as any).from('departments').select('*').order('name');
      if (!error) {
        setDepartments(data || []);
        const nameMap: any = {}; (data || []).forEach((d: Department) => nameMap[d.id] = d.name);
        // setNames(nameMap); // This line was removed as per the edit hint
        // fetch stats in parallel per department
        const statEntries = await Promise.all((data || []).map(async (d: Department) => {
          const [subjectsRes, staffCountRes, timetablesRes] = await Promise.all([
            (supabase as any).from('subjects').select('id,hours_per_week,year').eq('department_id', d.id),
            (supabase as any).from('faculty_members').select('*', { count: 'exact', head: true }).eq('department_id', d.id),
            (supabase as any).from('timetables').select('section').eq('department_id', d.id),
          ]);
          const subjects = subjectsRes.data || [];
          const totalWeeklyHours = subjects.reduce((acc: number, s: any) => acc + (s.hours_per_week || 0), 0);
          const activeYears = new Set(subjects.map((s: any) => s.year)).size;
          const sections = new Set((timetablesRes.data || []).map((t: any) => t.section)).size;
          return [d.id, {
            subjects: subjects.length,
            staff: staffCountRes.count || 0,
            timetables: (timetablesRes.data || []).length,
            sections,
            totalWeeklyHours,
            activeYears,
          }] as const;
        }));
        setStats(Object.fromEntries(statEntries));
      }
    })();
  }, [isLoggedIn]);

  // saveName function was removed as per the edit hint

  const exportFiltered = () => {
    const payload = filtered.map((d) => ({
      id: d.id,
      name: d.name,
      stats: stats[d.id],
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'departments-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const duplicateFiltered = async () => {
    if (filtered.length === 0) { toast.message('Nothing to duplicate'); return; }
    const inserts = filtered.map((d) => ({ name: `Copy of ${d.name}` }));
    const { error } = await (supabase as any).from('departments').insert(inserts);
    if (error) { toast.error('Failed to duplicate'); return; }
    toast.success('Duplicated');
    const { data } = await (supabase as any).from('departments').select('*').order('name');
    setDepartments(data || []);
  };

  const handleDepartmentSelect = (deptId: string, checked: boolean) => {
    setSelectedDepartments(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(deptId);
      } else {
        next.delete(deptId);
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    const allIds = new Set(filtered.map(d => d.id));
    setSelectedDepartments(allIds);
  };

  const clearSelection = () => {
    setSelectedDepartments(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedDepartments.size === 0) {
      toast.error('No departments selected');
      return;
    }

    try {
      const deptIds = Array.from(selectedDepartments);

      // Cascade delete each department
      for (const deptId of deptIds) {
        await deleteDepartmentCascade(deptId);
      }

      toast.success(`Successfully deleted ${selectedDepartments.size} department(s)`);

      // Update state
      setDepartments(prev => prev.filter(d => !selectedDepartments.has(d.id)));
      setStats(prev => {
        const newStats = { ...prev };
        selectedDepartments.forEach(id => delete newStats[id]);
        return newStats;
      });
      setSelectedDepartments(new Set());
      setBulkDeleteOpen(false);
      setDeleteMode(false); // Exit delete mode after successful deletion
    } catch (error) {
      console.error('Bulk delete error:', error);
      toast.error('An unexpected error occurred');
    }
  };

  const deleteDepartmentCascade = async (deptId: string) => {
    // Delete in correct order to respect foreign key constraints
    // 1. Delete timetables
    await (supabase as any).from('timetables').delete().eq('department_id', deptId);
    
    // 2. Get all subject IDs for this department to clean up assignments
    const { data: subjects } = await (supabase as any).from('subjects').select('id').eq('department_id', deptId);
    const subjectIds = (subjects || []).map((s: any) => s.id);
    
    if (subjectIds.length > 0) {
      // Delete faculty_subject_assignments referencing these subjects
      await (supabase as any).from('faculty_subject_assignments').delete().in('subject_id', subjectIds);
      // Delete section_subjects referencing these subjects
      await (supabase as any).from('section_subjects').delete().in('subject_id', subjectIds);
    }

    // 3. Delete other department-linked records
    await (supabase as any).from('subjects').delete().eq('department_id', deptId);
    await (supabase as any).from('lab_preferences').delete().eq('department_id', deptId);
    await (supabase as any).from('special_hours_config').delete().eq('department_id', deptId);
    await (supabase as any).from('open_elective_settings').delete().eq('department_id', deptId);
    await (supabase as any).from('class_counselors').delete().eq('department_id', deptId);
    await (supabase as any).from('admin_departments').delete().eq('department_id', deptId);
    await (supabase as any).from('faculty_members').delete().eq('department_id', deptId);
    await (supabase as any).from('lab_schedules').delete().eq('department_id', deptId);
    await (supabase as any).from('timetable_pull_requests').delete().eq('department_id', deptId);
    await (supabase as any).from('faculty_period_schedule').delete().eq('department_id', deptId);

    // 4. Finally delete the department itself
    const { error } = await (supabase as any).from('departments').delete().eq('id', deptId);
    if (error) throw error;
  };

  const handleSingleDelete = async () => {
    if (!singleDeleteId) return;
    try {
      const deptName = departments.find(d => d.id === singleDeleteId)?.name;
      
      await deleteDepartmentCascade(singleDeleteId);

      toast.success(`Department "${deptName}" deleted successfully`);
      setDepartments(prev => prev.filter(d => d.id !== singleDeleteId));
      setStats(prev => {
        const newStats = { ...prev };
        delete newStats[singleDeleteId];
        return newStats;
      });
      setSingleDeleteId(null);
      setSingleDeleteOpen(false);
    } catch (error) {
      console.error('Single delete error:', error);
      toast.error('An unexpected error occurred');
    }
  };

  const handleEdit = (id: string, name: string) => {
    navigate(`/super-admin/departments/edit/${id}`, { state: { name } });
  };

  const handleInlineEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const handleSaveEdit = async (id: string) => {
    if (editingName.trim() === '') return;

    try {
      const { error } = await supabase
        .from('departments')
        .update({ name: editingName.trim() })
        .eq('id', id);

      if (error) throw error;

      // Update local state
      setDepartments(prev =>
        prev.map(d => d.id === id ? { ...d, name: editingName.trim() } : d)
      );

      // Reset editing state
      setEditingId(null);
      setEditingName('');

      toast.success('Department name updated successfully');
    } catch (error) {
      console.error('Error updating department:', error);
      toast.error('Failed to update department name');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
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
          {/* Header Banner */}
          <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-5 p-6 rounded-2xl backdrop-blur-2xl border transition-all duration-300 ${
            isDark
              ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
              : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06)]"
          }`}>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full border ${
                  isDark
                    ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/25"
                    : "bg-indigo-50 text-indigo-700 border-indigo-200"
                }`}>
                  Academic Branches
                </span>
                <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  {filtered.length} {filtered.length === 1 ? 'department' : 'departments'}
                </span>
              </div>
              <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                isDark ? "text-white" : "bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 bg-clip-text text-transparent"
              }`}>
                Departments
              </h1>
              <p className={`text-xs sm:text-sm mt-1 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Overview, academic staff, and curriculum structure across all institutional departments.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[240px]">
                <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? "text-slate-400" : "text-slate-500"}`} />
                <Input
                  className={`h-10 pl-10 rounded-xl text-xs transition-all border ${
                    isDark
                      ? "bg-white/[0.04] border-indigo-500/25 text-white placeholder:text-slate-500 focus-visible:ring-indigo-500/40"
                      : "bg-white border-indigo-200/80 text-slate-800 placeholder:text-slate-400 focus-visible:ring-indigo-400/30"
                  }`}
                  placeholder="Search departments..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeleteMode(!deleteMode)}
                className={`h-10 rounded-xl text-xs font-semibold px-4 border transition-all ${
                  deleteMode
                    ? "bg-rose-500/15 text-rose-400 border-rose-500/30 hover:bg-rose-500/20"
                    : isDark
                    ? "bg-white/5 border-indigo-500/20 text-slate-300 hover:bg-white/10"
                    : "bg-white border-indigo-200/80 text-slate-700 hover:bg-indigo-50"
                }`}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                {deleteMode ? "Exit Delete Mode" : "Select & Delete"}
              </Button>

              {deleteMode && selectedDepartments.size > 0 && (
                <Button
                  size="sm"
                  onClick={() => setBulkDeleteOpen(true)}
                  className="h-10 rounded-xl text-xs font-semibold px-4 bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20"
                >
                  Delete Selected ({selectedDepartments.size})
                </Button>
              )}

              {deleteMode && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={selectAllFiltered}
                  className={`h-10 rounded-xl text-xs font-semibold px-3.5 border ${
                    isDark ? "bg-white/5 border-indigo-500/20 text-slate-300" : "bg-white border-indigo-200 text-slate-700"
                  }`}
                >
                  Select All
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className={`h-10 rounded-xl border text-xs font-semibold px-4 transition-all ${
                      isDark
                        ? "bg-white/5 border-indigo-500/20 text-slate-200 hover:bg-white/10"
                        : "bg-white border-indigo-200/80 text-slate-700 hover:bg-indigo-50"
                    }`}
                  >
                    Bulk Actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className={`rounded-2xl border backdrop-blur-2xl p-1.5 shadow-xl ${
                    isDark ? "bg-[#090d1c]/95 border-indigo-500/25 text-white" : "bg-white/95 border-indigo-200/80 text-slate-800"
                  }`}
                >
                  <DropdownMenuItem onClick={exportFiltered} className="cursor-pointer rounded-xl text-xs py-2">
                    Export (JSON)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={duplicateFiltered} className="cursor-pointer rounded-xl text-xs py-2">
                    Duplicate Filtered
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Departments Grid */}
          <div className={view === 'grid' ? 'grid gap-6 md:grid-cols-2 lg:grid-cols-3' : 'grid gap-4'}>
            {filtered.map((d) => (
              <div
                key={d.id}
                className={`group relative rounded-2xl p-6 backdrop-blur-2xl border transition-all duration-300 flex flex-col justify-between overflow-hidden ${
                  isDark
                    ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_12px_-2px_rgba(99,102,241,0.12)] hover:border-indigo-400/40 hover:shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_20px_-2px_rgba(99,102,241,0.25)]"
                    : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06),0_0_10px_-2px_rgba(99,102,241,0.05)] hover:border-indigo-300 hover:shadow-[0_8px_28px_rgba(99,102,241,0.12)]"
                }`}
              >
                {/* Specular inner reflection highlight */}
                <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-400/30 to-transparent" />

                <div>
                  <div className={`flex items-start justify-between gap-3 pb-4 border-b ${
                    isDark ? "border-indigo-500/15" : "border-indigo-100"
                  }`}>
                    <div className="flex items-center space-x-3 min-w-0">
                      {deleteMode && (
                        <input
                          type="checkbox"
                          checked={selectedDepartments.has(d.id)}
                          onChange={(e) => handleDepartmentSelect(d.id, e.target.checked)}
                          className="h-4 w-4 rounded accent-indigo-600 border-indigo-400/30"
                        />
                      )}
                      {editingId === d.id ? (
                        <div className="flex items-center space-x-2">
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="h-8 w-36 rounded-lg text-xs"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(d.id);
                              else if (e.key === 'Escape') handleCancelEdit();
                            }}
                          />
                          <Button size="sm" className="h-8 text-xs px-2.5 rounded-lg bg-indigo-600 text-white" onClick={() => handleSaveEdit(d.id)}>Save</Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs px-2.5 rounded-lg" onClick={handleCancelEdit}>Cancel</Button>
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 border ${
                              isDark
                                ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-400"
                                : "bg-indigo-50 border-indigo-200 text-indigo-600"
                            }`}>
                              <Building2 className="h-4 w-4" />
                            </div>
                            <h3 className={`text-base font-bold truncate leading-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                              {d.name}
                            </h3>
                          </div>
                          <p className={`text-[11px] mt-1 ml-9 font-medium ${isDark ? "text-indigo-400/70" : "text-indigo-600/80"}`}>
                            {stats[d.id]?.activeYears ?? 0} active year curriculum
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center space-x-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className={`h-8 px-2.5 rounded-xl text-xs font-semibold border transition-all ${
                          isDark
                            ? "border-indigo-500/20 bg-white/5 hover:bg-white/10 text-slate-300"
                            : "border-indigo-200/80 bg-white hover:bg-indigo-50 text-slate-700"
                        }`}
                        onClick={() => handleInlineEdit(d.id, d.name)}
                      >
                        <Edit3 className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2.5 rounded-xl text-xs font-semibold text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                        onClick={() => { setSingleDeleteId(d.id); setSingleDeleteOpen(true); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 px-3 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-sm shadow-indigo-500/25 border border-indigo-400/30"
                        onClick={() => navigate(`/super-admin/departments/${d.id}`)}
                      >
                        View
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  </div>

                  {/* 2x3 Metric Cards Grid */}
                  <div className="grid grid-cols-2 gap-2.5 pt-4">
                    <div className={`p-3 rounded-xl border backdrop-blur-md transition-all ${
                      isDark ? "bg-white/[0.03] border-indigo-500/15" : "bg-indigo-50/40 border-indigo-100/80"
                    }`}>
                      <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        Working Staff
                      </span>
                      <span className={`text-xl font-black mt-0.5 block ${isDark ? "text-indigo-300" : "text-indigo-600"}`}>
                        {stats[d.id]?.staff ?? '-'}
                      </span>
                    </div>

                    <div className={`p-3 rounded-xl border backdrop-blur-md transition-all ${
                      isDark ? "bg-white/[0.03] border-indigo-500/15" : "bg-indigo-50/40 border-indigo-100/80"
                    }`}>
                      <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        Subjects
                      </span>
                      <span className={`text-xl font-black mt-0.5 block ${isDark ? "text-cyan-300" : "text-cyan-600"}`}>
                        {stats[d.id]?.subjects ?? '-'}
                      </span>
                    </div>

                    <div className={`p-3 rounded-xl border backdrop-blur-md transition-all ${
                      isDark ? "bg-white/[0.03] border-indigo-500/15" : "bg-indigo-50/40 border-indigo-100/80"
                    }`}>
                      <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        Timetables
                      </span>
                      <span className={`text-xl font-black mt-0.5 block ${isDark ? "text-purple-300" : "text-purple-600"}`}>
                        {stats[d.id]?.timetables ?? '-'}
                      </span>
                    </div>

                    <div className={`p-3 rounded-xl border backdrop-blur-md transition-all ${
                      isDark ? "bg-white/[0.03] border-indigo-500/15" : "bg-indigo-50/40 border-indigo-100/80"
                    }`}>
                      <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        Sections
                      </span>
                      <span className={`text-xl font-black mt-0.5 block ${isDark ? "text-emerald-300" : "text-emerald-600"}`}>
                        {stats[d.id]?.sections ?? '-'}
                      </span>
                    </div>

                    <div className={`p-3 rounded-xl border backdrop-blur-md col-span-2 flex items-center justify-between transition-all ${
                      isDark ? "bg-white/[0.03] border-indigo-500/15" : "bg-indigo-50/40 border-indigo-100/80"
                    }`}>
                      <div>
                        <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                          Total Weekly Hours
                        </span>
                        <span className={`text-base font-extrabold mt-0.5 block ${isDark ? "text-white" : "text-slate-900"}`}>
                          {stats[d.id]?.totalWeeklyHours ?? '-'} hrs/week
                        </span>
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                        isDark
                          ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                          : "bg-indigo-100 text-indigo-700 border-indigo-200"
                      }`}>
                        {stats[d.id]?.activeYears ?? '-'} Years
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent className={`rounded-2xl border backdrop-blur-2xl shadow-2xl ${
          isDark ? "bg-[#0a0e1e]/95 border-indigo-500/25 text-white" : "bg-white/95 border-indigo-200/80 text-slate-900"
        }`}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">Delete Selected Departments?</AlertDialogTitle>
            <AlertDialogDescription className={isDark ? "text-slate-400" : "text-slate-600"}>
              This will permanently remove {selectedDepartments.size} department(s) and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className={`max-h-40 overflow-y-auto rounded-xl p-3 border my-3 ${
            isDark ? "bg-white/[0.03] border-indigo-500/20" : "bg-slate-50 border-slate-200"
          }`}>
            <div className="text-xs font-bold mb-2">Departments to be deleted:</div>
            <div className="space-y-1">
              {Array.from(selectedDepartments).map(deptId => {
                const dept = departments.find(d => d.id === deptId);
                return dept ? (
                  <div key={deptId} className={`text-xs ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    • {dept.name}
                  </div>
                ) : null;
              })}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700 rounded-xl"
              onClick={handleBulkDelete}
            >
              Delete {selectedDepartments.size} Department(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single Delete Confirmation Dialog */}
      <AlertDialog open={singleDeleteOpen} onOpenChange={setSingleDeleteOpen}>
        <AlertDialogContent className={`rounded-2xl border backdrop-blur-2xl shadow-2xl ${
          isDark ? "bg-[#0a0e1e]/95 border-indigo-500/25 text-white" : "bg-white/95 border-indigo-200/80 text-slate-900"
        }`}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">Delete Department?</AlertDialogTitle>
            <AlertDialogDescription className={isDark ? "text-slate-400" : "text-slate-600"}>
              This will permanently remove <strong className={isDark ? "text-white" : "text-slate-900"}>
                {departments.find(d => d.id === singleDeleteId)?.name}
              </strong> and all associated data (subjects, timetables, faculty assignments). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700 rounded-xl"
              onClick={handleSingleDelete}
            >
              Delete Department
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Departments;
