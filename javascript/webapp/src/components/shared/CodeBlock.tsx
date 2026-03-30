import { cn } from "@/lib/utils.js";

interface CodeBlockProps {
  children: string;
  className?: string;
  label?: string;
  filename?: string;
}

export function CodeBlock({ children, className, label, filename }: CodeBlockProps) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border-strong", className)}>
      {(label || filename) && (
        <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2.5">
          {label && (
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-text-tertiary">
              {label}
            </span>
          )}
          {filename && (
            <span className="font-mono text-[11px] text-text-tertiary">
              {filename}
            </span>
          )}
        </div>
      )}
      <pre className="overflow-x-auto bg-[#1a1916] px-5 py-4 font-mono text-[12.5px] leading-[1.8] text-[#d4d0c8]">
        <code>{children}</code>
      </pre>
    </div>
  );
}
