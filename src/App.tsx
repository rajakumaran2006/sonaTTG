import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route } from "react-router-dom";
// Admin Pages
import Index from "./pages/admin/Index";
import SubjectManagement from "./pages/admin/SubjectManagement";
import Timetable from "./pages/admin/Timetable";
import YearSubjects from "./pages/admin/YearSubjects";
import SectionManagement from "./pages/admin/SectionManagement";

// Faculty Pages
import Faculty from "./pages/faculty/Faculty";
import FacultyDashboard from "./pages/faculty/FacultyDashboard";

// Super Admin Pages
import SuperAdminLogin from "./pages/superadmin/SuperAdminLogin";
import SuperAdminDashboard from "./pages/superadmin/SuperAdminDashboard";
import Departments from "./pages/superadmin/Departments";
import DepartmentDetails from "./pages/superadmin/DepartmentDetails";
import PullRequests from "./pages/superadmin/PullRequests";
import CurrentTimetables from "./pages/superadmin/CurrentTimetables";
import PullRequestDetail from "./pages/superadmin/PullRequestDetail";
import Settings from "./pages/superadmin/Settings";

// Shared Pages
import NotFound from "./pages/NotFound";
import RoleSelect from "./pages/Home";

import { ErrorBoundary } from "@/components/ErrorBoundary";
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<RoleSelect />} />
            <Route path="/admin" element={<Index />} />
            <Route path="/super-admin-login" element={<SuperAdminLogin />} />
            <Route path="/super-admin" element={<SuperAdminDashboard />} />
            <Route path="/super-admin/departments" element={<Departments />} />
            <Route path="/super-admin/departments/:id" element={<DepartmentDetails />} />
            <Route path="/super-admin/departments/:id/years/:year" element={<YearSubjects />} />
            <Route path="/super-admin/departments/:id/years/:year/sections/:section" element={<SectionManagement />} />
            <Route path="/subjects" element={<SubjectManagement />} />
            <Route path="/timetable" element={<Timetable />} />
            <Route path="/pull-requests" element={<PullRequests />} />
            <Route path="/pull-requests/:id" element={<PullRequestDetail />} />
            <Route path="/current-timetables" element={<CurrentTimetables />} />
            <Route path="/super-admin/faculty" element={<Faculty />} />
            <Route path="/super-admin/settings" element={<Settings />} />
            <Route path="/faculty" element={<FacultyDashboard />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
