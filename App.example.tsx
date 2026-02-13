import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route } from "react-router-dom";

// Unified Login & Protection
import UnifiedLogin from "./pages/UnifiedLogin";
import ProtectedRoute from "./components/ProtectedRoute";
import Unauthorized from "./pages/Unauthorized";

// Admin Pages
import Index from "./pages/admin/Index";
import SubjectManagement from "./pages/admin/SubjectManagement";
import Timetable from "./pages/admin/Timetable";
import Lab from "./pages/admin/Lab";
import YearSubjects from "./pages/admin/YearSubjects";
import SectionManagement from "./pages/admin/SectionManagement";
import CSVUpload from "./pages/admin/CSVUpload";

// Faculty Pages
import Faculty from "./pages/faculty/Faculty";
import FacultyDashboard from "./pages/faculty/FacultyDashboard";
import FacultyCSVUpload from "./pages/faculty/FacultyCSVUpload";

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

import { ErrorBoundary } from "@/components/ErrorBoundary";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ErrorBoundary>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<UnifiedLogin />} />
          <Route path="/login" element={<UnifiedLogin />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Index />
              </ProtectedRoute>
            }
          />
          <Route
            path="/subjects"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <SubjectManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/timetable"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Timetable />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/faculty"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Faculty />
              </ProtectedRoute>
            }
          />
          <Route
            path="/lab"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Lab />
              </ProtectedRoute>
            }
          />
          <Route
            path="/csv-upload"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <CSVUpload />
              </ProtectedRoute>
            }
          />

          {/* Super Admin Routes */}
          <Route
            path="/super-admin"
            element={
              <ProtectedRoute allowedRoles={["super_admin"]}>
                <SuperAdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/super-admin/admin-management"
            element={
              <ProtectedRoute allowedRoles={["super_admin"]}>
                <AdminManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/super-admin/departments"
            element={
              <ProtectedRoute allowedRoles={["super_admin"]}>
                <Departments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/super-admin/departments/:id"
            element={
              <ProtectedRoute allowedRoles={["super_admin"]}>
                <DepartmentDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/super-admin/departments/:id/years/:year"
            element={
              <ProtectedRoute allowedRoles={["super_admin"]}>
                <YearSubjects />
              </ProtectedRoute>
            }
          />
          <Route
            path="/super-admin/departments/:id/years/:year/sections/:section"
            element={
              <ProtectedRoute allowedRoles={["super_admin"]}>
                <SectionManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pull-requests"
            element={
              <ProtectedRoute allowedRoles={["super_admin"]}>
                <PullRequests />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pull-requests/:id"
            element={
              <ProtectedRoute allowedRoles={["super_admin"]}>
                <PullRequestDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/current-timetables"
            element={
              <ProtectedRoute allowedRoles={["super_admin"]}>
                <CurrentTimetables />
              </ProtectedRoute>
            }
          />
          <Route
            path="/super-admin/faculty"
            element={
              <ProtectedRoute allowedRoles={["super_admin"]}>
                <Faculty />
              </ProtectedRoute>
            }
          />
          <Route
            path="/super-admin/labs"
            element={
              <ProtectedRoute allowedRoles={["super_admin"]}>
                <LabManagement />
              </ProtectedRoute>
            }
          />

          {/* Faculty Routes */}
          <Route path="/faculty" element={<FacultyDashboard />} />
          <Route path="/faculty/csv-upload" element={<FacultyCSVUpload />} />

          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
