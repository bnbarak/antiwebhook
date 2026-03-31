import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Radio, ExternalLink } from "lucide-react";
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

const FREE_LIMIT = 3;
const PAID_LIMIT = 6;

export function AgentsPage() {
  const [listeners, setListeners] = useState<Listener[]>([]);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  const isPaid = billing?.billing_status === "active";
  const limit = isPaid ? PAID_LIMIT : FREE_LIMIT;
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

  const handleUpgrade = async () => {
    setUpgradeLoading(true);
    try {
      const { url } = await api.billing.createCheckout();
      window.location.href = url;
    } catch {
      toast.error("Failed to start checkout");
      setUpgradeLoading(false);
    }
  };

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
        {atLimit && !isPaid ? (
          <Button size="sm" onClick={handleUpgrade} disabled={upgradeLoading}>
            <ExternalLink className="mr-1.5 size-3.5" />
            {upgradeLoading ? "Redirecting..." : "Upgrade for more agents"}
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
            {isPaid
              ? `You've reached the maximum of ${PAID_LIMIT} agents.`
              : `You've used all ${FREE_LIMIT} free agents.`}
          </p>
          {!isPaid && (
            <Button size="sm" variant="outline" onClick={handleUpgrade} disabled={upgradeLoading}>
              Upgrade — $5/mo
            </Button>
          )}
        </div>
      )}

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
        {isPaid ? `Paid plan: ${PAID_LIMIT} agents.` : `Free: ${FREE_LIMIT} agents. Upgrade to $5/mo for ${PAID_LIMIT}.`}
      </p>
    </div>
  );
}
