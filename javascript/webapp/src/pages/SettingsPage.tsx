import { useState, useEffect } from "react";
import { Copy, ExternalLink, CheckCircle } from "lucide-react";
import { api, type Project, type BillingInfo } from "@/lib/api.js";
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
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [loadingBilling, setLoadingBilling] = useState(true);

  useEffect(() => {
    api.project
      .get()
      .then(setProjectData)
      .catch(() => {})
      .finally(() => setLoadingProject(false));
    api.billing
      .get()
      .then(setBilling)
      .catch(() => {})
      .finally(() => setLoadingBilling(false));
  }, []);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const webhookUrl = projectData
    ? `https://hook.antiwebhooks.com/${projectData.id}`
    : "";

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
            {loadingBilling ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            ) : billing ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="size-4 text-status-green-text" />
                    <span className="text-sm font-medium">
                      {billing.plan} plan
                    </span>
                  </div>
                  <span className="rounded-full bg-status-green-bg px-2 py-0.5 text-xs font-medium text-status-green-text">
                    {billing.status}
                  </span>
                </div>

                {billing.current_period_end && (
                  <p className="text-xs text-muted-foreground">
                    Current period ends{" "}
                    {new Date(
                      billing.current_period_end,
                    ).toLocaleDateString()}
                  </p>
                )}

                <div className="flex gap-2">
                  {billing.portal_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        window.open(billing.portal_url!, "_blank")
                      }
                      className="gap-1.5"
                    >
                      <ExternalLink className="size-3" />
                      Manage billing
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  No active subscription. Start your free trial to unlock all
                  features.
                </p>
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      const { url } = await api.billing.createCheckout();
                      window.open(url, "_blank");
                    } catch {
                      toast.error("Failed to create checkout session");
                    }
                  }}
                  className="w-fit gap-1.5"
                >
                  <ExternalLink className="size-3" />
                  Start free trial
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
