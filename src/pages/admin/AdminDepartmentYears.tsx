import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import AdminNavbar from '@/components/navbar/AdminNavbar';
import SelectionHeader from '@/components/admin/SelectionHeader';
import { Upload } from 'lucide-react';
import Navbar from '@/components/navbar/facultyadmin';
import { useTimetableStore } from '@/store/timetableStore';

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

  const [deptName, setDeptName] = useState<string>("");
  const [yearStats, setYearStats] = useState<YearStats[]>([]);
  const [loading, setLoading] = useState(true);

  const [allocatedDepts, setAllocatedDepts] = useState<{ id: string; name: string }[]>([]);
  const [activeDeptId, setActiveDeptId] = useState<string>("");

  useEffect(() => {
    if (!sessionUser) return;

    // First try admin_departments table for multi-dept support
    (async () => {
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

      // Fallback: legacy fields
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

        if (data) {
          setAllocatedDepts(data);
          const currentActive = sessionUser.department_id && data.some((d: any) => d.id === sessionUser.department_id)
            ? sessionUser.department_id
            : data[0]?.id;
          setActiveDeptId(currentActive || '');
        }
      }
    })();
  }, [adminUser, facultyUser, sessionUser]);

  useEffect(() => {
    if (!userType || !activeDeptId) {
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const [deptRes, subsRes, specialRes] = await Promise.all([
          (supabase as any).from('departments').select('name').eq('id', activeDeptId).single(),
          (supabase as any).from('subjects').select('year,hours_per_week,type,tags').eq('department_id', activeDeptId),
          (supabase as any).from('special_hours_config').select('year,special_type,day_index,period').eq('department_id', activeDeptId).eq('is_active', true)
        ]);

        setDeptName(deptRes?.data?.name || "");

        const subs = subsRes.data || [];
        const specialConfigs = specialRes.data || [];
        const map = new Map<string, { subjects: number; totalHours: number }>();
        
        ['I', 'II', 'III', 'IV'].forEach(yr => {
          const yrSubs = subs.filter((s: any) => s.year === yr);
          const yrSpecs = specialConfigs.filter((c: any) => c.year === yr);
          
          const subjectsCount = yrSubs.length;

          // Theory hours (traditional theory)
          const theoryHoursVal = yrSubs.filter((s: any) => s.type === 'theory').reduce((a: number, b: any) => a + (b.hours_per_week || 0), 0);
          
          // Lab hours
          const labHoursVal = yrSubs.filter((s: any) => s.type === 'lab').reduce((a: number, b: any) => a + (b.hours_per_week || 0), 0);
          
          // Professional elective hours (grouped by pe_group_ tag, untagged are summed)
          const pes = yrSubs.filter((s: any) => s.type === 'elective');
          const peGroups = new Map<string, number>();
          let peUntaggedSum = 0;
          pes.forEach((s: any) => {
            const groupTag = (s.tags || []).find((t: string) => /pe_group_\d+/i.test(t) || /^pe\d+/i.test(t));
            if (groupTag) {
              peGroups.set(groupTag, Math.max(peGroups.get(groupTag) || 0, s.hours_per_week));
            } else {
              peUntaggedSum += s.hours_per_week;
            }
          });
          const electiveHours = Array.from(peGroups.values()).reduce((a, b) => a + b, 0) + peUntaggedSum;

          // Open elective hours (cumulative 5h if present, else 0)
          const oes = yrSubs.filter((s: any) => s.type === 'open elective');
          const openElectiveHours = oes.length > 0 ? 5 : 0;

          // Special hours: config slots + special subjects in subjects table
          const uniqueSlots = new Set<string>();
          yrSpecs.forEach((c: any) => {
            uniqueSlots.add(`${c.day_index}-${c.period}`);
          });
          const configSpecialHours = uniqueSlots.size;
          const subjectSpecialHours = yrSubs.filter((s: any) => s.type === 'special').reduce((a: number, b: any) => a + (b.hours_per_week || 0), 0);
          const totalSpecialHours = configSpecialHours + subjectSpecialHours;

          // Grand total hours
          const totalHours = theoryHoursVal + labHoursVal + electiveHours + openElectiveHours + totalSpecialHours;

          map.set(yr, { subjects: subjectsCount, totalHours });
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
  }, [userType, activeDeptId, navigate]);

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
          {allocatedDepts.length > 0 && (
            <div className="flex border-b border-border/60 mb-6 overflow-x-auto whitespace-nowrap scrollbar-none gap-2 pb-2">
              {allocatedDepts.map((dept) => {
                const isActive = dept.id === activeDeptId;
                return (
                  <button
                    key={dept.id}
                    onClick={() => {
                      setActiveDeptId(dept.id);
                      if (adminUser) {
                        const parsed = JSON.parse(adminUser);
                        parsed.department_id = dept.id;
                        localStorage.setItem("adminUser", JSON.stringify(parsed));
                      }
                      useTimetableStore.setState(state => ({
                        ...state,
                        selection: { ...state.selection, department: dept.name }
                      }));
                    }}
                    className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-300 border ${
                      isActive
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-450 shadow-sm"
                        : "text-muted-foreground hover:bg-slate-100 hover:text-foreground dark:hover:bg-slate-900 border-transparent"
                    }`}
                  >
                    {dept.name}
                  </button>
                );
              })}
            </div>
          )}
          <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Course Subjects</h1>
              <p className="text-sm text-muted-foreground">Select a year to manage subjects or upload curriculum in bulk.</p>
            </div>
            {userType === 'admin' && (
              <Button onClick={() => navigate('/csv-upload')} className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                <span>Bulk Import CSV</span>
              </Button>
            )}
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
