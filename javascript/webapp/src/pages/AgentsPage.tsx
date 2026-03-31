import { useState, useEffect, useCallback } from "react";
import { Copy, Plus, Trash2, Radio } from "lucide-react";
import { api, type Listener, type Project } from "@/lib/api.js";
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
  const [listeners, setListeners] = useState<Listener[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [ls, proj] = await Promise.all([
        api.listeners.list(),
        api.project.get(),
      ]);
      setListeners(ls);
      setProject(proj);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const webhookUrl = (listenerId: string) =>
    `${project?.webhook_base_url}/${listenerId}/`;

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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const validIdPattern = /^[a-z0-9_-]{1,12}$/;
  const isIdValid = validIdPattern.test(newId.trim());

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium">Agents</h1>
          <p className="text-sm text-muted-foreground">
            Each agent is an SDK instance that receives webhooks with its own
            unique URL.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
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
              {project && newId && isIdValid && (
                <div className="rounded-md border bg-muted/50 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Webhook URL</p>
                  <p className="mt-0.5 break-all font-mono text-xs">
                    {webhookUrl(newId.trim())}
                  </p>
                </div>
              )}
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
      </div>

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
              Create an agent to give each SDK instance its own webhook URL.
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
              {listeners.length} agent{listeners.length !== 1 ? "s" : ""}
            </CardTitle>
            <CardDescription>
              Each agent gets a unique webhook URL. Use the agent ID in your SDK:{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                listenToWebhooks(app, "ak_...", "agent-id")
              </code>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">ID</TableHead>
                  <TableHead className="w-[160px]">Label</TableHead>
                  <TableHead>Webhook URL</TableHead>
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
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          {webhookUrl(l.listener_id)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 shrink-0"
                          onClick={() =>
                            copyToClipboard(
                              webhookUrl(l.listener_id),
                              "Webhook URL",
                            )
                          }
                        >
                          <Copy className="size-3" />
                        </Button>
                      </div>
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
        Free plan: up to 3 agents. Paid plan: up to 6 agents.
      </p>
    </div>
  );
}
