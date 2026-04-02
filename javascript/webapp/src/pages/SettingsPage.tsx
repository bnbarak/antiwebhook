import { useState, useEffect } from "react";
import { Copy, Eye, EyeOff, ExternalLink, ArrowUp, ArrowDown } from "lucide-react";
import { api, type Project, type BillingStatus } from "@/lib/api.js";
import { useAuth } from "@/hooks/use-auth.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { Separator } from "@/components/ui/separator.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import { toast } from "sonner";

export function SettingsPage() {
  const { session } = useAuth();
  const [projectData, setProjectData] = useState<Project | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

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

        {/* Project — Webhook URL, API Key, Status combined */}
        <Card>
          <CardHeader>
            <CardTitle>Project</CardTitle>
            <CardDescription>Your webhook URL, API key, and connection status.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingProject ? (
              <div className="flex flex-col gap-4">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {/* Webhook URL */}
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Webhook URL</p>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={webhookUrl} className="font-mono text-sm" />
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(webhookUrl, "Webhook URL")} title="Copy">
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Append your route path (e.g., <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">/stripe/events</code>)
                  </p>
                </div>

                {/* API Key */}
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">API Key</p>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={showApiKey ? (projectData?.api_key ?? "") : (projectData?.api_key ? projectData.api_key.slice(0, 3) + "\u2022".repeat(20) : "")}
                      className="font-mono text-sm"
                    />
                    <Button variant="outline" size="icon" onClick={() => setShowApiKey(!showApiKey)} title={showApiKey ? "Hide" : "Show"}>
                      {showApiKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(projectData?.api_key ?? "", "API key")} title="Copy">
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Connection Status */}
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Connection</p>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-block size-2.5 rounded-full bg-status-green-dot" />
                      <span className="text-sm font-medium text-status-green-text">Connected</span>
                    </div>
                    <Separator orientation="vertical" className="h-4" />
                    <span className="font-mono text-xs text-muted-foreground">
                      {projectData?.name ?? "Loading..."}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Billing — moved to last */}
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
                  <Copy className="size-3.5" />
                </Button>
              </div>
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
  const [downgradeOpen, setDowngradeOpen] = useState(false);

  const status = billingStatus?.billing_status ?? "trial";
  const isActive = status === "active";
  const isExpired =
    status === "expired" ||
    (billingStatus?.trial_hours_remaining !== null &&
      billingStatus?.trial_hours_remaining !== undefined &&
      billingStatus.trial_hours_remaining <= 0);
  const agentLimit = billingStatus?.agent_limit ?? 3;
  const isUpgraded = agentLimit > 3;

  const handleSubscribe = async () => {
    setActionLoading(true);
    try {
      const { url } = await api.billing.createCheckout();
      window.location.href = url;
    } catch {
      setActionLoading(false);
    }
  };

  const handleUpgrade = async () => {
    setActionLoading(true);
    try {
      await api.billing.upgrade();
      toast.success("Upgraded to 6-agent plan");
      window.location.reload();
    } catch {
      toast.error("Failed to upgrade");
      setActionLoading(false);
    }
  };

  const handleDowngrade = async () => {
    setActionLoading(true);
    setDowngradeOpen(false);
    try {
      await api.billing.downgrade();
      toast.success("Downgraded to 3-agent plan. Excess agents removed.");
      window.location.reload();
    } catch {
      toast.error("Failed to downgrade");
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

  // Trial or expired — show subscribe
  if (!isActive) {
    return (
      <div className="flex flex-col gap-4">
        {isExpired ? (
          <p className="text-sm font-medium text-status-red-text">
            Trial ended — webhooks are paused.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Trial: {formatCountdown(billingStatus?.trial_hours_remaining ?? 0)}{" "}
            remaining
          </p>
        )}
        <div className="flex gap-3">
          <PlanCard
            name="Starter"
            price="$5"
            agents={3}
            active={false}
            onSelect={handleSubscribe}
            loading={actionLoading}
          />
          <PlanCard
            name="Pro"
            price="$8"
            agents={6}
            active={false}
            disabled
            hint="Subscribe to Starter first"
          />
        </div>
      </div>
    );
  }

  // Active subscriber — show plan options
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-status-green-border bg-status-green-bg px-2 py-0.5 text-xs font-medium text-status-green-text">
          <span className="inline-block size-1.5 rounded-full bg-status-green-dot" />
          Active
        </span>
        <span className="text-xs text-muted-foreground">
          {agentLimit} agents
        </span>
      </div>

      <div className="flex gap-3">
        <PlanCard
          name="Starter"
          price="$5"
          agents={3}
          active={!isUpgraded}
          onSelect={isUpgraded ? () => setDowngradeOpen(true) : undefined}
          loading={actionLoading}
          actionLabel={isUpgraded ? "Downgrade" : undefined}
        />
        <PlanCard
          name="Pro"
          price="$8"
          agents={6}
          active={isUpgraded}
          onSelect={!isUpgraded ? handleUpgrade : undefined}
          loading={actionLoading}
          actionLabel={!isUpgraded ? "Upgrade" : undefined}
        />
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={handleManage}
        disabled={actionLoading}
        className="w-fit"
      >
        <ExternalLink className="mr-2 size-3.5" />
        Manage payment method
      </Button>

      {/* Downgrade confirmation */}
      <Dialog open={downgradeOpen} onOpenChange={setDowngradeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Downgrade to Starter?</DialogTitle>
            <DialogDescription>
              The Starter plan supports 3 agents. If you currently have more than 3,
              the extra agents will be permanently deleted. Events already routed to
              those agents won't be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDowngradeOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDowngrade}
              disabled={actionLoading}
            >
              <ArrowDown className="mr-1.5 size-3.5" />
              {actionLoading ? "Downgrading..." : "Downgrade & remove extra agents"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlanCard({
  name,
  price,
  agents,
  active,
  onSelect,
  loading,
  disabled,
  hint,
  actionLabel,
}: {
  name: string;
  price: string;
  agents: number;
  active: boolean;
  onSelect?: () => void;
  loading?: boolean;
  disabled?: boolean;
  hint?: string;
  actionLabel?: string;
}) {
  return (
    <div
      className={`flex flex-1 flex-col rounded-lg border px-4 py-4 transition-colors ${
        active
          ? "border-foreground/30 bg-card ring-1 ring-foreground/10"
          : "border-border"
      }`}
    >
      <div className="mb-1 text-sm font-medium">{name}</div>
      <div className="mb-0.5 text-xl font-semibold">
        {price}<span className="text-sm font-normal text-muted-foreground">/mo</span>
      </div>
      <div className="mb-3 text-xs text-muted-foreground">{agents} agents</div>
      {active ? (
        <span className="text-xs font-medium text-status-green-text">Current plan</span>
      ) : hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : onSelect ? (
        <Button size="sm" variant="outline" onClick={onSelect} disabled={loading || disabled}>
          {actionLabel ?? name}
        </Button>
      ) : null}
    </div>
  );
}
