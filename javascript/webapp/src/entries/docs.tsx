import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { HelmetProvider } from "react-helmet-async";
import { BrowserRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip.js";
import { Toaster } from "@/components/ui/sonner.js";
import { AuthProvider } from "@/hooks/use-auth.js";
import { MarketingShell } from "@/components/layout/MarketingShell.js";
import { DocsPage } from "@/pages/DocsPage.js";

const root = document.getElementById("root")!;
createRoot(root).render(
  <StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <TooltipProvider>
          <Toaster position="bottom-right" richColors />
          <AuthProvider>
            <MarketingShell>
              <DocsPage />
            </MarketingShell>
          </AuthProvider>
        </TooltipProvider>
      </BrowserRouter>
    </HelmetProvider>
  </StrictMode>
);
