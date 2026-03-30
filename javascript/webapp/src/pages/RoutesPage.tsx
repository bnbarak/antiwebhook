import { useState, useEffect } from "react";
import { Plus, Trash2, GitBranch, ArrowRight } from "lucide-react";
import { api, type Route } from "@/lib/api.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
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
import { Badge } from "@/components/ui/badge.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import { toast } from "sonner";

function ModeExplainer({ mode }: { mode: "passthrough" | "queue" }) {
  if (mode === "passthrough") {
    return (
      <div className="rounded-lg border border-border bg-card/50 p-4">
        <div className="mb-2.5 text-xs font-medium text-foreground">
          Passthrough mode
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <span className="rounded bg-muted px-1.5 py-0.5">Stripe</span>
          <ArrowRight className="size-3" />
          <span className="rounded bg-muted px-1.5 py-0.5">simplehook</span>
          <ArrowRight className="size-3" />
          <span className="rounded bg-muted px-1.5 py-0.5">Your app</span>
          <ArrowRight className="size-3" />
          <span className="rounded bg-muted px-1.5 py-0.5">simplehook</span>
          <ArrowRight className="size-3" />
          <span className="rounded bg-muted px-1.5 py-0.5">Stripe</span>
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
          Your app's <strong>real response</strong> is sent back to the caller.
          Use for Twilio (TwiML), Shopify (verification), or any provider that reads your response.
          Returns <strong>502</strong> if your app is offline.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4">
      <div className="mb-2.5 text-xs font-medium text-foreground">
        Queue mode
      </div>
      <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5">Stripe</span>
        <ArrowRight className="size-3" />
        <span className="rounded bg-muted px-1.5 py-0.5">simplehook</span>
        <ArrowRight className="size-3" />
        <span className="rounded bg-status-green-bg px-1.5 py-0.5 text-status-green-text">
          200 OK
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <span className="invisible rounded bg-muted px-1.5 py-0.5">Stripe</span>
        <span className="invisible size-3" />
        <span className="rounded bg-muted px-1.5 py-0.5">simplehook</span>
        <ArrowRight className="size-3" />
        <span className="rounded bg-muted px-1.5 py-0.5">Your app</span>
        <span className="text-[10px] italic">(async)</span>
      </div>
      <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
        Returns <strong>200 immediately</strong> to the caller.
        Delivers to your app async with retry. If your app is offline, events queue and deliver when you reconnect.
        Use for Stripe, GitHub, or any fire-and-forget webhook.
      </p>
    </div>
  );
}

export function RoutesPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [pathPrefix, setPathPrefix] = useState("");
  const [mode, setMode] = useState<"passthrough" | "queue">("passthrough");
  const [creating, setCreating] = useState(false);

  const fetchRoutes = async () => {
    try {
      const data = await api.routes.list();
      setRoutes(data);
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
      toast.success("Route deleted");
      fetchRoutes();
    } catch {
      toast.error("Failed to delete route");
    } finally {
      setDeletingId(null);
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Path prefix</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes.map((route) => (
              <TableRow key={route.id}>
                <TableCell className="font-mono text-sm">
                  {route.path_prefix}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className="font-mono text-[10px] uppercase"
                  >
                    {route.mode}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {new Date(route.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleDelete(route.id)}
                    disabled={deletingId === route.id}
                    title="Delete route"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
