import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { HelmetProvider } from "react-helmet-async";
import { BrowserRouter } from "react-router-dom";
import { MarketingShell } from "@/components/layout/MarketingShell.js";
import { HomePage } from "@/pages/HomePage.js";

const root = document.getElementById("root")!;
createRoot(root).render(
  <StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <MarketingShell>
          <HomePage />
        </MarketingShell>
      </BrowserRouter>
    </HelmetProvider>
  </StrictMode>
);
