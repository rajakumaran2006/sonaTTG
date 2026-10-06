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
  UserCheck,
  Users,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  addSubjectsBulk,
  deleteEvenSemesterSubjects,
  getDepartments,
  getDepartmentByName,
  DbDepartment,
} from "@/lib/supabaseService";
import { supabase } from "@/integrations/supabase/client";
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
  facultyName?: string;
  facultyId?: string;
  section?: string;
}

export interface DbFaculty {
  id: string;
  name: string;
  email: string | null;
  department_id: string;
  designation?: string | null;
}

// Standard even semester starter curriculum for all major departments with realistic odd-sem faculty mapping
export const DEFAULT_EVEN_SUBJECTS: Record<string, ParsedSubject[]> = {
  AIDS: [
    // Year II (Semester IV)
    { code: "U23ADS401", name: "Design and Analysis of Algorithms", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "AIDS", abbreviation: "DAA", facultyName: "Mr. R. Krishna Prakash", section: "A" },
    { code: "U23ADS402", name: "Machine Learning Foundations", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "AIDS", abbreviation: "MLF", facultyName: "Dr. S. Vasanthi", section: "A" },
    { code: "U23ADS403", name: "Operating Systems", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "AIDS", abbreviation: "OS", facultyName: "Mr. M. Mohammed Aslum", section: "A" },
    { code: "U23ADS404", name: "Database Management Systems", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "AIDS", abbreviation: "DBMS", facultyName: "Dr. P. Shanmugaraja", section: "A" },
    { code: "U23ADS405", name: "Design and Analysis of Algorithms Laboratory", type: "lab", hoursPerWeek: 4, credits: 2, year: "II", department: "AIDS", abbreviation: "DAA LAB", facultyName: "Mr. R. Krishna Prakash", section: "A" },
    { code: "U23ADS406", name: "Machine Learning Laboratory", type: "lab", hoursPerWeek: 2, credits: 2, year: "II", department: "AIDS", abbreviation: "ML LAB", facultyName: "Dr. S. Vasanthi", section: "A" },
    { code: "U23ADS407", name: "Database Management Systems Laboratory", type: "lab", hoursPerWeek: 2, credits: 2, year: "II", department: "AIDS", abbreviation: "DBMS LAB", facultyName: "Dr. P. Shanmugaraja", section: "A" },
    { code: "U23GE401", name: "Soft Skills and Aptitude - II", type: "theory", hoursPerWeek: 4, credits: 2, year: "II", department: "AIDS", abbreviation: "SSA-II", facultyName: "Dr. C. Saravanan", section: "A" },
    { code: "U23GE402", name: "Universal Human Values", type: "theory", hoursPerWeek: 3, credits: 3, year: "II", department: "AIDS", abbreviation: "UHV", facultyName: "Ms. P. Abinaya", section: "A" },
    { code: "U23ADS408", name: "Mini Project", type: "lab", hoursPerWeek: 2, credits: 2, year: "II", department: "AIDS", abbreviation: "MP", facultyName: "Ms. L. Sindhu", section: "A" },
    // Year III (Semester VI) — OE Included (5 hrs)
    { code: "U23OE601", name: "Open Elective: Smart Technologies and Systems", type: "open elective", hoursPerWeek: 5, credits: 3, year: "III", department: "AIDS", abbreviation: "OE", facultyName: "Ms. P. Kruthika", section: "A" },
    { code: "U23ADS601", name: "Big Data Analytics", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "AIDS", abbreviation: "BDA", facultyName: "Mr. R. Krishna Prakash", section: "A" },
    { code: "U23ADS602", name: "Deep Neural Networks", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "AIDS", abbreviation: "DNN", facultyName: "Dr. S. Vasanthi", section: "A" },
    { code: "U23ADS603", name: "Cloud Computing and Virtualization", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "AIDS", abbreviation: "CCV", facultyName: "Ms. P. Kruthika", section: "A" },
    { code: "U23ADS604", name: "Elective - Natural Language Processing", type: "elective", hoursPerWeek: 4, credits: 3, year: "III", department: "AIDS", abbreviation: "NLP", facultyName: "Mr. M. Mohammed Aslum", section: "A" },
    { code: "U23ADS605", name: "Big Data Analytics Laboratory", type: "lab", hoursPerWeek: 4, credits: 2, year: "III", department: "AIDS", abbreviation: "BDA LAB", facultyName: "Mr. R. Krishna Prakash", section: "A" },
    { code: "U23ADS606", name: "Deep Neural Networks Laboratory", type: "lab", hoursPerWeek: 3, credits: 2, year: "III", department: "AIDS", abbreviation: "DNN LAB", facultyName: "Dr. S. Vasanthi", section: "A" },
    { code: "U23ADS607", name: "Mini Project / Design Project", type: "lab", hoursPerWeek: 2, credits: 2, year: "III", department: "AIDS", abbreviation: "MP", facultyName: "Ms. L. Sindhu", section: "A" },
    { code: "U23GE601", name: "Soft Skills and Aptitude - III", type: "theory", hoursPerWeek: 4, credits: 2, year: "III", department: "AIDS", abbreviation: "SSA-III", facultyName: "Dr. C. Saravanan", section: "A" },
    // Year IV (Semester VIII) — Static Project Work
    { code: "U23ADS801", name: "Project Work", type: "theory", hoursPerWeek: 37, credits: 10, year: "IV", department: "AIDS", abbreviation: "PROJECT", facultyName: "Dr. P. Shanmugaraja", section: "A" },
  ],
  IT: [
    // Year II (Semester IV)
    { code: "U23IT401", name: "Design and Analysis of Algorithms", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "IT", abbreviation: "DAA", facultyName: "Ms. D. Sharmiladevi", section: "A" },
    { code: "U23IT402", name: "Operating Systems", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "IT", abbreviation: "OS", facultyName: "Dr. B. Parvathavardhini", section: "A" },
    { code: "U23IT403", name: "Java Programming", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "IT", abbreviation: "JAVA", facultyName: "Mrs. K. Gokula Saranya", section: "A" },
    { code: "U23IT404", name: "Software Engineering", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "IT", abbreviation: "SE", facultyName: "Dr. S. Gowri", section: "A" },
    { code: "U23IT405", name: "Design and Analysis of Algorithms Laboratory", type: "lab", hoursPerWeek: 4, credits: 2, year: "II", department: "IT", abbreviation: "DAA LAB", facultyName: "Ms. D. Sharmiladevi", section: "A" },
    { code: "U23IT406", name: "Java Programming Laboratory", type: "lab", hoursPerWeek: 2, credits: 2, year: "II", department: "IT", abbreviation: "JAVA LAB", facultyName: "Mrs. K. Gokula Saranya", section: "A" },
    { code: "U23IT407", name: "Operating Systems Laboratory", type: "lab", hoursPerWeek: 2, credits: 2, year: "II", department: "IT", abbreviation: "OS LAB", facultyName: "Dr. B. Parvathavardhini", section: "A" },
    { code: "U23GE401", name: "Soft Skills and Aptitude - II", type: "theory", hoursPerWeek: 4, credits: 2, year: "II", department: "IT", abbreviation: "SSA-II", facultyName: "Mr. C. Mohankumar", section: "A" },
    { code: "U23GE402", name: "Universal Human Values", type: "theory", hoursPerWeek: 3, credits: 3, year: "II", department: "IT", abbreviation: "UHV", facultyName: "Ms. K. Hemalatha", section: "A" },
    { code: "U23IT408", name: "Mini Project", type: "lab", hoursPerWeek: 2, credits: 2, year: "II", department: "IT", abbreviation: "MP", facultyName: "Ms. D. Sharmiladevi", section: "A" },
    // Year III (Semester VI) — OE Included (5 hrs)
    { code: "U23OE601", name: "Open Elective: Web Technologies & Applications", type: "open elective", hoursPerWeek: 5, credits: 3, year: "III", department: "IT", abbreviation: "OE", facultyName: "Mrs. K. Gokula Saranya", section: "A" },
    { code: "U23IT601", name: "Mobile Application Development", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "IT", abbreviation: "MAD", facultyName: "Dr. S. Gowri", section: "A" },
    { code: "U23IT602", name: "Artificial Intelligence", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "IT", abbreviation: "AI", facultyName: "Ms. D. Sharmiladevi", section: "A" },
    { code: "U23IT603", name: "Information Security", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "IT", abbreviation: "IS", facultyName: "Dr. B. Parvathavardhini", section: "A" },
    { code: "U23IT604", name: "Elective - Full Stack Development", type: "elective", hoursPerWeek: 4, credits: 3, year: "III", department: "IT", abbreviation: "FSD", facultyName: "Mrs. K. Gokula Saranya", section: "A" },
    { code: "U23IT605", name: "Mobile Application Development Lab", type: "lab", hoursPerWeek: 4, credits: 2, year: "III", department: "IT", abbreviation: "MAD LAB", facultyName: "Dr. S. Gowri", section: "A" },
    { code: "U23IT606", name: "Full Stack Development Lab", type: "lab", hoursPerWeek: 3, credits: 2, year: "III", department: "IT", abbreviation: "FSD LAB", facultyName: "Mrs. K. Gokula Saranya", section: "A" },
    { code: "U23IT607", name: "Mini Project", type: "lab", hoursPerWeek: 2, credits: 2, year: "III", department: "IT", abbreviation: "MP", facultyName: "Mr. C. Mohankumar", section: "A" },
    { code: "U23GE601", name: "Soft Skills and Aptitude - III", type: "theory", hoursPerWeek: 4, credits: 2, year: "III", department: "IT", abbreviation: "SSA-III", facultyName: "Mr. C. Mohankumar", section: "A" },
    // Year IV (Semester VIII) — Static Project Work
    { code: "U23IT801", name: "Project Work", type: "theory", hoursPerWeek: 37, credits: 10, year: "IV", department: "IT", abbreviation: "PROJECT", facultyName: "Dr. B. Parvathavardhini", section: "A" },
  ],
  ECE: [
    // Year II (Semester IV)
    { code: "U23EC401", name: "Analog Circuits", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "ECE", abbreviation: "AC", facultyName: "Dr. A. Ramesh", section: "A" },
    { code: "U23EC402", name: "Microcontrollers and Embedded Systems", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "ECE", abbreviation: "MCES", facultyName: "Mrs. S. Kavitha", section: "A" },
    { code: "U23EC403", name: "Signals and Systems", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "ECE", abbreviation: "SS", facultyName: "Mr. K. Vignesh", section: "A" },
    { code: "U23EC404", name: "Electromagnetic Fields", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "ECE", abbreviation: "EMF", facultyName: "Dr. M. Suresh", section: "A" },
    { code: "U23EC405", name: "Analog Circuits Laboratory", type: "lab", hoursPerWeek: 4, credits: 2, year: "II", department: "ECE", abbreviation: "AC LAB", facultyName: "Dr. A. Ramesh", section: "A" },
    { code: "U23EC406", name: "Microcontrollers Laboratory", type: "lab", hoursPerWeek: 3, credits: 2, year: "II", department: "ECE", abbreviation: "MC LAB", facultyName: "Mrs. S. Kavitha", section: "A" },
    { code: "U23GE401", name: "Soft Skills and Aptitude - II", type: "theory", hoursPerWeek: 4, credits: 2, year: "II", department: "ECE", abbreviation: "SSA-II", facultyName: "Mr. K. Vignesh", section: "A" },
    { code: "U23GE402", name: "Universal Human Values", type: "theory", hoursPerWeek: 3, credits: 3, year: "II", department: "ECE", abbreviation: "UHV", facultyName: "Dr. M. Suresh", section: "A" },
    { code: "U23EC407", name: "Mini Project", type: "lab", hoursPerWeek: 2, credits: 2, year: "II", department: "ECE", abbreviation: "MP", facultyName: "Mrs. S. Kavitha", section: "A" },
    // Year III (Semester VI) — OE Included (5 hrs)
    { code: "U23OE601", name: "Open Elective: VLSI Design Principles", type: "open elective", hoursPerWeek: 5, credits: 3, year: "III", department: "ECE", abbreviation: "OE", facultyName: "Dr. A. Ramesh", section: "A" },
    { code: "U23EC601", name: "Digital Communication Techniques", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "ECE", abbreviation: "DCT", facultyName: "Mr. K. Vignesh", section: "A" },
    { code: "U23EC602", name: "VLSI Design & Technology", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "ECE", abbreviation: "VLSI", facultyName: "Dr. A. Ramesh", section: "A" },
    { code: "U23EC603", name: "Antennas and Microwave Engineering", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "ECE", abbreviation: "AME", facultyName: "Dr. M. Suresh", section: "A" },
    { code: "U23EC604", name: "Elective - Wireless Sensor Networks", type: "elective", hoursPerWeek: 4, credits: 3, year: "III", department: "ECE", abbreviation: "WSN", facultyName: "Mrs. S. Kavitha", section: "A" },
    { code: "U23EC605", name: "Digital Communication Laboratory", type: "lab", hoursPerWeek: 4, credits: 2, year: "III", department: "ECE", abbreviation: "DC LAB", facultyName: "Mr. K. Vignesh", section: "A" },
    { code: "U23EC606", name: "VLSI Design Laboratory", type: "lab", hoursPerWeek: 3, credits: 2, year: "III", department: "ECE", abbreviation: "VLSI LAB", facultyName: "Dr. A. Ramesh", section: "A" },
    { code: "U23GE601", name: "Soft Skills and Aptitude - III", type: "theory", hoursPerWeek: 4, credits: 2, year: "III", department: "ECE", abbreviation: "SSA-III", facultyName: "Mr. K. Vignesh", section: "A" },
    { code: "U23EC607", name: "Mini Project", type: "lab", hoursPerWeek: 2, credits: 2, year: "III", department: "ECE", abbreviation: "MP", facultyName: "Mrs. S. Kavitha", section: "A" },
    // Year IV (Semester VIII) — Static Project Work
    { code: "U23EC801", name: "Project Work", type: "theory", hoursPerWeek: 37, credits: 10, year: "IV", department: "ECE", abbreviation: "PROJECT", facultyName: "Dr. M. Suresh", section: "A" },
  ],
  mech: [
    // Year II (Semester IV)
    { code: "U23ME401", name: "Fluid Mechanics and Machinery", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "mech", abbreviation: "FMM", facultyName: "Dr. P. Rajesh", section: "A" },
    { code: "U23ME402", name: "Manufacturing Technology - II", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "mech", abbreviation: "MT-II", facultyName: "Mr. S. Karthik", section: "A" },
    { code: "U23ME403", name: "Kinematics of Machinery", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "mech", abbreviation: "KOM", facultyName: "Dr. T. Murugan", section: "A" },
    { code: "U23ME404", name: "Thermal Engineering", type: "theory", hoursPerWeek: 4, credits: 3, year: "II", department: "mech", abbreviation: "TE", facultyName: "Mr. R. Dinesh", section: "A" },
    { code: "U23ME405", name: "Fluid Mechanics Laboratory", type: "lab", hoursPerWeek: 4, credits: 2, year: "II", department: "mech", abbreviation: "FM LAB", facultyName: "Dr. P. Rajesh", section: "A" },
    { code: "U23ME406", name: "Manufacturing Technology Laboratory", type: "lab", hoursPerWeek: 3, credits: 2, year: "II", department: "mech", abbreviation: "MT LAB", facultyName: "Mr. S. Karthik", section: "A" },
    { code: "U23GE401", name: "Soft Skills and Aptitude - II", type: "theory", hoursPerWeek: 4, credits: 2, year: "II", department: "mech", abbreviation: "SSA-II", facultyName: "Mr. R. Dinesh", section: "A" },
    { code: "U23GE402", name: "Universal Human Values", type: "theory", hoursPerWeek: 3, credits: 3, year: "II", department: "mech", abbreviation: "UHV", facultyName: "Dr. T. Murugan", section: "A" },
    { code: "U23ME407", name: "Mini Project", type: "lab", hoursPerWeek: 2, credits: 2, year: "II", department: "mech", abbreviation: "MP", facultyName: "Mr. S. Karthik", section: "A" },
    // Year III (Semester VI) — OE Included (5 hrs)
    { code: "U23OE601", name: "Open Elective: Renewable Energy Sources", type: "open elective", hoursPerWeek: 5, credits: 3, year: "III", department: "mech", abbreviation: "OE", facultyName: "Dr. P. Rajesh", section: "A" },
    { code: "U23ME601", name: "Design of Transmission Systems", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "mech", abbreviation: "DTS", facultyName: "Dr. T. Murugan", section: "A" },
    { code: "U23ME602", name: "Heat and Mass Transfer", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "mech", abbreviation: "HMT", facultyName: "Mr. R. Dinesh", section: "A" },
    { code: "U23ME603", name: "Finite Element Analysis", type: "theory", hoursPerWeek: 4, credits: 3, year: "III", department: "mech", abbreviation: "FEA", facultyName: "Mr. S. Karthik", section: "A" },
    { code: "U23ME604", name: "Elective - Automobile Engineering", type: "elective", hoursPerWeek: 4, credits: 3, year: "III", department: "mech", abbreviation: "AE", facultyName: "Dr. P. Rajesh", section: "A" },
    { code: "U23ME605", name: "Heat Transfer Laboratory", type: "lab", hoursPerWeek: 4, credits: 2, year: "III", department: "mech", abbreviation: "HT LAB", facultyName: "Mr. R. Dinesh", section: "A" },
    { code: "U23ME606", name: "CAD/CAM Laboratory", type: "lab", hoursPerWeek: 3, credits: 2, year: "III", department: "mech", abbreviation: "CAD LAB", facultyName: "Mr. S. Karthik", section: "A" },
    { code: "U23GE601", name: "Soft Skills and Aptitude - III", type: "theory", hoursPerWeek: 4, credits: 2, year: "III", department: "mech", abbreviation: "SSA-III", facultyName: "Mr. R. Dinesh", section: "A" },
    { code: "U23ME607", name: "Mini Project", type: "lab", hoursPerWeek: 2, credits: 2, year: "III", department: "mech", abbreviation: "MP", facultyName: "Dr. T. Murugan", section: "A" },
    // Year IV (Semester VIII) — Static Project Work
    { code: "U23ME801", name: "Project Work", type: "theory", hoursPerWeek: 37, credits: 10, year: "IV", department: "mech", abbreviation: "PROJECT", facultyName: "Dr. P. Rajesh", section: "A" },
  ],
};

