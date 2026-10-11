import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSubjectsForYear, getOpenElectiveHours, getOpenElectiveConfig, setOpenElectiveConfig, hasEvenSemesterSubjects } from "@/lib/supabaseService";
import { useTimetableStore } from "@/store/timetableStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomTable } from "@/components/ui/CustomTable";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import Navbar from "@/components/navbar/Navbar";
import AdminNavbar from "@/components/navbar/AdminNavbar";
import FacultyNavbar from "@/components/navbar/facultyadmin";
import SelectionHeader from "@/components/admin/SelectionHeader";
import { Trash2, Download, LayoutGrid, List, Plus, Layers, Settings, Clock, Sparkles, BookMarked } from "lucide-react";
import * as XLSX from "xlsx";
import { useDarkMode } from "@/context/DarkModeContext";

interface SubjectRow {
  id: string;
  name: string;
  type: 'theory' | 'lab' | 'elective' | 'open elective' | 'special' | 'project';
  hours_per_week: number;
  year: string;
  code: string | null;
  max_faculty_count?: number;
  credits?: number;
  abbreviation?: string | null;
  tags?: string[];
  configId?: string;
  dayIndex?: number;
  dayName?: string;
  period?: number;
  elective_group_name?: string | null;
  groupedSubjects?: SubjectRow[]; // virtual: when this row represents a collapsed elective group
}

