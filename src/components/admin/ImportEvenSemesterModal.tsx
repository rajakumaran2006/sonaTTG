import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useDarkMode } from "@/context/DarkModeContext";
import {
  Upload,
  Download,
  Sparkles,
  BookOpen,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Filter,
  Layers,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  addSubjectsBulk,
  deleteEvenSemesterSubjects,
  getDepartments,
  getDepartmentByName,
  DbDepartment,
} from "@/lib/supabaseService";
import type { Subject } from "@/store/timetableStore";

export interface ImportEvenSemesterModalProps {
  open: boolean;
  onClose: () => void;
  departmentName?: string;
  onSuccess?: () => void;
}

export interface ParsedSubject {
  code: string;
  name: string;
  type: "theory" | "lab" | "elective" | "open elective";
  hoursPerWeek: number;
  credits: number;
  year: "II" | "III" | "IV";
  department: string;
  abbreviation?: string;
}

// Standard even semester starter curriculum for all major departments
export const DEFAULT_EVEN_SUBJECTS: Record<string, ParsedSubject[]> = {
  AIDS: [
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
    // Year IV (Semester VIII) — Static Project Work
    { code: "U23ADS801", name: "Project Work", type: "theory", hoursPerWeek: 37, credits: 10, year: "IV", department: "AIDS", abbreviation: "PROJECT" },
  ],
  IT: [
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
    // Year IV (Semester VIII) — Static Project Work
    { code: "U23IT801", name: "Project Work", type: "theory", hoursPerWeek: 37, credits: 10, year: "IV", department: "IT", abbreviation: "PROJECT" },
  ],
  ECE: [
    // Year II (Semester IV)
    { code: "U23EC401", name: "Analog Circuits", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "ECE", abbreviation: "AC" },
    { code: "U23EC402", name: "Microcontrollers and Embedded Systems", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "ECE", abbreviation: "MCES" },
    { code: "U23EC403", name: "Signals and Systems", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "ECE", abbreviation: "SS" },
    { code: "U23EC404", name: "Electromagnetic Fields", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "ECE", abbreviation: "EMF" },
    { code: "U23EC405", name: "Analog Circuits Laboratory", type: "lab", hoursPerWeek: 4, credits: 2, year: "II", department: "ECE", abbreviation: "AC LAB" },
    { code: "U23EC406", name: "Microcontrollers Laboratory", type: "lab", hoursPerWeek: 3, credits: 2, year: "II", department: "ECE", abbreviation: "MC LAB" },
    { code: "U23GE401", name: "Soft Skills and Aptitude - II", type: "theory", hoursPerWeek: 4, credits: 2, year: "II", department: "ECE", abbreviation: "SSA-II" },
    { code: "U23GE402", name: "Universal Human Values", type: "theory", hoursPerWeek: 3, credits: 3, year: "II", department: "ECE", abbreviation: "UHV" },
    { code: "U23EC407", name: "Mini Project", type: "lab", hoursPerWeek: 2, credits: 2, year: "II", department: "ECE", abbreviation: "MP" },
    // Year III (Semester VI) — OE Included (5 hrs)
    { code: "U23OE601", name: "Open Elective: VLSI Design Principles", type: "open elective", hoursPerWeek: 5, credits: 3, year: "III", department: "ECE", abbreviation: "OE" },
    { code: "U23EC601", name: "Digital Communication Techniques", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "ECE", abbreviation: "DCT" },
    { code: "U23EC602", name: "VLSI Design & Technology", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "ECE", abbreviation: "VLSI" },
    { code: "U23EC603", name: "Antennas and Microwave Engineering", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "ECE", abbreviation: "AME" },
    { code: "U23EC604", name: "Elective - Wireless Sensor Networks", type: "elective", hoursPerWeek: 4, credits: 3, year: "III", department: "ECE", abbreviation: "WSN" },
    { code: "U23EC605", name: "Digital Communication Laboratory", type: "lab", hoursPerWeek: 4, credits: 2, year: "III", department: "ECE", abbreviation: "DC LAB" },
    { code: "U23EC606", name: "VLSI Design Laboratory", type: "lab", hoursPerWeek: 3, credits: 2, year: "III", department: "ECE", abbreviation: "VLSI LAB" },
    { code: "U23GE601", name: "Soft Skills and Aptitude - III", type: "theory", hoursPerWeek: 4, credits: 2, year: "III", department: "ECE", abbreviation: "SSA-III" },
    { code: "U23EC607", name: "Mini Project", type: "lab", hoursPerWeek: 2, credits: 2, year: "III", department: "ECE", abbreviation: "MP" },
    // Year IV (Semester VIII) — Static Project Work
    { code: "U23EC801", name: "Project Work", type: "theory", hoursPerWeek: 37, credits: 10, year: "IV", department: "ECE", abbreviation: "PROJECT" },
  ],
  mech: [
    // Year II (Semester IV)
    { code: "U23ME401", name: "Fluid Mechanics and Machinery", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "mech", abbreviation: "FMM" },
    { code: "U23ME402", name: "Manufacturing Technology - II", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "mech", abbreviation: "MT-II" },
    { code: "U23ME403", name: "Kinematics of Machinery", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "mech", abbreviation: "KOM" },
    { code: "U23ME404", name: "Thermal Engineering", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "mech", abbreviation: "TE" },
    { code: "U23ME405", name: "Fluid Mechanics Laboratory", type: "lab", hoursPerWeek: 4, credits: 2, year: "II", department: "mech", abbreviation: "FM LAB" },
    { code: "U23ME406", name: "Manufacturing Technology Laboratory", type: "lab", hoursPerWeek: 3, credits: 2, year: "II", department: "mech", abbreviation: "MT LAB" },
    { code: "U23GE401", name: "Soft Skills and Aptitude - II", type: "theory", hoursPerWeek: 4, credits: 2, year: "II", department: "mech", abbreviation: "SSA-II" },
    { code: "U23GE402", name: "Universal Human Values", type: "theory", hoursPerWeek: 3, credits: 3, year: "II", department: "mech", abbreviation: "UHV" },
    { code: "U23ME407", name: "Mini Project", type: "lab", hoursPerWeek: 2, credits: 2, year: "II", department: "mech", abbreviation: "MP" },
    // Year III (Semester VI) — OE Included (5 hrs)
    { code: "U23OE601", name: "Open Elective: Renewable Energy Sources", type: "open elective", hoursPerWeek: 5, credits: 3, year: "III", department: "mech", abbreviation: "OE" },
    { code: "U23ME601", name: "Design of Transmission Systems", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "mech", abbreviation: "DTS" },
    { code: "U23ME602", name: "Heat and Mass Transfer", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "mech", abbreviation: "HMT" },
    { code: "U23ME603", name: "Finite Element Analysis", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "mech", abbreviation: "FEA" },
    { code: "U23ME604", name: "Elective - Automobile Engineering", type: "elective", hoursPerWeek: 4, credits: 3, year: "III", department: "mech", abbreviation: "AE" },
    { code: "U23ME605", name: "Heat Transfer Laboratory", type: "lab", hoursPerWeek: 4, credits: 2, year: "III", department: "mech", abbreviation: "HT LAB" },
    { code: "U23ME606", name: "CAD/CAM Laboratory", type: "lab", hoursPerWeek: 3, credits: 2, year: "III", department: "mech", abbreviation: "CAD LAB" },
    { code: "U23GE601", name: "Soft Skills and Aptitude - III", type: "theory", hoursPerWeek: 4, credits: 2, year: "III", department: "mech", abbreviation: "SSA-III" },
    { code: "U23ME607", name: "Mini Project", type: "lab", hoursPerWeek: 2, credits: 2, year: "III", department: "mech", abbreviation: "MP" },
    // Year IV (Semester VIII) — Static Project Work
    { code: "U23ME801", name: "Project Work", type: "theory", hoursPerWeek: 37, credits: 10, year: "IV", department: "mech", abbreviation: "PROJECT" },
  ],
};

