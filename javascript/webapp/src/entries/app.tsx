import { StrictMode, lazy, Suspense } from "react";
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
import { Webhook } from "lucide-react";
import { MarketingShell } from "@/components/layout/MarketingShell.js";

// Lazy-load dashboard pages — they're only needed after login, no reason to ship them in the initial bundle
const DashboardPage = lazy(() => import("@/pages/DashboardPage.js").then(m => ({ default: m.DashboardPage })));
const EventsPage = lazy(() => import("@/pages/EventsPage.js").then(m => ({ default: m.EventsPage })));
const EventDetailPage = lazy(() => import("@/pages/EventDetailPage.js").then(m => ({ default: m.EventDetailPage })));
const AgentsPage = lazy(() => import("@/pages/AgentsPage.js").then(m => ({ default: m.AgentsPage })));
const RoutesPage = lazy(() => import("@/pages/RoutesPage.js").then(m => ({ default: m.RoutesPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage.js").then(m => ({ default: m.SettingsPage })));

// Lazy-load secondary pages
const PrivacyPage = lazy(() => import("@/pages/PrivacyPage.js").then(m => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import("@/pages/TermsPage.js").then(m => ({ default: m.TermsPage })));
const FaqPage = lazy(() => import("@/pages/FaqPage.js").then(m => ({ default: m.FaqPage })));

function PageFallback() {
  return (
    <div className="flex h-svh items-center justify-center bg-background">
      <Webhook className="size-8 text-foreground animate-pulse" />
    </div>
  );
}

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
            <Suspense fallback={<PageFallback />}>
              <Routes>
                {/* Auth — redirect to dashboard if already logged in */}
                <Route element={<GuestOnly />}>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/signup" element={<SignupPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                </Route>

                {/* Legal pages */}
                <Route element={<SimpleLayout />}>
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/terms" element={<TermsPage />} />
                </Route>

                {/* FAQ with marketing shell (nav + footer) */}
                <Route path="/faq" element={<MarketingShell><FaqPage /></MarketingShell>} />

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
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </HelmetProvider>
  </StrictMode>
);
