import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { getPendingPRCount } from "@/lib/supabaseService";
import { Settings, User, UserCheck, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export interface NavItem {
  label: string;
  href: string;
  badge?: number;
}

const Navbar = () => {
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const isLoggedIn = useMemo(() => {
    try { return localStorage.getItem("superAdmin") === "true"; } catch { return false; }
  }, []);

  const navItems: NavItem[] = [
    { label: "Dashboard", href: "/super-admin" },
    { label: "Departments", href: "/super-admin/departments" },
    { label: "Admin Management", href: "/super-admin/admin-management" },
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

  const handleLogout = () => {
    localStorage.removeItem("superAdmin");
    navigate("/");
  };
  const handleSuperAdminLogin = () => {
    navigate("/super-admin-login");
  };

  const handleAdminConsole = () => {
    navigate("/admin-login");
  };

  const handleFacultyLogin = () => {
    navigate("/faculty");
  };

  if (!isLoggedIn) return null;

  const linkBase = "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover:bg-muted w-full";

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b px-6">
        <Link to="/super-admin" className="font-semibold text-lg">
          OptiTime
        </Link>
      </div>
      <div className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={({ isActive }) => isActive ? `${linkBase} bg-muted text-primary` : linkBase}
            >
              <span>{item.label}</span>
              {typeof item.badge === 'number' && item.badge > 0 && (
                <Badge variant="secondary" className="ml-auto">{item.badge}</Badge>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="border-t px-3 py-3">
        <Badge variant="outline" className="w-full justify-center uppercase tracking-wide text-[10px] font-medium px-2.5 py-1">
          Super Admin
        </Badge>
      </div>

      {/* Profile dropdown moved to top-right bar on desktop */}
    </div>
  );

  return (
    <>
      {/* Mobile Navbar */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SidebarContent />
            </SheetContent>
          </Sheet>

          <Link to="/super-admin" className="font-semibold">
            OptiTime
          </Link>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="uppercase tracking-wide text-[10px] font-medium px-2.5 py-1">
              Super Admin
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <User className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleAdminConsole}>
                  <Settings className="h-4 w-4 mr-2" />
                  Admin Console
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleFacultyLogin}>
                  <UserCheck className="h-4 w-4 mr-2" />
                  Faculty Console
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>Logout</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-72 md:flex-col md:border-r md:bg-background">
        <SidebarContent />
      </aside>

      {/* Desktop top bar with profile on the right */}
      <div className="hidden md:flex md:fixed md:top-0 md:left-72 md:right-0 md:z-20 md:border-b md:bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6 md:py-3">
        <div className="ml-auto flex items-center gap-3">
          <Badge variant="outline" className="uppercase tracking-wide text-[10px] font-medium px-2.5 py-1">
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
              <DropdownMenuItem onClick={handleAdminConsole} className="flex items-center space-x-2">
                <Settings className="h-4 w-4" />
                <span className="font-medium">Admin Console</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleFacultyLogin} className="flex items-center space-x-2">
                <UserCheck className="h-4 w-4" />
                <span className="font-medium">Faculty Console</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>Logout</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </>
  );
};

export default Navbar;
