import { useEffect, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
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
} from "lucide-react";
import AdminNavbar from "@/components/navbar/AdminNavbar";
import SelectionHeader from "@/components/admin/SelectionHeader";
import {
  getDepartmentByName,
  getSubjectsForYear,
  getSpecialHoursConfigsForYear,
  getSubjectFacultyMapAllSections,
  getSectionSubjects,
  getOpenElectiveHours,
} from "@/lib/supabaseService";
import { generateAllYears, YearSectionResult, BatchGenerationResult } from "@/lib/timetable";
import { GeneratedTimetablesGallery } from "@/components/admin/GeneratedTimetablesGallery";
import type { WizardSelection } from "@/components/admin/GenerateWizardModal";

interface SubjectRowWithFaculty {
  id: string;
  name: string;
  code?: string;
  type: string;
  hoursPerWeek: number;
  facultyBySection: Record<string, string>; // section -> facultyName
}

function calculateTotalHours(rawSubjects: any[]): number {
  const traditionalTheory = rawSubjects.filter(s => s.type === 'theory').reduce((a, b) => a + (b.hoursPerWeek || b.hours_per_week || 0), 0);
  const labHours = rawSubjects.filter(s => s.type === 'lab').reduce((a, b) => a + (b.hoursPerWeek || b.hours_per_week || 0), 0);
  const specialHours = rawSubjects.filter(s => s.type === 'special').reduce((a, b) => a + (b.hoursPerWeek || b.hours_per_week || 0), 0);
  
  // Elective hours: group only by tag matching pe_group or pe
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

  // Open Elective hours: defaults to 5 if any exist, or groups by tag
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

  // Wizard state passed via location state
  const stateData = location.state as {
    selectedYears?: WizardSelection[];
    departmentName?: string;
  } | null;

  const selectedYears = stateData?.selectedYears || [];
  const departmentName = stateData?.departmentName || "";

  const [activeTab, setActiveTab] = useState<string>("");
  const [deptId, setDeptId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Per-year data store
  const [subjectsData, setSubjectsData] = useState<Record<string, SubjectRowWithFaculty[]>>({});
  const [specialHoursData, setSpecialHoursData] = useState<Record<string, any[]>>({});
  const [totalHoursBySection, setTotalHoursBySection] = useState<Record<string, Record<string, number>>>({});
  const [sectionSubjectsData, setSectionSubjectsData] = useState<Record<string, Record<string, Set<string>>>>({});

  // Generation progress state
  type ProgressStatus = 'idle' | 'running' | 'ok' | 'error';
  type ProgressItem = { year: string; section: string; status: ProgressStatus; error?: string };
  const [generating, setGenerating] = useState(false);
  const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);
  const [showProgress, setShowProgress] = useState(false);
  const [generatedResults, setGeneratedResults] = useState<YearSectionResult[]>([]);
  const [showGallery, setShowGallery] = useState(false);

  useEffect(() => {
    if (selectedYears.length === 0 || !departmentName) {
      toast.error("No generation parameters specified. Please start from the dashboard.");
      navigate("/admin");
      return;
    }
    setActiveTab(selectedYears[0].year);
    loadAllData();
  }, [location.state]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const dept = await getDepartmentByName(departmentName);
      if (!dept) {
        toast.error("Department not found");
        navigate("/admin");
        return;
      }
      setDeptId(dept.id);

      const subjectsMap: Record<string, SubjectRowWithFaculty[]> = {};
      const specialHoursMap: Record<string, any[]> = {};
      const secHoursMap: Record<string, Record<string, number>> = {};
      const secSubjectsMap: Record<string, Record<string, Set<string>>> = {};

      await Promise.all(
        selectedYears.map(async ({ year, sections }) => {
          // 1. Fetch subjects
          const subjects = await getSubjectsForYear(dept.id, year).catch(() => []);
          // 2. Fetch special hours configs
          const specialHours = await getSpecialHoursConfigsForYear(dept.id, year).catch(() => []);
          // 3. Fetch faculty mappings
          const facultyMap = await getSubjectFacultyMapAllSections(dept.id, year, sections).catch(() => ({}));

          // 4. Fetch section subjects for all sections
          const sectionToSubjectIds: Record<string, Set<string>> = {};
          await Promise.all(
            sections.map(async (sec) => {
              const subIds = await getSectionSubjects(dept.id, year, sec).catch(() => []);
              sectionToSubjectIds[sec] = new Set(subIds);
            })
          );
          secSubjectsMap[year] = sectionToSubjectIds;

          let specialHoursTotal = 0;
          specialHours.forEach((config) => {
            specialHoursTotal += config.total_hours || 0;
          });
          
          const sectionHours: Record<string, number> = {};
          sections.forEach((sec) => {
            const mappedIds = sectionToSubjectIds[sec];
            const sectionSpecificSubjects = mappedIds.size > 0
              ? subjects.filter((s) => mappedIds.has(s.id))
              : subjects; // fallback if none assigned
            const subjectsTotal = calculateTotalHours(sectionSpecificSubjects);
            sectionHours[sec] = subjectsTotal + specialHoursTotal;
          });
          secHoursMap[year] = sectionHours;

          // Map faculty names into subject rows
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

          subjectsMap[year] = rows;
          specialHoursMap[year] = specialHours.filter((h) => h.is_active);
        })
      );

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
    // Flatten selections to build progress items
    const progressList: ProgressItem[] = [];
    selectedYears.forEach(({ year, sections }) => {
      sections.forEach((sec) => {
        progressList.push({ year, section: sec, status: "idle" });
      });
    });

    setProgressItems(progressList);
    setShowProgress(true);
    setGenerating(true);
    setGeneratedResults([]);

    try {
      const result = await generateAllYears(
        departmentName,
        (year, section, status, error) => {
          setProgressItems((prev) =>
            prev.map((p) =>
              p.year === year && p.section === section
                ? { ...p, status: status as ProgressStatus, error }
                : p
            )
          );
        }
      );

      // Filter results to only include selected years and sections
      const selectedYearSet = new Set(selectedYears.map(y => y.year));
      const finalResults = result.results.filter(r => {
        if (!selectedYearSet.has(r.year)) return false;
        const matchingYear = selectedYears.find(y => y.year === r.year);
        return matchingYear?.sections.includes(r.section) ?? false;
      });

      setGeneratedResults(finalResults);
      const totalOk = finalResults.filter(r => r.status === "ok").length;
      const totalErr = finalResults.filter(r => r.status === "error").length;

      if (totalOk > 0) {
        toast.success(`Generated ${totalOk} timetable(s) successfully!`);
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

  const activeYearSections = selectedYears.find((y) => y.year === activeTab)?.sections || [];
  const activeYearSubjects = subjectsData[activeTab] || [];
  const activeYearSpecialHours = specialHoursData[activeTab] || [];

  if (loading) {
    return (
      <main className="min-h-screen bg-background">
        <AdminNavbar />
        <div className="md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80">
          <SelectionHeader />
          <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            <p className="text-sm text-muted-foreground">Preparing generation review data...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07070d] text-slate-100 pb-24">
      <AdminNavbar />
      <div className="md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80">
        <SelectionHeader />
        
        <div className="container py-6 max-w-7xl">
          {/* Header */}
          <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <span>Admin Dashboard</span>
                <span>/</span>
                <span>Review &amp; Generate</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Review &amp; Generate Timetables
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Department: <span className="text-emerald-400 font-semibold">{departmentName}</span>
              </p>
            </div>
            
            <Button
              variant="outline"
              onClick={() => navigate("/admin")}
              className="border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl gap-2 self-start sm:self-auto"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Dashboard
            </Button>
          </header>

          {/* Year Tabs */}
          <div className="flex border-b border-white/10 mb-6 gap-1 shrink-0">
            {selectedYears.map(({ year }) => (
              <button
                key={year}
                onClick={() => setActiveTab(year)}
                className={`px-5 py-3 text-sm font-bold border-b-2 transition-all ${
                  activeTab === year
                    ? "border-violet-500 text-white bg-white/2"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                Year {year}
                <Badge variant="secondary" className="ml-2 bg-white/10 text-white font-mono">
                  {subjectsData[year]?.length || 0} subjects
                </Badge>
              </button>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-4">
            {/* Left side: Config / Stats (1 col) */}
            <div className="lg:col-span-1 space-y-6">
              {/* Hours Validator Card */}
              <Card className="bg-[#0e0e1b] border-white/10 rounded-2xl shadow-lg">
                <CardHeader className="pb-3 border-b border-white/5">
                  <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                    Hour Validator
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-4">
                    {activeYearSections.map((sec) => {
                      const hours = totalHoursBySection[activeTab]?.[sec] || 0;
                      return (
                        <div key={sec} className="space-y-1.5 border-b border-white/5 pb-3 last:border-b-0 last:pb-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-300">Section {sec}</span>
                            <span className="text-xs font-bold text-white">{hours}h <span className="text-slate-500 font-normal">/ 42h</span></span>
                          </div>
                          
                          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                hours === 42 ? "bg-emerald-500" : hours > 42 ? "bg-red-500" : "bg-amber-500"
                              }`}
                              style={{ width: `${Math.min(100, (hours / 42) * 100)}%` }}
                            />
                          </div>

                          {hours === 42 ? (
                            <div className="flex items-center gap-1 text-emerald-400 text-[10px] font-semibold">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              Perfect 42 hours.
                            </div>
                          ) : hours > 42 ? (
                            <div className="flex items-center gap-1 text-red-400 text-[10px] font-semibold">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              Overloaded ({hours - 42}h extra).
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-amber-400 text-[10px] font-semibold">
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
              <Card className="bg-[#0e0e1b] border-white/10 rounded-2xl shadow-lg">
                <CardHeader className="pb-3 border-b border-white/5 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                    Special Hours
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/admin/subjects/${encodeURIComponent(activeTab)}`)}
                    className="h-7 text-xs text-violet-400 hover:text-violet-300 p-0 hover:bg-transparent"
                  >
                    Edit
                  </Button>
                </CardHeader>
                <CardContent className="pt-4">
                  {activeYearSpecialHours.length === 0 ? (
                    <div className="text-xs text-slate-500 italic py-2">
                      No active special hours config
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activeYearSpecialHours.map((h, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white/5 border border-white/8 p-2 rounded-xl text-xs">
                          <span className="font-semibold text-white capitalize">{h.special_type}</span>
                          <span className="text-slate-400">{h.total_hours} hr(s) total</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right side: Subjects Table (3 cols) */}
            <div className="lg:col-span-3">
              <Card className="bg-[#0e0e1b] border-white/10 rounded-2xl shadow-lg overflow-hidden">
                <CardHeader className="pb-3 border-b border-white/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm font-bold text-white">
                      Curriculum &amp; Section Allocations
                    </CardTitle>
                    <p className="text-xs text-slate-400 mt-1">
                      Check subject type, hour load, and faculty names per section.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/admin/subjects/${encodeURIComponent(activeTab)}`)}
                    className="border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs"
                  >
                    Manage Subjects
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-white/3 text-slate-400 font-semibold border-b border-white/5">
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
                        {activeYearSubjects.length === 0 ? (
                          <tr>
                            <td colSpan={4 + activeYearSections.length} className="py-12 text-center text-slate-500 italic">
                              No subjects configured for Year {activeTab}.
                            </td>
                          </tr>
                        ) : (
                          activeYearSubjects.map((sub) => (
                            <tr key={sub.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                              <td className="py-3 px-4 font-mono text-slate-400">{sub.code || "-"}</td>
                              <td className="py-3 px-4 font-bold text-white">{sub.name}</td>
                              <td className="py-3 px-4">
                                <Badge
                                  className={`text-[9px] uppercase font-bold shrink-0 ${
                                    sub.type === "lab"
                                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"
                                      : sub.type === "elective" || sub.type === "open elective"
                                      ? "bg-purple-500/15 text-purple-300 border border-purple-500/20"
                                      : "bg-slate-700/30 text-slate-300 border border-slate-700/20"
                                  }`}
                                >
                                  {sub.type}
                                </Badge>
                              </td>
                              <td className="py-3 px-4 font-semibold text-white/90">{sub.hoursPerWeek}h</td>
                              {activeYearSections.map((sec) => {
                                const isAssigned = sectionSubjectsData[activeTab]?.[sec]?.has(sub.id) ?? true;
                                const size = sectionSubjectsData[activeTab]?.[sec]?.size || 0;
                                const isMapped = size === 0 || isAssigned;

                                if (!isMapped) {
                                  return (
                                    <td key={sec} className="py-3 px-4 text-center text-slate-600 italic">
                                      —
                                    </td>
                                  );
                                }

                                const fac = sub.facultyBySection[sec];
                                return (
                                  <td key={sec} className="py-3 px-4 text-center">
                                    {fac ? (
                                      <span className="font-semibold text-white/80">{fac}</span>
                                    ) : (
                                      <span className="text-amber-500/80 font-medium">Unassigned</span>
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
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-[#0e0e1a]/95 border-t border-white/10 backdrop-blur-md px-6 py-4 flex items-center justify-between md:pl-[300px] lg:pl-[330px]">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-slate-400 font-semibold">Selected for Generation:</span>
          <span className="text-xs font-bold text-white flex flex-wrap items-center gap-1.5 mt-0.5">
            {selectedYears.map(({ year, sections }) => (
              <Badge key={year} variant="outline" className="border-violet-500/30 bg-violet-500/10 text-violet-300 text-[10px]">
                Yr {year}: Sec {sections.join(", ")}
              </Badge>
            ))}
          </span>
        </div>

        <Button
          onClick={handleGenerate}
          className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-xl gap-2 font-bold px-6 py-5 shadow-lg shadow-violet-500/25"
        >
          <Zap className="h-4 w-4" /> Generate Selected Timetables
        </Button>
      </footer>

      {/* ── Generation Progress Overlay ── */}
      {showProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-[420px] max-w-[95vw] rounded-2xl bg-[#0e0e1b] border border-white/10 shadow-2xl p-6"
            style={{ backgroundImage: 'radial-gradient(ellipse at 30% 0%, rgba(139,92,246,0.1) 0%, transparent 60%)' }}
          >
            {!generating && (
              <button
                onClick={() => {
                  setShowProgress(false);
                  if (generatedResults.length > 0) setShowGallery(true);
                }}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            <div className="mb-5">
              <div className="flex items-center gap-2.5 mb-1">
                {generating
                  ? <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
                  : <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
                <h3 className="text-base font-bold text-white">
                  {generating ? "Generating Timetables..." : "Generation Complete"}
                </h3>
              </div>
              <p className="text-xs text-white/30 pl-7">
                {generating ? "Running multi-year sections in parallel" : `${generatedResults.filter(r => r.status === "ok").length} of ${generatedResults.length} succeeded`}
              </p>
            </div>

            {/* Progress list by year */}
            {selectedYears.map(({ year }) => {
              const items = progressItems.filter((p) => p.year === year);
              if (items.length === 0) return null;
              return (
                <div key={year} className="mb-4">
                  <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2 pl-1">Year {year}</div>
                  <div className="space-y-1.5">
                    {items.map((item) => (
                      <div key={item.section} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/5 border border-white/8">
                        <div className="w-16 text-xs font-semibold text-white/60">Section {item.section}</div>
                        <div className="flex-1">
                          {item.status === "idle" && <div className="h-1 w-full bg-white/10 rounded-full" />}
                          {item.status === "running" && (
                            <div className="h-1 rounded-full overflow-hidden bg-white/10">
                              <div className="h-full bg-violet-400 rounded-full animate-pulse animate-infinite" style={{ width: "60%" }} />
                            </div>
                          )}
                          {item.status === "ok" && <div className="h-1 w-full bg-emerald-400 rounded-full" />}
                          {item.status === "error" && <div className="h-1 w-full bg-red-400 rounded-full" />}
                        </div>
                        <div className="w-5 flex justify-center">
                          {item.status === "idle" && <span className="h-1.5 w-1.5 rounded-full bg-white/15" />}
                          {item.status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />}
                          {item.status === "ok" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                          {item.status === "error" && <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {!generating && generatedResults.length > 0 && (
              <button
                onClick={() => { setShowProgress(false); setShowGallery(true); }}
                className="mt-4 w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-bold hover:from-violet-600 hover:to-purple-700 transition-all shadow-sm shadow-violet-500/25"
              >
                View Generated Timetables →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Generated Gallery Modal ── */}
      <GeneratedTimetablesGallery
        open={showGallery}
        onClose={() => setShowGallery(false)}
        results={generatedResults}
      />
    </main>
  );
}
