import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { TooltipProvider } from "@/components/ui/tooltip.js";
import { Toaster } from "@/components/ui/sonner.js";
import { AuthProvider, useAuth } from "@/hooks/use-auth.js";
import { AppLayout } from "@/components/layout/AppLayout.js";
import { LoginPage } from "@/pages/LoginPage.js";
import { SignupPage } from "@/pages/SignupPage.js";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage.js";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage.js";
import { EventsPage } from "@/pages/EventsPage.js";
import { EventDetailPage } from "@/pages/EventDetailPage.js";
import { RoutesPage } from "@/pages/RoutesPage.js";
import { SettingsPage } from "@/pages/SettingsPage.js";
import { DashboardPage } from "@/pages/DashboardPage.js";
import { AgentsPage } from "@/pages/AgentsPage.js";
import { PrivacyPage } from "@/pages/PrivacyPage.js";
import { TermsPage } from "@/pages/TermsPage.js";
import { FaqPage } from "@/pages/FaqPage.js";
import { Webhook } from "lucide-react";

function ProtectedRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-svh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Webhook className="size-8 text-foreground animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

function GuestOnly() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

function SimpleLayout() {
  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto max-w-[960px] px-6 py-12">
        <Outlet />
      </div>
    </div>
  );
}

const root = document.getElementById("root")!;
createRoot(root).render(
  <StrictMode>
    <HelmetProvider>
      <TooltipProvider>
        <Toaster position="bottom-right" richColors />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              {/* Auth — redirect to dashboard if already logged in */}
              <Route element={<GuestOnly />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
              </Route>

              {/* Legal + FAQ pages */}
              <Route element={<SimpleLayout />}>
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/faq" element={<FaqPage />} />
              </Route>

              {/* Protected dashboard routes */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/events" element={<EventsPage />} />
                  <Route path="/events/:id" element={<EventDetailPage />} />
                  <Route path="/listeners" element={<AgentsPage />} />
                  <Route path="/routes" element={<RoutesPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </HelmetProvider>
  </StrictMode>
);
