import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { getPendingPRCount } from "@/lib/supabaseService";
import { Settings, User, UserCheck, LogOut } from "lucide-react";

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
    { label: "Faculty Schedules", href: "/super-admin/faculty-schedules" },
    { label: "Labs", href: "/super-admin/labs" },
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


  const handleSuperAdminLogin = () => {
    navigate("/super-admin-login");
  };
  const handleAdminLogin = () => {
    navigate("/admin-login");
  };


  const handleBackToHome = () => {
    navigate("/");
  };

  if (!isLoggedIn) return null;

  const linkBase = "inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors hover:bg-muted";

  return (
    <header className="border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav className="container h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/super-admin" className="font-semibold">
            OptiTime
          </Link>
        </div>
        <div className="flex items-center gap-2">
          
          {/* Role Pill */}
          <Badge variant="outline" className="hidden sm:inline-flex uppercase tracking-wide text-[10px] font-medium px-2.5 py-1">
            Super Admin
          </Badge>
          
          
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
                  <span className="font-medium">Super Admin Console</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleAdminLogin} className="flex items-center space-x-2">
                  <UserCheck className="h-4 w-4" />
                  <span className="font-medium">Admin Console</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleBackToHome} className="flex items-center space-x-2">
                  <LogOut className="h-4 w-4" />
                  <span className="font-medium">Back to Home</span>
                </DropdownMenuItem>

              </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
