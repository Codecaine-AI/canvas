"use client";

/**
 * Screen-space rectangle for an active drag-select gesture: a stage mark in
 * the board's ink (decision 56), never the app theme's `--primary`.
 */
import type { CanvasBounds } from "../../../../state/geometry";
import { stageMarkColors } from "../../../../theme/canvas-style";
import { useCanvasStyle } from "../../../../theme/canvas-style-context";
import { worldToScreen, type ViewportState } from "../../../viewport";

export function DragSelectRect({ viewport, bounds }: { viewport: ViewportState; bounds: CanvasBounds }) {
  const { ink } = stageMarkColors(useCanvasStyle());
  const topLeft = worldToScreen(viewport, { x: bounds.x, y: bounds.y });
  const bottomRight = worldToScreen(viewport, {
    x: bounds.x + bounds.width,
    y: bounds.y + bounds.height,
  });
  return (
    <div
      data-canvas-drag-select="true"
      style={{
        position: "absolute",
        left: `${topLeft.x}px`,
        top: `${topLeft.y}px`,
        width: `${bottomRight.x - topLeft.x}px`,
        height: `${bottomRight.y - topLeft.y}px`,
        border: `1px solid ${ink}`,
        background: `color-mix(in oklab, ${ink} 12%, transparent)`,
        pointerEvents: "none",
      }}
    />
  );
}
