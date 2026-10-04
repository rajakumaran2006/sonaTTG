import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import Navbar from "@/components/navbar/Navbar";
import { Calendar, Settings, Eye, Plus, Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Search, ChevronDown, Beaker, Sparkles, Building } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDarkMode } from "@/context/DarkModeContext";

interface Department {
  id: string;
  name: string;
}

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
}

// Note: Lab admin management removed for simplicity - can be added back later if needed


const LabManagement = () => {
  const navigate = useNavigate();
  const { isDark } = useDarkMode();
  const [labs, setLabs] = useState<Lab[]>([]);
  const [labSchedules, setLabSchedules] = useState<LabScheduleDetail[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all-departments");
  const [loading, setLoading] = useState(true);
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Form states for dialogs
  const [scheduleViewDialog, setScheduleViewDialog] = useState(false);
  const [labDialog, setLabDialog] = useState(false);
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

  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];



  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      loadDepartments();
      loadLabs();
      loadLabSchedules();
      loadITandADSLabs();
    }
  }, [isLoggedIn, selectedDepartment]);

  const checkAuth = () => {
    const loggedIn = localStorage.getItem("superAdmin") === "true";
    setIsLoggedIn(loggedIn);
    if (!loggedIn) {
      navigate("/", { replace: true });
    }
  };

  const loadDepartments = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('departments')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setDepartments(data || []);
    } catch (error) {
      console.error('Error loading departments:', error);
      toast.error('Failed to load departments');
    }
  };

  const loadLabs = async () => {
    try {
      let query = (supabase as any)
        .from('labs')
        .select('*')
        .eq('is_active', true)
        .order('name');

      // Note: departments field may not exist in current schema
      // Filter by department if selected (skip if "all-departments")
      if (selectedDepartment && selectedDepartment !== "all-departments") {
        query = query.contains('departments', [selectedDepartment]);
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
      equipment_list: [],
      safety_equipment: [],
      operating_hours: {},
    });
  };

  const handleCreateLab = async () => {
    if (!labForm.name || !labForm.lab_code) {
      toast.error("Please fill in required fields.");
      return;
    }

    try {
      // For Super Admin, we might want to let them pick departments,
      // but for now let's auto-assign the currently selected department if applicable
      const labData = {
        ...labForm,
        departments: selectedDepartment !== "all-departments" ? [selectedDepartment] : [],
        is_active: true
      };

      const { error } = await (supabase as any)
        .from('labs')
        .insert([labData]);

      if (error) throw error;

      toast.success("Lab created successfully!");
      setLabDialog(false);
      resetLabForm();
      loadLabs();
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

  const loadITandADSLabs = async () => {
    try {
      // First get IT and ADS department IDs
      const { data: depts, error: deptError } = await (supabase as any)
        .from('departments')
        .select('id, name')
        .or('name.ilike.%IT%,name.ilike.%Info%,name.ilike.%ADS%,name.ilike.%Data Science%');

      if (deptError) throw deptError;

      if (depts && depts.length > 0) {
        const deptIds = depts.map((d: any) => d.id);
        const { data: subjs, error: subjsError } = await (supabase as any)
          .from('subjects')
          .select('id, name, year, department_id, departments(name)')
          .eq('type', 'lab')
          .in('department_id', deptIds);

        if (subjsError) throw subjsError;
        setItAdsLabs(subjs || []);
      }
    } catch (error) {
      console.error('Error loading IT/ADS labs:', error);
    }
  };



  const openScheduleViewDialog = async (lab: Lab) => {
    setSelectedLabForSchedule(lab);
    setScheduleViewDialog(true);

    // Fetch subjects for the departments associated with this lab
    try {
      if (lab.departments && lab.departments.length > 0) {
        const { data: subjs, error: subjsError } = await (supabase as any)
          .from('subjects')
          .select('*')
          .eq('type', 'lab')
          .in('department_id', lab.departments)
          .order('name');

        if (subjsError) throw subjsError;
        setItAdsLabs(subjs || []);
      } else {
        setItAdsLabs([]);
      }
    } catch (error) {
      console.error('Error loading subjects for lab:', error);
    }
  };

  const getScheduleForDay = (dayOfWeek: number) => {
    return labSchedules.filter(schedule =>
      schedule.lab_id === selectedLabForSchedule?.id && schedule.day_of_week === dayOfWeek
    ).sort((a, b) => a.slot_number - b.slot_number);
  };


  const handleAddSchedule = async (slot: { day: number, startTime: string, endTime: string, slotNumber: number }, subjectId: string) => {
    if (!selectedLabForSchedule || !slot || !subjectId) {
      toast.error("Please select a lab session from the list");
      return;
    }

    try {
      const selectedLabSubjectData = itAdsLabs.find(l => l.id === subjectId);

      const { error } = await (supabase as any)
        .from('lab_schedules')
        .insert([{
          lab_id: selectedLabForSchedule.id,
          day_of_week: slot.day,
          start_time: slot.startTime,
          end_time: slot.endTime,
          slot_number: slot.slotNumber,
          semester: selectedLabSubjectData
            ? `Year ${selectedLabSubjectData.year}, ${selectedLabSubjectData.name}`
            : newSession.semester,
          academic_year: newSession.academic_year,
          max_capacity: selectedLabForSchedule.capacity || newSession.max_capacity,
          is_available: newSession.is_available,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }]);

      if (error) throw error;
      toast.success("Lab session added successfully");
      loadLabSchedules();
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
      loadLabSchedules();
    } catch (error: any) {
      console.error('Error removing lab schedule:', error);
      toast.error(`Failed to remove lab session: ${error.message}`);
    }
  };

  const periods = [
    { id: 'P1', time: '9:00-9:55', startTime: '09:00', endTime: '09:55' },
    { id: 'P2', time: '9:55-10:50', startTime: '09:55', endTime: '10:50' },
    { id: 'P3', time: '11:05-12:00', startTime: '11:05', endTime: '12:00' },
    { id: 'P4', time: '12:00-12:55', startTime: '12:00', endTime: '12:55' },
    { id: 'P5', time: '1:55-2:50', startTime: '13:55', endTime: '14:50' },
    { id: 'P6', time: '2:50-3:45', startTime: '14:50', endTime: '15:45' },
    { id: 'P7', time: '3:55-4:50', startTime: '15:55', endTime: '16:50' }
  ];

  const getScheduleForPeriod = (dayOfWeek: number, slotNumber: number) => {
    return labSchedules.find(schedule =>
      schedule.lab_id === selectedLabForSchedule?.id &&
      schedule.day_of_week === dayOfWeek &&
      schedule.slot_number === slotNumber
    );
  };

  if (loading) {
    return (
      <div className={`min-h-screen relative flex items-center justify-center transition-colors duration-300 ${
        isDark ? "bg-[#060814] text-white" : "bg-[#f8faff] text-slate-900"
      }`}>
        <Navbar />
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <p className={`text-xs font-semibold ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>Loading facilities...</p>
        </div>
      </div>
    );
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

      <main className="md:pl-72 pt-16 md:pt-16 transition-all duration-300 relative z-10">
        <section className="max-w-7xl mx-auto px-6 sm:px-8 py-8 md:py-10 w-full space-y-8">
          {/* Header Banner */}
          <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-5 p-6 rounded-2xl backdrop-blur-2xl border transition-all duration-300 ${
            isDark
              ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
              : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06)]"
          }`}>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full border ${
                  isDark
                    ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/25"
                    : "bg-indigo-50 text-indigo-700 border-indigo-200"
                }`}>
                  Laboratory Infrastructure
                </span>
                <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  {labs.length} {labs.length === 1 ? 'lab facility' : 'lab facilities'}
                </span>
              </div>
              <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                isDark ? "text-white" : "bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 bg-clip-text text-transparent"
              }`}>
                Lab Management
              </h1>
              <p className={`text-xs sm:text-sm mt-1 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Configure laboratory facilities, workstation capacities, and weekly usage schedules.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-52">
                <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                  <SelectTrigger className={`h-10 rounded-xl text-xs border ${
                    isDark ? "bg-white/[0.04] border-indigo-500/25 text-white" : "bg-white border-indigo-200/80 text-slate-800"
                  }`}>
                    <SelectValue placeholder="All Departments" />
                  </SelectTrigger>
                  <SelectContent className={`rounded-xl border backdrop-blur-2xl ${
                    isDark ? "bg-[#0a0e1e]/95 border-indigo-500/25 text-white" : "bg-white/95 border-indigo-200"
                  }`}>
                    <SelectItem value="all-departments">All Departments</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id} className="cursor-pointer">
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => setLabDialog(true)}
                className="h-10 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-xs px-4 shadow-sm shadow-indigo-500/25 border border-indigo-400/30 flex items-center gap-2"
              >
                <Plus className="h-4 w-4" /> Add Lab
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/super-admin')}
                className={`h-10 rounded-xl border text-xs font-semibold px-4 transition-all ${
                  isDark ? "bg-white/5 border-indigo-500/20 text-slate-200 hover:bg-white/10" : "bg-white border-indigo-200 text-slate-700 hover:bg-indigo-50"
                }`}
              >
                Dashboard
              </Button>
            </div>
          </div>

          <Tabs defaultValue="labs" className="space-y-6">
            <TabsList className={`p-1 rounded-xl border ${
              isDark ? "bg-[#0a0e1e]/80 border-indigo-500/20" : "bg-indigo-50/60 border-indigo-200/70"
            }`}>
              <TabsTrigger value="labs" className="flex items-center gap-2 rounded-lg text-xs font-semibold px-4 py-2">
                <Settings className="h-3.5 w-3.5" />
                Labs
              </TabsTrigger>
              <TabsTrigger value="schedules" className="flex items-center gap-2 rounded-lg text-xs font-semibold px-4 py-2">
                <Calendar className="h-3.5 w-3.5" />
                Schedules
              </TabsTrigger>
            </TabsList>

          <Dialog open={labDialog} onOpenChange={setLabDialog}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add New Lab</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Lab Name *</Label>
                    <Input id="name" value={labForm.name} onChange={(e) => setLabForm({ ...labForm, name: e.target.value })} placeholder="e.g. Computer Lab 1" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="code">Lab Code *</Label>
                    <Input id="code" value={labForm.lab_code} onChange={(e) => setLabForm({ ...labForm, lab_code: e.target.value })} placeholder="e.g. CL1" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="capacity">Capacity</Label>
                    <Input type="number" id="capacity" value={labForm.capacity} onChange={(e) => setLabForm({ ...labForm, capacity: +e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="type">Type</Label>
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
                  <div className="grid gap-2">
                    <Label htmlFor="room">Room Number</Label>
                    <Input id="room" value={labForm.room_number} onChange={(e) => setLabForm({ ...labForm, room_number: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="building">Building</Label>
                    <Input id="building" value={labForm.building} onChange={(e) => setLabForm({ ...labForm, building: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="floor">Floor</Label>
                    <Input id="floor" value={labForm.floor} onChange={(e) => setLabForm({ ...labForm, floor: e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="desc">Description</Label>
                  <Input id="desc" value={labForm.description} onChange={(e) => setLabForm({ ...labForm, description: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setLabDialog(false)}>Cancel</Button>
                <Button onClick={handleCreateLab}>Create Lab</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <TabsContent value="labs" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Lab Facilities</h2>
              {/* Add Lab button removed for read-only view */}
            </div>



            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {labs.map((lab) => (
                <div
                  key={lab.id}
                  className={`group relative rounded-2xl p-6 backdrop-blur-2xl border transition-all duration-300 flex flex-col justify-between overflow-hidden ${
                    isDark
                      ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_12px_-2px_rgba(99,102,241,0.12)] hover:border-indigo-400/40 hover:shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_20px_-2px_rgba(99,102,241,0.25)]"
                      : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06),0_0_10px_-2px_rgba(99,102,241,0.05)] hover:border-indigo-300 hover:shadow-[0_8px_28px_rgba(99,102,241,0.12)]"
                  }`}
                >
                  <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-400/30 to-transparent" />

                  <div>
                    <div className={`flex items-start justify-between gap-3 pb-3 border-b ${
                      isDark ? "border-indigo-500/15" : "border-indigo-100"
                    }`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 border ${
                            isDark ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-400" : "bg-indigo-50 border-indigo-200 text-indigo-600"
                          }`}>
                            <Beaker className="h-4 w-4" />
                          </div>
                          <h3 className={`text-base font-bold truncate leading-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                            {lab.name}
                          </h3>
                        </div>
                        <p className={`text-xs mt-1 ml-9 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                          {lab.building && `${lab.building}, `}
                          {lab.floor && `${lab.floor}, `}
                          {lab.room_number && `Room ${lab.room_number}`}
                        </p>
                      </div>
                      <Badge
                        variant={lab.is_active ? "default" : "secondary"}
                        className={`text-[10px] py-0.5 px-2 font-semibold border ${
                          lab.is_active
                            ? isDark
                              ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                              : "bg-indigo-50 text-indigo-700 border-indigo-200"
                            : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                        }`}
                      >
                        {lab.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>

                    <div className="space-y-2.5 pt-3.5 text-xs">
                      <div className={`flex items-center justify-between p-2 rounded-xl border ${
                        isDark ? "bg-white/[0.03] border-indigo-500/15" : "bg-indigo-50/40 border-indigo-100"
                      }`}>
                        <span className={isDark ? "text-slate-400" : "text-slate-500"}>Capacity</span>
                        <span className={`font-black text-sm ${isDark ? "text-indigo-300" : "text-indigo-600"}`}>
                          {lab.capacity} students
                        </span>
                      </div>

                      <div className="space-y-1">
                        <span className={`text-[11px] font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                          Associated Branches:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {lab.departments && lab.departments.length > 0 ? (
                            lab.departments.map((deptId) => {
                              const dept = departments.find(d => d.id === deptId);
                              return (
                                <Badge key={deptId} variant="outline" className={`text-[10px] ${
                                  isDark ? "border-indigo-500/30 text-indigo-300 bg-indigo-500/10" : "border-indigo-200 text-indigo-700 bg-indigo-50"
                                }`}>
                                  {dept?.name || 'Unknown'}
                                </Badge>
                              );
                            })
                          ) : (
                            <span className="text-[10px] text-muted-foreground">General access</span>
                          )}
                        </div>
                      </div>

                      {lab.description && (
                        <p className={`text-[11px] line-clamp-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                          {lab.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openScheduleViewDialog(lab)}
                      className={`flex-1 h-8 rounded-xl text-xs font-semibold border transition-all ${
                        isDark ? "bg-white/5 border-indigo-500/20 text-slate-200 hover:bg-white/10" : "bg-white border-indigo-200 text-slate-700 hover:bg-indigo-50"
                      }`}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      Manage Schedule
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl"
                      onClick={() => handleDeleteLab(lab.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="schedules" className="space-y-6">
            <div className="space-y-4">
              {labs.map((lab) => {
                const labScheds = labSchedules.filter(schedule => schedule.lab_id === lab.id);
                if (labScheds.length === 0) return null;

                return (
                  <div
                    key={lab.id}
                    className={`rounded-2xl p-6 backdrop-blur-2xl border transition-all duration-300 ${
                      isDark
                        ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_12px_-2px_rgba(99,102,241,0.12)] text-white"
                        : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06),0_0_10px_-2px_rgba(99,102,241,0.05)] text-slate-900"
                    }`}
                  >
                    <h3 className="text-base font-bold mb-4 flex items-center gap-2">
                      <Beaker className="h-4 w-4 text-indigo-400" />
                      {lab.name} - Schedule
                    </h3>
                    <div className="space-y-2">
                      {labScheds.map((schedule) => (
                        <div
                          key={schedule.id}
                          className={`flex items-center justify-between p-3.5 rounded-xl border ${
                            isDark ? "bg-white/[0.03] border-indigo-500/15" : "bg-indigo-50/40 border-indigo-100"
                          }`}
                        >
                          <div className="flex-1">
                            <div className="font-bold text-xs">
                              {dayNames[schedule.day_of_week - 1]} - Slot {schedule.slot_number}
                            </div>
                            <div className={`text-[11px] mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                              {schedule.start_time} - {schedule.end_time}
                            </div>
                          </div>
                          <div className="text-right flex items-center gap-3">
                            <span className={`text-xs font-semibold ${isDark ? "text-indigo-300" : "text-indigo-600"}`}>
                              {schedule.max_capacity} students
                            </span>
                            <Badge variant={schedule.is_available ? "default" : "secondary"} className={`text-[10px] ${
                              schedule.is_available
                                ? isDark ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                : "bg-slate-500/10 text-slate-400"
                            }`}>
                              {schedule.is_available ? "Available" : "Unavailable"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
        </section>
      </main>

      {/* Schedule View Modal */}
      <Dialog open={scheduleViewDialog} onOpenChange={setScheduleViewDialog}>
        <DialogContent className={`max-w-6xl max-h-[80vh] overflow-y-auto rounded-2xl border backdrop-blur-2xl shadow-2xl ${
          isDark ? "bg-[#0a0e1e]/95 border-indigo-500/25 text-white" : "bg-white/95 border-indigo-200/80 text-slate-900"
        }`}>
          <DialogHeader>
            <DialogTitle>
              Schedule for {selectedLabForSchedule?.name} ({selectedLabForSchedule?.lab_code})
            </DialogTitle>
          </DialogHeader>

          {selectedLabForSchedule && (
            <div className="space-y-4">
              {/* Lab Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/20 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Building</p>
                  <p className="font-semibold">{selectedLabForSchedule.building}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Floor</p>
                  <p className="font-semibold">{selectedLabForSchedule.floor}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Room</p>
                  <p className="font-semibold">{selectedLabForSchedule.room_number}</p>
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

                          return (
                            <TableCell key={period.id} className="text-center p-2 border-r">
                              {scheduleForPeriod ? (
                                <div className="space-y-1 relative group flex flex-col items-center">
                                  <div className="font-bold text-xs text-black text-center leading-tight">
                                    {scheduleForPeriod.semester || "Allocated"}
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute -top-2 -right-2 h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => handleRemoveSchedule(scheduleForPeriod.id)}
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
                                          {itAdsLabs.map((subj) => (
                                            <CommandItem
                                              key={subj.id}
                                              value={subj.name}
                                              onSelect={() => {
                                                const slot = {
                                                  day: day.value,
                                                  startTime: period.startTime,
                                                  endTime: period.endTime,
                                                  slotNumber: parseInt(period.id.replace('P', ''))
                                                };
                                                handleAddSchedule(slot, subj.id);
                                                setOpenPopoverId(null);
                                              }}
                                              className="px-4 py-3 cursor-pointer rounded-lg m-1 hover:bg-muted/80 transition-colors"
                                            >
                                              <div className="flex flex-col text-left">
                                                <span className="text-[13px] font-bold text-foreground">{subj.name}</span>
                                                <span className="text-[11px] text-muted-foreground">Year {subj.year}</span>
                                              </div>
                                            </CommandItem>
                                          ))}
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
    </div>
  );
};

export default LabManagement;
