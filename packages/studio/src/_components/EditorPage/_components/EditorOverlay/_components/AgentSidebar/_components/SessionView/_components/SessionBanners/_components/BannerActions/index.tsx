import type { ReactNode } from "react";

export type BannerActionsProps = { children: ReactNode };

export function BannerActions({ children }: BannerActionsProps) {
  return <div className="mt-3 flex flex-wrap gap-2">{children}</div>;
}
