import type { ReactNode } from "react";
import { AlertTriangleIcon } from "@codecaine-ai/canvas/ui/icons";

export type SaveIssueNoticeProps = { message: string; children: ReactNode };

/** Non-blocking amber notice pinned to the top of the editor's screen overlay. */
export function SaveIssueNotice({ message, children }: SaveIssueNoticeProps) {
  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 z-panel flex -translate-x-1/2 items-center gap-3 rounded border border-warning-line bg-warning-soft px-4 py-2 text-ui-lg text-warning shadow-glass">
      <AlertTriangleIcon className="h-4 w-4 shrink-0" />
      <span>{message}</span>
      {children}
    </div>
  );
}
