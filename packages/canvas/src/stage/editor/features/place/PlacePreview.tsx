"use client";

import type { CanvasBounds } from "../../../../state/geometry";
import { worldToScreen, type ViewportState } from "../../../viewport";

/** Ghost preview outline for an in-progress armed-tool placement (4.2.2). */
export function PlacePreview({ viewport, bounds }: { viewport: ViewportState; bounds: CanvasBounds }) {
  const topLeft = worldToScreen(viewport, { x: bounds.x, y: bounds.y });
  const bottomRight = worldToScreen(viewport, {
    x: bounds.x + bounds.width,
    y: bounds.y + bounds.height,
  });
  return (
    <div
      data-canvas-place-preview="true"
      style={{
        position: "absolute",
        left: `${topLeft.x}px`,
        top: `${topLeft.y}px`,
        width: `${bottomRight.x - topLeft.x}px`,
        height: `${bottomRight.y - topLeft.y}px`,
        border: "1.5px dashed var(--primary)",
        borderRadius: "8px",
        background: "color-mix(in oklab, var(--primary) 8%, transparent)",
        pointerEvents: "none",
      }}
    />
  );
}
