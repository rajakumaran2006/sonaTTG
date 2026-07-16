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
import { Plus, Trash2, Edit, Calendar, Settings, Eye, LayoutGrid, List, Download } from "lucide-react";
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
import { Check, ChevronsUpDown, Search, ChevronDown } from "lucide-react"; // Search used in lab table header
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
  
  // Pattern 1: Year {Y} Sec {S} - {Subject}
  // Matches: Year III Sec C - FSD Lab
  const yearSecMatch = info.match(/Year\s+([a-zA-Z0-9]+)\s+Sec\s+([a-zA-Z0-9]+)\s+-\s+(.+)/);
  if (yearSecMatch) {
    return {
      year: `Year ${yearSecMatch[1]}`,
      section: `Sec ${yearSecMatch[2]}`,
      subject: yearSecMatch[3]
    };
  }

  // Pattern 2: Year {Y}, {Subject}
  // Matches: Year III, FSD Lab
  const yearMatch = info.match(/Year\s+([a-zA-Z0-9]+),\s+(.+)/);
  if (yearMatch) {
    return {
      year: `Year ${yearMatch[1]}`,
      subject: yearMatch[2]
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
  
  // Year and Section for Lab creation
  const [availableYears, setAvailableYears] = useState<any[]>([]);
  const [availableSections, setAvailableSections] = useState<any[]>([]);

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
    setScheduleViewDialog(true);

    // Fetch ALL lab-type subjects from ALL departments this admin manages.
    // Since labs are shared campus facilities, show subjects from every allocated dept.
    try {
      // Collect dept IDs: union of lab.departments + all admin depts
      const adminData = localStorage.getItem("adminUser");
      let deptIds: string[] = [...(lab.departments || [])];

      if (adminData) {
        const parsedAdmin = JSON.parse(adminData);
        // Try admin_departments first
        const { data: adminDepts } = await (supabase as any)
          .from('admin_departments')
          .select('department_id')
          .eq('admin_id', parsedAdmin.id);

        if (adminDepts && adminDepts.length > 0) {
          const ids = adminDepts.map((d: any) => d.department_id);
          deptIds = [...new Set([...deptIds, ...ids])];
        } else if (parsedAdmin.department_id) {
          deptIds = [...new Set([...deptIds, parsedAdmin.department_id])];
        }
      }

      if (deptIds.length === 0) {
        setItAdsLabs([]);
        return;
      }

      const { data: subjs, error: subjsError } = await (supabase as any)
        .from('subjects')
        .select('*, departments(name)')
        .eq('type', 'lab')
        .in('department_id', deptIds)
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

      // Parse year and section from allocationInfo (format: "Year III Sec C - Subject")
      let parsedYear = "";
      let parsedSection = "";
      if (allocationInfo) {
        const match = allocationInfo.match(/Year\s+(.+?)\s+Sec\s+(.+?)\s+-/);
        if (match) {
          parsedYear = match[1];
          parsedSection = match[2];
        }
      } else if (selectedLabSubjectData) {
        parsedYear = selectedLabSubjectData.year || "";
        // No section info available without allocationInfo — leave parsedSection empty
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

        // B. Check if this class/section is already assigned to ANY lab in this period!
        if (parsedYear && parsedSection) {
          const classConflict = labSchedules.find(s =>
            s.year === parsedYear &&
            s.section === parsedSection &&
            s.day_of_week === slot.day &&
            s.slot_number === currentSlotNum
          );
          if (classConflict) {
            const conflictingLabName = classConflict.labs?.name || labs.find(l => l.id === classConflict.lab_id)?.name || 'another lab';
            toast.error(`Conflict: Year ${parsedYear} Sec ${parsedSection} is already allocated to ${conflictingLabName} during Period ${currentSlotNum}.`);
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

            <Tabs defaultValue="labs" className="space-y-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="labs" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Labs
                </TabsTrigger>
                <TabsTrigger value="schedules" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Schedules
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

              <TabsContent value="schedules" className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold">Lab Schedules</h2>
                </div>

                <div className="space-y-4">
                  {labs.map((lab) => {
                    const labScheds = labSchedules.filter(schedule => schedule.lab_id === lab.id);
                    if (labScheds.length === 0) return null;

                    return (
                      <Card key={lab.id}>
                        <CardHeader>
                          <CardTitle>{lab.name} - Schedule</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {labScheds.map((schedule) => (
                              <div key={schedule.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                                <div className="flex-1">
                                  <div className="font-medium">
                                    {DAYS[schedule.day_of_week - 1]} - Slot {schedule.slot_number}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {schedule.start_time} - {schedule.end_time}
                                  </div>
                                </div>
                                <div className="text-right flex items-center gap-4">
                                  <div>
                                    <div className="font-medium">{schedule.max_capacity} students</div>
                                    <Badge variant={schedule.is_available ? "default" : "secondary"}>
                                      {schedule.is_available ? "Available" : "Unavailable"}
                                    </Badge>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive"
                                    onClick={() => handleRemoveSchedule(schedule.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </section>
      </main>

      {/* Schedule View Modal */}
      <Dialog open={scheduleViewDialog} onOpenChange={setScheduleViewDialog}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center justify-between border-b pb-4">
            <DialogTitle>
              Schedule for {selectedLabForSchedule?.name} ({selectedLabForSchedule?.lab_code})
            </DialogTitle>
          </DialogHeader>

          {selectedLabForSchedule && (
            <div className="space-y-4">
              {/* Lab Info */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-muted/20 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Allocation</p>
                  {selectedLabForSchedule.allowed_classes && selectedLabForSchedule.allowed_classes.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
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
                    <p className="font-semibold text-orange-600">Shared Campus Facility (All Classes)</p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Room</p>
                  <p className="font-semibold">{selectedLabForSchedule.room_number || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Capacity</p>
                  <p className="font-semibold">{selectedLabForSchedule.capacity} students</p>
                </div>
              </div>


              {/* Schedule Table */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-24 font-bold text-center border-r">Day / Period</TableHead>
                      {periods.map((period) => (
                        <TableHead key={period.id} className="text-center border-r min-w-[100px]">
                          <div className="space-y-1">
                            <div className="font-bold text-sm">{period.id}</div>
                            <div className="text-xs text-muted-foreground">{period.time}</div>
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
                        <TableCell className="font-medium text-center border-r bg-muted/30">
                          {day.name}
                        </TableCell>
                        {periods.map((period) => {
                          const slotNumber = parseInt(period.id.replace('P', ''));
                          const scheduleForPeriod = getScheduleForPeriod(day.value, slotNumber);

                          const parsedInfo = scheduleForPeriod ? parseScheduleInfo(scheduleForPeriod.semester || "Allocated") : null;

                          return (
                            <TableCell key={period.id} className="text-center p-2 border-r text-xs align-middle">
                              {scheduleForPeriod && parsedInfo ? (
                                <div className="relative group w-full h-full min-h-[50px] flex flex-col items-center justify-center">
                                  {parsedInfo.year ? (
                                    <>
                                      <div className="text-[10px] font-medium text-muted-foreground leading-tight mb-1">
                                        {parsedInfo.year} {parsedInfo.section ? `• ${parsedInfo.section}` : ''}
                                      </div>
                                      <div className="font-bold text-foreground text-center leading-tight px-1">
                                        {parsedInfo.subject}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="font-bold text-foreground text-center leading-tight px-1 text-[11px]">
                                      {parsedInfo.raw}
                                    </div>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute -top-1 -right-1 h-5 w-5 bg-background/80 hover:bg-destructive hover:text-white text-destructive shadow-sm rounded-full opacity-0 group-hover:opacity-100 transition-all z-10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveSchedule(scheduleForPeriod.id);
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
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
                                      <span className="text-primary text-xs font-medium truncate">Accessible</span>
                                      <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-[280px] p-0 overflow-hidden shadow-xl border-2" align="start">
                                    <Command>
                                      <CommandInput placeholder="Search subject..." className="h-9 border-b" />
                                      <CommandList
                                        className="max-h-[350px] overflow-y-auto scrollbar-thin"
                                      >
                                        <CommandEmpty>No subject found.</CommandEmpty>
                                        <CommandGroup>
                                          {(() => {
                                            // Build set of subject names already scheduled in this lab
                                            const scheduledSemesters = new Set(
                                              labSchedules
                                                .filter(s => s.lab_id === selectedLabForSchedule.id)
                                                .map(s => (s.semester || '').toLowerCase())
                                            );
                                            // Filter out subjects that are already booked in this lab
                                            const availableSubjects = itAdsLabs.filter(subj =>
                                              !scheduledSemesters.has(subj.name.toLowerCase()) &&
                                              !Array.from(scheduledSemesters).some(sem => sem.includes(subj.name.toLowerCase()))
                                            );
                                            if (availableSubjects.length === 0) {
                                              return <div className="px-4 py-3 text-sm text-muted-foreground text-center">All subjects already scheduled.</div>;
                                            }
                                            return availableSubjects.map((subj) => (
                                            <CommandItem
                                              key={subj.id}
                                              value={`${subj.name} ${subj.year} ${subj.departments?.name || ''}`}
                                              onSelect={() => {
                                                const slot = {
                                                  day: day.value,
                                                  startTime: period.startTime,
                                                  endTime: period.endTime,
                                                  slotNumber: parseInt(period.id.replace('P', '')),
                                                  labId: selectedLabForSchedule.id
                                                };
                                                handleAddSchedule(slot, subj.id);
                                                setOpenPopoverId(null);
                                              }}
                                              className="px-4 py-3 cursor-pointer rounded-lg m-1 hover:bg-muted/80 transition-colors"
                                            >
                                              <div className="flex flex-col text-left w-full group/item">
                                                <div className="flex justify-between items-center mb-1">
                                                  <span className="text-[13px] font-bold text-foreground">{subj.name}</span>
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-[10px] bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded border border-blue-100 dark:border-blue-800 font-medium">
                                                      {subj.hours_per_week || 1}h
                                                    </span>
                                                    <span className="text-[11px] font-semibold bg-muted px-1.5 py-0.5 rounded text-muted-foreground">Year {subj.year}</span>
                                                  </div>
                                                </div>
                                                {subj.departments?.name && (
                                                  <span className="text-[10px] text-muted-foreground mb-1 truncate">
                                                    Dept: {subj.departments.name}
                                                  </span>
                                                )}
                                                <div className="flex flex-wrap gap-1 mt-1 border-t pt-2 border-border/50">
                                                  {(() => {
                                                    // Get allowed sections for this subject's year from the lab's allowed_classes
                                                    const allowedClasses = selectedLabForSchedule.allowed_classes || [];
                                                    const allowedSectionsForYear = allowedClasses
                                                      .filter(c => c.year === subj.year)
                                                      .map(c => c.section);
                                                    // All possible sections to display
                                                    const allSections = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
                                                    // If no allowed_classes defined, show all sections (no restriction)
                                                    const hasRestriction = allowedClasses.length > 0;
                                                    return allSections.map((section) => {
                                                      const isAllowed = !hasRestriction || 
                                                        allowedSectionsForYear.includes(section) || 
                                                        allowedSectionsForYear.includes('All Sections');
                                                      return (
                                                        <Button
                                                          key={section}
                                                          size="sm"
                                                          variant="outline"
                                                          disabled={!isAllowed}
                                                          title={!isAllowed ? `Sec ${section} is not allowed in this lab` : `Assign to Sec ${section}`}
                                                          className={`h-7 w-7 p-0 text-[10px] font-bold transition-colors ${
                                                            isAllowed
                                                              ? 'hover:bg-emerald-500 hover:text-white hover:border-emerald-500 cursor-pointer'
                                                              : 'opacity-30 cursor-not-allowed'
                                                          }`}
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (!isAllowed) return;
                                                            const slot = {
                                                              day: day.value,
                                                              startTime: period.startTime,
                                                              endTime: period.endTime,
                                                              slotNumber: parseInt(period.id.replace('P', '')),
                                                              labId: selectedLabForSchedule.id
                                                            };
                                                            const allocationInfo = `Year ${subj.year} Sec ${section} - ${subj.name}`;
                                                            handleAddSchedule(slot, subj.id, allocationInfo);
                                                            setOpenPopoverId(null);
                                                          }}
                                                        >
                                                          {section}
                                                        </Button>
                                                      );
                                                    });
                                                  })()}
                                                </div>
                                              </div>
                                            </CommandItem>
                                          ));
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
              <div className="flex gap-6 text-sm justify-center">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-500 rounded"></div>
                  <span>Regular Classes</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                  <span>Special Activities</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-primary font-medium">Accessible</span>
                  <span>Add Lab Session</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setScheduleViewDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
