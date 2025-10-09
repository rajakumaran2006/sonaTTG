import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTimetableStore } from "@/store/timetableStore";
import { getDepartmentByName, getTimetable } from "@/lib/supabaseService";
import AdminNavbar from "@/components/navbar/AdminNavbar";
import { supabase } from "@/integrations/supabase/client";

const years = ["I", "II", "III", "IV"];
const sections = ["A", "B", "C", "D"];

interface AdminUser {
  id: string;
  name: string;
  email: string;
  department_id: string;
  is_active: boolean;
}

const Index = () => {
  const navigate = useNavigate();
  const selection = useTimetableStore((s) => s.selection);
  const setSelection = useTimetableStore((s) => s.setSelection);
  const [existingTimetable, setExistingTimetable] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const ready = selection.department && selection.year && selection.section;

  useEffect(() => {
    const adminData = localStorage.getItem("adminUser");
    if (!adminData) {
      navigate("/admin-login", { replace: true });
      return;
    }

    try {
      const parsedAdmin = JSON.parse(adminData);
      setAdminUser(parsedAdmin);

      // Load departments for this admin's department only
      (async () => {
        const { data, error } = await (supabase as any)
          .from('departments')
          .select('*')
          .eq('id', parsedAdmin.department_id);

        if (!error && data) {
          setDepartments(data);
        }
        setLoading(false);
      })();
    } catch (error) {
      console.error('Error parsing admin data:', error);
      navigate("/admin-login", { replace: true });
    }
  }, [navigate]);

  if (loading) {
    return (
      <main className="min-h-screen bg-background">
        <AdminNavbar />
        <section className="container py-14">
          <div className="text-center">Loading...</div>
        </section>
      </main>
    );
  }

  useEffect(() => {
    (async () => {
      if (!selection.department || !selection.year || !selection.section) {
        setExistingTimetable(false);
        return;
      }
      setChecking(true);
      try {
        const dept = await getDepartmentByName(selection.department);
        if (!dept) { setExistingTimetable(false); return; }
        const tt = await getTimetable(dept.id, selection.year, selection.section);
        setExistingTimetable(Boolean(tt));
      } catch (_) {
        setExistingTimetable(false);
      } finally {
        setChecking(false);
      }
    })();
  }, [selection.department, selection.year, selection.section]);

  return (
    <main className="min-h-screen bg-background">
      <AdminNavbar />
      <section className="container py-14">
        <div className="mx-auto max-w-3xl">
          <header className="mb-8 text-center">
            <h1 className="text-4xl font-bold tracking-tight mb-2" style={{fontFamily: 'Poppins'}}>Fast, Rule‑Based Timetable Generator</h1>
            <p className="text-muted-foreground">Greedy engine with smart constraints. Export to PDF & Excel.</p>
          </header>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle>Choose Department, Year & Section</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm text-muted-foreground">Department</label>
                <Select onValueChange={(v) => setSelection({ department: v })} value={selection.department}>
                  <SelectTrigger className="bg-card">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="z-50 bg-popover">
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm text-muted-foreground">Year</label>
                <Select onValueChange={(v) => setSelection({ year: v })} value={selection.year}>
                  <SelectTrigger className="bg-card">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="z-50 bg-popover">
                    {years.map((y) => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm text-muted-foreground">Section</label>
                <Select onValueChange={(v) => setSelection({ section: v })} value={selection.section}>
                  <SelectTrigger className="bg-card">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="z-50 bg-popover">
                    {sections.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {ready && existingTimetable && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    A timetable already exists for this Department • Year • Section. Please delete it from
                    {" "}
                    <Link className="underline" to="/current-timetables">Current Timetables</Link>
                    {" "}before proceeding.
                  </div>
                )}
              </div>

              <div className="md:col-span-3 flex justify-end">
                <Button variant="hero" disabled={!ready || existingTimetable || checking} onClick={() => navigate('/subjects')}>
                  {checking ? 'Checking…' : 'Continue'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
};

export default Index;
