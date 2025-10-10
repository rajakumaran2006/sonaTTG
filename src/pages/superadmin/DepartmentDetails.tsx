import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getAllYears, addYear, updateYear, deleteYear, ensureDefaultYears } from '@/lib/supabaseService';
import Navbar from '@/components/navbar/Navbar';
import { Breadcrumbs } from '@/components/Breadcrumbs';

interface Year {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
}

interface YearStats {
  year: string;
  subjects: number;
  totalHours: number;
}

const DepartmentDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isLoggedIn = useMemo(() => localStorage.getItem("superAdmin") === "true", []);
  const [deptName, setDeptName] = useState<string>("");
  const [years, setYears] = useState<Year[]>([]);
  const [yearStats, setYearStats] = useState<YearStats[]>([]);
  const [deptStats, setDeptStats] = useState({ sections: 0, faculty: 0, totalWeeklyPeriods: 0 });
  
  // Year management state
  const [addYearOpen, setAddYearOpen] = useState(false);
  const [newYearName, setNewYearName] = useState('');
  const [newYearOrder, setNewYearOrder] = useState(5);
  const [editingYear, setEditingYear] = useState<Year | null>(null);
  const [editYearName, setEditYearName] = useState('');
  const [editYearOrder, setEditYearOrder] = useState(0);

  useEffect(() => {
    document.title = "Department Details - Super Admin";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Year-wise summary of department academic details.");
  }, []);

  useEffect(() => {
    if (!isLoggedIn) { navigate('/super-admin-login', { replace: true }); return; }
    if (!id) return;
    (async () => {
      const [deptRes, subsRes, ttsRes, facRes, settingsRes] = await Promise.all([
        (supabase as any).from('departments').select('name').eq('id', id).single(),
        (supabase as any).from('subjects').select('year,hours_per_week').eq('department_id', id),
        (supabase as any).from('timetables').select('section').eq('department_id', id),
        (supabase as any).from('faculty_members').select('id,name,email,designation').eq('department_id', id).order('name'),
        (supabase as any).from('department_settings').select('*').eq('department_id', id).maybeSingle(),
      ]);

      setDeptName(deptRes?.data?.name || "");

      const subs = subsRes.data || [];
      const map = new Map<string, { subjects: number; totalHours: number }>();
      (subs || []).forEach((s: any) => {
        const cur = map.get(s.year) || { subjects: 0, totalHours: 0 };
        cur.subjects += 1; cur.totalHours += s.hours_per_week || 0;
        map.set(s.year, cur);
      });
      const arr = Array.from(map.entries()).map(([year, v]) => ({ year, ...v }));
      arr.sort((a, b) => a.year.localeCompare(b.year));
      setYearStats(arr);

      const sections = new Set((ttsRes.data || []).map((t: any) => t.section)).size;
      const totalWeeklyPeriods = subs.reduce((acc: number, s: any) => acc + (s.hours_per_week || 0), 0);
      const facultyList = facRes.data || [];
        setDeptStats({ sections, faculty: facultyList.length, totalWeeklyPeriods });

      if (settingsRes?.data) {
        const s = settingsRes.data;
        // setSettings({
        //   working_days: s.working_days ?? 6,
        //   periods_per_day: s.periods_per_day ?? 7,
        //   period_duration: s.period_duration ?? 50,
        // });
      }
      // setLoading(false);
    })();
  }, [isLoggedIn, id]);

  useEffect(() => {
    loadYears();
  }, []);

  useEffect(() => {
    (async () => {
      await ensureDefaultYears();
      await loadYears();
    })();
  }, []);

  const handleAddYear = async () => {
    if (!newYearName.trim()) return;
    try {
      await addYear(newYearName.trim(), newYearOrder);
      toast.success('Year added successfully');
      setAddYearOpen(false);
      setNewYearName('');
      setNewYearOrder(5);
      loadYears();
    } catch (error) {
      toast.error('Failed to add year');
    }
  };

  const handleEditYear = (year: Year) => {
    setEditingYear(year);
    setEditYearName(year.name);
    setEditYearOrder(year.display_order);
  };

  const handleUpdateYear = async () => {
    if (!editYearName.trim() || !editingYear) return;
    try {
      await updateYear(editingYear.id, { 
        name: editYearName.trim(), 
        display_order: editYearOrder 
      });
      toast.success('Year updated successfully');
      setEditingYear(null);
      setEditYearName('');
      setEditYearOrder(0);
      loadYears();
    } catch (error) {
      toast.error('Failed to update year');
    }
  };

  const handleToggleYearStatus = async (yearId: string, isActive: boolean) => {
    try {
      await updateYear(yearId, { is_active: isActive });
      toast.success('Year status updated');
      loadYears();
    } catch (error) {
      toast.error('Failed to toggle year status');
    }
  };

  const handleDeleteYear = async (yearId: string) => {
    if (!window.confirm('Are you sure you want to delete this year?')) return;
    try {
      await deleteYear(yearId);
      toast.success('Year deleted');
      loadYears();
    } catch (error) {
      toast.error('Failed to delete year');
    }
  };

  const loadYears = async () => {
    try {
      const yearsData = await getAllYears();
      setYears(yearsData);
    } catch (error) {
      console.error('Failed to load years:', error);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <section className="container py-10 md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80 md:pt-16">
        <Breadcrumbs
          segments={[
            { label: 'Super Admin', href: '/super-admin' },
            { label: 'Departments', href: '/super-admin/departments' },
            { label: deptName || 'Department' },
          ]}
        />
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{deptName || 'Department'}</h1>
            <p className="text-sm text-muted-foreground">Year-wise summary</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/super-admin/departments')}>Back</Button>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {['I','II','III','IV'].map((yr) => {
            const y = yearStats.find(s => s.year === yr) || { year: yr, subjects: 0, totalHours: 0 };
            return (
              <Card key={yr} className="rounded-xl">
                <CardHeader>
                  <CardTitle className="text-base">Year {yr}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground grid gap-1">
                    <div>Subjects: <span className="text-foreground font-medium">{y.subjects}</span></div>
                    <div>Total hours/week: <span className="text-foreground font-medium">{y.totalHours}</span></div>
                  </div>
                  <div className="mt-4">
                    <Button onClick={() => navigate(`/super-admin/departments/${id}/years/${encodeURIComponent(yr)}`)}>Manage year</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="rounded-xl mt-8">
          <CardHeader>
            <CardTitle className="text-base">Year Management</CardTitle>
          </CardHeader>
          <CardContent>
            <Dialog open={addYearOpen} onOpenChange={setAddYearOpen}>
              <DialogTrigger asChild>
                <Button>Add New Year</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Year</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="yearName">Year Name</Label>
                    <Input
                      id="yearName"
                      placeholder="e.g. V, VI"
                      value={newYearName}
                      onChange={(e) => setNewYearName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="yearOrder">Display Order</Label>
                    <Input
                      id="yearOrder"
                      type="number"
                      min="5"
                      value={newYearOrder}
                      onChange={(e) => setNewYearOrder(parseInt(e.target.value) || 5)}
                    />
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => setAddYearOpen(false)}>Cancel</Button>
                    <Button onClick={handleAddYear}>Add Year</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            
            <div className="mt-4">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">Manage Years</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Manage Years</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">
                      Default years (I, II, III, IV) cannot be deleted.
                    </div>
                    {years.filter(year => !['I', 'II', 'III', 'IV'].includes(year.name)).map((year) => (
                      <div key={year.id} className="flex items-center justify-between p-2 border rounded">
                        <span>Year {year.name}</span>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteYear(year.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    ))}
                    {years.filter(year => !['I', 'II', 'III', 'IV'].includes(year.name)).length === 0 && (
                      <div className="text-sm text-muted-foreground text-center py-4">
                        No additional years to manage
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <Card className="rounded-xl"><CardHeader><CardTitle className="text-base">Total sections</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{deptStats.sections}</div></CardContent></Card>
          <Card className="rounded-xl"><CardHeader><CardTitle className="text-base">Working faculty</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{deptStats.faculty}</div></CardContent></Card>
          <Card className="rounded-xl"><CardHeader><CardTitle className="text-base">Total weekly periods</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{deptStats.totalWeeklyPeriods}</div></CardContent></Card>
        </section>
      </section>
    </main>
  );
};

export default DepartmentDetails;
