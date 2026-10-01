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
} from "@/lib/timetablePdfExport";
import {
  getDepartmentByName,
  getSubjectsForYear,
  getSpecialHoursConfigsForYear,
  getSubjectFacultyMapAllSections,
  getSectionSubjects,
  saveTimetable,
} from "@/lib/supabaseService";
import { generateAllYears, YearSectionResult, verifySubjectHours } from "@/lib/timetable";
import { SubjectHoursVerificationCard } from "@/components/admin/SubjectHoursVerificationCard";
import { buildFacultyAllocationMap } from "@/lib/facultyAllocation";
import type { WizardSelection } from "@/components/admin/GenerateWizardModal";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
      ? 'bg-white/[0.02] text-slate-500 border border-dashed border-white/10 hover:border-white/20' 
      : 'bg-slate-50/70 text-slate-400 border border-dashed border-slate-200 hover:border-slate-300';
  }
  if (cell === 'BREAK' || cell === 'LUNCH') {
    return isDark 
      ? 'bg-white/[0.02] text-slate-400 font-extrabold uppercase tracking-widest' 
      : 'bg-slate-100/90 text-slate-500 font-extrabold uppercase tracking-widest';
  }

  // All subjects have the exact same clean, uniform, professional styling
  return isDark 
    ? 'bg-[#121222] text-slate-100 border border-white/10 hover:border-emerald-500/50 hover:bg-[#16162a] shadow-sm' 
    : 'bg-white text-slate-900 border border-slate-200/90 hover:border-emerald-500/60 hover:bg-slate-50/80 shadow-sm';
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

