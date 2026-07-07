import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/navbar/Navbar";
import AdminNavbar from "@/components/navbar/AdminNavbar";
import SelectionHeader from "@/components/admin/SelectionHeader";
import UploadCSV from "@/components/UploadCSV";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomTable, FilterConfig } from "@/components/ui/CustomTable";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getDepartments, createFaculty, deleteFaculty, deleteFacultyBulk, getFacultyByDepartment, getFacultyDetails, saveFacultyElectiveInfo, updateFaculty, listFacultySubjectClass, deleteFacultySubjectClass, upsertFacultySubjectClassAll, upsertClassCounselor, deactivateClassCounselor } from "@/lib/supabaseService";
import Papa from "papaparse";
import { Upload, FileText, AlertTriangle, CheckCircle, X, LayoutGrid, List, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

type Department = { id: string; name: string };
type FacultyItem = { id: string; name: string; email?: string | null; designation?: string | null; departmentId: string; takesElectives?: boolean };
type Subject = { id: string; name: string; year: string; type: string; hoursPerWeek: number; code?: string; abbreviation?: string; departmentId: string; maxFacultyCount?: number };
type FacultySubjectClass = { id?: string; departmentId: string; facultyId: string; subjectId: string; year: string; section: string };
type SubjectSection = { subjectId: string; sections: string[] };
type FacultyElective = { id?: string; facultyId: string; departmentId: string; subjectId?: string | null; year: string; section: string };

const FacultyPage = () => {
  const navigate = useNavigate();
  const isLoggedIn = useMemo(() => {
    const superAdmin = localStorage.getItem("superAdmin") === "true";
    const adminUser = localStorage.getItem("adminUser");
    return superAdmin || !!adminUser;
  }, []);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptFilterId, setDeptFilterId] = useState<string>("ALL");
  const [faculty, setFaculty] = useState<FacultyItem[]>([]);
  const [facultyYears, setFacultyYears] = useState<Record<string, string[]>>({});
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [adminDeptId, setAdminDeptId] = useState<string>("");


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
  const [subjectYearFilter, setSubjectYearFilter] = useState<string>("ALL");
  
  // Subject-section mappings
  const [subjectSections, setSubjectSections] = useState<Map<string, string[]>>(new Map());
  const [occupiedAssignments, setOccupiedAssignments] = useState<Map<string, string>>(new Map());
  
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

  // CSV Upload state
  const [uploadOpen, setUploadOpen] = useState<boolean>(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [parsedData, setParsedData] = useState<any[]>([]);



  useEffect(() => {
    document.title = "Faculty - Super Admin";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Manage faculty list and basic details");
  }, []);

  useEffect(() => {
    if (!isLoggedIn) { 
      // Check if trying to access as super admin but not logged in, or admin not logged in
      const superAdmin = localStorage.getItem("superAdmin") === "true";
      const adminUser = localStorage.getItem("adminUser");
      
      if (!superAdmin && !adminUser) {
        navigate('/super-admin-login', { replace: true }); 
        return; 
      }
    }

    // Check if current user is Admin
    const adminData = localStorage.getItem("adminUser");
    if (adminData) {
      try {
        const parsed = JSON.parse(adminData);
        if (parsed && parsed.department_id) {
          setIsAdmin(true);
          setAdminDeptId(parsed.department_id);
          setDeptFilterId(parsed.department_id); // Force filter to admin's department
        }
      } catch (e) {
        console.error("Error parsing admin data", e);
      }
    }

    (async () => {
      const data = await getDepartments();
        setDepartments(data || []);
      // default to All departments in view ONLY if not admin
      if (!adminData && !deptFilterId) setDeptFilterId("ALL");
    })();

    // Listen for import completion to refresh list
    const onImported = async (_e: any) => {
      // Re-trigger the current department filter to reload data
      const currentDeptFilter = isAdmin && adminDeptId ? adminDeptId : deptFilterId;

      if (currentDeptFilter === "ALL") {
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
          })) as any[];
          setFaculty(list);
          await loadFacultyYears(list.map(f => f.id));
        }
      } else if (currentDeptFilter) {
        const list = await getFacultyByDepartment(currentDeptFilter);
        setFaculty(list);
        await loadFacultyYears(list.map(f => f.id));
      }
    };
    window.addEventListener('faculty-import:inserted', onImported as any);
    return () => window.removeEventListener('faculty-import:inserted', onImported as any);
  }, [isLoggedIn, isAdmin, adminDeptId]);

  const loadFaculty = async () => {
    // If admin, ignore "ALL" and force department
    const effectiveFilter = isAdmin ? adminDeptId : deptFilterId;

    if (effectiveFilter === "ALL") {
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
        
        // Load faculty year mappings
        await loadFacultyYears(list.map(f => f.id));
      }
    } else if (effectiveFilter) {
      const list = await getFacultyByDepartment(effectiveFilter);
      setFaculty(list);
      
      // Load faculty year mappings
      await loadFacultyYears(list.map(f => f.id));
    }
  };

  useEffect(() => {
    loadFaculty();
  }, [deptFilterId, isAdmin, adminDeptId]);

  const loadFacultyYears = async (facultyIds: string[]) => {
    try {
      const { data: assignments, error } = await (supabase as any)
        .from('faculty_subject_assignments')
        .select('faculty_id, year')
        .in('faculty_id', facultyIds);
      
      if (!error && assignments) {
        const yearMap: Record<string, string[]> = {};
        assignments.forEach((assignment: any) => {
          if (!yearMap[assignment.faculty_id]) {
            yearMap[assignment.faculty_id] = [];
          }
          if (!yearMap[assignment.faculty_id].includes(assignment.year)) {
            yearMap[assignment.faculty_id].push(assignment.year);
          }
        });
        setFacultyYears(yearMap);
      }
    } catch (error) {
      console.error('Failed to load faculty years:', error);
    }
  };

  // Load subjects when form department changes
  useEffect(() => {
    if (!formDeptId) {
      setSubjects([]);
      setSelectedSubjectIds(new Set());
      setSubjectSections(new Map());
      setOccupiedAssignments(new Map());
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
          maxFacultyCount: s.max_faculty_count || 1,
        }));
        
        setSubjects(subjectsList);
        setSelectedSubjectIds(new Set()); // Reset selections when department changes
        setSubjectSections(new Map());
        
        // Load existing assignments to check for conflicts
        await loadExistingAssignments(formDeptId);
      } catch (error) {
        console.error('Failed to load subjects:', error);
        setSubjects([]);
      }
    })();
  }, [formDeptId]);

  // Load existing faculty assignments to check for conflicts
  const loadExistingAssignments = async (departmentId: string) => {
    try {
      const { data, error } = await (supabase as any)
        .from('faculty_subject_assignments')
        .select('subject_id, section, year, faculty_id, faculty_members!inner(name)')
        .eq('department_id', departmentId);
      
      if (!error && data) {
        const occupied = new Map<string, string>();
        data.forEach((assignment: any) => {
          if (assignment.section) {
            const key = `${assignment.subject_id}-${assignment.year}-${assignment.section}`;
            const existing = occupied.get(key);
            if (existing) {
              // If multiple faculty, show "Multiple Faculty"
              occupied.set(key, "Multiple Faculty");
            } else {
              occupied.set(key, assignment.faculty_members.name);
            }
          }
        });
        setOccupiedAssignments(occupied);
      }
    } catch (error) {
      console.error('Failed to load existing assignments:', error);
    }
  };

  // Handle section selection for a subject
  const handleSectionToggle = (subjectId: string, section: string) => {
    setSubjectSections(prev => {
      const newMap = new Map(prev);
      const currentSections = newMap.get(subjectId) || [];
      
      if (currentSections.includes(section)) {
        // Remove section
        const updated = currentSections.filter(s => s !== section);
        if (updated.length === 0) {
          newMap.delete(subjectId);
        } else {
          newMap.set(subjectId, updated);
        }
      } else {
        // Add section
        newMap.set(subjectId, [...currentSections, section]);
      }
      
      return newMap;
    });
  };

  // Check if a subject-section combination can accept more faculty
  const canAcceptFaculty = (subjectId: string, year: string, section: string): { canAccept: boolean; reason?: string; currentCount: number; maxCount: number } => {
    const key = `${subjectId}-${year}-${section}`;
    const facultyName = occupiedAssignments.get(key);
    
    // Find the subject to get max faculty count
    const subject = subjects.find(s => s.id === subjectId) || editSubjects.find(s => s.id === subjectId);
    const maxFacultyCount = subject?.maxFacultyCount || 1;
    
    if (!facultyName) {
      return { canAccept: true, currentCount: 0, maxCount: maxFacultyCount };
    }
    
    if (facultyName === "Multiple Faculty") {
      // Count actual faculty assignments for this subject-section
      const currentCount = Array.from(occupiedAssignments.entries())
        .filter(([k, _]) => k === key)
        .length;
      
      if (currentCount >= maxFacultyCount) {
        return { canAccept: false, reason: "Maximum faculty reached", currentCount, maxCount: maxFacultyCount };
      }
      
      return { canAccept: true, currentCount, maxCount: maxFacultyCount };
    }
    
    // Single faculty assigned
    if (maxFacultyCount > 1) {
      return { canAccept: true, currentCount: 1, maxCount: maxFacultyCount };
    }
    
    return { canAccept: false, reason: "Single faculty only", currentCount: 1, maxCount: maxFacultyCount };
  };

  // Check if a subject-section combination is occupied (for backward compatibility)
  const isAssignmentOccupied = (subjectId: string, year: string, section: string): { occupied: boolean; facultyName?: string } => {
    const canAccept = canAcceptFaculty(subjectId, year, section);
    return { 
      occupied: !canAccept.canAccept, 
      facultyName: canAccept.reason || "Occupied" 
    };
  };

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
          maxFacultyCount: s.max_faculty_count || 1,
        }));
        setEditSubjects(list);
        
        // Load existing assignments for conflict detection
        await loadExistingAssignments(editDeptId);
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
    setSubjectYearFilter("ALL");
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
    setSubjectSections(new Map());
    setOccupiedAssignments(new Map());
    setAddOpen(false);
  };

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Enter name'); return; }
    try {
      const deptForCreate = formDeptId || (deptFilterId !== 'ALL' ? deptFilterId : departments[0]?.id);
      if (!deptForCreate) { toast.error('Select department'); return; }
      const f = await createFaculty({ departmentId: deptForCreate, name: name.trim(), email: email.trim() || null, designation: designation.trim() || null, takesElectives });
      setFaculty((list) => [...list, f]);
      
      // Assign selected subjects to the faculty with their sections
      if (selectedSubjectIds.size > 0) {
        try {
          const allocations: Array<{ subjectId: string; year: string; section: string }> = [];
          
          // Create allocations for each subject-section combination
          Array.from(selectedSubjectIds).forEach(subjectId => {
            const subject = subjects.find(s => s.id === subjectId);
            const sections = subjectSections.get(subjectId) || [];
            
            if (sections.length > 0) {
              // For subjects with selected sections, create one allocation per section
              sections.forEach(section => {
                allocations.push({
                  subjectId: subjectId,
                  year: subject?.year || 'I',
                  section: section,
                });
              });
            } else {
              // For subjects without sections, use default section 'A'
              allocations.push({
                subjectId: subjectId,
                year: subject?.year || 'I',
                section: 'A',
              });
            }
          });

          if (allocations.length > 0) {
            await upsertFacultySubjectClassAll(deptForCreate, f.id, allocations);
          }
          
          const totalAssignments = allocations.length;
          toast.success(`Faculty created and assigned to ${totalAssignments} subject-section combination(s)`);
        } catch (assignmentError) {
          console.error('Subject assignment failed:', assignmentError);
          toast.success('Faculty created but failed to assign subjects');
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
    setSubjectSections(new Map());
    setIsCC(false); setCcYear(""); setCcSection("");
    setTakesElectives(Boolean(f.takesElectives));
    setElectiveDeptId(""); setElectiveYear(""); setElectiveSection(""); setElectiveSubjects([]);
    
    // Load existing assignments to check for conflicts
    await loadExistingAssignments(f.departmentId);
    
    try {
      const details = await getFacultyDetails(f.id);
      const subjIds = new Set<string>((details.subjects || []).map(s => s.subjectId));
      setSelectedSubjectIds(subjIds);
      
      // Build subject-section mappings from existing assignments
      const sectionMap = new Map<string, string[]>();
      details.subjects?.forEach(assignment => {
        if (assignment.section) {
          const existing = sectionMap.get(assignment.subjectId) || [];
          if (!existing.includes(assignment.section)) {
            existing.push(assignment.section);
            sectionMap.set(assignment.subjectId, existing);
          }
        }
      });
      setSubjectSections(sectionMap);
      
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
      // Replace subject mappings with section support
      try {
        // Clear existing assignments
        await (supabase as any)
          .from('faculty_subject_assignments')
          .delete()
          .eq('faculty_id', editingId)
          .eq('department_id', editDeptId);
          
        if (selectedSubjectIds.size > 0) {
          const allocations: Array<{ subjectId: string; year: string; section: string }> = [];
          
          // Create allocations for each subject-section combination
          Array.from(selectedSubjectIds).forEach(subjectId => {
            const subject = editSubjects.find(s => s.id === subjectId);
            const sections = subjectSections.get(subjectId) || [];
            
            if (sections.length > 0) {
              // For subjects with selected sections, create one allocation per section
              sections.forEach(section => {
                allocations.push({
                  subjectId: subjectId,
                  year: subject?.year || 'I',
                  section: section,
                });
              });
            } else {
              // For subjects without sections, use default section 'A'
              allocations.push({
                subjectId: subjectId,
                year: subject?.year || 'I',
                section: 'A',
              });
            }
          });

          if (allocations.length > 0) {
            await upsertFacultySubjectClassAll(editDeptId, editingId, allocations);
          }
        }
      } catch (assignErr: any) {
        console.error('Subject assignment failed:', assignErr);
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


  // CSV Upload functions
  const handleFileUpload = (file: File) => {
    setCsvFile(file);
    setUploading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const data = results.data as any[];
        setParsedData(data);

        // Check for duplicates based on email
        const { data: existingFaculty } = await supabase
          .from('faculty_members')
          .select('email');

        const existingEmails = new Set(existingFaculty?.map((f: any) => f.email) || []);
        const duplicatesFound = data.filter((row) => existingEmails.has(row.email));

        if (duplicatesFound.length > 0) {
          setDuplicates(duplicatesFound);
          toast.warning(`${duplicatesFound.length} duplicates found`);
        } else {
          await processFacultyData(data);
        }

        setUploading(false);
      },
      error: (error) => {
        toast.error("Error parsing CSV: " + error.message);
        setUploading(false);
      }
    });
  };

  const processFacultyData = async (data: any[]) => {
    try {
      // Get all departments to map names to IDs
      const { data: departments } = await supabase
        .from('departments')
        .select('id, name');

      const departmentMap = new Map();
      departments?.forEach(dept => {
        departmentMap.set(dept.name.toLowerCase(), dept.id);
      });

      // Process faculty data with proper department mapping
      const facultyData = [];
      const invalidDepartments = new Set();

      for (const row of data) {
        const departmentName = row.department_id || row.departmentId || row.department || row.Department || '';
        const departmentId = departmentMap.get(departmentName.toLowerCase());
        
        if (!departmentId) {
          invalidDepartments.add(departmentName);
          continue; // Skip this faculty member
        }

        // Admin restriction check
        if (isAdmin && adminDeptId && departmentId !== adminDeptId) {
          toast.error(`You can only import faculty for your department. Skipped ${row.name || 'row'}.`);
          continue;
        }

        facultyData.push({
          name: row.name || row.Name || '',
          email: row.email || row.Email || '',
          designation: row.designation || row.Designation || row.role || row.Role || '',
          department_id: departmentId,
          takes_electives: row.takes_electives || row.takesElectives || row.electives || row.Electives || false
        });
      }

      if (invalidDepartments.size > 0) {
        toast.warning(`Invalid departments found: ${Array.from(invalidDepartments).join(', ')}. These faculty members will be skipped.`);
      }

      if (facultyData.length === 0) {
        toast.error("No valid faculty data to insert");
        return;
      }

      // Insert faculty members
      const { error } = await supabase
        .from('faculty_members')
        .insert(facultyData);

      if (error) {
        toast.error("Error inserting faculty: " + error.message);
        return;
      }

      // Process year assignments if provided
      for (const row of data) {
        if (row.year || row.Year || row.assigned_year || row.assignedYear) {
          const year = row.year || row.Year || row.assigned_year || row.assignedYear;
          const sections = (row.sections || row.Sections || row.section || row.Section || '').split(',').map((s: string) => s.trim()).filter(Boolean);
          
          if (sections.length > 0) {
            // Get the faculty member ID
            const { data: facultyMember } = await supabase
              .from('faculty_members')
              .select('id')
              .eq('email', row.email || row.Email)
              .single();

            if (facultyMember) {
              // Create year assignments for each section
              for (const section of sections) {
                // This would need to be implemented based on your year assignment logic
                // For now, we'll just log it
                console.log(`Assigning faculty ${facultyMember.id} to year ${year}, section ${section}`);
              }
            }
          }
        }
      }

      toast.success(`Successfully uploaded ${data.length} faculty members`);
      setUploadOpen(false);
      setCsvFile(null);
      setParsedData([]);
      
      // Refresh faculty list
      await loadFaculty();
    } catch (error: any) {
      toast.error("Error processing faculty data: " + error.message);
    }
  };

  const handleDuplicateApproval = async () => {
    const renamed = duplicates.map((d) => ({
      ...d,
      email: `${d.email.split("@")[0]}_copy@${d.email.split("@")[1]}`,
    }));
    await processFacultyData(renamed);
    setDuplicates([]);
  };

  const FacultyTable = CustomTable<FacultyItem>;

  const filtersConfig = useMemo<FilterConfig[]>(() => {
    const configs: FilterConfig[] = [
      {
        key: "year",
        label: "Year",
        options: [
          { label: "Year I", value: "I" },
          { label: "Year II", value: "II" },
          { label: "Year III", value: "III" },
          { label: "Year IV", value: "IV" }
        ],
        match: (item: FacultyItem, value: string) => {
          const teachingYears = facultyYears[item.id] || [];
          return teachingYears.includes(value);
        }
      }
    ];

    if (!isAdmin) {
      configs.push({
        key: "departmentId",
        label: "Department",
        options: departments.map((d) => ({
          label: d.name,
          value: d.id
        }))
      });
    }

    return configs;
  }, [facultyYears, isAdmin, departments]);

  return (
    <main className="min-h-screen bg-background">
      {isAdmin ? <AdminNavbar /> : <Navbar />}
      <div className={`md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80 transition-all duration-300 pt-16 ${
        isAdmin ? "md:pt-0" : "md:pt-14"
      }`}>
        <SelectionHeader />
        <section className="container py-4">

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
          <CardHeader className="flex flex-row items-center justify-between pb-2 flex-wrap gap-2">
            <CardTitle className="text-base">Faculty list</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setUploadOpen(true)}
                className="flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                Upload CSV
              </Button>
              <Button onClick={() => { setAddOpen(true); }}>Add Faculty</Button>
            </div>
          </CardHeader>
          <CardContent>
            <FacultyTable
              data={faculty}
              getRowId={(row) => row.id}
              searchKey={(row) => `${row.name} ${row.email || ""}`}
              searchPlaceholder="Search faculty members by name or email..."
              exportFileName="faculty-list"
              filters={filtersConfig}
              onDeleteSelected={async (ids) => {
                try {
                  await deleteFacultyBulk(ids);
                  toast.success(`Successfully deleted ${ids.length} faculty member(s)`);
                  await loadFaculty();
                } catch (e: any) {
                  toast.error("Error deleting faculty: " + e.message);
                }
              }}
              columns={[
                {
                  key: "name",
                  header: "Name",
                  sortable: true,
                  render: (row) => <span className="font-semibold text-slate-900 dark:text-slate-100">{row.name}</span>
                },
                {
                  key: "email",
                  header: "Email",
                  sortable: true,
                  render: (row) => <span className="text-slate-600 dark:text-slate-400 font-mono text-sm">{row.email || '-'}</span>
                },
                {
                  key: "designation",
                  header: "Designation",
                  sortable: true,
                  render: (row) => <span className="text-slate-700 dark:text-slate-300 text-sm">{row.designation || '-'}</span>
                },
                {
                  key: "actions",
                  header: "Actions",
                  render: (row) => (
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(row);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFacultyClick(row);
                        }}
                      >
                        View
                      </Button>
                    </div>
                  )
                }
              ]}
              renderItemCard={(row, isSelected, onToggleSelect) => (
                <div
                  key={row.id}
                  onClick={onToggleSelect}
                  className={`p-5 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col justify-between h-full bg-card ${
                    isSelected
                      ? "border-emerald-500 shadow-md bg-muted/30 text-foreground"
                      : "border-border hover:border-muted-foreground/35 hover:bg-muted/10 text-foreground shadow-sm"
                  }`}
                >
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-tight">{row.name}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{row.designation || 'No designation'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-mono">{row.email || 'No email'}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{departments.find(d => d.id === row.departmentId)?.name || 'Unknown Dept'}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelect()}
                      onClick={(e) => e.stopPropagation()}
                      className="border-border bg-background data-[state=checked]:bg-emerald-500"
                    />
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => openEdit(row)}
                        className="h-7 px-2.5 rounded-lg text-[10px] font-medium transition-colors bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleFacultyClick(row)}
                        className="h-7 px-2.5 rounded-lg text-[10px] font-medium transition-colors bg-secondary/60 text-secondary-foreground hover:bg-secondary/70"
                      >
                        View
                      </button>
                    </div>
                  </div>
                </div>
              )}
            />
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
                <Select value={formDeptId} onValueChange={setFormDeptId} disabled={isAdmin}>
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
                            <div className="p-2 border-b">
                              <div className="text-xs text-muted-foreground mb-1">Filter by year</div>
                              <div className="flex flex-wrap gap-1">
                                {(["ALL","I","II","III","IV"] as const).map((y) => (
                                  <Button
                                    key={y}
                                    size="sm"
                                    variant={subjectYearFilter === y ? "default" : "outline"}
                                    className="h-7 text-xs"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSubjectYearFilter(y); }}
                                  >
                                    {y === "ALL" ? "All" : y}
                                  </Button>
                                ))}
                              </div>
                            </div>
                            <div className="p-2">
                              <Input
                                placeholder="Search theory subjects..."
                                value={subjectSearch}
                                onChange={(e) => setSubjectSearch(e.target.value)}
                                className="mb-2"
                              />
                            </div>
                            <div className="max-h-64 overflow-y-auto pr-1">
                              {subjects
                                .filter(s => s.type === 'theory')
                                .filter(s => subjectYearFilter === 'ALL' || s.year === subjectYearFilter)
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
                              {subjects
                                .filter(s => s.type === 'theory')
                                .filter(s => subjectYearFilter === 'ALL' || s.year === subjectYearFilter)
                                .filter(s => s.name.toLowerCase().includes(subjectSearch.toLowerCase())).length === 0 && (
                                <div className="p-2 text-sm text-muted-foreground">
                                  No theory subjects found
                                </div>
                              )}
                            </div>
                          </SelectContent>
                        </Select>

                        {/* Section Selection for Theory Subjects */}
                        {Array.from(selectedSubjectIds).filter(id => 
                          subjects.find(s => s.id === id)?.type === 'theory'
                        ).length > 0 && (
                          <div className="mt-4 space-y-3">
                            <div className="text-sm font-medium">Section Selection for Theory Subjects</div>
                            {Array.from(selectedSubjectIds)
                              .filter(id => subjects.find(s => s.id === id)?.type === 'theory')
                              .map(subjectId => {
                                const subject = subjects.find(s => s.id === subjectId);
                                const selectedSections = subjectSections.get(subjectId) || [];
                                
                                return (
                                  <div key={subjectId} className="border rounded-md p-3">
                                    <div className="text-sm font-medium mb-2">
                                      {subject?.name} (Year {subject?.year})
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                      {['A', 'B', 'C', 'D'].map(section => {
                                        const { occupied, facultyName } = isAssignmentOccupied(subjectId, subject?.year || '', section);
                                        const isSelected = selectedSections.includes(section);
                                        
                                        return (
                                          <Button
                                            key={section}
                                            size="sm"
                                            variant={isSelected ? "default" : "outline"}
                                            disabled={occupied}
                                            onClick={() => handleSectionToggle(subjectId, section)}
                                            className={`h-8 text-xs ${occupied ? 'opacity-50 cursor-not-allowed' : ''}`}
                                          >
                                            <div className="text-center">
                                              <div>Section {section}</div>
                                              {occupied && (
                                                <div className="text-xs text-destructive">
                                                  Occupied by {facultyName}
                                                </div>
                                              )}
                                            </div>
                                          </Button>
                                        );
                                      })}
                                    </div>
                                    {selectedSections.length > 0 && (
                                      <div className="text-xs text-muted-foreground mt-2">
                                        Selected sections: {selectedSections.join(', ')}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        )}
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
                            <div className="p-2 border-b">
                              <div className="text-xs text-muted-foreground mb-1">Filter by year</div>
                              <div className="flex flex-wrap gap-1">
                                {(["ALL","I","II","III","IV"] as const).map((y) => (
                                  <Button
                                    key={y}
                                    size="sm"
                                    variant={subjectYearFilter === y ? "default" : "outline"}
                                    className="h-7 text-xs"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSubjectYearFilter(y); }}
                                  >
                                    {y === "ALL" ? "All" : y}
                                  </Button>
                                ))}
                              </div>
                            </div>
                            <div className="p-2">
                              <Input
                                placeholder="Search lab subjects..."
                                value={subjectSearch}
                                onChange={(e) => setSubjectSearch(e.target.value)}
                                className="mb-2"
                              />
                            </div>
                            <div className="max-h-64 overflow-y-auto pr-1">
                              {subjects
                                .filter(s => s.type === 'lab')
                                .filter(s => subjectYearFilter === 'ALL' || s.year === subjectYearFilter)
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
                              {subjects
                                .filter(s => s.type === 'lab')
                                .filter(s => subjectYearFilter === 'ALL' || s.year === subjectYearFilter)
                                .filter(s => s.name.toLowerCase().includes(subjectSearch.toLowerCase())).length === 0 && (
                                <div className="p-2 text-sm text-muted-foreground">
                                  No lab subjects found
                                </div>
                              )}
                            </div>
                          </SelectContent>
                        </Select>

                        {/* Section Selection for Lab Subjects */}
                        {Array.from(selectedSubjectIds).filter(id => 
                          subjects.find(s => s.id === id)?.type === 'lab'
                        ).length > 0 && (
                          <div className="mt-4 space-y-3">
                            <div className="text-sm font-medium">Section Selection for Lab Subjects</div>
                            {Array.from(selectedSubjectIds)
                              .filter(id => subjects.find(s => s.id === id)?.type === 'lab')
                              .map(subjectId => {
                                const subject = subjects.find(s => s.id === subjectId);
                                const selectedSections = subjectSections.get(subjectId) || [];
                                
                                return (
                                  <div key={subjectId} className="border rounded-md p-3">
                                    <div className="text-sm font-medium mb-2">
                                      {subject?.name} (Year {subject?.year})
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                      {['A', 'B', 'C', 'D'].map(section => {
                                        const { occupied, facultyName } = isAssignmentOccupied(subjectId, subject?.year || '', section);
                                        const isSelected = selectedSections.includes(section);
                                        
                                        return (
                                          <Button
                                            key={section}
                                            size="sm"
                                            variant={isSelected ? "default" : "outline"}
                                            disabled={occupied}
                                            onClick={() => handleSectionToggle(subjectId, section)}
                                            className={`h-8 text-xs ${occupied ? 'opacity-50 cursor-not-allowed' : ''}`}
                                          >
                                            <div className="text-center">
                                              <div>Section {section}</div>
                                              {occupied && (
                                                <div className="text-xs text-destructive">
                                                  Occupied by {facultyName}
                                                </div>
                                              )}
                                            </div>
                                          </Button>
                                        );
                                      })}
                                    </div>
                                    {selectedSections.length > 0 && (
                                      <div className="text-xs text-muted-foreground mt-2">
                                        Selected sections: {selectedSections.join(', ')}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        )}
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
                      onClick={() => {
                        setSelectedSubjectIds(new Set());
                        setSubjectSections(new Map());
                      }}
                      className="h-7 text-xs"
                    >
                      Clear All
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {Array.from(selectedSubjectIds).map(subjectId => {
                      const subject = subjects.find(s => s.id === subjectId);
                      const sections = subjectSections.get(subjectId) || [];
                      return subject ? (
                        <div key={subjectId} className="bg-muted px-3 py-2 rounded-md">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">
                              {subject.name} 
                              <span className="text-xs text-muted-foreground ml-2">
                                (Y{subject.year} • {subject.type} • {subject.hoursPerWeek}h)
                              </span>
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedSubjectIds(prev => {
                                  const next = new Set(prev);
                                  next.delete(subjectId);
                                  return next;
                                });
                                setSubjectSections(prev => {
                                  const next = new Map(prev);
                                  next.delete(subjectId);
                                  return next;
                                });
                              }}
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            >
                              ×
                            </Button>
                          </div>
                          {(subject.type === 'theory' || subject.type === 'lab') && sections.length > 0 && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Sections: {sections.join(', ')}
                            </div>
                          )}
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
      </div>

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
              <Select value={editDeptId} onValueChange={setEditDeptId} disabled={isAdmin}>
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
                       <div className="mb-2">
                 <div className="text-xs text-muted-foreground mb-1">Filter by year</div>
                 <Select value={subjectYearFilter} onValueChange={setSubjectYearFilter}>
                   <SelectTrigger><SelectValue placeholder="All years" /></SelectTrigger>
                   <SelectContent>
                     <SelectItem value="ALL">All years</SelectItem>
                     <SelectItem value="I">I</SelectItem>
                     <SelectItem value="II">II</SelectItem>
                     <SelectItem value="III">III</SelectItem>
                     <SelectItem value="IV">IV</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
                 
                         <div className="p-2">
                           <Input placeholder="Search theory subjects..." value={subjectSearch} onChange={(e) => setSubjectSearch(e.target.value)} className="mb-2" />
                         </div>
                         <div className="max-h-64 overflow-y-auto pr-1">
                           {editSubjects.filter(s => s.type === 'theory').filter(s => subjectYearFilter === 'ALL' || s.year === subjectYearFilter).filter(s => s.name.toLowerCase().includes(subjectSearch.toLowerCase())).map(subject => {
                             const isSelected = selectedSubjectIds.has(subject.id);
                             return (
                               <SelectItem key={subject.id} value={subject.id} disabled={isSelected} className={isSelected ? 'opacity-50 cursor-not-allowed' : ''}>
                                 {subject.name} (Y{subject.year} • {subject.hoursPerWeek}h)
                                 {isSelected && ' ✓'}
                               </SelectItem>
                             );
                           })}
                           {editSubjects.filter(s => s.type === 'theory').filter(s => subjectYearFilter === 'ALL' || s.year === subjectYearFilter).filter(s => s.name.toLowerCase().includes(subjectSearch.toLowerCase())).length === 0 && (
                             <div className="p-2 text-sm text-muted-foreground">No theory subjects found</div>
                           )}
                         </div>
                       </SelectContent>
                     </Select>

                     {/* Section Selection for Theory Subjects in Edit Mode */}
                     {Array.from(selectedSubjectIds).filter(id => 
                       editSubjects.find(s => s.id === id)?.type === 'theory'
                     ).length > 0 && (
                       <div className="mt-4 space-y-3">
                         <div className="text-sm font-medium">Section Selection for Theory Subjects</div>
                         {Array.from(selectedSubjectIds)
                           .filter(id => editSubjects.find(s => s.id === id)?.type === 'theory')
                           .map(subjectId => {
                             const subject = editSubjects.find(s => s.id === subjectId);
                             const selectedSections = subjectSections.get(subjectId) || [];
                             
                             return (
                               <div key={subjectId} className="border rounded-md p-3">
                                 <div className="text-sm font-medium mb-2">
                                   {subject?.name} (Year {subject?.year})
                                 </div>
                                 <div className="grid grid-cols-4 gap-2">
                                   {['A', 'B', 'C', 'D'].map(section => {
                                     const { occupied, facultyName } = isAssignmentOccupied(subjectId, subject?.year || '', section);
                                     const isSelected = selectedSections.includes(section);
                                     
                                     return (
                                       <Button
                                         key={section}
                                         size="sm"
                                         variant={isSelected ? "default" : "outline"}
                                         disabled={occupied && !isSelected}
                                         onClick={() => handleSectionToggle(subjectId, section)}
                                         className={`h-8 text-xs ${occupied && !isSelected ? 'opacity-50 cursor-not-allowed' : ''}`}
                                       >
                                         <div className="text-center">
                                           <div>Section {section}</div>
                                           {occupied && !isSelected && (
                                             <div className="text-xs text-destructive">
                                               Occupied by {facultyName}
                                             </div>
                                           )}
                                         </div>
                                       </Button>
                                     );
                                   })}
                                 </div>
                                 {selectedSections.length > 0 && (
                                   <div className="text-xs text-muted-foreground mt-2">
                                     Selected sections: {selectedSections.join(', ')}
                                   </div>
                                 )}
                               </div>
                             );
                           })}
                       </div>
                     )}
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
                        <div className="p-2 border-b">
                          <div className="text-xs text-muted-foreground mb-1">Filter by year</div>
                          <div className="flex flex-wrap gap-1">
                            {(["ALL","I","II","III","IV"] as const).map((y) => (
                              <Button
                                key={y}
                                size="sm"
                                variant={subjectYearFilter === y ? 'default' : 'outline'}
                                className="h-7 text-xs"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSubjectYearFilter(y); }}
                              >
                                {y === 'ALL' ? 'All' : y}
                              </Button>
                            ))}
                          </div>
                        </div>
                        <div className="p-2">
                          <Input placeholder="Search lab subjects..." value={subjectSearch} onChange={(e) => setSubjectSearch(e.target.value)} className="mb-2" />
                        </div>
                        <div className="max-h-64 overflow-y-auto pr-1">
                          {editSubjects.filter(s => s.type === 'lab').filter(s => subjectYearFilter === 'ALL' || s.year === subjectYearFilter).filter(s => s.name.toLowerCase().includes(subjectSearch.toLowerCase())).map(subject => {
                            const isSelected = selectedSubjectIds.has(subject.id);
                            return (
                              <SelectItem key={subject.id} value={subject.id} disabled={isSelected} className={isSelected ? 'opacity-50 cursor-not-allowed' : ''}>
                                {subject.name} (Y{subject.year} • {subject.hoursPerWeek}h)
                                {isSelected && ' ✓'}
                              </SelectItem>
                            );
                          })}
                          {editSubjects.filter(s => s.type === 'lab').filter(s => subjectYearFilter === 'ALL' || s.year === subjectYearFilter).filter(s => s.name.toLowerCase().includes(subjectSearch.toLowerCase())).length === 0 && (
                            <div className="p-2 text-sm text-muted-foreground">No lab subjects found</div>
                          )}
                        </div>
                      </SelectContent>
                                            </Select>

                        {/* Section Selection for Lab Subjects in Edit Mode */}
                        {Array.from(selectedSubjectIds).filter(id => 
                          editSubjects.find(s => s.id === id)?.type === 'lab'
                        ).length > 0 && (
                          <div className="mt-4 space-y-3">
                            <div className="text-sm font-medium">Section Selection for Lab Subjects</div>
                            {Array.from(selectedSubjectIds)
                              .filter(id => editSubjects.find(s => s.id === id)?.type === 'lab')
                              .map(subjectId => {
                                const subject = editSubjects.find(s => s.id === subjectId);
                                const selectedSections = subjectSections.get(subjectId) || [];
                                
                                return (
                                  <div key={subjectId} className="border rounded-md p-3">
                                    <div className="text-sm font-medium mb-2">
                                      {subject?.name} (Year {subject?.year})
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                      {['A', 'B', 'C', 'D'].map(section => {
                                        const { occupied, facultyName } = isAssignmentOccupied(subjectId, subject?.year || '', section);
                                        const isSelected = selectedSections.includes(section);
                                        
                                        return (
                                          <Button
                                            key={section}
                                            size="sm"
                                            variant={isSelected ? "default" : "outline"}
                                            disabled={occupied && !isSelected}
                                            onClick={() => handleSectionToggle(subjectId, section)}
                                            className={`h-8 text-xs ${occupied && !isSelected ? 'opacity-50 cursor-not-allowed' : ''}`}
                                          >
                                            <div className="text-center">
                                              <div>Section {section}</div>
                                              {occupied && !isSelected && (
                                                <div className="text-xs text-destructive">
                                                  Occupied by {facultyName}
                                                </div>
                                              )}
                                            </div>
                                          </Button>
                                        );
                                      })}
                                    </div>
                                    {selectedSections.length > 0 && (
                                      <div className="text-xs text-muted-foreground mt-2">
                                        Selected sections: {selectedSections.join(', ')}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        )}
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

      {/* CSV Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Faculty CSV
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="csv-file">CSV File</Label>
              <Input
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])}
                className="cursor-pointer"
              />
              <p className="text-sm text-muted-foreground">
                Upload a CSV file with columns: name, email, designation, department, year, sections
              </p>
              <div className="text-xs text-muted-foreground mt-2">
                <strong>Available departments:</strong> {departments.map(d => d.name).join(', ')}
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                <strong>Sample CSV format:</strong><br/>
                name,email,designation,department,year,sections<br/>
                John Doe,john@college.edu,Professor,Information Technology,I,"A,B"<br/>
                Jane Smith,jane@college.edu,Assistant Professor,Artificial Intelligence and Data Science,II,"C"
              </div>
            </div>

            {uploading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                Processing CSV...
              </div>
            )}

            {parsedData.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  {parsedData.length} records parsed successfully
                </div>
              </div>
            )}

            {duplicates.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-yellow-600">
                  <AlertTriangle className="h-4 w-4" />
                  {duplicates.length} duplicates found
                </div>
                <div className="max-h-40 overflow-y-auto border rounded-md p-4">
                  <h4 className="font-medium mb-2">Duplicate Entries:</h4>
                  <div className="space-y-1">
                    {duplicates.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{d.name || d.Name}</span>
                        <span className="text-muted-foreground">({d.email || d.Email})</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => setDuplicates([])} variant="ghost">
                    Cancel
                  </Button>
                  <Button onClick={handleDuplicateApproval}>
                    Add with modified names
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default FacultyPage;


