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
    try { 
      return localStorage.getItem("superAdmin") === "true" ||
        pathname.startsWith("/super-admin") ||
        pathname.startsWith("/pull-requests") ||
        pathname.startsWith("/current-timetables");
    } catch { return false; }
  }, [pathname]);

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
    navigate("/admin");
  };

  const handleFacultyLogin = () => {
    navigate("/faculty");
  };

  if (!isLoggedIn) return null;

  const linkBase = "group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 w-full relative overflow-hidden";

  const SidebarContent = () => (
    <div className={`flex h-full flex-col transition-colors duration-300 ${
      isDark 
        ? 'bg-[#090d1c]/80 backdrop-blur-2xl border-r border-indigo-500/20 shadow-[1px_0_24px_rgba(0,0,0,0.5)]' 
        : 'bg-white/80 backdrop-blur-2xl border-r border-indigo-200/60 shadow-[1px_0_20px_rgba(99,102,241,0.06)]'
    }`}>
      {/* Logo Area */}
      <div className={`flex h-16 items-center px-5 gap-3 border-b ${
        isDark ? 'border-indigo-500/15' : 'border-indigo-100/70'
      }`}>
        <Link to="/super-admin" className="flex items-center gap-2.5">
          <div className={`h-9 w-9 rounded-xl flex items-center justify-center shadow-md shrink-0 overflow-hidden border ${
            isDark
              ? 'bg-gradient-to-br from-indigo-500 to-purple-600 border-indigo-400/30 shadow-[0_0_12px_-2px_rgba(99,102,241,0.3)]'
              : 'bg-gradient-to-br from-indigo-600 via-indigo-500 to-purple-600 border-indigo-300/40 shadow-[0_0_12px_-2px_rgba(99,102,241,0.2)] ring-1 ring-indigo-400/20'
          }`}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-white">
              <path d="M12 2v20" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div>
            <span className={`text-base font-extrabold tracking-tight leading-tight block ${
              isDark ? 'text-white' : 'bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 bg-clip-text text-transparent'
            }`}>OptiTime</span>
            <span className={`text-[10px] font-bold leading-none block tracking-wide ${
              isDark ? 'text-indigo-400' : 'text-indigo-600'
            }`}>Super Admin</span>
          </div>
        </Link>
        {/* Dark Mode Toggle */}
        <button
          onClick={toggleDark}
          className={`ml-auto p-2 rounded-xl transition-all duration-300 ${
            isDark
              ? 'text-white/60 hover:text-white hover:bg-white/10 hover:shadow-[0_0_8px_rgba(255,255,255,0.15)]'
              : 'text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50/80 border border-indigo-100/70 shadow-xs'
          }`}
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        <p className={`text-[10px] font-bold uppercase tracking-widest px-3 pb-2 pt-1 ${
          isDark ? 'text-indigo-400/50' : 'text-indigo-900/60'
        }`}>Super Admin Panel</p>
        <nav className="space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.href === "/super-admin"}
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

      {/* Profile Footer in Sidebar */}
      <div className={`p-3 border-t ${
        isDark ? 'border-indigo-500/15 bg-white/[0.01]' : 'border-indigo-100/80 bg-indigo-50/30'
      }`}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="lg" className={`w-full justify-start h-auto p-2.5 transition-all rounded-xl ${
              isDark 
                ? 'hover:bg-[#141c33] text-gray-200 border border-transparent hover:border-indigo-500/20' 
                : 'hover:bg-white text-slate-800 border border-transparent hover:border-indigo-200/80 hover:shadow-sm'
            }`}>
              <div className="flex items-center gap-3 w-full">
                <Avatar className={`h-8 w-8 ring-2 ${isDark ? 'ring-indigo-500/25' : 'ring-indigo-500/20'}`}>
                  <AvatarFallback className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white font-bold text-xs">SA</AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left min-w-0">
                  <div className={`text-sm font-bold truncate leading-tight ${isDark ? 'text-gray-100' : 'text-slate-900'}`}>
                    Super Admin
                  </div>
                  <div className={`text-xs truncate font-medium ${isDark ? 'text-indigo-300/60' : 'text-indigo-600/80'}`}>
                    admin@system.com
                  </div>
                </div>
                <ChevronRight className={`h-4 w-4 shrink-0 ${isDark ? 'text-indigo-300/40' : 'text-indigo-400'}`} />
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={`w-64 p-2 rounded-2xl shadow-xl z-50 border backdrop-blur-xl ${
            isDark 
              ? 'bg-[#0a0e1e]/95 border-indigo-500/25 text-white shadow-indigo-950/50' 
              : 'bg-white/95 border-indigo-200/70 shadow-indigo-500/10'
          }`} sideOffset={8}>
            <div className={`px-2.5 py-2 mb-1 rounded-xl ${isDark ? 'bg-indigo-950/40 border border-indigo-500/20' : 'bg-indigo-50/70 border border-indigo-100'}`}>
              <div className={`text-xs font-medium ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}>Signed in as</div>
              <div className={`font-semibold truncate text-xs ${isDark ? 'text-white' : 'text-slate-900'}`}>admin@system.com</div>
            </div>
            <DropdownMenuSeparator className={isDark ? 'bg-indigo-500/15' : 'bg-indigo-100'} />
            <DropdownMenuItem onClick={handleAdminConsole} className={`rounded-lg py-2 cursor-pointer ${isDark ? 'focus:bg-indigo-500/15 focus:text-indigo-300' : 'focus:bg-indigo-50'}`}>
              <Settings className="h-4 w-4 mr-2 text-indigo-400" />
              <span className="font-medium text-xs">Admin Console</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleFacultyLogin} className={`rounded-lg py-2 cursor-pointer ${isDark ? 'focus:bg-indigo-500/15 focus:text-indigo-300' : 'focus:bg-indigo-50'}`}>
              <UserCheck className="h-4 w-4 mr-2 text-indigo-400" />
              <span className="font-medium text-xs">Faculty Console</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className={isDark ? 'bg-indigo-500/15' : 'bg-indigo-100'} />
            <DropdownMenuItem onClick={handleLogout} className="text-rose-500 focus:text-rose-400 focus:bg-rose-500/10 rounded-lg py-2 cursor-pointer">
              <LogOut className="h-4 w-4 mr-2" />
              <span className="font-medium text-xs">Sign Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Navbar */}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-2xl md:hidden transition-colors duration-300 ${
        isDark ? 'bg-[#090d1c]/80 border-indigo-500/20' : 'bg-white/80 border-indigo-200/60'
      }`}>
        <div className="flex h-16 items-center justify-between px-4">
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className={`rounded-xl ${isDark ? 'hover:bg-indigo-500/15 text-gray-300' : 'hover:bg-indigo-50'}`}>
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0 border-r-0">
              <SidebarContent />
            </SheetContent>
          </Sheet>

          <Link to="/super-admin" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold shadow-sm shadow-indigo-500/25">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <path d="M12 2v20" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <span className={`font-bold text-base tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>OptiTime</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleDark}
              className={`p-2 rounded-xl transition-all duration-300 ${
                isDark ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-indigo-600 hover:bg-indigo-50'
              }`}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 p-0 ring-2 ring-indigo-500/20">
                  <Avatar className="h-full w-full">
                    <AvatarFallback className="text-xs bg-gradient-to-br from-indigo-600 to-purple-600 text-white font-bold">SA</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={`w-56 p-2 rounded-2xl shadow-xl border backdrop-blur-xl ${
                isDark ? 'bg-[#0a0e1e]/95 border-indigo-500/25 text-white' : 'bg-white/95 border-indigo-200/70'
              }`}>
                <div className="px-2 py-1.5 text-xs">
                  <div className="font-bold truncate">Super Admin</div>
                  <div className="text-[11px] text-muted-foreground truncate">admin@system.com</div>
                </div>
                <DropdownMenuSeparator className={isDark ? 'bg-indigo-500/15' : 'bg-indigo-100'} />
                <DropdownMenuItem onClick={handleAdminConsole} className="rounded-lg text-xs">
                  <Settings className="h-4 w-4 mr-2 text-indigo-400" />
                  Admin Console
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleFacultyLogin} className="rounded-lg text-xs">
                  <UserCheck className="h-4 w-4 mr-2 text-indigo-400" />
                  Faculty Console
                </DropdownMenuItem>
                <DropdownMenuSeparator className={isDark ? 'bg-indigo-500/15' : 'bg-indigo-100'} />
                <DropdownMenuItem onClick={handleLogout} className="text-rose-500 rounded-lg text-xs">
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

      {/* Desktop Top Header */}
      <div className={`hidden md:flex md:items-center md:justify-between md:fixed md:top-0 md:left-72 md:right-0 md:z-20 md:h-16 md:border-b md:backdrop-blur-2xl md:px-6 transition-colors duration-300 ${
        isDark ? 'bg-[#090d1c]/80 border-indigo-500/20 shadow-[0_4px_20px_rgba(0,0,0,0.4)]' : 'bg-white/80 border-indigo-200/60 shadow-[0_2px_12px_rgba(99,102,241,0.03)]'
      }`}>
        <div className="font-extrabold text-lg md:text-xl tracking-tight text-foreground" style={{ fontFamily: 'Outfit, sans-serif' }}>
          {getPageTitle()}
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={`uppercase tracking-wide text-[9px] font-bold px-2 py-0.5 rounded-md border ${
            isDark ? 'border-indigo-500/30 text-indigo-300 bg-indigo-500/10' : 'border-indigo-300/70 text-indigo-700 bg-indigo-50/60'
          }`}>
            Super Admin
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className={`flex items-center space-x-2 rounded-xl transition-all ${
                isDark ? 'hover:bg-indigo-500/15 text-gray-300' : 'hover:bg-indigo-50 text-slate-700'
              }`}>
                <Avatar className="h-6 w-6 ring-1 ring-indigo-500/30">
                  <AvatarFallback className="text-[10px] font-bold bg-gradient-to-br from-indigo-600 to-purple-600 text-white">SA</AvatarFallback>
                </Avatar>
                <span className="text-xs font-semibold">Super Admin</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={`w-56 p-2 rounded-2xl shadow-xl border backdrop-blur-xl ${
              isDark ? 'bg-[#0a0e1e]/95 border-indigo-500/25 text-white' : 'bg-white/95 border-indigo-200/70'
            }`}>
              <div className="px-2 py-1.5 text-xs">
                <div className="font-semibold truncate text-slate-900 dark:text-slate-100">Super Admin</div>
                <div className="text-[11px] text-muted-foreground truncate">admin@system.com</div>
              </div>
              <DropdownMenuSeparator className={isDark ? 'bg-indigo-500/15' : 'bg-indigo-100'} />
              <DropdownMenuItem onClick={handleAdminConsole} className="rounded-lg flex items-center space-x-2 text-xs">
                <Settings className="h-4 w-4 text-indigo-400" />
                <span className="font-medium">Admin Console</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleFacultyLogin} className="rounded-lg flex items-center space-x-2 text-xs">
                <UserCheck className="h-4 w-4 text-indigo-400" />
                <span className="font-medium">Faculty Console</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className={isDark ? 'bg-indigo-500/15' : 'bg-indigo-100'} />
              <DropdownMenuItem onClick={handleLogout} className="text-rose-500 focus:text-rose-400 rounded-lg py-2 cursor-pointer hover:bg-rose-50 dark:hover:bg-rose-950/20 text-xs">
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
