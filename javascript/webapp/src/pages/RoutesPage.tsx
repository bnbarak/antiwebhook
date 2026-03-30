import { useState, useEffect } from "react";
import { Plus, Trash2, GitBranch, ArrowRight, ChevronDown, RotateCcw } from "lucide-react";
import { api, type Route } from "@/lib/api.js";
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
import { Badge } from "@/components/ui/badge.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import { toast } from "sonner";

function FlowNode({ children, highlight }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <span
      className={`rounded px-2 py-1 font-mono text-[11px] ${
        highlight
          ? "bg-status-green-bg text-status-green-text"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {children}
    </span>
  );
}

function ModeExplainer({ mode }: { mode: "passthrough" | "queue" }) {
  if (mode === "passthrough") {
    return (
      <div className="rounded-lg border border-border bg-card/50 p-4">
        <div className="mb-3 text-xs font-medium">Passthrough mode</div>
        {/* U-shape: request goes right, then returns left */}
        <div className="flex flex-col items-center gap-1 font-mono text-[11px]">
          <div className="flex w-full items-center justify-between gap-2">
            <FlowNode>Stripe</FlowNode>
            <div className="flex flex-1 items-center gap-1 text-muted-foreground">
              <span className="flex-1 border-t border-dashed border-muted-foreground/40" />
              <span className="text-[10px]">POST</span>
              <ArrowRight className="size-3" />
            </div>
            <FlowNode>simplehook</FlowNode>
            <div className="flex flex-1 items-center gap-1 text-muted-foreground">
              <span className="flex-1 border-t border-dashed border-muted-foreground/40" />
              <ArrowRight className="size-3" />
            </div>
            <FlowNode>Your app</FlowNode>
          </div>
          <div className="flex w-full items-center justify-between gap-2">
            <FlowNode>Stripe</FlowNode>
            <div className="flex flex-1 items-center gap-1 text-status-green-text">
              <ArrowRight className="size-3 rotate-180" />
              <span className="text-[10px]">TwiML / JSON</span>
              <span className="flex-1 border-t border-dashed border-status-green-text/40" />
            </div>
            <FlowNode>simplehook</FlowNode>
            <div className="flex flex-1 items-center gap-1 text-status-green-text">
              <ArrowRight className="size-3 rotate-180" />
              <span className="flex-1 border-t border-dashed border-status-green-text/40" />
            </div>
            <FlowNode highlight>200 + body</FlowNode>
          </div>
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
      <div className="flex flex-col items-center gap-1 font-mono text-[11px]">
        <div className="flex w-full items-center justify-between gap-2">
          <FlowNode>Stripe</FlowNode>
          <div className="flex flex-1 items-center gap-1 text-muted-foreground">
            <span className="flex-1 border-t border-dashed border-muted-foreground/40" />
            <span className="text-[10px]">POST</span>
            <ArrowRight className="size-3" />
          </div>
          <FlowNode>simplehook</FlowNode>
          <div className="flex flex-1 items-center gap-1 text-status-green-text">
            <ArrowRight className="size-3 rotate-180" />
            <span className="flex-1 border-t border-dashed border-status-green-text/40" />
          </div>
          <FlowNode highlight>200 OK</FlowNode>
        </div>
        <div className="mt-1 flex w-full items-center gap-2">
          <span className="w-[52px]" />
          <span className="w-0 flex-1" />
          <FlowNode>simplehook</FlowNode>
          <div className="flex flex-1 items-center gap-1 text-muted-foreground">
            <span className="flex-1 border-t border-dashed border-muted-foreground/40" />
            <span className="text-[10px] italic">async</span>
            <ArrowRight className="size-3" />
          </div>
          <FlowNode>Your app</FlowNode>
        </div>
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
  deleting,
  onDelete,
}: {
  route: Route;
  deleting: boolean;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

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
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted-foreground">
            {new Date(route.created_at).toLocaleDateString()}
          </span>
          <ChevronDown
            className={`size-3.5 text-muted-foreground transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          />
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
  const [routes, setRoutes] = useState<Route[]>([]);
  const [deletedRoutes, setDeletedRoutes] = useState<Route[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const [pathPrefix, setPathPrefix] = useState("");
  const [mode, setMode] = useState<"passthrough" | "queue">("passthrough");
  const [creating, setCreating] = useState(false);

  const fetchRoutes = async () => {
    try {
      const [active, deleted] = await Promise.all([
        api.routes.list(),
        api.routes.listDeleted(),
      ]);
      setRoutes(active);
      setDeletedRoutes(deleted);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.routes.create({ path_prefix: pathPrefix, mode });
      toast.success("Route created");
      setDialogOpen(false);
      setPathPrefix("");
      setMode("passthrough");
      fetchRoutes();
    } catch {
      toast.error("Failed to create route");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.routes.delete(id);
      toast.success("Route deleted — you can restore it from the deleted list");
      fetchRoutes();
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
      fetchRoutes();
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
            Configure how different webhook paths are handled. Default is queue mode.
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="size-3.5" />
              Add route
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add route</DialogTitle>
              <DialogDescription>
                Choose how webhooks matching this path are delivered to your app.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreate} className="flex flex-col gap-4">
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

              <div className="flex flex-col gap-2">
                <Label>Mode</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("passthrough")}
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
                    onClick={() => setMode("queue")}
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

              <DialogFooter>
                <Button type="submit" disabled={!pathPrefix.trim() || creating}>
                  {creating ? "Creating..." : "Create route"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : routes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
          <GitBranch className="mb-3 size-8 text-muted-foreground/40" />
          <p className="mb-1 text-sm font-medium text-muted-foreground">
            No routes configured
          </p>
          <p className="mb-4 text-xs text-text-tertiary">
            All paths default to queue mode. Add a route to use passthrough.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDialogOpen(true)}
            className="gap-1.5"
          >
            <Plus className="size-3.5" />
            Add your first route
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {routes.map((route) => (
            <RouteCard
              key={route.id}
              route={route}
              deleting={deletingId === route.id}
              onDelete={() => handleDelete(route.id)}
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
