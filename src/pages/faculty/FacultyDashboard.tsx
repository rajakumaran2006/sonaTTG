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
  Calendar,
  Clock,
  BookOpen,
  LayoutList,
  Grid3X3,
  Coffee,
  Utensils,
  ArrowLeftRight,
  Eye,
  EyeOff,
  GraduationCap
} from "lucide-react";

const DAYS_SHORT = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAYS_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const PERIOD_TIMES = [
  { period: 1, time: "9:00 - 9:55 AM", shortTime: "9:00 - 9:55" },
  { period: 2, time: "9:55 - 10:50 AM", shortTime: "9:55 - 10:50" },
  { period: 3, time: "11:05 - 12:00 PM", shortTime: "11:05 - 12:00" },
  { period: 4, time: "12:00 - 12:55 PM", shortTime: "12:00 - 12:55" },
  { period: 5, time: "1:55 - 2:50 PM", shortTime: "1:55 - 2:50" },
  { period: 6, time: "2:50 - 3:45 PM", shortTime: "2:50 - 3:45" },
  { period: 7, time: "3:55 - 4:50 PM", shortTime: "3:55 - 4:50" },
];

const areSlotsEqual = (a: FacultyPeriodSlot | null, b: FacultyPeriodSlot | null): boolean => {
  if (!a || !b) return false;
  const classA = `${a.department_name}_${a.year}_${a.cleanSection || a.section}_${a.subject}`;
  const classB = `${b.department_name}_${b.year}_${b.cleanSection || b.section}_${b.subject}`;
  return classA === classB;
};

const formatClassInfo = (slot: FacultyPeriodSlot): string => {
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
  return `Yr ${slot.year}${deptPart} - Sec ${slot.cleanSection || slot.section}${ccSuffix}${extSuffix}`;
};

