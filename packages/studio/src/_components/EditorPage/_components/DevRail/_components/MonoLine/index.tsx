import type { ReactNode } from "react";

export type MonoLineProps = { children: ReactNode };

export function MonoLine({ children }: MonoLineProps) {
  return <p className="break-all font-mono text-ui-2xs leading-ui">{children}</p>;
}
