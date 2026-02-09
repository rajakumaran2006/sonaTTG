import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/navbar/Navbar";
import AdminNavbar from "@/components/navbar/AdminNavbar";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TimetableViewer from "@/components/TimetableViewer";
import { useToast } from "@/hooks/use-toast";
import { Eye, Trash2, Calendar, GitPullRequest, Filter, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";

const CurrentTimetables = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [deptNames, setDeptNames] = useState<Record<string, string>>({});
  const [departments, setDepartments] = useState<any[]>([]);
  const isLoggedIn = useMemo(() => localStorage.getItem("superAdmin") === "true", []);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewing, setViewing] = useState<{ departmentId: string; year: string; section: string } | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [filteredRows, setFilteredRows] = useState<any[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    document.title = "Current Timetables - Super Admin";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Browse live timetables by department, year, and section.");
    const link: HTMLLinkElement = document.querySelector('link[rel="canonical"]') || document.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('href', window.location.origin + '/current-timetables');
    if (!link.parentNode) document.head.appendChild(link);
  }, []);

  useEffect(() => {
    (async () => {
      const [{ data: tts }, { data: depts }] = await Promise.all([
        (supabase as any).from('timetables').select('department_id,year,section,updated_at').order('updated_at', { ascending: false }),
        (supabase as any).from('departments').select('id,name').order('name'),
      ]);
      setRows(tts || []);
      setDepartments(depts || []);
      const dmap: Record<string, string> = {};
      (depts || []).forEach((d: any) => dmap[d.id] = d.name);
      setDeptNames(dmap);
    })();
  }, []);

  // Filter rows based on selected department
  useEffect(() => {
    if (selectedDepartment === "all") {
      setFilteredRows(rows);
    } else {
      setFilteredRows(rows.filter(row => row.department_id === selectedDepartment));
    }
  }, [rows, selectedDepartment]);

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const totalTimetables = filteredRows.length;
    const departmentCount = new Set(filteredRows.map(r => r.department_id)).size;
    const yearCount = new Set(filteredRows.map(r => r.year)).size;
    const sectionCount = new Set(filteredRows.map(r => `${r.department_id}-${r.year}-${r.section}`)).size;
    
    return {
      totalTimetables,
      departmentCount,
      yearCount,
      sectionCount
    };
  }, [filteredRows]);

  return (
    <main className="min-h-screen bg-background">
      {isLoggedIn ? <Navbar /> : <AdminNavbar />}
      <section className="container py-10 md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80 md:pt-16">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between mb-6">
          </div>

          {/* Department Summary Card */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-xl flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Department Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">{summaryStats.totalTimetables}</div>
                  <div className="text-sm text-muted-foreground">Total Timetables</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">{summaryStats.departmentCount}</div>
                  <div className="text-sm text-muted-foreground">Departments</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600">{summaryStats.yearCount}</div>
                  <div className="text-sm text-muted-foreground">Years</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600">{summaryStats.sectionCount}</div>
                  <div className="text-sm text-muted-foreground">Sections</div>
                </div>
              </div>
              
              {/* Filter Section */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <span className="text-sm font-medium">Filter by Department:</span>
                </div>
                <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                  <SelectTrigger className="w-[200px] border-2 border-black">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent className="border-2 border-black">
                    <SelectItem value="all" className="border-b border-gray-200">All Departments</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem 
                        key={dept.id} 
                        value={dept.id}
                        className="border-b border-gray-200 last:border-b-0"
                      >
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </header>

        <div className="grid gap-4">
          {filteredRows.map((r, idx) => (
            <Card key={`${r.department_id}-${r.year}-${r.section}-${idx}`} className="rounded-xl hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>
                    {deptNames[r.department_id] || r.department_id} • Year {r.year} • Section {r.section}
                  </span>
                  <div className="text-sm font-normal text-muted-foreground">
                    Updated {new Date(r.updated_at).toLocaleDateString()}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    <span>Last modified: {new Date(r.updated_at).toLocaleString()}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => { 
                        setViewing({ 
                          departmentId: r.department_id, 
                          year: r.year, 
                          section: r.section 
                        }); 
                        setViewOpen(true); 
                      }}
                      className="flex items-center gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      View
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="destructive" className="flex items-center gap-2">
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete timetable?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently remove the timetable for{" "}
                            <strong>
                              {deptNames[r.department_id]} Year {r.year} Section {r.section}
                            </strong>. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={async () => {
                              try {
                                const { error } = await (supabase as any)
                                  .from('timetables')
                                  .delete()
                                  .eq('department_id', r.department_id)
                                  .eq('year', r.year)
                                  .eq('section', r.section);

                                if (error) throw error;

                                setRows((rows) => rows.filter((x) => !(
                                  x.department_id === r.department_id && 
                                  x.year === r.year && 
                                  x.section === r.section
                                )));

                                toast({
                                  title: "Timetable deleted",
                                  description: `Removed timetable for ${deptNames[r.department_id]} Year ${r.year} Section ${r.section}`,
                                });
                              } catch (error) {
                                toast({
                                  title: "Failed to delete timetable",
                                  description: "Please try again.",
                                  variant: "destructive"
                                });
                              }
                            }}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredRows.length === 0 && (
            <div className="text-center py-12">
              <div className="text-muted-foreground">
                <Eye className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">
                  {selectedDepartment === "all" ? "No timetables found" : "No timetables found for selected department"}
                </p>
                <p className="text-sm">
                  {selectedDepartment === "all" 
                    ? "Create some timetables to see them here." 
                    : "Try selecting a different department or create timetables for this department."}
                </p>
              </div>
            </div>
          )}
        </div>
        {/* Timetable Viewer Dialog */}
        <Dialog open={viewOpen} onOpenChange={setViewOpen}>
          <DialogContent className="max-w-[95vw] w-full max-h-[95vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Timetable Viewer</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto max-h-[calc(95vh-100px)]">
              {viewing && (
                <TimetableViewer 
                  departmentId={viewing.departmentId}
                  year={viewing.year}
                  section={viewing.section}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      </section>
    </main>
  );
};

export default CurrentTimetables;
