import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { getPendingPRCount } from "@/lib/supabaseService";
import { Settings, User, LogOut, Home, BookOpen, Calendar, UserCheck, Upload, Menu, ChevronRight, Moon, Sun, FileSpreadsheet, Building2, ChevronDown, ChevronUp, FlaskConical } from "lucide-react";
import { useTimetableStore } from "@/store/timetableStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useDarkMode } from "@/context/DarkModeContext";

export interface AdminNavItem {
  label: string;
  href: string;
  badge?: number;
  icon?: React.ReactNode;
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
  department_id: string;
  department_ids?: string[];
  is_active: boolean;
  full_name?: string;
  role?: string;
}

interface Department {
  id: string;
  name: string;
}

const AdminNavbar = () => {
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [allocatedDepts, setAllocatedDepts] = useState<Department[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const selection = useTimetableStore((s) => s.selection);
  const { isDark, toggleDark } = useDarkMode();

  const navItems: AdminNavItem[] = [
    { label: "Home", href: "/admin", icon: <Home className="h-[18px] w-[18px]" /> },
    { label: "Subjects", href: "/admin/subjects", icon: <BookOpen className="h-[18px] w-[18px]" /> },
    { label: "Faculty", href: "/admin/faculty", icon: <UserCheck className="h-[18px] w-[18px]" /> },
    { label: "Timetables", href: "/current-timetables", icon: <Calendar className="h-[18px] w-[18px]" /> },
    { label: "Bulk Import", href: "/csv-upload", icon: <FileSpreadsheet className="h-[18px] w-[18px]" /> },
    { label: "Lab Allocation", href: "/lab", icon: <FlaskConical className="h-[18px] w-[18px]" /> },
  ];


  useEffect(() => {
    // Load admin user data from localStorage
    const adminData = localStorage.getItem("adminUser");
    const isSuperAdmin = localStorage.getItem("superAdmin") === "true";

    const setupSuperAdminSession = () => {
      (supabase as any)
        .from('departments')
        .select('id, name')
        .order('name')
        .then(({ data }: { data: Department[] | null }) => {
          const depts = data || [];
          setAllocatedDepts(depts);
          const defaultDept = depts[0];
          setAdminUser({
            id: 'super-admin',
            name: 'Super Admin',
            full_name: 'Super Admin',
            email: 'superadmin@sonatech.ac.in',
            is_active: true,
            role: 'super_admin',
            department_id: defaultDept ? defaultDept.id : '',
            department_ids: depts.map(d => d.id)
          });
        });
    };

    if (adminData) {
      try {
        const parsed = JSON.parse(adminData);
        if (parsed && parsed.email) {
            setAdminUser(parsed);
            // Fetch all allocated department details
            const deptIds: string[] = parsed.department_ids && parsed.department_ids.length > 0
              ? parsed.department_ids
              : (parsed.department_id ? [parsed.department_id] : []);
            if (deptIds.length > 0) {
              (supabase as any)
                .from('departments')
                .select('id, name')
                .in('id', deptIds)
                .then(({ data }: { data: Department[] | null }) => {
                  if (data) setAllocatedDepts(data);
                });
            } else if (isSuperAdmin) {
              setupSuperAdminSession();
            }
        } else if (isSuperAdmin) {
          setupSuperAdminSession();
        } else {
            console.error('Invalid admin data structure');
            localStorage.removeItem("adminUser");
            navigate("/", { replace: true });
        }
      } catch (error) {
        if (isSuperAdmin) {
          setupSuperAdminSession();
        } else {
          console.error('Error parsing admin data:', error);
          localStorage.removeItem("adminUser");
          navigate("/", { replace: true });
        }
      }
    } else if (isSuperAdmin) {
      setupSuperAdminSession();
    } else {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  const switchDepartment = (dept: Department) => {
    if (!adminUser) return;
    const updatedAdmin = { ...adminUser, department_id: dept.id };
    localStorage.setItem("adminUser", JSON.stringify(updatedAdmin));
    setAdminUser(updatedAdmin);
    // Navigate to admin home to reload with new department context
    navigate("/admin", { replace: true });
    window.location.reload();
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const c = await getPendingPRCount();
        if (mounted) setPendingCount(c);
      } catch {}
    })();

    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'timetable_pull_requests' }, async () => {
        try {
          const c = await getPendingPRCount();
          setPendingCount(c);
        } catch {}
      })
      .subscribe();

    return () => {
      mounted = false;
      try { supabase.removeChannel(channel); } catch {}
    };
  }, []);

  const handleSuperAdminLogin = () => {
    navigate("/super-admin");
  };

  const handleFacultyLogin = () => {
    navigate("/faculty");
  };

  const handleLogout = () => {
    localStorage.removeItem("adminUser");
    navigate("/", { replace: true });
  };

  // Modern styling helpers
  const SidebarContent = () => (
    <div className={`flex h-full flex-col transition-colors duration-300 ${
      isDark 
        ? 'bg-[#090d1c]/80 backdrop-blur-2xl border-r border-indigo-500/20 shadow-[1px_0_24px_rgba(0,0,0,0.5)]' 
        : 'bg-white/80 backdrop-blur-2xl border-r border-indigo-200/60 shadow-[1px_0_20px_rgba(99,102,241,0.06)]'
    }`}>

      {/* Logo */}
      <div className={`flex h-16 items-center px-5 gap-3 border-b ${
        isDark ? 'border-indigo-500/15' : 'border-indigo-100/70'
      }`}>
        {/* Geometric logo mark with subtle neon rim */}
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center shadow-md shrink-0 overflow-hidden border ${
          isDark
            ? 'bg-gradient-to-br from-indigo-500 to-purple-600 border-indigo-400/30 shadow-[0_0_12px_-2px_rgba(99,102,241,0.3)]'
            : 'bg-gradient-to-br from-indigo-600 via-indigo-500 to-purple-600 border-indigo-300/40 shadow-[0_0_12px_-2px_rgba(99,102,241,0.2)] ring-1 ring-indigo-400/20'
        }`}>
          <svg viewBox="0 0 40 40" fill="none" className="h-6 w-6">
            <circle cx="20" cy="20" r="18" fill="transparent" stroke="white" strokeWidth="2.5" />
            <path d="M20 9 L20 31" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M9 20 L31 20" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <circle cx="20" cy="20" r="4.5" fill="white" />
          </svg>
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <span className={`text-base font-extrabold tracking-tight leading-tight block ${
            isDark ? 'text-white' : 'bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 bg-clip-text text-transparent'
          }`}>OptiTime</span>
          <span className={`text-[10px] font-bold leading-none block tracking-wide ${
            isDark ? 'text-indigo-400' : 'text-indigo-600'
          }`}>Admin Console</span>
        </div>
        {/* Dark mode toggle */}
        <button
          onClick={toggleDark}
          className={`p-2 rounded-xl transition-all shrink-0 ${
            isDark
              ? 'text-white/50 hover:text-white hover:bg-white/10 hover:shadow-[0_0_8px_rgba(255,255,255,0.15)]'
              : 'text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50/80 border border-indigo-100/70 shadow-xs'
          }`}
          title={isDark ? 'Light mode' : 'Dark mode'}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {/* Section label */}
        <p className={`text-[10px] font-bold uppercase tracking-widest px-3 pb-2 pt-1 ${
          isDark ? 'text-indigo-400/50' : 'text-indigo-900/60'
        }`}>Main menu</p>

        <nav className="space-y-0.5">
          {navItems.map((item, idx) => (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.href === "/admin"}
              onClick={() => setIsMobileMenuOpen(false)}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 w-full relative ${
                  isActive
                    ? (isDark
                        ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/35 shadow-[0_0_12px_-2px_rgba(99,102,241,0.22)]'
                        : 'bg-indigo-50/85 text-indigo-900 border border-indigo-300/70 shadow-[0_0_12px_-2px_rgba(99,102,241,0.14)] font-bold')
                    : (isDark
                        ? 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
                        : 'text-slate-600 hover:text-indigo-800 hover:bg-indigo-50/60 border border-transparent hover:border-indigo-100/60')
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`shrink-0 transition-colors duration-200 ${
                    isActive
                      ? (isDark ? 'text-indigo-400' : 'text-indigo-600')
                      : (isDark ? 'text-slate-500 group-hover:text-slate-300' : 'text-indigo-400/80 group-hover:text-indigo-600')
                  }`}>
                    {item.icon}
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {isActive && (
                    <div className="absolute right-3 h-1.5 w-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
                  )}
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span className={`text-[10px] font-bold min-w-[20px] h-5 px-1.5 rounded-md flex items-center justify-center border ${
                      isDark
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30 shadow-[0_0_8px_-2px_rgba(99,102,241,0.3)]'
                        : 'bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-xs'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* User Footer */}
      <div className={`p-3 border-t ${
        isDark ? 'border-indigo-500/15 bg-white/[0.01]' : 'border-indigo-100/80 bg-indigo-50/30'
      }`}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all ${
              isDark
                ? 'hover:bg-[#0f1527] text-white border border-transparent hover:border-indigo-500/20'
                : 'hover:bg-white text-slate-800 border border-transparent hover:border-indigo-200/80 hover:shadow-sm'
            }`}>
              <Avatar className={`h-8 w-8 shrink-0 ring-2 ${
                isDark ? 'ring-indigo-500/25' : 'ring-indigo-500/20'
              }`}>
                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${adminUser?.name}`} />
                <AvatarFallback className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white text-xs font-bold">
                  {adminUser?.name?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-bold truncate leading-tight ${
                  isDark ? 'text-white/90' : 'text-slate-900'
                }`}>
                  {adminUser?.name || 'Admin'}
                </div>
                <div className={`text-[11px] truncate font-medium ${
                  isDark ? 'text-indigo-300/60' : 'text-indigo-600/80'
                }`}>
                  {adminUser?.email}
                </div>
              </div>
              <ChevronRight className={`h-4 w-4 shrink-0 ${
                isDark ? 'text-indigo-300/40' : 'text-indigo-400'
              }`} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={`w-64 p-2 rounded-xl shadow-xl z-50 ${isDark ? 'bg-[#0f1527] border-indigo-500/20 text-white shadow-indigo-950/50' : 'bg-white/95 backdrop-blur-xl border-indigo-100 shadow-indigo-500/10'}`} sideOffset={8}>
            <div className={`px-2 py-2 mb-1 rounded-lg ${isDark ? 'bg-[#141c33]' : 'bg-indigo-50/60 border border-indigo-100/50'}`}>
              <div className={`text-xs font-medium ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}>Signed in as</div>
              <div className={`font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{adminUser?.email}</div>
            </div>
            <DropdownMenuSeparator className={isDark ? 'bg-indigo-500/15' : 'bg-indigo-100/60'} />
            {localStorage.getItem("superAdmin") === "true" && (
              <DropdownMenuItem onClick={handleSuperAdminLogin} className={`rounded-lg py-2 cursor-pointer ${isDark ? 'focus:bg-[#141c33] focus:text-indigo-300' : 'focus:bg-indigo-50 focus:text-indigo-700'}`}>
                <Settings className="h-4 w-4 mr-2 text-indigo-500" />
                <span className="font-semibold">Super Admin Console</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={handleFacultyLogin} className={`rounded-lg py-2 cursor-pointer ${isDark ? 'focus:bg-[#141c33] focus:text-indigo-300' : 'focus:bg-indigo-50 focus:text-indigo-700'}`}>
              <UserCheck className="h-4 w-4 mr-2 text-indigo-500" />
              <span className="font-semibold">Switch to Faculty View</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className={isDark ? 'bg-indigo-500/15' : 'bg-indigo-100/60'} />
            <DropdownMenuItem onClick={handleLogout} className="text-red-500 focus:text-red-600 focus:bg-red-500/10 rounded-lg py-2 cursor-pointer font-semibold">
              <LogOut className="h-4 w-4 mr-2" />
              <span>Sign Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Navbar */}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-md md:hidden transition-colors duration-300 ${isDark ? 'bg-[#080b14]/90 border-indigo-500/15' : 'bg-white/90 border-indigo-100/90 shadow-[0_1px_8px_rgba(99,102,241,0.06)]'}`}>
        <div className="flex h-16 items-center justify-between px-4">
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className={`rounded-lg ${isDark ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-indigo-50 text-indigo-600'}`}>
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0 border-r-0">
              <SidebarContent />
            </SheetContent>
          </Sheet>

          <Link to="/admin" className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-500/25">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <path d="M12 2v20" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
            </div>
            <span className={`font-bold text-lg tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>OptiTime</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleDark}
              className={`p-2 rounded-xl transition-all duration-300 ${isDark ? 'bg-gray-800 text-yellow-400' : 'bg-slate-100 text-slate-500'}`}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 p-0 border border-slate-200 dark:border-white/10">
                    <Avatar className="h-full w-full">
                        <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${adminUser?.name}`} />
                        <AvatarFallback className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">{adminUser?.name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl">
                <div className="px-2 py-1.5 text-sm">
                  <div className="font-medium truncate">{adminUser?.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{adminUser?.email}</div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSuperAdminLogin} className="rounded-lg">
                  <Settings className="h-4 w-4 mr-2" />
                  Super Admin
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleFacultyLogin} className="rounded-lg">
                  <UserCheck className="h-4 w-4 mr-2" />
                  Faculty Console
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600 rounded-lg">
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-72 md:flex-col">
        <SidebarContent />
      </aside>
    </>
  );
};

export default AdminNavbar;
