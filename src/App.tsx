import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route } from "react-router-dom";
// Admin Pages
import Index from "./pages/admin/Index";
import SubjectManagement from "./pages/admin/SubjectManagement";
import Timetable from "./pages/admin/Timetable";
import Lab from "./pages/admin/Lab";
import YearSubjects from "./pages/admin/YearSubjects";
import SectionManagement from "./pages/admin/SectionManagement";
import CSVUpload from "./pages/admin/CSVUpload";
import AdminDepartmentYears from "./pages/admin/AdminDepartmentYears";
import FacultyCSVUpload from "./pages/faculty/FacultyCSVUpload";

// Faculty Pages
import Faculty from "./pages/faculty/Faculty";
import FacultyDashboard from "./pages/faculty/FacultyDashboard";

// Super Admin Pages
import SuperAdminDashboard from "./pages/superadmin/SuperAdminDashboard";
import AdminManagement from "./pages/superadmin/AdminManagement";
import Departments from "./pages/superadmin/Departments";
import DepartmentDetails from "./pages/superadmin/DepartmentDetails";
import PullRequests from "./pages/superadmin/PullRequests";
import CurrentTimetables from "./pages/superadmin/CurrentTimetables";
import PullRequestDetail from "./pages/superadmin/PullRequestDetail";
import LabManagement from "./pages/superadmin/LabManagement";

// Shared Pages
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DarkModeProvider } from "@/context/DarkModeContext";
const queryClient = new QueryClient();

const App = () => (
  <DarkModeProvider>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/admin" element={<Index />} />
            <Route path="/super-admin" element={<SuperAdminDashboard />} />
            <Route path="/super-admin/admin-management" element={<AdminManagement />} />
            <Route path="/super-admin/departments" element={<Departments />} />
            <Route path="/super-admin/departments/:id" element={<DepartmentDetails />} />
            <Route path="/super-admin/departments/:id/years/:year" element={<YearSubjects />} />
            <Route path="/super-admin/departments/:id/years/:year/sections/:section" element={<SectionManagement />} />
            <Route path="/subjects" element={<SubjectManagement />} />
            <Route path="/timetable" element={<Timetable />} />

            <Route path="/admin/faculty" element={<Faculty />} />
            <Route path="/admin/departments/:id/years/:year/sections/:section" element={<SectionManagement />} />
            <Route path="/lab" element={<Lab />} />
            <Route path="/csv-upload" element={<CSVUpload />} />
            <Route path="/faculty/csv-upload" element={<FacultyCSVUpload />} />
            <Route path="/pull-requests" element={<PullRequests />} />
            <Route path="/pull-requests/:id" element={<PullRequestDetail />} />
            <Route path="/current-timetables" element={<CurrentTimetables />} />
            <Route path="/super-admin/faculty" element={<Faculty />} />
            <Route path="/super-admin/labs" element={<LabManagement />} />
            <Route path="/faculty" element={<FacultyDashboard />} />
            <Route path="/admin/subjects" element={<AdminDepartmentYears />} />
            <Route path="/admin/subjects/:year" element={<YearSubjects />} />
            <Route path="/faculty/view-dept-faculty" element={<Faculty />} />
            <Route path="/faculty/subjects" element={<AdminDepartmentYears />} />
            <Route path="/faculty/subjects/:year" element={<YearSubjects />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
  </DarkModeProvider>
);

export default App;
