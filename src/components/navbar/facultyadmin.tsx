import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { getPendingPRCount } from "@/lib/supabaseService";
import { Settings, User, UserCheck, LogOut, Menu, Sun, Moon, Home, BookOpen, Upload, Calendar } from "lucide-react";
import { useDarkMode } from "@/context/DarkModeContext";

export interface NavItem {
  label: string;
  href: string;
  badge?: number;
  icon?: React.ReactNode;
}

const Navbar = () => {
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { isDark, toggleDark } = useDarkMode();

  const userSession = useMemo(() => {
    try {
      const superAdmin = localStorage.getItem("superAdmin") === "true";
      const adminUser = localStorage.getItem("adminUser");
      const facultyUser = localStorage.getItem("facultyUser");

      if (superAdmin) return { role: "Super Admin", details: { name: "Super Admin", email: "admin@system.com" } };
      if (adminUser) {
        const parsed = JSON.parse(adminUser);
        return { role: "Admin", details: { name: parsed.name || "Admin", email: parsed.email } };
      }
      if (facultyUser) {
        const parsed = JSON.parse(facultyUser);
        return { role: "Faculty", details: { name: parsed.name || "Faculty Member", email: parsed.email } };
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const navItems = useMemo<NavItem[]>(() => {
    if (!userSession) return [];

    if (userSession.role === "Faculty") {
      return [
        { label: "Dashboard", href: "/faculty", icon: <Home className="h-4 w-4" /> },
        { label: "Subjects", href: "/faculty/subjects", icon: <BookOpen className="h-4 w-4" /> }
      ];
    }

    if (userSession.role === "Super Admin") {
      return [
        { label: "Dashboard", href: "/super-admin", icon: <Home className="h-4 w-4" /> },
        { label: "Departments", href: "/super-admin/departments", icon: <Settings className="h-4 w-4" /> },
        { label: "Labs", href: "/super-admin/labs", icon: <Upload className="h-4 w-4" /> },
        { label: "Pull Requests", href: "/pull-requests", badge: pendingCount, icon: <Calendar className="h-4 w-4" /> }
      ];
    }

    // Default Admin nav
    return [
      { label: "Dashboard", href: "/admin", icon: <Home className="h-4 w-4" /> },
      { label: "Subjects", href: "/admin/subjects", icon: <BookOpen className="h-4 w-4" /> },
      { label: "Faculty", href: "/admin/faculty", icon: <UserCheck className="h-4 w-4" /> },
      { label: "Lab Allocation", href: "/lab", icon: <Upload className="h-4 w-4" /> }
    ];
  }, [userSession, pendingCount]);

  useEffect(() => {
    if (!userSession) return;
    
    let mounted = true;
    (async () => {
      try {
        const c = await getPendingPRCount();
        if (mounted) setPendingCount(c);
      } catch {}
    })();

    const channel = supabase
      .channel('schema-db-changes-nav')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'timetable_pull_requests' }, async () => {
        try {
          const c = await getPendingPRCount();
          if (mounted) setPendingCount(c);
        } catch {}
      })
      .subscribe();

    return () => {
      mounted = false;
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [userSession]);

  const handleLogout = () => {
    localStorage.removeItem("superAdmin");
    localStorage.removeItem("adminUser");
    localStorage.removeItem("facultyUser");
    navigate("/", { replace: true });
  };

  const handleSwitchConsole = () => {
    if (userSession?.role === "Super Admin") {
      navigate("/super-admin");
    } else if (userSession?.role === "Admin") {
      navigate("/admin");
    } else {
      navigate("/faculty");
    }
  };

  if (!userSession) return null;

  const linkBase = "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-300";
  const getLogoLink = () => {
    if (userSession.role === "Super Admin") return "/super-admin";
    if (userSession.role === "Admin") return "/admin";
    return "/faculty";
  };

  const SidebarContent = () => (
    <div className="flex h-full flex-col p-4 bg-background">
      <div className="flex h-12 items-center border-b pb-4 mb-4">
        <Link to={getLogoLink()} className="font-bold text-lg tracking-tight uppercase bg-clip-text text-transparent bg-gradient-to-r from-emerald-500 to-teal-600">
          OptiTime
        </Link>
      </div>
      <nav className="flex-1 space-y-1.5">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            end={item.href === "/super-admin" || item.href === "/admin" || item.href === "/faculty"}
            onClick={() => setIsMobileMenuOpen(false)}
            className={({ isActive }) => 
              isActive 
                ? `${linkBase} bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20`
                : `${linkBase} text-muted-foreground hover:bg-muted hover:text-foreground`
            }
          >
            {item.icon}
            <span>{item.label}</span>
            {typeof item.badge === 'number' && item.badge > 0 && (
              <Badge variant="secondary" className="ml-auto bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                {item.badge}
              </Badge>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center gap-3 px-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{userSession.details.name}</p>
            <p className="text-xs text-muted-foreground truncate">{userSession.details.email}</p>
          </div>
        </div>
        <Button variant="destructive" size="sm" onClick={handleLogout} className="w-full justify-start gap-2">
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );

  return (
    <header className="sticky top-0 z-40 border-b backdrop-blur-md bg-background/80 border-border transition-colors duration-300">
      <nav className="container h-14 flex items-center justify-between px-4">
        
        {/* Left Side: Brand Logo and Desktop Nav */}
        <div className="flex items-center gap-6">
          <Link to={getLogoLink()} className="font-bold text-lg tracking-tight uppercase bg-clip-text text-transparent bg-gradient-to-r from-emerald-500 to-teal-600">
            OptiTime
          </Link>
          
          <div className="hidden md:flex items-center gap-1.5">
            {navItems.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.href === "/super-admin" || item.href === "/admin" || item.href === "/faculty"}
                className={({ isActive }) => 
                  isActive 
                    ? `${linkBase} bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20`
                    : `${linkBase} text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent`
                }
              >
                <span>{item.label}</span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <Badge variant="secondary" className="bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 py-0 px-1.5 text-[10px]">
                    {item.badge}
                  </Badge>
                )}
              </NavLink>
            ))}
          </div>
        </div>

        {/* Right Side: Quick controls, Dark Mode and Profile Dropdown */}
        <div className="flex items-center gap-2">
          {/* Role Pill */}
          <Badge variant="outline" className="hidden sm:inline-flex uppercase tracking-wide text-[9px] font-bold px-2 py-0.5 border-border">
            {userSession.role}
          </Badge>
          
          {/* Dark Mode Switcher */}
          <button
            onClick={toggleDark}
            className="p-2 rounded-xl transition-all duration-300 hover:bg-muted text-muted-foreground hover:text-foreground"
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Mobile Hamburguer Drawer */}
          <div className="md:hidden">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 p-0">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0 border-r-0">
                <SidebarContent />
              </SheetContent>
            </Sheet>
          </div>

          {/* Desktop Profile dropdown */}
          <div className="hidden md:block">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center gap-2 px-2 hover:bg-muted">
                  <User className="h-4 w-4" />
                  <span className="max-w-[80px] truncate">{userSession.details.name.split(" ")[0]}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl border-border">
                <div className="px-2 py-1.5">
                  <div className="font-semibold text-sm truncate">{userSession.details.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{userSession.details.email}</div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSwitchConsole} className="rounded-lg py-2 cursor-pointer">
                  <Settings className="h-4 w-4 mr-2" />
                  <span>Go to Console</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive rounded-lg py-2 cursor-pointer focus:bg-destructive/10">
                  <LogOut className="h-4 w-4 mr-2" />
                  <span>Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

        </div>
      </nav>
    </header>
  );
};

export default Navbar;
