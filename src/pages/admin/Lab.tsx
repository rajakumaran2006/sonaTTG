import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useTimetableStore } from "@/store/timetableStore";
import { getDepartmentByName, getAllYears, getSectionsForYear } from "@/lib/supabaseService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AdminNavbar from "@/components/navbar/AdminNavbar";
import SelectionHeader from "@/components/admin/SelectionHeader";
import { Plus, Trash2, Edit, Calendar, Settings, Eye, LayoutGrid, List, Download, FlaskConical, ChevronLeft } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CustomTable } from "@/components/ui/CustomTable";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Search, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDarkMode } from "@/context/DarkModeContext";

interface Lab {
  id: string;
  name: string;
  lab_code: string;
  capacity: number;
  max_slots: number;
  lab_type: string;
  description: string;
  building: string;
  floor: string;
  room_number: string;
  equipment_list: string[];
  safety_equipment: string[];
  operating_hours: any;
  is_active: boolean;
  maintenance_status: string;
  departments: string[]; // Array of department IDs
  year: string;
  section: string;
  allowed_classes?: { year: string; section: string }[];
  created_at: string;
  updated_at: string;
}

interface LabScheduleDetail {
  id: string;
  lab_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  max_capacity: number;
  slot_number: number;
  is_available: boolean;
  semester?: string;
  academic_year?: string;
  labs?: { name: string };
  year?: string | null;
  section?: string | null;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const periods = [
  { id: 'P1', time: '9:00-9:55', startTime: '09:00', endTime: '09:55' },
  { id: 'P2', time: '9:55-10:50', startTime: '09:55', endTime: '10:50' },
  { id: 'P3', time: '11:05-12:00', startTime: '11:05', endTime: '12:00' },
  { id: 'P4', time: '12:00-12:55', startTime: '12:00', endTime: '12:55' },
  { id: 'P5', time: '1:55-2:50', startTime: '13:55', endTime: '14:50' },
  { id: 'P6', time: '2:50-3:45', startTime: '14:50', endTime: '15:45' },
  { id: 'P7', time: '3:55-4:50', startTime: '15:55', endTime: '16:50' }
];

const parseScheduleInfo = (info: string) => {
  if (!info) return { raw: "Allocated" };
  
  // Pattern 1: {Dept} • Year {Y} Sec {S} - {Subject} OR [{Dept}] Year {Y} Sec {S} - {Subject}
  const deptMatch = info.match(/^(?:\[(.*?)\]|(.*?))\s*•\s*Year\s+([a-zA-Z0-9]+)\s+Sec\s+([a-zA-Z0-9]+)\s+-\s+(.+)$/i);
  if (deptMatch && (deptMatch[1] || deptMatch[2])) {
    const dept = (deptMatch[1] || deptMatch[2]).trim();
    if (dept) {
      return {
        dept,
        year: `Year ${deptMatch[3]}`,
        section: `Sec ${deptMatch[4]}`,
        subject: deptMatch[5].trim()
      };
    }
  }

  // Pattern 2: Year {Y} Sec {S} - {Subject}
  const yearSecMatch = info.match(/^Year\s+([a-zA-Z0-9]+)\s+Sec\s+([a-zA-Z0-9]+)\s+-\s+(.+)$/i);
  if (yearSecMatch) {
    return {
      year: `Year ${yearSecMatch[1]}`,
      section: `Sec ${yearSecMatch[2]}`,
      subject: yearSecMatch[3].trim()
    };
  }

  // Pattern 3: Year {Y}, {Subject}
  const yearMatch = info.match(/^Year\s+([a-zA-Z0-9]+),\s+(.+)$/i);
  if (yearMatch) {
    return {
      year: `Year ${yearMatch[1]}`,
      subject: yearMatch[2].trim()
    };
  }

  // Fallback
  return { raw: info };
};

const generateLabCode = (name: string) => {
  const words = name.trim().split(/\s+/);
  let code = words
    .map(word => word.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean)
    .map(word => (/^\d+$/.test(word) ? word : word[0].toUpperCase()))
    .join("");
  
  if (!code) {
    code = "LAB-" + Math.floor(100 + Math.random() * 900);
  }
  return code;
};


const Lab = () => {
  const navigate = useNavigate();
  const { isDark } = useDarkMode();
  const selection = useTimetableStore((s) => s.selection);
  const setSelection = useTimetableStore((s) => s.setSelection);

  // ── Theme tokens ────────────────────────────────────────────────────────────
  const tblBg        = isDark ? "bg-slate-900"          : "bg-white border border-slate-200";
  const tblHeaderBg  = isDark ? "bg-slate-800/90"       : "bg-slate-50";
  const tblBorder    = isDark ? "border-slate-700/60"   : "border-slate-200";
  const tblDivide    = isDark ? "divide-slate-800"      : "divide-slate-100";
  const tblRowHover  = isDark ? "hover:bg-slate-800/50" : "hover:bg-slate-50";
  const tblText      = isDark ? "text-slate-200"        : "text-slate-800";
  const tblTextMuted = isDark ? "text-slate-400"        : "text-slate-500";
  const tblTextDim   = isDark ? "text-slate-500"        : "text-slate-400";
  const tblHeadText  = isDark ? "text-slate-400"        : "text-slate-500";
  const tblCellName  = isDark ? "text-white"            : "text-slate-900";
  const tblInputBg   = isDark ? "bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500" : "bg-slate-100 border-slate-200 text-slate-800 placeholder:text-slate-400";
  const tblSelectBg  = isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-slate-100 border-slate-200 text-slate-800";
  const tblViewToggleBg = isDark ? "bg-slate-800 border-slate-700" : "bg-slate-100 border-slate-200";
  const tblViewInactive = isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700";
  const tblDeleteBtn = isDark ? "bg-slate-800 border-slate-700 text-slate-300 hover:border-red-500 hover:text-red-400" : "bg-white border-slate-200 text-slate-600 hover:border-red-400 hover:text-red-500";
  const tblExportBtn = isDark ? "bg-slate-800 border-slate-700 text-slate-300 hover:border-emerald-500 hover:text-emerald-400" : "bg-white border-slate-200 text-slate-600 hover:border-emerald-500 hover:text-emerald-600";
  const tblActionBtn = isDark ? "bg-slate-700 hover:bg-slate-600 text-slate-200" : "bg-slate-100 hover:bg-slate-200 text-slate-700";
  const tblActionDel = isDark ? "bg-slate-700 hover:bg-red-900/60 text-slate-400 hover:text-red-400" : "bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-500";
  const tblTypeBadge = isDark ? "bg-slate-700 text-slate-200" : "bg-slate-100 text-slate-700";
  const tblEmptyText = isDark ? "text-slate-500" : "text-slate-400";
  const tblEmptyIcon = isDark ? "opacity-30" : "opacity-20";
  // ────────────────────────────────────────────────────────────────────────────

  const [labs, setLabs] = useState<Lab[]>([]);
  const [labSchedules, setLabSchedules] = useState<LabScheduleDetail[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [allAdminDeptIds, setAllAdminDeptIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminDepartmentId, setAdminDepartmentId] = useState<string | null>(() => {
    try {
      const adminData = localStorage.getItem("adminUser");
      if (adminData) {
        const parsed = JSON.parse(adminData);
        return parsed?.department_id || null;
      }
    } catch (e) {
      console.error("Error parsing adminUser from localStorage on init:", e);
    }
    return null;
  });
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string>(() => {
    try {
      const adminData = localStorage.getItem("adminUser");
      if (adminData) {
        const parsed = JSON.parse(adminData);
        return parsed?.department_id || "all-departments";
      }
    } catch (e) {
      console.error("Error parsing adminUser from localStorage on init:", e);
    }
    return "all-departments";
  });

  // Table UI state
  const [labSearch, setLabSearch] = useState("");
  const [labTypeFilter, setLabTypeFilter] = useState("all");
  const [labViewMode, setLabViewMode] = useState<'table' | 'list'>('table');
  const [labDeleteMode, setLabDeleteMode] = useState(false);
  const [selectedLabIds, setSelectedLabIds] = useState<Set<string>>(new Set());
  
  // Active tab state: 'schedules' for allocation page, 'labs' for lab list
  const [activeTab, setActiveTab] = useState<string>("schedules");

  // Form states for dialogs
  const [labDialog, setLabDialog] = useState(false);
  const [scheduleViewDialog, setScheduleViewDialog] = useState(false);
  const [selectedLabForSchedule, setSelectedLabForSchedule] = useState<Lab | null>(null);
  const [labForm, setLabForm] = useState({
    name: "",
    lab_code: "",
    capacity: 30,
    max_slots: 3,
    lab_type: "computer",
    description: "",
    building: "",
    floor: "",
    room_number: "",
    year: "", // Legacy support
    section: "", // Legacy support
    allowed_classes: [] as { year: string, section: string }[],
    equipment_list: [] as string[],
    safety_equipment: [] as string[],
    operating_hours: {} as any,
  });
  const [itAdsLabs, setItAdsLabs] = useState<any[]>([]);
  // Editable hours per week map: subjectId -> hours
  const [editableHours, setEditableHours] = useState<Record<string, number>>({});
  const [newSession, setNewSession] = useState({
    semester: "",
    academic_year: new Date().getFullYear().toString() + "-" + (new Date().getFullYear() + 1).toString().slice(-2),
    max_capacity: 30,
    is_available: true
  });

  // Extra Class State
  const [extraClassDialog, setExtraClassDialog] = useState(false);
  const [extraClassForm, setExtraClassForm] = useState({
    day: "",
    period: "",
    subject: "", // Can be subject ID or custom text
    notes: ""
  });

  // Delete mode for schedule slots: 'single' | 'group'
  const [deletePopoverId, setDeletePopoverId] = useState<string | null>(null);

  // Max 3 sections: A, B, C
  const ALL_SECTIONS = ['A', 'B', 'C'];

  const resetLabForm = () => {
    setLabForm({
      name: "",
      lab_code: "",
      capacity: 30,
      max_slots: 3,
      lab_type: "computer",
      description: "",
      building: "",
      floor: "",
      room_number: "",
      year: "",
      section: "",
      allowed_classes: [],
      equipment_list: [],
      safety_equipment: [],
      operating_hours: {},
    });
    setAvailableSections([]);
  };

  const handleCreateLab = async () => {
    if (!adminDepartmentId) {
      toast.error("Admin department not found.");
      return;
    }
    if (!labForm.name) {
      toast.error("Please fill in required fields.");
      return;
    }

    try {
      const generatedCode = generateLabCode(labForm.name);
      const labData = {
        ...labForm,
        lab_code: generatedCode,
        department_id: adminDepartmentId, // Fixed: use department_id as expected by DB
        departments: [adminDepartmentId], 
        year: null,
        section: null,
        allowed_classes: [],
        is_active: true
      };

      const { error } = await (supabase as any)
        .from('labs')
        .insert([labData]);

      if (error) throw error;

      toast.success("Lab created successfully!");
      setLabDialog(false);
      resetLabForm();
      // Trigger reload (simplified)
      window.location.reload();
    } catch (error: any) {
      console.error("Error creating lab:", error);
      toast.error(`Failed to create lab: ${error.message}`);
    }
  };

  const handleDeleteLab = async (labId: string) => {
    if (!confirm('Are you sure you want to delete this lab?')) return;
    try {
      const { error } = await (supabase as any).from('labs').delete().eq('id', labId);
      if (error) throw error;
      toast.success('Lab deleted successfully');
      setLabs(labs.filter(l => l.id !== labId));
    } catch (error: any) {
      console.error('Error deleting lab:', error);
      toast.error(`Failed to delete lab: ${error.message}`);
    }
  };


  useEffect(() => {
    const adminData = localStorage.getItem("adminUser");
    if (!adminData) {
      navigate("/", { replace: true });
      return;
    }

    // Load ALL departments for this admin (multi-dept support)
    (async () => {
      try {
        const parsedAdmin = JSON.parse(adminData);
        if (!parsedAdmin || !parsedAdmin.id) throw new Error("Invalid admin data");

        // Try admin_departments table first (multi-dept)
        const { data: adminDepts, error: adminDeptsError } = await (supabase as any)
          .from('admin_departments')
          .select('department_id')
          .eq('admin_id', parsedAdmin.id);

        let deptIds: string[] = [];

        if (!adminDeptsError && adminDepts && adminDepts.length > 0) {
          deptIds = adminDepts.map((d: any) => d.department_id);
        } else if (parsedAdmin.department_id) {
          // Fallback: use legacy single department_id
          deptIds = [parsedAdmin.department_id];
        }

        if (deptIds.length === 0) {
          toast.error('No departments found. Please contact your Super Admin.');
          setLoading(false);
          return;
        }

        const { data, error } = await (supabase as any)
          .from('departments')
          .select('*')
          .in('id', deptIds)
          .order('name');

        if (error) {
          console.error('Error loading departments:', error);
          toast.error(`Failed to load departments: ${error.message || error}`);
          setLoading(false);
          return;
        }

        if (!data || data.length === 0) {
          toast.error('No departments found. Please contact your Super Admin.');
          setLoading(false);
          return;
        }

        setDepartments(data);
        setAllAdminDeptIds(deptIds);
        // Set primary department for legacy operations
        const primaryDeptId = parsedAdmin.department_id || deptIds[0];
        setAdminDepartmentId(primaryDeptId);
        setSelectedDepartment(primaryDeptId);

        setLoading(false);
      } catch (error) {
        console.error('Exception loading departments:', error);
        toast.error('Failed to load departments. Please try again.');
        setLoading(false);
      }
    })();
  }, [navigate]);

  // Fetch years on mount
  useEffect(() => {
    const fetchYears = async () => {
      const years = await getAllYears();
      setAvailableYears(years);
    };
    fetchYears();
  }, []);

  // Fetch sections when year or department changes
  useEffect(() => {
    const fetchSections = async () => {
      if (adminDepartmentId && labForm.year) {
        try {
          const sections = await getSectionsForYear(adminDepartmentId, labForm.year);
          setAvailableSections(sections);
        } catch (error) {
          console.error("Error fetching sections:", error);
        }
      } else {
        setAvailableSections([]);
      }
    };
    fetchSections();
  }, [adminDepartmentId, labForm.year]);

  const openScheduleViewDialog = async (lab: Lab) => {
    setSelectedLabForSchedule(lab);
    setActiveTab("schedules");

    // Fetch ALL lab-type subjects from ALL departments so subjects can be mapped to department names.
    try {
      const { data: subjs, error: subjsError } = await (supabase as any)
        .from('subjects')
        .select('*, departments(name)')
        .eq('type', 'lab')
        .order('year')
        .order('name');

      if (subjsError) throw subjsError;
      setItAdsLabs(subjs || []);
    } catch (error) {
      console.error('Error loading subjects for lab:', error);
    }
  };

  const loadLabs = async () => {
    try {
      setLoading(true);

      // Determine which dept IDs to filter by
      const adminData = localStorage.getItem("adminUser");
      let deptIdsForFilter: string[] = [];

      if (adminData) {
        const parsedAdmin = JSON.parse(adminData);
        const { data: adminDepts } = await (supabase as any)
          .from('admin_departments')
          .select('department_id')
          .eq('admin_id', parsedAdmin.id);

        if (adminDepts && adminDepts.length > 0) {
          deptIdsForFilter = adminDepts.map((d: any) => d.department_id);
        } else if (parsedAdmin.department_id) {
          deptIdsForFilter = [parsedAdmin.department_id];
        }
      }

      let query = (supabase as any)
        .from('labs')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      // Filter labs: show any lab that contains at least one of the admin's depts
      // We use OR across all dept IDs using overlaps operator
      if (deptIdsForFilter.length > 0) {
        query = query.overlaps('departments', deptIdsForFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      setLabs(data || []);
      if (data && data.length > 0 && !selectedLabForSchedule) {
        setSelectedLabForSchedule(data[0]);
      }
    } catch (error) {
      console.error('Error loading labs:', error);
      toast.error('Failed to load labs');
    } finally {
      setLoading(false);
    }
  };

  const loadLabSchedules = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('lab_schedules')
        .select(`
          *,
          labs(name)
        `)
        .order('lab_id, day_of_week, start_time');

      if (error) throw error;
      setLabSchedules(data || []);
    } catch (error) {
      console.error('Error loading lab schedules:', error);
      toast.error('Failed to load lab schedules');
    }
  };

  useEffect(() => {
    loadLabs();
    loadLabSchedules();
  }, []);  // runs once on mount; loadLabs reads admin depts from localStorage

  const getScheduleForPeriod = (dayOfWeek: number, slotNumber: number) => {
    return labSchedules.find(schedule =>
      schedule.lab_id === selectedLabForSchedule?.id &&
      schedule.day_of_week === dayOfWeek &&
      schedule.slot_number === slotNumber
    );
  };

  const loadITandADSLabs = async () => {
    try {
      const { data: depts, error: deptError } = await (supabase as any)
        .from('departments')
        .select('id, name')
        .or('name.ilike.%IT%,name.ilike.%Information Technology%,name.ilike.%ADS%,name.ilike.%Applied Data Science%');

      if (deptError) throw deptError;

      if (depts && depts.length > 0) {
        const deptIds = depts.map((d: any) => d.id);
        const { data: subjs, error: subjsError } = await (supabase as any)
          .from('subjects')
          .select('id, name, year, department_id, hours_per_week, departments(name)')
          .eq('type', 'lab')
          .in('department_id', deptIds);

        if (subjsError) throw subjsError;
        setItAdsLabs(subjs || []);
      }
    } catch (error) {
      console.error('Error loading IT/ADS labs:', error);
    }
  };

  useEffect(() => {
    loadITandADSLabs();
  }, []);

  const handleAddSchedule = async (slot: { day: number, startTime: string, endTime: string, slotNumber: number, labId: string }, subjectId: string, allocationInfo?: string) => {
    if (!slot || !subjectId) {
      toast.error("Please select a lab session from the list");
      return;
    }

    const selectedLabSubjectData = itAdsLabs.find(l => l.id === subjectId);

    // Access Control Check
    if (selectedLabForSchedule?.allowed_classes && selectedLabForSchedule.allowed_classes.length > 0) {
        // Parse allocationInfo to get Year and Section
        // Format: "Year {Y} Sec {S} - {Name}"
        // or derived from selectedLabSubjectData if allocationInfo is missing (which implies manual/default?)
        
        let targetYear = "";
        let targetSection = "";

        if (allocationInfo) {
            const match = allocationInfo.match(/Year\s+(.+?)\s+Sec\s+(.+?)\s+-/);
            if (match) {
                targetYear = match[1];
                targetSection = match[2];
            }
        } else if (selectedLabSubjectData) {
             targetYear = selectedLabSubjectData.year;
             // If no section specified in allocationInfo, we might need to rely on context or assume it's generic?
             // But the UI forces picking a section button for standard subjects.
             // For manual entry, we might not have section.
        }

        if (targetYear && targetSection) {
            const isAllowed = selectedLabForSchedule.allowed_classes.some(c => 
                c.year === targetYear && (c.section === targetSection || c.section === "All Sections")
            );
            
            if (!isAllowed) {
                toast.error(`Access Denied: Year ${targetYear} Section ${targetSection} is not allowed in this lab.`);
                return;
            }
        }
    }

    try {
      // Determine duration: use subject's hours_per_week if available, or default to 1 (for manual/custom entries)
      const duration = selectedLabSubjectData?.hours_per_week || 1;

      // 1. Check if the starting slot + duration exceeds the daily periods
      // periods is globally available in the file
      if (slot.slotNumber + duration - 1 > periods.length) {
        toast.error(`Cannot schedule ${duration} hours starting at Period ${slot.slotNumber}. It exceeds the daily limit.`);
        return;
      }

      const slotsToBook = [];

      // Parse dept, year, section from allocationInfo
      let parsedDept = "";
      let parsedYear = "";
      let parsedSection = "";
      if (allocationInfo) {
        const parsed = parseScheduleInfo(allocationInfo);
        parsedDept = parsed.dept || "";
        parsedYear = parsed.year ? parsed.year.replace(/Year\s*/i, '').trim() : "";
        parsedSection = parsed.section ? parsed.section.replace(/Sec\s*/i, '').trim() : "";
      } else if (selectedLabSubjectData) {
        parsedYear = String(selectedLabSubjectData.year || "").trim();
        parsedDept = selectedLabSubjectData.departments?.name || "";
      }

      // 2. Prepare slots and check for collisions
      for (let i = 0; i < duration; i++) {
        const currentSlotNum = slot.slotNumber + i;
        
        // A. Check if the lab itself is already occupied (this is a lab collision)
        const isOccupied = labSchedules.find(s => 
          s.lab_id === slot.labId && 
          s.day_of_week === slot.day && 
          s.slot_number === currentSlotNum
        );

        if (isOccupied) {
          toast.error(`Conflict: Period ${currentSlotNum} is already occupied by ${isOccupied.semester || 'another session'}.`);
          return;
        }

        // B. Check if this SAME class/section for THIS department is already assigned to ANY lab in this period!
        if (parsedYear && parsedSection) {
          const classConflict = labSchedules.find(s => {
            if (s.day_of_week !== slot.day || s.slot_number !== currentSlotNum) return false;
            const p = parseScheduleInfo(s.semester || '');
            const sYear = (p.year ? p.year.replace(/Year\s*/i, '') : (s.year || '')).trim();
            const sSection = (p.section ? p.section.replace(/Sec\s*/i, '') : (s.section || '')).trim().toUpperCase();

            if (sYear !== parsedYear || sSection !== parsedSection.toUpperCase()) return false;

            // Same year and section! Check department:
            const sDept = getScheduleDepartment(s, p);
            const targetDept = (parsedDept || '').toLowerCase().trim();

            if (sDept && targetDept) {
              const isSameDept = sDept === targetDept || sDept.includes(targetDept) || targetDept.includes(sDept);
              return isSameDept;
            }

            // Fallback: If department is unknown for both, check if subject names match
            if (p.subject && selectedLabSubjectData?.name) {
              return p.subject.toLowerCase().trim() === selectedLabSubjectData.name.toLowerCase().trim();
            }

            return false; // Different departments DO NOT CONFLICT!
          });

          if (classConflict) {
            const conflictingLabName = classConflict.labs?.name || labs.find(l => l.id === classConflict.lab_id)?.name || 'another lab';
            toast.error(`Conflict: ${parsedDept ? parsedDept + ' ' : ''}Year ${parsedYear} Sec ${parsedSection} is already allocated to ${conflictingLabName} during Period ${currentSlotNum}.`);
            return;
          }
        }

        const periodData = periods.find(p => parseInt(p.id.replace('P', '')) === currentSlotNum);
        
        if (periodData) {
          slotsToBook.push({
            lab_id: slot.labId,
            day_of_week: slot.day,
            start_time: periodData.startTime,
            end_time: periodData.endTime,
            slot_number: currentSlotNum,
            semester: allocationInfo || (selectedLabSubjectData
              ? `Year ${selectedLabSubjectData.year}, ${selectedLabSubjectData.name}`
              : newSession.semester),
            year: parsedYear || null,
            section: parsedSection || null,
            academic_year: newSession.academic_year,
            max_capacity: labs.find(l => l.id === slot.labId)?.capacity || newSession.max_capacity,
            is_available: newSession.is_available,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      }

      if (slotsToBook.length === 0) {
        toast.error("No valid slots found to book.");
        return;
      }

      // 3. Insert all slots
      const { error } = await (supabase as any)
        .from('lab_schedules')
        .insert(slotsToBook);

      if (error) throw error;
      toast.success(`Lab session added successfully (${duration} hour${duration > 1 ? 's' : ''})`);

      // Trigger reload of schedules
      const { data: schedulesData } = await (supabase as any)
        .from('lab_schedules')
        .select('*')
        .in('lab_id', labs.map(lab => lab.id));
      setLabSchedules(schedulesData || []);
    } catch (error: any) {
      console.error('Error adding lab schedule:', error);
      toast.error(`Failed to add lab session: ${error.message}`);
    }
  };

  const handleRemoveSchedule = async (scheduleId: string) => {
    if (!confirm("Are you sure you want to remove this lab session?")) return;
    try {
      const { error } = await (supabase as any)
        .from('lab_schedules')
        .delete()
        .eq('id', scheduleId);

      if (error) throw error;
      toast.success("Lab session removed successfully");
      const { data: schedulesData } = await (supabase as any)
        .from('lab_schedules')
        .select('*')
        .in('lab_id', labs.map(lab => lab.id));
      setLabSchedules(schedulesData || []);
    } catch (error: any) {
      console.error('Error removing lab schedule:', error);
      toast.error(`Failed to remove lab session: ${error.message}`);
    }
  };

  // Find all continuous slots for the same semester/subject on same day+lab
  const getContinuousGroupIds = (scheduleId: string): string[] => {
    const target = labSchedules.find(s => s.id === scheduleId);
    if (!target) return [scheduleId];
    const group = labSchedules
      .filter(s =>
        s.lab_id === target.lab_id &&
        s.day_of_week === target.day_of_week &&
        s.semester === target.semester &&
        (s.year ?? '') === (target.year ?? '') &&
        (s.section ?? '') === (target.section ?? '')
      )
      .sort((a, b) => a.slot_number - b.slot_number);

    // Only include slots that are contiguous with the target slot
    const targetIdx = group.findIndex(s => s.id === scheduleId);
    const contiguous: string[] = [scheduleId];
    // Walk backward
    for (let i = targetIdx - 1; i >= 0; i--) {
      if (group[i].slot_number === group[i + 1].slot_number - 1) {
        contiguous.push(group[i].id);
      } else break;
    }
    // Walk forward
    for (let i = targetIdx + 1; i < group.length; i++) {
      if (group[i].slot_number === group[i - 1].slot_number + 1) {
        contiguous.push(group[i].id);
      } else break;
    }
    return contiguous;
  };

  const handleRemoveScheduleGroup = async (scheduleId: string, deleteAll: boolean) => {
    try {
      const idsToDelete = deleteAll ? getContinuousGroupIds(scheduleId) : [scheduleId];
      await Promise.all(
        idsToDelete.map(id =>
          (supabase as any).from('lab_schedules').delete().eq('id', id)
        )
      );
      toast.success(deleteAll
        ? `Removed all ${idsToDelete.length} continuous slot(s)`
        : 'Lab session removed successfully'
      );
      const { data: schedulesData } = await (supabase as any)
        .from('lab_schedules')
        .select('*')
        .in('lab_id', labs.map(lab => lab.id));
      setLabSchedules(schedulesData || []);
    } catch (error: any) {
      console.error('Error removing lab schedule:', error);
      toast.error(`Failed to remove lab session: ${error.message}`);
    }
  };

  // Save edited hours_per_week for a subject
  const handleSaveHours = async (subjId: string) => {
    const hours = editableHours[subjId];
    if (hours === undefined) return;
    try {
      const { error } = await (supabase as any)
        .from('subjects')
        .update({ hours_per_week: hours })
        .eq('id', subjId);
      if (error) throw error;
      setItAdsLabs(prev => prev.map(s => s.id === subjId ? { ...s, hours_per_week: hours } : s));
      setEditableHours(prev => { const n = { ...prev }; delete n[subjId]; return n; });
      toast.success('Hours updated successfully');
    } catch (e: any) {
      toast.error(`Failed to update hours: ${e.message}`);
    }
  };

  // Helper to resolve department name for any schedule (including legacy ones)
  const getScheduleDepartment = (s: any, parsed: any) => {
    if (parsed?.dept) return parsed.dept.toLowerCase().trim();

    // Look up subject in itAdsLabs to resolve department name
    const subjName = (parsed?.subject || parsed?.raw || '').toLowerCase().trim();
    if (subjName) {
      const matched = itAdsLabs.find(sub => 
        sub.name?.toLowerCase().trim() === subjName ||
        (sub.abbreviation && sub.abbreviation.toLowerCase().trim() === subjName)
      );
      if (matched?.departments?.name) {
        return matched.departments.name.toLowerCase().trim();
      }
    }

    return "";
  };

  // Helper to check if a specific section of a subject is already booked in lab_schedules
  const isSectionBookedForSubject = (subj: any, section: string): boolean => {
    const targetSubjName = subj.name.toLowerCase().trim();
    const targetDeptName = subj.departments?.name?.toLowerCase().trim() || '';
    const targetYear = String(subj.year).trim().toLowerCase();

    return labSchedules.some(s => {
      const parsed = parseScheduleInfo(s.semester || '');
      const sSubjName = (parsed.subject || parsed.raw || '').toLowerCase().trim();

      if (!sSubjName) return false;
      // Match subject name
      if (sSubjName !== targetSubjName && !sSubjName.includes(targetSubjName) && !targetSubjName.includes(sSubjName)) {
        return false;
      }

      // Match section
      const sSection = (parsed.section ? parsed.section.replace(/Sec\s*/i, '') : (s.section || '')).trim().toUpperCase();
      if (sSection !== section.toUpperCase()) {
        return false;
      }

      // Match year
      const sYear = (parsed.year ? parsed.year.replace(/Year\s*/i, '') : (s.year || '')).trim().toLowerCase();
      if (sYear && targetYear && sYear !== targetYear) {
        return false;
      }

      // Match department: if department is present or resolvable, verify department match
      const sDept = getScheduleDepartment(s, parsed);
      if (sDept && targetDeptName) {
        if (sDept !== targetDeptName && !sDept.includes(targetDeptName) && !targetDeptName.includes(sDept)) {
          return false; // Different department, not a conflict!
        }
      }

      return true;
    });
  };

  const getLabNameForSchedule = (schedule: LabScheduleDetail) => {
    const lab = labs.find(l => l.id === schedule.lab_id);
    return lab?.name || 'Unknown Lab';
  };

  const handleManualAddSchedule = async () => {
    if (!selectedLabForSchedule || !extraClassForm.day || !extraClassForm.period || !extraClassForm.subject) {
      toast.error("Please fill in all required fields");
      return;
    }

    const dayIndex = parseInt(extraClassForm.day);
    const periodData = periods.find(p => p.id === extraClassForm.period);

    if (!periodData) {
      toast.error("Invalid period selected");
      return;
    }

    // Check if slot is already occupied
    const existing = getScheduleForPeriod(dayIndex, parseInt(periodData.id.replace('P', '')));
    if (existing) {
      toast.error("This slot is already occupied. Please remove the existing session first.");
      return;
    }

    // Construct slot object for reuse
    const slot = {
      day: dayIndex,
      startTime: periodData.startTime,
      endTime: periodData.endTime,
      slotNumber: parseInt(periodData.id.replace('P', '')),
      labId: selectedLabForSchedule.id
    };

    // Call existing handler
    // If subject matches an ID in itAdsLabs, use it, otherwise pass as note/semester info
    const subjectMatch = itAdsLabs.find(s => s.id === extraClassForm.subject);
    
    if (subjectMatch) {
      await handleAddSchedule(slot, subjectMatch.id);
    } else {
      // Manual entry (Special Class / Extra Class)
      try {
        const { error } = await (supabase as any)
        .from('lab_schedules')
        .insert([{
          lab_id: slot.labId,
          day_of_week: slot.day,
          start_time: slot.startTime,
          end_time: slot.endTime,
          slot_number: slot.slotNumber,
          semester: extraClassForm.subject + (extraClassForm.notes ? ` - ${extraClassForm.notes}` : ""), // Use input as description
          academic_year: newSession.academic_year,
          max_capacity: selectedLabForSchedule.capacity,
          is_available: false, // Occupied
          created_at: new Date().toISOString(),
        }]);

        if (error) throw error;
        toast.success("Extra class added successfully");
        
        // Refresh
        const { data: schedulesData } = await (supabase as any)
          .from('lab_schedules')
          .select('*')
          .in('lab_id', labs.map(lab => lab.id));
        setLabSchedules(schedulesData || []);
        setExtraClassDialog(false);
        setExtraClassForm({ day: "", period: "", subject: "", notes: "" });

      } catch (error: any) {
        console.error('Error adding extra class:', error);
        toast.error(`Failed to add extra class: ${error.message}`);
      }
    }
  };

  const exportLabSchedulePDF = async (lab: Lab) => {
    const pdfMake = (await import('pdfmake/build/pdfmake')).default;
    const vfsFonts = await import('pdfmake/build/vfs_fonts');
    // @ts-ignore
    pdfMake.vfs = vfsFonts.pdfMake.vfs;

    const daysList = [
      { name: 'MON', value: 1 },
      { name: 'TUE', value: 2 },
      { name: 'WED', value: 3 },
      { name: 'THU', value: 4 },
      { name: 'FRI', value: 5 },
      { name: 'SAT', value: 6 }
    ];

    const headerRow = [
      { text: 'DAY', style: 'tableHeader', alignment: 'center' },
      { text: '1\n9:00 to 9:55', style: 'tableHeader', alignment: 'center' },
      { text: '2\n9:55 to 10:50', style: 'tableHeader', alignment: 'center' },
      { text: '3\n11:05 to 12:00', style: 'tableHeader', alignment: 'center' },
      { text: '4\n12:00 to 12:55', style: 'tableHeader', alignment: 'center' },
      { text: '12.55\nto 1.55', style: 'tableHeader', alignment: 'center' },
      { text: '5\n1.55 to 2:50', style: 'tableHeader', alignment: 'center' },
      { text: '6\n2.50 to 03:45', style: 'tableHeader', alignment: 'center' },
      { text: '7\n3.55 to 4:50', style: 'tableHeader', alignment: 'center' }
    ];

    const gridRows = daysList.map((day) => {
      const rowCells: any[] = [{ text: day.name, style: 'dayHeader', alignment: 'center', bold: true }];
      
      for (let p = 1; p <= 4; p++) {
        const sched = labSchedules.find(s => s.lab_id === lab.id && s.day_of_week === day.value && s.slot_number === p);
        rowCells.push({
          text: sched ? (sched.semester || 'Allocated') : '',
          alignment: 'center',
          fontSize: 8
        });
      }

      if (day.value === 1) {
        rowCells.push({ text: 'L\nU\nN\nC\nH', rowSpan: 6, alignment: 'center', bold: true, fontSize: 9 });
      } else {
        rowCells.push('');
      }

      for (let p = 5; p <= 7; p++) {
        const sched = labSchedules.find(s => s.lab_id === lab.id && s.day_of_week === day.value && s.slot_number === p);
        rowCells.push({
          text: sched ? (sched.semester || 'Allocated') : '',
          alignment: 'center',
          fontSize: 8
        });
      }

      return rowCells;
    });

    const scheduledLabsForThisLab = labSchedules.filter(s => s.lab_id === lab.id);
    const uniqueSubjectNames = Array.from(new Set(scheduledLabsForThisLab.map(s => {
      const parsed = parseScheduleInfo(s.semester || '');
      return parsed.subject || parsed.raw || '';
    }).filter(Boolean)));

    const legendRows: any[] = [];
    uniqueSubjectNames.forEach(subjName => {
      const matched = itAdsLabs.find(s => s.name.toLowerCase().trim() === subjName.toLowerCase().trim() || s.abbreviation?.toLowerCase().trim() === subjName.toLowerCase().trim());
      
      const countHrs = scheduledLabsForThisLab.filter(s => {
        const parsed = parseScheduleInfo(s.semester || '');
        const name = parsed.subject || parsed.raw || '';
        return name.toLowerCase().trim() === subjName.toLowerCase().trim();
      }).length;

      const staffIncharge = matched ? (matched.staff || '-') : '-';

      legendRows.push([
        { text: matched ? (matched.code || '-') : '-', alignment: 'center' },
        { text: matched ? (matched.abbreviation || subjName) : subjName, alignment: 'center' },
        { text: matched ? matched.name : subjName, alignment: 'left' },
        { text: countHrs.toString(), alignment: 'center' },
        { text: staffIncharge, alignment: 'left' }
      ]);
    });

    const doc: any = {
      content: [
        { text: 'Computing Lab Slot 1', style: 'mainHeader', alignment: 'center' },
        { text: `LAB SCHEDULE: ${lab.name.toUpperCase()} (${lab.lab_code})`, style: 'subHeader', alignment: 'center', margin: [0, 0, 0, 15] },
        {
          table: {
            headerRows: 1,
            widths: [40, '*', '*', '*', '*', 20, '*', '*', '*'],
            body: [headerRow, ...gridRows]
          },
          margin: [0, 0, 0, 20]
        },
        { text: 'PRACTICAL COURSE DETAILS', style: 'sectionHeader', margin: [0, 10, 0, 5] },
        {
          table: {
            headerRows: 1,
            widths: [80, 80, '*', 60, '*'],
            body: [
              [
                { text: 'SUBJECT CODE', style: 'tableHeader', alignment: 'center' },
                { text: 'Abbreviation', style: 'tableHeader', alignment: 'center' },
                { text: 'COURSE TITLE', style: 'tableHeader', alignment: 'center' },
                { text: 'NO. OF HOURS', style: 'tableHeader', alignment: 'center' },
                { text: 'STAFF INCHARGE', style: 'tableHeader', alignment: 'center' }
              ],
              ...legendRows.length > 0 ? legendRows : [[{ text: 'No scheduled labs', colSpan: 5, alignment: 'center' }, '', '', '', '']]
            ]
          }
        }
      ],
      styles: {
        mainHeader: { fontSize: 16, bold: true, margin: [0, 0, 0, 2] },
        subHeader: { fontSize: 11, bold: true, color: '#555555' },
        sectionHeader: { fontSize: 11, bold: true, decoration: 'underline' },
        tableHeader: { fontSize: 9, bold: true, fillColor: '#eeeeee' },
        dayHeader: { fontSize: 9, bold: true, fillColor: '#f9f9f9' }
      },
      defaultStyle: {
        fontSize: 9
      }
    };

    pdfMake.createPdf(doc).download(`${lab.name.replace(/\s+/g, '_')}_schedule.pdf`);
  };

  const ready = selection.department;

  const LabTable = CustomTable<Lab>;

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNavbar />
        <main className="md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80">
          <section className="container py-8 md:pt-16">
            <div className="text-center">Loading...</div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNavbar />
      <main className="md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80">
        <SelectionHeader />
        <section className="container py-4">
          <div className="space-y-6">

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="schedules" className="flex items-center gap-2 font-bold">
                  <Calendar className="h-4 w-4" />
                  Lab Schedule Allocation
                </TabsTrigger>
                <TabsTrigger value="labs" className="flex items-center gap-2 font-bold">
                  <Settings className="h-4 w-4" />
                  Manage Labs
                </TabsTrigger>
              </TabsList>

              <Dialog open={labDialog} onOpenChange={setLabDialog}>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Add New Lab</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-1 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="name">Lab Name *</Label>
                        <Input id="name" value={labForm.name} onChange={(e) => setLabForm({ ...labForm, name: e.target.value })} placeholder="e.g. Computer Lab 1" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="room">Room Number</Label>
                        <Input id="room" value={labForm.room_number} onChange={(e) => setLabForm({ ...labForm, room_number: e.target.value })} placeholder="e.g. 301" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="type">Lab Type</Label>
                        <Select value={labForm.lab_type} onValueChange={(v) => setLabForm({ ...labForm, lab_type: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="computer">Computer</SelectItem>
                            <SelectItem value="electronics">Electronics</SelectItem>
                            <SelectItem value="physics">Physics</SelectItem>
                            <SelectItem value="chemistry">Chemistry</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="capacity">Capacity</Label>
                        <Input type="number" id="capacity" value={labForm.capacity} onChange={(e) => setLabForm({ ...labForm, capacity: +e.target.value })} />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setLabDialog(false)}>Cancel</Button>
                    <Button onClick={handleCreateLab}>Create Lab</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <TabsContent value="labs" className="space-y-4 animate-fade-in-up duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Manage Laboratory Locations</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Add, edit, view operating schedules, and allocate classes to labs.</p>
                  </div>
                  <Button
                    onClick={() => setLabDialog(true)}
                    className="h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-450 hover:to-teal-555 text-slate-950 font-bold shadow-lg shadow-emerald-500/10 transition-all flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Lab</span>
                  </Button>
                </div>

                <LabTable
                  data={labs}
                  getRowId={(lab) => lab.id}
                  searchKey="name"
                  searchPlaceholder="Search labs by name or code..."
                  exportFileName="labs-list"
                  filters={[
                    {
                      key: "lab_type",
                      label: "Lab Type",
                      options: [
                        { label: "Computer", value: "computer" },
                        { label: "Electronics", value: "electronics" },
                        { label: "Physics", value: "physics" },
                        { label: "Chemistry", value: "chemistry" },
                        { label: "Other", value: "other" },
                      ]
                    }
                  ]}
                  onDeleteSelected={async (ids) => {
                    await Promise.all(ids.map(id => handleDeleteLab(id)));
                    toast.success("Selected labs deleted successfully");
                  }}
                  columns={[
                    {
                      key: "name",
                      header: "Lab Name",
                      sortable: true,
                      render: (lab) => (
                        <div>
                          <div className={`font-semibold ${tblCellName}`}>{lab.name}</div>
                          {lab.room_number && <div className={`text-xs ${tblTextDim}`}>Room {lab.room_number}</div>}
                        </div>
                      )
                    },
                    {
                      key: "lab_code",
                      header: "Code",
                      sortable: true,
                      render: (lab) => <span className="font-mono text-xs text-slate-400">{lab.lab_code}</span>
                    },
                    {
                      key: "lab_type",
                      header: "Type",
                      sortable: true,
                      render: (lab) => <span className={`px-2.5 py-0.5 rounded-full text-xs capitalize ${tblTypeBadge}`}>{lab.lab_type}</span>
                    },
                    {
                      key: "capacity",
                      header: "Capacity",
                      sortable: true,
                      render: (lab) => <span>{lab.capacity} students</span>
                    },
                    {
                      key: "year",
                      header: "Allocated Year",
                      render: (lab) => (
                        <div className="flex flex-wrap gap-1">
                          {(lab.allowed_classes && lab.allowed_classes.length > 0)
                            ? lab.allowed_classes.map((cls, idx) => (
                                <span key={idx} className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 text-[10px] font-medium border border-emerald-900/30">
                                  Yr {cls.year} • {cls.section}
                                </span>
                              ))
                            : (lab.year || lab.section)
                              ? <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 text-[10px] font-medium border border-emerald-900/30">{lab.year} {lab.section}</span>
                              : <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 text-[10px] font-medium border border-emerald-900/30">All Classes</span>
                          }
                        </div>
                      )
                    },
                    {
                      key: "is_active",
                      header: "Status",
                      sortable: true,
                      render: (lab) => (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          lab.is_active ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/30' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {lab.is_active ? 'Active' : 'Inactive'}
                        </span>
                      )
                    },
                    {
                      key: "actions",
                      header: "Actions",
                      render: (lab) => (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openScheduleViewDialog(lab)}
                            className={`h-8 px-3 rounded-lg text-xs font-medium transition-all hover:scale-105 active:scale-95 ${tblActionBtn}`}
                          >
                            Edit
                          </button>
                        </div>
                      )
                    }
                  ]}
                  renderItemCard={(lab, isSelected, onToggleSelect) => (
                    <div
                      key={lab.id}
                      onClick={onToggleSelect}
                      className={`p-5 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col justify-between h-full bg-slate-950 ${
                        isSelected
                          ? "border-emerald-500 shadow-md shadow-emerald-500/5 bg-slate-900/40"
                          : "border-slate-855 hover:border-slate-700 hover:bg-slate-900/10"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-semibold ${tblCellName}`}>{lab.name}</span>
                            <span className={`text-xs font-mono ${tblTextDim}`}>{lab.lab_code}</span>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                              lab.is_active ? 'bg-emerald-955/60 text-emerald-400 border border-emerald-900/30' : 'bg-slate-800 text-slate-450'
                            }`}>{lab.is_active ? 'Active' : 'Inactive'}</span>
                          </div>
                          <div className={`flex items-center gap-3 mt-2 text-xs flex-wrap ${tblTextMuted}`}>
                            <span className="capitalize">{lab.lab_type}</span>
                            <span>•</span>
                            <span>{lab.capacity} students</span>
                            {lab.room_number && <><span>•</span><span>Room {lab.room_number}</span></>}
                          </div>
                          {(lab.allowed_classes && lab.allowed_classes.length > 0) ? (
                            <div className="flex gap-1 flex-wrap mt-2.5">
                              {lab.allowed_classes.map((cls, idx) => (
                                <span key={idx} className="px-1.5 py-0.5 rounded bg-emerald-955/60 text-emerald-400 border border-emerald-900/30">
                                  Yr {cls.year} • {cls.section}
                                </span>
                              ))}
                            </div>
                          ) : (lab.year || lab.section) ? (
                            <div className="flex gap-1 flex-wrap mt-2.5">
                              <span className="px-1.5 py-0.5 rounded bg-emerald-955/60 text-emerald-400 border border-emerald-900/30">
                                {lab.year} {lab.section}
                              </span>
                            </div>
                          ) : (
                            <div className="flex gap-1 flex-wrap mt-2.5">
                              <span className="px-1.5 py-0.5 rounded bg-emerald-955/60 text-emerald-400 border border-emerald-900/30">
                                All Classes
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-3 shrink-0">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => onToggleSelect()}
                            onClick={(e) => e.stopPropagation()}
                            className="border-slate-750 bg-slate-950 data-[state=checked]:bg-emerald-500"
                          />
                          <button
                            onClick={(e) => { e.stopPropagation(); openScheduleViewDialog(lab); }}
                            className={`h-7 px-2.5 rounded-lg text-xs font-medium transition-colors ${tblActionBtn}`}
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                />
              </TabsContent>

              <TabsContent value="schedules" className="space-y-6 animate-fade-in-up duration-300">
                {/* Lab Switcher Top Bar */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-card border border-border shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
                      <FlaskConical className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-foreground">Lab Timetable Allocation</h2>
                      <p className="text-xs text-muted-foreground">Select a lab room to view or edit its weekly schedule.</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    {/* LAB DROPDOWN SELECTOR */}
                    <div className="flex items-center gap-2 flex-1 sm:flex-initial">
                      <Label className="text-xs font-bold shrink-0 hidden md:block text-muted-foreground">Select Lab:</Label>
                      <Select
                        value={selectedLabForSchedule?.id || ""}
                        onValueChange={(labId) => {
                          const found = labs.find(l => l.id === labId);
                          if (found) {
                            openScheduleViewDialog(found);
                          }
                        }}
                      >
                        <SelectTrigger className="h-10 min-w-[260px] md:min-w-[320px] rounded-xl font-bold text-xs bg-background border-2 border-emerald-500/50 text-foreground shadow-sm">
                          <SelectValue placeholder="Choose a Laboratory..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-[320px]">
                          {labs.map((l) => (
                            <SelectItem key={l.id} value={l.id} className="font-semibold text-xs cursor-pointer">
                              {l.name} ({l.lab_code}) {l.room_number ? `- Room ${l.room_number}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedLabForSchedule && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportLabSchedulePDF(selectedLabForSchedule)}
                        className="h-10 px-4 rounded-xl border border-border hover:bg-accent transition-all font-semibold flex items-center gap-2 shrink-0"
                      >
                        <Download className="h-4 w-4 text-emerald-500" />
                        <span>Export PDF</span>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Main Schedule Content for Selected Lab */}
                {selectedLabForSchedule ? (
                  <div className="space-y-4">
                    {/* Lab Info Banner */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-card border rounded-xl shadow-sm">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">Allowed Allocation</p>
                        {selectedLabForSchedule.allowed_classes && selectedLabForSchedule.allowed_classes.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {selectedLabForSchedule.allowed_classes.map((cls: any, idx: number) => (
                              <Badge key={idx} variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                Yr {cls.year} • {cls.section}
                              </Badge>
                            ))}
                          </div>
                        ) : (selectedLabForSchedule.year || selectedLabForSchedule.section) ? (
                          <div className="mt-1">
                            <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                              {selectedLabForSchedule.year ? `Year ${selectedLabForSchedule.year}` : ''} {selectedLabForSchedule.section ? `• Sec ${selectedLabForSchedule.section}` : ''}
                            </Badge>
                          </div>
                        ) : (
                          <p className="font-bold text-xs text-orange-600 dark:text-orange-400 mt-1">Shared Campus Facility (All Classes)</p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">Room Number</p>
                        <p className="font-bold text-sm text-foreground mt-0.5">{selectedLabForSchedule.room_number || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">Max Student Capacity</p>
                        <p className="font-bold text-sm text-foreground mt-0.5">{selectedLabForSchedule.capacity} students</p>
                      </div>
                    </div>

                    {/* Schedule Table Grid */}
                    <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/60">
                            <TableHead className="w-24 font-bold text-center border-r">Day / Period</TableHead>
                            {periods.map((period) => (
                              <TableHead key={period.id} className="text-center border-r min-w-[110px]">
                                <div className="space-y-1">
                                  <div className="font-bold text-sm">{period.id}</div>
                                  <div className="text-[11px] text-muted-foreground">{period.time}</div>
                                </div>
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[
                            { name: 'Monday', value: 1 },
                            { name: 'Tuesday', value: 2 },
                            { name: 'Wednesday', value: 3 },
                            { name: 'Thursday', value: 4 },
                            { name: 'Friday', value: 5 },
                            { name: 'Saturday', value: 6 }
                          ].map((day) => (
                            <TableRow key={day.name} className="hover:bg-muted/20">
                              <TableCell className="font-bold text-center border-r bg-muted/30">
                                {day.name}
                              </TableCell>
                              {periods.map((period) => {
                                const slotNumber = parseInt(period.id.replace('P', ''));
                                const scheduleForPeriod = getScheduleForPeriod(day.value, slotNumber);
                                const parsedInfo = scheduleForPeriod ? parseScheduleInfo(scheduleForPeriod.semester || "Allocated") : null;

                                return (
                                  <TableCell key={period.id} className="text-center p-2 border-r text-xs align-middle">
                                    {scheduleForPeriod && parsedInfo ? (
                                      <div className="relative group w-full h-full min-h-[55px] flex flex-col items-center justify-center p-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                        {(() => {
                                          const matchedSubj = (parsedInfo.subject || parsedInfo.raw)
                                            ? itAdsLabs.find(s =>
                                                s.name.toLowerCase().trim() === (parsedInfo.subject || parsedInfo.raw).toLowerCase().trim() ||
                                                (s.abbreviation && s.abbreviation.toLowerCase().trim() === (parsedInfo.subject || parsedInfo.raw).toLowerCase().trim())
                                              )
                                            : null;
                                          const displayDept = parsedInfo.dept || matchedSubj?.departments?.name || null;

                                          return parsedInfo.year ? (
                                            <>
                                              {displayDept && (
                                                <div className="text-[9px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wide truncate max-w-full px-0.5 leading-tight">
                                                  {displayDept}
                                                </div>
                                              )}
                                              <div className="text-[10px] font-semibold text-muted-foreground leading-tight mb-0.5">
                                                {parsedInfo.year} {parsedInfo.section ? `• ${parsedInfo.section}` : ''}
                                              </div>
                                              <div className="font-bold text-foreground text-center leading-tight px-1 text-[11px]">
                                                {parsedInfo.subject}
                                              </div>
                                            </>
                                          ) : (
                                            <div className="font-bold text-foreground text-center leading-tight px-1 text-[11px]">
                                              {displayDept && (
                                                <div className="text-[9px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wide truncate max-w-full px-0.5 leading-tight mb-0.5">
                                                  {displayDept}
                                                </div>
                                              )}
                                              {parsedInfo.raw}
                                            </div>
                                          );
                                        })()}
                                        {/* Smart delete: 1hr or all continuous */}
                                        <Popover
                                          open={deletePopoverId === scheduleForPeriod.id}
                                          onOpenChange={(open) => setDeletePopoverId(open ? scheduleForPeriod.id : null)}
                                        >
                                          <PopoverTrigger asChild>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="absolute -top-1 -right-1 h-5 w-5 bg-background/80 hover:bg-destructive hover:text-white text-destructive shadow-sm rounded-full opacity-0 group-hover:opacity-100 transition-all z-10"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <Trash2 className="h-3 w-3" />
                                            </Button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-48 p-2" align="end">
                                            <div className="flex flex-col gap-1">
                                              <p className="text-xs font-semibold text-muted-foreground mb-1 px-1">Delete option</p>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="text-xs justify-start hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setDeletePopoverId(null);
                                                  if (!confirm('Delete only this 1-hour slot?')) return;
                                                  handleRemoveScheduleGroup(scheduleForPeriod.id, false);
                                                }}
                                              >
                                                <Trash2 className="h-3 w-3 mr-1.5" />
                                                Delete 1 hour
                                              </Button>
                                              {getContinuousGroupIds(scheduleForPeriod.id).length > 1 && (
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="text-xs justify-start hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    const cnt = getContinuousGroupIds(scheduleForPeriod.id).length;
                                                    setDeletePopoverId(null);
                                                    if (!confirm(`Delete all ${cnt} continuous hours for this lab session?`)) return;
                                                    handleRemoveScheduleGroup(scheduleForPeriod.id, true);
                                                  }}
                                                >
                                                  <Trash2 className="h-3 w-3 mr-1.5" />
                                                  Delete all {getContinuousGroupIds(scheduleForPeriod.id).length} hrs
                                                </Button>
                                              )}
                                            </div>
                                          </PopoverContent>
                                        </Popover>
                                      </div>
                                    ) : (
                                      <Popover
                                        open={openPopoverId === `${day.value}-${period.id}`}
                                        onOpenChange={(open) => setOpenPopoverId(open ? `${day.value}-${period.id}` : null)}
                                      >
                                        <PopoverTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            role="combobox"
                                            className="h-10 w-full justify-between border-none bg-transparent hover:bg-muted/50 focus:ring-0 shadow-none px-2"
                                          >
                                            <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold truncate">Accessible</span>
                                            <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent side="bottom" align="start" sideOffset={6} collisionPadding={16} className="w-[310px] max-w-[92vw] p-0 overflow-hidden shadow-2xl border-2 z-50 bg-popover text-popover-foreground rounded-xl">
                                          <Command>
                                            <CommandInput placeholder="Search subject..." className="h-9 border-b" />
                                            <CommandList className="max-h-[260px] md:max-h-[300px] overflow-y-auto scrollbar-thin">
                                              <CommandEmpty>No subject found for this department.</CommandEmpty>
                                              <CommandGroup>
                                                {(() => {
                                                  const allSections = ALL_SECTIONS;

                                                  // Determine department IDs allocated for the current lab
                                                  const labDeptIds: string[] = (selectedLabForSchedule?.departments && selectedLabForSchedule.departments.length > 0)
                                                    ? selectedLabForSchedule.departments
                                                    : (selectedLabForSchedule?.department_id ? [selectedLabForSchedule.department_id] : (allAdminDeptIds.length > 0 ? allAdminDeptIds : []));

                                                  // Filter subjects so it ONLY shows subjects for the allocated department(s) of this lab
                                                  const displaySubjects = itAdsLabs.filter(subj => {
                                                    if (labDeptIds.length === 0) return true;
                                                    return labDeptIds.includes(subj.department_id);
                                                  });

                                                  if (displaySubjects.length === 0) {
                                                    return <div className="px-4 py-3 text-sm text-muted-foreground text-center">No lab subjects available for this department.</div>;
                                                  }

                                                  return displaySubjects.map((subj) => {
                                                    const allowedClasses = selectedLabForSchedule.allowed_classes || [];
                                                    const hasRestriction = allowedClasses.length > 0;
                                                    const allowedSectionsForYear = allowedClasses
                                                      .filter(c => c.year === subj.year)
                                                      .map(c => c.section);
                                                    const currentHours = editableHours[subj.id] !== undefined ? editableHours[subj.id] : (subj.hours_per_week || 1);
                                                    const isEditingHours = editableHours[subj.id] !== undefined;

                                                    return (
                                                    <CommandItem
                                                      key={subj.id}
                                                      value={`${subj.name} ${subj.year} ${subj.departments?.name || ''}`}
                                                      onSelect={() => {}}
                                                      className="px-4 py-3 cursor-pointer rounded-lg m-1 hover:bg-muted/80 transition-colors"
                                                    >
                                                      <div className="flex flex-col text-left w-full group/item">
                                                        <div className="flex justify-between items-center mb-1">
                                                          <span className="text-[13px] font-bold text-foreground">{subj.name}</span>
                                                          <div className="flex items-center gap-1.5">
                                                            {/* Editable hours */}
                                                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                              <input
                                                                type="number"
                                                                min={1}
                                                                max={7}
                                                                value={currentHours}
                                                                onChange={e => setEditableHours(prev => ({ ...prev, [subj.id]: parseInt(e.target.value) || 1 }))}
                                                                className="w-10 text-center text-[11px] border rounded px-1 py-0.5 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700 font-bold focus:outline-none"
                                                                title="Edit hours per week for this subject"
                                                              />
                                                              <span className="text-[9px] text-muted-foreground">hr</span>
                                                              {isEditingHours && (
                                                                <button
                                                                  onClick={e => { e.stopPropagation(); handleSaveHours(subj.id); }}
                                                                  className="text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded font-bold hover:bg-emerald-600"
                                                                >Save</button>
                                                              )}
                                                            </div>
                                                            <span className="text-[11px] font-semibold bg-muted px-1.5 py-0.5 rounded text-muted-foreground">Year {subj.year}</span>
                                                          </div>
                                                        </div>
                                                        {/* Show department name */}
                                                        {subj.departments?.name && (
                                                          <span className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 mb-1 truncate bg-violet-50 dark:bg-violet-900/30 px-1.5 py-0.5 rounded w-fit">
                                                            Dept: {subj.departments.name}
                                                          </span>
                                                        )}
                                                        <div className="flex flex-wrap gap-1 mt-1 border-t pt-2 border-border/50">
                                                          {allSections.map((section) => {
                                                            const isLabAllowed = !hasRestriction ||
                                                              allowedSectionsForYear.includes(section) ||
                                                              allowedSectionsForYear.includes('All Sections');
                                                            
                                                            const alreadyBooked = isSectionBookedForSubject(subj, section);
                                                            const isAvailable = isLabAllowed && !alreadyBooked;

                                                            const title = !isLabAllowed
                                                              ? `Sec ${section} not allowed in this lab`
                                                              : alreadyBooked
                                                                ? `Sec ${section} already allocated for this subject`
                                                                : `Assign to Sec ${section}`;

                                                            return (
                                                              <Button
                                                                key={section}
                                                                size="sm"
                                                                variant="outline"
                                                                disabled={!isAvailable}
                                                                title={title}
                                                                className={`h-7 w-7 p-0 text-[10px] font-bold transition-colors ${
                                                                  alreadyBooked
                                                                    ? 'opacity-40 cursor-not-allowed bg-red-50 border-red-200 text-red-400'
                                                                    : isAvailable
                                                                      ? 'hover:bg-emerald-500 hover:text-white hover:border-emerald-500 cursor-pointer'
                                                                      : 'opacity-30 cursor-not-allowed'
                                                                }`}
                                                                onClick={(e) => {
                                                                  e.stopPropagation();
                                                                  if (!isAvailable) return;
                                                                  const slot = {
                                                                    day: day.value,
                                                                    startTime: period.startTime,
                                                                    endTime: period.endTime,
                                                                    slotNumber: parseInt(period.id.replace('P', '')),
                                                                    labId: selectedLabForSchedule.id
                                                                  };
                                                                  const deptName = subj.departments?.name || '';
                                                                  const allocationInfo = deptName
                                                                    ? `${deptName} • Year ${subj.year} Sec ${section} - ${subj.name}`
                                                                    : `Year ${subj.year} Sec ${section} - ${subj.name}`;
                                                                  handleAddSchedule(slot, subj.id, allocationInfo);
                                                                  setOpenPopoverId(null);
                                                                }}
                                                              >
                                                                {section}
                                                              </Button>
                                                            );
                                                          })}
                                                        </div>
                                                      </div>
                                                    </CommandItem>
                                                    );
                                                  });
                                                })()}
                                              </CommandGroup>
                                            </CommandList>
                                          </Command>
                                        </PopoverContent>
                                      </Popover>
                                    )}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Legend */}
                    <div className="flex gap-6 text-sm justify-center pt-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 bg-emerald-500/20 border border-emerald-500 rounded"></div>
                        <span className="text-xs font-semibold">Allocated Lab Session</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-600 font-bold text-xs">Accessible</span>
                        <span className="text-xs font-semibold">Add Session</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-12 text-center text-muted-foreground bg-card rounded-xl border">
                    Select a laboratory room from the dropdown above to view or edit its allocation schedule.
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </section>
      </main>

      {/* Add Extra Class Dialog */}
      <Dialog open={extraClassDialog} onOpenChange={setExtraClassDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Extra Class</DialogTitle>
            <CardDescription>Manually book a slot for a special session or extra class.</CardDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Day</Label>
                <Select value={extraClassForm.day} onValueChange={(v) => setExtraClassForm({ ...extraClassForm, day: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Day" />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d, i) => (
                      <SelectItem key={d} value={(i + 1).toString()}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Period</Label>
                <Select value={extraClassForm.period} onValueChange={(v) => setExtraClassForm({ ...extraClassForm, period: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Period" />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.id} ({p.time})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Subject / Activity</Label>
              {/* Allow selecting existing subject OR typing custom */}
              <div className="relative">
                  <Select 
                  value={
                    extraClassForm.subject && !itAdsLabs.find(s => s.id === extraClassForm.subject) 
                    ? 'custom' 
                    : (extraClassForm.subject || '')
                  } 
                  onValueChange={(v) => {
                    if (v === 'custom') {
                        setExtraClassForm({ ...extraClassForm, subject: '' });
                    } else {
                        setExtraClassForm({ ...extraClassForm, subject: v });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Subject or Type Custom" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom" className="font-semibold text-emerald-600">Custom Entry (Type Below)</SelectItem>
                      {itAdsLabs.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name} (Year {s.year})</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
                <Input 
                className="mt-2"
                placeholder="Enter Custom Subject/Activity Name" 
                value={
                  itAdsLabs.find(s => s.id === extraClassForm.subject) 
                  ? '' 
                  : extraClassForm.subject
                }
                onChange={(e) => setExtraClassForm({ ...extraClassForm, subject: e.target.value })}
                disabled={!!itAdsLabs.find(s => s.id === extraClassForm.subject)}
                />
            </div>
            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Input 
                placeholder="e.g. Makeup Class, Exam, etc." 
                value={extraClassForm.notes} 
                onChange={(e) => setExtraClassForm({ ...extraClassForm, notes: e.target.value })} 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtraClassDialog(false)}>Cancel</Button>
            <Button onClick={handleManualAddSchedule} className="bg-emerald-600 hover:bg-emerald-700 text-white">Add Class</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Lab;
