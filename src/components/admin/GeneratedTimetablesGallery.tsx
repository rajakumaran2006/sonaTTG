import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, ChevronLeft, LayoutGrid, List, Search, CheckCircle2, AlertCircle, Maximize2 } from "lucide-react";
import type { YearSectionResult } from "@/lib/timetable";
import { useDarkMode } from "@/context/DarkModeContext";
import { SubjectHoursVerificationCard } from "@/components/admin/SubjectHoursVerificationCard";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DISPLAY_COLUMNS = [
  'PERIOD 1', 'PERIOD 2', 'BREAK', 'PERIOD 3', 'PERIOD 4', 'LUNCH',
  'PERIOD 5', 'PERIOD 6', 'BREAK', 'PERIOD 7'
] as const;
const TIME_LABELS: Record<string, string> = {
  'PERIOD 1': '9:00–9:55', 'PERIOD 2': '9:55–10:50', 'BREAK': '',
  'PERIOD 3': '11:05–12:00', 'PERIOD 4': '12:00–12:55', 'LUNCH': '12:55–1:55',
  'PERIOD 5': '1:55–2:50', 'PERIOD 6': '2:50–3:45', 'PERIOD 7': '3:55–4:50',
};
const SUBJECT_TYPES = ['all', 'theory', 'lab', 'elective', 'open elective'];
const YEAR_ORDER = ['II', 'III', 'IV'];
const YEAR_COLORS: Record<string, { tab: string; accent: string; glow: string }> = {
  'II':  { tab: 'from-sky-500 to-blue-600',      accent: 'border-sky-400/40 bg-sky-500/8',      glow: 'shadow-sky-500/15'   },
  'III': { tab: 'from-violet-500 to-purple-600',  accent: 'border-violet-400/40 bg-violet-500/8', glow: 'shadow-violet-500/15' },
  'IV':  { tab: 'from-rose-500 to-pink-600',      accent: 'border-rose-400/40 bg-rose-500/8',    glow: 'shadow-rose-500/15'   },
};

interface GridColumnDef {
  key: string;
  label: string;
  time: string;
  isDivider: boolean;
  periodIdx: number | null;
}

const GRID_COLUMNS: GridColumnDef[] = [
  { key: 'p1', label: 'P1', time: '(9:00–9:55)', isDivider: false, periodIdx: 0 },
  { key: 'p2', label: 'P2', time: '(9:55–10:50)', isDivider: false, periodIdx: 1 },
  { key: 'break1', label: 'BREAK', time: '(10:50–11:05)', isDivider: true, periodIdx: null },
  { key: 'p3', label: 'P3', time: '(11:05–12:00)', isDivider: false, periodIdx: 2 },
  { key: 'p4', label: 'P4', time: '(12:00–12:55)', isDivider: false, periodIdx: 3 },
  { key: 'lunch', label: 'LUNCH', time: '(12:55–1:55)', isDivider: true, periodIdx: null },
  { key: 'p5', label: 'P5', time: '(1:55–2:50)', isDivider: false, periodIdx: 4 },
  { key: 'p6', label: 'P6', time: '(2:50–3:45)', isDivider: false, periodIdx: 5 },
  { key: 'break2', label: 'BREAK', time: '(3:45–3:55)', isDivider: true, periodIdx: null },
  { key: 'p7', label: 'P7', time: '(3:55–4:50)', isDivider: false, periodIdx: 6 },
];

function getCellStyle(cell: string, isDark: boolean): string {
  if (!cell) {
    return isDark 
      ? 'bg-white/[0.02] text-slate-500 border border-dashed border-white/10' 
      : 'bg-indigo-50/30 text-indigo-300 border border-dashed border-indigo-200/60';
  }
  if (cell === 'BREAK' || cell === 'LUNCH') {
    return isDark 
      ? 'bg-white/[0.02] text-slate-400 font-extrabold uppercase tracking-widest' 
      : 'bg-indigo-50/60 text-indigo-700 font-extrabold uppercase tracking-widest border border-indigo-100/60';
  }
  return isDark 
    ? 'bg-[#121222] text-slate-100 border border-white/10 hover:border-indigo-500/50 shadow-sm' 
    : 'bg-white text-slate-800 border border-indigo-100/90 hover:border-indigo-400 hover:shadow-[0_4px_12px_rgba(99,102,241,0.12)] shadow-[0_1px_3px_rgba(99,102,241,0.04)]';
}