export const ImportEvenSemesterModal: React.FC<ImportEvenSemesterModalProps> = ({
  open,
  onClose,
  departmentName,
  onSuccess,
}) => {
  const { isDark } = useDarkMode();
  const [dbDepartments, setDbDepartments] = useState<DbDepartment[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>("ALL");
  const [previewFilterDept, setPreviewFilterDept] = useState<string>("ALL");
  const [subjectsList, setSubjectsList] = useState<ParsedSubject[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Fetch departments from database on mount
  useEffect(() => {
    getDepartments()
      .then((depts) => {
        if (depts && depts.length > 0) {
          setDbDepartments(depts);
        }
      })
      .catch((err) => {
        console.error("Failed to load departments:", err);
      });
  }, []);

  // Update selectedDept if departmentName prop changes
  useEffect(() => {
    if (departmentName && departmentName !== "ALL") {
      setSelectedDept(departmentName);
    } else {
      setSelectedDept("ALL");
    }
  }, [departmentName]);

  // Dynamic department options list
  const availableDepartmentNames = useMemo(() => {
    const fromDb = dbDepartments.map((d) => d.name);
    const defaults = Object.keys(DEFAULT_EVEN_SUBJECTS);
    const combined = Array.from(new Set([...fromDb, ...defaults]));
    return combined;
  }, [dbDepartments]);

  // Helper to resolve department ID flexibly
  const resolveDepartmentId = (name: string): string | null => {
    const clean = name.trim().toLowerCase();
    // 1. Direct match
    const direct = dbDepartments.find((d) => d.name.trim().toLowerCase() === clean);
    if (direct) return direct.id;

    // 2. Common aliases
    if (clean === "it" || clean.includes("information tech")) {
      const match = dbDepartments.find((d) => /^(it|information\s*technology)$/i.test(d.name.trim()));
      if (match) return match.id;
    }
    if (clean === "aids" || clean.includes("ai & ds") || clean.includes("artificial intelligence")) {
      const match = dbDepartments.find((d) => /^(aids|ai\s*&\s*ds|ai\s*and\s*ds)$/i.test(d.name.trim()));
      if (match) return match.id;
    }
    if (clean === "ece" || clean.includes("electronics")) {
      const match = dbDepartments.find((d) => /^(ece|electronics)$/i.test(d.name.trim()));
      if (match) return match.id;
    }
    if (clean === "mech" || clean.includes("mechanical")) {
      const match = dbDepartments.find((d) => /^(mech|mechanical)$/i.test(d.name.trim()));
      if (match) return match.id;
    }

    // 3. Substring match
    const partial = dbDepartments.find(
      (d) => d.name.toLowerCase().includes(clean) || clean.includes(d.name.toLowerCase())
    );
    if (partial) return partial.id;

    return null;
  };

  // Download Bulk Template (Excel or CSV)
  const handleDownloadTemplate = (format: "xlsx" | "csv" = "xlsx") => {
    const isBulk = selectedDept === "ALL";
    let templateRows: any[] = [];

    if (isBulk) {
      // Generate sample rows across all departments covering Years II, III, and IV
      templateRows = [
        // AIDS
        { "Department": "AIDS", "Year": "II", "Subject Code": "U23ADS401", "Subject Name": "Design and Analysis of Algorithms", "Abbreviation": "DAA", "Type": "theory", "Hours Per Week": 4, "Credits": 3 },
        { "Department": "AIDS", "Year": "II", "Subject Code": "U23ADS405", "Subject Name": "Algorithms Laboratory", "Abbreviation": "DAA LAB", "Type": "lab", "Hours Per Week": 4, "Credits": 2 },
        { "Department": "AIDS", "Year": "III", "Subject Code": "U23OE601", "Subject Name": "Open Elective: Smart Technologies and Systems", "Abbreviation": "OE", "Type": "open elective", "Hours Per Week": 5, "Credits": 3 },
        { "Department": "AIDS", "Year": "IV", "Subject Code": "U23ADS801", "Subject Name": "Project Work", "Abbreviation": "PROJECT", "Type": "theory", "Hours Per Week": 37, "Credits": 10 },
        // IT
        { "Department": "IT", "Year": "II", "Subject Code": "U23IT401", "Subject Name": "Design and Analysis of Algorithms", "Abbreviation": "DAA", "Type": "theory", "Hours Per Week": 4, "Credits": 3 },
        { "Department": "IT", "Year": "II", "Subject Code": "U23IT405", "Subject Name": "Algorithms Laboratory", "Abbreviation": "DAA LAB", "Type": "lab", "Hours Per Week": 4, "Credits": 2 },
        { "Department": "IT", "Year": "III", "Subject Code": "U23OE601", "Subject Name": "Open Elective: Web Technologies & Applications", "Abbreviation": "OE", "Type": "open elective", "Hours Per Week": 5, "Credits": 3 },
        { "Department": "IT", "Year": "IV", "Subject Code": "U23IT801", "Subject Name": "Project Work", "Abbreviation": "PROJECT", "Type": "theory", "Hours Per Week": 37, "Credits": 10 },
        // ECE
        { "Department": "ECE", "Year": "II", "Subject Code": "U23EC401", "Subject Name": "Analog Circuits", "Abbreviation": "AC", "Type": "theory", "Hours Per Week": 4, "Credits": 3 },
        { "Department": "ECE", "Year": "III", "Subject Code": "U23OE601", "Subject Name": "Open Elective: VLSI Design Principles", "Abbreviation": "OE", "Type": "open elective", "Hours Per Week": 5, "Credits": 3 },
        { "Department": "ECE", "Year": "IV", "Subject Code": "U23EC801", "Subject Name": "Project Work", "Abbreviation": "PROJECT", "Type": "theory", "Hours Per Week": 37, "Credits": 10 },
        // MECH
        { "Department": "mech", "Year": "II", "Subject Code": "U23ME401", "Subject Name": "Fluid Mechanics and Machinery", "Abbreviation": "FMM", "Type": "theory", "Hours Per Week": 4, "Credits": 3 },
        { "Department": "mech", "Year": "III", "Subject Code": "U23OE601", "Subject Name": "Open Elective: Renewable Energy Sources", "Abbreviation": "OE", "Type": "open elective", "Hours Per Week": 5, "Credits": 3 },
        { "Department": "mech", "Year": "IV", "Subject Code": "U23ME801", "Subject Name": "Project Work", "Abbreviation": "PROJECT", "Type": "theory", "Hours Per Week": 37, "Credits": 10 },
      ];
    } else {
      const deptSubjects = DEFAULT_EVEN_SUBJECTS[selectedDept] || DEFAULT_EVEN_SUBJECTS["AIDS"];
      templateRows = deptSubjects.map((s) => ({
        "Department": s.department,
        "Year": s.year,
        "Subject Code": s.code,
        "Subject Name": s.name,
        "Abbreviation": s.abbreviation || "",
        "Type": s.type,
        "Hours Per Week": s.hoursPerWeek,
        "Credits": s.credits,
      }));
    }

    const filename = isBulk
      ? `Even_Semester_Bulk_Subjects_Template.${format}`
      : `Even_Semester_${selectedDept}_Subjects_Template.${format}`;

    if (format === "csv") {
      const headers = "Department,Year,Subject Code,Subject Name,Abbreviation,Type,Hours Per Week,Credits\n";
      const rows = templateRows
        .map(
          (r) =>
            `"${r["Department"]}","${r["Year"]}","${r["Subject Code"]}","${r["Subject Name"]}","${r["Abbreviation"]}","${r["Type"]}",${r["Hours Per Week"]},${r["Credits"]}`
        )
        .join("\n");
      const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("CSV bulk template downloaded successfully!");
    } else {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(templateRows);
      XLSX.utils.book_append_sheet(wb, ws, "Even Semester Curriculum");
      XLSX.writeFile(wb, filename);
      toast.success("Excel bulk template downloaded successfully!");
    }
  };

  // Process uploaded Excel or CSV file
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

        const parsed: ParsedSubject[] = json
          .map((row: any) => {
            const code = String(
              row["Subject Code"] || row["code"] || row["Code"] || row["subject_code"] || ""
            ).trim();
            const name = String(
              row["Subject Name"] || row["name"] || row["Name"] || row["subject_name"] || ""
            ).trim();
            const rawType = String(row["Type"] || row["type"] || "theory").toLowerCase().trim();
            let type: "theory" | "lab" | "elective" | "open elective" = "theory";
            if (rawType.includes("lab") || rawType.includes("practic")) type = "lab";
            else if (rawType.includes("open") || rawType.includes("oe")) type = "open elective";
            else if (rawType.includes("elect")) type = "elective";

            const hours = Number(
              row["Hours Per Week"] || row["hours_per_week"] || row["Hours"] || row["hours"] || 4
            );
            const credits = Number(row["Credits"] || row["credits"] || 3);
            const rawYear = String(row["Year"] || row["year"] || "II").toUpperCase().trim();
            const year: "II" | "III" | "IV" =
              rawYear.includes("IV") || rawYear === "4"
                ? "IV"
                : rawYear.includes("III") || rawYear === "3"
                ? "III"
                : "II";

            let dept = String(
              row["Department"] || row["department"] || row["dept"] || row["Dept"] || ""
            ).trim();

            if (!dept) {
              if (selectedDept !== "ALL") {
                dept = selectedDept;
              } else if (code.includes("ADS")) {
                dept = "AIDS";
              } else if (code.includes("IT")) {
                dept = "IT";
              } else if (code.includes("EC")) {
                dept = "ECE";
              } else if (code.includes("ME")) {
                dept = "mech";
              } else {
                dept = "AIDS";
              }
            }

            const abbreviation = String(
              row["Abbreviation"] || row["abbreviation"] || row["Abbr"] || row["abbr"] || ""
            ).trim();

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
          })
          .filter((s) => s.name.length > 0);

        if (parsed.length === 0) {
          toast.error("No valid subjects found. Please verify column headers.");
          return;
        }

        setSubjectsList(parsed);
        const distinctDepts = Array.from(new Set(parsed.map((s) => s.department)));
        toast.success(
          `Parsed ${parsed.length} Even Semester subjects across ${distinctDepts.length} department(s)!`
        );
      } catch (err: any) {
        console.error("Error parsing file:", err);
        toast.error("Failed to parse file. Please verify columns match the template.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Pre-fill curriculum (Bulk for all departments, or for specific department)
  const handleLoadDefaults = () => {
    if (selectedDept === "ALL") {
      const allSubjects: ParsedSubject[] = [];
      const depts = ["AIDS", "IT", "ECE", "mech"];
      depts.forEach((dept) => {
        if (DEFAULT_EVEN_SUBJECTS[dept]) {
          allSubjects.push(...DEFAULT_EVEN_SUBJECTS[dept]);
        }
      });
      setSubjectsList(allSubjects);
      toast.success(
        `Loaded standard Even Semester curriculum for all 4 departments (${allSubjects.length} subjects total across Years II, III & IV)!`
      );
    } else {
      const defaults = DEFAULT_EVEN_SUBJECTS[selectedDept] || DEFAULT_EVEN_SUBJECTS["AIDS"];
      setSubjectsList(defaults);
      toast.success(
        `Loaded standard Even Semester curriculum for ${selectedDept} (${defaults.length} subjects across Years II, III & IV).`
      );
    }
  };

  // Save to database in bulk across all parsed departments
  const handleSaveToDatabase = async () => {
    if (subjectsList.length === 0) {
      toast.error("Please add or upload subjects first.");
      return;
    }

    setIsSaving(true);
    try {
      // Group subjects by department
      const deptGroups = new Map<string, ParsedSubject[]>();
      subjectsList.forEach((s) => {
        const d = s.department.trim();
        if (!deptGroups.has(d)) deptGroups.set(d, []);
        deptGroups.get(d)!.push(s);
      });

      let totalSaved = 0;
      const savedDepts: string[] = [];

      for (const [deptName, deptsSubjects] of Array.from(deptGroups.entries())) {
        let deptId = resolveDepartmentId(deptName);

        if (!deptId) {
          // Try fetching or ensuring department
          const fetched = await getDepartmentByName(deptName);
          if (fetched) {
            deptId = fetched.id;
          } else {
            console.warn(`Could not resolve department ID for "${deptName}", skipping.`);
            continue;
          }
        }

        // Delete existing even semester subjects for this department to avoid duplicate stacking
        await deleteEvenSemesterSubjects(deptId);

        // Bulk insert subjects with tag 'even_sem' and semesterType: 'even'
        const rows = deptsSubjects.map((s) => ({
          name: s.name,
          hoursPerWeek: s.hoursPerWeek,
          type: s.type,
          tags: ["even_sem"],
          code: s.code || undefined,
          abbreviation: s.abbreviation || undefined,
          departmentId: deptId!,
          year: s.year,
          credits: s.credits,
          semesterType: "even" as const,
        }));

        await addSubjectsBulk(rows);
        totalSaved += rows.length;
        savedDepts.push(deptName);
      }

      if (totalSaved === 0) {
        throw new Error("No departments could be matched to system records.");
      }

      toast.success(
        `Successfully saved ${totalSaved} Even Semester subjects across ${savedDepts.length} department(s) in bulk!`,
        {
          description: `Departments: ${savedDepts.join(", ")}. Saved subjects will automatically load whenever Even Semester is selected.`,
          duration: 6000,
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

  // Filtered subjects for preview
  const displayedSubjects = useMemo(() => {
    if (previewFilterDept === "ALL") return subjectsList;
    return subjectsList.filter(
      (s) => s.department.toLowerCase() === previewFilterDept.toLowerCase()
    );
  }, [subjectsList, previewFilterDept]);

  // Distinct departments in current subject list
  const distinctLoadedDepts = useMemo(() => {
    return Array.from(new Set(subjectsList.map((s) => s.department)));
  }, [subjectsList]);

  const yearStats = useMemo(() => {
    return {
      II: subjectsList.filter((s) => s.year === "II").length,
      III: subjectsList.filter((s) => s.year === "III").length,
      IV: subjectsList.filter((s) => s.year === "IV").length,
    };
  }, [subjectsList]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className={`max-w-3xl max-h-[90vh] flex flex-col border rounded-2xl shadow-2xl transition-colors duration-300 ${
          isDark ? "bg-[#0e0e1a] border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        <DialogHeader className="shrink-0 pb-1">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isDark ? "bg-emerald-500/15 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}>
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                Import Even Semester Subjects
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs">
                  Semesters IV, VI &amp; VIII (Years II, III, IV)
                </Badge>
                <Badge variant="secondary" className="text-[10px] uppercase font-bold tracking-wider">
                  Bulk Importer
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Bulk import or configure Even Semester curriculum for Years II, III &amp; IV across all departments. Saved subjects will be reused automatically whenever Even Semester is selected.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1 flex-1 overflow-y-auto pr-1">
          {/* Department Choice & Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Layers className="h-3.5 w-3.5" /> Scope:
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedDept("ALL")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                    selectedDept === "ALL"
                      ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                      : isDark
                      ? "bg-white/5 border-white/10 text-slate-300 hover:border-white/20"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  All Departments (Bulk)
                </button>
                {availableDepartmentNames.map((dept) => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => setSelectedDept(dept)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      selectedDept === dept
                        ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                        : isDark
                        ? "bg-white/5 border-white/10 text-slate-300 hover:border-white/20"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {dept}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/60">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownloadTemplate("xlsx")}
                  className="h-7 px-2 text-[11px] gap-1 rounded-md font-semibold text-foreground hover:bg-background"
                  title="Download Excel Template"
                >
                  <Download className="h-3 w-3" />
                  Excel
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownloadTemplate("csv")}
                  className="h-7 px-2 text-[11px] gap-1 rounded-md font-semibold text-foreground hover:bg-background"
                  title="Download CSV Template"
                >
                  <Download className="h-3 w-3" />
                  CSV
                </Button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadDefaults}
                className="h-8 text-xs gap-1.5 rounded-lg bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 font-semibold"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {selectedDept === "ALL" ? "Pre-fill All Depts" : `Pre-fill ${selectedDept}`}
              </Button>
            </div>
          </div>

          {/* Drag & Drop Upload Area */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
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
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Drag &amp; drop your Bulk Even Semester file (<span className="font-mono text-emerald-600 dark:text-emerald-400">.xlsx</span> or <span className="font-mono text-emerald-600 dark:text-emerald-400">.csv</span>)
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 mb-2.5">
              Include columns: <code className="font-mono font-bold">Department</code>, <code className="font-mono font-bold">Year (II, III, IV)</code>, <code className="font-mono font-bold">Subject Code</code>, <code className="font-mono font-bold">Subject Name</code>, <code className="font-mono font-bold">Type</code>, and <code className="font-mono font-bold">Hours Per Week</code>.
            </p>
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shadow-sm">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Browse Spreadsheet / CSV
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
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    Ready to Import: {subjectsList.length} Subjects
                  </span>
                  <span className="text-muted-foreground text-[11px]">
                    ({distinctLoadedDepts.length} Dept{distinctLoadedDepts.length > 1 ? "s" : ""}: {distinctLoadedDepts.join(", ")})
                  </span>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span className="px-1.5 py-0.5 rounded bg-muted">Yr II: {yearStats.II}</span>
                    <span className="px-1.5 py-0.5 rounded bg-muted">Yr III: {yearStats.III}</span>
                    <span className="px-1.5 py-0.5 rounded bg-muted font-bold text-emerald-600 dark:text-emerald-400">Yr IV: {yearStats.IV}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSubjectsList([]);
                      setPreviewFilterDept("ALL");
                    }}
                    className="text-muted-foreground hover:text-rose-500 flex items-center gap-1 transition-colors font-medium"
                  >
                    <Trash2 className="h-3 w-3" /> Clear All
                  </button>
                </div>
              </div>

              {/* Department Filter Tabs in Preview */}
              {distinctLoadedDepts.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-semibold">
                    <Filter className="h-3 w-3" /> Filter:
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewFilterDept("ALL")}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-all ${
                      previewFilterDept === "ALL"
                        ? "bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-slate-900"
                        : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    All ({subjectsList.length})
                  </button>
                  {distinctLoadedDepts.map((d) => {
                    const count = subjectsList.filter((s) => s.department === d).length;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setPreviewFilterDept(d)}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-all ${
                          previewFilterDept === d
                            ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                            : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {d} ({count})
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Subjects Table */}
              <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10 shadow-inner">
                <table className="w-full text-left text-xs">
                  <thead className={`sticky top-0 z-10 ${isDark ? "bg-[#181828] text-slate-200" : "bg-slate-100 text-slate-700"} font-semibold shadow-sm`}>
                    <tr>
                      <th className="p-2.5">Dept</th>
                      <th className="p-2.5">Year</th>
                      <th className="p-2.5">Code</th>
                      <th className="p-2.5">Subject Name</th>
                      <th className="p-2.5">Type</th>
                      <th className="p-2.5 text-right">Hrs/Wk</th>
                      <th className="p-2.5 text-center w-10">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-normal">
                    {displayedSubjects.map((s, idx) => (
                      <tr key={idx} className={isDark ? "hover:bg-white/[0.02]" : "hover:bg-slate-50/80"}>
                        <td className="p-2.5">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-muted border border-border">
                            {s.department}
                          </span>
                        </td>
                        <td className="p-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                            s.year === "IV" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-muted"
                          }`}>
                            Yr {s.year}
                          </span>
                        </td>
                        <td className="p-2.5 font-mono text-muted-foreground">{s.code || "-"}</td>
                        <td className="p-2.5 font-medium">{s.name}</td>
                        <td className="p-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            s.type === "open elective"
                              ? "bg-purple-500/15 text-purple-600 dark:text-purple-300"
                              : s.type === "lab"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                              : s.type === "elective"
                              ? "bg-blue-500/15 text-blue-600 dark:text-blue-300"
                              : "bg-slate-500/15 text-slate-600 dark:text-slate-300"
                          }`}>
                            {s.type}
                          </span>
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                          {s.hoursPerWeek}h
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setSubjectsList((prev) => prev.filter((_, i) => i !== idx));
                            }}
                            className="text-muted-foreground hover:text-rose-500 transition-colors p-1"
                            title="Remove subject"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between gap-3 pt-3 mt-1 border-t border-slate-100 dark:border-white/5 shrink-0">
          <div className="text-xs text-muted-foreground">
            {subjectsList.length > 0 ? (
              <span>
                <strong>{subjectsList.length}</strong> subjects across{" "}
                <strong>{distinctLoadedDepts.length}</strong> department(s)
              </span>
            ) : (
              <span>No subjects selected yet.</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isSaving} className="text-xs">
              Cancel
            </Button>
            <Button
              onClick={handleSaveToDatabase}
              disabled={isSaving || subjectsList.length === 0}
              className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs gap-1.5 rounded-xl disabled:opacity-40 font-bold px-4 h-9 shadow-md shadow-emerald-500/20"
            >
              {isSaving ? (
                <>Saving Subjects in Bulk...</>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Save &amp; Import Even Semester Subjects ({subjectsList.length})
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
