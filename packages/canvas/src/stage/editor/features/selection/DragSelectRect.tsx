"use client";

/**
 * Screen-space rectangle for an active drag-select gesture.
 */
import type { CanvasBounds } from "../../../../state/geometry";
import { worldToScreen, type ViewportState } from "../../../viewport";

export function DragSelectRect({ viewport, bounds }: { viewport: ViewportState; bounds: CanvasBounds }) {
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
        border: "1px solid var(--primary)",
        background: "color-mix(in oklab, var(--primary) 12%, transparent)",
        pointerEvents: "none",
      }}
    />
  );
}
