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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Switch as Toggle } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { CustomTable } from "@/components/ui/CustomTable";
import { Users, UserCheck, Plus, BookOpen } from "lucide-react";
import { ensureDepartment, getSubjectsForYear, addSubject as addSubjectDb, addSubjectsBulk, getFacultyByDepartment, getFacultyBySection, assignFacultyToSubjectsYearWide, getSubjectFacultyMap, getDepartmentByName, setOpenElectiveHours, getOpenElectiveHours, getSectionSubjects, saveSectionSubjects, getLabAllocationsForSection } from "@/lib/supabaseService";

import AdminNavbar from "@/components/navbar/AdminNavbar";
import SelectionHeader from "@/components/admin/SelectionHeader";
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
  const [openElectiveMode, setOpenElectiveMode] = useState<'parallel' | 'separate'>('parallel');
  const [electiveMode, setElectiveMode] = useState<'parallel' | 'separate'>('parallel');
  const showOpenElectiveCard = useMemo(() => {
    return isFourthYear || selected.some(s => s.type === 'open elective') || available.some(s => s.type === 'open elective');
  }, [isFourthYear, selected, available]);
  const showElectiveCard = useMemo(() => {
    return selected.some(s => s.type === 'elective') || available.some(s => s.type === 'elective');
  }, [selected, available]);
  const currentOpenElectiveHours = useMemo(() => selected.filter(s => s.type === 'open elective').reduce((a, s) => a + (s.hoursPerWeek || 0), 0), [selected]);
  const [openElectiveHours, setOpenElectiveHoursState] = useState<number>(0);
  const [savingOpenElective, setSavingOpenElective] = useState(false);

  // Memos that depend on state variables (including electiveMode and openElectiveMode)
  const totals = useMemo(() => subjectTotals(selected), [selected]);
  const specialHrs = useMemo(() => specialHours(special), [special]);
  const configuredSpecialHrs = useMemo(() => 
    specialHoursConfigs.reduce((total, config) => total + config.total_hours, 0), 
    [specialHoursConfigs]
  );

  const electiveOccupiedHours = useMemo(() => {
    const electives = selected.filter(s => s.type === 'elective');
    if (electiveMode === 'separate') {
      return electives.reduce((a, s) => a + s.hoursPerWeek, 0);
    }
    const peTagGroups = new Map<string, number>();
    const ungrouped: Subject[] = [];
    for (const s of electives) {
      const peTag = (s.tags || []).find((t) =>
        /^(pe\s*\d+|elective\s*\d+|professional\s*elective\s*\d+)$/i.test(t.trim())
      );
      if (peTag) {
        const key = peTag.trim().toUpperCase();
        peTagGroups.set(key, Math.max(peTagGroups.get(key) || 0, s.hoursPerWeek));
      } else {
        ungrouped.push(s);
      }
    }
    const hoursGroups = new Map<number, number>();
    for (const s of ungrouped) {
      hoursGroups.set(s.hoursPerWeek, s.hoursPerWeek);
    }
    
    let sum = 0;
    for (const h of peTagGroups.values()) sum += h;
    for (const h of hoursGroups.values()) sum += h;
    return sum;
  }, [selected, electiveMode]);

  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStatus, setGenerationStatus] = useState("");

  const totalElectiveSum = useMemo(() => {
    return selected.filter(s => s.type === 'elective').reduce((a, s) => a + s.hoursPerWeek, 0);
  }, [selected]);

  const handleMoveToSelected = async (sid: string) => {
    moveToSelected(sid);
    try {
      const dep = await ensureDepartment(selection.department!);
      const found = available.find(s => s.id === sid);
      if (found) {
        const newSelected = [...selected, found];
        await saveSectionSubjects(dep.id, selection.year!, selection.section!, newSelected.map(s => s.id));
      }
    } catch (e: any) {
      console.error("Failed to sync subject addition to database:", e);
      toast({ title: "Sync failed", description: e?.message || String(e), variant: "destructive" });
    }
  };

  const handleMoveToAvailable = async (sid: string) => {
    moveToAvailable(sid);
    try {
      const dep = await ensureDepartment(selection.department!);
      const newSelected = selected.filter(s => s.id !== sid);
      await saveSectionSubjects(dep.id, selection.year!, selection.section!, newSelected.map(s => s.id));
    } catch (e: any) {
      console.error("Failed to sync subject removal to database:", e);
      toast({ title: "Sync failed", description: e?.message || String(e), variant: "destructive" });
    }
  };

  // Lab allocation map: subjectName → { labName, labCode }
  const [labAllocations, setLabAllocations] = useState<Record<string, { labName: string; labCode: string }>>({});

  // Search and Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterFaculty, setFilterFaculty] = useState<string>("all");


  // Load subjects for current selection from Supabase
  useEffect(() => {
    if (!selection.department || !selection.year || !selection.section) return;
    (async () => {
      try {
        const dep = await ensureDepartment(selection.department!);
        const yearBaseSubjects = await getSubjectsForYear(dep.id, selection.year!);
        const sectionAllocatedIds = await getSectionSubjects(dep.id, selection.year!, selection.section!);

        const AI_DS_NAMES = new Set([
          "Artificial Intelligence and Data Science",
          "AI & DS",
          "Artificial Intelligence & Data Science",
        ]);
        const isAidsYear3 = AI_DS_NAMES.has(selection.department!) && (selection.year === "III" || selection.year === "3");

        let loadedSubjects = yearBaseSubjects;
        if (loadedSubjects.length === 0 && isAidsYear3) {
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
          loadedSubjects = await addSubjectsBulk(base.map((b) => ({ ...b, departmentId: dep.id, year: selection.year! })));
        }

        // Handle initial load or section-specific filter
        const available = loadedSubjects;
        // If we have section-level allocations, use them. Otherwise default to all subjects.
        const selected = sectionAllocatedIds.length > 0 
          ? loadedSubjects.filter(s => sectionAllocatedIds.includes(s.id))
          : loadedSubjects;

        useTimetableStore.setState(state => {
          const datasetKey = (sel: any) => {
            const d = sel.department || "";
            const y = sel.year || "";
            const isAI3 = (d === "Artificial Intelligence and Data Science" || d === "AI & DS" || d === "Artificial Intelligence & Data Science") && (y === "III" || y === "3");
            const s = isAI3 ? "*" : (sel.section || "");
            return [d, y, s].join("|");
          };
          const key = datasetKey(selection);
          return {
            ...state,
            availableSubjects: available,
            selectedSubjects: selected,
            datasets: {
              ...state.datasets,
              [key]: { available, selected, prefs: state.datasets[key]?.prefs || {} }
            }
          };
        });

        setDepartmentId(dep.id);
      } catch (e: any) {
        toast({ title: "Failed to load subjects", description: e?.message || String(e) });
      }
    })();
  }, [selection.department, selection.year, selection.section]);

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

        // Load lab allocations for this section
        const allocations = await getLabAllocationsForSection(selection.year!, selection.section!);
        setLabAllocations(allocations);
      } catch (e: any) {
        console.warn('Failed to load faculty data:', e);
        toast({ title: "Failed to load faculty data", description: e?.message || String(e) });
      }
    })();
  }, [selection.department, selection.year, selection.section, available.length]); // Re-load when subjects change

  // Sync input with current data when selection or subjects change
  useEffect(() => {
    (async () => {
      if (!selection.department || !selection.year) {
        setOpenElectiveHoursState(0);
        setOpenElectiveMode('parallel');
        setElectiveMode('parallel');
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

        // Load open elective mode
        const storedOeMode = localStorage.getItem(`oe_mode:${depId}:${selection.year}`) as 'parallel' | 'separate';
        setOpenElectiveMode(storedOeMode || 'parallel');

        // Load professional elective mode
        const storedPeMode = localStorage.getItem(`pe_mode:${depId}:${selection.year}`) as 'parallel' | 'separate';
        setElectiveMode(storedPeMode || 'parallel');
      } catch (_) {
        setOpenElectiveHoursState(0);
        setOpenElectiveMode('parallel');
        setElectiveMode('parallel');
      }
    })();
  }, [selection.department, selection.year, departmentId]);

  const handleSaveOpenElectiveHours = async () => {
    try {
      if (!selection.year || !selection.department) {
        toast({ title: "Missing selection", description: "Please select department and year." });
        return;
      }
      // For totals, check proposed sum including open/professional elective modes
      const oeContribution = openElectiveMode === 'parallel' ? Number(openElectiveHours) : currentOpenElectiveHours;
      const proposed = (totals.total - totalElectiveSum - currentOpenElectiveHours) + electiveOccupiedHours + oeContribution + configuredSpecialHrs;
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
      
      // Save scheduling mode to localStorage
      localStorage.setItem(`oe_mode:${depId}:${selection.year}`, openElectiveMode);
      
      // Do not alter subjects; open elective hours are now a setting. Still refresh to keep UI consistent
      const subs = await getSubjectsForYear(depId, selection.year);
      seedYearDataset(subs);
      toast({ title: "Saved", description: "Open Elective settings updated." });
    } catch (e: any) {
      toast({ title: "Failed to save", description: e?.message || String(e) });
    } finally {
      setSavingOpenElective(false);
    }
  };

  const handleSaveElectiveMode = async (mode: 'parallel' | 'separate') => {
    try {
      if (!selection.year || !selection.department) return;
      setElectiveMode(mode);
      let depId = departmentId;
      if (!depId) {
        const dep = await ensureDepartment(selection.department);
        depId = dep.id;
        setDepartmentId(depId);
      }
      localStorage.setItem(`pe_mode:${depId}:${selection.year}`, mode);
      
      const subs = await getSubjectsForYear(depId, selection.year);
      seedYearDataset(subs);
      toast({ title: "Saved", description: "Professional Elective settings updated." });
    } catch (e: any) {
      toast({ title: "Failed to save", description: e?.message || String(e) });
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
      handleMoveToSelected(created.id);
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

  const filteredSubjects = useMemo(() => {
    return selected.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           s.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           s.abbreviation?.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Filter by type (special type shows all subjects since special hours appear as separate rows)
      if (filterType !== "all" && filterType !== "special" && s.type !== filterType) return false;
      
      const matchesFaculty = filterFaculty === "all" || 
                            (filterFaculty === "unassigned" && getAssignedFaculty(s.id) === 'Unassigned') ||
                            (availableFaculty.find(f => f.name === getAssignedFaculty(s.id))?.id === filterFaculty);

      return matchesSearch && matchesFaculty;
    });
  }, [selected, searchTerm, filterType, filterFaculty, subjectFacultyMap, availableFaculty]);

  const next = async () => {
    const totalHours = (totals.total - totalElectiveSum) + electiveOccupiedHours + (openElectiveMode === 'parallel' ? openElectiveHours : currentOpenElectiveHours) + configuredSpecialHrs;
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
    
    try {
      // Save section-level assignments before proceeding
      await saveSectionSubjects(departmentId, selection.year, selection.section, selected.map(s => s.id));
      
      // Trigger futuristic progress animation
      setGenerating(true);
      setGenerationProgress(0);
      setGenerationStatus("Parsing curriculum hours...");
      
      const steps = [
        { progress: 10, status: "Parsing curriculum hours..." },
        { progress: 25, status: "Checking faculty availability..." },
        { progress: 45, status: "Grouping parallel professional electives..." },
        { progress: 65, status: "Allocating laboratory rooms..." },
        { progress: 85, status: "Resolving constraints & conflict checks..." },
        { progress: 95, status: "Running scheduling engine optimization..." },
        { progress: 100, status: "Ready!" }
      ];
      
      for (const step of steps) {
        await new Promise(resolve => setTimeout(resolve, 350));
        setGenerationProgress(step.progress);
        setGenerationStatus(step.status);
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
      setGenerating(false);
      navigate("/timetable");
    } catch (e: any) {
      setGenerating(false);
      toast({ title: "Failed to save assignments", description: e?.message || String(e) });
    }
  };

  interface SubjectRow {
    rowType: 'subject' | 'special';
    id: string;
    name: string;
    type: string;
    code: string;
    abbreviation: string;
    credits: number;
    hoursPerWeek: number;
    assignedFacultyName: string;
    assignedFacultyId: string;
    isFullyReady: boolean;
    labAllocName: string;
    labAllocCode: string;
    special_type?: string;
    saturday_hours?: number;
    saturday_periods?: number[];
    weekdays_hours?: number;
    weekdays_periods?: number[];
  }

  const tableData = useMemo<SubjectRow[]>(() => {
    const subRows: SubjectRow[] = selected.map(s => {
      const assignedFaculty = getAssignedFaculty(s.id);
      const isAssigned = assignedFaculty !== 'Unassigned';
      const alloc = s.type === 'lab' ? labAllocations[s.name] : null;
      const isLabAllocated = s.type !== 'lab' || !!alloc;
      const isFullyReady = isAssigned && isLabAllocated;
      const facultyObj = availableFaculty.find(f => f.name === assignedFaculty);

      return {
        rowType: 'subject',
        id: s.id,
        name: s.name,
        type: s.type,
        code: s.code || "",
        abbreviation: s.abbreviation || "",
        credits: s.credits || 3,
        hoursPerWeek: s.hoursPerWeek,
        assignedFacultyName: assignedFaculty,
        assignedFacultyId: facultyObj ? facultyObj.id : (isAssigned ? "assigned-other" : "unassigned"),
        isFullyReady,
        labAllocName: alloc ? alloc.labName : "",
        labAllocCode: alloc ? alloc.labCode : ""
      };
    });

    const specRows: SubjectRow[] = specialHoursConfigs.filter(c => c.is_active).map(c => ({
      rowType: 'special',
      id: `special-${c.id}`,
      name: c.special_type,
      type: 'special',
      code: "",
      abbreviation: "",
      credits: 0,
      hoursPerWeek: c.total_hours,
      assignedFacultyName: "",
      assignedFacultyId: "",
      isFullyReady: true,
      labAllocName: "",
      labAllocCode: "",
      special_type: c.special_type,
      saturday_hours: c.saturday_hours,
      saturday_periods: c.saturday_periods,
      weekdays_hours: c.weekdays_hours,
      weekdays_periods: c.weekdays_periods
    }));

    return [...subRows, ...specRows];
  }, [selected, specialHoursConfigs, subjectFacultyMap, availableFaculty, labAllocations]);

  const facultyFilterOptions = useMemo(() => {
    const list = availableFaculty.map(f => ({ label: f.name, value: f.id }));
    return [
      { label: "Unassigned", value: "unassigned" },
      ...list
    ];
  }, [availableFaculty]);

  const SubjectTable = CustomTable<SubjectRow>;

  return (
    <div className="min-h-screen bg-background">
      <AdminNavbar />
      <main className="md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80 animate-fade-in-up pt-16 md:pt-0">
        <SelectionHeader />
        <section className="container py-4">
        {/* Top row: Summary + Faculty (+ Elective settings cards) */}
        <div className={`grid grid-cols-1 md:grid-cols-2 ${
          (2 + (showElectiveCard ? 1 : 0) + (showOpenElectiveCard ? 1 : 0)) === 4 ? 'lg:grid-cols-4' : 
          (2 + (showElectiveCard ? 1 : 0) + (showOpenElectiveCard ? 1 : 0)) === 3 ? 'lg:grid-cols-3' : 
          'lg:grid-cols-2'
        } gap-6 mb-6 transform-gpu transition-all duration-300`}>
          <Card className="rounded-2xl border-none shadow-lg bg-gradient-to-br from-card to-secondary/30 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold">Summary</CardTitle>
              <CardDescription className="text-xs">Max 42 hours/week</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 pt-0">
              <div className="p-3 rounded-xl bg-background/50 border border-border/50 shadow-sm flex flex-col justify-center">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total</div>
                <div className="text-xl font-bold">{(totals.total - totalElectiveSum) + electiveOccupiedHours + (openElectiveMode === 'parallel' ? openElectiveHours : currentOpenElectiveHours) + configuredSpecialHrs}</div>
              </div>
              <div className="p-3 rounded-xl bg-background/50 border border-border/50 shadow-sm flex flex-col justify-center">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Theory</div>
                <div className="text-xl font-bold">{totals.theory}</div>
              </div>
              <div className="p-3 rounded-xl bg-background/50 border border-border/50 shadow-sm flex flex-col justify-center">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Labs</div>
                <div className="text-xl font-bold">{totals.lab}</div>
              </div>
              <div className="p-3 rounded-xl bg-background/50 border border-border/50 shadow-sm flex flex-col justify-center">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Specials</div>
                <div className="text-xl font-bold">{configuredSpecialHrs}</div>
              </div>
            </CardContent>
          </Card>

          {/* Professional Elective Settings */}
          {showElectiveCard && (
            <Card className="rounded-2xl border-none shadow-lg bg-gradient-to-br from-card to-secondary/30 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-bold">Elective Settings</CardTitle>
                <CardDescription className="text-xs">Configure how electives are scheduled</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="p-3 rounded-xl bg-background/50 border border-border/50 shadow-sm space-y-3">
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Scheduling Mode</Label>
                    <Select value={electiveMode} onValueChange={(v: 'parallel' | 'separate') => handleSaveElectiveMode(v)}>
                      <SelectTrigger className="h-8 bg-background/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="parallel">Same hours (Parallel)</SelectItem>
                        <SelectItem value="separate">Different hours (Separate)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Electives will run at the {electiveMode === 'parallel' ? 'same hours (parallel/grouped)' : 'different hours (separate)'} in the timetable.
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Open Elective Settings */}
          {showOpenElectiveCard && (
            <Card className="rounded-2xl border-none shadow-lg bg-gradient-to-br from-card to-secondary/30 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-bold">Open Elective Settings</CardTitle>
                <CardDescription className="text-xs">Configure how Open Electives are scheduled</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="p-3 rounded-xl bg-background/50 border border-border/50 shadow-sm space-y-3">
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Hours per week</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        min={0}
                        max={42}
                        value={openElectiveHours}
                        onChange={(e) => setOpenElectiveHoursState(parseInt(e.target.value || '0', 10))}
                        className="h-8 w-20 bg-background/50"
                      />
                      <Button size="sm" onClick={handleSaveOpenElectiveHours} disabled={savingOpenElective} className="h-8">
                        {savingOpenElective ? 'Saving…' : 'Save'}
                      </Button>
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Scheduling Mode</Label>
                    <Select value={openElectiveMode} onValueChange={(v: 'parallel' | 'separate') => setOpenElectiveMode(v)}>
                      <SelectTrigger className="h-8 bg-background/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="parallel">Same OE at same hour (Parallel)</SelectItem>
                        <SelectItem value="separate">Different OE at different hour (Separate)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="text-[10px] text-muted-foreground">Configured: {openElectiveHours}h • Subjects: {currentOpenElectiveHours}h</div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Faculty Overview */}
          <Card className="rounded-2xl border-none shadow-lg bg-gradient-to-br from-card to-secondary/30 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg font-bold">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                Faculty
              </CardTitle>
              <CardDescription className="text-xs">Assignment Status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl bg-background/50 border border-border/50 shadow-sm">
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Total</div>
                  <div className="text-lg font-bold">{availableFaculty.length}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-background/50 border border-border/50 shadow-sm">
                  <div className="text-[10px] uppercase font-semibold text-green-600 mb-1">Assigned</div>
                  <div className="text-lg font-bold text-green-600">{Object.keys(subjectFacultyMap).length}</div>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-orange-50/50 border border-orange-100 shadow-sm flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase font-semibold text-orange-600">Unassigned</div>
                  <div className="text-lg font-bold text-orange-600">
                    {available.length - Object.keys(subjectFacultyMap).length}
                  </div>
                </div>
                {availableFaculty.length > 0 && (
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-8 px-2 text-[10px] font-bold uppercase hover:bg-orange-100/50"
                    onClick={() => {
                      available.forEach(subject => {
                        const suggestions = getSuggestedFaculty(subject);
                        if (suggestions.length > 0 && getAssignedFaculty(subject.id) === 'Unassigned') {
                          handleFacultyAssignment(suggestions[0].id);
                        }
                      });
                    }}
                    disabled={assignmentLoading}
                  >
                    Auto-Assign
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Special Hours Manager — full-width single row */}
        <div className="mb-8">
          {departmentId && selection.year ? (
            <SpecialHoursManager
              className=""
              departmentId={departmentId}
              year={selection.year}
              onConfigUpdate={setSpecialHoursConfigs}
            />
          ) : (
            <Card className="rounded-2xl border-none shadow-lg bg-gradient-to-br from-card to-secondary/30 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg font-bold">Special Hours Configuration</CardTitle>
                <CardDescription className="text-xs">Configure Seminar, Library, and Counselling</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-6">
                <BookOpen className="h-10 w-10 text-muted-foreground opacity-20 mb-2" />
                <p className="text-xs text-muted-foreground text-center">Select department and year to configure special hours</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
          <Card className="rounded-2xl">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex-1">
                <CardTitle>Selected for Generation</CardTitle>
                <CardDescription>Filter and manage subjects for the timetable</CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="w-full sm:w-auto flex items-center gap-1.5 h-8 text-xs font-semibold">
                      <Plus className="h-4 w-4" /> Add Subjects
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md bg-card">
                    <DialogHeader>
                      <DialogTitle>Add Subjects to Section</DialogTitle>
                      <DialogDescription>
                        Select subjects from the year's course curriculum to allocate to Section {selection.section}.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1 mt-2 scrollbar-thin scrollbar-thumb-gray-200">
                      {available.filter(s => !selected.some(sel => sel.id === s.id)).map(s => (
                        <div key={s.id} className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-background/50">
                          <div>
                            <div className="text-sm font-semibold">{s.name}</div>
                            <div className="text-[10px] text-muted-foreground capitalize font-medium">{s.type} • {s.hoursPerWeek}h</div>
                          </div>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleMoveToSelected(s.id)}>Add</Button>
                        </div>
                      ))}
                      {available.filter(s => !selected.some(sel => sel.id === s.id)).length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-6 font-medium">All curriculum subjects are already added to this section.</p>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>

                <Button 
                  size="sm" 
                  variant="hero"
                  onClick={next}
                  className="w-full sm:w-auto px-6 h-8 text-xs font-semibold"
                  disabled={((totals.total - totalElectiveSum) + electiveOccupiedHours + (openElectiveMode === 'parallel' ? openElectiveHours : currentOpenElectiveHours) + configuredSpecialHrs) > SUBJECT_HOUR_LIMIT || 
                           !selection.department || !selection.year || !selection.section ||
                           selected.length === 0}
                >
                  Generate Timetable
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <SubjectTable
                data={tableData}
                getRowId={(row) => row.id}
                searchKey={(row) => `${row.name} ${row.code} ${row.abbreviation}`}
                searchPlaceholder="Search subjects by name, code or abbreviation..."
                exportFileName="subjects-curriculum"
                filters={[
                  {
                    key: "type",
                    label: "Subject Type",
                    options: [
                      { label: "Theory", value: "theory" },
                      { label: "Lab", value: "lab" },
                      { label: "Professional Elective", value: "elective" },
                      { label: "Open Elective", value: "open elective" },
                      { label: "Special", value: "special" },
                    ]
                  },
                  {
                    key: "assignedFacultyId",
                    label: "Assigned Faculty",
                    options: facultyFilterOptions
                  }
                ]}
                onDeleteSelected={async (ids) => {
                  for (const id of ids) {
                    if (!id.startsWith("special-")) {
                      await handleMoveToAvailable(id);
                    }
                  }
                  toast({ title: "Removed from selection", description: "Selected subjects have been removed." });
                }}
                columns={[
                  {
                    key: "type",
                    header: "Type",
                    sortable: true,
                    render: (row) => (
                      <Badge 
                        variant={row.type === 'lab' ? 'default' : row.type === 'elective' || row.type === 'open elective' ? 'outline' : 'secondary'} 
                        className="uppercase text-[10px] whitespace-nowrap"
                      >
                        {row.type === 'open elective' ? 'OE' : row.type === 'special' ? 'SPECIAL' : row.type}
                      </Badge>
                    )
                  },
                  {
                    key: "name",
                    header: "Subject Name",
                    sortable: true,
                    render: (row) => (
                      row.rowType === 'special' ? (
                        <div>
                          <div className="font-semibold text-sm capitalize text-slate-900 dark:text-slate-100">{row.name}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            {row.saturday_hours && row.saturday_hours > 0 && `Sat: P${row.saturday_periods?.join(', P')}`}
                            {row.saturday_hours && row.saturday_hours > 0 && row.weekdays_hours && row.weekdays_hours > 0 && ' • '}
                            {row.weekdays_hours && row.weekdays_hours > 0 && `Weekdays: P${row.weekdays_periods?.join(', P')}`}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{row.name}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex gap-2 items-center flex-wrap">
                            {row.code && <span className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-1 py-0.5 rounded font-mono">{row.code}</span>}
                            {row.abbreviation && <span className="font-semibold text-slate-600 dark:text-slate-400">({row.abbreviation})</span>}
                            <span className="text-slate-300 dark:text-slate-600">•</span>
                            <span>{row.credits || 3} credits</span>
                          </div>
                        </div>
                      )
                    )
                  },
                  {
                    key: "hoursPerWeek",
                    header: "Hrs",
                    sortable: true,
                    render: (row) => <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{row.hoursPerWeek}h</span>
                  },
                  {
                    key: "labAllocName",
                    header: "Lab Room",
                    render: (row) => (
                      row.rowType === 'special' ? (
                        <span className="text-slate-400 dark:text-slate-500 text-sm">—</span>
                      ) : row.type === 'lab' ? (
                        row.labAllocName ? (
                          <div className="flex flex-col gap-0.5">
                            <Badge variant="default" className="text-[10px] bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-400 border border-green-200 dark:border-green-800/30 w-fit">
                              {row.labAllocName}
                            </Badge>
                            {row.labAllocCode && <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{row.labAllocCode}</span>}
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-200 dark:text-orange-500 dark:border-orange-900/30 w-fit bg-orange-100 dark:bg-orange-950/10">
                            Not Allocated
                          </Badge>
                        )
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500 text-sm">—</span>
                      )
                    )
                  },
                  {
                    key: "assignedFacultyName",
                    header: "Assigned Faculty",
                    render: (row) => (
                      row.rowType === 'special' ? (
                        <span className="text-slate-400 dark:text-slate-500 text-sm">—</span>
                      ) : (
                        <span className={`text-sm flex items-center gap-1.5 ${row.assignedFacultyName !== 'Unassigned' ? 'text-green-600 dark:text-green-400' : 'text-orange-655 dark:text-orange-400'}`}>
                          {row.assignedFacultyName !== 'Unassigned' ? <UserCheck className="h-3.5 w-3.5 shrink-0" /> : <Users className="h-3.5 w-3.5 shrink-0" />}
                          <span className="truncate max-w-[140px]">{row.assignedFacultyName}</span>
                        </span>
                      )
                    )
                  },
                  {
                    key: "isFullyReady",
                    header: "Status",
                    render: (row) => (
                      row.rowType === 'special' ? (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">Auto-scheduled</span>
                      ) : !row.isFullyReady ? (
                        <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-250 dark:text-orange-500 dark:border-orange-900/30 bg-orange-100 dark:bg-orange-950/10">
                          ⚠ Pending
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-250 dark:text-emerald-450 dark:border-emerald-900/30 bg-emerald-100 dark:bg-emerald-950/10">
                          ✓ Ready
                        </Badge>
                      )
                    )
                  },
                  {
                    key: "actions",
                    header: "Actions",
                    render: (row) => (
                      row.rowType === 'special' ? (
                        <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => openFacultyAssignment(selected.find(s => s.id === row.id)!)}
                            className="h-7 text-[11px] px-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            Assign
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => handleMoveToAvailable(row.id)}
                            className="h-7 text-[11px] px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            Remove
                          </Button>
                        </div>
                      )
                    )
                  }
                ]}
                renderItemCard={(row, isSelected, onToggleSelect) => (
                  <div
                    key={row.id}
                    onClick={onToggleSelect}
                    className={`p-5 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col justify-between h-full bg-card ${
                      isSelected
                        ? "border-emerald-500 shadow-md shadow-emerald-500/5 bg-muted/30"
                        : "border-border hover:border-muted-foreground/35 hover:bg-muted/10"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge 
                            variant={row.type === 'lab' ? 'default' : row.type === 'elective' || row.type === 'open elective' ? 'outline' : 'secondary'} 
                            className="uppercase text-[9px]"
                          >
                            {row.type === 'open elective' ? 'OE' : row.type === 'special' ? 'SPECIAL' : row.type}
                          </Badge>
                          {row.rowType !== 'special' && row.code && (
                            <span className="text-[10px] font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700">{row.code}</span>
                          )}
                          {row.rowType === 'special' && (
                            <span className="text-[10px] text-purple-700 bg-purple-100 dark:bg-purple-950/20 dark:text-purple-400 border border-purple-200 dark:border-purple-900/20 px-1 rounded">Auto</span>
                          )}
                        </div>
                        <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-snug">{row.name}</h3>
                        
                        {row.rowType === 'special' ? (
                          <div className="text-[10px] text-slate-500 dark:text-slate-450 mt-2 space-y-0.5">
                            {row.saturday_hours && row.saturday_hours > 0 && <div>Sat: P${row.saturday_periods?.join(', P')} ({row.saturday_hours}h)</div>}
                            {row.weekdays_hours && row.weekdays_hours > 0 && <div>Weekdays: P${row.weekdays_periods?.join(', P')} ({row.weekdays_hours}h)</div>}
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-500 dark:text-slate-450 mt-2 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{row.hoursPerWeek} hours/week</span>
                              <span>•</span>
                              <span>{row.credits || 3} credits</span>
                              {row.abbreviation && <><span>•</span><span className="font-semibold text-slate-700 dark:text-slate-300">{row.abbreviation}</span></>}
                            </div>
                            
                            <div className="flex items-center gap-2 flex-wrap pt-1.5 border-t border-border">
                              <span>Faculty:</span>
                              <span className={`font-semibold ${row.assignedFacultyName !== 'Unassigned' ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-450'}`}>{row.assignedFacultyName}</span>
                            </div>

                            {row.type === 'lab' && (
                              <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border">
                                <span>Lab:</span>
                                {row.labAllocName ? (
                                  <span className="font-semibold text-green-600 dark:text-green-400">{row.labAllocName} ({row.labAllocCode})</span>
                                ) : (
                                  <span className="font-semibold text-orange-655 dark:text-orange-450">Not Allocated</span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-col items-end gap-3 shrink-0">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => onToggleSelect()}
                          onClick={(e) => e.stopPropagation()}
                          className="border-border bg-background data-[state=checked]:bg-emerald-500"
                        />
                        {row.rowType !== 'special' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openFacultyAssignment(selected.find(s => s.id === row.id)!); }}
                            className="h-7 px-2.5 rounded-lg text-[10px] font-medium transition-colors bg-secondary text-secondary-foreground hover:bg-secondary/80"
                          >
                            Assign
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              />


              <Separator className="my-4" />

              {/* Lab Settings trigger and controls remain below */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pt-2">
                <Dialog open={labSettingsOpen} onOpenChange={setLabSettingsOpen}>
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
    
    {generating && (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 animate-fade-in">
        <div className="max-w-md w-full p-8 rounded-3xl border border-border bg-card/50 shadow-2xl backdrop-blur-lg flex flex-col items-center text-center space-y-6">
          <div className="relative h-20 w-20 flex items-center justify-center">
            {/* Spinning glowing gradient ring */}
            <div className="absolute inset-0 rounded-full border-4 border-slate-200 border-t-purple-600 border-r-indigo-500 border-b-sky-500 animate-spin" />
            <div className="text-xl font-extrabold text-slate-800 font-mono">{generationProgress}%</div>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-lg font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Optimizing Timetable</h3>
            <p className="text-sm font-semibold text-slate-500 font-mono h-5 transition-all duration-300">{generationStatus}</p>
          </div>

          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200/50">
            <div 
              className="bg-gradient-to-r from-purple-600 to-indigo-500 h-full rounded-full transition-all duration-300 ease-out" 
              style={{ width: `${generationProgress}%` }}
            />
          </div>
        </div>
      </div>
    )}
  </div>
);
};

export default SubjectManagement;