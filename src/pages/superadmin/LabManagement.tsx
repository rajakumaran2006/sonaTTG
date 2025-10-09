import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import Navbar from "@/components/navbar/Navbar";
import { Plus, Edit, Trash2, Calendar, Settings } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  department_id: string;
  created_at: string;
  updated_at: string;
}

// Note: Lab admin management removed for simplicity - can be added back later if needed

interface LabSchedule {
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
}

const LabManagement = () => {
  const navigate = useNavigate();
  const [labs, setLabs] = useState<Lab[]>([]);
  const [labSchedules, setLabSchedules] = useState<LabSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Form states for dialogs
  const [labDialog, setLabDialog] = useState(false);
  const [scheduleDialog, setScheduleDialog] = useState(false);
  const [editingLab, setEditingLab] = useState<Lab | null>(null);

  // Form data
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
    department_id: ""
  });


  const [scheduleForm, setScheduleForm] = useState({
    lab_id: "",
    day_of_week: 1,
    start_time: "09:00",
    end_time: "11:00",
    max_capacity: 30,
    slot_number: 1,
    semester: "",
    academic_year: ""
  });

  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      loadLabs();
      loadLabSchedules();
    }
  }, [isLoggedIn]);

  const checkAuth = () => {
    const loggedIn = localStorage.getItem("superAdmin") === "true";
    setIsLoggedIn(loggedIn);
    if (!loggedIn) {
      navigate("/super-admin-login", { replace: true });
    }
  };

  const loadLabs = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('labs')
        .select('*')
        .order('name');

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
      department_id: ""
    });
    setEditingLab(null);
  };


  const resetScheduleForm = () => {
    setScheduleForm({
      lab_id: "",
      day_of_week: 1,
      start_time: "09:00",
      end_time: "11:00",
      max_capacity: 30,
      slot_number: 1,
      semester: "",
      academic_year: ""
    });
  };

  const handleCreateLab = async () => {
    try {
      // Prepare the data for insertion
      const labData = {
        name: labForm.name,
        lab_code: labForm.lab_code,
        capacity: labForm.capacity,
        max_slots: labForm.max_slots,
        lab_type: labForm.lab_type,
        description: labForm.description,
        building: labForm.building,
        floor: labForm.floor,
        room_number: labForm.room_number,
        equipment_list: labForm.equipment_list,
        safety_equipment: labForm.safety_equipment,
        operating_hours: labForm.operating_hours,
        department_id: labForm.department_id,
        created_by: (await supabase.auth.getUser()).data.user?.id
      };

      const { error } = await (supabase as any)
        .from('labs')
        .insert([labData]);

      if (error) throw error;

      toast.success('Lab created successfully');
      setLabDialog(false);
      resetLabForm();
      loadLabs();
    } catch (error) {
      console.error('Error creating lab:', error);
      toast.error('Failed to create lab');
    }
  };

  const handleUpdateLab = async () => {
    if (!editingLab) return;

    try {
      // Prepare the data for update
      const labData = {
        name: labForm.name,
        lab_code: labForm.lab_code,
        capacity: labForm.capacity,
        max_slots: labForm.max_slots,
        lab_type: labForm.lab_type,
        description: labForm.description,
        building: labForm.building,
        floor: labForm.floor,
        room_number: labForm.room_number,
        equipment_list: labForm.equipment_list,
        safety_equipment: labForm.safety_equipment,
        operating_hours: labForm.operating_hours,
        department_id: labForm.department_id
      };

      const { error } = await (supabase as any)
        .from('labs')
        .update(labData)
        .eq('id', editingLab.id);

      if (error) throw error;

      toast.success('Lab updated successfully');
      setLabDialog(false);
      resetLabForm();
      loadLabs();
    } catch (error) {
      console.error('Error updating lab:', error);
      toast.error('Failed to update lab');
    }
  };

  const handleDeleteLab = async (labId: string) => {
    if (!confirm('Are you sure you want to delete this lab? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await (supabase as any)
        .from('labs')
        .delete()
        .eq('id', labId);

      if (error) throw error;

      toast.success('Lab deleted successfully');
      loadLabs();
      loadLabSchedules();
    } catch (error) {
      console.error('Error deleting lab:', error);
      toast.error('Failed to delete lab');
    }
  };


  const handleCreateSchedule = async () => {
    try {
      const { error } = await (supabase as any)
        .from('lab_schedules')
        .insert([scheduleForm]);

      if (error) throw error;

      toast.success('Schedule created successfully');
      setScheduleDialog(false);
      resetScheduleForm();
      loadLabSchedules();
    } catch (error) {
      console.error('Error creating schedule:', error);
      toast.error('Failed to create schedule');
    }
  };

  const openEditLabDialog = (lab: Lab) => {
    setEditingLab(lab);
    setLabForm({
      name: lab.name,
      lab_code: lab.lab_code || "",
      capacity: lab.capacity,
      max_slots: lab.max_slots,
      lab_type: lab.lab_type || "computer",
      description: lab.description || "",
      building: lab.building || "",
      floor: lab.floor || "",
      room_number: lab.room_number || "",
      equipment_list: Array.isArray(lab.equipment_list) ? lab.equipment_list : [],
      safety_equipment: Array.isArray(lab.safety_equipment) ? lab.safety_equipment : [],
      operating_hours: lab.operating_hours || {},
      department_id: lab.department_id || ""
    });
    setLabDialog(true);
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
      <section className="container py-10">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Lab Management</h1>
            <p className="text-sm text-muted-foreground">Manage lab facilities, schedules, and admin assignments</p>
          </div>
          <Button onClick={() => navigate('/super-admin')}>
            Back to Dashboard
          </Button>
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

          <TabsContent value="labs" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Lab Facilities</h2>
              <Dialog open={labDialog} onOpenChange={setLabDialog}>
                <DialogTrigger asChild>
                  <Button onClick={resetLabForm}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Lab
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>{editingLab ? 'Edit Lab' : 'Create New Lab'}</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="name">Lab Name *</Label>
                        <Input
                          id="name"
                          value={labForm.name}
                          onChange={(e) => setLabForm({ ...labForm, name: e.target.value })}
                          placeholder="e.g., Computer Lab 1"
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="lab_code">Lab Code *</Label>
                        <Input
                          id="lab_code"
                          value={labForm.lab_code}
                          onChange={(e) => setLabForm({ ...labForm, lab_code: e.target.value })}
                          placeholder="e.g., CL1"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="capacity">Capacity *</Label>
                        <Input
                          id="capacity"
                          type="number"
                          value={labForm.capacity}
                          onChange={(e) => setLabForm({ ...labForm, capacity: parseInt(e.target.value) || 0 })}
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="max_slots">Max Slots *</Label>
                        <Input
                          id="max_slots"
                          type="number"
                          value={labForm.max_slots}
                          onChange={(e) => setLabForm({ ...labForm, max_slots: parseInt(e.target.value) || 0 })}
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="lab_type">Lab Type *</Label>
                        <Select value={labForm.lab_type} onValueChange={(value) => setLabForm({ ...labForm, lab_type: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="computer">Computer</SelectItem>
                            <SelectItem value="electronics">Electronics</SelectItem>
                            <SelectItem value="physics">Physics</SelectItem>
                            <SelectItem value="chemistry">Chemistry</SelectItem>
                            <SelectItem value="biology">Biology</SelectItem>
                            <SelectItem value="workshop">Workshop</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="description">Description *</Label>
                      <Input
                        id="description"
                        value={labForm.description}
                        onChange={(e) => setLabForm({ ...labForm, description: e.target.value })}
                        placeholder="Brief description of the lab"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="building">Building *</Label>
                        <Input
                          id="building"
                          value={labForm.building}
                          onChange={(e) => setLabForm({ ...labForm, building: e.target.value })}
                          placeholder="Tech Building"
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="floor">Floor *</Label>
                        <Input
                          id="floor"
                          value={labForm.floor}
                          onChange={(e) => setLabForm({ ...labForm, floor: e.target.value })}
                          placeholder="2nd Floor"
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="room_number">Room *</Label>
                        <Input
                          id="room_number"
                          value={labForm.room_number}
                          onChange={(e) => setLabForm({ ...labForm, room_number: e.target.value })}
                          placeholder="201"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="department">Department *</Label>
                      <Select value={labForm.department_id} onValueChange={(value) => setLabForm({ ...labForm, department_id: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="computer-science">Computer Science</SelectItem>
                          <SelectItem value="electronics-engineering">Electronics Engineering</SelectItem>
                          <SelectItem value="physics">Physics</SelectItem>
                          <SelectItem value="chemistry">Chemistry</SelectItem>
                          <SelectItem value="mechanical-engineering">Mechanical Engineering</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setLabDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={editingLab ? handleUpdateLab : handleCreateLab}>
                      {editingLab ? 'Update' : 'Create'} Lab
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {labs.map((lab) => (
                <Card key={lab.id} className="relative">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{lab.name}</CardTitle>
                        <CardDescription>
                          {lab.building && `${lab.building}, `}
                          {lab.floor && `${lab.floor}, `}
                          {lab.room_number && `Room ${lab.room_number}`}
                        </CardDescription>
                      </div>
                      <Badge variant={lab.is_active ? "default" : "secondary"}>
                        {lab.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Code:</span>
                      <Badge variant="outline">{lab.lab_code}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Capacity:</span>
                      <span className="font-medium">{lab.capacity} students</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Type:</span>
                      <span className="font-medium capitalize">{lab.lab_type}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Location:</span>
                      <span className="font-medium">{lab.building}, {lab.floor}, Room {lab.room_number}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Status:</span>
                      <Badge variant={lab.maintenance_status === 'operational' ? 'default' : 'destructive'}>
                        {lab.maintenance_status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {lab.description}
                    </p>
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditLabDialog(lab)}
                        className="flex-1"
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteLab(lab.id)}
                        className="flex-1"
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
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
              <Dialog open={scheduleDialog} onOpenChange={setScheduleDialog}>
                <DialogTrigger asChild>
                  <Button onClick={resetScheduleForm}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Schedule
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create Lab Schedule</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="schedule_lab">Select Lab</Label>
                      <Select value={scheduleForm.lab_id} onValueChange={(value) => setScheduleForm({ ...scheduleForm, lab_id: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a lab" />
                        </SelectTrigger>
                        <SelectContent>
                          {labs.filter(lab => lab.is_active).map((lab) => (
                            <SelectItem key={lab.id} value={lab.id}>
                              {lab.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="day_of_week">Day of Week</Label>
                      <Select value={scheduleForm.day_of_week.toString()} onValueChange={(value) => setScheduleForm({ ...scheduleForm, day_of_week: parseInt(value) })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {dayNames.map((day, index) => (
                            <SelectItem key={index + 1} value={(index + 1).toString()}>
                              {day}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="start_time">Start Time</Label>
                        <Input
                          id="start_time"
                          type="time"
                          value={scheduleForm.start_time}
                          onChange={(e) => setScheduleForm({ ...scheduleForm, start_time: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="end_time">End Time</Label>
                        <Input
                          id="end_time"
                          type="time"
                          value={scheduleForm.end_time}
                          onChange={(e) => setScheduleForm({ ...scheduleForm, end_time: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="max_capacity">Max Capacity</Label>
                        <Input
                          id="max_capacity"
                          type="number"
                          value={scheduleForm.max_capacity}
                          onChange={(e) => setScheduleForm({ ...scheduleForm, max_capacity: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="slot_number">Slot Number</Label>
                        <Input
                          id="slot_number"
                          type="number"
                          value={scheduleForm.slot_number}
                          onChange={(e) => setScheduleForm({ ...scheduleForm, slot_number: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setScheduleDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateSchedule}>
                      Create Schedule
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
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
    </main>
  );
};

export default LabManagement;
