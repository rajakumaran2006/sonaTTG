import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import Navbar from "@/components/navbar/Navbar";

interface Department { id: string; name: string }

type DeptStats = {
  subjects: number;
  staff: number;
  timetables: number;
  sections: number;
  totalWeeklyHours: number;
  activeYears: number;
};

const Departments = () => {
  const navigate = useNavigate();
  const isLoggedIn = useMemo(() => localStorage.getItem("superAdmin") === "true", []);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [stats, setStats] = useState<{ [id: string]: DeptStats }>({});
  const [search, setSearch] = useState("");
  
  // Bulk delete state
  const [selectedDepartments, setSelectedDepartments] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState<boolean>(false);
  const [deleteMode, setDeleteMode] = useState<boolean>(false);
  
  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  const filtered = useMemo(() =>
    departments.filter((d) => d.name.toLowerCase().includes(search.toLowerCase())),
  [departments, search]);

  useEffect(() => {
    document.title = "Departments - Super Admin";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "View and edit departments, staff and subjects counts.");
  }, []);

  useEffect(() => {
    if (!isLoggedIn) { navigate('/super-admin-login', { replace: true }); return; }
    (async () => {
      const { data, error } = await (supabase as any).from('departments').select('*').order('name');
      if (!error) {
        setDepartments(data || []);
        const nameMap: any = {}; (data || []).forEach((d: Department) => nameMap[d.id] = d.name);
        // setNames(nameMap); // This line was removed as per the edit hint
        // fetch stats in parallel per department
        const statEntries = await Promise.all((data || []).map(async (d: Department) => {
          const [subjectsRes, staffCountRes, timetablesRes] = await Promise.all([
            (supabase as any).from('subjects').select('id,hours_per_week,year').eq('department_id', d.id),
            (supabase as any).from('faculty_members').select('*', { count: 'exact', head: true }).eq('department_id', d.id),
            (supabase as any).from('timetables').select('section').eq('department_id', d.id),
          ]);
          const subjects = subjectsRes.data || [];
          const totalWeeklyHours = subjects.reduce((acc: number, s: any) => acc + (s.hours_per_week || 0), 0);
          const activeYears = new Set(subjects.map((s: any) => s.year)).size;
          const sections = new Set((timetablesRes.data || []).map((t: any) => t.section)).size;
          return [d.id, {
            subjects: subjects.length,
            staff: staffCountRes.count || 0,
            timetables: (timetablesRes.data || []).length,
            sections,
            totalWeeklyHours,
            activeYears,
          }] as const;
        }));
        setStats(Object.fromEntries(statEntries));
      }
    })();
  }, [isLoggedIn]);

  // saveName function was removed as per the edit hint

  const exportFiltered = () => {
    const payload = filtered.map((d) => ({
      id: d.id,
      name: d.name,
      stats: stats[d.id],
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'departments-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const duplicateFiltered = async () => {
    if (filtered.length === 0) { toast.message('Nothing to duplicate'); return; }
    const inserts = filtered.map((d) => ({ name: `Copy of ${d.name}` }));
    const { error } = await (supabase as any).from('departments').insert(inserts);
    if (error) { toast.error('Failed to duplicate'); return; }
    toast.success('Duplicated');
    const { data } = await (supabase as any).from('departments').select('*').order('name');
    setDepartments(data || []);
  };

  const handleDepartmentSelect = (deptId: string, checked: boolean) => {
    setSelectedDepartments(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(deptId);
      } else {
        next.delete(deptId);
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    const allIds = new Set(filtered.map(d => d.id));
    setSelectedDepartments(allIds);
  };

  const clearSelection = () => {
    setSelectedDepartments(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedDepartments.size === 0) {
      toast.error('No departments selected');
      return;
    }

    try {
      const deptIds = Array.from(selectedDepartments);
      const deptNames = deptIds.map(id => departments.find(d => d.id === id)?.name).filter(Boolean);
      
      const { error } = await (supabase as any)
        .from('departments')
        .delete()
        .in('id', deptIds);
      
      if (error) {
        toast.error('Failed to delete departments');
        return;
      }

      toast.success(`Successfully deleted ${selectedDepartments.size} department(s)`);
      
      // Update state
      setDepartments(prev => prev.filter(d => !selectedDepartments.has(d.id)));
      setStats(prev => {
        const newStats = { ...prev };
        selectedDepartments.forEach(id => delete newStats[id]);
        return newStats;
      });
      setSelectedDepartments(new Set());
      setBulkDeleteOpen(false);
      setDeleteMode(false); // Exit delete mode after successful deletion
    } catch (error) {
      console.error('Bulk delete error:', error);
      toast.error('An unexpected error occurred');
    }
  };

  const handleEdit = (id: string, name: string) => {
    navigate(`/super-admin/departments/edit/${id}`, { state: { name } });
  };
  
  const handleInlineEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };
  
  const handleSaveEdit = async (id: string) => {
    if (editingName.trim() === '') return;
    
    try {
      const { error } = await supabase
        .from('departments')
        .update({ name: editingName.trim() })
        .eq('id', id);
      
      if (error) throw error;
      
      // Update local state
      setDepartments(prev => 
        prev.map(d => d.id === id ? { ...d, name: editingName.trim() } : d)
      );
      
      // Reset editing state
      setEditingId(null);
      setEditingName('');
      
      toast.success('Department name updated successfully');
    } catch (error) {
      console.error('Error updating department:', error);
      toast.error('Failed to update department name');
    }
  };
  
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <section className="container py-10 md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80 md:pt-16">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button onClick={() => setOpenAdd(true)}>Add Department</Button>
          </div>
        </header>

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center space-x-4">
            <Input className="max-w-xs" placeholder="Search departments..." value={search} onChange={(e) => setSearch(e.target.value)} />
            {deleteMode && (
              <div className="flex items-center space-x-2">
                <Button size="sm" variant="outline" onClick={selectAllFiltered}>
                  Select All Filtered
                </Button>
              </div>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Bulk actions</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportFiltered}>Export (JSON)</DropdownMenuItem>
              <DropdownMenuItem onClick={duplicateFiltered}>Duplicate filtered</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className={view === 'grid' ? 'grid gap-4 md:grid-cols-3' : 'grid gap-2'}>
          {filtered.map((d) => (
            <Card key={d.id} className="rounded-xl">
              <CardHeader>
                <CardTitle className="text-base">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {deleteMode && (
                        <input
                          type="checkbox"
                          checked={selectedDepartments.has(d.id)}
                          onChange={(e) => handleDepartmentSelect(d.id, e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                      )}
                      {editingId === d.id ? (
                        <div className="flex items-center space-x-2">
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="h-8 w-32"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveEdit(d.id);
                              } else if (e.key === 'Escape') {
                                handleCancelEdit();
                              }
                            }}
                          />
                          <Button size="sm" onClick={() => handleSaveEdit(d.id)}>Save</Button>
                          <Button size="sm" variant="outline" onClick={handleCancelEdit}>Cancel</Button>
                        </div>
                      ) : (
                        <span>{d.name}</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button size="sm" onClick={() => navigate(`/super-admin/departments/${d.id}`)}>View</Button>
                      <Button size="sm" variant="outline" onClick={() => handleInlineEdit(d.id, d.name)}>Edit</Button>
                    </div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground grid gap-1">
                  <div>Working staff: <span className="text-foreground font-medium">{stats[d.id]?.staff ?? '-'}</span></div>
                  <div>Subjects: <span className="text-foreground font-medium">{stats[d.id]?.subjects ?? '-'}</span></div>
                  <div>Timetables: <span className="text-foreground font-medium">{stats[d.id]?.timetables ?? '-'}</span></div>
                  <div>Sections: <span className="text-foreground font-medium">{stats[d.id]?.sections ?? '-'}</span></div>
                  <div>Total weekly hours: <span className="text-foreground font-medium">{stats[d.id]?.totalWeeklyHours ?? '-'}</span></div>
                  <div>Active years: <span className="text-foreground font-medium">{stats[d.id]?.activeYears ?? '-'}</span></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Departments?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {selectedDepartments.size} department(s) and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-40 overflow-y-auto border rounded-md p-3 mb-4">
            <div className="text-sm font-medium mb-2">Departments to be deleted:</div>
            <div className="space-y-1">
              {Array.from(selectedDepartments).map(deptId => {
                const dept = departments.find(d => d.id === deptId);
                return dept ? (
                  <div key={deptId} className="text-sm text-muted-foreground">
                    • {dept.name}
                  </div>
                ) : null;
              })}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleBulkDelete}
            >
              Delete {selectedDepartments.size} Department(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};

export default Departments;