function MiniGrid({
  grid,
  search,
  filterType,
  compact = false,
  onSwapSlots,
  getFaculty,
  showFaculty = true,
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
    <div className={`overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10 shadow-sm bg-white dark:bg-[#0c0c18] ${compact ? 'max-h-[300px]' : ''}`}>
      <table className="w-full border-collapse" style={{ minWidth: compact ? 650 : 1180 }}>
        <thead>
          <tr className="bg-[#064e3b] dark:bg-[#064e3b] text-white">
            <th className="py-3 px-3 text-center font-bold text-xs sm:text-[13px] uppercase tracking-wider w-20 border-r border-emerald-700/60 sticky left-0 z-20 bg-[#064e3b]">
              Day
            </th>
            {GRID_COLUMNS.map((col) => (
              <th
                key={col.key}
                className={`py-2.5 px-2 text-center border-r border-emerald-700/60 last:border-r-0 ${
                  col.isDivider ? "w-20 sm:w-24 bg-[#053d2e]" : "min-w-[125px]"
                }`}
              >
                <div className="flex flex-col items-center justify-center">
                  <span className="text-xs sm:text-[13px] font-bold text-white tracking-wide">
                    {col.label}
                  </span>
                  <span className="text-[10px] sm:text-[11px] font-mono text-emerald-100/90 mt-0.5">
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
                {/* Day Header Cell */}
                <td className={`py-2 px-3 text-center border-r font-semibold select-none sticky left-0 z-10 ${
                  isDark ? "bg-[#0e0e1b] border-white/10" : "bg-slate-50 border-slate-200"
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
                          <span className="text-xs font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase">
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

                  const faculties = (getFaculty && cell) ? getFaculty(cell) : [];
                  const facultyLabel = faculties.join(' / ');

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
                          setDragSource({ day: dayIdx, period: pIdx, subject: cell });
                        }}
                        onDragEnd={() => {
                          setDragSource(null);
                          setDragOverTarget(null);
                        }}
                        title={
                          cell
                            ? `${cell}${facultyLabel ? ` • Staff: ${facultyLabel}` : ''}${canDrag ? ' (Drag to swap period)' : ''}`
                            : canDrop
                            ? 'Empty Period (Drop subject here to reschedule)'
                            : ''
                        }
                        className={`
                          rounded-xl flex flex-col justify-center items-center p-2 sm:p-2.5 transition-all duration-200 relative select-none
                          ${compact ? 'h-12' : showFaculty ? 'min-h-[78px] sm:min-h-[86px]' : 'min-h-[64px] sm:min-h-[72px]'}
                          ${getCellStyle(cell, isDark)}
                          ${canDrag ? 'cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5' : ''}
                          ${isDraggingThis ? 'opacity-30 scale-95 border-2 border-dashed border-emerald-500' : ''}
                          ${isTargetThis ? 'ring-2 ring-emerald-500 bg-emerald-500/20 scale-105 z-20 shadow-xl' : ''}
                          ${highlight ? 'ring-2 ring-emerald-500 scale-105 z-10' : ''}
                          ${isDimmed ? 'opacity-25' : ''}
                        `}
                      >
                        {/* Subject Name */}
                        <div className="flex-1 flex items-center justify-center text-center my-0.5 w-full">
                          <span className="text-xs sm:text-[13px] font-bold tracking-tight leading-snug line-clamp-2 text-slate-900 dark:text-slate-100">
                            {cell && cell.toLowerCase().includes('open elective') ? 'Open Elective' : (cell || '')}
                          </span>
                        </div>

                        {/* Faculty name if enabled */}
                        {showFaculty && facultyLabel && (
                          <span
                            className="text-[10px] sm:text-[11px] font-semibold text-slate-600 dark:text-slate-300 text-center uppercase tracking-wide truncate w-full mt-1 opacity-90"
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
        <div key={i} className={`flex items-center gap-3.5 px-4 py-3 rounded-xl border transition-all ${
          isDark 
            ? "bg-white/[0.03] border-white/8 hover:bg-white/[0.05] text-white" 
            : "bg-white border-slate-200 hover:bg-slate-50 text-slate-800 shadow-sm"
        }`}>
          <span className="text-xs font-extrabold uppercase w-10 text-slate-500 shrink-0">{item.day}</span>
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
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

function FullScreenGrid({
  grid,
  onSwapSlots,
  getFaculty,
  showFaculty = true,
}: {
  grid: string[][];
  onSwapSlots?: (source: { day: number; period: number }, target: { day: number; period: number }) => void;
  getFaculty?: (subject: string) => string[];
  showFaculty?: boolean;
}) {
  const { isDark } = useDarkMode();
  const safeGrid = Array.isArray(grid) ? grid : [];

  const [dragSource, setDragSource] = useState<{ day: number; period: number; subject: string } | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ day: number; period: number } | null>(null);
  const [selectedTapSlot, setSelectedTapSlot] = useState<{ day: number; period: number; subject: string } | null>(null);

  const cols = [
    { key: 'day', label: 'Day', time: '', widthPercent: '5%', isDivider: false, pIdx: null },
    { key: 'p1', label: 'P1', time: '9:00–9:55', widthPercent: '11%', isDivider: false, pIdx: 0 },
    { key: 'p2', label: 'P2', time: '9:55–10:50', widthPercent: '11%', isDivider: false, pIdx: 1 },
    { key: 'b1', label: 'BREAK', time: '10:50–11:05', widthPercent: '6%', isDivider: true, pIdx: null },
    { key: 'p3', label: 'P3', time: '11:05–12:00', widthPercent: '11%', isDivider: false, pIdx: 2 },
    { key: 'p4', label: 'P4', time: '12:00–12:55', widthPercent: '11%', isDivider: false, pIdx: 3 },
    { key: 'lunch', label: 'LUNCH', time: '12:55–1:55', widthPercent: '6%', isDivider: true, pIdx: null },
    { key: 'p5', label: 'P5', time: '1:55–2:50', widthPercent: '11%', isDivider: false, pIdx: 4 },
    { key: 'p6', label: 'P6', time: '2:50–3:45', widthPercent: '11%', isDivider: false, pIdx: 5 },
    { key: 'b2', label: 'BREAK', time: '3:45–3:55', widthPercent: '6%', isDivider: true, pIdx: null },
    { key: 'p7', label: 'P7', time: '3:55–4:50', widthPercent: '11%', isDivider: false, pIdx: 6 },
  ];

  const handleCellTap = (dayIdx: number, pIdx: number, cell: string) => {
    if (!onSwapSlots || pIdx === null) return;
    if (!selectedTapSlot) {
      if (cell && cell.trim() !== '') {
        setSelectedTapSlot({ day: dayIdx, period: pIdx, subject: cell });
      }
    } else {
      if (selectedTapSlot.day === dayIdx && selectedTapSlot.period === pIdx) {
        setSelectedTapSlot(null);
      } else {
        onSwapSlots(selectedTapSlot, { day: dayIdx, period: pIdx });
        toast.success(`Swapped ${selectedTapSlot.subject} with ${cell || 'Empty Slot'}`);
        setSelectedTapSlot(null);
      }
    }
  };

  return (
    <div className="w-full h-full flex flex-col rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c0c18] shadow-sm select-none relative">
      {/* Mobile scroll hint */}
      <div className="xl:hidden px-2.5 py-1 bg-emerald-500/10 dark:bg-emerald-500/15 border-b border-emerald-500/20 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-between shrink-0">
        <span className="flex items-center gap-1.5 truncate">
          <ArrowLeftRight className="h-3 w-3 text-emerald-500 shrink-0" />
          <span>Swipe horizontally for all periods • Tap slots to swap</span>
        </span>
        {selectedTapSlot && (
          <button
            onClick={() => setSelectedTapSlot(null)}
            className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold underline shrink-0 ml-2"
          >
            Cancel swap
          </button>
        )}
      </div>

      {/* Main scrollable grid viewport with sticky day column */}
      <div className="flex-1 min-h-0 w-full overflow-x-auto overflow-y-auto">
        <div className="w-full min-w-[940px] xl:min-w-0 xl:w-full h-full flex flex-col">
          {/* Header */}
          <div className="h-9 shrink-0 bg-[#064e3b] dark:bg-[#064e3b] text-white grid grid-cols-[70px_repeat(2,minmax(115px,1fr))_86px_repeat(2,minmax(115px,1fr))_86px_repeat(2,minmax(115px,1fr))_86px_minmax(115px,1fr))] xl:grid-cols-[5%_11%_11%_6%_11%_11%_6%_11%_11%_6%_11%] border-b border-emerald-800 sticky top-0 z-30">
            {cols.map((col, idx) => (
              <div
                key={col.key}
                className={`flex flex-col items-center justify-center leading-none border-r border-emerald-700/60 last:border-r-0 p-1 ${
                  col.isDivider ? "bg-[#053d2e]" : ""
                } ${idx === 0 ? "sticky left-0 z-40 bg-[#064e3b] shadow-[2px_0_4px_rgba(0,0,0,0.2)]" : ""}`}
              >
                <span className="text-xs sm:text-[13px] font-extrabold text-white tracking-wide uppercase">
                  {col.label}
                </span>
                {col.time && (
                  <span className="text-[10px] xl:text-[10.5px] font-mono text-emerald-100/90 mt-0.5 whitespace-nowrap leading-none tracking-tight">
                    ({col.time})
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Body: 6 equal rows */}
          <div className="flex-1 min-h-0 grid grid-rows-6 divide-y divide-slate-100 dark:divide-white/5">
            {safeGrid.map((row, dayIdx) => {
              const r = Array.isArray(row) ? row : [];
              const displayRow: string[] = [
                r[0] || '', r[1] || '', 'BREAK', r[2] || '', r[3] || '', 'LUNCH', r[4] || '', r[5] || '', 'BREAK', r[6] || ''
              ];

              return (
                <div
                  key={dayIdx}
                  className="grid grid-cols-[70px_repeat(2,minmax(115px,1fr))_86px_repeat(2,minmax(115px,1fr))_86px_repeat(2,minmax(115px,1fr))_86px_minmax(115px,1fr))] xl:grid-cols-[5%_11%_11%_6%_11%_11%_6%_11%_11%_6%_11%] h-full min-h-[58px] xl:min-h-0 transition-colors hover:bg-slate-50/50 dark:hover:bg-white/[0.01]"
                >
                  {/* Sticky Day column */}
                  <div className="flex items-center justify-center border-r border-slate-200 dark:border-white/10 font-extrabold text-xs sm:text-sm text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-[#0e0e1b] sticky left-0 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.06)] uppercase tracking-wider">
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
                          className="border-r border-slate-200 dark:border-white/5 bg-slate-100/80 dark:bg-white/[0.02] flex items-center justify-center select-none"
                        >
                          <span className="text-xs sm:text-[13px] font-extrabold tracking-widest text-slate-500 dark:text-slate-400 uppercase whitespace-nowrap">
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
                    const faculties = (getFaculty && cell) ? getFaculty(cell) : [];
                    const facultyLabel = faculties.join(' / ');

                    return (
                      <div
                        key={colIdx}
                        className="p-1 border-r border-slate-200 dark:border-white/5 last:border-r-0 h-full min-h-0 overflow-hidden flex items-center justify-center"
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
                            setDragSource({ day: dayIdx, period: pIdx, subject: cell });
                          }}
                          onDragEnd={() => {
                            setDragSource(null);
                            setDragOverTarget(null);
                          }}
                          title={
                            cell
                              ? `${cell}${facultyLabel ? ` • Staff: ${facultyLabel}` : ''}${canDrag ? ' (Drag or tap to swap)' : ''}`
                              : canDrop
                              ? 'Empty Period (Click or drop to place subject)'
                              : ''
                          }
                          className={`
                            rounded-lg flex flex-col justify-center items-center px-1.5 py-0.5 transition-all duration-150 h-full w-full select-none text-center overflow-hidden cursor-pointer
                            ${getCellStyle(cell, isDark)}
                            ${canDrag ? 'cursor-grab active:cursor-grabbing hover:shadow-md hover:scale-[1.01]' : ''}
                            ${isDraggingThis ? 'opacity-30 scale-95 border-2 border-dashed border-emerald-500' : ''}
                            ${isTargetThis ? 'ring-2 ring-emerald-500 bg-emerald-500/20 scale-105 z-20 shadow-xl' : ''}
                            ${isTapSelectedThis ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-white dark:ring-offset-[#0c0c18] bg-emerald-500/25 scale-[1.02] z-20 shadow-lg' : ''}
                            ${selectedTapSlot && !isTapSelectedThis ? 'hover:ring-2 hover:ring-emerald-400/60 hover:bg-emerald-500/10' : ''}
                          `}
                        >
                          <span className="text-xs font-bold tracking-tight text-center leading-snug line-clamp-2 w-full text-slate-900 dark:text-slate-100">
                            {cell && cell.toLowerCase().includes('open elective') ? 'Open Elective' : (cell || '')}
                          </span>

                          {showFaculty && facultyLabel && (
                            <span
                              className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 text-center uppercase tracking-wide truncate w-full mt-0.5 opacity-90 leading-tight"
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
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 dark:bg-[#141426]/95 text-white backdrop-blur-md px-3.5 py-1.5 rounded-full shadow-2xl border border-emerald-500/40 flex items-center gap-2.5 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="font-semibold truncate max-w-[180px] sm:max-w-xs">
            Selected: <span className="text-emerald-300 font-bold">{selectedTapSlot.subject}</span> ({DAYS[selectedTapSlot.day]} P{selectedTapSlot.period + 1})
          </span>
          <span className="text-slate-400 text-[11px] hidden sm:inline">• Tap destination slot to swap</span>
          <button
            onClick={() => setSelectedTapSlot(null)}
            className="p-1 hover:bg-white/15 rounded-full transition-colors ml-1 text-slate-300 hover:text-white"
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
  showFaculty = true,
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
    <div className="w-full h-full flex flex-col rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c0c18] shadow-sm select-none">
      {/* Day Selector Pills */}
      <div className="bg-[#064e3b] dark:bg-[#064e3b] px-3 py-2 flex items-center justify-between shrink-0 gap-2 border-b border-emerald-800 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 min-w-max">
          <span className="text-xs font-bold text-white uppercase mr-1">Day:</span>
          {DAYS.map((d, idx) => (
            <button
              key={d}
              onClick={() => setActiveDayIdx(idx)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                activeDayIdx === idx
                  ? "bg-white text-slate-900 shadow-md scale-105"
                  : "bg-emerald-800/80 text-emerald-100 hover:bg-emerald-700"
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
                ${isSelected ? 'ring-2 ring-emerald-500 bg-emerald-500/20 scale-[1.01]' : 'hover:border-emerald-500/40'}
              `}
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
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
                  <Users className="h-3 w-3 text-emerald-500 shrink-0" />
                  <span className="truncate">{facultyLabel}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedTapSlot && (
        <div className="p-2.5 bg-slate-900 text-white flex items-center justify-between text-xs shrink-0 border-t border-emerald-500/30">
          <span className="truncate font-semibold">
            Selected: <span className="text-emerald-300 font-bold">{selectedTapSlot.subject}</span> • Tap any period to swap
          </span>
          <button
            onClick={() => setSelectedTapSlot(null)}
            className="p-1 hover:bg-white/20 rounded-full ml-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function FullScreenAllocationTable({
  rows,
  isDark,
}: {
  rows: { code: string; title: string; category: string; hours: number; faculty: string }[];
  isDark: boolean;
}) {
  const [viewType, setViewType] = useState<'table' | 'cards'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q ||
        r.title.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        r.faculty.toLowerCase().includes(q);
      const matchCat = categoryFilter === 'all' || r.category.toLowerCase() === categoryFilter.toLowerCase();
      return matchSearch && matchCat;
    });
  }, [rows, searchQuery, categoryFilter]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(r => { if (r.category) set.add(r.category); });
    return ['all', ...Array.from(set)];
  }, [rows]);

  const mid = Math.ceil(filteredRows.length / 2);
  const leftRows = filteredRows.slice(0, mid);
  const rightRows = filteredRows.slice(mid);

  const renderCardsView = () => (
    <div className="w-full h-full overflow-y-auto p-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
      {filteredRows.length === 0 ? (
        <div className="col-span-full py-8 text-center text-xs text-muted-foreground italic">
          No courses match current filter.
        </div>
      ) : (
        filteredRows.map((row, idx) => (
          <div
            key={idx}
            className={`p-3 rounded-xl border transition-all ${
              isDark
                ? "bg-[#101022] border-white/10 hover:border-emerald-500/40"
                : "bg-white border-slate-200 hover:border-emerald-500/50 shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between gap-1.5 mb-1.5">
              <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-slate-200">
                {row.code}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 capitalize">
                  {row.category}
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300">
                  {row.hours}h
                </span>
              </div>
            </div>
            <div className="font-bold text-xs sm:text-[13px] text-slate-900 dark:text-slate-100 line-clamp-2 mb-1.5">
              {row.title}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
              <Users className="h-3 w-3 text-emerald-500 shrink-0" />
              <span className="truncate">{row.faculty}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );

  const renderSplitTable = (subRows: typeof rows, startIdx: number) => (
    <div className="w-full h-full overflow-x-auto overflow-y-auto rounded-lg border border-slate-200/80 dark:border-white/5">
      <table className="w-full h-full table-fixed border-collapse text-left" style={{ minWidth: 440 }}>
        <colgroup>
          <col style={{ width: '18%' }} />
          <col style={{ width: '42%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '19%' }} />
        </colgroup>
        <thead>
          <tr className="bg-[#053d2e] dark:bg-[#053d2e] text-white text-xs uppercase font-bold tracking-wider h-7 shrink-0 sticky top-0 z-10">
            <th className="px-2.5 border-r border-emerald-700/60 py-1">Code</th>
            <th className="px-2.5 border-r border-emerald-700/60 py-1">Course Title</th>
            <th className="px-1 text-center border-r border-emerald-700/60 py-1">Category</th>
            <th className="px-1 text-center border-r border-emerald-700/60 py-1">Hrs</th>
            <th className="px-2.5 py-1">Faculty</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/5 h-[calc(100%-28px)]">
          {subRows.map((row, idx) => (
            <tr
              key={idx}
              style={{ height: `${100 / Math.max(subRows.length, 1)}%` }}
              className={`transition-colors ${
                isDark
                  ? (startIdx + idx) % 2 === 0 ? "bg-white/[0.01]" : "bg-white/[0.03]"
                  : (startIdx + idx) % 2 === 0 ? "bg-white" : "bg-slate-50/60"
              } hover:bg-emerald-500/5`}
            >
              <td className="px-2.5 font-mono font-bold text-xs text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-white/5 truncate align-middle">
                {row.code}
              </td>
              <td className="px-2.5 font-bold text-xs text-slate-900 dark:text-slate-100 border-r border-slate-100 dark:border-white/5 truncate align-middle">
                {row.title}
              </td>
              <td className="px-1 text-center font-medium text-xs text-slate-600 dark:text-slate-400 capitalize border-r border-slate-100 dark:border-white/5 truncate align-middle">
                {row.category}
              </td>
              <td className="px-1 text-center font-bold text-xs text-slate-800 dark:text-slate-200 border-r border-slate-100 dark:border-white/5 align-middle">
                {row.hours}
              </td>
              <td className="px-2.5 font-semibold text-xs text-slate-800 dark:text-slate-200 truncate align-middle">
                {row.faculty}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c0c18] shadow-sm select-none">
      {/* Allocation Header */}
      <div className="bg-[#064e3b] text-white px-2.5 sm:px-3 py-1.5 flex flex-wrap items-center justify-between shrink-0 gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-extrabold uppercase tracking-wider truncate">
            Subjects &amp; Faculty Allocation
          </span>
          <span className="text-[10px] font-mono text-emerald-200 font-semibold px-2 py-0.5 rounded-md bg-emerald-900/60 border border-emerald-500/30">
            {filteredRows.length} total subjects
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Search Box */}
          <div className="relative w-28 sm:w-40">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-emerald-300" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="h-6.5 pl-6 text-[11px] rounded-lg bg-black/20 border-white/10 text-white placeholder:text-emerald-200/50"
            />
          </div>

          {/* Mobile view format toggle (Table vs Cards) */}
          <div className="flex items-center gap-0.5 bg-black/20 p-0.5 rounded-lg border border-white/10 xl:hidden">
            <button
              onClick={() => setViewType('table')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                viewType === 'table' ? 'bg-white/20 text-white shadow-sm' : 'text-emerald-200 hover:text-white'
              }`}
              title="Table View"
            >
              Table
            </button>
            <button
              onClick={() => setViewType('cards')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                viewType === 'cards' ? 'bg-white/20 text-white shadow-sm' : 'text-emerald-200 hover:text-white'
              }`}
              title="Card View (Best for mobile)"
            >
              Cards
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 w-full overflow-hidden p-1 flex flex-col">
        {viewType === 'cards' ? (
          renderCardsView()
        ) : filteredRows.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-xs italic text-muted-foreground">
            No courses match current filter.
          </div>
        ) : (
          <div className={`w-full h-full overflow-hidden grid grid-cols-1 ${rightRows.length > 0 ? 'xl:grid-cols-2' : ''} gap-1.5`}>
            {renderSplitTable(leftRows, 0)}
            {rightRows.length > 0 && renderSplitTable(rightRows, mid)}
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
  } | null;

  const storeSemesterType = useTimetableStore((s) => s.semesterType);
  const semesterType: 'odd' | 'even' = stateData?.semesterType || storeSemesterType || 'odd';

  const rawSelections = stateData?.selections || [];
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

  // Generation progress state
  type ProgressStatus = 'idle' | 'running' | 'ok' | 'error';
  type ProgressItem = { departmentName: string; year: string; section: string; status: ProgressStatus; error?: string };
  const [generating, setGenerating] = useState(false);
  const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);
  const [showProgress, setShowProgress] = useState(false);
  const [generatedResults, setGeneratedResults] = useState<GeneratedTimetableResult[]>([]);
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

  const [showFacultyInGrid, setShowFacultyInGrid] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [fullScreenPage, setFullScreenPage] = useState<'timetable' | 'allocation'>('timetable');
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictData, setConflictData] = useState<{
    conflicts: FacultyConflict[];
    source: { day: number; period: number; subject: string };
    target: { day: number; period: number; subject: string };
  } | null>(null);

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

  const getFacultyNamesForCell = (cell: string) => {
    return getFacultyForSubject(
      cell,
      activeDept,
      activeTab,
      activeSection,
      subjectsData,
      specialHoursData
    );
  };

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
      specialHoursData
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

    // Add curriculum subjects
    subjects.forEach((sub) => {
      const isMapped = !mappedSet || mappedSet.size === 0 || mappedSet.has(sub.id);
      if (!isMapped) return;

      const fac = sub.facultyBySection[activeSection] || '—';
      const cat = sub.type ? (sub.type.charAt(0).toUpperCase() + sub.type.slice(1)) : 'Theory';

      rows.push({
        code: sub.code || '—',
        title: sub.name,
        category: cat,
        hours: sub.hoursPerWeek,
        faculty: fac,
      });
    });

    // Add active special hours (e.g. Library, Seminar, Counselling)
    specialList
      .filter((sp: any) => sp.is_active && (sp.total_hours || 0) > 0)
      .forEach((sp: any) => {
        const exists = rows.some((r) => r.title.toLowerCase() === sp.special_type.toLowerCase());
        if (!exists) {
          rows.push({
            code: '—',
            title: sp.special_type,
            category: 'Special',
            hours: sp.total_hours,
            faculty: sp.faculty_name || '—',
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
        const found = rows.some(
          (r) =>
            r.title.toLowerCase() === subName.toLowerCase() ||
            (r.code && r.code !== '—' && r.code.toLowerCase() === subName.toLowerCase())
        );
        if (!found) {
          const faculties = getFacultyForSubject(
            subName,
            activeDept,
            activeTab,
            activeSection,
            subjectsData,
            specialHoursData
          );
          const fac = faculties.length > 0 ? faculties.join(' / ') : '—';
          const isLab = subName.toLowerCase().includes('lab');
          const isElective = subName.toLowerCase().includes('elective');
          const isSpecial = ['library', 'seminar', 'counselling', 'mentor', 'project'].some((k) =>
            subName.toLowerCase().includes(k)
          );

          rows.push({
            code: '—',
            title: subName,
            category: isSpecial ? 'Special' : isLab ? 'Lab' : isElective ? 'Elective' : 'Theory',
            hours: count,
            faculty: fac,
          });
        }
      });
    }

    return rows;
  }, [subjectsData, specialHoursData, sectionSubjectsData, activeDept, activeTab, activeSection, generatedResults]);

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

  // Aligns default active section when activeDept, activeTab, or generatedResults changes
  useEffect(() => {
    if (generatedResults.length > 0) {
      const yearResults = generatedResults.filter(r => r.departmentName === activeDept && r.year === activeTab);
      if (yearResults.length > 0) {
        const sections = yearResults.map(r => r.section);
        if (!sections.includes(activeSection)) {
          setActiveSection(sections[0]);
        }
      }
    }
  }, [activeDept, activeTab, generatedResults]);

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

      for (const deptSel of selections) {
        const dept = await getDepartmentByName(deptSel.departmentName);
        if (!dept) {
          toast.error(`Department ${deptSel.departmentName} not found`);
          continue;
        }
        deptIdsMap[deptSel.departmentName] = dept.id;

        await Promise.all(
          deptSel.selectedYears.map(async ({ year, sections }) => {
            const key = `${deptSel.departmentName}_${year}`;
            
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
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load review data");
    } finally {
      setLoading(false);
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

      if (totalOk > 0) {
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
    }
  };

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
          const deptId = deptIds[r.departmentName];
          if (!deptId) throw new Error(`Department ID not found for ${r.departmentName}`);
          
          await saveTimetable(
            deptId,
            r.year,
            r.section,
            r.grid,
            { seminar: false, library: false, counselling: false }
          );
        })
      );

      toast.success("All timetables published successfully!");
      navigate("/admin");
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Failed to publish timetables.");
    } finally {
      setPublishing(false);
    }
  };

  const handleExportPDF = async (scope: 'all' | 'year' | 'current' = 'all') => {
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
        const allYearSubjects = subjectsData[key] || [];
        const sectionSpecificIds = sectionSubjectsData[key]?.[r.section];

        const filteredSubjects = (sectionSpecificIds && sectionSpecificIds.size > 0)
          ? allYearSubjects.filter((s) => sectionSpecificIds.has(s.id))
          : allYearSubjects;

        const exportSubjects = filteredSubjects.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          type: s.type,
          hoursPerWeek: s.hoursPerWeek,
          staff: s.facultyBySection[r.section] || ''
        }));

        const exportSpecialHours = (specialHoursData[key] || []).map((h) => ({
          name: h.name,
          title: h.name,
          type: 'special',
          hours: h.total_hours || 1,
          staff: ''
        }));

        return {
          departmentName: r.departmentName,
          year: r.year,
          section: r.section,
          grid: r.grid,
          departmentId: deptIds[r.departmentName],
          subjects: exportSubjects,
          specialHours: exportSpecialHours
        };
      });

      await exportTimetablesToPdf(exportItems, customFileName);
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

  const currentYearResults = generatedResults.filter(r => r.departmentName === activeDept && r.year === activeTab);
  const activeResult = currentYearResults.find((r) => r.section === activeSection);

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
      <main className={`min-h-screen transition-colors duration-300 ${isDark ? "bg-[#07070d] text-slate-100" : "bg-[#f5f5f7] text-slate-900"}`}>
        <AdminNavbar />
        <div className="md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80">
          <SelectionHeader />
          <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
            <Loader2 className={`h-8 w-8 animate-spin ${isDark ? "text-emerald-450" : "text-emerald-600"}`} />
            <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>Preparing generation review data...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={`min-h-screen pb-24 transition-colors duration-300 ${
      isDark ? "bg-[#07070d] text-slate-100" : "bg-[#f5f5f7] text-slate-900"
    }`}>
      <AdminNavbar />
      <div className="md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80">
        <SelectionHeader />
        
        <div className="container py-6 max-w-7xl">
          {/* Header */}
          <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className={`flex items-center gap-2 text-xs mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                <span>Admin Dashboard</span>
                <span>/</span>
                <span>Review &amp; Generate</span>
              </div>
              <div className="flex items-center gap-3">
                <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                  Review &amp; Generate Timetables
                </h1>
                <Badge className={`text-xs px-2.5 py-0.5 font-bold ${
                  semesterType === 'even'
                    ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                    : "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                }`}>
                  {semesterType === 'even' ? "Even Semester (Years II, III & IV)" : "Odd Semester"}
                </Badge>
              </div>
              <p className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-slate-650"}`}>
                Active View: <span className="text-emerald-500 font-semibold">{activeDept}</span>
              </p>
            </div>
            
            <Button
              variant="outline"
              onClick={() => navigate("/admin")}
              className={`rounded-xl gap-2 self-start sm:self-auto ${
                isDark 
                  ? "border-white/10 bg-white/5 hover:bg-white/10 text-white" 
                  : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-sm"
              }`}
            >
              <ArrowLeft className="h-4 w-4" /> Back to Dashboard
            </Button>
          </header>

          {/* Department Selector Navbar Tabs */}
          <div className={`flex border-b mb-4 gap-1 shrink-0 overflow-x-auto ${isDark ? "border-white/10" : "border-slate-200"}`}>
            {selections.map(({ departmentName }) => (
              <button
                key={departmentName}
                onClick={() => {
                  setActiveDept(departmentName);
                  const deptSel = selections.find(d => d.departmentName === departmentName);
                  if (deptSel && deptSel.selectedYears.length > 0) {
                    setActiveTab(deptSel.selectedYears[0].year);
                  }
                }}
                className={`px-5 py-3 text-sm font-bold border-b-2 transition-all ${
                  activeDept === departmentName
                    ? "border-emerald-500 text-emerald-600 dark:text-emerald-450 bg-emerald-500/[0.04] dark:bg-white/2"
                    : `border-transparent ${isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-850"}`
                }`}
              >
                {departmentName}
              </button>
            ))}
          </div>

          {/* Year Tabs */}
          <div className={`flex border-b mb-6 gap-1 shrink-0 ${isDark ? "border-white/10" : "border-slate-200"}`}>
            {(activeDeptSelection?.selectedYears || []).map(({ year }) => {
              const isActive = activeTab === year;
              return (
                <button
                  key={year}
                  onClick={() => setActiveTab(year)}
                  className={`px-5 py-3 text-sm font-bold border-b-2 transition-all ${
                    isActive
                      ? "border-emerald-500 text-emerald-600 dark:text-emerald-450 bg-emerald-500/[0.04] dark:bg-white/2"
                      : `border-transparent ${isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-850"}`
                  }`}
                >
                  Year {year}
                  <Badge variant="secondary" className={`ml-2 font-mono ${
                    isDark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700 border border-slate-200"
                  }`}>
                    {subjectsData[`${activeDept}_${year}`]?.length || 0} subjects
                  </Badge>
                </button>
              );
            })}
          </div>

          {/* Quick Return Banner if timetables were generated */}
          {generatedResults.length > 0 && (
            <div className={`mb-6 p-4 rounded-2xl border flex items-center justify-between gap-4 transition-all shadow-sm ${
              isDark 
                ? "bg-emerald-500/10 border-emerald-500/30 text-white" 
                : "bg-emerald-50 border-emerald-300 text-slate-900"
            }`}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-500">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">
                    Timetables Generated ({generatedResults.filter(r => r.status === 'ok').length} Class Schedules Ready)
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Timetable is ready in full-screen distraction-free mode.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setIsFullScreen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-2 font-bold px-4 py-2 text-xs shadow-md shadow-emerald-500/25 shrink-0"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span>Open Full Screen</span>
              </Button>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-4">
              {/* Left side: Config / Stats (1 col) */}
              <div className="lg:col-span-1 space-y-6">
                {/* Hours Validator Card */}
                <Card className={`rounded-2xl shadow-lg border transition-colors duration-300 ${
                  isDark ? "bg-[#0e0e1b] border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"
                }`}>
                  <CardHeader className={`pb-3 border-b ${isDark ? "border-white/5" : "border-slate-100"}`}>
                    <CardTitle className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}>
                      Hour Validator
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="space-y-4">
                      {activeYearSections.map((sec) => {
                        const hours = activeTotalHoursBySection[sec] || 0;
                        return (
                          <div key={sec} className={`space-y-1.5 border-b pb-3 last:border-b-0 last:pb-0 ${
                            isDark ? "border-white/5" : "border-slate-100"
                          }`}>
                            <div className="flex items-center justify-between">
                              <span className={`text-xs font-bold ${isDark ? "text-slate-300" : "text-slate-655"}`}>Section {sec}</span>
                              <span className={`text-xs font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
                                {hours}h <span className={`font-normal ${isDark ? "text-slate-500" : "text-slate-400"}`}>/ 42h</span>
                              </span>
                            </div>
                            
                            <div className={`h-1.5 w-full rounded-full overflow-hidden ${isDark ? "bg-white/5" : "bg-slate-100"}`}>
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  hours === 42 ? "bg-emerald-500" : hours > 42 ? "bg-red-500" : "bg-amber-500"
                                }`}
                                style={{ width: `${Math.min(100, (hours / 42) * 100)}%` }}
                              />
                            </div>

                            {hours === 42 ? (
                              <div className="flex items-center gap-1 text-emerald-500 text-[10px] font-semibold">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                Perfect 42 hours.
                              </div>
                            ) : hours > 42 ? (
                              <div className="flex items-center gap-1 text-red-500 text-[10px] font-semibold">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                Overloaded ({hours - 42}h extra).
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-amber-500 text-[10px] font-semibold">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                Underloaded ({42 - hours}h left).
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Special Hours Config Card */}
                <Card className={`rounded-2xl shadow-lg border transition-colors duration-300 ${
                  isDark ? "bg-[#0e0e1b] border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"
                }`}>
                  <CardHeader className={`pb-3 border-b flex flex-row items-center justify-between ${
                    isDark ? "border-white/5" : "border-slate-100"
                  }`}>
                    <CardTitle className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}>
                      Special Hours
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSpecialHoursDialogOpen(true)}
                      className={`h-7 text-xs p-0 hover:bg-transparent ${
                        isDark ? "text-emerald-400 hover:text-emerald-300" : "text-emerald-600 hover:text-emerald-700"
                      }`}
                    >
                      Edit
                    </Button>
                  </CardHeader>
                  <CardContent className="pt-4">
                    {activeYearSpecialHours.length === 0 ? (
                      <div className={`text-xs italic py-2 ${isDark ? "text-slate-500" : "text-slate-450"}`}>
                        No active special hours config
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {activeYearSpecialHours.map((h, idx) => (
                          <div key={idx} className={`flex justify-between items-center border p-2 rounded-xl text-xs ${
                            isDark 
                              ? "bg-white/5 border-white/8 text-white" 
                              : "bg-slate-50 border-slate-100 text-slate-700"
                          }`}>
                            <span className={`font-semibold capitalize ${isDark ? "text-white" : "text-slate-800"}`}>{h.special_type}</span>
                            <span className={isDark ? "text-slate-400" : "text-slate-500"}>{h.total_hours} hr(s) total</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right side: Subjects Table (3 cols) */}
              <div className="lg:col-span-3">
                <Card className={`rounded-2xl shadow-lg overflow-hidden border transition-colors duration-300 ${
                  isDark ? "bg-[#0e0e1b] border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"
                }`}>
                  <CardHeader className={`pb-3 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                    isDark ? "border-white/5" : "border-slate-100"
                  }`}>
                    <div>
                      <CardTitle className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
                        Curriculum &amp; Section Allocations
                      </CardTitle>
                      <p className={`text-xs mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        {activeTab === 'IV' && semesterType === 'even'
                          ? "Final Year (Year IV) Even Semester uses a static timetable: All weekday periods & Saturday P1-P2 are Project (37h), followed by Seminar (P3-P4), Library (P5), and Counselling (P6-P7)."
                          : "Check subject type, hour load, and faculty names per section."}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/admin/subjects`)}
                      className={`rounded-xl text-xs ${
                        isDark 
                          ? "border-white/10 bg-white/5 hover:bg-white/10 text-white" 
                          : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-sm"
                      }`}
                    >
                      Manage Subjects
                    </Button>
                  </CardHeader>
                  
                  {/* Subject type filtering navbar */}
                  <div className={`px-6 py-2.5 border-b flex gap-1 overflow-x-auto shrink-0 ${
                    isDark ? "bg-white/[0.02] border-white/5" : "bg-slate-50/50 border-slate-100"
                  }`}>
                    {[
                      { id: 'all', label: 'All Subjects' },
                      { id: 'theory-elective', label: 'Theory / Electives' },
                      { id: 'lab', label: 'Labs' },
                      { id: 'open-elective', label: 'Open Electives' },
                      { id: 'special', label: 'Special Hours' },
                    ].map((tab) => {
                      const isActive = reviewTypeFilter === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setReviewTypeFilter(tab.id as any)}
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            isActive
                              ? (isDark ? "bg-white/15 text-white shadow-sm" : "bg-emerald-500 text-white shadow-sm")
                              : (isDark ? "text-white/40 hover:text-white/70" : "text-slate-500 hover:text-slate-800")
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className={`font-semibold border-b ${
                            isDark 
                              ? "bg-white/3 text-slate-400 border-white/5" 
                              : "bg-slate-50 text-slate-500 border-slate-100"
                          }`}>
                            <th className="py-3 px-4 w-20">Code</th>
                            <th className="py-3 px-4">Subject Name</th>
                            <th className="py-3 px-4 w-28">Type</th>
                            <th className="py-3 px-4 w-20">Hours</th>
                            {activeYearSections.map((sec) => (
                              <th key={sec} className="py-3 px-4 text-center">Sec {sec} Faculty</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredReviewSubjects.length === 0 ? (
                            <tr>
                              <td colSpan={4 + activeYearSections.length} className={`py-12 text-center italic ${
                                isDark ? "text-slate-500" : "text-slate-450"
                              }`}>
                                No subjects of this type configured for Year {activeTab}.
                              </td>
                            </tr>
                          ) : reviewTypeFilter === 'open-elective' ? (
                            /* Open Elective — grouped display */
                            <tr>
                              <td colSpan={4 + activeYearSections.length} className="p-0">
                                <div className={`px-5 py-4 ${isDark ? "bg-purple-500/5" : "bg-purple-50/40"}`}>
                                  {/* Group Header */}
                                  <div className="flex items-center gap-2.5 mb-3">
                                    <Badge className={`text-[9px] uppercase font-bold px-2.5 py-1 ${
                                      isDark
                                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                        : "bg-purple-100 text-purple-700 border border-purple-200"
                                    }`}>
                                      Open Elective
                                    </Badge>
                                    <span className={`text-xs ${isDark ? "text-white/40" : "text-slate-500"}`}>
                                      {filteredReviewSubjects.length} subject{filteredReviewSubjects.length !== 1 ? 's' : ''} — students choose one from below
                                    </span>
                                  </div>
                                  {/* Subject list */}
                                  <div className="space-y-2 pl-1">
                                    {filteredReviewSubjects.map((sub) => (
                                      <div key={sub.id} className={`flex flex-wrap items-center gap-3 px-3 py-2.5 rounded-xl border ${
                                        isDark
                                          ? "bg-white/3 border-white/7 hover:bg-white/5"
                                          : "bg-white border-purple-100 shadow-sm hover:bg-purple-50/30"
                                      } transition-colors`}>
                                        {sub.code && (
                                          <span className={`font-mono text-[10px] shrink-0 px-1.5 py-0.5 rounded border ${
                                            isDark ? "text-slate-400 bg-white/4 border-white/8" : "text-slate-500 bg-slate-50 border-slate-200"
                                          }`}>{sub.code}</span>
                                        )}
                                        <span className={`text-sm font-semibold flex-1 min-w-[200px] ${isDark ? "text-white" : "text-slate-800"}`}>
                                          {sub.name}
                                        </span>
                                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${isDark ? "text-white/35 bg-white/5" : "text-slate-400 bg-slate-100"}`}>
                                          {sub.hoursPerWeek}h
                                        </span>
                                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                          {activeYearSections.map((sec) => {
                                            const sectionKey = `${activeDept}_${activeTab}`;
                                            const isAssigned = sectionSubjectsData[sectionKey]?.[sec]?.has(sub.id) ?? true;
                                            const size = sectionSubjectsData[sectionKey]?.[sec]?.size || 0;
                                            const isMapped = size === 0 || isAssigned;
                                            if (!isMapped) return null;
                                            const fac = sub.facultyBySection[sec];
                                            return (
                                              <span key={sec} className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg border ${
                                                fac
                                                  ? (isDark ? "text-white/70 bg-white/5 border-white/8" : "text-slate-700 bg-slate-50 border-slate-200")
                                                  : "text-amber-500 bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20"
                                              }`}>
                                                Sec {sec}: {fac || "Unassigned"}
                                              </span>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            filteredReviewSubjects.map((sub) => (
                              <tr key={sub.id} className={`border-b transition-colors ${
                                isDark 
                                  ? "border-white/5 hover:bg-white/2" 
                                  : "border-slate-100 hover:bg-slate-50/50"
                              }`}>
                                <td className={`py-3 px-4 font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>{sub.code || "-"}</td>
                                <td className={`py-3 px-4 font-bold ${isDark ? "text-white" : "text-slate-800"}`}>{sub.name}</td>
                                <td className="py-3 px-4">
                                  <Badge
                                    className={`text-[9px] uppercase font-bold shrink-0 ${
                                      sub.type === "lab"
                                        ? (isDark ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border border-emerald-250")
                                        : sub.type === "elective" || sub.type === "open elective"
                                        ? (isDark ? "bg-purple-500/15 text-purple-300 border border-purple-500/20" : "bg-purple-50 text-purple-700 border border-purple-250")
                                        : (isDark ? "bg-slate-700/30 text-slate-300 border border-slate-700/20" : "bg-slate-100 text-slate-600 border border-slate-200")
                                    }`}
                                  >
                                    {sub.type}
                                  </Badge>
                                </td>
                                <td className={`py-3 px-4 font-semibold ${isDark ? "text-white/90" : "text-slate-700"}`}>{sub.hoursPerWeek}h</td>
                                {activeYearSections.map((sec) => {
                                  const sectionKey = `${activeDept}_${activeTab}`;
                                  const isAssigned = sectionSubjectsData[sectionKey]?.[sec]?.has(sub.id) ?? true;
                                  const size = sectionSubjectsData[sectionKey]?.[sec]?.size || 0;
                                  const isMapped = size === 0 || isAssigned;

                                  if (!isMapped) {
                                    return (
                                      <td key={sec} className={`py-3 px-4 text-center italic ${
                                        isDark ? "text-slate-600" : "text-slate-300"
                                      }`}>
                                        —
                                      </td>
                                    );
                                  }

                                  const fac = sub.facultyBySection[sec];
                                  return (
                                    <td key={sec} className="py-3 px-4 text-center">
                                      {fac ? (
                                        <span className={`font-semibold ${isDark ? "text-white/80" : "text-slate-700"}`}>{fac}</span>
                                      ) : (
                                        <span className="text-amber-500 font-semibold">Unassigned</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
        </div>
      </div>

      {/* Persistent Bottom Bar */}
      <footer className={`fixed bottom-0 left-0 md:left-72 lg:left-80 xl:left-72 2xl:left-80 right-0 z-40 border-t backdrop-blur-md px-6 py-4 flex items-center justify-between transition-colors duration-300 ${
        isDark ? "bg-[#0e0e1a]/95 border-white/10 text-white" : "bg-white/95 border-slate-200 text-slate-900 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]"
      }`}>
        <div className="flex flex-col gap-0.5 max-w-[60%] overflow-hidden">
          <span className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            {generatedResults.length > 0 ? "Generation Results:" : "Selected for Generation:"}
          </span>
          <span className="text-xs font-bold flex flex-wrap items-center gap-1.5 mt-0.5 max-h-16 overflow-y-auto">
            {generatedResults.length > 0 ? (
              <>
                <Badge variant="outline" className={`text-[10px] px-2 py-0.5 border ${
                  isDark ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}>
                  {generatedResults.filter(r => r.status === 'ok').length} Generated Successfully
                </Badge>
                {generatedResults.filter(r => r.status === 'error').length > 0 && (
                  <Badge variant="outline" className={`text-[10px] px-2 py-0.5 border ${
                    isDark ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-700"
                  }`}>
                    {generatedResults.filter(r => r.status === 'error').length} Failed
                  </Badge>
                )}
              </>
            ) : (
              selections.map(({ departmentName, selectedYears }) => (
                <div key={departmentName} className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border shrink-0 ${
                  isDark ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"
                }`}>
                  <span className={`text-[10px] font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>{departmentName}:</span>
                  {selectedYears.map(({ year, sections }) => (
                    <Badge key={year} variant="outline" className={`text-[9px] px-1 py-0 ${
                      isDark 
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-355" 
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}>
                      Yr {year}({sections.join(",")})
                    </Badge>
                  ))}
                </div>
              ))
            )}
          </span>
        </div>

        {generatedResults.length > 0 ? (
          <div className="flex items-center gap-3 shrink-0">
            <Button
              variant="outline"
              onClick={() => {
                setGeneratedResults([]);
              }}
              className={`rounded-xl font-bold px-5 py-5 border gap-2 ${
                isDark 
                  ? 'border-white/10 bg-white/5 hover:bg-white/10 text-white' 
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              }`}
              disabled={publishing || exporting}
            >
              <RotateCcw className="h-4 w-4 text-amber-500" />
              <span>Discard &amp; Reconfigure</span>
            </Button>

            <Button
              onClick={() => setIsFullScreen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-2 font-bold px-5 py-5 shadow-lg shadow-emerald-500/25 transition-all"
            >
              <Maximize2 className="h-4 w-4" />
              <span>Open Full Screen</span>
            </Button>

            {/* Export PDF Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  disabled={exporting || publishing || generatedResults.filter(r => r.status === 'ok').length === 0}
                  className={`rounded-xl font-bold px-5 py-5 border gap-2 shadow-sm transition-all ${
                    isDark 
                      ? 'border-white/15 bg-white/10 hover:bg-white/15 text-white' 
                      : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  {exporting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                      <span>Exporting PDF...</span>
                    </>
                  ) : (
                    <>
                      <FileDown className="h-4 w-4 text-emerald-500" />
                      <span>Export PDF</span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-60 ml-0.5" />
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={`w-64 rounded-xl p-1.5 shadow-xl border ${
                isDark ? "bg-[#18182a] border-white/10 text-white" : "bg-white border-slate-200 text-slate-800"
              }`}>
                <DropdownMenuItem
                  onClick={() => handleExportPDF('all')}
                  disabled={exporting}
                  className="cursor-pointer gap-2.5 py-2.5 rounded-lg px-3 focus:bg-emerald-500/10 focus:text-emerald-500 transition-colors"
                >
                  <FileText className="h-4 w-4 text-emerald-500 shrink-0" />
                  <div>
                    <div className="font-semibold text-xs">Export All Classes (PDF)</div>
                    <div className={`text-[10px] ${isDark ? "text-white/40" : "text-slate-400"}`}>
                      All generated classes &amp; sections combined
                    </div>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => handleExportPDF('year')}
                  disabled={exporting}
                  className="cursor-pointer gap-2.5 py-2.5 rounded-lg px-3 focus:bg-emerald-500/10 focus:text-emerald-500 transition-colors"
                >
                  <Layers className="h-4 w-4 text-purple-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-xs">Export Year {activeTab} (All Sections)</div>
                    <div className={`text-[10px] ${isDark ? "text-white/40" : "text-slate-400"}`}>
                      Combined PDF of all Year {activeTab} sections
                    </div>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => handleExportPDF('current')}
                  disabled={exporting}
                  className="cursor-pointer gap-2.5 py-2.5 rounded-lg px-3 focus:bg-emerald-500/10 focus:text-emerald-500 transition-colors"
                >
                  <Printer className="h-4 w-4 text-sky-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-xs">Export Current Class (PDF)</div>
                    <div className={`text-[10px] ${isDark ? "text-white/40" : "text-slate-400"}`}>
                      Year {activeTab} — Section {activeSection}
                    </div>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              onClick={handlePublish}
              disabled={publishing || exporting || generatedResults.filter(r => r.status === 'ok').length === 0}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl gap-2 font-bold px-6 py-5 shadow-lg shadow-emerald-500/25 transition-all duration-200 hover:shadow-emerald-500/30 hover:shadow-md"
            >
              {publishing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Publish Timetables
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-6 shrink-0">
            <div className="flex items-center gap-2.5 border-r pr-5 border-slate-200 dark:border-white/10">
              <Switch
                checked={facultyBeforeAfternoon}
                onCheckedChange={setFacultyBeforeAfternoon}
                id="faculty-before-afternoon-review"
              />
              <Label htmlFor="faculty-before-afternoon-review" className="text-xs font-bold cursor-pointer select-none">
                Professor before afternoon
              </Label>
            </div>
            <Button
              onClick={handleGenerate}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl gap-2 font-bold px-6 py-5 shadow-lg shadow-emerald-500/25"
            >
              <Zap className="h-4 w-4" /> Generate Selected Timetables
            </Button>
          </div>
        )}
      </footer>

      {/* ── Generation Progress Overlay ── */}
      {showProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`relative w-[460px] max-w-[95vw] max-h-[85vh] overflow-y-auto rounded-2xl border shadow-2xl p-6 transition-colors duration-300 ${
            isDark ? "bg-[#0e0e1b] border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"
          }`}
            style={isDark ? { backgroundImage: 'radial-gradient(ellipse at 30% 0%, rgba(16,185,129,0.1) 0%, transparent 60%)' } : {}}
          >
            {!generating && (
              <button
                onClick={() => {
                  setShowProgress(false);
                }}
                className={`absolute top-4 right-4 p-1.5 rounded-lg transition-colors ${
                  isDark ? "text-white/30 hover:text-white hover:bg-white/10" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                }`}
              >
                <X className="h-4 w-4" />
              </button>
            )}

            <div className="mb-5">
              <div className="flex items-center gap-2.5 mb-1">
                {generating
                  ? <Loader2 className={`h-5 w-5 animate-spin ${isDark ? "text-emerald-450" : "text-emerald-600"}`} />
                  : <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                  {generating ? "Generating Timetables..." : "Generation Complete"}
                </h3>
              </div>
              <p className={`text-xs pl-7 ${isDark ? "text-white/30" : "text-slate-400"}`}>
                {generating ? "Running multi-department sections in parallel" : `${generatedResults.filter(r => r.status === "ok").length} of ${generatedResults.length} succeeded`}
              </p>
            </div>

            {/* Progress list by department & year */}
            {selections.map(({ departmentName, selectedYears }) => {
              const deptProgress = progressItems.filter(p => p.departmentName === departmentName);
              if (deptProgress.length === 0) return null;
              return (
                <div key={departmentName} className="mb-5 last:mb-0">
                  <div className={`text-xs font-bold mb-2 border-b pb-1 ${
                    isDark ? "text-emerald-450 border-white/10" : "text-emerald-600 border-slate-200"
                  }`}>{departmentName}</div>
                  {selectedYears.map(({ year }) => {
                    const items = deptProgress.filter((p) => p.year === year);
                    if (items.length === 0) return null;
                    return (
                      <div key={year} className="mb-4 last:mb-0 pl-2">
                        <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 pl-1 ${
                          isDark ? "text-white/30" : "text-slate-400"
                        }`}>Year {year}</div>
                        <div className="space-y-1.5">
                          {items.map((item) => (
                            <div key={item.section} className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${
                              isDark ? "bg-white/5 border-white/8" : "bg-slate-50 border-slate-100"
                            }`}>
                              <div className={`w-16 text-xs font-semibold ${isDark ? "text-white/60" : "text-slate-655"}`}>Section {item.section}</div>
                              <div className="flex-1">
                                {item.status === "idle" && <div className={`h-1 w-full rounded-full ${isDark ? "bg-white/10" : "bg-slate-200"}`} />}
                                {item.status === "running" && (
                                  <div className={`h-1 rounded-full overflow-hidden ${isDark ? "bg-white/10" : "bg-slate-200"}`}>
                                    <div className="h-full bg-emerald-500 rounded-full animate-pulse animate-infinite" style={{ width: "60%" }} />
                                  </div>
                                )}
                                {item.status === "ok" && <div className="h-1 w-full bg-emerald-500 rounded-full" />}
                                {item.status === "error" && <div className="h-1 w-full bg-red-500 rounded-full" />}
                              </div>
                              <div className="w-5 flex justify-center">
                                {item.status === "idle" && <span className={`h-1.5 w-1.5 rounded-full ${isDark ? "bg-white/15" : "bg-slate-300"}`} />}
                                {item.status === "running" && <Loader2 className={`h-3.5 w-3.5 animate-spin ${isDark ? "text-emerald-450" : "text-emerald-600"}`} />}
                                {item.status === "ok" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                                {item.status === "error" && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
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

            {!generating && generatedResults.length > 0 && (
              <button
                onClick={() => {
                  setShowProgress(false);
                  setIsFullScreen(true);
                  setFullScreenPage('timetable');
                }}
                className="mt-4 w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-bold hover:from-emerald-600 hover:to-teal-700 transition-all shadow-sm shadow-emerald-500/25 flex items-center justify-center gap-2"
              >
                <span>Open Timetable Full Screen</span>
                <Maximize2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}
      {/* Special Hours Manager Dialog */}
      <Dialog open={specialHoursDialogOpen} onOpenChange={setSpecialHoursDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configure Special Hours</DialogTitle>
          </DialogHeader>
          {deptIds[activeDept] && activeTab && (
            <SpecialHoursManager
              departmentId={deptIds[activeDept]}
              year={activeTab}
              embedded={true}
              onConfigUpdate={(configs) => {
                const key = `${activeDept}_${activeTab}`;
                setSpecialHoursData((prev) => ({
                  ...prev,
                  [key]: configs,
                }));
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      {/* Faculty Conflict Dialog */}
      <Dialog open={conflictModalOpen} onOpenChange={setConflictModalOpen}>
        <DialogContent className={`max-w-xl rounded-2xl p-6 shadow-2xl transition-colors z-[70] ${
          isDark ? 'bg-[#0f0f1c] text-white border-white/10' : 'bg-white text-slate-900 border-slate-200'
        }`}>
          <DialogHeader className="pb-3 border-b border-slate-100 dark:border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-500 shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Faculty Schedule Conflict Detected
                </DialogTitle>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
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
                className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                  isDark 
                    ? 'bg-red-500/10 border-red-500/25 text-red-200' 
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
                    <Users className="h-4 w-4" />
                    {c.facultyName}
                  </span>
                  <span className="px-2 py-0.5 rounded-full font-mono text-[10px] font-bold bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30">
                    Double-Booking Clash
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Moving Subject:</span>{" "}
                    <span className="font-semibold underline">{c.movingSubject || '(Empty)'}</span> → to {c.targetSlot.dayName} {c.targetSlot.periodLabel} ({c.targetSlot.time})
                  </div>
                  <div className={`p-2.5 rounded-lg text-xs leading-relaxed border ${
                    isDark ? 'bg-black/30 border-red-500/20 text-red-300' : 'bg-white border-red-200 text-red-800'
                  }`}>
                    ⚠️ <strong>Clash Details:</strong> {c.reason}
                  </div>
                </div>
              </div>
            ))}

            <div className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
              isDark ? 'bg-white/4 border-white/6 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <span>
                Faculty members cannot teach two different classrooms during the same hour. The change was halted to prevent timetable collision. You can cancel to keep the valid schedule or force swap if you plan to reallocate the conflicting class.
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-white/10">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setConflictModalOpen(false);
                setConflictData(null);
              }}
              className="rounded-xl text-xs font-semibold"
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

      {/* ── FULL SCREEN TIMETABLE WORKSPACE (FULL PAGE SLIDE MODE) ── */}
      {isFullScreen && activeResult && (
        <div className="fixed inset-0 z-50 flex flex-col h-screen w-screen overflow-hidden bg-slate-100 dark:bg-[#07070f] text-slate-900 dark:text-slate-100 p-1.5 sm:p-2.5 md:p-3 select-none animate-in fade-in duration-150">
          {/* Top Compact Command Bar */}
          <header className="min-h-11 h-auto py-1.5 sm:py-0 sm:h-11 shrink-0 bg-white dark:bg-[#0d0d1a] rounded-xl border border-slate-200 dark:border-white/10 px-2.5 sm:px-3.5 flex flex-wrap sm:flex-nowrap items-center justify-between shadow-sm gap-2">
            {/* Left: Class Identity, Year Switcher & Section Switcher */}
            <div className="flex items-center gap-2 sm:gap-2.5">
              <div className="flex items-center gap-1.5">
                <Badge className="bg-emerald-600 text-white font-extrabold text-[11px] px-2 py-0.5 rounded-lg shadow-sm shrink-0">
                  Yr {activeResult.year} • Sec {activeResult.section}
                </Badge>
                <span className="font-extrabold text-xs sm:text-sm tracking-tight text-slate-900 dark:text-white truncate">
                  {activeDept}
                </span>
              </div>

              {/* Year switcher pills if multiple years */}
              {activeDeptSelection && activeDeptSelection.selectedYears.length > 1 && (
                <div className={`flex p-0.5 rounded-lg border gap-0.5 shadow-sm overflow-x-auto no-scrollbar ${
                  isDark ? "bg-white/5 border-white/10" : "bg-slate-100 border-slate-200"
                }`}>
                  {activeDeptSelection.selectedYears.map(({ year }) => (
                    <button
                      key={year}
                      onClick={() => {
                        setActiveTab(year);
                        const yrResults = generatedResults.filter(r => r.departmentName === activeDept && r.year === year);
                        if (yrResults.length > 0) setActiveSection(yrResults[0].section);
                      }}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all ${
                        activeTab === year
                          ? isDark ? "bg-white/20 text-white shadow-sm" : "bg-white text-slate-900 shadow-sm"
                          : isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-950"
                      }`}
                    >
                      Yr {year}
                    </button>
                  ))}
                </div>
              )}

              {/* Section switcher pills */}
              {currentYearResults.length > 0 && (
                <div className={`flex p-0.5 rounded-lg border gap-0.5 shadow-sm overflow-x-auto no-scrollbar max-w-[140px] sm:max-w-none ${
                  isDark ? "bg-white/5 border-white/10" : "bg-slate-100 border-slate-200"
                }`}>
                  {currentYearResults.map((r) => (
                    <button
                      key={r.section}
                      onClick={() => setActiveSection(r.section)}
                      className={`px-2 sm:px-2.5 py-0.5 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 shrink-0 ${
                        activeSection === r.section
                          ? isDark
                            ? "bg-white/20 text-white shadow-sm"
                            : "bg-white text-slate-900 shadow-sm"
                          : isDark
                          ? "text-slate-400 hover:text-white"
                          : "text-slate-600 hover:text-slate-950"
                      }`}
                    >
                      {r.section}
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          r.hourVerification?.isValid ?? true ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Center: Mode Switcher (Timetable vs Subject Staffs) */}
            <div className="flex items-center p-0.5 rounded-lg border bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 shadow-sm gap-0.5">
              <button
                onClick={() => setFullScreenPage('timetable')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                  fullScreenPage === 'timetable'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : isDark
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="View Full Timetable (Swipe Down / Up Arrow)"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Timetable</span>
              </button>

              <button
                onClick={() => setFullScreenPage('allocation')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                  fullScreenPage === 'allocation'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : isDark
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="View Subject Staff Allocation (Swipe Up / Down Arrow)"
              >
                <Users className="h-3.5 w-3.5" />
                <span>Subject Staffs ({allocationRows.length})</span>
              </button>
            </div>

            {/* Right: Controls & Actions (Image 4 Buttons) */}
            <div className="flex items-center gap-1.5 sm:gap-2 ml-auto sm:ml-0 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFacultyInGrid(!showFacultyInGrid)}
                className={`h-8 px-2 sm:px-2.5 rounded-lg text-xs gap-1 font-semibold border ${
                  showFacultyInGrid
                    ? isDark
                      ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                      : "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : isDark
                    ? "border-white/10 bg-white/5 text-slate-300"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <Users className="h-3.5 w-3.5 text-emerald-500" />
                <span className="hidden md:inline">{showFacultyInGrid ? "Hide Staff" : "Show Staff"}</span>
                <span className="md:hidden">Staff</span>
              </Button>

              {/* Image 4: Export PDF Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exporting || publishing || generatedResults.filter(r => r.status === 'ok').length === 0}
                    className={`h-8 px-2.5 sm:px-3 rounded-lg font-bold border gap-1.5 shadow-sm transition-all text-xs ${
                      isDark 
                        ? 'border-white/15 bg-white/10 hover:bg-white/15 text-white' 
                        : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    {exporting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
                        <span className="hidden sm:inline">Exporting...</span>
                      </>
                    ) : (
                      <>
                        <FileDown className="h-3.5 w-3.5 text-emerald-500" />
                        <span>Export PDF</span>
                        <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                      </>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className={`w-64 rounded-xl p-1.5 shadow-xl border z-[70] ${
                  isDark ? "bg-[#18182a] border-white/10 text-white" : "bg-white border-slate-200 text-slate-800"
                }`}>
                  <DropdownMenuItem
                    onClick={() => handleExportPDF('all')}
                    disabled={exporting}
                    className="cursor-pointer gap-2.5 py-2.5 rounded-lg px-3 focus:bg-emerald-500/10 focus:text-emerald-500 transition-colors"
                  >
                    <FileText className="h-4 w-4 text-emerald-500 shrink-0" />
                    <div>
                      <div className="font-semibold text-xs">Export All Classes (PDF)</div>
                      <div className={`text-[10px] ${isDark ? "text-white/40" : "text-slate-400"}`}>
                        All generated classes &amp; sections combined
                      </div>
                    </div>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => handleExportPDF('year')}
                    disabled={exporting}
                    className="cursor-pointer gap-2.5 py-2.5 rounded-lg px-3 focus:bg-emerald-500/10 focus:text-emerald-500 transition-colors"
                  >
                    <Layers className="h-4 w-4 text-purple-400 shrink-0" />
                    <div>
                      <div className="font-semibold text-xs">Export Year {activeTab} (All Sections)</div>
                      <div className={`text-[10px] ${isDark ? "text-white/40" : "text-slate-400"}`}>
                        Combined PDF of all Year {activeTab} sections
                      </div>
                    </div>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => handleExportPDF('current')}
                    disabled={exporting}
                    className="cursor-pointer gap-2.5 py-2.5 rounded-lg px-3 focus:bg-emerald-500/10 focus:text-emerald-500 transition-colors"
                  >
                    <Printer className="h-4 w-4 text-sky-400 shrink-0" />
                    <div>
                      <div className="font-semibold text-xs">Export Current Class (PDF)</div>
                      <div className={`text-[10px] ${isDark ? "text-white/40" : "text-slate-400"}`}>
                        Year {activeTab} — Section {activeSection}
                      </div>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Image 4: Publish Timetables Button */}
              <Button
                size="sm"
                onClick={handlePublish}
                disabled={publishing || exporting || generatedResults.filter(r => r.status === 'ok').length === 0}
                className="h-8 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-lg gap-1.5 font-bold px-3 sm:px-3.5 shadow-md shadow-emerald-500/25 transition-all duration-200 hover:shadow-emerald-500/35 text-xs shrink-0"
              >
                {publishing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span className="hidden sm:inline">Publishing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Publish Timetables</span>
                  </>
                )}
              </Button>

              {/* Discard & Reconfigure */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsFullScreen(false);
                  setGeneratedResults([]);
                }}
                className={`h-8 px-2 sm:px-2.5 rounded-lg text-xs gap-1 font-semibold border ${
                  isDark
                    ? 'border-white/10 bg-white/5 hover:bg-white/10 text-slate-300'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-sm'
                }`}
                title="Discard generation and return to configuration"
              >
                <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
                <span className="hidden xl:inline">Discard</span>
              </Button>

              {/* Exit to Dashboard */}
              <Button
                size="sm"
                onClick={() => navigate('/admin')}
                className="h-8 px-2.5 sm:px-3 rounded-lg text-xs gap-1.5 font-bold bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 shadow-sm"
                title="Back to Dashboard"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Dashboard</span>
              </Button>
            </div>
          </header>

          {/* Slide Presentation Container: Zero Document Scroll, Pure Up/Down Motion */}
          <div
            className="flex-1 min-h-0 w-full overflow-hidden relative mt-1.5"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheelSlide}
          >
            <div
              className={`w-full h-full flex flex-col transition-transform duration-500 ease-in-out ${
                fullScreenPage === 'timetable' ? 'translate-y-0' : '-translate-y-full'
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
                  />
                </div>
              </div>

              {/* ── PAGE 2: FULL VIEWPORT SUBJECT STAFFS ALLOCATION ── */}
              <div className="w-full h-full shrink-0 flex flex-col relative overflow-hidden pt-1">
                <div className="flex-1 min-h-0 w-full overflow-hidden">
                  <FullScreenAllocationTable
                    rows={allocationRows}
                    isDark={isDark}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
