import { cn } from "@/lib/utils.js";

interface CodeBlockProps {
  children: string;
  className?: string;
  title?: string;
}

export function CodeBlock({ children, className, title = "Terminal" }: CodeBlockProps) {
  return (
    <div className={cn("overflow-hidden rounded-xl shadow-lg", className)}>
      {/* Title bar with traffic lights */}
      <div className="flex items-center border-b border-white/[0.06] bg-[#2d2640] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
          <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
          <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
        </div>
        <span className="mx-auto font-mono text-[12px] text-[#9a91b0]">
          {title}
        </span>
        <div className="w-[52px]" />
      </div>
      {/* Code area */}
      <pre className="overflow-x-auto bg-[#1e1834] px-6 py-5 font-mono text-[13px] leading-[1.9] text-[#e0dce8]">
        <code>{children}</code>
      </pre>
    </div>
  );
}

interface TerminalPaneProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
}

export function TerminalPane({ children, className, title, subtitle }: TerminalPaneProps) {
  return (
    <div className={cn("overflow-hidden", className)}>
      {(title || subtitle) && (
        <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#2d2640] px-4 py-2.5">
          {title && (
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#9a91b0]">
              {title}
            </span>
          )}
          {subtitle && (
            <span className="font-mono text-[11px] text-[#7a7190]">
              {subtitle}
            </span>
          )}
        </div>
      )}
      <pre className="overflow-x-auto bg-[#1e1834] px-5 py-5 font-mono text-[12.5px] leading-[1.8] text-[#e0dce8]">
        <code>{children}</code>
      </pre>
    </div>
  );
}

interface SplitTerminalProps {
  left: React.ReactNode;
  right: React.ReactNode;
  leftTitle?: string;
  leftSubtitle?: string;
  rightTitle?: string;
  rightSubtitle?: string;
  className?: string;
}

export function SplitTerminal({
  left, right,
  leftTitle, leftSubtitle,
  rightTitle, rightSubtitle,
  className,
}: SplitTerminalProps) {
  return (
    <div className={cn("overflow-hidden rounded-xl shadow-lg", className)}>
      {/* Title bar */}
      <div className="flex items-center border-b border-white/[0.06] bg-[#2d2640] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
          <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
          <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
        </div>
        <span className="mx-auto font-mono text-[12px] text-[#9a91b0]">
          Terminal
        </span>
        <div className="w-[52px]" />
      </div>
      {/* Split panes */}
      <div className="grid md:grid-cols-2">
        <TerminalPane title={leftTitle} subtitle={leftSubtitle}>
          {left}
        </TerminalPane>
        <div className="border-t border-white/[0.06] md:border-l md:border-t-0">
          <TerminalPane title={rightTitle} subtitle={rightSubtitle}>
            {right}
          </TerminalPane>
        </div>
      </div>
    </div>
  );
}
