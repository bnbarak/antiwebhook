import { useState, useEffect } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { api, type Project, type BillingStatus } from "@/lib/api.js";
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
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      api.project.get(),
      api.billing.getStatus(),
    ])
      .then(([project, billing]) => {
        setProjectData(project);
        setBillingStatus(billing);
      })
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

        {/* API Key */}
        <Card>
          <CardHeader>
            <CardTitle>API Key</CardTitle>
            <CardDescription>
              Use this key in your SDK configuration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingProject ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={projectData?.api_key ?? ""}
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    copyToClipboard(projectData?.api_key ?? "", "API key")
                  }
                  title="Copy API key"
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            )}
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
            {loadingProject ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <BillingCard
                billingStatus={billingStatus}
                actionLoading={actionLoading}
                setActionLoading={setActionLoading}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatCountdown(hours: number): string {
  if (hours <= 0) return "0h 0m";
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${h}h ${m}m`;
}

function BillingCard({
  billingStatus,
  actionLoading,
  setActionLoading,
}: {
  billingStatus: BillingStatus | null;
  actionLoading: boolean;
  setActionLoading: (v: boolean) => void;
}) {
  const status = billingStatus?.billing_status ?? "trial";
  const isActive = status === "active";
  const isExpired =
    status === "expired" ||
    (billingStatus?.trial_hours_remaining !== null &&
      billingStatus?.trial_hours_remaining !== undefined &&
      billingStatus.trial_hours_remaining <= 0);

  const handleSubscribe = async () => {
    setActionLoading(true);
    try {
      const { url } = await api.billing.createCheckout();
      window.location.href = url;
    } catch {
      setActionLoading(false);
    }
  };

  const handleManage = async () => {
    setActionLoading(true);
    try {
      const { url } = await api.billing.getPortal();
      window.location.href = url;
    } catch {
      setActionLoading(false);
    }
  };

  if (isActive) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-status-green-border bg-status-green-bg px-2 py-0.5 text-xs font-medium text-status-green-text">
            <span className="inline-block size-1.5 rounded-full bg-status-green-dot" />
            Active
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleManage}
          disabled={actionLoading}
          className="w-fit"
        >
          <ExternalLink className="mr-2 size-3.5" />
          Manage subscription
        </Button>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-status-red-text">
          Trial ended — webhooks are paused.
        </p>
        <Button
          size="sm"
          onClick={handleSubscribe}
          disabled={actionLoading}
          className="w-fit"
        >
          Subscribe — $5/mo
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Trial: {formatCountdown(billingStatus?.trial_hours_remaining ?? 0)}{" "}
        remaining
      </p>
      <Button
        size="sm"
        onClick={handleSubscribe}
        disabled={actionLoading}
        className="w-fit"
      >
        Subscribe — $5/mo
      </Button>
    </div>
  );
}
