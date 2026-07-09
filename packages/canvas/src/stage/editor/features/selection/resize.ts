"use client";

/**
 * Resize gesture: dragging one of the 8 handles on a selected object, with
 * handle-aware snap correction (only the edges the handle actually moves are
 * corrected/guided) and min-size clamping. Also owns the pure handle math
 * (applyResizeHandle) and the handle→CSS-cursor mapping consumed by
 * CanvasStage via the interaction barrel.
 */
import type { CanvasAction } from "../../../../state/actions";
import type { CanvasPoint } from "../../../../state/geometry";
import { computeSnapGuides, type SnapGuide } from "../snapping/snapping";
import { gatherSnapCandidates } from "../../../../interaction/hit-testing";
import { connectionBoundsForObject } from "../../../../objects/geometry";
import type { CanvasGeometry, InteractiveCanvasDocument } from "../../../../state/schema";
import {
  SNAP_THRESHOLD_SCREEN_PX,
  type CanvasPointerEvent,
  type ResizeHandle,
} from "../../../../interaction/types";
import type { ViewportState } from "../../../viewport";

export type ResizeGesture = {
  kind: "resize";
  startWorld: CanvasPoint;
  objectId: string;
  handle: ResizeHandle;
  startGeometry: CanvasGeometry;
  hasEmitted: boolean;
};

type ResizeContext = {
  document: InteractiveCanvasDocument;
  viewport: ViewportState;
};

type ResizeResult = {
  state: ResizeGesture | { kind: "idle" };
  dispatch: CanvasAction[];
  overlay: { guides?: SnapGuide[] };
};

/** Minimum object size enforced by direct (handle) resize. */
export const MIN_DIRECT_RESIZE_SIZE = 48;

/**
 * Applies a resize handle drag to a start geometry, anchoring the opposite edge/
 * corner and clamping both dimensions to `minSize`.
 */
export function applyResizeHandle(
  startGeometry: CanvasGeometry,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  minSize: number = MIN_DIRECT_RESIZE_SIZE,
): CanvasGeometry {
  const left = startGeometry.x;
  const top = startGeometry.y;
  const right = startGeometry.x + startGeometry.width;
  const bottom = startGeometry.y + startGeometry.height;

  let newLeft = left;
  let newTop = top;
  let newRight = right;
  let newBottom = bottom;

  const affectsWest = handle === "w" || handle === "nw" || handle === "sw";
  const affectsEast = handle === "e" || handle === "ne" || handle === "se";
  const affectsNorth = handle === "n" || handle === "nw" || handle === "ne";
  const affectsSouth = handle === "s" || handle === "sw" || handle === "se";

  if (affectsWest) newLeft = left + dx;
  if (affectsEast) newRight = right + dx;
  if (affectsNorth) newTop = top + dy;
  if (affectsSouth) newBottom = bottom + dy;

  // Clamp so the moving edge cannot cross the anchored opposite edge/corner
  // beyond minSize.
  if (affectsWest && newRight - newLeft < minSize) newLeft = newRight - minSize;
  if (affectsEast && newRight - newLeft < minSize) newRight = newLeft + minSize;
  if (affectsNorth && newBottom - newTop < minSize) newTop = newBottom - minSize;
  if (affectsSouth && newBottom - newTop < minSize) newBottom = newTop + minSize;

  return {
    x: newLeft,
    y: newTop,
    width: newRight - newLeft,
    height: newBottom - newTop,
  };
}

export function resizeCursorFor(handle: ResizeHandle): string {
  switch (handle) {
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "nw":
    case "se":
    default:
      return "nwse-resize";
  }
}

export function stepFromResize(
  state: ResizeGesture,
  event: CanvasPointerEvent,
  ctx: ResizeContext,
): ResizeResult {
  if (event.type === "cancel") {
    return {
      state: { kind: "idle" },
      dispatch: [
        {
          type: "canvas.updateObjectGeometries",
          geometries: { [state.objectId]: state.startGeometry },
          recordHistory: false,
          snap: false,
          summary: "Cancelled resize",
        },
      ],
      overlay: {},
    };
  }

  if (event.type === "up") {
    return {
      state: { kind: "idle" },
      dispatch: [{ type: "canvas.reconcileSectionMembership", recordHistory: false }],
      overlay: {},
    };
  }

  if (event.type !== "move") return { state, dispatch: [], overlay: {} };

  const dx = event.world.x - state.startWorld.x;
  const dy = event.world.y - state.startWorld.y;
  const rawGeometry = applyResizeHandle(state.startGeometry, state.handle, dx, dy);
  const target = ctx.document.objects.find((object) => object.id === state.objectId);
  const snapBounds = target
    ? connectionBoundsForObject({ ...target, geometry: rawGeometry })
    : rawGeometry;

  // Live snap guides for resize: snap only the edges the handle actually
  // moves (the anchored opposite edge/corner must not move — applyResizeHandle
  // already clamps it, so we correct just the moving edge(s) toward alignment).
  const candidates = gatherSnapCandidates(ctx.document, [state.objectId]);
  const threshold = SNAP_THRESHOLD_SCREEN_PX / ctx.viewport.zoom;
  const snap = computeSnapGuides(snapBounds, candidates, threshold);

  const affectsWest = state.handle === "w" || state.handle === "nw" || state.handle === "sw";
  const affectsEast = state.handle === "e" || state.handle === "ne" || state.handle === "se";
  const affectsNorth = state.handle === "n" || state.handle === "nw" || state.handle === "ne";
  const affectsSouth = state.handle === "s" || state.handle === "sw" || state.handle === "se";

  let geometry = rawGeometry;
  if (snap.dx !== 0 && (affectsWest || affectsEast)) {
    geometry = affectsWest
      ? { ...geometry, x: geometry.x + snap.dx, width: geometry.width - snap.dx }
      : { ...geometry, width: geometry.width + snap.dx };
  }
  if (snap.dy !== 0 && (affectsNorth || affectsSouth)) {
    geometry = affectsNorth
      ? { ...geometry, y: geometry.y + snap.dy, height: geometry.height - snap.dy }
      : { ...geometry, height: geometry.height + snap.dy };
  }
  geometry = {
    ...geometry,
    width: Math.max(MIN_DIRECT_RESIZE_SIZE, geometry.width),
    height: Math.max(MIN_DIRECT_RESIZE_SIZE, geometry.height),
  };

  const guides = snap.guides.filter((guide) => {
    if (guide.axis === "x") return affectsWest || affectsEast;
    return affectsNorth || affectsSouth;
  });

  const nextState: ResizeGesture = { ...state, hasEmitted: true };
  return {
    state: nextState,
    dispatch: [
      {
        type: "canvas.updateObjectGeometries",
        geometries: { [state.objectId]: geometry },
        recordHistory: !state.hasEmitted,
        snap: false,
        summary: "Resized object",
      },
    ],
    overlay: { guides },
  };
}
