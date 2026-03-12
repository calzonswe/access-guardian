import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import ApplicationsPage from "./pages/ApplicationsPage";
import FacilitiesPage from "./pages/FacilitiesPage";
import UsersPage from "./pages/UsersPage";
import LogsPage from "./pages/LogsPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppLayout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/applications" element={<ApplicationsPage />} />
                <Route path="/facilities" element={<FacilitiesPage />} />
                <Route path="/areas" element={<PlaceholderPage title="Områden" description="Hantera områden inom anläggningar" />} />
                <Route path="/requirements" element={<PlaceholderPage title="Krav" description="Hantera certifieringar, utbildningar och säkerhetsprövningar" />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/team" element={<PlaceholderPage title="Mitt team" description="Översikt av ditt teams tillträdesrättigheter" />} />
                <Route path="/my-access" element={<PlaceholderPage title="Min åtkomst" description="Visa dina aktiva tillträden och kravuppfyllnad" />} />
                <Route path="/notifications" element={<PlaceholderPage title="Aviseringar" description="Dina aviseringar och påminnelser" />} />
                <Route path="/logs" element={<LogsPage />} />
                <Route path="/settings" element={<PlaceholderPage title="Inställningar" description="Systemkonfiguration, branding och formuläranpassning" />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppLayout>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
