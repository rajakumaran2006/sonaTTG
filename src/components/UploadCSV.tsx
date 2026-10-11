import React, { useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Download,
  Sparkles,
  FileSpreadsheet,
  Users,
  BookOpen,
  Layers,
  CheckCircle2,
  X,
  Info
} from "lucide-react";

type FacultyRecord = {
  name: string;
  email: string;
  designation: string;
  department: string;
  department_id?: string;
};

type SubjectRecord = {
  code: string;
  name: string;
  abbreviation: string;
  type: string;
  hours_per_week: string;
  credits: string;
  department: string;
  year: string;
};

type MappingRecord = {
  faculty_email: string;
  faculty_name?: string;
  subject_code: string;
  subject_name?: string;
  department: string;
  year: string;
  section: string;
};

interface ImportSummaryStats {
  totalRows: number;
  facultyAdded: number;
  facultyUpdated?: number;
  facultyExisting: number;
  subjectsAdded: number;
  subjectsUpdated?: number;
  subjectsExisting: number;
  mappingsAdded: number;
  mappingsExisting: number;
  unassignedRows: number;
  semesterType?: "odd" | "even";
}

// Name normalizer for robust faculty matching
const normalizePersonName = (raw: string): string => {
  return (raw || "")
    .toLowerCase()
    .replace(/^(dr|mr|mrs|ms|prof|er)\.?\s+/i, "")
    .replace(/[.\s_-]+/g, "")
    .trim();
};

// Subject name normalizer for robust matching (e.g. counseling vs counselling)
const normalizeSubjectName = (name: string): string => {
  return (name || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/ll/g, "l");
};

// Check if faculty entry is unassigned or blank
const isUnassignedFaculty = (name: string): boolean => {
  if (!name) return true;
  const clean = name.trim().toLowerCase();
  return (
    clean === "" ||
    clean === "(not assigned)" ||
    clean === "not assigned" ||
    clean === "unassigned" ||
    clean === "nil" ||
    clean === "none" ||
    clean === "n/a" ||
    clean === "na" ||
    clean === "-"
  );
};

// Year resolution (e.g. II / Sem III -> II, Sem IV -> II, Sem VI -> III, Sem VIII -> IV)
const resolveYear = (rawYear: string, rawSem: string): string => {
  const y = (rawYear || "").toUpperCase().trim();
  const s = (rawSem || "").toUpperCase().trim();
  if (y === "II" || y === "2" || y === "YEAR 2" || y === "YEAR II") return "II";
  if (y === "III" || y === "3" || y === "YEAR 3" || y === "YEAR III") return "III";
  if (y === "IV" || y === "4" || y === "YEAR 4" || y === "YEAR IV") return "IV";
  if (y === "I" || y === "1" || y === "YEAR 1" || y === "YEAR I") return "I";

  // Even Semesters
  if (/\b(viii|8|sem\s*8|sem\s*viii)\b/i.test(s) || s.includes("VIII")) return "IV";
  if (/\b(vi|6|sem\s*6|sem\s*vi)\b/i.test(s) || (s.includes("VI") && !s.includes("VII") && !s.includes("VIII"))) return "III";
  if (/\b(iv|4|sem\s*4|sem\s*iv)\b/i.test(s) || s.includes("IV")) return "II";
  if (/\b(ii|2|sem\s*2|sem\s*ii)\b/i.test(s) || (s.includes("II") && !s.includes("III") && !s.includes("VII") && !s.includes("VIII"))) return "I";

  // Odd Semesters
  if (/\b(vii|7|sem\s*7|sem\s*vii)\b/i.test(s) || s.includes("VII")) return "IV";
  if (/\b(v|5|sem\s*5|sem\s*v)\b/i.test(s) || (s.includes("V") && !s.includes("VI") && !s.includes("VII") && !s.includes("VIII") && !s.includes("IV"))) return "III";
  if (/\b(iii|3|sem\s*3|sem\s*iii)\b/i.test(s) || s.includes("III")) return "II";
  if (/\b(i|1|sem\s*1|sem\s*i)\b/i.test(s)) return "I";

  return "II";
};

// Infer subject type
const inferSubjectType = (rawType: string, name: string): string => {
  const t = (rawType || "").toLowerCase().trim();
  const n = (name || "").toLowerCase().trim();
  if (t === "special" || n.includes("library") || n.includes("seminar") || n.includes("counseling") || n.includes("counselling")) {
    return "special";
  }
  if (t.includes("lab") || t.includes("practical") || n.includes("lab") || n.includes("laboratory") || n.includes("practical")) {
    return "lab";
  }
  if (t.includes("open") || t.includes("oe") || n.includes("open elective")) {
    return "open elective";
  }
  if (t.includes("elect") || t.includes("pe") || n.includes("elective")) {
    return "elective";
  }
  return "theory";
};

// Auto abbreviation generator
const generateAbbreviation = (name: string): string => {
  if (!name) return "";
  const words = name.replace(/[^a-zA-Z0-9\s]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.map((w) => w[0]).join("").toUpperCase();
};

// Department resolver with common college acronyms
const resolveDepartmentId = (deptInput: string, deptList: any[]): string | null => {
  if (!deptInput || !deptInput.trim()) return null;
  const clean = deptInput.trim().toLowerCase();

  // 1. Exact match
  const exact = deptList.find((d) => d.name.toLowerCase().trim() === clean);
  if (exact) return exact.id;

  // 2. Acronyms & aliases
  if (clean === "aids" || clean === "ai & ds" || clean === "ai&ds" || clean.includes("artificial intelligence")) {
    const match = deptList.find((d) => /ai.*ds|artificial intelligence/i.test(d.name));
    if (match) return match.id;
  }
  if (clean === "it" || clean.includes("information tech")) {
    const match = deptList.find((d) => /information technology|\bit\b/i.test(d.name));
    if (match) return match.id;
  }
  if (clean === "cse" || clean.includes("computer science")) {
    const match = deptList.find((d) => /computer science|\bcse\b/i.test(d.name));
    if (match) return match.id;
  }
  if (clean === "ece" || clean.includes("electronics")) {
    const match = deptList.find((d) => /^(ece|electronics)$/i.test(d.name.trim()) || /electronics.*communication/i.test(d.name));
    if (match) return match.id;
  }
  if (clean === "mech" || clean.includes("mechanical")) {
    const match = deptList.find((d) => /^(mech|mechanical)$/i.test(d.name.trim()) || /mechanical/i.test(d.name));
    if (match) return match.id;
  }
  if (clean === "eee" || clean.includes("electrical")) {
    const match = deptList.find((d) => /electrical/i.test(d.name));
    if (match) return match.id;
  }
  if (clean === "civil") {
    const match = deptList.find((d) => /civil/i.test(d.name));
    if (match) return match.id;
  }

  // 3. Substring match
  const partial = deptList.find(
    (d) => d.name.toLowerCase().includes(clean) || clean.includes(d.name.toLowerCase())
  );
  if (partial) return partial.id;

  return null;
};

// Normalize row keys
const normalizeRowKeys = (rawRow: Record<string, any>) => {
  const norm: Record<string, any> = {};
  for (const [k, v] of Object.entries(rawRow)) {
    const cleanKey = k.trim().toLowerCase().replace(/[\s_.-]+/g, "");
    norm[cleanKey] = typeof v === "string" ? v.trim() : (v !== null && v !== undefined ? String(v).trim() : "");
  }
  return norm;
};

// Parse Excel sheet with intelligent header row detection
const parseSheetWithHeaderDetection = (sheet: XLSX.WorkSheet): any[] => {
  const data = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });
  if (!data || data.length === 0) return [];

  let headerIdx = 0;
  for (let i = 0; i < Math.min(15, data.length); i++) {
    const rawRow = data[i] || [];
    const filledCells = rawRow.filter((c: any) => c !== null && c !== undefined && String(c).trim() !== "");
    if (filledCells.length < 3) continue; // Skip title / banner / metadata rows with merged cells

    const row = rawRow.map((c: any) => String(c || "").trim().toLowerCase());
    const hasDept = row.some((c) => c.includes("department") || c.includes("dept"));
    const hasCodeOrName = row.some(
      (c) =>
        c.includes("code") ||
        c.includes("subject") ||
        c.includes("faculty") ||
        c.includes("staff") ||
        c.includes("name") ||
        c.includes("email")
    );
    if (hasDept && hasCodeOrName) {
      headerIdx = i;
      break;
    }
  }

  const rawHeaders = (data[headerIdx] || []).map((h: any) => String(h || "").trim());
  const rows: any[] = [];
  for (let i = headerIdx + 1; i < data.length; i++) {
    const rowData = data[i];
    if (!rowData || rowData.length === 0) continue;
    if (rowData.every((c: any) => c === null || c === undefined || String(c).trim() === "")) continue;

    const rowObj: Record<string, any> = {};
    rawHeaders.forEach((h: string, colIdx: number) => {
      if (h) {
        rowObj[h] = rowData[colIdx] !== undefined ? rowData[colIdx] : "";
      }
    });
    rows.push(rowObj);
  }
  return rows;
};

