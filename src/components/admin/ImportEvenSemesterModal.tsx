import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useDarkMode } from "@/context/DarkModeContext";
import { Upload, Download, Sparkles, BookOpen, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";
import { addSubjectsBulk, deleteEvenSemesterSubjects, getDepartmentByName } from "@/lib/supabaseService";
import type { Subject } from "@/store/timetableStore";

export interface ImportEvenSemesterModalProps {
  open: boolean;
  onClose: () => void;
  departmentName?: string;
  onSuccess?: () => void;
}

interface ParsedSubject {
  code: string;
  name: string;
  type: "theory" | "lab" | "elective" | "open elective";
  hoursPerWeek: number;
  credits: number;
  year: "II" | "III";
  department: string;
  abbreviation?: string;
}

// Standard even semester starter curriculum for AIDS & IT
const DEFAULT_EVEN_SUBJECTS: Record<string, ParsedSubject[]> = {
  "AIDS": [
    // Year II (Semester IV)
    { code: "U23ADS401", name: "Design and Analysis of Algorithms", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "AIDS", abbreviation: "DAA" },
    { code: "U23ADS402", name: "Machine Learning Foundations", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "AIDS", abbreviation: "MLF" },
    { code: "U23ADS403", name: "Operating Systems", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "AIDS", abbreviation: "OS" },
    { code: "U23ADS404", name: "Database Management Systems", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "AIDS", abbreviation: "DBMS" },
    { code: "U23ADS405", name: "Design and Analysis of Algorithms Laboratory", type: "lab", hoursPerWeek: 4, credits: 2, year: "II", department: "AIDS", abbreviation: "DAA LAB" },
    { code: "U23ADS406", name: "Machine Learning Laboratory", type: "lab", hoursPerWeek: 2, credits: 2, year: "II", department: "AIDS", abbreviation: "ML LAB" },
    { code: "U23ADS407", name: "Database Management Systems Laboratory", type: "lab", hoursPerWeek: 2, credits: 2, year: "II", department: "AIDS", abbreviation: "DBMS LAB" },
    { code: "U23GE401", name: "Soft Skills and Aptitude - II", type: "theory", hoursPerWeek: 4, credits: 2, year: "II", department: "AIDS", abbreviation: "SSA-II" },
    { code: "U23GE402", name: "Universal Human Values", type: "theory", hoursPerWeek: 3, credits: 3, year: "II", department: "AIDS", abbreviation: "UHV" },
    { code: "U23ADS408", name: "Mini Project", type: "lab", hoursPerWeek: 2, credits: 2, year: "II", department: "AIDS", abbreviation: "MP" },
    // Year III (Semester VI) — OE Included (5 hrs)
    { code: "U23OE601", name: "Open Elective: Smart Technologies and Systems", type: "open elective", hoursPerWeek: 5, credits: 3, year: "III", department: "AIDS", abbreviation: "OE" },
    { code: "U23ADS601", name: "Big Data Analytics", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "AIDS", abbreviation: "BDA" },
    { code: "U23ADS602", name: "Deep Neural Networks", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "AIDS", abbreviation: "DNN" },
    { code: "U23ADS603", name: "Cloud Computing and Virtualization", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "AIDS", abbreviation: "CCV" },
    { code: "U23ADS604", name: "Elective - Natural Language Processing", type: "elective", hoursPerWeek: 4, credits: 3, year: "III", department: "AIDS", abbreviation: "NLP" },
    { code: "U23ADS605", name: "Big Data Analytics Laboratory", type: "lab", hoursPerWeek: 4, credits: 2, year: "III", department: "AIDS", abbreviation: "BDA LAB" },
    { code: "U23ADS606", name: "Deep Neural Networks Laboratory", type: "lab", hoursPerWeek: 3, credits: 2, year: "III", department: "AIDS", abbreviation: "DNN LAB" },
    { code: "U23ADS607", name: "Mini Project / Design Project", type: "lab", hoursPerWeek: 2, credits: 2, year: "III", department: "AIDS", abbreviation: "MP" },
    { code: "U23GE601", name: "Soft Skills and Aptitude - III", type: "theory", hoursPerWeek: 4, credits: 2, year: "III", department: "AIDS", abbreviation: "SSA-III" },
  ],
  "IT": [
    // Year II (Semester IV)
    { code: "U23IT401", name: "Design and Analysis of Algorithms", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "IT", abbreviation: "DAA" },
    { code: "U23IT402", name: "Operating Systems", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "IT", abbreviation: "OS" },
    { code: "U23IT403", name: "Java Programming", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "IT", abbreviation: "JAVA" },
    { code: "U23IT404", name: "Software Engineering", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "IT", abbreviation: "SE" },
    { code: "U23IT405", name: "Design and Analysis of Algorithms Laboratory", type: "lab", hoursPerWeek: 4, credits: 2, year: "II", department: "IT", abbreviation: "DAA LAB" },
    { code: "U23IT406", name: "Java Programming Laboratory", type: "lab", hoursPerWeek: 2, credits: 2, year: "II", department: "IT", abbreviation: "JAVA LAB" },
    { code: "U23IT407", name: "Operating Systems Laboratory", type: "lab", hoursPerWeek: 2, credits: 2, year: "II", department: "IT", abbreviation: "OS LAB" },
    { code: "U23GE401", name: "Soft Skills and Aptitude - II", type: "theory", hoursPerWeek: 4, credits: 2, year: "II", department: "IT", abbreviation: "SSA-II" },
    { code: "U23GE402", name: "Universal Human Values", type: "theory", hoursPerWeek: 3, credits: 3, year: "II", department: "IT", abbreviation: "UHV" },
    { code: "U23IT408", name: "Mini Project", type: "lab", hoursPerWeek: 2, credits: 2, year: "II", department: "IT", abbreviation: "MP" },
    // Year III (Semester VI) — OE Included (5 hrs)
    { code: "U23OE601", name: "Open Elective: Web Technologies & Applications", type: "open elective", hoursPerWeek: 5, credits: 3, year: "III", department: "IT", abbreviation: "OE" },
    { code: "U23IT601", name: "Mobile Application Development", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "IT", abbreviation: "MAD" },
    { code: "U23IT602", name: "Artificial Intelligence", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "IT", abbreviation: "AI" },
    { code: "U23IT603", name: "Information Security", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "IT", abbreviation: "IS" },
    { code: "U23IT604", name: "Elective - Full Stack Development", type: "elective", hoursPerWeek: 4, credits: 3, year: "III", department: "IT", abbreviation: "FSD" },
    { code: "U23IT605", name: "Mobile Application Development Lab", type: "lab", hoursPerWeek: 4, credits: 2, year: "III", department: "IT", abbreviation: "MAD LAB" },
    { code: "U23IT606", name: "Full Stack Development Lab", type: "lab", hoursPerWeek: 3, credits: 2, year: "III", department: "IT", abbreviation: "FSD LAB" },
    { code: "U23IT607", name: "Mini Project", type: "lab", hoursPerWeek: 2, credits: 2, year: "III", department: "IT", abbreviation: "MP" },
    { code: "U23GE601", name: "Soft Skills and Aptitude - III", type: "theory", hoursPerWeek: 4, credits: 2, year: "III", department: "IT", abbreviation: "SSA-III" },
  ]
};

export const ImportEvenSemesterModal: React.FC<ImportEvenSemesterModalProps> = ({
  open,
  onClose,
  departmentName = "AIDS",
  onSuccess,
}) => {
  const { isDark } = useDarkMode();
  const [selectedDept, setSelectedDept] = useState<string>(departmentName || "AIDS");
  const [subjectsList, setSubjectsList] = useState<ParsedSubject[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  React.useEffect(() => {
    if (departmentName) {
      setSelectedDept(departmentName);
    }
  }, [departmentName]);

  const handleDownloadTemplate = () => {
    const templateRows = [
      {
        "Subject Code": "U23IT401",
        "Subject Name": "Design and Analysis of Algorithms",
        "Abbreviation": "DAA",
        "Type": "theory",
        "Hours Per Week": 4,
        "Credits": 3,
        "Year": "II",
        "Department": selectedDept,
      },
      {
        "Subject Code": "U23IT405",
        "Subject Name": "Algorithms Laboratory",
        "Abbreviation": "DAA LAB",
        "Type": "lab",
        "Hours Per Week": 4,
        "Credits": 2,
        "Year": "II",
        "Department": selectedDept,
      },
      {
        "Subject Code": "U23OE601",
        "Subject Name": "Open Elective: Smart Automation",
        "Abbreviation": "OE",
        "Type": "open elective",
        "Hours Per Week": 5,
        "Credits": 3,
        "Year": "III",
        "Department": selectedDept,
      },
      {
        "Subject Code": "U23IT601",
        "Subject Name": "Cloud Computing",
        "Abbreviation": "CC",
        "Type": "theory",
        "Hours Per Week": 4,
        "Credits": 3,
        "Year": "III",
        "Department": selectedDept,
      },
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(templateRows);
    XLSX.utils.book_append_sheet(wb, ws, "Even Semester Curriculum");
    XLSX.writeFile(wb, `Even_Semester_Template_${selectedDept}.xlsx`);
    toast.success("Excel template downloaded successfully!");
  };

  const handleFileProcess = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json<any>(worksheet);

        if (!json || json.length === 0) {
          toast.error("File appears to be empty.");
          return;
        }

        const parsed: ParsedSubject[] = json.map((row: any) => {
          const code = String(row["Subject Code"] || row["code"] || row["Code"] || "").trim();
          const name = String(row["Subject Name"] || row["name"] || row["Name"] || "").trim();
          const rawType = String(row["Type"] || row["type"] || "theory").toLowerCase().trim();
          let type: "theory" | "lab" | "elective" | "open elective" = "theory";
          if (rawType.includes("lab") || rawType.includes("practic")) type = "lab";
          else if (rawType.includes("open") || rawType.includes("oe")) type = "open elective";
          else if (rawType.includes("elect")) type = "elective";

          const hours = Number(row["Hours Per Week"] || row["hours_per_week"] || row["Hours"] || row["hours"] || 4);
          const credits = Number(row["Credits"] || row["credits"] || 3);
          const rawYear = String(row["Year"] || row["year"] || "II").toUpperCase().trim();
          const year: "II" | "III" = rawYear.includes("III") || rawYear === "3" ? "III" : "II";
          const dept = String(row["Department"] || row["department"] || selectedDept).trim();
          const abbreviation = String(row["Abbreviation"] || row["abbreviation"] || "").trim();

          return {
            code,
            name,
            type,
            hoursPerWeek: isNaN(hours) ? 4 : hours,
            credits: isNaN(credits) ? 3 : credits,
            year,
            department: dept,
            abbreviation,
          };
        }).filter(s => s.name.length > 0);

        setSubjectsList(parsed);
        toast.success(`Parsed ${parsed.length} Even Semester subjects from file!`);
      } catch (err: any) {
        console.error("Error parsing file:", err);
        toast.error("Failed to parse file. Please verify columns match the template.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleLoadDefaults = () => {
    const defaults = DEFAULT_EVEN_SUBJECTS[selectedDept] || DEFAULT_EVEN_SUBJECTS["AIDS"];
    setSubjectsList(defaults);
    toast.success(`Loaded standard Even Semester curriculum for ${selectedDept} (${defaults.length} subjects).`);
  };

  const handleSaveToDatabase = async () => {
    if (subjectsList.length === 0) {
      toast.error("Please add or upload subjects first.");
      return;
    }

    setIsSaving(true);
    try {
      const dept = await getDepartmentByName(selectedDept);
      if (!dept) throw new Error(`Department ${selectedDept} not found`);

      // First clean up any existing even semester subjects for this department to avoid duplicate stacking
      await deleteEvenSemesterSubjects(dept.id);

      // Bulk add Even Semester subjects with tag 'even_sem'
      const rows = subjectsList.map((s) => ({
        name: s.name,
        hoursPerWeek: s.hoursPerWeek,
        type: s.type,
        tags: ["even_sem"],
        code: s.code || undefined,
        abbreviation: s.abbreviation || undefined,
        departmentId: dept.id,
        year: s.year,
        credits: s.credits,
        semesterType: "even" as const,
      }));

      await addSubjectsBulk(rows);

      toast.success(
        `Successfully saved ${rows.length} Even Semester subjects for ${selectedDept}!`,
        {
          description: "Subjects are permanently saved and will automatically load whenever Even Semester is selected.",
          duration: 5000,
        }
      );

      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error(`Failed to save subjects: ${err.message || String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className={`max-w-2xl border rounded-2xl shadow-2xl transition-colors duration-300 ${
        isDark ? "bg-[#0e0e1a] border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"
      }`}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isDark ? "bg-emerald-500/15 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}>
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                Import Even Semester Subjects
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs">
                  Semesters IV & VI
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Configure curriculum for Years II & III. Saved subjects will be reused automatically whenever Even Semester is selected.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Department Choice & Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Department:</span>
              <div className="flex items-center gap-1.5">
                {["AIDS", "IT"].map((dept) => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => {
                      setSelectedDept(dept);
                      if (subjectsList.length > 0) {
                        setSubjectsList(DEFAULT_EVEN_SUBJECTS[dept] || []);
                      }
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      selectedDept === dept
                        ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                        : isDark
                        ? "bg-white/5 border-white/10 text-slate-300 hover:border-white/20"
                        : "bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {dept}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
                className="h-8 text-xs gap-1.5 rounded-lg border-dashed"
              >
                <Download className="h-3.5 w-3.5 text-muted-foreground" />
                Template
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadDefaults}
                className="h-8 text-xs gap-1.5 rounded-lg bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Pre-fill Curriculum
              </Button>
            </div>
          </div>

          {/* Drag & Drop Upload Area */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileProcess(file);
            }}
            className={`border-2 border-dashed rounded-xl p-5 text-center transition-all ${
              dragOver
                ? "border-emerald-500 bg-emerald-500/10"
                : isDark
                ? "border-white/10 hover:border-white/20 bg-white/[0.02]"
                : "border-slate-200 hover:border-slate-300 bg-slate-50/50"
            }`}
          >
            <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Drag and drop your Even Semester Excel (<span className="font-mono">.xlsx</span>) or <span className="font-mono">.csv</span> here
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 mb-2.5">
              Must include Subject Name, Type, Hours Per Week, and Year (II or III).
            </p>
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shadow-sm">
              Browse File
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileProcess(file);
                }}
              />
            </label>
          </div>

          {/* Preview Table if subjects loaded */}
          {subjectsList.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Ready to Import: {subjectsList.length} Subjects ({subjectsList.filter(s => s.year === 'II').length} for Yr II, {subjectsList.filter(s => s.year === 'III').length} for Yr III)
                </span>
                <button
                  type="button"
                  onClick={() => setSubjectsList([])}
                  className="text-muted-foreground hover:text-rose-500 flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="h-3 w-3" /> Clear
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10">
                <table className="w-full text-left text-xs">
                  <thead className={`sticky top-0 ${isDark ? "bg-white/10 text-slate-200" : "bg-slate-100 text-slate-700"} font-semibold`}>
                    <tr>
                      <th className="p-2">Year</th>
                      <th className="p-2">Code</th>
                      <th className="p-2">Subject Name</th>
                      <th className="p-2">Type</th>
                      <th className="p-2 text-right">Hrs/Wk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {subjectsList.map((s, idx) => (
                      <tr key={idx} className={isDark ? "hover:bg-white/[0.02]" : "hover:bg-slate-50"}>
                        <td className="p-2 font-mono">{s.year}</td>
                        <td className="p-2 font-mono text-muted-foreground">{s.code || "-"}</td>
                        <td className="p-2 font-medium">{s.name}</td>
                        <td className="p-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            s.type === 'open elective'
                              ? 'bg-purple-500/15 text-purple-600 dark:text-purple-300'
                              : s.type === 'lab'
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                              : 'bg-blue-500/15 text-blue-600 dark:text-blue-300'
                          }`}>
                            {s.type}
                          </span>
                        </td>
                        <td className="p-2 text-right font-mono font-semibold">{s.hoursPerWeek}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-white/5">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isSaving} className="text-xs">
              Cancel
            </Button>
            <Button
              onClick={handleSaveToDatabase}
              disabled={isSaving || subjectsList.length === 0}
              className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs gap-1.5 rounded-xl disabled:opacity-40"
            >
              {isSaving ? (
                <>Saving Subjects...</>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Save & Import Even Semester Subjects
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
