import { cn } from "@/lib/utils.js";

type WebhookStatus = "delivered" | "pending" | "failed" | "queued";

const STATUS_CONFIG: Record<
  WebhookStatus,
  { label: string; dot: string; bg: string; text: string; border: string }
> = {
  delivered: {
    label: "Delivered",
    dot: "bg-status-green-dot",
    bg: "bg-status-green-bg",
    text: "text-status-green-text",
    border: "border-status-green-border",
  },
  pending: {
    label: "Pending",
    dot: "bg-status-amber-dot",
    bg: "bg-status-amber-bg",
    text: "text-status-amber-text",
    border: "border-status-amber-border",
  },
  failed: {
    label: "Failed",
    dot: "bg-status-red-dot",
    bg: "bg-status-red-bg",
    text: "text-status-red-text",
    border: "border-status-red-border",
  },
  queued: {
    label: "Queued",
    dot: "bg-status-blue-dot",
    bg: "bg-status-blue-bg",
    text: "text-status-blue-text",
    border: "border-status-blue-border",
  },
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const config = STATUS_CONFIG[status as WebhookStatus] ?? {
    label: status,
    dot: "bg-status-gray-dot",
    bg: "bg-status-gray-bg",
    text: "text-status-gray-text",
    border: "border-status-gray-border",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        config.bg,
        config.text,
        config.border,
        className,
      )}
    >
      <span className={cn("inline-block size-1.5 rounded-full", config.dot)} />
      {config.label}
    </span>
  );
}
