import { useState, useEffect, useCallback } from "react";
import { Sparkles, AlertTriangle } from "lucide-react";
import { api, type BillingStatus } from "@/lib/api.js";
import { Button } from "@/components/ui/button.js";

function formatCountdown(hoursRemaining: number): string {
  if (hoursRemaining <= 0) return "0h 0m";
  const h = Math.floor(hoursRemaining);
  const m = Math.floor((hoursRemaining - h) * 60);
  return `${h}h ${m}m`;
}

export function TrialBanner() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  const fetchStatus = useCallback(() => {
    api.billing.getStatus().then(setStatus).catch(() => {});
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      const { url } = await api.billing.createCheckout();
      window.location.href = url;
    } catch {
      setSubscribing(false);
    }
  };

  if (!status || status.billing_status === "active") return null;

  const expired =
    status.billing_status === "expired" ||
    (status.trial_hours_remaining !== null && status.trial_hours_remaining <= 0);

  if (expired) {
    return (
      <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-status-red-border bg-status-red-bg px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-status-red-text">
          <AlertTriangle className="size-4 shrink-0" />
          Trial expired — webhooks paused
        </div>
        <Button
          size="sm"
          onClick={handleSubscribe}
          disabled={subscribing}
          className="shrink-0"
        >
          Subscribe now
        </Button>
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-status-green-border bg-status-green-bg px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm text-status-green-text">
        <Sparkles className="size-4 shrink-0" />
        <span>
          <strong>Free trial active</strong> — {formatCountdown(status.trial_hours_remaining ?? 0)} remaining.
          You're all set to receive webhooks!
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={handleSubscribe}
        disabled={subscribing}
        className="shrink-0"
      >
        Subscribe — $5/mo
      </Button>
    </div>
  );
}
