import { useEffect, useState, useMemo } from "react";
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
} from "lucide-react";
import AdminNavbar from "@/components/navbar/AdminNavbar";
import SelectionHeader from "@/components/admin/SelectionHeader";
import {
  getDepartmentByName,
  getSubjectsForYear,
  getSpecialHoursConfigsForYear,
  getSubjectFacultyMapAllSections,
  getSectionSubjects,
  saveTimetable,
} from "@/lib/supabaseService";
import { generateAllYears, YearSectionResult } from "@/lib/timetable";
import type { WizardSelection } from "@/components/admin/GenerateWizardModal";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SpecialHoursManager } from "@/components/SpecialHoursManager";

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

function getCellStyle(cell: string, isDark: boolean): string {
  if (!cell) {
    return isDark 
      ? 'bg-white/3 text-slate-700 border border-dashed border-white/5' 
      : 'bg-slate-50 text-slate-350 border border-dashed border-slate-200';
  }
  if (cell === 'BREAK' || cell === 'LUNCH') {
    return isDark 
      ? 'bg-white/4 text-white/20 text-[9px] font-bold uppercase tracking-widest' 
      : 'bg-slate-100 text-slate-450 text-[9px] font-bold uppercase tracking-widest';
  }
  if (cell.toUpperCase().includes('LAB') || cell.endsWith(' L')) {
    return isDark 
      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25' 
      : 'bg-emerald-50 text-emerald-700 border border-emerald-250';
  }
  if (/seminar|library|counsell/i.test(cell)) {
    return isDark 
      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25' 
      : 'bg-amber-50 text-amber-700 border border-amber-250';
  }
  if (cell.includes(' / ')) {
    return isDark 
      ? 'bg-purple-500/15 text-purple-300 border border-purple-500/25' 
      : 'bg-purple-50 text-purple-700 border border-purple-250';
  }
  return isDark 
    ? 'bg-white/7 text-slate-200 border border-white/9' 
    : 'bg-white text-slate-800 border border-slate-200 shadow-sm';
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
  return (
    <div className={`overflow-auto rounded-xl ${compact ? 'max-h-[230px]' : ''}`}>
      <table className="w-full border-collapse" style={{ minWidth: compact ? 500 : 680 }}>
        <thead>
          <tr className={isDark ? "bg-white/3" : "bg-slate-100"}>
            <th className={`py-1.5 px-2 text-left font-semibold text-[10px] w-10 ${isDark ? "text-white/30" : "text-slate-500"}`}>Day</th>
            {DISPLAY_COLUMNS.map((col, i) => (
              <th key={i} className={`py-1.5 px-1 text-center font-semibold text-[10px] ${isDark ? "text-white/30" : "text-slate-500"}`}>
                <div className="flex flex-col gap-0.5 items-center">
                  <span className={(col === 'BREAK' || col === 'LUNCH') ? (isDark ? 'text-white/15' : 'text-slate-350') : ''}>{col.replace('PERIOD ', 'P')}</span>
                  {TIME_LABELS[col] && <span className={`text-[8px] font-normal ${isDark ? "text-white/15" : "text-slate-400"}`}>{TIME_LABELS[col]}</span>}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, dayIdx) => {
            const displayRow: string[] = [row[0], row[1], 'BREAK', row[2], row[3], 'LUNCH', row[4], row[5], 'BREAK', row[6]];
            return (
              <tr key={dayIdx} className={`border-t transition-colors ${isDark ? "border-white/4 hover:bg-white/2" : "border-slate-200 hover:bg-slate-50/50"}`}>
                <td className={`py-1 px-2 font-bold text-[10px] ${isDark ? "text-white/40" : "text-slate-500"}`}>{DAYS[dayIdx]}</td>
                {displayRow.map((cell, i) => {
                  const highlight = (search || filterType !== 'all') ? matchesFilter(cell, search, filterType) : false;
                  const isDimmed = (search || filterType !== 'all') && cell && cell !== 'BREAK' && cell !== 'LUNCH' && !matchesFilter(cell, search, filterType);
                  return (
                    <td key={i} className="p-0.5">
                      <div className={`
                        rounded-lg flex items-center justify-center text-center transition-all
                        ${compact ? 'h-8 min-w-[52px]' : 'h-11 min-w-[76px]'}
                        ${getCellStyle(cell, isDark)}
                        ${highlight ? (isDark ? 'ring-2 ring-white/25 scale-105 z-10 relative' : 'ring-2 ring-emerald-500/50 scale-105 z-10 relative') : ''}
                        ${isDimmed ? 'opacity-20' : ''}
                      `}>
                        <span className="px-1 truncate max-w-full font-semibold leading-tight" style={{ fontSize: '9px' }}>
                          {cell && cell.toLowerCase().includes('open elective') ? 'Open Elective' : (cell || '')}
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
  } | null;

  const selections = stateData?.selections || [];

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
  const [reviewTypeFilter, setReviewTypeFilter] = useState<'all' | 'theory-elective' | 'lab' | 'open-elective' | 'special'>('all');

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
            
            const subjects = await getSubjectsForYear(dept.id, year).catch(() => []);
            const specialHours = await getSpecialHoursConfigsForYear(dept.id, year).catch(() => []);
            const facultyMap = await getSubjectFacultyMapAllSections(dept.id, year, sections).catch(() => ({}));

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
              const mappedIds = sectionToSubjectIds[sec];
              const sectionSpecificSubjects = mappedIds.size > 0
                ? subjects.filter((s) => mappedIds.has(s.id))
                : subjects;
              // Add special_hours_config totals — these are real occupied timetable periods
              // (e.g. Counselling=2h, Library=1h, Seminar=2h) that count toward the 42h limit.
              sectionHours[sec] = calculateTotalHours(sectionSpecificSubjects) + specialConfigHoursTotal;
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
      const resultsArray = await Promise.all(
        selections.map(async (deptSel) => {
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
            facultyBeforeAfternoon
          );

          const selectedYearSet = new Set(deptSel.selectedYears.map(y => y.year));
          const finalResults = result.results.filter(r => {
            if (!selectedYearSet.has(r.year)) return false;
            const matchingYear = deptSel.selectedYears.find(y => y.year === r.year);
            return matchingYear?.sections.includes(r.section) ?? false;
          }).map(r => ({
            ...r,
            departmentName: deptSel.departmentName
          }));

          return finalResults;
        })
      );

      const allFinalResults = resultsArray.flat();
      setGeneratedResults(allFinalResults);
      const totalOk = allFinalResults.filter(r => r.status === "ok").length;
      const totalErr = allFinalResults.filter(r => r.status === "error").length;

      if (totalOk > 0) {
        toast.success(`Generated ${totalOk} timetable(s) successfully!`);
        setViewTab('timetable');
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
              <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                Review &amp; Generate Timetables
              </h1>
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

          {/* View Tab Switcher (Visible only after timetable is generated) */}
          {generatedResults.length > 0 && (
            <div className="flex gap-2 mb-6">
              <Button
                variant={viewTab === 'review' ? 'default' : 'outline'}
                onClick={() => setViewTab('review')}
                className={`rounded-xl font-bold px-4 py-2 border shadow-sm ${
                  viewTab === 'review'
                    ? (isDark ? 'bg-white/15 text-white border-white/15' : 'bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600')
                    : (isDark ? 'border-white/10 bg-white/5 hover:bg-white/10 text-white' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700')
                }`}
              >
                Review Configuration
              </Button>
              <Button
                variant={viewTab === 'timetable' ? 'default' : 'outline'}
                onClick={() => setViewTab('timetable')}
                className={`rounded-xl font-bold px-4 py-2 border shadow-sm flex items-center gap-1.5 ${
                  viewTab === 'timetable'
                    ? (isDark ? 'bg-white/15 text-white border-white/15' : 'bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600')
                    : (isDark ? 'border-white/10 bg-white/5 hover:bg-white/10 text-white' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700')
                }`}
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Generated Timetables Grid
              </Button>
            </div>
          )}

          {viewTab === 'timetable' ? (
            <div className="space-y-6">
              <Card className={`rounded-2xl shadow-lg border overflow-hidden transition-colors duration-300 ${
                isDark ? "bg-[#0e0e1b] border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"
              }`}
                style={isDark ? { backgroundImage: 'radial-gradient(ellipse at 15% 15%, rgba(16,185,129,0.07) 0%, transparent 55%)' } : {}}
              >
                {/* Search, Filter, Section Tabs, View mode */}
                <div className={`p-6 border-b flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between ${
                  isDark ? "border-white/5" : "border-slate-100"
                }`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    {/* Section nested tabs inside Year */}
                    {currentYearResults.length > 0 && (
                      <div className={`flex p-1 rounded-xl border gap-1 self-start sm:self-auto ${
                        isDark ? "bg-white/3 border-white/6" : "bg-slate-100 border-slate-200"
                      }`}>
                        {currentYearResults.map((r) => (
                          <button
                            key={r.section}
                            onClick={() => setActiveSection(r.section)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                              activeSection === r.section
                                ? (isDark ? "bg-white/15 text-white shadow-sm" : "bg-white text-slate-800 shadow-sm")
                                : (isDark ? "text-white/40 hover:text-white/70" : "text-slate-500 hover:text-slate-800")
                            }`}
                          >
                            Section {r.section}
                            {r.status === 'ok' ? (
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            ) : (
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Search input */}
                    <div className="relative flex-1 max-w-xs min-w-[200px]">
                      <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${
                        isDark ? "text-white/25" : "text-slate-400"
                      }`} />
                      <Input
                        value={search} onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search subjects..."
                        className={`pl-8 h-9 text-xs rounded-xl transition-colors ${
                          isDark 
                            ? "bg-white/5 border-white/9 text-white placeholder:text-white/20 focus-visible:ring-emerald-500 focus-visible:ring-1" 
                            : "bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 focus-visible:ring-emerald-500 focus-visible:ring-1"
                        }`}
                      />
                    </div>

                    {/* Type Select */}
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger className={`h-9 w-36 text-xs rounded-xl transition-colors ${
                        isDark 
                          ? "bg-white/5 border-white/9 text-white/60" 
                          : "bg-white border-slate-200 text-slate-700"
                      }`}>
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent className={`${
                        isDark ? "bg-[#18182a] border-white/10 text-white" : "bg-white border-slate-200 text-slate-800"
                      }`}>
                        {SUBJECT_TYPES.map((t) => (
                          <SelectItem key={t} value={t} className="capitalize">
                            {t === 'all' ? 'All Types' : t.charAt(0).toUpperCase() + t.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* View Toggle */}
                    <div className={`flex p-1 rounded-xl border ${
                      isDark ? "bg-white/5 border-white/8" : "bg-slate-100 border-slate-200"
                    }`}>
                      <button onClick={() => setViewMode('table')} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        viewMode === 'table' 
                          ? (isDark ? 'bg-white/15 text-white' : 'bg-white text-slate-800 shadow-sm border border-slate-200') 
                          : (isDark ? 'text-white/35 hover:text-white/65' : 'text-slate-500 hover:text-slate-850')
                      }`}>
                        <LayoutGrid className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setViewMode('list')} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        viewMode === 'list' 
                          ? (isDark ? 'bg-white/15 text-white' : 'bg-white text-slate-800 shadow-sm border border-slate-200') 
                          : (isDark ? 'text-white/35 hover:text-white/65' : 'text-slate-500 hover:text-slate-850')
                      }`}>
                        <List className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Grid Content */}
                <div className="p-6">
                  {!activeResult ? (
                    <div className={`flex flex-col items-center justify-center h-60 italic gap-2 ${
                      isDark ? "text-white/25" : "text-slate-400"
                    }`}>
                      <AlertTriangle className={`h-8 w-8 ${isDark ? "text-white/10" : "text-slate-300"}`} />
                      No timetables generated for this selection
                    </div>
                  ) : activeResult.status === 'error' ? (
                    <div className={`flex flex-col items-center justify-center h-60 border rounded-2xl p-6 text-center ${
                      isDark ? "border-red-500/20 bg-red-500/5" : "border-red-200 bg-red-50/30"
                    }`}>
                      <AlertTriangle className="h-10 w-10 text-red-555 mb-3" />
                      <h3 className={`text-base font-bold mb-1 ${isDark ? "text-white" : "text-red-700"}`}>Generation Failed</h3>
                      <p className={`text-sm max-w-md leading-relaxed ${isDark ? "text-red-400/85" : "text-red-650"}`}>{activeResult.error}</p>
                    </div>
                  ) : (
                    <div className={`rounded-2xl p-5 shadow-inner border transition-colors duration-300 ${
                      isDark 
                        ? "bg-[#0c0c17] border-white/6" 
                        : "bg-white border-slate-200"
                    }`}>
                      <div className={`flex items-center justify-between mb-4 border-b pb-3 ${
                        isDark ? "border-white/5" : "border-slate-100"
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
                    </div>
                  )}
                </div>
              </Card>
            </div>
          ) : (
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
                        Check subject type, hour load, and faculty names per section.
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
          )}
        </div>
      </div>

      {/* Persistent Bottom Bar */}
      <footer className={`fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-md px-6 py-4 flex items-center justify-between md:pl-[300px] lg:pl-[330px] transition-colors duration-300 ${
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
                setViewTab('review');
              }}
              className={`rounded-xl font-bold px-6 py-5 border ${
                isDark 
                  ? 'border-white/10 bg-white/5 hover:bg-white/10 text-white' 
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              }`}
              disabled={publishing}
            >
              Discard &amp; Reconfigure
            </Button>
            <Button
              onClick={handlePublish}
              disabled={publishing || generatedResults.filter(r => r.status === 'ok').length === 0}
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
                  setViewTab('timetable');
                }}
                className="mt-4 w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-bold hover:from-emerald-600 hover:to-teal-700 transition-all shadow-sm shadow-emerald-500/25"
              >
                View Generated Timetables →
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
    </main>
  );
}
