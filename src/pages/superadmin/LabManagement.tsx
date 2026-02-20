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
import { Check, ChevronsUpDown, Search, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

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
      <main className="min-h-screen bg-background">
        <Navbar />
        <section className="container py-10">
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80 transition-all duration-300">
        <section className="container py-10 md:pt-16">
        <header className="mb-8 flex justify-end">
          <div className="flex items-center gap-4">
            <div className="w-48">
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger>
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-departments">All Departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => setLabDialog(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add Lab
            </Button>
            <Button variant="outline" onClick={() => navigate('/super-admin')}>
              Back to Dashboard
            </Button>
          </div>
        </header>

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



            <div className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
              {labs.map((lab) => (
                <Card key={lab.id} className="relative">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base font-semibold leading-tight">{lab.name}</CardTitle>
                        <CardDescription className="text-xs">
                          {lab.building && `${lab.building}, `}
                          {lab.floor && `${lab.floor}, `}
                          {lab.room_number && `Room ${lab.room_number}`}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={lab.is_active ? "default" : "secondary"} className="text-[10px] py-0.5 px-2">
                          {lab.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">Capacity</span>
                      <span className="font-medium text-sm">{lab.capacity} students</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">Location</span>
                      <span className="font-medium text-right text-sm truncate max-w-[60%]">
                        {lab.building}{lab.floor ? `, ${lab.floor}` : ''}{lab.room_number ? `, Room ${lab.room_number}` : ''}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-sm text-muted-foreground">Available Departments:</span>
                      <div className="flex flex-wrap gap-1">
                        {lab.departments && lab.departments.length > 0 ? (
                          lab.departments.map((deptId) => {
                            const dept = departments.find(d => d.id === deptId);
                            return (
                              <Badge key={deptId} variant="outline" className="text-[10px]">
                                {dept?.name || 'Unknown'}
                              </Badge>
                            );
                          })
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            No departments (field may not exist in current schema)
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {lab.description}
                    </p>
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openScheduleViewDialog(lab)}
                        className="flex-1 h-8"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteLab(lab.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>


          <TabsContent value="schedules" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Lab Schedules</h2>
              {/* Add Schedule button removed for read-only view */}
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
                                {dayNames[schedule.day_of_week - 1]} - Slot {schedule.slot_number}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {schedule.start_time} - {schedule.end_time}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-medium">{schedule.max_capacity} students</div>
                              <Badge variant={schedule.is_available ? "default" : "secondary"}>
                                {schedule.is_available ? "Available" : "Unavailable"}
                              </Badge>
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
        </section>
      </div>

      {/* Schedule View Modal */}
      <Dialog open={scheduleViewDialog} onOpenChange={setScheduleViewDialog}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
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

    </main>
  );
};

export default LabManagement;
