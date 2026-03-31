import { useState, useEffect, useCallback } from "react";
import { Copy, Eye, EyeOff, Check } from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { api, type Project, type StatsResponse, type StatsWindow } from "@/lib/api.js";
import { Button } from "@/components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import { toast } from "sonner";

const WINDOWS: { value: StatsWindow; label: string }[] = [
  { value: "1m", label: "1m" },
  { value: "10m", label: "10m" },
  { value: "1h", label: "1h" },
  { value: "1d", label: "1d" },
  { value: "7d", label: "7d" },
];

const CHART_COLORS = {
  delivered: "#1d6a4a",
  failed: "#8c1a1a",
  pending: "#92600a",
};

// -- SDK data model: language → install → frameworks --

interface Framework {
  id: string;
  name: string;
  available: boolean;
  snippet: (key: string) => string;
}

interface Language {
  id: string;
  name: string;
  icon: string;
  install: string;
  frameworks: Framework[];
}

// Language logos (local SVGs from Wikipedia)
const LOGO_URLS: Record<string, string> = {
  node: "/logos/nodejs.svg",
  python: "/logos/python.svg",
  go: "/logos/go.svg",
  rust: "/logos/rust.svg",
};


const LANGUAGES: Language[] = [
  {
    id: "node",
    name: "Node.js",
    icon: "node",
    install: "npm install simplehook",
    frameworks: [
      {
        id: "express",
        name: "Express",
        available: true,
        snippet: (key) => `import express from "express";
import { listenToWebhooks } from "simplehook";

const app = express();
app.use(express.json());

listenToWebhooks(app, "${key}");

app.post("/stripe/events", (req, res) => {
  console.log("Webhook:", req.body);
  res.json({ received: true });
});

app.listen(3000);`,
      },
      {
        id: "fastify",
        name: "Fastify",
        available: true,
        snippet: (key) => `import Fastify from "fastify";
import { listenToWebhooks } from "simplehook-fastify";

const app = Fastify();
listenToWebhooks(app, "${key}");

app.post("/stripe/events", async (req) => {
  console.log("Webhook:", req.body);
  return { received: true };
});

app.listen({ port: 3000 });`,
      },
      {
        id: "hono",
        name: "Hono",
        available: false,
        snippet: (key) => `import { Hono } from "hono";
import { listenToWebhooks } from "simplehook-hono";

const app = new Hono();
listenToWebhooks(app, "${key}");

app.post("/stripe/events", (c) => {
  console.log("Webhook:", c.req.json());
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
    install: "pip install simplehook-flask",
    frameworks: [
      {
        id: "flask",
        name: "Flask",
        available: true,
        snippet: (key) => `from flask import Flask, request
from simplehook_flask import listenToWebhooks

app = Flask(__name__)
listenToWebhooks(app, "${key}")

@app.post("/stripe/events")
def stripe_events():
    print("Webhook:", request.json)
    return {"received": True}`,
      },
      {
        id: "django",
        name: "Django",
        available: true,
        snippet: (key) => `from django.core.wsgi import get_wsgi_application
from simplehook_django import listenToWebhooks

application = get_wsgi_application()
listenToWebhooks(application, "${key}")`,
      },
      {
        id: "fastapi",
        name: "FastAPI",
        available: false,
        snippet: (key) => `# Coming soon
# pip install simplehook-fastapi`,
      },
    ],
  },
  {
    id: "go",
    name: "Go",
    icon: "go",
    install: "go get github.com/simplehook/simplehook-go",
    frameworks: [
      {
        id: "gin",
        name: "Gin / Chi / Echo",
        available: false,
        snippet: () => `// Coming soon
// go get github.com/simplehook/simplehook-go`,
      },
    ],
  },
  {
    id: "rust",
    name: "Rust",
    icon: "rust",
    install: "cargo add simplehook",
    frameworks: [
      {
        id: "axum",
        name: "Axum / Actix",
        available: false,
        snippet: () => `// Coming soon
// cargo add simplehook`,
      },
    ],
  },
];

