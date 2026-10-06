"use client";

import type { CSSProperties } from "react";
import { worldToScreen, type ViewportState } from "@codecaine-ai/canvas";
import type { AgentRect } from "@codecaine-ai/canvas-agent/protocol";
import { SCRIM_COLOR } from "./constants";

export type GhostPreviewScrimProps = {
  previewRect: AgentRect | null;
  viewport: ViewportState;
};

/** Mount in InteractiveCanvasEditor's `screenOverlay`. */
export function GhostPreviewScrim({ previewRect, viewport }: GhostPreviewScrimProps) {
  if (!previewRect) return null;

  const topLeft = worldToScreen(viewport, { x: previewRect.x, y: previewRect.y });
  const bottomRight = worldToScreen(viewport, {
    x: previewRect.x + previewRect.width,
    y: previewRect.y + previewRect.height,
  });
  const middleHeight = Math.max(0, bottomRight.y - topLeft.y);

  const panel: CSSProperties = {
    position: "absolute",
    background: SCRIM_COLOR,
    pointerEvents: "none",
  };

  return (
    <div
      data-agent-preview-scrim="true"
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}
    >
      <div style={{ ...panel, left: 0, right: 0, top: 0, height: Math.max(0, topLeft.y) }} />
      <div style={{ ...panel, left: 0, right: 0, top: Math.max(0, bottomRight.y), bottom: 0 }} />
      <div
        style={{
          ...panel,
          left: 0,
          top: topLeft.y,
          width: Math.max(0, topLeft.x),
          height: middleHeight,
        }}
      />
      <div
        style={{
          ...panel,
          left: Math.max(0, bottomRight.x),
          right: 0,
          top: topLeft.y,
          height: middleHeight,
        }}
      />
    </div>
  );
}
