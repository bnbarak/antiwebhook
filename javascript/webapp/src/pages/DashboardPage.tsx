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
  icon: React.ReactNode;
  install: string;
  frameworks: Framework[];
}

// Inline SVG logos (standard, well-known marks)
const NodeLogo = () => (
  <svg viewBox="0 0 442 270" className="h-4 w-auto" fill="currentColor">
    <path d="M218.647 270c-3.358 0-6.479-.87-9.363-2.609L175.72 245.87c-4.443-2.491-2.253-3.36-0.802-3.837 6.839-2.371 8.229-2.914 15.537-7.055.765-.434 1.768-.271 2.553.197l25.573 15.181c.929.521 2.247.521 3.087 0l99.77-57.606c.928-.521 1.53-1.565 1.53-2.665V132.26c0-1.133-.602-2.176-1.559-2.724l-99.71-57.549c-.928-.535-2.159-.535-3.087 0l-99.681 57.549c-.987.548-1.588 1.62-1.588 2.724v115.047c0 1.07.601 2.114 1.53 2.608L150.778 272c17.314 8.652 27.896-.245 27.896-8.652V140.913c0-1.578 1.24-2.81 2.79-2.81h12.18c1.52 0 2.789 1.232 2.789 2.81v122.375c0 16.89-9.215 26.52-25.227 26.52-4.92 0-8.805 0-19.627-5.33l-32.77-18.829C112.936 261.918 109 255.553 109 248.7V132.26c0-6.855 3.936-13.22 10.31-16.954l99.77-57.7c6.204-3.502 14.445-3.502 20.59 0l99.77 57.7c6.375 3.734 10.31 10.099 10.31 16.954v115.047c0 6.853-3.935 13.19-10.31 16.983l-99.77 57.606a20.357 20.357 0 0 1-10.023 2.104"/>
    <path d="M340.146 237.975c-57.72 0-69.867-26.498-69.867-48.766 0-1.578 1.24-2.81 2.79-2.81h12.42c1.4 0 2.552 1.013 2.79 2.372 1.895 12.782 7.54 19.25 33.216 19.25 20.443 0 29.152-4.633 29.152-15.478 0-6.256-2.464-10.888-34.213-14.004-26.511-2.608-42.897-8.477-42.897-29.699 0-19.556 16.488-31.2 44.142-31.2 31.053 0 46.352 10.771 48.276 33.897.068.766-.217 1.498-.72 2.08a2.851 2.851 0 0 1-2.011.89h-12.509c-1.306 0-2.433-.939-2.74-2.19-3.04-13.575-10.485-17.92-30.296-17.92-22.31 0-24.892 7.764-24.892 13.583 0 7.043 3.06 9.101 33.187 13.073 29.839 3.935 43.923 9.504 43.923 30.451-.03 21.145-17.615 33.17-48.351 33.17"/>
  </svg>
);

const PythonLogo = () => (
  <svg viewBox="0 0 110 110" className="h-4 w-auto">
    <defs>
      <linearGradient id="pyA" x1="12.959" y1="12.211" x2="53.834" y2="53.086" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#5A9FD4"/>
        <stop offset="1" stopColor="#306998"/>
      </linearGradient>
      <linearGradient id="pyB" x1="56.278" y1="57.086" x2="97.153" y2="97.961" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#FFD43B"/>
        <stop offset="1" stopColor="#FFE873"/>
      </linearGradient>
    </defs>
    <path fill="url(#pyA)" d="M54.919 0C26.737 0 28.5 11.83 28.5 11.83l.03 12.254h26.907v3.678H17.386S0 25.352 0 53.93c0 28.577 15.17 27.562 15.17 27.562h9.05V68.572s-.488-15.17 14.923-15.17h25.7s14.445.233 14.445-13.963V14.93S81.62 0 54.919 0zm-14.28 8.625a4.645 4.645 0 1 1 0 9.29 4.645 4.645 0 0 1 0-9.29z"/>
    <path fill="url(#pyB)" d="M55.081 110c28.182 0 26.419-11.83 26.419-11.83l-.03-12.254H54.563v-3.678h38.051S110 84.648 110 56.07c0-28.577-15.17-27.562-15.17-27.562h-9.05v12.92s.488 15.17-14.923 15.17h-25.7s-14.445-.233-14.445 13.963V95.07S28.38 110 55.081 110zm14.28-8.625a4.645 4.645 0 1 1 0-9.29 4.645 4.645 0 0 1 0 9.29z"/>
  </svg>
);

