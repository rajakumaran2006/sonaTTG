import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, XCircle, ArrowRight, ArrowLeft, Zap, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getDepartmentByName, getSubjectsForYear, getSectionSubjects, getSpecialHoursConfigsForYear, getOpenElectiveHours } from "@/lib/supabaseService";
import { useDarkMode } from "@/context/DarkModeContext";

const YEAR_CONFIG: Record<string, string[]> = {
  "II":  ["A", "B", "C"],
  "III": ["A", "B", "C"],
  "IV":  ["A", "B", "C"],
};
const YEAR_ORDER = ["II", "III", "IV"];
const TOTAL_HOURS = 42;

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

export interface WizardSelection {
  year: string;
  sections: string[];
}

export interface DepartmentSelection {
  departmentName: string;
  selectedYears: WizardSelection[];
}

interface HourCheck {
  year: string;
  totalHours: number;
  status: "ok" | "warning" | "error";
}

interface GenerateWizardModalProps {
  open: boolean;
  onClose: () => void;
  departments: any[];
  defaultDepartmentNames: string[];
  onProceed: (selections: DepartmentSelection[]) => void;
}

export function GenerateWizardModal({
  open,
  onClose,
  departments,
  defaultDepartmentNames,
  onProceed,
}: GenerateWizardModalProps) {
  const navigate = useNavigate();
  const { isDark } = useDarkMode();
  const [step, setStep] = useState<1 | 2>(1);

  const [selectedDepts, setSelectedDepts] = useState<Record<string, boolean>>({});
  const [selectedYears, setSelectedYears] = useState<Record<string, Record<string, boolean>>>({});
  const [selectedSections, setSelectedSections] = useState<Record<string, Record<string, Record<string, boolean>>>>({});

  const [hourChecks, setHourChecks] = useState<HourCheck[]>([]);
  const [loadingHours, setLoadingHours] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(1);
      setHourChecks([]);
      
      const initialDepts: Record<string, boolean> = {};
      departments.forEach(d => {
        initialDepts[d.name] = defaultDepartmentNames.includes(d.name);
      });
      setSelectedDepts(initialDepts);

      const initialYears: Record<string, Record<string, boolean>> = {};
      const initialSections: Record<string, Record<string, Record<string, boolean>>> = {};
      departments.forEach(d => {
        initialYears[d.name] = { II: true, III: true, IV: true };
        initialSections[d.name] = {
          II:  { A: true, B: true, C: true },
          III: { A: true, B: true, C: true },
          IV:  { A: true, B: true, C: true },
        };
      });
      setSelectedYears(initialYears);
      setSelectedSections(initialSections);
    }
  }, [open, departments, defaultDepartmentNames]);

  const getWizardSelection = (): DepartmentSelection[] => {
    return Object.keys(selectedDepts)
      .filter((deptName) => selectedDepts[deptName])
      .map((deptName) => {
        const deptYears = YEAR_ORDER.filter((y) => selectedYears[deptName]?.[y])
          .map((y) => ({
            year: y,
            sections: YEAR_CONFIG[y].filter((s) => selectedSections[deptName]?.[y]?.[s]),
          }))
          .filter((sel) => sel.sections.length > 0);

        return {
          departmentName: deptName,
          selectedYears: deptYears,
        };
      })
      .filter((deptSel) => deptSel.selectedYears.length > 0);
  };

  const handleNext = async () => {
    const selections = getWizardSelection();
    if (selections.length === 0) return;

    setLoadingHours(true);
    setStep(2);

    try {
      const checks: HourCheck[] = [];

      for (const deptSel of selections) {
        const dept = await getDepartmentByName(deptSel.departmentName);
        if (!dept) continue;

        const deptChecks = await Promise.all(
          deptSel.selectedYears.map(async ({ year, sections }) => {
            const [subjects, specialHoursConfigs] = await Promise.all([
              getSubjectsForYear(dept.id, year).catch(() => []),
              getSpecialHoursConfigsForYear(dept.id, year).catch(() => []),
            ]);
            
            let specialHoursTotal = 0;
            specialHoursConfigs.forEach((config: any) => {
              specialHoursTotal += config.total_hours || 0;
            });
            
            let maxSectionHours = 0;
            let hasError = false;
            let hasWarning = false;
            
            for (const section of sections) {
              const secSubjIds = await getSectionSubjects(dept.id, year, section).catch(() => [] as string[]);
              const secSubjects = secSubjIds.length > 0 
                ? subjects.filter(s => secSubjIds.includes(s.id))
                : subjects;
              const subjectsTotal = calculateTotalHours(secSubjects);
              const total = subjectsTotal + specialHoursTotal;
              maxSectionHours = Math.max(maxSectionHours, total);
              if (total > TOTAL_HOURS) hasError = true;
              if (total < TOTAL_HOURS) hasWarning = true;
            }
            
            let status: HourCheck["status"] = "ok";
            if (hasError) status = "error";
            else if (hasWarning) status = "warning";
            
            return { year: `${deptSel.departmentName} - Yr ${year}`, totalHours: maxSectionHours, status };
          })
        );
        checks.push(...deptChecks);
      }
      setHourChecks(checks);
    } finally {
      setLoadingHours(false);
    }
  };

  const canProceed = hourChecks.length > 0 && !hourChecks.some((c) => c.status === "error");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className={`max-w-xl border rounded-2xl shadow-2xl transition-colors duration-300 ${
        isDark 
          ? "bg-[#0e0e1a] border-white/10 text-white" 
          : "bg-white border-slate-200 text-slate-900"
      }`}
        style={isDark ? { backgroundImage: 'radial-gradient(ellipse at 20% 0%, rgba(16,185,129,0.08) 0%, transparent 55%)' } : {}}
      >
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className={`p-2 rounded-xl ${isDark ? "bg-emerald-500/15" : "bg-emerald-50"}`}>
              <Zap className={`h-4 w-4 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
            </div>
            <div>
              <DialogTitle className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                {step === 1 ? "Select Departments, Years & Sections" : "Hour Validation"}
              </DialogTitle>
              <p className={`text-xs mt-0.5 ${isDark ? "text-white/30" : "text-slate-400"}`}>Step {step} of 2</p>
            </div>
          </div>
          <div className="flex gap-1.5 mt-1">
            <div className={`h-1 flex-1 rounded-full ${
              step >= 1 ? 'bg-emerald-500' : (isDark ? 'bg-white/10' : 'bg-slate-100')
            }`} />
            <div className={`h-1 flex-1 rounded-full ${
              step >= 2 ? 'bg-emerald-500' : (isDark ? 'bg-white/10' : 'bg-slate-100')
            }`} />
          </div>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 mt-2 max-h-[60vh] overflow-y-auto pr-1">
            {/* Department selection boxes */}
            <div className={`rounded-xl border p-4 transition-colors duration-300 ${
              isDark ? "border-white/10 bg-white/2" : "border-slate-200 bg-slate-50/50"
            }`}>
              <label className={`text-xs font-bold uppercase tracking-wider mb-3 block ${
                isDark ? "text-white/55" : "text-slate-500"
              }`}>
                Select Departments
              </label>
              <div className="grid grid-cols-2 gap-3">
                {departments.map((d) => (
                  <div key={d.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`dept-${d.id}`}
                      checked={!!selectedDepts[d.name]}
                      onCheckedChange={() => {
                        setSelectedDepts((prev) => ({ ...prev, [d.name]: !prev[d.name] }));
                      }}
                      className={`data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500 ${
                        isDark ? "border-white/30" : "border-slate-300"
                      }`}
                    />
                    <label htmlFor={`dept-${d.id}`} className={`text-xs font-semibold cursor-pointer truncate ${
                      isDark ? "text-white" : "text-slate-700"
                    }`} title={d.name}>
                      {d.name}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Render years & sections for active/checked departments */}
            {departments.filter(d => selectedDepts[d.name]).map((dept) => (
              <div key={dept.id} className="space-y-3">
                <div className={`text-xs font-bold border-b pb-1 mt-4 ${
                  isDark ? "text-emerald-400 border-white/10" : "text-emerald-600 border-slate-200"
                }`}>
                  {dept.name}
                </div>
                {YEAR_ORDER.map((year) => {
                  const isChecked = !!selectedYears[dept.name]?.[year];
                  const itemBgBorder = isChecked
                    ? (isDark ? "bg-emerald-500/5 border-emerald-500/30 text-white" : "bg-emerald-50/40 border-emerald-250 text-slate-900")
                    : (isDark ? "border-white/8 bg-white/2 text-white/50" : "border-slate-200 bg-slate-50/20 text-slate-500");
                  
                  return (
                    <div key={year} className={`rounded-xl border p-4 transition-all duration-200 ${itemBgBorder}`}>
                      <div className="flex items-center gap-3 mb-3">
                        <Checkbox
                          id={`year-${dept.id}-${year}`}
                          checked={isChecked}
                          onCheckedChange={() => {
                            setSelectedYears((prev) => ({
                              ...prev,
                              [dept.name]: {
                                ...prev[dept.name],
                                [year]: !prev[dept.name]?.[year]
                              }
                            }));
                          }}
                          className={`data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500 ${
                            isDark ? "border-white/30" : "border-slate-300"
                          }`}
                        />
                        <label htmlFor={`year-${dept.id}-${year}`} className={`font-bold text-sm cursor-pointer ${
                          isDark ? "text-white" : "text-slate-800"
                        }`}>
                          Year {year}
                        </label>
                        <span className={`text-[10px] ml-auto ${
                          isDark ? "text-white/30" : "text-slate-400"
                        }`}>
                          {YEAR_CONFIG[year].length} sections available
                        </span>
                      </div>

                      {isChecked && (
                        <div className="flex gap-2 pl-7">
                          {YEAR_CONFIG[year].map((sec) => {
                            const isSecSelected = !!selectedSections[dept.name]?.[year]?.[sec];
                            return (
                              <button
                                key={sec}
                                onClick={() => {
                                  setSelectedSections((prev) => ({
                                    ...prev,
                                    [dept.name]: {
                                      ...prev[dept.name],
                                      [year]: {
                                        ...prev[dept.name]?.[year],
                                        [sec]: !prev[dept.name]?.[year]?.[sec]
                                      }
                                    }
                                  }));
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all duration-200 ${
                                  isSecSelected
                                    ? (isDark ? 'bg-emerald-500/20 border-emerald-500 text-white' : 'bg-emerald-500 text-white border-emerald-600')
                                    : (isDark ? 'bg-white/3 border-white/10 text-white/30 hover:border-white/20' : 'bg-slate-100 border-slate-200 text-slate-450 hover:border-slate-300')
                                }`}
                              >
                                Sec {sec}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="flex items-center justify-between pt-2">
              <p className={`text-xs ${isDark ? "text-white/25" : "text-slate-400"}`}>
                {getWizardSelection().reduce((sum, d) => sum + d.selectedYears.reduce((n, s) => n + s.sections.length, 0), 0)} section(s) selected
              </p>
              <Button
                onClick={handleNext}
                disabled={getWizardSelection().length === 0}
                className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl gap-2 disabled:opacity-40"
              >
                Next <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 mt-2 max-h-[60vh] overflow-y-auto pr-1">
            {loadingHours ? (
              <div className={`py-8 text-center text-sm ${isDark ? "text-white/30" : "text-slate-450"}`}>Checking hour configurations…</div>
            ) : (
              <>
                {hourChecks.map((check) => {
                  let borderClass = "";
                  let bgClass = "";
                  let textClass = "";
                  let progressBg = "";
                  
                  if (check.status === "ok") {
                    borderClass = isDark ? "border-emerald-500/30" : "border-emerald-250";
                    bgClass = isDark ? "bg-emerald-500/8" : "bg-emerald-50/50";
                    textClass = isDark ? "text-emerald-300" : "text-emerald-600";
                    progressBg = "bg-emerald-500";
                  } else if (check.status === "warning") {
                    borderClass = isDark ? "border-amber-500/30" : "border-amber-250";
                    bgClass = isDark ? "bg-amber-500/8" : "bg-amber-50/50";
                    textClass = isDark ? "text-amber-400" : "text-amber-600";
                    progressBg = "bg-amber-500";
                  } else {
                    borderClass = isDark ? "border-red-500/30" : "border-red-250";
                    bgClass = isDark ? "bg-red-500/8" : "bg-red-50/50";
                    textClass = isDark ? "text-red-400" : "text-red-600";
                    progressBg = "bg-red-500";
                  }

                  return (
                    <div key={check.year} className={`flex items-center gap-4 rounded-xl border p-4 transition-colors duration-300 ${borderClass} ${bgClass}`}>
                      <div className={`text-xs font-bold w-44 truncate ${isDark ? "text-white/80" : "text-slate-700"}`} title={check.year}>{check.year}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className={`text-lg font-bold ${textClass}`}>{check.totalHours}h</div>
                          <span className={`text-[10px] ${isDark ? "text-white/25" : "text-slate-400"}`}>/ {TOTAL_HOURS}h required</span>
                        </div>
                        <div className={`h-1.5 w-full rounded-full mt-1.5 ${isDark ? "bg-white/10" : "bg-slate-200"}`}>
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${progressBg}`}
                            style={{ width: `${Math.min(100, (check.totalHours / TOTAL_HOURS) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {check.status === 'ok' && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                        {check.status === 'warning' && (
                          <>
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            <button
                              onClick={() => { onClose(); navigate(`/admin/subjects`); }}
                              className={`flex items-center gap-1 text-[10px] underline ${
                                isDark ? "text-amber-300 hover:text-amber-200" : "text-amber-600 hover:text-amber-700"
                              }`}
                            >
                              Edit <ExternalLink className="h-3 w-3" />
                            </button>
                          </>
                        )}
                        {check.status === 'error' && (
                          <>
                            <XCircle className="h-5 w-5 text-red-500" />
                            <button
                              onClick={() => { onClose(); navigate(`/admin/subjects`); }}
                              className={`flex items-center gap-1 text-[10px] underline ${
                                isDark ? "text-red-300 hover:text-red-200" : "text-red-650 hover:text-red-800"
                              }`}
                            >
                              Fix <ExternalLink className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

                {hourChecks.some((c) => c.status === 'warning') && (
                  <p className={`text-[11px] border rounded-xl px-3 py-2 ${
                    isDark 
                      ? "text-amber-300/70 bg-amber-500/8 border-amber-500/20" 
                      : "text-amber-750 bg-amber-50/50 border-amber-250"
                  }`}>
                    ⚠️ Some sections have fewer than 42 hours. Generation will proceed but those timetables may have empty slots.
                  </p>
                )}
                {hourChecks.some((c) => c.status === 'error') && (
                  <p className={`text-[11px] border rounded-xl px-3 py-2 ${
                    isDark 
                      ? "text-red-300/70 bg-red-500/8 border-red-500/20" 
                      : "text-red-750 bg-red-50/50 border-red-250"
                  }`}>
                    ✗ Some sections have more than 42 hours. This is not allowed. Please modify section subjects first.
                  </p>
                )}
              </>
            )}

            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setStep(1)} className={`flex items-center gap-1.5 text-sm transition-colors ${
                isDark ? "text-white/40 hover:text-white" : "text-slate-400 hover:text-slate-700"
              }`}>
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <Button
                onClick={() => { onClose(); onProceed(getWizardSelection()); }}
                disabled={!canProceed || loadingHours}
                className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl gap-2 disabled:opacity-40"
              >
                Proceed to Review <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


