import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Navbar from "@/components/navbar/facultyadmin";  
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  FacultyMember, 
  getFacultyByEmail, 
  updateFacultyMember,
} from "@/lib/supabaseService";
import { 
  Edit, 
  Calendar, 
  Clock, 
  MapPin, 
  Mail, 
  User, 
  RefreshCw, 
  BookOpen, 
  Shield, 
  CheckCircle, 
  X, 
  GraduationCap, 
  BarChart3, 
  Building2 
} from "lucide-react";

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PERIODS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];
const TIME_SLOTS = [
  '9:00-9:55', '9:55-10:50', '11:05-12:00', '12:00-12:55', 
  '1:55-2:50', '2:50-3:45', '3:55-4:50'
];

// Types for faculty schedule
interface FacultyScheduleItem {
  subject: string;
  day: number;
  period: number;
  year: string;
  section: string;
  department_name?: string;
  is_special?: boolean;
}

interface SubjectAssignment {
  subject: string;
  schedule: Array<{
    day: string;
    period: string;
    year: string;
    section: string;
    department_name?: string;
  }>;
}

const FacultyDashboard = () => {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [faculty, setFaculty] = useState<FacultyMember | null>(null);
  const [schedule, setSchedule] = useState<FacultyScheduleItem[]>([]);
  const [subjectAssignments, setSubjectAssignments] = useState<SubjectAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState({ name: "", email: "", designation: "" });

  useEffect(() => {
    document.title = "Faculty Dashboard";
  }, []);

  // Algorithm to extract faculty schedule from approved timetables
  const extractFacultyScheduleFromTimetables = async (facultyName: string) => {
    try {
      // Get all approved timetables
      const { data: timetables, error: ttError } = await (supabase as any)
        .from('timetables')
        .select(`
          department_id,
          year,
          section,
          grid_data,
          departments!inner(name)
        `)
        .order('updated_at', { ascending: false });

      if (ttError) throw ttError;
      if (!timetables) return { schedule: [], assignments: [] };

      const facultySchedule: FacultyScheduleItem[] = [];
      const subjectMap: Record<string, SubjectAssignment> = {};

      // Get all faculty subject assignments to match faculty to subjects
      const { data: facultyAssignments } = await (supabase as any)
        .from('faculty_subject_assignments')
        .select(`
          faculty_members!inner(name),
          subjects!inner(name, abbreviation, code),
          department_id,
          year,
          section
        `)
        .eq('faculty_members.name', facultyName);

      // Get general faculty assignments (not class-specific)
      const { data: generalAssignments } = await (supabase as any)
        .from('faculty_subject_assignments')
        .select(`
          faculty_members!inner(name),
          subjects!inner(name, abbreviation, code),
          department_id,
          year,
          section
        `)
        .eq('faculty_members.name', facultyName);

      // Get subjects where faculty is directly mentioned in staff field
      const { data: staffAssignments } = await (supabase as any)
        .from('subjects')
        .select('name, abbreviation, code, department_id, year, staff')
        .eq('staff', facultyName);

      // Create a mapping of subjects to faculty
      const facultySubjects = new Set<string>();
      
      // Add from faculty_subject_assignments
      if (facultyAssignments) {
        facultyAssignments.forEach((assignment: any) => {
          const subject = assignment.subjects;
          if (subject) {
            facultySubjects.add(subject.name);
            if (subject.abbreviation) facultySubjects.add(subject.abbreviation);
            if (subject.code) facultySubjects.add(subject.code);
          }
        });
      }

      // Add from faculty_subject_assignments
      if (generalAssignments) {
        generalAssignments.forEach((assignment: any) => {
          const subject = assignment.subjects;
          if (subject) {
            facultySubjects.add(subject.name);
            if (subject.abbreviation) facultySubjects.add(subject.abbreviation);
            if (subject.code) facultySubjects.add(subject.code);
          }
        });
      }

      // Add from staff field
      if (staffAssignments) {
        staffAssignments.forEach((subject: any) => {
          facultySubjects.add(subject.name);
          if (subject.abbreviation) facultySubjects.add(subject.abbreviation);
          if (subject.code) facultySubjects.add(subject.code);
        });
      }

      // Process each timetable
      for (const timetable of timetables) {
        const { grid_data, department_id, year, section, departments } = timetable;
        
        if (!grid_data || !Array.isArray(grid_data)) continue;

        // Scan through the timetable grid
        grid_data.forEach((dayRow: any[], dayIndex: number) => {
          if (!Array.isArray(dayRow)) return;
          
          dayRow.forEach((cell: any, periodIndex: number) => {
            if (!cell || typeof cell !== 'string') return;
            
            const subjectName = cell.trim();
            
            // Check if this subject belongs to the faculty
            if (facultySubjects.has(subjectName)) {
              const scheduleItem: FacultyScheduleItem = {
                subject: subjectName,
                day: dayIndex,
                period: periodIndex,
                year,
                section,
                department_name: departments?.name,
                is_special: ['Seminar', 'Library', 'Student Counselling'].includes(subjectName)
              };

              facultySchedule.push(scheduleItem);

              // Group by subject for assignments view
              if (!subjectMap[subjectName]) {
                subjectMap[subjectName] = {
                  subject: subjectName,
                  schedule: []
                };
              }

              subjectMap[subjectName].schedule.push({
                day: DAYS[dayIndex],
                period: PERIODS[periodIndex],
                year,
                section,
                department_name: departments?.name
              });
            }
          });
        });
      }

      return {
        schedule: facultySchedule,
        assignments: Object.values(subjectMap)
      };
    } catch (error) {
      console.error('Error extracting faculty schedule:', error);
      throw error;
    }
  };

  const login = async () => {
    setLoading(true);
    try {
      const facultyMember = await getFacultyByEmail(email.trim());
      if (!facultyMember) {
        toast({ 
          title: "Not found", 
          description: "Faculty email not recognized.",
          variant: "destructive"
        });
        return;
      }

      setFaculty(facultyMember);
      setEditData({
        name: facultyMember.name,
        email: facultyMember.email || "",
        designation: facultyMember.designation || ""
      });

      // Extract faculty schedule from approved timetables
      const { schedule: facultySchedule, assignments } = await extractFacultyScheduleFromTimetables(facultyMember.name);
      setSchedule(facultySchedule);
      setSubjectAssignments(assignments);

      toast({ 
        title: "Welcome!", 
        description: `Logged in as ${facultyMember.name}`,
        variant: "default"
      });
    } catch (error: any) {
      toast({ 
        title: "Login failed", 
        description: error?.message || "Please try again",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!faculty) return;
    
    try {
      await updateFacultyMember(faculty.id, {
        name: editData.name,
        email: editData.email,
        designation: editData.designation
      });

      setFaculty({ ...faculty, ...editData });
      setEditOpen(false);
      toast({ 
        title: "Profile updated", 
        description: "Your information has been saved successfully."
      });
    } catch (error: any) {
      toast({ 
        title: "Update failed", 
        description: error?.message || "Please try again",
        variant: "destructive"
      });
    }
  };

  const handleSyncSchedule = async () => {
    setSyncing(true);
    try {
      if (!faculty) return;
      
      // Re-extract faculty schedule from approved timetables
      const { schedule: freshSchedule, assignments } = await extractFacultyScheduleFromTimetables(faculty.name);
      setSchedule(freshSchedule);
      setSubjectAssignments(assignments);
      
      toast({ 
        title: "Schedule synced!", 
        description: "Your schedule has been updated from approved timetables.",
        variant: "default"
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

  // Create timetable grid from schedule data
  const createTimetableGrid = () => {
    const grid: { [day: number]: { [period: number]: FacultyScheduleItem } } = {};
    
    schedule.forEach(item => {
      if (!grid[item.day]) grid[item.day] = {};
      grid[item.day][item.period] = item;
    });
    
    return grid;
  };

  const timetableGrid = createTimetableGrid();

  // Get unique subjects taught
  const uniqueSubjects = Array.from(
    new Set(schedule.filter(item => item.subject).map(item => item.subject!))
  ).sort();

  // Get unique classes taught with department info
  const uniqueClasses = Array.from(
    new Set(schedule.map(item => `${item.department_name || 'Unknown'} - Year ${item.year} - Section ${item.section}`))
  ).sort();

  // Get unique departments taught
  const uniqueDepartments = Array.from(
    new Set(schedule.map(item => item.department_name || 'Unknown'))
  ).filter(dept => dept !== 'Unknown').sort();

  // Get unique years taught
  const uniqueYears = Array.from(
    new Set(schedule.map(item => item.year))
  ).sort();

  // Get unique sections taught
  const uniqueSections = Array.from(
    new Set(schedule.map(item => item.section))
  ).sort();

  // Get total teaching hours per week
  const totalHours = schedule.filter(item => !item.is_special).length;
  const totalSpecialHours = schedule.filter(item => item.is_special).length;

  if (!faculty) {
    return (
      <main className="min-h-screen bg-background">
        <Navbar/>
        <section className="container py-16">
          <div className="mx-auto max-w-md">
            <header className="mb-8 text-center">
              <h1 className="text-3xl font-bold">Faculty Login</h1>
              <p className="text-muted-foreground">Sign in to view your personal timetable</p>
            </header>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Login
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="email">Faculty Email</Label>
                  <Input 
                    id="email"
                    type="email" 
                    placeholder="your.email@college.edu" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && login()}
                  />
                </div>
                <Button 
                  onClick={login} 
                  disabled={!email.trim() || loading}
                  className="w-full"
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <Navbar/>
      <section className="container py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">Faculty Dashboard</h1>
          <p className="text-muted-foreground">Your personal timetable and information</p>
        </header>

        {/* Faculty Information - Rectangular Card at Top */}
        <div className="mb-8">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Faculty Information
                  </CardTitle>
                  <Dialog open={editOpen} onOpenChange={setEditOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit Profile</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="edit-name">Name</Label>
                          <Input 
                            id="edit-name"
                            value={editData.name}
                            onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit-email">Email</Label>
                          <Input 
                            id="edit-email"
                            type="email"
                            value={editData.email}
                            onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit-designation">Designation</Label>
                          <Input 
                            id="edit-designation"
                            value={editData.designation}
                            onChange={(e) => setEditData({ ...editData, designation: e.target.value })}
                          />
                        </div>
                        <Button onClick={handleUpdateProfile} className="w-full">
                          Save Changes
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
                  {/* Basic Information */}
                  <div className="space-y-4 border-2 border-gray-300 rounded-lg p-2">
                    <h4 className="font-semibold text-primary border-b pb-2 flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Basic Information
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</label>
                        <p className="font-medium text-sm mt-1">{faculty.name}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</label>
                        <p className="font-medium text-sm mt-1 break-all">{faculty.email || 'Not provided'}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Designation</label>
                        <p className="font-medium text-sm mt-1">{faculty.designation || 'Not specified'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Subjects Taught */}
                  <div className="space-y-4 border-2 border-gray-300 rounded-lg p-2">
                    <h4 className="font-semibold text-primary border-b pb-2 flex items-center gap-2">
                      <BookOpen className="h-4 w-4" />
                      Subjects Taught
                    </h4>
                    <div className="space-y-3">
                      {uniqueSubjects.length > 0 ? (
                        <>
                          <div className="flex flex-wrap gap-1">
                            {uniqueSubjects.slice(0, 4).map(subject => (
                              <Badge key={subject} variant="secondary" className="text-xs">
                                {subject}
                              </Badge>
                            ))}
                            {uniqueSubjects.length > 4 && (
                              <Badge variant="outline" className="text-xs">
                                +{uniqueSubjects.length - 4} more
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <strong>Total:</strong> {uniqueSubjects.length} subjects
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">No subjects assigned</p>
                      )}
                    </div>
                  </div>

                  {/* Special Roles */}
                  <div className="space-y-4 border-2 border-gray-300 rounded-lg p-2">
                    <h4 className="font-semibold text-primary border-b pb-2 flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Special Roles
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Class Counselor</label>
                        <div className="mt-1">
                          {schedule.some(item => item.is_special && ['Student Counselling', 'Counselling'].includes(item.subject || '')) ? (
                            <Badge variant="default" className="text-xs bg-green-100 text-green-800 border-green-300">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Yes
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              <X className="h-3 w-3 mr-1" />
                              No
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Electives</label>
                        <div className="mt-1">
                          {schedule.some(item => item.subject && item.subject.toLowerCase().includes('elective')) ? (
                            <Badge variant="default" className="text-xs bg-purple-100 text-purple-800 border-purple-300">
                              <GraduationCap className="h-3 w-3 mr-1" />
                              Teaching
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              <X className="h-3 w-3 mr-1" />
                              None
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Teaching Statistics */}
                  <div className="space-y-4 lg:col-span-2 border-2 border-gray-300 rounded-lg p-2">
                    <h4 className="font-semibold text-primary border-b pb-2 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Statistics
                    </h4>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="text-center bg-blue-50 rounded-lg p-2 border border-blue-200">
                          <div className="text-lg font-bold text-blue-600">{totalHours}</div>
                          <div className="text-xs text-blue-600">Regular</div>
                        </div>
                        <div className="text-center bg-yellow-50 rounded-lg p-2 border border-yellow-200">
                          <div className="text-lg font-bold text-yellow-600">{totalSpecialHours}</div>
                          <div className="text-xs text-yellow-600">Special</div>
                        </div>
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Departments:</span>
                          <span className="font-medium">{uniqueDepartments.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Years:</span>
                          <span className="font-medium">{uniqueYears.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Sections:</span>
                          <span className="font-medium">{uniqueSections.length}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Classes Overview */}
                  <div className="space-y-4 border-2 border-gray-300 rounded-lg p-2">
                    <h4 className="font-semibold text-primary border-b pb-2 flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Classes Overview
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Departments</label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {uniqueDepartments.map(dept => (
                            <Badge key={dept} variant="secondary" className="text-xs">
                              {dept}
                            </Badge>
                          ))}
                          {uniqueDepartments.length === 0 && (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Years & Sections</label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {uniqueClasses.slice(0, 3).map(classInfo => {
                            const parts = classInfo.split(' - ');
                            return (
                              <Badge key={classInfo} variant="outline" className="text-xs">
                                {parts[1]} {parts[2]}
                              </Badge>
                            );
                          })}
                          {uniqueClasses.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{uniqueClasses.length - 3} more
                            </Badge>
                          )}
                          {uniqueClasses.length === 0 && (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
        </div>

        {/* Personal Timetable - Full Width Below */}
        <div>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Your Personal Timetable
                  </CardTitle>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleSyncSchedule}
                    disabled={syncing}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Syncing...' : 'Sync Schedule'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300 rounded-lg overflow-hidden shadow-sm">
                    <thead>
                      <tr className="bg-gradient-to-r from-primary/20 to-primary/10">
                        <th className="border border-gray-300 p-4 text-sm font-semibold bg-primary/30 text-center">
                          <Clock className="h-4 w-4 mx-auto mb-1" />
                          Day / Period
                        </th>
                        {PERIODS.map((period, idx) => (
                          <th key={period} className="border border-gray-300 p-3 text-center font-semibold min-w-[120px]">
                            <div className="font-bold text-primary">{period}</div>
                            <div className="text-xs text-muted-foreground font-normal mt-1">
                              {TIME_SLOTS[idx]}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS.map((day, dayIdx) => (
                        <tr key={day} className="hover:bg-muted/20 transition-colors">
                          <td className="border border-gray-300 p-4 font-semibold bg-primary/10 text-center">
                            <div className="text-sm">{day}</div>
                          </td>
                          {PERIODS.map((_, periodIdx) => {
                            const scheduleItem = timetableGrid[dayIdx]?.[periodIdx];
                            return (
                              <td key={periodIdx} className="border border-gray-300 p-2">
                                <div 
                                  className={`h-20 rounded-lg flex flex-col items-center justify-center text-center text-xs p-2 transition-all hover:shadow-md ${
                                    scheduleItem 
                                      ? scheduleItem.is_special 
                                        ? 'bg-gradient-to-br from-yellow-100 to-yellow-50 border-2 border-yellow-300 text-yellow-800 shadow-sm' 
                                        : 'bg-gradient-to-br from-blue-100 to-blue-50 border-2 border-blue-300 text-blue-800 shadow-sm'
                                      : 'bg-gradient-to-br from-gray-50 to-gray-25 text-gray-500 border-2 border-gray-200'
                                  }`}
                                >
                                  {scheduleItem ? (
                                    <>
                                      <div className="font-bold text-sm mb-1">{scheduleItem.subject}</div>
                                      <div className="text-[10px] opacity-90 font-medium leading-tight">
                                        {scheduleItem.department_name || 'Unknown'}
                                        <br />
                                        Year {scheduleItem.year} - Sec {scheduleItem.section}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-muted-foreground font-medium">
                                      <div className="text-lg mb-1">—</div>
                                      <div className="text-xs">Free</div>
                                    </div>
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
                
                {/* Timetable Legend */}
                <div className="mt-4 flex flex-wrap gap-4 justify-center text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-gradient-to-br from-blue-100 to-blue-50 border-2 border-blue-300 rounded"></div>
                    <span>Regular Classes</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-gradient-to-br from-yellow-100 to-yellow-50 border-2 border-yellow-300 rounded"></div>
                    <span>Special Activities</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-gradient-to-br from-gray-50 to-gray-25 border-2 border-gray-200 rounded"></div>
                    <span>Free Periods</span>
                  </div>
                </div>

              </CardContent>
            </Card>
          </div>
        

        {/* Subject & Faculty Assignments */}
        {subjectAssignments.length > 0 && (
          <div className="mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Subject & Faculty Assignments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {subjectAssignments.map((assignment, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <h3 className="text-lg font-semibold text-blue-900 mb-2">{assignment.subject}</h3>
                      <div className="flex items-center gap-2 text-muted-foreground mb-3">
                        <User className="h-4 w-4" />
                        <span className="font-medium">{faculty.name}</span>
                      </div>
                      
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground mb-2">Schedule:</h4>
                        <div className="space-y-2">
                          {/* Group schedule by class */}
                          {Array.from(new Set(assignment.schedule.map(item => `${item.department_name || 'Unknown'}-${item.year}-${item.section}`))).map(classKey => {
                            const classSchedule = assignment.schedule.filter(item => `${item.department_name || 'Unknown'}-${item.year}-${item.section}` === classKey);
                            return (
                              <div key={classKey} className="bg-muted/10 rounded-md p-2">
                                <div className="text-xs font-medium text-muted-foreground mb-1">
                                  {classSchedule[0].department_name || 'Unknown'} - Year {classSchedule[0].year} - Section {classSchedule[0].section}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {classSchedule.map((scheduleItem, scheduleIndex) => (
                                    <Badge 
                                      key={scheduleIndex}
                                      variant="outline" 
                                      className="text-xs bg-blue-50 border-blue-200 text-blue-800"
                                    >
                                      {scheduleItem.day} - {scheduleItem.period}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </section>
    </main>
  );
};

export default FacultyDashboard;
