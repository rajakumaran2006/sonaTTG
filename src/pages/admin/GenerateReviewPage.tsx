import { useEffect, useState, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useDarkMode } from "@/context/DarkModeContext";
import {
  ArrowLeft,
  Calendar,
  BookOpen,
  Users,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  X,
  ExternalLink,
  Zap,
  Search,
  LayoutGrid,
  List,
  FileDown,
  FileText,
  Layers,
  Printer,
  ChevronDown,
  ChevronUp,
  ArrowLeftRight,
  GripVertical,
  AlertCircle,
  Maximize2,
  Minimize2,
  RotateCcw,
  Edit2,
  Check,
  Plus,
  Trash2,
  ArrowUpDown,
} from "lucide-react";
import {
  checkSwapFacultyConflict,
  getFacultyForSubject,
  loadGlobalConflictData,
  DISPLAY_COL_TO_PERIOD,
  FacultyConflict,
} from "@/lib/timetableConflictService";
import AdminNavbar from "@/components/navbar/AdminNavbar";
import SelectionHeader from "@/components/admin/SelectionHeader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  exportTimetablesToPdf,
  TimetableExportClassItem,
  TimetablePdfOptions,
  TimetableExportSubject
} from "@/lib/timetablePdfExport";
import { supabase } from "@/integrations/supabase/client";
import {
  getDepartmentByName,
  getSubjectsForYear,
  getSpecialHoursConfigsForYear,
  getSubjectFacultyMapAllSections,
  getSectionSubjects,
  saveTimetable,
  getFacultyByDepartment,
  upsertClassCounselor,
  deactivateClassCounselor,
} from "@/lib/supabaseService";
import { generateAllYears, YearSectionResult, verifySubjectHours } from "@/lib/timetable";
import { SubjectHoursVerificationCard } from "@/components/admin/SubjectHoursVerificationCard";
import { buildFacultyAllocationMap } from "@/lib/facultyAllocation";
import type { WizardSelection } from "@/components/admin/GenerateWizardModal";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SpecialHoursManager } from "@/components/SpecialHoursManager";
import { useTimetableStore } from "@/store/timetableStore";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

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

const DISPLAY_COLUMNS = [
  'PERIOD 1', 'PERIOD 2', 'BREAK', 'PERIOD 3', 'PERIOD 4', 'LUNCH',
  'PERIOD 5', 'PERIOD 6', 'BREAK', 'PERIOD 7'
] as const;

const TIME_LABELS: Record<string, string> = {
  'PERIOD 1': '9:00–9:55', 'PERIOD 2': '9:55–10:50', 'BREAK': '10:50–11:05',
  'PERIOD 3': '11:05–12:00', 'PERIOD 4': '12:00–12:55', 'LUNCH': '12:55–1:55',
  'PERIOD 5': '1:55–2:50', 'PERIOD 6': '2:50–3:45', 'PERIOD 7': '3:55–4:50',
};
const SUBJECT_TYPES = ['all', 'theory', 'lab', 'elective', 'open elective'];

