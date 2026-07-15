import { useState, useMemo } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, ChevronLeft, LayoutGrid, List, Search, CheckCircle2, AlertCircle, Maximize2 } from "lucide-react";
import type { YearSectionResult } from "@/lib/timetable";

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

function getCellStyle(cell: string): string {
  if (!cell) return 'bg-white/3 text-slate-700 border border-dashed border-white/5';
  if (cell === 'BREAK' || cell === 'LUNCH') return 'bg-white/4 text-white/20 text-[9px] font-bold uppercase tracking-widest';
  if (cell.toUpperCase().includes('LAB') || cell.endsWith(' L')) return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25';
  if (/seminar|library|counsell/i.test(cell)) return 'bg-amber-500/15 text-amber-300 border border-amber-500/25';
  if (cell.includes(' / ')) return 'bg-purple-500/15 text-purple-300 border border-purple-500/25';
  return 'bg-white/7 text-slate-200 border border-white/9';
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
  return (
    <div className={`overflow-auto rounded-xl ${compact ? 'max-h-[230px]' : ''}`}>
      <table className="w-full border-collapse" style={{ minWidth: compact ? 500 : 680 }}>
        <thead>
          <tr className="bg-white/3">
            <th className="py-1.5 px-2 text-left text-white/30 font-semibold text-[10px] w-10">Day</th>
            {DISPLAY_COLUMNS.map((col, i) => (
              <th key={i} className="py-1.5 px-1 text-center text-white/30 font-semibold text-[10px]">
                <div className="flex flex-col gap-0.5 items-center">
                  <span className={(col === 'BREAK' || col === 'LUNCH') ? 'text-white/15' : ''}>{col.replace('PERIOD ', 'P')}</span>
                  {TIME_LABELS[col] && <span className="text-[8px] text-white/15 font-normal">{TIME_LABELS[col]}</span>}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, dayIdx) => {
            const displayRow: string[] = [row[0], row[1], 'BREAK', row[2], row[3], 'LUNCH', row[4], row[5], 'BREAK', row[6]];
            return (
              <tr key={dayIdx} className="border-t border-white/4 hover:bg-white/2 transition-colors">
                <td className="py-1 px-2 font-bold text-white/40 text-[10px]">{DAYS[dayIdx]}</td>
                {displayRow.map((cell, i) => {
                  const highlight = (search || filterType !== 'all') ? matchesFilter(cell, search, filterType) : false;
                  const isDimmed = (search || filterType !== 'all') && cell && cell !== 'BREAK' && cell !== 'LUNCH' && !matchesFilter(cell, search, filterType);
                  return (
                    <td key={i} className="p-0.5">
                      <div className={`
                        rounded-lg flex items-center justify-center text-center transition-all
                        ${compact ? 'h-8 min-w-[52px]' : 'h-11 min-w-[76px]'}
                        ${getCellStyle(cell)}
                        ${highlight ? 'ring-2 ring-white/25 scale-105 z-10 relative' : ''}
                        ${isDimmed ? 'opacity-20' : ''}
                      `}>
                        <span className="px-1 truncate max-w-full font-semibold leading-tight" style={{ fontSize: '9px' }}>
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
  const items = useMemo(() => {
    const out: { day: string; label: string; time: string; cell: string }[] = [];
    grid.forEach((row, dayIdx) => {
      const displayRow: string[] = [row[0], row[1], 'BREAK', row[2], row[3], 'LUNCH', row[4], row[5], 'BREAK', row[6]];
      displayRow.forEach((cell, colIdx) => {
        if (!cell || cell === 'BREAK' || cell === 'LUNCH') return;
        if ((search || filterType !== 'all') && !matchesFilter(cell, search, filterType)) return;
        const label = DISPLAY_COLUMNS[colIdx];
        out.push({ day: DAYS[dayIdx], label: label.replace('PERIOD ', 'P'), time: TIME_LABELS[label] || '', cell });
      });
    });
    return out;
  }, [grid, search, filterType]);

  if (items.length === 0) return (
    <div className="py-8 text-center text-white/20 text-sm italic">No subjects match your filter</div>
  );

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/4 border border-white/6 hover:bg-white/7 transition-colors">
          <span className="text-[10px] font-bold text-white/30 w-8 shrink-0">{item.day}</span>
          <span className="text-[10px] font-bold text-white/30 bg-white/6 px-2 py-0.5 rounded-full shrink-0">{item.label}</span>
          {item.time && <span className="text-[9px] text-white/20 shrink-0 hidden sm:inline">{item.time}</span>}
          <span className="text-sm font-semibold flex-1 truncate text-white/80">{item.cell}</span>
        </div>
      ))}
    </div>
  );
}

function SectionCard({ result, search, filterType, viewMode, onExpand, yearColors }: {
  result: YearSectionResult; search: string; filterType: string; viewMode: 'table' | 'list';
  onExpand: () => void; yearColors: { accent: string; glow: string };
}) {
  return (
    <div className={`rounded-2xl border ${yearColors.accent} bg-[#0d0d1a] shadow-lg ${yearColors.glow} hover:shadow-xl transition-all`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/6">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">Section {result.section}</span>
          {result.status === 'ok'
            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            : <AlertCircle className="h-3.5 w-3.5 text-red-400" />}
        </div>
        {result.status === 'ok' && (
          <button onClick={onExpand} className="p-1.5 rounded-lg bg-white/6 hover:bg-white/12 transition-colors text-white/40 hover:text-white" title="Expand">
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
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-5 shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white transition-colors">
          <ChevronLeft className="h-4 w-4" />Back to gallery
        </button>
        <span className="text-white/15">·</span>
        <span className="font-bold text-white text-sm">Year {result.year} — Section {result.section}</span>
        <span className="ml-auto text-xs text-white/20">Showing subjects only</span>
      </div>
      <div className="flex-1 overflow-auto">
        {viewMode === 'table'
          ? <MiniGrid grid={result.grid} search={search} filterType={filterType} compact={false} />
          : <ListView grid={result.grid} search={search} filterType={filterType} />}
      </div>
    </div>
  );
}

interface GeneratedTimetablesGalleryProps {
  open: boolean;
  onClose: () => void;
  results: YearSectionResult[];
}

export function GeneratedTimetablesGallery({ open, onClose, results }: GeneratedTimetablesGalleryProps) {
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
        className="max-w-[98vw] w-[1400px] h-[92vh] flex flex-col p-0 border-white/8 bg-[#08080f] text-white rounded-2xl overflow-hidden shadow-2xl"
        style={{ backgroundImage: 'radial-gradient(ellipse at 15% 15%, rgba(99,102,241,0.07) 0%, transparent 55%), radial-gradient(ellipse at 85% 85%, rgba(16,185,129,0.04) 0%, transparent 55%)' }}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/7 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Generated Timetables</h2>
            <p className="text-xs text-white/25 mt-0.5">
              <span className="text-emerald-400/80">{totalOk} generated successfully</span>
              {totalErr > 0 && <span className="text-red-400/70"> · {totalErr} failed</span>}
              <span className="ml-2 text-white/20">· Subjects only view</span>
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            {/* View toggle */}
            <div className="flex bg-white/5 p-1 rounded-xl border border-white/8">
              <button onClick={() => setViewMode('table')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode === 'table' ? 'bg-white/15 text-white' : 'text-white/35 hover:text-white/65'}`}>
                <LayoutGrid className="h-3 w-3" />Table
              </button>
              <button onClick={() => setViewMode('list')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode === 'list' ? 'bg-white/15 text-white' : 'text-white/35 hover:text-white/65'}`}>
                <List className="h-3 w-3" />List
              </button>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-white/40 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search + filter */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-white/5 shrink-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25" />
            <Input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subjects..."
              className="pl-8 h-9 bg-white/5 border-white/9 text-white placeholder:text-white/20 text-sm rounded-xl"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-9 w-44 bg-white/5 border-white/9 text-white/60 text-sm rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#18182a] border-white/10 text-white">
              {SUBJECT_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="capitalize text-white/75 focus:bg-white/8 focus:text-white">
                  {t === 'all' ? 'All Types' : t.charAt(0).toUpperCase() + t.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Year tabs */}
        <div className="flex items-center justify-between px-6 pt-4 shrink-0">
          <div className="flex items-center gap-1.5">
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
                    activeYear === year ? `bg-gradient-to-r ${yc.tab} text-white shadow-lg` :
                    hasYear ? 'text-white/35 hover:text-white/65 hover:bg-white/5' : 'text-white/15 cursor-not-allowed'
                  }`}
                >
                  Year {year}
                  {hasYear && (
                    <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${activeYear === year ? 'bg-white/20' : 'bg-white/8 text-white/40'}`}>
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
            <div className="flex bg-white/3 p-1 rounded-xl border border-white/6 gap-1">
              {currentYearResults.map((r) => (
                <button
                  key={r.section}
                  onClick={() => setActiveSection(r.section)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activeSection === r.section
                      ? "bg-white/15 text-white shadow-sm"
                      : "text-white/40 hover:text-white/70"
                  }`}
                >
                  Section {r.section}
                  {r.status === 'ok' ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-auto px-6 pb-6 pt-4">
          {!activeResult ? (
            <div className="flex flex-col items-center justify-center h-60 text-white/25 italic gap-2">
              <AlertCircle className="h-8 w-8 text-white/10" />
              No timetables generated for this selection
            </div>
          ) : activeResult.status === 'error' ? (
            <div className="flex flex-col items-center justify-center h-60 border border-red-500/20 bg-red-500/5 rounded-2xl p-6 text-center">
              <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
              <h3 className="text-base font-bold text-white mb-1">Generation Failed</h3>
              <p className="text-sm text-red-400/80 max-w-md leading-relaxed">{activeResult.error}</p>
            </div>
          ) : (
            <div className="bg-[#0c0c17] rounded-2xl border border-white/6 p-5 shadow-inner">
              <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                <span className="text-sm font-bold text-white">
                  Timetable Grid: Year {activeResult.year} — Section {activeResult.section}
                </span>
                <span className="text-[10px] text-white/30 uppercase tracking-wider font-mono">
                  Subjects Only View
                </span>
              </div>
              {viewMode === 'table' ? (
                <MiniGrid grid={activeResult.grid} search={search} filterType={filterType} compact={false} />
              ) : (
                <ListView grid={activeResult.grid} search={search} filterType={filterType} />
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
