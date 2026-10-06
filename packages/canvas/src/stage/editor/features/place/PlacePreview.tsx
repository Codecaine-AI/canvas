"use client";

import type { CanvasBounds } from "../../../../state/geometry";
import { worldToScreen, type ViewportState } from "../../../viewport";
import { stageMarkColors } from "../../../../theme/canvas-style";
import { useCanvasStyle } from "../../../../theme/canvas-style-context";

/** Ghost preview outline for an in-progress armed-tool placement (4.2.2): a stage mark in the board's ink (decision 56). */
export function PlacePreview({ viewport, bounds }: { viewport: ViewportState; bounds: CanvasBounds }) {
  const canvasStyle = useCanvasStyle();
  const { ink } = stageMarkColors(canvasStyle);
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
        border: `1.5px dashed ${ink}`,
        // The placed shape's corner radius, at screen scale.
        borderRadius: `${canvasStyle.shapeCornerRadiusPx * viewport.zoom}px`,
        background: `color-mix(in oklab, ${ink} 8%, transparent)`,
        pointerEvents: "none",
      }}
    />
  );
}
