import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, XCircle, ArrowRight, ArrowLeft, Zap, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getDepartmentByName, getSubjectsForYear, getSectionSubjects, getSpecialHoursConfigsForYear, getOpenElectiveHours, getDepartments } from "@/lib/supabaseService";

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

interface HourCheck {
  deptName?: string;
  year: string;
  totalHours: number;
  status: "ok" | "warning" | "error";
}

interface GenerateWizardModalProps {
  open: boolean;
  onClose: () => void;
  departmentName: string;
  onProceed: (selection: WizardSelection[], departmentNames: string[]) => void;
}

export function GenerateWizardModal({
  open,
  onClose,
  departmentName,
  onProceed,
}: GenerateWizardModalProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);

  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedDepts, setSelectedDepts] = useState<Record<string, boolean>>({});

  const [selectedYears, setSelectedYears] = useState<Record<string, boolean>>({
    II: true, III: true, IV: true,
  });
  const [selectedSections, setSelectedSections] = useState<Record<string, Record<string, boolean>>>({
    II:  { A: true, B: true, C: true },
    III: { A: true, B: true, C: true },
    IV:  { A: true, B: true, C: true },
  });

  const [hourChecks, setHourChecks] = useState<HourCheck[]>([]);
  const [loadingHours, setLoadingHours] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(1);
      setHourChecks([]);
      (async () => {
        try {
          const depts = await getDepartments();
          setDepartments(depts);
          const initialDepts: Record<string, boolean> = {};
          depts.forEach((d) => {
            initialDepts[d.name] = d.name === departmentName;
          });
          setSelectedDepts(initialDepts);
        } catch (e) {
          console.error("Failed to fetch departments:", e);
        }
      })();
    }
  }, [open, departmentName]);

  const toggleYear = (year: string) => {
    setSelectedYears((prev) => ({ ...prev, [year]: !prev[year] }));
  };

  const toggleSection = (year: string, section: string) => {
    setSelectedSections((prev) => ({
      ...prev,
      [year]: { ...prev[year], [section]: !prev[year][section] },
    }));
  };

  const getWizardSelection = (): WizardSelection[] => {
    return YEAR_ORDER.filter((y) => selectedYears[y])
      .map((y) => ({
        year: y,
        sections: YEAR_CONFIG[y].filter((s) => selectedSections[y]?.[s]),
      }))
      .filter((sel) => sel.sections.length > 0);
  };

  const handleNext = async () => {
    const sel = getWizardSelection();
    if (sel.length === 0) return;

    const activeDeptNames = Object.keys(selectedDepts).filter(name => selectedDepts[name]);
    if (activeDeptNames.length === 0) return;

    setLoadingHours(true);
    setStep(2);

    try {
      const checks: HourCheck[] = [];

      for (const deptName of activeDeptNames) {
        const dept = await getDepartmentByName(deptName);
        if (!dept) continue;

        const deptChecks = await Promise.all(
          sel.map(async ({ year, sections }) => {
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

            return { deptName, year, totalHours: maxSectionHours, status };
          })
        );
        checks.push(...deptChecks);
      }
      setHourChecks(checks);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHours(false);
    }
  };

  const canProceed = hourChecks.length > 0 && !hourChecks.some((c) => c.status === "error");

  const YEAR_COLORS: Record<string, string> = {
    II:  "bg-white/5 border-white/20 text-white",
    III: "bg-white/5 border-white/20 text-white",
    IV:  "bg-white/5 border-white/20 text-white",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg bg-[#0e0e1a] border-white/10 text-white rounded-2xl shadow-2xl"
        style={{ backgroundImage: 'radial-gradient(ellipse at 20% 0%, rgba(139,92,246,0.08) 0%, transparent 55%)' }}
      >
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-xl bg-violet-500/15">
              <Zap className="h-4 w-4 text-violet-400" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-white">
                {step === 1 ? "Select Years & Sections" : "Hour Validation"}
              </DialogTitle>
              <p className="text-xs text-white/30 mt-0.5">Step {step} of 2 · {departmentName}</p>
            </div>
          </div>
          <div className="flex gap-1.5 mt-1">
            <div className={`h-1 flex-1 rounded-full ${step >= 1 ? 'bg-violet-500' : 'bg-white/10'}`} />
            <div className={`h-1 flex-1 rounded-full ${step >= 2 ? 'bg-violet-500' : 'bg-white/10'}`} />
          </div>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3 mt-2">
            {/* Choose Departments */}
            {departments.length > 0 && (
              <div className="space-y-2 mb-4">
                <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest pl-1">Select Departments</span>
                <div className="grid grid-cols-2 gap-2">
                  {departments.map((d) => (
                    <label
                      key={d.id}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedDepts[d.name]
                          ? "bg-white/10 border-white/30 text-white"
                          : "bg-white/3 border-white/10 text-white/40 hover:bg-white/5"
                      }`}
                    >
                      <Checkbox
                        id={`dept-${d.id}`}
                        checked={!!selectedDepts[d.name]}
                        onCheckedChange={() => {
                          setSelectedDepts((prev) => ({
                            ...prev,
                            [d.name]: !prev[d.name]
                          }));
                        }}
                        className="border-white/30 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
                      />
                      <span className="text-xs font-bold">{d.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest pl-1 block mt-2">Select Years &amp; Sections</span>

            {YEAR_ORDER.map((year) => (
              <div key={year} className={`rounded-xl border p-4 transition-all ${selectedYears[year] ? YEAR_COLORS[year] : 'border-white/8 bg-white/2'}`}>
                <div className="flex items-center gap-3 mb-3">
                  <Checkbox
                    id={`year-${year}`}
                    checked={!!selectedYears[year]}
                    onCheckedChange={() => toggleYear(year)}
                    className="border-white/30 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
                  />
                  <label htmlFor={`year-${year}`} className="font-bold text-sm cursor-pointer">
                    Year {year}
                  </label>
                  <span className="text-[10px] text-white/30 ml-auto">
                    {YEAR_CONFIG[year].length} sections available
                  </span>
                </div>

                {selectedYears[year] && (
                  <div className="flex gap-2 pl-7">
                    {YEAR_CONFIG[year].map((sec) => (
                      <button
                        key={sec}
                        onClick={() => toggleSection(year, sec)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                          selectedSections[year]?.[sec]
                            ? 'bg-white/15 border-white/30 text-white'
                            : 'bg-white/3 border-white/10 text-white/30'
                        }`}
                      >
                        Sec {sec}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-white/25">
                {getWizardSelection().reduce((n, s) => n + s.sections.length, 0) * Object.keys(selectedDepts).filter(n => selectedDepts[n]).length} section(s) selected
              </p>
              <Button
                onClick={handleNext}
                disabled={getWizardSelection().length === 0 || Object.keys(selectedDepts).filter(n => selectedDepts[n]).length === 0}
                className="bg-violet-500 hover:bg-violet-600 text-white rounded-xl gap-2 disabled:opacity-40"
              >
                Next <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 mt-2">
            {loadingHours ? (
              <div className="py-8 text-center text-white/30 text-sm">Checking hour configurations…</div>
            ) : (
              <>
                {hourChecks.map((check) => (
                  <div key={`${check.deptName}-${check.year}`} className={`flex items-center gap-4 rounded-xl border p-4 ${
                    check.status === 'ok'      ? 'border-emerald-500/30 bg-emerald-500/8' :
                    check.status === 'warning' ? 'border-amber-500/30 bg-amber-500/8' :
                                                 'border-red-500/30 bg-red-500/8'
                  }`}>
                    <div className="text-[11px] font-bold text-white/80 w-24 leading-snug">
                      <div className="text-emerald-400 truncate">{check.deptName}</div>
                      <div>Year {check.year}</div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className={`text-xl font-bold ${
                          check.status === 'ok' ? 'text-emerald-300' :
                          check.status === 'warning' ? 'text-amber-300' : 'text-red-300'
                        }`}>{check.totalHours}h</div>
                        <span className="text-[10px] text-white/25">/ {TOTAL_HOURS}h required</span>
                      </div>
                      <div className="h-1.5 w-full bg-white/10 rounded-full mt-1.5">
                        <div
                          className={`h-full rounded-full transition-all ${
                            check.status === 'ok' ? 'bg-emerald-400' :
                            check.status === 'warning' ? 'bg-amber-400' : 'bg-red-400'
                          }`}
                          style={{ width: `${Math.min(100, (check.totalHours / TOTAL_HOURS) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {check.status === 'ok' && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
                      {check.status === 'warning' && (
                        <>
                          <AlertTriangle className="h-5 w-5 text-amber-400" />
                          <button
                            onClick={() => { onClose(); navigate(`/admin/subjects/${encodeURIComponent(check.year)}`); }}
                            className="flex items-center gap-1 text-[10px] text-amber-300 hover:text-amber-200 underline"
                          >
                            Edit <ExternalLink className="h-3 w-3" />
                          </button>
                        </>
                      )}
                      {check.status === 'error' && (
                        <>
                          <XCircle className="h-5 w-5 text-red-400" />
                          <button
                            onClick={() => { onClose(); navigate(`/admin/subjects/${encodeURIComponent(check.year)}`); }}
                            className="flex items-center gap-1 text-[10px] text-red-300 hover:text-red-200 underline"
                          >
                            Fix <ExternalLink className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {hourChecks.some((c) => c.status === 'warning') && (
                  <p className="text-[11px] text-amber-300/70 bg-amber-500/8 border border-amber-500/20 rounded-xl px-3 py-2">
                    ⚠️ Some sections have fewer than 42 hours. Generation will proceed but those timetables may have empty slots.
                  </p>
                )}
                {hourChecks.some((c) => c.status === 'error') && (
                  <p className="text-[11px] text-red-300/70 bg-red-500/8 border border-red-500/20 rounded-xl px-3 py-2">
                    ✗ Some sections have more than 42 hours. This is not allowed. Please modify section subjects first.
                  </p>
                )}
              </>
            )}

            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setStep(1)} className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white transition-colors">
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <Button
                onClick={() => {
                  onClose();
                  const activeDeptNames = Object.keys(selectedDepts).filter(name => selectedDepts[name]);
                  onProceed(getWizardSelection(), activeDeptNames);
                }}
                disabled={!canProceed || loadingHours}
                className="bg-violet-500 hover:bg-violet-600 text-white rounded-xl gap-2 disabled:opacity-40"
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
