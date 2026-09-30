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
  defaultExpanded = true,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "theory" | "lab" | "elective" | "mismatch">("all");

  const subjects = verification?.subjects || [];
  const mismatches = verification?.mismatches || [];
  const isValid = verification?.isValid ?? false;

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
      className={`rounded-2xl border transition-all duration-300 shadow-sm ${
        isDark
          ? "bg-[#0f0f1c] border-white/10 text-white"
          : "bg-white border-slate-200 text-slate-900"
      } ${className}`}
    >
      <CardHeader
        className={`pb-3 pt-4 px-5 border-b cursor-pointer select-none transition-colors ${
          isDark
            ? "border-white/5 hover:bg-white/[0.02]"
            : "border-slate-100 hover:bg-slate-50/60"
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl flex items-center justify-center shrink-0 ${
                isValid
                  ? isDark
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                    : "bg-emerald-50 text-emerald-600 border border-emerald-200"
                  : isDark
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                  : "bg-amber-50 text-amber-600 border border-amber-200"
              }`}
            >
              {isValid ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <AlertTriangle className="h-5 w-5" />
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-sm font-bold tracking-tight">
                  Subject Weekly Hours Allocation Verification
                </CardTitle>
                <Badge
                  variant="outline"
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1.5 ${
                    isValid
                      ? isDark
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                        : "bg-emerald-50 border-emerald-300 text-emerald-700"
                      : isDark
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                      : "bg-amber-50 border-amber-300 text-amber-800"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isValid ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                    }`}
                  />
                  {isValid
                    ? `100% Exact Match (${matchedCount}/${subjects.length} Subjects)`
                    : `${mismatches.length} Mismatch${mismatches.length > 1 ? "es" : ""}`}
                </Badge>
              </div>
              <p
                className={`text-xs mt-0.5 ${
                  isDark ? "text-slate-400" : "text-slate-500"
                }`}
              >
                Every subject is guaranteed to receive exactly its configured weekly hours (e.g. AP&S: 5h / 5h).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            <div className="text-right hidden sm:block">
              <span
                className={`text-xs font-mono font-bold ${
                  isValid ? "text-emerald-500" : "text-amber-500"
                }`}
              >
                {totalAllocatedHours}h Allocated
              </span>
              <span
                className={`text-[11px] block font-mono ${
                  isDark ? "text-slate-500" : "text-slate-400"
                }`}
              >
                {totalRequiredHours}h Required
              </span>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className={`h-7 w-7 p-0 rounded-lg ${
                isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-4 px-5 pb-5 space-y-4">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div
              className={`p-3 rounded-xl border flex flex-col justify-between ${
                isDark ? "bg-white/[0.03] border-white/5" : "bg-slate-50 border-slate-200/80"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Required Hours
                </span>
                <Clock className={`h-3.5 w-3.5 ${isDark ? "text-slate-500" : "text-slate-400"}`} />
              </div>
              <div className="mt-1 text-base font-bold font-mono">
                {totalRequiredHours} <span className="text-xs font-normal">hrs/wk</span>
              </div>
            </div>

            <div
              className={`p-3 rounded-xl border flex flex-col justify-between ${
                isDark ? "bg-white/[0.03] border-white/5" : "bg-slate-50 border-slate-200/80"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Allocated Hours
                </span>
                <Sparkles className={`h-3.5 w-3.5 text-emerald-500`} />
              </div>
              <div className="mt-1 text-base font-bold font-mono text-emerald-500">
                {totalAllocatedHours} <span className="text-xs font-normal">hrs in grid</span>
              </div>
            </div>

            <div
              className={`p-3 rounded-xl border flex flex-col justify-between ${
                isDark ? "bg-white/[0.03] border-white/5" : "bg-slate-50 border-slate-200/80"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Subject Accuracy
                </span>
                <CheckCircle2 className={`h-3.5 w-3.5 ${isValid ? "text-emerald-500" : "text-amber-500"}`} />
              </div>
              <div
                className={`mt-1 text-base font-bold font-mono ${
                  isValid ? "text-emerald-500" : "text-amber-500"
                }`}
              >
                {matchedCount}/{subjects.length}{" "}
                <span className="text-xs font-normal">
                  ({Math.round((matchedCount / (subjects.length || 1)) * 100)}%)
                </span>
              </div>
            </div>

            <div
              className={`p-3 rounded-xl border flex flex-col justify-between ${
                isDark ? "bg-white/[0.03] border-white/5" : "bg-slate-50 border-slate-200/80"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Unallocated Slots
                </span>
                <Layers className={`h-3.5 w-3.5 ${isDark ? "text-slate-500" : "text-slate-400"}`} />
              </div>
              <div className="mt-1 text-base font-bold font-mono">
                {verification.unallocatedSlots}{" "}
                <span className="text-xs font-normal">empty slots</span>
              </div>
            </div>
          </div>

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
                <strong className="font-semibold">Subject Hours Mismatches Detected:</strong>
                <ul className="list-disc pl-4 space-y-0.5">
                  {mismatches.map((m, idx) => {
                    const mName = m.subjectName || m.name || "Subject";
                    const diff = m.difference ?? m.diff ?? 0;
                    return (
                      <li key={idx}>
                        <span className="font-semibold">{mName}</span>: configured for{" "}
                        <span className="font-mono">{m.givenHours}h</span>, but timetable has{" "}
                        <span className="font-mono">{m.generatedHours}h</span> (
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
            <div className="relative w-full sm:w-64">
              <Search
                className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${
                  isDark ? "text-slate-500" : "text-slate-400"
                }`}
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter subjects..."
                className={`h-8 pl-8 text-xs rounded-lg ${
                  isDark
                    ? "bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                    : "bg-white border-slate-200 text-slate-800 placeholder:text-slate-400"
                }`}
              />
            </div>

            <div
              className={`flex items-center p-0.5 rounded-lg border text-xs self-stretch sm:self-auto overflow-x-auto ${
                isDark ? "bg-white/5 border-white/10" : "bg-slate-100 border-slate-200"
              }`}
            >
              {(
                [
                  { id: "all", label: "All" },
                  { id: "theory", label: "Theory" },
                  { id: "lab", label: "Labs" },
                  { id: "elective", label: "Electives" },
                  ...(mismatches.length > 0 ? [{ id: "mismatch", label: "Mismatches" }] : []),
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id as any)}
                  className={`px-2.5 py-1 rounded-md font-semibold text-[11px] transition-all whitespace-nowrap ${
                    filter === tab.id
                      ? isDark
                        ? "bg-white/15 text-white shadow-sm"
                        : "bg-white text-slate-900 shadow-sm"
                      : isDark
                      ? "text-slate-400 hover:text-white"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Subjects Table */}
          <div
            className={`rounded-xl border overflow-hidden max-h-[340px] overflow-y-auto ${
              isDark ? "border-white/5 bg-white/[0.01]" : "border-slate-200/80 bg-slate-50/30"
            }`}
          >
            <table className="w-full text-xs border-collapse">
              <thead
                className={`sticky top-0 z-10 text-[11px] font-semibold border-b ${
                  isDark ? "bg-[#141424] border-white/10 text-slate-400" : "bg-slate-100 border-slate-200 text-slate-600"
                }`}
              >
                <tr>
                  <th className="py-2 px-3 text-left w-20">Code</th>
                  <th className="py-2 px-3 text-left">Subject Name</th>
                  <th className="py-2 px-2 text-center w-24">Type</th>
                  <th className="py-2 px-2 text-center w-20">Given Hrs</th>
                  <th className="py-2 px-2 text-center w-24">Generated</th>
                  <th className="py-2 px-3 text-right w-36">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredSubjects.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className={`py-8 text-center italic ${
                        isDark ? "text-slate-500" : "text-slate-400"
                      }`}
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
                        className={`transition-colors ${
                          !s.isMatch
                            ? isDark
                              ? "bg-rose-500/5 hover:bg-rose-500/10"
                              : "bg-rose-50/50 hover:bg-rose-100/50"
                            : isAps
                            ? isDark
                              ? "bg-emerald-500/5 hover:bg-emerald-500/10"
                              : "bg-emerald-50/30 hover:bg-emerald-100/30"
                            : isDark
                            ? "hover:bg-white/[0.03]"
                            : "hover:bg-slate-100/60"
                        }`}
                      >
                        <td className="py-2 px-3 font-mono font-medium text-slate-500 dark:text-slate-400">
                          {sCode || "—"}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold">{sName}</span>
                            {isAps && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/25">
                                5h APS
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${
                              s.type === "lab"
                                ? isDark
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : "bg-emerald-100 text-emerald-800"
                                : s.type === "elective" || s.type === "open elective"
                                ? isDark
                                  ? "bg-purple-500/15 text-purple-300"
                                  : "bg-purple-100 text-purple-800"
                                : s.type === "special"
                                ? isDark
                                  ? "bg-amber-500/15 text-amber-300"
                                  : "bg-amber-100 text-amber-800"
                                : isDark
                                ? "bg-white/10 text-slate-300"
                                : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {s.type}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center font-mono font-bold">
                          {s.givenHours}h
                        </td>
                        <td className="py-2 px-2 text-center font-mono font-bold">
                          <span
                            className={
                              s.isMatch
                                ? "text-emerald-500 font-bold"
                                : diff < 0
                                ? "text-rose-500 font-bold"
                                : "text-amber-500 font-bold"
                            }
                          >
                            {s.generatedHours}h
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right">
                          {s.isMatch ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" />
                              Exact Match
                            </span>
                          ) : diff < 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                              <AlertCircle className="h-3 w-3" />
                              Deficit ({diff}h)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                              <AlertTriangle className="h-3 w-3" />
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
