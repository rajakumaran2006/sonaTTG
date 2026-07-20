import { useTimetableStore } from "@/store/timetableStore";
import { useLocation } from "react-router-dom";

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/admin": { title: "Dashboard", subtitle: "Role & Performance Overview" },
  "/admin/subjects": { title: "Subjects", subtitle: "Manage Course Subjects" },
  "/admin/faculty": { title: "Faculty", subtitle: "Manage Faculty Members" },
  "/lab": { title: "Lab Allocation", subtitle: "Manage Lab Resources" },
  "/admin/timetable": { title: "Timetable", subtitle: "View & Edit Timetables" },
  "/admin/sections": { title: "Sections", subtitle: "Manage Class Sections" },
  "/admin/years": { title: "Years", subtitle: "Manage Academic Years" },
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

const SelectionHeader = () => {
  const { pathname } = useLocation();
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
    } else {
      meta = { title: "Dashboard", subtitle: "Role & Performance Overview" };
    }
  }

  return (
    <div className={`sticky z-20 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b transition-all duration-300 ${
      isSuperAdminRoute ? "top-16 md:top-14" : "top-16 md:top-0"
    }`}>
      <div className="container px-4 h-16 flex items-center gap-4">

        {/* Page Title */}
        <div className="flex flex-col justify-center">
          <h1 className="text-lg font-extrabold tracking-tight text-foreground leading-none">
            {meta.title.toUpperCase()}
          </h1>
          <p className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase mt-0.5">
            {meta.subtitle}
          </p>
        </div>

      </div>
    </div>
  );
};

export default SelectionHeader;