interface DayScheduleItem {
  type: 'period' | 'break';
  breakName?: string;
  breakTime?: string;
  startPeriod?: number;
  endPeriod?: number;
  periodLabel?: string;
  timeRange?: string;
  duration?: string;
  slot?: FacultyPeriodSlot | null;
}

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

  // Responsive view state: Default to 'day' on small screens, 'table' on desktop
  const [viewMode, setViewMode] = useState<'day' | 'table'>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return 'day';
    }
    return 'table';
  });

  // Selected day for mobile Day View (0 = MON, ..., 5 = SAT, -1 = ALL DAYS)
  const currentDayOfWeek = useMemo(() => {
    const d = new Date().getDay(); // 0 Sun, 1 Mon ... 6 Sat
    if (d >= 1 && d <= 6) return d - 1;
    return 0; // Default to Monday
  }, []);

  const [selectedDay, setSelectedDay] = useState<number>(() => {
    const d = new Date().getDay();
    if (d >= 1 && d <= 6) return d - 1;
    return 0;
  });

  const [showFreePeriods, setShowFreePeriods] = useState<boolean>(true);

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
  const semLabel = semesterType === 'even' ? 'EVEN SEMESTER' : 'ODD SEMESTER';
  const acadYear = '2026 - 2027';

  // Helper to count classes for a given day
  const getDayClassCount = (dayIndex: number): number => {
    if (!fullSchedule || !fullSchedule.grid[dayIndex]) return 0;
    return fullSchedule.grid[dayIndex].filter(slot => slot !== null).length;
  };

  // Helper to build chronological schedule items for a day
  const getDayScheduleItems = (dayIndex: number): DayScheduleItem[] => {
    if (!fullSchedule) return [];
    const dayRow = fullSchedule.grid[dayIndex] || [];
    const items: DayScheduleItem[] = [];

    const addMergedRange = (startIdx: number, endIdx: number) => {
      let i = startIdx;
      while (i <= endIdx) {
        const slot = dayRow ? dayRow[i] : null;
        let span = 1;
        while (i + span <= endIdx && areSlotsEqual(slot, dayRow[i + span])) {
          span++;
        }

        const pStart = i + 1;
        const pEnd = i + span;
        const startTime = PERIOD_TIMES[i].time.split(' - ')[0];
        const endTime = PERIOD_TIMES[i + span - 1].time.split(' - ')[1];
        const timeRange = `${startTime} - ${endTime}`;
        const periodLabel = span === 1 ? `Period ${pStart}` : `Periods ${pStart} - ${pEnd}`;
        const duration = span === 1 ? '55 mins' : `${span * 55} mins (${span} hrs)`;

        items.push({
          type: 'period',
          startPeriod: pStart,
          endPeriod: pEnd,
          periodLabel,
          timeRange,
          duration,
          slot,
        });

        i += span;
      }
    };

    // Morning Block: Periods 1 & 2
    addMergedRange(0, 1);

    // Morning Tea Break
    items.push({
      type: 'break',
      breakName: 'Morning Tea Break',
      breakTime: '10:50 - 11:05 AM',
    });

    // Midday Block: Periods 3 & 4
    addMergedRange(2, 3);

    // Lunch Break
    items.push({
      type: 'break',
      breakName: 'Lunch Break',
      breakTime: '12:55 - 1:55 PM',
    });

    // Afternoon Block: Periods 5 & 6
    addMergedRange(4, 5);

    // Evening Tea Break
    items.push({
      type: 'break',
      breakName: 'Evening Tea Break',
      breakTime: '3:45 - 3:55 PM',
    });

    // Late Afternoon Block: Period 7
    addMergedRange(6, 6);

    return items;
  };

  // Helper to render merged cells in the official Table View
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
            className="timetable-cell border border-black p-2 text-center text-xs h-16 min-h-[64px] bg-white align-middle"
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

      const classInfo = formatClassInfo(slot);
      const subjectName = slot.subject || slot.rawCellText || '';

      cells.push(
        <td
          key={i}
          colSpan={span}
          className="timetable-cell border border-black p-1.5 text-center text-xs h-16 min-h-[64px] bg-white align-middle"
        >
          <div className="timetable-cell-class font-bold text-[11px] leading-tight text-black">
            {classInfo}
          </div>
          <div className="timetable-cell-subj text-[10px] leading-tight text-black mt-1 font-normal">
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

      <main className="faculty-dashboard-main pt-20 print:pt-0 max-w-6xl mx-auto px-3 sm:px-6">
        
        {/* ── Top Floating Toolbar (Hidden during print) ──────────────────── */}
        <div className="print:hidden mb-4 sm:mb-6 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs">
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-4">
            
            {/* View Mode Switcher: Day View vs Grid View */}
            <div className="bg-slate-100 p-1 rounded-lg flex items-center border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('day')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  viewMode === 'day'
                    ? "bg-white text-indigo-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Mobile-optimized Day-by-Day schedule view"
              >
                <LayoutList className="w-3.5 h-3.5 text-indigo-600" />
                <span>Day View</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  viewMode === 'table'
                    ? "bg-white text-indigo-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Full 9-column institutional timetable grid"
              >
                <Grid3X3 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Grid View</span>
              </button>
            </div>

            {/* Semester Selector */}
            <div className="bg-slate-100 p-1 rounded-lg flex items-center border border-slate-200">
              <button
                type="button"
                onClick={() => setSemesterType('odd')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  semesterType === 'odd'
                    ? "bg-white text-indigo-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                <span>Odd Semester</span>
              </button>
              <button
                type="button"
                onClick={() => setSemesterType('even')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  semesterType === 'even'
                    ? "bg-white text-indigo-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Moon className="w-3.5 h-3.5 text-indigo-500" />
                <span>Even Semester</span>
              </button>
            </div>

          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 justify-end">
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 sm:flex-initial h-9 px-3 rounded-lg text-xs font-semibold border-slate-300 bg-white hover:bg-slate-50 text-slate-800"
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
              className="flex-1 sm:flex-initial h-9 px-3 rounded-lg text-xs font-semibold border-slate-300 bg-white hover:bg-slate-50 text-slate-800"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 text-indigo-600 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync'}
            </Button>
          </div>

        </div>

        {/* ── Loading & Empty states ────────────────────────────────────────── */}
        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 font-medium shadow-sm">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-indigo-600" />
            <p className="text-sm font-semibold text-slate-700">Loading your timetable schedule...</p>
            <p className="text-xs text-slate-400 mt-1">Synchronizing class allocations and special hours</p>
          </div>
        ) : !fullSchedule ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 font-medium shadow-sm">
            <Calendar className="w-8 h-8 mx-auto mb-3 text-slate-400" />
            <p className="text-sm font-semibold text-slate-700">No schedule records found</p>
            <p className="text-xs text-slate-400 mt-1">Please contact your department timetable coordinator.</p>
          </div>
        ) : (
          <>
            {/* ══════════════════════════════════════════════════════════════════
                1. MOBILE DAY VIEW (Default on phones, interactive card layout)
               ══════════════════════════════════════════════════════════════════ */}
            <div className={`${viewMode === 'day' ? 'block' : 'hidden'} print:hidden space-y-4`}>
              
              {/* Day Selector Pills Bar */}
              <div className="bg-white p-2.5 sm:p-3 rounded-xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                  {DAYS_SHORT.map((dayName, d) => {
                    const count = getDayClassCount(d);
                    const isSelected = selectedDay === d;
                    const isToday = currentDayOfWeek === d;

                    return (
                      <button
                        key={dayName}
                        type="button"
                        onClick={() => setSelectedDay(d)}
                        className={`flex-1 min-w-[54px] sm:min-w-[70px] py-2 px-1.5 rounded-lg flex flex-col items-center justify-center transition-all ${
                          isSelected
                            ? "bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-600/30 font-bold"
                            : "bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium border border-slate-200/60"
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <span className="text-xs tracking-tight">{dayName}</span>
                          {isToday && (
                            <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-amber-300' : 'bg-indigo-600'}`} title="Today" />
                          )}
                        </div>
                        <span className={`text-[10px] mt-0.5 leading-none ${
                          isSelected ? "text-indigo-100 font-semibold" : "text-slate-400 font-normal"
                        }`}>
                          {count} {count === 1 ? 'class' : 'classes'}
                        </span>
                      </button>
                    );
                  })}

                  {/* All Days option */}
                  <button
                    type="button"
                    onClick={() => setSelectedDay(-1)}
                    className={`py-2 px-2.5 rounded-lg flex flex-col items-center justify-center transition-all shrink-0 ${
                      selectedDay === -1
                        ? "bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-600/30 font-bold"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium border border-slate-200/60"
                    }`}
                  >
                    <span className="text-xs tracking-tight">ALL</span>
                    <span className={`text-[10px] mt-0.5 leading-none ${
                      selectedDay === -1 ? "text-indigo-100 font-semibold" : "text-slate-400 font-normal"
                    }`}>
                      Week
                    </span>
                  </button>
                </div>
              </div>

              {/* Day Header Info Bar & Controls */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-tight">
                      {selectedDay === -1 ? 'Full Week Schedule' : `${DAYS_FULL[selectedDay]} Schedule`}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {selectedDay === -1 
                        ? `${fullSchedule.totalHours} total hours across 6 days`
                        : `${getDayClassCount(selectedDay)} active teaching classes`}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowFreePeriods(!showFreePeriods)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium border transition-colors ${
                    showFreePeriods
                      ? "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                      : "bg-white text-slate-400 border-slate-200 hover:text-slate-600"
                  }`}
                  title="Toggle visibility of free periods"
                >
                  {showFreePeriods ? <Eye className="w-3.5 h-3.5 text-slate-600" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
                  <span className="hidden sm:inline">{showFreePeriods ? 'Hide Free' : 'Show Free'}</span>
                </button>
              </div>

              {/* Day Cards List */}
              <div className="space-y-3">
                {selectedDay === -1 ? (
                  // ALL DAYS LIST
                  DAYS_SHORT.map((dayName, d) => {
                    const dayItems = getDayScheduleItems(d);
                    const classCount = getDayClassCount(d);

                    return (
                      <div key={dayName} className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                        <div className="bg-slate-50/80 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                          <span className="font-bold text-sm text-slate-800">{DAYS_FULL[d]}</span>
                          <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200/60 font-semibold px-2 py-0.5 rounded-full">
                            {classCount} {classCount === 1 ? 'class' : 'classes'}
                          </span>
                        </div>
                        <div className="p-3 space-y-2.5">
                          {dayItems.map((item, idx) => {
                            if (item.type === 'break') {
                              return (
                                <div key={idx} className="flex items-center gap-2 py-1 text-slate-400 text-xs font-medium">
                                  <div className="h-px bg-slate-200 flex-1" />
                                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                                    {item.breakName?.includes('Lunch') ? (
                                      <Utensils className="w-3 h-3 text-indigo-500" />
                                    ) : (
                                      <Coffee className="w-3 h-3 text-amber-500" />
                                    )}
                                    <span>{item.breakName} ({item.breakTime})</span>
                                  </div>
                                  <div className="h-px bg-slate-200 flex-1" />
                                </div>
                              );
                            }

                            if (!item.slot) {
                              if (!showFreePeriods) return null;
                              return (
                                <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 text-slate-400 text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-slate-500">{item.periodLabel}</span>
                                    <span className="text-[11px] text-slate-400">({item.timeRange})</span>
                                  </div>
                                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Free Period</span>
                                </div>
                              );
                            }

                            const classInfo = formatClassInfo(item.slot);
                            const subjectTitle = item.slot.subject || item.slot.rawCellText || 'Subject';

                            return (
                              <div
                                key={idx}
                                className="p-3 rounded-lg border-l-4 border-l-indigo-600 border border-slate-200 bg-white shadow-2xs hover:shadow-xs transition-shadow space-y-1.5"
                              >
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                                      {item.periodLabel}
                                    </span>
                                    <span className="flex items-center gap-1 text-xs text-slate-600 font-medium">
                                      <Clock className="w-3 h-3 text-slate-400" />
                                      {item.timeRange}
                                    </span>
                                  </div>
                                  <span className="text-xs font-bold text-indigo-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                    {classInfo}
                                  </span>
                                </div>
                                <div className="font-bold text-sm text-slate-900">
                                  {subjectTitle}
                                </div>
                                {(item.slot.is_counselor_hour || item.slot.is_external) && (
                                  <div className="flex items-center gap-1.5 pt-0.5">
                                    {item.slot.is_counselor_hour && (
                                      <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded">
                                        ⭐ Class Counselor Hour
                                      </span>
                                    )}
                                    {item.slot.is_external && (
                                      <span className="text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200 px-1.5 py-0.2 rounded">
                                        External Dept
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  // SINGLE SELECTED DAY VIEW
                  (() => {
                    const dayItems = getDayScheduleItems(selectedDay);
                    const classCount = getDayClassCount(selectedDay);

                    if (classCount === 0 && !showFreePeriods) {
                      return (
                        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 shadow-xs">
                          <Coffee className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                          <p className="text-sm font-semibold text-slate-800">No classes scheduled on {DAYS_FULL[selectedDay]}</p>
                          <p className="text-xs text-slate-400 mt-1">Enjoy your free time or prepare for upcoming classes.</p>
                        </div>
                      );
                    }

                    return (
                      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-xs space-y-2.5">
                        {dayItems.map((item, idx) => {
                          if (item.type === 'break') {
                            return (
                              <div key={idx} className="flex items-center gap-2 py-1 text-slate-400 text-xs font-medium">
                                <div className="h-px bg-slate-200 flex-1" />
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                                  {item.breakName?.includes('Lunch') ? (
                                    <Utensils className="w-3 h-3 text-indigo-500" />
                                  ) : (
                                    <Coffee className="w-3 h-3 text-amber-500" />
                                  )}
                                  <span>{item.breakName} ({item.breakTime})</span>
                                </div>
                                <div className="h-px bg-slate-200 flex-1" />
                              </div>
                            );
                          }

                          if (!item.slot) {
                            if (!showFreePeriods) return null;
                            return (
                              <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 text-slate-400 text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-slate-600">{item.periodLabel}</span>
                                  <span className="text-[11px] text-slate-400">({item.timeRange})</span>
                                </div>
                                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200">
                                  Free Period
                                </span>
                              </div>
                            );
                          }

                          const classInfo = formatClassInfo(item.slot);
                          const subjectTitle = item.slot.subject || item.slot.rawCellText || 'Subject';

                          return (
                            <div
                              key={idx}
                              className="p-3.5 rounded-xl border-l-4 border-l-indigo-600 border border-slate-200 bg-white shadow-2xs hover:shadow-xs transition-shadow space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                                    {item.periodLabel}
                                  </span>
                                  <span className="flex items-center gap-1 text-xs text-slate-600 font-medium">
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    {item.timeRange}
                                  </span>
                                </div>
                                <span className="text-xs font-bold text-indigo-900 bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200">
                                  {classInfo}
                                </span>
                              </div>

                              <div className="font-bold text-base text-slate-900 leading-snug">
                                {subjectTitle}
                              </div>

                              {(item.slot.is_counselor_hour || item.slot.is_external || item.duration) && (
                                <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                                  {item.duration && (
                                    <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                      Duration: {item.duration}
                                    </span>
                                  )}
                                  {item.slot.is_counselor_hour && (
                                    <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">
                                      ⭐ Class Counselor Hour
                                    </span>
                                  )}
                                  {item.slot.is_external && (
                                    <span className="text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200 px-2 py-0.5 rounded">
                                      External Department
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()
                )}
              </div>

              {/* Mobile Teaching Load Cards Summary */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Teaching Load Summary
                    </h4>
                  </div>
                  <span className="text-xs font-bold bg-indigo-600 text-white px-2.5 py-0.5 rounded-full">
                    {fullSchedule.totalHours} HRS / WEEK
                  </span>
                </div>

                <div className="space-y-2">
                  {fullSchedule.subjectsSummary.map((subj, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="space-y-0.5 flex-1 min-w-0">
                        <div className="font-bold text-slate-900 truncate">
                          {subj.name}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200/60">
                            {subj.code || 'NO-CODE'}
                          </span>
                          <span>Classes: {subj.classes.join(', ') || '–'}</span>
                        </div>
                      </div>
                      <div className="font-bold text-slate-800 text-xs bg-white px-2 py-1 rounded border border-slate-200 shrink-0">
                        {subj.hoursCount} hrs/wk
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* ══════════════════════════════════════════════════════════════════
                2. OFFICIAL INSTITUTIONAL DOCUMENT SHEET (Grid / Table View)
                   Always displayed during print; can also be toggled on screen
               ══════════════════════════════════════════════════════════════════ */}
            <div className={`${viewMode === 'table' ? 'block' : 'hidden'} print:block`}>
              
              <div className="faculty-sheet-container bg-white border border-slate-300 shadow-md p-4 sm:p-8 md:p-10 rounded-sm print:border-none print:shadow-none print:p-0 print:m-0">
                
                {/* 1. Official Header Block */}
                <div className="text-center space-y-0.5 mb-3 font-serif sm:font-sans">
                  <h1 className="faculty-header-college font-bold text-sm sm:text-base md:text-lg text-black tracking-tight leading-tight">
                    SONA COLLEGE OF TECHNOLOGY (Autonomous), SALEM-5
                  </h1>
                  <h2 className="faculty-header-dept font-bold text-xs sm:text-sm text-black uppercase tracking-tight leading-tight">
                    DEPARTMENT OF {fullDept.toUpperCase()}
                  </h2>
                  <div className="faculty-header-meta font-bold text-[11px] sm:text-xs text-black leading-tight">
                    ACADEMIC YEAR: {acadYear} &nbsp;|&nbsp; {semLabel}
                  </div>
                  <div className="faculty-header-meta font-bold text-[11px] sm:text-xs text-black leading-tight">
                    FACULTY INDIVIDUAL TIMETABLE
                  </div>
                  <div className="faculty-header-name font-bold text-xs sm:text-sm text-black underline pt-0.5 uppercase">
                    {faculty.name} ({(faculty.designation || 'FACULTY').toUpperCase()})
                  </div>
                </div>

                {/* Mobile Horizontal Swipe Guidance Hint (hidden on md+ and print) */}
                <div className="md:hidden print:hidden flex items-center justify-between gap-2 bg-gradient-to-r from-indigo-50 via-blue-50 to-indigo-50 border border-indigo-200/80 rounded-lg px-3 py-2 mb-3 text-xs text-indigo-800 shadow-2xs">
                  <div className="flex items-center gap-2 font-medium">
                    <ArrowLeftRight className="w-4 h-4 text-indigo-600 shrink-0 animate-pulse" />
                    <span>Swipe horizontally to view all periods (1 - 7)</span>
                  </div>
                  <span className="text-[10px] bg-white px-2 py-0.5 rounded-md border border-indigo-200 font-bold text-indigo-700 shrink-0">
                    Day Pinned
                  </span>
                </div>

                {/* 2. Official Timetable Grid Table (Exact 9 Columns with Sticky Day column) */}
                <div className="timetable-scroll-wrapper overflow-x-auto rounded-sm border border-black">
                  <table className="timetable-grid-table w-full border-collapse text-black min-w-[760px] sm:min-w-[800px]">
                    <thead>
                      {/* Header Row 1: Time, 1..4, 12.55 (Lunch top), 5..7 */}
                      <tr className="bg-white">
                        <th className="timetable-day-col timetable-day-col-shadow timetable-day-th border border-black p-1 text-center font-bold text-xs w-16">
                          Time
                        </th>
                        <th className="timetable-period-th border border-black p-1 text-center font-bold text-xs min-w-[95px]">
                          1
                        </th>
                        <th className="timetable-period-th border border-black p-1 text-center font-bold text-xs min-w-[95px]">
                          2
                        </th>
                        <th className="timetable-period-th border border-black p-1 text-center font-bold text-xs min-w-[95px]">
                          3
                        </th>
                        <th className="timetable-period-th border border-black p-1 text-center font-bold text-xs min-w-[95px]">
                          4
                        </th>
                        <th className="timetable-lunch-th border border-black p-1 text-center font-bold text-[11px] w-12 bg-white">
                          12.55
                        </th>
                        <th className="timetable-period-th border border-black p-1 text-center font-bold text-xs min-w-[95px]">
                          5
                        </th>
                        <th className="timetable-period-th border border-black p-1 text-center font-bold text-xs min-w-[95px]">
                          6
                        </th>
                        <th className="timetable-period-th border border-black p-1 text-center font-bold text-xs min-w-[95px]">
                          7
                        </th>
                      </tr>

                      {/* Header Row 2: Day, time ranges, Lunch bottom (to 1.55) */}
                      <tr className="bg-white">
                        <th className="timetable-day-col timetable-day-col-shadow timetable-day-th border border-black p-1 text-center font-bold text-xs">
                          Day
                        </th>
                        <th className="timetable-period-th border border-black p-1 text-center font-bold text-[10px]">
                          9:00 to 9:55
                        </th>
                        <th className="timetable-period-th border border-black p-1 text-center font-bold text-[10px]">
                          9.55 to 10:50
                        </th>
                        <th className="timetable-period-th border border-black p-1 text-center font-bold text-[10px]">
                          11:05 to 12:00
                        </th>
                        <th className="timetable-period-th border border-black p-1 text-center font-bold text-[10px]">
                          12:00 to 12.55
                        </th>
                        <th className="timetable-lunch-th border border-black p-1 text-center font-bold text-[10px] bg-white">
                          to 1.55
                        </th>
                        <th className="timetable-period-th border border-black p-1 text-center font-bold text-[10px]">
                          1.55 to 2:50
                        </th>
                        <th className="timetable-period-th border border-black p-1 text-center font-bold text-[10px]">
                          2.50 to 03:45
                        </th>
                        <th className="timetable-period-th border border-black p-1 text-center font-bold text-[10px]">
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
                            {/* Day column with sticky positioning on mobile */}
                            <td className="timetable-day-col timetable-day-col-shadow border border-black p-1 text-center font-bold text-xs w-16 align-middle">
                              {dayName}
                            </td>

                            {/* Morning slots P1..P4 */}
                            {morningCells}

                            {/* Vertical LUNCH cell spanning all 6 rows */}
                            {d === 0 && (
                              <td
                                rowSpan={6}
                                className="timetable-lunch-col border border-black p-1 text-center font-bold text-[11px] uppercase tracking-widest bg-white w-12 align-middle select-none"
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
                  <div className="timetable-scroll-wrapper overflow-x-auto rounded-sm border border-black">
                    <table className="timetable-load-table w-full border-collapse text-black min-w-[640px]">
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
                </div>

              </div>

            </div>
          </>
        )}

      </main>
    </div>
  );
};

export default FacultyDashboard;
