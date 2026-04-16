import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { HelmetProvider } from "react-helmet-async";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MarketingShell } from "@/components/layout/MarketingShell.js";
import { BlogPage } from "@/pages/BlogPage.js";
import { BlogPostWebhooksThatNeverChange } from "@/pages/BlogPostWebhooksThatNeverChange.js";
import { BlogPostWebhookDx } from "@/pages/BlogPostWebhookDx.js";
import { BlogPostAgentWebhooks } from "@/pages/BlogPostAgentWebhooks.js";

const root = document.getElementById("root")!;
createRoot(root).render(
  <StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <MarketingShell>
          <Routes>
            <Route path="/blog" element={<BlogPage />} />
            <Route path="/blog/webhooks-that-never-change" element={<BlogPostWebhooksThatNeverChange />} />
            <Route path="/blog/webhook-dx-is-broken" element={<BlogPostWebhookDx />} />
            <Route path="/blog/agent-webhooks" element={<BlogPostAgentWebhooks />} />
          </Routes>
        </MarketingShell>
      </BrowserRouter>
    </HelmetProvider>
  </StrictMode>
);
