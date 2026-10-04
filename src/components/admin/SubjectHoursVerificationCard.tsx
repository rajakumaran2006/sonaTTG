import React, { useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  BookOpen,
  Search,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
  ShieldCheck,
  Check,
} from "lucide-react";
import type { TimetableHourVerificationResult, SubjectHourVerification } from "@/lib/timetable";

interface SubjectHoursVerificationCardProps {
  verification: TimetableHourVerificationResult | null | undefined;
  className?: string;
  isDark?: boolean;
  defaultExpanded?: boolean;
}

export const SubjectHoursVerificationCard: React.FC<SubjectHoursVerificationCardProps> = ({
  verification,
  className = "",
  isDark = false,
  defaultExpanded,
}) => {
  const isValid = verification?.isValid ?? false;
  // If defaultExpanded is passed, use it; otherwise, collapse if 100% verified to keep the page clean and spacious!
  const [expanded, setExpanded] = useState<boolean>(
    defaultExpanded !== undefined ? defaultExpanded : !isValid
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "theory" | "lab" | "elective" | "mismatch">("all");

  const subjects = verification?.subjects || [];
  const mismatches = verification?.mismatches || [];

  const totalRequiredHours = useMemo(() => {
    return subjects.reduce((sum, s) => sum + s.givenHours, 0);
  }, [subjects]);

  const totalAllocatedHours = useMemo(() => {
    return subjects.reduce((sum, s) => sum + s.generatedHours, 0);
  }, [subjects]);

  const matchedCount = useMemo(() => {
    return subjects.filter((s) => s.isMatch).length;
  }, [subjects]);

  const filteredSubjects = useMemo(() => {
    return subjects.filter((s) => {
      // Search match
      const q = search.toLowerCase().trim();
      const name = s.subjectName || s.name || "";
      const code = s.subjectCode || s.code || "";
      const matchSearch =
        !q ||
        name.toLowerCase().includes(q) ||
        code.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q);

      if (!matchSearch) return false;

      // Filter match
      if (filter === "all") return true;
      if (filter === "mismatch") return !s.isMatch;
      if (filter === "lab") return s.type === "lab";
      if (filter === "elective") return s.type === "elective" || s.type === "open elective";
      if (filter === "theory") return s.type === "theory";
      return true;
    });
  }, [subjects, search, filter]);

  if (!verification) {
    return null;
  }

  return (
    <Card
      className={`rounded-2xl border backdrop-blur-2xl transition-all duration-300 overflow-hidden ${
        isDark
          ? "bg-[#090d1c]/80 border-indigo-500/25 text-white shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
          : "bg-white/80 border-indigo-200/70 text-slate-900 shadow-[0_4px_20px_rgba(99,102,241,0.06)]"
      } ${className}`}
    >
      <div
        className={`p-4 sm:px-6 sm:py-4.5 cursor-pointer select-none transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3.5 ${
          isDark
            ? "hover:bg-white/[0.02]"
            : "hover:bg-indigo-50/40"
        } ${expanded ? (isDark ? "border-b border-indigo-500/15" : "border-b border-indigo-100/70") : ""}`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3.5">
          <div
            className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
              isValid
                ? isDark
                  ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/25"
                  : "bg-indigo-50 text-indigo-600 border border-indigo-200"
                : isDark
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                : "bg-amber-50 text-amber-600 border border-amber-200"
            }`}
          >
            {isValid ? (
              <ShieldCheck className="h-5 w-5" />
            ) : (
              <AlertTriangle className="h-5 w-5" />
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm sm:text-base font-bold tracking-tight text-slate-900 dark:text-white">
                Subject Allocation &amp; Hours Audit
              </h4>
              <Badge
                variant="outline"
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
                  isValid
                    ? isDark
                      ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
                      : "bg-indigo-50 border-indigo-300 text-indigo-700"
                    : isDark
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                    : "bg-amber-50 border-amber-300 text-amber-800"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isValid ? "bg-indigo-500" : "bg-amber-500"
                  }`}
                />
                {isValid
                  ? `100% Exact Match (${matchedCount}/${subjects.length} Subjects)`
                  : `${mismatches.length} Mismatch${mismatches.length > 1 ? "es" : ""}`}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isValid
                ? "Every subject is guaranteed to receive exactly its configured weekly hours (e.g. AP&S: 5h / 5h)."
                : "Some subjects have allocated hours that differ from the configured requirements."}
            </p>
          </div>
        </div>

        {/* Quick metrics in header */}
        <div className="flex items-center gap-4 self-stretch md:self-auto justify-between md:justify-end">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="px-2.5 py-1 rounded-lg bg-slate-100/80 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 text-center">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
                Required
              </span>
              <span className="text-xs font-bold font-mono text-slate-800 dark:text-slate-200">
                {totalRequiredHours}h
              </span>
            </div>

            <div className="px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-center">
              <span className="text-[10px] text-indigo-700 dark:text-indigo-300 uppercase font-bold tracking-wider block">
                Allocated
              </span>
              <span className="text-xs font-bold font-mono text-indigo-600 dark:text-indigo-400">
                {totalAllocatedHours}h
              </span>
            </div>

            <div className="px-2.5 py-1 rounded-lg bg-slate-100/80 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 text-center hidden sm:block">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
                Accuracy
              </span>
              <span className="text-xs font-bold font-mono text-slate-800 dark:text-slate-200">
                {Math.round((matchedCount / (subjects.length || 1)) * 100)}%
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 rounded-lg text-xs gap-1 font-semibold"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            <span>{expanded ? "Hide Breakdown" : "View Breakdown"}</span>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <CardContent className="pt-4 px-5 pb-5 space-y-4">
          {/* Mismatch Alert Banner if any */}
          {!isValid && mismatches.length > 0 && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                isDark
                  ? "bg-rose-500/10 border-rose-500/25 text-rose-300"
                  : "bg-rose-50 border-rose-200 text-rose-800"
              }`}
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
              <div className="space-y-1">
                <strong className="font-semibold text-rose-700 dark:text-rose-300">
                  Subject Hours Mismatches Detected:
                </strong>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                  {mismatches.map((m, idx) => {
                    const mName = m.subjectName || m.name || "Subject";
                    const diff = m.difference ?? m.diff ?? 0;
                    return (
                      <li key={idx}>
                        <span className="font-semibold">{mName}</span>: configured for{" "}
                        <span className="font-mono font-bold">{m.givenHours}h</span>, but timetable has{" "}
                        <span className="font-mono font-bold">{m.generatedHours}h</span> (
                        {diff > 0 ? `+${diff}h surplus` : `${diff}h deficit`}).
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}

          {/* Filter and Search Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-1">
            <div className="relative w-full sm:w-72">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter subjects in audit..."
                className="h-8 pl-8 text-xs rounded-xl"
              />
            </div>

            <div className="flex items-center p-0.5 rounded-lg border text-xs bg-muted/60 self-stretch sm:self-auto overflow-x-auto">
              {(
                [
                  { id: "all", label: "All Subjects" },
                  { id: "theory", label: "Theory" },
                  { id: "lab", label: "Labs" },
                  { id: "elective", label: "Electives" },
                  ...(mismatches.length > 0 ? [{ id: "mismatch", label: "Mismatches" }] : []),
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id as any)}
                  className={`px-3 py-1 rounded-md font-semibold text-xs transition-all whitespace-nowrap ${
                    filter === tab.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Subjects Table */}
          <div className="rounded-xl border border-border/80 overflow-hidden max-h-[360px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 text-xs font-semibold bg-muted/80 backdrop-blur-sm border-b border-border text-muted-foreground">
                <tr>
                  <th className="py-2.5 px-3.5 w-24">Code</th>
                  <th className="py-2.5 px-3.5">Subject Name</th>
                  <th className="py-2.5 px-3 text-center w-28">Type</th>
                  <th className="py-2.5 px-3 text-center w-24">Configured</th>
                  <th className="py-2.5 px-3 text-center w-24">In Grid</th>
                  <th className="py-2.5 px-3.5 text-right w-36">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredSubjects.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 text-center text-xs text-muted-foreground italic"
                    >
                      No subjects match current filter
                    </td>
                  </tr>
                ) : (
                  filteredSubjects.map((s, idx) => {
                    const sName = s.subjectName || s.name || "";
                    const sCode = s.subjectCode || s.code || "";
                    const diff = s.difference ?? s.diff ?? 0;
                    const isAps =
                      /applied\s*probability|ap&s|aps/i.test(sName) ||
                      /applied\s*probability|ap&s|aps/i.test(sCode);

                    return (
                      <tr
                        key={idx}
                        className={`transition-colors hover:bg-muted/40 ${
                          !s.isMatch
                            ? isDark
                              ? "bg-rose-500/5 hover:bg-rose-500/10"
                              : "bg-rose-50/40 hover:bg-rose-100/40"
                            : ""
                        }`}
                      >
                        <td className="py-2.5 px-3.5 font-mono font-medium text-muted-foreground">
                          {sCode || "—"}
                        </td>
                        <td className="py-2.5 px-3.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-800 dark:text-slate-100 text-xs sm:text-[13px]">
                              {sName}
                            </span>
                            {isAps && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                                5h APS
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              s.type === "lab"
                                ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300"
                                : s.type === "elective" || s.type === "open elective"
                                ? "bg-purple-500/15 text-purple-600 dark:text-purple-300"
                                : s.type === "special"
                                ? "bg-amber-500/15 text-amber-600 dark:text-amber-300"
                                : "bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300"
                            }`}
                          >
                            {s.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-xs sm:text-sm">
                          {s.givenHours}h
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-xs sm:text-sm">
                          <span
                            className={
                              s.isMatch
                                ? "text-indigo-600 dark:text-indigo-400"
                                : diff < 0
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-amber-600 dark:text-amber-400"
                            }
                          >
                            {s.generatedHours}h
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 text-right">
                          {s.isMatch ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                              <Check className="h-3.5 w-3.5" />
                              Exact Match
                            </span>
                          ) : diff < 0 ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                              <AlertCircle className="h-3.5 w-3.5" />
                              Deficit ({diff}h)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Surplus (+{diff}h)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
};
