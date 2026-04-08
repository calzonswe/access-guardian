import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { AppLayout } from "@/components/layout/AppLayout";
import type { AppRole } from "@/types/rbac";
import LoginPage from "./pages/LoginPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import Dashboard from "./pages/Dashboard";
import ApplicationsPage from "./pages/ApplicationsPage";
import FacilitiesPage from "./pages/FacilitiesPage";
import AreasPage from "./pages/AreasPage";
import RequirementsPage from "./pages/RequirementsPage";
import UsersPage from "./pages/UsersPage";
import OrganizationPage from "./pages/OrganizationPage";
import TeamPage from "./pages/TeamPage";
import MyAccessPage from "./pages/MyAccessPage";
import NotificationsPage from "./pages/NotificationsPage";
import LogsPage from "./pages/LogsPage";
import SettingsPage from "./pages/SettingsPage";
import ProfilePage from "./pages/ProfilePage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, mustChangePassword } = useAuth();
  if (!isAuthenticated) return <LoginPage />;
  if (mustChangePassword) return <ChangePasswordPage />;
  return <>{children}</>;
}

/** Route guard that checks if the current user has at least one of the required roles */
function RoleGuard({ roles, children }: { roles: AppRole[] | 'all'; children: React.ReactNode }) {
  const { currentUser } = useAuth();
  if (!currentUser) return <Navigate to="/" replace />;
  if (roles === 'all') return <>{children}</>;
  const hasAccess = roles.some(r => currentUser.roles.includes(r));
  if (!hasAccess) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthGuard>
              <AppLayout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/applications" element={<ApplicationsPage />} />
                  <Route path="/facilities" element={<RoleGuard roles={['administrator', 'facility_owner', 'facility_admin']}><FacilitiesPage /></RoleGuard>} />
                  <Route path="/areas" element={<RoleGuard roles={['administrator', 'facility_owner', 'facility_admin']}><AreasPage /></RoleGuard>} />
                  <Route path="/requirements" element={<RoleGuard roles={['administrator', 'facility_owner', 'facility_admin', 'line_manager']}><RequirementsPage /></RoleGuard>} />
                  <Route path="/users" element={<RoleGuard roles={['administrator']}><UsersPage /></RoleGuard>} />
                  <Route path="/organization" element={<RoleGuard roles={['administrator']}><OrganizationPage /></RoleGuard>} />
                  <Route path="/team" element={<RoleGuard roles={['line_manager']}><TeamPage /></RoleGuard>} />
                  <Route path="/my-access" element={<RoleGuard roles={['employee', 'contractor']}><MyAccessPage /></RoleGuard>} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/logs" element={<RoleGuard roles={['administrator']}><LogsPage /></RoleGuard>} />
                  <Route path="/settings" element={<RoleGuard roles={['administrator']}><SettingsPage /></RoleGuard>} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AppLayout>
            </AuthGuard>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