function getCellStyle(cell: string, isDark: boolean): string {
  if (!cell) {
    return isDark
      ? 'bg-slate-900/60 text-slate-400 border border-dashed border-slate-700/60 hover:border-blue-400/60 hover:bg-blue-500/10'
      : 'bg-white/40 backdrop-blur-sm text-blue-400 border border-dashed border-blue-200/70 hover:border-blue-400/70 hover:bg-blue-50/40';
  }
  if (cell === 'BREAK' || cell === 'LUNCH') {
    return isDark
      ? 'bg-[#0f172a] text-amber-300 font-black uppercase tracking-widest border border-amber-500/30 shadow-sm'
      : 'bg-amber-50/80 backdrop-blur-sm text-amber-700 font-black uppercase tracking-widest border border-amber-200/80';
  }

  if (isDark) {
    return 'bg-[#152042] text-white border border-blue-400/40 hover:border-blue-400 hover:bg-[#1d2b59] shadow-md shadow-black/40';
  }

  // All subject periods: Unified clean style (Blue + White + Glassmorphism)
  return 'bg-white/95 backdrop-blur-md text-slate-900 border border-blue-200/90 hover:border-blue-400 hover:bg-white shadow-[0_2px_8px_rgba(37,99,235,0.06)]';
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

function cleanCellTitle(raw: string): string {
  if (!raw) return '';
  if (raw.toLowerCase().includes('open elective')) return 'Open Elective';
  // Strip trailing parenthesized staff suffix if present, e.g. "Seminar (Mr. D. Jayaprakash)" -> "Seminar"
  const stripped = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return stripped || raw;
}

function MiniGrid({
  grid,
  search,
  filterType,
  compact = false,
  onSwapSlots,
  getFaculty,
  showFaculty = false,
}: {
  grid: string[][];
  search: string;
  filterType: string;
  compact?: boolean;
  onSwapSlots?: (source: { day: number; period: number }, target: { day: number; period: number }) => void;
  getFaculty?: (subject: string) => string[];
  showFaculty?: boolean;
}) {
  const { isDark } = useDarkMode();
  const safeGrid = Array.isArray(grid) ? grid : [];

  const [dragSource, setDragSource] = useState<{ day: number; period: number; subject: string } | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ day: number; period: number } | null>(null);

  return (
    <div className={`overflow-x-auto rounded-xl border border-slate-200 dark:border-indigo-500/20 shadow-sm bg-white dark:bg-[#080b14] ${compact ? 'max-h-[300px]' : ''}`}>
      <table className="w-full border-collapse" style={{ minWidth: compact ? 650 : 1180 }}>
        <thead>
          <tr className={isDark ? "bg-[#0e1428] text-slate-200 border-b border-indigo-500/20" : "bg-[#0f172a] text-white"}>
            <th className={`py-3 px-3 text-center font-bold text-xs sm:text-[13px] uppercase tracking-wider w-20 sticky left-0 z-20 ${isDark ? "bg-[#0e1428] border-r border-white/10 text-slate-200" : "bg-[#0f172a] border-r border-slate-700 text-white"
              }`}>
              Day
            </th>
            {GRID_COLUMNS.map((col) => (
              <th
                key={col.key}
                className={`py-2.5 px-2 text-center last:border-r-0 ${isDark
                    ? `border-r border-white/10 ${col.isDivider ? "w-20 sm:w-24 bg-[#0a0f1e] text-slate-400" : "min-w-[125px] text-slate-200"}`
                    : `border-r border-slate-700 ${col.isDivider ? "w-20 sm:w-24 bg-[#1e293b]" : "min-w-[125px]"}`
                  }`}
              >
                <div className="flex flex-col items-center justify-center">
                  <span className={`text-xs sm:text-[13px] font-bold tracking-wide ${isDark ? "text-slate-100" : "text-white"}`}>
                    {col.label}
                  </span>
                  <span className={`text-[10px] sm:text-[11px] font-mono mt-0.5 ${isDark ? "text-indigo-300/80" : "text-indigo-200/90"}`}>
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
                className={`transition-colors ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-slate-50/50"
                  }`}
              >
                {/* Day Header Cell */}
                <td className={`py-2 px-3 text-center border-r font-semibold select-none sticky left-0 z-10 ${isDark ? "bg-[#0f1527] border-white/10 text-slate-100" : "bg-slate-50 border-slate-200"
                  }`}>
                  <div className="flex flex-col items-center justify-center">
                    <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                      {DAYS[dayIdx]}
                    </span>
                  </div>
                </td>

                {displayRow.map((cell, colIdx) => {
                  const colInfo = GRID_COLUMNS[colIdx];
                  const pIdx = colInfo.periodIdx;
                  const isDivider = colInfo.isDivider;
                  const highlight = (search || filterType !== 'all') ? matchesFilter(cell, search, filterType) : false;
                  const isDimmed = (search || filterType !== 'all') && cell && !isDivider && !matchesFilter(cell, search, filterType);

                  if (isDivider) {
                    return (
                      <td
                        key={colIdx}
                        className="p-1 border-r border-slate-200 dark:border-white/5 bg-slate-100/80 dark:bg-white/[0.02] text-center select-none"
                      >
                        <div className="h-full min-h-[78px] sm:min-h-[86px] flex items-center justify-center">
                          <span className={`text-xs font-black tracking-widest uppercase ${isDark ? "text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" : "text-amber-700"}`}>
                            {cell}
                          </span>
                        </div>
                      </td>
                    );
                  }

                  const canDrag = !compact && !!onSwapSlots && pIdx !== null && !!cell && cell.trim() !== '';
                  const canDrop = !compact && !!onSwapSlots && pIdx !== null;
                  const isDraggingThis = dragSource?.day === dayIdx && dragSource?.period === pIdx;
                  const isTargetThis = dragOverTarget?.day === dayIdx && dragOverTarget?.period === pIdx;

                  const cellTitle = cleanCellTitle(cell);
                  const faculties = (getFaculty && cell) ? getFaculty(cell) : [];
                  const inlineMatch = cell ? cell.match(/\(([^)]+)\)/) : null;
                  const facultyLabel = faculties.length > 0
                    ? faculties.join(' / ')
                    : (inlineMatch && inlineMatch[1] ? inlineMatch[1].trim() : '');

                  return (
                    <td
                      key={colIdx}
                      className="p-1 sm:p-1.5 border-r border-slate-200 dark:border-white/5 last:border-r-0 align-middle"
                      onDragOver={(e) => {
                        if (!canDrop || pIdx === null) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragOverTarget?.day !== dayIdx || dragOverTarget?.period !== pIdx) {
                          setDragOverTarget({ day: dayIdx, period: pIdx });
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverTarget?.day === dayIdx && dragOverTarget?.period === pIdx) {
                          setDragOverTarget(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!canDrop || pIdx === null || !dragSource) return;
                        if (dragSource.day === dayIdx && dragSource.period === pIdx) {
                          setDragSource(null);
                          setDragOverTarget(null);
                          return;
                        }
                        onSwapSlots?.(dragSource, { day: dayIdx, period: pIdx });
                        setDragSource(null);
                        setDragOverTarget(null);
                      }}
                    >
                      <div
                        draggable={canDrag}
                        onDragStart={(e) => {
                          if (!canDrag || pIdx === null) return;
                          e.dataTransfer.setData('text/plain', JSON.stringify({ day: dayIdx, period: pIdx }));
                          e.dataTransfer.effectAllowed = 'move';
                          setDragSource({ day: dayIdx, period: pIdx, subject: cellTitle });
                        }}
                        onDragEnd={() => {
                          setDragSource(null);
                          setDragOverTarget(null);
                        }}
                        title={
                          cellTitle
                            ? `${cellTitle}${facultyLabel ? ` • Staff: ${facultyLabel}` : ''}${canDrag ? ' (Drag to swap period)' : ''}`
                            : canDrop
                              ? 'Empty Period (Drop subject here to reschedule)'
                              : ''
                        }
                        className={`
                          rounded-xl flex flex-col justify-center items-center p-2 sm:p-2.5 transition-all duration-200 relative select-none
                          ${compact ? 'h-12' : showFaculty ? 'min-h-[78px] sm:min-h-[86px]' : 'min-h-[64px] sm:min-h-[72px]'}
                          ${getCellStyle(cell, isDark)}
                          ${canDrag ? 'cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5' : ''}
                          ${isDraggingThis ? 'opacity-30 scale-95 border-2 border-dashed border-indigo-500' : ''}
                          ${isTargetThis ? 'ring-2 ring-indigo-500 bg-indigo-500/20 scale-105 z-20 shadow-xl' : ''}
                          ${highlight ? 'ring-2 ring-indigo-500 scale-105 z-10' : ''}
                          ${isDimmed ? 'opacity-25' : ''}
                        `}
                      >
                        {/* Subject Name */}
                        <div className="flex-1 flex items-center justify-center text-center my-0.5 w-full">
                          <span className={`text-xs sm:text-[13px] font-black tracking-tight leading-snug line-clamp-2 ${isDark ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" : "text-slate-900"}`}>
                            {cellTitle}
                          </span>
                        </div>

                        {/* Faculty name if enabled */}
                        {showFaculty && facultyLabel && (
                          <span
                            className={`text-[10px] sm:text-[11px] font-bold text-center uppercase tracking-wide truncate w-full mt-1 ${isDark ? "text-sky-300 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" : "text-blue-700"}`}
                            title={`Staff: ${facultyLabel}`}
                          >
                            {facultyLabel}
                          </span>
                        )}
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
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className={`flex items-center gap-3.5 px-4 py-3 rounded-xl border transition-all ${isDark
            ? "bg-white/[0.03] border-white/8 hover:bg-white/[0.05] text-white"
            : "bg-white border-slate-200 hover:bg-slate-50 text-slate-800 shadow-sm"
          }`}>
          <span className="text-xs font-extrabold uppercase w-10 text-slate-500 shrink-0">{item.day}</span>
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
            {item.label}
          </span>
          {item.time && (
            <span className="text-xs font-mono text-muted-foreground shrink-0 hidden sm:inline">
              {item.time}
            </span>
          )}
          <span className="text-sm font-semibold flex-1 truncate text-slate-900 dark:text-slate-100">
            {item.cell}
          </span>
        </div>
      ))}
    </div>
  );
}

function getFullScreenCellStyle(cell: string, isDark?: boolean): string {
  if (!cell) {
    return isDark
      ? 'bg-slate-800/40 backdrop-blur-sm text-blue-400/50 border border-dashed border-blue-900/60 hover:border-blue-500/70 hover:bg-blue-950/40'
      : 'bg-white/40 backdrop-blur-sm text-blue-300 border border-dashed border-blue-200/70 hover:border-blue-400/70 hover:bg-blue-50/40';
  }
  if (cell === 'BREAK' || cell === 'LUNCH') {
    return isDark
      ? 'bg-slate-900/70 backdrop-blur-sm text-blue-400 font-extrabold uppercase tracking-widest border border-blue-900/50'
      : 'bg-blue-50/50 backdrop-blur-sm text-blue-600/80 font-extrabold uppercase tracking-widest border border-blue-100/70';
  }

  // Unified clean aesthetic for all subjects:
  return isDark
    ? 'bg-[#131b31]/90 backdrop-blur-md text-slate-100 border border-blue-500/30 hover:border-blue-400 hover:bg-[#182342] shadow-[0_2px_12px_rgba(0,0,0,0.4)]'
    : 'bg-white/90 backdrop-blur-md text-slate-900 border border-blue-200/90 hover:border-blue-400 hover:bg-white shadow-[0_2px_8px_rgba(37,99,235,0.06)]';
}

function getFullScreenCellTitleColor(cell: string, isDark?: boolean): string {
  if (!cell) return isDark ? 'text-slate-500' : 'text-slate-400';
  return isDark ? 'text-slate-100 font-bold' : 'text-slate-900 font-bold';
}

function getFullScreenCellFacultyColor(cell: string, isDark?: boolean): string {
  if (!cell) return isDark ? 'text-slate-500' : 'text-slate-400';
  return isDark ? 'text-blue-300/90 font-medium' : 'text-blue-600 font-semibold';
}

function FullScreenGrid({
  grid,
  onSwapSlots,
  getFaculty,
  showFaculty = false,
  isDark = false,
}: {
  grid: string[][];
  onSwapSlots?: (source: { day: number; period: number }, target: { day: number; period: number }) => void;
  getFaculty?: (subject: string) => string[];
  showFaculty?: boolean;
  isDark?: boolean;
}) {
  const safeGrid = Array.isArray(grid) ? grid : [];

  const [dragSource, setDragSource] = useState<{ day: number; period: number; subject: string } | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ day: number; period: number } | null>(null);
  const [selectedTapSlot, setSelectedTapSlot] = useState<{ day: number; period: number; subject: string } | null>(null);

  const cols = [
    { key: 'day', label: 'Day', time: '', isDivider: false, pIdx: null },
    { key: 'p1', label: 'P1', time: '9:00–9:55', isDivider: false, pIdx: 0 },
    { key: 'p2', label: 'P2', time: '9:55–10:50', isDivider: false, pIdx: 1 },
    { key: 'b1', label: 'BREAK', time: '10:50–11:05', isDivider: true, pIdx: null },
    { key: 'p3', label: 'P3', time: '11:05–12:00', isDivider: false, pIdx: 2 },
    { key: 'p4', label: 'P4', time: '12:00–12:55', isDivider: false, pIdx: 3 },
    { key: 'lunch', label: 'LUNCH', time: '12:55–1:55', isDivider: true, pIdx: null },
    { key: 'p5', label: 'P5', time: '1:55–2:50', isDivider: false, pIdx: 4 },
    { key: 'p6', label: 'P6', time: '2:50–3:45', isDivider: false, pIdx: 5 },
    { key: 'b2', label: 'BREAK', time: '3:45–3:55', isDivider: true, pIdx: null },
    { key: 'p7', label: 'P7', time: '3:55–4:50', isDivider: false, pIdx: 6 },
  ];

  const handleCellTap = (dayIdx: number, pIdx: number, cell: string) => {
    if (!onSwapSlots || pIdx === null) return;
    if (!selectedTapSlot) {
      if (cell && cell.trim() !== '') {
        setSelectedTapSlot({ day: dayIdx, period: pIdx, subject: cleanCellTitle(cell) });
      }
    } else {
      if (selectedTapSlot.day === dayIdx && selectedTapSlot.period === pIdx) {
        setSelectedTapSlot(null);
      } else {
        onSwapSlots(selectedTapSlot, { day: dayIdx, period: pIdx });
        toast.success(`Swapped ${selectedTapSlot.subject} with ${cleanCellTitle(cell) || 'Empty Slot'}`);
        setSelectedTapSlot(null);
      }
    }
  };

  const gridColTemplate = "grid-cols-[65px_repeat(2,minmax(95px,1fr))_68px_repeat(2,minmax(95px,1fr))_72px_repeat(2,minmax(95px,1fr))_68px_minmax(95px,1fr)] lg:grid-cols-[5.5%_repeat(2,11%)_5.5%_repeat(2,11%)_6%_repeat(2,11%)_5.5%_11%]";

  return (
    <div className={`w-full h-full flex flex-col rounded-2xl overflow-hidden border ${isDark
        ? "border-blue-500/25 bg-[#0c1022]/85 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.6),0_0_12px_-2px_rgba(59,130,246,0.1),inset_0_1px_1px_0_rgba(255,255,255,0.05)]"
        : "border-blue-200/70 bg-white/85 shadow-[0_4px_20px_-4px_rgba(37,99,235,0.08),0_0_10px_-2px_rgba(37,99,235,0.06),inset_0_1px_1px_0_rgba(255,255,255,0.9)]"
      } backdrop-blur-2xl select-none relative`}>
      {/* Mobile scroll hint */}
      <div className={`lg:hidden px-2.5 py-1 ${isDark ? "bg-blue-950/60 border-blue-800/60 text-blue-200" : "bg-blue-100/60 border-blue-200/60 text-blue-900"
        } backdrop-blur-sm border-b text-[11px] font-semibold flex items-center justify-between shrink-0`}>
        <span className="flex items-center gap-1.5 truncate">
          <ArrowLeftRight className="h-3 w-3 text-blue-600 shrink-0" />
          <span>Swipe horizontally for all periods • Tap slots to swap</span>
        </span>
        {selectedTapSlot && (
          <button
            onClick={() => setSelectedTapSlot(null)}
            className="text-[10px] text-blue-700 font-bold underline shrink-0 ml-2"
          >
            Cancel swap
          </button>
        )}
      </div>

      {/* Main scrollable grid viewport with sticky day column */}
      <div className="flex-1 min-h-0 w-full overflow-x-auto overflow-y-auto">
        <div className="w-full min-w-[860px] lg:min-w-0 lg:w-full h-full flex flex-col">
          {/* Header - Crisp Pure Blue (Light) / Comfortable Midnight Blue (Dark) */}
          <div className={`h-10 sm:h-11 shrink-0 grid ${gridColTemplate} ${isDark ? "border-b border-blue-500/25 bg-[#131d38] text-blue-100 shadow-xs" : "border-b border-blue-400/30 bg-blue-600 text-white shadow-xs"
            } sticky top-0 z-30`}>
            {cols.map((col, idx) => (
              <div
                key={col.key}
                className={`flex flex-col items-center justify-center leading-none last:border-r-0 p-1 ${isDark ? "border-r border-blue-500/20" : "border-r border-blue-500/40"
                  } ${col.isDivider
                    ? isDark ? 'bg-[#0e162b]/90 text-blue-300/80' : 'bg-blue-700/50 text-blue-100'
                    : ''
                  } ${idx === 0
                    ? isDark
                      ? 'sticky left-0 z-40 bg-[#182852] shadow-[2px_0_6px_rgba(0,0,0,0.5)]'
                      : 'sticky left-0 z-40 bg-blue-700 shadow-[2px_0_6px_rgba(29,78,216,0.3)]'
                    : ''
                  }`}
              >
                <span className={`text-xs sm:text-[13px] font-extrabold tracking-wide uppercase ${isDark ? "text-blue-100" : "text-white"}`}>
                  {col.label}
                </span>
                {col.time && (
                  <span className={`text-[9.5px] sm:text-[10px] xl:text-[10.5px] font-mono mt-0.5 whitespace-nowrap leading-none tracking-tight font-medium ${isDark ? "text-blue-300/70" : "text-blue-100/90"
                    }`}>
                    ({col.time})
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Body: 6 equal rows */}
          <div className={`flex-1 min-h-0 grid grid-rows-6 divide-y ${isDark ? "divide-slate-800/80" : "divide-blue-100/70"}`}>
            {safeGrid.map((row, dayIdx) => {
              const r = Array.isArray(row) ? row : [];
              const displayRow: string[] = [
                r[0] || '', r[1] || '', 'BREAK', r[2] || '', r[3] || '', 'LUNCH', r[4] || '', r[5] || '', 'BREAK', r[6] || ''
              ];

              return (
                <div
                  key={dayIdx}
                  className={`grid ${gridColTemplate} h-full min-h-[56px] lg:min-h-0 transition-colors ${isDark ? "hover:bg-slate-800/30" : "hover:bg-blue-50/25"}`}
                >
                  {/* Sticky Day column */}
                  <div className={`flex items-center justify-center border-r ${isDark
                      ? "border-blue-900/50 text-slate-100 bg-slate-900/80 shadow-[2px_0_6px_rgba(0,0,0,0.3)]"
                      : "border-blue-100/90 text-slate-800 bg-blue-50/60 shadow-[2px_0_6px_rgba(37,99,235,0.06)]"
                    } font-extrabold text-xs sm:text-sm lg:text-[14px] backdrop-blur-md sticky left-0 z-20 uppercase tracking-wider`}>
                    {DAYS[dayIdx]}
                  </div>

                  {/* 10 period & divider columns */}
                  {displayRow.map((cell, colIdx) => {
                    const colDef = cols[colIdx + 1];
                    const pIdx = colDef.pIdx;
                    const isDivider = colDef.isDivider;

                    if (isDivider) {
                      return (
                        <div
                          key={colIdx}
                          className={`border-r ${isDark ? "border-slate-800/80 bg-slate-900/50 text-blue-400/80" : "border-blue-100/80 bg-blue-50/35 text-blue-600/75"
                            } backdrop-blur-sm flex items-center justify-center select-none`}
                        >
                          <span className="text-[11px] sm:text-xs lg:text-[12.5px] font-extrabold tracking-widest uppercase whitespace-nowrap">
                            {cell}
                          </span>
                        </div>
                      );
                    }

                    const canDrag = !!onSwapSlots && pIdx !== null && !!cell && cell.trim() !== '';
                    const canDrop = !!onSwapSlots && pIdx !== null;
                    const isDraggingThis = dragSource?.day === dayIdx && dragSource?.period === pIdx;
                    const isTargetThis = dragOverTarget?.day === dayIdx && dragOverTarget?.period === pIdx;
                    const isTapSelectedThis = selectedTapSlot?.day === dayIdx && selectedTapSlot?.period === pIdx;

                    const cellTitle = cleanCellTitle(cell);
                    const faculties = (getFaculty && cell) ? getFaculty(cell) : [];
                    const inlineMatch = cell ? cell.match(/\(([^)]+)\)/) : null;
                    const facultyLabel = faculties.length > 0
                      ? faculties.join(' / ')
                      : (inlineMatch && inlineMatch[1] ? inlineMatch[1].trim() : '');

                    return (
                      <div
                        key={colIdx}
                        className={`p-1 sm:p-1.5 border-r ${isDark ? "border-slate-800/80" : "border-blue-100/70"} last:border-r-0 h-full min-h-0 overflow-hidden flex items-center justify-center`}
                        onDragOver={(e) => {
                          if (!canDrop || pIdx === null) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (dragOverTarget?.day !== dayIdx || dragOverTarget?.period !== pIdx) {
                            setDragOverTarget({ day: dayIdx, period: pIdx });
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOverTarget?.day === dayIdx && dragOverTarget?.period === pIdx) {
                            setDragOverTarget(null);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (!canDrop || pIdx === null || !dragSource) return;
                          if (dragSource.day === dayIdx && dragSource.period === pIdx) {
                            setDragSource(null);
                            setDragOverTarget(null);
                            return;
                          }
                          onSwapSlots?.(dragSource, { day: dayIdx, period: pIdx });
                          setDragSource(null);
                          setDragOverTarget(null);
                        }}
                      >
                        <div
                          draggable={canDrag}
                          onClick={() => pIdx !== null && handleCellTap(dayIdx, pIdx, cell)}
                          onDragStart={(e) => {
                            if (!canDrag || pIdx === null) return;
                            e.dataTransfer.setData('text/plain', JSON.stringify({ day: dayIdx, period: pIdx }));
                            e.dataTransfer.effectAllowed = 'move';
                            setDragSource({ day: dayIdx, period: pIdx, subject: cellTitle });
                          }}
                          onDragEnd={() => {
                            setDragSource(null);
                            setDragOverTarget(null);
                          }}
                          title={
                            cellTitle
                              ? `${cellTitle}${facultyLabel ? ` • Staff: ${facultyLabel}` : ''}${canDrag ? ' (Drag or tap to swap)' : ''}`
                              : canDrop
                                ? 'Empty Period (Click or drop to place subject)'
                                : ''
                          }
                          className={`
                            rounded-xl flex flex-col justify-center items-center px-1.5 sm:px-2 py-1 transition-all duration-150 h-full w-full select-none text-center overflow-hidden cursor-pointer
                            ${getFullScreenCellStyle(cell, isDark)}
                            ${canDrag ? 'cursor-grab active:cursor-grabbing hover:shadow-md hover:scale-[1.01]' : ''}
                            ${isDraggingThis ? 'opacity-30 scale-95 border-2 border-dashed border-blue-500' : ''}
                            ${isTargetThis ? 'ring-2 ring-blue-500 bg-blue-500/20 scale-105 z-20 shadow-xl' : ''}
                            ${isTapSelectedThis ? 'ring-2 ring-blue-600 ring-offset-2 ring-offset-white bg-blue-500/20 scale-[1.02] z-20 shadow-lg' : ''}
                            ${selectedTapSlot && !isTapSelectedThis ? 'hover:ring-2 hover:ring-blue-400/60 hover:bg-blue-500/10' : ''}
                          `}
                        >
                          <span className={`text-xs sm:text-[12.5px] lg:text-[13px] xl:text-[14px] font-bold tracking-tight text-center leading-snug line-clamp-2 w-full ${getFullScreenCellTitleColor(cell, isDark)}`}>
                            {cellTitle}
                          </span>

                          {showFaculty && facultyLabel && (
                            <span
                              className={`text-[9.5px] sm:text-[10.5px] lg:text-[11px] xl:text-[11.5px] font-semibold text-center uppercase tracking-wide truncate w-full mt-0.5 sm:mt-1 opacity-90 leading-tight ${getFullScreenCellFacultyColor(cell, isDark)}`}
                              title={`Staff: ${facultyLabel}`}
                            >
                              {facultyLabel}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating Action Banner for Mobile / Tap-to-Swap */}
      {selectedTapSlot && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-50 bg-blue-900/90 text-white backdrop-blur-xl px-4 py-2 rounded-full shadow-[0_8px_32px_rgba(37,99,235,0.35)] border border-blue-400/40 flex items-center gap-2.5 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
          <span className="flex h-2 w-2 rounded-full bg-blue-300 animate-ping" />
          <span className="font-semibold truncate max-w-[180px] sm:max-w-xs text-white">
            Selected: <span className="text-blue-200 font-bold">{selectedTapSlot.subject}</span> ({DAYS[selectedTapSlot.day]} P{selectedTapSlot.period + 1})
          </span>
          <span className="text-blue-200/80 text-[11px] hidden sm:inline">• Tap destination slot to swap</span>
          <button
            onClick={() => setSelectedTapSlot(null)}
            className="p-1 hover:bg-white/20 rounded-full transition-colors ml-1 text-blue-200 hover:text-white"
            title="Cancel swap"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function MobileDayScheduleView({
  grid,
  getFaculty,
  showFaculty = false,
  onSwapSlots,
  isDark,
}: {
  grid: string[][];
  getFaculty?: (subject: string) => string[];
  showFaculty?: boolean;
  onSwapSlots?: (source: { day: number; period: number }, target: { day: number; period: number }) => void;
  isDark: boolean;
}) {
  const safeGrid = Array.isArray(grid) ? grid : [];
  const [activeDayIdx, setActiveDayIdx] = useState<number>(0);
  const [selectedTapSlot, setSelectedTapSlot] = useState<{ day: number; period: number; subject: string } | null>(null);

  const activeRow = safeGrid[activeDayIdx] || [];
  const scheduleItems = [
    { type: 'period', pIdx: 0, label: 'P1', time: '9:00 – 9:55 AM', cell: activeRow[0] || '' },
    { type: 'period', pIdx: 1, label: 'P2', time: '9:55 – 10:50 AM', cell: activeRow[1] || '' },
    { type: 'break', pIdx: null, label: 'BREAK', time: '10:50 – 11:05 AM', cell: 'BREAK' },
    { type: 'period', pIdx: 2, label: 'P3', time: '11:05 – 12:00 PM', cell: activeRow[2] || '' },
    { type: 'period', pIdx: 3, label: 'P4', time: '12:00 – 12:55 PM', cell: activeRow[3] || '' },
    { type: 'lunch', pIdx: null, label: 'LUNCH', time: '12:55 – 1:55 PM', cell: 'LUNCH' },
    { type: 'period', pIdx: 4, label: 'P5', time: '1:55 – 2:50 PM', cell: activeRow[4] || '' },
    { type: 'period', pIdx: 5, label: 'P6', time: '2:50 – 3:45 PM', cell: activeRow[5] || '' },
    { type: 'break', pIdx: null, label: 'BREAK', time: '3:45 – 3:55 PM', cell: 'BREAK' },
    { type: 'period', pIdx: 6, label: 'P7', time: '3:55 – 4:50 PM', cell: activeRow[6] || '' },
  ];

  const handlePeriodTap = (pIdx: number, cell: string) => {
    if (!onSwapSlots) return;
    if (!selectedTapSlot) {
      if (cell && cell.trim()) {
        setSelectedTapSlot({ day: activeDayIdx, period: pIdx, subject: cell });
      }
    } else {
      if (selectedTapSlot.day === activeDayIdx && selectedTapSlot.period === pIdx) {
        setSelectedTapSlot(null);
      } else {
        onSwapSlots(selectedTapSlot, { day: activeDayIdx, period: pIdx });
        toast.success(`Swapped ${selectedTapSlot.subject} with ${cell || 'Empty Slot'}`);
        setSelectedTapSlot(null);
      }
    }
  };

  return (
    <div className="w-full h-full flex flex-col rounded-2xl overflow-hidden border border-indigo-200/70 bg-white/80 backdrop-blur-2xl shadow-sm select-none">
      {/* Day Selector Pills */}
      <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-600 px-3 py-2 flex items-center justify-between shrink-0 gap-2 border-b border-indigo-300/40 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 min-w-max">
          <span className="text-xs font-bold text-white uppercase mr-1">Day:</span>
          {DAYS.map((d, idx) => (
            <button
              key={d}
              onClick={() => setActiveDayIdx(idx)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${activeDayIdx === idx
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "bg-indigo-800/40 text-indigo-100 hover:bg-white/20"
                }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Vertical Timeline Card List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {scheduleItems.map((item, idx) => {
          if (item.type === 'break' || item.type === 'lunch') {
            return (
              <div
                key={idx}
                className="py-1.5 px-3 rounded-lg border border-dashed border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold"
              >
                <span className="font-extrabold uppercase tracking-widest flex items-center gap-1.5">
                  <span>{item.type === 'lunch' ? '🍽️' : '☕'}</span>
                  <span>{item.label}</span>
                </span>
                <span className="font-mono text-[11px]">{item.time}</span>
              </div>
            );
          }

          const pIdx = item.pIdx!;
          const cell = item.cell;
          const faculties = (getFaculty && cell) ? getFaculty(cell) : [];
          const facultyLabel = faculties.join(' / ');
          const isSelected = selectedTapSlot?.day === activeDayIdx && selectedTapSlot?.period === pIdx;

          return (
            <div
              key={idx}
              onClick={() => handlePeriodTap(pIdx, cell)}
              className={`
                p-3 rounded-xl border transition-all duration-150 flex flex-col gap-1.5 cursor-pointer
                ${getCellStyle(cell, isDark)}
                ${isSelected ? 'ring-2 ring-indigo-500 bg-indigo-500/20 scale-[1.01]' : 'hover:border-indigo-500/40'}
              `}
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                  <span>{item.label}</span>
                  <span className="text-slate-400 dark:text-slate-500">•</span>
                  <span>{item.time}</span>
                </span>
                {cell && onSwapSlots && (
                  <span className="text-[10px] text-slate-400 font-medium">Tap to swap</span>
                )}
              </div>

              <div className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-snug">
                {cell || <span className="italic text-slate-400 font-normal">Free / Unassigned Period</span>}
              </div>

              {showFaculty && facultyLabel && (
                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 font-medium">
                  <Users className="h-3 w-3 text-indigo-400 shrink-0" />
                  <span className="truncate">{facultyLabel}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedTapSlot && (
        <div className="p-2.5 bg-blue-900/90 backdrop-blur-xl text-white flex items-center justify-between text-xs shrink-0 border-t border-blue-400/30">
          <span className="truncate font-semibold text-white">
            Selected: <span className="text-blue-200 font-bold">{selectedTapSlot.subject}</span> • Tap any period to swap
          </span>
          <button
            onClick={() => setSelectedTapSlot(null)}
            className="p-1 hover:bg-white/20 rounded-full ml-2 text-blue-200 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export interface AllocationRow {
  code: string;
  title: string;
  category: string;
  hours: number;
  faculty: string;
  abbreviation?: string;
}

export function getCategoryRank(cat: string): number {
  const c = (cat || '').toLowerCase().trim();
  if (c.includes('theory')) return 1;
  if (c.includes('lab') || c.includes('practical')) return 2;
  if (c.includes('open elective')) return 4;
  if (c.includes('elective')) return 3;
  if (c.includes('special') || c.includes('seminar') || c.includes('library') || c.includes('counsel')) return 5;
  return 6;
}

export function sortAllocationRows(rows: AllocationRow[]): AllocationRow[] {
  return [...rows].sort((a, b) => {
    const rankA = getCategoryRank(a.category);
    const rankB = getCategoryRank(b.category);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    // Same category: sort by hours descending (highest to lowest)
    if ((b.hours || 0) !== (a.hours || 0)) {
      return (b.hours || 0) - (a.hours || 0);
    }
    // Same hours: sort alphabetically by title
    return (a.title || '').localeCompare(b.title || '');
  });
}

function getCategoryBadgeStyle(category: string, isDark: boolean): string {
  const c = (category || '').toLowerCase();
  if (c.includes('theory')) {
    return isDark
      ? 'bg-blue-950/70 text-blue-300 border-blue-800/60'
      : 'bg-blue-100/90 text-blue-900 border-blue-200';
  }
  if (c.includes('lab') || c.includes('practical')) {
    return isDark
      ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60'
      : 'bg-emerald-100/90 text-emerald-900 border-emerald-200';
  }
  if (c.includes('open elective')) {
    return isDark
      ? 'bg-violet-950/70 text-violet-300 border-violet-800/60'
      : 'bg-violet-100/90 text-violet-900 border-violet-200';
  }
  if (c.includes('elective')) {
    return isDark
      ? 'bg-purple-950/70 text-purple-300 border-purple-800/60'
      : 'bg-purple-100/90 text-purple-900 border-purple-200';
  }
  if (c.includes('special') || c.includes('seminar') || c.includes('library') || c.includes('counsel')) {
    return isDark
      ? 'bg-amber-950/70 text-amber-300 border-amber-800/60'
      : 'bg-amber-100/90 text-amber-900 border-amber-200';
  }
  return isDark
    ? 'bg-slate-800 text-slate-300 border-slate-700'
    : 'bg-slate-100 text-slate-800 border-slate-200';
}

function FullScreenAllocationTable({
  rows: initialRows,
  isDark = false,
  onRowsChange,
  classCounselor,
}: {
  rows: AllocationRow[];
  isDark?: boolean;
  onRowsChange?: (rows: AllocationRow[]) => void;
  classCounselor?: string;
}) {
  const [tableRows, setTableRows] = useState<AllocationRow[]>(() => sortAllocationRows(initialRows));
  const [viewType, setViewType] = useState<'table' | 'cards'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Swapping state
  const [swapSourceIndex, setSwapSourceIndex] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Single-row edit state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editRowData, setEditRowData] = useState<AllocationRow | null>(null);

  // Quick edit mode (all rows directly editable)
  const [isQuickEditMode, setIsQuickEditMode] = useState<boolean>(false);

  // Add row state
  const [isAddingRow, setIsAddingRow] = useState<boolean>(false);
  const [newRowData, setNewRowData] = useState<AllocationRow>({
    code: '',
    title: '',
    category: 'Theory',
    hours: 4,
    faculty: '',
  });

  // Sync internal state when initialRows changes (e.g. section switch)
  useEffect(() => {
    setTableRows(sortAllocationRows(initialRows));
    setSwapSourceIndex(null);
    setEditingIndex(null);
    setEditRowData(null);
  }, [initialRows]);

  const updateRows = (updated: AllocationRow[]) => {
    setTableRows(updated);
    onRowsChange?.(updated);
  };

  const handleSwap = (idxA: number, idxB: number) => {
    if (idxA === idxB || idxA < 0 || idxB < 0 || idxA >= tableRows.length || idxB >= tableRows.length) {
      setSwapSourceIndex(null);
      return;
    }
    const updated = [...tableRows];
    const temp = updated[idxA];
    updated[idxA] = updated[idxB];
    updated[idxB] = temp;
    updateRows(updated);
    toast.success(`Swapped "${temp.title}" ↔ "${updated[idxA].title}" successfully!`);
    setSwapSourceIndex(null);
  };

  const handleRowClickForSwap = (globalIdx: number) => {
    if (swapSourceIndex === null) {
      setSwapSourceIndex(globalIdx);
      toast.info(`Selected "${tableRows[globalIdx]?.title}". Click any other row to swap.`);
    } else if (swapSourceIndex === globalIdx) {
      setSwapSourceIndex(null);
    } else {
      handleSwap(swapSourceIndex, globalIdx);
    }
  };

  const handleStartEdit = (globalIdx: number) => {
    setEditingIndex(globalIdx);
    setEditRowData({ ...tableRows[globalIdx] });
  };

  const handleSaveEdit = (globalIdx: number) => {
    if (!editRowData) return;
    const updated = [...tableRows];
    updated[globalIdx] = {
      ...editRowData,
      hours: Number(editRowData.hours) || 1,
      title: editRowData.title.trim() || updated[globalIdx].title,
      code: editRowData.code.trim() || '—',
      faculty: editRowData.faculty.trim() || '—',
    };
    updateRows(updated);
    setEditingIndex(null);
    setEditRowData(null);
    toast.success(`Updated "${editRowData.title}"`);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditRowData(null);
  };

  const handleQuickCellChange = (globalIdx: number, field: keyof AllocationRow, value: any) => {
    const updated = [...tableRows];
    updated[globalIdx] = {
      ...updated[globalIdx],
      [field]: field === 'hours' ? (Number(value) || 0) : value,
    };
    updateRows(updated);
  };

  const handleDeleteRow = (globalIdx: number) => {
    const target = tableRows[globalIdx];
    const updated = tableRows.filter((_, i) => i !== globalIdx);
    updateRows(updated);
    if (swapSourceIndex === globalIdx) setSwapSourceIndex(null);
    if (editingIndex === globalIdx) setEditingIndex(null);
    toast.success(`Removed "${target.title}"`);
  };

  const handleReSort = () => {
    const sorted = sortAllocationRows(tableRows);
    updateRows(sorted);
    setSwapSourceIndex(null);
    setEditingIndex(null);
    toast.info("Sorted: Theory → Lab → Elective → Open Elective → Special (Highest to Lowest Hrs)");
  };

  const handleAddRow = () => {
    if (!newRowData.title.trim()) {
      toast.error("Please enter a course title");
      return;
    }
    const rowToAdd: AllocationRow = {
      code: newRowData.code.trim() || '—',
      title: newRowData.title.trim(),
      category: newRowData.category || 'Theory',
      hours: Number(newRowData.hours) || 1,
      faculty: newRowData.faculty.trim() || '—',
    };
    const updated = sortAllocationRows([rowToAdd, ...tableRows]);
    updateRows(updated);
    setIsAddingRow(false);
    setNewRowData({ code: '', title: '', category: 'Theory', hours: 4, faculty: '' });
    toast.success(`Added "${rowToAdd.title}"`);
  };

  // Filtered rows preserving original global index for precise edits and swaps
  const filteredItems = useMemo(() => {
    return tableRows
      .map((row, globalIdx) => ({ row, globalIdx }))
      .filter(({ row }) => {
        const q = searchQuery.toLowerCase().trim();
        const matchSearch = !q ||
          row.title.toLowerCase().includes(q) ||
          row.code.toLowerCase().includes(q) ||
          row.faculty.toLowerCase().includes(q);
        const matchCat = categoryFilter === 'all' || row.category.toLowerCase() === categoryFilter.toLowerCase();
        return matchSearch && matchCat;
      });
  }, [tableRows, searchQuery, categoryFilter]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    tableRows.forEach(r => { if (r.category) set.add(r.category); });
    return ['all', ...Array.from(set)];
  }, [tableRows]);

  const mid = Math.ceil(filteredItems.length / 2);
  const leftItems = filteredItems.slice(0, mid);
  const rightItems = filteredItems.slice(mid);

  const renderCardsView = () => (
    <div className="w-full h-full overflow-y-auto p-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
      {filteredItems.length === 0 ? (
        <div className={`col-span-full py-8 text-center text-xs ${isDark ? "text-blue-400" : "text-blue-500"} italic`}>
          No courses match current filter.
        </div>
      ) : (
        filteredItems.map(({ row, globalIdx }) => {
          const isSelectedForSwap = swapSourceIndex === globalIdx;
          const isEditingThis = editingIndex === globalIdx;

          return (
            <div
              key={globalIdx}
              className={`p-3 rounded-2xl border transition-all ${isSelectedForSwap
                  ? 'ring-2 ring-blue-500 bg-blue-500/15 border-blue-500 shadow-md scale-[1.02]'
                  : isDark
                    ? "border-blue-500/25 bg-[#131b31]/90 hover:border-blue-400/60 hover:bg-[#182342]"
                    : "border-blue-200/70 bg-white/85 hover:border-blue-300 hover:bg-white/95"
                } backdrop-blur-md shadow-sm`}
            >
              <div className="flex items-center justify-between gap-1.5 mb-1.5">
                <span className={`font-mono font-bold text-xs px-2 py-0.5 rounded-lg ${isDark ? "bg-blue-950/80 text-blue-300 border-blue-800/60" : "bg-blue-100/70 text-blue-900 border-blue-200/60"
                  } border`}>
                  {row.code}
                </span>
                <div className="flex items-center gap-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border capitalize ${getCategoryBadgeStyle(row.category, isDark)}`}>
                    {row.category}
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${isDark ? "bg-slate-700/60 text-slate-200" : "bg-blue-100/50 text-blue-900"
                    }`}>
                    {row.hours}h
                  </span>
                </div>
              </div>

              {isEditingThis && editRowData ? (
                <div className="space-y-2 mt-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <input
                    type="text"
                    value={editRowData.title}
                    onChange={(e) => setEditRowData({ ...editRowData, title: e.target.value })}
                    className="w-full text-xs font-bold px-2 py-1 rounded border border-blue-400 bg-white dark:bg-slate-900"
                    placeholder="Course Title"
                  />
                  <div className="flex gap-1.5">
                    <select
                      value={editRowData.category}
                      onChange={(e) => setEditRowData({ ...editRowData, category: e.target.value })}
                      className="w-1/2 text-[11px] font-medium px-1.5 py-1 rounded border border-blue-400 bg-white dark:bg-slate-900"
                    >
                      <option value="Theory">Theory</option>
                      <option value="Lab">Lab</option>
                      <option value="Elective">Elective</option>
                      <option value="Open Elective">Open Elective</option>
                      <option value="Special">Special</option>
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={editRowData.hours}
                      onChange={(e) => setEditRowData({ ...editRowData, hours: Number(e.target.value) || 1 })}
                      className="w-1/2 text-[11px] font-bold px-1.5 py-1 rounded border border-blue-400 bg-white dark:bg-slate-900 text-center"
                      placeholder="Hours"
                    />
                  </div>
                  <input
                    type="text"
                    value={editRowData.faculty}
                    onChange={(e) => setEditRowData({ ...editRowData, faculty: e.target.value })}
                    className="w-full text-xs px-2 py-1 rounded border border-blue-400 bg-white dark:bg-slate-900"
                    placeholder="Faculty In-Charge"
                  />
                  <div className="flex justify-end gap-1 pt-1">
                    <Button size="sm" onClick={() => handleSaveEdit(globalIdx)} className="h-6 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white">
                      <Check className="h-3 w-3 mr-1" /> Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="h-6 px-2 text-[11px]">
                      <X className="h-3 w-3 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={`font-bold text-xs sm:text-[13px] ${isDark ? "text-slate-100" : "text-slate-900"} line-clamp-2 mb-1.5`}>
                    {row.title}
                  </div>
                  <div className={`text-[11px] font-semibold ${isDark ? "text-blue-300/80" : "text-blue-700/80"} flex items-center gap-1 truncate mb-2`}>
                    <Users className={`h-3 w-3 ${isDark ? "text-blue-400" : "text-blue-500"} shrink-0`} />
                    <span className="truncate">{row.faculty}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800/80 text-[10px]">
                    <button
                      onClick={() => handleRowClickForSwap(globalIdx)}
                      className={`px-2 py-0.5 rounded font-bold flex items-center gap-1 transition-all ${isSelectedForSwap
                          ? 'bg-blue-600 text-white'
                          : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-200'
                        }`}
                    >
                      <ArrowUpDown className="h-2.5 w-2.5" />
                      {isSelectedForSwap ? 'Selected' : 'Swap'}
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleStartEdit(globalIdx)}
                        className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800"
                        title="Edit Row"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleDeleteRow(globalIdx)}
                        className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                        title="Delete Row"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })
      )}
    </div>
  );

  const renderSplitTable = (items: typeof leftItems) => {
    const rowCount = Math.max(items.length, 1);

    return (
      <div className={`w-full h-full overflow-hidden flex flex-col rounded-xl border ${isDark ? "border-blue-900/50 bg-slate-900/70" : "border-blue-200/70 bg-white/70"
        } backdrop-blur-md shadow-xs`}>
        <div className="w-full h-full overflow-x-auto overflow-y-auto flex flex-col">
          <table className="w-full h-full table-fixed border-collapse text-left" style={{ minWidth: 460 }}>
            <colgroup>
              <col style={{ width: '13%' }} />
              <col style={{ width: '37%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '11%' }} />
            </colgroup>
            <thead className="shrink-0 sticky top-0 z-10">
              <tr className={`${isDark ? "bg-[#162347] text-blue-200 border-b border-blue-500/25" : "bg-blue-600 text-white border-b border-blue-500/40"
                } text-[11px] sm:text-xs xl:text-[12.5px] uppercase font-extrabold tracking-wider h-8 sm:h-9`}>
                <th className={`px-2 sm:px-2.5 ${isDark ? "border-r border-blue-500/20 text-blue-200" : "border-r border-blue-500/40 text-white"} py-1`}>Code</th>
                <th className={`px-2.5 sm:px-3 ${isDark ? "border-r border-blue-500/20 text-blue-200" : "border-r border-blue-500/40 text-white"} py-1`}>Course Title</th>
                <th className={`px-1 text-center ${isDark ? "border-r border-blue-500/20 text-blue-200" : "border-r border-blue-500/40 text-white"} py-1`}>Category</th>
                <th className={`px-1 text-center ${isDark ? "border-r border-blue-500/20 text-blue-200" : "border-r border-blue-500/40 text-white"} py-1`}>Hrs</th>
                <th className={`px-2 sm:px-2.5 py-1 ${isDark ? "border-r border-blue-500/20 text-blue-200" : "border-r border-blue-500/40 text-white"}`}>Faculty</th>
                <th className={`px-1 py-1 text-center ${isDark ? "text-blue-200" : "text-white"}`}>Action</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-blue-100/70"} h-[calc(100%-36px)]`}>
              {items.map(({ row, globalIdx }) => {
                const isSelectedForSwap = swapSourceIndex === globalIdx;
                const isEditingThis = editingIndex === globalIdx;
                const isOverThis = dragOverIndex === globalIdx;

                return (
                  <tr
                    key={globalIdx}
                    style={{ height: `${100 / rowCount}%` }}
                    draggable={!isEditingThis && !isQuickEditMode}
                    onDragStart={() => setDraggedIndex(globalIdx)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragOverIndex !== globalIdx) setDragOverIndex(globalIdx);
                    }}
                    onDragLeave={() => {
                      if (dragOverIndex === globalIdx) setDragOverIndex(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverIndex(null);
                      if (draggedIndex !== null && draggedIndex !== globalIdx) {
                        handleSwap(draggedIndex, globalIdx);
                        setDraggedIndex(null);
                      }
                    }}
                    onDoubleClick={() => {
                      if (!isQuickEditMode && !isEditingThis) handleStartEdit(globalIdx);
                    }}
                    className={`transition-colors text-xs sm:text-[12.5px] xl:text-[13.5px] select-none ${isSelectedForSwap
                        ? 'bg-blue-500/25 ring-2 ring-blue-500 font-bold'
                        : isOverThis
                          ? 'bg-blue-500/20 ring-1 ring-blue-400'
                          : globalIdx % 2 === 0
                            ? isDark ? "bg-slate-900/60" : "bg-white/80"
                            : isDark ? "bg-[#11182c]/50" : "bg-blue-50/40"
                      } ${isDark ? "hover:bg-slate-800/70" : "hover:bg-blue-100/60"} cursor-pointer`}
                  >
                    {/* 1. CODE */}
                    <td className={`px-2 sm:px-2.5 font-mono font-bold ${isDark ? "text-blue-300 border-slate-800" : "text-blue-900 border-blue-100/80"
                      } border-r truncate align-middle`}>
                      {isQuickEditMode ? (
                        <input
                          type="text"
                          value={row.code}
                          onChange={(e) => handleQuickCellChange(globalIdx, 'code', e.target.value)}
                          className="w-full text-xs font-mono font-bold px-1 py-0.5 rounded border border-blue-300 dark:border-blue-700 bg-white/90 dark:bg-slate-800 text-blue-900 dark:text-blue-200"
                        />
                      ) : isEditingThis && editRowData ? (
                        <input
                          type="text"
                          value={editRowData.code}
                          onChange={(e) => setEditRowData({ ...editRowData, code: e.target.value })}
                          className="w-full text-xs font-mono font-bold px-1 py-0.5 rounded border border-blue-500 bg-white dark:bg-slate-900 text-blue-900 dark:text-blue-200"
                        />
                      ) : (
                        <span>{row.code}</span>
                      )}
                    </td>

                    {/* 2. COURSE TITLE */}
                    <td className={`px-2.5 sm:px-3 font-bold ${isDark ? "text-slate-100 border-slate-800" : "text-slate-900 border-blue-100/80"
                      } border-r truncate align-middle`} title={row.title}>
                      {isQuickEditMode ? (
                        <input
                          type="text"
                          value={row.title}
                          onChange={(e) => handleQuickCellChange(globalIdx, 'title', e.target.value)}
                          className="w-full text-xs font-bold px-1.5 py-0.5 rounded border border-blue-300 dark:border-blue-700 bg-white/90 dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      ) : isEditingThis && editRowData ? (
                        <input
                          type="text"
                          value={editRowData.title}
                          onChange={(e) => setEditRowData({ ...editRowData, title: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(globalIdx);
                            if (e.key === 'Escape') handleCancelEdit();
                          }}
                          autoFocus
                          className="w-full text-xs font-bold px-1.5 py-0.5 rounded border border-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        />
                      ) : (
                        <span className="truncate block">{row.title}</span>
                      )}
                    </td>

                    {/* 3. CATEGORY */}
                    <td className={`px-1 text-center font-medium ${isDark ? "text-blue-400 border-slate-800" : "text-blue-700 border-blue-100/80"
                      } border-r align-middle`}>
                      {isQuickEditMode ? (
                        <select
                          value={row.category}
                          onChange={(e) => handleQuickCellChange(globalIdx, 'category', e.target.value)}
                          className="w-full text-[11px] font-medium px-1 py-0.5 rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                        >
                          <option value="Theory">Theory</option>
                          <option value="Lab">Lab</option>
                          <option value="Elective">Elective</option>
                          <option value="Open Elective">Open Elective</option>
                          <option value="Special">Special</option>
                        </select>
                      ) : isEditingThis && editRowData ? (
                        <select
                          value={editRowData.category}
                          onChange={(e) => setEditRowData({ ...editRowData, category: e.target.value })}
                          className="w-full text-[11px] font-medium px-1 py-0.5 rounded border border-blue-500 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                        >
                          <option value="Theory">Theory</option>
                          <option value="Lab">Lab</option>
                          <option value="Elective">Elective</option>
                          <option value="Open Elective">Open Elective</option>
                          <option value="Special">Special</option>
                        </select>
                      ) : (
                        <span className={`inline-block px-1.5 py-0.5 rounded-md text-[10px] sm:text-[10.5px] xl:text-[11px] font-bold border capitalize leading-tight ${getCategoryBadgeStyle(row.category, isDark)}`}>
                          {row.category}
                        </span>
                      )}
                    </td>

                    {/* 4. HRS */}
                    <td className={`px-1 text-center font-bold ${isDark ? "text-blue-300 border-slate-800" : "text-blue-900 border-blue-100/80"
                      } border-r align-middle`}>
                      {isQuickEditMode ? (
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={row.hours}
                          onChange={(e) => handleQuickCellChange(globalIdx, 'hours', e.target.value)}
                          className="w-full text-xs font-bold text-center px-0.5 py-0.5 rounded border border-blue-300 dark:border-blue-700 bg-white/90 dark:bg-slate-800"
                        />
                      ) : isEditingThis && editRowData ? (
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={editRowData.hours}
                          onChange={(e) => setEditRowData({ ...editRowData, hours: Number(e.target.value) || 1 })}
                          className="w-full text-xs font-bold text-center px-0.5 py-0.5 rounded border border-blue-500 bg-white dark:bg-slate-900"
                        />
                      ) : (
                        <span className="font-mono">{row.hours}h</span>
                      )}
                    </td>

                    {/* 5. FACULTY */}
                    <td className={`px-2 sm:px-2.5 font-semibold ${isDark ? "text-slate-200 border-slate-800" : "text-slate-800 border-blue-100/80"
                      } border-r truncate align-middle`} title={row.faculty}>
                      {isQuickEditMode ? (
                        <input
                          type="text"
                          value={row.faculty}
                          onChange={(e) => handleQuickCellChange(globalIdx, 'faculty', e.target.value)}
                          className="w-full text-xs font-semibold px-1.5 py-0.5 rounded border border-blue-300 dark:border-blue-700 bg-white/90 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                        />
                      ) : isEditingThis && editRowData ? (
                        <input
                          type="text"
                          value={editRowData.faculty}
                          onChange={(e) => setEditRowData({ ...editRowData, faculty: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(globalIdx);
                            if (e.key === 'Escape') handleCancelEdit();
                          }}
                          className="w-full text-xs font-semibold px-1.5 py-0.5 rounded border border-blue-500 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                        />
                      ) : (
                        <span className="truncate block">{row.faculty}</span>
                      )}
                    </td>

                    {/* 6. ACTIONS (Swap, Edit, Delete) */}
                    <td className="px-1 text-center align-middle whitespace-nowrap">
                      {isEditingThis ? (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleSaveEdit(globalIdx)}
                            className="p-1 sm:p-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                            title="Save Row"
                          >
                            <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="p-1 sm:p-1.5 rounded bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                            title="Cancel"
                          >
                            <X className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                          {/* Swap button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRowClickForSwap(globalIdx);
                            }}
                            className={`p-1 sm:p-1.5 rounded transition-all ${isSelectedForSwap
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'text-slate-400 hover:text-blue-600 hover:bg-blue-100 dark:hover:bg-slate-800'
                              }`}
                            title={isSelectedForSwap ? 'Click another row to swap' : 'Swap position'}
                          >
                            <ArrowUpDown className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          </button>

                          {/* Edit button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(globalIdx);
                            }}
                            className="p-1 sm:p-1.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800"
                            title="Edit Row (Type changes)"
                          >
                            <Edit2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          </button>

                          {/* Delete button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRow(globalIdx);
                            }}
                            className="p-1 sm:p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                            title="Delete Row"
                          >
                            <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className={`w-full h-full flex flex-col rounded-2xl overflow-hidden border ${isDark
        ? "border-blue-500/25 bg-[#0c1022]/85 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.6),0_0_12px_-2px_rgba(59,130,246,0.1),inset_0_1px_1px_0_rgba(255,255,255,0.05)]"
        : "border-blue-200/70 bg-white/80 shadow-[0_4px_20px_-4px_rgba(37,99,235,0.08),0_0_10px_-2px_rgba(37,99,235,0.06),inset_0_1px_1px_0_rgba(255,255,255,0.9)]"
      } backdrop-blur-2xl select-none`}>
      {/* Allocation Header */}
      <div className={`${isDark ? "bg-[#131d38] text-blue-100 border-b border-blue-500/25" : "bg-blue-600 text-white border-b border-blue-500/40"
        } px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between shrink-0 gap-2 shadow-sm`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-extrabold uppercase tracking-wider truncate ${isDark ? "text-blue-100" : "text-white"}`}>
            Subjects &amp; Faculty Allocation
          </span>
          <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md border ${isDark ? "bg-[#182852] border-blue-500/30 text-blue-200" : "bg-blue-700/50 border-blue-400/40 text-blue-100"
            }`}>
            {filteredItems.length} total subjects
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border flex items-center gap-1 ${classCounselor
              ? (isDark ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300" : "bg-emerald-100/90 border-emerald-300 text-emerald-800")
              : (isDark ? "bg-slate-800/60 border-slate-700 text-slate-400" : "bg-white/30 border-white/20 text-white/80")
            }`}>
            <span className="opacity-75">CC:</span>
            <span className="font-bold">{classCounselor || "Not Allocated"}</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Re-sort button */}
          <button
            onClick={handleReSort}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 transition-all ${isDark
                ? "bg-[#182852] hover:bg-[#203670] border-blue-500/30 text-blue-200"
                : "bg-blue-700 hover:bg-blue-800 border-blue-400/50 text-white"
              }`}
            title="Sort: Theory (Highest to Lowest Hrs) → Lab → Elective → Open Elective → Special"
          >
            <ArrowUpDown className="h-3 w-3" />
            <span className="hidden sm:inline">Sort (Theory 1st)</span>
          </button>

          {/* Quick Edit Mode button */}
          <button
            onClick={() => setIsQuickEditMode(!isQuickEditMode)}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 transition-all ${isQuickEditMode
                ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-400 shadow-sm animate-pulse"
                : isDark
                  ? "bg-[#182852] hover:bg-[#203670] border-blue-500/30 text-blue-200"
                  : "bg-blue-700 hover:bg-blue-800 border-blue-400/50 text-white"
              }`}
            title={isQuickEditMode ? "Done typing and editing" : "Directly type and edit any cell in the table"}
          >
            {isQuickEditMode ? <Check className="h-3 w-3" /> : <Edit2 className="h-3 w-3" />}
            <span>{isQuickEditMode ? "Done Editing" : "Type & Edit"}</span>
          </button>

          {/* Add Subject button */}
          <button
            onClick={() => setIsAddingRow(!isAddingRow)}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 transition-all ${isAddingRow
                ? "bg-amber-600 text-white border-amber-400"
                : isDark
                  ? "bg-[#182852] hover:bg-[#203670] border-blue-500/30 text-blue-200"
                  : "bg-blue-700 hover:bg-blue-800 border-blue-400/50 text-white"
              }`}
            title="Add a subject"
          >
            <Plus className="h-3 w-3" />
            <span className="hidden md:inline">Add</span>
          </button>

          {/* Search Box */}
          <div className="relative w-28 sm:w-36">
            <Search className={`absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 ${isDark ? "text-blue-300/70" : "text-blue-200"}`} />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className={`h-6.5 pl-6 text-[11px] rounded-lg ${isDark
                  ? "bg-[#0b1224]/80 border-blue-500/30 text-blue-100 placeholder:text-blue-300/50 focus:bg-[#0e172e] focus:border-blue-400/60"
                  : "bg-white/20 border-blue-400/40 text-white placeholder:text-blue-200/80 focus:bg-white/30 focus:border-white/60"
                }`}
            />
          </div>

          {/* Mobile view format toggle (Table vs Cards) */}
          <div className={`flex items-center gap-0.5 ${isDark ? "bg-[#0b1224]/80 border-blue-500/30" : "bg-blue-700/50 border-blue-400/40"
            } p-0.5 rounded-lg border lg:hidden`}>
            <button
              onClick={() => setViewType('table')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${viewType === 'table'
                  ? isDark ? 'bg-[#1d2f60] text-blue-100 shadow-sm' : 'bg-white text-blue-900 shadow-sm'
                  : isDark ? 'text-blue-300/70 hover:text-white' : 'text-blue-200 hover:text-white'
                }`}
              title="Table View"
            >
              Table
            </button>
            <button
              onClick={() => setViewType('cards')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${viewType === 'cards'
                  ? isDark ? 'bg-[#1d2f60] text-blue-100 shadow-sm' : 'bg-white text-blue-900 shadow-sm'
                  : isDark ? 'text-blue-300/70 hover:text-white' : 'text-blue-200 hover:text-white'
                }`}
              title="Card View (Best for mobile)"
            >
              Cards
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Swapping Status Banner */}
      {swapSourceIndex !== null && tableRows[swapSourceIndex] && (
        <div className="px-3 py-1.5 bg-blue-600 text-white flex items-center justify-between text-xs font-semibold shrink-0 animate-in fade-in shadow-inner">
          <div className="flex items-center gap-2 truncate">
            <ArrowLeftRight className="h-3.5 w-3.5 animate-pulse shrink-0" />
            <span className="truncate">
              Selected: <strong className="underline underline-offset-2">{tableRows[swapSourceIndex].title}</strong> — Click any other row or its swap button to swap positions
            </span>
          </div>
          <button
            onClick={() => setSwapSourceIndex(null)}
            className="px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-white text-[11px] font-bold transition-all ml-2 shrink-0"
          >
            Cancel Swap
          </button>
        </div>
      )}

      {/* Inline Add Subject Form */}
      {isAddingRow && (
        <div className={`p-2.5 border-b flex flex-wrap items-center gap-2 text-xs shrink-0 ${isDark ? "bg-[#10172e] border-blue-500/20" : "bg-blue-50/80 border-blue-200"
          }`}>
          <span className="font-extrabold uppercase text-[10px] text-blue-600 dark:text-blue-400">Add Subject:</span>
          <input
            type="text"
            placeholder="Code (e.g. U23IT501)"
            value={newRowData.code}
            onChange={(e) => setNewRowData({ ...newRowData, code: e.target.value })}
            className="w-24 px-2 py-1 rounded border text-xs font-mono font-bold bg-white dark:bg-slate-900"
          />
          <input
            type="text"
            placeholder="Course Title"
            value={newRowData.title}
            onChange={(e) => setNewRowData({ ...newRowData, title: e.target.value })}
            className="flex-1 min-w-[150px] px-2 py-1 rounded border text-xs font-bold bg-white dark:bg-slate-900"
          />
          <select
            value={newRowData.category}
            onChange={(e) => setNewRowData({ ...newRowData, category: e.target.value })}
            className="px-2 py-1 rounded border text-xs font-medium bg-white dark:bg-slate-900"
          >
            <option value="Theory">Theory</option>
            <option value="Lab">Lab</option>
            <option value="Elective">Elective</option>
            <option value="Open Elective">Open Elective</option>
            <option value="Special">Special</option>
          </select>
          <input
            type="number"
            min={1}
            max={20}
            placeholder="Hrs"
            value={newRowData.hours}
            onChange={(e) => setNewRowData({ ...newRowData, hours: Number(e.target.value) || 1 })}
            className="w-14 px-1 py-1 rounded border text-xs font-bold text-center bg-white dark:bg-slate-900"
          />
          <input
            type="text"
            placeholder="Faculty In-Charge"
            value={newRowData.faculty}
            onChange={(e) => setNewRowData({ ...newRowData, faculty: e.target.value })}
            className="w-36 px-2 py-1 rounded border text-xs bg-white dark:bg-slate-900"
          />
          <Button size="sm" onClick={handleAddRow} className="h-7 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs">
            <Plus className="h-3 w-3 mr-1" /> Add to Table
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setIsAddingRow(false)} className="h-7 px-2 text-xs">
            Cancel
          </Button>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 min-h-0 w-full overflow-hidden p-1 flex flex-col">
        {viewType === 'cards' ? (
          renderCardsView()
        ) : filteredItems.length === 0 ? (
          <div className={`w-full h-full flex items-center justify-center text-xs italic ${isDark ? "text-blue-400" : "text-blue-500"}`}>
            No courses match current filter.
          </div>
        ) : (
          <div className={`w-full h-full overflow-hidden grid grid-cols-1 ${rightItems.length > 0 ? 'lg:grid-cols-2' : ''} gap-1.5`}>
            {renderSplitTable(leftItems)}
            {rightItems.length > 0 && renderSplitTable(rightItems)}
          </div>
        )}
      </div>
    </div>
  );
}

interface SubjectRowWithFaculty {
  id: string;
  name: string;
  code?: string;
  type: string;
  hoursPerWeek: number;
  facultyBySection: Record<string, string>; // section -> facultyName
  abbreviation?: string;
}

interface GeneratedTimetableResult extends YearSectionResult {
  departmentName: string;
}

function calculateTotalHours(rawSubjects: any[]): number {
  const traditionalTheory = rawSubjects.filter(s => s.type === 'theory').reduce((a, b) => a + (b.hoursPerWeek || b.hours_per_week || 0), 0);
  const labHours = rawSubjects.filter(s => s.type === 'lab').reduce((a, b) => a + (b.hoursPerWeek || b.hours_per_week || 0), 0);
  const specialHours = rawSubjects.filter(s => s.type === 'special').reduce((a, b) => a + (b.hoursPerWeek || b.hours_per_week || 0), 0);

  const pes = rawSubjects.filter(s => s.type === 'elective');
  let electiveHours = 0;
  if (pes.length > 0) {
    const peGroups = new Map<string, number>();
    let untaggedSum = 0;
    pes.forEach(s => {
      const groupTag = (s.tags || []).find((t: string) => /pe_group_\d+/i.test(t) || /^pe\d+/i.test(t) || /^(pe\s*\d+|elective\s*\d+|professional\s*elective\s*\d+|pe_group_\d+)$/i.test(t.trim()));
      if (groupTag) {
        const key = groupTag.trim().toUpperCase();
        peGroups.set(key, Math.max(peGroups.get(key) || 0, s.hoursPerWeek || s.hours_per_week || 0));
      } else {
        untaggedSum += s.hoursPerWeek || s.hours_per_week || 0;
      }
    });
    electiveHours = Array.from(peGroups.values()).reduce((a, b) => a + b, 0) + untaggedSum;
  }

  const oes = rawSubjects.filter(s => s.type === 'open elective');
  let openElectiveHours = 0;
  if (oes.length > 0) {
    const oeGroups = new Map<string, number>();
    let untaggedMax = 0;
    oes.forEach(s => {
      const groupTag = (s.tags || []).find((t: string) => /oe_group_\d+/i.test(t) || /^oe\d+/i.test(t));
      if (groupTag) {
        const key = groupTag.trim().toUpperCase();
        oeGroups.set(key, Math.max(oeGroups.get(key) || 0, s.hoursPerWeek || s.hours_per_week || 0));
      } else {
        untaggedMax = Math.max(untaggedMax, s.hoursPerWeek || s.hours_per_week || 0);
      }
    });
    const groupedTotal = Array.from(oeGroups.values()).reduce((a, b) => a + b, 0);
    openElectiveHours = groupedTotal + (oeGroups.size === 0 ? (untaggedMax || 5) : 0);
  }

  return traditionalTheory + labHours + specialHours + electiveHours + openElectiveHours;
}

export default function GenerateReviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark } = useDarkMode();

  const stateData = location.state as {
    selections?: { departmentName: string; selectedYears: WizardSelection[] }[];
    semesterType?: 'odd' | 'even';
    loadPublished?: boolean;
    departmentId?: string;
    departmentName?: string;
    year?: string;
    section?: string;
  } | null;

  const storeSemesterType = useTimetableStore((s) => s.semesterType);
  const semesterType: 'odd' | 'even' = stateData?.semesterType || storeSemesterType || 'odd';

  const rawSelections = useMemo(() => {
    if (stateData?.loadPublished && stateData.departmentName && stateData.year && stateData.section) {
      return [{
        departmentName: stateData.departmentName,
        selectedYears: [{
          year: stateData.year,
          sections: [stateData.section]
        }]
      }];
    }
    return stateData?.selections || [];
  }, [stateData]);
  const selections = useMemo(() => {
    return rawSelections;
  }, [rawSelections]);

  const [activeDept, setActiveDept] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("");
  const [deptIds, setDeptIds] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Per-department + year data store
  const [subjectsData, setSubjectsData] = useState<Record<string, SubjectRowWithFaculty[]>>({});
  const [specialHoursData, setSpecialHoursData] = useState<Record<string, any[]>>({});
  const [totalHoursBySection, setTotalHoursBySection] = useState<Record<string, Record<string, number>>>({});
  const [sectionSubjectsData, setSectionSubjectsData] = useState<Record<string, Record<string, Set<string>>>>({});
  const [customAllocations, setCustomAllocations] = useState<Record<string, AllocationRow[]>>({});
  const [classCounselorsMap, setClassCounselorsMap] = useState<Record<string, string>>({});
  const [departmentFaculty, setDepartmentFaculty] = useState<Record<string, { id: string; name: string }[]>>({});

  // Generation progress state
  type ProgressStatus = 'idle' | 'running' | 'ok' | 'error';
  type ProgressItem = { departmentName: string; year: string; section: string; status: ProgressStatus; error?: string };
  const [generating, setGenerating] = useState(false);
  const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);
  const [showProgress, setShowProgress] = useState(false);

  const cacheKey = useMemo(() => {
    if (!selections || selections.length === 0) return '';
    return `sona_ttg_gen_${semesterType}_${selections.map(s => `${s.departmentName}_${s.selectedYears.map(y => `${y.year}_${(y.sections || []).join('')}`).join('_')}`).join('__')}`;
  }, [selections, semesterType]);

  const [generatedResults, setGeneratedResults] = useState<GeneratedTimetableResult[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const selKey = `sona_ttg_gen_${semesterType}_${(rawSelections || []).map(s => `${s.departmentName}_${s.selectedYears.map(y => `${y.year}_${(y.sections || []).join('')}`).join('_')}`).join('__')}`;
      const stored = sessionStorage.getItem(selKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      // ignore
    }
    return [];
  });
  const [facultyBeforeAfternoon, setFacultyBeforeAfternoon] = useState(false);
  const [specialHoursDialogOpen, setSpecialHoursDialogOpen] = useState(false);

  // Embed View states
  const [viewTab, setViewTab] = useState<'review' | 'timetable'>('review');
  const [activeSection, setActiveSection] = useState<string>('A');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'list'>('table');
  const [publishing, setPublishing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reviewTypeFilter, setReviewTypeFilter] = useState<'all' | 'theory-elective' | 'lab' | 'open-elective' | 'special'>('all');

  const [showFacultyInGrid, setShowFacultyInGrid] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [fullScreenPage, setFullScreenPage] = useState<'timetable' | 'allocation'>('timetable');
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictData, setConflictData] = useState<{
    conflicts: FacultyConflict[];
    source: { day: number; period: number; subject: string };
    target: { day: number; period: number; subject: string };
  } | null>(null);

  // PDF Export Modal and revision states
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfScope, setPdfScope] = useState<'current' | 'year' | 'all'>('current');
  const [wefDate, setWefDate] = useState('29.06.2026');
  const [revision, setRevision] = useState('00');
  const [pdfIncharge, setPdfIncharge] = useState('Mr. P.Dineshkumar');
  const [pdfCounselor, setPdfCounselor] = useState('');
  const [pdfHod, setPdfHod] = useState('Dr.J.Akilandeswari');
  const [pdfPrincipal, setPdfPrincipal] = useState('Dr.S.R.R.Senthil Kumar');
  const [hasUserEdits, setHasUserEdits] = useState(false);

  // Touch and wheel swipe refs for full screen mode
  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const wheelLockRef = useRef<boolean>(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null || touchStartX.current === null) return;
    const deltaY = touchStartY.current - e.changedTouches[0].clientY;
    const deltaX = Math.abs(touchStartX.current - e.changedTouches[0].clientX);
    touchStartY.current = null;
    touchStartX.current = null;

    if (Math.abs(deltaY) > 40 && Math.abs(deltaY) > deltaX) {
      if (deltaY > 0 && fullScreenPage === 'timetable') {
        setFullScreenPage('allocation');
      } else if (deltaY < 0 && fullScreenPage === 'allocation') {
        setFullScreenPage('timetable');
      }
    }
  };

  const handleWheelSlide = (e: React.WheelEvent) => {
    if (wheelLockRef.current) return;
    if (e.deltaY > 30 && fullScreenPage === 'timetable') {
      wheelLockRef.current = true;
      setFullScreenPage('allocation');
      setTimeout(() => { wheelLockRef.current = false; }, 400);
    } else if (e.deltaY < -30 && fullScreenPage === 'allocation') {
      wheelLockRef.current = true;
      setFullScreenPage('timetable');
      setTimeout(() => { wheelLockRef.current = false; }, 400);
    }
  };

  // Escape key and ArrowUp / ArrowDown handler for Full Screen View
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      } else if (isFullScreen) {
        if (e.key === 'ArrowDown' || e.key === 'PageDown') {
          setFullScreenPage('allocation');
        } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
          setFullScreenPage('timetable');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen, fullScreenPage]);

  useEffect(() => {
    if (isFullScreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFullScreen]);

  const handleSwapSlots = async (
    source: { day: number; period: number },
    target: { day: number; period: number }
  ) => {
    if (source.day === target.day && source.period === target.period) return;

    const activeResult = generatedResults.find(
      (r) => r.departmentName === activeDept && r.year === activeTab && r.section === activeSection
    );
    if (!activeResult || !Array.isArray(activeResult.grid)) return;

    const subjectA = activeResult.grid[source.day]?.[source.period] || '';
    const subjectB = activeResult.grid[target.day]?.[target.period] || '';

    // Background faculty availability check across all generated timetables and all database timetables
    const checkResult = await checkSwapFacultyConflict(
      source,
      target,
      { departmentName: activeDept, year: activeTab, section: activeSection },
      generatedResults,
      subjectsData,
      specialHoursData,
      classCounselorsMap
    );

    if (checkResult.hasConflict) {
      setConflictData({
        conflicts: checkResult.conflicts,
        source: { ...source, subject: subjectA },
        target: { ...target, subject: subjectB },
      });
      setConflictModalOpen(true);
      toast.error(`Faculty Schedule Conflict Detected!`, {
        description: checkResult.conflicts[0].reason,
        duration: 6000,
      });
      return;
    }

    // No conflict -> execute swap cleanly
    setHasUserEdits(true);
    setGeneratedResults((prev) =>
      prev.map((r) => {
        if (r.departmentName === activeDept && r.year === activeTab && r.section === activeSection) {
          const newGrid = r.grid.map((row) => [...row]);
          const temp = newGrid[source.day][source.period];
          newGrid[source.day][source.period] = newGrid[target.day][target.period];
          newGrid[target.day][target.period] = temp;
          return { ...r, grid: newGrid };
        }
        return r;
      })
    );

    const sourceLabel = `${DAYS[source.day]} Period ${source.period + 1}`;
    const targetLabel = `${DAYS[target.day]} Period ${target.period + 1}`;
    toast.success(`Period hours changed successfully!`, {
      description: `${sourceLabel} (${subjectA || 'Free'}) ↔ ${targetLabel} (${subjectB || 'Free'})`,
    });
  };

  const handleForceSwap = () => {
    if (!conflictData) return;
    const { source, target } = conflictData;

    setHasUserEdits(true);
    setGeneratedResults((prev) =>
      prev.map((r) => {
        if (r.departmentName === activeDept && r.year === activeTab && r.section === activeSection) {
          const newGrid = r.grid.map((row) => [...row]);
          const temp = newGrid[source.day][source.period];
          newGrid[source.day][source.period] = newGrid[target.day][target.period];
          newGrid[target.day][target.period] = temp;
          return { ...r, grid: newGrid };
        }
        return r;
      })
    );

    const sourceLabel = `${DAYS[source.day]} Period ${source.period + 1}`;
    const targetLabel = `${DAYS[target.day]} Period ${target.period + 1}`;
    toast.warning(`Hours swapped with manual override!`, {
      description: `Admin forced swap: ${sourceLabel} ↔ ${targetLabel}`,
    });
    setConflictModalOpen(false);
    setConflictData(null);
  };

  const allocationRows = useMemo(() => {
    const currentKey = `${activeDept}_${activeTab}`;
    const subjects = subjectsData[currentKey] || [];
    const specialList = specialHoursData[currentKey] || [];
    const sectionKey = `${activeDept}_${activeTab}`;
    const mappedSet = sectionSubjectsData[sectionKey]?.[activeSection];

    const rows: {
      code: string;
      title: string;
      category: string;
      hours: number;
      faculty: string;
    }[] = [];

    // Helper to clean course title of faculty suffixes like (Ms. J. Deepika)
    const cleanCourseTitle = (raw: string): string => {
      if (!raw) return '';
      let cleaned = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
      // Normalize counselling variations so Student Counselling and Counselling merge
      if (/^student\s*counselling$/i.test(cleaned) || /^counseling$/i.test(cleaned)) {
        cleaned = 'Counselling';
      }
      return cleaned || raw;
    };

    // Helper to extract faculty name from parentheses if present, e.g. "Seminar (Ms. J. Deepika)" -> "Ms. J. Deepika"
    const extractFacultyFromTitle = (raw: string): string | null => {
      if (!raw) return null;
      const match = raw.match(/\(([^)]+)\)/);
      return match && match[1] ? match[1].trim() : null;
    };

    // Add curriculum subjects
    subjects.forEach((sub) => {
      const isMapped = !mappedSet || mappedSet.size === 0 || mappedSet.has(sub.id);
      if (!isMapped) return;

      const fac = sub.facultyBySection[activeSection] || extractFacultyFromTitle(sub.name) || '—';
      const cat = sub.type ? (sub.type.charAt(0).toUpperCase() + sub.type.slice(1)) : 'Theory';

      rows.push({
        code: sub.code || '—',
        title: cleanCourseTitle(sub.name),
        category: cat,
        hours: sub.hoursPerWeek,
        faculty: fac,
        abbreviation: sub.abbreviation,
      });
    });

    // Add active special hours (e.g. Library, Seminar, Counselling)
    const currentSecKey = `${activeDept}_${activeTab}_${activeSection}`;
    const assignedCC = classCounselorsMap[currentSecKey] || '';

    specialList
      .filter((sp: any) => sp.is_active && (sp.total_hours || 0) > 0)
      .forEach((sp: any) => {
        const cTitle = cleanCourseTitle(sp.special_type);
        const isCounsel = /counsel|student counselling|counselling|mentor/i.test(cTitle);
        const exists = rows.some((r) => cleanCourseTitle(r.title).toLowerCase() === cTitle.toLowerCase());
        if (!exists) {
          rows.push({
            code: isCounsel ? 'SC' : '—',
            title: cTitle,
            category: 'Special',
            hours: sp.total_hours,
            faculty: (isCounsel && assignedCC) ? assignedCC : (sp.faculty_name || extractFacultyFromTitle(sp.special_type) || '—'),
          });
        }
      });

    // Also guarantee any subject present in current timetable grid is included
    const activeRes = generatedResults.find(
      (r) => r.departmentName === activeDept && r.year === activeTab && r.section === activeSection
    );
    if (activeRes?.grid && Array.isArray(activeRes.grid)) {
      const gridSubjectCounts = new Map<string, number>();
      activeRes.grid.forEach((row) => {
        if (Array.isArray(row)) {
          row.forEach((cell) => {
            if (cell && typeof cell === 'string' && cell.trim() && cell !== '  BREAK  ' && cell !== 'LUNCH') {
              const name = cell.trim();
              gridSubjectCounts.set(name, (gridSubjectCounts.get(name) || 0) + 1);
            }
          });
        }
      });

      gridSubjectCounts.forEach((count, subName) => {
        const cTitle = cleanCourseTitle(subName);
        const facultyFromTitle = extractFacultyFromTitle(subName);

        // Skip slash-separated composite slots (e.g. "Open Elective A / Open Elective B") if parts already exist in table
        if (cTitle.includes(' / ')) {
          const parts = cTitle.split(' / ').map(p => cleanCourseTitle(p.trim()));
          const allPartsExist = parts.every(part =>
            rows.some(r => cleanCourseTitle(r.title).toLowerCase() === part.toLowerCase())
          );
          if (allPartsExist) return;
        }

        const found = rows.find(
          (r) =>
            cleanCourseTitle(r.title).toLowerCase() === cTitle.toLowerCase() ||
            cleanCourseTitle(r.title).toLowerCase() === subName.toLowerCase() ||
            (r.code && r.code !== '—' && (r.code.toLowerCase() === subName.toLowerCase() || r.code.toLowerCase() === cTitle.toLowerCase()))
        );

        if (found) {
          // Keep title clean of faculty names
          found.title = cTitle;
          // If faculty is missing or empty, fill from title or lookup
          if (!found.faculty || found.faculty === '—') {
            if (facultyFromTitle) {
              found.faculty = facultyFromTitle;
            } else {
              const faculties = getFacultyForSubject(
                subName,
                activeDept,
                activeTab,
                activeSection,
                subjectsData,
                specialHoursData
              );
              if (faculties.length > 0) found.faculty = faculties.join(' / ');
            }
          }
        } else {
          let fac = facultyFromTitle;
          if (!fac) {
            const faculties = getFacultyForSubject(
              subName,
              activeDept,
              activeTab,
              activeSection,
              subjectsData,
              specialHoursData
            );
            fac = faculties.length > 0 ? faculties.join(' / ') : '—';
          }

          const isLab = cTitle.toLowerCase().includes('lab');
          const isOpenElective = cTitle.toLowerCase().includes('open elective');
          const isElective = !isOpenElective && cTitle.toLowerCase().includes('elective');
          const isSpecial = ['library', 'seminar', 'counselling', 'counseling', 'mentor', 'project'].some((k) =>
            cTitle.toLowerCase().includes(k)
          );

          rows.push({
            code: '—',
            title: cTitle,
            category: isSpecial ? 'Special' : isOpenElective ? 'Open Elective' : isLab ? 'Lab' : isElective ? 'Elective' : 'Theory',
            hours: count,
            faculty: fac,
          });
        }
      });
    }

    // Deduplicate any rows that ended up with identical cleaned title (e.g. Student Counselling & Counselling)
    const dedupedRows: typeof rows = [];
    rows.forEach((r) => {
      const existing = dedupedRows.find(
        (d) => cleanCourseTitle(d.title).toLowerCase() === cleanCourseTitle(r.title).toLowerCase()
      );
      if (existing) {
        if ((!existing.code || existing.code === '—') && r.code && r.code !== '—') {
          existing.code = r.code;
        }
        if ((!existing.faculty || existing.faculty === '—') && r.faculty && r.faculty !== '—') {
          existing.faculty = r.faculty;
        }
        existing.hours = Math.max(existing.hours || 0, r.hours || 0);
      } else {
        dedupedRows.push(r);
      }
    });

    // Final safety pass to ensure ALL rows have strictly cleaned course title and preserved faculty
    dedupedRows.forEach((r) => {
      const extractedFac = extractFacultyFromTitle(r.title);
      if (extractedFac && (!r.faculty || r.faculty === '—')) {
        r.faculty = extractedFac;
      }
      if (/counsel|student counselling|counselling|mentor/i.test(r.title) && assignedCC && (!r.faculty || r.faculty === '—')) {
        r.faculty = assignedCC;
      }
      r.title = cleanCourseTitle(r.title);
    });

    return sortAllocationRows(dedupedRows);
  }, [subjectsData, specialHoursData, sectionSubjectsData, activeDept, activeTab, activeSection, generatedResults, classCounselorsMap]);

  const getFacultyNamesForCell = (cell: string) => {
    if (!cell) return [];
    const rawClean = cleanCellTitle(cell);

    // 1. Look up from customAllocations or allocationRows
    const secKey = `${activeDept}_${activeTab}_${activeSection}`;
    const curRows = customAllocations[secKey] || allocationRows;
    const matchedRow = curRows.find(
      (r) =>
        r.title.toLowerCase() === rawClean.toLowerCase() ||
        r.title.toLowerCase() === cell.toLowerCase() ||
        (r.code && r.code !== '—' && r.code.toLowerCase() === rawClean.toLowerCase())
    );
    if (matchedRow && matchedRow.faculty && matchedRow.faculty !== '—') {
      return [matchedRow.faculty];
    }

    if (/counsel|student counselling|counselling|mentor/i.test(rawClean)) {
      const cc = classCounselorsMap[secKey];
      if (cc) return [cc];
    }

    // 2. Extract inline if present, e.g. "Seminar (Mr. D. Jayaprakash)"
    const inlineMatch = cell.match(/\(([^)]+)\)/);
    if (inlineMatch && inlineMatch[1]) {
      return [inlineMatch[1].trim()];
    }

    // 3. Fallback to conflict service lookup
    return getFacultyForSubject(
      rawClean,
      activeDept,
      activeTab,
      activeSection,
      subjectsData,
      specialHoursData,
      classCounselorsMap
    );
  };

  useEffect(() => {
    if (selections.length === 0) {
      toast.error("No generation parameters specified. Please start from the dashboard.");
      navigate("/admin");
      return;
    }
    const firstDept = selections[0];
    setActiveDept(firstDept.departmentName);
    if (firstDept.selectedYears.length > 0) {
      setActiveTab(firstDept.selectedYears[0].year);
    }
    loadAllData();
  }, [location.state]);

  // When loadPublished is requested, fetch the saved timetable from DB and open full-screen view
  useEffect(() => {
    if (!stateData?.loadPublished || !stateData.year || !stateData.section) return;

    let isMounted = true;
    const fetchPublishedTimetable = async () => {
      setLoading(true);
      try {
        let deptId = stateData.departmentId;
        let deptName = stateData.departmentName;

        if (!deptId && deptName) {
          const d = await getDepartmentByName(deptName);
          deptId = d?.id;
        } else if (deptId && !deptName) {
          const { data: d } = await (supabase as any)
            .from('departments')
            .select('name')
            .eq('id', deptId)
            .single();
          deptName = d?.name;
        }

        if (!deptId || !deptName) {
          toast.error("Could not resolve department for published timetable.");
          setLoading(false);
          return;
        }

        const { data: ttData, error } = await (supabase as any)
          .from('timetables')
          .select('grid_data, special_flags, updated_at')
          .eq('department_id', deptId)
          .eq('year', stateData.year)
          .eq('section', stateData.section)
          .maybeSingle();

        if (error) throw error;

        if (ttData && ttData.grid_data && isMounted) {
          autoGeneratedRef.current = true;
          setGeneratedResults([
            {
              departmentName: deptName,
              year: stateData.year!,
              section: stateData.section!,
              grid: ttData.grid_data,
              status: 'ok',
            }
          ]);
          setActiveDept(deptName);
          setActiveTab(stateData.year!);
          setActiveSection(stateData.section!);
          setViewTab('timetable');
          setIsFullScreen(true);
          setFullScreenPage('timetable');

          // Fetch class counselor for this published class from DB
          try {
            const { data: rpcData } = await supabase.rpc('get_class_counselor_info', {
              dept_id: deptId,
              year_param: stateData.year!,
              section_param: stateData.section!
            });
            const ccKey = `${deptName}_${stateData.year}_${stateData.section}`;
            if (rpcData && rpcData.length > 0 && rpcData[0].faculty_name) {
              setClassCounselorsMap((prev) => ({ ...prev, [ccKey]: rpcData[0].faculty_name }));
              setPdfCounselor(rpcData[0].faculty_name);
            } else {
              setClassCounselorsMap((prev) => ({ ...prev, [ccKey]: '' }));
              setPdfCounselor('');
            }
          } catch (e) {
            console.warn("Could not fetch published class counselor:", e);
          }

          const snapKey = `ttg_snap_${deptId}_${stateData.year}_${stateData.section}`;
          if (!localStorage.getItem(snapKey)) {
            localStorage.setItem(snapKey, JSON.stringify(ttData.grid_data));
          }
        } else if (isMounted) {
          toast.warning("No existing timetable grid data found for this class.");
        }
      } catch (err: any) {
        console.error("Error loading published timetable:", err);
        toast.error("Failed to load published timetable.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPublishedTimetable();
    return () => { isMounted = false; };
  }, [stateData]);

  // Aligns default active department, year, and section when generatedResults changes & auto-launches full screen
  useEffect(() => {
    if (generatedResults.length > 0) {
      const okResults = generatedResults.filter(r => r.status === 'ok');
      const pool = okResults.length > 0 ? okResults : generatedResults;

      const hasDept = pool.some(r => r.departmentName === activeDept);
      const targetDept = hasDept ? activeDept : pool[0].departmentName;
      if (targetDept !== activeDept) setActiveDept(targetDept);

      const deptResults = pool.filter(r => r.departmentName === targetDept);
      const hasYear = deptResults.some(r => r.year === activeTab);
      const targetYear = hasYear ? activeTab : (deptResults[0]?.year || activeTab);
      if (targetYear !== activeTab) setActiveTab(targetYear);

      const yearResults = deptResults.filter(r => r.year === targetYear);
      if (yearResults.length > 0) {
        const sections = yearResults.map(r => r.section);
        if (!sections.includes(activeSection)) {
          setActiveSection(sections[0]);
        }
      }

      // Automatically go to full screen preview as soon as timetables are ready
      if (!isFullScreen && okResults.length > 0) {
        setIsFullScreen(true);
        setFullScreenPage('timetable');
      }
    }
  }, [generatedResults, activeDept, activeTab]);

  // Recalculate section total hours dynamically when subjects or section-assignments change
  useEffect(() => {
    const updatedSecHoursMap: Record<string, Record<string, number>> = {};

    selections.forEach((deptSel) => {
      deptSel.selectedYears.forEach(({ year, sections }) => {
        const key = `${deptSel.departmentName}_${year}`;
        if (year === 'IV' && semesterType === 'even') {
          const sectionHours: Record<string, number> = {};
          sections.forEach((sec) => {
            sectionHours[sec] = 42;
          });
          updatedSecHoursMap[key] = sectionHours;
          return;
        }
        const subjects = subjectsData[key] || [];
        const sectionToSubjectIds = sectionSubjectsData[key] || {};
        // Sum total_hours from all active special hours configs for this year
        const specialConfigHours = (specialHoursData[key] || [])
          .filter((h: any) => h.is_active)
          .reduce((sum: number, h: any) => sum + (h.total_hours || 0), 0);

        const sectionHours: Record<string, number> = {};
        sections.forEach((sec) => {
          const mappedIds = sectionToSubjectIds[sec] || new Set();
          const sectionSpecificSubjects = mappedIds.size > 0
            ? subjects.filter((s) => mappedIds.has(s.id))
            : subjects;
          // Add special_hours_config totals — these are real occupied timetable periods
          // (e.g. Counselling=2h, Library=1h, Seminar=2h) that count toward the 42h limit.
          sectionHours[sec] = calculateTotalHours(sectionSpecificSubjects) + specialConfigHours;
        });

        updatedSecHoursMap[key] = sectionHours;
      });
    });

    if (JSON.stringify(updatedSecHoursMap) !== JSON.stringify(totalHoursBySection)) {
      setTotalHoursBySection(updatedSecHoursMap);
    }
  }, [subjectsData, sectionSubjectsData, specialHoursData, selections]);

  const loadAllData = async () => {
    setLoading(true);
    // Pre-load global cross-timetable conflict dataset in background
    loadGlobalConflictData(true).catch(console.warn);
    try {
      const deptIdsMap: Record<string, string> = {};
      const subjectsMap: Record<string, SubjectRowWithFaculty[]> = {};
      const specialHoursMap: Record<string, any[]> = {};
      const secHoursMap: Record<string, Record<string, number>> = {};
      const secSubjectsMap: Record<string, Record<string, Set<string>>> = {};
      const counselorsMap: Record<string, string> = {};
      const deptFacultyMap: Record<string, { id: string; name: string }[]> = {};

      for (const deptSel of selections) {
        const dept = await getDepartmentByName(deptSel.departmentName);
        if (!dept) {
          toast.error(`Department ${deptSel.departmentName} not found`);
          continue;
        }
        deptIdsMap[deptSel.departmentName] = dept.id;

        // Fetch department faculty list
        const facList = await getFacultyByDepartment(dept.id).catch(() => []);
        deptFacultyMap[deptSel.departmentName] = facList.map(f => ({ id: f.id, name: f.name }));

        // Fetch active class counselors from database for this department
        try {
          const { data: ccData, error: ccErr } = await (supabase as any)
            .from('class_counselors')
            .select('year, section, faculty_id')
            .eq('department_id', dept.id)
            .eq('is_active', true);

          if (!ccErr && ccData && Array.isArray(ccData)) {
            ccData.forEach((cc: any) => {
              const fac = facList.find(f => f.id === cc.faculty_id);
              if (fac) {
                counselorsMap[`${deptSel.departmentName}_${cc.year}_${cc.section}`] = fac.name;
              }
            });
          }
        } catch (e) {
          console.warn("Could not query class_counselors:", e);
        }

        await Promise.all(
          deptSel.selectedYears.map(async ({ year, sections }) => {
            const key = `${deptSel.departmentName}_${year}`;

            // Check if any section lacks counselor in counselorsMap, try RPC fallback
            await Promise.all(
              sections.map(async (sec) => {
                const secKey = `${deptSel.departmentName}_${year}_${sec}`;
                if (!counselorsMap[secKey]) {
                  try {
                    const { data: rpcData } = await supabase.rpc('get_class_counselor_info', {
                      dept_id: dept.id,
                      year_param: year,
                      section_param: sec
                    });
                    if (rpcData && rpcData.length > 0 && rpcData[0].faculty_name) {
                      counselorsMap[secKey] = rpcData[0].faculty_name;
                    }
                  } catch (_) {}
                }
              })
            );

            let subjects = await getSubjectsForYear(dept.id, year, semesterType).catch(() => []);
            let specialHours = await getSpecialHoursConfigsForYear(dept.id, year).catch(() => []);
            const facultyMap = await getSubjectFacultyMapAllSections(dept.id, year, sections).catch(() => ({}));

            if (year === 'IV' && semesterType === 'even') {
              if (subjects.length === 0) {
                subjects = [{
                  id: `static_proj_${dept.id}`,
                  name: 'Project',
                  code: 'PROJ',
                  type: 'theory',
                  hoursPerWeek: 37,
                  credits: 10,
                  abbreviation: 'PROJECT',
                  tags: ['even_sem']
                } as any];
              }
              if (specialHours.length === 0) {
                specialHours = [
                  { special_type: 'Seminar', total_hours: 2, saturday_hours: 2, is_active: true },
                  { special_type: 'Library', total_hours: 1, saturday_hours: 1, is_active: true },
                  { special_type: 'Counselling', total_hours: 2, saturday_hours: 2, is_active: true },
                ];
              }
            }

            const sectionToSubjectIds: Record<string, Set<string>> = {};
            await Promise.all(
              sections.map(async (sec) => {
                const subIds = await getSectionSubjects(dept.id, year, sec).catch(() => []);
                sectionToSubjectIds[sec] = new Set(subIds);
              })
            );
            secSubjectsMap[key] = sectionToSubjectIds;

            // Sum total_hours from all active special hours configs for this year
            const specialConfigHoursTotal = specialHours
              .filter((h: any) => h.is_active)
              .reduce((sum: number, h: any) => sum + (h.total_hours || 0), 0);

            const sectionHours: Record<string, number> = {};
            sections.forEach((sec) => {
              if (year === 'IV' && semesterType === 'even') {
                sectionHours[sec] = 42;
              } else {
                const mappedIds = sectionToSubjectIds[sec] || new Set();
                const sectionSpecificSubjects = mappedIds.size > 0
                  ? subjects.filter((s) => mappedIds.has(s.id))
                  : subjects;
                // Add special_hours_config totals — these are real occupied timetable periods
                // (e.g. Counselling=2h, Library=1h, Seminar=2h) that count toward the 42h limit.
                sectionHours[sec] = calculateTotalHours(sectionSpecificSubjects) + specialConfigHoursTotal;
              }
            });
            secHoursMap[key] = sectionHours;

            const rows: SubjectRowWithFaculty[] = subjects.map((sub) => {
              const facultyBySection: Record<string, string> = {};
              sections.forEach((sec) => {
                facultyBySection[sec] = facultyMap[sub.id]?.[sec] || "";
              });
              return {
                id: sub.id,
                name: sub.name,
                code: sub.code,
                type: sub.type,
                hoursPerWeek: sub.hoursPerWeek,
                facultyBySection,
                abbreviation: sub.abbreviation,
              };
            });

            subjectsMap[key] = rows;
            specialHoursMap[key] = specialHours.filter((h) => h.is_active);
          })
        );
      }

      setDeptIds(deptIdsMap);
      setSubjectsData(subjectsMap);
      setSpecialHoursData(specialHoursMap);
      setTotalHoursBySection(secHoursMap);
      setSectionSubjectsData(secSubjectsMap);
      setClassCounselorsMap(counselorsMap);
      setDepartmentFaculty(deptFacultyMap);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load review data");
    } finally {
      setLoading(false);
    }
  };

  // Keep active counselor state in sync with current class
  useEffect(() => {
    const secKey = `${activeDept}_${activeTab}_${activeSection}`;
    if (classCounselorsMap[secKey] !== undefined) {
      setPdfCounselor(classCounselorsMap[secKey]);
    } else {
      const deptId = deptIds[activeDept] || stateData?.departmentId;
      if (deptId && activeTab && activeSection) {
        supabase.rpc('get_class_counselor_info', {
          dept_id: deptId,
          year_param: activeTab,
          section_param: activeSection
        }).then(({ data, error }) => {
          if (!error && data && data.length > 0 && data[0].faculty_name) {
            setClassCounselorsMap((prev) => ({ ...prev, [secKey]: data[0].faculty_name }));
            setPdfCounselor(data[0].faculty_name);
          } else {
            setClassCounselorsMap((prev) => ({ ...prev, [secKey]: '' }));
            setPdfCounselor('');
          }
        }).catch(() => {
          setClassCounselorsMap((prev) => ({ ...prev, [secKey]: '' }));
          setPdfCounselor('');
        });
      } else {
        setPdfCounselor('');
      }
    }
  }, [activeDept, activeTab, activeSection, classCounselorsMap, deptIds, stateData?.departmentId]);

  const handleCounselorChange = (val: string) => {
    setPdfCounselor(val);
    const secKey = `${activeDept}_${activeTab}_${activeSection}`;

    // 1. Update per-class map
    setClassCounselorsMap((prev) => ({ ...prev, [secKey]: val }));

    // 2. Also assign for special hours (Counselling / Student Counselling / Special)
    const curRows = customAllocations[secKey] || allocationRows;
    const hasCounsel = curRows.some((r) => /counsel|counselor|counselling/i.test(r.title));

    let updatedRows: AllocationRow[];
    if (hasCounsel) {
      updatedRows = curRows.map((r) => {
        if (/counsel|counselor|counselling/i.test(r.title) || (r.category === 'Special' && /counsel/i.test(r.title))) {
          return { ...r, faculty: val.trim() || '—' };
        }
        return r;
      });
    } else {
      updatedRows = [
        ...curRows,
        {
          code: 'SC',
          title: 'Counselling',
          category: 'Special',
          hours: 2,
          faculty: val.trim() || '—',
        },
      ];
    }
    setCustomAllocations((prev) => ({ ...prev, [secKey]: updatedRows }));
    setHasUserEdits(true);

    // 3. Persist to class_counselors table in Supabase if faculty matches, or deactivate if cleared
    const deptId = deptIds[activeDept] || stateData?.departmentId;
    if (deptId) {
      const trimmed = val.trim();
      const facList = departmentFaculty[activeDept] || [];
      const match = facList.find((f) => f.name.toLowerCase() === trimmed.toLowerCase());
      if (match) {
        upsertClassCounselor({
          departmentId: deptId,
          facultyId: match.id,
          year: activeTab,
          section: activeSection,
        }).catch((err) => console.warn("Failed to persist class counselor:", err));
      } else if (!trimmed) {
        deactivateClassCounselor(deptId, activeTab, activeSection).catch(() => {});
      }
    }
  };

  const handleGenerate = async () => {
    const progressList: ProgressItem[] = [];
    selections.forEach(({ departmentName, selectedYears }) => {
      selectedYears.forEach(({ year, sections }) => {
        sections.forEach((sec) => {
          progressList.push({ departmentName, year, section: sec, status: "idle" });
        });
      });
    });

    setProgressItems(progressList);
    setShowProgress(true);
    setGenerating(true);
    setGeneratedResults([]);

    try {
      // Collect all classes being generated across all selected departments to exclude stale DB timetables
      const allSelectedClasses: Array<{ departmentId?: string; year: string; section: string }> = [];
      for (const deptSel of selections) {
        const dept = await getDepartmentByName(deptSel.departmentName);
        const deptId = dept?.id;
        for (const yr of deptSel.selectedYears) {
          for (const sec of yr.sections) {
            allSelectedClasses.push({ departmentId: deptId, year: yr.year, section: sec });
          }
        }
      }

      // Build unified college-wide shared faculty allocation map
      const sharedFacultyMap = await buildFacultyAllocationMap(
        '',
        undefined,
        undefined,
        { allClasses: true, excludeClasses: allSelectedClasses }
      );

      const resultsArray: GeneratedTimetableResult[][] = [];

      // Run departments sequentially to prevent cross-department staff collisions
      for (const deptSel of selections) {
        const result = await generateAllYears(
          deptSel.departmentName,
          (year, section, status, error) => {
            setProgressItems((prev) =>
              prev.map((p) =>
                p.departmentName === deptSel.departmentName && p.year === year && p.section === section
                  ? { ...p, status: status as ProgressStatus, error }
                  : p
              )
            );
          },
          facultyBeforeAfternoon,
          sharedFacultyMap,
          deptSel.selectedYears,
          semesterType
        );

        const selectedYearSet = new Set(deptSel.selectedYears.map(y => y.year));
        const finalResults: GeneratedTimetableResult[] = result.results.filter(r => {
          if (!selectedYearSet.has(r.year)) return false;
          const matchingYear = deptSel.selectedYears.find(y => y.year === r.year);
          return matchingYear?.sections.includes(r.section) ?? false;
        }).map(r => ({
          ...r,
          departmentName: deptSel.departmentName
        }));

        resultsArray.push(finalResults);
      }

      const allFinalResults = resultsArray.flat();
      setGeneratedResults(allFinalResults);
      const totalOk = allFinalResults.filter(r => r.status === "ok").length;
      const totalErr = allFinalResults.filter(r => r.status === "error").length;

      if (cacheKey && totalOk > 0) {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(allFinalResults));
        } catch (e) {
          console.warn("Could not cache to sessionStorage", e);
        }
      }

      if (totalOk > 0) {
        const firstOk = allFinalResults.find(r => r.status === 'ok') || allFinalResults[0];
        if (firstOk) {
          setActiveDept(firstOk.departmentName);
          setActiveTab(firstOk.year);
          setActiveSection(firstOk.section);
        }

        const totalMismatches = allFinalResults.reduce(
          (sum, r) => sum + (r.hourVerification?.mismatches.length || 0),
          0
        );

        if (totalMismatches === 0) {
          toast.success(`Generated ${totalOk} timetable(s) successfully! All subject weekly hours verified 100% exact.`);
        } else {
          toast.warning(`Generated ${totalOk} timetable(s), but ${totalMismatches} subject weekly hour mismatch(es) detected.`);
        }
        setShowProgress(false);
        setIsFullScreen(true);
        setFullScreenPage('timetable');
      }
      if (totalErr > 0) {
        toast.error(`${totalErr} timetable(s) failed.`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Generation failed.");
    } finally {
      setGenerating(false);
      setShowProgress(false);
    }
  };

  const autoGeneratedRef = useRef(false);

  useEffect(() => {
    if (
      !loading &&
      selections.length > 0 &&
      generatedResults.length === 0 &&
      !generating &&
      !autoGeneratedRef.current
    ) {
      autoGeneratedRef.current = true;
      handleGenerate();
    }
  }, [loading, selections, generatedResults.length, generating]);

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const okResults = generatedResults.filter(r => r.status === 'ok');
      if (okResults.length === 0) {
        toast.error("No valid timetables to publish.");
        return;
      }

      await Promise.all(
        okResults.map(async (r) => {
          const deptId = deptIds[r.departmentName] || stateData?.departmentId;
          if (!deptId) throw new Error(`Department ID not found for ${r.departmentName}`);

          await saveTimetable(
            deptId,
            r.year,
            r.section,
            r.grid,
            { seminar: false, library: false, counselling: false }
          );

          // Update snapshot in localStorage
          const snapKey = `ttg_snap_${deptId}_${r.year}_${r.section}`;
          localStorage.setItem(snapKey, JSON.stringify(r.grid));
        })
      );

      if (cacheKey) sessionStorage.removeItem(cacheKey);
      setHasUserEdits(false);
      toast.success("All timetables published and saved successfully!");
      if (!isFullScreen) {
        navigate("/admin");
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Failed to publish timetables.");
    } finally {
      setPublishing(false);
    }
  };

  const openPdfExportModal = (scope: 'all' | 'year' | 'current' = 'all') => {
    if (generatedResults.length === 0) {
      toast.error("No generated timetables available to export.");
      return;
    }

    setPdfScope(scope);
    const deptId = deptIds[activeDept] || stateData?.departmentId || '';
    const revKey = `ttg_rev_${deptId}_${activeTab}_${activeSection}`;
    const wefKey = `ttg_wef_${deptId}_${activeTab}_${activeSection}`;
    const snapKey = `ttg_snap_${deptId}_${activeTab}_${activeSection}`;

    const savedRev = localStorage.getItem(revKey);
    const savedWef = localStorage.getItem(wefKey);
    const savedSnap = localStorage.getItem(snapKey);

    const active = generatedResults.find(
      (r) => r.departmentName === activeDept && r.year === activeTab && r.section === activeSection
    );
    const isModified = hasUserEdits || (savedSnap && active && JSON.stringify(active.grid) !== savedSnap);

    if (!savedRev) {
      // First time export: always 00
      setRevision("00");
    } else if (isModified) {
      // Increment revision when modifications have occurred
      const curNum = parseInt(savedRev, 10) || 0;
      const nextRev = String(curNum + 1).padStart(2, '0');
      setRevision(nextRev);
    } else {
      setRevision(savedRev);
    }

    setWefDate(savedWef || '29.06.2026');

    // Pre-populate counselor for active section: from classCounselorsMap or curRows
    const secKey = `${activeDept}_${activeTab}_${activeSection}`;
    const curRows = customAllocations[secKey] || allocationRows;
    const counselRow = curRows.find(r => /counsel|counselor|counselling/i.test(r.title));
    const activeCounselor = classCounselorsMap[secKey] || (counselRow && counselRow.faculty && counselRow.faculty !== '—' ? counselRow.faculty : '');
    setPdfCounselor(activeCounselor || '');

    setPdfModalOpen(true);
  };

  const confirmAndExportPdf = async () => {
    setPdfModalOpen(false);
    const deptId = deptIds[activeDept] || stateData?.departmentId || '';
    const revKey = `ttg_rev_${deptId}_${activeTab}_${activeSection}`;
    const wefKey = `ttg_wef_${deptId}_${activeTab}_${activeSection}`;
    const snapKey = `ttg_snap_${deptId}_${activeTab}_${activeSection}`;

    localStorage.setItem(revKey, revision);
    localStorage.setItem(wefKey, wefDate);

    const active = generatedResults.find(
      (r) => r.departmentName === activeDept && r.year === activeTab && r.section === activeSection
    );
    if (active) {
      localStorage.setItem(snapKey, JSON.stringify(active.grid));
    }
    setHasUserEdits(false);

    await executeExportPDF(pdfScope, {
      wefDate,
      revision,
      timetableIncharge: pdfIncharge,
      counselorName: pdfScope === 'current' ? pdfCounselor : undefined,
      hodName: pdfHod,
      principalName: pdfPrincipal,
      semesterType,
    });
  };

  const executeExportPDF = async (scope: 'all' | 'year' | 'current' = 'all', options?: TimetablePdfOptions) => {
    if (generatedResults.length === 0) {
      toast.error("No generated timetables available to export.");
      return;
    }

    setExporting(true);
    try {
      let targets: GeneratedTimetableResult[] = [];
      let customFileName = '';

      if (scope === 'current') {
        const active = generatedResults.find(
          (r) => r.departmentName === activeDept && r.year === activeTab && r.section === activeSection
        );
        if (!active || active.status !== 'ok') {
          toast.error(`No valid generated timetable found for Year ${activeTab} Section ${activeSection}`);
          return;
        }
        targets = [active];
        customFileName = `Timetable_${activeDept.replace(/\s+/g, '_')}_Year${activeTab}_Sec${activeSection}.pdf`;
      } else if (scope === 'year') {
        targets = generatedResults.filter(
          (r) => r.departmentName === activeDept && r.year === activeTab && r.status === 'ok'
        );
        if (targets.length === 0) {
          toast.error(`No valid generated timetables found for Year ${activeTab}`);
          return;
        }
        customFileName = `Timetables_${activeDept.replace(/\s+/g, '_')}_Year${activeTab}_All_Sections.pdf`;
      } else {
        targets = generatedResults.filter((r) => r.status === 'ok');
        if (targets.length === 0) {
          toast.error("No successfully generated timetables available to export.");
          return;
        }
        customFileName = `Timetables_All_Classes_${activeDept.replace(/\s+/g, '_') || 'Department'}.pdf`;
      }

      const exportItems: TimetableExportClassItem[] = targets.map((r) => {
        const key = `${r.departmentName}_${r.year}`;
        const secKey = `${r.departmentName}_${r.year}_${r.section}`;
        const secAllocRows = customAllocations[secKey];

        // Specific counselor for this class
        let classCounselor = '';
        if (scope === 'current') {
          classCounselor = pdfCounselor;
        } else {
          classCounselor = classCounselorsMap[secKey] || '';
          if (!classCounselor && secAllocRows) {
            const cr = secAllocRows.find(row => /counsel|counselor|counselling/i.test(row.title));
            if (cr && cr.faculty && cr.faculty !== '—') {
              classCounselor = cr.faculty;
            }
          }
        }

        let exportSubjects: TimetableExportSubject[] = [];
        let exportSpecialHours: any[] = [];
        const allYearSubjects = subjectsData[key] || [];

        // Apply updated Subject & Faculty Allocations from the table
        if (secAllocRows && secAllocRows.length > 0) {
          exportSubjects = secAllocRows
            .filter(row => !['special', 'seminar', 'library', 'counsel', 'counselling'].some(k => row.category.toLowerCase().includes(k) || row.title.toLowerCase().includes(k)) && !['SC', 'SEM', 'LIB'].includes((row.code || '').trim().toUpperCase()))
            .map(row => {
              const matchedSub = allYearSubjects.find(s =>
                (row.code && s.code && s.code.trim().toUpperCase() === row.code.trim().toUpperCase()) ||
                (s.name && s.name.toLowerCase().trim() === row.title.toLowerCase().trim())
              );
              return {
                code: row.code && row.code !== '—' ? row.code : (matchedSub?.code || ''),
                name: row.title,
                type: row.category.toLowerCase().includes('lab') ? 'lab' : (row.category.toLowerCase().includes('open') ? 'open elective' : (row.category.toLowerCase().includes('elective') ? 'elective' : 'theory')),
                hoursPerWeek: row.hours,
                staff: row.faculty && row.faculty !== '—' ? row.faculty : '',
                abbreviation: row.abbreviation || matchedSub?.abbreviation || '',
              };
            });

          exportSpecialHours = secAllocRows
            .filter(row => ['special', 'seminar', 'library', 'counsel', 'counselling'].some(k => row.category.toLowerCase().includes(k) || row.title.toLowerCase().includes(k)) || ['SC', 'SEM', 'LIB'].includes((row.code || '').trim().toUpperCase()))
            .map(row => {
              const isCounsel = /counsel|student counselling|counselling|mentor/i.test(row.title);
              const staff = (row.faculty && row.faculty !== '—') ? row.faculty : (isCounsel ? classCounselor : '');
              return {
                name: row.title,
                title: row.title,
                type: 'special',
                hours: row.hours,
                staff: staff,
              };
            });
        } else {
          const sectionSpecificIds = sectionSubjectsData[key]?.[r.section];

          const filteredSubjects = (sectionSpecificIds && sectionSpecificIds.size > 0)
            ? allYearSubjects.filter((s) => sectionSpecificIds.has(s.id))
            : allYearSubjects;

          const isSpecial = (name: string, type?: string, code?: string) => {
            const n = (name || '').toLowerCase();
            const t = (type || '').toLowerCase();
            const c = (code || '').toUpperCase().trim();
            return t === 'special' || c === 'SC' || c === 'SEM' || c === 'LIB' || n.includes('library') || n.includes('seminar') || n.includes('counsel') || n.includes('counselling') || n.includes('mentor');
          };

          exportSubjects = filteredSubjects
            .filter((s) => !isSpecial(s.name, s.type, s.code))
            .map((s) => ({
              id: s.id,
              code: s.code || '',
              name: s.name,
              type: s.type,
              hoursPerWeek: s.hoursPerWeek,
              staff: s.facultyBySection[r.section] || '',
              abbreviation: s.abbreviation || '',
            }));

          const specialFromSubjects = filteredSubjects
            .filter((s) => isSpecial(s.name, s.type, s.code))
            .map((s) => {
              const isCounsel = /counsel|student counselling|counselling|mentor/i.test(s.name);
              return {
                name: s.name,
                title: s.name,
                type: 'special',
                hours: s.hoursPerWeek || 2,
                staff: s.facultyBySection[r.section] || (isCounsel ? classCounselor : '')
              };
            });

          const specialHoursFromConfig = (specialHoursData[key] || []).map((h) => {
            const isCounsel = /counsel|student counselling|counselling|mentor/i.test(h.name || h.special_type);
            return {
              name: h.name || h.special_type,
              title: h.name || h.special_type,
              type: 'special',
              hours: h.total_hours || 2,
              staff: h.faculty_name || (isCounsel ? classCounselor : '')
            };
          });

          exportSpecialHours = [
            ...specialFromSubjects,
            ...specialHoursFromConfig
          ];
        }

        return {
          departmentName: r.departmentName,
          year: r.year,
          section: r.section,
          grid: r.grid.map((row) => row.map((cell) => cleanCellTitle(cell))),
          departmentId: deptIds[r.departmentName] || stateData?.departmentId,
          subjects: exportSubjects,
          specialHours: exportSpecialHours,
          counselorName: classCounselor,
          wefDate: options?.wefDate,
          revision: options?.revision,
          timetableIncharge: options?.timetableIncharge,
          hodName: options?.hodName,
          principalName: options?.principalName,
          semesterType,
        };
      });

      await exportTimetablesToPdf(exportItems, customFileName, options);
      toast.success(
        scope === 'current'
          ? `Exported Year ${activeTab} Section ${activeSection} PDF successfully!`
          : `Exported ${exportItems.length} class timetable(s) to PDF successfully!`
      );
    } catch (err: any) {
      console.error('PDF Export error:', err);
      toast.error(err?.message || "Failed to export timetable PDF.");
    } finally {
      setExporting(false);
    }
  };

  const activeDeptSelection = selections.find(d => d.departmentName === activeDept);
  const activeYearSections = activeDeptSelection?.selectedYears.find((y) => y.year === activeTab)?.sections || [];
  const activeYearKey = `${activeDept}_${activeTab}`;
  const activeYearSubjects = subjectsData[activeYearKey] || [];
  const filteredReviewSubjects = useMemo(() => {
    return activeYearSubjects.filter((sub) => {
      if (reviewTypeFilter === 'all') return true;
      if (reviewTypeFilter === 'theory-elective') return sub.type === 'theory' || sub.type === 'elective';
      if (reviewTypeFilter === 'lab') return sub.type === 'lab';
      if (reviewTypeFilter === 'open-elective') return sub.type === 'open elective';
      if (reviewTypeFilter === 'special') return sub.type === 'special';
      return true;
    });
  }, [activeYearSubjects, reviewTypeFilter]);
  const activeYearSpecialHours = specialHoursData[activeYearKey] || [];
  const activeTotalHoursBySection = totalHoursBySection[activeYearKey] || {};

  const currentYearResults = useMemo(() => {
    const list = generatedResults.filter(r => r.departmentName === activeDept && r.year === activeTab);
    if (list.length > 0) return list;
    const deptList = generatedResults.filter(r => r.departmentName === activeDept);
    if (deptList.length > 0) return deptList;
    return generatedResults;
  }, [generatedResults, activeDept, activeTab]);

  const activeResult = useMemo(() => {
    if (generatedResults.length === 0) return null;
    return (
      generatedResults.find(r => r.departmentName === activeDept && r.year === activeTab && r.section === activeSection) ||
      generatedResults.find(r => r.departmentName === activeDept && r.year === activeTab) ||
      generatedResults.find(r => r.departmentName === activeDept) ||
      generatedResults.find(r => r.status === 'ok') ||
      generatedResults[0] ||
      null
    );
  }, [generatedResults, activeDept, activeTab, activeSection]);

  const currentVerification = useMemo(() => {
    if (!activeResult || !Array.isArray(activeResult.grid) || activeResult.status !== 'ok') return null;
    const sectionToSubjectIds = sectionSubjectsData[activeYearKey] || {};
    const mappedIds = sectionToSubjectIds[activeSection] || new Set();
    const sectionSpecificSubjects = mappedIds.size > 0
      ? activeYearSubjects.filter((s) => mappedIds.has(s.id))
      : activeYearSubjects;

    return verifySubjectHours(activeResult.grid, sectionSpecificSubjects as any, activeYearSpecialHours);
  }, [activeResult?.grid, activeResult?.status, activeSection, activeYearKey, activeYearSubjects, activeYearSpecialHours, sectionSubjectsData]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-[#f8faff] via-[#f5f8ff] to-[#fbf9ff] text-slate-900 p-4 select-none relative overflow-hidden">
        {/* Ambient glassmorphic glowing gradients (matching Dashboard UI) */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-br from-blue-200/40 via-blue-100/30 to-transparent blur-3xl opacity-75 pointer-events-none" />
        <div className="absolute top-1/4 -right-20 w-80 h-80 rounded-full bg-gradient-to-bl from-purple-200/35 via-indigo-100/40 to-transparent blur-3xl opacity-65 pointer-events-none" />

        <div className="p-8 sm:p-10 rounded-3xl bg-white/85 dark:bg-[#0c1022]/85 backdrop-blur-2xl border border-blue-200/60 dark:border-blue-500/25 shadow-[0_16px_48px_rgba(37,99,235,0.12)] dark:shadow-[0_16px_48px_rgba(0,0,0,0.6)] flex flex-col items-center gap-4 max-w-md text-center z-10 animate-in fade-in zoom-in-95 duration-200">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-500/15 to-blue-600/15 border border-blue-200/80 text-blue-600 shadow-sm shadow-blue-500/10">
            <Loader2 className="h-10 w-10 animate-spin" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">Preparing Timetable System</h2>
            <p className="text-xs text-blue-700/80 mt-1">Loading department curricula, faculties, and room constraints...</p>
          </div>
        </div>
      </div>
    );
  }

  if (generating || showProgress) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-[#f8faff] via-[#f5f8ff] to-[#fbf9ff] text-slate-900 p-4 select-none relative overflow-hidden">
        {/* Ambient glassmorphic glowing gradients (matching Dashboard UI) */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-br from-blue-200/40 via-blue-100/30 to-transparent blur-3xl opacity-75 pointer-events-none" />
        <div className="absolute top-1/4 -right-20 w-80 h-80 rounded-full bg-gradient-to-bl from-purple-200/35 via-indigo-100/40 to-transparent blur-3xl opacity-65 pointer-events-none" />

        <div className="relative w-[480px] max-w-[95vw] max-h-[88vh] overflow-y-auto rounded-3xl border border-blue-200/80 dark:border-blue-500/25 bg-white/85 dark:bg-[#0c1022]/85 backdrop-blur-2xl shadow-[0_20px_60px_rgba(37,99,235,0.14)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.6)] p-6 sm:p-7 z-10 animate-in fade-in duration-200">
          <div className="mb-5">
            <div className="flex items-center gap-3 mb-1.5">
              <div className="p-2.5 rounded-2xl bg-gradient-to-br from-blue-500/15 to-blue-600/15 border border-blue-200/80 text-blue-600 shadow-sm shadow-blue-500/10">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                  Generating Timetables Automatically
                </h3>
                <p className="text-xs text-indigo-700/80">
                  Optimizing faculty allocations and slot distributions
                </p>
              </div>
            </div>
          </div>

          {/* Department & Section Progress */}
          <div className="space-y-4">
            {selections.map(({ departmentName, selectedYears }) => {
              const deptProgress = progressItems.filter(p => p.departmentName === departmentName);
              return (
                <div key={departmentName} className="p-3.5 rounded-2xl bg-blue-50/40 dark:bg-slate-900/60 border border-blue-100/90 dark:border-blue-900/40">
                  <div className="text-xs font-extrabold text-blue-900 dark:text-blue-200 mb-2.5 flex items-center justify-between">
                    <span>{departmentName}</span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200/60">
                      {semesterType.toUpperCase()} SEM
                    </span>
                  </div>
                  {selectedYears.map(({ year }) => {
                    const items = deptProgress.filter((p) => p.year === year);
                    return (
                      <div key={year} className="mb-3 last:mb-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600/80 mb-1.5">
                          Year {year}
                        </div>
                        <div className="space-y-1.5">
                          {items.map((item) => (
                            <div key={item.section} className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-white/85 dark:bg-slate-800/80 border border-blue-100/80 dark:border-blue-900/40 text-xs shadow-xs text-slate-900 dark:text-slate-100">
                              <span className="w-16 font-bold text-slate-900">Sec {item.section}</span>
                              <div className="flex-1">
                                {item.status === 'idle' && (
                                  <div className="h-1.5 w-full rounded-full bg-indigo-100" />
                                )}
                                {item.status === 'running' && (
                                  <div className="h-1.5 w-full rounded-full bg-indigo-100 overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-indigo-600 via-indigo-600 to-purple-600 rounded-full animate-pulse" style={{ width: '70%' }} />
                                  </div>
                                )}
                                {item.status === 'ok' && (
                                  <div className="h-1.5 w-full bg-indigo-600 rounded-full" />
                                )}
                                {item.status === 'error' && (
                                  <div className="h-1.5 w-full bg-rose-500 rounded-full" />
                                )}
                              </div>
                              <div className="w-5 flex justify-center">
                                {item.status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />}
                                {item.status === 'ok' && <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600" />}
                                {item.status === 'error' && <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (activeResult) {
    return (
      <div className={`fixed inset-0 z-50 flex flex-col h-screen w-screen overflow-hidden ${isDark
          ? "bg-[#060814] text-slate-100"
          : "bg-gradient-to-br from-[#f8faff] via-[#f5f8ff] to-[#fbf9ff] text-slate-900"
        } p-1.5 sm:p-2.5 md:p-3 select-none animate-in fade-in duration-150 relative`}>
        {/* Ambient glassmorphic glowing gradients (matching Dashboard UI) */}
        {isDark ? (
          <>
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-br from-blue-600/15 via-blue-500/10 to-transparent blur-3xl opacity-70 pointer-events-none" />
            <div className="absolute top-1/4 -right-20 w-80 h-80 rounded-full bg-gradient-to-bl from-indigo-600/12 via-blue-600/10 to-transparent blur-3xl opacity-60 pointer-events-none" />
            <div className="absolute -bottom-20 left-1/3 w-96 h-96 rounded-full bg-gradient-to-tr from-blue-700/10 via-indigo-600/08 to-transparent blur-3xl opacity-50 pointer-events-none" />
          </>
        ) : (
          <>
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-br from-blue-200/40 via-blue-100/30 to-transparent blur-3xl opacity-75 pointer-events-none" />
            <div className="absolute top-1/4 -right-20 w-80 h-80 rounded-full bg-gradient-to-bl from-purple-200/35 via-indigo-100/40 to-transparent blur-3xl opacity-65 pointer-events-none" />
            <div className="absolute -bottom-20 left-1/3 w-96 h-96 rounded-full bg-gradient-to-tr from-indigo-100/40 via-purple-100/30 to-transparent blur-3xl opacity-50 pointer-events-none" />
          </>
        )}

        {/* Top Command Bar - Spacious, perfectly aligned, Blue accent */}
        <header className={`min-h-[52px] h-[52px] shrink-0 ${isDark
            ? "bg-[#0c1022]/85 border-blue-500/25 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.6),0_0_12px_-2px_rgba(59,130,246,0.1),inset_0_1px_1px_0_rgba(255,255,255,0.06)]"
            : "bg-white/90 border-blue-200/70 shadow-[0_4px_20px_-4px_rgba(37,99,235,0.08),inset_0_1px_1px_0_rgba(255,255,255,0.9)]"
          } backdrop-blur-2xl rounded-2xl border px-3 sm:px-4 flex items-center justify-between gap-3 relative z-10 overflow-x-auto no-scrollbar`}>
          {/* Left Zone: Class Identity & Switchers */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex items-center gap-2">
              <Badge className={`${isDark ? "bg-[#182852] text-blue-200 border border-blue-500/30 shadow-xs" : "bg-blue-600 text-white shadow-sm shadow-blue-500/25 border-0"
                } font-extrabold text-[11px] px-2.5 py-1 rounded-lg shrink-0`}>
                Yr {activeResult.year} • Sec {activeResult.section}
              </Badge>
              <span className={`font-extrabold text-sm tracking-tight truncate ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                {activeDept}
              </span>
            </div>

            {/* Department switcher pills if multiple departments */}
            {selections.length > 1 && (
              <div className={`flex p-0.5 rounded-xl border ${isDark ? "border-blue-500/25 bg-slate-900/60" : "border-blue-200/60 bg-blue-50/50"} backdrop-blur-md gap-0.5 shadow-xs overflow-x-auto no-scrollbar`}>
                {selections.map(({ departmentName }) => (
                  <button
                    key={departmentName}
                    onClick={() => {
                      setActiveDept(departmentName);
                      const deptResults = generatedResults.filter(r => r.departmentName === departmentName);
                      if (deptResults.length > 0) {
                        setActiveTab(deptResults[0].year);
                        setActiveSection(deptResults[0].section);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${activeDept === departmentName
                        ? isDark
                          ? "bg-[#1c3166] text-blue-100 shadow-xs border border-blue-500/40 font-bold"
                          : "bg-white text-blue-700 shadow-xs border border-blue-300 font-bold"
                        : isDark
                          ? "text-slate-300 hover:text-white hover:bg-slate-800/80"
                          : "text-slate-600 hover:text-blue-700 hover:bg-white/60"
                      }`}
                  >
                    {departmentName}
                  </button>
                ))}
              </div>
            )}

            {/* Year switcher pills if multiple years */}
            {activeDeptSelection && activeDeptSelection.selectedYears.length > 1 && (
              <div className={`flex p-0.5 rounded-xl border ${isDark ? "border-blue-500/25 bg-slate-900/60" : "border-blue-200/60 bg-blue-50/50"} backdrop-blur-md gap-0.5 shadow-xs overflow-x-auto no-scrollbar`}>
                {activeDeptSelection.selectedYears.map(({ year }) => (
                  <button
                    key={year}
                    onClick={() => {
                      setActiveTab(year);
                      const yrResults = generatedResults.filter(r => r.departmentName === activeDept && r.year === year);
                      if (yrResults.length > 0) setActiveSection(yrResults[0].section);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${activeTab === year
                        ? isDark
                          ? "bg-[#1c3166] text-blue-100 shadow-xs border border-blue-500/40 font-bold"
                          : "bg-white text-blue-700 shadow-xs border border-blue-300 font-bold"
                        : isDark
                          ? "text-slate-300 hover:text-white hover:bg-slate-800/80"
                          : "text-slate-600 hover:text-blue-700 hover:bg-white/60"
                      }`}
                  >
                    Yr {year}
                  </button>
                ))}
              </div>
            )}

            {/* Section switcher pills */}
            {currentYearResults.length > 0 && (
              <div className={`flex p-0.5 rounded-xl border ${isDark ? "border-blue-500/25 bg-slate-900/60" : "border-blue-200/60 bg-blue-50/50"} backdrop-blur-md gap-0.5 shadow-xs overflow-x-auto no-scrollbar`}>
                {currentYearResults.map((r) => (
                  <button
                    key={r.section}
                    onClick={() => setActiveSection(r.section)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 ${activeSection === r.section
                        ? isDark
                          ? "bg-[#1c3166] text-blue-100 shadow-xs border border-blue-500/40 font-bold"
                          : "bg-white text-blue-700 shadow-xs border border-blue-300 font-bold"
                        : isDark
                          ? "text-slate-300 hover:text-white hover:bg-slate-800/80"
                          : "text-slate-600 hover:text-blue-700 hover:bg-white/60"
                      }`}
                  >
                    {r.section}
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${r.hourVerification?.isValid ?? true ? (isDark ? "bg-blue-400" : "bg-blue-600") : "bg-amber-500"
                        }`}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Center Zone: Mode Switcher (Timetable vs Subject Staffs) */}
          <div className={`flex items-center p-0.5 rounded-xl border ${isDark ? "border-blue-500/25 bg-slate-900/60" : "border-blue-200/70 bg-blue-50/60"
            } backdrop-blur-md shadow-xs gap-1 shrink-0`}>
            <button
              onClick={() => setFullScreenPage('timetable')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${fullScreenPage === 'timetable'
                  ? isDark ? 'bg-[#1c3166] text-blue-100 shadow-sm shadow-blue-900/40 border border-blue-500/40' : 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                  : isDark
                    ? 'text-slate-300 hover:text-white hover:bg-slate-800/80 font-semibold'
                    : 'text-slate-600 hover:text-blue-900 hover:bg-white/60 font-semibold'
                }`}
              title="View Full Timetable (Swipe Down / Up Arrow)"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Timetable</span>
            </button>

            <button
              onClick={() => setFullScreenPage('allocation')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${fullScreenPage === 'allocation'
                  ? isDark ? 'bg-[#1c3166] text-blue-100 shadow-sm shadow-blue-900/40 border border-blue-500/40' : 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                  : isDark
                    ? 'text-slate-300 hover:text-white hover:bg-slate-800/80 font-semibold'
                    : 'text-slate-600 hover:text-blue-900 hover:bg-white/60 font-semibold'
                }`}
              title="View Subject Staff Allocation (Swipe Up / Down Arrow)"
            >
              <Users className="h-3.5 w-3.5" />
              <span>Subject Staffs ({allocationRows.length})</span>
            </button>
          </div>

          {/* Right Zone: Perfectly Spaced & Segmented Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Group A: Inspection & Export Tools */}
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFacultyInGrid(!showFacultyInGrid)}
                className={`h-8.5 px-3 rounded-xl text-xs gap-1.5 font-semibold border transition-all flex items-center ${showFacultyInGrid
                    ? isDark
                      ? "border-blue-500/50 bg-blue-600/20 text-blue-300 shadow-xs"
                      : "border-blue-300 bg-blue-50 text-blue-700 shadow-xs"
                    : isDark
                      ? "border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:border-blue-500/40 hover:text-blue-300 shadow-xs"
                      : "border-slate-200/90 bg-white/90 text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 shadow-xs"
                  }`}
              >
                <Users className={`h-3.5 w-3.5 ${isDark ? "text-blue-400" : "text-blue-600"}`} />
                <span>{showFacultyInGrid ? "Hide Staff" : "Show Staff"}</span>
              </Button>

              {/* Export PDF Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exporting || publishing || generatedResults.filter(r => r.status === 'ok').length === 0}
                    className={`h-8.5 px-3 rounded-xl font-semibold border ${isDark
                        ? "border-slate-700 bg-slate-800/80 hover:bg-slate-700 hover:border-blue-500/40 text-slate-300 hover:text-blue-300"
                        : "border-slate-200/90 bg-white/90 hover:bg-blue-50 hover:border-blue-300 text-slate-700 hover:text-blue-700"
                      } gap-1.5 shadow-xs transition-all text-xs flex items-center`}
                  >
                    {exporting ? (
                      <>
                        <Loader2 className={`h-3.5 w-3.5 animate-spin ${isDark ? "text-blue-400" : "text-blue-600"}`} />
                        <span>Exporting...</span>
                      </>
                    ) : (
                      <>
                        <FileDown className={`h-3.5 w-3.5 ${isDark ? "text-blue-400" : "text-blue-600"}`} />
                        <span>Export PDF</span>
                        <ChevronDown className={`h-3 w-3 opacity-60 ml-0.5 ${isDark ? "text-blue-400" : "text-blue-600"}`} />
                      </>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className={`w-64 rounded-2xl p-1.5 shadow-2xl border ${isDark
                    ? "border-blue-500/30 bg-slate-900/95 text-slate-100"
                    : "border-blue-200/80 bg-white/95 text-slate-900"
                  } backdrop-blur-xl z-[70]`}>
                  <DropdownMenuItem
                    onClick={() => openPdfExportModal('all')}
                    disabled={exporting}
                    className={`cursor-pointer gap-2.5 py-2.5 rounded-xl px-3 ${isDark ? "focus:bg-blue-600/20 focus:text-blue-300 text-slate-200" : "focus:bg-blue-50 focus:text-blue-700 text-slate-900"} transition-colors`}
                  >
                    <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                    <div>
                      <div className={`font-semibold text-xs ${isDark ? "text-slate-100" : "text-slate-900"}`}>Export All Classes (PDF)</div>
                      <div className="text-[10px] text-blue-600/70">
                        All generated classes &amp; sections combined
                      </div>
                    </div>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => openPdfExportModal('year')}
                    disabled={exporting}
                    className={`cursor-pointer gap-2.5 py-2.5 rounded-xl px-3 ${isDark ? "focus:bg-blue-600/20 focus:text-blue-300 text-slate-200" : "focus:bg-blue-50 focus:text-blue-700 text-slate-900"} transition-colors`}
                  >
                    <Layers className="h-4 w-4 text-blue-600 shrink-0" />
                    <div>
                      <div className={`font-semibold text-xs ${isDark ? "text-slate-100" : "text-slate-900"}`}>Export Year {activeTab} (All Sections)</div>
                      <div className="text-[10px] text-blue-600/70">
                        Combined PDF of all Year {activeTab} sections
                      </div>
                    </div>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => openPdfExportModal('current')}
                    disabled={exporting}
                    className={`cursor-pointer gap-2.5 py-2.5 rounded-xl px-3 ${isDark ? "focus:bg-blue-600/20 focus:text-blue-300 text-slate-200" : "focus:bg-blue-50 focus:text-blue-700 text-slate-900"} transition-colors`}
                  >
                    <Printer className="h-4 w-4 text-blue-600 shrink-0" />
                    <div>
                      <div className={`font-semibold text-xs ${isDark ? "text-slate-100" : "text-slate-900"}`}>Export Current Class (PDF)</div>
                      <div className="text-[10px] text-blue-600/70">
                        Year {activeTab} — Section {activeSection}
                      </div>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Divider */}
            <div className={`h-5 w-px ${isDark ? "bg-slate-700" : "bg-slate-200"} mx-0.5`} />

            {/* Group B: Primary Publish Action */}
            <Button
              size="sm"
              onClick={handlePublish}
              disabled={publishing || exporting || generatedResults.filter(r => r.status === 'ok').length === 0}
              className={`h-8.5 rounded-xl gap-1.5 font-bold px-4 shadow-sm transition-all text-xs shrink-0 text-white ${isDark ? "bg-[#1d4ed8] hover:bg-[#2563eb] border border-blue-500/40 shadow-blue-900/30" : "bg-blue-600 hover:bg-blue-700 shadow-blue-600/25 border-0"
                } active:scale-95 flex items-center`}
            >
              {publishing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Publishing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Publish Timetables</span>
                </>
              )}
            </Button>

            {/* Divider */}
            <div className={`h-5 w-px ${isDark ? "bg-slate-700" : "bg-slate-200"} mx-0.5`} />

            {/* Group C: Navigation & Discard */}
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (cacheKey) sessionStorage.removeItem(cacheKey);
                  setGeneratedResults([]);
                  navigate('/admin');
                }}
                className={`h-8.5 px-3 rounded-xl text-xs gap-1.5 font-semibold border ${isDark
                    ? "border-slate-700 bg-slate-800/80 hover:bg-amber-950/40 hover:border-amber-500/40 text-slate-300 hover:text-amber-300"
                    : "border-slate-200/90 bg-white/90 hover:bg-amber-50 hover:border-amber-300 text-slate-700 hover:text-amber-800"
                  } shadow-xs flex items-center transition-all`}
                title="Discard generation and return to dashboard"
              >
                <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
                <span>Discard</span>
              </Button>

              <Button
                size="sm"
                onClick={() => navigate('/admin')}
                className={`h-8.5 px-3.5 rounded-xl text-xs gap-1.5 font-bold ${isDark
                    ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-xs"
                    : "bg-blue-700 hover:bg-blue-800 text-white border border-blue-600/50 shadow-xs"
                  } flex items-center transition-all`}
                title="Back to Dashboard"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Dashboard</span>
              </Button>
            </div>
          </div>
        </header>

        {/* Slide Presentation Container: Zero Document Scroll, Pure Up/Down Motion */}
        <div
          className="flex-1 min-h-0 w-full overflow-hidden relative mt-1.5 z-10"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheelSlide}
        >
          <div
            className={`w-full h-full flex flex-col transition-transform duration-500 ease-in-out ${fullScreenPage === 'timetable' ? 'translate-y-0' : '-translate-y-full'
              }`}
          >
            {/* ── PAGE 1: FULL VIEWPORT TIMETABLE ── */}
            <div className="w-full h-full shrink-0 flex flex-col relative overflow-hidden pb-1">
              <div className="flex-1 min-h-0 w-full overflow-hidden">
                <FullScreenGrid
                  grid={activeResult.grid}
                  onSwapSlots={handleSwapSlots}
                  getFaculty={getFacultyNamesForCell}
                  showFaculty={showFacultyInGrid}
                  isDark={isDark}
                />
              </div>
            </div>

            {/* ── PAGE 2: FULL VIEWPORT SUBJECT STAFFS ALLOCATION ── */}
            <div className="w-full h-full shrink-0 flex flex-col relative overflow-hidden pt-1">
              <div className="flex-1 min-h-0 w-full overflow-hidden">
                <FullScreenAllocationTable
                  rows={customAllocations[`${activeDept}_${activeTab}_${activeSection}`] || allocationRows}
                  classCounselor={classCounselorsMap[`${activeDept}_${activeTab}_${activeSection}`] || ''}
                  isDark={isDark}
                  onRowsChange={(updated) => {
                    const secKey = `${activeDept}_${activeTab}_${activeSection}`;
                    setCustomAllocations((prev) => ({ ...prev, [secKey]: updated }));
                    setHasUserEdits(true);
                    const counselRow = updated.find(r => /counsel|counselor|counselling/i.test(r.title));
                    if (counselRow && counselRow.faculty && counselRow.faculty !== '—') {
                      setClassCounselorsMap((prev) => ({ ...prev, [secKey]: counselRow.faculty }));
                      setPdfCounselor(counselRow.faculty);
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Faculty Conflict Dialog */}
        <Dialog open={conflictModalOpen} onOpenChange={setConflictModalOpen}>
          <DialogContent className="max-w-xl rounded-2xl p-6 shadow-2xl transition-colors z-[70] bg-white/95 backdrop-blur-xl border border-blue-200/80 text-slate-900">
            <DialogHeader className="pb-3 border-b border-blue-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-500 shrink-0">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-slate-900">
                    Faculty Schedule Conflict Detected
                  </DialogTitle>
                  <p className="text-xs mt-0.5 text-blue-700/80">
                    {conflictData?.source && conflictData?.target ? (
                      <>
                        Attempted swap between <strong>{DAYS[conflictData.source.day]} P{conflictData.source.period + 1}</strong> and <strong>{DAYS[conflictData.target.day]} P{conflictData.target.period + 1}</strong> causes a clash.
                      </>
                    ) : (
                      "The requested hour change causes a faculty clash."
                    )}
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div className="py-4 space-y-3 max-h-[55vh] overflow-y-auto">
              {conflictData?.conflicts.map((c, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl border border-red-200 bg-red-50/70 text-red-900 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold flex items-center gap-1.5 text-sm text-red-600">
                      <Users className="h-4 w-4" />
                      {c.facultyName}
                    </span>
                    <span className="px-2 py-0.5 rounded-full font-mono text-[10px] font-bold bg-red-500/20 text-red-700 border border-red-500/30">
                      Double-Booking Clash
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div>
                      <span className="font-semibold text-slate-700">Moving Subject:</span>{" "}
                      <span className="font-semibold underline">{c.movingSubject || '(Empty)'}</span> → to {c.targetSlot.dayName} {c.targetSlot.periodLabel} ({c.targetSlot.time})
                    </div>
                    <div className="p-2.5 rounded-lg text-xs leading-relaxed border bg-white border-red-200 text-red-800">
                      ⚠️ <strong>Clash Details:</strong> {c.reason}
                    </div>
                  </div>
                </div>
              ))}

              <div className="p-3 rounded-xl border border-blue-200/60 bg-blue-50/60 text-xs flex items-start gap-2 text-blue-800">
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  Faculty members cannot teach two different classrooms during the same hour. The change was halted to prevent timetable collision. You can cancel to keep the valid schedule or force swap if you plan to reallocate the conflicting class.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-blue-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setConflictModalOpen(false);
                  setConflictData(null);
                }}
                className="rounded-xl text-xs font-semibold border-blue-200 text-blue-800 hover:bg-blue-50"
              >
                Cancel (Keep Current)
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleForceSwap}
                className="rounded-xl text-xs font-semibold"
              >
                Force Swap Anyway
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* W.E.F Date & Revision PDF Extract Dialog Modal */}
        <Dialog open={pdfModalOpen} onOpenChange={setPdfModalOpen}>
          <DialogContent className={`max-w-lg w-full rounded-2xl border backdrop-blur-2xl shadow-2xl p-6 ${isDark
              ? "bg-[#0b1022] border-blue-500/40 text-white shadow-[0_0_50px_rgba(37,99,235,0.25)]"
              : "bg-white border-blue-200 shadow-2xl text-slate-900"
            }`}>
            <DialogHeader className={`space-y-1 pb-3 border-b ${isDark ? "border-slate-800" : "border-slate-100"}`}>
              <DialogTitle className="text-xl font-black flex items-center gap-2.5">
                <div className={`p-2 rounded-xl border ${isDark ? "bg-blue-500/20 border-blue-400/40 text-blue-300" : "bg-blue-50 border-blue-200 text-blue-600"}`}>
                  <FileDown className="h-5 w-5" />
                </div>
                <span className={isDark ? "text-white tracking-tight" : "text-slate-900 tracking-tight"}>
                  Extract Timetable PDF
                </span>
              </DialogTitle>
              <DialogDescription className={`text-xs font-medium ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                Sona College Official Template • Enter W.e.f. date and revision details for the official document.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Scope Info Pill */}
              <div className={`flex items-center justify-between p-3 rounded-xl border text-xs ${isDark
                  ? "bg-slate-900/90 border-blue-500/30 text-white shadow-inner"
                  : "bg-blue-50/70 border-blue-200 text-slate-800"
                }`}>
                <span className={`font-bold ${isDark ? "text-sky-300" : "text-blue-900"}`}>
                  Target Scope:
                </span>
                <Badge className={`font-black text-xs px-3 py-1 rounded-lg border ${isDark
                    ? "bg-blue-600/30 text-sky-200 border-blue-400/50 shadow-sm shadow-blue-500/20"
                    : "bg-blue-100 text-blue-800 border-blue-300"
                  }`}>
                  {pdfScope === 'current'
                    ? `Year ${activeTab} Section ${activeSection}`
                    : pdfScope === 'year'
                      ? `Year ${activeTab} (All Sections)`
                      : `All Classes (${activeDept})`}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                {/* W.e.f. Date */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-extrabold ${isDark ? "text-white" : "text-slate-800"}`}>
                      W.e.f. Date *
                    </span>
                    <span className={`text-[10px] font-bold ${isDark ? "text-sky-300" : "text-blue-600"}`}>
                      DD.MM.YYYY
                    </span>
                  </div>
                  <Input
                    value={wefDate}
                    onChange={(e) => setWefDate(e.target.value)}
                    placeholder="29.06.2026"
                    className={`h-10 text-xs rounded-xl font-bold transition-all ${isDark
                        ? "bg-slate-900/90 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"
                        : "bg-white border-slate-300 text-slate-900 focus:border-blue-500"
                      }`}
                  />
                </div>

                {/* Revision */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-extrabold ${isDark ? "text-white" : "text-slate-800"}`}>
                      Revision *
                    </span>
                    <span className={`text-[10px] font-bold ${isDark ? "text-sky-300" : "text-blue-600"}`}>
                      00, 01, 02...
                    </span>
                  </div>
                  <Input
                    value={revision}
                    onChange={(e) => setRevision(e.target.value)}
                    placeholder="00"
                    className={`h-10 text-xs rounded-xl font-black font-mono transition-all ${isDark
                        ? "bg-slate-900/90 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"
                        : "bg-white border-slate-300 text-slate-900 focus:border-blue-500"
                      }`}
                  />
                </div>
              </div>

              {hasUserEdits && (
                <div className={`p-2.5 rounded-xl border text-[11px] font-semibold flex items-center gap-2 ${isDark
                    ? "bg-amber-950/40 border-amber-500/40 text-amber-200"
                    : "bg-amber-50 border-amber-200 text-amber-800"
                  }`}>
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>Post-publication modifications detected. Revision has been updated accordingly.</span>
                </div>
              )}

              {/* Signature Authorities */}
              <div className="space-y-2.5 pt-1">
                <span className={`text-xs font-black uppercase tracking-wider block ${isDark ? "text-sky-300" : "text-blue-900"
                  }`}>
                  Signatures on Document
                </span>
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="space-y-1">
                    <label className={`text-[11px] font-bold block ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                      Timetable Incharge
                    </label>
                    <Input
                      value={pdfIncharge}
                      onChange={(e) => setPdfIncharge(e.target.value)}
                      placeholder="Mr. P.Dineshkumar"
                      className={`h-9 text-xs rounded-xl font-semibold ${isDark
                          ? "bg-slate-900/90 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-400"
                          : "bg-white border-slate-300 text-slate-900"
                        }`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={`text-[11px] font-bold block ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                      Class Counselor {pdfScope === 'current' ? `(${activeTab} - ${activeSection})` : ''}
                    </label>
                    <Input
                      value={pdfCounselor}
                      onChange={(e) => handleCounselorChange(e.target.value)}
                      placeholder="e.g. Mr. M. Murali"
                      list="class-counselor-options"
                      className={`h-9 text-xs rounded-xl font-semibold ${isDark
                          ? "bg-slate-900/90 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-400"
                          : "bg-white border-slate-300 text-slate-900"
                        }`}
                    />
                    <datalist id="class-counselor-options">
                      {(departmentFaculty[activeDept] || []).map((f) => (
                        <option key={f.id} value={f.name} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-1">
                    <label className={`text-[11px] font-bold block ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                      HOD Name
                    </label>
                    <Input
                      value={pdfHod}
                      onChange={(e) => setPdfHod(e.target.value)}
                      placeholder="Dr.J.Akilandeswari"
                      className={`h-9 text-xs rounded-xl font-semibold ${isDark
                          ? "bg-slate-900/90 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-400"
                          : "bg-white border-slate-300 text-slate-900"
                        }`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={`text-[11px] font-bold block ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                      Principal Name
                    </label>
                    <Input
                      value={pdfPrincipal}
                      onChange={(e) => setPdfPrincipal(e.target.value)}
                      placeholder="Dr.S.R.R.Senthil Kumar"
                      className={`h-9 text-xs rounded-xl font-semibold ${isDark
                          ? "bg-slate-900/90 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-400"
                          : "bg-white border-slate-300 text-slate-900"
                        }`}
                    />
                  </div>
                </div>
                <p className={`text-[11px] font-medium italic ${isDark ? "text-slate-300" : "text-slate-500"}`}>
                  * Blank signature space is left above each designation for physical signing after extracting the PDF.
                </p>
              </div>
            </div>

            <div className={`flex items-center justify-end gap-2.5 pt-3 border-t ${isDark ? "border-slate-800" : "border-slate-100"
              }`}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPdfModalOpen(false)}
                className={`rounded-xl text-xs font-bold ${isDark ? "border-slate-700 text-slate-200 hover:bg-slate-800 hover:text-white" : "border-slate-300 text-slate-700"
                  }`}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={exporting || !wefDate.trim()}
                onClick={confirmAndExportPdf}
                className="rounded-xl text-xs font-black bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white flex items-center gap-2 shadow-lg shadow-blue-500/30 px-4 h-9 transition-all hover:scale-[1.02]"
              >
                {exporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Generating PDF...</span>
                  </>
                ) : (
                  <>
                    <FileDown className="h-4 w-4" />
                    <span>Extract PDF</span>
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Fallback if no timetable generated and not loading/generating
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-[#f8faff] via-[#f5f8ff] to-[#fbf9ff] text-slate-900 p-4 select-none relative overflow-hidden">
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-br from-blue-200/40 via-blue-100/30 to-transparent blur-3xl opacity-75 pointer-events-none" />
      <div className="p-8 rounded-3xl bg-white/85 backdrop-blur-2xl border border-blue-200/80 shadow-[0_16px_48px_rgba(37,99,235,0.12),0_0_10px_-2px_rgba(37,99,235,0.06),inset_0_1px_1px_0_rgba(255,255,255,0.9)] flex flex-col items-center gap-4 max-w-md text-center z-10">
        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-500/15 to-blue-600/15 border border-blue-200/80 text-blue-600 shadow-sm shadow-blue-500/10">
          <AlertCircle className="h-8 w-8" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">Timetable Generation Incomplete</h2>
          <p className="text-xs text-blue-700/80 mt-1">
            Could not automatically generate valid timetables for the selected parameters.
          </p>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <Button
            onClick={() => handleGenerate()}
            className="rounded-xl font-bold px-4 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25 border-0"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Retry Generation
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/admin')}
            className="rounded-xl font-semibold px-4 py-2 text-xs border-blue-200 text-blue-800 hover:bg-blue-50"
          >
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );

}
