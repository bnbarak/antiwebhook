/**
 * Shared flow diagram building blocks used across the app
 * (RoutesPage mode explainers, DocsPage how-it-works, etc.)
 */

import { cn } from "@/lib/utils.js";

export function FlowNode({
  children,
  highlight,
  className,
}: {
  children: React.ReactNode;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-2.5 py-1.5 font-mono text-[11px]",
        highlight
          ? "border border-status-green-dot/30 bg-status-green-bg text-status-green-text"
          : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function FlowArrow({
  label,
  reverse,
  highlight,
}: {
  label?: string;
  reverse?: boolean;
  highlight?: boolean;
}) {
  const color = highlight ? "text-status-green-text" : "text-muted-foreground/50";
  const border = highlight
    ? "border-status-green-text/40"
    : "border-muted-foreground/30";

  return (
    <div className={cn("flex flex-1 items-center gap-1.5", color)}>
      {reverse && <span className="text-[10px]">{"<"}</span>}
      <span className={cn("flex-1 border-t border-dashed", border)} />
      {label && <span className="shrink-0 text-[9px]">{label}</span>}
      <span className={cn("flex-1 border-t border-dashed", border)} />
      {!reverse && <span className="text-[10px]">{">"}</span>}
    </div>
  );
}

export function FlowRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full items-center gap-2", className)}>
      {children}
    </div>
  );
}
