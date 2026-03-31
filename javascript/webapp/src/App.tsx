import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/hooks/use-auth.js";
import { MarketingLayout } from "@/components/layout/MarketingLayout.js";
import { AppLayout } from "@/components/layout/AppLayout.js";
import { HomePage } from "@/pages/HomePage.js";
import { DocsPage } from "@/pages/DocsPage.js";
import { LoginPage } from "@/pages/LoginPage.js";
import { SignupPage } from "@/pages/SignupPage.js";
import { EventsPage } from "@/pages/EventsPage.js";
import { EventDetailPage } from "@/pages/EventDetailPage.js";
import { RoutesPage } from "@/pages/RoutesPage.js";
import { SettingsPage } from "@/pages/SettingsPage.js";
import { DashboardPage } from "@/pages/DashboardPage.js";
import { AgentsPage } from "@/pages/AgentsPage.js";
import { PrivacyPage } from "@/pages/PrivacyPage.js";
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

function App() {
  return (
    <TooltipProvider>
      <Toaster position="bottom-right" richColors />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Marketing routes */}
            <Route element={<MarketingLayout />}>
              <Route index element={<HomePage />} />
              <Route path="/docs" element={<DocsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
            </Route>

            {/* Auth — redirect to dashboard if already logged in */}
            <Route element={<GuestOnly />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
            </Route>

            {/* Protected dashboard routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/events" element={<EventsPage />} />
                <Route path="/events/:id" element={<EventDetailPage />} />
                <Route path="/agents" element={<AgentsPage />} />
                <Route path="/routes" element={<RoutesPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  );
}

export { App };
