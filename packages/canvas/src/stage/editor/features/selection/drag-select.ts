"use client";

/**
 * Drag-select gesture: rubber-band selection from an empty-canvas drag.
 * Additive (shift) drag-selects union with the existing selection; plain
 * drag-selects replace it (or clear it when nothing intersects).
 */
import type { CanvasAction, CanvasSelection } from "../../../../state/actions";
import { normalizeBounds, type CanvasBounds, type CanvasPoint } from "../../../../state/geometry";
import type { InteractiveCanvasDocument } from "../../../../state/schema";
import { objectsIntersectingBounds } from "../../../../interaction/hit-testing";
import {
  selectedObjectIds,
  type CanvasPointerEvent,
} from "../../../../interaction/types";

export type DragSelectGesture = {
  kind: "drag-select";
  startWorld: CanvasPoint;
  currentWorld: CanvasPoint;
  additive: boolean;
};

type DragSelectContext = {
  document: InteractiveCanvasDocument;
  selection: CanvasSelection;
};

type DragSelectResult = {
  state: DragSelectGesture | { kind: "idle" };
  dispatch: CanvasAction[];
  overlay: { dragSelect?: CanvasBounds };
};

function dragSelectIdle(): DragSelectResult {
  return { state: { kind: "idle" }, dispatch: [], overlay: {} };
}

export function stepFromDragSelect(
  state: DragSelectGesture,
  event: CanvasPointerEvent,
  ctx: DragSelectContext,
  alreadyEntered = false,
): DragSelectResult {
  if (event.type === "cancel") {
    return dragSelectIdle();
  }

  if (event.type === "up") {
    const bounds = normalizeBounds({
      x1: state.startWorld.x,
      y1: state.startWorld.y,
      x2: state.currentWorld.x,
      y2: state.currentWorld.y,
    });
    const intersecting = objectsIntersectingBounds(ctx.document, bounds);
    if (intersecting.length === 0) {
      return {
        state: { kind: "idle" },
        dispatch: state.additive ? [] : [{ type: "canvas.select", selection: { kind: "none" } }],
        overlay: {},
      };
    }
    const nextIds = state.additive
      ? Array.from(new Set([...selectedObjectIds(ctx.selection), ...intersecting]))
      : intersecting;
    return {
      state: { kind: "idle" },
      dispatch: [{ type: "canvas.select", selection: { kind: "objects", objectIds: nextIds } }],
      overlay: {},
    };
  }

  if (event.type !== "move") {
    const bounds = normalizeBounds({
      x1: state.startWorld.x,
      y1: state.startWorld.y,
      x2: state.currentWorld.x,
      y2: state.currentWorld.y,
    });
    return { state, dispatch: [], overlay: { dragSelect: bounds } };
  }

  const nextState: DragSelectGesture = { ...state, currentWorld: event.world };
  const bounds = normalizeBounds({
    x1: nextState.startWorld.x,
    y1: nextState.startWorld.y,
    x2: nextState.currentWorld.x,
    y2: nextState.currentWorld.y,
  });
  return { state: nextState, dispatch: [], overlay: { dragSelect: bounds } };
}
