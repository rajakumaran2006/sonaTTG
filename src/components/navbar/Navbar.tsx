import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { getPendingPRCount } from "@/lib/supabaseService";
import { Settings, User, UserCheck } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  badge?: number;
}

const Navbar = () => {
  const [pendingCount, setPendingCount] = useState<number>(0);
  const navigate = useNavigate();
  const isLoggedIn = useMemo(() => {
    try { return localStorage.getItem("superAdmin") === "true"; } catch { return false; }
  }, []);

  const navItems: NavItem[] = [
    { label: "Departments", href: "/super-admin/departments" },
    { label: "Faculty", href: "/super-admin/faculty" },
    { label: "Pull Requests", href: "/pull-requests", badge: pendingCount },
    { label: "Current Timetables", href: "/current-timetables" }
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
  const handleSuperAdminLogin = () => {
    navigate("/admin");
  };

  const handleFacultyLogin = () => {
    navigate("/faculty");
  };



  if (!isLoggedIn) return null;

  const linkBase = "inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors hover:bg-muted";

  return (
    <header className="border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav className="container h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/super-admin" className="font-semibold">
            Sona-TTG
          </Link>
          <ul className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <li key={item.href}>
                <NavLink
                  to={item.href}
                  className={({ isActive }) => isActive ? `${linkBase} bg-muted text-primary` : linkBase}
                >
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
                  <span>Admin</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleFacultyLogin} className="flex items-center space-x-2">
                  <UserCheck className="h-4 w-4" />
                  <span>Faculty</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
