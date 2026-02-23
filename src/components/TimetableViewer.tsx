import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Calendar, Users, BookOpen, User, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";

const colHeaders = ['P1', 'P2', 'BR', 'P3', 'P4', 'LU', 'P5', 'P6', 'BR', 'P7'];
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
  const [viewMode, setViewMode] = useState<'table' | 'list'>('table');

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
    const subjectHours: Record<string, Array<{ day: number, period: number }>> = {};
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
      <Card className="border-olive-100 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 px-6 pt-6">
          <CardTitle className="text-lg font-bold text-olive-900">Weekly Schedule</CardTitle>
          <div className="flex bg-muted p-1 rounded-lg border border-border shadow-sm">
            <Button
              variant={viewMode === 'table' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('table')}
              className={`h-8 px-3 gap-2 ${viewMode === 'table' ? 'bg-background shadow-sm text-olive-900 font-bold' : 'text-muted-foreground font-medium'}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">Table</span>
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className={`h-8 px-3 gap-2 ${viewMode === 'list' ? 'bg-background shadow-sm text-olive-900 font-bold' : 'text-muted-foreground font-medium'}`}
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">List</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          {viewMode === 'table' ? (
            <div className="overflow-auto rounded-xl border border-olive-100 bg-white/50 backdrop-blur-sm">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-olive-50/50">
                    <th className="text-left p-4 font-bold text-olive-900 min-w-[120px]">Day</th>
                    {colHeaders.map((header) => (
                      <th key={header} className="text-center p-4 font-bold text-olive-900 min-w-[90px]">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid_data.map((row, dayIndex) => (
                    <tr key={dayIndex} className="border-t border-olive-100/30 hover:bg-olive-50/10 transition-colors">
                      <td className="p-4 font-bold text-olive-800 bg-olive-50/20 border-r border-olive-100/30">
                        <div className="flex flex-col">
                          <span className="font-bold">{dayNames[dayIndex]}</span>
                          <span className="text-[10px] text-olive-600 font-bold uppercase tracking-widest mt-0.5">
                            {dayNames[dayIndex].slice(0, 3)}
                          </span>
                        </div>
                      </td>
                      {[
                        row[0], row[1], 'BREAK',
                        row[2], row[3], 'LUNCH',
                        row[4], row[5], 'BREAK', row[6]
                      ].map((cell, periodIndex) => {
                        const isBreak = cell === 'BREAK' || cell === 'LUNCH';
                        const hasSubject = cell && cell.trim() && !isBreak;

                        return (
                          <td key={periodIndex} className="p-2">
                            <div className={`
                              h-14 min-w-[80px] rounded-xl px-2 flex items-center justify-center text-center font-semibold transition-all shadow-sm
                              ${isBreak
                                ? 'bg-orange-50 text-orange-700 border border-orange-200'
                                : hasSubject && (subjectTypes[cell?.trim() || ''] === 'open elective' || cell?.trim() === 'Open Elective')
                                  ? 'bg-purple-100 text-purple-900 border border-purple-200 hover:bg-purple-200'
                                  : hasSubject
                                    ? 'bg-blue-100 text-blue-900 border border-blue-200 hover:bg-blue-200'
                                    : 'bg-slate-50 text-slate-400 border border-dashed border-slate-200'
                              }
                            `}>
                              <div className="flex flex-col items-center">
                                <span className="text-sm font-bold truncate w-full px-1">
                                  {formatCellContent(cell)}
                                </span>
                                {hasSubject && (
                                  <span className="text-[9px] text-black/30 uppercase tracking-tighter mt-0.5 font-bold">
                                    Class
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
          ) : (
            <div className="grid gap-4">
              {grid_data.map((row, dayIndex) => (
                <Card key={dayIndex} className="overflow-hidden border-olive-100 shadow-sm bg-white/50 backdrop-blur-sm group hover:shadow-md transition-all">
                  <div className="bg-gradient-to-r from-olive-50 to-transparent py-3 px-6 border-b border-olive-100">
                    <h3 className="font-bold text-lg text-olive-900 tracking-tight">{dayNames[dayIndex]}</h3>
                  </div>
                  <div className="divide-y divide-olive-50">
                    {(() => {
                      const displayRow = [
                        row[0], row[1], 'BREAK',
                        row[2], row[3], 'LUNCH',
                        row[4], row[5], 'BREAK', row[6]
                      ];
                      const items = displayRow.map((cell, i) => {
                        if (!cell || cell === 'BREAK' || cell === 'LUNCH') return null;
                        const isOpenElective = (subjectTypes[cell?.trim() || ''] === 'open elective' || cell?.trim() === 'Open Elective');

                        return (
                          <div key={i} className="flex items-center justify-between py-4 px-6 bg-white/70 hover:bg-olive-50/30 transition-colors">
                            <div className="flex flex-col gap-1 flex-1 pr-4">
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-extrabold text-olive-700 bg-olive-100 px-2 py-0.5 rounded-full uppercase tracking-wider">{colHeaders[i]}</span>
                              </div>
                              <span className={`text-base font-bold tracking-tight ${isOpenElective ? 'text-purple-700' : 'text-slate-900'}`}>{formatCellContent(cell)}</span>
                            </div>
                          </div>
                        );
                      }).filter(Boolean);

                      return items.length > 0 ? items : (
                        <div className="py-8 text-center text-slate-400 italic bg-white/50 text-sm">
                          No classes scheduled for this day
                        </div>
                      );
                    })()}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Faculty Assignments */}
      <Card className="border-olive-100 shadow-sm">
        <CardHeader className="px-6 pt-6">
          <CardTitle className="text-lg font-bold text-olive-900 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-olive-600" />
            Subject & Faculty Assignments
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6">
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
                  <div key={index} className={`border rounded-xl p-4 hover:bg-muted/20 transition-all ${isOpenElective ? 'border-purple-200 bg-purple-50/50' : 'border-olive-100 bg-slate-50/30'
                    }`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className={`font-bold text-base ${isOpenElective ? 'text-purple-900' : 'text-olive-900'
                          }`}>
                          {isOpenElective ? 'Open Elective' : assignment.subject_name}
                        </h4>
                        {isOpenElective && (
                          <p className="text-xs text-purple-700 mt-0.5 font-medium">
                            Student choice from available electives
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-slate-500 mt-1">
                          <User className="h-3.5 w-3.5 text-olive-500" />
                          <span className="text-sm font-semibold">{assignment.faculty_name}</span>
                        </div>
                      </div>
                      <Badge variant="secondary" className="flex items-center gap-1 bg-olive-100 text-olive-700 border-none">
                        <Clock className="h-3 w-3" />
                        <span className="text-[10px] font-bold uppercase tracking-tight">{assignment.total_hours} {assignment.total_hours === 1 ? 'hr' : 'hrs'}</span>
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {assignment.periods.map((period, periodIndex) => (
                          <Badge
                            key={periodIndex}
                            variant="outline"
                            className="text-[9px] font-bold bg-white border-olive-100 text-olive-600 uppercase tracking-tighter"
                          >
                            {period.day.slice(0, 3)} • {period.period}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Summary Stats */}
              <div className="mt-6 p-4 bg-olive-50/30 rounded-xl border border-olive-100/50">
                <h4 className="text-xs font-bold uppercase tracking-widest text-olive-800 mb-3">Department Summary</h4>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white p-3 rounded-lg border border-olive-100 shadow-sm text-center">
                    <div className="text-xl font-bold text-blue-600 leading-none">
                      {facultyAssignments.length}
                    </div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 mt-1 tracking-widest">Subjects</div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-olive-100 shadow-sm text-center">
                    <div className="text-xl font-bold text-emerald-600 leading-none">
                      {new Set(facultyAssignments.map(a => a.faculty_name)).size}
                    </div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 mt-1 tracking-widest">Faculty</div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-olive-100 shadow-sm text-center">
                    <div className="text-xl font-bold text-purple-600 leading-none">
                      {facultyAssignments.reduce((total, a) => total + a.total_hours, 0)}
                    </div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 mt-1 tracking-widest">Total Hrs</div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-olive-100 shadow-sm text-center">
                    <div className="text-xl font-bold text-orange-600 leading-none">
                      {Math.round(facultyAssignments.reduce((total, a) => total + a.total_hours, 0) / facultyAssignments.length || 0)}
                    </div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 mt-1 tracking-widest">Avg Hrs</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <Card className="border-olive-100 shadow-sm bg-slate-50/50">
        <CardContent className="pt-6 px-6 pb-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Timetable Legend</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[11px] font-bold uppercase tracking-wider">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 bg-blue-100 border border-blue-200 rounded-md"></div>
              <span className="text-blue-900">Theory</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 bg-purple-100 border border-purple-200 rounded-md"></div>
              <span className="text-purple-900">Elective</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 bg-orange-50 border border-orange-200 rounded-md"></div>
              <span className="text-orange-900">Break</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 bg-slate-50 border border-dashed border-slate-200 rounded-md"></div>
              <span className="text-slate-400">Free</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TimetableViewer;