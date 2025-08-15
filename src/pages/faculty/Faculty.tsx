import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/navbar/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getDepartments, createFaculty, deleteFaculty, getFacultyByDepartment, getFacultyDetails, saveFacultyElectiveInfo, updateFaculty, listFacultySubjectClass, deleteFacultySubjectClass, upsertClassCounselor, deactivateClassCounselor } from "@/lib/supabaseService";

type Department = { id: string; name: string };
type FacultyItem = { id: string; name: string; email?: string | null; designation?: string | null; departmentId: string; takesElectives?: boolean };
type Subject = { id: string; name: string; year: string; type: string; hoursPerWeek: number; code?: string; abbreviation?: string; departmentId: string };
type FacultySubjectClass = { id?: string; departmentId: string; facultyId: string; subjectId: string; year: string; section: string };
type FacultyElective = { id?: string; facultyId: string; departmentId: string; subjectId?: string | null; year: string; section: string };

const FacultyPage = () => {
  const navigate = useNavigate();
  const isLoggedIn = useMemo(() => localStorage.getItem("superAdmin") === "true", []);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptFilterId, setDeptFilterId] = useState<string>("ALL");
  const [faculty, setFaculty] = useState<FacultyItem[]>([]);
  const [search, setSearch] = useState("");

  // Add form state
  const [addOpen, setAddOpen] = useState<boolean>(false);
  const [formDeptId, setFormDeptId] = useState<string>("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [designation, setDesignation] = useState("");
  
  // Edit form state
  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string>("");
  const [editDeptId, setEditDeptId] = useState<string>("");
  const [editName, setEditName] = useState<string>("");
  const [editEmail, setEditEmail] = useState<string>("");
  const [editDesignation, setEditDesignation] = useState<string>("");
  const [editSubjects, setEditSubjects] = useState<Subject[]>([]);
  // Subject selection state
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<string>>(new Set());
  const [subjectSearch, setSubjectSearch] = useState("");
  
  // Subject type toggles
  const [theoryEnabled, setTheoryEnabled] = useState<boolean>(false);
  const [labEnabled, setLabEnabled] = useState<boolean>(false);

  // Class Counselor state
  const [isCC, setIsCC] = useState<boolean>(false);
  const [ccYear, setCcYear] = useState<string>("");
  const [ccSection, setCcSection] = useState<string>("");
  
  // Elective state
  const [takesElectives, setTakesElectives] = useState<boolean>(false);
  const [electiveDeptId, setElectiveDeptId] = useState<string>("");
  const [electiveYear, setElectiveYear] = useState<string>("");
  const [electiveSection, setElectiveSection] = useState<string>("");
  const [electiveSubjects, setElectiveSubjects] = useState<Subject[]>([]);

  // View/Edit faculty state
  const [viewFacultyOpen, setViewFacultyOpen] = useState<boolean>(false);
  const [selectedFaculty, setSelectedFaculty] = useState<{
    faculty: FacultyItem;
    subjects: FacultySubjectClass[];
    classCounselor: { year: string; section: string } | null;
    electives: FacultyElective[];
  } | null>(null);
  const [viewSubjectMeta, setViewSubjectMeta] = useState<Record<string, { name: string; type?: string; hours?: number }>>({});


  useEffect(() => {
    document.title = "Faculty - Super Admin";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Manage faculty list and basic details");
  }, []);

  useEffect(() => {
    if (!isLoggedIn) { navigate('/super-admin-login', { replace: true }); return; }
    (async () => {
      const data = await getDepartments();
        setDepartments(data || []);
      // default to All departments in view
      if (!deptFilterId) setDeptFilterId("ALL");
    })();
  }, [isLoggedIn]);

  useEffect(() => {
    (async () => {
      if (deptFilterId === "ALL") {
        const { data, error } = await (supabase as any)
          .from('faculty_members')
          .select('id, name, email, designation, department_id');
        if (!error) {
          const list = (data || []).map((f: any) => ({
            id: f.id,
            name: f.name,
            email: f.email ?? null,
            designation: f.designation ?? null,
            departmentId: f.department_id,
          })) as FacultyItem[];
      setFaculty(list);
        }
      } else if (deptFilterId) {
        const list = await getFacultyByDepartment(deptFilterId);
      setFaculty(list);
      }
    })();
  }, [deptFilterId]);

  // Load subjects when form department changes
  useEffect(() => {
    if (!formDeptId) {
      setSubjects([]);
      setSelectedSubjectIds(new Set());
      return;
    }
    
    (async () => {
      try {
      const { data, error } = await (supabase as any)
        .from('subjects')
          .select('*')
          .eq('department_id', formDeptId)
          .order('year, name');
        
        if (error) throw error;
        
        const subjectsList = (data || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          year: s.year,
          type: s.type,
          hoursPerWeek: s.hours_per_week,
          code: s.code,
          abbreviation: s.abbreviation,
          departmentId: s.department_id,
        }));
        
        setSubjects(subjectsList);
        setSelectedSubjectIds(new Set()); // Reset selections when department changes
      } catch (error) {
        console.error('Failed to load subjects:', error);
        setSubjects([]);
      }
    })();
  }, [formDeptId]);

  // Load subjects when edit department changes (for Edit dialog)
  useEffect(() => {
    if (!editDeptId) {
      setEditSubjects([]);
      return;
    }
    (async () => {
      try {
      const { data, error } = await (supabase as any)
          .from('subjects')
          .select('*')
          .eq('department_id', editDeptId)
          .order('year, name');
        if (error) throw error;
        const list = (data || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          year: s.year,
          type: s.type,
          hoursPerWeek: s.hours_per_week,
          code: s.code,
          abbreviation: s.abbreviation,
          departmentId: s.department_id,
        }));
        setEditSubjects(list);
      } catch (_) {
        setEditSubjects([]);
      }
    })();
  }, [editDeptId]);

  // Load elective subjects when elective parameters change
  useEffect(() => {
    if (!takesElectives || !electiveDeptId || !electiveYear || !electiveSection) {
      setElectiveSubjects([]);
      return;
    }
    
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('subjects')
          .select('*')
          .eq('department_id', electiveDeptId)
          .eq('year', electiveYear)
          .eq('type', 'elective')
          .order('name');
        
        if (error) throw error;
        
        const electiveSubjectsList = (data || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          year: s.year,
          type: s.type,
          hoursPerWeek: s.hours_per_week,
          code: s.code,
          abbreviation: s.abbreviation,
          departmentId: s.department_id,
        }));
        
        setElectiveSubjects(electiveSubjectsList);
      } catch (error) {
        console.error('Failed to load elective subjects:', error);
        setElectiveSubjects([]);
      }
    })();
  }, [takesElectives, electiveDeptId, electiveYear, electiveSection]);

  const resetForm = () => {
    setName(""); 
    setEmail(""); 
    setDesignation(""); 
    setFormDeptId("");
    setSubjects([]);
    setSelectedSubjectIds(new Set());
    setSubjectSearch("");
    setTheoryEnabled(false);
    setLabEnabled(false);
    setIsCC(false);
    setCcYear("");
    setCcSection("");
    setTakesElectives(false);
    setElectiveDeptId("");
    setElectiveYear("");
    setElectiveSection("");
    setElectiveSubjects([]);
    setAddOpen(false);
  };

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Enter name'); return; }
    try {
      const deptForCreate = formDeptId || (deptFilterId !== 'ALL' ? deptFilterId : departments[0]?.id);
      if (!deptForCreate) { toast.error('Select department'); return; }
      const f = await createFaculty({ departmentId: deptForCreate, name: name.trim(), email: email.trim() || null, designation: designation.trim() || null, takesElectives });
      setFaculty((list) => [...list, f]);
      
      // Assign selected subjects to the faculty
      if (selectedSubjectIds.size > 0) {
        try {
          const rows = Array.from(selectedSubjectIds).map(subjectId => ({
            faculty_id: f.id,
            subject_id: subjectId,
            department_id: deptForCreate,
            year: subjects.find(s => s.id === subjectId)?.year || 'I',
            section: 'A',
          }));
          const { error } = await (supabase as any)
            .from('faculty_subject_class')
            .insert(rows);
          if (error) throw error;
          toast.success(`Faculty created and assigned to ${selectedSubjectIds.size} subject(s)`);
        } catch (assignmentError) {
          console.warn('faculty_subject_class insert failed, falling back:', assignmentError);
          try {
            const rows = Array.from(selectedSubjectIds).map(subjectId => ({
              faculty_id: f.id,
              subject_id: subjectId,
              department_id: deptForCreate,
              year: subjects.find(s => s.id === subjectId)?.year || 'I',
              section: null,
            }));
            const { error: fbErr } = await (supabase as any)
              .from('faculty_subject_assignments')
              .insert(rows);
            if (fbErr) throw fbErr;
            toast.success(`Faculty created and assigned to ${selectedSubjectIds.size} subject(s)`);
          } catch (fallbackErr) {
            console.error('Fallback subject assignment failed:', fallbackErr);
            toast.success('Faculty created but failed to assign subjects');
          }
        }
      } else {
      toast.success('Faculty created');
      }
      
      // Assign Class Counselor if enabled
      if (isCC && ccYear && ccSection) {
        try {
          await (supabase as any)
            .from('class_counselors')
            .insert({
              faculty_id: f.id,
              department_id: deptForCreate,
              year: ccYear,
              section: ccSection,
              is_active: true
            });
          toast.success(`Faculty created and assigned as CC for Year ${ccYear} Section ${ccSection}`);
        } catch (ccError) {
          console.error('Failed to assign CC:', ccError);
          toast.success('Faculty created but failed to assign as CC');
        }
      }
      
      resetForm();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create');
    }
  };

  const confirmDelete = async (id: string) => {
    try {
      await deleteFaculty(id);
      setFaculty((list) => list.filter((x) => x.id !== id));
      // Close any open modals related to this faculty
      if (selectedFaculty?.faculty.id === id) {
        setViewFacultyOpen(false);
        setSelectedFaculty(null);
      }
      if (editingId === id) {
        setEditOpen(false);
        setEditingId("");
      }
      toast.success('Faculty deleted');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete');
    }
  };

  const openEdit = async (f: FacultyItem) => {
    setEditingId(f.id);
    setEditDeptId(f.departmentId);
    setEditName(f.name);
    setEditEmail(f.email || "");
    setEditDesignation(f.designation || "");
    // Reset shared toggles
    setSelectedSubjectIds(new Set());
    setIsCC(false); setCcYear(""); setCcSection("");
    setTakesElectives(Boolean(f.takesElectives));
    setElectiveDeptId(""); setElectiveYear(""); setElectiveSection(""); setElectiveSubjects([]);
    try {
      const details = await getFacultyDetails(f.id);
      const subjIds = new Set<string>((details.subjects || []).map(s => s.subjectId));
      setSelectedSubjectIds(subjIds);
      if (details.classCounselor) { setIsCC(true); setCcYear(details.classCounselor.year); setCcSection(details.classCounselor.section); }
      if (details.electives && details.electives.length > 0) {
        const e = details.electives[0];
        setTakesElectives(true); setElectiveDeptId(e.departmentId); setElectiveYear(e.year); setElectiveSection(e.section);
      }
    } catch (_) {}
    setEditOpen(true);
  };

  const handleUpdateFaculty = async () => {
    if (!editingId || !editName.trim() || !editDeptId) { toast.error('Fill all required fields'); return; }
    try {
      await updateFaculty(editingId, {
        name: editName.trim(),
        email: editEmail.trim() || null,
        designation: editDesignation.trim() || null,
        departmentId: editDeptId,
        takesElectives,
      });
      // Save electives info
      if (takesElectives && electiveDeptId && electiveYear && electiveSection) {
        await saveFacultyElectiveInfo(editingId, electiveDeptId, electiveYear, electiveSection);
      }
      // Save CC info
      if (isCC && ccYear && ccSection) {
        await upsertClassCounselor({ departmentId: editDeptId, facultyId: editingId, year: ccYear, section: ccSection });
      }
      // Replace subject mappings with fallback
      try {
        const existing = await listFacultySubjectClass(editDeptId, editingId);
        for (const row of existing) {
          if (row.id) await deleteFacultySubjectClass(row.id);
        }
        if (selectedSubjectIds.size > 0) {
          const rows = Array.from(selectedSubjectIds).map((sid) => ({
            faculty_id: editingId,
            subject_id: sid,
            department_id: editDeptId,
            year: editSubjects.find(s => s.id === sid)?.year || 'I',
            section: 'A',
          }));
          const { error } = await (supabase as any)
            .from('faculty_subject_class')
            .insert(rows);
          if (error) throw error;
        }
      } catch (assignErr: any) {
        console.warn('faculty_subject_class not available, falling back:', assignErr?.message || assignErr);
        // fallback: replace in faculty_subject_assignments
        try {
          // Clear existing assignments
          await (supabase as any)
            .from('faculty_subject_assignments')
            .delete()
            .eq('faculty_id', editingId)
            .eq('department_id', editDeptId);
          if (selectedSubjectIds.size > 0) {
            const rows = Array.from(selectedSubjectIds).map((sid) => ({
              faculty_id: editingId,
              subject_id: sid,
              department_id: editDeptId,
              year: editSubjects.find(s => s.id === sid)?.year || 'I',
              section: null,
            }));
            const { error: fbErr } = await (supabase as any)
              .from('faculty_subject_assignments')
              .insert(rows);
            if (fbErr) throw fbErr;
          }
        } catch (fb2) {
          console.error('Fallback subject mapping failed:', fb2);
        }
      }
      setFaculty((list) => list.map((x) => x.id === editingId ? {
        ...x,
        name: editName.trim(),
        email: editEmail.trim() || null,
        designation: editDesignation.trim() || null,
        departmentId: editDeptId,
        takesElectives,
      } : x));
      // If filtered by a specific department and the record moved out, remove from view
      if (deptFilterId !== 'ALL' && editDeptId !== deptFilterId) {
        setFaculty((list) => list.filter((x) => x.id !== editingId));
      }
      setEditOpen(false);
      setEditingId("");
      toast.success('Faculty updated');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update');
    }
  };

  // Auto-enable theory/lab toggles based on preselected subjects in Edit dialog
  useEffect(() => {
    if (!editOpen) return;
    const sel = Array.from(selectedSubjectIds);
    const hasTheory = sel.some(id => editSubjects.find(s => s.id === id)?.type === 'theory');
    const hasLab = sel.some(id => editSubjects.find(s => s.id === id)?.type === 'lab');
    if (hasTheory) setTheoryEnabled(true);
    if (hasLab) setLabEnabled(true);
  }, [editOpen, selectedSubjectIds, editSubjects]);

  const handleFacultyClick = async (faculty: FacultyItem) => {
    try {
      setViewFacultyOpen(true); // Open modal first to show loading state
      
      const details = await getFacultyDetails(faculty.id);
      // Build subject metadata for view rendering
      const ids = Array.from(new Set((details.subjects || []).map(s => s.subjectId).filter(Boolean)));
      let meta: Record<string, { name: string; type?: string; hours?: number }> = {};
      if (ids.length > 0) {
        const { data } = await (supabase as any)
          .from('subjects')
          .select('id,name,type,hours_per_week')
          .in('id', ids);
        (data || []).forEach((r: any) => { meta[r.id] = { name: r.name, type: r.type, hours: r.hours_per_week }; });
      }
      setViewSubjectMeta(meta);
      setSelectedFaculty({
        faculty,
        subjects: details.subjects,
        classCounselor: details.classCounselor,
        electives: details.electives,
      });
    } catch (error) {
      console.error('Failed to load faculty details:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to load faculty details');
      setViewFacultyOpen(false); // Close modal on error
    }
  };

  const filtered = faculty
    .filter((f) => f.name.toLowerCase().includes(search.toLowerCase()) || (f.email || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <section className="container py-10">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Faculty</h1>
            <p className="text-sm text-muted-foreground">List of faculty and add new</p>
          </div>
          <div className="space-x-2">
            <Button onClick={() => { setAddOpen(true); }}>Add Faculty</Button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Department</div>
            <Select value={deptFilterId} onValueChange={setDeptFilterId}>
              <SelectTrigger><SelectValue placeholder="All departments" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All departments</SelectItem>
                {departments.map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Search</div>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email" />
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card className="rounded-xl">
            <CardHeader className="p-4 pb-0">
              <CardTitle className="text-sm font-medium">Total Faculty</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <div className="text-3xl font-semibold">{faculty.length}</div>
              <div className="text-xs text-muted-foreground">
                {deptFilterId === 'ALL' ? 'All departments' : (departments.find(d => d.id === deptFilterId)?.name || '-')}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="text-base">Faculty list</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((f) => (
                  <TableRow 
                    key={f.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleFacultyClick(f)}
                  >
                    <TableCell>{f.name}</TableCell>
                    <TableCell>{f.email || '-'}</TableCell>
                    <TableCell>{f.designation || '-'}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(f);
                        }}
                      >
                        Edit
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFacultyClick(f);
                        }}
                      >
                        View
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete faculty?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove the faculty. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={(e) => { e.stopPropagation(); confirmDelete(f.id); }}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog
          open={addOpen}
          onOpenChange={(open) => {
            setAddOpen(open);
            if (open) {
              setFormDeptId(deptFilterId !== 'ALL' ? deptFilterId : (departments[0]?.id || ''));
            } else {
              resetForm();
            }
          }}
        >
          <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add new faculty</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="text-xs text-muted-foreground mb-1">Department</div>
                <Select value={formDeptId} onValueChange={setFormDeptId}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
                  <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <Input type="email" placeholder="Email (gmail)" value={email} onChange={(e) => setEmail(e.target.value)} />
              <div className="sm:col-span-2">
                <Input placeholder="Designation" value={designation} onChange={(e) => setDesignation(e.target.value)} />
                </div>

              {/* Subject Selection */}
              {formDeptId && (
                <div className="sm:col-span-2">
                  <div className="text-xs text-muted-foreground mb-2">Select subjects (optional)</div>
                  
                  {/* Theory Subjects Toggle and Dropdown */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium">Theory Subjects</div>
                      <Button
                        size="sm"
                        variant={theoryEnabled ? "default" : "outline"}
                        onClick={() => setTheoryEnabled(!theoryEnabled)}
                        className="h-7 text-xs"
                      >
                        {theoryEnabled ? "ON" : "OFF"}
                      </Button>
                </div>
                    {theoryEnabled && (
                      <>
                        <div className="text-xs text-muted-foreground mb-2">
                          {Array.from(selectedSubjectIds).filter(id => 
                            subjects.find(s => s.id === id)?.type === 'theory'
                          ).length} selected
              </div>
                        <Select
                          value=""
                          onValueChange={(subjectId) => {
                            if (subjectId && !selectedSubjectIds.has(subjectId)) {
                              setSelectedSubjectIds(prev => new Set([...prev, subjectId]));
                              setSubjectSearch(""); // Clear search after selection
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Search and select theory subjects..." />
                          </SelectTrigger>
                          <SelectContent>
                            <div className="p-2">
                              <Input
                                placeholder="Search theory subjects..."
                                value={subjectSearch}
                                onChange={(e) => setSubjectSearch(e.target.value)}
                                className="mb-2"
                              />
              </div>
                            {subjects
                              .filter(s => s.type === 'theory')
                              .filter(s => s.name.toLowerCase().includes(subjectSearch.toLowerCase()))
                              .map(subject => {
                                const isSelected = selectedSubjectIds.has(subject.id);
                      return (
                                  <SelectItem 
                                    key={subject.id} 
                                    value={subject.id}
                                    disabled={isSelected}
                                    className={isSelected ? "opacity-50 cursor-not-allowed" : ""}
                                  >
                                    {subject.name} (Y{subject.year} • {subject.hoursPerWeek}h)
                                    {isSelected && " ✓"}
                                  </SelectItem>
                      );
                    })}
                            {subjects.filter(s => s.type === 'theory').length === 0 && (
                              <div className="p-2 text-sm text-muted-foreground">
                                No theory subjects found
                  </div>
                            )}
                          </SelectContent>
                        </Select>
                      </>
                    )}
                </div>

                  {/* Lab Subjects Toggle and Dropdown */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium">Lab Subjects</div>
                      <Button
                        size="sm"
                        variant={labEnabled ? "default" : "outline"}
                        onClick={() => setLabEnabled(!labEnabled)}
                        className="h-7 text-xs"
                      >
                        {labEnabled ? "ON" : "OFF"}
                      </Button>
                    </div>
                    {labEnabled && (
                      <>
                        <div className="text-xs text-muted-foreground mb-2">
                          {Array.from(selectedSubjectIds).filter(id => 
                            subjects.find(s => s.id === id)?.type === 'lab'
                          ).length} selected
                        </div>
                        <Select
                          value=""
                          onValueChange={(subjectId) => {
                            if (subjectId && !selectedSubjectIds.has(subjectId)) {
                              setSelectedSubjectIds(prev => new Set([...prev, subjectId]));
                              setSubjectSearch(""); // Clear search after selection
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Search and select lab subjects..." />
                          </SelectTrigger>
                          <SelectContent>
                            <div className="p-2">
                              <Input
                                placeholder="Search lab subjects..."
                                value={subjectSearch}
                                onChange={(e) => setSubjectSearch(e.target.value)}
                                className="mb-2"
                              />
                </div>
                            {subjects
                              .filter(s => s.type === 'lab')
                              .filter(s => s.name.toLowerCase().includes(subjectSearch.toLowerCase()))
                              .map(subject => {
                                const isSelected = selectedSubjectIds.has(subject.id);
                      return (
                                  <SelectItem 
                                    key={subject.id} 
                                    value={subject.id}
                                    disabled={isSelected}
                                    className={isSelected ? "opacity-50 cursor-not-allowed" : ""}
                                  >
                                    {subject.name} (Y{subject.year} • {subject.hoursPerWeek}h)
                                    {isSelected && " ✓"}
                                  </SelectItem>
                      );
                    })}
                            {subjects.filter(s => s.type === 'lab').length === 0 && (
                              <div className="p-2 text-sm text-muted-foreground">
                                No lab subjects found
                  </div>
                            )}
                          </SelectContent>
                        </Select>
                      </>
                    )}
                </div>
              </div>
              )}

              {/* Class Counselor Section */}
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Class Counselor (CC)</div>
                  <Button
                    size="sm"
                    variant={isCC ? "default" : "outline"}
                    onClick={() => setIsCC(!isCC)}
                    className="h-7 text-xs"
                  >
                    {isCC ? "ON" : "OFF"}
                  </Button>
                </div>
                {isCC && (
                  <div className="grid gap-3 md:grid-cols-2">
                <div>
                      <div className="text-xs text-muted-foreground mb-1">Year</div>
                      <Select value={ccYear} onValueChange={setCcYear}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select year" />
                        </SelectTrigger>
                    <SelectContent>
                          <SelectItem value="I">I</SelectItem>
                          <SelectItem value="II">II</SelectItem>
                          <SelectItem value="III">III</SelectItem>
                          <SelectItem value="IV">IV</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Section</div>
                      <Select value={ccSection} onValueChange={setCcSection}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select section" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A">A</SelectItem>
                          <SelectItem value="B">B</SelectItem>
                          <SelectItem value="C">C</SelectItem>
                          <SelectItem value="D">D</SelectItem>
                        </SelectContent>
                      </Select>
              </div>
                  </div>
                )}
              </div>

              {/* Elective Section */}
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Takes Electives</div>
                  <Button
                    size="sm"
                    variant={takesElectives ? "default" : "outline"}
                    onClick={() => setTakesElectives(!takesElectives)}
                    className="h-7 text-xs"
                  >
                    {takesElectives ? "ON" : "OFF"}
                  </Button>
                </div>
                {takesElectives && (
                  <>
                    <div className="grid gap-3 md:grid-cols-3 mb-4">
                <div>
                        <div className="text-xs text-muted-foreground mb-1">Department</div>
                        <Select value={electiveDeptId} onValueChange={setElectiveDeptId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                          <SelectContent>
                            {departments.map((d) => (
                              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Year</div>
                        <Select value={electiveYear} onValueChange={setElectiveYear}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select year" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="I">I</SelectItem>
                            <SelectItem value="II">II</SelectItem>
                            <SelectItem value="III">III</SelectItem>
                            <SelectItem value="IV">IV</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Section</div>
                        <Select value={electiveSection} onValueChange={setElectiveSection}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select section" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="A">A</SelectItem>
                            <SelectItem value="B">B</SelectItem>
                            <SelectItem value="C">C</SelectItem>
                            <SelectItem value="D">D</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      </div>

                    {/* Elective Subjects List */}
                    {electiveDeptId && electiveYear && electiveSection && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-2">
                          Available elective subjects for {departments.find(d => d.id === electiveDeptId)?.name} - Year {electiveYear} Section {electiveSection}:
                        </div>
                        <div className="border rounded-md p-3 max-h-32 overflow-y-auto">
                          {electiveSubjects.length > 0 ? (
                            <div className="space-y-2">
                              {electiveSubjects.map(subject => (
                                <div key={subject.id} className="text-sm p-2 bg-muted rounded">
                                  {subject.name} ({subject.hoursPerWeek}h)
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground text-center py-2">
                              No elective subjects found for the selected criteria
                      </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Selected Subjects Summary */}
              {selectedSubjectIds.size > 0 && (
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-muted-foreground">
                      Selected subjects ({selectedSubjectIds.size}):
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedSubjectIds(new Set())}
                      className="h-7 text-xs"
                    >
                      Clear All
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {Array.from(selectedSubjectIds).map(subjectId => {
                      const subject = subjects.find(s => s.id === subjectId);
                      return subject ? (
                        <div key={subjectId} className="flex items-center justify-between bg-muted px-3 py-2 rounded-md">
                          <span className="text-sm">
                            {subject.name} 
                            <span className="text-xs text-muted-foreground ml-2">
                              (Y{subject.year} • {subject.type} • {subject.hoursPerWeek}h)
                            </span>
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedSubjectIds(prev => {
                              const next = new Set(prev);
                              next.delete(subjectId);
                              return next;
                            })}
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          >
                            ×
                          </Button>
              </div>
                      ) : null;
                          })}
                        </div>
                      </div>
              )}
            </div>
            <div className="mt-4 flex items-center gap-2 justify-end">
              <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate}>Create</Button>
              </div>
          </DialogContent>
        </Dialog>
      </section>

      {/* View Faculty Details Modal */}
      <Dialog open={viewFacultyOpen} onOpenChange={setViewFacultyOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Faculty Details</DialogTitle>
          </DialogHeader>
          
          {selectedFaculty && (
            <div className="space-y-6">
              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Basic Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="text-sm font-medium">Name</div>
                      <div className="text-sm text-muted-foreground">{selectedFaculty.faculty.name}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Email</div>
                      <div className="text-sm text-muted-foreground">{selectedFaculty.faculty.email || '-'}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Designation</div>
                      <div className="text-sm text-muted-foreground">{selectedFaculty.faculty.designation || '-'}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Department</div>
                      <div className="text-sm text-muted-foreground">
                        {departments.find(d => d.id === selectedFaculty.faculty.departmentId)?.name || '-'}
                      </div>
                    </div>
              </div>
            </CardContent>
          </Card>

              {/* Assigned Subjects */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Assigned Subjects</CardTitle>
                </CardHeader>
                <CardContent>
                  {(selectedFaculty.subjects && selectedFaculty.subjects.length > 0) ? (
                    <div className="space-y-2">
                      {selectedFaculty.subjects.map((subject) => (
                        <div key={subject.id ?? subject.subjectId} className="flex items-center justify-between p-3 bg-muted rounded-md">
                          <div className="text-sm">
                            {viewSubjectMeta[subject.subjectId!]?.name || subject.subjectId}
                            <span className="text-xs text-muted-foreground"> {`(Y${subject.year} • Sec ${subject.section || '-'})`}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground text-center py-4">
                      No subjects assigned
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Class Counselor */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Class Counselor</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedFaculty.classCounselor ? (
                    <div className="text-sm">
                      Year: {selectedFaculty.classCounselor.year} | Section: {selectedFaculty.classCounselor.section}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground text-center py-4">
                      Not assigned as Class Counselor
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Electives */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Electives</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedFaculty.electives.length > 0 ? (
                    <div className="space-y-2">
                      {selectedFaculty.electives.map((elective) => (
                        <div key={elective.id} className="flex items-center justify-between p-3 bg-muted rounded-md">
                          <div className="text-sm">
                            Department: {departments.find(d => d.id === elective.departmentId)?.name || '-'} | 
                            Year: {elective.year} | Section: {elective.section}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground text-center py-4">
                      No electives assigned
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Faculty Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit faculty</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <div className="text-xs text-muted-foreground mb-1">Department</div>
              <Select value={editDeptId} onValueChange={setEditDeptId}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <Input placeholder="Name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            <Input type="email" placeholder="Email (gmail)" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            <div className="sm:col-span-2">
              <Input placeholder="Designation" value={editDesignation} onChange={(e) => setEditDesignation(e.target.value)} />
            </div>

            <div className="sm:col-span-2 mt-2">
              <div className="text-sm font-medium mb-2">Select subjects (optional)</div>

              {/* Theory Subjects Toggle and Selector */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Theory Subjects</div>
                  <Button size="sm" variant={theoryEnabled ? 'default' : 'outline'} onClick={() => setTheoryEnabled(!theoryEnabled)} className="h-7 text-xs">
                    {theoryEnabled ? 'ON' : 'OFF'}
                  </Button>
                </div>
                {theoryEnabled && (
                  <>
                    <div className="text-xs text-muted-foreground mb-2">
                      {Array.from(selectedSubjectIds).filter(id => editSubjects.find(s => s.id === id)?.type === 'theory').length} selected
                    </div>
                    <Select value="" onValueChange={(subjectId) => {
                      if (subjectId && !selectedSubjectIds.has(subjectId)) {
                        setSelectedSubjectIds(prev => new Set([...prev, subjectId]));
                        setSubjectSearch('');
                      }
                    }}>
                      <SelectTrigger><SelectValue placeholder="Search and select theory subjects..." /></SelectTrigger>
                      <SelectContent>
                        <div className="p-2">
                          <Input placeholder="Search theory subjects..." value={subjectSearch} onChange={(e) => setSubjectSearch(e.target.value)} className="mb-2" />
                        </div>
                        {editSubjects.filter(s => s.type === 'theory').filter(s => s.name.toLowerCase().includes(subjectSearch.toLowerCase())).map(subject => {
                          const isSelected = selectedSubjectIds.has(subject.id);
                            return (
                            <SelectItem key={subject.id} value={subject.id} disabled={isSelected} className={isSelected ? 'opacity-50 cursor-not-allowed' : ''}>
                              {subject.name} (Y{subject.year} • {subject.hoursPerWeek}h)
                              {isSelected && ' ✓'}
                            </SelectItem>
                            );
                          })}
                        {editSubjects.filter(s => s.type === 'theory').length === 0 && (
                          <div className="p-2 text-sm text-muted-foreground">No theory subjects found</div>
                        )}
                      </SelectContent>
                    </Select>
                  </>
                )}
                        </div>

              {/* Lab Subjects Toggle and Selector */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Lab Subjects</div>
                  <Button size="sm" variant={labEnabled ? 'default' : 'outline'} onClick={() => setLabEnabled(!labEnabled)} className="h-7 text-xs">
                    {labEnabled ? 'ON' : 'OFF'}
                  </Button>
                      </div>
                {labEnabled && (
                  <>
                    <div className="text-xs text-muted-foreground mb-2">
                      {Array.from(selectedSubjectIds).filter(id => editSubjects.find(s => s.id === id)?.type === 'lab').length} selected
                    </div>
                    <Select value="" onValueChange={(subjectId) => {
                      if (subjectId && !selectedSubjectIds.has(subjectId)) {
                        setSelectedSubjectIds(prev => new Set([...prev, subjectId]));
                        setSubjectSearch('');
                      }
                    }}>
                      <SelectTrigger><SelectValue placeholder="Search and select lab subjects..." /></SelectTrigger>
                      <SelectContent>
                        <div className="p-2">
                          <Input placeholder="Search lab subjects..." value={subjectSearch} onChange={(e) => setSubjectSearch(e.target.value)} className="mb-2" />
              </div>
                        {editSubjects.filter(s => s.type === 'lab').filter(s => s.name.toLowerCase().includes(subjectSearch.toLowerCase())).map(subject => {
                          const isSelected = selectedSubjectIds.has(subject.id);
                          return (
                            <SelectItem key={subject.id} value={subject.id} disabled={isSelected} className={isSelected ? 'opacity-50 cursor-not-allowed' : ''}>
                              {subject.name} (Y{subject.year} • {subject.hoursPerWeek}h)
                              {isSelected && ' ✓'}
                            </SelectItem>
                          );
                        })}
                        {editSubjects.filter(s => s.type === 'lab').length === 0 && (
                          <div className="p-2 text-sm text-muted-foreground">No lab subjects found</div>
                        )}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>

              {/* Class Counselor (CC) */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Class Counselor (CC)</div>
                  <Button size="sm" variant={isCC ? 'default' : 'outline'} onClick={() => setIsCC(!isCC)} className="h-7 text-xs">
                    {isCC ? 'ON' : 'OFF'}
                  </Button>
                </div>
                {isCC && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Year</div>
                  <Select value={ccYear} onValueChange={setCcYear}>
                        <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
                    <SelectContent>
                          <SelectItem value="I">I</SelectItem>
                          <SelectItem value="II">II</SelectItem>
                          <SelectItem value="III">III</SelectItem>
                          <SelectItem value="IV">IV</SelectItem>
                    </SelectContent>
                  </Select>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Section</div>
                  <Select value={ccSection} onValueChange={setCcSection}>
                        <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                    <SelectContent>
                          <SelectItem value="A">A</SelectItem>
                          <SelectItem value="B">B</SelectItem>
                          <SelectItem value="C">C</SelectItem>
                          <SelectItem value="D">D</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                  </div>
                )}
              </div>

              {/* Takes Electives */}
              <div className="mb-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Takes Electives</div>
                  <Button size="sm" variant={takesElectives ? 'default' : 'outline'} onClick={() => setTakesElectives(!takesElectives)} className="h-7 text-xs">
                    {takesElectives ? 'ON' : 'OFF'}
                  </Button>
              </div>
                {takesElectives && (
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Department</div>
                      <Select value={electiveDeptId} onValueChange={setElectiveDeptId}>
                        <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                        <SelectContent>
                          {departments.map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Year</div>
                      <Select value={electiveYear} onValueChange={setElectiveYear}>
                        <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="I">I</SelectItem>
                          <SelectItem value="II">II</SelectItem>
                          <SelectItem value="III">III</SelectItem>
                          <SelectItem value="IV">IV</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Section</div>
                      <Select value={electiveSection} onValueChange={setElectiveSection}>
                        <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A">A</SelectItem>
                          <SelectItem value="B">B</SelectItem>
                          <SelectItem value="C">C</SelectItem>
                          <SelectItem value="D">D</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Selected subjects summary */}
            {selectedSubjectIds.size > 0 && (
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-muted-foreground">Selected subjects ({selectedSubjectIds.size}):</div>
                  <Button size="sm" variant="outline" onClick={() => setSelectedSubjectIds(new Set())} className="h-7 text-xs">Clear All</Button>
                </div>
                <div className="space-y-2">
                  {Array.from(selectedSubjectIds).map(subjectId => {
                    const subject = editSubjects.find(s => s.id === subjectId);
                    return subject ? (
                      <div key={subjectId} className="flex items-center justify-between bg-muted px-3 py-2 rounded-md">
                        <span className="text-sm">
                          {subject.name}
                          <span className="text-xs text-muted-foreground ml-2">(Y{subject.year} • {subject.type} • {subject.hoursPerWeek}h)</span>
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => setSelectedSubjectIds(prev => { const next = new Set(prev); next.delete(subjectId); return next; })} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">×</Button>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center gap-2 justify-end">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateFaculty}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default FacultyPage;