const YearSubjects = () => {
  const { isDark } = useDarkMode();
  const { id, year } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const semesterType = useTimetableStore((s) => s.semesterType);
  const setSemesterType = useTimetableStore((s) => s.setSemesterType);
  const superAdmin = localStorage.getItem("superAdmin") === "true";
  const adminUser = localStorage.getItem("adminUser");
  const facultyUser = localStorage.getItem("facultyUser");
  
  const isLoggedIn = useMemo(() => superAdmin || !!adminUser || !!facultyUser, [superAdmin, adminUser, facultyUser]);
  const userType = superAdmin ? 'super' : adminUser ? 'admin' : facultyUser ? 'faculty' : null;
  const sessionUser = useMemo(() => {
    if (adminUser) return JSON.parse(adminUser);
    if (facultyUser) return JSON.parse(facultyUser);
    return null;
  }, [adminUser, facultyUser]);

  const [allocatedDepts, setAllocatedDepts] = useState<{ id: string; name: string }[]>([]);
  const [activeDeptId, setActiveDeptId] = useState<string>(() => id || searchParams.get('deptId') || "");
  const [deptName, setDeptName] = useState<string>("");
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [facultyInYear, setFacultyInYear] = useState<number>(0);

  // Special Hours states
  const [specialHours, setSpecialHours] = useState<any[]>([]);
  const [specialTypeName, setSpecialTypeName] = useState("");
  const [specialDay, setSpecialDay] = useState("");
  const [specialPeriod, setSpecialPeriod] = useState("");

  // form state for add/edit
  const [name, setName] = useState("");
  const [type, setType] = useState<'theory' | 'lab' | 'elective' | 'open elective' | 'special' | 'project'>("theory");
  const [hours, setHours] = useState<number>(1);
  const [code, setCode] = useState("");
  const [maxFacultyCount, setMaxFacultyCount] = useState<number>(1);
  const [credits, setCredits] = useState<number>(3);
  const [tags, setTags] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [schedulingMode, setSchedulingMode] = useState<'same' | 'different'>('different');
  const [parallelSubjectId, setParallelSubjectId] = useState<string>('');
  
  useEffect(() => {
    if (type !== 'elective' && type !== 'open elective') {
      setSchedulingMode('different');
      setParallelSubjectId('');
    }
  }, [type]);
  const [activeTab, setActiveTab] = useState<'theory' | 'lab' | 'open elective' | 'special'>('theory');
  const [isCumulative, setIsCumulative] = useState<boolean>(true);
  // Open Elective Config & Grouping
  const [oeConfigOpen, setOeConfigOpen] = useState(false);
  const [openElectiveTotalHours, setOpenElectiveTotalHours] = useState<number>(5);
  const [oeConfigHoursInput, setOeConfigHoursInput] = useState<number>(5);
  const [oeGroupName, setOeGroupName] = useState<string>("Open elective");
  const [oeIsSharedSlot, setOeIsSharedSlot] = useState<boolean>(true);
  const [oeSelectedSlots, setOeSelectedSlots] = useState<string[]>(['Mon-1', 'Wed-1', 'Fri-1', 'Sat-1', 'Sat-2']);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);

  const [filterType, setFilterType] = useState<string>("all");
  const [viewMode, setViewMode] = useState<'table' | 'list'>('table');

  // Elective Grouping
  const [groupingOpen, setGroupingOpen] = useState(false);
  const [groupSelectedIds, setGroupSelectedIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupHoursInput, setGroupHoursInput] = useState<number>(3);
  const [groupingSaving, setGroupingSaving] = useState(false);
  const [addingLib, setAddingLib] = useState(false);

  const filteredSubjects = useMemo(() => {
    return subjects.filter((s) => {
      const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) || 
                            (s.code && s.code.toLowerCase().includes(search.toLowerCase())) ||
                            (s.abbreviation && s.abbreviation.toLowerCase().includes(search.toLowerCase()));
      const matchesType = filterType === "all" || s.type === filterType;
      return !!matchesSearch && matchesType;
    });
  }, [subjects, search, filterType]);

  const electiveHours = useMemo(() => {
    const pes = subjects.filter(s => s.type === 'elective');
    if (pes.length === 0) return 0;
    const peGroups = new Map<string, number>();
    let untaggedSum = 0;
    pes.forEach(s => {
      const groupTag = (s.tags || []).find(t => /pe_group_\d+/i.test(t) || /^pe\d+/i.test(t));
      if (groupTag) {
        peGroups.set(groupTag, Math.max(peGroups.get(groupTag) || 0, s.hours_per_week));
      } else {
        untaggedSum += s.hours_per_week;
      }
    });
    let groupSum = 0;
    peGroups.forEach(h => { groupSum += h; });
    return groupSum + untaggedSum;
  }, [subjects]);

  const openElectiveHours = useMemo(() => {
    const oes = subjects.filter(s => s.type === 'open elective');
    if (oes.length === 0) return 0;
    // Always return the configured total hours when open electives are present
    return openElectiveTotalHours;
  }, [subjects, openElectiveTotalHours]);

  const theoryHours = useMemo(() => {
    const traditionalTheory = subjects
      .filter(s => s.type === 'theory' || s.type === 'project')
      .reduce((a, b) => a + (b.hours_per_week || 0), 0);
    return traditionalTheory + electiveHours + openElectiveHours;
  }, [subjects, electiveHours, openElectiveHours]);

  const labHours = useMemo(() => subjects.filter(s => s.type === 'lab').reduce((a, b) => a + (b.hours_per_week || 0), 0), [subjects]);

  const totalHours = useMemo(() => {
    return theoryHours + labHours;
  }, [theoryHours, labHours]);

  const totalSpecialHours = useMemo(() => {
    const satHours = specialHours.reduce((acc, curr) => acc + (curr.saturday_hours || 0), 0);
    const defaultSat = year === 'II' ? 3 : (year === 'III' || year === 'IV' ? 5 : 0);
    const configHours = satHours > 0 ? satHours : defaultSat;

    const subjectHours = subjects
      .filter(s => s.type === 'special')
      .reduce((a, b) => a + (b.hours_per_week || 0), 0);
    return configHours + subjectHours;
  }, [specialHours, subjects, year]);

  const grandTotalHours = useMemo(() => {
    return totalHours + totalSpecialHours;
  }, [totalHours, totalSpecialHours]);

  const specialHoursBreakdown = useMemo(() => {
    const breakdown = specialHours.map(sh => ({
      name: sh.special_type,
      hours: sh.saturday_hours || (sh.special_type.toLowerCase().includes('library') ? 1 : 2)
    })).filter(item => item.hours > 0);

    subjects.filter(s => s.type === 'special').forEach(s => {
      breakdown.push({
        name: s.name,
        hours: s.hours_per_week
      });
    });

    return breakdown;
  }, [specialHours, subjects, year]);



  useEffect(() => {
    document.title = `Manage Subjects - ${year}`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Add, update, and delete subjects for the selected department year.");
  }, [year]);

  useEffect(() => {
    (async () => {
      if (superAdmin) {
        const { data } = await (supabase as any)
          .from('departments')
          .select('id, name')
          .order('name');
        if (data && data.length > 0) {
          setAllocatedDepts(data);
          const qDept = searchParams.get('deptId') || id;
          const matched = data.find((d: any) => d.id === qDept);
          const chosen = matched?.id || data[0].id;
          setActiveDeptId(chosen);
        }
        return;
      }

      if (!sessionUser) return;

      let deptIds: string[] = [];
      if (sessionUser.id) {
        const { data: adminDepts } = await (supabase as any)
          .from('admin_departments')
          .select('department_id')
          .eq('admin_id', sessionUser.id);
        if (adminDepts && adminDepts.length > 0) {
          deptIds = adminDepts.map((d: any) => d.department_id);
        }
      }

      if (deptIds.length === 0) {
        if (sessionUser.department_ids && sessionUser.department_ids.length > 0) {
          deptIds = sessionUser.department_ids;
        } else if (sessionUser.department_id) {
          deptIds = [sessionUser.department_id];
        }
      }

      if (deptIds.length > 0) {
        const { data } = await (supabase as any)
          .from('departments')
          .select('id, name')
          .in('id', deptIds)
          .order('name');

        if (data && data.length > 0) {
          setAllocatedDepts(data);
          const qDept = searchParams.get('deptId') || id;
          const matchedQ = data.find((d: any) => d.id === qDept);
          const matchedStored = adminUser ? (() => {
            try {
              const p = JSON.parse(adminUser);
              return data.find((d: any) => d.id === p.department_id);
            } catch { return undefined; }
          })() : undefined;
          const matchedSession = data.find((d: any) => d.id === sessionUser.department_id);
          const chosen = matchedQ?.id || matchedStored?.id || matchedSession?.id || data[0].id;
          setActiveDeptId(chosen);
        }
      }
    })();
  }, [id, superAdmin, sessionUser, adminUser]);

  const handleSwitchDepartment = (dept: { id: string; name: string }) => {
    setActiveDeptId(dept.id);
    setDeptName(dept.name);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('deptId', dept.id);
      return next;
    }, { replace: true });
    if (adminUser) {
      try {
        const parsed = JSON.parse(adminUser);
        parsed.department_id = dept.id;
        localStorage.setItem("adminUser", JSON.stringify(parsed));
      } catch {}
    }
    useTimetableStore.setState(state => ({
      ...state,
      selection: { ...state.selection, department: dept.name, year }
    }));
  };

  useEffect(() => {
    if (!isLoggedIn) { navigate('/', { replace: true }); return; }
    if (!activeDeptId || !year) return;

    let isMounted = true;
    (async () => {
      setLoading(true);
      try {
        const { data: d } = await (supabase as any)
          .from('departments')
          .select('*')
          .eq('id', activeDeptId)
          .maybeSingle();

        if (!isMounted) return;

        if (d?.name) {
          setDeptName(d.name);
          useTimetableStore.setState(state => ({
            ...state,
            selection: { ...state.selection, department: d.name, year }
          }));
        }

        // Keep localStorage and URL query in sync with activeDeptId
        if (adminUser) {
          try {
            const parsed = JSON.parse(adminUser);
            if (parsed.department_id !== activeDeptId) {
              parsed.department_id = activeDeptId;
              localStorage.setItem("adminUser", JSON.stringify(parsed));
            }
          } catch {}
        }
        if (searchParams.get('deptId') !== activeDeptId && !id) {
          setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('deptId', activeDeptId);
            return next;
          }, { replace: true });
        }

        const list = await (async () => {
          try {
            let arr = await getSubjectsForYear(activeDeptId, year, semesterType);
            if (arr.length === 0 && semesterType === 'even') {
              const hasEven = await hasEvenSemesterSubjects(activeDeptId, year);
              if (!hasEven) {
                arr = await getSubjectsForYear(activeDeptId, year, 'odd');
                setSemesterType('odd');
              }
            }
            return (arr || []).map((s: any) => ({
              id: s.id,
              name: s.name,
              type: s.type,
              hours_per_week: s.hoursPerWeek,
              year: year,
              code: s.code || null,
              max_faculty_count: s.maxFacultyCount || 1,
              tags: s.tags || [],
              abbreviation: s.abbreviation || null,
              credits: s.credits || 3,
              elective_group_name: s.elective_group_name || null,
            }));
          } catch {
            return [] as SubjectRow[];
          }
        })();

        if (!isMounted) return;

        const sortedList = (list || []).sort((a, b) => a.name.localeCompare(b.name));
        setSubjects(sortedList);

        const [ttRes, fsaRes, shRes, oeConfig] = await Promise.all([
          (supabase as any).from('timetables').select('section').eq('department_id', activeDeptId).eq('year', year),
          (supabase as any).from('faculty_subject_assignments').select('*', { count: 'exact', head: true }).eq('department_id', activeDeptId).eq('year', year),
          (supabase as any).from('special_hours_config').select('*').eq('department_id', activeDeptId).eq('year', year).eq('is_active', true).order('special_type'),
          getOpenElectiveConfig(activeDeptId, year).catch(() => ({ hours: 5, group_name: "Open elective", is_shared_slot: true }))
        ]);

        if (!isMounted) return;

        const secs: string[] = Array.from(new Set<string>((ttRes.data || []).map((t: any) => String(t.section)))).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        setSections(secs);
        setFacultyInYear(fsaRes?.count || 0);
        setSpecialHours(shRes.data || []);
        if (oeConfig) {
          setOpenElectiveTotalHours(oeConfig.hours);
          setOeConfigHoursInput(oeConfig.hours);
          setOeGroupName(oeConfig.group_name || "Open elective");
          setOeIsSharedSlot(oeConfig.is_shared_slot ?? true);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => { isMounted = false; };
  }, [isLoggedIn, activeDeptId, year, semesterType]);

  const resetForm = () => {
    setName("");
    setType("theory");
    setHours(1);
    setCode("");
    setMaxFacultyCount(1);
    setCredits(3);
    setTags("");
    setAbbreviation("");
    setEditingId(null);
    setSchedulingMode("different");
    setParallelSubjectId("");
    setSpecialTypeName("");
    setSpecialDay("");
    setSpecialPeriod("");
  };

  const loadSpecialHours = async () => {
    const targetDeptId = activeDeptId;
    if (!targetDeptId || !year) return;
    const { data: shData } = await (supabase as any)
      .from('special_hours_config')
      .select('*')
      .eq('department_id', targetDeptId)
      .eq('year', year)
      .eq('is_active', true)
      .order('special_type');
    setSpecialHours(shData || []);
  };

  const handleAddLib = async () => {
    if (!activeDeptId || !year || grandTotalHours >= 42 || grandTotalHours <= 0) return;
    const deficit = Math.max(0, 42 - grandTotalHours);
    setAddingLib(true);

    try {
      // 1. Search for existing Library subject for this department, year, and active semester
      const { data: existingLibSubs } = await (supabase as any)
        .from('subjects')
        .select('*')
        .eq('department_id', activeDeptId)
        .eq('year', year)
        .ilike('name', '%library%');

      const semLib = (existingLibSubs || []).find((s: any) => {
        const isEven = (s.tags || []).some((t: string) => /even_sem|even\b/i.test(t));
        return semesterType === 'even' ? isEven : !isEven;
      });

      if (semLib) {
        const newHpw = (semLib.hours_per_week || 0) + deficit;
        const { error } = await (supabase as any)
          .from('subjects')
          .update({
            type: 'theory',
            hours_per_week: newHpw,
            updated_at: new Date().toISOString()
          })
          .eq('id', semLib.id);

        if (error) throw error;

        setSubjects((prev) =>
          prev.map((s) => (s.id === semLib.id ? { ...s, type: 'theory', hours_per_week: newHpw } : s))
        );
      } else {
        const tagList = semesterType === 'even' ? ['even_sem'] : ['odd_sem'];
        const existingNames = new Set((existingLibSubs || []).map((s: any) => String(s.name).trim().toLowerCase()));

        let targetName = semesterType === 'even' ? 'Library (Even)' : 'Library';
        if (existingNames.has(targetName.toLowerCase())) {
          targetName = semesterType === 'even' ? 'Library (Even Sem)' : 'Library (Odd)';
        }

        const { data: newSub, error } = await (supabase as any)
          .from('subjects')
          .insert({
            department_id: activeDeptId,
            year: year,
            name: targetName,
            code: 'LIB',
            abbreviation: 'LIB',
            type: 'theory',
            hours_per_week: deficit,
            credits: 1,
            tags: tagList,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) throw error;

        setSubjects((prev) => {
          const newList: SubjectRow[] = [...prev, {
            id: newSub.id,
            name: newSub.name,
            type: 'theory' as const,
            hours_per_week: deficit,
            year: year,
            code: newSub.code || null,
            max_faculty_count: 1,
            tags: newSub.tags || [],
            abbreviation: newSub.abbreviation || null,
            credits: 1,
            elective_group_name: null,
          }];
          return newList.sort((a, b) => a.name.localeCompare(b.name));
        });
      }

      toast.success(`Added ${deficit}h Library for ${semesterType === 'even' ? 'Even' : 'Odd'} Semester. Weekly load is now exactly 42h!`);
    } catch (err: any) {
      console.error("Failed to add library hours:", err);
      toast.error(`Failed to add library hours: ${err.message || 'Unknown error'}`);
    } finally {
      setAddingLib(false);
    }
  };

  const handleAddSpecialHourSlot = async (overrideName?: string) => {
    const finalName = (overrideName || specialTypeName).trim();
    if (!finalName || !specialDay || !specialPeriod) {
      toast.error("Special hour name, day, and period are required");
      return;
    }
    const targetDeptId = activeDeptId;
    if (!targetDeptId || !year) return;

    const dayIdx = parseInt(specialDay, 10);
    const prIdx = parseInt(specialPeriod, 10);
    const slotCode = dayIdx * 10 + prIdx;

    try {
      let existing = specialHours.find(
        (sh) => sh.special_type.toLowerCase() === finalName.toLowerCase()
      );

      if (!existing) {
        const { data: dbExisting } = await (supabase as any)
          .from('special_hours_config')
          .select('*')
          .eq('department_id', targetDeptId)
          .eq('year', year);
        const match = (dbExisting || []).find(
          (sh: any) => sh.special_type.toLowerCase() === finalName.toLowerCase()
        );
        if (match) existing = match;
      }

      if (existing) {
        const satPeriods = existing.saturday_periods || [];
        const wkPeriods = existing.weekdays_periods || [];
        if (satPeriods.includes(slotCode) || wkPeriods.includes(slotCode)) {
          toast.error("This special hour slot is already added");
          return;
        }

        const isSat = dayIdx === 5;
        const newSatPeriods = isSat ? [...satPeriods, slotCode] : satPeriods;
        const newSatHours = isSat ? (existing.saturday_hours || 0) + 1 : (existing.saturday_hours || 0);
        
        const newWkPeriods = !isSat ? [...wkPeriods, slotCode] : wkPeriods;
        const newWkHours = !isSat ? (existing.weekdays_hours || 0) + 1 : (existing.weekdays_hours || 0);

        const newTotal = newSatHours + newWkHours;

        const { error } = await (supabase as any)
          .from('special_hours_config')
          .update({
            saturday_periods: newSatPeriods,
            saturday_hours: newSatHours,
            weekdays_periods: newWkPeriods,
            weekdays_hours: newWkHours,
            total_hours: newTotal,
            is_active: true,
          })
          .eq('id', existing.id);

        if (error) throw error;
        toast.success("Special hour slot added to config");
      } else {
        const isSat = dayIdx === 5;
        const newConfig = {
          department_id: targetDeptId,
          year,
          special_type: finalName,
          total_hours: 1,
          saturday_hours: isSat ? 1 : 0,
          saturday_periods: isSat ? [slotCode] : [],
          weekdays_hours: isSat ? 0 : 1,
          weekdays_periods: isSat ? [] : [slotCode],
          is_active: true,
        };

        const { error } = await (supabase as any)
          .from('special_hours_config')
          .insert(newConfig);

        if (error) throw error;
        toast.success("Special hour configuration created");
      }

      setSpecialTypeName("");
      setSpecialDay("");
      setSpecialPeriod("");
      loadSpecialHours();
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to save special hour slot: ${err.message || 'Unknown error'}`);
    }
  };

  const handleDeleteSpecialHourSlot = async (configId: string, dayIndex: number, period: number) => {
    const slotCode = dayIndex * 10 + period;
    const config = specialHours.find((sh) => sh.id === configId);
    if (!config) return;

    try {
      const isSat = dayIndex === 5;
      const newSatPeriods = isSat
        ? (config.saturday_periods || []).filter((p: number) => p !== slotCode)
        : (config.saturday_periods || []);
      const newSatHours = isSat ? Math.max(0, config.saturday_hours - 1) : config.saturday_hours;

      const newWkPeriods = !isSat
        ? (config.weekdays_periods || []).filter((p: number) => p !== slotCode)
        : (config.weekdays_periods || []);
      const newWkHours = !isSat ? Math.max(0, config.weekdays_hours - 1) : config.weekdays_hours;

      const newTotal = newSatHours + newWkHours;

      if (newTotal === 0) {
        const { error } = await (supabase as any)
          .from('special_hours_config')
          .update({ is_active: false })
          .eq('id', configId);

        if (error) throw error;
        toast.success("Special hour config removed");
      } else {
        const { error } = await (supabase as any)
          .from('special_hours_config')
          .update({
            saturday_periods: newSatPeriods,
            saturday_hours: newSatHours,
            weekdays_periods: newWkPeriods,
            weekdays_hours: newWkHours,
            total_hours: newTotal,
          })
          .eq('id', configId);

        if (error) throw error;
        toast.success("Special hour slot deleted");
      }

      loadSpecialHours();
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to delete special hour slot: ${err.message || 'Unknown error'}`);
    }
  };

  const DAYS_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  
  const specialHoursList = useMemo(() => {
    const list: {
      configId: string;
      name: string;
      dayIndex: number;
      dayName: string;
      period: number;
    }[] = [];

    specialHours.forEach((config) => {
      (config.saturday_periods || []).forEach((p: number) => {
        let d = 5;
        let pr = p;
        if (p > 10) {
          d = Math.floor(p / 10);
          pr = p % 10;
        }
        list.push({
          configId: config.id,
          name: config.special_type,
          dayIndex: d,
          dayName: DAYS_NAMES[d],
          period: pr,
        });
      });

      (config.weekdays_periods || []).forEach((p: number) => {
        let d = 0;
        let pr = p;
        if (p > 10) {
          d = Math.floor(p / 10);
          pr = p % 10;
        } else {
          d = 0;
        }
        list.push({
          configId: config.id,
          name: config.special_type,
          dayIndex: d,
          dayName: DAYS_NAMES[d],
          period: pr,
        });
      });
    });

    return list.sort((a, b) => {
      if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
      return a.period - b.period;
    });
  }, [specialHours]);

  const electiveSiblings = useMemo(() => {
    return subjects.filter(s => s.id !== editingId && s.type === type);
  }, [subjects, type, editingId]);

  const resolveParallelTags = async (
    targetType: string,
    currentTagsList: string[],
    targetParallelSubId: string
  ): Promise<string[]> => {
    if (!targetParallelSubId) {
      // If different hour/separate, clean group tags
      return currentTagsList.filter(t => !/^(pe\s*\d+|elective\s*\d+|professional\s*elective\s*\d+|pe_group_\d+|oe_group_\d+)$/i.test(t.trim()));
    }
    
    const pSub = subjects.find((x) => x.id === targetParallelSubId);
    if (!pSub) return currentTagsList;
    
    const groupTag = (pSub.tags || []).find((t) =>
      /^(pe\s*\d+|elective\s*\d+|professional\s*elective\s*\d+|pe_group_\d+|oe_group_\d+)$/i.test(t.trim())
    );
    
    if (groupTag) {
      return Array.from(new Set([...currentTagsList, groupTag]));
    } else {
      const prefix = targetType === 'elective' ? 'PE_Group_' : 'OE_Group_';
      const randomVal = Math.floor(1000 + Math.random() * 9000);
      const newTag = `${prefix}${randomVal}`;
      
      const updatedParallelTags = Array.from(new Set([...(pSub.tags || []), newTag]));
      const { error } = await (supabase as any)
        .from('subjects')
        .update({ tags: updatedParallelTags })
        .eq('id', pSub.id);
        
      if (error) {
        console.error('Failed to update parallel subject tags:', error);
      } else {
        setSubjects((prev) =>
          prev.map((s) => (s.id === pSub.id ? { ...s, tags: updatedParallelTags } : s))
        );
      }
      
      return Array.from(new Set([...currentTagsList, newTag]));
    }
  };

  const handleAdd = async () => {
    if (!name.trim()) { toast.error("Subject name is required"); return; }
    
    const targetDeptId = activeDeptId;
    try {
      const baseTags = tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
      const finalTags = await resolveParallelTags(type, baseTags, schedulingMode === 'same' ? parallelSubjectId : '');

      let effectiveTags = [...finalTags];
      effectiveTags = effectiveTags.filter(t => !/^(?:hpw|hours):\d+$/i.test(t));
      if (hours > 10) {
        effectiveTags.push(`hpw:${hours}`);
      }
      effectiveTags = effectiveTags.filter(t => !/^credits:\d+$/i.test(t));
      if (credits > 6) {
        effectiveTags.push(`credits:${credits}`);
      }

      const safeHours = Math.max(1, Math.min(Number(hours) || 1, 10));
      const safeCredits = Math.max(1, Math.min(Number(credits) || 1, 6));
      const allowedTypes = ['theory', 'lab', 'elective', 'open elective', 'special', 'project'];
      const safeType = allowedTypes.includes(type) ? type : 'special';

      const subjectData: any = {
        department_id: targetDeptId,
        year,
        name: name.trim(),
        type: safeType,
        hours_per_week: safeHours,
        code: code.trim() || null,
        credits: safeCredits,
        tags: effectiveTags,
        abbreviation: abbreviation.trim() || null,
      };
      
      // Add max_faculty_count for lab subjects
      if (safeType === 'lab') {
        subjectData.max_faculty_count = maxFacultyCount;
      }
      
      const { data, error } = await (supabase as any).from('subjects').insert(subjectData).select().single();
      if (error) { 
        console.error('Subject addition error:', error);
        toast.error(`Failed to add subject: ${error.message}`); 
        return; 
      }
      setSubjects((s) => {
        const newList = [...s, { ...(data as SubjectRow), hours_per_week: hours, credits: credits }];
        return newList.sort((a, b) => a.name.localeCompare(b.name));
      });
      toast.success("Subject added");
      resetForm();
    } catch (err: any) {
      console.error('Unexpected error:', err);
      toast.error(`Failed to add subject: ${err.message || 'Unknown error'}`);
    }
  };

  const handleDelete = async (sid: string) => {
    const { error } = await (supabase as any).from('subjects').delete().eq('id', sid);
    if (error) { toast.error("Failed to delete"); return; }
    setSubjects((s) => s.filter((x) => x.id !== sid));
    toast.success("Deleted");
  };

  const handleBulkDelete = async () => {
    if (selectedSubjects.length === 0) return;
    
    try {
      const { error } = await (supabase as any)
        .from('subjects')
        .delete()
        .in('id', selectedSubjects);
        
      if (error) throw error;
      
      toast.success(`${selectedSubjects.length} subjects deleted`);
      setSubjects((prev) => prev.filter((s) => !selectedSubjects.includes(s.id)));
      setSelectedSubjects([]);
    } catch (err: any) {
      console.error('Bulk delete error:', err);
      toast.error(`Failed to delete: ${err.message || 'Unknown error'}`);
    }
  };

  const handleExport = () => {
    const dataToExport = filteredSubjects.map((s) => ({
      Name: s.name,
      Abbreviation: s.abbreviation || "",
      Type: s.type,
      "Hours/Week": s.hours_per_week,
      Credits: s.credits || 3,
      Code: s.code || "",
      Tags: s.tags ? s.tags.join(", ") : "",
      "Max Faculty": s.type === 'lab' ? s.max_faculty_count : 1
    }));
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    XLSX.utils.book_append_sheet(wb, ws, "Curriculum");
    XLSX.writeFile(wb, `${deptName.replace(/\s+/g, '_')}_Year_${year}_Curriculum.xlsx`);
    toast.success("Curriculum exported successfully");
  };

  const handleElectiveGroupSave = async () => {
    if (!groupName.trim()) { toast.error("Group name is required"); return; }
    if (groupSelectedIds.length < 2) { toast.error("Select at least 2 electives to group"); return; }
    setGroupingSaving(true);
    try {
      // Generate a unique group tag like PE_Group_XXXX
      const groupTag = `PE_Group_${Math.floor(1000 + Math.random() * 9000)}`;
      for (const sid of groupSelectedIds) {
        const subj = subjects.find(s => s.id === sid);
        if (!subj) continue;
        const existingTags = (subj.tags || []).filter(t => !/^PE_Group_\d+$/i.test(t));
        const newTags = Array.from(new Set([...existingTags, groupTag]));
        const { error } = await (supabase as any)
          .from('subjects')
          .update({
            tags: newTags,
            elective_group_name: groupName.trim(),
            hours_per_week: groupHoursInput
          })
          .eq('id', sid);
        if (error) throw error;
      }
      // Update local state
      setSubjects(prev => prev.map(s =>
        groupSelectedIds.includes(s.id)
          ? {
              ...s,
              hours_per_week: groupHoursInput,
              elective_group_name: groupName.trim(),
              tags: Array.from(new Set([...(s.tags || []).filter(t => !/^PE_Group_\d+$/i.test(t)), groupTag]))
            }
          : s
      ));
      toast.success(`Grouped ${groupSelectedIds.length} electives under "${groupName.trim()}" (${groupHoursInput}h/week)`);
      setGroupingOpen(false);
      setGroupSelectedIds([]);
      setGroupName('');
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to save grouping");
    } finally {
      setGroupingSaving(false);
    }
  };

  const handleClearGroup = async (groupTagToRemove: string, affectedIds: string[]) => {
    try {
      for (const sid of affectedIds) {
        const subj = subjects.find(s => s.id === sid);
        if (!subj) continue;
        const newTags = (subj.tags || []).filter(t => t !== groupTagToRemove);
        const { error } = await (supabase as any)
          .from('subjects')
          .update({ tags: newTags, elective_group_name: null })
          .eq('id', sid);
        if (error) throw error;
      }
      setSubjects(prev => prev.map(s =>
        affectedIds.includes(s.id)
          ? { ...s, elective_group_name: null, tags: (s.tags || []).filter(t => t !== groupTagToRemove) }
          : s
      ));
      toast.success("Elective group cleared");
    } catch (err: any) {
      toast.error(err?.message || "Failed to clear group");
    }
  };

  const startEdit = (s: SubjectRow) => {
    setEditingId(s.id);
    setName(s.name);
    setType(s.type);
    setHours(s.hours_per_week);
    setCode(s.code || "");
    setMaxFacultyCount(s.max_faculty_count || 1);
    setCredits(s.credits || 3);
    setTags((s.tags || []).filter(t => !/^(?:hpw|hours):\d+$/i.test(t) && !/^credits:\d+$/i.test(t)).join(", "));
    setAbbreviation(s.abbreviation || "");

    // Infer parallel mode and subject ID from tags
    let inferredMode: 'same' | 'different' = 'different';
    let inferredParallelId = '';
    
    if (s.type === 'elective' || s.type === 'open elective') {
      const peTag = (s.tags || []).find(t => 
        /^(pe\s*\d+|elective\s*\d+|professional\s*elective\s*\d+|pe_group_\d+|oe_group_\d+)$/i.test(t.trim())
      );
      if (peTag) {
        const match = subjects.find(sub => 
          sub.id !== s.id && 
          sub.type === s.type && 
          (sub.tags || []).some(t => t.trim().toUpperCase() === peTag.trim().toUpperCase())
        );
        if (match) {
          inferredMode = 'same';
          inferredParallelId = match.id;
        }
      }
    }
    setSchedulingMode(inferredMode);
    setParallelSubjectId(inferredParallelId);
    
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingId) return;

    try {
      const baseTags = tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
      const finalTags = await resolveParallelTags(type, baseTags, schedulingMode === 'same' ? parallelSubjectId : '');

      let effectiveTags = [...finalTags];
      effectiveTags = effectiveTags.filter(t => !/^(?:hpw|hours):\d+$/i.test(t));
      if (hours > 10) {
        effectiveTags.push(`hpw:${hours}`);
      }
      effectiveTags = effectiveTags.filter(t => !/^credits:\d+$/i.test(t));
      if (credits > 6) {
        effectiveTags.push(`credits:${credits}`);
      }

      const safeHours = Math.max(1, Math.min(Number(hours) || 1, 10));
      const safeCredits = Math.max(1, Math.min(Number(credits) || 1, 6));
      const allowedTypes = ['theory', 'lab', 'elective', 'open elective', 'special', 'project'];
      const safeType = allowedTypes.includes(type) ? type : 'special';

      const updateData: any = { 
        name, 
        type: safeType, 
        hours_per_week: safeHours, 
        code: code || null,
        credits: safeCredits,
        tags: effectiveTags,
        abbreviation: abbreviation.trim() || null,
      };
      
      // Update max_faculty_count for lab subjects
      if (safeType === 'lab') {
        updateData.max_faculty_count = maxFacultyCount;
      }

      const { error } = await (supabase as any)
        .from('subjects')
        .update(updateData)
        .eq('id', editingId);

      if (error) throw error;

      setSubjects((list) => {
        const newList = list.map((x) =>
          x.id === editingId
            ? {
                ...x,
                name,
                type,
                hours_per_week: hours,
                code: code || null,
                credits: credits,
                max_faculty_count: type === 'lab' ? maxFacultyCount : x.max_faculty_count,
                tags: effectiveTags,
                abbreviation: abbreviation.trim() || null,
              }
            : x
        );
        return newList.sort((a, b) => a.name.localeCompare(b.name));
      });
      toast.success("Subject updated successfully");
      setEditOpen(false);
      resetForm();
    } catch (e: any) {
      console.error('Update error:', e);
      toast.error(e?.message || "Failed to update subject");
    }
  };

  // Edit modal UI
  // Simple dialog to edit a subject row
  // Reuses the same state variables (name, type, hours, code)

  const specialRows = useMemo<SubjectRow[]>(() => {
    return specialHoursList.map(item => ({
      id: `${item.configId}-${item.dayIndex}-${item.period}`,
      configId: item.configId,
      dayIndex: item.dayIndex,
      dayName: item.dayName,
      period: item.period,
      name: item.name,
      abbreviation: null,
      type: 'special' as const,
      hours_per_week: 1,
      credits: 0,
      code: null,
      year: year || "",
      tags: [item.dayName, `Period ${item.period}`],
    }));
  }, [specialHoursList, year]);

  const tableData = useMemo(() => {
    if (activeTab === 'theory') {
      const theorySubjects = subjects.filter(s => s.type === 'theory');
      const electiveSubjects = subjects.filter(s => s.type === 'elective');

      // Build one representative row per elective group, individual rows for ungrouped
      const seenGroupTags = new Set<string>();
      const electiveRows: SubjectRow[] = [];

      for (const s of electiveSubjects) {
        const groupTag = (s.tags || []).find(t => /^PE_Group_\d+$/i.test(t));
        if (groupTag && s.elective_group_name) {
          if (seenGroupTags.has(groupTag)) continue; // already added this group
          seenGroupTags.add(groupTag);
          const members = electiveSubjects.filter(x =>
            (x.tags || []).some(t => t === groupTag)
          );
          // Representative row: use group name as display, hours = same as any member
          const rep: SubjectRow = {
            ...members[0],
            id: `group_${groupTag}`, // synthetic ID
            name: s.elective_group_name,
            hours_per_week: members[0].hours_per_week, // all share same slot → same hours
            elective_group_name: s.elective_group_name,
            groupedSubjects: members,
          };
          electiveRows.push(rep);
        } else {
          electiveRows.push(s);
        }
      }

      return [...theorySubjects, ...electiveRows];
    }
    if (activeTab === 'lab') {
      return subjects.filter(s => s.type === 'lab');
    }
    if (activeTab === 'open elective') {
      const oes = subjects.filter(s => s.type === 'open elective');
      if (isCumulative) {
        return oes.map(s => ({
          ...s,
          hours_per_week: 5
        }));
      }
      return oes;
    }
    if (activeTab === 'special') {
      const specialSubjects = subjects.filter(s => s.type === 'special');
      return [...specialRows, ...specialSubjects];
    }
    return [];
  }, [subjects, specialRows, activeTab, isCumulative]);

  const tableFilters = useMemo(() => {
    if (activeTab === 'theory') {
      return [
        {
          key: "type",
          label: "Subject Type",
          options: [
            { label: "Theory Only", value: "theory" },
            { label: "Professional Elective", value: "elective" },
          ]
        }
      ];
    }
    if (activeTab === 'special') {
      return [
        {
          key: "dayIndex",
          label: "Day",
          options: [
            { label: "Monday", value: "0" },
            { label: "Tuesday", value: "1" },
            { label: "Wednesday", value: "2" },
            { label: "Thursday", value: "3" },
            { label: "Friday", value: "4" },
            { label: "Saturday", value: "5" },
          ],
          match: (item: any, value: string) => String(item.dayIndex) === value
        }
      ];
    }
    return [];
  }, [activeTab]);

  const tableColumns = useMemo(() => {
    if (activeTab === 'special') {
      return [
        {
          key: "name",
          header: "Special Hour Name",
          sortable: true,
          render: (s: SubjectRow) => <span className="font-semibold text-slate-900 dark:text-slate-100 capitalize">{s.name}</span>
        },
        {
          key: "dayName",
          header: "Day",
          sortable: true,
          render: (s: SubjectRow) => <span className="text-slate-700 dark:text-slate-300">{s.dayName || '-'}</span>
        },
        {
          key: "period",
          header: "Period",
          sortable: true,
          render: (s: SubjectRow) => <span className="text-slate-700 dark:text-slate-300">{s.period !== undefined ? `Period ${s.period}` : '-'}</span>
        },
        {
          key: "hours_per_week",
          header: "Hours/Week",
          sortable: true,
          render: (s: SubjectRow) => <span className="text-slate-700 dark:text-slate-300">{s.hours_per_week}h</span>
        },
        {
          key: "actions",
          header: "Actions",
          render: (s: SubjectRow) => (
            userType !== 'faculty' ? (
              s.configId ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10"
                  onClick={() => handleDeleteSpecialHourSlot(s.configId!, s.dayIndex!, s.period!)}
                >
                  Delete
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-600 dark:text-slate-300 hover:bg-muted" onClick={() => startEdit(s)}>Edit</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10"
                    onClick={() => handleDelete(s.id)}
                  >
                    Delete
                  </Button>
                </div>
              )
            ) : <span>—</span>
          )
        }
      ];
    }
    return [
      {
        key: "name",
        header: "Name",
        sortable: true,
        render: (s: SubjectRow) => {
          if (s.groupedSubjects && s.groupedSubjects.length > 0) {
            // This is a group representative row
            return (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Layers className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                  <span className="font-bold text-slate-900 dark:text-slate-100">{s.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 font-bold border border-violet-200 dark:border-violet-800/50">
                    GROUPED · {s.groupedSubjects.length} subjects
                  </span>
                </div>
                <div className="pl-5 space-y-0.5">
                  {s.groupedSubjects.map((m, i) => (
                    <div key={m.id} className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="text-[9px] font-bold text-violet-400">{i + 1}.</span>
                      <span>{m.name}</span>
                      {m.code && <span className="font-mono text-slate-400 dark:text-slate-500">({m.code})</span>}
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          return <span className="font-semibold text-slate-900 dark:text-slate-100">{s.name}</span>;
        }
      },
      {
        key: "abbreviation",
        header: "Abbr",
        sortable: true,
        render: (s: SubjectRow) => {
          if (s.groupedSubjects) return <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>;
          return <span className="text-slate-700 dark:text-slate-300">{s.abbreviation || '-'}</span>;
        }
      },
      {
        key: "type",
        header: "Type",
        sortable: true,
        render: (s: SubjectRow) => (
          s.groupedSubjects
            ? <Badge variant="outline" className="uppercase text-[10px] border-violet-300 text-violet-700 dark:text-violet-400 dark:border-violet-700">Elective Group</Badge>
            : <Badge variant={s.type === 'lab' ? 'default' : s.type === 'elective' || s.type === 'open elective' ? 'outline' : 'secondary'} className="uppercase text-[10px]">
                {s.type}
              </Badge>
        )
      },
      {
        key: "hours_per_week",
        header: "Hours/Week",
        sortable: true,
        render: (s: SubjectRow) => (
          <div>
            <span className="text-slate-700 dark:text-slate-300 font-semibold">{s.hours_per_week}h</span>
            {s.groupedSubjects && (
              <div className="text-[10px] text-violet-500 dark:text-violet-400 font-medium">shared slot</div>
            )}
          </div>
        )
      },
      {
        key: "credits",
        header: "Credits",
        sortable: true,
        render: (s: SubjectRow) => <span className="text-slate-700 dark:text-slate-300">{s.credits || 3}</span>
      },
      {
        key: "code",
        header: "Code",
        sortable: true,
        render: (s: SubjectRow) => {
          if (s.groupedSubjects) return <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>;
          return <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{s.code || '-'}</span>;
        }
      },
      {
        key: "tags",
        header: "Tags",
        render: (s: SubjectRow) => {
          if (s.groupedSubjects) return <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>;
          const otherTags = (s.tags || []).filter(t => !/^(PE_Group_|OE_Group_)\d+$/i.test(t) && !/^(?:hpw|hours):\d+$/i.test(t) && !/^credits:\d+$/i.test(t));
          return (
            <div className="flex flex-wrap gap-1">
              {otherTags.map(t => (
                <span key={t} className="bg-muted text-muted-foreground border border-border text-[10px] px-1.5 py-0.5 rounded font-semibold">{t}</span>
              ))}
              {otherTags.length === 0 && '-'}
            </div>
          );
        }
      },
      ...(activeTab === 'lab' ? [
        {
          key: "max_faculty_count",
          header: "Max Faculty",
          sortable: true,
          render: (s: SubjectRow) => <span className="text-slate-700 dark:text-slate-300">{s.type === 'lab' ? (s.max_faculty_count || 1) : '-'}</span>
        }
      ] : []),
      {
        key: "actions",
        header: "Actions",
        render: (s: SubjectRow) => {
          if (userType === 'faculty') return <span>—</span>;
          if (s.groupedSubjects) {
            // Group row: show Ungroup button
            const groupTag = (s.groupedSubjects[0].tags || []).find(t => /^PE_Group_\d+$/i.test(t));
            return (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30 border border-violet-200 dark:border-violet-800"
                onClick={() => groupTag && handleClearGroup(groupTag, s.groupedSubjects!.map(m => m.id))}
              >
                Ungroup
              </Button>
            );
          }
          return <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-600 dark:text-slate-300 hover:bg-muted" onClick={() => startEdit(s)}>Edit</Button>;
        }
      }
    ];
  }, [activeTab, userType, subjects, handleClearGroup, startEdit]);

  const handleBulkDeleteData = async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    if (activeTab === 'special') {
      try {
        for (const idStr of ids) {
          const [configId, dayIndexStr, periodStr] = idStr.split('-');
          const dayIndex = parseInt(dayIndexStr, 10);
          const period = parseInt(periodStr, 10);
          await handleDeleteSpecialHourSlot(configId, dayIndex, period);
        }
        toast.success("Selected special hours deleted");
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || "Failed to delete selected special hours");
      }
    } else {
      try {
        // Clean up references in associated tables to prevent FK constraint failures
        await Promise.allSettled([
          (supabase as any).from('faculty_subject_assignments').delete().in('subject_id', ids),
          (supabase as any).from('faculty_elective_assignments').delete().in('subject_id', ids),
          (supabase as any).from('section_subjects').delete().in('subject_id', ids),
          (supabase as any).from('lab_preferences').delete().in('subject_id', ids),
          (supabase as any).from('subject_type_subjects').delete().in('subject_id', ids),
        ]);
        const { error } = await (supabase as any)
          .from('subjects')
          .delete()
          .in('id', ids);
        if (error) throw error;
        setSubjects(prev => prev.filter(s => !ids.includes(s.id)));
        toast.success(`${ids.length} subject(s) deleted successfully`);
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || "Failed to delete subjects");
      }
    }
  };

  const SubjectTable = CustomTable<SubjectRow>;

  return (
    <div className={`min-h-screen relative overflow-x-hidden transition-colors duration-300 ${
      isDark ? "bg-[#060814] text-white" : "bg-[#f8faff] text-slate-900"
    }`}>
      {/* Ambient background light orbs for frosted glass refraction */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {isDark ? (
          <>
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-br from-indigo-600/12 via-purple-600/08 to-transparent blur-3xl opacity-70" />
            <div className="absolute top-1/3 -right-20 w-80 h-80 rounded-full bg-gradient-to-bl from-cyan-600/08 via-indigo-600/08 to-transparent blur-3xl opacity-60" />
            <div className="absolute -bottom-20 left-1/3 w-96 h-96 rounded-full bg-gradient-to-tr from-purple-600/08 via-indigo-600/06 to-transparent blur-3xl opacity-50" />
          </>
        ) : (
          <>
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-br from-indigo-200/40 via-purple-200/30 to-transparent blur-3xl opacity-75" />
            <div className="absolute top-1/4 -right-20 w-80 h-80 rounded-full bg-gradient-to-bl from-purple-200/35 via-indigo-100/40 to-transparent blur-3xl opacity-65" />
            <div className="absolute -bottom-20 left-1/3 w-96 h-96 rounded-full bg-gradient-to-tr from-indigo-100/40 via-purple-100/30 to-transparent blur-3xl opacity-50" />
          </>
        )}
      </div>

      {userType === 'super' ? <Navbar /> : userType === 'faculty' ? <FacultyNavbar /> : <AdminNavbar />}
      <main className={`transition-all duration-300 relative z-10 ${
        userType === 'faculty' ? "" : "md:pl-72"
      } ${
        userType === 'super' ? "pt-16 md:pt-16" : userType === 'faculty' ? "" : "pt-16 md:pt-0"
      }`}>
        <SelectionHeader />
        <section className="max-w-7xl mx-auto px-6 sm:px-8 py-8 md:py-10 space-y-8">
          {allocatedDepts.length > 1 && (
            <div className={`flex p-1.5 rounded-2xl border backdrop-blur-xl gap-2 overflow-x-auto whitespace-nowrap scrollbar-none shadow-sm ${
              isDark ? "bg-[#090d1c]/80 border-indigo-500/20" : "bg-white/80 border-indigo-200/60"
            }`}>
              {allocatedDepts.map((dept) => {
                const isActive = dept.id === activeDeptId;
                return (
                  <button
                    key={dept.id}
                    onClick={() => handleSwitchDepartment(dept)}
                    className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-200 ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/25 border border-indigo-400/40"
                        : isDark
                          ? "text-slate-400 hover:text-white hover:bg-white/[0.04]"
                          : "text-slate-600 hover:text-indigo-900 hover:bg-indigo-50/60"
                    }`}
                  >
                    {dept.name}
                  </button>
                );
              })}
            </div>
          )}

          <header className={`flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl backdrop-blur-2xl border transition-all duration-300 ${
            isDark ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.4)]" : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06)]"
          }`}>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-500 dark:text-indigo-300 text-xs font-bold border border-indigo-500/20 mb-2">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Curriculum &amp; Subject Allocation</span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight">{deptName || 'Department'} — Year {year}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage subject catalog, syllabus credit hours, electives, and lab allocations
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
              <div className={`flex items-center gap-1 p-1 rounded-xl border ${
                isDark ? "bg-[#0e1326] border-indigo-500/20" : "bg-indigo-50/70 border-indigo-100"
              }`}>
                <button
                  type="button"
                  onClick={() => setSemesterType("odd")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    semesterType === "odd"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/30 border border-indigo-400/40"
                      : isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Odd Sem
                </button>
                <button
                  type="button"
                  onClick={() => setSemesterType("even")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    semesterType === "even"
                      ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/30 border border-amber-400/40"
                      : isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Even Sem
                </button>
              </div>
              <Button 
                variant="outline" 
                className={`rounded-xl border font-semibold ${
                  isDark ? "border-indigo-500/30 bg-[#0e1326] text-white hover:bg-white/10" : "border-indigo-200 bg-white/80 text-slate-800 hover:bg-indigo-50"
                }`}
                onClick={() => {
                  if (userType === 'super') {
                    if (id) navigate(`/super-admin/departments/${id}`);
                    else navigate('/super-admin/departments');
                  } else {
                    navigate(userType === 'admin' ? (activeDeptId ? `/admin/subjects?deptId=${activeDeptId}` : '/admin/subjects') : (activeDeptId ? `/faculty/subjects?deptId=${activeDeptId}` : '/faculty/subjects'));
                  }
                }}
              >
                Back
              </Button>
            </div>
          </header>

        {/* Quick hours summary pill bar */}
        <div className="p-4 rounded-3xl border border-border/60 bg-card/50 backdrop-blur-xl shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="px-3.5 py-1.5 rounded-2xl bg-background/60 border border-border/40 backdrop-blur-md">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider mr-1.5">Total Hours:</span>
              <span className="text-sm font-bold text-foreground">{grandTotalHours}h</span>
              <span className="text-[11px] text-muted-foreground ml-1.5">({totalHours}h Subjects + {totalSpecialHours}h Special)</span>
            </div>
            <div className="px-3.5 py-1.5 rounded-2xl bg-background/60 border border-border/40 backdrop-blur-md text-xs">
              <span className="text-muted-foreground font-medium">Theory: </span>
              <span className="font-bold text-foreground">{theoryHours}h</span>
              <span className="text-muted-foreground mx-2">•</span>
              <span className="text-muted-foreground font-medium">Lab: </span>
              <span className="font-bold text-foreground">{labHours}h</span>
              {electiveHours > 0 && (
                <>
                  <span className="text-muted-foreground mx-2">•</span>
                  <span className="text-muted-foreground font-medium">PE: </span>
                  <span className="font-bold text-foreground">{electiveHours}h</span>
                </>
              )}
              {openElectiveHours > 0 && (
                <>
                  <span className="text-muted-foreground mx-2">•</span>
                  <span className="text-muted-foreground font-medium">OE: </span>
                  <span className="font-bold text-foreground">{openElectiveHours}h</span>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {grandTotalHours < 42 && grandTotalHours > 0 && subjects.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-3 py-1 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  Limited ({grandTotalHours}/42h)
                </span>
                {userType !== 'faculty' && (
                  <Button
                    size="sm"
                    onClick={handleAddLib}
                    disabled={addingLib}
                    className="h-8 px-3 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center gap-1.5"
                  >
                    <BookMarked className="h-3.5 w-3.5" />
                    <span>{addingLib ? "Adding..." : "Add Lib"}</span>
                  </Button>
                )}
              </div>
            )}
            {totalSpecialHours > 0 && (
              <div className="px-3.5 py-1.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs">
                <span className="text-amber-600 dark:text-amber-400 font-medium">Special: </span>
                <span className="font-bold text-amber-700 dark:text-amber-300">{totalSpecialHours}h</span>
                <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80 ml-1.5">
                  ({specialHoursBreakdown.map(sh => `${sh.name}: ${sh.hours}h`).join(', ')})
                </span>
              </div>
            )}
          </div>
        </div>

        {userType !== 'faculty' && (
          <Card className="rounded-3xl border border-border/60 bg-card/50 backdrop-blur-xl shadow-sm p-2 mb-6">
            <CardHeader>
              <CardTitle className="text-lg font-semibold tracking-tight">Add new subject</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                <div className="grid gap-3 md:grid-cols-5">
                  <Input placeholder={type === 'special' ? "Special Hour Name (e.g. Library, Counselling)" : "Name"} value={name} onChange={(e) => setName(e.target.value)} />
                  <Select value={type} onValueChange={(v: any) => { resetForm(); setType(v); }}>
                    <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="theory">Theory</SelectItem>
                      <SelectItem value="lab">Lab</SelectItem>
                      <SelectItem value="elective">Professional Elective</SelectItem>
                      <SelectItem value="open elective">Open Elective</SelectItem>
                      <SelectItem value="special">Special Hours</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" min={0} max={42} value={hours} onChange={(e) => setHours(parseInt(e.target.value || '0', 10))} placeholder="Hours/week" />
                  <Input type="number" min={1} max={6} value={credits} onChange={(e) => setCredits(parseInt(e.target.value || '3', 10))} placeholder="Credits" />
                  <Input placeholder="Code (optional)" value={code} onChange={(e) => setCode(e.target.value)} />
                </div>
                
                {type !== 'special' && (type === 'elective' || type === 'open elective') && (
                  <div className="grid gap-3 md:grid-cols-2 p-3 bg-slate-50/50 rounded-xl border border-slate-100">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block font-mono uppercase tracking-wider">Scheduling Mode</label>
                      <Select value={schedulingMode} onValueChange={(v: 'same' | 'different') => setSchedulingMode(v)}>
                        <SelectTrigger className="bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="different">Different Hour (Separate)</SelectItem>
                          <SelectItem value="same">Same Hour (Parallel)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {schedulingMode === 'same' && (
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block font-mono uppercase tracking-wider">Select Parallel Subject</label>
                        <Select value={parallelSubjectId} onValueChange={setParallelSubjectId}>
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Choose parallel elective..." />
                          </SelectTrigger>
                          <SelectContent>
                            {electiveSiblings.map(s => (
                              <SelectItem key={s.id} value={s.id}>{s.name} ({s.code || 'no code'})</SelectItem>
                            ))}
                            {electiveSiblings.length === 0 && (
                              <SelectItem value="none" disabled>No other electives added yet</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-5 items-center">
                  <div className="md:col-span-2">
                    <Input placeholder="Abbreviation (optional)" value={abbreviation} onChange={(e) => setAbbreviation(e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <Input placeholder="Tags (comma separated, e.g., PE4, SSA)" value={tags} onChange={(e) => setTags(e.target.value)} />
                  </div>
                  <Button onClick={handleAdd} disabled={!name.trim()} className="w-full font-bold">Add</Button>
                </div>
              </div>
              
              {/* Max Faculty Count for Lab Subjects */}
              {type === 'lab' && (
                <div className="mt-3">
                  <div className="flex items-center space-x-3">
                    <label className="text-sm font-medium">Maximum Faculty Members:</label>
                    <Select value={maxFacultyCount.toString()} onValueChange={(v: string) => setMaxFacultyCount(parseInt(v))}>
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                        <SelectItem value="3">3</SelectItem>
                        <SelectItem value="4">4</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">
                      Maximum number of faculty members that can be assigned to this lab subject
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}



        <Card className="rounded-3xl border border-border/60 bg-card/50 backdrop-blur-xl shadow-sm p-2 mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold tracking-tight">Year Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-5 sm:grid-cols-2 grid-cols-1">
              <div className="bg-background/50 p-4 rounded-2xl border border-border/40 backdrop-blur-md shadow-sm">
                <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Total Sections</div>
                <div className="text-2xl font-bold text-foreground mt-1">{sections.length}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Configured in timetables</div>
              </div>
              <div className="bg-background/50 p-4 rounded-2xl border border-border/40 backdrop-blur-md shadow-sm">
                <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Faculty Teaching</div>
                <div className="text-2xl font-bold text-foreground mt-1">{facultyInYear}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Total teaching faculty</div>
              </div>
              <div className="bg-background/50 p-4 rounded-2xl border border-border/40 backdrop-blur-md shadow-sm relative flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Total Hours / Wk</div>
                  {grandTotalHours < 42 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      Limited ({grandTotalHours}/42h)
                    </span>
                  )}
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <div className="text-2xl font-bold text-foreground">{grandTotalHours}h</div>
                  {grandTotalHours < 42 && grandTotalHours > 0 && subjects.length > 0 && userType !== 'faculty' && (
                    <Button
                      size="sm"
                      onClick={handleAddLib}
                      disabled={addingLib}
                      className="h-7 px-2.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center gap-1.5"
                    >
                      <BookMarked className="h-3.5 w-3.5" />
                      <span>{addingLib ? "Adding..." : "Add Lib"}</span>
                    </Button>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {subjects.length === 0
                    ? "No active curriculum courses"
                    : grandTotalHours < 42
                      ? `${42 - grandTotalHours}h deficit below 42h required`
                      : `${totalHours}h Subjects + ${totalSpecialHours}h Special`}
                </div>
              </div>
              <div className="bg-background/50 p-4 rounded-2xl border border-border/40 backdrop-blur-md shadow-sm">
                <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Theory vs Lab</div>
                <div className="text-2xl font-bold text-foreground mt-1">
                  {theoryHours}h / {labHours}h
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 font-medium">Theory vs Lab distribution</div>
              </div>
              <div className="bg-background/50 p-4 rounded-2xl border border-border/40 backdrop-blur-md shadow-sm sm:col-span-2 md:col-span-1">
                <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Special Hours</div>
                <div className="text-2xl font-bold text-foreground mt-1">{totalSpecialHours}h</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 truncate" title={specialHoursBreakdown.map(sh => `${sh.name}: ${sh.hours}h`).join(', ') || 'No special hours'}>
                  {specialHoursBreakdown.map(sh => `${sh.name}: ${sh.hours}h`).join(', ') || 'None configured'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tab Navbar for Theory, Lab, Open Electives, Special Hours */}
        <div className="flex flex-wrap p-1.5 rounded-2xl bg-card/50 border border-border/60 backdrop-blur-xl gap-2 mb-6 shadow-sm">
          <button
            onClick={() => setActiveTab('theory')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'theory'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            Theory / Electives
          </button>
          <button
            onClick={() => setActiveTab('lab')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'lab'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            Labs
          </button>
          <button
            onClick={() => setActiveTab('open elective')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'open elective'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            Open Electives
          </button>
          <button
            onClick={() => setActiveTab('special')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'special'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            Special Hours
          </button>
        </div>

        {activeTab === 'open elective' && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 p-4 rounded-3xl bg-card/50 border border-border/60 backdrop-blur-xl shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 px-3.5 py-1.5 rounded-2xl">
                <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">Group:</span>
                <span className="text-xs font-bold text-indigo-800 dark:text-indigo-200">{oeGroupName}</span>
              </div>
              <div className="flex items-center gap-2 bg-background/60 px-3.5 py-1.5 rounded-2xl border border-border/40 backdrop-blur-md">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">Total Hours:</span>
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{openElectiveTotalHours}h</span>
              </div>
              {oeIsSharedSlot && (
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-xl bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  Shared Slot
                </span>
              )}
            </div>

            {userType !== 'faculty' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setOeConfigHoursInput(openElectiveTotalHours);
                  setOeConfigOpen(true);
                }}
                className="flex items-center gap-2 border-indigo-300 text-indigo-700 dark:text-indigo-400 dark:border-indigo-700/50 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 font-semibold"
              >
                <Settings className="h-4 w-4" />
                <span>Group & Slot Config</span>
              </Button>
            )}
          </div>
        )}

        {/* Open Elective Config & Grouping Dialog */}
        <Dialog open={oeConfigOpen} onOpenChange={setOeConfigOpen}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-indigo-500" />
                Open Elective Group & Slot Config
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-5">
              {/* 1. Group Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Open Elective Group Name
                </label>
                <Input
                  value={oeGroupName}
                  onChange={(e) => setOeGroupName(e.target.value)}
                  placeholder="Open elective"
                  className="font-medium"
                />
                <p className="text-[11px] text-muted-foreground">
                  Specify a name for this open elective group / basket across all sections.
                </p>
              </div>

              {/* 2. Number of Hours */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Total Hours per Week for Group
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    min={1}
                    max={40}
                    value={oeConfigHoursInput || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setOeConfigHoursInput(isNaN(val) ? 0 : val);
                    }}
                    placeholder="e.g. 5"
                    className="font-medium pr-24"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground pointer-events-none">
                    hours / week
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Currently selected: <strong className="text-indigo-600 dark:text-indigo-400">{oeConfigHoursInput || 0}h / week</strong>
                </p>
              </div>

              {/* 3. Static Timetable Slot Allocation Grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Static Timetable Slot Allocation ({oeSelectedSlots.length} slots selected)
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 font-semibold"
                    onClick={() => {
                      const defs = ['Mon-1', 'Wed-1', 'Fri-1', 'Sat-1', 'Sat-2'];
                      setOeSelectedSlots(defs);
                      setOeConfigHoursInput(defs.length);
                    }}
                  >
                    Reset Default Slots
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Select the exact timetable periods where Open Electives will statically fit across all sections for Year {year}.
                </p>
                <div className="border rounded-xl p-3 bg-card space-y-1.5 overflow-x-auto shadow-sm">
                  <div className="grid grid-cols-8 gap-1 text-[10px] font-bold text-center text-muted-foreground uppercase border-b pb-1.5">
                    <div>Day</div>
                    {[1, 2, 3, 4, 5, 6, 7].map(p => <div key={p}>P{p}</div>)}
                  </div>
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="grid grid-cols-8 gap-1 items-center">
                      <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400 text-center">{day}</div>
                      {[1, 2, 3, 4, 5, 6, 7].map(period => {
                        const slotKey = `${day}-${period}`;
                        const isSelected = oeSelectedSlots.includes(slotKey);
                        return (
                          <button
                            key={slotKey}
                            type="button"
                            onClick={() => {
                              const next = isSelected
                                ? oeSelectedSlots.filter(s => s !== slotKey)
                                : [...oeSelectedSlots, slotKey];
                              setOeSelectedSlots(next);
                              setOeConfigHoursInput(next.length);
                            }}
                            className={`h-7 rounded-md font-semibold text-[11px] border transition-all ${
                              isSelected
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm font-bold scale-[1.03]'
                                : 'bg-muted/40 border-transparent hover:border-indigo-300 text-slate-700 dark:text-slate-300 hover:bg-indigo-50/50'
                            }`}
                          >
                            {isSelected ? '✓' : `P${period}`}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. Shared Slot Toggle */}
              <div className="p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/50 dark:bg-indigo-950/20 flex items-start gap-3">
                <Checkbox
                  id="sharedSlotCheck"
                  checked={oeIsSharedSlot}
                  onCheckedChange={(c) => setOeIsSharedSlot(Boolean(c))}
                  className="mt-1 border-indigo-400 data-[state=checked]:bg-indigo-600"
                />
                <label htmlFor="sharedSlotCheck" className="cursor-pointer space-y-0.5">
                  <div className="text-xs font-bold text-indigo-800 dark:text-indigo-300">
                    Shared Slot across all sections
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-normal">
                    When enabled, all Open Elective subjects in this group run concurrently in a single shared timetable slot across sections.
                  </div>
                </label>
              </div>

              {/* 5. Open Elective Subjects Summary */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Open Elective Subjects ({subjects.filter(s => s.type === 'open elective').length})</span>
                </label>
                <div className="border rounded-xl divide-y max-h-40 overflow-y-auto bg-muted/20">
                  {subjects.filter(s => s.type === 'open elective').length === 0 ? (
                    <div className="p-3.5 text-xs text-muted-foreground text-center">
                      No open elective subjects added yet. All open electives added will automatically be included in this group with {oeConfigHoursInput}h shared slot.
                    </div>
                  ) : (
                    subjects.filter(s => s.type === 'open elective').map(s => (
                      <div key={s.id} className="p-2.5 flex items-center justify-between text-xs bg-indigo-50/40 dark:bg-indigo-950/20">
                        <div className="flex items-center gap-2">
                          <Checkbox checked disabled className="border-indigo-500 bg-indigo-500 text-white cursor-default" />
                          <span className="font-semibold text-foreground truncate">{s.name}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px] bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 font-bold">
                          {oeGroupName || "Open elective"}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setOeConfigOpen(false)}>Cancel</Button>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                onClick={async () => {
                  const targetDeptId = activeDeptId;
                  const finalGroupName = oeGroupName.trim() || "Open elective";
                  setOpenElectiveTotalHours(oeConfigHoursInput);
                  setOeGroupName(finalGroupName);
                  setIsCumulative(true);

                  if (targetDeptId && year) {
                    await setOpenElectiveConfig(targetDeptId, year, {
                      hours: oeConfigHoursInput,
                      group_name: finalGroupName,
                      is_shared_slot: oeIsSharedSlot,
                      selected_slots: oeSelectedSlots
                    });
                  }

                  if (subjects.some(s => s.type === 'open elective')) {
                    const oeSubs = subjects.filter(s => s.type === 'open elective');
                    for (const sub of oeSubs) {
                      await (supabase as any)
                        .from('subjects')
                        .update({ elective_group_name: finalGroupName, hours_per_week: oeConfigHoursInput })
                        .eq('id', sub.id);
                    }
                    setSubjects(prev => prev.map(s => s.type === 'open elective' ? { ...s, elective_group_name: finalGroupName, hours_per_week: oeConfigHoursInput } : s));
                  }

                  setOeConfigOpen(false);
                  toast.success(`Open Elective Group "${finalGroupName}" configured (${oeConfigHoursInput}h, ${oeIsSharedSlot ? 'Shared Slot' : 'Individual Slots'})`);
                }}
              >
                Save Configuration
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Elective Grouping Button — only shown on theory tab and for admins */}
        {activeTab === 'theory' && userType !== 'faculty' && (
          <div className="flex items-center gap-3 mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setGroupSelectedIds([]);
                setGroupName('');
                setGroupingOpen(true);
              }}
              className="flex items-center gap-2 border-violet-300 text-violet-700 dark:text-violet-400 dark:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30 font-semibold"
            >
              <Layers className="h-4 w-4" />
              Elective Grouping
            </Button>
            <span className="text-xs text-muted-foreground">Group electives that share the same time slot with a custom display name</span>
          </div>
        )}

        <SubjectTable
          data={tableData}
          getRowId={(s) => s.id}
          searchKey={(s) => `${s.name} ${s.code || ""}`}
          searchPlaceholder={activeTab === 'special' ? "Search special hours by name..." : "Search subjects by name or code..."}
          exportFileName={`${deptName.replace(/\s+/g, '_')}_yr${year}_${activeTab}_export`}
          filters={tableFilters}
          onDeleteSelected={userType !== 'faculty' ? handleBulkDeleteData : undefined}
          columns={tableColumns}
          renderItemCard={(s, isSelected, onToggleSelect) => (
            activeTab === 'special' ? (
              <div 
                key={s.id} 
                onClick={onToggleSelect}
                className={`p-5 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col justify-between h-full bg-card ${
                  isSelected 
                    ? 'border-indigo-500/50 shadow-md shadow-indigo-500/10 bg-indigo-500/[0.04] ring-1 ring-indigo-500/30 text-foreground' 
                    : 'border-border hover:border-muted-foreground/35 hover:bg-muted/10 text-foreground shadow-sm'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-tight capitalize">{s.name}</h4>
                    <Badge variant="outline" className="uppercase text-[9px] shrink-0">
                      {s.type}
                    </Badge>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 mt-3 font-semibold">
                    {s.dayName ? `${s.dayName} • Period ${s.period}` : 'No slot assigned'}
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>{s.hours_per_week}h/week</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <Checkbox 
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelect()}
                      onClick={(e) => e.stopPropagation()}
                      className="border-border bg-background data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                    />
                    {userType !== 'faculty' && (
                      s.configId ? (
                        <Button 
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2.5 rounded-lg text-[10px] font-medium text-red-500 hover:text-red-600 hover:bg-red-500/10"
                          onClick={(e) => { e.stopPropagation(); handleDeleteSpecialHourSlot(s.configId!, s.dayIndex!, s.period!); }}
                        >
                          Delete
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <button 
                            onClick={(e) => { e.stopPropagation(); startEdit(s); }}
                            className="h-6 px-2.5 rounded-lg text-[10px] font-medium transition-colors bg-secondary text-secondary-foreground hover:bg-secondary/80"
                          >
                            Edit
                          </button>
                          <Button 
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2.5 rounded-lg text-[10px] font-medium text-red-500 hover:text-red-600 hover:bg-red-500/10"
                            onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                          >
                            Delete
                          </Button>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div 
                key={s.id} 
                onClick={onToggleSelect}
                className={`p-5 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col justify-between h-full bg-card ${
                  isSelected 
                    ? 'border-indigo-500/50 shadow-md shadow-indigo-500/10 bg-indigo-500/[0.04] ring-1 ring-indigo-500/30 text-foreground' 
                    : 'border-border hover:border-muted-foreground/35 hover:bg-muted/10 text-foreground shadow-sm'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-tight">{s.name}</h4>
                      {s.elective_group_name && (() => {
                        const groupTag = (s.tags || []).find(t => /^PE_Group_\d+$/i.test(t));
                        const combinedHours = groupTag
                          ? subjects.filter(x => (x.tags || []).some(t => t === groupTag)).reduce((a, x) => a + x.hours_per_week, 0)
                          : s.hours_per_week;
                        return (
                          <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 border border-violet-200 dark:border-violet-800/50 text-[10px] font-bold">
                            <Layers className="h-2.5 w-2.5" />
                            {s.elective_group_name} • {combinedHours}h combined
                          </span>
                        );
                      })()}
                    </div>
                    <Badge variant={s.type === 'lab' ? 'default' : s.type === 'elective' || s.type === 'open elective' ? 'outline' : 'secondary'} className="uppercase text-[9px] shrink-0">
                      {s.type}
                    </Badge>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 font-mono flex flex-wrap items-center gap-2">
                    {s.code && <span className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1 py-0.5 rounded text-slate-700 dark:text-slate-300">{s.code}</span>}
                    {s.abbreviation && <span className="text-slate-600 dark:text-slate-400 font-semibold">({s.abbreviation})</span>}
                  </div>
                  {s.tags && s.tags.filter(t => !/^(PE_Group_|OE_Group_)\d+$/i.test(t)).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {s.tags.filter(t => !/^(PE_Group_|OE_Group_)\d+$/i.test(t)).map((t) => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold border border-border">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>{s.hours_per_week}h/week • {s.credits || 3} credits {s.type === 'lab' ? `• Max Fac: ${s.max_faculty_count || 1}` : ''}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.elective_group_name && userType !== 'faculty' && (() => {
                      const groupTag = (s.tags || []).find(t => /^PE_Group_\d+$/i.test(t));
                      const groupMembers = groupTag ? subjects.filter(x => (x.tags || []).some(t => t === groupTag)) : [];
                      return groupTag ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleClearGroup(groupTag, groupMembers.map(m => m.id)); }}
                          className="h-6 px-2 rounded text-[9px] font-semibold text-violet-600 border border-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"
                        >
                          Clear Group
                        </button>
                      ) : null;
                    })()}
                    <Checkbox 
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelect()}
                      onClick={(e) => e.stopPropagation()}
                      className="border-border bg-background data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                    />
                    {userType !== 'faculty' && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); startEdit(s); }}
                        className="h-6 px-2.5 rounded-lg text-[10px] font-medium transition-colors bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          )}
        />

        <div className="mt-6">
          <Link className="text-sm underline text-muted-foreground hover:text-foreground" to={userType === 'super' ? "/super-admin/departments" : (activeDeptId ? `/admin/subjects?deptId=${activeDeptId}` : "/admin/subjects")}>Back to {userType === 'super' ? 'Departments' : 'Subjects'}</Link>
        </div>
      </section>

      {/* Edit Subject Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit subject</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-5">
              <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="theory">Theory</SelectItem>
                  <SelectItem value="lab">Lab</SelectItem>
                  <SelectItem value="elective">Professional Elective</SelectItem>
                  <SelectItem value="open elective">Open Elective</SelectItem>
                  <SelectItem value="special">Special Hours</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" min={0} max={42} value={hours} onChange={(e) => setHours(parseInt(e.target.value || '0', 10))} placeholder="Hours/week" />
              <Input type="number" min={1} max={6} value={credits} onChange={(e) => setCredits(parseInt(e.target.value || '3', 10))} placeholder="Credits" />
              <Input placeholder="Code (optional)" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>

            {(type === 'elective' || type === 'open elective') && (
              <div className="grid gap-3 md:grid-cols-2 p-3 bg-slate-50/50 rounded-xl border border-slate-100">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block font-mono uppercase tracking-wider">Scheduling Mode</label>
                  <Select value={schedulingMode} onValueChange={(v: 'same' | 'different') => setSchedulingMode(v)}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="different">Different Hour (Separate)</SelectItem>
                      <SelectItem value="same">Same Hour (Parallel)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {schedulingMode === 'same' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block font-mono uppercase tracking-wider">Select Parallel Subject</label>
                    <Select value={parallelSubjectId} onValueChange={setParallelSubjectId}>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Choose parallel elective..." />
                      </SelectTrigger>
                      <SelectContent>
                        {electiveSiblings.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name} ({s.code || 'no code'})</SelectItem>
                        ))}
                        {electiveSiblings.length === 0 && (
                          <SelectItem value="none" disabled>No other electives added yet</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <Input placeholder="Abbreviation (optional)" value={abbreviation} onChange={(e) => setAbbreviation(e.target.value)} />
              <Input placeholder="Tags (comma separated, e.g., PE4, SSA)" value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
          </div>

          {/* Max Faculty Count for Lab Subjects in Edit */}
          {type === 'lab' && (
            <div className="mt-3">
              <div className="flex items-center space-x-3">
                <label className="text-sm font-medium">Maximum Faculty Members:</label>
                <Select value={maxFacultyCount.toString()} onValueChange={(v: string) => setMaxFacultyCount(parseInt(v))}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="4">4</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                  Maximum number of faculty members that can be assigned to this lab subject
                </span>
              </div>
            </div>
          )}
          <div className="mt-4 flex items-center gap-2 justify-end">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Elective Grouping Dialog */}
      <Dialog open={groupingOpen} onOpenChange={setGroupingOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-violet-500" />
              Elective Grouping
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">Custom Group Name</label>
              <Input
                placeholder="e.g. Professional Elective I"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                className="font-medium"
              />
              <p className="text-xs text-muted-foreground mt-1">This group name will be assigned to all selected electives.</p>
            </div>

            {/* Hours selection for Elective Group */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block">
                Hours per Week for Group
              </label>
              <div className="relative">
                <Input
                  type="number"
                  min={1}
                  max={40}
                  value={groupHoursInput || ''}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setGroupHoursInput(isNaN(val) ? 0 : val);
                  }}
                  placeholder="e.g. 3"
                  className="font-medium pr-24"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground pointer-events-none">
                  hours / week
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Selected: <strong className="text-violet-600 dark:text-violet-400">{groupHoursInput || 0}h / week</strong> for all electives in this group.
              </p>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                Select Electives to Group
                {groupSelectedIds.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-violet-600 dark:text-violet-400">
                    {groupSelectedIds.length} selected • {groupHoursInput}h/week each
                  </span>
                )}
              </label>
              <div className="border rounded-xl divide-y divide-border max-h-64 overflow-y-auto">
                {subjects.filter(s => s.type === 'elective').length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">No elective subjects found</div>
                ) : subjects.filter(s => s.type === 'elective').map(s => {
                  const checked = groupSelectedIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                        checked ? 'bg-violet-50 dark:bg-violet-950/20' : 'hover:bg-muted/40'
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(c) => {
                          setGroupSelectedIds(prev =>
                            c ? [...prev, s.id] : prev.filter(x => x !== s.id)
                          );
                        }}
                        className="mt-0.5 border-violet-400 data-[state=checked]:bg-violet-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">{s.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground font-mono">{s.code || 'No code'}</span>
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{s.hours_per_week}h/week</span>
                          {s.elective_group_name && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 font-semibold">
                              {s.elective_group_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
            {groupSelectedIds.length >= 2 && groupName.trim() && (
              <div className="p-3 rounded-xl bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800/50 text-sm">
                <div className="font-semibold text-violet-700 dark:text-violet-300 mb-1">Preview</div>
                <div className="text-violet-600 dark:text-violet-400 text-xs">
                  <span className="font-bold">{groupName}</span> — {groupSelectedIds.length} electives, <span className="font-bold">{groupHoursInput}h / week</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {subjects.filter(s => groupSelectedIds.includes(s.id)).map(s => (
                    <span key={s.id} className="text-[10px] px-1.5 py-0.5 rounded bg-violet-200 dark:bg-violet-900/50 text-violet-800 dark:text-violet-200 font-medium">{s.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setGroupingOpen(false)}>Cancel</Button>
            <Button
              onClick={handleElectiveGroupSave}
              disabled={groupingSaving || groupSelectedIds.length < 2 || !groupName.trim()}
              className="bg-violet-600 hover:bg-violet-700 text-white font-semibold"
            >
              {groupingSaving ? 'Saving...' : 'Save Group'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </main>
    </div>
  );
};

export default YearSubjects;
