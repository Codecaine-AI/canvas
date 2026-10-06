import type { ReactNode } from "react";

/**
 * Panel wrapper for the viewer pages. Inside studio this carried the
 * `.agent-surface` token scope; now the whole app is the agent surface (the
 * design-system tokens and host contract load at the document root, from
 * main.tsx), so this is purely the shared framed-panel layout the pages
 * compose into.
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
      className={`overflow-hidden rounded border border-border bg-background ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
