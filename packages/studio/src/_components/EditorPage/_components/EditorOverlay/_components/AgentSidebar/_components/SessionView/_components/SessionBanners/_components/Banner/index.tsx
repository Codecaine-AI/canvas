import type { ReactNode } from "react";

export type BannerProps = { children: ReactNode };

export function Banner({ children }: BannerProps) {
  return (
    <div className="rounded border border-border/70 bg-muted/50 p-3 text-ui-xs leading-ui">
      {children}
    </div>
  );
}
