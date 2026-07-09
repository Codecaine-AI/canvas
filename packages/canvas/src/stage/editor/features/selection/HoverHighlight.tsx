"use client";

/**
 * Screen-space hover outline for connector-mode object targeting.
 */
import { connectionBoundsForObject } from "../../../../objects/geometry";
import type { InteractiveCanvasDocument } from "../../../../state/schema";
import { worldToScreen, type ViewportState } from "../../../viewport";

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
  if (!objectId) return null;
  const object = document.objects.find((item) => item.id === objectId);
  if (!object) return null;

  const bounds = connectionBoundsForObject(object);
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
        borderRadius: "10px",
        boxSizing: "border-box",
        opacity: 0.65,
        pointerEvents: "none",
      }}
    />
  );
}
