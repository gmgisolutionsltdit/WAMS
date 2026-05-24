import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
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
import SettingsPage from "./pages/SettingsPage";
import EmployeeManagement from "./pages/EmployeeManagement";
import Holidays from "./pages/Holidays";
import LeaveManagement from "./pages/LeaveManagement";
import Projects from "./pages/Projects";
import ProjectBoard from "./pages/ProjectBoard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import Payroll from "./pages/Payroll";
import SalaryIncrements from "./pages/SalaryIncrements";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
};

const PublicOnlyRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const RoleGate = ({ children, allow }: { children: ReactNode; allow: ("admin" | "manager" | "employee" | "hr" | "executive" | "supervisor")[] }) => {
  const { role } = useAuth();
  if (!allow.includes(role)) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
    <Route path="/signup" element={<PublicOnlyRoute><Signup /></PublicOnlyRoute>} />
    <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPassword /></PublicOnlyRoute>} />
    <Route path="/reset-password" element={<ResetPassword />} />

    <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
    <Route path="/attendance" element={<ProtectedRoute><Attendance /></ProtectedRoute>} />
    <Route path="/ot-requests" element={<ProtectedRoute><OTRequests /></ProtectedRoute>} />
    <Route path="/approvals" element={<ProtectedRoute><RoleGate allow={["admin", "manager", "supervisor"]}><Approvals /></RoleGate></ProtectedRoute>} />
    <Route path="/reports" element={<ProtectedRoute><RoleGate allow={["admin", "manager", "supervisor"]}><Reports /></RoleGate></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute><RoleGate allow={["admin"]}><SettingsPage /></RoleGate></ProtectedRoute>} />
    <Route path="/employees" element={<ProtectedRoute><RoleGate allow={["admin"]}><EmployeeManagement /></RoleGate></ProtectedRoute>} />
    <Route path="/holidays" element={<ProtectedRoute><RoleGate allow={["admin"]}><Holidays /></RoleGate></ProtectedRoute>} />
    <Route path="/leave" element={<ProtectedRoute><LeaveManagement /></ProtectedRoute>} />
    <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
    <Route path="/projects/:id" element={<ProtectedRoute><ErrorBoundary fallbackTitle="Couldn't open this project"><ProjectBoard /></ErrorBoundary></ProtectedRoute>} />
    <Route path="/payroll" element={<ProtectedRoute><RoleGate allow={["admin", "hr", "executive"]}><Payroll /></RoleGate></ProtectedRoute>} />
    <Route path="/salary-increments" element={<ProtectedRoute><RoleGate allow={["admin", "hr", "executive"]}><SalaryIncrements /></RoleGate></ProtectedRoute>} />

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
