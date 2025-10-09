import { useEffect, useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTimetableStore } from "@/store/timetableStore";
import { getDepartmentByName, getTimetable } from "@/lib/supabaseService";
import AdminNavbar from "@/components/navbar/AdminNavbar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const years = ["I", "II", "III", "IV"];
const sections = ["A", "B", "C"];

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
  const loadingRef = useRef(true);

  // Update loadingRef when loading state changes
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const ready = selection.department && selection.year && selection.section;

  useEffect(() => {
    const adminData = localStorage.getItem("adminUser");
    if (!adminData) {
      navigate("/admin-login", { replace: true });
      return;
    }

    let timeoutId: NodeJS.Timeout;

    try {
      const parsedAdmin = JSON.parse(adminData);
      console.log('Admin user data:', parsedAdmin);
      setAdminUser(parsedAdmin);

      // Load departments for this admin's department only and set selection
      (async () => {
        try {
          console.log('Loading departments for department_id:', parsedAdmin.department_id);
          const { data, error } = await (supabase as any)
            .from('departments')
            .select('*')
            .eq('id', parsedAdmin.department_id);

          console.log('Departments query result:', { data, error });

          if (error) {
            console.error('Error loading departments:', error);
            toast.error(`Failed to load departments: ${error.message || error}`);
            setLoading(false);
            loadingRef.current = false;
            return;
          }

          if (!data || data.length === 0) {
            console.warn('No departments found for admin');
            toast.error('No departments found. Please contact your Super Admin.');
            setLoading(false);
            loadingRef.current = false;
            return;
          }

          setDepartments(data);
          // Automatically set the department selection
          console.log('Setting department selection to:', data[0].name);
          setSelection({ department: data[0].name });
          setLoading(false);
          loadingRef.current = false;
        } catch (error) {
          console.error('Exception loading departments:', error);
          toast.error('Failed to load departments. Please try again.');
          setLoading(false);
          loadingRef.current = false;
        }
      })();

      // Fallback timeout to prevent infinite loading
      timeoutId = setTimeout(() => {
        if (loadingRef.current) {
          console.warn('Loading timeout reached');
          toast.error('Loading timeout. Please refresh the page.');
          setLoading(false);
          loadingRef.current = false;
        }
      }, 10000); // 10 second timeout

    } catch (error) {
      console.error('Error parsing admin data:', error);
      toast.error('Invalid admin session. Please login again.');
      localStorage.removeItem("adminUser");
      navigate("/admin-login", { replace: true });
    }

    // Cleanup function
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [navigate, setSelection]);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNavbar />
        <main className="md:pl-72">
          <section className="container py-8">
            <div className="text-center">Loading...</div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNavbar />
      <main className="md:pl-72">
        <section className="container py-8">
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
    </div>
  );
};

export default Index;
