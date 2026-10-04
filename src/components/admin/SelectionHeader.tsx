import { useTimetableStore } from "@/store/timetableStore";
import { useLocation } from "react-router-dom";
import { useDarkMode } from "@/context/DarkModeContext";

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/admin": { title: "Dashboard", subtitle: "Role & Performance Overview" },
  "/admin/subjects": { title: "Subjects", subtitle: "Manage Course Subjects" },
  "/admin/faculty": { title: "Faculty", subtitle: "Manage Faculty Members" },
  "/lab": { title: "Lab Allocation", subtitle: "Manage Lab Resources" },
  "/admin/timetable": { title: "Timetable", subtitle: "View & Edit Timetables" },
  "/admin/sections": { title: "Sections", subtitle: "Manage Class Sections" },
  "/admin/years": { title: "Years", subtitle: "Manage Academic Years" },
  "/faculty": { title: "Dashboard", subtitle: "Faculty Overview" },
  "/faculty/subjects": { title: "Subjects", subtitle: "View Course Subjects" },
  "/csv-upload": { title: "Bulk Import", subtitle: "Import Data in Bulk" },
  "/faculty/csv-upload": { title: "Bulk Import", subtitle: "Import Data in Bulk" },
  // Super Admin Mappings
  "/super-admin": { title: "Dashboard", subtitle: "Super Admin Control Center" },
  "/super-admin/faculty": { title: "Faculty", subtitle: "Manage All Faculty Members" },
  "/super-admin/labs": { title: "Labs", subtitle: "Manage Laboratory Resources" },
  "/super-admin/departments": { title: "Departments", subtitle: "Manage Academic Branches" },
  "/super-admin/admin-management": { title: "Admin Management", subtitle: "Authorize & Manage Admins" },
  "/super-admin/settings": { title: "System Settings", subtitle: "Configure Academic Schedules" },
  "/current-timetables": { title: "Current Timetables", subtitle: "Active Schedules Overview" },
  "/pull-requests": { title: "Pull Requests", subtitle: "Review Schedule Submissions" },
};

interface SelectionHeaderProps {
  compact?: boolean;
}

const SelectionHeader = ({ compact = false }: SelectionHeaderProps) => {
  const { pathname } = useLocation();
  const { isDark } = useDarkMode();
  const isSuperAdminRoute = pathname.startsWith("/super-admin") || 
                            pathname.startsWith("/pull-requests") || 
                            pathname.startsWith("/current-timetables");

  if (isSuperAdminRoute) return null;

  let meta = PAGE_META[pathname];
  if (!meta) {
    if (pathname.startsWith("/super-admin/departments/")) {
      meta = { title: "Department Details", subtitle: "Department Overview & Statistics" };
    } else if (pathname.startsWith("/pull-requests/")) {
      meta = { title: "Pull Request Detail", subtitle: "Review Timetable Changes" };
    } else if (pathname.startsWith("/admin/subjects/")) {
      meta = { title: "Subjects", subtitle: "Manage Course Subjects" };
    } else if (pathname.startsWith("/faculty/subjects/")) {
      meta = { title: "Subjects", subtitle: "View Course Subjects" };
    } else {
      meta = { title: "Dashboard", subtitle: "Role & Performance Overview" };
    }
  }

  return (
    <div className={`sticky z-20 w-full backdrop-blur-2xl border-b transition-all duration-300 shrink-0 ${
      isSuperAdminRoute ? "top-16 md:top-14" : "top-16 md:top-0"
    } ${
      isDark
        ? "bg-[#070a14]/80 border-indigo-500/15 shadow-[0_4px_20px_rgba(0,0,0,0.4)]"
        : "bg-white/80 border-indigo-200/60 shadow-[0_1px_12px_rgba(99,102,241,0.05)]"
    }`}>
      <div className={`max-w-7xl mx-auto px-6 sm:px-8 flex items-center justify-between transition-all duration-200 ${
        compact ? "h-11 sm:h-12" : "h-14 sm:h-16"
      }`}>
        {/* Page Title */}
        <div className="flex flex-col justify-center">
          <h1 className={`font-extrabold tracking-tight leading-tight ${
            isDark ? "text-foreground" : "text-slate-900"
          } ${compact ? "text-lg" : "text-xl"}`}>
            {meta.title}
          </h1>
          <p className={`font-semibold ${
            isDark ? "text-muted-foreground" : "text-indigo-600/80"
          } ${compact ? "text-[11px]" : "text-xs mt-0.5"}`}>
            {meta.subtitle}
          </p>
        </div>
      </div>
    </div>
  );
};

export default SelectionHeader;
