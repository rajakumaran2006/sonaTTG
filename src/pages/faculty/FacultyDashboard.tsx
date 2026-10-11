import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/navbar/facultyadmin";  
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  FacultyMember, 
  updateFacultyMember,
} from "@/lib/supabaseService";
import { 
  getFacultyWeeklySchedule, 
  FacultyWeeklyScheduleResult,
  FacultyPeriodSlot
} from "@/lib/facultyScheduleService";
import { getFullDepartmentName, getDeptShortName } from "@/lib/timetablePdfExport";
import { 
  RefreshCw, 
  Edit3,
  Sun,
  Moon,
  Sparkles,
  Calendar
} from "lucide-react";

const DAYS_SHORT = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];

const areSlotsEqual = (a: FacultyPeriodSlot | null, b: FacultyPeriodSlot | null): boolean => {
  if (!a || !b) return false;
  const classA = `${a.department_name}_${a.year}_${a.cleanSection || a.section}_${a.subject}`;
  const classB = `${b.department_name}_${b.year}_${b.cleanSection || b.section}_${b.subject}`;
  return classA === classB;
};

const FacultyDashboard = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [faculty, setFaculty] = useState<FacultyMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState({ name: "", email: "", designation: "" });
  const [semesterType, setSemesterType] = useState<'odd' | 'even'>('odd');
  const [fullSchedule, setFullSchedule] = useState<FacultyWeeklyScheduleResult | null>(null);

  const loadScheduleData = async (fac: FacultyMember, sem: 'odd' | 'even') => {
    try {
      setLoading(true);
      const res = await getFacultyWeeklySchedule(fac.id, fac.name, sem, fac.department_id);
      setFullSchedule(res);
    } catch (e) {
      console.error("Failed to load faculty schedule", e);
      toast({
        title: "Load Error",
        description: "Failed to load faculty schedule",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = "Faculty Timetable | SonaTTG";
    
    const storedFaculty = localStorage.getItem("facultyUser");
    if (!storedFaculty) {
      navigate("/", { replace: true });
      return;
    }

    try {
      const parsedFaculty = JSON.parse(storedFaculty);
      setFaculty(parsedFaculty);
      setEditData({
        name: parsedFaculty.name || "",
        email: parsedFaculty.email || "",
        designation: parsedFaculty.designation || ""
      });
      loadScheduleData(parsedFaculty, semesterType);
    } catch (e) {
      console.error("Failed to parse stored faculty user", e);
      localStorage.removeItem("facultyUser");
      navigate("/", { replace: true });
    }
  }, [semesterType, navigate]);

  // Real-time synchronization on timetable changes
  useEffect(() => {
    if (!faculty) return;
    const channel = supabase
      .channel(`faculty-live-updates-${faculty.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'timetables' }, () => {
        loadScheduleData(faculty, semesterType);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'faculty_subject_assignments' }, () => {
        loadScheduleData(faculty, semesterType);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_counselors' }, () => {
        loadScheduleData(faculty, semesterType);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [faculty, semesterType]);

  const handleUpdateProfile = async () => {
    if (!faculty) return;
    
    try {
      await updateFacultyMember(faculty.id, {
        name: editData.name,
        email: editData.email,
        designation: editData.designation
      });

      const updated = { ...faculty, ...editData };
      setFaculty(updated);
      localStorage.setItem("facultyUser", JSON.stringify(updated));
      setEditOpen(false);
      toast({ 
        title: "Profile updated", 
        description: "Your information has been saved successfully."
      });
      // Refresh schedule with updated name
      loadScheduleData(updated, semesterType);
    } catch (error: any) {
      toast({ 
        title: "Update failed", 
        description: error?.message || "Please try again",
        variant: "destructive"
      });
    }
  };

  const handleSyncSchedule = async () => {
    if (!faculty) return;
    setSyncing(true);
    try {
      await loadScheduleData(faculty, semesterType);
      toast({ 
        title: "Schedule synchronized", 
        description: `Your ${semesterType.toUpperCase()} semester schedule is up to date.`,
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

  if (!faculty) {
    return null;
  }

  const deptName = fullSchedule?.faculty.department_name || faculty.department_id || "ENGINEERING";
  const fullDept = getFullDepartmentName(deptName);
  const deptShort = getDeptShortName(deptName);
  const semLabel = semesterType === 'even' ? 'EVEN SEMESTER' : 'ODD SEMESTER';
  const acadYear = '2026 - 2027';

  // Helper to render merged cells exactly as in PDF generator
  const renderMergedPeriodCells = (
    startIndex: number,
    endIndex: number,
    dayRow: (FacultyPeriodSlot | null)[]
  ) => {
    const cells = [];
    let i = startIndex;

    while (i <= endIndex) {
      const slot = dayRow ? dayRow[i] : null;

      if (!slot) {
        cells.push(
          <td
            key={i}
            className="border border-black p-2 text-center text-xs h-16 min-h-[64px] bg-white align-middle"
          >
            &nbsp;
          </td>
        );
        i++;
        continue;
      }

      let span = 1;
      while (i + span <= endIndex && areSlotsEqual(slot, dayRow[i + span])) {
        span++;
      }

      let slotDeptShort = getDeptShortName(slot.department_name);
      if (!slotDeptShort || slotDeptShort === 'DEPT') {
        const c = (slot.code || '').toUpperCase();
        if (c.includes('ADS') || c.includes('AID')) slotDeptShort = 'AI&DS';
        else if (c.includes('IT')) slotDeptShort = 'IT';
        else if (c.includes('CSE') || c.includes('CS')) slotDeptShort = 'CSE';
        else if (c.includes('ECE') || c.includes('EC')) slotDeptShort = 'ECE';
        else if (c.includes('EEE') || c.includes('EE')) slotDeptShort = 'EEE';
        else if (c.includes('MECH') || c.includes('ME')) slotDeptShort = 'MECH';
        else if (c.includes('CIVIL') || c.includes('CE')) slotDeptShort = 'CIVIL';
      }
      const deptPart = slotDeptShort && slotDeptShort !== 'DEPT' ? ` ${slotDeptShort}` : '';
      const ccSuffix = slot.is_counselor_hour ? ' (CC)' : '';
      const extSuffix = slot.is_external ? ' (Ext)' : '';
      const classInfo = `Yr ${slot.year}${deptPart} - Sec ${slot.cleanSection || slot.section}${ccSuffix}${extSuffix}`;
      const subjectName = slot.subject || slot.rawCellText || '';

      cells.push(
        <td
          key={i}
          colSpan={span}
          className="border border-black p-1.5 text-center text-xs h-16 min-h-[64px] bg-white align-middle"
        >
          <div className="font-bold text-[11px] leading-tight text-black">
            {classInfo}
          </div>
          <div className="text-[10px] leading-tight text-black mt-1 font-normal">
            {subjectName}
          </div>
        </td>
      );

      i += span;
    }

    return cells;
  };

  return (
    <div className="min-h-screen bg-slate-100/80 text-black font-sans pb-16">
      {/* Navbar (hidden during print) */}
      <div className="print:hidden">
        <Navbar />
      </div>

      <main className="pt-20 print:pt-0 max-w-6xl mx-auto px-4 sm:px-6">
        
        {/* ── Top Floating Toolbar (Hidden during print) ──────────────────── */}
        <div className="print:hidden mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Semester:
            </span>
            <div className="bg-slate-100 p-1 rounded-lg flex items-center border border-slate-200">
              <button
                type="button"
                onClick={() => setSemesterType('odd')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  semesterType === 'odd'
                    ? "bg-white text-indigo-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                Odd Semester
              </button>
              <button
                type="button"
                onClick={() => setSemesterType('even')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  semesterType === 'even'
                    ? "bg-white text-indigo-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Moon className="w-3.5 h-3.5 text-indigo-500" />
                Even Semester
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-9 px-3 rounded-lg text-xs font-semibold border-slate-300 bg-white hover:bg-slate-50 text-slate-800"
                >
                  <Edit3 className="w-3.5 h-3.5 mr-1.5 text-slate-600" />
                  Edit Profile
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-xl border border-slate-200 bg-white shadow-xl max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-base font-bold text-slate-900">Edit Faculty Profile</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label htmlFor="edit-name" className="text-xs font-semibold uppercase text-slate-600">
                      Full Name
                    </Label>
                    <Input
                      id="edit-name"
                      value={editData.name}
                      onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                      className="mt-1 rounded-lg h-9 border-slate-300"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-email" className="text-xs font-semibold uppercase text-slate-600">
                      Email Address
                    </Label>
                    <Input
                      id="edit-email"
                      type="email"
                      value={editData.email}
                      onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                      className="mt-1 rounded-lg h-9 border-slate-300"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-designation" className="text-xs font-semibold uppercase text-slate-600">
                      Designation
                    </Label>
                    <Input
                      id="edit-designation"
                      value={editData.designation}
                      onChange={(e) => setEditData({ ...editData, designation: e.target.value })}
                      placeholder="e.g. Assistant Professor, Associate Professor"
                      className="mt-1 rounded-lg h-9 border-slate-300"
                    />
                  </div>
                  <Button 
                    onClick={handleUpdateProfile} 
                    className="w-full h-9 rounded-lg font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    Save Changes
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncSchedule}
              disabled={syncing}
              className="h-9 px-3 rounded-lg text-xs font-semibold border-slate-300 bg-white hover:bg-slate-50 text-slate-800"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 text-indigo-600 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync'}
            </Button>

          </div>
        </div>

        {/* ── Official Institutional Document Sheet (Matching PDF format) ── */}
        <div className="bg-white border border-slate-300 shadow-md p-6 sm:p-10 rounded-sm print:border-none print:shadow-none print:p-0 print:m-0">
          
          {/* 1. Official Header Block */}
          <div className="text-center space-y-0.5 mb-2 font-serif sm:font-sans">
            <h1 className="font-bold text-base sm:text-lg text-black tracking-tight leading-tight">
              SONA COLLEGE OF TECHNOLOGY (Autonomous), SALEM-5
            </h1>
            <h2 className="font-bold text-xs sm:text-sm text-black uppercase tracking-tight leading-tight">
              DEPARTMENT OF {fullDept.toUpperCase()}
            </h2>
            <div className="font-bold text-xs text-black leading-tight">
              ACADEMIC YEAR: {acadYear} &nbsp;|&nbsp; {semLabel}
            </div>
            <div className="font-bold text-xs text-black leading-tight">
              FACULTY INDIVIDUAL TIMETABLE
            </div>
            <div className="font-bold text-xs sm:text-sm text-black underline pt-0.5 uppercase">
              {faculty.name} ({(faculty.designation || 'FACULTY').toUpperCase()})
            </div>
          </div>


          {loading ? (
            <div className="py-20 text-center text-slate-500 font-medium">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
              Loading faculty schedule...
            </div>
          ) : !fullSchedule ? (
            <div className="py-20 text-center text-slate-500 font-medium">
              No schedule records found for this faculty member.
            </div>
          ) : (
            <>
              {/* 2. Official Timetable Grid Table (Exact 9 Columns as in PDF) */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-black text-black">
                  <thead>
                    {/* Header Row 1: Time, 1..4, 12.55 (Lunch top), 5..7 */}
                    <tr className="bg-white">
                      <th className="border border-black p-1 text-center font-bold text-xs w-16">
                        Time
                      </th>
                      <th className="border border-black p-1 text-center font-bold text-xs min-w-[95px]">
                        1
                      </th>
                      <th className="border border-black p-1 text-center font-bold text-xs min-w-[95px]">
                        2
                      </th>
                      <th className="border border-black p-1 text-center font-bold text-xs min-w-[95px]">
                        3
                      </th>
                      <th className="border border-black p-1 text-center font-bold text-xs min-w-[95px]">
                        4
                      </th>
                      <th className="border border-black p-1 text-center font-bold text-[11px] w-12 bg-white">
                        12.55
                      </th>
                      <th className="border border-black p-1 text-center font-bold text-xs min-w-[95px]">
                        5
                      </th>
                      <th className="border border-black p-1 text-center font-bold text-xs min-w-[95px]">
                        6
                      </th>
                      <th className="border border-black p-1 text-center font-bold text-xs min-w-[95px]">
                        7
                      </th>
                    </tr>

                    {/* Header Row 2: Day, time ranges, Lunch bottom (to 1.55) */}
                    <tr className="bg-white">
                      <th className="border border-black p-1 text-center font-bold text-xs">
                        Day
                      </th>
                      <th className="border border-black p-1 text-center font-bold text-[10px]">
                        9:00 to 9:55
                      </th>
                      <th className="border border-black p-1 text-center font-bold text-[10px]">
                        9.55 to 10:50
                      </th>
                      <th className="border border-black p-1 text-center font-bold text-[10px]">
                        11:05 to 12:00
                      </th>
                      <th className="border border-black p-1 text-center font-bold text-[10px]">
                        12:00 to 12.55
                      </th>
                      <th className="border border-black p-1 text-center font-bold text-[10px] bg-white">
                        to 1.55
                      </th>
                      <th className="border border-black p-1 text-center font-bold text-[10px]">
                        1.55 to 2:50
                      </th>
                      <th className="border border-black p-1 text-center font-bold text-[10px]">
                        2.50 to 03:45
                      </th>
                      <th className="border border-black p-1 text-center font-bold text-[10px]">
                        3.55 to 4:50
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {DAYS_SHORT.map((dayName, d) => {
                      const dayRow = fullSchedule.grid[d] || [];
                      const morningCells = renderMergedPeriodCells(0, 3, dayRow);
                      const afternoonCells = renderMergedPeriodCells(4, 6, dayRow);

                      return (
                        <tr key={dayName} className="bg-white">
                          {/* Day column */}
                          <td className="border border-black p-1 text-center font-bold text-xs w-16 align-middle">
                            {dayName}
                          </td>

                          {/* Morning slots P1..P4 */}
                          {morningCells}

                          {/* Vertical LUNCH cell spanning all 6 rows */}
                          {d === 0 && (
                            <td
                              rowSpan={6}
                              className="border border-black p-1 text-center font-bold text-[11px] uppercase tracking-widest bg-white w-12 align-middle select-none"
                            >
                              <div className="flex flex-col items-center justify-center space-y-2 py-4">
                                <span>L</span>
                                <span>U</span>
                                <span>N</span>
                                <span>C</span>
                                <span>H</span>
                              </div>
                            </td>
                          )}

                          {/* Afternoon slots P5..P7 */}
                          {afternoonCells}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 3. Official Teaching Load / Subjects Legend Table */}
              <div className="mt-6">
                <table className="w-full border-collapse border border-black text-black">
                  <thead>
                    <tr className="bg-white">
                      <th className="border border-black p-1.5 text-center font-bold text-[10.5px] w-12">
                        SL.NO
                      </th>
                      <th className="border border-black p-1.5 text-center font-bold text-[10.5px] w-32">
                        COURSE CODE
                      </th>
                      <th className="border border-black p-1.5 text-center font-bold text-[10.5px]">
                        COURSE / ACTIVITY TITLE
                      </th>
                      <th className="border border-black p-1.5 text-center font-bold text-[10.5px] w-48">
                        CLASS & SECTION
                      </th>
                      <th className="border border-black p-1.5 text-center font-bold text-[10.5px] w-28">
                        HOURS / WEEK
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {fullSchedule.subjectsSummary.map((subj, idx) => (
                      <tr key={idx} className="bg-white">
                        <td className="border border-black p-1 text-center text-[10px]">
                          {idx + 1}
                        </td>
                        <td className="border border-black p-1 text-center text-[10px]">
                          {subj.code || '–'}
                        </td>
                        <td className="border border-black p-1.5 text-left text-[10px] pl-3">
                          {subj.name}
                        </td>
                        <td className="border border-black p-1 text-center text-[10px]">
                          {subj.classes.join(', ') || '–'}
                        </td>
                        <td className="border border-black p-1 text-center font-bold text-[10.5px]">
                          {subj.hoursCount}
                        </td>
                      </tr>
                    ))}

                    {/* Total Load footer row */}
                    <tr className="bg-white font-bold">
                      <td
                        colSpan={4}
                        className="border border-black p-1.5 text-right pr-4 uppercase text-[10.5px]"
                      >
                        TOTAL TEACHING & SPECIAL LOAD
                      </td>
                      <td className="border border-black p-1.5 text-center text-[10.5px]">
                        {fullSchedule.totalHours} HRS / WEEK
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

            </>
          )}

        </div>
      </main>
    </div>
  );
};

export default FacultyDashboard;
