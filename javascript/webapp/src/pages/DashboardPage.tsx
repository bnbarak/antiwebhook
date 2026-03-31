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

// -- Quick Start code snippets --

function snippet(framework: string, apiKey: string) {
  const key = apiKey || "ak_your_api_key";
  switch (framework) {
    case "express":
      return `import express from "express";
import { simplehook } from "simplehook";

const app = express();
const hook = simplehook("${key}");

app.use(hook.middleware());
app.post("/stripe/events", (req, res) => {
  console.log("Webhook received:", req.body);
  res.sendStatus(200);
});

app.listen(3000);`;
    case "fastify":
      return `import Fastify from "fastify";
import { simplehook } from "simplehook";

const app = Fastify();
const hook = simplehook("${key}");

app.register(hook.fastify());
app.post("/stripe/events", async (req, reply) => {
  console.log("Webhook received:", req.body);
  return { ok: true };
});

app.listen({ port: 3000 });`;
    case "hono":
      return `import { Hono } from "hono";
import { simplehook } from "simplehook";

const app = new Hono();
const hook = simplehook("${key}");

app.use("/*", hook.hono());
app.post("/stripe/events", (c) => {
  console.log("Webhook received:", c.req.json());
  return c.json({ ok: true });
});

export default app;`;
    case "flask":
      return `from flask import Flask, request
from simplehook import SimpleHook

app = Flask(__name__)
hook = SimpleHook("${key}")

@app.before_request
def before():
    hook.middleware()

@app.post("/stripe/events")
def stripe_events():
    print("Webhook received:", request.json)
    return {"ok": True}`;
    default:
      return "";
  }
}

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

function ApiKeyDisplay({ apiKey }: { apiKey: string }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    toast.success("API key copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const masked = apiKey ? apiKey.slice(0, 3) + "\u2022".repeat(20) : "";

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
      <span className="font-mono text-sm flex-1 truncate">
        {visible ? apiKey : masked}
      </span>
      <button
        onClick={() => setVisible(!visible)}
        className="text-muted-foreground hover:text-foreground transition-colors"
        title={visible ? "Hide API key" : "Show API key"}
      >
        {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
      <button
        onClick={copy}
        className="text-muted-foreground hover:text-foreground transition-colors"
        title="Copy API key"
      >
        {copied ? (
          <Check className="size-3.5 text-status-green-text" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
    </div>
  );
}

function QuickStartCard({ apiKey }: { apiKey: string }) {
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
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            Your API Key
          </p>
          <ApiKeyDisplay apiKey={apiKey} />
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            1. Install
          </p>
          <CodeBlock code="npm install simplehook" />
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            2. Add to your app
          </p>
          <Tabs defaultValue="express">
            <TabsList>
              <TabsTrigger value="express">Express</TabsTrigger>
              <TabsTrigger value="fastify">Fastify</TabsTrigger>
              <TabsTrigger value="hono">Hono</TabsTrigger>
              <TabsTrigger value="flask">Flask</TabsTrigger>
            </TabsList>
            {["express", "fastify", "hono", "flask"].map((fw) => (
              <TabsContent key={fw} value={fw}>
                <CodeBlock code={snippet(fw, apiKey)} />
              </TabsContent>
            ))}
          </Tabs>
        </div>
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
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <p className="text-2xl font-semibold tabular-nums" style={color ? { color } : undefined}>
            {value.toLocaleString()}
          </p>
        )}
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
