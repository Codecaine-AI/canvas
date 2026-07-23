import type { ReactNode } from "react";

/**
 * Panel wrapper for the viewer pages. Inside studio this carried the
 * `.agent-surface` token scope; now the whole app is the agent surface
 * (agent-theme.css applies the dark instrument tokens at :root), so this is
 * purely the shared framed-panel layout the pages compose into.
 */
export function AgentSurface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-border bg-background ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
