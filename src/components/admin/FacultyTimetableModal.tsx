import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDarkMode } from "@/context/DarkModeContext";
import { supabase } from "@/integrations/supabase/client";
import { 
  FacultyPeriodSlot,
  FacultyWeeklyScheduleResult, 
  getFacultyWeeklySchedule, 
  getAllFacultySchedulesByDepartment,
  formatClassWithDept
} from "@/lib/facultyScheduleService";
import { 
  exportFacultyTimetablesToPdf, 
  exportDepartmentAllFacultyTimetables 
} from "@/lib/facultyTimetablePdfExport";
import { 
  saveExternalFacultySlot, 
  deleteExternalFacultySlot 
} from "@/lib/facultyExternalSlotsService";
import { 
  Calendar, 
  Clock, 
  Download, 
  User, 
  Building2, 
  RefreshCw, 
  FileDown, 
  BookOpen, 
  Shield, 
  GraduationCap, 
  Sun, 
  Moon, 
  CheckCircle, 
  AlertCircle,
  Loader2,
  Plus,
  ExternalLink,
  Trash2,
  X,
  Search,
  Check,
  ChevronsUpDown
} from "lucide-react";
import { toast } from "sonner";

export interface FacultyTimetableModalProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  initialFacultyId?: string;
  initialDepartmentId?: string;
  defaultFacultyId?: string;
  defaultDepartmentId?: string;
  defaultSemesterType?: 'odd' | 'even';
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PERIODS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];
const TIME_SLOTS = [
  '9:00-9:55', '9:55-10:50', '11:05-12:00', '12:00-12:55', 
  '1:55-2:50', '2:50-3:45', '3:55-4:50'
];