function matchesFilter(cell: string, search: string, filterType: string): boolean {
  if (!cell || cell === 'BREAK' || cell === 'LUNCH') return false;
  const s = search.toLowerCase().trim();
  const matchSearch = s ? cell.toLowerCase().includes(s) : true;
  let matchType = true;
  if (filterType === 'lab') matchType = cell.toUpperCase().includes('LAB') || cell.endsWith(' L');
  else if (filterType === 'open elective') matchType = cell.toLowerCase().includes('open elective') || cell.includes(' / ');
  else if (filterType === 'elective') matchType = cell.includes(' / ');
  else if (filterType === 'theory') matchType = !cell.toUpperCase().includes('LAB') && !cell.includes(' / ') && !/seminar|library|counsell/i.test(cell);
  return matchSearch && matchType;
}

function MiniGrid({ grid, search, filterType, compact = false }: {
  grid: string[][]; search: string; filterType: string; compact?: boolean;
}) {
  const { isDark } = useDarkMode();
  const safeGrid = Array.isArray(grid) ? grid : [];
  return (
    <div className={`overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10 shadow-sm ${compact ? 'max-h-[250px]' : ''}`}>
      <table className="w-full border-collapse" style={{ minWidth: compact ? 650 : 1080 }}>
        <thead>
          <tr className="bg-slate-900 dark:bg-[#0e1428] text-white">
            <th className={`py-2.5 px-2 text-center font-bold text-xs uppercase tracking-wider w-16 border-r border-slate-700/60 dark:border-white/10 sticky left-0 z-20 bg-slate-900 dark:bg-[#0e1428]`}>
              Day
            </th>
            {GRID_COLUMNS.map((col) => (
              <th
                key={col.key}
                className={`py-2 px-1 text-center border-r border-slate-700/60 dark:border-white/10 last:border-r-0 ${
                  col.isDivider ? "w-16 sm:w-20 bg-slate-800 dark:bg-[#080d1a]" : "min-w-[100px]"
                }`}
              >
                <div className="flex flex-col items-center justify-center">
                  <span className="text-[11px] sm:text-xs font-bold text-white tracking-wide">
                    {col.label}
                  </span>
                  <span className="text-[9px] font-mono text-slate-300 dark:text-indigo-300/80 mt-0.5">
                    {col.time}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
          {safeGrid.map((row, dayIdx) => {
            const r = Array.isArray(row) ? row : [];
            const displayRow: string[] = [
              r[0] || '', r[1] || '', 'BREAK', r[2] || '', r[3] || '', 'LUNCH', r[4] || '', r[5] || '', 'BREAK', r[6] || ''
            ];
            return (
              <tr
                key={dayIdx}
                className={`transition-colors ${
                  isDark ? "hover:bg-white/[0.02]" : "hover:bg-slate-50/50"
                }`}
              >
                <td className={`py-2 px-2 text-center border-r font-bold text-xs sticky left-0 z-10 ${
                  isDark ? "bg-[#0e0e1b] text-slate-200 border-white/10" : "bg-slate-50 text-slate-800 border-slate-200"
                }`}>
                  {DAYS[dayIdx]}
                </td>
                {displayRow.map((cell, i) => {
                  const colInfo = GRID_COLUMNS[i];
                  const isDivider = colInfo.isDivider;
                  const highlight = (search || filterType !== 'all') ? matchesFilter(cell, search, filterType) : false;
                  const isDimmed = (search || filterType !== 'all') && cell && !isDivider && !matchesFilter(cell, search, filterType);

                  if (isDivider) {
                    return (
                      <td
                        key={i}
                        className="p-1 border-r border-slate-200 dark:border-white/5 bg-slate-100/80 dark:bg-white/[0.02] text-center select-none"
                      >
                        <span className="text-[10px] font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase">
                          {cell}
                        </span>
                      </td>
                    );
                  }

                  return (
                    <td key={i} className="p-1 border-r border-slate-100 dark:border-white/5 last:border-r-0">
                      <div
                        className={`
                          rounded-xl flex items-center justify-center p-2 text-center transition-all select-none
                          ${compact ? 'h-11' : 'min-h-[58px]'}
                          ${getCellStyle(cell, isDark)}
                          ${highlight ? 'ring-2 ring-indigo-500 scale-105 z-10' : ''}
                          ${isDimmed ? 'opacity-25' : ''}
                        `}
                      >
                        <span className="px-1 line-clamp-2 text-xs font-bold leading-snug">
                          {cell || ''}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ListView({ grid, search, filterType }: { grid: string[][]; search: string; filterType: string }) {
  const { isDark } = useDarkMode();
  const items = useMemo(() => {
    const out: { day: string; label: string; time: string; cell: string }[] = [];
    const safeGrid = Array.isArray(grid) ? grid : [];
    safeGrid.forEach((row, dayIdx) => {
      const r = Array.isArray(row) ? row : [];
      const displayRow: string[] = [r[0] || '', r[1] || '', 'BREAK', r[2] || '', r[3] || '', 'LUNCH', r[4] || '', r[5] || '', 'BREAK', r[6] || ''];
      displayRow.forEach((cell, colIdx) => {
        if (!cell || cell === 'BREAK' || cell === 'LUNCH') return;
        if ((search || filterType !== 'all') && !matchesFilter(cell, search, filterType)) return;
        const label = DISPLAY_COLUMNS[colIdx];
        out.push({ day: DAYS[dayIdx] || `Day ${dayIdx + 1}`, label: label ? label.replace('PERIOD ', 'P') : `P${colIdx + 1}`, time: (label && TIME_LABELS[label]) || '', cell });
      });
    });
    return out;
  }, [grid, search, filterType]);

  if (items.length === 0) return (
    <div className={`py-8 text-center text-sm italic ${isDark ? "text-white/20" : "text-slate-400"}`}>No subjects match your filter</div>
  );

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-colors ${
          isDark 
            ? "bg-white/4 border-white/6 hover:bg-white/7 text-white" 
            : "bg-white border-slate-200 hover:bg-slate-50 text-slate-800 shadow-sm"
        }`}>
          <span className={`text-[10px] font-bold w-8 shrink-0 ${isDark ? "text-white/30" : "text-slate-400"}`}>{item.day}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
            isDark ? "text-white/30 bg-white/6" : "text-slate-600 bg-slate-100 border border-slate-200"
          }`}>{item.label}</span>
          {item.time && <span className={`text-[9px] shrink-0 hidden sm:inline ${isDark ? "text-white/20" : "text-slate-400"}`}>{item.time}</span>}
          <span className={`text-sm font-semibold flex-1 truncate ${isDark ? "text-white/80" : "text-slate-700"}`}>{item.cell}</span>
        </div>
      ))}
    </div>
  );
}

function SectionCard({ result, search, filterType, viewMode, onExpand, yearColors }: {
  result: YearSectionResult; search: string; filterType: string; viewMode: 'table' | 'list';
  onExpand: () => void; yearColors: { accent: string; glow: string };
}) {
  const { isDark } = useDarkMode();
  return (
    <div className={`rounded-2xl border transition-all duration-200 ${
      isDark 
        ? `${yearColors.accent} bg-[#0d0d1a] shadow-lg ${yearColors.glow}` 
        : "border-indigo-100/90 bg-white/90 shadow-md shadow-indigo-500/5 hover:border-indigo-300"
    } hover:shadow-xl`}>
      <div className={`flex items-center justify-between px-4 py-3 border-b ${
        isDark ? "border-white/6" : "border-indigo-50 bg-indigo-50/20"
      }`}>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-800"}`}>Section {result.section}</span>
          {result.status === 'ok'
            ? <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500" />
            : <AlertCircle className="h-3.5 w-3.5 text-red-400" />}
        </div>
        {result.status === 'ok' && (
          <button onClick={onExpand} className={`p-1.5 rounded-lg transition-colors ${
            isDark ? "bg-white/6 hover:bg-white/12 text-white/40 hover:text-white" : "bg-indigo-50 hover:bg-indigo-100 text-indigo-600 hover:text-indigo-800"
          }`} title="Expand">
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="p-3">
        {result.status === 'error' ? (
          <div className="py-6 text-center text-red-400/60 text-xs italic">{result.error}</div>
        ) : viewMode === 'table' ? (
          <MiniGrid grid={result.grid} search={search} filterType={filterType} compact />
        ) : (
          <div className="max-h-[230px] overflow-auto">
            <ListView grid={result.grid} search={search} filterType={filterType} />
          </div>
        )}
      </div>
    </div>
  );
}

function ExpandedView({ result, search, filterType, viewMode, onBack }: {
  result: YearSectionResult; search: string; filterType: string; viewMode: 'table' | 'list'; onBack: () => void;
}) {
  const { isDark } = useDarkMode();
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-5 shrink-0">
        <button onClick={onBack} className={`flex items-center gap-1.5 text-sm transition-colors ${
          isDark ? "text-white/40 hover:text-white" : "text-slate-500 hover:text-slate-800"
        }`}>
          <ChevronLeft className="h-4 w-4" />Back to gallery
        </button>
        <span className={isDark ? "text-white/15" : "text-slate-300"}>·</span>
        <span className={`font-bold text-sm ${isDark ? "text-white" : "text-slate-800"}`}>Year {result.year} — Section {result.section}</span>
        <span className={`ml-auto text-xs ${isDark ? "text-white/20" : "text-slate-400"}`}>Showing subjects only</span>
      </div>
      <div className="flex-1 overflow-auto">
        {viewMode === 'table'
          ? <MiniGrid grid={result.grid} search={search} filterType={filterType} compact={false} />
          : <ListView grid={result.grid} search={search} filterType={filterType} />}
      </div>
    </div>
  );
}

export interface GeneratedTimetablesGalleryProps {
  open: boolean;
  onClose: () => void;
  results: YearSectionResult[];
}

export function GeneratedTimetablesGallery({ open, onClose, results }: GeneratedTimetablesGalleryProps) {
  const { isDark } = useDarkMode();
  const [activeYear, setActiveYear] = useState<string>('II');
  const [activeSection, setActiveSection] = useState<string>('A');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'list'>('table');

  const byYear = useMemo(() => {
    const map = new Map<string, YearSectionResult[]>();
    for (const r of results) {
      if (!map.has(r.year)) map.set(r.year, []);
      map.get(r.year)!.push(r);
    }
    for (const [, arr] of map) arr.sort((a, b) => a.section.localeCompare(b.section));
    return map;
  }, [results]);

  const availableYears = YEAR_ORDER.filter((y) => byYear.has(y));
  const currentYearResults = byYear.get(activeYear) || [];
  
  // Set default active year and section when opened or changed
  useEffect(() => {
    if (open) {
      if (availableYears.length > 0 && !availableYears.includes(activeYear)) {
        setActiveYear(availableYears[0]);
      }
    }
  }, [open, results]);

  useEffect(() => {
    if (currentYearResults.length > 0) {
      const sections = currentYearResults.map(r => r.section);
      if (!sections.includes(activeSection)) {
        setActiveSection(sections[0]);
      }
    }
  }, [activeYear, results]);

  const activeResult = currentYearResults.find((r) => r.section === activeSection);
  const totalOk = results.filter(r => r.status === 'ok').length;
  const totalErr = results.filter(r => r.status === 'error').length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className={`max-w-[98vw] w-[1400px] h-[92vh] flex flex-col p-0 border rounded-2xl overflow-hidden shadow-2xl transition-colors duration-300 ${
          isDark 
            ? "border-white/8 bg-[#08080f] text-white" 
            : "border-indigo-100 bg-gradient-to-br from-[#f8faff] via-[#f5f8ff] to-[#fbf9ff] text-slate-900 shadow-[0_20px_60px_rgba(99,102,241,0.12)]"
        }`}
        style={isDark 
          ? { backgroundImage: 'radial-gradient(ellipse at 15% 15%, rgba(99,102,241,0.08) 0%, transparent 55%), radial-gradient(ellipse at 85% 85%, rgba(99,102,241,0.04) 0%, transparent 55%)' } 
          : { backgroundImage: 'radial-gradient(ellipse at 15% 15%, rgba(99,102,241,0.06) 0%, transparent 60%), radial-gradient(ellipse at 85% 85%, rgba(168,85,247,0.05) 0%, transparent 60%)' }}
      >
        {/* Top bar */}
        <div className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
          isDark ? "border-white/7" : "border-indigo-100/80 bg-white/90 backdrop-blur-md"
        }`}>
          <div>
            <h2 className={`text-lg font-bold tracking-tight ${isDark ? "text-white" : "text-slate-800"}`}>Generated Timetables</h2>
            <p className={`text-xs mt-0.5 ${isDark ? "text-white/25" : "text-slate-500"}`}>
              <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{totalOk} generated successfully</span>
              {totalErr > 0 && <span className="text-red-500/70"> · {totalErr} failed</span>}
              <span className={`ml-2 ${isDark ? "text-white/20" : "text-slate-400"}`}>· Subjects only view</span>
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            {/* View toggle */}
            <div className={`flex p-1 rounded-xl border ${
              isDark ? "bg-white/5 border-white/8" : "bg-indigo-50/70 border-indigo-100"
            }`}>
              <button onClick={() => setViewMode('table')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'table' 
                  ? (isDark ? 'bg-white/15 text-white' : 'bg-white text-indigo-700 shadow-sm border border-indigo-100') 
                  : (isDark ? 'text-white/35 hover:text-white/65' : 'text-slate-500 hover:text-indigo-600')
              }`}>
                <LayoutGrid className="h-3 w-3" />Table
              </button>
              <button onClick={() => setViewMode('list')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'list' 
                  ? (isDark ? 'bg-white/15 text-white' : 'bg-white text-indigo-700 shadow-sm border border-indigo-100') 
                  : (isDark ? 'text-white/35 hover:text-white/65' : 'text-slate-500 hover:text-indigo-600')
              }`}>
                <List className="h-3 w-3" />List
              </button>
            </div>
            <button onClick={onClose} className={`p-2 rounded-xl transition-colors ${
              isDark ? "bg-white/5 hover:bg-white/10 text-white/40 hover:text-white" : "bg-indigo-50/80 hover:bg-indigo-100 text-indigo-600 hover:text-indigo-900 border border-indigo-100"
            }`}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search + filter */}
        <div className={`flex items-center gap-3 px-6 py-3 border-b shrink-0 ${
          isDark ? "border-white/5" : "border-indigo-100/80 bg-white/70 backdrop-blur-sm"
        }`}>
          <div className="relative flex-1 max-w-sm">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${
              isDark ? "text-white/25" : "text-indigo-400"
            }`} />
            <Input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subjects..."
              className={`pl-8 h-9 text-sm rounded-xl transition-colors ${
                isDark 
                  ? "bg-white/5 border-white/9 text-white placeholder:text-white/20" 
                  : "bg-white border-indigo-100 text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              }`}
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className={`h-9 w-44 text-sm rounded-xl transition-colors ${
              isDark 
                ? "bg-white/5 border-white/9 text-white/60" 
                : "bg-white border-indigo-100 text-slate-700 focus:border-indigo-500"
            }`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={`${
              isDark ? "bg-[#18182a] border-white/10 text-white" : "bg-white border-indigo-100 text-slate-800 shadow-lg shadow-indigo-500/5"
            }`}>
              {SUBJECT_TYPES.map((t) => (
                <SelectItem key={t} value={t} className={`capitalize focus:bg-indigo-600 focus:text-white ${
                  isDark ? "text-white/75" : "text-slate-755"
                }`}>
                  {t === 'all' ? 'All Types' : t.charAt(0).toUpperCase() + t.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Year tabs */}
        <div className="flex items-center justify-between px-6 pt-4 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {YEAR_ORDER.map((year) => {
              const yc = YEAR_COLORS[year];
              const hasYear = byYear.has(year);
              const okCount = (byYear.get(year) || []).filter(r => r.status === 'ok').length;
              const total = (byYear.get(year) || []).length;
              const errCount = total - okCount;
              return (
                <button key={year} disabled={!hasYear}
                  onClick={() => { setActiveYear(year); }}
                  className={`relative px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
                    activeYear === year 
                      ? `bg-gradient-to-r ${yc.tab} text-white shadow-lg` 
                      : hasYear 
                        ? (isDark ? 'text-white/35 hover:text-white/65 hover:bg-white/5' : 'text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/60') 
                        : (isDark ? 'text-white/15 cursor-not-allowed' : 'text-slate-300 cursor-not-allowed')
                  }`}
                >
                  Year {year}
                  {hasYear && (
                    <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      activeYear === year 
                        ? 'bg-white/20 text-white' 
                        : (isDark ? 'bg-white/8 text-white/40' : 'bg-indigo-100 text-indigo-700')
                    }`}>
                      {okCount}/{total}
                    </span>
                  )}
                  {errCount > 0 && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 border-2 border-[#08080f]" />}
                </button>
              );
            })}
          </div>

          {/* Section nested tabs inside Year */}
          {currentYearResults.length > 0 && (
            <div className={`flex p-1 rounded-xl border gap-1 ${
              isDark ? "bg-white/3 border-white/6" : "bg-indigo-50/50 border-indigo-100"
            }`}>
              {currentYearResults.map((r) => (
                <button
                  key={r.section}
                  onClick={() => setActiveSection(r.section)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activeSection === r.section
                      ? (isDark ? "bg-white/15 text-white shadow-sm" : "bg-white text-indigo-700 shadow-sm border border-indigo-100")
                      : (isDark ? "text-white/40 hover:text-white/70" : "text-slate-500 hover:text-indigo-600")
                  }`}
                >
                  Section {r.section}
                  {r.status === 'ok' ? (
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        r.hourVerification?.isValid ?? true ? "bg-indigo-500" : "bg-amber-500"
                      }`}
                      title={
                        r.hourVerification?.isValid ?? true
                          ? "Hours verified 100% exact"
                          : "Subject hour mismatch detected"
                      }
                    />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" title="Generation error" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-auto px-6 pb-6 pt-4">
          {!activeResult ? (
            <div className={`flex flex-col items-center justify-center h-60 italic gap-2 ${
              isDark ? "text-white/25" : "text-slate-400"
            }`}>
              <AlertCircle className={`h-8 w-8 ${isDark ? "text-white/10" : "text-slate-300"}`} />
              No timetables generated for this selection
            </div>
          ) : activeResult.status === 'error' ? (
            <div className={`flex flex-col items-center justify-center h-60 border bg-red-555/5 rounded-2xl p-6 text-center ${
              isDark ? "border-red-500/20 bg-red-500/5" : "border-red-200 bg-red-50/30"
            }`}>
              <AlertCircle className="h-10 w-10 text-red-555 mb-3" />
              <h3 className={`text-base font-bold mb-1 ${isDark ? "text-white" : "text-red-700"}`}>Generation Failed</h3>
              <p className={`text-sm max-w-md leading-relaxed ${isDark ? "text-red-400/80" : "text-red-650"}`}>{activeResult.error}</p>
            </div>
          ) : (
            <div className={`rounded-2xl p-5 shadow-inner border transition-colors duration-300 ${
              isDark 
                ? "bg-[#0c0c17] border-white/6" 
                : "bg-white/95 border-indigo-100 shadow-[0_4px_20px_-4px_rgba(99,102,241,0.06)]"
            }`}>
              <div className={`flex items-center justify-between mb-4 border-b pb-3 ${
                isDark ? "border-white/5" : "border-indigo-50"
              }`}>
                <span className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
                  Timetable Grid: Year {activeResult.year} — Section {activeResult.section}
                </span>
                <span className={`text-[10px] uppercase tracking-wider font-mono ${
                  isDark ? "text-white/30" : "text-slate-450"
                }`}>
                  Subjects Only View
                </span>
              </div>
              {viewMode === 'table' ? (
                <MiniGrid grid={activeResult.grid} search={search} filterType={filterType} compact={false} />
              ) : (
                <ListView grid={activeResult.grid} search={search} filterType={filterType} />
              )}

              {activeResult.hourVerification && (
                <div className="mt-4">
                  <SubjectHoursVerificationCard
                    verification={activeResult.hourVerification}
                    isDark={isDark}
                    defaultExpanded={!activeResult.hourVerification.isValid}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
