import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { getPendingPRCount } from "@/lib/supabaseService";
import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  UserCog, 
  Beaker, 
  GitPullRequest, 
  Calendar, 
  Settings, 
  User, 
  UserCheck, 
  Menu, 
  Sun, 
  Moon, 
  LogOut, 
  ChevronRight 
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useDarkMode } from "@/context/DarkModeContext";

export interface NavItem {
  label: string;
  href: string;
  badge?: number;
  icon: React.ReactNode;
}

const Navbar = () => {
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { isDark, toggleDark } = useDarkMode();
  const { pathname } = useLocation();
  const [deptName, setDeptName] = useState("");

  useEffect(() => {
    if (pathname.startsWith("/super-admin/departments/")) {
      const parts = pathname.split("/");
      const id = parts[3];
      const isYearSubjects = parts[4] === "years";
      
      if (id === "edit") {
        setDeptName("EDIT DEPARTMENT");
      } else if (isYearSubjects) {
        setDeptName("DEPARTMENT DETAILS");
      } else if (id) {
        (async () => {
          const { data } = await supabase.from('departments').select('name').eq('id', id).maybeSingle();
          if (data?.name) {
            setDeptName(data.name);
          } else {
            setDeptName("DEPARTMENT DETAILS");
          }
        })();
      }
    } else {
      setDeptName("");
    }
  }, [pathname]);

  const getPageTitle = () => {
    if (deptName) return deptName.toUpperCase();
    if (pathname === "/super-admin") return "DASHBOARD";
    if (pathname === "/super-admin/departments") return "DEPARTMENT";
    if (pathname === "/super-admin/faculty") return "FACULTY";
    if (pathname === "/super-admin/admin-management") return "ADMIN MANAGEMENT";
    if (pathname === "/super-admin/labs") return "LABS";
    if (pathname === "/pull-requests") return "PULL REQUESTS";
    if (pathname === "/current-timetables") return "CURRENT TIMETABLES";
    return "";
  };

  const isLoggedIn = useMemo(() => {
    try { return localStorage.getItem("superAdmin") === "true"; } catch { return false; }
  }, []);

  const navItems: NavItem[] = [
    { label: "Dashboard", href: "/super-admin", icon: <LayoutDashboard className="h-5 w-5" /> },
    { label: "Departments", href: "/super-admin/departments", icon: <Building2 className="h-5 w-5" /> },
    { label: "Faculty", href: "/super-admin/faculty", icon: <Users className="h-5 w-5" /> },
    { label: "Admin Management", href: "/super-admin/admin-management", icon: <UserCog className="h-5 w-5" /> },
    { label: "Labs", href: "/super-admin/labs", icon: <Beaker className="h-5 w-5" /> },
    { label: "Pull Requests", href: "/pull-requests", badge: pendingCount, icon: <GitPullRequest className="h-5 w-5" /> },
    { label: "Current Timetables", href: "/current-timetables", icon: <Calendar className="h-5 w-5" /> }
  ];

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

  const handleLogout = () => {
    localStorage.removeItem("superAdmin");
    navigate("/");
  };

  const handleAdminConsole = () => {
    navigate("/");
  };

  const handleFacultyLogin = () => {
    navigate("/faculty");
  };

  if (!isLoggedIn) return null;

  const linkBase = "group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 w-full relative overflow-hidden";

  const SidebarContent = () => (
    <div className={`flex h-full flex-col border-r shadow-sm transition-colors duration-300 ${isDark ? 'bg-gray-950 border-gray-800' : 'bg-white border-slate-100'}`}>
      {/* Logo Area */}
      <div className={`flex h-16 items-center px-6 border-b ${isDark ? 'border-gray-800' : 'border-slate-100'}`}>
        <Link to="/super-admin" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M12 2v20" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <span className={`font-extrabold text-lg tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>OptiTime</span>
        </Link>
        {/* Dark Mode Toggle */}
        <button
          onClick={toggleDark}
          className={`ml-auto p-2 rounded-xl transition-all duration-300 ${
            isDark
              ? 'bg-gray-800 text-yellow-400 hover:bg-gray-700 hover:text-yellow-300'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
          }`}
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        <div className={`text-[10px] font-bold uppercase tracking-wider mb-4 px-2 ${isDark ? 'text-gray-550' : 'text-slate-400'}`}>Super Admin Panel</div>
        <nav className="space-y-1.5">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.href === "/super-admin"}
              onClick={() => setIsMobileMenuOpen(false)}
              className={({ isActive }) => 
                isActive 
                  ? `${linkBase} ${isDark ? 'bg-emerald-950/30 text-emerald-450 border border-emerald-800/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]' : 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm'}` 
                  : `${linkBase} ${isDark ? 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-100 border border-transparent' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'} hover:pl-5`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`transition-all duration-300 ${isActive ? (isDark ? 'text-emerald-400' : 'text-emerald-700') : (isDark ? 'text-slate-500 group-hover:text-emerald-500' : 'text-slate-400 group-hover:text-emerald-700')}`}>
                    {item.icon}
                  </span>
                  <span className="relative z-10">{item.label}</span>
                  {isActive && (
                    <div className="absolute right-3 h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                  )}
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <Badge variant="secondary" className="ml-auto bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-450 shadow-none border border-emerald-200/20">
                      {item.badge}
                    </Badge>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Profile Footer in Sidebar */}
      <div className={`p-4 border-t ${isDark ? 'border-gray-800 bg-gray-900/50' : 'border-slate-100 bg-slate-50/50'}`}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="lg" className={`w-full justify-start h-auto p-2 transition-all rounded-xl ${isDark ? 'hover:bg-gray-800 text-gray-200' : 'hover:bg-white hover:shadow-sm hover:ring-1 hover:ring-slate-100'}`}>
              <div className="flex items-center gap-3 w-full">
                <Avatar className={`h-9 w-9 border ${isDark ? 'border-gray-700' : 'border-slate-200'}`}>
                  <AvatarFallback className="bg-emerald-100 text-emerald-700 font-bold">SA</AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left min-w-0">
                  <div className={`text-sm font-semibold truncate ${isDark ? 'text-gray-100' : 'text-slate-900'}`}>
                    Super Admin
                  </div>
                  <div className={`text-xs truncate ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>
                    admin@system.com
                  </div>
                </div>
                <ChevronRight className={`h-4 w-4 ${isDark ? 'text-gray-600' : 'text-slate-400'}`} />
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 p-2 rounded-xl shadow-xl border border-slate-150/50 dark:border-gray-800" sideOffset={8}>
            <div className="px-2 py-2 mb-1 bg-slate-50 dark:bg-gray-900/50 rounded-lg">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Signed in as</div>
              <div className="font-semibold text-slate-900 dark:text-slate-150 truncate">admin@system.com</div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleAdminConsole} className="rounded-lg py-2 cursor-pointer">
              <Settings className="h-4 w-4 mr-2 text-slate-500" />
              <span className="font-medium">Admin Console</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleFacultyLogin} className="rounded-lg py-2 cursor-pointer">
              <UserCheck className="h-4 w-4 mr-2 text-slate-500" />
              <span className="font-medium">Faculty Console</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-650 focus:text-red-700 rounded-lg py-2 cursor-pointer hover:bg-red-50 dark:hover:bg-red-950/20">
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

          <Link to="/super-admin" className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-emerald-600 flex items-center justify-center text-white font-bold">
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
                    <AvatarFallback className="text-xs bg-emerald-100 text-emerald-700 font-bold">SA</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl">
                <div className="px-2 py-1.5 text-sm">
                  <div className="font-medium truncate">Super Admin</div>
                  <div className="text-xs text-muted-foreground truncate">admin@system.com</div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleAdminConsole} className="rounded-lg">
                  <Settings className="h-4 w-4 mr-2" />
                  Admin Console
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

      <div className={`hidden md:flex md:items-center md:justify-between md:fixed md:top-0 md:left-72 lg:left-80 xl:left-72 2xl:left-80 md:right-0 md:z-20 md:border-b md:bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 md:px-6 md:py-4 transition-colors duration-300 ${isDark ? 'border-gray-800' : 'border-slate-100'}`}>
        <div className="font-extrabold text-lg md:text-xl tracking-tight text-foreground" style={{ fontFamily: 'Outfit, sans-serif' }}>
          {getPageTitle()}
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={`uppercase tracking-wide text-[9px] font-bold px-2 py-0.5 ${isDark ? 'border-gray-850 text-gray-400' : 'border-slate-200 text-slate-500'}`}>
            Super Admin
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className={`flex items-center space-x-2 rounded-xl transition-all ${isDark ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-slate-100 text-slate-700'}`}>
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-[10px] font-bold bg-emerald-100 text-emerald-700">SA</AvatarFallback>
                </Avatar>
                <span className="text-xs font-semibold">Super Admin</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl border border-slate-150/50 dark:border-gray-800">
              <div className="px-2 py-1.5 text-sm">
                <div className="font-semibold truncate text-slate-900 dark:text-slate-150">Super Admin</div>
                <div className="text-xs text-muted-foreground truncate">admin@system.com</div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleAdminConsole} className="rounded-lg flex items-center space-x-2">
                <Settings className="h-4 w-4" />
                <span className="font-medium">Admin Console</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleFacultyLogin} className="rounded-lg flex items-center space-x-2">
                <UserCheck className="h-4 w-4" />
                <span className="font-medium">Faculty Console</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-650 focus:text-red-700 rounded-lg py-2 cursor-pointer hover:bg-red-50 dark:hover:bg-red-950/20">
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </>
  );
};

export default Navbar;
