import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Trash2, GitBranch, ChevronDown, RotateCcw, Pencil } from "lucide-react";
import { api, type Route, type Listener, type BillingStatus } from "@/lib/api.js";
import { FlowNode, FlowArrow, FlowRow } from "@/components/shared/FlowDiagram.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { Badge } from "@/components/ui/badge.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import { toast } from "sonner";

function ModeExplainer({ mode }: { mode: "passthrough" | "queue" }) {
  if (mode === "passthrough") {
    return (
      <div className="rounded-lg border border-border bg-card/50 p-4">
        <div className="mb-3 text-xs font-medium">Passthrough mode</div>
        <div className="flex flex-col items-center gap-1.5 font-mono text-[11px]">
          <FlowRow>
            <FlowNode>Stripe</FlowNode>
            <FlowArrow label="POST" />
            <FlowNode>simplehook</FlowNode>
            <FlowArrow />
            <FlowNode>Your app</FlowNode>
          </FlowRow>
          <FlowRow>
            <FlowNode>Stripe</FlowNode>
            <FlowArrow label="TwiML / JSON" reverse highlight />
            <FlowNode>simplehook</FlowNode>
            <FlowArrow reverse highlight />
            <FlowNode highlight>200 + body</FlowNode>
          </FlowRow>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Your app's <strong>real response</strong> goes all the way back to the caller.
          Use for Twilio (TwiML), Shopify, or any provider that reads your response.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4">
      <div className="mb-3 text-xs font-medium">Queue mode</div>
      <div className="flex flex-col items-center gap-1.5 font-mono text-[11px]">
        <FlowRow>
          <FlowNode>Stripe</FlowNode>
          <FlowArrow label="POST" />
          <FlowNode>simplehook</FlowNode>
          <FlowArrow reverse highlight />
          <FlowNode highlight>200 OK</FlowNode>
        </FlowRow>
        <FlowRow className="mt-0.5">
          <span className="w-[52px]" />
          <span className="w-0 flex-1" />
          <FlowNode>simplehook</FlowNode>
          <FlowArrow label="async" />
          <FlowNode>Your app</FlowNode>
        </FlowRow>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Returns <strong>200 instantly</strong>. Delivers async with retry.
        Events queue when your app is offline and drain on reconnect.
      </p>
    </div>
  );
}

function RouteCard({
  route,
  agents,
  deleting,
  onDelete,
  onEdit,
}: {
  route: Route;
  agents: Listener[];
  deleting: boolean;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const agentLabel = route.listener_id
    ? agents.find((a) => a.listener_id === route.listener_id)?.label ?? route.listener_id
    : null;

  return (
    <div
      className="group rounded-lg border border-border bg-card transition-colors hover:border-border-strong"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div className="flex items-center justify-between px-5 py-3.5">
        <div className="flex items-center gap-4">
          <span className="font-mono text-sm">{route.path_prefix}</span>
          <Badge variant="secondary" className="font-mono text-[10px] uppercase">
            {route.mode}
          </Badge>
          {agentLabel && (
            <Badge variant="outline" className="text-[10px]">
              {agentLabel}
            </Badge>
          )}
          <span className="font-mono text-[10px] text-muted-foreground">
            {route.timeout_seconds}s
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title="Edit route"
            className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            disabled={deleting}
            title="Delete route"
            className="text-destructive opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
          >
            <Trash2 />
          </Button>
          <ChevronDown
            className={`size-3.5 text-muted-foreground transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </div>

      <div
        className={`overflow-hidden transition-all duration-200 ease-out ${
          expanded ? "max-h-[200px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="border-t border-border px-5 py-4">
          <ModeExplainer mode={route.mode as "passthrough" | "queue"} />
        </div>
      </div>
    </div>
  );
}

export function RoutesPage() {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [deletedRoutes, setDeletedRoutes] = useState<Route[]>([]);
  const [agents, setAgents] = useState<Listener[]>([]);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const [pathPrefix, setPathPrefix] = useState("");
  const [mode, setMode] = useState<"passthrough" | "queue">("passthrough");
  const [timeoutSeconds, setTimeoutSeconds] = useState(30);
  const [selectedAgent, setSelectedAgent] = useState<string>("_none");
  const [saving, setSaving] = useState(false);

  const routeLimit = billing?.route_limit ?? 3;

  const fetchData = async () => {
    try {
      const [active, deleted, ls, bl] = await Promise.all([
        api.routes.list(),
        api.routes.listDeleted(),
        api.listeners.list(),
        api.billing.getStatus(),
      ]);
      setRoutes(active);
      setDeletedRoutes(deleted);
      setAgents(ls);
      setBilling(bl);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setPathPrefix("");
    setTimeoutSeconds(30);
    setMode("passthrough");
    setSelectedAgent("_none");
    setEditingRoute(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (route: Route) => {
    setEditingRoute(route);
    setPathPrefix(route.path_prefix);
    setMode(route.mode);
    setTimeoutSeconds(route.timeout_seconds);
    setSelectedAgent(route.listener_id ?? "_none");
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const listenerId = selectedAgent === "_none" ? null : selectedAgent;
    try {
      if (editingRoute) {
        await api.routes.update(editingRoute.id, {
          mode,
          timeout_seconds: timeoutSeconds,
          listener_id: listenerId,
        });
        toast.success("Route updated");
      } else {
        await api.routes.create({
          path_prefix: pathPrefix,
          mode,
          timeout_seconds: timeoutSeconds,
          listener_id: listenerId,
        });
        toast.success("Route created");
      }
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch {
      toast.error(editingRoute ? "Failed to update route" : "Failed to create route");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.routes.delete(id);
      toast.success("Route deleted — you can restore it from the deleted list");
      fetchData();
    } catch {
      toast.error("Failed to delete route");
    } finally {
      setDeletingId(null);
    }
  };

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      await api.routes.restore(id);
      toast.success("Route restored");
      fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to restore route";
      toast.error(msg.includes("already exists") ? "Can't restore — an active route with this path already exists" : msg);
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-medium">Routes</h1>
          <p className="text-sm text-muted-foreground">
            Configure how different webhook paths are handled and which listener receives them.
          </p>
        </div>

        <Button size="sm" className="gap-1.5" onClick={openCreate} disabled={routeLimit > 0 && routes.length >= routeLimit}>
          <Plus className="size-3.5" />
          Add route
        </Button>
      </div>

      {/* Route limit banner */}
      {routeLimit > 0 && routes.length >= routeLimit && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-status-amber-border bg-status-amber-bg px-4 py-3">
          <p className="text-sm text-status-amber-text">
            You've reached the {routeLimit}-route limit on your current plan. Upgrade to get {routeLimit + 3} routes, {routeLimit + 3} listeners, and more.
          </p>
          <Button size="sm" variant="outline" onClick={() => navigate("/settings")} className="shrink-0">
            Upgrade plan
          </Button>
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRoute ? "Edit route" : "Add route"}</DialogTitle>
            <DialogDescription>
              {editingRoute
                ? "Update mode, timeout, or listener assignment."
                : "Choose how webhooks matching this path are delivered to your app."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="flex flex-col gap-4">
            {!editingRoute && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="path-prefix">Path prefix</Label>
                <Input
                  id="path-prefix"
                  placeholder="/stripe"
                  value={pathPrefix}
                  onChange={(e) => setPathPrefix(e.target.value)}
                  className="font-mono text-sm"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Webhooks matching this prefix will use this route's settings.
                </p>
              </div>
            )}

            {editingRoute && (
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                <span className="text-xs text-muted-foreground">Path:</span>
                <span className="font-mono text-sm">{editingRoute.path_prefix}</span>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label>Mode</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setMode("passthrough"); setTimeoutSeconds(30); }}
                  className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                    mode === "passthrough"
                      ? "border-foreground/30 bg-card ring-1 ring-foreground/10"
                      : "border-border hover:border-border-strong"
                  }`}
                >
                  <div className="font-medium">Passthrough</div>
                  <div className="mt-0.5 text-muted-foreground">
                    Returns your app's real response
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => { setMode("queue"); setTimeoutSeconds(5); }}
                  className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                    mode === "queue"
                      ? "border-foreground/30 bg-card ring-1 ring-foreground/10"
                      : "border-border hover:border-border-strong"
                  }`}
                >
                  <div className="font-medium">Queue</div>
                  <div className="mt-0.5 text-muted-foreground">
                    Instant 200, async delivery with retry
                  </div>
                </button>
              </div>
            </div>

            <ModeExplainer mode={mode} />

            <div className="flex flex-col gap-2">
              <Label htmlFor="agent-select">Listener (optional)</Label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger id="agent-select" className="w-full">
                  <SelectValue placeholder="All listeners" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">All listeners</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.listener_id} value={a.listener_id}>
                      {a.label ? `${a.label} (${a.listener_id})` : a.listener_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Route events to a specific listener, or leave as "All listeners" to deliver to any connected SDK.
                {agents.length === 0 && (
                  <> No listeners yet — <Link to="/listeners" className="underline hover:text-foreground">create one</Link>.</>
                )}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="timeout">Timeout (seconds)</Label>
              <Input
                id="timeout"
                type="number"
                min={1}
                max={300}
                value={timeoutSeconds}
                onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                className="w-32 font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                How long to wait for your app to respond. Max 300s.
              </p>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={(!editingRoute && !pathPrefix.trim()) || saving}>
                {saving ? "Saving..." : editingRoute ? "Save changes" : "Create route"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : routes.length === 0 ? (
        <div className="flex flex-col gap-3">
          {/* Example ghost routes */}
          {[
            { path: "/stripe", mode: "queue", timeout: 5 },
            { path: "/twilio/voice", mode: "passthrough", timeout: 30 },
            { path: "/github", mode: "queue", timeout: 5 },
          ].map((example) => (
            <div
              key={example.path}
              className="flex items-center justify-between rounded-lg border border-dashed border-border px-5 py-3.5 opacity-40"
            >
              <div className="flex items-center gap-4">
                <span className="font-mono text-sm">{example.path}</span>
                <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                  {example.mode}
                </Badge>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {example.timeout}s
                </span>
              </div>
            </div>
          ))}
          <div className="flex flex-col items-center py-6">
            <p className="mb-1 text-sm font-medium text-muted-foreground">
              No routes configured yet
            </p>
            <p className="mb-4 text-xs text-text-tertiary">
              All paths default to queue mode. Add a route to use passthrough or assign an agent.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={openCreate}
              className="gap-1.5"
            >
              <Plus className="size-3.5" />
              Add your first route
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {routes.map((route) => (
            <RouteCard
              key={route.id}
              route={route}
              agents={agents}
              deleting={deletingId === route.id}
              onDelete={() => handleDelete(route.id)}
              onEdit={() => openEdit(route)}
            />
          ))}
        </div>
      )}

      {/* Deleted routes */}
      {deletedRoutes.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowDeleted(!showDeleted)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown
              className={`size-3 transition-transform duration-200 ${showDeleted ? "rotate-0" : "-rotate-90"}`}
            />
            {deletedRoutes.length} deleted route{deletedRoutes.length !== 1 ? "s" : ""}
          </button>

          <div
            className={`overflow-hidden transition-all duration-200 ${
              showDeleted ? "mt-3 max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <div className="flex flex-col gap-2">
              {deletedRoutes.map((route) => (
                <div
                  key={route.id}
                  className="flex items-center justify-between rounded-lg border border-dashed border-border px-5 py-3 opacity-60"
                >
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-sm line-through">{route.path_prefix}</span>
                    <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                      {route.mode}
                    </Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRestore(route.id)}
                    disabled={restoringId === route.id}
                    className="gap-1.5 text-xs"
                  >
                    <RotateCcw className="size-3" />
                    {restoringId === route.id ? "Restoring..." : "Restore"}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
