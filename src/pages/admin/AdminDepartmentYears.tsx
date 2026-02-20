import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import AdminNavbar from '@/components/navbar/AdminNavbar';
import SelectionHeader from '@/components/admin/SelectionHeader';
import Navbar from '@/components/navbar/facultyadmin';

interface YearStats {
  year: string;
  subjects: number;
  totalHours: number;
}

const AdminDepartmentYears = () => {
  const navigate = useNavigate();
  const adminUser = localStorage.getItem("adminUser");
  const facultyUser = localStorage.getItem("facultyUser");
  
  const userType = adminUser ? 'admin' : facultyUser ? 'faculty' : null;
  const sessionUser = useMemo(() => {
    if (adminUser) return JSON.parse(adminUser);
    if (facultyUser) return JSON.parse(facultyUser);
    return null;
  }, [adminUser, facultyUser]);

  const departmentId = sessionUser?.department_id;
  const [deptName, setDeptName] = useState<string>("");
  const [yearStats, setYearStats] = useState<YearStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userType || !departmentId) {
      navigate('/', { replace: true });
      return;
    }

    (async () => {
      try {
        const [deptRes, subsRes] = await Promise.all([
          (supabase as any).from('departments').select('name').eq('id', departmentId).single(),
          (supabase as any).from('subjects').select('year,hours_per_week').eq('department_id', departmentId),
        ]);

        setDeptName(deptRes?.data?.name || "");

        const subs = subsRes.data || [];
        const map = new Map<string, { subjects: number; totalHours: number }>();
        subs.forEach((s: any) => {
          const cur = map.get(s.year) || { subjects: 0, totalHours: 0 };
          cur.subjects += 1; 
          cur.totalHours += s.hours_per_week || 0;
          map.set(s.year, cur);
        });

        const arr = ['I', 'II', 'III', 'IV'].map(yr => ({
          year: yr,
          ...(map.get(yr) || { subjects: 0, totalHours: 0 })
        }));
        
        setYearStats(arr);
      } catch (error) {
        console.error("Error fetching department stats:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [userType, departmentId, navigate]);

  const handleManageYear = (year: string) => {
    if (userType === 'admin') {
      navigate(`/admin/subjects/${encodeURIComponent(year)}`);
    } else {
      navigate(`/faculty/subjects/${encodeURIComponent(year)}`);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      {userType === 'admin' ? <AdminNavbar /> : <Navbar />}
      <div className="md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80">
        <SelectionHeader />
        <section className="container py-4">
          <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          </header>

          <div className="grid gap-4 md:grid-cols-2">
          {yearStats.map((y) => (
            <Card key={y.year} className="rounded-xl">
              <CardHeader>
                <CardTitle className="text-base">Year {y.year}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground grid gap-1">
                  <div>Subjects: <span className="text-foreground font-medium">{y.subjects}</span></div>
                  <div>Total hours/week: <span className="text-foreground font-medium">{y.totalHours}</span></div>
                </div>
                <div className="mt-4">
                  <Button onClick={() => handleManageYear(y.year)}>
                    {userType === 'admin' ? 'Manage Year' : 'View Subjects'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  </main>
);
};

export default AdminDepartmentYears;
