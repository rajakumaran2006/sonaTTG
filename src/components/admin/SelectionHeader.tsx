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
};

const SelectionHeader = () => {
  const { pathname } = useLocation();

  const meta = PAGE_META[pathname] ?? { title: "Dashboard", subtitle: "Role & Performance Overview" };

  return (
    <div className="sticky top-16 md:top-0 z-20 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b transition-all duration-300">
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
