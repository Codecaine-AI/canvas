"use client";

import { Button } from "@codecaine-ai/canvas/ui/button";

export interface CameraLockPillProps {
  onStop: () => void;
}

/** Mount in the editor's screen overlay while `cameraOnly` is enabled. */
export function CameraLockPill({ onStop }: CameraLockPillProps) {
  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border/70 bg-background/95 px-3 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur">
      <span className="h-2 w-2 shrink-0 rounded-full bg-violet-600" aria-hidden="true" />
      <span>Agent is arranging — board is view-only</span>
      <Button type="button" size="xs" variant="outline" onClick={onStop}>
        Stop
      </Button>
    </div>
  );
}