// Helper to normalize names for comparison (strips Dr., Mr., etc.)
const normalizePersonName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/^(dr\.|dr\s+|mr\.|mr\s+|mrs\.|mrs\s+|ms\.|ms\s+|prof\.|prof\s+)/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
};

export const ImportEvenSemesterModal: React.FC<ImportEvenSemesterModalProps> = ({
  open,
  onClose,
  departmentName,
  onSuccess,
}) => {
  const { isDark } = useDarkMode();
  const [dbDepartments, setDbDepartments] = useState<DbDepartment[]>([]);
  const [dbFaculty, setDbFaculty] = useState<DbFaculty[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>("ALL");
  const [previewFilterDept, setPreviewFilterDept] = useState<string>("ALL");
  const [subjectsList, setSubjectsList] = useState<ParsedSubject[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Fetch departments and existing faculty from odd semester on mount
  useEffect(() => {
    Promise.all([
      getDepartments(),
      (supabase as any).from("faculty_members").select("id, name, email, department_id, designation").order("name"),
    ])
      .then(([depts, facResult]) => {
        if (depts && depts.length > 0) {
          setDbDepartments(depts);
        }
        if (facResult?.data) {
          setDbFaculty(facResult.data);
        }
      })
      .catch((err) => {
        console.error("Failed to load reference data:", err);
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

  // Helper to find matching faculty from existing odd semester faculty
  const findMatchingFaculty = (
    rawFacultyName: string,
    targetDeptId?: string | null
  ): DbFaculty | null => {
    if (!rawFacultyName || !rawFacultyName.trim()) return null;
    const raw = rawFacultyName.trim().toLowerCase();
    const normalizedRaw = normalizePersonName(rawFacultyName);

    // Prefer department faculty if available, then fallback to all faculty
    const pool = targetDeptId
      ? dbFaculty.filter((f) => f.department_id === targetDeptId)
      : dbFaculty;

    // 1. Exact email match
    if (raw.includes("@")) {
      const byEmail =
        pool.find((f) => f.email?.toLowerCase().trim() === raw) ||
        dbFaculty.find((f) => f.email?.toLowerCase().trim() === raw);
      if (byEmail) return byEmail;
    }

    // 2. Exact name match (case insensitive)
    const exact =
      pool.find((f) => f.name.toLowerCase().trim() === raw) ||
      dbFaculty.find((f) => f.name.toLowerCase().trim() === raw);
    if (exact) return exact;

    // 3. Normalized name match (strips Dr., Mr., etc.)
    if (normalizedRaw.length >= 3) {
      const normMatch =
        pool.find((f) => normalizePersonName(f.name) === normalizedRaw) ||
        dbFaculty.find((f) => normalizePersonName(f.name) === normalizedRaw);
      if (normMatch) return normMatch;

      // 4. Substring / contains match
      const subMatch =
        pool.find((f) => {
          const fn = normalizePersonName(f.name);
          return fn.includes(normalizedRaw) || normalizedRaw.includes(fn);
        }) ||
        dbFaculty.find((f) => {
          const fn = normalizePersonName(f.name);
          return fn.includes(normalizedRaw) || normalizedRaw.includes(fn);
        });
      if (subMatch) return subMatch;
    }

    return null;
  };

  // Get odd-sem faculty list for a given department name
  const getFacultyForDept = (deptName: string): DbFaculty[] => {
    const deptId = resolveDepartmentId(deptName);
    if (deptId) {
      return dbFaculty.filter((f) => f.department_id === deptId);
    }
    return dbFaculty;
  };

  // Download Template with Faculty Mapping (Excel or CSV)
  const handleDownloadTemplate = (format: "xlsx" | "csv" = "xlsx") => {
    const isBulk = selectedDept === "ALL";
    let templateRows: any[] = [];

    if (isBulk) {
      // Generate sample rows across all departments covering Years II, III, and IV
      templateRows = [
        // AIDS
        { "Department": "AIDS", "Year": "II", "Subject Code": "U23ADS401", "Subject Name": "Design and Analysis of Algorithms", "Abbreviation": "DAA", "Type": "theory", "Hours Per Week": 4, "Credits": 3, "Faculty Name": "Mr. R. Krishna Prakash", "Section": "A" },
        { "Department": "AIDS", "Year": "II", "Subject Code": "U23ADS405", "Subject Name": "Algorithms Laboratory", "Abbreviation": "DAA LAB", "Type": "lab", "Hours Per Week": 4, "Credits": 2, "Faculty Name": "Mr. R. Krishna Prakash", "Section": "A" },
        { "Department": "AIDS", "Year": "III", "Subject Code": "U23OE601", "Subject Name": "Open Elective: Smart Technologies and Systems", "Abbreviation": "OE", "Type": "open elective", "Hours Per Week": 5, "Credits": 3, "Faculty Name": "Ms. P. Kruthika", "Section": "A" },
        { "Department": "AIDS", "Year": "IV", "Subject Code": "U23ADS801", "Subject Name": "Project Work", "Abbreviation": "PROJECT", "Type": "theory", "Hours Per Week": 37, "Credits": 10, "Faculty Name": "Dr. P. Shanmugaraja", "Section": "A" },
        // IT
        { "Department": "IT", "Year": "II", "Subject Code": "U23IT401", "Subject Name": "Design and Analysis of Algorithms", "Abbreviation": "DAA", "Type": "theory", "Hours Per Week": 4, "Credits": 3, "Faculty Name": "Ms. D. Sharmiladevi", "Section": "A" },
        { "Department": "IT", "Year": "II", "Subject Code": "U23IT405", "Subject Name": "Algorithms Laboratory", "Abbreviation": "DAA LAB", "Type": "lab", "Hours Per Week": 4, "Credits": 2, "Faculty Name": "Ms. D. Sharmiladevi", "Section": "A" },
        { "Department": "IT", "Year": "III", "Subject Code": "U23OE601", "Subject Name": "Open Elective: Web Technologies & Applications", "Abbreviation": "OE", "Type": "open elective", "Hours Per Week": 5, "Credits": 3, "Faculty Name": "Mrs. K. Gokula Saranya", "Section": "A" },
        { "Department": "IT", "Year": "IV", "Subject Code": "U23IT801", "Subject Name": "Project Work", "Abbreviation": "PROJECT", "Type": "theory", "Hours Per Week": 37, "Credits": 10, "Faculty Name": "Dr. B. Parvathavardhini", "Section": "A" },
        // ECE
        { "Department": "ECE", "Year": "II", "Subject Code": "U23EC401", "Subject Name": "Analog Circuits", "Abbreviation": "AC", "Type": "theory", "Hours Per Week": 4, "Credits": 3, "Faculty Name": "Dr. A. Ramesh", "Section": "A" },
        { "Department": "ECE", "Year": "III", "Subject Code": "U23OE601", "Subject Name": "Open Elective: VLSI Design Principles", "Abbreviation": "OE", "Type": "open elective", "Hours Per Week": 5, "Credits": 3, "Faculty Name": "Dr. A. Ramesh", "Section": "A" },
        { "Department": "ECE", "Year": "IV", "Subject Code": "U23EC801", "Subject Name": "Project Work", "Abbreviation": "PROJECT", "Type": "theory", "Hours Per Week": 37, "Credits": 10, "Faculty Name": "Dr. M. Suresh", "Section": "A" },
        // MECH
        { "Department": "mech", "Year": "II", "Subject Code": "U23ME401", "Subject Name": "Fluid Mechanics and Machinery", "Abbreviation": "FMM", "Type": "theory", "Hours Per Week": 4, "Credits": 3, "Faculty Name": "Dr. P. Rajesh", "Section": "A" },
        { "Department": "mech", "Year": "III", "Subject Code": "U23OE601", "Subject Name": "Open Elective: Renewable Energy Sources", "Abbreviation": "OE", "Type": "open elective", "Hours Per Week": 5, "Credits": 3, "Faculty Name": "Dr. P. Rajesh", "Section": "A" },
        { "Department": "mech", "Year": "IV", "Subject Code": "U23ME801", "Subject Name": "Project Work", "Abbreviation": "PROJECT", "Type": "theory", "Hours Per Week": 37, "Credits": 10, "Faculty Name": "Dr. P. Rajesh", "Section": "A" },
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
        "Faculty Name": s.facultyName || "",
        "Section": s.section || "A",
      }));
    }

    const filename = isBulk
      ? `Even_Semester_Bulk_Subjects_Template.${format}`
      : `Even_Semester_${selectedDept}_Subjects_Template.${format}`;

    if (format === "csv") {
      const headers = "Department,Year,Subject Code,Subject Name,Abbreviation,Type,Hours Per Week,Credits,Faculty Name,Section\n";
      const rows = templateRows
        .map(
          (r) =>
            `"${r["Department"]}","${r["Year"]}","${r["Subject Code"]}","${r["Subject Name"]}","${r["Abbreviation"]}","${r["Type"]}",${r["Hours Per Week"]},${r["Credits"]},"${r["Faculty Name"] || ""}","${r["Section"] || "A"}"`
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
      toast.success("CSV bulk template with Faculty Mapping downloaded successfully!");
    } else {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(templateRows);
      XLSX.utils.book_append_sheet(wb, ws, "Even Semester Curriculum");

      // Add a 2nd sheet listing existing Odd Semester faculty for reference
      if (dbFaculty.length > 0) {
        const facultyRefRows = dbFaculty.map((f) => {
          const dept = dbDepartments.find((d) => d.id === f.department_id);
          return {
            "Department": dept ? dept.name : "General",
            "Faculty Name": f.name,
            "Email": f.email || "",
            "Designation": f.designation || "Faculty",
          };
        });
        const wsFaculty = XLSX.utils.json_to_sheet(facultyRefRows);
        XLSX.utils.book_append_sheet(wb, wsFaculty, "Odd Sem Faculty List");
      }

      XLSX.writeFile(wb, filename);
      toast.success("Excel template with Faculty Mapping downloaded! (See 'Odd Sem Faculty List' tab for existing faculty names)");
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

            // Extract faculty mapping from template
            const rawFacultyName = String(
              row["Faculty Name"] ||
                row["faculty_name"] ||
                row["Faculty"] ||
                row["faculty"] ||
                row["Staff"] ||
                row["staff"] ||
                row["Staff Incharge"] ||
                row["Faculty Incharge"] ||
                row["Faculty Member"] ||
                row["Faculty / Staff"] ||
                ""
            ).trim();

            const rawSection = String(
              row["Section"] || row["section"] || row["Sec"] || row["sec"] || "A"
            ).trim().toUpperCase();

            // Match faculty against existing odd semester faculty
            const deptId = resolveDepartmentId(dept);
            const matchedFac = findMatchingFaculty(rawFacultyName, deptId);

            return {
              code,
              name,
              type,
              hoursPerWeek: isNaN(hours) ? 4 : hours,
              credits: isNaN(credits) ? 3 : credits,
              year,
              department: dept,
              abbreviation,
              facultyName: matchedFac ? matchedFac.name : (rawFacultyName || undefined),
              facultyId: matchedFac ? matchedFac.id : undefined,
              section: rawSection || "A",
            };
          })
          .filter((s) => s.name.length > 0);

        if (parsed.length === 0) {
          toast.error("No valid subjects found. Please verify column headers.");
          return;
        }

        setSubjectsList(parsed);
        const distinctDepts = Array.from(new Set(parsed.map((s) => s.department)));
        const mappedFacultyCount = parsed.filter((s) => s.facultyName).length;
        toast.success(
          `Parsed ${parsed.length} subjects (${mappedFacultyCount} faculty mappings) across ${distinctDepts.length} department(s)!`
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
          const deptId = resolveDepartmentId(dept);
          const mapped = DEFAULT_EVEN_SUBJECTS[dept].map((s) => {
            const fac = findMatchingFaculty(s.facultyName || "", deptId);
            return {
              ...s,
              facultyName: fac ? fac.name : s.facultyName,
              facultyId: fac ? fac.id : undefined,
            };
          });
          allSubjects.push(...mapped);
        }
      });
      setSubjectsList(allSubjects);
      toast.success(
        `Loaded standard Even Semester curriculum with odd sem faculty mappings for all departments (${allSubjects.length} subjects total)!`
      );
    } else {
      const defaults = DEFAULT_EVEN_SUBJECTS[selectedDept] || DEFAULT_EVEN_SUBJECTS["AIDS"];
      const deptId = resolveDepartmentId(selectedDept);
      const mapped = defaults.map((s) => {
        const fac = findMatchingFaculty(s.facultyName || "", deptId);
        return {
          ...s,
          facultyName: fac ? fac.name : s.facultyName,
          facultyId: fac ? fac.id : undefined,
        };
      });
      setSubjectsList(mapped);
      toast.success(
        `Loaded standard Even Semester curriculum with odd sem faculty mappings for ${selectedDept} (${mapped.length} subjects).`
      );
    }
  };

  // Update a subject's faculty mapping directly from the preview table
  const handleUpdateSubjectFaculty = (subjectIndex: number, facultyId: string) => {
    setSubjectsList((prev) => {
      const copy = [...prev];
      const target = copy[subjectIndex];
      if (!target) return prev;

      if (!facultyId) {
        target.facultyId = undefined;
        target.facultyName = undefined;
      } else {
        const fac = dbFaculty.find((f) => f.id === facultyId);
        if (fac) {
          target.facultyId = fac.id;
          target.facultyName = fac.name;
        }
      }
      return copy;
    });
  };

  // Update a subject's section
  const handleUpdateSubjectSection = (subjectIndex: number, section: string) => {
    setSubjectsList((prev) => {
      const copy = [...prev];
      if (copy[subjectIndex]) {
        copy[subjectIndex].section = section.toUpperCase();
      }
      return copy;
    });
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
      let totalAssigned = 0;
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

        // 1. Delete existing even semester subjects for this department (also safely removes linked assignments)
        await deleteEvenSemesterSubjects(deptId);

        // 2. Bulk insert subjects with tag 'even_sem', semesterType: 'even', and staff set to facultyName
        const rows = deptsSubjects.map((s) => ({
          name: s.name,
          hoursPerWeek: s.hoursPerWeek,
          type: s.type,
          tags: ["even_sem"],
          code: s.code || undefined,
          abbreviation: s.abbreviation || undefined,
          staff: s.facultyName || undefined,
          departmentId: deptId!,
          year: s.year,
          credits: s.credits,
          semesterType: "even" as const,
        }));

        const insertedSubjects = await addSubjectsBulk(rows);
        totalSaved += rows.length;
        savedDepts.push(deptName);

        // 3. Map subjects to existing odd semester faculty in faculty_subject_assignments
        const assignmentsToInsert: any[] = [];
        const seenKeys = new Set<string>();

        deptsSubjects.forEach((s, idx) => {
          const insertedSubj =
            insertedSubjects[idx] ||
            insertedSubjects.find((sub) => sub.name === s.name && (sub as any).year === s.year);

          if (!insertedSubj) return;

          // Resolve faculty member ID
          let facultyId = s.facultyId;
          if (!facultyId && s.facultyName) {
            const matched = findMatchingFaculty(s.facultyName, deptId);
            if (matched) facultyId = matched.id;
          }

          if (facultyId) {
            const rawSec = (s.section || "A").trim().toUpperCase();
            const sections =
              rawSec === "ALL" || !rawSec
                ? ["A"]
                : rawSec.split(/[,/]/).map((x) => x.trim().toUpperCase()).filter(Boolean);

            // Insert section-specific mappings
            sections.forEach((sec) => {
              const key = `${facultyId}-${insertedSubj.id}-${s.year}-${sec}`;
              if (!seenKeys.has(key)) {
                seenKeys.add(key);
                assignmentsToInsert.push({
                  department_id: deptId,
                  faculty_id: facultyId,
                  subject_id: insertedSubj.id,
                  year: s.year,
                  section: sec,
                });
              }
            });

            // Insert year-wide mapping (section: null) as fallback for all timetable generators
            const yearKey = `${facultyId}-${insertedSubj.id}-${s.year}-null`;
            if (!seenKeys.has(yearKey)) {
              seenKeys.add(yearKey);
              assignmentsToInsert.push({
                department_id: deptId,
                faculty_id: facultyId,
                subject_id: insertedSubj.id,
                year: s.year,
                section: null,
              });
            }
          }
        });

        if (assignmentsToInsert.length > 0) {
          const { error: assignErr } = await (supabase as any)
            .from("faculty_subject_assignments")
            .insert(assignmentsToInsert);

          if (assignErr) {
            console.warn("Error inserting faculty_subject_assignments:", assignErr);
          } else {
            totalAssigned += assignmentsToInsert.length;
          }
        }
      }

      if (totalSaved === 0) {
        throw new Error("No departments could be matched to system records.");
      }

      toast.success(
        `Successfully saved ${totalSaved} Even Semester subjects across ${savedDepts.length} department(s)!`,
        {
          description: `Mapped ${totalAssigned} faculty assignment slots directly using odd semester faculty. These will load automatically in Even Semester timetables.`,
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
      mappedFaculty: subjectsList.filter((s) => Boolean(s.facultyName)).length,
    };
  }, [subjectsList]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className={`max-w-5xl max-h-[92vh] flex flex-col border rounded-2xl shadow-2xl backdrop-blur-2xl transition-all duration-300 ${
          isDark 
            ? "bg-[#090d1c]/95 border-indigo-500/30 text-white shadow-[0_0_35px_-5px_rgba(99,102,241,0.25)]" 
            : "bg-white/95 border-indigo-200/80 text-slate-900 shadow-[0_0_30px_-5px_rgba(99,102,241,0.12)]"
        }`}
        style={isDark ? { backgroundImage: 'radial-gradient(ellipse at 20% 0%, rgba(99,102,241,0.15) 0%, transparent 60%)' } : {}}
      >
        <DialogHeader className="shrink-0 pb-1">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              isDark 
                ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-400 shadow-[0_0_12px_-2px_rgba(99,102,241,0.3)]" 
                : "bg-indigo-50 border-indigo-200 text-indigo-600 shadow-xs"
            }`}>
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                Import Even Semester Subjects &amp; Faculty Mapping
                <Badge variant="outline" className={`text-xs border ${
                  isDark ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/30" : "bg-indigo-50 text-indigo-700 border-indigo-200"
                }`}>
                  Semesters IV, VI &amp; VIII
                </Badge>
                <Badge variant="secondary" className={`text-[10px] uppercase font-bold tracking-wider border ${
                  isDark ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/25" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                }`}>
                  <UserCheck className="h-3 w-3 mr-1 inline" />
                  Same Odd Sem Faculty Kept
                </Badge>
              </DialogTitle>
              <DialogDescription className={`text-xs mt-0.5 ${isDark ? "text-indigo-300/70" : "text-slate-500"}`}>
                Your existing Odd Semester faculty are preserved as-is. Map Even Semester subjects to them using the template or dropdowns below.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3.5 pt-1 flex-1 overflow-y-auto pr-1">
          {/* Department Choice & Action Buttons */}
          <div className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border backdrop-blur-md transition-colors ${
            isDark ? "border-indigo-500/20 bg-indigo-950/20" : "border-indigo-100 bg-indigo-50/50"
          }`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-semibold flex items-center gap-1 ${isDark ? "text-indigo-300/80" : "text-indigo-900/80"}`}>
                <Layers className="h-3.5 w-3.5" /> Scope:
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedDept("ALL")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                    selectedDept === "ALL"
                      ? "bg-indigo-600 text-white border-indigo-400/50 shadow-[0_0_10px_-2px_rgba(99,102,241,0.4)]"
                      : isDark
                      ? "bg-white/5 border-white/10 text-slate-300 hover:border-indigo-500/30"
                      : "bg-white border-slate-200 text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/50"
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
                        ? "bg-indigo-600 text-white border-indigo-400/50 shadow-[0_0_10px_-2px_rgba(99,102,241,0.4)]"
                        : isDark
                        ? "bg-white/5 border-white/10 text-slate-300 hover:border-indigo-500/30"
                        : "bg-white border-slate-200 text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/50"
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
                  title="Download Excel Template with Faculty Mapping & Odd Sem Faculty List"
                >
                  <Download className="h-3 w-3" />
                  Excel (with Faculty)
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownloadTemplate("csv")}
                  className="h-7 px-2 text-[11px] gap-1 rounded-md font-semibold text-foreground hover:bg-background"
                  title="Download CSV Template with Faculty Mapping"
                >
                  <Download className="h-3 w-3" />
                  CSV
                </Button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadDefaults}
                className={`h-8 text-xs gap-1.5 rounded-lg border font-semibold transition-all ${
                  isDark 
                    ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 shadow-[0_0_10px_-2px_rgba(99,102,241,0.2)]" 
                    : "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100/70"
                }`}
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
            className={`border-2 border-dashed rounded-xl p-4 text-center transition-all ${
              dragOver
                ? "border-indigo-500 bg-indigo-500/15 shadow-[0_0_15px_-2px_rgba(99,102,241,0.3)]"
                : isDark
                ? "border-indigo-500/20 hover:border-indigo-500/40 bg-white/[0.02]"
                : "border-indigo-200 hover:border-indigo-300 bg-indigo-50/30"
            }`}
          >
            <Upload className={`h-5 w-5 mx-auto mb-1.5 ${isDark ? "text-indigo-400" : "text-indigo-600"}`} />
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Drag &amp; drop your Bulk Even Semester file (<span className="font-mono text-indigo-600 dark:text-indigo-400">.xlsx</span> or <span className="font-mono text-indigo-600 dark:text-indigo-400">.csv</span>)
            </p>
            <p className={`text-[11px] mt-0.5 mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Columns supported: <code className="font-mono font-bold">Department</code>, <code className="font-mono font-bold">Year</code>, <code className="font-mono font-bold">Subject Code</code>, <code className="font-mono font-bold">Subject Name</code>, <code className="font-mono font-bold">Abbreviation</code>, <code className="font-mono font-bold">Type</code>, <code className="font-mono font-bold">Hours Per Week</code>, <code className="font-mono font-bold">Credits</code>, <code className="font-mono font-bold text-emerald-600 dark:text-emerald-400">Faculty Name</code>, <code className="font-mono font-bold text-emerald-600 dark:text-emerald-400">Section</code>.
            </p>
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm shadow-indigo-500/25">
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
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    Ready to Import: {subjectsList.length} Subjects
                  </span>
                  <span className="text-muted-foreground text-[11px]">
                    ({distinctLoadedDepts.length} Dept{distinctLoadedDepts.length > 1 ? "s" : ""}: {distinctLoadedDepts.join(", ")})
                  </span>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Yr II: {yearStats.II}</span>
                    <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Yr III: {yearStats.III}</span>
                    <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-bold">Yr IV: {yearStats.IV}</span>
                    <span className={`px-2 py-0.5 rounded font-semibold border ${
                      yearStats.mappedFaculty === subjectsList.length
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25"
                    }`}>
                      <Users className="h-3 w-3 inline mr-1" />
                      {yearStats.mappedFaculty} / {subjectsList.length} Faculty Mapped
                    </span>
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
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
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
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                            : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {d} ({count})
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Subjects Table with Interactive Faculty Assignment */}
              <div className={`max-h-64 overflow-y-auto rounded-xl border backdrop-blur-md shadow-inner ${
                isDark ? "border-indigo-500/20 bg-black/20" : "border-indigo-200/70 bg-white/60"
              }`}>
                <table className="w-full text-left text-xs">
                  <thead className={`sticky top-0 z-10 backdrop-blur-md ${
                    isDark ? "bg-[#11162b]/95 text-indigo-200 border-b border-indigo-500/20" : "bg-indigo-50/95 text-indigo-900 border-b border-indigo-100"
                  } font-semibold shadow-xs`}>
                    <tr>
                      <th className="p-2">Dept</th>
                      <th className="p-2">Year</th>
                      <th className="p-2">Code</th>
                      <th className="p-2">Subject Name</th>
                      <th className="p-2">Abbr</th>
                      <th className="p-2">Type</th>
                      <th className="p-2 text-right">Hrs</th>
                      <th className="p-2 min-w-[200px]">Faculty (Odd Sem)</th>
                      <th className="p-2 text-center w-14">Sec</th>
                      <th className="p-2 text-center w-8">Del</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y font-normal ${isDark ? "divide-indigo-500/10" : "divide-indigo-100/60"}`}>
                    {displayedSubjects.map((s) => {
                      const actualIdx = subjectsList.indexOf(s);
                      const deptFacultyOptions = getFacultyForDept(s.department);
                      const isMatchedInDb = dbFaculty.some(
                        (f) => f.id === s.facultyId || normalizePersonName(f.name) === normalizePersonName(s.facultyName || "")
                      );

                      return (
                        <tr key={actualIdx} className={isDark ? "hover:bg-indigo-500/5 transition-colors" : "hover:bg-indigo-50/40 transition-colors"}>
                          <td className="p-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                              isDark ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/25" : "bg-indigo-50 text-indigo-700 border-indigo-200"
                            }`}>
                              {s.department}
                            </span>
                          </td>
                          <td className="p-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                              s.year === "IV" 
                                ? "bg-amber-500/15 text-amber-500 dark:text-amber-400 border-amber-500/30" 
                                : (isDark ? "bg-white/5 text-slate-300 border-white/10" : "bg-slate-100 text-slate-700 border-slate-200")
                            }`}>
                              Yr {s.year}
                            </span>
                          </td>
                          <td className="p-2 font-mono text-muted-foreground text-[11px]">{s.code || "-"}</td>
                          <td className="p-2 font-medium max-w-[180px] truncate" title={s.name}>
                            {s.name}
                          </td>
                          <td className="p-2 font-mono text-muted-foreground text-[10px]">
                            {s.abbreviation || "-"}
                          </td>
                          <td className="p-2">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase border ${
                              s.type === "open elective"
                                ? (isDark ? "bg-purple-500/15 text-purple-300 border-purple-500/30" : "bg-purple-50 text-purple-700 border-purple-200")
                                : s.type === "lab"
                                ? (isDark ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" : "bg-cyan-50 text-cyan-700 border-cyan-200")
                                : s.type === "elective"
                                ? (isDark ? "bg-blue-500/15 text-blue-300 border-blue-500/30" : "bg-blue-50 text-blue-700 border-blue-200")
                                : (isDark ? "bg-slate-500/15 text-slate-300 border-slate-500/30" : "bg-slate-100 text-slate-700 border-slate-200")
                            }`}>
                              {s.type}
                            </span>
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                            {s.hoursPerWeek}h
                          </td>
                          {/* Faculty Assignment Dropdown & Badge */}
                          <td className="p-2">
                            <div className="flex items-center gap-1.5">
                              <select
                                value={s.facultyId || ""}
                                onChange={(e) => handleUpdateSubjectFaculty(actualIdx, e.target.value)}
                                className={`w-full text-xs rounded-lg px-2 py-1 border transition-colors ${
                                  isDark
                                    ? "bg-[#101528] border-indigo-500/30 text-slate-200 focus:border-indigo-400 focus:outline-none"
                                    : "bg-white border-slate-300 text-slate-800 focus:border-indigo-500 focus:outline-none"
                                }`}
                              >
                                <option value="">
                                  {s.facultyName ? `Current: ${s.facultyName}` : "-- Select Odd Sem Faculty --"}
                                </option>
                                {deptFacultyOptions.map((fac) => (
                                  <option key={fac.id} value={fac.id}>
                                    {fac.name}
                                  </option>
                                ))}
                              </select>
                              {s.facultyName && isMatchedInDb && (
                                <span title="Matched to Odd Sem Faculty in Database" className="text-emerald-500 shrink-0">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </span>
                              )}
                              {s.facultyName && !isMatchedInDb && (
                                <span title="Custom name (select from dropdown to link to odd sem faculty)" className="text-amber-500 shrink-0">
                                  <AlertCircle className="h-3.5 w-3.5" />
                                </span>
                              )}
                            </div>
                          </td>
                          {/* Section */}
                          <td className="p-2 text-center">
                            <input
                              type="text"
                              value={s.section || "A"}
                              maxLength={3}
                              onChange={(e) => handleUpdateSubjectSection(actualIdx, e.target.value)}
                              className={`w-10 text-center font-mono font-bold text-[11px] rounded px-1 py-0.5 border ${
                                isDark
                                  ? "bg-[#101528] border-indigo-500/30 text-indigo-300"
                                  : "bg-white border-slate-300 text-indigo-700"
                              }`}
                              title="Section (A, B, or All)"
                            />
                          </td>
                          {/* Remove */}
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setSubjectsList((prev) => prev.filter((_, i) => i !== actualIdx));
                              }}
                              className="text-muted-foreground hover:text-rose-500 transition-colors p-0.5"
                              title="Remove subject"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className={`flex items-center justify-between gap-3 pt-3 mt-1 border-t shrink-0 ${
          isDark ? "border-indigo-500/20" : "border-indigo-100"
        }`}>
          <div className="text-xs text-muted-foreground">
            {subjectsList.length > 0 ? (
              <span>
                <strong>{subjectsList.length}</strong> subjects across{" "}
                <strong>{distinctLoadedDepts.length}</strong> department(s) •{" "}
                <strong className="text-emerald-600 dark:text-emerald-400">{yearStats.mappedFaculty}</strong> mapped to Odd Sem faculty
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
              className="bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs gap-1.5 rounded-xl disabled:opacity-40 font-bold px-5 h-9 shadow-md shadow-indigo-500/25"
            >
              {isSaving ? (
                <>Saving Subjects &amp; Faculty Mappings...</>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Save &amp; Import Even Semester Curriculum ({subjectsList.length})
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
