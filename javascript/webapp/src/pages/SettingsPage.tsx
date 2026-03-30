import { useState, useEffect } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { api, type Project } from "@/lib/api.js";
import { useAuth } from "@/hooks/use-auth.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.js";
import { Separator } from "@/components/ui/separator.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import { toast } from "sonner";

export function SettingsPage() {
  const { session } = useAuth();
  const [projectData, setProjectData] = useState<Project | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);

  useEffect(() => {
    api.project
      .get()
      .then(setProjectData)
      .catch(() => {})
      .finally(() => setLoadingProject(false));
  }, []);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const webhookUrl = projectData?.webhook_base_url ?? "";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-medium">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Project configuration and billing.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {/* Account */}
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Your account details.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Name:</span>
                <span className="font-medium">
                  {session?.user?.name ?? "..."}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Email:</span>
                <span className="font-medium">
                  {session?.user?.email ?? "..."}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Webhook URL */}
        <Card>
          <CardHeader>
            <CardTitle>Webhook URL</CardTitle>
            <CardDescription>
              Point your webhook providers to this base URL.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingProject ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={webhookUrl}
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(webhookUrl, "Webhook URL")}
                    title="Copy webhook URL"
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Append your route path (e.g.,{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                    /stripe/events
                  </code>
                  ) to this base URL.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Connection Status */}
        <Card>
          <CardHeader>
            <CardTitle>Connection Status</CardTitle>
            <CardDescription>
              Current WebSocket connection state for real-time event delivery.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-block size-2.5 rounded-full bg-status-green-dot" />
                <span className="text-sm font-medium text-status-green-text">
                  Connected
                </span>
              </div>
              <Separator orientation="vertical" className="h-4" />
              <span className="font-mono text-xs text-muted-foreground">
                Project: {projectData?.name ?? "Loading..."}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Billing */}
        <Card>
          <CardHeader>
            <CardTitle>Billing</CardTitle>
            <CardDescription>
              Manage your subscription and payment details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Free during beta. Paid plans coming soon.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