export const FacultyTimetableModal = ({
  open,
  onOpenChange,
  onClose,
  initialFacultyId,
  initialDepartmentId,
  defaultFacultyId,
  defaultDepartmentId,
  defaultSemesterType,
}: FacultyTimetableModalProps) => {
  const { isDark } = useDarkMode();
  const effectiveInitialDept = initialDepartmentId || defaultDepartmentId || "";
  const effectiveInitialFac = initialFacultyId || defaultFacultyId || "";

  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>(effectiveInitialDept);
  const [facultyList, setFacultyList] = useState<Array<{ id: string; name: string; designation?: string }>>([]);
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>(effectiveInitialFac);
  const [semesterType, setSemesterType] = useState<'odd' | 'even'>(defaultSemesterType || 'odd');
  const [schedule, setSchedule] = useState<FacultyWeeklyScheduleResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportingIndividual, setExportingIndividual] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);

  // Search state for faculty selector
  const [facultySearchOpen, setFacultySearchOpen] = useState(false);
  const [facultySearchQuery, setFacultySearchQuery] = useState("");

  const selectedFacultyObj = useMemo(() => {
    return facultyList.find(f => f.id === selectedFacultyId);
  }, [facultyList, selectedFacultyId]);

  const filteredFacultyList = useMemo(() => {
    if (!facultySearchQuery.trim()) return facultyList;
    const q = facultySearchQuery.toLowerCase().trim();
    return facultyList.filter(f => 
      f.name.toLowerCase().includes(q) || 
      (f.designation && f.designation.toLowerCase().includes(q))
    );
  }, [facultyList, facultySearchQuery]);

  // Close handler supporting both onOpenChange and onClose
  const handleClose = () => {
    if (onOpenChange) onOpenChange(false);
    if (onClose) onClose();
  };

  // Sync state whenever modal is opened with new props
  useEffect(() => {
    if (!open) return;
    if (defaultSemesterType) {
      setSemesterType(defaultSemesterType);
    }
    const targetDept = initialDepartmentId || defaultDepartmentId;
    if (targetDept && targetDept !== selectedDeptId) {
      setSelectedDeptId(targetDept);
    }
    const targetFac = initialFacultyId || defaultFacultyId;
    if (targetFac && targetFac !== selectedFacultyId) {
      setSelectedFacultyId(targetFac);
    }
  }, [open, defaultSemesterType, initialDepartmentId, defaultDepartmentId, initialFacultyId, defaultFacultyId]);

  // Cross-department assignment dialog state
  const [extDialogOpen, setExtDialogOpen] = useState(false);
  const [extEditingId, setExtEditingId] = useState<string | null>(null);
  const [extDeptName, setExtDeptName] = useState<string>("");
  const [extSubjectName, setExtSubjectName] = useState<string>("");
  const [extSubjectCode, setExtSubjectCode] = useState<string>("");
  const [extYear, setExtYear] = useState<string>("II");
  const [extSection, setExtSection] = useState<string>("A");
  const [extDay, setExtDay] = useState<number>(0);
  const [extPeriod, setExtPeriod] = useState<number>(0);
  const [extIsLab, setExtIsLab] = useState<boolean>(false);
  const [extSaving, setExtSaving] = useState(false);

  // Load departments
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('departments')
        .select('id, name')
        .order('name');
      if (data && data.length > 0) {
        setDepartments(data);
        if (!selectedDeptId) {
          setSelectedDeptId(initialDepartmentId || defaultDepartmentId || data[0].id);
        }
      }
    })();
  }, [open, initialDepartmentId, defaultDepartmentId]);

  // Load faculty list when department changes
  useEffect(() => {
    if (!selectedDeptId || !open) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('faculty_members')
        .select('id, name, designation')
        .eq('department_id', selectedDeptId)
        .order('name');
      const list = data || [];
      setFacultyList(list);

      const targetFac = initialFacultyId || defaultFacultyId;
      // Auto-select faculty if not selected or invalid
      if (targetFac && list.some(f => f.id === targetFac)) {
        setSelectedFacultyId(targetFac);
      } else if (list.length > 0 && (!selectedFacultyId || !list.some(f => f.id === selectedFacultyId))) {
        setSelectedFacultyId(list[0].id);
      } else if (list.length === 0) {
        setSelectedFacultyId("");
        setSchedule(null);
      }
    })();
  }, [selectedDeptId, open, initialFacultyId, defaultFacultyId]);

  // Fetch schedule for current faculty
  const loadSchedule = async () => {
    if (!selectedFacultyId) {
      setSchedule(null);
      return;
    }
    setLoading(true);
    try {
      const selectedFac = facultyList.find(f => f.id === selectedFacultyId);
      const res = await getFacultyWeeklySchedule(
        selectedFacultyId,
        selectedFac?.name,
        semesterType,
        selectedDeptId
      );
      setSchedule(res);
    } catch (e: any) {
      console.error('Failed to load faculty schedule:', e);
      toast.error('Could not load faculty schedule');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && selectedFacultyId) {
      loadSchedule();
    }
  }, [open, selectedFacultyId, semesterType, selectedDeptId]);

  const selectedDeptName = useMemo(() => {
    return departments.find(d => d.id === selectedDeptId)?.name || 'Department';
  }, [departments, selectedDeptId]);

  // Open dialog to add new external assignment
  const handleOpenAddExternal = (dayIdx?: number, periodIdx?: number) => {
    setExtEditingId(null);
    const otherDept = departments.find(d => d.id !== selectedDeptId);
    setExtDeptName(otherDept?.name || (departments[0]?.name ?? "Information Technology"));
    setExtSubjectName("");
    setExtSubjectCode("");
    setExtYear("II");
    setExtSection("A");
    setExtDay(dayIdx !== undefined ? dayIdx : 0);
    setExtPeriod(periodIdx !== undefined ? periodIdx : 0);
    setExtIsLab(false);
    setExtDialogOpen(true);
  };

  // Open dialog to edit existing external assignment
  const handleOpenEditExternal = (slot: FacultyPeriodSlot) => {
    setExtEditingId(slot.external_id || null);
    setExtDeptName(slot.department_name);
    setExtSubjectName(slot.subject);
    setExtSubjectCode(slot.code || "");
    setExtYear(slot.year || "II");
    setExtSection(slot.cleanSection || "A");
    setExtDay(slot.day);
    setExtPeriod(slot.period);
    setExtIsLab(Boolean(slot.is_lab));
    setExtDialogOpen(true);
  };

  // Save cross-department assignment
  const handleSaveExternalAssignment = async () => {
    if (!selectedFacultyId) {
      toast.error("Please select a faculty member first.");
      return;
    }
    if (!extSubjectName.trim()) {
      toast.error("Please enter a subject name.");
      return;
    }
    if (!extDeptName.trim()) {
      toast.error("Please select or enter the target department.");
      return;
    }

    setExtSaving(true);
    try {
      const selectedFac = facultyList.find(f => f.id === selectedFacultyId);
      const targetDeptObj = departments.find(d => d.name.toLowerCase() === extDeptName.trim().toLowerCase());

      await saveExternalFacultySlot({
        id: extEditingId || undefined,
        faculty_id: selectedFacultyId,
        faculty_name: selectedFac?.name,
        department_name: extDeptName.trim(),
        department_id: targetDeptObj?.id,
        subject_name: extSubjectName.trim(),
        subject_code: extSubjectCode.trim() || undefined,
        year: extYear,
        section: extSection.trim().toUpperCase(),
        day: extDay,
        period: extPeriod,
        semester_type: semesterType,
        is_lab: extIsLab,
      });

      toast.success(extEditingId ? "Cross-department assignment updated!" : "Cross-department class assigned!");
      setExtDialogOpen(false);
      await loadSchedule();
    } catch (e: any) {
      console.error("Error saving external slot:", e);
      toast.error("Failed to save cross-department assignment.");
    } finally {
      setExtSaving(false);
    }
  };

  // Delete cross-department assignment
  const handleDeleteExternalAssignment = async () => {
    if (!extEditingId) return;
    setExtSaving(true);
    try {
      await deleteExternalFacultySlot(extEditingId);
      toast.success("Cross-department assignment removed.");
      setExtDialogOpen(false);
      await loadSchedule();
    } catch (e: any) {
      console.error("Error deleting external slot:", e);
      toast.error("Failed to remove cross-department assignment.");
    } finally {
      setExtSaving(false);
    }
  };

  // Handle individual PDF download
  const handleDownloadSinglePdf = async () => {
    if (!schedule) return;
    setExportingIndividual(true);
    try {
      await exportFacultyTimetablesToPdf([schedule], undefined, {
        institutionName: "SONA COLLEGE OF TECHNOLOGY (AUTONOMOUS)",
        departmentName: selectedDeptName,
        semesterTitle: semesterType === 'odd' ? 'ODD SEMESTER (2026-2027)' : 'EVEN SEMESTER (2026-2027)',
      });
      toast.success(`Downloaded timetable for ${schedule.faculty.name}`);
    } catch (e: any) {
      console.error('Error generating PDF:', e);
      toast.error('Failed to generate PDF: ' + (e?.message || 'Unknown error'));
    } finally {
      setExportingIndividual(false);
    }
  };

  // Handle department-wide all-faculty PDF download
  const handleDownloadAllPdf = async () => {
    if (!selectedDeptId || facultyList.length === 0) return;
    setExportingAll(true);
    try {
      toast.info(`Extracting schedules for all ${facultyList.length} faculty members in ${selectedDeptName}...`);
      const allSchedules = await getAllFacultySchedulesByDepartment(selectedDeptId, semesterType);
      
      if (allSchedules.length === 0) {
        toast.warning("No faculty schedules found to export.");
        return;
      }

      await exportDepartmentAllFacultyTimetables(
        allSchedules,
        selectedDeptName,
        semesterType,
        undefined
      );
      toast.success(`Successfully downloaded timetable book for all ${allSchedules.length} faculty!`);
    } catch (e: any) {
      console.error('Error generating department faculty book:', e);
      toast.error('Failed to export all faculty timetables: ' + (e?.message || 'Unknown error'));
    } finally {
      setExportingAll(false);
    }
  };

  return (
    <>
      <Dialog 
        open={open} 
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            handleClose();
          } else {
            onOpenChange?.(true);
          }
        }}
      >
        <DialogContent
          className={`max-w-6xl max-h-[92vh] overflow-y-auto p-0 rounded-3xl border shadow-2xl ${
            isDark ? "bg-[#080b18] text-white border-indigo-500/30" : "bg-white text-slate-900 border-indigo-200"
          }`}
        >
          {/* Header Banner */}
          <DialogHeader
            className={`p-6 pb-4 border-b ${
              isDark ? "border-indigo-500/20 bg-gradient-to-r from-indigo-950/60 via-purple-950/40 to-slate-950" : "border-indigo-100 bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50"
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/30">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-bold tracking-wider uppercase text-indigo-400">
                    Faculty Schedule Portal
                  </span>
                </div>
                <DialogTitle className="text-xl sm:text-2xl font-black tracking-tight">
                  Faculty Timetable Viewer
                </DialogTitle>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Cross-Department Assignment Button */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleOpenAddExternal()}
                  className={`h-9 px-3 rounded-xl text-xs font-bold border transition-all ${
                    isDark
                      ? "border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300"
                      : "border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800"
                  }`}
                  title="Assign a class in another department without altering the original class view"
                >
                  <Plus className="h-3.5 w-3.5 mr-1 text-emerald-500" />
                  + Assign External Class
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadSchedule}
                  disabled={loading}
                  className={`h-9 px-3 rounded-xl text-xs font-semibold border ${
                    isDark ? "border-indigo-500/20 bg-white/5 hover:bg-white/10 text-slate-300" : "border-indigo-200 bg-white hover:bg-indigo-50 text-slate-700"
                  }`}
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>

                <Button
                  size="sm"
                  onClick={handleDownloadSinglePdf}
                  disabled={!schedule || exportingIndividual}
                  className="h-9 px-3.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  {exportingIndividual ? 'Exporting...' : 'Export This PDF'}
                </Button>

                <Button
                  size="sm"
                  onClick={handleDownloadAllPdf}
                  disabled={facultyList.length === 0 || exportingAll}
                  className="h-9 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-md shadow-indigo-500/25"
                >
                  {exportingAll ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Generating All PDFs...
                    </>
                  ) : (
                    <>
                      <FileDown className="h-3.5 w-3.5 mr-1.5" />
                      Download All Faculty PDF ({facultyList.length})
                    </>
                  )}
                </Button>

                {/* Explicit Close Button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleClose}
                  className={`h-9 w-9 rounded-xl border transition-all ${
                    isDark
                      ? "border-indigo-500/20 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white"
                      : "border-indigo-200 bg-white hover:bg-indigo-50 text-slate-700 hover:text-slate-900"
                  }`}
                  title="Close (Esc)"
                  aria-label="Close modal"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Controls Bar */}
            <div className="pt-4 flex flex-wrap items-center gap-3">
              {/* Department Selector */}
              {departments.length > 1 && (
                <div className="flex items-center gap-1.5 min-w-[200px]">
                  <Building2 className={`h-4 w-4 ${isDark ? "text-indigo-400" : "text-indigo-600"}`} />
                  <Select value={selectedDeptId} onValueChange={setSelectedDeptId}>
                    <SelectTrigger className="h-9 rounded-xl text-xs font-semibold border border-indigo-500/20 bg-transparent">
                      <SelectValue placeholder="Select Department" />
                    </SelectTrigger>
                    <SelectContent className={`rounded-xl border ${isDark ? "bg-[#0b0f22] text-white border-indigo-500/30" : "bg-white text-slate-900 border-indigo-200"}`}>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id} className="text-xs font-medium cursor-pointer">
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Searchable Faculty Selector */}
              <div className="flex items-center gap-1.5">
                <Popover open={facultySearchOpen} onOpenChange={setFacultySearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={facultySearchOpen}
                      className={`h-9 min-w-[240px] max-w-[340px] justify-between rounded-xl text-xs font-semibold border transition-all ${
                        isDark 
                          ? "border-indigo-500/20 bg-white/5 hover:bg-white/10 text-white" 
                          : "border-indigo-200 bg-white hover:bg-indigo-50/70 text-slate-800"
                      }`}
                      title="Search & select faculty member"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <User className={`h-3.5 w-3.5 shrink-0 ${isDark ? "text-indigo-400" : "text-indigo-600"}`} />
                        <span className="truncate">
                          {selectedFacultyObj
                            ? `${selectedFacultyObj.name} ${selectedFacultyObj.designation ? `(${selectedFacultyObj.designation})` : ''}`
                            : "Select Faculty"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2 text-muted-foreground">
                        <Search className="h-3 w-3 opacity-60" />
                        <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
                      </div>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent 
                    className={`w-[340px] p-0 rounded-2xl border shadow-2xl overflow-hidden ${
                      isDark ? "bg-[#0b0f22] text-white border-indigo-500/30" : "bg-white text-slate-900 border-indigo-200"
                    }`} 
                    align="start"
                  >
                    <div className="flex items-center gap-2 p-2.5 border-b border-indigo-500/15">
                      <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <Input
                        placeholder={`Search ${facultyList.length} faculty members...`}
                        value={facultySearchQuery}
                        onChange={(e) => setFacultySearchQuery(e.target.value)}
                        className="h-8 text-xs border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-1"
                        autoFocus
                      />
                      {facultySearchQuery && (
                        <button
                          type="button"
                          onClick={() => setFacultySearchQuery("")}
                          className="p-1 rounded-md text-muted-foreground hover:text-foreground"
                          title="Clear search"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    <div className="max-h-[260px] overflow-y-auto p-1.5 space-y-0.5">
                      {filteredFacultyList.length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                          No faculty found matching "{facultySearchQuery}"
                        </div>
                      ) : (
                        filteredFacultyList.map((f) => {
                          const isSelected = f.id === selectedFacultyId;
                          return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => {
                                setSelectedFacultyId(f.id);
                                setFacultySearchOpen(false);
                                setFacultySearchQuery("");
                              }}
                              className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all ${
                                isSelected
                                  ? isDark
                                    ? "bg-indigo-600/30 text-indigo-200 font-bold border border-indigo-500/40"
                                    : "bg-indigo-100/90 text-indigo-950 font-bold border border-indigo-300"
                                  : isDark
                                    ? "hover:bg-white/5 text-slate-300 hover:text-white"
                                    : "hover:bg-indigo-50/70 text-slate-700 hover:text-slate-900"
                              }`}
                            >
                              <div className="flex flex-col min-w-0 pr-2">
                                <span className="font-semibold truncate">{f.name}</span>
                                {f.designation && (
                                  <span className="text-[10px] text-muted-foreground truncate">{f.designation}</span>
                                )}
                              </div>
                              {isSelected && (
                                <Check className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>

                    <div className="px-3 py-1.5 border-t border-indigo-500/15 text-[10px] text-muted-foreground flex items-center justify-between">
                      <span>{filteredFacultyList.length} of {facultyList.length} faculties</span>
                      {facultySearchQuery && (
                        <button
                          type="button"
                          onClick={() => setFacultySearchQuery("")}
                          className="hover:text-foreground underline text-[10px]"
                        >
                          Reset filter
                        </button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Semester Switcher */}
              <div className="flex items-center p-1 rounded-xl border border-indigo-500/20 bg-white/5 ml-auto">
                <button
                  type="button"
                  onClick={() => setSemesterType('odd')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    semesterType === 'odd'
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Sun className="h-3.5 w-3.5" />
                  Odd Semester
                </button>
                <button
                  type="button"
                  onClick={() => setSemesterType('even')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    semesterType === 'even'
                      ? "bg-gradient-to-r from-amber-600 to-indigo-600 text-white shadow-xs"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Moon className="h-3.5 w-3.5" />
                  Even Semester
                </button>
              </div>
            </div>
          </DialogHeader>

          {/* Modal Body */}
          <div className="p-5 sm:p-6 space-y-6">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
                <p className="text-xs font-semibold text-muted-foreground">Extracting faculty timetable...</p>
              </div>
            ) : !schedule ? (
              <div className="py-20 text-center space-y-2">
                <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto opacity-50" />
                <p className="text-sm font-semibold text-muted-foreground">No faculty schedule available to display.</p>
                <p className="text-xs text-muted-foreground">Ensure timetables are published and faculty members are assigned to subjects.</p>
              </div>
            ) : (
              <>
                {/* Summary Stats Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                  <div className={`p-4 rounded-xl border ${isDark ? "bg-white/[0.03] border-indigo-500/20" : "bg-indigo-50/50 border-indigo-200"}`}>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Total Load</span>
                    <div className={`text-2xl font-black mt-1 ${isDark ? "text-indigo-300" : "text-indigo-600"}`}>
                      {schedule.totalHours} <span className="text-xs font-semibold text-muted-foreground">hrs/wk</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-0.5 block">
                      {schedule.theoryHours} theory + {schedule.labHours} lab
                    </span>
                  </div>

                  <div className={`p-4 rounded-xl border ${isDark ? "bg-white/[0.03] border-amber-500/20" : "bg-amber-50/50 border-amber-200"}`}>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Special Hours</span>
                    <div className={`text-2xl font-black mt-1 ${isDark ? "text-amber-300" : "text-amber-600"}`}>
                      {schedule.specialHours} <span className="text-xs font-semibold text-muted-foreground">hrs/wk</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-0.5 block">
                      {schedule.counselorClasses.length > 0 ? 'CC: Library/Seminar/SC' : 'No CC hours'}
                    </span>
                  </div>

                  <div className={`p-4 rounded-xl border ${isDark ? "bg-white/[0.03] border-cyan-500/20" : "bg-cyan-50/50 border-cyan-200"}`}>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Subjects Taught</span>
                    <div className={`text-2xl font-black mt-1 ${isDark ? "text-cyan-300" : "text-cyan-600"}`}>
                      {schedule.subjectsSummary.length}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-0.5 block">
                      Distinct course titles
                    </span>
                  </div>

                  <div className={`p-4 rounded-xl border ${isDark ? "bg-white/[0.03] border-purple-500/20" : "bg-purple-50/50 border-purple-200"}`}>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Classes Handled</span>
                    <div className={`text-2xl font-black mt-1 ${isDark ? "text-purple-300" : "text-purple-600"}`}>
                      {schedule.classesTaught.length}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-0.5 block">
                      Year/Sec combinations
                    </span>
                  </div>
                </div>

                {/* Class Counselor Notice */}
                {schedule.counselorClasses.length > 0 && (
                  <div className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs font-semibold ${
                    isDark ? "bg-amber-500/10 border-amber-500/30 text-amber-200" : "bg-amber-50 border-amber-200 text-amber-900"
                  }`}>
                    <Shield className="h-4 w-4 shrink-0 text-amber-500" />
                    <span>
                      Class Counselor for: <strong>{schedule.counselorClasses.map(c => `Year ${c.year} - Sec ${c.section}`).join(', ')}</strong>. Special hours (Seminar, Library, Counselling) are assigned to this faculty.
                    </span>
                  </div>
                )}

                {/* Timetable Grid Table */}
                <div className="space-y-2">
                  <div className="overflow-x-auto rounded-2xl border border-indigo-500/20 shadow-xs">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className={isDark ? "bg-[#101733] text-white" : "bg-indigo-600 text-white"}>
                          <th className="p-2.5 text-center font-extrabold border-r border-indigo-500/30 w-24 uppercase">
                            DAY
                          </th>
                          {PERIODS.map((period, idx) => (
                            <th key={period} className="p-2 text-center font-extrabold border-r border-indigo-500/30 last:border-r-0 min-w-[110px]">
                              <div>{period}</div>
                              <div className="text-[9px] font-mono opacity-80 mt-0.5 font-normal">
                                ({TIME_SLOTS[idx]})
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDark ? "divide-indigo-500/15" : "divide-indigo-100"}`}>
                        {DAYS.map((day, dayIdx) => (
                          <tr key={day} className={isDark ? "hover:bg-white/[0.02]" : "hover:bg-indigo-50/25"}>
                            <td className={`p-2.5 text-center font-extrabold border-r ${
                              isDark ? "bg-indigo-950/40 border-indigo-500/20 text-indigo-200" : "bg-indigo-50 border-indigo-100 text-indigo-900"
                            }`}>
                              {day}
                            </td>
                            {PERIODS.map((_, periodIdx) => {
                              const slot = schedule.grid[dayIdx]?.[periodIdx];
                              return (
                                <td key={periodIdx} className={`p-1.5 text-center border-r last:border-r-0 ${
                                  isDark ? "border-indigo-500/15" : "border-indigo-100"
                                }`}>
                                  <div
                                    onClick={() => {
                                      if (slot?.is_external) {
                                        handleOpenEditExternal(slot);
                                      } else if (!slot) {
                                        handleOpenAddExternal(dayIdx, periodIdx);
                                      }
                                    }}
                                    title={
                                      slot?.is_external
                                        ? `Click to edit/remove cross-department class (${slot.department_name}): ${slot.subject} (Yr ${slot.year} - Sec ${slot.cleanSection})`
                                        : !slot
                                        ? `Click to assign cross-department class for ${DAYS[dayIdx]} ${PERIODS[periodIdx]}`
                                        : `Class: Yr ${slot.year} - Sec ${slot.cleanSection} | Subject: ${slot.subject}${slot.is_special ? ' (Special Hour)' : ''}`
                                    }
                                    className={`min-h-[58px] p-1.5 rounded-xl flex flex-col justify-center items-center text-center transition-all ${
                                      slot
                                        ? slot.is_external
                                          ? isDark
                                            ? "bg-emerald-500/15 border-2 border-emerald-500/40 text-emerald-200 cursor-pointer hover:border-emerald-300 hover:scale-[1.02] shadow-xs"
                                            : "bg-emerald-50 border-2 border-emerald-400 text-emerald-950 font-bold cursor-pointer hover:bg-emerald-100 hover:scale-[1.02] shadow-xs"
                                          : slot.is_special
                                            ? isDark
                                              ? "bg-amber-500/15 border border-amber-500/30 text-amber-200"
                                              : "bg-amber-100/80 border border-amber-300 text-amber-900 font-bold"
                                            : slot.is_lab
                                              ? isDark
                                                ? "bg-blue-500/15 border border-blue-500/30 text-blue-200"
                                                : "bg-blue-100/80 border border-blue-300 text-blue-900 font-bold"
                                              : isDark
                                                ? "bg-indigo-500/15 border border-indigo-500/30 text-indigo-200"
                                                : "bg-indigo-100/80 border border-indigo-300 text-indigo-900 font-bold"
                                        : isDark
                                          ? "bg-white/[0.02] border border-white/5 text-slate-500 hover:border-emerald-500/40 hover:bg-emerald-500/10 cursor-pointer group"
                                          : "bg-slate-50/70 border border-slate-100 text-slate-400 hover:border-emerald-300 hover:bg-emerald-50/60 cursor-pointer group"
                                    }`}
                                  >
                                    {slot ? (
                                      <div className="w-full flex flex-col justify-center items-center text-center px-0.5">
                                        {/* Which Class Needs To Go (Prominent Header) */}
                                        <div className={`font-black text-[11px] leading-tight tracking-tight flex items-center justify-center gap-1 flex-wrap ${
                                          slot.is_external
                                            ? isDark ? "text-emerald-300" : "text-emerald-900"
                                            : slot.is_special
                                              ? isDark ? "text-amber-300" : "text-amber-900"
                                              : slot.is_lab
                                                ? isDark ? "text-blue-300" : "text-blue-900"
                                                : isDark ? "text-indigo-200" : "text-indigo-950"
                                        }`}>
                                          <span>
                                            {formatClassWithDept(slot.year, slot.cleanSection, slot.department_name, slot.code)}
                                          </span>
                                          {slot.is_counselor_hour && (
                                            <span className="px-1 py-0.2 rounded text-[7.5px] bg-amber-500/25 text-amber-600 dark:text-amber-300 font-black uppercase tracking-wider">
                                              CC
                                            </span>
                                          )}
                                          {slot.is_external && (
                                            <span className="px-1 py-0.2 rounded text-[7.5px] bg-emerald-500/25 text-emerald-600 dark:text-emerald-300 font-black uppercase tracking-wider">
                                              EXT
                                            </span>
                                          )}
                                        </div>

                                        {/* Subject Name (Full course title, NO course code) */}
                                        <div
                                          className={`text-[9.5px] font-semibold leading-tight line-clamp-2 mt-1 ${
                                            isDark ? "text-slate-300" : "text-slate-700"
                                          }`}
                                          title={slot.subject}
                                        >
                                          {slot.subject || slot.rawCellText || 'Assigned'}
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-[10px] font-semibold opacity-40 group-hover:opacity-100 group-hover:text-emerald-500 transition-opacity">
                                        + Assign
                                      </span>
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

                  {/* Legend & Tips */}
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-muted-foreground font-medium">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-sm bg-indigo-500/20 border border-indigo-500/40" />
                        <span>Theory Course</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-sm bg-blue-500/20 border border-blue-500/40" />
                        <span>Practical / Lab</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-sm bg-amber-500/20 border border-amber-500/40" />
                        <span>Special (SC/SEM/LIB)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-sm bg-emerald-500/25 border-2 border-emerald-500/40" />
                        <span className="text-emerald-400 font-bold">Cross-Department (External)</span>
                      </div>
                    </div>
                    <div className="text-[10px] opacity-75">
                      💡 Click any free cell or external class to assign or edit without altering class view.
                    </div>
                  </div>
                </div>

                {/* Course Breakdown Table */}
                <div className="space-y-2 pt-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Assigned Courses & Special Hours Breakdown
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-indigo-500/20">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className={isDark ? "bg-white/5 text-slate-300" : "bg-indigo-50/80 text-slate-700"}>
                          <th className="p-2 text-center font-bold w-12">#</th>
                          <th className="p-2 text-center font-bold w-24">Code</th>
                          <th className="p-2 text-left font-bold">Course / Special Activity</th>
                          <th className="p-2 text-center font-bold">Class & Section</th>
                          <th className="p-2 text-center font-bold w-24">Hours / Week</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDark ? "divide-indigo-500/15" : "divide-indigo-100"}`}>
                        {schedule.subjectsSummary.map((s, idx) => (
                          <tr key={idx} className={isDark ? "hover:bg-white/[0.02]" : "hover:bg-indigo-50/30"}>
                            <td className="p-2 text-center text-muted-foreground">{idx + 1}</td>
                            <td className="p-2 text-center font-mono font-bold">{s.code}</td>
                            <td className="p-2 font-medium">
                              {s.name}
                            </td>
                            <td className="p-2 text-center text-muted-foreground">{s.classes.join(', ')}</td>
                            <td className="p-2 text-center font-black text-indigo-500">{s.hoursCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign / Edit Cross-Department External Class Dialog */}
      <Dialog open={extDialogOpen} onOpenChange={setExtDialogOpen}>
        <DialogContent
          className={`max-w-md p-6 rounded-2xl border shadow-2xl ${
            isDark ? "bg-[#0b0f22] text-white border-indigo-500/30" : "bg-white text-slate-900 border-indigo-200"
          }`}
        >
          <DialogHeader className="space-y-1.5 pb-2 border-b border-indigo-500/15">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <ExternalLink className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">
                  {extEditingId ? "Edit Cross-Department Class" : "Assign Cross-Department Subject"}
                </DialogTitle>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Assign hours in another department for <strong>{selectedFacultyObj?.name || 'this faculty'}</strong> without modifying the original class view.
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3.5 py-3 text-xs">
            {/* Target Department */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Target Department *
              </label>
              <Select value={extDeptName} onValueChange={setExtDeptName}>
                <SelectTrigger className="h-9 rounded-xl border border-indigo-500/20 bg-transparent text-xs font-semibold">
                  <SelectValue placeholder="Select Department" />
                </SelectTrigger>
                <SelectContent className={`rounded-xl border ${isDark ? "bg-[#0b0f22] text-white border-indigo-500/30" : "bg-white text-slate-900 border-indigo-200"}`}>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.name} className="text-xs font-medium cursor-pointer">
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Subject Name & Code */}
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Course / Subject Title *
                </label>
                <Input
                  value={extSubjectName}
                  onChange={(e) => setExtSubjectName(e.target.value)}
                  placeholder="e.g. Software Engineering"
                  className="h-9 rounded-xl border border-indigo-500/20 bg-transparent text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Code
                </label>
                <Input
                  value={extSubjectCode}
                  onChange={(e) => setExtSubjectCode(e.target.value)}
                  placeholder="e.g. CS8494"
                  className="h-9 rounded-xl border border-indigo-500/20 bg-transparent text-xs"
                />
              </div>
            </div>

            {/* Year & Section */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Year
                </label>
                <Select value={extYear} onValueChange={setExtYear}>
                  <SelectTrigger className="h-9 rounded-xl border border-indigo-500/20 bg-transparent text-xs font-semibold">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent className={`rounded-xl border ${isDark ? "bg-[#0b0f22] text-white border-indigo-500/30" : "bg-white text-slate-900 border-indigo-200"}`}>
                    {['I', 'II', 'III', 'IV'].map((yr) => (
                      <SelectItem key={yr} value={yr} className="text-xs font-medium cursor-pointer">
                        Year {yr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Section
                </label>
                <Select value={extSection} onValueChange={setExtSection}>
                  <SelectTrigger className="h-9 rounded-xl border border-indigo-500/20 bg-transparent text-xs font-semibold">
                    <SelectValue placeholder="Section" />
                  </SelectTrigger>
                  <SelectContent className={`rounded-xl border ${isDark ? "bg-[#0b0f22] text-white border-indigo-500/30" : "bg-white text-slate-900 border-indigo-200"}`}>
                    {['A', 'B', 'C', 'D'].map((sec) => (
                      <SelectItem key={sec} value={sec} className="text-xs font-medium cursor-pointer">
                        Section {sec}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Day & Period */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Day
                </label>
                <Select value={String(extDay)} onValueChange={(val) => setExtDay(Number(val))}>
                  <SelectTrigger className="h-9 rounded-xl border border-indigo-500/20 bg-transparent text-xs font-semibold">
                    <SelectValue placeholder="Day" />
                  </SelectTrigger>
                  <SelectContent className={`rounded-xl border ${isDark ? "bg-[#0b0f22] text-white border-indigo-500/30" : "bg-white text-slate-900 border-indigo-200"}`}>
                    {DAYS.map((d, idx) => (
                      <SelectItem key={d} value={String(idx)} className="text-xs font-medium cursor-pointer">
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Period
                </label>
                <Select value={String(extPeriod)} onValueChange={(val) => setExtPeriod(Number(val))}>
                  <SelectTrigger className="h-9 rounded-xl border border-indigo-500/20 bg-transparent text-xs font-semibold">
                    <SelectValue placeholder="Period" />
                  </SelectTrigger>
                  <SelectContent className={`rounded-xl border ${isDark ? "bg-[#0b0f22] text-white border-indigo-500/30" : "bg-white text-slate-900 border-indigo-200"}`}>
                    {PERIODS.map((p, idx) => (
                      <SelectItem key={p} value={String(idx)} className="text-xs font-medium cursor-pointer">
                        {p} ({TIME_SLOTS[idx]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Type: Theory vs Lab */}
            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="extType"
                  checked={!extIsLab}
                  onChange={() => setExtIsLab(false)}
                  className="accent-indigo-600"
                />
                <span className="font-semibold">Theory Subject</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="extType"
                  checked={extIsLab}
                  onChange={() => setExtIsLab(true)}
                  className="accent-indigo-600"
                />
                <span className="font-semibold">Laboratory / Practical</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-indigo-500/15">
            {extEditingId ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDeleteExternalAssignment}
                disabled={extSaving}
                className="h-8 px-3 rounded-lg text-xs font-bold"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Remove
              </Button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setExtDialogOpen(false)}
                className="h-8 px-3 rounded-lg text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveExternalAssignment}
                disabled={extSaving}
                className="h-8 px-4 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
              >
                {extSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle className="h-3.5 w-3.5 mr-1" />}
                {extEditingId ? "Update Class" : "Assign Class"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
