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
import { Calendar, Settings, Eye } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Form states for dialogs
  const [scheduleViewDialog, setScheduleViewDialog] = useState(false);
  const [selectedLabForSchedule, setSelectedLabForSchedule] = useState<Lab | null>(null);

  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];



  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      loadDepartments();
      loadLabs();
      loadLabSchedules();
    }
  }, [isLoggedIn, selectedDepartment]);

  const checkAuth = () => {
    const loggedIn = localStorage.getItem("superAdmin") === "true";
    setIsLoggedIn(loggedIn);
    if (!loggedIn) {
      navigate("/super-admin-login", { replace: true });
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


  const openScheduleViewDialog = (lab: Lab) => {
    setSelectedLabForSchedule(lab);
    setScheduleViewDialog(true);
  };

  const getScheduleForDay = (dayOfWeek: number) => {
    return labSchedules.filter(schedule =>
      schedule.lab_id === selectedLabForSchedule?.id && schedule.day_of_week === dayOfWeek
    ).sort((a, b) => a.slot_number - b.slot_number);
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

  const getScheduleForPeriod = (dayOfWeek: number, periodStartTime: string) => {
    return labSchedules.find(schedule =>
      schedule.day_of_week === dayOfWeek &&
      schedule.start_time === periodStartTime
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
      <section className="container py-10 md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80 md:pt-16">
        <header className="mb-8">
          <div className="flex items-center justify-between mb-6">
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
              <Button onClick={() => navigate('/super-admin')}>
                Back to Dashboard
              </Button>
            </div>
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
                         View Schedule
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
                          const scheduleForPeriod = getScheduleForPeriod(day.value, period.startTime);

                          return (
                            <TableCell key={period.id} className="text-center p-3 border-r">
                              {scheduleForPeriod ? (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-center">
                                    <Badge
                                      variant={scheduleForPeriod.is_available ? "default" : "secondary"}
                                      className="text-xs"
                                    >
                                      {scheduleForPeriod.is_available ? "Available" : "Booked"}
                                    </Badge>
                                  </div>
                                  {scheduleForPeriod.max_capacity && (
                                    <p className="text-xs text-muted-foreground">
                                      {scheduleForPeriod.max_capacity} students
                                    </p>
                                  )}
                                  {scheduleForPeriod.semester && (
                                    <p className="text-xs font-medium text-blue-600">
                                      {scheduleForPeriod.semester}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center justify-center h-12">
                                  <span className="text-muted-foreground text-sm font-medium">Free</span>
                                </div>
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
                  <span className="text-muted-foreground">Free</span>
                  <span>Free Periods</span>
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
