import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/navbar/Navbar";
import AdminNavbar from "@/components/navbar/AdminNavbar";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TimetableViewer from "@/components/TimetableViewer";
import { useToast } from "@/hooks/use-toast";
import { 
  Eye, 
  Trash2, 
  Calendar, 
  Filter, 
  Clock, 
  Layers, 
  Sparkles, 
  Building2, 
  Search, 
  ArrowUpDown, 
  RotateCcw, 
  GraduationCap,
  Maximize2,
  Edit,
  LayoutGrid,
  Printer
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useDarkMode } from "@/context/DarkModeContext";
import { getDeptShortName } from "@/lib/timetablePdfExport";

const timetableColumns = [
  { key: 'p1', label: 'P1', time: '9:00-9:55', type: 'period' },
  { key: 'p2', label: 'P2', time: '9:55-10:50', type: 'period' },
  { key: 'b1', label: 'BREAK', time: '10:50-11:05', type: 'break' },
  { key: 'p3', label: 'P3', time: '11:05-12:00', type: 'period' },
  { key: 'p4', label: 'P4', time: '12:00-12:55', type: 'period' },
  { key: 'lunch', label: 'LUNCH', time: '12:55-1:55', type: 'lunch' },
  { key: 'p5', label: 'P5', time: '1:55-2:50', type: 'period' },
  { key: 'p6', label: 'P6', time: '2:50-3:45', type: 'period' },
  { key: 'b2', label: 'BREAK', time: '3:45-3:55', type: 'break' },
  { key: 'p7', label: 'P7', time: '3:55-4:50', type: 'period' },
];

