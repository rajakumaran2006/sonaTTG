import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { getPendingPRCount } from "@/lib/supabaseService";
import { Settings, User, LogOut, Home, BookOpen, Calendar, UserCheck, Upload, Menu, ChevronRight, Moon, Sun, FileSpreadsheet } from "lucide-react";
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
  is_active: boolean;
}

const AdminNavbar = () => {
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const selection = useTimetableStore((s) => s.selection);
  const { isDark, toggleDark } = useDarkMode();

  const navItems: AdminNavItem[] = [
    { label: "Home", href: "/admin", icon: <Home className="h-5 w-5" /> },
    { label: "Subjects", href: "/admin/subjects", icon: <BookOpen className="h-5 w-5" /> },
    { label: "Faculty", href: "/admin/faculty", icon: <UserCheck className="h-5 w-5" /> },
    { label: "Bulk Import", href: "/csv-upload", icon: <FileSpreadsheet className="h-5 w-5" /> },
    { label: "Lab Allocation", href: "/lab", icon: <Upload className="h-5 w-5" /> },
  ];


  useEffect(() => {
    // Load admin user data from localStorage
    const adminData = localStorage.getItem("adminUser");
    if (adminData) {
      try {
        const parsed = JSON.parse(adminData);
        if (parsed && parsed.email) {
            setAdminUser(parsed);
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

  // Modern styling for links
  const linkBase = "group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 w-full relative overflow-hidden";
  
  const SidebarContent = () => (
    <div className={`flex h-full flex-col border-r shadow-sm transition-colors duration-300 ${isDark ? 'bg-gray-950 border-gray-800' : 'bg-white border-slate-100'}`}>
      {/* Logo Area */}
      <div className={`flex h-20 items-center px-6 border-b ${isDark ? 'border-gray-800' : 'border-slate-100'}`}>
        <Link to="/admin" className={`flex items-center gap-2 font-bold text-xl tracking-tight group ${isDark ? 'text-white' : 'text-slate-900'}`}>
          <span className={`uppercase bg-clip-text text-transparent ${isDark ? 'bg-gradient-to-r from-emerald-400 to-emerald-300' : 'bg-gradient-to-r from-slate-900 to-slate-700'}`}>OptiTime</span>
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
      <div className="flex-1 px-4 py-6 space-y-1">
        <div className={`text-xs font-semibold uppercase tracking-wider mb-4 px-2 ${isDark ? 'text-gray-500' : 'text-slate-400'}`}>Main Menu</div>
        <nav className="space-y-1.5">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.href === "/admin"}
              onClick={() => setIsMobileMenuOpen(false)}
              className={({ isActive }) => 
                isActive 
                  ? `${linkBase} ${isDark ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-800/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]' : 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm'}` 
                  : `${linkBase} ${isDark ? 'text-slate-450 hover:bg-slate-900/50 hover:text-slate-105 border border-transparent' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'} hover:pl-5`
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
                    <Badge variant="secondary" className="ml-auto bg-emerald-100 text-emerald-700 shadow-none">
                      {item.badge}
                    </Badge>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Current Selection Info Card */}
      {(selection.department || selection.year || selection.section) && (
        <div className="px-4 pb-4">
          <div className={`rounded-xl p-4 border ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-slate-50 border-slate-100'}`}>
             <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-500' : 'text-slate-400'}`}>
                Current Context
             </div>
             <div className="space-y-1">
                {selection.department && <div className={`text-sm font-semibold truncate ${isDark ? 'text-gray-100' : 'text-slate-800'}`} title={selection.department}>{selection.department}</div>}
                <div className={`flex gap-2 text-xs font-medium ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>
                    {selection.year && <span>Year {selection.year}</span>}
                    {selection.year && selection.section && <span>•</span>}
                    {selection.section && <span>Sec {selection.section}</span>}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* User Footer */}
      <div className={`p-4 border-t ${isDark ? 'border-gray-800 bg-gray-900/50' : 'border-slate-100 bg-slate-50/50'}`}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="lg" className={`w-full justify-start h-auto p-2 transition-all rounded-xl ${isDark ? 'hover:bg-gray-800 text-gray-200' : 'hover:bg-white hover:shadow-sm hover:ring-1 hover:ring-slate-100'}`}>
              <div className="flex items-center gap-3 w-full">
                <Avatar className={`h-9 w-9 border ${isDark ? 'border-gray-700' : 'border-slate-200'}`}>
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${adminUser?.name}`} />
                    <AvatarFallback className="bg-emerald-100 text-emerald-700">{adminUser?.name?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left min-w-0">
                  <div className={`text-sm font-semibold truncate ${isDark ? 'text-gray-100' : 'text-slate-900'}`}>
                    {adminUser?.name || 'Admin'}
                  </div>
                  <div className={`text-xs truncate ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>
                    {adminUser?.email}
                  </div>
                </div>
                <ChevronRight className={`h-4 w-4 ${isDark ? 'text-gray-600' : 'text-slate-400'}`} />
              </div>
            </Button>
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
