import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Calendar, Users, BookOpen, User } from "lucide-react";

const colHeaders = ['P1', 'P2', 'BR', 'P3', 'P4', 'LU', 'P5', 'BR', 'P6', 'P7'];
const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface TimetableViewerProps {
  departmentId: string;
  year: string;
  section: string;
}

interface TimetableData {
  grid_data: any[][];
  updated_at: string;
  department_name?: string;
}

interface FacultyAssignment {
  subject_name: string;
  faculty_name: string;
  total_hours: number;
  periods: Array<{
    day: string;
    period: string;
    day_index: number;
    period_index: number;
  }>;
}

const TimetableViewer = ({ departmentId, year, section }: TimetableViewerProps) => {
  const [timetableData, setTimetableData] = useState<TimetableData | null>(null);
  const [facultyAssignments, setFacultyAssignments] = useState<FacultyAssignment[]>([]);
  const [subjectTypes, setSubjectTypes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTimetableAndFaculty = async () => {
      setLoading(true);
      try {
        // Fetch timetable data with department name
        const { data, error } = await (supabase as any)
          .from('timetables')
          .select(`
            grid_data,
            updated_at,
            departments!inner(name)
          `)
          .eq('department_id', departmentId)
          .eq('year', year)
          .eq('section', section)
          .maybeSingle();

        if (error) throw error;

        // Fetch subject types for this department and year
        const { data: subjects } = await (supabase as any)
          .from('subjects')
          .select('name, type')
          .eq('department_id', departmentId)
          .eq('year', year);

        // Create subject name to type mapping
        const typeMap: Record<string, string> = {};
        (subjects || []).forEach((subject: any) => {
          typeMap[subject.name] = subject.type;
        });
        setSubjectTypes(typeMap);

        if (data) {
          setTimetableData({
            grid_data: data.grid_data || [],
            updated_at: data.updated_at,
            department_name: data.departments?.name
          });

          // Process faculty assignments from grid data
          const assignments = await processFacultyAssignments(data.grid_data || [], departmentId, year, section);
          setFacultyAssignments(assignments);
        }
      } catch (error) {
        console.error('Error fetching timetable:', error);
      } finally {
        setLoading(false);
      }
    };

    if (departmentId && year && section) {
      fetchTimetableAndFaculty();
    }
  }, [departmentId, year, section]);

  const processFacultyAssignments = async (gridData: any[][], deptId: string, yr: string, sec: string): Promise<FacultyAssignment[]> => {
    const subjectHours: Record<string, Array<{day: number, period: number}>> = {};
    const assignments: FacultyAssignment[] = [];

    // Extract subjects and their periods from grid
    gridData.forEach((dayRow, dayIndex) => {
      if (Array.isArray(dayRow)) {
        dayRow.forEach((cell, periodIndex) => {
          if (cell && typeof cell === 'string' && cell.trim() && 
              !['BREAK', 'LUNCH'].includes(cell.trim())) {
            const subject = cell.trim();
            if (!subjectHours[subject]) {
              subjectHours[subject] = [];
            }
            subjectHours[subject].push({ day: dayIndex, period: periodIndex });
          }
        });
      }
    });

    // Fetch faculty assignments for subjects
    try {
      for (const [subjectName, periods] of Object.entries(subjectHours)) {
        // Try to find faculty from faculty_subject_assignments first
        let { data: facultyData } = await (supabase as any)
          .from('faculty_subject_assignments')
          .select(`
            faculty_members!inner(name),
            subjects!inner(name, abbreviation, code)
          `)
          .eq('department_id', deptId)
          .eq('year', yr)
          .eq('section', sec);

        let facultyName = 'Unassigned';

        if (facultyData && facultyData.length > 0) {
          // Find matching subject
          const matchingFaculty = facultyData.find((item: any) => {
            const subject = item.subjects;
            return subject && (
              subject.name === subjectName || 
              subject.abbreviation === subjectName || 
              subject.code === subjectName
            );
          });

          if (matchingFaculty) {
            facultyName = matchingFaculty.faculty_members?.name || 'Unassigned';
          }
        }

        // If not found, try faculty_subject_assignments
        if (facultyName === 'Unassigned') {
          const { data: assignmentData } = await (supabase as any)
            .from('faculty_subject_assignments')
            .select(`
              faculty_members!inner(name),
              subjects!inner(name, abbreviation, code)
            `)
            .eq('department_id', deptId)
            .eq('year', yr);

          if (assignmentData && assignmentData.length > 0) {
            const matchingAssignment = assignmentData.find((item: any) => {
              const subject = item.subjects;
              return subject && (
                subject.name === subjectName || 
                subject.abbreviation === subjectName || 
                subject.code === subjectName
              );
            });

            if (matchingAssignment) {
              facultyName = matchingAssignment.faculty_members?.name || 'Unassigned';
            }
          }
        }

        // If still not found, try subjects.staff field
        if (facultyName === 'Unassigned') {
          const { data: subjectData } = await (supabase as any)
            .from('subjects')
            .select('staff')
            .eq('department_id', deptId)
            .eq('year', yr)
            .or(`name.eq.${subjectName},abbreviation.eq.${subjectName},code.eq.${subjectName}`)
            .maybeSingle();

          if (subjectData?.staff) {
            facultyName = subjectData.staff;
          }
        }

        assignments.push({
          subject_name: subjectName,
          faculty_name: facultyName,
          total_hours: periods.length,
          periods: periods.map(p => ({
            day: dayNames[p.day],
            period: `P${p.period + 1}`,
            day_index: p.day,
            period_index: p.period
          }))
        });
      }
    } catch (error) {
      console.error('Error fetching faculty assignments:', error);
    }

    return assignments.sort((a, b) => a.subject_name.localeCompare(b.subject_name));
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded mb-4"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!timetableData) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Calendar className="mx-auto h-12 w-12 mb-4" />
        <p>No timetable found for this class.</p>
      </div>
    );
  }

  const { grid_data, updated_at, department_name } = timetableData;

  // Function to format cell content based on subject type
  const formatCellContent = (cell: string | null): string => {
    if (!cell || !cell.trim()) return 'Free';
    if (cell === 'BREAK' || cell === 'LUNCH') return cell;
    
    const subjectName = cell.trim();
    const subjectType = subjectTypes[subjectName];
    
    if (subjectType === 'open elective' || subjectName === 'Open Elective') {
      return 'Open Elective';
    }
    
    return subjectName;
  };

  return (
    <div className="space-y-6">
      {/* Header Information */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Class Timetable</h2>
            <p className="text-muted-foreground">
              {department_name} • Year {year} • Section {section}
            </p>
          </div>
          <Badge variant="secondary" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Updated {new Date(updated_at).toLocaleDateString()}
          </Badge>
        </div>

        {/* Quick Stats */}
        <div className="flex gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>6 Days • 7 Periods</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>Class Schedule</span>
          </div>
        </div>
      </div>

      {/* Timetable Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Weekly Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-4 font-semibold min-w-[100px]">Day</th>
                  {colHeaders.map((header) => (
                    <th key={header} className="text-center p-4 font-semibold min-w-[90px]">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid_data.map((row, dayIndex) => (
                  <tr key={dayIndex} className="border-t hover:bg-muted/20">
                    <td className="p-4 font-medium bg-muted/30 border-r">
                      <div className="flex flex-col">
                        <span className="font-semibold">{dayNames[dayIndex]}</span>
                        <span className="text-xs text-muted-foreground">
                          {dayNames[dayIndex].slice(0, 3)}
                        </span>
                      </div>
                    </td>
                    {[
                      row[0], row[1], 'BREAK', 
                      row[2], row[3], 'LUNCH', 
                      row[4], 'BREAK', row[5], row[6]
                    ].map((cell, periodIndex) => {
                      const isBreak = cell === 'BREAK' || cell === 'LUNCH';
                      const hasSubject = cell && cell.trim() && !isBreak;
                      
                      return (
                        <td key={periodIndex} className="p-2">
                          <div className={`
                            h-14 rounded-lg px-3 flex items-center justify-center text-center font-medium transition-all
                            ${isBreak 
                              ? 'bg-orange-100 text-orange-800 border-2 border-orange-200' 
                              : hasSubject && (subjectTypes[cell?.trim() || ''] === 'open elective' || cell?.trim() === 'Open Elective')
                                ? 'bg-purple-50 text-purple-900 border-2 border-purple-200 hover:bg-purple-100' 
                              : hasSubject 
                                ? 'bg-blue-50 text-blue-900 border-2 border-blue-200 hover:bg-blue-100' 
                                : 'bg-gray-50 text-gray-500 border-2 border-gray-200'
                            }
                          `}>
                            <div className="flex flex-col items-center">
                              <span className="text-sm font-semibold">
                                {formatCellContent(cell)}
                              </span>
                              {hasSubject && (
                                <span className="text-xs text-muted-foreground mt-1">
                                  Subject
                                </span>
                              )}
                            </div>
                          </div>
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

      {/* Faculty Assignments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Subject & Faculty Assignments
          </CardTitle>
        </CardHeader>
        <CardContent>
          {facultyAssignments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <User className="mx-auto h-8 w-8 mb-2" />
              <p>No faculty assignments found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {facultyAssignments.map((assignment, index) => {
                const isOpenElective = subjectTypes[assignment.subject_name] === 'open elective';
                return (
                  <div key={index} className={`border rounded-lg p-4 hover:bg-muted/20 transition-colors ${
                    isOpenElective ? 'border-purple-200 bg-purple-50/50' : ''
                  }`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className={`font-semibold text-lg ${
                          isOpenElective ? 'text-purple-900' : 'text-blue-900'
                        }`}>
                          {isOpenElective ? 'Open Elective' : assignment.subject_name}
                        </h4>
                        {isOpenElective && (
                          <p className="text-sm text-purple-700 mt-1">
                            Student choice from available electives
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <User className="h-4 w-4" />
                          <span className="font-medium">{assignment.faculty_name}</span>
                        </div>
                      </div>
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {assignment.total_hours} {assignment.total_hours === 1 ? 'hour' : 'hours'}
                      </Badge>
                    </div>
                    
                    <div className="space-y-2">
                      <h5 className="text-sm font-medium text-muted-foreground">Schedule:</h5>
                      <div className="flex flex-wrap gap-2">
                        {assignment.periods.map((period, periodIndex) => (
                          <Badge 
                            key={periodIndex} 
                            variant="outline" 
                            className="text-xs bg-blue-50 border-blue-200 text-blue-800"
                          >
                            {period.day} - {period.period}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {/* Summary Stats */}
              <div className="mt-6 p-4 bg-muted/30 rounded-lg">
                <h4 className="font-semibold mb-2">Summary</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {facultyAssignments.length}
                    </div>
                    <div className="text-muted-foreground">Subjects</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {new Set(facultyAssignments.map(a => a.faculty_name)).size}
                    </div>
                    <div className="text-muted-foreground">Faculty</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {facultyAssignments.reduce((total, a) => total + a.total_hours, 0)}
                    </div>
                    <div className="text-muted-foreground">Total Hours</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {Math.round(facultyAssignments.reduce((total, a) => total + a.total_hours, 0) / facultyAssignments.length || 0)}
                    </div>
                    <div className="text-muted-foreground">Avg Hours</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-3">Legend</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-50 border-2 border-blue-200 rounded"></div>
              <span>Regular Subject</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-purple-50 border-2 border-purple-200 rounded"></div>
              <span>Open Elective</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-orange-100 border-2 border-orange-200 rounded"></div>
              <span>Break/Lunch</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-50 border-2 border-gray-200 rounded"></div>
              <span>Free Period</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TimetableViewer;