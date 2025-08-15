import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { getPendingPRCount } from "@/lib/supabaseService";
import { Settings, User, LogOut, Home, BookOpen, Calendar, UserCheck } from "lucide-react";
import { Breadcrumbs, Crumb } from "@/components/Breadcrumbs";
import { useTimetableStore } from "@/store/timetableStore";

export interface AdminNavItem {
  label: string;
  href: string;
  badge?: number;
  icon?: React.ReactNode;
}

const AdminNavbar = () => {
  const [pendingCount, setPendingCount] = useState<number>(0);
  const navigate = useNavigate();
  const location = useLocation();
  const selection = useTimetableStore((s) => s.selection);

  const navItems: AdminNavItem[] = [
    { label: "Home", href: "/admin", icon: <Home className="h-4 w-4" /> },
    { label: "Subjects", href: "/subjects", icon: <BookOpen className="h-4 w-4" /> },
    { label: "Timetable", href: "/timetable", icon: <Calendar className="h-4 w-4" /> },
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

  const handleSuperAdminLogin = () => {
    navigate("/super-admin-login");
  };

  const handleFacultyLogin = () => {
    navigate("/faculty");
  };

  const handleBackToHome = () => {
    navigate("/");
  };

  // Generate breadcrumbs based on current route
  const generateBreadcrumbs = (): Crumb[] => {
    const path = location.pathname;
    const breadcrumbs: Crumb[] = [];

    if (path === "/admin") {
      breadcrumbs.push({ label: "Home" });
    } else if (path === "/subjects") {
      breadcrumbs.push({ label: "Home", href: "/admin" });
      breadcrumbs.push({ label: "Subjects" });
    } else if (path === "/timetable") {
      breadcrumbs.push({ label: "Home", href: "/admin" });
      breadcrumbs.push({ label: "Subjects", href: "/subjects" });
      breadcrumbs.push({ label: "Timetable" });
    } else if (path === "/pull-requests") {
      breadcrumbs.push({ label: "Home", href: "/admin" });
      breadcrumbs.push({ label: "Pull Requests" });
    } else if (path.startsWith("/pull-requests/")) {
      breadcrumbs.push({ label: "Home", href: "/admin" });
      breadcrumbs.push({ label: "Pull Requests", href: "/pull-requests" });
      breadcrumbs.push({ label: "PR Details" });
    } else if (path === "/current-timetables") {
      breadcrumbs.push({ label: "Home", href: "/admin" });
      breadcrumbs.push({ label: "Current Timetables" });
    }

    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs();
  const linkBase = "inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors hover:bg-muted";

  return (
    <>
      <header className="border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <nav className="container h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/admin" className="font-semibold">
              Sona-TTG
            </Link>
            <ul className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <li key={item.href}>
                  <NavLink
                    to={item.href}
                    className={({ isActive }) => isActive ? `${linkBase} bg-muted text-primary` : linkBase}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                    {typeof item.badge === 'number' && item.badge > 0 && (
                      <Badge variant="secondary" className="ml-1">{item.badge}</Badge>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center gap-2">
            {/* Current Selection Info */}
            {(selection.department || selection.year || selection.section) && (
              <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground border-l pl-4">
                {selection.department && <span>{selection.department}</span>}
                {selection.year && <span>• Year {selection.year}</span>}
                {selection.section && <span>• Section {selection.section}</span>}
              </div>
            )}
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center space-x-2">
                  <User className="h-4 w-4" />
                  <span>Profile</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleSuperAdminLogin} className="flex items-center space-x-2">
                  <Settings className="h-4 w-4" />
                  <span>Super Admin</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleFacultyLogin} className="flex items-center space-x-2">
                  <UserCheck className="h-4 w-4" />
                  <span>Faculty</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleBackToHome} className="flex items-center space-x-2">
                  <LogOut className="h-4 w-4" />
                  <span>Back to Home</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </nav>
      </header>
      
      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <div className="border-b bg-muted/30">
          <div className="container py-3">
            <Breadcrumbs segments={breadcrumbs} />
          </div>
        </div>
      )}
    </>
  );
};

export default AdminNavbar;
