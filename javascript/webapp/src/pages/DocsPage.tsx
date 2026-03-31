import { useState, useEffect, useCallback } from "react";
import { Copy, Check, KeyRound } from "lucide-react";
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
    ],
  },
];

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

      {/* ── Quick Start ─────────────────────────────────────────────── */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-[960px]">
          <Kicker>Quick start</Kicker>
          <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
            Up and running in 60 seconds
          </h2>
          <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
            Pick your language, install the SDK, add one line, and start
            receiving webhooks.
          </p>

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
        </div>
      </section>

      <SectionDivider />

      {/* ── Installation ────────────────────────────────────────────── */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-[960px]">
          <Kicker>Installation</Kicker>
          <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
            Per-framework packages
          </h2>
          <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
            Each framework has its own lightweight package. Pick the one that
            matches your stack.
          </p>

          {/* All frameworks rendered for SEO, active one visible */}
          {LANGUAGES.map((language) => (
            <div
              key={`lang-install-${language.id}`}
              className={activeLang === language.id ? "" : "hidden"}
            >
              <div className="flex flex-col gap-6">
                {language.frameworks.map((fw) => (
                  <div key={`fw-install-${fw.id}`}>
                    <h3 className="mb-3 text-sm font-medium flex items-center gap-2">
                      <img
                        src={LOGO_URLS[language.id]}
                        alt={language.name}
                        className="h-4 w-auto"
                      />
                      {fw.name}
                      {!fw.available && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          coming soon
                        </span>
                      )}
                    </h3>
                    <CopyableCode code={fw.installCmd} title="Terminal" />
                    <div className="mt-3">
                      <CopyableCode
                        code={fw.snippet(displayKey)}
                        title={fw.filename}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <SectionDivider />

      {/* ── Configuration ───────────────────────────────────────────── */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-[960px]">
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
        </div>
      </section>

      <SectionDivider />

      {/* ── Route Configuration ─────────────────────────────────────── */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-[960px]">
          <Kicker>Route configuration</Kicker>
          <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
            Passthrough vs queue
          </h2>
          <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
            Routes let you control how different webhook paths are handled.
            Configure them in the dashboard or via API.
          </p>

          <div className="flex flex-col gap-6">
            <div>
              <h3 className="mb-3 text-sm font-medium">
                Queue mode (default)
              </h3>
              <p className="mb-3 text-[13px] text-muted-foreground">
                Returns 200 to the webhook provider immediately. Events are
                queued and forwarded to your app with automatic retries and
                exponential backoff.
              </p>
              <CopyableCode
                code={`{
  "path_prefix": "/stripe",
  "mode": "queue"
}`}
                title="Route config"
              />
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium">Passthrough mode</h3>
              <p className="mb-3 text-[13px] text-muted-foreground">
                Proxies the webhook to your app over WebSocket and returns your
                actual HTTP response to the webhook provider. Like a tunnel but
                without the tunnel.
              </p>
              <CopyableCode
                code={`{
  "path_prefix": "/github",
  "mode": "passthrough"
}`}
                title="Route config"
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
        </div>
      </section>

      <SectionDivider />

      {/* ── WebSocket Protocol ──────────────────────────────────────── */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-[960px]">
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
        </div>
      </section>

      <SectionDivider />

      {/* ── API Reference ───────────────────────────────────────────── */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-[960px]">
          <Kicker>API Reference</Kicker>
          <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
            REST API
          </h2>
          <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
            All endpoints require a Bearer token in the Authorization header.
          </p>

          <div className="flex flex-col gap-4">
            {/* Events */}
            <EndpointGroup
              title="Events"
              endpoints={[
                {
                  method: "GET",
                  path: "/api/events",
                  desc: "List events",
                },
                {
                  method: "GET",
                  path: "/api/events/:id",
                  desc: "Get event detail",
                },
                {
                  method: "POST",
                  path: "/api/events/:id/replay",
                  desc: "Replay event",
                },
              ]}
            />

            {/* Routes */}
            <EndpointGroup
              title="Routes"
              endpoints={[
                { method: "GET", path: "/api/routes", desc: "List routes" },
                { method: "POST", path: "/api/routes", desc: "Create route" },
                {
                  method: "PATCH",
                  path: "/api/routes/:id",
                  desc: "Update route",
                },
                {
                  method: "DELETE",
                  path: "/api/routes/:id",
                  desc: "Delete route",
                },
              ]}
            />

            {/* Auth & Billing */}
            <EndpointGroup
              title="Auth & Billing"
              endpoints={[
                {
                  method: "POST",
                  path: "/api/auth/register",
                  desc: "Create project",
                },
                {
                  method: "GET",
                  path: "/api/auth/me",
                  desc: "Get current project",
                },
                {
                  method: "GET",
                  path: "/api/billing",
                  desc: "Get billing info",
                },
                {
                  method: "POST",
                  path: "/api/billing/checkout",
                  desc: "Create checkout session",
                },
                {
                  method: "POST",
                  path: "/api/billing/portal",
                  desc: "Create billing portal link",
                },
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
        </div>
      </section>
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

function EndpointGroup({
  title,
  endpoints,
}: {
  title: string;
  endpoints: { method: string; path: string; desc: string }[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border bg-background px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
        {title}
      </div>
      {endpoints.map((ep) => (
        <div
          key={ep.path + ep.method}
          className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0"
        >
          <span
            className={`inline-flex rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${METHOD_COLORS[ep.method] ?? ""}`}
          >
            {ep.method}
          </span>
          <span className="font-mono text-xs">{ep.path}</span>
          <span className="ml-auto text-xs text-text-tertiary">{ep.desc}</span>
        </div>
      ))}
    </div>
  );
}
