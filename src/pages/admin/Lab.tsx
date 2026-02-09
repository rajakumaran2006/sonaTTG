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
import { getDepartmentByName } from "@/lib/supabaseService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AdminNavbar from "@/components/navbar/AdminNavbar";
import { Plus, Trash2, Edit } from "lucide-react";

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
  labs?: { name: string };
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PERIODS = ['Period 1', 'Period 2', 'Period 3', 'Period 4', 'Period 5', 'Period 6', 'Period 7'];

const Lab = () => {
  const navigate = useNavigate();
  const selection = useTimetableStore((s) => s.selection);
  const setSelection = useTimetableStore((s) => s.setSelection);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [labSchedules, setLabSchedules] = useState<LabSchedule[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminDepartmentId, setAdminDepartmentId] = useState<string | null>(null);

  // Lab Form State
  const [labDialog, setLabDialog] = useState(false);
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
    if (!adminDepartmentId) {
        toast.error("Admin department not found.");
        return;
    }
    if (!labForm.name || !labForm.lab_code) {
        toast.error("Please fill in required fields.");
        return;
    }

    try {
        const labData = {
            ...labForm,
            departments: [adminDepartmentId], // Auto-assign Admin's department
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
      navigate("/admin-login", { replace: true });
      return;
    }

    // Load departments for this admin's department only and set selection
    (async () => {
      try {
        const parsedAdmin = JSON.parse(adminData);
        if (!parsedAdmin || !parsedAdmin.department_id) throw new Error("Invalid admin data");
        const { data, error } = await (supabase as any)
          .from('departments')
          .select('*')
          .eq('id', parsedAdmin.department_id);

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

        // Set admin's department for selection
        setDepartments(data);
        setAdminDepartmentId(parsedAdmin.department_id);
        
        // Automatically set the department selection if not already set
        if (!selection.department) {
          setSelection({ department: data[0].name });
        }

        // Also load all departments for lab display
        const { data: allDepts } = await (supabase as any)
          .from('departments')
          .select('*')
          .order('name');

        if (allDepts) {
          setDepartments(allDepts);
        }
        setLoading(false);
      } catch (error) {
        console.error('Exception loading departments:', error);
        toast.error('Failed to load departments. Please try again.');
        setLoading(false);
      }
    })();
  }, [navigate, setSelection, selection.department]);

  useEffect(() => {
    if (!selection.department) return;

    (async () => {
      try {
        setLoading(true);

        // Note: Current labs table doesn't have department_id, so we fetch all labs
        // In a real implementation, we'd filter by the admin's department

        // Get department ID for filtering
        const dept = await getDepartmentByName(selection.department);
        if (!dept) {
          setLoading(false);
          return;
        }

        // Note: departments field may not exist in current schema
        // Fetch labs for this admin's department only
        const { data: labsData, error: labsError } = await (supabase as any)
          .from('labs')
          .select('*')
          .contains('departments', [dept.id])
          .eq('is_active', true);

        if (labsError) {
          console.error('Error fetching labs:', labsError);
          toast.error(`Failed to load labs: ${labsError.message}`);
          setLoading(false);
          return;
        }

        setLabs(labsData || []);

        // Fetch lab schedules for this department's labs
        const { data: schedulesData, error: schedulesError } = await (supabase as any)
          .from('lab_schedules')
          .select('*')
          .in('lab_id', labsData?.map(lab => lab.id) || []);

        if (schedulesError) {
          console.error('Error fetching lab schedules:', schedulesError);
          toast.error(`Failed to load lab schedules: ${schedulesError.message}`);
          setLoading(false);
          return;
        }

        setLabSchedules(schedulesData || []);
      } catch (error) {
        console.error('Error loading lab data:', error);
        toast.error('Failed to load lab data');
      } finally {
        setLoading(false);
      }
    })();
  }, [selection.department]);

  const getLabScheduleForSlot = (dayIndex: number, periodIndex: number) => {
    return labSchedules.find(
      schedule => schedule.day_of_week === dayIndex + 1 && schedule.slot_number === periodIndex + 1
    );
  };

  const getLabNameForSchedule = (schedule: LabSchedule) => {
    const lab = labs.find(l => l.id === schedule.lab_id);
    return lab?.name || 'Unknown Lab';
  };

  const ready = selection.department;

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
        <section className="container py-8">
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold" style={{fontFamily: 'Poppins'}}>Lab Schedule</h1>
                <p className="text-muted-foreground">
                  {selection.department ? `Department: ${selection.department}` : 'All Labs (Department filtering coming soon)'}
                  {selection.year ? ` • Year: ${selection.year}` : ''}
                  {selection.section ? ` • Section: ${selection.section}` : ''}
                </p>
              </div>

              {/* Department Selection */}
              <div className="flex items-center gap-4">
                <Button onClick={() => setLabDialog(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Add Lab
                </Button>
                <div className="w-48">
                  <Select onValueChange={(v) => setSelection({ department: v })} value={selection.department}>
                    <SelectTrigger className="bg-card">
                      <SelectValue placeholder="Select Department" />
                    </SelectTrigger>
                    <SelectContent className="z-50 bg-popover">
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Dialog open={labDialog} onOpenChange={setLabDialog}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Add New Lab</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Lab Name *</Label>
                                <Input id="name" value={labForm.name} onChange={(e) => setLabForm({...labForm, name: e.target.value})} placeholder="e.g. Computer Lab 1" />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="code">Lab Code *</Label>
                                <Input id="code" value={labForm.lab_code} onChange={(e) => setLabForm({...labForm, lab_code: e.target.value})} placeholder="e.g. CL1" />
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="capacity">Capacity</Label>
                                <Input type="number" id="capacity" value={labForm.capacity} onChange={(e) => setLabForm({...labForm, capacity: +e.target.value})} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="type">Type</Label>
                                <Select value={labForm.lab_type} onValueChange={(v) => setLabForm({...labForm, lab_type: v})}>
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
                                <Input id="room" value={labForm.room_number} onChange={(e) => setLabForm({...labForm, room_number: e.target.value})} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                             <div className="grid gap-2">
                                <Label htmlFor="building">Building</Label>
                                <Input id="building" value={labForm.building} onChange={(e) => setLabForm({...labForm, building: e.target.value})} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="floor">Floor</Label>
                                <Input id="floor" value={labForm.floor} onChange={(e) => setLabForm({...labForm, floor: e.target.value})} />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="desc">Description</Label>
                            <Input id="desc" value={labForm.description} onChange={(e) => setLabForm({...labForm, description: e.target.value})} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setLabDialog(false)}>Cancel</Button>
                        <Button onClick={handleCreateLab}>Create Lab</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {!ready ? (
              <Card className="rounded-2xl">
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">Please select a department to view lab schedules.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Lab Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="rounded-2xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Total Labs</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{labs.length}</div>
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Active Schedules</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{labSchedules.length}</div>
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Available Slots</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {labSchedules.filter(s => s.is_available).length}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* 7x7 Grid */}
                <Card className="rounded-2xl">
                  <CardHeader>
                    <CardTitle>Weekly Lab Schedule</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            <th className="border p-2 text-center font-medium bg-muted/50">Day/Period</th>
                            {PERIODS.map((period, index) => (
                              <th key={index} className="border p-2 text-center font-medium bg-muted/50 min-w-[120px]">
                                {period}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {DAYS.map((day, dayIndex) => (
                            <tr key={dayIndex}>
                              <td className="border p-2 text-center font-medium bg-muted/30 min-w-[100px]">
                                {day}
                              </td>
                              {PERIODS.map((_, periodIndex) => {
                                const schedule = getLabScheduleForSlot(dayIndex, periodIndex);
                                return (
                                  <td key={periodIndex} className="border p-2 text-center min-h-[60px]">
                                    {schedule ? (
                                      <div className="space-y-1">
                                        <div className="font-medium text-sm">
                                          {getLabNameForSchedule(schedule)}
                                        </div>
                                        <Badge
                                          variant={schedule.is_available ? "default" : "secondary"}
                                          className="text-xs"
                                        >
                                          {schedule.is_available ? "Available" : "Booked"}
                                        </Badge>
                                        <div className="text-xs text-muted-foreground">
                                          {schedule.start_time} - {schedule.end_time}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          Cap: {schedule.max_capacity}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="text-muted-foreground text-sm">
                                        Free
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
                {/* Lab List */}
                {labs.length > 0 && (
                  <Card className="rounded-2xl">
                    <CardHeader>
                      <CardTitle>Available Labs</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {labs.map((lab) => (
                          <Card key={lab.id} className="rounded-lg">
                            <CardHeader className="pb-2">
                              <div className="flex justify-between items-start">
                                <div>
                                    <CardTitle className="text-sm">{lab.name}</CardTitle>
                                    <Badge variant="outline" className="w-fit mt-1">
                                        Lab {lab.lab_code}
                                    </Badge>
                                </div>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteLab(lab.id)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </CardHeader>
                            <CardContent className="pt-0">
                              <div className="space-y-2 text-sm">
                                <div className="text-muted-foreground">
                                  Room: {lab.building}-{lab.floor}-{lab.room_number}
                                </div>
                                <div className="text-muted-foreground">
                                  Capacity: {lab.capacity}
                                </div>
                                <div className="text-muted-foreground">
                                  Max Slots: {lab.max_slots}
                                </div>
                                <div className="text-muted-foreground">
                                  Status: {lab.is_active ? 'Active' : 'Inactive'}
                                </div>
                                <div className="text-muted-foreground">
                                  <span className="font-medium">Departments:</span>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {lab.departments && lab.departments.length > 0 ? (
                                      lab.departments.map((deptId) => {
                                        const dept = departments.find(d => d.id === deptId);
                                        return (
                                          <Badge key={deptId} variant="outline" className="text-xs">
                                            {dept?.name || 'Unknown'}
                                          </Badge>
                                        );
                                      })
                                    ) : (
                                      <span className="text-xs">No departments (field may not exist in current schema)</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default Lab;
