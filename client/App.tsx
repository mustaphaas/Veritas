import "./global.css";
import "./nep-inspired.css";
import "./final-overrides.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import Index from "./pages/Index";
import ExecutiveDashboard from "./pages/ExecutiveDashboard";
import FieldOfficerDashboard from "./pages/FieldOfficerDashboard";
import ConsultantAdminDashboard from "./pages/ConsultantAdminDashboard";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import VeritasAssistant from "./components/VeritasAssistant";
import VeritasFooter from "./components/VeritasFooter";
import ReaProjectMapHost from "./components/ReaProjectMapProgramme";
import ProjectMapFullscreenControl from "./components/ProjectMapFullscreenControl";
import { AuthProvider, RequireRole, useAuth } from "./lib/auth";
import { InspectionWorkflowProvider } from "./lib/inspection-workflow";

const queryClient = new QueryClient();

function VeritasGate() {
  const { session } = useAuth();
  const location = useLocation();
  if (!session || session.role !== "rea" || location.pathname !== "/") {
    return null;
  }
  return <VeritasAssistant />;
}

function VeritasFooterGate() {
  const { session } = useAuth();
  const location = useLocation();
  if (!session || session.role !== "rea" || location.pathname !== "/") {
    return null;
  }
  return <VeritasFooter />;
}

function ProjectMapGate() {
  const { session } = useAuth();
  const location = useLocation();
  if (!session || session.role !== "rea" || location.pathname !== "/") {
    return null;
  }
  return (
    <>
      <ReaProjectMapHost />
      <ProjectMapFullscreenControl />
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <InspectionWorkflowProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <RequireRole role="rea">
                    <Index />
                  </RequireRole>
                }
              />
              <Route
                path="/executive"
                element={
                  <RequireRole role="rea">
                    <ExecutiveDashboard />
                  </RequireRole>
                }
              />
              <Route
                path="/field-officer/*"
                element={
                  <RequireRole role="field">
                    <FieldOfficerDashboard />
                  </RequireRole>
                }
              />
              <Route
                path="/consultant-admin/*"
                element={
                  <RequireRole role="consultant">
                    <ConsultantAdminDashboard />
                  </RequireRole>
                }
              />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            <ProjectMapGate />
            <VeritasFooterGate />
            <VeritasGate />
          </BrowserRouter>
        </InspectionWorkflowProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

createRoot(document.getElementById("root")!).render(<App />);