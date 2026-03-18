import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { AppLayout } from "@/components/layout/AppLayout";
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
                  <Route path="/facilities" element={<FacilitiesPage />} />
                  <Route path="/areas" element={<AreasPage />} />
                  <Route path="/requirements" element={<RequirementsPage />} />
                  <Route path="/users" element={<UsersPage />} />
                  <Route path="/organization" element={<OrganizationPage />} />
                  <Route path="/team" element={<TeamPage />} />
                  <Route path="/my-access" element={<MyAccessPage />} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/logs" element={<LogsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
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
