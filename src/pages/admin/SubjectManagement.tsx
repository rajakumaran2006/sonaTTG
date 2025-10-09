import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { SUBJECT_HOUR_LIMIT, Subject, subjectTotals, specialHours, useTimetableStore } from "@/store/timetableStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch as Toggle } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, UserCheck, Plus, BookOpen } from "lucide-react";
import { ensureDepartment, getSubjectsForYear, addSubject as addSubjectDb, addSubjectsBulk, getFacultyByDepartment, getFacultyBySection, assignFacultyToSubjectsYearWide, getSubjectFacultyMap, getDepartmentByName, setOpenElectiveHours, getOpenElectiveHours } from "@/lib/supabaseService";
import AdminNavbar from "@/components/navbar/AdminNavbar";
import { SpecialHoursManager } from "@/components/SpecialHoursManager";
//sample
const SubjectManagement = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const available = useTimetableStore((s) => s.availableSubjects);
  const selected = useTimetableStore((s) => s.selectedSubjects);
  const moveToSelected = useTimetableStore((s) => s.moveToSelected);
  const moveToAvailable = useTimetableStore((s) => s.moveToAvailable);
  const addAvailable = useTimetableStore((s) => s.addAvailable);
  const special = useTimetableStore((s) => s.special);
  const setSpecial = useTimetableStore((s) => s.setSpecial);
  const specialHoursConfigs = useTimetableStore((s) => s.specialHoursConfigs);
  const setSpecialHoursConfigs = useTimetableStore((s) => s.setSpecialHoursConfigs);

  const totals = useMemo(() => subjectTotals(selected), [selected]);
  const specialHrs = useMemo(() => specialHours(special), [special]);
  const configuredSpecialHrs = useMemo(() => 
    specialHoursConfigs.reduce((total, config) => total + config.total_hours, 0), 
    [specialHoursConfigs]
  );
  const [form, setForm] = useState<{ name: string; hours: number; type: "theory" | "lab" | "elective" | "open elective"; tags: string; code?: string; abbreviation?: string; staff?: string; credits?: number; }>({ name: "", hours: 1, type: "theory", tags: "", code: "", abbreviation: "", staff: "", credits: 3 });
  const labPreferences = useTimetableStore((s) => s.labPreferences);
  const setLabPreferences = useTimetableStore((s) => s.setLabPreferences);
  const selection = useTimetableStore((s) => s.selection);
  const seedYearDataset = useTimetableStore((s) => s.seedYearDataset);

  // Local UI state for Lab Settings dialog
  const [labSettingsOpen, setLabSettingsOpen] = useState(false);
  const [enableMorning, setEnableMorning] = useState(false);
  const [advancedMorning, setAdvancedMorning] = useState(false);
  const [morningSelectedLabs, setMorningSelectedLabs] = useState<Record<string, boolean>>({});
  const [morningStartByLab, setMorningStartByLab] = useState<Record<string, number>>({});
  const [enablePriorityAll, setEnablePriorityAll] = useState(false);
  const [priorityByLab, setPriorityByLab] = useState<Record<string, number>>({});
  const [eveningStartAt5ByLab, setEveningStartAt5ByLab] = useState<Record<string, boolean>>({});

  // Faculty management state
  type Faculty = { id: string; name: string; email?: string | null; designation?: string | null; departmentId: string; takesElectives?: boolean };
  const [availableFaculty, setAvailableFaculty] = useState<Faculty[]>([]);
  const [subjectFacultyMap, setSubjectFacultyMap] = useState<Record<string, string>>({});
  const [facultyAssignmentOpen, setFacultyAssignmentOpen] = useState(false);
  const [selectedSubjectForAssignment, setSelectedSubjectForAssignment] = useState<Subject | null>(null);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [departmentId, setDepartmentId] = useState<string>("");
  const isFourthYear = useMemo(() => selection.year === "IV" || selection.year === "4", [selection.year]);
  const currentOpenElectiveHours = useMemo(() => selected.filter(s => s.type === 'open elective').reduce((a, s) => a + (s.hoursPerWeek || 0), 0), [selected]);
  const [openElectiveHours, setOpenElectiveHoursState] = useState<number>(0);
  const [savingOpenElective, setSavingOpenElective] = useState(false);

  // Load subjects for current selection from Supabase
  useEffect(() => {
    if (!selection.department || !selection.year) return;
    (async () => {
      try {
        const dep = await ensureDepartment(selection.department!);
        let subs = await getSubjectsForYear(dep.id, selection.year!);

        const AI_DS_NAMES = new Set([
          "Artificial Intelligence and Data Science",
          "AI & DS",
          "Artificial Intelligence & Data Science",
        ]);
        const isAidsYear3 = AI_DS_NAMES.has(selection.department!) && (selection.year === "III" || selection.year === "3");

        if (subs.length === 0 && isAidsYear3) {
          const base: Omit<Subject, 'id'>[] = [
            { name: "CN", hoursPerWeek: 4, type: "theory" },
            { name: "ML", hoursPerWeek: 4, type: "theory" },
            { name: "SSA 3 (A)", hoursPerWeek: 2, type: "theory", tags: ["SSA"] },
            { name: "AIDS", hoursPerWeek: 4, type: "theory" },
            { name: "DBMS", hoursPerWeek: 4, type: "theory" },
            { name: "SSA 3 (SS)", hoursPerWeek: 1, type: "theory", tags: ["SSA"] },
            { name: "DWDM", hoursPerWeek: 4, type: "theory" },
            { name: "SSA 3 (V)", hoursPerWeek: 1, type: "theory", tags: ["SSA"] },
            { name: "NPTEL (IOT)", hoursPerWeek: 3, type: "theory" },
            { name: "ML LAB", hoursPerWeek: 4, type: "lab" },
            { name: "IOT LAB", hoursPerWeek: 2, type: "lab" },
            { name: "DBMS LAB", hoursPerWeek: 2, type: "lab" },
            { name: "AIDS LAB", hoursPerWeek: 2, type: "lab" },
          ];
          await addSubjectsBulk(base.map((b) => ({ ...b, departmentId: dep.id, year: selection.year! })));
          subs = await getSubjectsForYear(dep.id, selection.year!);
        }
        seedYearDataset(subs);
        setDepartmentId(dep.id);
      } catch (e: any) {
        toast({ title: "Failed to load subjects", description: e?.message || String(e) });
      }
    })();
  }, [selection.department, selection.year]);

  // Load faculty and subject-faculty mapping when department/year/section changes
  useEffect(() => {
    if (!selection.department || !selection.year || !selection.section) return;
    (async () => {
      try {
        const dep = await ensureDepartment(selection.department!);
        
        // Load faculty assigned to this specific section
        const facultyList = await getFacultyBySection(dep.id, selection.year!, selection.section!);
        setAvailableFaculty(facultyList);
        
        // Load current subject-faculty assignments
        const facultyMap = await getSubjectFacultyMap(dep.id, selection.year!, selection.section);
        setSubjectFacultyMap(facultyMap);
        
        console.log('Loaded faculty assignments for section:', facultyMap);
      } catch (e: any) {
        console.warn('Failed to load faculty data:', e);
        toast({ title: "Failed to load faculty data", description: e?.message || String(e) });
      }
    })();
  }, [selection.department, selection.year, selection.section, available.length]); // Re-load when subjects change

  // Sync input with current data when selection or subjects change
  useEffect(() => {
    (async () => {
      if (!isFourthYear || !selection.department || !selection.year) {
        setOpenElectiveHoursState(0);
        return;
      }
      try {
        let depId = departmentId;
        if (!depId) {
          const dep = await ensureDepartment(selection.department);
          depId = dep.id;
          setDepartmentId(depId);
        }
        const hours = await getOpenElectiveHours(depId, selection.year);
        setOpenElectiveHoursState(hours || 0);
      } catch (_) {
        setOpenElectiveHoursState(0);
      }
    })();
  }, [isFourthYear, selection.department, selection.year]);

  const handleSaveOpenElectiveHours = async () => {
    try {
      if (!selection.year || !selection.department) {
        toast({ title: "Missing selection", description: "Please select department and year." });
        return;
      }
      // For totals, we should not sum individual open elective subjects; instead user-configured OE hours override display total
      // However, currentSelected contains individual OE subjects as part of year subjects list; we compute delta accordingly
      const proposed = (totals.total - currentOpenElectiveHours) + Number(openElectiveHours) + configuredSpecialHrs;
      if (proposed > SUBJECT_HOUR_LIMIT) {
        toast({ title: "Too many hours", description: `Proposed ${proposed}/42 exceeds the limit.` });
        return;
      }
      setSavingOpenElective(true);
      let depId = departmentId;
      if (!depId) {
        const dep = await ensureDepartment(selection.department);
        depId = dep.id;
        setDepartmentId(depId);
      }
      await setOpenElectiveHours(depId, selection.year, Number(openElectiveHours));
      // Do not alter subjects; open elective hours are now a setting. Still refresh to keep UI consistent
      const subs = await getSubjectsForYear(depId, selection.year);
      seedYearDataset(subs);
      toast({ title: "Saved", description: "Open Elective hours updated." });
    } catch (e: any) {
      toast({ title: "Failed to save", description: e?.message || String(e) });
    } finally {
      setSavingOpenElective(false);
    }
  };

  const handleAdd = async () => {
    try {
      if (!form.name || !form.hours) return;
      if (!selection.department || !selection.year) {
        toast({ title: "Select Department & Year", description: "Please choose department and year first." });
        return;
      }
      const dep = await ensureDepartment(selection.department);
      const created = await addSubjectDb({
        name: form.name,
        hoursPerWeek: Number(form.hours),
        type: form.type,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()) : [],
        code: form.code?.trim() || undefined,
        abbreviation: form.abbreviation?.trim() || undefined,
        staff: form.staff?.trim() || undefined,
        credits: form.credits || 3,
        departmentId: dep.id,
        year: selection.year,
      });
      addAvailable(created);
      moveToSelected(created.id);
      setForm({ name: "", hours: 1, type: "theory", tags: "", code: "", abbreviation: "", staff: "", credits: 3 });
      toast({ title: "Subject added", description: `${created.name} saved to Supabase.` });
    } catch (e: any) {
      toast({ title: "Failed to add subject", description: e?.message || String(e) });
    }
  };

  // Faculty assignment functions
  const handleFacultyAssignment = async (facultyId: string) => {
    if (!selectedSubjectForAssignment || !selection.department || !selection.year) return;
    
    setAssignmentLoading(true);
    try {
      const dep = await ensureDepartment(selection.department);
      await assignFacultyToSubjectsYearWide(
        facultyId, 
        dep.id, 
        selection.year, 
        selection.section!, 
        [selectedSubjectForAssignment.id]
      );
      
      // Update the faculty mapping
      const facultyName = availableFaculty.find(f => f.id === facultyId)?.name || 'Unknown Faculty';
      setSubjectFacultyMap(prev => ({ 
        ...prev, 
        [selectedSubjectForAssignment.id]: facultyName 
      }));
      
      toast({ 
        title: "Faculty assigned successfully", 
        description: `${facultyName} has been assigned to ${selectedSubjectForAssignment.name}` 
      });
      
      setFacultyAssignmentOpen(false);
      setSelectedSubjectForAssignment(null);
    } catch (e: any) {
      toast({ 
        title: "Assignment failed", 
        description: e?.message || String(e) 
      });
    } finally {
      setAssignmentLoading(false);
    }
  };

  const openFacultyAssignment = (subject: Subject) => {
    setSelectedSubjectForAssignment(subject);
    setFacultyAssignmentOpen(true);
  };

  const getAssignedFaculty = (subjectId: string): string => {
    return subjectFacultyMap[subjectId] || 'Unassigned';
  };

  // Auto-suggest faculty based on subject name/type
  const getSuggestedFaculty = (subject: Subject): Faculty[] => {
    const subjectNameLower = subject.name.toLowerCase();
    const subjectType = subject.type;
    
    return availableFaculty.filter(faculty => {
      const facultyNameLower = faculty.name.toLowerCase();
      const designation = faculty.designation?.toLowerCase() || '';
      
      // Priority 1: Name contains subject keywords
      const subjectKeywords = ['ml', 'machine learning', 'ai', 'artificial intelligence', 'dbms', 'database', 'cn', 'computer network', 'os', 'operating system'];
      const hasSubjectMatch = subjectKeywords.some(keyword => 
        subjectNameLower.includes(keyword) && facultyNameLower.includes(keyword)
      );
      
      // Priority 2: Designation matches subject type
      const hasDesignationMatch = (
        (subjectType === 'lab' && designation.includes('lab')) ||
        (subject.tags?.includes('SSA') && designation.includes('ssa')) ||
        (subjectType === 'theory' && designation.includes('professor'))
      );
      
      return hasSubjectMatch || hasDesignationMatch;
    }).slice(0, 3); // Return top 3 suggestions
  };

  const applyLabSettings = () => {
    // Build preferences map from current selections
    const prefs: typeof labPreferences = { ...labPreferences };
    selected.filter((s) => s.type === 'lab').forEach((lab) => {
      const current = prefs[lab.id] || {};
      const isChosenMorning = !!morningSelectedLabs[lab.id];
      const morningStart = morningStartByLab[lab.id];
      const eveningAt5 = !!eveningStartAt5ByLab[lab.id];
      prefs[lab.id] = {
        ...current,
        morningEnabled: enableMorning && isChosenMorning,
        morningStart: enableMorning && isChosenMorning ? (advancedMorning ? morningStart || 1 : (lab.hoursPerWeek >= 4 ? 1 : 1)) : undefined,
        eveningTwoHourStartAt5: lab.hoursPerWeek === 2 ? eveningAt5 : current.eveningTwoHourStartAt5,
        priority: enablePriorityAll && isChosenMorning ? (priorityByLab[lab.id] || 999) : current.priority,
      };
    });
    setLabPreferences(prefs);
    setLabSettingsOpen(false);
  };

  const next = () => {
    const totalHours = totals.total + configuredSpecialHrs;
    if (totalHours > SUBJECT_HOUR_LIMIT) {
      toast({ title: "Too many hours", description: `Assigned ${totalHours}/42. Reduce to continue.` });
      return;
    }
    if (!selection.department || !selection.year || !selection.section) {
      toast({ title: "Missing selection", description: "Please select department, year, and section." });
      return;
    }
    if (selected.length === 0) {
      toast({ title: "No subjects selected", description: "Please select at least one subject." });
      return;
    }
    navigate("/timetable");
  };

  return (
    <div className="min-h-screen bg-background">
      <AdminNavbar />
      <main className="md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80">
        <section className="container py-10 md:pt-16">
          <header className="mb-6">
            <h1 className="text-3xl font-bold" style={{fontFamily: 'Poppins'}}>Manage Subjects</h1>
            <p className="text-muted-foreground">Choose subjects for the selected year. Added subjects are shared across sections of that year.</p>
          </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Summary</CardTitle>
              <CardDescription>Max 42 hours/week</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-lg bg-secondary">
                <div className="text-sm text-muted-foreground">Total Hours</div>
                <div className="text-2xl font-semibold">{(totals.total - currentOpenElectiveHours) + openElectiveHours + configuredSpecialHrs}</div>
              </div>
              <div className="p-4 rounded-lg bg-secondary">
                <div className="text-sm text-muted-foreground">Theory</div>
                <div className="text-2xl font-semibold">{totals.theory}</div>
              </div>
              <div className="p-4 rounded-lg bg-secondary">
                <div className="text-sm text-muted-foreground">Labs</div>
                <div className="text-2xl font-semibold">{totals.lab}</div>
              </div>
              <div className="p-4 rounded-lg bg-secondary">
                  <div className="text-sm text-muted-foreground">Specials</div>
                  <div className="text-2xl font-semibold">{configuredSpecialHrs}</div>
              </div>
            </CardContent>
          </Card>

          {/* Fourth Year: Open Elective Hours */}
          {isFourthYear && (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle>Open Elective Hours</CardTitle>
                <CardDescription>Only for Year IV</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-sm">Hours per week</Label>
                  <Input
                    type="number"
                    min={0}
                    max={42}
                    value={openElectiveHours}
                    onChange={(e) => setOpenElectiveHoursState(parseInt(e.target.value || '0', 10))}
                    className="mt-1 w-32"
                  />
                  <div className="text-xs text-muted-foreground mt-1">Configured: {openElectiveHours} h/w • Subjects total: {currentOpenElectiveHours} h/w</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveOpenElectiveHours} disabled={savingOpenElective}>
                    {savingOpenElective ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Faculty Overview */}
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Faculty Overview
              </CardTitle>
              <CardDescription>Auto-assignment available</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center p-3 rounded-lg bg-secondary">
                <div className="text-sm text-muted-foreground">Available Faculty</div>
                <div className="text-lg font-semibold">{availableFaculty.length}</div>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-secondary">
                <div className="text-sm text-muted-foreground">Assigned Subjects</div>
                <div className="text-lg font-semibold text-green-600">
                  {Object.keys(subjectFacultyMap).length}
                </div>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-secondary">
                <div className="text-sm text-muted-foreground">Unassigned</div>
                <div className="text-lg font-semibold text-orange-600">
                  {available.length - Object.keys(subjectFacultyMap).length}
                </div>
              </div>
              {availableFaculty.length > 0 && (
                <div className="pt-2 border-t">
                  <div className="text-xs text-muted-foreground mb-2">Quick Actions</div>
                  <div className="space-y-1">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="w-full text-xs"
                      onClick={() => {
                        // Auto-assign all subjects with suggestions
                        available.forEach(subject => {
                          const suggestions = getSuggestedFaculty(subject);
                          if (suggestions.length > 0 && getAssignedFaculty(subject.id) === 'Unassigned') {
                            handleFacultyAssignment(suggestions[0].id);
                          }
                        });
                      }}
                      disabled={assignmentLoading}
                    >
                      Auto-Assign All
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl lg:col-span-2">
            <CardHeader>
              <CardTitle>Special Hours Configuration</CardTitle>
              <CardDescription>Configure Seminar, Library, and Counselling hours for this class</CardDescription>
            </CardHeader>
            <CardContent>
              {departmentId && selection.year ? (
                <div className="w-full">
                  <SpecialHoursManager
                    departmentId={departmentId}
                    year={selection.year}
                    onConfigUpdate={setSpecialHoursConfigs}
                  />
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <div className="text-lg font-medium">Select department and year</div>
                  <div className="text-sm">Special hours can be configured once a class is selected</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
          <Card className="rounded-2xl">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle>Selected for Generation</CardTitle>
                <CardDescription>Used by the algorithm</CardDescription>
              </div>
              <Button 
                size="sm"
                variant="hero"
                onClick={next}
                className="w-full sm:w-auto"
                disabled={((totals.total - currentOpenElectiveHours) + openElectiveHours + configuredSpecialHrs) > SUBJECT_HOUR_LIMIT || 
                         !selection.department || !selection.year || !selection.section ||
                         selected.length === 0}
              >
                Generate Timetable
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {selected.map((s) => {
                const assignedFaculty = getAssignedFaculty(s.id);
                const suggestedFaculty = getSuggestedFaculty(s);
                
                return (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-card border">
                    <div className="flex items-center gap-3 flex-1">
                      <Badge variant={s.type === 'lab' ? 'default' : 'secondary'}>{s.type.toUpperCase()}</Badge>
                      <div className="flex-1">
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.type === 'open elective' ? '-' : `${s.hoursPerWeek} h/w`} {s.tags?.length ? `• ${s.tags?.join(', ')}` : ''}
                        </div>
                        <div className="text-xs flex items-center gap-1 mt-1">
                          <UserCheck className="h-3 w-3" />
                          <span className={assignedFaculty === 'Unassigned' ? 'text-orange-600' : 'text-green-600'}>
                            {assignedFaculty}
                          </span>
                          {suggestedFaculty.length > 0 && assignedFaculty === 'Unassigned' && (
                            <span className="text-blue-600 ml-2">
                              • Suggested: {suggestedFaculty[0].name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => openFacultyAssignment(s)}
                        className="text-xs"
                      >
                        <Users className="h-3 w-3 mr-1" />
                        Assign
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => moveToAvailable(s.id)}>Remove</Button>
                    </div>
                  </div>
                );
              })}

              <Separator className="my-4" />

              {/* Lab Settings trigger and controls remain below */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pt-2">
                <Dialog open={labSettingsOpen} onOpenChange={setLabSettingsOpen}>
                  <DialogTrigger asChild>
                    <Button variant="soft">Open Lab Settings</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Lab Scheduling Preferences</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">Prioritize Morning Lab</div>
                          <div className="text-xs text-muted-foreground">Schedule selected labs in P1–P4</div>
                        </div>
                        <Toggle checked={enableMorning} onCheckedChange={setEnableMorning} />
                      </div>
                      {enableMorning && (
                        <div className="space-y-4">
                          <div>
                            <div className="font-medium mb-2">Choose labs for morning</div>
                            <div className="grid gap-2">
                              {selected.filter((s) => s.type === 'lab').map((lab) => (
                                <label key={lab.id} className="flex items-center justify-between p-2 rounded-md border">
                                  <div className="text-sm">{lab.name} ({lab.hoursPerWeek}h)</div>
                                  <Checkbox checked={!!morningSelectedLabs[lab.id]} onCheckedChange={(v) => setMorningSelectedLabs((m) => ({ ...m, [lab.id]: !!v }))} />
                                </label>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="font-medium">Advanced Settings (for selected labs)</div>
                            <Toggle checked={advancedMorning} onCheckedChange={setAdvancedMorning} />
                          </div>

                          <div className="space-y-2">
                            {selected.filter((s) => s.type === 'lab').filter((l) => morningSelectedLabs[l.id]).map((lab) => (
                              <div key={lab.id} className="grid grid-cols-1 sm:grid-cols-3 items-center gap-2 p-2 rounded-md border">
                                <div className="font-medium text-sm">{lab.name} ({lab.hoursPerWeek}h)</div>
                                <div className="sm:col-span-2 flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Start at</span>
                                  <Select
                                    disabled={!advancedMorning}
                                    value={(morningStartByLab[lab.id] || 1).toString()}
                                    onValueChange={(v) => setMorningStartByLab((m) => ({ ...m, [lab.id]: Number(v) }))}
                                  >
                                    <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                                    <SelectContent className="z-50 bg-popover">
                                      {[1,2,3,4].map((p) => (
                                        <SelectItem key={p} value={p.toString()} disabled={p + lab.hoursPerWeek - 1 > 4 || (lab.hoursPerWeek >= 4 && p > 3)}>{p}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="flex items-center justify-between pt-2">
                            <div>
                              <div className="font-medium">Give priority to all selected morning labs</div>
                              <div className="text-xs text-muted-foreground">Assign priority numbers; smaller = higher priority</div>
                            </div>
                            <Toggle checked={enablePriorityAll} onCheckedChange={setEnablePriorityAll} />
                          </div>
                          {enablePriorityAll && (
                            <div className="grid gap-2">
                              {selected.filter((s) => s.type === 'lab').filter((l) => morningSelectedLabs[l.id]).map((lab) => (
                                <div key={lab.id} className="flex items-center justify-between p-2 rounded-md border">
                                  <div className="text-sm">{lab.name}</div>
                                  <Input className="w-24" type="number" min={1} max={10} value={priorityByLab[lab.id] ?? ''} onChange={(e) => setPriorityByLab((m) => ({ ...m, [lab.id]: Number(e.target.value) }))} placeholder="1" />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="font-medium">Evening Lab Option</div>
                        {selected.filter((s) => s.type === 'lab' && s.hoursPerWeek === 2).map((lab) => (
                          <div key={lab.id} className="flex items-center justify-between p-2 rounded-md border">
                            <div className="text-sm">{lab.name}: start at period 5 (P5–P6)</div>
                            <Toggle checked={!!eveningStartAt5ByLab[lab.id]} onCheckedChange={(v) => setEveningStartAt5ByLab((m) => ({ ...m, [lab.id]: v }))} />
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-end">
                        <Button variant="hero" onClick={applyLabSettings}>Apply</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Generate button moved to header; removed here */}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Faculty Assignment Dialog */}
        <Dialog open={facultyAssignmentOpen} onOpenChange={setFacultyAssignmentOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Assign Faculty to {selectedSubjectForAssignment?.name}
              </DialogTitle>
            </DialogHeader>
            
            {selectedSubjectForAssignment && (
              <div className="space-y-4">
                {/* Current Assignment */}
                <div className="p-3 rounded-lg bg-muted">
                  <div className="text-sm font-medium">Current Assignment</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {getAssignedFaculty(selectedSubjectForAssignment.id)}
                  </div>
                </div>

                {/* Suggestions */}
                {getSuggestedFaculty(selectedSubjectForAssignment).length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-2">Suggested Faculty</div>
                    <div className="space-y-2">
                      {getSuggestedFaculty(selectedSubjectForAssignment).map((faculty) => (
                        <div 
                          key={faculty.id}
                          className="flex items-center justify-between p-3 rounded-lg border bg-blue-50 border-blue-200"
                        >
                          <div>
                            <div className="font-medium text-blue-900">{faculty.name}</div>
                            <div className="text-xs text-blue-700">
                              {faculty.designation || 'Faculty'} 
                              {faculty.email && ` • ${faculty.email}`}
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="default"
                            onClick={() => handleFacultyAssignment(faculty.id)}
                            disabled={assignmentLoading}
                          >
                            {assignmentLoading ? 'Assigning...' : 'Assign'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* All Faculty */}
                <div>
                  <div className="text-sm font-medium mb-2">All Department Faculty</div>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {availableFaculty.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">
                        <Users className="h-8 w-8 mx-auto mb-2" />
                        <div>No faculty found</div>
                        <div className="text-xs">Add faculty to this department first</div>
                      </div>
                    ) : (
                      availableFaculty.map((faculty) => (
                        <div 
                          key={faculty.id}
                          className="flex items-center justify-between p-3 rounded-lg border"
                        >
                          <div>
                            <div className="font-medium">{faculty.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {faculty.designation || 'Faculty'}
                              {faculty.email && ` • ${faculty.email}`}
                              {faculty.takesElectives && (
                                <Badge variant="outline" className="ml-2 text-xs">
                                  Electives
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleFacultyAssignment(faculty.id)}
                            disabled={assignmentLoading}
                          >
                            {assignmentLoading ? 'Assigning...' : 'Assign'}
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Assignment Summary */}
                {availableFaculty.length > 0 && (
                  <div className="p-3 rounded-lg bg-muted">
                    <div className="text-sm font-medium">Assignment Summary</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Department: {selection.department} • Year: {selection.year}
                      <br />
                      Total Faculty: {availableFaculty.length} • 
                      Assigned Subjects: {Object.keys(subjectFacultyMap).length}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </section>
    </main>
  </div>
);
};

export default SubjectManagement;