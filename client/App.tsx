import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import FieldOfficerDashboard from "./pages/FieldOfficerDashboard";
import ConsultantAdminDashboard from "./pages/ConsultantAdminDashboard";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import { AuthProvider, RequireRole } from "./lib/auth";
import { InspectionWorkflowProvider } from "./lib/inspection-workflow";

const queryClient = new QueryClient();

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
                path="/field-officer"
                element={
                  <RequireRole role="field">
                    <FieldOfficerDashboard />
                  </RequireRole>
                }
              />
              <Route
                path="/consultant-admin"
                element={
                  <RequireRole role="consultant">
                    <ConsultantAdminDashboard />
                  </RequireRole>
                }
              />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </InspectionWorkflowProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

createRoot(document.getElementById("root")!).render(<App />);
