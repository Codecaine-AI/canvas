"use client";

/**
 * Screen-space selection outline and resize-handle trim.
 */
import {
  RESIZE_HANDLES,
  type ResizeHandle,
} from "../../../../interaction/types";
import { worldToScreen, type ViewportState } from "../../../viewport";
import type { InteractiveCanvasDocument } from "../../../../state/schema";
import { objectDefForType } from "../../../../objects/object-def";
import { resizeCursorFor } from "./resize";

const HANDLE_SIZE = 12;
const SELECTION_BLUE = "#0D99FF";
const SELECTION_BORDER_WIDTH = 2;
/** Grab thickness of the invisible per-edge resize strips. */
const EDGE_HIT_THICKNESS = 8;

/** Corner handles are the two-letter compass directions (nw/ne/se/sw). */
const CORNER_HANDLES = RESIZE_HANDLES.filter((handle) => handle.length === 2);
/** Edge handles are the single-letter compass directions (n/e/s/w). */
const EDGE_HANDLES = RESIZE_HANDLES.filter((handle) => handle.length === 1);

/** Corner-handle position as fractional offsets (0/1) within the bounds. */
const CORNER_POSITIONS: Record<string, { fx: number; fy: number }> = {
  nw: { fx: 0, fy: 0 },
  ne: { fx: 1, fy: 0 },
  se: { fx: 1, fy: 1 },
  sw: { fx: 0, fy: 1 },
};

/**
 * Screen-space selection trim rendered in CanvasStage's overlay slot.
 *
 * Single selection: outline, visible corner squares at a fixed screen size
 * (independent of zoom), and invisible full-edge grab strips for single-axis
 * resize. Multi-selection: outline only — group scaling is deferred beyond M1.
 */
export function SelectionBox({
  document,
  viewport,
  selectedObjectIds,
  interactiveHandles = true,
}: {
  document: InteractiveCanvasDocument;
  viewport: ViewportState;
  selectedObjectIds: string[];
  interactiveHandles?: boolean;
}) {
  if (selectedObjectIds.length === 0) return null;
  const objects = document.objects.filter((object) => selectedObjectIds.includes(object.id));
  if (objects.length === 0) return null;

  const minX = Math.min(...objects.map((object) => object.geometry.x));
  const minY = Math.min(...objects.map((object) => object.geometry.y));
  const maxX = Math.max(...objects.map((object) => object.geometry.x + object.geometry.width));
  const maxY = Math.max(...objects.map((object) => object.geometry.y + object.geometry.height));

  const topLeft = worldToScreen(viewport, { x: minX, y: minY });
  const bottomRight = worldToScreen(viewport, { x: maxX, y: maxY });
  const screenBounds = {
    left: topLeft.x,
    top: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };

  const isSingle = objects.length === 1;
  const objectId = objects[0]!.id;
  // FigJam-style trim: visible squares at the corners only, plus invisible
  // full-length grab strips along each border edge for single-axis resizing.
  // Both carry data-canvas-handle, which is what hit-testing reads. Defs
  // registered with handles: "corners" (sections) opt out of the edge strips.
  const handleMode = isSingle ? objectDefForType(objects[0]!.type)?.handles : undefined;
  const withEdgeStrips = handleMode !== "corners";
  // Border centerline in padding-box coordinates (the container owns the
  // border): pulls trim back so it sits centered on the drawn outline.
  const centerline = (fraction: number, size: number) =>
    fraction * (size - SELECTION_BORDER_WIDTH) - SELECTION_BORDER_WIDTH / 2;
  const edgeStripRect = (handle: ResizeHandle) => {
    const along = { left: centerline(0, screenBounds.width), top: centerline(0, screenBounds.height) };
    const span = {
      width: screenBounds.width - SELECTION_BORDER_WIDTH,
      height: screenBounds.height - SELECTION_BORDER_WIDTH,
    };
    switch (handle) {
      case "n":
        return { left: along.left, top: centerline(0, screenBounds.height) - EDGE_HIT_THICKNESS / 2, width: span.width, height: EDGE_HIT_THICKNESS };
      case "s":
        return { left: along.left, top: centerline(1, screenBounds.height) - EDGE_HIT_THICKNESS / 2, width: span.width, height: EDGE_HIT_THICKNESS };
      case "w":
        return { left: centerline(0, screenBounds.width) - EDGE_HIT_THICKNESS / 2, top: along.top, width: EDGE_HIT_THICKNESS, height: span.height };
      default: // "e"
        return { left: centerline(1, screenBounds.width) - EDGE_HIT_THICKNESS / 2, top: along.top, width: EDGE_HIT_THICKNESS, height: span.height };
    }
  };

  return (
    <div
      className="interactive-canvas-selection-box"
      data-canvas-selection-box="true"
      style={{
        position: "absolute",
        left: `${screenBounds.left}px`,
        top: `${screenBounds.top}px`,
        width: `${screenBounds.width}px`,
        height: `${screenBounds.height}px`,
        border: `${SELECTION_BORDER_WIDTH}px solid ${SELECTION_BLUE}`,
        boxSizing: "border-box",
        pointerEvents: "none",
      }}
    >
      {isSingle &&
        withEdgeStrips &&
        EDGE_HANDLES.map((handle) => {
          const rect = edgeStripRect(handle);
          return (
            <div
              key={handle}
              data-canvas-handle={handle}
              data-canvas-object-id={objectId}
              style={{
                position: "absolute",
                left: `${rect.left}px`,
                top: `${rect.top}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`,
                cursor: resizeCursorFor(handle),
                pointerEvents: interactiveHandles ? "auto" : "none",
                touchAction: "none",
              }}
            />
          );
        })}
      {isSingle &&
        CORNER_HANDLES.map((handle) => {
          const { fx, fy } = CORNER_POSITIONS[handle]!;
          return (
            <div
              key={handle}
              data-canvas-handle={handle}
              data-canvas-object-id={objectId}
              style={{
                position: "absolute",
                // Centered on the border centerline — the outline runs into
                // each square's middle. Rendered after the edge strips so the
                // corners win the pointer where they overlap.
                left: `${centerline(fx, screenBounds.width)}px`,
                top: `${centerline(fy, screenBounds.height)}px`,
                width: `${HANDLE_SIZE}px`,
                height: `${HANDLE_SIZE}px`,
                transform: "translate(-50%, -50%)",
                background: "var(--background)",
                border: `2px solid ${SELECTION_BLUE}`,
                borderRadius: "4px",
                cursor: resizeCursorFor(handle),
                pointerEvents: interactiveHandles ? "auto" : "none",
                touchAction: "none",
              }}
            />
          );
        })}
    </div>
  );
}
