import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Navbar from "@/components/navbar/facultyadmin";  
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useDarkMode } from "@/context/DarkModeContext";
import { 
  FacultyMember, 
  getFacultyByEmail, 
  updateFacultyMember,
} from "@/lib/supabaseService";
import { 
  Edit, 
  Calendar, 
  Clock, 
  MapPin, 
  Mail, 
  User, 
  RefreshCw, 
  BookOpen, 
  Shield, 
  CheckCircle, 
  X, 
  GraduationCap, 
  BarChart3, 
  Building2,
  Upload,
  Sparkles
} from "lucide-react";

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PERIODS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];
const TIME_SLOTS = [
  '9:00-9:55', '9:55-10:50', '11:05-12:00', '12:00-12:55', 
  '1:55-2:50', '2:50-3:45', '3:55-4:50'
];

// Types for faculty schedule
interface FacultyScheduleItem {
  subject: string;
  day: number;
  period: number;
  year: string;
  section: string;
  department_name?: string;
  is_special?: boolean;
  sections?: string[];
}

interface SubjectAssignment {
  subject: string;
  schedule: Array<{
    day: string;
    period: string;
    year: string;
    section: string;
    department_name?: string;
  }>;
}

const FacultyDashboard = () => {
  const { isDark } = useDarkMode();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [faculty, setFaculty] = useState<FacultyMember | null>(null);
  const [schedule, setSchedule] = useState<FacultyScheduleItem[]>([]);
  const [subjectAssignments, setSubjectAssignments] = useState<SubjectAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState({ name: "", email: "", designation: "" });

  useEffect(() => {
    document.title = "Faculty Dashboard";
    
    // Check if user is already logged in
    const storedFaculty = localStorage.getItem("facultyUser");
    if (storedFaculty) {
      try {
        const parsedFaculty = JSON.parse(storedFaculty);
        setFaculty(parsedFaculty);
        setEditData({
          name: parsedFaculty.name,
          email: parsedFaculty.email || "",
          designation: parsedFaculty.designation || ""
        });
        // Load their schedule with both name and ID for exact section-specific matching
        extractFacultyScheduleFromTimetables(parsedFaculty.name, parsedFaculty.id)
          .then(({ schedule: facultySchedule, assignments }) => {
            setSchedule(facultySchedule);
            setSubjectAssignments(assignments);
          })
          .catch((err) => {
            console.error("Failed to load faculty schedule", err);
          });
      } catch (e) {
        console.error("Failed to parse stored faculty user", e);
        localStorage.removeItem("facultyUser");
      }
    }
  }, []);

  // Helper to parse year representations into standard numbers
  const parseYearNum = (y: any): number => {
    if (y === null || y === undefined) return -1;
    const s = String(y).trim().toUpperCase();
    const map: Record<string, number> = {
      '1': 1, 'I': 1, 'FIRST': 1, 'YEAR I': 1, 'YEAR 1': 1, 'YR 1': 1,
      '2': 2, 'II': 2, 'SECOND': 2, 'YEAR II': 2, 'YEAR 2': 2, 'YR 2': 2,
      '3': 3, 'III': 3, 'THIRD': 3, 'YEAR III': 3, 'YEAR 3': 3, 'YR 3': 3,
      '4': 4, 'IV': 4, 'FOURTH': 4, 'YEAR IV': 4, 'YEAR 4': 4, 'YR 4': 4,
      '5': 5, 'V': 5, '6': 6, 'VI': 6, '7': 7, 'VII': 7, '8': 8, 'VIII': 8,
    };
    if (map[s] !== undefined) return map[s];
    const num = parseInt(s.replace(/\D/g, ''), 10);
    return isNaN(num) ? -1 : num;
  };

  // Helper to normalize section names ('A', 'Section B', etc.)
  const normalizeSec = (sec: any): string => {
    if (!sec) return '';
    return String(sec).trim().toUpperCase().replace(/^SEC(TION)?\s*/i, '');
  };

  // Algorithm to extract faculty schedule strictly from approved timetables matching their assigned section
  const extractFacultyScheduleFromTimetables = async (facultyName: string, facultyId?: string) => {
    try {
      // 1. Resolve target faculty ID
      let targetFacultyId = facultyId;
      if (!targetFacultyId) {
        const { data: fm } = await (supabase as any)
          .from('faculty_members')
          .select('id')
          .eq('name', facultyName)
          .maybeSingle();
        targetFacultyId = fm?.id;
      }

      // 2. Fetch specific section assignments for this faculty from faculty_subject_assignments
      let facultyAssignments: any[] = [];
      if (targetFacultyId) {
        const { data: fsaData } = await (supabase as any)
          .from('faculty_subject_assignments')
          .select(`
            faculty_id,
            department_id,
            year,
            section,
            subjects!inner(id, name, abbreviation, code)
          `)
          .eq('faculty_id', targetFacultyId);
        facultyAssignments = fsaData || [];
      } else {
        const { data: fsaData } = await (supabase as any)
          .from('faculty_subject_assignments')
          .select(`
            faculty_id,
            department_id,
            year,
            section,
            faculty_members!inner(name),
            subjects!inner(id, name, abbreviation, code)
          `)
          .eq('faculty_members.name', facultyName);
        facultyAssignments = fsaData || [];
      }

      // 3. Fetch subjects where staff field is set to faculty
      let staffSubjects: any[] = [];
      try {
        const { data: sData } = await (supabase as any)
          .from('subjects')
          .select('id, name, abbreviation, code, department_id, year, staff')
          .or(`staff.eq.${facultyName}${targetFacultyId ? `,staff.eq.${targetFacultyId}` : ''}`);
        staffSubjects = sData || [];
      } catch (err) {
        console.warn('Could not fetch staff subjects:', err);
      }

      // 4. Fetch class counselor assignments
      let counselorData: any[] = [];
      if (targetFacultyId) {
        const { data: cData } = await (supabase as any)
          .from('class_counselors')
          .select('department_id, year, section')
          .eq('faculty_id', targetFacultyId);
        counselorData = cData || [];
      }

      // 5. Fetch all approved timetables
      const { data: timetables, error: ttError } = await (supabase as any)
        .from('timetables')
        .select(`
          department_id,
          year,
          section,
          grid_data,
          departments!inner(name)
        `)
        .order('updated_at', { ascending: false });

      if (ttError) throw ttError;
      if (!timetables) return { schedule: [], assignments: [] };

      const facultySchedule: FacultyScheduleItem[] = [];
      const subjectMap: Record<string, SubjectAssignment> = {};

      // 6. Process each timetable strictly checking class section specificity
      for (const timetable of timetables) {
        const { grid_data, department_id, year, section, departments } = timetable;
        if (!grid_data || !Array.isArray(grid_data)) continue;

        const ttDeptId = department_id;
        const ttYearNum = parseYearNum(year);
        const ttSecNorm = normalizeSec(section);
        const ttDeptName = departments?.name;

        // Class-specific subject assignments: ONLY matches if this timetable is the assigned section!
        const matchingAssignments = facultyAssignments.filter(a => {
          if (a.department_id !== ttDeptId) return false;
          if (parseYearNum(a.year) !== ttYearNum) return false;
          const aSec = normalizeSec(a.section);
          // If assignment specifies a section (e.g. 'B'), timetable MUST match that exact section!
          if (aSec && aSec !== 'ALL' && aSec !== ttSecNorm) return false;
          return true;
        });

        // Subjects table staff matches (fallback when no conflicting section assignment exists)
        const matchingStaffSubjects = staffSubjects.filter(s => {
          if (s.department_id !== ttDeptId) return false;
          if (parseYearNum(s.year) !== ttYearNum) return false;
          const hasSpecificAssignments = facultyAssignments.some(a => 
            a.department_id === ttDeptId && 
            parseYearNum(a.year) === ttYearNum && 
            a.subjects?.id === s.id
          );
          if (hasSpecificAssignments) return false;
          return true;
        });

        // Check if faculty is class counselor for this specific class
        const isClassCounselor = counselorData.some(c => 
          c.department_id === ttDeptId && 
          parseYearNum(c.year) === ttYearNum && 
          normalizeSec(c.section) === ttSecNorm
        );

        const hasAnyRole = matchingAssignments.length > 0 || matchingStaffSubjects.length > 0 || isClassCounselor;
        if (!hasAnyRole) continue;

        // Scan timetable grid
        grid_data.forEach((dayRow: any[], dayIndex: number) => {
          if (!Array.isArray(dayRow)) return;

          dayRow.forEach((cell: any, periodIndex: number) => {
            if (!cell || typeof cell !== 'string') return;
            const cellText = cell.trim();
            if (!cellText) return;

            let matchedSubjectName = '';
            let isSpecial = false;

            // Check counselor hour
            if (isClassCounselor && ['counselling', 'student counselling', 'counseling'].includes(cellText.toLowerCase())) {
              matchedSubjectName = 'Student Counselling';
              isSpecial = true;
            }

            // Check matching section assignments
            if (!matchedSubjectName) {
              for (const a of matchingAssignments) {
                const subj = a.subjects;
                if (!subj) continue;

                const sName = (subj.name || '').trim();
                const sAbbr = (subj.abbreviation || '').trim();
                const sCode = (subj.code || '').trim();

                let isMatch = false;
                if (sName && cellText.toLowerCase() === sName.toLowerCase()) {
                  isMatch = true;
                } else if (sAbbr && cellText.toLowerCase() === sAbbr.toLowerCase()) {
                  isMatch = true;
                } else if (sCode && cellText.toLowerCase() === sCode.toLowerCase()) {
                  isMatch = true;
                } else if (cellText.includes('/')) {
                  const parts = cellText.split('/').map(p => p.trim().toLowerCase());
                  if (parts.some(p => 
                    (sName && p === sName.toLowerCase()) || 
                    (sAbbr && p === sAbbr.toLowerCase()) || 
                    (sCode && p === sCode.toLowerCase())
                  )) {
                    isMatch = true;
                  }
                }

                if (isMatch) {
                  matchedSubjectName = sName;
                  isSpecial = ['Seminar', 'Library', 'Student Counselling'].includes(sName);
                  break;
                }
              }
            }

            // Check matching staff subjects if not already matched
            if (!matchedSubjectName) {
              for (const s of matchingStaffSubjects) {
                const sName = (s.name || '').trim();
                const sAbbr = (s.abbreviation || '').trim();
                const sCode = (s.code || '').trim();

                let isMatch = false;
                if (sName && cellText.toLowerCase() === sName.toLowerCase()) {
                  isMatch = true;
                } else if (sAbbr && cellText.toLowerCase() === sAbbr.toLowerCase()) {
                  isMatch = true;
                } else if (sCode && cellText.toLowerCase() === sCode.toLowerCase()) {
                  isMatch = true;
                } else if (cellText.includes('/')) {
                  const parts = cellText.split('/').map(p => p.trim().toLowerCase());
                  if (parts.some(p => 
                    (sName && p === sName.toLowerCase()) || 
                    (sAbbr && p === sAbbr.toLowerCase()) || 
                    (sCode && p === sCode.toLowerCase())
                  )) {
                    isMatch = true;
                  }
                }

                if (isMatch) {
                  matchedSubjectName = sName;
                  isSpecial = ['Seminar', 'Library', 'Student Counselling'].includes(sName);
                  break;
                }
              }
            }

            if (matchedSubjectName) {
              facultySchedule.push({
                subject: matchedSubjectName,
                day: dayIndex,
                period: periodIndex,
                year,
                section,
                department_name: ttDeptName,
                is_special: isSpecial
              });

              // Group by subject for assignments view
              if (!subjectMap[matchedSubjectName]) {
                subjectMap[matchedSubjectName] = {
                  subject: matchedSubjectName,
                  schedule: []
                };
              }

              subjectMap[matchedSubjectName].schedule.push({
                day: DAYS[dayIndex],
                period: PERIODS[periodIndex],
                year,
                section,
                department_name: ttDeptName
              });
            }
          });
        });
      }

      return {
        schedule: facultySchedule,
        assignments: Object.values(subjectMap)
      };
    } catch (error) {
      console.error('Error extracting faculty schedule:', error);
      throw error;
    }
  };

  const login = async () => {
    setLoading(true);
    try {
      const facultyMember = await getFacultyByEmail(email.trim());
      if (!facultyMember) {
        toast({ 
          title: "Not found", 
          description: "Faculty email not recognized.",
          variant: "destructive"
        });
        return;
      }

      setFaculty(facultyMember);
      setEditData({
        name: facultyMember.name,
        email: facultyMember.email || "",
        designation: facultyMember.designation || ""
      });

      // Extract faculty schedule from approved timetables matching exact assigned section
      const { schedule: facultySchedule, assignments } = await extractFacultyScheduleFromTimetables(facultyMember.name, facultyMember.id);
      setSchedule(facultySchedule);
      setSubjectAssignments(assignments);

      toast({ 
        title: "Welcome!", 
        description: `Logged in as ${facultyMember.name}`,
        variant: "default"
      });
    } catch (error: any) {
      toast({ 
        title: "Login failed", 
        description: error?.message || "Please try again",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!faculty) return;
    
    try {
      await updateFacultyMember(faculty.id, {
        name: editData.name,
        email: editData.email,
        designation: editData.designation
      });

      setFaculty({ ...faculty, ...editData });
      setEditOpen(false);
      toast({ 
        title: "Profile updated", 
        description: "Your information has been saved successfully."
      });
    } catch (error: any) {
      toast({ 
        title: "Update failed", 
        description: error?.message || "Please try again",
        variant: "destructive"
      });
    }
  };

  const handleSyncSchedule = async () => {
    setSyncing(true);
    try {
      if (!faculty) return;
      
      // Re-extract faculty schedule from approved timetables matching exact assigned section
      const { schedule: freshSchedule, assignments } = await extractFacultyScheduleFromTimetables(faculty.name, faculty.id);
      setSchedule(freshSchedule);
      setSubjectAssignments(assignments);
      
      toast({ 
        title: "Schedule synced!", 
        description: "Your schedule has been updated from approved timetables.",
        variant: "default"
      });
    } catch (error: any) {
      toast({ 
        title: "Sync failed", 
        description: error?.message || "Please try again",
        variant: "destructive"
      });
    } finally {
      setSyncing(false);
    }
  };

  // Create timetable grid from schedule data, merging sections when the same subject is taught simultaneously
  const createTimetableGrid = () => {
    const grid: { [day: number]: { [period: number]: FacultyScheduleItem } } = {};
    
    schedule.forEach(item => {
      if (!grid[item.day]) grid[item.day] = {};
      const existing = grid[item.day][item.period];
      if (existing) {
        // If it's the same subject, department and year, merge sections (e.g. "Sec A, C" for shared elective)
        if (existing.subject === item.subject && existing.department_name === item.department_name && existing.year === item.year) {
          const secs = existing.sections || [existing.section];
          if (!secs.includes(item.section)) {
            secs.push(item.section);
          }
          grid[item.day][item.period] = {
            ...existing,
            section: secs.sort().join(', '),
            sections: secs
          };
          return;
        }
      }
      grid[item.day][item.period] = { ...item, sections: [item.section] };
    });
    
    return grid;
  };

  const timetableGrid = createTimetableGrid();

  // Get unique subjects taught
  const uniqueSubjects = Array.from(
    new Set(schedule.filter(item => item.subject).map(item => item.subject!))
  ).sort();

  // Helper to parse year numbers for sorting
  const parseYr = (yr: string) => {
    const s = String(yr || '').trim().toUpperCase();
    const map: Record<string, number> = { 'I': 1, '1': 1, 'II': 2, '2': 2, 'III': 3, '3': 3, 'IV': 4, '4': 4 };
    return map[s] || parseInt(s.replace(/\D/g, ''), 10) || 999;
  };

  // Get unique classes taught with department info, sorted naturally
  const uniqueClasses = Array.from(
    new Set(schedule.map(item => `${item.department_name || 'Unknown'} - Year ${item.year} - Section ${item.section}`))
  ).sort((a, b) => {
    const partsA = a.split(' - ');
    const partsB = b.split(' - ');
    const deptComp = (partsA[0] || '').localeCompare(partsB[0] || '');
    if (deptComp !== 0) return deptComp;
    const yrComp = parseYr(partsA[1]?.replace('Year ', '')) - parseYr(partsB[1]?.replace('Year ', ''));
    if (yrComp !== 0) return yrComp;
    return (partsA[2] || '').localeCompare(partsB[2] || '');
  });

  // Get unique departments taught
  const uniqueDepartments = Array.from(
    new Set(schedule.map(item => item.department_name || 'Unknown'))
  ).filter(dept => dept !== 'Unknown').sort();

  // Get unique years taught, sorted naturally (I, II, III, IV)
  const uniqueYears = Array.from(
    new Set(schedule.map(item => item.year))
  ).sort((a, b) => parseYr(a) - parseYr(b));

  // Get unique sections taught, sorted alphabetically
  const uniqueSections = Array.from(
    new Set(schedule.map(item => item.section))
  ).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));

  // Get total teaching hours per week
  const totalHours = schedule.filter(item => !item.is_special).length;
  const totalSpecialHours = schedule.filter(item => item.is_special).length;

  // ─── Glassmorphic style tokens ────────────────────────────────────────
  const glassCard = isDark
    ? "bg-[#090d1c]/80 backdrop-blur-2xl border border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_12px_-2px_rgba(99,102,241,0.12)]"
    : "bg-white/80 backdrop-blur-2xl border border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06),0_0_10px_-2px_rgba(99,102,241,0.05)]";

  const innerCard = isDark
    ? "bg-white/[0.03] border-indigo-500/15"
    : "bg-indigo-50/40 border-indigo-100/80";

  if (!faculty) {
    // Redirect to main login page - faculty login is handled there
    navigate("/", { replace: true });
    return null;
  }

  return (
    <div className={`min-h-screen relative overflow-x-hidden transition-colors duration-300 ${
      isDark ? "bg-[#060814] text-white" : "bg-[#f8faff] text-slate-900"
    }`}>
      {/* Ambient background refraction orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {isDark ? (
          <>
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-br from-indigo-600/10 via-purple-600/08 to-transparent blur-3xl opacity-70" />
            <div className="absolute top-1/3 -right-20 w-80 h-80 rounded-full bg-gradient-to-bl from-cyan-600/08 via-indigo-600/08 to-transparent blur-3xl opacity-60" />
            <div className="absolute -bottom-20 left-1/3 w-96 h-96 rounded-full bg-gradient-to-tr from-purple-600/08 via-indigo-600/06 to-transparent blur-3xl opacity-50" />
          </>
        ) : (
          <>
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-br from-indigo-200/40 via-purple-200/30 to-transparent blur-3xl opacity-75" />
            <div className="absolute top-1/4 -right-20 w-80 h-80 rounded-full bg-gradient-to-bl from-purple-200/35 via-indigo-100/40 to-transparent blur-3xl opacity-65" />
            <div className="absolute -bottom-20 left-1/3 w-96 h-96 rounded-full bg-gradient-to-tr from-indigo-100/40 via-purple-100/30 to-transparent blur-3xl opacity-50" />
          </>
        )}
      </div>

      <Navbar />

      <main className="pt-16 md:pt-16 transition-all duration-300 relative z-10">
        <section className="max-w-7xl mx-auto px-6 sm:px-8 py-8 md:py-10 space-y-8">

          {/* ── Header Banner ─────────────────────────────────────── */}
          <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-5 p-6 rounded-2xl ${glassCard}`}>
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-400/30 to-transparent" />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full border ${
                  isDark
                    ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/25"
                    : "bg-indigo-50 text-indigo-700 border-indigo-200"
                }`}>
                  <Sparkles className="h-3 w-3 inline mr-1" />
                  Faculty Portal
                </span>
              </div>
              <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                isDark ? "text-white" : "bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 bg-clip-text text-transparent"
              }`}>
                Welcome, {faculty.name}
              </h1>
              <p className={`text-xs sm:text-sm mt-1 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Your personal timetable, teaching assignments, and profile overview.
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 self-start md:self-center">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncSchedule}
                disabled={syncing}
                className={`h-9 px-4 rounded-xl text-xs font-semibold border transition-all ${
                  isDark ? "border-indigo-500/20 bg-white/5 hover:bg-white/10 text-slate-300" : "border-indigo-200/80 bg-white hover:bg-indigo-50 text-slate-700"
                }`}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync'}
              </Button>
              <Button
                size="sm"
                onClick={() => navigate("/faculty/csv-upload")}
                className="h-9 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-sm shadow-indigo-500/25 border border-indigo-400/30"
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                CSV Upload
              </Button>
            </div>
          </div>

          {/* ── Stats Cards Row ────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Regular Hours */}
            <div className={`relative rounded-2xl p-6 overflow-hidden ${glassCard}`}>
              <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-400/30 to-transparent" />
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Teaching Hours
                </span>
                <Clock className={`h-4 w-4 ${isDark ? "text-indigo-400" : "text-indigo-600"}`} />
              </div>
              <div className={`text-3xl sm:text-4xl font-black mt-2 tracking-tight ${isDark ? "text-indigo-300" : "text-indigo-600"}`}>
                {totalHours}
              </div>
              <p className={`text-[11px] mt-1.5 font-medium ${isDark ? "text-indigo-300/70" : "text-indigo-600/80"}`}>
                Regular periods/week
              </p>
            </div>

            {/* Special Hours */}
            <div className={`relative rounded-2xl p-6 overflow-hidden ${glassCard}`}>
              <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-amber-400/30 to-transparent" />
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Special Hours
                </span>
                <Shield className={`h-4 w-4 ${isDark ? "text-amber-400" : "text-amber-600"}`} />
              </div>
              <div className={`text-3xl sm:text-4xl font-black mt-2 tracking-tight ${isDark ? "text-amber-300" : "text-amber-600"}`}>
                {totalSpecialHours}
              </div>
              <p className={`text-[11px] mt-1.5 font-medium ${isDark ? "text-amber-300/70" : "text-amber-700/80"}`}>
                Seminar, Library, etc.
              </p>
            </div>

            {/* Subjects */}
            <div className={`relative rounded-2xl p-6 overflow-hidden ${glassCard}`}>
              <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Subjects
                </span>
                <BookOpen className={`h-4 w-4 ${isDark ? "text-cyan-400" : "text-cyan-600"}`} />
              </div>
              <div className={`text-3xl sm:text-4xl font-black mt-2 tracking-tight ${isDark ? "text-cyan-300" : "text-cyan-600"}`}>
                {uniqueSubjects.length}
              </div>
              <p className={`text-[11px] mt-1.5 font-medium ${isDark ? "text-cyan-300/70" : "text-cyan-700/80"}`}>
                Assigned subjects
              </p>
            </div>

            {/* Classes */}
            <div className={`relative rounded-2xl p-6 overflow-hidden ${glassCard}`}>
              <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-purple-400/30 to-transparent" />
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Classes
                </span>
                <Building2 className={`h-4 w-4 ${isDark ? "text-purple-400" : "text-purple-600"}`} />
              </div>
              <div className={`text-3xl sm:text-4xl font-black mt-2 tracking-tight ${isDark ? "text-purple-300" : "text-purple-600"}`}>
                {uniqueClasses.length}
              </div>
              <p className={`text-[11px] mt-1.5 font-medium ${isDark ? "text-purple-300/70" : "text-purple-700/80"}`}>
                Yr/Sec combinations
              </p>
            </div>
          </div>

          {/* ── Profile + Quick Info Row ────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Faculty Profile Card */}
            <div className={`relative rounded-2xl p-6 overflow-hidden ${glassCard}`}>
              <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-400/30 to-transparent" />
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className={`h-9 w-9 rounded-xl flex items-center justify-center border ${
                    isDark ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-400" : "bg-indigo-50 border-indigo-200 text-indigo-600"
                  }`}>
                    <User className="h-4.5 w-4.5" />
                  </div>
                  <h3 className={`text-sm font-bold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    Profile
                  </h3>
                </div>
                <Dialog open={editOpen} onOpenChange={setEditOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className={`h-8 px-2.5 rounded-xl text-xs font-semibold border transition-all ${
                      isDark ? "border-indigo-500/20 bg-white/5 hover:bg-white/10 text-slate-300" : "border-indigo-200/80 bg-white hover:bg-indigo-50 text-slate-700"
                    }`}>
                      <Edit className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                  </DialogTrigger>
                  <DialogContent className={`rounded-2xl border backdrop-blur-2xl shadow-2xl ${
                    isDark ? "bg-[#0a0e1e]/95 border-indigo-500/25 text-white" : "bg-white/95 border-indigo-200/80 text-slate-900"
                  }`}>
                    <DialogHeader>
                      <DialogTitle className="text-lg font-bold">Edit Profile</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label htmlFor="edit-name" className={`text-xs font-semibold uppercase tracking-wide ${isDark ? "text-slate-400" : "text-slate-500"}`}>Name</Label>
                        <Input
                          id="edit-name"
                          value={editData.name}
                          onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                          className={`mt-1.5 rounded-xl h-10 border ${isDark ? "bg-white/[0.04] border-indigo-500/25 text-white" : "bg-white border-indigo-200"}`}
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-email" className={`text-xs font-semibold uppercase tracking-wide ${isDark ? "text-slate-400" : "text-slate-500"}`}>Email</Label>
                        <Input
                          id="edit-email"
                          type="email"
                          value={editData.email}
                          onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                          className={`mt-1.5 rounded-xl h-10 border ${isDark ? "bg-white/[0.04] border-indigo-500/25 text-white" : "bg-white border-indigo-200"}`}
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-designation" className={`text-xs font-semibold uppercase tracking-wide ${isDark ? "text-slate-400" : "text-slate-500"}`}>Designation</Label>
                        <Input
                          id="edit-designation"
                          value={editData.designation}
                          onChange={(e) => setEditData({ ...editData, designation: e.target.value })}
                          className={`mt-1.5 rounded-xl h-10 border ${isDark ? "bg-white/[0.04] border-indigo-500/25 text-white" : "bg-white border-indigo-200"}`}
                        />
                      </div>
                      <Button onClick={handleUpdateProfile} className="w-full h-10 rounded-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-sm shadow-indigo-500/25 border border-indigo-400/30">
                        Save Changes
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="space-y-4">
                <div className={`p-3.5 rounded-xl border ${innerCard}`}>
                  <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDark ? "text-slate-400" : "text-slate-500"}`}>Full Name</span>
                  <span className={`text-sm font-bold mt-0.5 block ${isDark ? "text-white" : "text-slate-900"}`}>{faculty.name}</span>
                </div>
                <div className={`p-3.5 rounded-xl border ${innerCard}`}>
                  <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDark ? "text-slate-400" : "text-slate-500"}`}>Email</span>
                  <span className={`text-sm font-bold mt-0.5 block break-all ${isDark ? "text-indigo-300" : "text-indigo-700"}`}>{faculty.email || 'Not provided'}</span>
                </div>
                <div className={`p-3.5 rounded-xl border ${innerCard}`}>
                  <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDark ? "text-slate-400" : "text-slate-500"}`}>Designation</span>
                  <span className={`text-sm font-bold mt-0.5 block ${isDark ? "text-white" : "text-slate-900"}`}>{faculty.designation || 'Not specified'}</span>
                </div>
              </div>
            </div>

            {/* Subjects & Departments Card */}
            <div className={`relative rounded-2xl p-6 overflow-hidden ${glassCard}`}>
              <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
              <div className="flex items-center gap-2.5 mb-5">
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center border ${
                  isDark ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-400" : "bg-cyan-50 border-cyan-200 text-cyan-600"
                }`}>
                  <BookOpen className="h-4.5 w-4.5" />
                </div>
                <h3 className={`text-sm font-bold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  Subjects & Classes
                </h3>
              </div>

              <div className="space-y-4">
                <div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider block mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Subjects Taught</span>
                  <div className="flex flex-wrap gap-1.5">
                    {uniqueSubjects.length > 0 ? uniqueSubjects.map(subject => (
                      <span key={subject} className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                        isDark ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" : "bg-indigo-50 text-indigo-700 border-indigo-200"
                      }`}>
                        {subject}
                      </span>
                    )) : (
                      <span className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>No subjects assigned</span>
                    )}
                  </div>
                </div>

                <div className={`border-t pt-4 ${isDark ? "border-indigo-500/15" : "border-indigo-100"}`}>
                  <span className={`text-[10px] font-bold uppercase tracking-wider block mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Departments</span>
                  <div className="flex flex-wrap gap-1.5">
                    {uniqueDepartments.length > 0 ? uniqueDepartments.map(dept => (
                      <span key={dept} className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                        isDark ? "bg-purple-500/15 text-purple-300 border-purple-500/30" : "bg-purple-50 text-purple-700 border-purple-200"
                      }`}>
                        {dept}
                      </span>
                    )) : (
                      <span className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>None</span>
                    )}
                  </div>
                </div>

                <div className={`border-t pt-4 ${isDark ? "border-indigo-500/15" : "border-indigo-100"}`}>
                  <span className={`text-[10px] font-bold uppercase tracking-wider block mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Classes</span>
                  <div className="flex flex-wrap gap-1.5">
                    {uniqueClasses.length > 0 ? uniqueClasses.map(classInfo => {
                      const parts = classInfo.split(' - ');
                      return (
                        <span key={classInfo} className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                          isDark ? "bg-white/5 text-slate-300 border-white/10" : "bg-slate-100 text-slate-700 border-slate-200"
                        }`}>
                          {parts[1]} {parts[2]}
                        </span>
                      );
                    }) : (
                      <span className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>None</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Roles & Quick Stats */}
            <div className={`relative rounded-2xl p-6 overflow-hidden ${glassCard}`}>
              <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" />
              <div className="flex items-center gap-2.5 mb-5">
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center border ${
                  isDark ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-600"
                }`}>
                  <BarChart3 className="h-4.5 w-4.5" />
                </div>
                <h3 className={`text-sm font-bold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  Roles & Overview
                </h3>
              </div>

              <div className="space-y-4">
                <div className={`p-3.5 rounded-xl border flex items-center justify-between ${innerCard}`}>
                  <span className={`text-xs font-bold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Class Counselor</span>
                  {schedule.some(item => item.is_special && ['Student Counselling', 'Counselling'].includes(item.subject || '')) ? (
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                      isDark ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}>
                      <CheckCircle className="h-3 w-3 inline mr-1" />
                      Yes
                    </span>
                  ) : (
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                      isDark ? "bg-white/5 text-slate-400 border-white/10" : "bg-slate-100 text-slate-500 border-slate-200"
                    }`}>
                      <X className="h-3 w-3 inline mr-1" />
                      No
                    </span>
                  )}
                </div>

                <div className={`p-3.5 rounded-xl border flex items-center justify-between ${innerCard}`}>
                  <span className={`text-xs font-bold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Elective Teaching</span>
                  {schedule.some(item => item.subject && item.subject.toLowerCase().includes('elective')) ? (
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                      isDark ? "bg-purple-500/15 text-purple-300 border-purple-500/30" : "bg-purple-50 text-purple-700 border-purple-200"
                    }`}>
                      <GraduationCap className="h-3 w-3 inline mr-1" />
                      Active
                    </span>
                  ) : (
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                      isDark ? "bg-white/5 text-slate-400 border-white/10" : "bg-slate-100 text-slate-500 border-slate-200"
                    }`}>
                      <X className="h-3 w-3 inline mr-1" />
                      None
                    </span>
                  )}
                </div>

                <div className={`border-t pt-4 ${isDark ? "border-indigo-500/15" : "border-indigo-100"}`}>
                  <span className={`text-[10px] font-bold uppercase tracking-wider block mb-3 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Weekly Breakdown</span>
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className={`text-center p-3 rounded-xl border ${innerCard}`}>
                      <div className={`text-lg font-black ${isDark ? "text-indigo-300" : "text-indigo-600"}`}>{uniqueDepartments.length}</div>
                      <div className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Depts</div>
                    </div>
                    <div className={`text-center p-3 rounded-xl border ${innerCard}`}>
                      <div className={`text-lg font-black ${isDark ? "text-cyan-300" : "text-cyan-600"}`}>{uniqueYears.length}</div>
                      <div className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Years</div>
                    </div>
                    <div className={`text-center p-3 rounded-xl border ${innerCard}`}>
                      <div className={`text-lg font-black ${isDark ? "text-purple-300" : "text-purple-600"}`}>{uniqueSections.length}</div>
                      <div className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Secs</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Personal Timetable ─────────────────────────────── */}
          <div className={`relative rounded-2xl p-6 overflow-hidden ${glassCard}`}>
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-400/30 to-transparent" />

            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2.5">
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center border ${
                  isDark ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-400" : "bg-indigo-50 border-indigo-200 text-indigo-600"
                }`}>
                  <Calendar className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h2 className={`text-base font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                    Your Personal Timetable
                  </h2>
                  <p className={`text-[11px] font-medium ${isDark ? "text-indigo-400/70" : "text-indigo-600/80"}`}>
                    6-day weekly schedule with {totalHours + totalSpecialHours} allocated periods
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncSchedule}
                disabled={syncing}
                className={`h-9 px-4 rounded-xl text-xs font-semibold border transition-all ${
                  isDark ? "border-indigo-500/20 bg-white/5 hover:bg-white/10 text-slate-300" : "border-indigo-200/80 bg-white hover:bg-indigo-50 text-slate-700"
                }`}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Schedule'}
              </Button>
            </div>

            <div className="overflow-x-auto -mx-2 px-2">
              <table className={`w-full border-collapse rounded-2xl overflow-hidden shadow-sm border ${
                isDark ? "border-indigo-500/20" : "border-indigo-200"
              }`}>
                <thead>
                  <tr className={isDark ? "bg-[#0c1226]" : "bg-indigo-50/70"}>
                    <th className={`border p-3.5 text-xs font-bold text-center uppercase tracking-wider ${
                      isDark ? "border-indigo-500/20 text-indigo-300" : "border-indigo-200 text-indigo-900"
                    }`}>
                      <Clock className="h-3.5 w-3.5 mx-auto mb-1 text-indigo-400" />
                      Day / Period
                    </th>
                    {PERIODS.map((period, idx) => (
                      <th key={period} className={`border p-3 text-center font-bold min-w-[120px] ${
                        isDark ? "border-indigo-500/20" : "border-indigo-200"
                      }`}>
                        <div className={`text-xs font-extrabold uppercase tracking-wider ${isDark ? "text-indigo-400" : "text-indigo-500"}`}>{period}</div>
                        <div className={`text-[10px] font-normal mt-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                          {TIME_SLOTS[idx]}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((day, dayIdx) => (
                    <tr key={day} className={`transition-colors ${
                      isDark ? "hover:bg-white/[0.02]" : "hover:bg-indigo-50/30"
                    }`}>
                      <td className={`border p-3.5 font-bold text-center ${
                        isDark ? "border-indigo-500/20 bg-indigo-500/5 text-indigo-200" : "border-indigo-200 bg-indigo-50/40 text-indigo-900"
                      }`}>
                        <div className="text-xs font-extrabold">{day}</div>
                      </td>
                      {PERIODS.map((_, periodIdx) => {
                        const scheduleItem = timetableGrid[dayIdx]?.[periodIdx];
                        return (
                          <td key={periodIdx} className={`border p-1.5 ${
                            isDark ? "border-indigo-500/20" : "border-indigo-200"
                          }`}>
                            <div
                              className={`h-20 rounded-xl flex flex-col items-center justify-center text-center text-xs p-2 transition-all hover:scale-[1.02] ${
                                scheduleItem
                                  ? scheduleItem.is_special
                                    ? isDark
                                      ? 'bg-amber-500/15 border border-amber-400/30 text-amber-200 shadow-[0_0_12px_-2px_rgba(245,158,11,0.25)]'
                                      : 'bg-amber-50/90 border border-amber-200 text-amber-900 shadow-xs'
                                    : isDark
                                      ? 'bg-indigo-500/15 border border-indigo-400/30 text-indigo-200 shadow-[0_0_12px_-2px_rgba(99,102,241,0.25)]'
                                      : 'bg-indigo-50/90 border border-indigo-200 text-indigo-900 shadow-xs'
                                  : isDark
                                    ? 'bg-emerald-500/5 border border-emerald-500/10 text-emerald-400/60'
                                    : 'bg-emerald-50/30 border border-emerald-100 text-emerald-500/70'
                              }`}
                            >
                              {scheduleItem ? (
                                <>
                                  <div className="font-extrabold text-xs mb-1 line-clamp-2">{scheduleItem.subject}</div>
                                  <div className="text-[10px] opacity-80 font-medium leading-tight">
                                    {scheduleItem.department_name || 'Dept'}
                                    <br />
                                    Yr {scheduleItem.year} - Sec {scheduleItem.section}
                                  </div>
                                </>
                              ) : (
                                <div className="font-semibold">
                                  <div className="text-sm leading-none mb-0.5">✓</div>
                                  <div className="text-[10px] uppercase tracking-wider font-bold">Free Hour</div>
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Timetable Legend */}
            <div className="mt-5 flex flex-wrap gap-5 justify-center text-xs">
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-md border ${isDark ? "bg-indigo-500/20 border-indigo-500/40" : "bg-indigo-100 border-indigo-300"}`}></div>
                <span className={`font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Regular Classes</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-md border ${isDark ? "bg-amber-500/20 border-amber-500/40" : "bg-amber-100 border-amber-300"}`}></div>
                <span className={`font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Special Activities</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-md border ${isDark ? "bg-emerald-500/10 border-emerald-500/20" : "bg-emerald-50 border-emerald-200"}`}></div>
                <span className={`font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Free Periods</span>
              </div>
            </div>
          </div>

          {/* ── Subject Assignments ────────────────────────────── */}
          {subjectAssignments.length > 0 && (
            <div className={`relative rounded-2xl p-6 overflow-hidden ${glassCard}`}>
              <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-purple-400/30 to-transparent" />

              <div className="flex items-center gap-2.5 mb-6">
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center border ${
                  isDark ? "bg-purple-500/15 border-purple-500/30 text-purple-400" : "bg-purple-50 border-purple-200 text-purple-600"
                }`}>
                  <BookOpen className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h2 className={`text-base font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                    Subject & Faculty Assignments
                  </h2>
                  <p className={`text-[11px] font-medium ${isDark ? "text-purple-400/70" : "text-purple-600/80"}`}>
                    Detailed schedule breakdown by subject
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {subjectAssignments.map((assignment, index) => (
                  <div key={index} className={`rounded-2xl p-5 border transition-all hover:scale-[1.01] ${
                    isDark
                      ? "bg-white/[0.03] border-indigo-500/15 hover:border-indigo-400/30"
                      : "bg-indigo-50/30 border-indigo-100/80 hover:border-indigo-200"
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className={`text-sm font-bold ${isDark ? 'text-indigo-300' : 'text-indigo-900'}`}>{assignment.subject}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        isDark ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" : "bg-indigo-50 text-indigo-700 border-indigo-200"
                      }`}>
                        {assignment.schedule.length} slots
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mb-3">
                      <User className={`h-3 w-3 ${isDark ? "text-slate-400" : "text-slate-500"}`} />
                      <span className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>{faculty.name}</span>
                    </div>

                    <div className="space-y-2">
                      {Array.from(new Set(assignment.schedule.map(item => `${item.department_name || 'Unknown'}-${item.year}-${item.section}`))).map(classKey => {
                        const classSchedule = assignment.schedule.filter(item => `${item.department_name || 'Unknown'}-${item.year}-${item.section}` === classKey);
                        return (
                          <div key={classKey} className={`rounded-xl p-3 border ${
                            isDark ? "bg-[#090e1f]/60 border-indigo-500/10" : "bg-white/80 border-indigo-100/50"
                          }`}>
                            <div className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                              {classSchedule[0].department_name || 'Department'} • Year {classSchedule[0].year} - Sec {classSchedule[0].section}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {classSchedule.map((scheduleItem, scheduleIndex) => (
                                <span
                                  key={scheduleIndex}
                                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                                    isDark ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300" : "bg-indigo-50 border-indigo-200 text-indigo-800"
                                  }`}
                                >
                                  {scheduleItem.day} - {scheduleItem.period}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </section>
      </main>
    </div>
  );
};

export default FacultyDashboard;