export default function UploadCSV() {
  const [activeTab, setActiveTab] = useState<string>("odd_master");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [subjectSemesterType, setSubjectSemesterType] = useState<"odd" | "even">("odd");
  const [importSummary, setImportSummary] = useState<ImportSummaryStats | null>(null);

  // Helper to validate UUIDs
  const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

  // Helper to fetch departments and build name mappings
  const getDeptNameToIdMap = async () => {
    const { data: departments, error: deptErr } = await (supabase as any)
      .from('departments')
      .select('id, name');
    if (deptErr) {
      toast.error('Failed to fetch departments from system');
      throw deptErr;
    }
    const nameToDeptId = new Map<string, string>();
    (departments || []).forEach((d: any) => {
      nameToDeptId.set(String(d.name).trim().toLowerCase(), d.id);
    });
    return nameToDeptId;
  };

  // Download Unified Master Template (Odd Semester)
  const downloadUnifiedTemplate = (format: "xlsx" | "csv" = "xlsx") => {
    const sampleRows = [
      {
        "Department": "AIDS",
        "Year": "II",
        "Semester": "Sem III",
        "Section": "A",
        "Subject Code": "U23MAT301E",
        "Subject Name": "Applied Probability and Statistics-I",
        "Abbreviation": "APS",
        "Type": "theory",
        "Hours Per Week": 5,
        "Credits": 4,
        "Faculty Name": "(Not Assigned)",
        "Faculty Email": "",
        "Designation": ""
      },
      {
        "Department": "AIDS",
        "Year": "II",
        "Semester": "Sem III",
        "Section": "A",
        "Subject Code": "U23IT301",
        "Subject Name": "Data Structures",
        "Abbreviation": "DS",
        "Type": "theory",
        "Hours Per Week": 4,
        "Credits": 3,
        "Faculty Name": "Mr. R. Krishna Prakash",
        "Faculty Email": "krishnaprakash@sonatech.ac.in",
        "Designation": "Assistant Professor"
      },
      {
        "Department": "AIDS",
        "Year": "II",
        "Semester": "Sem III",
        "Section": "A",
        "Subject Code": "U23IT302",
        "Subject Name": "Computer Architecture",
        "Abbreviation": "CA",
        "Type": "theory",
        "Hours Per Week": 4,
        "Credits": 3,
        "Faculty Name": "Ms. S.M.C. Subashini",
        "Faculty Email": "subashini@sonatech.ac.in",
        "Designation": "Assistant Professor"
      },
      {
        "Department": "AIDS",
        "Year": "II",
        "Semester": "Sem III",
        "Section": "A",
        "Subject Code": "U23IT303",
        "Subject Name": "Object Oriented Programming in C++",
        "Abbreviation": "OOP",
        "Type": "theory",
        "Hours Per Week": 4,
        "Credits": 3,
        "Faculty Name": "Mr. A. Naveen Kumar",
        "Faculty Email": "naveenkumar@sonatech.ac.in",
        "Designation": "Assistant Professor"
      },
      {
        "Department": "AIDS",
        "Year": "II",
        "Semester": "Sem III",
        "Section": "A",
        "Subject Code": "U23IT305",
        "Subject Name": "Data Structures Laboratory",
        "Abbreviation": "DS LAB",
        "Type": "lab",
        "Hours Per Week": 4,
        "Credits": 2,
        "Faculty Name": "Mr. R. Krishna Prakash",
        "Faculty Email": "krishnaprakash@sonatech.ac.in",
        "Designation": "Assistant Professor"
      },
      {
        "Department": "AIDS",
        "Year": "II",
        "Semester": "Sem III",
        "Section": "A",
        "Subject Code": "U23IT306",
        "Subject Name": "Object Oriented Programming in C++ Laboratory",
        "Abbreviation": "OOP LAB",
        "Type": "lab",
        "Hours Per Week": 2,
        "Credits": 2,
        "Faculty Name": "Mr. A. Naveen Kumar",
        "Faculty Email": "naveenkumar@sonatech.ac.in",
        "Designation": "Assistant Professor"
      },
      {
        "Department": "AIDS",
        "Year": "II",
        "Semester": "Sem III",
        "Section": "A",
        "Subject Code": "U23GE301",
        "Subject Name": "Soft Skills and Aptitude - I",
        "Abbreviation": "SSA-I",
        "Type": "theory",
        "Hours Per Week": 4,
        "Credits": 2,
        "Faculty Name": "Dr. C. Saravanan",
        "Faculty Email": "csaravanan@sonatech.ac.in",
        "Designation": "Assistant Professor"
      },
      {
        "Department": "AIDS",
        "Year": "III",
        "Semester": "Sem V",
        "Section": "A",
        "Subject Code": "U23ADS501",
        "Subject Name": "Machine Learning",
        "Abbreviation": "ML",
        "Type": "theory",
        "Hours Per Week": 4,
        "Credits": 3,
        "Faculty Name": "Dr. S. Vasanthi",
        "Faculty Email": "vasanthi@sonatech.ac.in",
        "Designation": "Associate Professor"
      },
      {
        "Department": "AIDS",
        "Year": "III",
        "Semester": "Sem V",
        "Section": "A",
        "Subject Code": "U23ADS505",
        "Subject Name": "Machine Learning Laboratory",
        "Abbreviation": "ML LAB",
        "Type": "lab",
        "Hours Per Week": 4,
        "Credits": 2,
        "Faculty Name": "Dr. S. Vasanthi",
        "Faculty Email": "vasanthi@sonatech.ac.in",
        "Designation": "Associate Professor",
        "Class Counsellor": "Yes"
      },
      {
        "Department": "Information Technology",
        "Year": "II",
        "Semester": "Sem III",
        "Section": "A",
        "Subject Code": "U23IT301",
        "Subject Name": "Data Structures",
        "Abbreviation": "DS",
        "Type": "theory",
        "Hours Per Week": 4,
        "Credits": 3,
        "Faculty Name": "Dr. J. Akilandeswari",
        "Faculty Email": "akilandeswari@sonatech.ac.in",
        "Designation": "Professor & Head",
        "Class Counsellor": ""
      },
      {
        "Department": "Information Technology",
        "Year": "II",
        "Semester": "Sem III",
        "Section": "A",
        "Subject Code": "U23IT305",
        "Subject Name": "Data Structures Laboratory",
        "Abbreviation": "DS LAB",
        "Type": "lab",
        "Hours Per Week": 3,
        "Credits": 2,
        "Faculty Name": "Mr. R. Krishna Prakash; Ms. L. Sindhu",
        "Faculty Email": "rkrishnaprakash@sonatech.ac.in; lsindhu@sonatech.ac.in",
        "Designation": "Assistant Professor; Assistant Professor",
        "Class Counsellor": ""
      }
    ];

    if (format === "xlsx") {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(sampleRows);
      ws["!cols"] = [
        { wch: 22 }, // Department
        { wch: 8 },  // Year
        { wch: 10 }, // Semester
        { wch: 8 },  // Section
        { wch: 14 }, // Subject Code
        { wch: 42 }, // Subject Name
        { wch: 14 }, // Abbreviation
        { wch: 12 }, // Type
        { wch: 16 }, // Hours Per Week
        { wch: 8 },  // Credits
        { wch: 38 }, // Faculty Name
        { wch: 45 }, // Faculty Email
        { wch: 35 }, // Designation
        { wch: 18 }, // Class Counsellor
      ];
      XLSX.utils.book_append_sheet(wb, ws, "Odd Semester Master");

      // Column guidelines guide sheet
      const guideRows = [
        { "Column Name": "Department", "Required": "Yes", "Description": "Department name or acronym (e.g., AIDS, Information Technology, CSE, ECE, MECH)" },
        { "Column Name": "Year", "Required": "Yes", "Description": "Academic Year: II, III, IV, or I" },
        { "Column Name": "Semester", "Required": "Optional", "Description": "Semester name (e.g., Sem III, Sem V, Sem VII)" },
        { "Column Name": "Section", "Required": "Optional", "Description": "Section name (e.g., A, B, C or A, B). Defaults to A" },
        { "Column Name": "Subject Code", "Required": "Yes", "Description": "Unique subject code (e.g., U23ADS301, U23IT301)" },
        { "Column Name": "Subject Name", "Required": "Yes", "Description": "Full title of the course / subject" },
        { "Column Name": "Abbreviation", "Required": "Optional", "Description": "Short display code (e.g., DS, ML, DAA). Auto-generated if omitted" },
        { "Column Name": "Type", "Required": "Optional", "Description": "theory, lab, elective, or open elective (auto-inferred if omitted)" },
        { "Column Name": "Hours Per Week", "Required": "Yes", "Description": "Weekly periods / hours allocated (e.g., 4 or 5)" },
        { "Column Name": "Credits", "Required": "Optional", "Description": "Course syllabus credits (default: 3)" },
        { "Column Name": "Faculty Name", "Required": "Optional", "Description": "Faculty in-charge. If 2 staff members co-teach, separate names with semicolon (e.g., Dr. A; Mr. B). Leave empty if not yet assigned" },
        { "Column Name": "Faculty Email", "Required": "Optional", "Description": "Faculty official email address. If 2 staff members, separate with semicolon" },
        { "Column Name": "Designation", "Required": "Optional", "Description": "Academic designation (e.g., Assistant Professor, Associate Professor). If 2 staff members, separate with semicolon" },
        { "Column Name": "Class Counsellor", "Required": "Optional", "Description": "Put 'Yes' if this faculty is the designated Class Counsellor for this section, else leave blank" },
      ];
      const guideWs = XLSX.utils.json_to_sheet(guideRows);
      guideWs["!cols"] = [{ wch: 18 }, { wch: 10 }, { wch: 75 }];
      XLSX.utils.book_append_sheet(wb, guideWs, "Column Guide");

      XLSX.writeFile(wb, "Odd_Semester_Unified_Template.xlsx");
    } else {
      const csv = Papa.unparse(sampleRows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "Odd_Semester_Unified_Template.csv");
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Template generators for individual tabs
  const downloadTemplate = (type: string) => {
    let headers = "";
    let sampleData = "";
    let filename = "";

    if (type === "faculty") {
      headers = "name,email,designation,department\n";
      sampleData = "Dr. J. Akilandeswari,akilandeswari@sonatech.ac.in,Professor & Head,Information Technology\nMr. R. Krishna Prakash,krishnaprakash@sonatech.ac.in,Assistant Professor,Information Technology\n";
      filename = "faculty_template.csv";
    } else if (type === "subjects") {
      headers = "code,name,abbreviation,type,hours_per_week,credits,department,year\n";
      if (subjectSemesterType === "even") {
        sampleData =
          "U23ADS401,Design and Analysis of Algorithms,DAA,theory,4,3,AIDS,II\n" +
          "U23ADS405,Algorithms Laboratory,DAA LAB,lab,4,2,AIDS,II\n" +
          "U23OE601,Open Elective: Smart Technologies and Systems,OE,open elective,5,3,AIDS,III\n" +
          "U23ADS801,Project Work,PROJECT,theory,37,10,AIDS,IV\n" +
          "U23IT401,Design and Analysis of Algorithms,DAA,theory,4,3,Information Technology,II\n" +
          "U23IT601,Mobile Application Development,MAD,theory,4,3,Information Technology,III\n" +
          "U23IT801,Project Work,PROJECT,theory,37,10,Information Technology,IV\n";
        filename = "even_semester_subjects_template.csv";
      } else {
        sampleData = "U23IT301,Data Structures,DS,theory,4,4,Information Technology,II\nU23IT305,Data Structures Laboratory,DS LAB,lab,3,2,Information Technology,II\n";
        filename = "subjects_template.csv";
      }
    } else if (type === "mapping") {
      headers = "faculty_email,subject_code,department,year,section\n";
      sampleData = "krishnaprakash@sonatech.ac.in,U23IT301,Information Technology,II,A\nakilandeswari@sonatech.ac.in,U23IT502,Information Technology,III,A\n";
      filename = "faculty_subject_mapping_template.csv";
    }

    const blob = new Blob([headers + sampleData], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ────────────────── UNIFIED ODD SEMESTER MASTER IMPORTER ──────────────────
  const handleUnifiedRowsUpload = async (rawRows: any[]) => {
    setIsLoading(true);
    setImportSummary(null);

    try {
      if (!rawRows || rawRows.length === 0) {
        toast.error("File contains no data rows.");
        return;
      }

      // 1. Fetch departments, faculty, subjects, and existing counselors
      const [deptRes, facRes, subjRes, mapRes, ccRes] = await Promise.all([
        supabase.from("departments").select("id, name"),
        supabase.from("faculty_members").select("id, name, email, department_id, designation"),
        supabase.from("subjects").select("id, name, code, abbreviation, hours_per_week, credits, type, department_id, year, tags, staff"),
        supabase.from("faculty_subject_assignments").select("faculty_id, subject_id, department_id, year, section"),
        (supabase as any).from("class_counselors").select("id, department_id, faculty_id, year, section, is_active"),
      ]);

      if (deptRes.error) {
        toast.error("Failed to load departments: " + deptRes.error.message);
        return;
      }

      const deptList = deptRes.data || [];
      const facultyList = [...(facRes.data || [])];
      const subjectsList = [...(subjRes.data || [])];
      const existingMappings = mapRes.data || [];
      const activeCounselorsList = ccRes?.data || [];

      // Helper to check if subject is odd-semester (not tagged even_sem)
      const isEvenSub = (s: any) => (s.tags || []).some((t: string) => /even_sem|even\b/i.test(t));

      const existingMappingKeys = new Set(
        existingMappings.map((m: any) => `${m.faculty_id}-${m.subject_id}-${m.year}-${(m.section || "A").toUpperCase()}`)
      );

      let newFacultyCount = 0;
      let updatedFacultyCount = 0;
      let matchedFacultyCount = 0;
      let newSubjectsCount = 0;
      let updatedSubjectsCount = 0;
      let matchedSubjectsCount = 0;
      let newMappingsCount = 0;
      let existingMappingsCount = 0;
      let unassignedCount = 0;
      const skippedRows: string[] = [];

      // Parse normalized rows
      const parsedRows = rawRows
        .map((raw, idx) => {
          const norm = normalizeRowKeys(raw);
          return {
            rowNum: idx + 2,
            department: norm.department || norm.dept || "",
            year: norm.year || "",
            semester: norm.semester || norm.sem || "",
            section: norm.section || norm.sec || "A",
            code: norm.subjectcode || norm.code || norm.subcode || "",
            name: norm.subjectname || norm.subject || norm.name || norm.subname || "",
            abbreviation: norm.abbreviation || norm.abbr || norm.shortname || "",
            type: norm.type || norm.subjecttype || "",
            hours: norm.hoursperweek || norm.hoursallocated || norm.hours || norm.hpw || "4",
            credits: norm.credits || norm.credit || "3",
            facultyName: norm.facultyname || norm.staffincharge || norm.faculty || norm.staff || "",
            facultyEmail: norm.facultyemail || norm.staffemail || norm.email || "",
            designation: norm.designation || norm.role || norm.position || "",
            classCounsellor: norm.classcounsellor || norm.classcounselor || norm.counsellor || norm.counselor || norm.cc || "",
          };
        })
        .filter((r) => r.department && (r.name || r.code));

      if (parsedRows.length === 0) {
        toast.error("No valid course rows found. Please check that Department and Subject Name/Code are provided.");
        return;
      }

      // Step A: Process Faculty across all rows (handling semicolon co-teachers & difference overwrite)
      const facultyToUpdateMap = new Map<string, { id: string; payload: Record<string, any>; facObj: any }>();
      const facultyToInsertMap = new Map<string, any>();
      const existingFacultyEmails = new Set(
        facultyList.map((f) => (f.email || "").toLowerCase().trim()).filter(Boolean)
      );

      for (const row of parsedRows) {
        if (isUnassignedFaculty(row.facultyName)) {
          unassignedCount++;
          continue;
        }

        const deptId = resolveDepartmentId(row.department, deptList);
        if (!deptId) {
          skippedRows.push(`Row ${row.rowNum}: Unknown department "${row.department}"`);
          continue;
        }

        // Support semicolon-separated co-teaching faculty
        const facNames = row.facultyName.split(";").map((s: string) => s.trim()).filter(Boolean);
        const facEmails = (row.facultyEmail || "").split(";").map((s: string) => s.trim());
        const facDesigs = (row.designation || "").split(";").map((s: string) => s.trim());

        facNames.forEach((rawName: string, fIdx: number) => {
          if (isUnassignedFaculty(rawName)) return;

          const rawEmail = (facEmails[fIdx] || "").trim();
          const rawDesig = (facDesigs[fIdx] || facDesigs[0] || "").trim();
          const normName = normalizePersonName(rawName);

          const existingFac =
            (rawEmail ? facultyList.find((f) => f.email && f.email.toLowerCase().trim() === rawEmail.toLowerCase().trim()) : null) ||
            facultyList.find((f) => f.name.toLowerCase().trim() === rawName.toLowerCase()) ||
            facultyList.find((f) => normalizePersonName(f.name) === normName && f.department_id === deptId) ||
            facultyList.find((f) => normalizePersonName(f.name) === normName) ||
            facultyList.find((f) => {
              const fn = normalizePersonName(f.name);
              return (normName.length >= 5 && fn.includes(normName)) ||
                     (fn.length >= 5 && normName.includes(fn)) ||
                     fn.replace(/h/g, "") === normName.replace(/h/g, "");
            });

          if (existingFac) {
            matchedFacultyCount++;
            const facUpdatePayload: Record<string, any> = {};

            if (rawDesig && rawDesig !== (existingFac.designation || "").trim()) {
              facUpdatePayload.designation = rawDesig;
            }
            const cleanRawEmail = rawEmail.toLowerCase().trim().replace("@sonatech.in", "@sonatech.ac.in");
            const cleanExistingEmail = (existingFac.email || "").toLowerCase().trim().replace("@sonatech.in", "@sonatech.ac.in");
            if (rawEmail && cleanRawEmail !== cleanExistingEmail) {
              facUpdatePayload.email = cleanRawEmail;
            }

            if (Object.keys(facUpdatePayload).length > 0) {
              facultyToUpdateMap.set(existingFac.id, {
                id: existingFac.id,
                payload: facUpdatePayload,
                facObj: existingFac,
              });
            }
          } else {
            const facKey = rawEmail.toLowerCase() || `${normName}-${deptId}`;
            if (!facultyToInsertMap.has(facKey)) {
              let autoEmail = rawEmail.toLowerCase().replace("@sonatech.in", "@sonatech.ac.in");
              if (!autoEmail || existingFacultyEmails.has(autoEmail)) {
                autoEmail = `${normName || "faculty"}_${Math.floor(100 + Math.random() * 900)}@sonatech.ac.in`;
              }
              const autoDesig = rawDesig || (rawName.startsWith("Dr.") ? "Associate Professor" : "Assistant Professor");
              facultyToInsertMap.set(facKey, {
                name: rawName,
                email: autoEmail,
                designation: autoDesig,
                department_id: deptId,
              });
              existingFacultyEmails.add(autoEmail);
            }
          }
        });
      }

      // Execute faculty updates if differences found
      if (facultyToUpdateMap.size > 0) {
        for (const item of facultyToUpdateMap.values()) {
          const { error: fUpErr } = await supabase.from("faculty_members").update(item.payload).eq("id", item.id);
          if (!fUpErr) {
            Object.assign(item.facObj, item.payload);
            updatedFacultyCount++;
          }
        }
      }

      // Insert new faculty batch
      if (facultyToInsertMap.size > 0) {
        const toInsert = Array.from(facultyToInsertMap.values());
        const { data: insertedFac, error: facErr } = await supabase
          .from("faculty_members")
          .insert(toInsert)
          .select("id, name, email, department_id, designation");

        if (facErr) {
          toast.error("Error creating new faculty: " + facErr.message);
          return;
        }

        if (insertedFac) {
          newFacultyCount += insertedFac.length;
          facultyList.push(...insertedFac);
        }
      }

      // Step B: Process Subjects across all rows (difference overwrite & new inserts)
      const subjectsToUpdateMap = new Map<string, { id: string; payload: Record<string, any>; subObj: any }>();
      const subjectsToInsertMap = new Map<string, any>();

      for (const row of parsedRows) {
        const deptId = resolveDepartmentId(row.department, deptList);
        if (!deptId) continue;

        const resolvedYr = resolveYear(row.year, row.semester);
        const rawCode = (row.code || "").toUpperCase().trim();
        const rawSubName = (row.name || "").trim();
        const cleanCode = rawCode.replace(/[^A-Z0-9]/g, "");
        const cleanSubName = normalizeSubjectName(rawSubName);

        // Check existing odd semester subject
        const existingSub =
          subjectsList.find(
            (s) =>
              s.department_id === deptId &&
              s.year === resolvedYr &&
              !isEvenSub(s) &&
              (s.name.toLowerCase().trim() === rawSubName.toLowerCase() ||
               normalizeSubjectName(s.name) === cleanSubName)
          ) ||
          (rawCode
            ? subjectsList.find(
                (s) =>
                  s.department_id === deptId &&
                  s.year === resolvedYr &&
                  !isEvenSub(s) &&
                  s.code &&
                  s.code.toUpperCase().trim() === rawCode
              )
            : null) ||
          (cleanCode
            ? subjectsList.find(
                (s) =>
                  s.department_id === deptId &&
                  s.year === resolvedYr &&
                  !isEvenSub(s) &&
                  s.code &&
                  s.code.toUpperCase().replace(/[^A-Z0-9]/g, "") === cleanCode
              )
            : null);

        if (existingSub) {
          matchedSubjectsCount++;
          const hours = Math.min(Math.max(parseInt(row.hours, 10) || existingSub.hours_per_week || 4, 1), 42);
          const credits = Math.min(Math.max(parseInt(row.credits, 10) || existingSub.credits || 3, 1), 20);
          const finalType = inferSubjectType(row.type, rawSubName);
          const abbr = (row.abbreviation || generateAbbreviation(rawSubName)).toUpperCase().trim();

          const subUpdatePayload: Record<string, any> = {};

          if (rawCode && rawCode !== (existingSub.code || "").toUpperCase().trim()) {
            subUpdatePayload.code = rawCode;
          }
          if (abbr && abbr !== (existingSub.abbreviation || "").toUpperCase().trim()) {
            subUpdatePayload.abbreviation = abbr;
          }
          let updatedTags = Array.from(existingSub.tags || []);
          updatedTags = updatedTags.filter((t: string) => !/^(?:hpw|hours):\d+$/i.test(t) && !/^credits:\d+$/i.test(t));
          if (hours > 10) updatedTags.push(`hpw:${hours}`);
          if (credits > 6) updatedTags.push(`credits:${credits}`);
          subUpdatePayload.tags = updatedTags;

          subUpdatePayload.hours_per_week = Math.min(hours, 10);
          subUpdatePayload.credits = Math.min(credits, 6);

          if (finalType && finalType !== existingSub.type) {
            subUpdatePayload.type = finalType;
          }
          if (row.facultyName && row.facultyName.trim() !== (existingSub.staff || "").trim()) {
            subUpdatePayload.staff = row.facultyName.trim();
          }

          if (Object.keys(subUpdatePayload).length > 0) {
            subjectsToUpdateMap.set(existingSub.id, {
              id: existingSub.id,
              payload: subUpdatePayload,
              subObj: existingSub,
            });
          }
        } else {
          const subKey = `${deptId}-${resolvedYr}-${cleanSubName}`;
          if (!subjectsToInsertMap.has(subKey)) {
            const hours = Math.min(Math.max(parseInt(row.hours, 10) || 4, 1), 42);
            const credits = Math.min(Math.max(parseInt(row.credits, 10) || 3, 1), 20);
            const finalType = inferSubjectType(row.type, rawSubName);
            const abbr = (row.abbreviation || generateAbbreviation(rawSubName)).toUpperCase().trim();

            const insertTags: string[] = [];
            if (hours > 10) insertTags.push(`hpw:${hours}`);
            if (credits > 6) insertTags.push(`credits:${credits}`);

            subjectsToInsertMap.set(subKey, {
              code: rawCode || null,
              name: rawSubName,
              abbreviation: abbr || null,
              type: finalType,
              hours_per_week: Math.min(hours, 10),
              credits: Math.min(credits, 6),
              department_id: deptId,
              year: resolvedYr,
              tags: insertTags.length > 0 ? insertTags : null,
              staff: row.facultyName || null,
            });
          }
        }
      }

      // Execute subject updates if differences found
      if (subjectsToUpdateMap.size > 0) {
        for (const item of subjectsToUpdateMap.values()) {
          const { error: sUpErr } = await supabase.from("subjects").update(item.payload).eq("id", item.id);
          if (!sUpErr) {
            Object.assign(item.subObj, item.payload);
            updatedSubjectsCount++;
          }
        }
      }

      // Upsert new subjects batch
      if (subjectsToInsertMap.size > 0) {
        const toInsert = Array.from(subjectsToInsertMap.values());
        const { data: insertedSubjs, error: subjErr } = await (supabase as any)
          .from("subjects")
          .upsert(toInsert, { onConflict: "department_id,year,name" })
          .select("id, name, code, abbreviation, hours_per_week, credits, type, department_id, year, tags, staff");

        if (subjErr) {
          toast.error("Error creating new subjects: " + subjErr.message);
          return;
        }

        if (insertedSubjs) {
          newSubjectsCount += insertedSubjs.length;
          subjectsList.push(...insertedSubjs);
        }
      }

      // Step C: Process Section Assignments across all rows (linking both co-teachers & saving counselors)
      const mappingsToInsert: any[] = [];
      const counselorsToProcess: { department_id: string; faculty_id: string; year: string; section: string }[] = [];

      for (const row of parsedRows) {
        if (isUnassignedFaculty(row.facultyName)) continue;

        const deptId = resolveDepartmentId(row.department, deptList);
        if (!deptId) continue;

        const resolvedYr = resolveYear(row.year, row.semester);

        const rawCode = (row.code || "").toUpperCase().trim();
        const rawSubName = (row.name || "").trim();
        const cleanCode = rawCode.replace(/[^A-Z0-9]/g, "");
        const cleanSubName = normalizeSubjectName(rawSubName);

        const subjectObj =
          subjectsList.find(
            (s) =>
              s.department_id === deptId &&
              s.year === resolvedYr &&
              !isEvenSub(s) &&
              (s.name.toLowerCase().trim() === rawSubName.toLowerCase() ||
               normalizeSubjectName(s.name) === cleanSubName)
          ) ||
          (rawCode
            ? subjectsList.find(
                (s) =>
                  s.department_id === deptId &&
                  s.year === resolvedYr &&
                  !isEvenSub(s) &&
                  s.code &&
                  s.code.toUpperCase().trim() === rawCode
              )
            : null) ||
          (cleanCode
            ? subjectsList.find(
                (s) =>
                  s.department_id === deptId &&
                  s.year === resolvedYr &&
                  !isEvenSub(s) &&
                  s.code &&
                  s.code.toUpperCase().replace(/[^A-Z0-9]/g, "") === cleanCode
              )
            : null);

        if (!subjectObj) continue;

        // Extract sections (can be comma-separated like "A, B" or single "A")
        const rawSections = (row.section || "A")
          .split(/[,/&]+/)
          .map((s: string) => s.trim().toUpperCase())
          .filter(Boolean);

        // Support semicolon-separated co-teaching faculty
        const facNames = row.facultyName.split(";").map((s: string) => s.trim()).filter(Boolean);
        const facEmails = (row.facultyEmail || "").split(";").map((s: string) => s.trim());
        const isCCMarked = /^(yes|true|y|cc|class counsellor|class counselor)$/i.test(String(row.classCounsellor || "").trim());

        for (let fIdx = 0; fIdx < facNames.length; fIdx++) {
          const rawName = facNames[fIdx];
          if (isUnassignedFaculty(rawName)) continue;

          const rawEmail = (facEmails[fIdx] || "").trim();
          const normName = normalizePersonName(rawName);

          const facultyObj =
            (rawEmail ? facultyList.find((f) => f.email && f.email.toLowerCase().trim() === rawEmail.toLowerCase().trim()) : null) ||
            facultyList.find((f) => f.name.toLowerCase().trim() === rawName.toLowerCase()) ||
            facultyList.find((f) => normalizePersonName(f.name) === normName && f.department_id === deptId) ||
            facultyList.find((f) => normalizePersonName(f.name) === normName) ||
            facultyList.find((f) => {
              const fn = normalizePersonName(f.name);
              return (normName.length >= 5 && fn.includes(normName)) ||
                     (fn.length >= 5 && normName.includes(fn)) ||
                     fn.replace(/h/g, "") === normName.replace(/h/g, "");
            });

          if (!facultyObj) continue;

          for (const sec of rawSections) {
            const mapKey = `${facultyObj.id}-${subjectObj.id}-${resolvedYr}-${sec}`;
            if (existingMappingKeys.has(mapKey)) {
              existingMappingsCount++;
            } else {
              existingMappingKeys.add(mapKey);
              mappingsToInsert.push({
                faculty_id: facultyObj.id,
                subject_id: subjectObj.id,
                department_id: deptId,
                year: resolvedYr,
                section: sec,
              });
            }

            // Check Class Counselor
            if (isCCMarked) {
              const isMatchExistingCC = activeCounselorsList.some((c: any) =>
                c.is_active && c.department_id === deptId && c.year === resolvedYr && c.section === sec && c.faculty_id === facultyObj.id
              );
              if (facNames.length === 1 || isMatchExistingCC || fIdx === 0) {
                counselorsToProcess.push({
                  department_id: deptId,
                  faculty_id: facultyObj.id,
                  year: resolvedYr,
                  section: sec,
                });
              }
            }
          }
        }
      }

      // Insert mappings batch
      if (mappingsToInsert.length > 0) {
        const { error: mapErr } = await supabase
          .from("faculty_subject_assignments")
          .insert(mappingsToInsert);

        if (mapErr) {
          toast.error("Error creating assignments: " + mapErr.message);
          return;
        }
        newMappingsCount = mappingsToInsert.length;
      }

      // Upsert Class Counselors if any were tagged
      if (counselorsToProcess.length > 0) {
        const uniqueCCs = new Map<string, any>();
        counselorsToProcess.forEach((cc) => {
          uniqueCCs.set(`${cc.department_id}-${cc.year}-${cc.section}`, cc);
        });

        for (const cc of uniqueCCs.values()) {
          try {
            await (supabase as any)
              .from("class_counselors")
              .update({ is_active: false })
              .eq("department_id", cc.department_id)
              .eq("year", cc.year)
              .eq("section", cc.section)
              .eq("is_active", true);

            await (supabase as any)
              .from("class_counselors")
              .insert({
                department_id: cc.department_id,
                faculty_id: cc.faculty_id,
                year: cc.year,
                section: cc.section,
                is_active: true,
              });
          } catch (ccErr) {
            console.warn("Class counselor save error:", ccErr);
          }
        }
      }

      setImportSummary({
        totalRows: parsedRows.length,
        facultyAdded: newFacultyCount,
        facultyUpdated: updatedFacultyCount,
        facultyExisting: matchedFacultyCount,
        subjectsAdded: newSubjectsCount,
        subjectsUpdated: updatedSubjectsCount,
        subjectsExisting: matchedSubjectsCount,
        mappingsAdded: newMappingsCount,
        mappingsExisting: existingMappingsCount,
        unassignedRows: unassignedCount,
        semesterType: "odd",
      });

      if (newFacultyCount > 0 || updatedFacultyCount > 0) {
        window.dispatchEvent(new CustomEvent("faculty-import:inserted", { detail: { insertedCount: newFacultyCount + updatedFacultyCount } }));
      }
      if (newSubjectsCount > 0 || updatedSubjectsCount > 0) {
        window.dispatchEvent(new CustomEvent("subjects-import:inserted", { detail: { insertedCount: newSubjectsCount + updatedSubjectsCount } }));
      }

      toast.success(
        `Odd Semester Import Complete! ${newFacultyCount} faculty added${updatedFacultyCount > 0 ? ` (${updatedFacultyCount} updated)` : ""}, ${newSubjectsCount} subjects created${updatedSubjectsCount > 0 ? ` (${updatedSubjectsCount} updated)` : ""}, ${newMappingsCount} assignments linked (${existingMappingsCount} kept).`
      );
    } catch (e: any) {
      console.error("Unified import error:", e);
      toast.error("An error occurred during odd semester import: " + (e.message || e));
    } finally {
      setIsLoading(false);
    }
  };

  // Download Even Semester Master Template (Subjects & Assignments only, reusing Odd Sem Faculty)
  // Download Even Semester Master Template (Subjects, Assignments, Co-teaching, Class Counselors)
  const downloadEvenTemplate = async (format: "xlsx" | "csv" = "xlsx") => {
    const sampleRows = [
      // AIDS - Year II (Semester IV)
      {
        "Department": "AIDS",
        "Year": "II",
        "Semester": "Sem IV",
        "Section": "A",
        "Subject Code": "U23ADS401",
        "Subject Name": "Design and Analysis of Algorithms",
        "Abbreviation": "DAA",
        "Type": "theory",
        "Hours Per Week": 4,
        "Credits": 3,
        "Faculty Name": "Mr. R. Krishna Prakash",
        "Faculty Email": "krishnaprakash@sonatech.ac.in",
        "Designation": "Assistant Professor",
        "Class Counsellor": "",
      },
      {
        "Department": "AIDS",
        "Year": "II",
        "Semester": "Sem IV",
        "Section": "A",
        "Subject Code": "U23ADS402",
        "Subject Name": "Machine Learning Foundations",
        "Abbreviation": "MLF",
        "Type": "theory",
        "Hours Per Week": 4,
        "Credits": 3,
        "Faculty Name": "Dr. S. Vasanthi",
        "Faculty Email": "vasanthi@sonatech.ac.in",
        "Designation": "Associate Professor",
        "Class Counsellor": "Yes",
      },
      {
        "Department": "AIDS",
        "Year": "II",
        "Semester": "Sem IV",
        "Section": "A",
        "Subject Code": "U23ADS405",
        "Subject Name": "Design and Analysis of Algorithms Laboratory",
        "Abbreviation": "DAA LAB",
        "Type": "lab",
        "Hours Per Week": 4,
        "Credits": 2,
        "Faculty Name": "Mr. R. Krishna Prakash; Ms. J. Deepika",
        "Faculty Email": "krishnaprakash@sonatech.ac.in; jdeepika@sonatech.ac.in",
        "Designation": "Assistant Professor; Assistant Professor",
        "Class Counsellor": "",
      },
      // AIDS - Year III (Semester VI) — Open Elective
      {
        "Department": "AIDS",
        "Year": "III",
        "Semester": "Sem VI",
        "Section": "A",
        "Subject Code": "U23MC1001",
        "Subject Name": "Open Elective - Fundamentals of Robotics",
        "Abbreviation": "ROBOTICS",
        "Type": "open elective",
        "Hours Per Week": 3,
        "Credits": 3,
        "Faculty Name": "Dr. P. Suresh",
        "Faculty Email": "psuresh@sonatech.ac.in",
        "Designation": "Professor",
        "Class Counsellor": "",
      },
      {
        "Department": "AIDS",
        "Year": "III",
        "Semester": "Sem VI",
        "Section": "A",
        "Subject Code": "U23ADS601",
        "Subject Name": "Full Stack Development",
        "Abbreviation": "FSD",
        "Type": "theory",
        "Hours Per Week": 4,
        "Credits": 3,
        "Faculty Name": "Mr. A. Naveen Kumar",
        "Faculty Email": "akumar@sonatech.ac.in",
        "Designation": "Assistant Professor",
        "Class Counsellor": "Yes",
      },
      // Information Technology - Year II (Semester IV)
      {
        "Department": "IT",
        "Year": "II",
        "Semester": "Sem IV",
        "Section": "A",
        "Subject Code": "U23IT401",
        "Subject Name": "Operating Systems",
        "Abbreviation": "OS",
        "Type": "theory",
        "Hours Per Week": 4,
        "Credits": 3,
        "Faculty Name": "Mr. J. Gokulraj",
        "Faculty Email": "jgokulraj@sonatech.ac.in",
        "Designation": "Assistant Professor",
        "Class Counsellor": "Yes",
      },
      {
        "Department": "IT",
        "Year": "II",
        "Semester": "Sem IV",
        "Section": "A",
        "Subject Code": "U23IT405",
        "Subject Name": "Operating Systems Laboratory",
        "Abbreviation": "OS LAB",
        "Type": "lab",
        "Hours Per Week": 3,
        "Credits": 2,
        "Faculty Name": "Mr. J. Gokulraj; Mrs. L. Sindhu",
        "Faculty Email": "jgokulraj@sonatech.ac.in; ssindhu@sonatech.ac.in",
        "Designation": "Assistant Professor; Assistant Professor",
        "Class Counsellor": "",
      },
      // Information Technology - Year III (Semester VI)
      {
        "Department": "IT",
        "Year": "III",
        "Semester": "Sem VI",
        "Section": "A",
        "Subject Code": "U23IT601",
        "Subject Name": "Cryptography and Network Security",
        "Abbreviation": "CNS",
        "Type": "theory",
        "Hours Per Week": 4,
        "Credits": 3,
        "Faculty Name": "Dr. R. Shakthivel",
        "Faculty Email": "rshakthivel@sonatech.ac.in",
        "Designation": "Associate Professor",
        "Class Counsellor": "Yes",
      },
      // Year IV (Semester VIII) — Project Work & Activities
      {
        "Department": "AIDS",
        "Year": "IV",
        "Semester": "Sem VIII",
        "Section": "A",
        "Subject Code": "U19IT801",
        "Subject Name": "Project Work",
        "Abbreviation": "PROJECT",
        "Type": "theory",
        "Hours Per Week": 37,
        "Credits": 6,
        "Faculty Name": "Dr. P. Iyyanar; Dr. C. Santhosh Kumar",
        "Faculty Email": "piyyanar@sonatech.ac.in; csanthoshkumar@sonatech.ac.in",
        "Designation": "Assistant Professor; Associate Professor",
        "Class Counsellor": "Yes",
      },
      {
        "Department": "AIDS",
        "Year": "IV",
        "Semester": "Sem VIII",
        "Section": "A",
        "Subject Code": "SEMINAR",
        "Subject Name": "Seminar",
        "Abbreviation": "SEMINAR",
        "Type": "special",
        "Hours Per Week": 2,
        "Credits": 1,
        "Faculty Name": "Mr. P. Dinesh Kumar",
        "Faculty Email": "pdineshkumar@sonatech.ac.in",
        "Designation": "Assistant Professor",
        "Class Counsellor": "",
      },
    ];

    if (format === "xlsx") {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(sampleRows);
      ws["!cols"] = [
        { wch: 14 }, // Department
        { wch: 8 },  // Year
        { wch: 10 }, // Semester
        { wch: 8 },  // Section
        { wch: 16 }, // Subject Code
        { wch: 45 }, // Subject Name
        { wch: 14 }, // Abbreviation
        { wch: 14 }, // Type
        { wch: 16 }, // Hours Per Week
        { wch: 10 }, // Credits
        { wch: 32 }, // Faculty Name
        { wch: 36 }, // Faculty Email
        { wch: 28 }, // Designation
        { wch: 18 }, // Class Counsellor
      ];
      XLSX.utils.book_append_sheet(wb, ws, "Even Semester Master");

      // Dynamically query Faculty to attach as reference sheet
      try {
        const [facRes, deptRes] = await Promise.all([
          supabase.from("faculty_members").select("id, name, email, designation, department_id").order("name"),
          supabase.from("departments").select("id, name"),
        ]);
        const deptMap = new Map<string, string>();
        (deptRes.data || []).forEach((d: any) => deptMap.set(d.id, d.name));

        if (facRes.data && facRes.data.length > 0) {
          const facultyRefRows = facRes.data.map((f: any) => ({
            "Department": deptMap.get(f.department_id) || "General",
            "Faculty Name": f.name,
            "Faculty Email": f.email || "",
            "Designation": f.designation || "Faculty",
          }));
          const wsFaculty = XLSX.utils.json_to_sheet(facultyRefRows);
          wsFaculty["!cols"] = [{ wch: 24 }, { wch: 28 }, { wch: 32 }, { wch: 22 }];
          XLSX.utils.book_append_sheet(wb, wsFaculty, "Existing Faculty Reference");
        }
      } catch (e) {
        console.warn("Could not query faculty reference for Even template:", e);
      }

      // Column guidelines sheet
      const guideRows = [
        { "Column Name": "Department", "Required": "Yes", "Description": "Department acronym or name (e.g., AIDS, IT)" },
        { "Column Name": "Year", "Required": "Yes", "Description": "Academic Year: II (Sem IV), III (Sem VI), IV (Sem VIII)" },
        { "Column Name": "Semester", "Required": "Optional", "Description": "Semester name (e.g., Sem IV, Sem VI, Sem VIII)" },
        { "Column Name": "Section", "Required": "Yes", "Description": "Class section (e.g., A, B, C)" },
        { "Column Name": "Subject Code", "Required": "Yes", "Description": "Official course code (e.g., U23ADS401, U23IT601, U23MC1001)" },
        { "Column Name": "Subject Name", "Required": "Yes", "Description": "Full title of the subject" },
        { "Column Name": "Abbreviation", "Required": "Optional", "Description": "Short display code (e.g., DAA, OS, FSD)" },
        { "Column Name": "Type", "Required": "Yes", "Description": "Course type: theory, lab, elective, open elective, soft skill, aptitude, placement" },
        { "Column Name": "Hours Per Week", "Required": "Yes", "Description": "Weekly periods / hours allocated" },
        { "Column Name": "Credits", "Required": "Yes", "Description": "Course syllabus credits (e.g., 3 for theory, 2 for lab, 1 for soft skills)" },
        { "Column Name": "Faculty Name", "Required": "Yes", "Description": "Faculty in-charge. For co-teaching, separate multiple staff with semicolon ( ; )" },
        { "Column Name": "Faculty Email", "Required": "Yes", "Description": "Official email (@sonatech.ac.in). For co-teaching, separate emails with semicolon ( ; )" },
        { "Column Name": "Designation", "Required": "Yes", "Description": "Academic designation (Assistant Professor, Associate Professor, Professor)" },
        { "Column Name": "Class Counsellor", "Required": "Optional", "Description": 'Mark "Yes" if this faculty is the designated Class Counsellor for this section' },
      ];
      const guideWs = XLSX.utils.json_to_sheet(guideRows);
      guideWs["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 80 }];
      XLSX.utils.book_append_sheet(wb, guideWs, "Column Guide");

      XLSX.writeFile(wb, "Even_Semester_Master_Template.xlsx");
      toast.success("Even Semester master template downloaded!");
    } else {
      const csv = Papa.unparse(sampleRows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "Even_Semester_Master_Template.csv");
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // ────────────────── UNIFIED EVEN SEMESTER MASTER IMPORTER ──────────────────
  const handleEvenRowsUpload = async (rawRows: any[]) => {
    setIsLoading(true);
    setImportSummary(null);

    try {
      if (!rawRows || rawRows.length === 0) {
        toast.error("File contains no data rows.");
        return;
      }

      // 1. Fetch departments, faculty, subjects, assignments, and class counselors
      const [deptRes, facRes, subjRes, mapRes, ccRes] = await Promise.all([
        supabase.from("departments").select("id, name"),
        supabase.from("faculty_members").select("id, name, email, department_id, designation"),
        supabase.from("subjects").select("id, name, code, abbreviation, hours_per_week, credits, type, department_id, year, tags, staff"),
        supabase.from("faculty_subject_assignments").select("faculty_id, subject_id, department_id, year, section"),
        (supabase as any).from("class_counselors").select("id, department_id, faculty_id, year, section, is_active"),
      ]);

      if (deptRes.error) {
        toast.error("Failed to load departments: " + deptRes.error.message);
        return;
      }

      const deptList = deptRes.data || [];
      const facultyList = [...(facRes.data || [])];
      const subjectsList = [...(subjRes.data || [])];
      const existingMappings = mapRes.data || [];
      const activeCounselorsList = ccRes?.data || [];

      const existingMappingKeys = new Set(
        existingMappings.map((m: any) => `${m.faculty_id}-${m.subject_id}-${m.year}-${(m.section || "A").toUpperCase()}`)
      );

      let newFacultyCount = 0;
      let updatedFacultyCount = 0;
      let matchedFacultyCount = 0;
      let newSubjectsCount = 0;
      let updatedSubjectsCount = 0;
      let matchedSubjectsCount = 0;
      let newMappingsCount = 0;
      let existingMappingsCount = 0;
      let unassignedCount = 0;
      const skippedRows: string[] = [];

      // Parse normalized rows
      const parsedRows = rawRows
        .map((raw, idx) => {
          const norm = normalizeRowKeys(raw);
          return {
            rowNum: idx + 2,
            department: norm.department || norm.dept || "",
            year: norm.year || "",
            semester: norm.semester || norm.sem || "",
            section: norm.section || norm.sec || "A",
            code: norm.subjectcode || norm.code || norm.subcode || "",
            name: norm.subjectname || norm.subject || norm.name || norm.subname || "",
            abbreviation: norm.abbreviation || norm.abbr || norm.shortname || "",
            type: norm.type || norm.subjecttype || "",
            hours: norm.hoursperweek || norm.hoursallocated || norm.hours || norm.hpw || "4",
            credits: norm.credits || norm.credit || "3",
            facultyName: norm.facultyname || norm.staffincharge || norm.faculty || norm.staff || "",
            facultyEmail: norm.facultyemail || norm.staffemail || norm.email || "",
            designation: norm.designation || norm.role || norm.position || "",
            classCounsellor: norm.classcounsellor || norm.classcounselor || norm.counsellor || norm.counselor || norm.cc || "",
          };
        })
        .filter((r) => r.department && (r.name || r.code));

      if (parsedRows.length === 0) {
        toast.error("No valid course rows found. Please check that Department and Subject Name/Code are provided.");
        return;
      }

      // Robust faculty matching helper (email, domain-tolerant @sonatech.in vs @sonatech.ac.in, name, normalized name)
      const matchFaculty = (rawName: string, rawEmail: string, targetDeptId: string) => {
        if (isUnassignedFaculty(rawName)) return null;
        const normEmail = (rawEmail || "").toLowerCase().trim();
        const cleanEmailDomain = normEmail.replace("@sonatech.in", "@sonatech.ac.in");
        const normName = normalizePersonName(rawName);

        // 1. Email match (exact or domain-tolerant)
        if (normEmail) {
          const match = facultyList.find((f) => {
            const fe = (f.email || "").toLowerCase().trim();
            return fe === normEmail || fe === cleanEmailDomain;
          });
          if (match) return match;
        }

        // 2. Exact name match in department
        const exactDept = facultyList.find(
          (f) => f.name.toLowerCase().trim() === rawName.toLowerCase().trim() && f.department_id === targetDeptId
        );
        if (exactDept) return exactDept;

        // 3. Exact name match across all departments
        const exactAny = facultyList.find((f) => f.name.toLowerCase().trim() === rawName.toLowerCase().trim());
        if (exactAny) return exactAny;

        // 4. Normalized name in department
        const normDept = facultyList.find(
          (f) => normalizePersonName(f.name) === normName && f.department_id === targetDeptId
        );
        if (normDept) return normDept;

        // 5. Normalized name across all departments
        const normAny = facultyList.find((f) => normalizePersonName(f.name) === normName);
        if (normAny) return normAny;

        // 6. Substring or phonetic match
        if (normName.length >= 4) {
          const subDept = facultyList.find(
            (f) =>
              f.department_id === targetDeptId &&
              (normalizePersonName(f.name).includes(normName) || normName.includes(normalizePersonName(f.name)))
          );
          if (subDept) return subDept;

          const subAny = facultyList.find(
            (f) =>
              normalizePersonName(f.name).includes(normName) ||
              normName.includes(normalizePersonName(f.name)) ||
              normalizePersonName(f.name).replace(/h/g, "") === normName.replace(/h/g, "")
          );
          if (subAny) return subAny;
        }

        return null;
      };

      // Step A: Process Faculty across all rows (difference overwrite & new inserts)
      const facultyToUpdateMap = new Map<string, { id: string; payload: Record<string, any>; facObj: any }>();
      const facultyToInsertMap = new Map<string, any>();
      const existingFacultyEmails = new Set(
        facultyList.map((f) => (f.email || "").toLowerCase().trim()).filter(Boolean)
      );

      for (const row of parsedRows) {
        if (isUnassignedFaculty(row.facultyName)) {
          unassignedCount++;
          continue;
        }

        const deptId = resolveDepartmentId(row.department, deptList);
        if (!deptId) {
          skippedRows.push(`Row ${row.rowNum}: Unknown department "${row.department}"`);
          continue;
        }

        const facNames = row.facultyName.split(";").map((s: string) => s.trim()).filter(Boolean);
        const facEmails = (row.facultyEmail || "").split(";").map((s: string) => s.trim());
        const facDesigs = (row.designation || "").split(";").map((s: string) => s.trim());

        facNames.forEach((rawName: string, fIdx: number) => {
          if (isUnassignedFaculty(rawName)) return;

          const rawEmail = (facEmails[fIdx] || "").trim();
          const rawDesig = (facDesigs[fIdx] || facDesigs[0] || "").trim();
          const normName = normalizePersonName(rawName);

          const existingFac = matchFaculty(rawName, rawEmail, deptId);

          if (existingFac) {
            matchedFacultyCount++;
            const facUpdatePayload: Record<string, any> = {};

            // Overwrite designation if different
            if (rawDesig && rawDesig !== (existingFac.designation || "").trim()) {
              facUpdatePayload.designation = rawDesig;
            }

            // Overwrite email if updated
            const cleanRawEmail = rawEmail.toLowerCase().trim().replace("@sonatech.in", "@sonatech.ac.in");
            const cleanExistingEmail = (existingFac.email || "").toLowerCase().trim().replace("@sonatech.in", "@sonatech.ac.in");
            if (rawEmail && cleanRawEmail !== cleanExistingEmail) {
              facUpdatePayload.email = cleanRawEmail;
            }

            if (Object.keys(facUpdatePayload).length > 0) {
              facultyToUpdateMap.set(existingFac.id, {
                id: existingFac.id,
                payload: facUpdatePayload,
                facObj: existingFac,
              });
            }
          } else {
            const facKey = rawEmail.toLowerCase() || `${normName}-${deptId}`;
            if (!facultyToInsertMap.has(facKey)) {
              let autoEmail = rawEmail.toLowerCase().replace("@sonatech.in", "@sonatech.ac.in");
              if (!autoEmail || existingFacultyEmails.has(autoEmail)) {
                autoEmail = `${normName || "faculty"}_${Math.floor(100 + Math.random() * 900)}@sonatech.ac.in`;
              }
              const autoDesig =
                rawDesig || (rawName.startsWith("Dr.") ? "Associate Professor" : "Assistant Professor");

              facultyToInsertMap.set(facKey, {
                name: rawName,
                email: autoEmail,
                designation: autoDesig,
                department_id: deptId,
              });
              existingFacultyEmails.add(autoEmail);
            }
          }
        });
      }

      // Execute faculty updates if any differences found
      if (facultyToUpdateMap.size > 0) {
        for (const item of facultyToUpdateMap.values()) {
          const { error: fUpErr } = await supabase.from("faculty_members").update(item.payload).eq("id", item.id);
          if (!fUpErr) {
            Object.assign(item.facObj, item.payload);
            updatedFacultyCount++;
          }
        }
      }

      // Batch insert new faculty
      if (facultyToInsertMap.size > 0) {
        const toInsert = Array.from(facultyToInsertMap.values());
        const { data: insertedFac, error: facErr } = await supabase
          .from("faculty_members")
          .insert(toInsert)
          .select("id, name, email, department_id, designation");

        if (facErr) {
          toast.error("Error creating new faculty: " + facErr.message);
          return;
        }

        if (insertedFac) {
          newFacultyCount += insertedFac.length;
          facultyList.push(...insertedFac);
        }
      }

      // Step B: Process Even Semester Subjects (difference overwrite & new inserts)
      const subjectsToUpdateMap = new Map<string, { id: string; payload: Record<string, any>; subObj: any }>();
      const subjectsToInsertMap = new Map<string, any>();

      for (const row of parsedRows) {
        const deptId = resolveDepartmentId(row.department, deptList);
        if (!deptId) continue;

        const resolvedYr = resolveYear(row.year, row.semester);
        const rawCode = (row.code || "").toUpperCase().trim();
        const rawSubName = (row.name || "").trim();
        const cleanCode = rawCode.replace(/[^A-Z0-9]/g, "");
        const cleanSubName = normalizeSubjectName(rawSubName);

        // Find existing subject (by exact name, normalized name, or code)
        const existingSub =
          subjectsList.find(
            (s) =>
              s.department_id === deptId &&
              s.year === resolvedYr &&
              (s.name.toLowerCase().trim() === rawSubName.toLowerCase() ||
               normalizeSubjectName(s.name) === cleanSubName)
          ) ||
          (rawCode
            ? subjectsList.find(
                (s) =>
                  s.department_id === deptId &&
                  s.year === resolvedYr &&
                  s.code &&
                  s.code.toUpperCase().trim() === rawCode
              )
            : null) ||
          (cleanCode
            ? subjectsList.find(
                (s) =>
                  s.department_id === deptId &&
                  s.year === resolvedYr &&
                  s.code &&
                  s.code.toUpperCase().replace(/[^A-Z0-9]/g, "") === cleanCode
              )
            : null);

        if (existingSub) {
          matchedSubjectsCount++;
          const hours = Math.min(Math.max(parseInt(row.hours, 10) || existingSub.hours_per_week || 4, 1), 42);
          const credits = Math.min(Math.max(parseInt(row.credits, 10) || existingSub.credits || 3, 1), 20);
          const finalType = inferSubjectType(row.type, rawSubName);
          const abbr = (row.abbreviation || generateAbbreviation(rawSubName)).toUpperCase().trim();

          const subUpdatePayload: Record<string, any> = {};

          if (rawCode && rawCode !== (existingSub.code || "").toUpperCase().trim()) {
            subUpdatePayload.code = rawCode;
          }
          if (abbr && abbr !== (existingSub.abbreviation || "").toUpperCase().trim()) {
            subUpdatePayload.abbreviation = abbr;
          }
          let updatedTags = Array.from(existingSub.tags || []);
          if (!updatedTags.some((t: string) => /even_sem|even\b/i.test(t))) {
            updatedTags.push("even_sem");
          }
          updatedTags = updatedTags.filter((t: string) => !/^(?:hpw|hours):\d+$/i.test(t) && !/^credits:\d+$/i.test(t));
          if (hours > 10) updatedTags.push(`hpw:${hours}`);
          if (credits > 6) updatedTags.push(`credits:${credits}`);
          subUpdatePayload.tags = updatedTags;

          subUpdatePayload.hours_per_week = Math.min(hours, 10);
          subUpdatePayload.credits = Math.min(credits, 6);

          if (finalType && finalType !== existingSub.type) {
            subUpdatePayload.type = finalType;
          }
          if (row.facultyName && row.facultyName.trim() !== (existingSub.staff || "").trim()) {
            subUpdatePayload.staff = row.facultyName.trim();
          }

          if (Object.keys(subUpdatePayload).length > 0) {
            subjectsToUpdateMap.set(existingSub.id, {
              id: existingSub.id,
              payload: subUpdatePayload,
              subObj: existingSub,
            });
          }
        } else {
          // Key by (department_id, year, cleanSubName) to guarantee uniqueness in insert batch
          const subKey = `${deptId}-${resolvedYr}-${cleanSubName}`;
          if (!subjectsToInsertMap.has(subKey)) {
            const hours = Math.min(Math.max(parseInt(row.hours, 10) || 4, 1), 42);
            const credits = Math.min(Math.max(parseInt(row.credits, 10) || (inferSubjectType(row.type, rawSubName) === "lab" ? 2 : 3), 1), 20);
            const finalType = inferSubjectType(row.type, rawSubName);
            const abbr = (row.abbreviation || generateAbbreviation(rawSubName)).toUpperCase().trim();

            const insertTags = ["even_sem"];
            if (hours > 10) insertTags.push(`hpw:${hours}`);
            if (credits > 6) insertTags.push(`credits:${credits}`);

            subjectsToInsertMap.set(subKey, {
              code: rawCode || null,
              name: rawSubName,
              abbreviation: abbr || null,
              type: finalType,
              hours_per_week: Math.min(hours, 10),
              credits: Math.min(credits, 6),
              department_id: deptId,
              year: resolvedYr,
              tags: insertTags,
              staff: row.facultyName || null,
            });
          }
        }
      }

      // Execute subject updates if any differences found
      if (subjectsToUpdateMap.size > 0) {
        for (const item of subjectsToUpdateMap.values()) {
          let { error: sUpErr } = await supabase.from("subjects").update(item.payload).eq("id", item.id);
          // If check constraint fails on hours (> 10), retry clamping to 10
          if (sUpErr && sUpErr.message?.includes("subjects_hours_per_week_check") && item.payload.hours_per_week > 10) {
            const fallbackPayload = { ...item.payload, hours_per_week: 10 };
            const retryRes = await supabase.from("subjects").update(fallbackPayload).eq("id", item.id);
            sUpErr = retryRes.error;
            if (!sUpErr) {
              item.payload.hours_per_week = 10;
              toast.warning("Database limit: hours_per_week was saved as 10h. Run the SQL migration in Supabase SQL editor to allow full 37h.");
            }
          }
          if (!sUpErr) {
            Object.assign(item.subObj, item.payload);
            updatedSubjectsCount++;
          }
        }
      }

      // Upsert new even semester subjects batch
      if (subjectsToInsertMap.size > 0) {
        const toInsert = Array.from(subjectsToInsertMap.values());
        let { data: insertedSubjs, error: subjErr } = await (supabase as any)
          .from("subjects")
          .upsert(toInsert, { onConflict: "department_id,year,name" })
          .select("id, name, code, abbreviation, hours_per_week, credits, type, department_id, year, tags, staff");

        // If check constraint fails on hours (> 10), retry with capped hours
        if (subjErr && subjErr.message?.includes("subjects_hours_per_week_check")) {
          const fallbackToInsert = toInsert.map((s) => ({
            ...s,
            hours_per_week: s.hours_per_week > 10 ? 10 : s.hours_per_week,
          }));
          const retryRes = await (supabase as any)
            .from("subjects")
            .upsert(fallbackToInsert, { onConflict: "department_id,year,name" })
            .select("id, name, code, abbreviation, hours_per_week, credits, type, department_id, year, tags, staff");
          insertedSubjs = retryRes.data;
          subjErr = retryRes.error;
          if (!subjErr) {
            toast.warning("Database limit: hours_per_week was saved as 10h. Run the SQL migration in Supabase SQL editor to allow full 37h.");
          }
        }

        if (subjErr) {
          toast.error("Error creating Even Semester subjects: " + subjErr.message);
          return;
        }

        if (insertedSubjs) {
          newSubjectsCount += insertedSubjs.length;
          subjectsList.push(...insertedSubjs);
        }
      }

      // Step C: Process Section Assignments & Class Counselors for Even Semester
      const mappingsToInsert: any[] = [];
      const assignedFacultySet = new Set<string>();
      const counselorsToProcess: { department_id: string; faculty_id: string; year: string; section: string }[] = [];

      for (const row of parsedRows) {
        if (isUnassignedFaculty(row.facultyName)) continue;

        const deptId = resolveDepartmentId(row.department, deptList);
        if (!deptId) continue;

        const resolvedYr = resolveYear(row.year, row.semester);

        const rawCode = (row.code || "").toUpperCase().trim();
        const rawSubName = (row.name || "").trim();
        const cleanCode = rawCode.replace(/[^A-Z0-9]/g, "");
        const cleanSubName = normalizeSubjectName(rawSubName);

        const subjectObj =
          subjectsList.find(
            (s) =>
              s.department_id === deptId &&
              s.year === resolvedYr &&
              (s.name.toLowerCase().trim() === rawSubName.toLowerCase() ||
               normalizeSubjectName(s.name) === cleanSubName)
          ) ||
          (rawCode
            ? subjectsList.find(
                (s) =>
                  s.department_id === deptId &&
                  s.year === resolvedYr &&
                  s.code &&
                  s.code.toUpperCase().trim() === rawCode
              )
            : null) ||
          (cleanCode
            ? subjectsList.find(
                (s) =>
                  s.department_id === deptId &&
                  s.year === resolvedYr &&
                  s.code &&
                  s.code.toUpperCase().replace(/[^A-Z0-9]/g, "") === cleanCode
              )
            : null);

        if (!subjectObj) continue;

        // Extract sections (e.g. "A", "B", "A, B")
        const rawSections = (row.section || "A")
          .split(/[,/&]+/)
          .map((s: string) => s.trim().toUpperCase())
          .filter(Boolean);

        // Support semicolon-separated co-teaching faculty
        const facNames = row.facultyName.split(";").map((s: string) => s.trim()).filter(Boolean);
        const facEmails = (row.facultyEmail || "").split(";").map((s: string) => s.trim());
        const isCCMarked = /^(yes|true|y|cc|class counsellor|class counselor)$/i.test(
          String(row.classCounsellor || "").trim()
        );

        for (let fIdx = 0; fIdx < facNames.length; fIdx++) {
          const rawName = facNames[fIdx];
          if (isUnassignedFaculty(rawName)) continue;
          const rawEmail = (facEmails[fIdx] || "").trim();

          const facultyObj = matchFaculty(rawName, rawEmail, deptId);

          if (!facultyObj) {
            skippedRows.push(`Row ${row.rowNum}: Could not resolve faculty "${rawName}"`);
            continue;
          }

          assignedFacultySet.add(facultyObj.id);

          for (const sec of rawSections) {
            const mapKey = `${facultyObj.id}-${subjectObj.id}-${resolvedYr}-${sec}`;
            if (existingMappingKeys.has(mapKey)) {
              existingMappingsCount++;
            } else {
              existingMappingKeys.add(mapKey);
              mappingsToInsert.push({
                faculty_id: facultyObj.id,
                subject_id: subjectObj.id,
                department_id: deptId,
                year: resolvedYr,
                section: sec,
              });
            }

            // Check Class Counselor
            if (isCCMarked) {
              const isMatchExistingCC = activeCounselorsList.some(
                (c: any) =>
                  c.is_active &&
                  c.department_id === deptId &&
                  c.year === resolvedYr &&
                  c.section === sec &&
                  c.faculty_id === facultyObj.id
              );
              if (facNames.length === 1 || isMatchExistingCC || fIdx === 0) {
                counselorsToProcess.push({
                  department_id: deptId,
                  faculty_id: facultyObj.id,
                  year: resolvedYr,
                  section: sec,
                });
              }
            }
          }
        }
      }

      // Insert mappings batch
      if (mappingsToInsert.length > 0) {
        const { error: mapErr } = await supabase
          .from("faculty_subject_assignments")
          .insert(mappingsToInsert);

        if (mapErr) {
          toast.error("Error creating Even Semester assignments: " + mapErr.message);
          return;
        }
        newMappingsCount = mappingsToInsert.length;
      }

      // Upsert Class Counselors if any were marked
      if (counselorsToProcess.length > 0) {
        const uniqueCCs = new Map<string, any>();
        counselorsToProcess.forEach((cc) => {
          uniqueCCs.set(`${cc.department_id}-${cc.year}-${cc.section}`, cc);
        });

        for (const cc of uniqueCCs.values()) {
          try {
            await (supabase as any)
              .from("class_counselors")
              .update({ is_active: false })
              .eq("department_id", cc.department_id)
              .eq("year", cc.year)
              .eq("section", cc.section)
              .eq("is_active", true);

            await (supabase as any)
              .from("class_counselors")
              .insert({
                department_id: cc.department_id,
                faculty_id: cc.faculty_id,
                year: cc.year,
                section: cc.section,
                is_active: true,
              });
          } catch (ccErr) {
            console.warn("Class counselor save error:", ccErr);
          }
        }
      }

      setImportSummary({
        totalRows: parsedRows.length,
        facultyAdded: newFacultyCount,
        facultyUpdated: updatedFacultyCount,
        facultyExisting: matchedFacultyCount,
        subjectsAdded: newSubjectsCount,
        subjectsUpdated: updatedSubjectsCount,
        subjectsExisting: matchedSubjectsCount,
        mappingsAdded: newMappingsCount,
        mappingsExisting: existingMappingsCount,
        unassignedRows: unassignedCount,
        semesterType: "even",
      });

      if (newFacultyCount > 0 || updatedFacultyCount > 0) {
        window.dispatchEvent(
          new CustomEvent("faculty-import:inserted", { detail: { insertedCount: newFacultyCount + updatedFacultyCount } })
        );
      }
      if (newSubjectsCount > 0 || updatedSubjectsCount > 0) {
        window.dispatchEvent(
          new CustomEvent("subjects-import:inserted", { detail: { insertedCount: newSubjectsCount + updatedSubjectsCount } })
        );
      }

      toast.success(
        `Even Semester Import Complete! ${newFacultyCount} faculty added${updatedFacultyCount > 0 ? ` (${updatedFacultyCount} updated)` : ""}, ${newSubjectsCount} subjects created${updatedSubjectsCount > 0 ? ` (${updatedSubjectsCount} updated)` : ""}, ${newMappingsCount} section assignments linked (${existingMappingsCount} kept).`
      );
    } catch (e: any) {
      console.error("Even semester import error:", e);
      toast.error("An error occurred during even semester import: " + (e.message || e));
    } finally {
      setIsLoading(false);
    }
  };

  // ────────────────── INDIVIDUAL TAB HANDLERS ──────────────────
  // Handle Faculty CSV upload
  const handleFacultyUpload = async (data: FacultyRecord[]) => {
    setIsLoading(true);
    try {
      const nameToDeptId = await getDeptNameToIdMap();
      const distinctDeptValues = Array.from(new Set(data.map((rec) => (rec.department || "").toString().trim()).filter(Boolean)));
      const manualMap = new Map<string, string>();

      for (const val of distinctDeptValues) {
        if (isUuid(val)) continue;
        const key = val.toLowerCase();
        if (!nameToDeptId.has(key)) {
          const input = window.prompt(`Unknown department: "${val}".\nEnter matching department NAME exactly as in system (or leave blank to skip):`, "");
          if (input) {
            const found = nameToDeptId.get(input.trim().toLowerCase());
            if (found) {
              manualMap.set(key, found);
            } else {
              toast.warning(`Department "${input}" not found. Rows for "${val}" will be skipped.`);
            }
          }
        }
      }

      const { data: existing, error: fetchError } = await supabase
        .from("faculty_members")
        .select("email");

      if (fetchError) {
        toast.error("Failed to fetch existing faculty members");
        return;
      }

      const existingEmails = new Set(
        (existing || [])
          .map((r: any) => (r?.email || "").toString().trim().toLowerCase())
          .filter(Boolean)
      );

      const prepared = data
        .map((rec) => {
          const normalizedEmail = (rec.email || "").toString().trim().toLowerCase();
          const rawDept = (rec.department || "").toString().trim();
          const resolvedDeptId = isUuid(rawDept)
            ? rawDept
            : (nameToDeptId.get(rawDept.toLowerCase()) || manualMap.get(rawDept.toLowerCase()) || "");
          return {
            name: (rec.name || "").toString().trim(),
            email: normalizedEmail ? normalizedEmail : null,
            designation: (rec.designation || "").toString().trim() || null,
            department_id: resolvedDeptId,
          };
        })
        .filter((r) => r.name && r.department_id);

      const invalidCount = data.length - prepared.length;
      const uniqueRecords = prepared.filter(
        (rec) => rec.email ? !existingEmails.has(rec.email) : true
      );
      const duplicateRecords = prepared.filter((rec) =>
        rec.email ? existingEmails.has(rec.email) : false
      );

      let insertedCount = 0;
      if (uniqueRecords.length > 0) {
        const { error: insertError } = await supabase
          .from("faculty_members")
          .insert(uniqueRecords)
          .select("id");

        if (insertError) {
          toast.error("Insert failed: " + insertError.message);
        } else {
          insertedCount += uniqueRecords.length;
          toast.success(`${uniqueRecords.length} new faculty members added successfully!`);
        }
      }

      if (duplicateRecords.length > 0) {
        const proceed = window.confirm(
          `${duplicateRecords.length} duplicate faculty entries found by email. Add them anyway?\n\nNote: This may create duplicate faculty records.`
        );
        if (proceed) {
          const { error: dupInsertError } = await supabase
            .from("faculty_members")
            .insert(duplicateRecords)
            .select("id");
          if (dupInsertError) {
            toast.error(`Failed to add duplicates: ${dupInsertError.message}`);
          } else {
            insertedCount += duplicateRecords.length;
            toast.success(`${duplicateRecords.length} duplicates added.`);
          }
        } else {
          toast.warning(`${duplicateRecords.length} duplicate entries skipped.`);
        }
      }

      if (insertedCount > 0) {
        window.dispatchEvent(new CustomEvent("faculty-import:inserted", { detail: { insertedCount } }));
      }
      if (invalidCount > 0) {
        toast.warning(`${invalidCount} rows skipped due to invalid department mapping.`);
      }
    } catch (e: any) {
      toast.error("An error occurred during faculty import: " + (e.message || e));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Subjects CSV upload
  const handleSubjectsUpload = async (data: SubjectRecord[]) => {
    setIsLoading(true);
    try {
      const nameToDeptId = await getDeptNameToIdMap();
      const distinctDeptValues = Array.from(new Set(data.map((rec) => (rec.department || "").toString().trim()).filter(Boolean)));
      const manualMap = new Map<string, string>();

      for (const val of distinctDeptValues) {
        if (isUuid(val)) continue;
        const key = val.toLowerCase();
        if (!nameToDeptId.has(key)) {
          const input = window.prompt(`Unknown department: "${val}".\nEnter matching department NAME exactly as in system (or leave blank to skip):`, "");
          if (input) {
            const found = nameToDeptId.get(input.trim().toLowerCase());
            if (found) {
              manualMap.set(key, found);
            } else {
              toast.warning(`Department "${input}" not found. Rows for "${val}" will be skipped.`);
            }
          }
        }
      }

      const { data: existing, error: fetchError } = await (supabase as any)
        .from("subjects")
        .select("code, department_id, tags");

      if (fetchError) {
        toast.error("Failed to fetch existing subjects list");
        return;
      }

      const isEven = subjectSemesterType === "even";
      const existingSubjectKeys = new Set(
        (existing || [])
          .filter((r: any) => {
            const hasEvenTag = (r.tags || []).some((t: string) => /even_sem|even\b/i.test(t));
            return isEven ? hasEvenTag : !hasEvenTag;
          })
          .map((r: any) => `${(r.code || "").toString().trim().toLowerCase()}-${r.department_id}`)
          .filter(Boolean)
      );

      const prepared = data
        .map((rec) => {
          const rawDept = (rec.department || "").toString().trim();
          const resolvedDeptId = isUuid(rawDept)
            ? rawDept
            : (nameToDeptId.get(rawDept.toLowerCase()) || manualMap.get(rawDept.toLowerCase()) || "");

          const hours = parseInt(rec.hours_per_week) || 3;
          const credits = parseInt(rec.credits) || 3;
          const finalType = inferSubjectType(rec.type, rec.name);

          return {
            code: (rec.code || "").toString().trim().toUpperCase() || null,
            name: (rec.name || "").toString().trim(),
            abbreviation: (rec.abbreviation || "").toString().trim().toUpperCase() || null,
            type: finalType,
            hours_per_week: hours,
            credits: credits,
            department_id: resolvedDeptId,
            year: (rec.year || "").toString().trim() || "II",
            tags: isEven ? ["even_sem"] : null,
          };
        })
        .filter((r) => r.name && r.department_id);

      const invalidCount = data.length - prepared.length;
      const uniqueRecords = prepared.filter(
        (rec) => rec.code ? !existingSubjectKeys.has(`${rec.code.toLowerCase()}-${rec.department_id}`) : true
      );
      const duplicateRecords = prepared.filter((rec) =>
        rec.code ? existingSubjectKeys.has(`${rec.code.toLowerCase()}-${rec.department_id}`) : false
      );

      let insertedCount = 0;
      if (uniqueRecords.length > 0) {
        const { error: insertError } = await (supabase as any)
          .from("subjects")
          .insert(uniqueRecords)
          .select("id");

        if (insertError) {
          toast.error("Insert failed: " + insertError.message);
        } else {
          insertedCount += uniqueRecords.length;
          toast.success(`${uniqueRecords.length} ${isEven ? "Even Semester" : "Odd Semester"} subjects added successfully!`);
        }
      }

      if (duplicateRecords.length > 0) {
        const proceed = window.confirm(
          `${duplicateRecords.length} duplicate subject codes found. Add them anyway?\n\nNote: This may create duplicate subjects in the same department.`
        );
        if (proceed) {
          const { error: dupInsertError } = await supabase
            .from("subjects")
            .insert(duplicateRecords)
            .select("id");
          if (dupInsertError) {
            toast.error(`Failed to add duplicates: ${dupInsertError.message}`);
          } else {
            insertedCount += duplicateRecords.length;
            toast.success(`${duplicateRecords.length} duplicates added.`);
          }
        } else {
          toast.warning(`${duplicateRecords.length} duplicate entries skipped.`);
        }
      }

      if (insertedCount > 0) {
        window.dispatchEvent(new CustomEvent("subjects-import:inserted", { detail: { insertedCount } }));
      }
      if (invalidCount > 0) {
        toast.warning(`${invalidCount} rows skipped due to missing subject names or departments.`);
      }
    } catch (e: any) {
      toast.error("An error occurred during subject import: " + (e.message || e));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Faculty-Subject Mapping CSV upload
  const handleMappingUpload = async (data: MappingRecord[]) => {
    setIsLoading(true);
    try {
      const nameToDeptId = await getDeptNameToIdMap();

      const [facResult, subjResult] = await Promise.all([
        supabase.from("faculty_members").select("id, name, email, department_id"),
        supabase.from("subjects").select("id, name, code, department_id")
      ]);

      if (facResult.error || subjResult.error) {
        toast.error("Failed to load reference data (faculty/subjects)");
        return;
      }

      const facultyList = facResult.data || [];
      const subjectsList = subjResult.data || [];

      const facultyByEmailMap = new Map<string, any>();
      const facultyByNameMap = new Map<string, any>();
      facultyList.forEach((f) => {
        if (f.email) facultyByEmailMap.set(f.email.trim().toLowerCase(), f);
        facultyByNameMap.set(f.name.trim().toLowerCase(), f);
      });

      const subjectByCodeMap = new Map<string, any>();
      const subjectByNameMap = new Map<string, any>();
      subjectsList.forEach((s) => {
        if (s.code) subjectByCodeMap.set(s.code.trim().toUpperCase(), s);
        subjectByNameMap.set(s.name.trim().toLowerCase(), s);
      });

      const preparedMappings: any[] = [];
      const skippedRows: string[] = [];

      data.forEach((rec, index) => {
        const rawDept = (rec.department || "").toString().trim();
        const resolvedDeptId = isUuid(rawDept)
          ? rawDept
          : nameToDeptId.get(rawDept.toLowerCase()) || "";

        if (!resolvedDeptId) {
          skippedRows.push(`Row ${index + 2}: Department "${rawDept}" not found.`);
          return;
        }

        let resolvedFaculty: any = null;
        const rawEmail = (rec.faculty_email || "").toString().trim().toLowerCase();
        if (rawEmail && facultyByEmailMap.has(rawEmail)) {
          resolvedFaculty = facultyByEmailMap.get(rawEmail);
        } else if (rec.faculty_name) {
          const rawName = rec.faculty_name.toString().trim().toLowerCase();
          if (facultyByNameMap.has(rawName)) {
            resolvedFaculty = facultyByNameMap.get(rawName);
          }
        }

        if (!resolvedFaculty) {
          skippedRows.push(`Row ${index + 2}: Faculty "${rec.faculty_email || rec.faculty_name || 'unknown'}" not found.`);
          return;
        }

        let resolvedSubject: any = null;
        const rawCode = (rec.subject_code || "").toString().trim().toUpperCase();
        if (rawCode && subjectByCodeMap.has(rawCode)) {
          resolvedSubject = subjectByCodeMap.get(rawCode);
        } else if (rec.subject_name) {
          const rawSubName = rec.subject_name.toString().trim().toLowerCase();
          if (subjectByNameMap.has(rawSubName)) {
            resolvedSubject = subjectByNameMap.get(rawSubName);
          }
        }

        if (!resolvedSubject) {
          skippedRows.push(`Row ${index + 2}: Subject "${rec.subject_code || rec.subject_name || 'unknown'}" not found.`);
          return;
        }

        preparedMappings.push({
          faculty_id: resolvedFaculty.id,
          subject_id: resolvedSubject.id,
          department_id: resolvedDeptId,
          year: (rec.year || "").toString().trim() || "II",
          section: (rec.section || "A").toString().trim().toUpperCase()
        });
      });

      const { data: existingMappings, error: mappingFetchErr } = await supabase
        .from("faculty_subject_assignments")
        .select("faculty_id, subject_id, year, section");

      if (mappingFetchErr) {
        toast.error("Failed to load existing faculty mappings");
        return;
      }

      const existingMappingKeys = new Set(
        (existingMappings || []).map((m: any) => `${m.faculty_id}-${m.subject_id}-${m.year}-${m.section.toUpperCase()}`)
      );

      const uniqueMappings = preparedMappings.filter((m) => {
        const key = `${m.faculty_id}-${m.subject_id}-${m.year}-${m.section}`;
        return !existingMappingKeys.has(key);
      });

      const duplicateCount = preparedMappings.length - uniqueMappings.length;

      let insertedCount = 0;
      if (uniqueMappings.length > 0) {
        const { error: mappingInsertErr } = await supabase
          .from("faculty_subject_assignments")
          .insert(uniqueMappings)
          .select("id");

        if (mappingInsertErr) {
          toast.error("Mapping import failed: " + mappingInsertErr.message);
        } else {
          insertedCount += uniqueMappings.length;
          toast.success(`${uniqueMappings.length} faculty-subject mappings assigned successfully!`);
        }
      } else if (preparedMappings.length > 0 && duplicateCount === preparedMappings.length) {
        toast.info("All mappings from CSV already exist in the system.");
      }

      if (duplicateCount > 0 && uniqueMappings.length > 0) {
        toast.warning(`${duplicateCount} duplicate mapping assignments were skipped.`);
      }

      if (skippedRows.length > 0) {
        console.warn("Skipped rows summary:", skippedRows);
        toast.error(`${skippedRows.length} rows skipped due to missing references.`);
      }
    } catch (e: any) {
      toast.error("An error occurred during mapping import: " + (e.message || e));
    } finally {
      setIsLoading(false);
    }
  };

  // ────────────────── MAIN FILE HANDLER (EXCEL + CSV) ──────────────────
  const handleFile = async (file: File) => {
    if (!file) return;

    setIsLoading(true);
    setImportSummary(null);

    const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

    if (isExcel) {
      try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });

        // Detect if file is specifically Even Semester
        const isExplicitlyEven =
          /even/i.test(file.name) ||
          workbook.SheetNames.some((s) => /even/i.test(s));

        // If on even_master tab or file is explicitly Even Semester:
        if (activeTab === "even_master" || isExplicitlyEven) {
          if (activeTab !== "even_master") {
            toast.info("Detected Even Semester spreadsheet. Running Even Semester import...");
            setActiveTab("even_master");
          }
          const targetSheetName =
            workbook.SheetNames.find((s) => /even/i.test(s)) ||
            workbook.SheetNames.find((s) => /curriculum|subject/i.test(s)) ||
            workbook.SheetNames[0];
          const sheet = workbook.Sheets[targetSheetName];
          const rows = parseSheetWithHeaderDetection(sheet);
          await handleEvenRowsUpload(rows);
        } else if (activeTab === "odd_master") {
          // Look for 'Subject-Faculty Mapping' or first sheet
          const targetSheetName =
            workbook.SheetNames.find((s) => /mapping|odd|curriculum/i.test(s)) ||
            workbook.SheetNames[0];
          const sheet = workbook.Sheets[targetSheetName];
          const rows = parseSheetWithHeaderDetection(sheet);
          await handleUnifiedRowsUpload(rows);
        } else {
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = parseSheetWithHeaderDetection(sheet);

          // Auto-detect Even Semester vs Odd Semester master file
          const hasEvenIndicator =
            /even/i.test(file.name) ||
            workbook.SheetNames.some((s) => /even/i.test(s)) ||
            rows.some((r) => /sem\s*(iv|vi|viii|4|6|8)|even/i.test(r.semester || r.Semester || r.sem || "") || /even/i.test(r.type || ""));

          const hasCodeOrSub = rows.some((r) => r.code || r["Subject Code"] || r.subject_code);
          const hasFac = rows.some((r) => r.faculty_name || r["Faculty Name"] || r.faculty_email || r["Faculty Email"]);

          if (hasEvenIndicator && (hasCodeOrSub || hasFac)) {
            toast.info("Detected Even Semester master spreadsheet. Running Even Semester import...");
            setActiveTab("even_master");
            await handleEvenRowsUpload(rows);
          } else {
            toast.info("Running All-in-One Odd Semester import...");
            setActiveTab("odd_master");
            await handleUnifiedRowsUpload(rows);
          }
        }
      } catch (err: any) {
        toast.error("Error reading Excel spreadsheet: " + err.message);
        setIsLoading(false);
      }
    } else {
      // CSV handler
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        error: (err) => {
          toast.error("Error parsing CSV: " + err.message);
          setIsLoading(false);
        },
        complete: async (results) => {
          const rows = results.data as any[];
          if (!rows || rows.length === 0) {
            toast.error("CSV file is empty.");
            setIsLoading(false);
            return;
          }

          const hasEvenIndicator =
            /even/i.test(file.name) ||
            rows.some((r) => /sem\s*(iv|vi|viii|4|6|8)|even/i.test(r.semester || r.Semester || r.sem || "") || /even/i.test(r.type || ""));

          const hasCodeOrSub = rows.some((r) => r.code || r["Subject Code"] || r.subject_code);
          const hasFac = rows.some((r) => r.faculty_name || r["Faculty Name"] || r.faculty_email || r["Faculty Email"] || r.staff || r["staff incharge"]);

          if (activeTab === "even_master" || (hasEvenIndicator && (hasCodeOrSub || hasFac))) {
            if (activeTab !== "even_master") setActiveTab("even_master");
            await handleEvenRowsUpload(rows);
          } else {
            if (activeTab !== "odd_master") setActiveTab("odd_master");
            await handleUnifiedRowsUpload(rows);
          }
        }
      });
    }
  };

  // Drag and drop events
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = () => {
    setDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const triggerUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.xlsx,.xls";
    input.onchange = (e: any) => {
      if (e.target.files && e.target.files[0]) {
        handleFile(e.target.files[0]);
      }
    };
    input.click();
  };

  return (
    <div className="w-full space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1 border-b border-border/60 pb-4">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-500 text-xs font-bold border border-indigo-500/20">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Semester Curriculum & Data Import</span>
          </div>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground mt-1">
          Course & Faculty Data Bulk Import
        </h1>
        <p className="text-muted-foreground text-sm">
          Import your odd or even semester curriculum, faculty, and section assignments using single all-in-one Excel (.xlsx) templates or individual CSVs.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); setImportSummary(null); }} className="w-full space-y-6">
        <TabsList className="grid grid-cols-2 p-1.5 bg-muted/80 backdrop-blur-sm border border-border/60 rounded-2xl w-full max-w-md mx-auto shadow-sm">
          <TabsTrigger value="odd_master" className="rounded-xl font-bold text-xs sm:text-sm py-2.5 flex items-center justify-center gap-2 data-[state=checked]:bg-indigo-600 data-[state=checked]:text-white data-[state=checked]:shadow-md transition-all">
            <Sparkles className="h-4 w-4" />
            <span>All-in-One (Odd)</span>
          </TabsTrigger>
          <TabsTrigger value="even_master" className="rounded-xl font-bold text-xs sm:text-sm py-2.5 flex items-center justify-center gap-2 data-[state=checked]:bg-emerald-600 data-[state=checked]:text-white data-[state=checked]:shadow-md transition-all">
            <Layers className="h-4 w-4" />
            <span>All-in-One (Even)</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 0: Unified Master Import for Odd Semester */}
        <TabsContent value="odd_master">
          <Card className="border border-indigo-500/30 shadow-md rounded-2xl bg-card overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent border-b border-border/40 pb-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg font-extrabold text-foreground flex items-center gap-2">
                      <FileSpreadsheet className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                      Odd Semester Master Import (All-in-One)
                    </CardTitle>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30">
                      Recommended
                    </span>
                  </div>
                  <CardDescription className="text-xs text-muted-foreground mt-1">
                    One single Excel or CSV template that automatically imports Faculty, Subjects, and Section Allocations together.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    onClick={() => downloadUnifiedTemplate("xlsx")}
                    className="flex-1 sm:flex-initial flex items-center gap-1.5 h-8 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Excel (.xlsx)
                  </Button>
                  <Button
                    onClick={() => downloadUnifiedTemplate("csv")}
                    variant="outline"
                    size="sm"
                    className="flex-1 sm:flex-initial flex items-center gap-1.5 h-8 text-xs font-bold rounded-lg border-input hover:bg-muted"
                  >
                    <Download className="h-3.5 w-3.5" />
                    CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {/* Column Layout Breakdown */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-4 rounded-xl border border-border/50 bg-muted/20 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs text-indigo-600 dark:text-indigo-400">
                    <BookOpen className="h-4 w-4" />
                    <span>Curriculum & Subject Columns</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Registers courses in the department curriculum for Odd Semester (Sem III, V, VII).
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Department</code>
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Year</code>
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Semester</code>
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Section</code>
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Subject Code</code>
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Subject Name</code>
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Abbreviation</code>
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Type</code>
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Hours Per Week</code>
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Credits</code>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-border/50 bg-muted/20 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs text-purple-600 dark:text-purple-400">
                    <Users className="h-4 w-4" />
                    <span>Faculty & Section Assignment Columns</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Matches existing faculty or auto-creates them and links them to the section.
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Faculty Name</code>
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Faculty Email</code>
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Designation</code>
                  </div>
                  <p className="text-[10px] text-muted-foreground pt-1 italic">
                    * If a subject is not yet assigned to any faculty, leave Faculty Name as <code>(Not Assigned)</code> or blank. It will still be added to the curriculum.
                  </p>
                </div>
              </div>

              {/* Import Summary Results Card for Odd Sem */}
              {importSummary && importSummary.semesterType !== "even" && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-sm text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Odd Semester Import Completed ({importSummary.totalRows} rows processed)</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setImportSummary(null)}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-2.5 rounded-lg bg-background/60 border border-border/50 text-xs">
                      <span className="text-muted-foreground block text-[10px] font-bold uppercase">Faculty</span>
                      <span className="font-extrabold text-foreground text-base">+{importSummary.facultyAdded}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">
                        ({importSummary.facultyExisting} matched{importSummary.facultyUpdated ? `, ${importSummary.facultyUpdated} updated` : ""})
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-background/60 border border-border/50 text-xs">
                      <span className="text-muted-foreground block text-[10px] font-bold uppercase">Subjects</span>
                      <span className="font-extrabold text-foreground text-base">+{importSummary.subjectsAdded}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">
                        ({importSummary.subjectsExisting} matched{importSummary.subjectsUpdated ? `, ${importSummary.subjectsUpdated} updated` : ""})
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-background/60 border border-border/50 text-xs">
                      <span className="text-muted-foreground block text-[10px] font-bold uppercase">Section Mappings</span>
                      <span className="font-extrabold text-foreground text-base">+{importSummary.mappingsAdded}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">({importSummary.mappingsExisting} existing)</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-background/60 border border-border/50 text-xs">
                      <span className="text-muted-foreground block text-[10px] font-bold uppercase">Unassigned In Catalog</span>
                      <span className="font-extrabold text-foreground text-base">{importSummary.unassignedRows}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">subjects</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 1: Unified Master Import for Even Semester */}
        <TabsContent value="even_master">
          <Card className="border border-emerald-500/30 shadow-md rounded-2xl bg-card overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border-b border-border/40 pb-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg font-extrabold text-foreground flex items-center gap-2">
                      <FileSpreadsheet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      Even Semester Master Import (Subjects & Assignments)
                    </CardTitle>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                      Reuses Odd Sem Faculty
                    </span>
                  </div>
                  <CardDescription className="text-xs text-muted-foreground mt-1">
                    One single Excel or CSV template for Even Semester. Automatically creates even subjects and assigns them to existing faculty fetched from your Odd Semester database.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    onClick={() => downloadEvenTemplate("xlsx")}
                    className="flex-1 sm:flex-initial flex items-center gap-1.5 h-8 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Excel (.xlsx)
                  </Button>
                  <Button
                    onClick={() => downloadEvenTemplate("csv")}
                    variant="outline"
                    size="sm"
                    className="flex-1 sm:flex-initial flex items-center gap-1.5 h-8 text-xs font-bold rounded-lg border-input hover:bg-muted"
                  >
                    <Download className="h-3.5 w-3.5" />
                    CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {/* Column Layout Breakdown */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-4 rounded-xl border border-border/50 bg-muted/20 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs text-emerald-600 dark:text-emerald-400">
                    <BookOpen className="h-4 w-4" />
                    <span>Curriculum & Even Subject Columns</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Registers Even Semester curriculum subjects (Sem IV, VI, VIII) tagged with <code>even_sem</code>.
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Department</code>
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Year</code>
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Semester</code>
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Section</code>
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Subject Code</code>
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Subject Name</code>
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Abbreviation</code>
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Type</code>
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Hours Per Week</code>
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Credits</code>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-border/50 bg-muted/20 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs text-teal-600 dark:text-teal-400">
                    <Users className="h-4 w-4" />
                    <span>Faculty Assignment Columns (Reusing Odd Sem)</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Matches existing faculty from Odd Semester by Name or Email and links them directly to the section.
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Faculty Name</code>
                    <code className="px-1.5 py-0.5 rounded bg-background border border-border text-[11px] font-mono font-bold">Faculty Email</code>
                  </div>
                  <p className="text-[10px] text-muted-foreground pt-1 italic">
                    * The Excel download contains an <strong>"Odd Sem Faculty Reference"</strong> sheet listing all faculty already in the system. If unassigned, enter <code>(Not Assigned)</code> or leave blank.
                  </p>
                </div>
              </div>

              {/* Import Summary Results Card for Even Sem */}
              {importSummary && importSummary.semesterType === "even" && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-sm text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Even Semester Import Completed ({importSummary.totalRows} rows processed)</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setImportSummary(null)}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-2.5 rounded-lg bg-background/60 border border-border/50 text-xs">
                      <span className="text-muted-foreground block text-[10px] font-bold uppercase">Faculty</span>
                      <span className="font-extrabold text-foreground text-base">+{importSummary.facultyAdded}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">
                        ({importSummary.facultyExisting} matched{importSummary.facultyUpdated ? `, ${importSummary.facultyUpdated} updated` : ""})
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-background/60 border border-border/50 text-xs">
                      <span className="text-muted-foreground block text-[10px] font-bold uppercase">Even Subjects</span>
                      <span className="font-extrabold text-foreground text-base">+{importSummary.subjectsAdded}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">
                        ({importSummary.subjectsExisting} existing{importSummary.subjectsUpdated ? `, ${importSummary.subjectsUpdated} updated` : ""})
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-background/60 border border-border/50 text-xs">
                      <span className="text-muted-foreground block text-[10px] font-bold uppercase">Section Mappings</span>
                      <span className="font-extrabold text-foreground text-base">+{importSummary.mappingsAdded}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">({importSummary.mappingsExisting} existing)</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-background/60 border border-border/50 text-xs">
                      <span className="text-muted-foreground block text-[10px] font-bold uppercase">Unassigned In Catalog</span>
                      <span className="font-extrabold text-foreground text-base">{importSummary.unassignedRows}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">subjects</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={triggerUpload}
        className={`
          flex flex-col items-center justify-center border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer transition-all duration-300 min-h-[220px] bg-card
          ${dragOver 
            ? "border-indigo-500 bg-indigo-500/[0.08] scale-[0.98] shadow-lg shadow-indigo-500/15 ring-2 ring-indigo-500/20" 
            : "border-indigo-200/60 dark:border-border hover:border-indigo-500/60 hover:bg-indigo-500/[0.03] hover:shadow-md hover:shadow-indigo-500/5"
          }
        `}
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-10 w-10 text-indigo-600 dark:text-indigo-400 animate-spin" />
            <p className="font-bold text-foreground">Processing spreadsheet...</p>
            <p className="text-xs text-muted-foreground">Validating and inserting courses, faculty, and assignments.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 dark:bg-muted border border-indigo-100 dark:border-border/80 rounded-2xl shadow-sm text-indigo-600 dark:text-muted-foreground">
              <Upload className="h-8 w-8 text-indigo-600 dark:text-muted-foreground" />
            </div>
            <p className="font-bold text-foreground">
              Drag & drop your Excel (<code>.xlsx</code>) or CSV file here, or{" "}
              <span className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 underline underline-offset-4 font-extrabold">
                browse
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Supports <code>.xlsx</code>, <code>.xls</code>, and <code>.csv</code>. Maximum size 10MB.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
