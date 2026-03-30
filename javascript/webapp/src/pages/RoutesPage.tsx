import { useState, useEffect } from "react";
import { Plus, Trash2, GitBranch } from "lucide-react";
import { api, type Route } from "@/lib/api.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
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

export function RoutesPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [pathPrefix, setPathPrefix] = useState("");
  const [mode, setMode] = useState<"queue" | "passthrough">("queue");
  const [targetUrl, setTargetUrl] = useState("");
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
      await api.routes.create({
        path_prefix: pathPrefix,
        mode,
        target_url: targetUrl || undefined,
      });
      toast.success("Route created");
      setDialogOpen(false);
      setPathPrefix("");
      setMode("queue");
      setTargetUrl("");
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
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-medium">Routes</h1>
          <p className="text-sm text-muted-foreground">
            Configure how different webhook paths are handled.
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
                Configure a path prefix and delivery mode for incoming webhooks.
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
                <Select value={mode} onValueChange={(v) => setMode(v as "queue" | "passthrough")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="queue">Queue — instant 200, retry delivery</SelectItem>
                    <SelectItem value="passthrough">Passthrough — forward real response</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="target-url">Target URL (optional)</Label>
                <Input
                  id="target-url"
                  placeholder="http://localhost:3000/webhooks"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Override the default target for this route.
                </p>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={!pathPrefix.trim() || creating}>
                  {creating ? "Creating..." : "Create route"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Routes table */}
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
            Add a route to control how webhook paths are handled.
          </p>
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)} className="gap-1.5">
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
              <TableHead>Target URL</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes.map((route) => (
              <TableRow key={route.id}>
                <TableCell className="font-mono text-sm">{route.path_prefix}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                    {route.mode}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[200px] truncate font-mono text-xs text-muted-foreground">
                  {route.target_url ?? "default"}
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