// -- Components --

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-1.5 px-4 py-2.5"
        style={{ backgroundColor: "#1e1834" }}
      >
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <button
          onClick={copy}
          className="ml-auto text-white/50 hover:text-white/80 transition-colors"
          title="Copy code"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <pre
        className="overflow-x-auto px-4 py-3 text-[13px] leading-relaxed text-white/90"
        style={{ backgroundColor: "#1e1834" }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

function QuickStartGuide({ apiKey, showKey }: { apiKey: string; showKey: boolean }) {
  const [langId, setLangId] = useState(LANGUAGES[0].id);
  const lang = LANGUAGES.find((l) => l.id === langId) ?? LANGUAGES[0];
  const [fwId, setFwId] = useState(lang.frameworks[0]?.id ?? "");

  const handleLangChange = (id: string) => {
    setLangId(id);
    const newLang = LANGUAGES.find((l) => l.id === id) ?? LANGUAGES[0];
    const first = newLang.frameworks.find((f) => f.available) ?? newLang.frameworks[0];
    setFwId(first?.id ?? "");
  };

  const fw = lang.frameworks.find((f) => f.id === fwId) ?? lang.frameworks[0];
  const displayKey = showKey ? (apiKey || "ak_your_api_key") : "ak_••••••••••••••••••••";

  return (
    <>
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1.5">1. Choose your language</p>
        <div className="flex gap-1.5 flex-wrap">
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              onClick={() => handleLangChange(l.id)}
              className={`rounded-lg border px-4 py-2.5 transition-colors ${
                l.id === langId
                  ? "border-foreground/30 bg-card ring-1 ring-foreground/10"
                  : "border-border hover:border-border-strong"
              }`}
            >
              <img src={LOGO_URLS[l.id]} alt={l.name} className="h-7 w-auto" title={l.name} />
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1.5">2. Install</p>
        <CodeBlock code={lang.install} />
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1.5">3. Add to your app</p>
        {lang.frameworks.length > 1 && (
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {lang.frameworks.map((f) => (
              <button
                key={f.id}
                onClick={() => f.available && setFwId(f.id)}
                disabled={!f.available}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  f.id === fwId && f.available
                    ? "border-foreground/30 bg-card ring-1 ring-foreground/10"
                    : f.available
                      ? "border-border hover:border-border-strong"
                      : "border-border opacity-40 cursor-not-allowed"
                }`}
              >
                {f.name}
                {!f.available && <span className="ml-1 text-[9px] text-muted-foreground">soon</span>}
              </button>
            ))}
          </div>
        )}
        {fw && <CodeBlock code={fw.snippet(displayKey)} />}
      </div>
    </>
  );
}

function QuickStartCard({ apiKey, webhookUrl }: { apiKey: string; webhookUrl: string }) {
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  const masked = apiKey ? apiKey.slice(0, 3) + "\u2022".repeat(20) : "";

  const copyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    toast.success("API key copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Start</CardTitle>
        <CardDescription>
          Install the SDK and start receiving webhooks in under a minute.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {webhookUrl && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Your Webhook URL</p>
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
              <span className="font-mono text-sm flex-1 truncate">{webhookUrl}</span>
              <button
                onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("Webhook URL copied"); }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Copy"
              >
                <Copy className="size-3.5" />
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Append your route path (e.g., <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">/stripe/events</code>)
            </p>
          </div>
        )}

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Your API Key</p>
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
            <span className="font-mono text-sm flex-1 truncate">
              {showKey ? apiKey : masked}
            </span>
            <button
              onClick={() => setShowKey(!showKey)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title={showKey ? "Hide" : "Show"}
            >
              {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
            <button
              onClick={copyKey}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Copy"
            >
              {copied ? <Check className="size-3.5 text-status-green-text" /> : <Copy className="size-3.5" />}
            </button>
          </div>
        </div>

        <QuickStartGuide apiKey={apiKey} showKey={showKey} />
      </CardContent>
    </Card>
  );
}

function StatCard({
  label,
  value,
  color,
  loading,
}: {
  label: string;
  value: number;
  color?: string;
  loading: boolean;
}) {
  return (
    <Card className="flex-1 min-w-0">
      <CardContent className="pt-4 pb-3 px-4">
        <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
        <div className="h-8 flex items-end">
          {loading ? (
            <Skeleton className="h-7 w-20" />
          ) : (
            <p className="text-2xl font-semibold tabular-nums leading-none" style={color ? { color } : undefined}>
              {value.toLocaleString()}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatTime(time: string, window: StatsWindow) {
  const d = new Date(time);
  if (window === "1m" || window === "10m") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  if (window === "1h") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (window === "1d") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  // 7d
  return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit" });
}

function EventsAreaChart({
  data,
  window,
  loading,
}: {
  data: StatsResponse["timeseries"];
  window: StatsWindow;
  loading: boolean;
}) {
  if (loading) {
    return <Skeleton className="h-[280px] w-full" />;
  }

  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        No events in this time window
      </div>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    label: formatTime(d.time, window),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={formatted} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="gradDelivered" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.delivered} stopOpacity={0.3} />
            <stop offset="100%" stopColor={CHART_COLORS.delivered} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradFailed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.failed} stopOpacity={0.3} />
            <stop offset="100%" stopColor={CHART_COLORS.failed} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e2da" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#6b6860" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#6b6860" }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#fff",
            border: "1px solid #e4e2da",
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        <Area
          type="monotone"
          dataKey="delivered"
          stroke={CHART_COLORS.delivered}
          fill="url(#gradDelivered)"
          strokeWidth={1.5}
        />
        <Area
          type="monotone"
          dataKey="failed"
          stroke={CHART_COLORS.failed}
          fill="url(#gradFailed)"
          strokeWidth={1.5}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function PathBarChart({
  data,
  loading,
}: {
  data: StatsResponse["by_path"];
  loading: boolean;
}) {
  if (loading) {
    return <Skeleton className="h-[280px] w-full" />;
  }

  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        No events in this time window
      </div>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    shortPath: d.path.length > 25 ? "..." + d.path.slice(-22) : d.path,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={formatted}
        layout="vertical"
        margin={{ top: 4, right: 20, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e2da" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "#6b6860" }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="shortPath"
          width={140}
          tick={{ fontSize: 11, fill: "#6b6860", fontFamily: "DM Mono, monospace" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#fff",
            border: "1px solid #e4e2da",
            borderRadius: 6,
            fontSize: 12,
          }}
          formatter={(value: number) => [value.toLocaleString(), "Events"]}
          labelFormatter={(_label: string, payload: Array<{ payload?: { path?: string } }>) =>
            payload?.[0]?.payload?.path ?? _label
          }
        />
        <Bar dataKey="count" fill="#1a1916" radius={[0, 3, 3, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DashboardPage() {
  const [projectData, setProjectData] = useState<Project | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [window, setWindow] = useState<StatsWindow>("1d");
  const [loadingProject, setLoadingProject] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    api.project
      .get()
      .then(setProjectData)
      .catch(() => {})
      .finally(() => setLoadingProject(false));
  }, []);

  const fetchStats = useCallback((w: StatsWindow) => {
    setLoadingStats(true);
    api.stats
      .get(w)
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoadingStats(false));
  }, []);

  useEffect(() => {
    fetchStats(window);
  }, [window, fetchStats]);

  const apiKey = projectData?.api_key ?? "";
  const webhookUrl = projectData?.webhook_base_url ?? "";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-medium">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your webhook activity and quick setup guide.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {/* Quick Start */}
        {loadingProject ? (
          <Card>
            <CardContent className="py-8">
              <Skeleton className="h-6 w-48 mb-4" />
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
        ) : (
          <QuickStartCard apiKey={apiKey} webhookUrl={webhookUrl} />
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Total Events"
            value={stats?.total ?? 0}
            loading={loadingStats}
          />
          <StatCard
            label="Delivered"
            value={stats?.delivered ?? 0}
            color={CHART_COLORS.delivered}
            loading={loadingStats}
          />
          <StatCard
            label="Pending"
            value={stats?.pending ?? 0}
            color={CHART_COLORS.pending}
            loading={loadingStats}
          />
          <StatCard
            label="Failed"
            value={stats?.failed ?? 0}
            color={CHART_COLORS.failed}
            loading={loadingStats}
          />
        </div>

        {/* Time Window Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Window:</span>
          <div className="inline-flex items-center rounded-lg border bg-card p-0.5 gap-0.5">
            {WINDOWS.map((w) => (
              <Button
                key={w.value}
                variant={window === w.value ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => setWindow(w.value)}
              >
                {w.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Events Over Time</CardTitle>
              <CardDescription className="text-xs">
                Delivered and failed events stacked
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EventsAreaChart
                data={stats?.timeseries ?? []}
                window={window}
                loading={loadingStats}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Events by Path</CardTitle>
              <CardDescription className="text-xs">
                Top 10 webhook paths by volume
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PathBarChart
                data={stats?.by_path ?? []}
                loading={loadingStats}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
