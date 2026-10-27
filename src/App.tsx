import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, Outlet, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { ReactNode } from "react";
import Index from "./pages/Index";
import Attendance from "./pages/Attendance";
import OTRequests from "./pages/OTRequests";
import Approvals from "./pages/Approvals";
import Reports from "./pages/Reports";
import EmployeeManagement from "./pages/EmployeeManagement";
import Holidays from "./pages/Holidays";
import LeaveManagement from "./pages/LeaveManagement";
import Tasks from "./pages/Tasks";
import TaskBoard from "./pages/TaskBoard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Login from "./pages/Login";

import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import SalaryIncrements from "./pages/SalaryIncrements";
import EmployeeProfile from "./pages/EmployeeProfile";
import Loans from "./pages/Loans";
import Payment from "./pages/Payment";
import NoticeBoard from "./pages/NoticeBoard";
import SOP from "./pages/SOP";
import TeamMemberDetails from "./pages/TeamMemberDetails";
import PerformanceEvaluation from "./pages/PerformanceEvaluation";

const queryClient = new QueryClient();

// A single layout route (rendered once via <Outlet/>) instead of each
// protected <Route> wrapping its own <AppLayout> — otherwise AppLayout (and
// the sidebar/header inside it) unmounts and remounts on every navigation
// between tabs, instead of staying mounted while only the page content
// underneath it changes.
const ProtectedLayout = () => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
};

const PublicOnlyRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const RoleGate = ({ children, allow }: { children: ReactNode; allow: ("admin" | "manager" | "employee")[] }) => {
  const { role } = useAuth();
  if (!allow.includes(role)) return <Navigate to="/" replace />;
  return <>{children}</>;
};

/** Old /projects/:id bookmarks keep working after the Tasks rename. */
const ProjectRedirect = () => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/tasks/${id}`} replace />;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
    <Route path="/signup" element={<Navigate to="/login" replace />} />
    <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPassword /></PublicOnlyRoute>} />
    <Route path="/reset-password" element={<ResetPassword />} />

    <Route element={<ProtectedLayout />}>
      <Route path="/" element={<Index />} />
      <Route path="/attendance" element={<Attendance />} />
      <Route path="/ot-requests" element={<OTRequests />} />
      <Route path="/approvals" element={<RoleGate allow={["admin", "manager"]}><Approvals /></RoleGate>} />
      <Route path="/performance-evaluation" element={<RoleGate allow={["admin", "manager"]}><PerformanceEvaluation /></RoleGate>} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/employees" element={<RoleGate allow={["admin"]}><EmployeeManagement /></RoleGate>} />
      <Route path="/employees/:id" element={<EmployeeProfile />} />
      <Route path="/holidays" element={<RoleGate allow={["admin"]}><Holidays /></RoleGate>} />
      <Route path="/leave" element={<LeaveManagement />} />
      <Route path="/tasks" element={<Tasks />} />
      <Route path="/tasks/:id" element={<ErrorBoundary fallbackTitle="Couldn't open this board"><TaskBoard /></ErrorBoundary>} />
      <Route path="/salary-increments" element={<RoleGate allow={["admin"]}><SalaryIncrements /></RoleGate>} />
      <Route path="/loans" element={<RoleGate allow={["admin"]}><Loans /></RoleGate>} />
      <Route path="/payment" element={<Payment />} />
      <Route path="/notices" element={<NoticeBoard />} />
      <Route path="/sop" element={<SOP />} />
      <Route path="/team-member-details" element={<TeamMemberDetails />} />
    </Route>

    <Route path="/projects" element={<Navigate to="/tasks" replace />} />
    <Route path="/projects/:id" element={<ProjectRedirect />} />
    <Route path="/payroll" element={<Navigate to="/payment" replace />} />
    <Route path="/expenses" element={<Navigate to="/payment" replace />} />

    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
