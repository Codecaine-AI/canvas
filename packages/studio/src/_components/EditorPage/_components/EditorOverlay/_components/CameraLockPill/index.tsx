"use client";

import { Button } from "@codecaine-ai/canvas/ui/button";

export type CameraLockPillProps = {
  onStop: () => void;
};

/** Mount in the editor's screen overlay while `cameraOnly` is enabled. */
export function CameraLockPill({ onStop }: CameraLockPillProps) {
  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 z-panel flex -translate-x-1/2 items-center gap-3 rounded-full border border-border/70 bg-background/95 px-3 py-2 text-ui-xs font-medium text-foreground shadow-glass backdrop-blur-glass">
      <span className="h-2 w-2 shrink-0 rounded-full bg-annotation" aria-hidden="true" />
      <span>Agent is arranging — board is view-only</span>
      <Button type="button" size="xs" variant="outline" onClick={onStop}>
        Stop
      </Button>
    </div>
  );
}
