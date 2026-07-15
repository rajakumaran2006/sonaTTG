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
import { Trash2, Download, LayoutGrid, List, Plus } from "lucide-react";
import * as XLSX from "xlsx";

interface SubjectRow {
  id: string;
  name: string;
  type: 'theory' | 'lab' | 'elective' | 'open elective';
  hours_per_week: number;
  year: string;
  code: string | null;
  max_faculty_count?: number;
  credits?: number;
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
  const [type, setType] = useState<'theory' | 'lab' | 'elective' | 'open elective'>("theory");
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
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);

  const [filterType, setFilterType] = useState<string>("all");
  const [viewMode, setViewMode] = useState<'table' | 'list'>('table');

  const filteredSubjects = useMemo(() => {
    return subjects.filter((s) => {
      const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) || 
                            (s.code && s.code.toLowerCase().includes(search.toLowerCase())) ||
                            (s.abbreviation && s.abbreviation.toLowerCase().includes(search.toLowerCase()));
      const matchesType = filterType === "all" || s.type === filterType;
      return !!matchesSearch && matchesType;
    });
  }, [subjects, search, filterType]);

  const totalHours = useMemo(() => subjects.reduce((a, b) => a + (b.hours_per_week || 0), 0), [subjects]);
  
  const hoursByType = useMemo(() => subjects.reduce((acc, subject) => {
    const type = subject.type;
    acc[type] = (acc[type] || 0) + (subject.hours_per_week || 0);
    return acc;
  }, {} as Record<string, number>), [subjects]);

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

  const handleAddSpecialHourSlot = async () => {
    if (!specialTypeName.trim() || !specialDay || !specialPeriod) {
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
        (sh) => sh.special_type.toLowerCase() === specialTypeName.trim().toLowerCase()
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
          special_type: specialTypeName.trim(),
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
    
    const nextTotal = totalHours + hours;
    if (nextTotal > 42) { toast.error("Total hours for this year cannot exceed 42"); return; }
    
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
    const original = subjects.find((s) => s.id === editingId);
    const nextTotal = totalHours - (original?.hours_per_week || 0) + hours;
    if (nextTotal > 42) { toast.error("Total hours for this year cannot exceed 42"); return; }

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
            <div className="text-sm text-muted-foreground">
              <div>Total hours: {totalHours}/42</div>
              {Object.keys(hoursByType).length > 0 && (
                <div className="flex gap-4 mt-1">
                  {Object.entries(hoursByType).map(([type, hours]) => {
                    let label = type;
                    if (type === 'theory') label = 'Theory';
                    else if (type === 'lab') label = 'Lab';
                    else if (type === 'elective') label = 'Professional Elective';
                    else if (type === 'open elective') label = 'Open Elective';
                    
                    return (
                      <span key={type} className="font-medium text-slate-700">
                        {label}: <span className="font-bold text-slate-900">{hours}h</span>
                      </span>
                    );
                  })}
                </div>
              )}
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
                  <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
                  <Select value={type} onValueChange={(v: any) => setType(v)}>
                    <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="theory">Theory</SelectItem>
                      <SelectItem value="lab">Lab</SelectItem>
                      <SelectItem value="elective">Professional Elective</SelectItem>
                      <SelectItem value="open elective">Open Elective</SelectItem>
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

                <div className="grid gap-3 md:grid-cols-5 items-center">
                  <div className="md:col-span-2">
                    <Input placeholder="Abbreviation (optional)" value={abbreviation} onChange={(e) => setAbbreviation(e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <Input placeholder="Tags (comma separated, e.g., PE4, SSA)" value={tags} onChange={(e) => setTags(e.target.value)} />
                  </div>
                  <Button onClick={handleAdd} disabled={!name.trim()} className="w-full">Add</Button>
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

        {userType !== 'faculty' && (
          <Card className="rounded-xl mb-6 bg-slate-900/40 border-slate-800 text-slate-100">
            <CardHeader className="border-b border-slate-800/40 pb-3">
              <CardTitle className="text-base font-bold text-white">Special Hours &amp; Static Slots</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-5">
              {/* List of active slots */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Current Special Hours</label>
                {specialHoursList.length === 0 ? (
                  <div className="text-xs italic text-slate-500 py-1">No special hours added yet. Use the form below to add.</div>
                ) : (
                  <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
                    {specialHoursList.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white/5 border border-white/8 px-3 py-2 rounded-xl text-xs">
                        <div>
                          <div className="font-bold text-white capitalize">{item.name}</div>
                          <div className="text-slate-400 mt-0.5">{item.dayName} Period {item.period}</div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg"
                          onClick={() => handleDeleteSpecialHourSlot(item.configId, item.dayIndex, item.period)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add Special Hour Form */}
              <div className="border-t border-slate-800/40 pt-4 space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Add New Special Hour Slot</label>
                <div className="grid gap-3 grid-cols-1 md:grid-cols-4 items-end">
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Name / Type</span>
                    <Input
                      placeholder="e.g. Library, Counselling, Seminar"
                      value={specialTypeName}
                      onChange={(e) => setSpecialTypeName(e.target.value)}
                      className="bg-white/5 border-white/10 text-white rounded-xl h-10 placeholder:text-white/20 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Day</span>
                    <Select value={specialDay} onValueChange={setSpecialDay}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl h-10 text-xs">
                        <SelectValue placeholder="Select Day" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#121225] border-white/10 text-white">
                        <SelectItem value="0" className="text-xs">Monday</SelectItem>
                        <SelectItem value="1" className="text-xs">Tuesday</SelectItem>
                        <SelectItem value="2" className="text-xs">Wednesday</SelectItem>
                        <SelectItem value="3" className="text-xs">Thursday</SelectItem>
                        <SelectItem value="4" className="text-xs">Friday</SelectItem>
                        <SelectItem value="5" className="text-xs">Saturday</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Hour / Period</span>
                    <Select value={specialPeriod} onValueChange={setSpecialPeriod}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl h-10 text-xs">
                        <SelectValue placeholder="Select Period" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#121225] border-white/10 text-white">
                        {[1, 2, 3, 4, 5, 6, 7].map((p) => (
                          <SelectItem key={p} value={String(p)} className="text-xs">Period {p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleAddSpecialHourSlot}
                    disabled={!specialTypeName.trim() || !specialDay || !specialPeriod}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl h-10 font-bold text-xs gap-1.5"
                  >
                    <Plus className="h-4 w-4" /> Add Slot
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="rounded-xl mb-6">
          <CardHeader>
            <CardTitle className="text-base">Sections</CardTitle>
          </CardHeader>
          <CardContent>
            {sections.length === 0 && <div className="text-sm text-muted-foreground">No sections yet. Generate a timetable to create sections.</div>}
            <div className="grid gap-2 md:grid-cols-3">
              {sections.map((sec) => (
                <div key={sec} className="flex items-center justify-between border rounded-md px-3 py-2">
                  <div className="font-medium">Section {sec}</div>
                  <Button size="sm" variant="secondary" onClick={() => {
                    const targetId = id || sessionUser?.department_id;
                    if (userType === 'super') navigate(`/super-admin/departments/${targetId}/years/${encodeURIComponent(year || '')}/sections/${encodeURIComponent(sec)}`);
                    // Admin/Faculty might not have section management yet, but we'll keep the button for future use
                    else toast.info("Section management is not yet available for Admins");
                  }}>Open</Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl mb-6">
          <CardHeader>
            <CardTitle className="text-base">Year statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <div className="text-xs text-muted-foreground">Total sections</div>
                <div className="text-2xl font-semibold">{sections.length}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Faculty teaching</div>
                <div className="text-2xl font-semibold">{facultyInYear}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total hours/week</div>
                <div className="text-2xl font-semibold">{totalHours}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Theory vs Lab hours</div>
                <div className="text-2xl font-semibold">
                  {subjects.filter(s=>s.type==='theory').reduce((a,b)=>a+(b.hours_per_week||0),0)} / {subjects.filter(s=>s.type==='lab').reduce((a,b)=>a+(b.hours_per_week||0),0)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <SubjectTable
          data={subjects}
          getRowId={(s) => s.id}
          searchKey={(s) => `${s.name} ${s.code || ""}`}
          searchPlaceholder="Search subjects by name or code..."
          exportFileName={`curriculum-yr${year}`}
          filters={[
            {
              key: "type",
              label: "Subject Type",
              options: [
                { label: "Theory", value: "theory" },
                { label: "Lab", value: "lab" },
                { label: "Professional Elective", value: "elective" },
                { label: "Open Elective", value: "open elective" },
              ]
            }
          ]}
          onDeleteSelected={userType !== 'faculty' ? async (ids) => {
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
          } : undefined}          columns={[
            {
              key: "name",
              header: "Name",
              sortable: true,
              render: (s) => <span className="font-semibold text-slate-900 dark:text-slate-100">{s.name}</span>
            },
            {
              key: "abbreviation",
              header: "Abbr",
              sortable: true,
              render: (s) => <span className="text-slate-700 dark:text-slate-300">{s.abbreviation || '-'}</span>
            },
            {
              key: "type",
              header: "Type",
              sortable: true,
              render: (s) => (
                <Badge variant={s.type === 'lab' ? 'default' : s.type === 'elective' || s.type === 'open elective' ? 'outline' : 'secondary'} className="uppercase text-[10px]">
                  {s.type}
                </Badge>
              )
            },
            {
              key: "hours_per_week",
              header: "Hours/Week",
              sortable: true,
              render: (s) => <span className="text-slate-700 dark:text-slate-300">{s.hours_per_week}h</span>
            },
            {
              key: "credits",
              header: "Credits",
              sortable: true,
              render: (s) => <span className="text-slate-700 dark:text-slate-300">{s.credits || 3}</span>
            },
            {
              key: "code",
              header: "Code",
              sortable: true,
              render: (s) => <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{s.code || '-'}</span>
            },
            {
              key: "tags",
              header: "Tags",
              render: (s) => (
                <div className="flex flex-wrap gap-1">
                  {(s.tags || []).map(t => (
                    <span key={t} className="bg-muted text-muted-foreground border border-border text-[10px] px-1.5 py-0.5 rounded font-semibold">{t}</span>
                  ))}
                  {(!s.tags || s.tags.length === 0) && '-'}
                </div>
              )
            },
            {
              key: "max_faculty_count",
              header: "Max Faculty",
              sortable: true,
              render: (s) => <span className="text-slate-700 dark:text-slate-300">{s.type === 'lab' ? (s.max_faculty_count || 1) : '-'}</span>
            },
            {
              key: "actions",
              header: "Actions",
              render: (s) => (
                userType !== 'faculty' ? (
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-600 dark:text-slate-300 hover:bg-muted" onClick={() => startEdit(s)}>Edit</Button>
                ) : <span>—</span>
              )
            }
          ]}
          renderItemCard={(s, isSelected, onToggleSelect) => (
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
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-tight">{s.name}</h4>
                  <Badge variant={s.type === 'lab' ? 'default' : s.type === 'elective' || s.type === 'open elective' ? 'outline' : 'secondary'} className="uppercase text-[9px] shrink-0">
                    {s.type}
                  </Badge>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 font-mono flex flex-wrap items-center gap-2">
                  {s.code && <span className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1 py-0.5 rounded text-slate-700 dark:text-slate-300">{s.code}</span>}
                  {s.abbreviation && <span className="text-slate-600 dark:text-slate-400 font-semibold">({s.abbreviation})</span>}
                </div>
                {s.tags && s.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {s.tags.map((t) => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold border border-border">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>{s.hours_per_week}h/week • {s.credits || 3} credits {s.type === 'lab' ? `• Max Fac: ${s.max_faculty_count || 1}` : ''}</span>
                <div className="flex items-center gap-3 shrink-0">
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
  </main>
  );
};

export default YearSubjects;
