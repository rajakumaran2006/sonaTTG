import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { getPendingPRCount } from "@/lib/supabaseService";
import { Settings, User, UserCheck, Menu } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  badge?: number;
}

const Navbar = () => {
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const isLoggedIn = useMemo(() => {
    try { return localStorage.getItem("superAdmin") === "true"; } catch { return false; }
  }, []);

  const navItems: NavItem[] = [
    { label: "Departments", href: "/super-admin/departments" },
    { label: "Faculty", href: "/super-admin/faculty" },
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

  const linkBase = "inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors hover:bg-muted";

  return (
    <header className="border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav className="container h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/super-admin" className="font-semibold">
            OptiTime
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
          {/* Mobile Menu Button */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="md:hidden">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <div className="flex flex-col gap-4 mt-8">
                <div className="text-lg font-semibold mb-4">Navigation</div>
                {navItems.map((item) => (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                        isActive ? 'bg-muted text-primary' : 'hover:bg-muted'
                      }`
                    }
                  >
                    <span>{item.label}</span>
                    {typeof item.badge === 'number' && item.badge > 0 && (
                      <Badge variant="secondary" className="ml-auto">{item.badge}</Badge>
                    )}
                  </NavLink>
                ))}
                <div className="border-t pt-4 mt-4">
                  <div className="text-sm font-medium text-muted-foreground mb-2">Console Access</div>
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        handleAdminConsole();
                        setMobileMenuOpen(false);
                      }}
                      className="w-full justify-start"
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Admin Console
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        handleFacultyLogin();
                        setMobileMenuOpen(false);
                      }}
                      className="w-full justify-start"
                    >
                      <UserCheck className="h-4 w-4 mr-2" />
                      Faculty Console
                    </Button>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {/* Role Pill */}
          <Badge variant="outline" className="hidden sm:inline-flex uppercase tracking-wide text-[10px] font-medium px-2.5 py-1">
            Super Admin
          </Badge>

          <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center space-x-2">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">Profile</span>
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
              </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
