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
    { label: "Bulk Import", href: "/csv-upload", icon: <FileSpreadsheet className="h-[18px] w-[18px]" /> },
    { label: "Lab Allocation", href: "/lab", icon: <FlaskConical className="h-[18px] w-[18px]" /> },
  ];


  useEffect(() => {
    // Load admin user data from localStorage
    const adminData = localStorage.getItem("adminUser");
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
            }
        } else {
            console.error('Invalid admin data structure');
            localStorage.removeItem("adminUser");
            navigate("/", { replace: true });
        }
      } catch (error) {
        console.error('Error parsing admin data:', error);
        localStorage.removeItem("adminUser");
        navigate("/", { replace: true });
      }
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
    navigate("/");
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
      isDark ? 'bg-[#111115] border-r border-white/[0.06]' : 'bg-[#f4f4f5] border-r border-black/[0.05]'
    }`}>

      {/* Logo */}
      <div className={`flex h-16 items-center px-5 gap-3 border-b ${
        isDark ? 'border-white/[0.06]' : 'border-black/[0.05]'
      }`}>
        {/* Geometric logo mark */}
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center shadow-sm shrink-0 overflow-hidden ${
          isDark ? 'bg-white/10' : 'bg-white shadow-md'
        }`}>
          <svg viewBox="0 0 40 40" fill="none" className="h-7 w-7">
            <circle cx="20" cy="20" r="20" fill={isDark ? '#1e1e2a' : '#f0f0f0'} />
            <path d="M20 8 L20 32" stroke={isDark ? '#a3a3b3' : '#333'} strokeWidth="2" strokeLinecap="round"/>
            <path d="M8 20 L32 20" stroke={isDark ? '#a3a3b3' : '#333'} strokeWidth="2" strokeLinecap="round"/>
            <circle cx="20" cy="20" r="5" fill="none" stroke={isDark ? '#a3a3b3' : '#333'} strokeWidth="2"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <span className={`text-base font-bold tracking-tight leading-tight block ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}>OptiTime</span>
          <span className={`text-[10px] font-medium leading-none block ${
            isDark ? 'text-white/40' : 'text-slate-400'
          }`}>Admin Console</span>
        </div>
        {/* Dark mode toggle */}
        <button
          onClick={toggleDark}
          className={`p-2 rounded-lg transition-all shrink-0 ${
            isDark
              ? 'text-white/40 hover:text-white/70 hover:bg-white/5'
              : 'text-slate-400 hover:text-slate-600 hover:bg-black/5'
          }`}
          title={isDark ? 'Light mode' : 'Dark mode'}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {/* Section label */}
        <p className={`text-[10px] font-semibold uppercase tracking-widest px-3 pb-2 pt-1 ${
          isDark ? 'text-white/25' : 'text-slate-400'
        }`}>Main menu</p>

        <nav className="space-y-0.5">
          {navItems.map((item, idx) => (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.href === "/admin"}
              onClick={() => setIsMobileMenuOpen(false)}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 w-full relative ${
                  isActive
                    ? (isDark
                        ? 'bg-white/[0.08] text-white'
                        : 'bg-white text-slate-900 shadow-sm ring-1 ring-black/[0.04]')
                    : (isDark
                        ? 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-black/[0.03]')
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`shrink-0 transition-colors duration-200 ${
                    isActive
                      ? (isDark ? 'text-white' : 'text-slate-800')
                      : (isDark ? 'text-white/35 group-hover:text-white/65' : 'text-slate-400 group-hover:text-slate-600')
                  }`}>
                    {item.icon}
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span className={`text-[10px] font-bold min-w-[20px] h-5 px-1.5 rounded-md flex items-center justify-center ${
                      isDark
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-orange-100 text-orange-600'
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
        isDark ? 'border-white/[0.06]' : 'border-black/[0.05]'
      }`}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all ${
              isDark
                ? 'hover:bg-white/[0.05] text-white'
                : 'hover:bg-black/[0.03] text-slate-800'
            }`}>
              <Avatar className={`h-8 w-8 shrink-0 ring-2 ${
                isDark ? 'ring-white/10' : 'ring-black/[0.06]'
              }`}>
                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${adminUser?.name}`} />
                <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-bold">
                  {adminUser?.name?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold truncate leading-tight ${
                  isDark ? 'text-white/90' : 'text-slate-900'
                }`}>
                  {adminUser?.name || 'Admin'}
                </div>
                <div className={`text-[11px] truncate ${
                  isDark ? 'text-white/30' : 'text-slate-400'
                }`}>
                  {adminUser?.email}
                </div>
              </div>
              <ChevronRight className={`h-4 w-4 shrink-0 ${
                isDark ? 'text-white/20' : 'text-slate-300'
              }`} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 p-2 rounded-xl shadow-xl border-slate-100" sideOffset={8}>
            <div className="px-2 py-2 mb-1 bg-slate-50 rounded-lg">
              <div className="text-xs font-medium text-slate-500">Signed in as</div>
              <div className="font-semibold text-slate-900 truncate">{adminUser?.email}</div>
            </div>
            <DropdownMenuSeparator />
            {localStorage.getItem("superAdmin") === "true" && (
              <DropdownMenuItem onClick={handleSuperAdminLogin} className="rounded-lg py-2 cursor-pointer focus:bg-slate-50">
                <Settings className="h-4 w-4 mr-2 text-slate-500" />
                <span className="font-medium">Super Admin Console</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={handleFacultyLogin} className="rounded-lg py-2 cursor-pointer focus:bg-slate-50">
              <UserCheck className="h-4 w-4 mr-2 text-slate-500" />
              <span className="font-medium">Switch to Faculty View</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-700 rounded-lg py-2 cursor-pointer focus:bg-red-50">
              <LogOut className="h-4 w-4 mr-2" />
              <span className="font-medium">Sign Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Navbar */}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-md md:hidden transition-colors duration-300 ${isDark ? 'bg-gray-950/80 border-gray-800' : 'bg-white/80 border-slate-200 supports-[backdrop-filter]:bg-white/60'}`}>
        <div className="flex h-16 items-center justify-between px-4">
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className={`rounded-lg ${isDark ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-slate-100'}`}>
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0 border-r-0">
              <SidebarContent />
            </SheetContent>
          </Sheet>

          <Link to="/admin" className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-emerald-600 flex items-center justify-center text-white">
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
                <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 p-0 border border-slate-200">
                    <Avatar className="h-full w-full">
                        <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${adminUser?.name}`} />
                        <AvatarFallback className="text-xs bg-emerald-100 text-emerald-700">{adminUser?.name?.charAt(0)}</AvatarFallback>
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
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-72 lg:w-80 xl:w-72 2xl:w-80 md:flex-col">
        <SidebarContent />
      </aside>
    </>
  );
};

export default AdminNavbar;