const RustLogo = () => (
  <svg viewBox="0 0 144 144" className="h-4 w-auto" fill="currentColor">
    <path d="M72 0C32.235 0 0 32.235 0 72s32.235 72 72 72 72-32.235 72-72S111.765 0 72 0zm-.441 10.715c1.656 0 3 1.344 3 3s-1.344 3-3 3-3-1.344-3-3 1.344-3 3-3zM30.16 49.418l7.072.005c1.138 0 2.088.779 2.357 1.828l3.637 17.637h10.062V53.41c0-1.105.895-2 2-2h7.735a2 2 0 0 1 2 2v33.188h5.238V62.484a2 2 0 0 1 2-2h6.752l5.848 24.114h3.566l5.848-24.114h6.752a2 2 0 0 1 2 2V86.6h5.238V53.41a2 2 0 0 1 2-2h7.735a2 2 0 0 1 2 2v15.48h10.062l3.637-17.638a2.406 2.406 0 0 1 2.357-1.828l7.071-.005a47.888 47.888 0 0 1 .387 36.516l-6.127.004a2.399 2.399 0 0 1-2.357-1.965l-2.46-13.305H118.1v15.928a2 2 0 0 1-2 2h-7.735a2 2 0 0 1-2-2V70.67h-5.238v15.928a2 2 0 0 1-2 2H91.08l-4.27-17.617-4.271 17.617h-8.047a2 2 0 0 1-2-2V70.67h-5.238v15.928a2 2 0 0 1-2 2h-7.735a2 2 0 0 1-2-2V70.67H44.467l-2.46 13.305a2.399 2.399 0 0 1-2.357 1.965l-6.127-.004a47.867 47.867 0 0 1 .387-36.516h-.002z"/>
  </svg>
);

const SpringLogo = () => (
  <svg viewBox="0 0 28 28" className="h-4 w-auto" fill="currentColor">
    <path d="M25.084 4.158a13.303 13.303 0 0 0-1.94-2.892C20.905-1.136 17.424-0.166 14 0.166 10.576-0.166 7.095-1.136 4.856 1.266a13.303 13.303 0 0 0-1.94 2.892C1.355 7.274.688 10.966 1.008 14.588c.32 3.622 1.624 7.084 3.756 9.918a13.316 13.316 0 0 0 2.466 2.404c2.1 1.544 4.62 2.392 6.77 2.756 2.15-.364 4.67-1.212 6.77-2.756a13.316 13.316 0 0 0 2.466-2.404c2.132-2.834 3.436-6.296 3.756-9.918.32-3.622-.347-7.314-1.908-10.43zM6.97 21.63c-.058.032-.128.014-.16-.04-.81-1.374-1.504-2.81-2.078-4.298a.098.098 0 0 1 .054-.126c1.146-.48 2.328-.88 3.538-1.194.056-.014.112.02.126.074.544 1.95 1.268 3.842 2.166 5.65.03.056.008.126-.05.158l-3.596 1.776zm14.88-4.338c-.574 1.488-1.268 2.924-2.078 4.298-.032.054-.102.072-.16.04l-3.596-1.776c-.058-.032-.08-.102-.05-.158a26.165 26.165 0 0 0 2.166-5.65c.014-.054.07-.088.126-.074 1.21.314 2.392.714 3.538 1.194a.098.098 0 0 1 .054.126z"/>
  </svg>
);


const LANGUAGES: Language[] = [
  {
    id: "node",
    name: "Node.js",
    icon: <NodeLogo />,
    install: "npm install simplehook",
    frameworks: [
      {
        id: "express",
        name: "Express",
        available: true,
        snippet: (key) => `import express from "express";
import { listen } from "simplehook";

const app = express();
app.use(express.json());

listen(app, "${key}");

app.post("/stripe/events", (req, res) => {
  console.log("Webhook:", req.body);
  res.json({ received: true });
});

app.listen(3000);`,
      },
      {
        id: "fastify",
        name: "Fastify",
        available: false,
        snippet: (key) => `import Fastify from "fastify";
import { listen } from "simplehook-fastify";

const app = Fastify();
listen(app, "${key}");

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
import { listen } from "simplehook-hono";

const app = new Hono();
listen(app, "${key}");

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
    icon: <PythonLogo />,
    install: "pip install simplehook-flask",
    frameworks: [
      {
        id: "flask",
        name: "Flask",
        available: true,
        snippet: (key) => `from flask import Flask, request
from simplehook_flask import listen

app = Flask(__name__)
listen(app, "${key}")

@app.post("/stripe/events")
def stripe_events():
    print("Webhook:", request.json)
    return {"received": True}`,
      },
      {
        id: "django",
        name: "Django",
        available: false,
        snippet: (key) => `# Coming soon
# pip install simplehook-django`,
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
    icon: <SpringLogo />,
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
    icon: <RustLogo />,
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
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                l.id === langId
                  ? "border-foreground/30 bg-card ring-1 ring-foreground/10"
                  : "border-border hover:border-border-strong"
              }`}
            >
              <span className="mr-1.5">{l.icon}</span>{l.name}
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

function QuickStartCard({ apiKey }: { apiKey: string }) {
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
          stackId="1"
          stroke={CHART_COLORS.delivered}
          fill="url(#gradDelivered)"
          strokeWidth={1.5}
        />
        <Area
          type="monotone"
          dataKey="failed"
          stackId="1"
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
          <QuickStartCard apiKey={apiKey} />
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
