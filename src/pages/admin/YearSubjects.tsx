import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSubjectsForYear } from "@/lib/supabaseService";
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
import SelectionHeader from "@/components/admin/SelectionHeader";
import { Trash2, Download, LayoutGrid, List, Plus, Layers, Settings } from "lucide-react";
import * as XLSX from "xlsx";

interface SubjectRow {
  id: string;
  name: string;
  type: 'theory' | 'lab' | 'elective' | 'open elective' | 'special';
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
  const { id, year } = useParams();
  const navigate = useNavigate();
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
  const [type, setType] = useState<'theory' | 'lab' | 'elective' | 'open elective' | 'special'>("theory");
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
  // Open Elective Config
  const [oeConfigOpen, setOeConfigOpen] = useState(false);
  const [openElectiveTotalHours, setOpenElectiveTotalHours] = useState<number>(5);
  const [oeConfigHoursInput, setOeConfigHoursInput] = useState<number>(5);
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
  const [groupingSaving, setGroupingSaving] = useState(false);

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
    const groupedTotal = Array.from(peGroups.values()).reduce((a, b) => a + b, 0);
    return groupedTotal + untaggedSum;
  }, [subjects]);

  const openElectiveHours = useMemo(() => {
    const oes = subjects.filter(s => s.type === 'open elective');
    if (oes.length === 0) return 0;
    // Always return the configured total hours when open electives are present
    return openElectiveTotalHours;
  }, [subjects, openElectiveTotalHours]);

  const theoryHours = useMemo(() => {
    const traditionalTheory = subjects.filter(s => s.type === 'theory').reduce((a, b) => a + (b.hours_per_week || 0), 0);
    return traditionalTheory + electiveHours + openElectiveHours;
  }, [subjects, electiveHours, openElectiveHours]);

  const labHours = useMemo(() => subjects.filter(s => s.type === 'lab').reduce((a, b) => a + (b.hours_per_week || 0), 0), [subjects]);

  const totalHours = useMemo(() => {
    return theoryHours + labHours;
  }, [theoryHours, labHours]);

  const totalSpecialHours = useMemo(() => {
    const configHours = specialHours.reduce((acc, curr) => acc + (curr.total_hours || 0), 0);
    const subjectHours = subjects.filter(s => s.type === 'special').reduce((a, b) => a + (b.hours_per_week || 0), 0);
    return configHours + subjectHours;
  }, [specialHours, subjects]);

  const grandTotalHours = useMemo(() => {
    return totalHours + totalSpecialHours;
  }, [totalHours, totalSpecialHours]);

  const specialHoursBreakdown = useMemo(() => {
    const breakdown = specialHours.map(sh => ({
      name: sh.special_type,
      hours: sh.total_hours || 0
    })).filter(item => item.hours > 0);

    subjects.filter(s => s.type === 'special').forEach(s => {
      breakdown.push({
        name: s.name,
        hours: s.hours_per_week
      });
    });

    return breakdown;
  }, [specialHours, subjects]);



  useEffect(() => {
    document.title = `Manage Subjects - ${year}`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Add, update, and delete subjects for the selected department year.");
  }, [year]);

  useEffect(() => {
    const targetDeptId = id || sessionUser?.department_id;
    if (!isLoggedIn) { navigate('/', { replace: true }); return; }
    if (!targetDeptId || !year) return;
    (async () => {
      const { data: d } = await (supabase as any).from('departments').select('*').eq('id', targetDeptId).single();
      if (d?.name) setDeptName(d.name);
      const list = await (async () => {
        try {
          const arr = await getSubjectsForYear(targetDeptId, year);
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
      // Sort subjects alphabetically by name
      const sortedList = (list || []).sort((a, b) => a.name.localeCompare(b.name));
      setSubjects(sortedList);
      const [ttRes, fsaRes, shRes] = await Promise.all([
        (supabase as any).from('timetables').select('section').eq('department_id', targetDeptId).eq('year', year),
        (supabase as any).from('faculty_subject_assignments').select('*', { count: 'exact', head: true }).eq('department_id', targetDeptId).eq('year', year),
        (supabase as any).from('special_hours_config').select('*').eq('department_id', targetDeptId).eq('year', year).eq('is_active', true).order('special_type')
      ]);
      const secs: string[] = Array.from(new Set<string>((ttRes.data || []).map((t: any) => String(t.section))));
      setSections(secs);
      setFacultyInYear(fsaRes?.count || 0);
      setSpecialHours(shRes.data || []);
      setLoading(false);
    })();
  }, [isLoggedIn, id, year]);

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
    const targetDeptId = id || sessionUser?.department_id;
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

  const handleAddSpecialHourSlot = async (overrideName?: string) => {
    const finalName = (overrideName || specialTypeName).trim();
    if (!finalName || !specialDay || !specialPeriod) {
      toast.error("Special hour name, day, and period are required");
      return;
    }
    const targetDeptId = id || sessionUser?.department_id;
    if (!targetDeptId || !year) return;

    const dayIdx = parseInt(specialDay, 10);
    const prIdx = parseInt(specialPeriod, 10);
    const slotCode = dayIdx * 10 + prIdx;

    try {
      const existing = specialHours.find(
        (sh) => sh.special_type.toLowerCase() === finalName.toLowerCase()
      );

      if (existing) {
        const satPeriods = existing.saturday_periods || [];
        const wkPeriods = existing.weekdays_periods || [];
        if (satPeriods.includes(slotCode) || wkPeriods.includes(slotCode)) {
          toast.error("This special hour slot is already added");
          return;
        }

        const isSat = dayIdx === 5;
        const newSatPeriods = isSat ? [...satPeriods, slotCode] : satPeriods;
        const newSatHours = isSat ? existing.saturday_hours + 1 : existing.saturday_hours;
        
        const newWkPeriods = !isSat ? [...wkPeriods, slotCode] : wkPeriods;
        const newWkHours = !isSat ? existing.weekdays_hours + 1 : existing.weekdays_hours;

        const newTotal = newSatHours + newWkHours;

        const { error } = await (supabase as any)
          .from('special_hours_config')
          .update({
            saturday_periods: newSatPeriods,
            saturday_hours: newSatHours,
            weekdays_periods: newWkPeriods,
            weekdays_hours: newWkHours,
            total_hours: newTotal,
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
    
    const targetDeptId = id || sessionUser?.department_id;
    try {
      const baseTags = tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
      const finalTags = await resolveParallelTags(type, baseTags, schedulingMode === 'same' ? parallelSubjectId : '');

      const subjectData: any = {
        department_id: targetDeptId,
        year,
        name: name.trim(),
        type,
        hours_per_week: hours,
        code: code.trim() || null,
        credits: credits,
        tags: finalTags,
        abbreviation: abbreviation.trim() || null,
      };
      
      // Add max_faculty_count for lab subjects
      if (type === 'lab') {
        subjectData.max_faculty_count = maxFacultyCount;
      }
      
      const { data, error } = await (supabase as any).from('subjects').insert(subjectData).select().single();
      if (error) { 
        console.error('Subject addition error:', error);
        toast.error(`Failed to add subject: ${error.message}`); 
        return; 
      }
      setSubjects((s) => {
        const newList = [...s, data as SubjectRow];
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
          .update({ tags: newTags, elective_group_name: groupName.trim() })
          .eq('id', sid);
        if (error) throw error;
      }
      // Update local state
      setSubjects(prev => prev.map(s =>
        groupSelectedIds.includes(s.id)
          ? { ...s, elective_group_name: groupName.trim(), tags: Array.from(new Set([...(s.tags || []).filter(t => !/^PE_Group_\d+$/i.test(t)), groupTag])) }
          : s
      ));
      toast.success(`Grouped ${groupSelectedIds.length} electives under "${groupName.trim()}"`);
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
    setTags(s.tags ? s.tags.join(", ") : "");
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

      const updateData: any = { 
        name, 
        type, 
        hours_per_week: hours, 
        code: code || null,
        credits: credits,
        tags: finalTags,
        abbreviation: abbreviation.trim() || null,
      };
      
      // Update max_faculty_count for lab subjects
      if (type === 'lab') {
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
                tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
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
          const otherTags = (s.tags || []).filter(t => !/^(PE_Group_|OE_Group_)\d+$/i.test(t));
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
        const { error } = await (supabase as any)
          .from('subjects')
          .delete()
          .in('id', ids);
        if (error) throw error;
        setSubjects(prev => prev.filter(s => !ids.includes(s.id)));
        toast.success("Subjects deleted successfully");
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || "Failed to delete subjects");
      }
    }
  };

  const SubjectTable = CustomTable<SubjectRow>;

  return (
    <main className="min-h-screen bg-background">
      {userType === 'super' ? <Navbar /> : userType === 'admin' ? <AdminNavbar /> : <Navbar />}
      <div className={`${
        userType === 'faculty' ? "" : "md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80"
      } pt-16 ${
        userType === 'super' ? "md:pt-14" : "md:pt-0"
      } transition-all duration-300`}>
        <SelectionHeader />
        <section className="container py-4">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{deptName || 'Department'} — Year {year}</h1>
            <div className="text-sm text-muted-foreground mt-1.5 space-y-1">
              <div className="flex flex-wrap gap-x-4 items-center">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Total Hours: <span className="font-bold text-slate-900 dark:text-white">{grandTotalHours}h</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-normal ml-1.5">
                    ({totalHours}h Subjects + {totalSpecialHours}h Special)
                  </span>
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Theory: <span className="font-bold text-slate-900 dark:text-white">{theoryHours}h</span>
                </span>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Lab: <span className="font-bold text-slate-900 dark:text-white">{labHours}h</span>
                </span>
                {electiveHours > 0 && (
                  <>
                    <span className="text-slate-300 dark:text-slate-700">|</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Professional Elective: <span className="font-bold text-slate-900 dark:text-white">{electiveHours}h</span>
                    </span>
                  </>
                )}
                {openElectiveHours > 0 && (
                  <>
                    <span className="text-slate-300 dark:text-slate-700">|</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Open Elective: <span className="font-bold text-slate-900 dark:text-white">{openElectiveHours}h</span>
                    </span>
                  </>
                )}
                {totalSpecialHours > 0 && (
                  <>
                    <span className="text-slate-300 dark:text-slate-700">|</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Special Hours: <span className="font-bold text-slate-900 dark:text-white">{totalSpecialHours}h</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal ml-1">
                        ({specialHoursBreakdown.map(sh => `${sh.name}: ${sh.hours}h`).join(', ')})
                      </span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={() => {
            if (userType === 'super') navigate(`/super-admin/departments/${id}`);
            else navigate(userType === 'admin' ? '/admin/subjects' : '/faculty/subjects');
          }}>Back</Button>
        </header>

        {userType !== 'faculty' && (
          <Card className="rounded-xl mb-6">
            <CardHeader>
              <CardTitle className="text-base">Add new subject</CardTitle>
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



        <Card className="rounded-xl mb-6 shadow-sm border border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100">Year statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-5 sm:grid-cols-2 grid-cols-1">
              <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total sections</div>
                <div className="text-2xl font-bold text-foreground mt-1">{sections.length}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Configured in timetables</div>
              </div>
              <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Faculty teaching</div>
                <div className="text-2xl font-bold text-foreground mt-1">{facultyInYear}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Total teaching faculty</div>
              </div>
              <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total hours/week</div>
                <div className="text-2xl font-bold text-foreground mt-1">{grandTotalHours}h</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {totalHours}h Subjects + {totalSpecialHours}h Special
                </div>
              </div>
              <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Theory vs Lab hours</div>
                <div className="text-2xl font-bold text-foreground mt-1">
                  {theoryHours}h / {labHours}h
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 font-medium">Theory vs Lab hours</div>
              </div>
              <div className="bg-muted/30 p-4 rounded-xl border border-border/50 sm:col-span-2 md:col-span-1">
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Special Hours</div>
                <div className="text-2xl font-bold text-foreground mt-1">{totalSpecialHours}h</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 truncate" title={specialHoursBreakdown.map(sh => `${sh.name}: ${sh.hours}h`).join(', ') || 'No special hours'}>
                  {specialHoursBreakdown.map(sh => `${sh.name}: ${sh.hours}h`).join(', ') || 'None configured'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tab Navbar for Theory, Lab, Open Electives, Special Hours */}
        <div className="flex border-b border-border/80 pb-0.5 mb-6 gap-6 items-center">
          <button
            onClick={() => setActiveTab('theory')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-all relative ${
              activeTab === 'theory'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Theory / Electives
            {activeTab === 'theory' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('lab')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-all relative ${
              activeTab === 'lab'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Labs
            {activeTab === 'lab' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('open elective')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-all relative ${
              activeTab === 'open elective'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Open Electives
            {activeTab === 'open elective' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('special')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-all relative ${
              activeTab === 'special'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Special Hours
            {activeTab === 'special' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-full" />
            )}
          </button>
        </div>

        {activeTab === 'open elective' && (
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center gap-2 bg-card border border-border/80 px-4 py-2.5 rounded-xl shadow-sm">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Total Hours:</span>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{openElectiveTotalHours}h</span>
              <span className="text-xs text-slate-400 dark:text-slate-500">(shared slot)</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOeConfigHoursInput(openElectiveTotalHours);
                setOeConfigOpen(true);
              }}
              className="flex items-center gap-2 border-emerald-300 text-emerald-700 dark:text-emerald-400 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-semibold"
            >
              <Settings className="h-4 w-4" />
              Config
            </Button>
          </div>
        )}

        {/* Open Elective Config Dialog */}
        <Dialog open={oeConfigOpen} onOpenChange={setOeConfigOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-emerald-500" />
                Open Elective Config
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Set the total number of hours per week allocated for the Open Elective slot.
                All open elective subjects share this single slot in the timetable.
              </p>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Total Hours per Week</label>
                <div className="flex gap-2 flex-wrap">
                  {[1, 2, 3, 4, 5, 6].map(h => (
                    <button
                      key={h}
                      onClick={() => setOeConfigHoursInput(h)}
                      className={`w-12 h-12 rounded-xl font-bold text-base border-2 transition-all ${
                        oeConfigHoursInput === h
                          ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg scale-105'
                          : 'bg-card border-border text-slate-700 dark:text-slate-300 hover:border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/20'
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Currently set to <strong>{oeConfigHoursInput}h</strong> per week.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOeConfigOpen(false)}>Cancel</Button>
              <Button
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
                onClick={() => {
                  setOpenElectiveTotalHours(oeConfigHoursInput);
                  setIsCumulative(true);
                  setOeConfigOpen(false);
                  toast.success(`Open Elective total hours set to ${oeConfigHoursInput}h`);
                }}
              >
                Save
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
                    ? 'border-emerald-500 shadow-md shadow-emerald-500/5 bg-muted/30 text-foreground' 
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
                      className="border-border bg-background data-[state=checked]:bg-emerald-500"
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
                    ? 'border-emerald-500 shadow-md shadow-emerald-500/5 bg-muted/30 text-foreground' 
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
                      className="border-border bg-background data-[state=checked]:bg-emerald-500"
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
          <Link className="text-sm underline text-muted-foreground hover:text-foreground" to={userType === 'super' ? "/super-admin/departments" : "/admin/subjects"}>Back to {userType === 'super' ? 'Departments' : 'Subjects'}</Link>
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
    </div>

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
                placeholder="e.g. Professional Elective IV"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                className="font-medium"
              />
              <p className="text-xs text-muted-foreground mt-1">This name will appear in the table and combined hour count will be shown.</p>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                Select Electives to Group
                {groupSelectedIds.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-violet-600 dark:text-violet-400">
                    {groupSelectedIds.length} selected • Combined: {subjects.filter(s => groupSelectedIds.includes(s.id)).reduce((a, s) => a + s.hours_per_week, 0)}h
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
                  <span className="font-bold">{groupName}</span> — {groupSelectedIds.length} electives, <span className="font-bold">{subjects.filter(s => groupSelectedIds.includes(s.id)).reduce((a, s) => a + s.hours_per_week, 0)}h</span> combined
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
  );
};

export default YearSubjects;
