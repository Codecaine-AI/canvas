"use client";

import {
  RESIZE_HANDLES,
  resizeCursorFor,
  type ResizeHandle,
} from "../../interaction/interaction";
import { worldToScreen, type ViewportState } from "../../editor/viewport";
import type { InteractiveCanvasDocument } from "../../model/schema";

const HANDLE_SIZE = 10;

/** Handle position expressed as fractional offsets (0/0.5/1) within the bounds. */
const HANDLE_POSITIONS: Record<ResizeHandle, { fx: number; fy: number }> = {
  nw: { fx: 0, fy: 0 },
  n: { fx: 0.5, fy: 0 },
  ne: { fx: 1, fy: 0 },
  e: { fx: 1, fy: 0.5 },
  se: { fx: 1, fy: 1 },
  s: { fx: 0.5, fy: 1 },
  sw: { fx: 0, fy: 1 },
  w: { fx: 0, fy: 0.5 },
};

/**
 * Screen-space selection chrome rendered in CanvasStage's overlay slot.
 *
 * Single selection: outline + all 8 resize handles at a fixed screen size
 * (independent of zoom). Multi-selection: outline only — group scaling is
 * deferred beyond M1.
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
  // W2 — sections show corner handles only (no edge midpoints); resizing a
  // section never moves its captured members (that's a drag-gesture-only
  // behavior, handled entirely in interaction.ts and orthogonal to resize).
  const isSection = isSingle && objects[0]!.type === "section";
  const handles = isSection ? RESIZE_HANDLES.filter((handle) => handle.length === 2) : RESIZE_HANDLES;

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
        border: "1.5px solid var(--primary)",
        boxSizing: "border-box",
        pointerEvents: "none",
      }}
    >
      {isSingle &&
        handles.map((handle) => {
          const { fx, fy } = HANDLE_POSITIONS[handle];
          return (
            <div
              key={handle}
              data-canvas-handle={handle}
              data-canvas-object-id={objectId}
              style={{
                position: "absolute",
                left: `${fx * screenBounds.width}px`,
                top: `${fy * screenBounds.height}px`,
                width: `${HANDLE_SIZE}px`,
                height: `${HANDLE_SIZE}px`,
                transform: "translate(-50%, -50%)",
                background: "var(--background)",
                border: "1.5px solid var(--primary)",
                borderRadius: "2px",
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
