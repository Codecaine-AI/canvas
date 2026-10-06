import type { ReactNode } from "react";

export type EmptyProps = { children: ReactNode };

export function Empty({ children }: EmptyProps) {
  return <p className="text-ui-xs text-muted-foreground">{children}</p>;
}