const dayNames = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const parseGrid = (grid: any): any[][] => {
  if (Array.isArray(grid)) return grid;
  if (typeof grid === 'string') {
    try {
      const parsed = JSON.parse(grid);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
};

const getDisplayRow = (rawRow: any[] | undefined) => {
  if (!Array.isArray(rawRow) || rawRow.length === 0) {
    return Array(10).fill('');
  }
  if (
    rawRow.length >= 10 ||
    rawRow.some(
      (c) =>
        typeof c === 'string' &&
        (c.toUpperCase().includes('BREAK') || c.toUpperCase().includes('LUNCH'))
    )
  ) {
    const res = [...rawRow.slice(0, 10)];
    while (res.length < 10) res.push('');
    return res;
  }
  return [
    rawRow[0] || '',
    rawRow[1] || '',
    'BREAK',
    rawRow[2] || '',
    rawRow[3] || '',
    'LUNCH',
    rawRow[4] || '',
    rawRow[5] || '',
    'BREAK',
    rawRow[6] || '',
  ];
};

const getCellDisplay = (cell: any): { title: string; subtitle?: string; isBreak?: boolean; isLunch?: boolean } => {
  if (!cell) return { title: '-' };
  if (typeof cell === 'string') {
    const s = cell.trim();
    if (!s || s === '-') return { title: '-' };
    if (s.toUpperCase() === 'BREAK' || s.toUpperCase() === 'TEA BREAK') {
      return { title: 'BREAK', isBreak: true };
    }
    if (s.toUpperCase() === 'LUNCH' || s.toUpperCase() === 'LUNCH BREAK') {
      return { title: 'LUNCH', isLunch: true };
    }
    if (s.includes('\n')) {
      const parts = s.split('\n').map((p) => p.trim()).filter(Boolean);
      return { title: parts[0] || '', subtitle: parts.slice(1).join(' / ') };
    }
    const match = s.match(/^(.*?)\s*\((.*?)\)$/);
    if (match) {
      return { title: match[1].trim(), subtitle: match[2].trim() };
    }
    return { title: s };
  }
  if (typeof cell === 'object') {
    const title = cell.subject || cell.name || cell.code || cell.title || '';
    const subtitle = cell.faculty || cell.staff || cell.staff_name || cell.faculty_name || '';
    return { title: String(title), subtitle: subtitle ? String(subtitle) : undefined };
  }
  return { title: String(cell) };
};

// Normalizes year representations (Roman numerals, numbers, text) into comparable integers
const parseYearOrder = (year: string | number | undefined | null): number => {
  if (year === null || year === undefined) return 999;
  if (typeof year === "number") return year;
  const s = String(year).trim().toUpperCase();

  const directMap: Record<string, number> = {
    "1": 1, "I": 1, "FIRST": 1, "1ST": 1, "YR 1": 1, "YEAR 1": 1, "YEAR I": 1,
    "2": 2, "II": 2, "SECOND": 2, "2ND": 2, "YR 2": 2, "YEAR 2": 2, "YEAR II": 2,
    "3": 3, "III": 3, "THIRD": 3, "3RD": 3, "YR 3": 3, "YEAR 3": 3, "YEAR III": 3,
    "4": 4, "IV": 4, "FOURTH": 4, "4TH": 4, "YR 4": 4, "YEAR 4": 4, "YEAR IV": 4,
    "5": 5, "V": 5, "FIFTH": 5, "5TH": 5, "YR 5": 5, "YEAR 5": 5, "YEAR V": 5,
    "6": 6, "VI": 6, "YR 6": 6, "YEAR 6": 6, "YEAR VI": 6,
    "7": 7, "VII": 7, "YR 7": 7, "YEAR 7": 7, "YEAR VII": 7,
    "8": 8, "VIII": 8, "YR 8": 8, "YEAR 8": 8, "YEAR VIII": 8,
  };
  if (directMap[s] !== undefined) return directMap[s];

  const matchNum = s.match(/\d+/);
  if (matchNum) return parseInt(matchNum[0], 10);

  const matchRoman = s.match(/\b(VIII|VII|VI|IV|V|III|II|I)\b/i);
  if (matchRoman && directMap[matchRoman[1].toUpperCase()]) {
    return directMap[matchRoman[1].toUpperCase()];
  }

  return 999;
};

const CurrentTimetables = () => {
  const navigate = useNavigate();
  const { isDark } = useDarkMode();
  const [rows, setRows] = useState<any[]>([]);
  const [deptNames, setDeptNames] = useState<Record<string, string>>({});
  const [departments, setDepartments] = useState<any[]>([]);
  const isLoggedIn = useMemo(() => localStorage.getItem("superAdmin") === "true", []);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewing, setViewing] = useState<{ departmentId: string; year: string; section: string } | null>(null);
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false);
  
  // Filter & Sort states
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("academic");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    document.title = "Current Timetables - Super Admin";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Browse live timetables by department, year, and section.");
    const link: HTMLLinkElement = document.querySelector('link[rel="canonical"]') || document.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('href', window.location.origin + '/current-timetables');
    if (!link.parentNode) document.head.appendChild(link);
  }, []);

  useEffect(() => {
    (async () => {
      const [{ data: tts }, { data: depts }] = await Promise.all([
        (supabase as any).from('timetables').select('department_id,year,section,updated_at,grid_data').order('updated_at', { ascending: false }),
        (supabase as any).from('departments').select('id,name').order('name'),
      ]);

      // Deduplicate rows by (department_id, year, section) keeping the most recent
      const uniqueMap = new Map<string, any>();
      (tts || []).forEach((row: any) => {
        const key = `${row.department_id}-${row.year}-${row.section}`;
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, row);
        } else {
          const existing = uniqueMap.get(key);
          if (new Date(row.updated_at || 0) > new Date(existing.updated_at || 0)) {
            uniqueMap.set(key, row);
          }
        }
      });

      setRows(Array.from(uniqueMap.values()));
      setDepartments(depts || []);
      const dmap: Record<string, string> = {};
      (depts || []).forEach((d: any) => dmap[d.id] = d.name);
      setDeptNames(dmap);
    })();
  }, []);

  // Compute unique years available in dataset
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    rows.forEach(r => {
      if (r.year) yearsSet.add(String(r.year).trim());
    });
    return Array.from(yearsSet).sort((a, b) => parseYearOrder(a) - parseYearOrder(b));
  }, [rows]);

  // Filter and Sort rows with guaranteed natural academic ordering
  const filteredRows = useMemo(() => {
    let list = rows;

    // Filter by department
    if (selectedDepartment !== "all") {
      list = list.filter(row => row.department_id === selectedDepartment);
    }

    // Filter by year
    if (selectedYear !== "all") {
      list = list.filter(row => String(row.year).trim().toLowerCase() === selectedYear.trim().toLowerCase());
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(row => {
        const deptName = (deptNames[row.department_id] || row.department_id || "").toLowerCase();
        const yr = String(row.year || "").toLowerCase();
        const sec = String(row.section || "").toLowerCase();
        return (
          deptName.includes(q) ||
          yr.includes(q) ||
          `year ${yr}`.includes(q) ||
          sec.includes(q) ||
          `section ${sec}`.includes(q)
        );
      });
    }

    // Sort rows
    return [...list].sort((a, b) => {
      const deptA = deptNames[a.department_id] || a.department_id || "";
      const deptB = deptNames[b.department_id] || b.department_id || "";

      if (sortBy === "updated_desc") {
        const tDiff = new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
        if (tDiff !== 0) return tDiff;
      }

      if (sortBy === "dept_asc") {
        const deptComp = deptA.localeCompare(deptB, undefined, { sensitivity: "base" });
        if (deptComp !== 0) return deptComp;
        const yearA = parseYearOrder(a.year);
        const yearB = parseYearOrder(b.year);
        if (yearA !== yearB) return yearA - yearB;
        const secA = String(a.section || "").trim();
        const secB = String(b.section || "").trim();
        return secA.localeCompare(secB, undefined, { numeric: true, sensitivity: "base" });
      }

      if (sortBy === "year_desc") {
        const deptComp = deptA.localeCompare(deptB, undefined, { sensitivity: "base" });
        if (deptComp !== 0) return deptComp;
        const yearA = parseYearOrder(a.year);
        const yearB = parseYearOrder(b.year);
        if (yearA !== yearB) return yearB - yearA;
        const secA = String(a.section || "").trim();
        const secB = String(b.section || "").trim();
        return secA.localeCompare(secB, undefined, { numeric: true, sensitivity: "base" });
      }

      if (sortBy === "section_asc") {
        const secA = String(a.section || "").trim();
        const secB = String(b.section || "").trim();
        const secComp = secA.localeCompare(secB, undefined, { numeric: true, sensitivity: "base" });
        if (secComp !== 0) return secComp;
        const deptComp = deptA.localeCompare(deptB, undefined, { sensitivity: "base" });
        if (deptComp !== 0) return deptComp;
        const yearA = parseYearOrder(a.year);
        const yearB = parseYearOrder(b.year);
        return yearA - yearB;
      }

      // Default: "academic"
      // 1. Department alphabetical (A -> Z)
      const deptComp = deptA.localeCompare(deptB, undefined, { sensitivity: "base" });
      if (deptComp !== 0) return deptComp;

      // 2. Year ascending (Year I -> Year II -> Year III -> Year IV)
      const yearA = parseYearOrder(a.year);
      const yearB = parseYearOrder(b.year);
      if (yearA !== yearB) return yearA - yearB;

      // 3. Section ascending (A -> B -> C -> D)
      const secA = String(a.section || "").trim();
      const secB = String(b.section || "").trim();
      const secComp = secA.localeCompare(secB, undefined, { numeric: true, sensitivity: "base" });
      if (secComp !== 0) return secComp;

      // 4. Fallback: newest update
      return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
    });
  }, [rows, selectedDepartment, selectedYear, searchQuery, sortBy, deptNames]);

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const totalTimetables = filteredRows.length;
    const departmentCount = new Set(filteredRows.map(r => r.department_id)).size;
    const yearCount = new Set(filteredRows.map(r => r.year)).size;
    const sectionCount = new Set(filteredRows.map(r => `${r.department_id}-${r.year}-${r.section}`)).size;
    
    return {
      totalTimetables,
      departmentCount,
      yearCount,
      sectionCount
    };
  }, [filteredRows]);

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

      {isLoggedIn ? <Navbar /> : <AdminNavbar />}

      <main className={`md:pl-72 pt-16 ${isLoggedIn ? "md:pt-16" : "md:pt-0"} transition-all duration-300 relative z-10 min-h-screen`}>
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 space-y-6">
          {/* Page Header */}
          <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5 p-5 sm:p-6 rounded-2xl backdrop-blur-2xl border transition-all duration-300 ${
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
                  Live Schedules
                </span>
                <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  {filteredRows.length} {filteredRows.length === 1 ? 'timetable' : 'timetables'}
                </span>
              </div>
              <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                isDark ? "text-white" : "bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 bg-clip-text text-transparent"
              }`}>
                Current Timetables
              </h1>
              <p className={`text-xs sm:text-sm mt-1 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Browse, filter, and inspect live timetable schedules sorted seamlessly by department, year, and section.
              </p>
            </div>
          </div>

          {/* Controls: Search, Filters & Sorting Toolbar */}
          <div className={`p-4 sm:p-5 rounded-2xl backdrop-blur-2xl border transition-all duration-300 flex flex-col xl:flex-row xl:items-center justify-between gap-3.5 ${
            isDark
              ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
              : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06)]"
          }`}>
            {/* Search Input */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? "text-indigo-400" : "text-indigo-600"}`} />
              <Input
                placeholder="Search department, year (e.g. II), section..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`pl-10 h-10 rounded-xl text-xs font-medium border transition-all ${
                  isDark
                    ? "bg-white/[0.04] border-indigo-500/20 text-white placeholder:text-slate-500 focus:border-indigo-400"
                    : "bg-white border-indigo-200 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500"
                }`}
              />
            </div>

            {/* Filter & Sort Controls */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Department Filter */}
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border shrink-0 ${
                isDark ? "bg-white/[0.04] border-indigo-500/20" : "bg-white border-indigo-200/80 shadow-xs"
              }`}>
                <Building2 className={`h-3.5 w-3.5 ${isDark ? "text-indigo-400" : "text-indigo-600"}`} />
                <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                  <SelectTrigger className="w-[145px] sm:w-[165px] border-0 bg-transparent shadow-none font-bold text-xs focus:ring-0 h-8">
                    <SelectValue placeholder="All Departments" />
                  </SelectTrigger>
                  <SelectContent className={`rounded-2xl border backdrop-blur-2xl shadow-2xl p-1 max-h-[300px] ${
                    isDark ? "bg-[#0a0e1e]/95 border-indigo-500/25 text-white" : "bg-white/95 border-indigo-200/80 text-slate-900"
                  }`}>
                    <SelectItem value="all" className="cursor-pointer font-semibold text-xs rounded-xl py-2">
                      All Departments
                    </SelectItem>
                    {departments.map((dept) => (
                      <SelectItem 
                        key={dept.id} 
                        value={dept.id}
                        className="cursor-pointer font-medium text-xs rounded-xl py-2"
                      >
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Year Filter */}
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border shrink-0 ${
                isDark ? "bg-white/[0.04] border-indigo-500/20" : "bg-white border-indigo-200/80 shadow-xs"
              }`}>
                <GraduationCap className={`h-3.5 w-3.5 ${isDark ? "text-purple-400" : "text-purple-600"}`} />
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="w-[115px] sm:w-[130px] border-0 bg-transparent shadow-none font-bold text-xs focus:ring-0 h-8">
                    <SelectValue placeholder="All Years" />
                  </SelectTrigger>
                  <SelectContent className={`rounded-2xl border backdrop-blur-2xl shadow-2xl p-1 max-h-[300px] ${
                    isDark ? "bg-[#0a0e1e]/95 border-indigo-500/25 text-white" : "bg-white/95 border-indigo-200/80 text-slate-900"
                  }`}>
                    <SelectItem value="all" className="cursor-pointer font-semibold text-xs rounded-xl py-2">
                      All Years
                    </SelectItem>
                    {availableYears.map((yr) => (
                      <SelectItem 
                        key={yr} 
                        value={yr}
                        className="cursor-pointer font-medium text-xs rounded-xl py-2"
                      >
                        Year {yr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sort Order Selector */}
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border shrink-0 ${
                isDark ? "bg-white/[0.04] border-indigo-500/20" : "bg-white border-indigo-200/80 shadow-xs"
              }`}>
                <ArrowUpDown className={`h-3.5 w-3.5 ${isDark ? "text-cyan-400" : "text-cyan-600"}`} />
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[170px] sm:w-[190px] border-0 bg-transparent shadow-none font-bold text-xs focus:ring-0 h-8">
                    <SelectValue placeholder="Sort Order" />
                  </SelectTrigger>
                  <SelectContent className={`rounded-2xl border backdrop-blur-2xl shadow-2xl p-1 max-h-[300px] ${
                    isDark ? "bg-[#0a0e1e]/95 border-indigo-500/25 text-white" : "bg-white/95 border-indigo-200/80 text-slate-900"
                  }`}>
                    <SelectItem value="academic" className="cursor-pointer font-semibold text-xs rounded-xl py-2">
                      Year & Sec (Ascending)
                    </SelectItem>
                    <SelectItem value="year_desc" className="cursor-pointer font-medium text-xs rounded-xl py-2">
                      Year (Highest First)
                    </SelectItem>
                    <SelectItem value="section_asc" className="cursor-pointer font-medium text-xs rounded-xl py-2">
                      Section (A → Z)
                    </SelectItem>
                    <SelectItem value="dept_asc" className="cursor-pointer font-medium text-xs rounded-xl py-2">
                      Department (A → Z)
                    </SelectItem>
                    <SelectItem value="updated_desc" className="cursor-pointer font-medium text-xs rounded-xl py-2">
                      Recently Updated
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Reset button */}
              {(selectedDepartment !== 'all' || selectedYear !== 'all' || searchQuery.trim() !== '' || sortBy !== 'academic') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedDepartment('all');
                    setSelectedYear('all');
                    setSearchQuery('');
                    setSortBy('academic');
                  }}
                  className={`h-8 px-2.5 rounded-xl text-xs font-semibold shrink-0 transition-colors ${
                    isDark ? "text-slate-400 hover:text-white hover:bg-white/5" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                  title="Reset filters and sorting"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset
                </Button>
              )}
            </div>
          </div>

          {/* Stats Cards Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 lg:gap-5">
            <div className={`relative rounded-2xl p-4 sm:p-5 lg:p-6 backdrop-blur-2xl border transition-all duration-300 overflow-hidden ${
              isDark
                ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_12px_-2px_rgba(99,102,241,0.12)]"
                : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06),0_0_10px_-2px_rgba(99,102,241,0.05)]"
            }`}>
              <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
              <div className="flex items-center justify-between">
                <span className={`text-[11px] sm:text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Total Timetables
                </span>
                <Clock className={`h-4 w-4 ${isDark ? "text-cyan-400" : "text-cyan-600"}`} />
              </div>
              <div className={`text-2xl sm:text-3xl lg:text-4xl font-black mt-2 tracking-tight ${isDark ? "text-cyan-300" : "text-cyan-600"}`}>
                {summaryStats.totalTimetables}
              </div>
              <p className={`text-[11px] mt-1.5 font-medium ${isDark ? "text-cyan-400/70" : "text-cyan-700/80"}`}>
                Published schedules
              </p>
            </div>

            <div className={`relative rounded-2xl p-4 sm:p-5 lg:p-6 backdrop-blur-2xl border transition-all duration-300 overflow-hidden ${
              isDark
                ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_12px_-2px_rgba(99,102,241,0.12)]"
                : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06),0_0_10px_-2px_rgba(99,102,241,0.05)]"
            }`}>
              <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-400/30 to-transparent" />
              <div className="flex items-center justify-between">
                <span className={`text-[11px] sm:text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Departments
                </span>
                <Building2 className={`h-4 w-4 ${isDark ? "text-indigo-400" : "text-indigo-600"}`} />
              </div>
              <div className={`text-2xl sm:text-3xl lg:text-4xl font-black mt-2 tracking-tight ${isDark ? "text-indigo-300" : "text-indigo-600"}`}>
                {summaryStats.departmentCount}
              </div>
              <p className={`text-[11px] mt-1.5 font-medium ${isDark ? "text-indigo-300/70" : "text-indigo-600/80"}`}>
                Branches with schedules
              </p>
            </div>

            <div className={`relative rounded-2xl p-4 sm:p-5 lg:p-6 backdrop-blur-2xl border transition-all duration-300 overflow-hidden ${
              isDark
                ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_12px_-2px_rgba(99,102,241,0.12)]"
                : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06),0_0_10px_-2px_rgba(99,102,241,0.05)]"
            }`}>
              <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-purple-400/30 to-transparent" />
              <div className="flex items-center justify-between">
                <span className={`text-[11px] sm:text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Years Active
                </span>
                <Calendar className={`h-4 w-4 ${isDark ? "text-purple-400" : "text-purple-600"}`} />
              </div>
              <div className={`text-2xl sm:text-3xl lg:text-4xl font-black mt-2 tracking-tight ${isDark ? "text-purple-300" : "text-purple-600"}`}>
                {summaryStats.yearCount}
              </div>
              <p className={`text-[11px] mt-1.5 font-medium ${isDark ? "text-purple-300/70" : "text-purple-700/80"}`}>
                Distinct study years
              </p>
            </div>

            <div className={`relative rounded-2xl p-4 sm:p-5 lg:p-6 backdrop-blur-2xl border transition-all duration-300 overflow-hidden ${
              isDark
                ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_12px_-2px_rgba(99,102,241,0.12)]"
                : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06),0_0_10px_-2px_rgba(99,102,241,0.05)]"
            }`}>
              <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-amber-400/30 to-transparent" />
              <div className="flex items-center justify-between">
                <span className={`text-[11px] sm:text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Sections
                </span>
                <Layers className={`h-4 w-4 ${isDark ? "text-amber-400" : "text-amber-600"}`} />
              </div>
              <div className={`text-2xl sm:text-3xl lg:text-4xl font-black mt-2 tracking-tight ${isDark ? "text-amber-300" : "text-amber-600"}`}>
                {summaryStats.sectionCount}
              </div>
              <p className={`text-[11px] mt-1.5 font-medium ${isDark ? "text-amber-300/70" : "text-amber-700/80"}`}>
                Active classroom batches
              </p>
            </div>
          </div>

          {/* Timetables Grid */}
          <div className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className={`text-sm font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Schedules List ({filteredRows.length})
                </h2>
                <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                  isDark ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/25" : "bg-indigo-50 text-indigo-700 border-indigo-200"
                }`}>
                  {sortBy === 'academic' ? 'Sorted: Year & Section (Asc)' : 
                   sortBy === 'year_desc' ? 'Sorted: Year (Highest First)' :
                   sortBy === 'section_asc' ? 'Sorted: Section (A → Z)' :
                   sortBy === 'dept_asc' ? 'Sorted: Department (A → Z)' : 'Sorted: Recently Updated'}
                </span>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap self-start sm:self-auto">
                <Button
                  size="sm"
                  onClick={() => setFullPreviewOpen(true)}
                  disabled={filteredRows.length === 0}
                  className="h-9 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white shadow-md shadow-indigo-600/20 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Full Timetable
                </Button>

                {isLoggedIn && filteredRows.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => setDeleteAllOpen(true)}
                    className="h-9 px-4 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20 flex items-center gap-2"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete All{selectedDepartment !== 'all' ? ` (${filteredRows.length})` : ''}
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-4">
              {filteredRows.map((r, idx) => (
                <div
                  key={`${r.department_id}-${r.year}-${r.section}-${idx}`}
                  className={`relative rounded-2xl p-4 sm:p-5 lg:p-6 backdrop-blur-2xl border transition-all duration-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-5 overflow-hidden ${
                    isDark
                      ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_12px_-2px_rgba(99,102,241,0.12)] hover:border-indigo-400/40"
                      : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06),0_0_10px_-2px_rgba(99,102,241,0.05)] hover:border-indigo-300"
                  }`}
                >
                  <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-400/30 to-transparent" />

                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className={`h-6 min-w-[24px] px-1.5 rounded-lg text-[10px] font-black flex items-center justify-center border ${
                        isDark ? "bg-white/5 border-white/10 text-slate-400" : "bg-slate-100 border-slate-200 text-slate-600"
                      }`}>
                        #{idx + 1}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                        isDark ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" : "bg-indigo-50 text-indigo-700 border-indigo-200"
                      }`}>
                        {deptNames[r.department_id] || r.department_id}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        isDark ? "bg-white/5 text-slate-300 border-white/10" : "bg-slate-100 text-slate-700 border-slate-200"
                      }`}>
                        Year {r.year}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        isDark ? "bg-white/5 text-slate-300 border-white/10" : "bg-slate-100 text-slate-700 border-slate-200"
                      }`}>
                        Section {r.section}
                      </span>
                    </div>

                    <div className={`flex items-center gap-2 text-xs pt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      <Calendar className="h-3.5 w-3.5 opacity-60" />
                      <span>Last updated: {new Date(r.updated_at).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                    <Button 
                      size="sm" 
                      onClick={() => {
                        navigate("/admin/generate-review", {
                          state: {
                            loadPublished: true,
                            departmentId: r.department_id,
                            departmentName: deptNames[r.department_id] || r.department_id,
                            year: r.year,
                            section: r.section,
                          }
                        });
                      }}
                      className="h-9 px-4 rounded-xl font-bold text-xs bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm shadow-blue-500/25 border border-blue-400/30 flex items-center gap-2"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                      <span>Edit in Full Screen</span>
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-9 px-3 rounded-xl text-xs font-semibold text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-1.5"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Delete</span>
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className={`rounded-2xl border backdrop-blur-2xl shadow-2xl ${
                        isDark ? "bg-[#0a0e1e]/95 border-indigo-500/25 text-white" : "bg-white/95 border-indigo-200/80 text-slate-900"
                      }`}>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-lg font-bold">Delete timetable schedule?</AlertDialogTitle>
                          <AlertDialogDescription className={isDark ? "text-slate-400" : "text-slate-600"}>
                            This will permanently remove the timetable for{" "}
                            <strong className={isDark ? "text-white" : "text-slate-900"}>
                              {deptNames[r.department_id]} Year {r.year} Section {r.section}
                            </strong>. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={async () => {
                              try {
                                const { error } = await (supabase as any)
                                  .from('timetables')
                                  .delete()
                                  .eq('department_id', r.department_id)
                                  .eq('year', r.year)
                                  .eq('section', r.section);

                                if (error) throw error;

                                setRows((rows) => rows.filter((x) => !(
                                  x.department_id === r.department_id && 
                                  x.year === r.year && 
                                  x.section === r.section
                                )));

                                toast({
                                  title: "Timetable deleted",
                                  description: `Removed timetable for ${deptNames[r.department_id]} Year ${r.year} Section ${r.section}`,
                                });
                              } catch (error) {
                                toast({
                                  title: "Failed to delete timetable",
                                  description: "Please try again.",
                                  variant: "destructive"
                                });
                              }
                            }}
                            className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}

              {filteredRows.length === 0 && (
                <div className={`rounded-2xl border border-dashed p-16 text-center backdrop-blur-sm ${
                  isDark ? "border-indigo-500/25 bg-white/[0.02]" : "border-indigo-200 bg-indigo-50/20"
                }`}>
                  <Eye className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                  <p className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                    {selectedDepartment === "all" ? "No timetables found" : "No timetables found for selected department"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    {selectedDepartment === "all" 
                      ? "Create or generate some timetables to view them listed here." 
                      : "Try selecting a different department filter or generate timetables for this department."}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Full Timetable Master Preview Dialog */}
          <Dialog open={fullPreviewOpen} onOpenChange={setFullPreviewOpen}>
            <DialogContent className={`max-w-[97vw] xl:max-w-[1440px] w-full max-h-[94vh] flex flex-col p-0 overflow-hidden rounded-2xl border backdrop-blur-2xl shadow-2xl ${
              isDark ? "bg-[#090d1c]/98 border-blue-500/25 text-white" : "bg-[#f8faff]/98 border-blue-200/90 text-slate-900"
            }`}>
              <div className={`p-4 sm:p-5 pb-3 border-b flex flex-col gap-3 shrink-0 ${
                isDark ? "border-blue-500/20 bg-slate-900/60" : "border-blue-100 bg-white/90"
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pr-8">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center border shadow-sm ${
                      isDark ? "bg-blue-500/15 border-blue-500/30 text-blue-400" : "bg-blue-600 border-blue-600 text-white shadow-blue-500/20"
                    }`}>
                      <LayoutGrid className="h-5 w-5" />
                    </div>
                    <div>
                      <DialogTitle className="text-lg sm:text-xl font-black tracking-tight">Full Timetable Master Preview</DialogTitle>
                      <p className={`text-xs mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        Viewing all {filteredRows.length} active schedule{filteredRows.length !== 1 ? 's' : ''}
                        {selectedDepartment !== 'all' ? ` in ${deptNames[selectedDepartment] || selectedDepartment}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.print()}
                      className="h-8 px-3 rounded-xl text-xs font-semibold gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      <span>Print</span>
                    </Button>
                  </div>
                </div>

                {/* Quick-jump navigation pills for classes */}
                {filteredRows.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-1 text-xs">
                    <span className={`text-[11px] font-bold uppercase tracking-wider shrink-0 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      Jump to:
                    </span>
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                      {filteredRows.map((r, i) => {
                        const cardId = `class-preview-${r.department_id}-${r.year}-${r.section}`;
                        return (
                          <button
                            key={cardId}
                            type="button"
                            onClick={() => {
                              const el = document.getElementById(cardId);
                              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }}
                            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all border shrink-0 ${
                              isDark
                                ? "bg-white/5 hover:bg-blue-600/30 text-slate-300 border-white/10 hover:border-blue-400/40"
                                : "bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-600 border-blue-200 hover:border-blue-300 shadow-xs"
                            }`}
                          >
                            Yr {r.year} - Sec {r.section} ({deptNames[r.department_id] ? getDeptShortName(deptNames[r.department_id]) : r.department_id})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Scrollable container with all timetables */}
              <div className="overflow-y-auto p-4 sm:p-6 space-y-8 max-h-[calc(94vh-130px)]">
                {filteredRows.map((r, idx) => {
                  const cardId = `class-preview-${r.department_id}-${r.year}-${r.section}`;
                  const grid = parseGrid(r.grid_data);
                  const daysCount = grid.length > 0 ? Math.min(Math.max(grid.length, 5), 6) : 6;
                  const displayDays = dayNames.slice(0, daysCount);

                  return (
                    <div
                      key={cardId}
                      id={cardId}
                      className={`rounded-2xl border p-5 backdrop-blur-xl transition-all ${
                        isDark
                          ? "bg-[#0c1228]/80 border-blue-500/20 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
                          : "bg-white border-blue-100 shadow-md shadow-blue-500/5"
                      }`}
                    >
                      {/* Class header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-blue-100 dark:border-blue-500/20 mb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`h-5 min-w-[20px] px-1.5 rounded-md text-[10px] font-black flex items-center justify-center border ${
                              isDark ? "bg-white/5 border-white/10 text-slate-400" : "bg-blue-50 border-blue-200 text-blue-700 font-bold"
                            }`}>
                              #{idx + 1}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-600 text-white shadow-xs">
                              {deptNames[r.department_id] || r.department_id}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                              isDark ? "bg-white/5 text-slate-300 border-white/10" : "bg-blue-50 text-blue-800 border-blue-200"
                            }`}>
                              Year {r.year}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                              isDark ? "bg-white/5 text-slate-300 border-white/10" : "bg-blue-50 text-blue-800 border-blue-200"
                            }`}>
                              Section {r.section}
                            </span>
                          </div>
                          <p className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                            Last modified: {new Date(r.updated_at).toLocaleString()}
                          </p>
                        </div>

                        <Button
                          size="sm"
                          onClick={() => {
                            setFullPreviewOpen(false);
                            navigate("/admin/generate-review", {
                              state: {
                                loadPublished: true,
                                departmentId: r.department_id,
                                departmentName: deptNames[r.department_id] || r.department_id,
                                year: r.year,
                                section: r.section,
                              }
                            });
                          }}
                          className="h-8 px-3.5 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5 self-start sm:self-auto shrink-0 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                          <span>Edit in Full Screen</span>
                        </Button>
                      </div>

                      {/* Timetable Table in Blue Theme */}
                      <div className="overflow-x-auto rounded-2xl border border-blue-200/90 dark:border-blue-500/30 shadow-xs">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className={isDark ? "bg-[#131d38] text-white border-b border-blue-500/25" : "bg-blue-600 text-white border-b border-blue-500/40"}>
                              <th className="p-2.5 text-center font-extrabold border-r border-blue-500/30 dark:border-blue-500/20 w-20 sm:w-24 uppercase tracking-wider text-xs sm:text-[13px] text-white">
                                DAY
                              </th>
                              {timetableColumns.map((col, cIdx) => (
                                <th
                                  key={cIdx}
                                  className={`p-1.5 sm:p-2 text-center font-extrabold border-r border-blue-500/30 dark:border-blue-500/20 last:border-r-0 ${
                                    col.type === 'break' || col.type === 'lunch'
                                      ? isDark ? "bg-[#0e162b]/90 text-blue-200" : "bg-blue-700/50 text-blue-100"
                                      : "text-white"
                                  }`}
                                >
                                  <div className="font-extrabold text-xs sm:text-[13px] uppercase tracking-wide">{col.label}</div>
                                  {col.time && (
                                    <div className="text-[9px] sm:text-[10px] font-mono mt-0.5 whitespace-nowrap text-blue-100/90 font-medium">
                                      ({col.time})
                                    </div>
                                  )}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className={`divide-y ${isDark ? "divide-slate-800/80" : "divide-blue-100/70"}`}>
                            {displayDays.map((day, dIdx) => {
                              const rawDayRow = grid[dIdx];
                              const displayRow = getDisplayRow(rawDayRow);

                              return (
                                <tr 
                                  key={dIdx} 
                                  className={`transition-colors ${
                                    isDark ? "hover:bg-slate-800/30" : "hover:bg-blue-50/25"
                                  }`}
                                >
                                  {/* Day Column */}
                                  <td className={`p-2.5 text-center font-extrabold border-r ${
                                    isDark ? "bg-slate-900/80 border-blue-900/50 text-slate-100" : "bg-blue-50/60 border-blue-100/90 text-slate-800"
                                  } uppercase tracking-wider text-xs sm:text-sm`}>
                                    {day}
                                  </td>

                                  {displayRow.map((cellRaw, pIdx) => {
                                    const cellInfo = getCellDisplay(cellRaw);
                                    const isBreak = cellInfo.isBreak;
                                    const isLunch = cellInfo.isLunch;

                                    if (isBreak || isLunch) {
                                      return (
                                        <td 
                                          key={pIdx} 
                                          className={`p-1.5 text-center font-extrabold text-[11px] sm:text-xs lg:text-[12.5px] tracking-widest uppercase border-r last:border-r-0 select-none ${
                                            isDark 
                                              ? "border-slate-800/80 bg-slate-900/50 text-blue-400" 
                                              : "border-blue-100/80 bg-blue-50/35 text-blue-600"
                                          }`}
                                        >
                                          {isLunch ? "LUNCH" : "BREAK"}
                                        </td>
                                      );
                                    }

                                    const hasContent = cellInfo.title && cellInfo.title !== '-';

                                    return (
                                      <td 
                                        key={pIdx} 
                                        className={`p-1 sm:p-1.5 border-r last:border-r-0 text-center align-middle ${
                                          isDark ? "border-slate-800/80" : "border-blue-100/70"
                                        }`}
                                      >
                                        {hasContent ? (
                                          <div className={`p-2 rounded-xl border flex flex-col items-center justify-center min-h-[56px] transition-all ${
                                            isDark
                                              ? "bg-[#131b31]/90 border-blue-500/30 text-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.4)] hover:border-blue-400 hover:bg-[#182342]"
                                              : "bg-white border-blue-200/90 text-slate-900 shadow-[0_2px_8px_rgba(37,99,235,0.06)] hover:border-blue-400 hover:shadow-md"
                                          }`}>
                                            <span className={`font-bold text-xs sm:text-[12.5px] lg:text-[13px] leading-snug line-clamp-2 w-full text-center ${
                                              isDark ? "text-slate-100" : "text-slate-900"
                                            }`}>
                                              {cellInfo.title}
                                            </span>
                                            {cellInfo.subtitle && (
                                              <span className={`text-[9.5px] sm:text-[10.5px] mt-0.5 line-clamp-1 font-semibold truncate w-full text-center ${
                                                isDark ? "text-blue-300" : "text-blue-600"
                                              }`}>
                                                {cellInfo.subtitle}
                                              </span>
                                            )}
                                          </div>
                                        ) : (
                                          <div className={`h-11 rounded-xl border border-dashed flex items-center justify-center text-xs font-semibold ${
                                            isDark ? "border-blue-900/60 text-blue-400/50 bg-slate-800/40" : "border-blue-200/70 text-blue-300 bg-white/40"
                                          }`}>
                                            -
                                          </div>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}

                {filteredRows.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground text-sm">No timetables to display.</p>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Delete All Confirmation Dialog */}
          <AlertDialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
            <AlertDialogContent className={`rounded-2xl border backdrop-blur-2xl shadow-2xl ${
              isDark ? "bg-[#0a0e1e]/95 border-indigo-500/25 text-white" : "bg-white/95 border-indigo-200/80 text-slate-900"
            }`}>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-xl font-bold">Delete All Timetables?</AlertDialogTitle>
                <AlertDialogDescription className={isDark ? "text-slate-400" : "text-slate-600"}>
                  This will permanently remove <strong className={isDark ? "text-white" : "text-slate-900"}>
                    {filteredRows.length} timetable{filteredRows.length !== 1 ? 's' : ''}
                  </strong>
                  {selectedDepartment !== 'all' && (
                    <> for department <strong className={isDark ? "text-white" : "text-slate-900"}>
                      {deptNames[selectedDepartment]}
                    </strong></>
                  )}. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-rose-600 text-white hover:bg-rose-700 rounded-xl"
                  disabled={deletingAll}
                  onClick={async () => {
                    setDeletingAll(true);
                    try {
                      // Group by unique department_id+year+section to delete
                      const uniqueKeys = new Map<string, { department_id: string; year: string; section: string }>();
                      filteredRows.forEach(r => {
                        const key = `${r.department_id}-${r.year}-${r.section}`;
                        if (!uniqueKeys.has(key)) {
                          uniqueKeys.set(key, { department_id: r.department_id, year: r.year, section: r.section });
                        }
                      });

                      // Delete all matching timetables
                      if (selectedDepartment !== 'all') {
                        const { error } = await (supabase as any)
                          .from('timetables')
                          .delete()
                          .eq('department_id', selectedDepartment);
                        if (error) throw error;
                      } else {
                        // Delete all timetables
                        const deptIds = Array.from(new Set(filteredRows.map(r => r.department_id)));
                        const { error } = await (supabase as any)
                          .from('timetables')
                          .delete()
                          .in('department_id', deptIds);
                        if (error) throw error;
                      }

                      const deletedCount = filteredRows.length;
                      setRows(prev => {
                        if (selectedDepartment !== 'all') {
                          return prev.filter(r => r.department_id !== selectedDepartment);
                        }
                        return [];
                      });

                      toast({
                        title: "All timetables deleted",
                        description: `Successfully removed ${deletedCount} timetable(s).`,
                      });
                      setDeleteAllOpen(false);
                    } catch (error) {
                      console.error('Delete all error:', error);
                      toast({
                        title: "Failed to delete timetables",
                        description: "Please try again.",
                        variant: "destructive"
                      });
                    } finally {
                      setDeletingAll(false);
                    }
                  }}
                >
                  {deletingAll ? 'Deleting...' : `Delete ${filteredRows.length} Timetable(s)`}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      </main>
    </div>
  );
};

export default CurrentTimetables;
