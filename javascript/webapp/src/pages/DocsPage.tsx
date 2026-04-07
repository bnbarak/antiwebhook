import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Copy, Check, KeyRound } from "lucide-react";
import { FlowNode, FlowArrow, FlowRow } from "@/components/shared/FlowDiagram.js";
import { useAuth } from "@/hooks/use-auth.js";
import { api, type Project } from "@/lib/api.js";
import { toast } from "sonner";

// ── Data model ────────────────────────────────────────────────────────

interface Framework {
  id: string;
  name: string;
  available: boolean;
  installCmd: string;
  filename: string;
  snippet: (key: string) => string;
}

interface Language {
  id: string;
  name: string;
  icon: string;
  frameworks: Framework[];
}

const LOGO_URLS: Record<string, string> = {
  node: "/logos/nodejs.svg",
  python: "/logos/python.svg",
};

const PLACEHOLDER_KEY = "ak_your_api_key";

const LANGUAGES: Language[] = [
  {
    id: "node",
    name: "Node.js",
    icon: "node",
    frameworks: [
      {
        id: "express",
        name: "Express",
        available: true,
        installCmd: "npm install simplehook",
        filename: "app.ts",
        snippet: (key) => `import express from "express";
import { listenToWebhooks } from "simplehook";

const app = express();
app.use(express.json());

listenToWebhooks(app, "${key}");

app.post("/stripe/events", (req, res) => {
  console.log("Webhook received:", req.body);
  res.json({ received: true });
});

app.listen(3000);`,
      },
      {
        id: "fastify",
        name: "Fastify",
        available: true,
        installCmd: "npm install simplehook-fastify",
        filename: "app.ts",
        snippet: (key) => `import Fastify from "fastify";
import { listenToWebhooks } from "simplehook-fastify";

const app = Fastify();
listenToWebhooks(app, "${key}");

app.post("/stripe/events", async (req) => {
  console.log("Webhook received:", req.body);
  return { received: true };
});

app.listen({ port: 3000 });`,
      },
      {
        id: "hono",
        name: "Hono",
        available: true,
        installCmd: "npm install simplehook-hono",
        filename: "app.ts",
        snippet: (key) => `import { Hono } from "hono";
import { listenToWebhooks } from "simplehook-hono";

const app = new Hono();
listenToWebhooks(app, "${key}");

app.post("/stripe/events", (c) => {
  console.log("Webhook received:", c.req.json());
  return c.json({ received: true });
});

export default app;`,
      },
    ],
  },
  {
    id: "python",
    name: "Python",
    icon: "python",
    frameworks: [
      {
        id: "flask",
        name: "Flask",
        available: true,
        installCmd: "pip install simplehook-flask",
        filename: "app.py",
        snippet: (key) => `from flask import Flask, request
from simplehook_flask import listenToWebhooks

app = Flask(__name__)
listenToWebhooks(app, "${key}")

@app.post("/stripe/events")
def stripe_events():
    print("Webhook received:", request.json)
    return {"received": True}`,
      },
      {
        id: "django",
        name: "Django",
        available: true,
        installCmd: "pip install simplehook-django",
        filename: "wsgi.py",
        snippet: (key) => `from django.core.wsgi import get_wsgi_application
from simplehook_django import listenToWebhooks

application = get_wsgi_application()
listenToWebhooks(application, "${key}")`,
      },
      {
        id: "fastapi",
        name: "FastAPI",
        available: true,
        installCmd: "pip install simplehook-fastapi",
        filename: "app.py",
        snippet: (key) => `from fastapi import FastAPI, Request
from simplehook_fastapi import listenToWebhooks

app = FastAPI()
listenToWebhooks(app, "${key}")

@app.post("/stripe/events")
async def stripe_webhook(request: Request):
    body = await request.json()
    print("Webhook received:", body)
    return {"received": True}`,
      },
    ],
  },
];

// ── Sidebar sections ─────────────────────────────────────────────────

type DocsGroup = "shared" | "developers" | "agents";

const SECTIONS = [
  // Shared
  { id: "quick-start", label: "Quick Start", group: "developers" as DocsGroup },
  { id: "privacy", label: "Privacy & Security", group: "shared" as DocsGroup },
  { id: "api-reference", label: "API Reference", group: "shared" as DocsGroup },
  // Developers
  { id: "configuration", label: "Configuration", group: "developers" as DocsGroup },
  { id: "agents", label: "Listeners", group: "developers" as DocsGroup },
  { id: "route-configuration", label: "Route Configuration", group: "developers" as DocsGroup },
  { id: "websocket-protocol", label: "WebSocket Protocol", group: "developers" as DocsGroup },
  // AI Agents
  { id: "ai-agent-api", label: "Pull API", group: "agents" as DocsGroup },
  { id: "sdk-reference", label: "SDK Reference", group: "agents" as DocsGroup },
  { id: "cli", label: "CLI", group: "agents" as DocsGroup },
  { id: "mastra", label: "Mastra", group: "agents" as DocsGroup },
] as const;

const GROUP_LABELS: Record<DocsGroup, string> = {
  shared: "Shared",
  developers: "Developers",
  agents: "AI Agents (API/Skills)",
};

// ── Helpers ───────────────────────────────────────────────────────────

function allFrameworks(): Framework[] {
  return LANGUAGES.flatMap((l) => l.frameworks);
}

// ── Presentational components ─────────────────────────────────────────

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-text-tertiary">
      <span className="inline-block h-px w-5 bg-border-strong" />
      {children}
    </div>
  );
}

function SectionDivider() {
  return <div className="border-t border-border" />;
}

function CopyableCode({ code, title }: { code: string; title?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="overflow-hidden rounded-xl shadow-lg">
      <div className="flex items-center border-b border-white/[0.06] bg-[#2d2640] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
          <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
          <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
        </div>
        <span className="mx-auto font-mono text-[12px] text-[#9a91b0]">
          {title ?? "Terminal"}
        </span>
        <button
          onClick={copy}
          className="text-[#9a91b0] hover:text-white/80 transition-colors"
          title="Copy code"
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </div>
      <pre className="overflow-x-auto bg-[#1e1834] px-6 py-5 font-mono text-[13px] leading-[1.9] text-[#e0dce8]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
      {children}
    </code>
  );
}

// ── Base URL card ────────────────────────────────────────────────────

