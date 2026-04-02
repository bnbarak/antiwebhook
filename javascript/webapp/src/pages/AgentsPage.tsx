import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, Radio, Copy, Check } from "lucide-react";
import { api, type Listener, type BillingStatus } from "@/lib/api.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import { toast } from "sonner";

export function AgentsPage() {
  const navigate = useNavigate();
  const [listeners, setListeners] = useState<Listener[]>([]);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const isPaid = billing?.has_subscription ?? false;
  const limit = billing?.agent_limit ?? 3;
  const atLimit = listeners.length >= limit;

  const loadData = useCallback(async () => {
    try {
      const [ls, bl] = await Promise.all([
        api.listeners.list(),
        api.billing.getStatus(),
      ]);
      setListeners(ls);
      setBilling(bl);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async () => {
    if (!newId.trim()) return;
    setCreating(true);
    try {
      await api.listeners.create({
        listener_id: newId.trim(),
        label: newLabel.trim() || undefined,
      });
      toast.success(`Agent "${newId.trim()}" created`);
      setNewId("");
      setNewLabel("");
      setDialogOpen(false);
      await loadData();
    } catch (err: any) {
      const msg = err?.message ?? "Failed to create agent";
      if (msg.includes("listener limit")) {
        toast.error("Agent limit reached — upgrade for more agents");
      } else if (msg.includes("already exists")) {
        toast.error("An agent with this ID already exists");
      } else {
        toast.error(msg);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (listenerId: string) => {
    try {
      await api.listeners.delete(listenerId);
      toast.success(`Agent "${listenerId}" deleted`);
      await loadData();
    } catch {
      toast.error("Failed to delete agent");
    }
  };

  const goToSettings = () => navigate("/settings");

  const validIdPattern = /^[a-z0-9_-]{1,12}$/;
  const isIdValid = validIdPattern.test(newId.trim());

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium">Agents</h1>
          <p className="text-sm text-muted-foreground">
            Each agent is an SDK instance. Assign agents to routes to control
            which SDK receives which webhooks.
          </p>
        </div>
        {atLimit ? (
          <Button size="sm" onClick={goToSettings}>
            Upgrade for more agents
          </Button>
        ) : (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={atLimit}>
                <Plus className="mr-1.5 size-3.5" />
                New agent
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create agent</DialogTitle>
                <DialogDescription>
                  Give this agent a short ID (e.g. <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">staging</code>,{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">dev</code>).
                  Lowercase letters, numbers, hyphens, underscores. Max 12 chars.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4 py-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="agent-id">Agent ID</Label>
                  <Input
                    id="agent-id"
                    placeholder="staging"
                    value={newId}
                    onChange={(e) => setNewId(e.target.value.toLowerCase())}
                    className="font-mono"
                    maxLength={12}
                  />
                  {newId && !isIdValid && (
                    <p className="text-xs text-destructive">
                      Only lowercase letters, numbers, hyphens, underscores (1-12 chars)
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="agent-label">Label (optional)</Label>
                  <Input
                    id="agent-label"
                    placeholder="Staging environment"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCreate}
                  disabled={!isIdValid || creating}
                  size="sm"
                >
                  {creating ? "Creating..." : "Create agent"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Limit banner */}
      {atLimit && !loading && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-status-amber-border bg-status-amber-bg px-4 py-3">
          <p className="text-sm text-status-amber-text">
            You've used all {limit} agent slots.
          </p>
          <Button size="sm" variant="outline" onClick={goToSettings}>
            {isPaid ? "Upgrade plan" : "Upgrade — $5/mo"}
          </Button>
        </div>
      )}

      {/* Code example */}
      {!loading && listeners.length > 0 && <AgentCodeExample />}

      {loading ? (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>
      ) : listeners.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Radio className="mx-auto mb-3 size-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">No agents yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create an agent, then assign it to a route to control event delivery.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Without agents, all webhooks go to every connected SDK.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {listeners.length}/{limit} agent{listeners.length !== 1 ? "s" : ""}
            </CardTitle>
            <CardDescription>
              Assign agents to routes to control which SDK receives which events.
              Use the agent ID in your SDK:{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                listenToWebhooks(app, "ak_...", "agent-id")
              </code>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">ID</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead className="w-[90px]">Status</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {listeners.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-sm">
                      {l.listener_id}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {l.label ?? "—"}
                    </TableCell>
                    <TableCell>
                      {l.connected ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-status-green-text">
                          <span className="inline-block size-1.5 rounded-full bg-status-green-dot" />
                          Online
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <span className="inline-block size-1.5 rounded-full bg-muted-foreground/40" />
                          Offline
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(l.listener_id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        {listeners.length}/{limit} agents.{" "}
        {isPaid
          ? "Increase subscription quantity in Stripe for more."
          : "Subscribe ($5/mo) for 3 more agent slots."}
      </p>
    </div>
  );
}

const SNIPPETS: Record<string, Record<string, (id: string) => string>> = {
  "Node.js": {
    Express: (id) => `import { listenToWebhooks } from "simplehook";\n\nlistenToWebhooks(app, process.env.SIMPLEHOOK_KEY, "${id}");`,
    Fastify: (id) => `import { listenToWebhooks } from "simplehook-fastify";\n\nlistenToWebhooks(app, process.env.SIMPLEHOOK_KEY, "${id}");`,
    Hono: (id) => `import { listenToWebhooks } from "simplehook-hono";\n\nlistenToWebhooks(app, process.env.SIMPLEHOOK_KEY, "${id}");`,
  },
  Python: {
    Flask: (id) => `from simplehook_flask import listenToWebhooks\n\nlistenToWebhooks(app, os.environ["SIMPLEHOOK_KEY"], "${id}")`,
    Django: (id) => `from simplehook_django import listenToWebhooks\n\nlistenToWebhooks(application, os.environ["SIMPLEHOOK_KEY"], "${id}")`,
    FastAPI: (id) => `from simplehook_fastapi import listenToWebhooks\n\nlistenToWebhooks(app, os.environ["SIMPLEHOOK_KEY"], "${id}")`,
  },
};

function AgentCodeExample() {
  const [lang, setLang] = useState(Object.keys(SNIPPETS)[0]);
  const [fw, setFw] = useState(Object.keys(SNIPPETS[lang])[0]);
  const [copied, setCopied] = useState(false);

  const frameworks = Object.keys(SNIPPETS[lang] ?? {});
  const code = SNIPPETS[lang]?.[fw]?.("my-agent") ?? "";

  const handleLangChange = (l: string) => {
    setLang(l);
    setFw(Object.keys(SNIPPETS[l])[0]);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
        <div className="flex gap-1.5">
          {Object.keys(SNIPPETS).map((l) => (
            <button
              key={l}
              onClick={() => handleLangChange(l)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                l === lang
                  ? "bg-card border border-foreground/20 ring-1 ring-foreground/5"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="text-muted-foreground/30">|</span>
        <div className="flex gap-1.5">
          {frameworks.map((f) => (
            <button
              key={f}
              onClick={() => setFw(f)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                f === fw
                  ? "bg-card border border-foreground/20 ring-1 ring-foreground/5"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          onClick={handleCopy}
          className="ml-auto text-muted-foreground/50 hover:text-foreground transition-colors"
          title="Copy"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <pre className="overflow-x-auto bg-[#1e1834] px-4 py-3 font-mono text-[13px] leading-relaxed text-white/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}
