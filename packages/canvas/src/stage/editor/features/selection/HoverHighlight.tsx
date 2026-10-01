"use client";

/**
 * Screen-space hover outline for connector-mode object targeting.
 */
import { hitBoundsForObject } from "../../../../objects/geometry";
import type { InteractiveCanvasDocument } from "../../../../state/schema";
import { worldToScreen, type ViewportState } from "../../../viewport";
import { useCanvasStyle } from "../../../../theme/canvas-style-context";
import { resolveShapeCornerRadius } from "../../../../theme/tokens";

const SELECTION_BLUE = "#0D99FF";
const HIGHLIGHT_OUTSET_PX = 3;

export function HoverHighlight({
  document,
  viewport,
  objectId,
}: {
  document: InteractiveCanvasDocument;
  viewport: ViewportState;
  objectId: string | null;
}) {
  const canvasStyle = useCanvasStyle();
  if (!objectId) return null;
  const object = document.objects.find((item) => item.id === objectId);
  if (!object) return null;

  const bounds = hitBoundsForObject(object, canvasStyle);
  const topLeft = worldToScreen(viewport, { x: bounds.x, y: bounds.y });
  const bottomRight = worldToScreen(viewport, {
    x: bounds.x + bounds.width,
    y: bounds.y + bounds.height,
  });

  return (
    <div
      data-canvas-hover-highlight="true"
      data-canvas-object-id={object.id}
      style={{
        position: "absolute",
        left: `${topLeft.x - HIGHLIGHT_OUTSET_PX}px`,
        top: `${topLeft.y - HIGHLIGHT_OUTSET_PX}px`,
        width: `${bottomRight.x - topLeft.x + HIGHLIGHT_OUTSET_PX * 2}px`,
        height: `${bottomRight.y - topLeft.y + HIGHLIGHT_OUTSET_PX * 2}px`,
        border: `1.5px solid ${SELECTION_BLUE}`,
        // Concentric with the shape's (screen-scaled) corner, pushed out by the outset.
        borderRadius: `${resolveShapeCornerRadius(object.style?.shape, canvasStyle) * viewport.zoom + HIGHLIGHT_OUTSET_PX}px`,
        boxSizing: "border-box",
        opacity: 0.65,
        pointerEvents: "none",
      }}
    />
  );
}