function BaseUrlCard({ projectId }: { projectId?: string }) {
  const [copiedBase, setCopiedBase] = useState(false);
  const [copiedHook, setCopiedHook] = useState(false);

  const baseUrl = "https://hook.simplehook.dev";
  const hookUrl = projectId
    ? `https://hook.simplehook.dev/hooks/${projectId}`
    : null;

  const copyBase = () => {
    navigator.clipboard.writeText(baseUrl);
    setCopiedBase(true);
    setTimeout(() => setCopiedBase(false), 2000);
  };

  const copyHook = () => {
    if (!hookUrl) return;
    navigator.clipboard.writeText(hookUrl);
    setCopiedHook(true);
    setTimeout(() => setCopiedHook(false), 2000);
  };

  return (
    <div className="mb-8 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <span className="block font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            Base URL
          </span>
          <span className="block truncate font-mono text-sm text-foreground">
            {baseUrl}
          </span>
        </div>
        <button
          onClick={copyBase}
          className="shrink-0 rounded-md border border-border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Copy base URL"
        >
          {copiedBase ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </div>
      {hookUrl && (
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
          <div className="min-w-0">
            <span className="block font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
              Your Webhook URL
            </span>
            <span className="block truncate font-mono text-sm text-foreground">
              {hookUrl}
            </span>
          </div>
          <button
            onClick={copyHook}
            className="shrink-0 rounded-md border border-border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Copy webhook URL"
          >
            {copiedHook ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        </div>
      )}
      <div className="border-t border-border bg-muted/30 px-4 py-2">
        <p className="text-[11px] text-muted-foreground">
          All endpoint paths below are relative to this base URL.
        </p>
      </div>
    </div>
  );
}

// ── Sidebar navigation ───────────────────────────────────────────────

function DocsSidebar({
  activeId,
  docsView,
  onDocsViewChange,
}: {
  activeId: string;
  docsView: DocsGroup;
  onDocsViewChange: (v: DocsGroup) => void;
}) {
  // Show: shared sections always, plus the active view's sections
  const visibleSections = SECTIONS.filter(
    (s) => s.group === "shared" || s.group === docsView,
  );

  return (
    <nav className="hidden lg:block w-[200px] shrink-0">
      <div className="sticky top-[80px] pt-16">
        {/* View toggle */}
        <div className="mb-4 flex flex-col gap-0.5 rounded-lg border border-border bg-muted/50 p-1">
          {(["developers", "agents"] as const).map((v) => (
            <button
              key={v}
              onClick={() => onDocsViewChange(v)}
              className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                docsView === v
                  ? "bg-card border border-border-strong shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {GROUP_LABELS[v]}
            </button>
          ))}
        </div>

        <ul className="flex flex-col gap-0.5">
          {visibleSections.map(({ id, label, group }, i) => {
            const isActive = activeId === id;
            // Show group header when group changes
            const prevGroup = i > 0 ? visibleSections[i - 1].group : null;
            const showGroupHeader = group !== prevGroup;

            return (
              <li key={id}>
                {showGroupHeader && (
                  <span className="mt-3 mb-1 block px-2.5 font-mono text-[9px] font-medium uppercase tracking-widest text-muted-foreground/50">
                    {GROUP_LABELS[group]}
                  </span>
                )}
                <a
                  href={`#${id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className={`relative block rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-primary" />
                  )}
                  {label}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

// ── Language / framework tab bar ──────────────────────────────────────

function LanguagePicker({
  activeLang,
  onLangChange,
}: {
  activeLang: string;
  onLangChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {LANGUAGES.map((l) => (
        <button
          key={l.id}
          onClick={() => onLangChange(l.id)}
          className={`rounded-lg border px-4 py-2.5 transition-colors ${
            l.id === activeLang
              ? "border-foreground/30 bg-card ring-1 ring-foreground/10"
              : "border-border hover:border-border-strong"
          }`}
        >
          <img
            src={LOGO_URLS[l.id]}
            alt={l.name}
            className="h-7 w-auto"
            title={l.name}
          />
        </button>
      ))}
    </div>
  );
}

function FrameworkPicker({
  language,
  activeFw,
  onFwChange,
}: {
  language: Language;
  activeFw: string;
  onFwChange: (id: string) => void;
}) {
  if (language.frameworks.length <= 1) return null;
  return (
    <div className="flex gap-1.5 flex-wrap">
      {language.frameworks.map((f) => (
        <button
          key={f.id}
          onClick={() => f.available && onFwChange(f.id)}
          disabled={!f.available}
          className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
            f.id === activeFw && f.available
              ? "border-foreground/30 bg-card ring-1 ring-foreground/10"
              : f.available
                ? "border-border hover:border-border-strong"
                : "border-border opacity-40 cursor-not-allowed"
          }`}
        >
          {f.name}
          {!f.available && (
            <span className="ml-1 text-[9px] text-muted-foreground">soon</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────

export function DocsPage() {
  const { session } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [injectedKey, setInjectedKey] = useState<string | null>(null);

  const [activeLang, setActiveLang] = useState(LANGUAGES[0].id);
  const [activeFw, setActiveFw] = useState(LANGUAGES[0].frameworks[0].id);

  const [searchParams, setSearchParams] = useSearchParams();
  const modeParam = searchParams.get("mode");
  const initialView: DocsGroup = modeParam === "agents" ? "agents" : "developers";

  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id);
  const [docsView, setDocsView] = useState<DocsGroup>(initialView);

  const handleDocsViewChange = useCallback((v: DocsGroup) => {
    setDocsView(v);
    setSearchParams(v === "developers" ? {} : { mode: v }, { replace: true });
  }, [setSearchParams]);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  const lang = LANGUAGES.find((l) => l.id === activeLang) ?? LANGUAGES[0];

  const handleLangChange = useCallback((id: string) => {
    setActiveLang(id);
    const newLang = LANGUAGES.find((l) => l.id === id) ?? LANGUAGES[0];
    const first =
      newLang.frameworks.find((f) => f.available) ?? newLang.frameworks[0];
    setActiveFw(first.id);
  }, []);

  // Fetch project data if logged in
  useEffect(() => {
    if (session) {
      api.project
        .get()
        .then(setProject)
        .catch(() => {});
    }
  }, [session]);

  // IntersectionObserver for active section tracking
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    const visibleSections = new Map<string, number>();

    for (const { id } of SECTIONS) {
      const el = sectionRefs.current.get(id);
      if (!el) continue;

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              visibleSections.set(id, entry.intersectionRatio);
            } else {
              visibleSections.delete(id);
            }
          }
          // Pick the first visible section in document order
          for (const { id: sectionId } of SECTIONS) {
            if (visibleSections.has(sectionId)) {
              setActiveSection(sectionId);
              break;
            }
          }
        },
        { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
      );
      observer.observe(el);
      observers.push(observer);
    }

    return () => {
      for (const obs of observers) obs.disconnect();
    };
  }, []);

  const setSectionRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      sectionRefs.current.set(id, el);
    } else {
      sectionRefs.current.delete(id);
    }
  }, []);

  const displayKey = injectedKey ?? PLACEHOLDER_KEY;

  const handleInjectKey = () => {
    if (!project?.api_key) return;
    setInjectedKey(project.api_key);
    toast.success("API key injected into all code examples");
  };

  const handleResetKey = () => {
    setInjectedKey(null);
  };

  return (
    <div>
      <Helmet>
        <title>Documentation — simplehook</title>
        <meta name="description" content="Learn how to receive webhooks locally with one line of code. SDK guides for Express, Fastify, Hono, Flask, FastAPI. AI agent HTTP pull API reference." />
        <link rel="canonical" href="https://simplehook.dev/docs" />
        <meta property="og:title" content="Documentation — simplehook" />
        <meta property="og:description" content="SDK guides for Express, Fastify, Flask, FastAPI. AI agent HTTP pull API reference. Receive webhooks locally with one line of code." />
        <meta property="og:url" content="https://simplehook.dev/docs" />
      </Helmet>
      {/* Hero */}
      <section className="px-6 pb-16 pt-20">
        <div className="mx-auto max-w-[960px]">
          <Kicker>Documentation</Kicker>
          <h1 className="mb-4 text-[clamp(28px,4vw,38px)] font-normal leading-[1.15] tracking-[-0.015em]">
            simplehook docs
          </h1>
          <p className="max-w-[560px] text-[17px] font-light leading-relaxed text-muted-foreground">
            Everything you need to receive webhooks locally with one line of
            code. SDKs for Node.js and Python.
          </p>

          {/* API key injection button */}
          {session && project?.api_key && (
            <div className="mt-6 flex items-center gap-3">
              {injectedKey ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-green-600/30 bg-green-600/10 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-400">
                    <Check className="size-3.5" />
                    API key active in examples
                  </span>
                  <button
                    onClick={handleResetKey}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    Reset to placeholder
                  </button>
                </>
              ) : (
                <button
                  onClick={handleInjectKey}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:border-border-strong hover:bg-muted/50"
                >
                  <KeyRound className="size-4" />
                  Use my API key
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      <SectionDivider />

      {/* Sidebar + content layout */}
      <div className="mx-auto flex max-w-[1200px] gap-10 px-6">
        <DocsSidebar activeId={activeSection} docsView={docsView} onDocsViewChange={handleDocsViewChange} />

        <div className="min-w-0 flex-1 max-w-[960px]">
          {/* ── Quick Start (developers only) ─────────────────────────── */}
          <div className={docsView === "developers" ? "" : "invisible h-0 overflow-hidden"}>
          <section
            id="quick-start"
            ref={(el) => setSectionRef("quick-start", el)}
            className="py-16"
          >
            <Kicker>Quick start</Kicker>
            <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
              Up and running in 60 seconds
            </h2>
            <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
              Pick your language, install the SDK, add one line, and start
              receiving webhooks.
            </p>

            {/* How it works diagram */}
            <div className="mb-10 rounded-xl border border-border bg-card/50 p-6">
              <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">How it works</h3>
              <div className="font-mono text-[11px]">
                <FlowRow>
                  <FlowNode>Stripe / GitHub</FlowNode>
                  <FlowArrow label="POST" />
                  <FlowNode highlight>simplehook</FlowNode>
                  <FlowArrow label="WS" />
                  <FlowNode>Your app</FlowNode>
                </FlowRow>
                <FlowRow className="mt-1">
                  <span className="shrink-0 px-2.5 text-[9px] text-muted-foreground/60" style={{ width: "calc(var(--node-w, 100px))" }}>webhook provider</span>
                  <span className="flex-1" />
                  <span className="shrink-0 px-2.5 text-center text-[9px] text-muted-foreground/60">cloud relay</span>
                  <span className="flex-1" />
                  <span className="shrink-0 px-2.5 text-right text-[9px] text-muted-foreground/60">localhost</span>
                </FlowRow>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              {/* Step 1: Language */}
              <div>
                <h3 className="mb-3 text-sm font-medium">
                  1. Choose your language
                </h3>
                <LanguagePicker
                  activeLang={activeLang}
                  onLangChange={handleLangChange}
                />
              </div>

              {/* Step 2: Install - all rendered for SEO, only active visible */}
              <div>
                <h3 className="mb-3 text-sm font-medium">2. Install</h3>
                {allFrameworks().map((fw) => (
                  <div
                    key={`install-${fw.id}`}
                    className={activeFw === fw.id ? "" : "hidden"}
                  >
                    <CopyableCode code={fw.installCmd} title="Terminal" />
                  </div>
                ))}
              </div>

              {/* Step 3: Framework + snippet - all rendered for SEO */}
              <div>
                <h3 className="mb-3 text-sm font-medium">3. Add to your app</h3>
                <FrameworkPicker
                  language={lang}
                  activeFw={activeFw}
                  onFwChange={setActiveFw}
                />
                <div className="mt-2">
                  {allFrameworks().map((fw) => (
                    <div
                      key={`snippet-${fw.id}`}
                      className={activeFw === fw.id ? "" : "hidden"}
                    >
                      <CopyableCode
                        code={fw.snippet(displayKey)}
                        title={fw.filename}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Step 4: Webhook URL */}
              <div>
                <h3 className="mb-3 text-sm font-medium">
                  4. Set your webhook URL
                </h3>
                <p className="mb-3 text-[13px] text-muted-foreground">
                  In your webhook provider's dashboard (Stripe, GitHub, etc.), set
                  the webhook URL to:
                </p>
                <CopyableCode
                  code={`https://hook.simplehook.dev/${project?.id ?? "<your-project-id>"}/stripe/events`}
                  title="Webhook URL"
                />
                {!project && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Replace{" "}
                    <InlineCode>&lt;your-project-id&gt;</InlineCode> with your
                    project ID from the dashboard.
                  </p>
                )}
              </div>

              {/* Step 5: Run */}
              <div>
                <h3 className="mb-3 text-sm font-medium">5. Run your app</h3>
                {/* Node output */}
                <div className={activeLang === "node" ? "" : "hidden"}>
                  <CopyableCode
                    code={`$ npm run dev

[simplehook] connected to wss://ws.simplehook.dev
[simplehook] listening on port 3000
[simplehook] POST /stripe/events -> forwarded -> 200 OK`}
                    title="Terminal"
                  />
                </div>
                {/* Python output */}
                <div className={activeLang === "python" ? "" : "hidden"}>
                  <CopyableCode
                    code={`$ flask run --port 3000

[simplehook] connected to wss://ws.simplehook.dev
[simplehook] listening on port 3000
[simplehook] POST /stripe/events -> forwarded -> 200 OK`}
                    title="Terminal"
                  />
                </div>
              </div>
            </div>
          </section>
          </div>{/* END Quick Start developers wrapper */}

          <SectionDivider />

          {/* ── DEVELOPERS GROUP (visibility toggle) ── */}
          <div className={docsView === "developers" ? "" : "invisible h-0 overflow-hidden"}>

          {/* ── Configuration ───────────────────────────────────────────── */}
          <section
            id="configuration"
            ref={(el) => setSectionRef("configuration", el)}
            className="py-16"
          >
            <Kicker>Configuration</Kicker>
            <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
              listenToWebhooks options
            </h2>
            <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
              The <InlineCode>listenToWebhooks</InlineCode> function accepts your
              framework app instance and an API key. An optional third argument
              configures advanced behavior.
            </p>

            <div className="flex flex-col gap-6">
              {/* Signature - Node */}
              <div className={activeLang === "node" ? "" : "hidden"}>
                <h3 className="mb-3 text-sm font-medium">
                  <InlineCode>
                    listenToWebhooks(app, apiKey, options?)
                  </InlineCode>
                </h3>
                <CopyableCode
                  code={`import { listenToWebhooks } from "simplehook";

listenToWebhooks(app, "${displayKey}", {
  // Host to forward webhooks to (default: "localhost")
  host: "localhost",

  // Called when connected to simplehook
  onConnect: () => console.log("connected"),

  // Called when disconnected
  onDisconnect: () => console.log("disconnected"),

  // Called for each received event
  onEvent: (event) => console.log(event.method, event.path),
});`}
                  title="app.ts"
                />
              </div>

              {/* Signature - Python */}
              <div className={activeLang === "python" ? "" : "hidden"}>
                <h3 className="mb-3 text-sm font-medium">
                  <InlineCode>
                    listenToWebhooks(app, api_key, **options)
                  </InlineCode>
                </h3>
                <CopyableCode
                  code={`from simplehook_flask import listenToWebhooks

listenToWebhooks(app, "${displayKey}",
    host="localhost",
    on_connect=lambda: print("connected"),
    on_disconnect=lambda: print("disconnected"),
    on_event=lambda event: print(event["method"], event["path"]),
)`}
                  title="app.py"
                />
              </div>

              {/* Options table */}
              <div>
                <h3 className="mb-3 text-sm font-medium">Options</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                          Option
                        </th>
                        <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                          Type
                        </th>
                        <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                          Default
                        </th>
                        <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                          Description
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        [
                          "host",
                          "string",
                          '"localhost"',
                          "Host to forward webhooks to",
                        ],
                        [
                          "onConnect",
                          "() => void",
                          "undefined",
                          "Called when WebSocket connects",
                        ],
                        [
                          "onDisconnect",
                          "() => void",
                          "undefined",
                          "Called when WebSocket disconnects",
                        ],
                        [
                          "onEvent",
                          "(event) => void",
                          "undefined",
                          "Called for each received event",
                        ],
                      ].map(([opt, type, def, desc]) => (
                        <tr key={opt} className="border-b last:border-0">
                          <td className="px-3 py-2 font-mono text-xs">{opt}</td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            {type}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            {def}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {desc}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Environment variable */}
              <div>
                <h3 className="mb-3 text-sm font-medium">
                  Environment variable
                </h3>
                <p className="mb-3 text-[13px] text-muted-foreground">
                  Instead of passing the key inline, you can set the{" "}
                  <InlineCode>SIMPLEHOOK_API_KEY</InlineCode> environment variable
                  and pass only the app instance:
                </p>
                {/* Node env */}
                <div className={activeLang === "node" ? "" : "hidden"}>
                  <CopyableCode
                    code={`# .env
SIMPLEHOOK_API_KEY=${displayKey}

# then in code:
listenToWebhooks(app);`}
                    title=".env"
                  />
                </div>
                {/* Python env */}
                <div className={activeLang === "python" ? "" : "hidden"}>
                  <CopyableCode
                    code={`# .env
SIMPLEHOOK_API_KEY=${displayKey}

# then in code:
listenToWebhooks(app)`}
                    title=".env"
                  />
                </div>
              </div>
            </div>
          </section>

          <SectionDivider />

          {/* ── Listeners ──────────────────────────────────────────────────── */}
          <section
            id="agents"
            ref={(el) => setSectionRef("agents", el)}
            className="py-16"
          >
            <Kicker>Listeners</Kicker>
            <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
              Route events to specific SDK instances
            </h2>
            <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
              By default, all webhooks go to every connected SDK. Use listeners to run multiple
              SDK instances and control which one receives which events.
            </p>

            <div className="mb-8">
              <h3 className="mb-3 text-sm font-medium">How it works</h3>
              <ol className="flex flex-col gap-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="font-mono text-xs text-foreground/60">1.</span>
                  Create a listener in the dashboard (e.g. <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">staging</code>)
                </li>
                <li className="flex gap-2">
                  <span className="font-mono text-xs text-foreground/60">2.</span>
                  Assign the listener to a route (e.g. <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">/stripe</code> → <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">staging</code>)
                </li>
                <li className="flex gap-2">
                  <span className="font-mono text-xs text-foreground/60">3.</span>
                  Pass the listener ID in your SDK call
                </li>
              </ol>
            </div>

            <div className="flex flex-col gap-6">
              <CopyableCode
                code={`// Express\nlistenToWebhooks(app, "${project?.api_key ?? PLACEHOLDER_KEY}", "staging");`}
                title="app.ts"
              />
              <CopyableCode
                code={`# Flask\nlistenToWebhooks(app, os.environ["SIMPLEHOOK_KEY"], "staging")`}
                title="app.py"
              />
            </div>

            <div className="mt-8 rounded-lg border border-border bg-card/50 p-4">
              <p className="text-sm text-muted-foreground">
                Your webhook URL stays the same — <strong>event routing is configured in the
                dashboard</strong>, not the URL. Routes without a listener deliver to any connected SDK.
              </p>
            </div>
          </section>

          </div>{/* END DEVELOPERS GROUP (before AI agent) */}

          <SectionDivider />

          {/* ── AGENTS GROUP (visibility toggle) ── */}
          <div className={docsView === "agents" ? "" : "invisible h-0 overflow-hidden"}>

          {/* ── AI Agent API ─────────────────────────────────────── */}
          <section
            id="ai-agent-api"
            ref={(el) => setSectionRef("ai-agent-api", el)}
            className="py-16"
          >
            <Kicker>AI Agent API</Kicker>
            <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
              Pull webhooks via HTTP
            </h2>
            <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
              AI agents and scripts can consume webhooks without holding a WebSocket open.
              Pull events on demand, long-poll for the next one, or stream via SSE.
            </p>

            <div className="mb-8">
              <h3 className="mb-3 text-sm font-medium">Authentication</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                All requests require your API key as a Bearer token:
              </p>
              <CopyableCode
                code={`curl -H "Authorization: Bearer ${project?.api_key ?? PLACEHOLDER_KEY}" \\
  ${project ? window.location.origin.replace('simplehook.dev', 'hook.simplehook.dev') : 'https://hook.simplehook.dev'}/api/agent/pull`}
                title="auth"
              />
            </div>

            <div className="mb-8">
              <h3 className="mb-3 text-sm font-medium">Pull events</h3>
              <p className="mb-3 text-sm text-muted-foreground">
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">GET /api/agent/pull</code> — returns the next events you haven't seen. The server tracks your cursor automatically.
              </p>
              <div className="mb-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 pr-4 text-left font-medium">Param</th>
                      <th className="py-2 pr-4 text-left font-medium">Default</th>
                      <th className="py-2 text-left font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-[11px]">n</td>
                      <td className="py-2 pr-4">1</td>
                      <td className="py-2">Number of events to return (1-100)</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-[11px]">path</td>
                      <td className="py-2 pr-4">—</td>
                      <td className="py-2">Filter by path glob (e.g. <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">/stripe/*</code>)</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-[11px]">listener_id</td>
                      <td className="py-2 pr-4">default</td>
                      <td className="py-2">Consumer identity — each has its own cursor</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-[11px]">wait</td>
                      <td className="py-2 pr-4">false</td>
                      <td className="py-2">Long-poll: hold until an event arrives</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-[11px]">stream</td>
                      <td className="py-2 pr-4">false</td>
                      <td className="py-2">SSE: keep connection open, push events</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-[11px]">timeout</td>
                      <td className="py-2 pr-4">30</td>
                      <td className="py-2">Seconds to wait (for wait/stream modes)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="mb-3 text-sm font-medium">Three modes</h3>
              <div className="flex flex-col gap-4">
                <CopyableCode
                  code={`# Instant — get what's there now
curl -H "Authorization: Bearer $SIMPLEHOOK_KEY" \\
  "https://hook.simplehook.dev/api/agent/pull?n=5"

# Long-poll — block until a Stripe event arrives
curl -H "Authorization: Bearer $SIMPLEHOOK_KEY" \\
  "https://hook.simplehook.dev/api/agent/pull?wait=true&path=/stripe/*&timeout=60"

# SSE stream — print events as they arrive
curl -N -H "Authorization: Bearer $SIMPLEHOOK_KEY" \\
  "https://hook.simplehook.dev/api/agent/pull?stream=true&timeout=300"`}
                  title="curl"
                />
                <CopyableCode
                  code={`import requests

# Pull next 5 events
resp = requests.get(
    "https://hook.simplehook.dev/api/agent/pull",
    headers={"Authorization": f"Bearer {SIMPLEHOOK_KEY}"},
    params={"n": 5, "path": "/stripe/*"}
)
events = resp.json()["events"]
for event in events:
    print(f"{event['method']} {event['path']}: {event['body']}")`}
                  title="python"
                />
                <CopyableCode
                  code={`// Node.js — wait for next Stripe event
const res = await fetch(
  "https://hook.simplehook.dev/api/agent/pull?wait=true&path=/stripe/*",
  { headers: { Authorization: \`Bearer \${process.env.SIMPLEHOOK_KEY}\` } }
);
const { events, remaining } = await res.json();
console.log(events[0]?.body);`}
                  title="node.js"
                />
              </div>
            </div>

            <div className="mb-8">
              <h3 className="mb-3 text-sm font-medium">Queue status</h3>
              <p className="mb-3 text-sm text-muted-foreground">
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">GET /api/agent/status</code> — queue health, connected listeners, cursor positions, and per-route breakdown.
              </p>
              <CopyableCode
                code={`curl -H "Authorization: Bearer $SIMPLEHOOK_KEY" \\
  "https://hook.simplehook.dev/api/agent/status"

# Response:
# {
#   "queue": { "pending": 12, "failed": 3, "delivered_last_hour": 847 },
#   "listeners": { "connected": ["default"], "disconnected": ["ci-agent"] },
#   "cursors": { "default": { "last_event": "evt_043", "behind": 7 } },
#   "routes": [{ "path": "/stripe/", "mode": "queue", "pending": 8 }]
# }`}
                title="status"
              />
            </div>

            <div className="rounded-lg border border-border bg-card/50 p-4">
              <p className="text-sm text-muted-foreground">
                <strong>One consumer per listener_id.</strong> Only one process can long-poll or stream
                a given listener_id at a time (instant pulls are always allowed). A second concurrent
                consumer gets a <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">409 Conflict</code>.
              </p>
            </div>

            <div className="mt-8 rounded-lg border border-border bg-card p-5">
              <h3 className="mb-2 text-sm font-medium">Claude Code Skill</h3>
              <p className="mb-3 text-[13px] text-muted-foreground">
                Install our skill to teach Claude Code the full simplehook API — pull modes,
                params, response formats, and examples. Your AI agent gets the context it needs
                without reading docs.
              </p>
              <CopyableCode
                code="claude skills add bnbarak/simplewehbook-skills"
                title="install"
              />
              <p className="mt-3 text-xs text-muted-foreground">
                Source:{" "}
                <a
                  href="https://github.com/bnbarak/simplewehbook-skills"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground transition-colors"
                >
                  github.com/bnbarak/simplewehbook-skills
                </a>
              </p>
            </div>
          </section>

          <SectionDivider />

          {/* ── SDK Reference ─────────────────────────────────────── */}
          <section
            id="sdk-reference"
            ref={(el) => setSectionRef("sdk-reference", el)}
            className="py-16"
          >
            <Kicker>SDK Reference</Kicker>
            <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
              SimplehookAgent — JavaScript SDK
            </h2>
            <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
              A lightweight client for pulling webhook events via HTTP. Works in Node.js, Deno, Bun — anywhere with <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">fetch</code>.
            </p>

            <div className="mb-6">
              <h3 className="mb-3 text-sm font-medium">Install</h3>
              <CopyableCode code="npm install simplehook-core" title="terminal" />
              <p className="mt-2 text-xs text-muted-foreground">
                Or use the Express SDK — it re-exports <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">SimplehookAgent</code>: <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">npm install simplehook</code>
              </p>
            </div>

            <div className="mb-6">
              <h3 className="mb-3 text-sm font-medium">Usage</h3>
              <CopyableCode
                code={`import { SimplehookAgent } from "simplehook-core";

const agent = new SimplehookAgent("ak_your_key", {
  serverUrl: "https://hook.simplehook.dev",  // default
  listenerId: "my-agent",                     // cursor ID
});

// Pull next 5 events (instant)
const result = await agent.pull({ n: 5 });
console.log(result.events, result.remaining);

// Wait for next Stripe event (long-poll)
const stripe = await agent.pull({
  path: "/stripe/*",
  wait: true,
  timeout: 60,
});

// Check queue health
const status = await agent.status();
console.log(status.queue.pending, "pending");

// Stream events (SSE)
await agent.stream((event) => {
  console.log(event.method, event.path, event.body);
}, { path: "/stripe/*", timeout: 300 });`}
                title="agent.ts"
              />
            </div>

            <div className="mb-6">
              <h3 className="mb-3 text-sm font-medium">API</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 pr-4 text-left font-medium">Method</th>
                      <th className="py-2 text-left font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-[11px]">agent.pull(opts?)</td>
                      <td className="py-2">Pull events. Options: n, path, wait, timeout, after</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-[11px]">agent.status()</td>
                      <td className="py-2">Queue health, cursors, connected listeners</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-[11px]">agent.stream(handler, opts?)</td>
                      <td className="py-2">SSE stream — calls handler for each event</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <SectionDivider />

          {/* ── CLI ─────────────────────────────────────── */}
          <section
            id="cli"
            ref={(el) => setSectionRef("cli", el)}
            className="py-16"
          >
            <Kicker>CLI</Kicker>
            <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
              simplehook CLI
            </h2>
            <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
              Pull events and check status from the terminal. Pipe JSON output to other tools.
            </p>

            <div className="mb-6">
              <h3 className="mb-3 text-sm font-medium">Install</h3>
              <CopyableCode code="npm install -g simplehook-cli" title="terminal" />
            </div>

            <div className="mb-6">
              <h3 className="mb-3 text-sm font-medium">Commands</h3>
              <CopyableCode
                code={`# Pull next event (instant)
simplehook pull

# Pull 5 Stripe events, wait until they arrive
simplehook pull -n 5 --path /stripe/* --wait --timeout 60

# Stream events as they arrive
simplehook pull --stream --path /github/*

# Check queue status
simplehook status

# Raw JSON output
simplehook status --json`}
                title="terminal"
              />
            </div>

            <div className="mb-6">
              <h3 className="mb-3 text-sm font-medium">Environment variables</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 pr-4 text-left font-medium">Variable</th>
                      <th className="py-2 pr-4 text-left font-medium">Flag</th>
                      <th className="py-2 text-left font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-[11px]">SIMPLEHOOK_KEY</td>
                      <td className="py-2 pr-4 font-mono text-[11px]">--key</td>
                      <td className="py-2">API key (required)</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-[11px]">SIMPLEHOOK_SERVER</td>
                      <td className="py-2 pr-4 font-mono text-[11px]">--server</td>
                      <td className="py-2">Server URL (default: https://hook.simplehook.dev)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <SectionDivider />

          {/* ── Mastra ─────────────────────────────────────── */}
          <section
            id="mastra"
            ref={(el) => setSectionRef("mastra", el)}
            className="py-16"
          >
            <Kicker>Mastra</Kicker>
            <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
              Mastra integration
            </h2>
            <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
              Give your Mastra AI agent the ability to pull webhook events.
              Two tools: <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">simplehook_pull</code> and <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">simplehook_status</code>.
            </p>

            <div className="mb-6">
              <h3 className="mb-3 text-sm font-medium">Install</h3>
              <CopyableCode code="npm install simplehook-mastra @mastra/core zod" title="terminal" />
            </div>

            <div className="mb-6">
              <h3 className="mb-3 text-sm font-medium">Quick start</h3>
              <CopyableCode
                code={`import { Agent } from "@mastra/core/agent";
import { createSimplehookTools } from "simplehook-mastra";

const tools = createSimplehookTools({
  apiKey: process.env.SIMPLEHOOK_KEY,
});

const agent = new Agent({
  name: "webhook-processor",
  instructions: "Pull Stripe events and summarize what happened.",
  model: { provider: "OPEN_AI", name: "gpt-4o" },
  tools,
});

const response = await agent.generate(
  "Check for new Stripe events on /stripe/* path"
);
console.log(response.text);`}
                title="agent.ts"
              />
            </div>

            <div className="mb-6">
              <h3 className="mb-3 text-sm font-medium">Tools</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 pr-4 text-left font-medium">Tool</th>
                      <th className="py-2 text-left font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-[11px]">simplehook_pull</td>
                      <td className="py-2">Pull webhook events — supports n, path, wait, timeout params</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-[11px]">simplehook_status</td>
                      <td className="py-2">Queue health, cursor positions, connected listeners</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card/50 p-4">
              <p className="text-sm text-muted-foreground">
                Full step-by-step guide:{" "}
                <a href="/examples/mastra" className="underline underline-offset-2 hover:text-foreground transition-colors">
                  Build a Stripe webhook agent with Mastra
                </a>
              </p>
            </div>
          </section>

          </div>{/* END AGENTS GROUP */}

          <SectionDivider />

          {/* ── Privacy & Security ─────────────────────────────────────── */}
          <section
            id="privacy"
            ref={(el) => setSectionRef("privacy", el)}
            className="py-16"
          >
            <Kicker>Privacy & Security</Kicker>
            <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
              How your data is handled
            </h2>
            <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
              simplehook is designed to store as little as possible. Here is
              exactly what happens to your webhook data.
            </p>

            <div className="flex flex-col gap-6">
              {/* Passthrough */}
              <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="mb-2 text-sm font-medium">Passthrough mode: body never stored</h3>
                <p className="text-[13px] text-muted-foreground">
                  In passthrough mode, the request body flows through memory
                  only. It is proxied directly to your app over the WebSocket
                  and is <strong>never written to disk or database</strong>.
                  Only headers and metadata are stored for debugging.
                </p>
              </div>

              {/* Queue */}
              <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="mb-2 text-sm font-medium">Queue mode: body encrypted at rest, deleted after delivery</h3>
                <p className="text-[13px] text-muted-foreground">
                  In queue mode, the request body is stored temporarily so we
                  can retry delivery if your app is offline. The body is
                  encrypted at rest (AES-256 via Neon Postgres) and{" "}
                  <strong>deleted after successful delivery</strong>. Headers
                  and metadata are retained for debugging and replay.
                </p>
              </div>

              {/* TLS / WSS */}
              <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="mb-2 text-sm font-medium">All connections encrypted in transit</h3>
                <p className="text-[13px] text-muted-foreground">
                  Every connection uses TLS (HTTPS for webhook ingress and
                  API calls) and secure WebSockets (WSS for SDK connections).
                  Data is encrypted from the moment it leaves the webhook
                  provider to the moment it reaches your local app.
                </p>
              </div>

              {/* Retention */}
              <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="mb-2 text-sm font-medium">Event metadata retained 30 days</h3>
                <p className="text-[13px] text-muted-foreground">
                  Event metadata (headers, path, status, timestamps)
                  auto-expires after 30 days. We never sell or share your
                  webhook data with third parties and use no third-party
                  analytics or tracking.
                </p>
              </div>
            </div>
          </section>

          <SectionDivider />

          {/* ── DEVELOPERS GROUP continued (route-config + websocket) ── */}
          <div className={docsView === "developers" ? "" : "invisible h-0 overflow-hidden"}>

          {/* ── Route Configuration ─────────────────────────────────────── */}
          <section
            id="route-configuration"
            ref={(el) => setSectionRef("route-configuration", el)}
            className="py-16"
          >
            <Kicker>Route configuration</Kicker>
            <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
              Passthrough vs queue
            </h2>
            <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
              Routes let you control how different webhook paths are handled.
              Configure them in the dashboard or via API.
            </p>

            <div className="flex flex-col gap-6">
              {/* Passthrough */}
              <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="mb-2 text-sm font-medium">Passthrough mode</h3>
                <p className="mb-4 text-[13px] text-muted-foreground">
                  Your app's <strong>real response</strong> goes back to the caller. Use for Twilio (TwiML), Shopify (verification), or any provider that reads your response. Returns 502 if your app is offline.
                </p>
                <div className="mb-4 rounded-lg bg-muted/50 p-4 font-mono text-[11px]">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="rounded bg-background px-2 py-1">Twilio</span>
                    <span>→</span>
                    <span className="rounded bg-background px-2 py-1">simplehook</span>
                    <span>→</span>
                    <span className="rounded bg-background px-2 py-1">Your app</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-status-green-text">
                    <span className="rounded bg-background px-2 py-1">Twilio</span>
                    <span>←</span>
                    <span className="rounded bg-background px-2 py-1">simplehook</span>
                    <span>←</span>
                    <span className="rounded bg-status-green-bg px-2 py-1">TwiML response</span>
                  </div>
                </div>
                <CopyableCode
                  code={`POST /api/routes
{
  "path_prefix": "/twilio",
  "mode": "passthrough",
  "timeout_seconds": 30
}`}
                  title="Create passthrough route"
                />
              </div>

              {/* Queue */}
              <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="mb-2 text-sm font-medium">Queue mode (default)</h3>
                <p className="mb-4 text-[13px] text-muted-foreground">
                  Returns <strong>200 instantly</strong> to the caller. Delivers to your app async with retry. Events queue when your app is offline and drain on reconnect.
                </p>
                <div className="mb-4 rounded-lg bg-muted/50 p-4 font-mono text-[11px]">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="rounded bg-background px-2 py-1">Stripe</span>
                    <span>→</span>
                    <span className="rounded bg-background px-2 py-1">simplehook</span>
                    <span>→</span>
                    <span className="rounded bg-status-green-bg px-2 py-1 text-status-green-text">200 OK</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                    <span className="invisible rounded bg-background px-2 py-1">Stripe</span>
                    <span className="invisible">→</span>
                    <span className="rounded bg-background px-2 py-1">simplehook</span>
                    <span>→</span>
                    <span className="rounded bg-background px-2 py-1">Your app</span>
                    <span className="text-[10px] italic">(async, with retry)</span>
                  </div>
                </div>
                <CopyableCode
                  code={`POST /api/routes
{
  "path_prefix": "/stripe",
  "mode": "queue",
  "timeout_seconds": 5
}`}
                  title="Create queue route"
                />
              </div>

              <div>
                <h3 className="mb-3 text-sm font-medium">Path matching</h3>
                <p className="text-[13px] text-muted-foreground">
                  Routes match on prefix. A route with{" "}
                  <InlineCode>/stripe</InlineCode> will match{" "}
                  <InlineCode>/stripe/events</InlineCode>,{" "}
                  <InlineCode>/stripe/webhooks</InlineCode>, etc. The most
                  specific prefix wins. If no route matches, the default queue
                  mode is used.
                </p>
              </div>
            </div>
          </section>

          <SectionDivider />

          {/* ── WebSocket Protocol ──────────────────────────────────────── */}
          <section
            id="websocket-protocol"
            ref={(el) => setSectionRef("websocket-protocol", el)}
            className="py-16"
          >
            <Kicker>WebSocket protocol</Kicker>
            <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
              For custom SDK builders
            </h2>
            <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
              The SDK maintains a persistent WebSocket to receive events in
              real-time. Here is how the protocol works under the hood.
            </p>

            <div className="flex flex-col gap-6">
              <div>
                <h3 className="mb-3 text-sm font-medium">Connection</h3>
                <CopyableCode
                  code={`wss://ws.simplehook.dev/connect?api_key=${displayKey}`}
                  title="WebSocket"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  The SDK authenticates on connect. The server sends a ping every
                  30 seconds to keep the connection alive.
                </p>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-medium">
                  Event message (queue mode)
                </h3>
                <CopyableCode
                  code={`{
  "type": "event",
  "event_id": "evt_abc123",
  "method": "POST",
  "path": "/stripe/events",
  "headers": { "content-type": "application/json", ... },
  "body": "{ \\"type\\": \\"checkout.session.completed\\", ... }"
}`}
                  title="Server -> Client"
                />
              </div>

              <div>
                <h3 className="mb-3 text-sm font-medium">
                  Event message (passthrough mode)
                </h3>
                <CopyableCode
                  code={`{
  "type": "passthrough_request",
  "request_id": "req_xyz789",
  "method": "POST",
  "path": "/github/events",
  "headers": { "content-type": "application/json", ... },
  "body": "{ \\"action\\": \\"opened\\", ... }"
}`}
                  title="Server -> Client"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  In passthrough mode the server waits for your response before
                  replying to the webhook provider.
                </p>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-medium">ACK message</h3>
                <CopyableCode
                  code={`{
  "type": "ack",
  "event_id": "evt_abc123",
  "status": 200
}`}
                  title="Client -> Server"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  In queue mode, the client sends an ACK after forwarding the
                  event locally. In passthrough mode, the ACK includes the full
                  response body and headers.
                </p>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-medium">
                  Passthrough response
                </h3>
                <CopyableCode
                  code={`{
  "type": "passthrough_response",
  "request_id": "req_xyz789",
  "status": 200,
  "headers": { "content-type": "application/json" },
  "body": "{ \\"ok\\": true }"
}`}
                  title="Client -> Server"
                />
              </div>
            </div>
          </section>

          </div>{/* END DEVELOPERS GROUP continued */}

          <SectionDivider />

          {/* ── API Reference ───────────────────────────────────────────── */}
          <section
            id="api-reference"
            ref={(el) => setSectionRef("api-reference", el)}
            className="py-16"
          >
            <Kicker>API Reference</Kicker>
            <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
              REST API
            </h2>
            <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
              All endpoints require a Bearer token in the Authorization header.
            </p>

            <BaseUrlCard projectId={project?.id} />

            <div className="flex flex-col gap-4">
              <EndpointGroup
                title="Events"
                endpoints={[
                  { method: "GET", path: "/api/events", desc: "List events (paginated, filterable)",
                    request: `GET /api/events?status=delivered&path=/stripe&limit=25&offset=0`,
                    response: `{
  "data": [
    {
      "id": "evt_abc123",
      "path": "/stripe/events",
      "method": "POST",
      "status": "delivered",
      "route_mode": "queue",
      "response_status": 200,
      "created_at": "2026-03-30T10:00:00Z"
    }
  ],
  "total": 142,
  "limit": 25,
  "offset": 0
}` },
                  { method: "GET", path: "/api/events/:id", desc: "Get event detail",
                    response: `{
  "id": "evt_abc123",
  "path": "/stripe/events",
  "method": "POST",
  "headers": {"content-type": "application/json"},
  "body": "<base64>",
  "status": "delivered",
  "response_status": 200,
  "response_body": "<base64>",
  "route_mode": "queue",
  "attempts": 1,
  "created_at": "2026-03-30T10:00:00Z",
  "delivered_at": "2026-03-30T10:00:01Z"
}` },
                  { method: "POST", path: "/api/events/:id/replay", desc: "Replay an event",
                    response: `{
  "id": "evt_new456",
  "path": "/stripe/events",
  "status": "pending"
}` },
                ]}
              />

              <EndpointGroup
                title="Routes"
                endpoints={[
                  { method: "GET", path: "/api/routes", desc: "List active routes",
                    response: `[
  {
    "id": "uuid-here",
    "path_prefix": "/stripe",
    "mode": "passthrough",
    "timeout_seconds": 30,
    "created_at": "2026-03-30T10:00:00Z"
  }
]` },
                  { method: "POST", path: "/api/routes", desc: "Create route",
                    request: `{
  "path_prefix": "/stripe",
  "mode": "passthrough",
  "timeout_seconds": 30
}`,
                    response: `{
  "id": "uuid-here",
  "path_prefix": "/stripe",
  "mode": "passthrough",
  "timeout_seconds": 30
}` },
                  { method: "DELETE", path: "/api/routes/:id", desc: "Soft-delete a route",
                    response: `{"deleted": true}` },
                  { method: "GET", path: "/api/routes/trash", desc: "List deleted routes" },
                  { method: "POST", path: "/api/routes/:id/restore", desc: "Restore a deleted route",
                    response: `{"restored": true}` },
                ]}
              />

              <EndpointGroup
                title="Stats"
                endpoints={[
                  { method: "GET", path: "/api/stats?window=1d", desc: "Dashboard stats",
                    request: `GET /api/stats?window=1d
# windows: 1m, 10m, 1h, 1d, 7d`,
                    response: `{
  "total": 1234,
  "delivered": 1100,
  "pending": 100,
  "failed": 34,
  "timeseries": [
    {"time": "2026-03-30T10:00:00Z", "total": 50, "delivered": 45, "failed": 5}
  ],
  "by_path": [
    {"path": "/stripe/events", "count": 400},
    {"path": "/github/push", "count": 300}
  ]
}` },
                ]}
              />

              <EndpointGroup
                title="Webhooks"
                endpoints={[
                  { method: "POST", path: "/hooks/:project_id/*path", desc: "Receive webhook (3rd parties POST here)" },
                  { method: "GET", path: "/tunnel?key=ak_...", desc: "WebSocket tunnel (SDKs connect here)" },
                ]}
              />
            </div>

            <div className="mt-6">
              <h3 className="mb-3 text-sm font-medium">Authentication</h3>
              <CopyableCode
                code={`curl -H "Authorization: Bearer ${displayKey}" \\
  https://hook.simplehook.dev/api/events`}
                title="Example request"
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Endpoint group component ──────────────────────────────────────────

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-status-blue-bg text-status-blue-text",
  POST: "bg-status-green-bg text-status-green-text",
  PATCH: "bg-status-amber-bg text-status-amber-text",
  DELETE: "bg-status-red-bg text-status-red-text",
};

interface Endpoint {
  method: string;
  path: string;
  desc: string;
  request?: string;
  response?: string;
}

function EndpointRow({ ep }: { ep: Endpoint }) {
  const [open, setOpen] = useState(false);
  const hasExample = ep.request || ep.response;

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => hasExample && setOpen(!open)}
        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${hasExample ? "cursor-pointer hover:bg-muted/30" : ""}`}
      >
        <span className={`inline-flex shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${METHOD_COLORS[ep.method] ?? ""}`}>
          {ep.method}
        </span>
        <span className="font-mono text-xs">{ep.path}</span>
        <span className="ml-auto text-xs text-text-tertiary">{ep.desc}</span>
        {hasExample && (
          <span className={`text-[10px] text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
        )}
      </button>
      {open && hasExample && (
        <div className="border-t border-border bg-muted/20 px-4 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:gap-4">
            {ep.request && (
              <div className="flex-1">
                <span className="mb-1 block font-mono text-[9px] uppercase tracking-wider text-text-tertiary">Request</span>
                <pre className="overflow-x-auto rounded-md bg-[#1e1834] px-3 py-2.5 font-mono text-[11px] leading-[1.7] text-[#e0dce8]">
                  <code>{ep.request}</code>
                </pre>
              </div>
            )}
            {ep.response && (
              <div className="flex-1">
                <span className="mb-1 block font-mono text-[9px] uppercase tracking-wider text-text-tertiary">Response</span>
                <pre className="overflow-x-auto rounded-md bg-[#1e1834] px-3 py-2.5 font-mono text-[11px] leading-[1.7] text-[#e0dce8]">
                  <code>{ep.response}</code>
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EndpointGroup({ title, endpoints }: { title: string; endpoints: Endpoint[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border bg-background px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
        {title}
      </div>
      {endpoints.map((ep) => (
        <EndpointRow key={ep.path + ep.method} ep={ep} />
      ))}
    </div>
  );
}
