"use client";

import {
  RESIZE_HANDLES,
  resizeCursorFor,
  type ResizeHandle,
} from "../../interaction/interaction";
import { worldToScreen, type ViewportState } from "../viewport";
import type { InteractiveCanvasDocument } from "../../state/schema";

const HANDLE_SIZE = 12;
const SELECTION_BLUE = "#0D99FF";

/** Corner handles are the two-letter compass directions (nw/ne/se/sw). */
const CORNER_HANDLES = RESIZE_HANDLES.filter((handle) => handle.length === 2);

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
  // FigJam-style chrome: every object gets corner-only handles (no edge
  // midpoints). Handle hit-testing reads the rendered DOM attributes, so
  // corners-only rendering is corners-only resizing — applyResizeHandle still
  // understands edge handles, it just never receives one.
  const handles = CORNER_HANDLES;

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
        border: `2px solid ${SELECTION_BLUE}`,
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
