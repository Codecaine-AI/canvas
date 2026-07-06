"use client";

/**
 * Place gesture: armed-tool object creation (4.2.2). Owns the tool→object-type
 * mapping, the default-size placement geometry shared with double-click
 * creation (4.2.1), and the ghost-preview sizing for click-vs-drag placement.
 */
import { defaultGeometryFor, type CanvasTool } from "../../state/actions";
import { normalizeBounds, type CanvasPoint } from "../../state/geometry";
import type { CanvasGeometry, InteractiveCanvasObjectType } from "../../state/schema";
import { hitTestDropTarget } from "../hit-testing";
import {
  DRAG_THRESHOLD,
  IDLE_INTERACTION_STATE,
  emptyOverlay,
  worldDistance,
  type CanvasPointerEvent,
  type InteractionContext,
  type InteractionResult,
  type PlaceGesture,
} from "../types";

/**
 * Default-size geometry for a newly created object of `type`, centered at
 * `point` (world space). Reuses defaultGeometryFor's width/height (its x/y are
 * placeholder defaults, discarded here) so double-click creation (4.2.1) and
 * armed-tool click creation (4.2.2) share one sizing source of truth instead
 * of each re-deriving per-type dimensions.
 */
export function defaultGeometryForPlacement(
  type: InteractiveCanvasObjectType,
  point: CanvasPoint,
): CanvasGeometry {
  const { width, height } = defaultGeometryFor(type);
  return { x: point.x - width / 2, y: point.y - height / 2, width, height };
}

/** Maps an "armed" creation tool to the object type it creates; null for select/hand (and the stale "annotation" tool). */
export function objectTypeForTool(tool: CanvasTool): InteractiveCanvasObjectType | null {
  switch (tool) {
    case "container":
    case "process":
    case "decision":
    case "text":
    case "sticky":
    case "source-node":
    case "annotation-marker":
    // D16 — these were previously missing from this switch, meaning an
    // armed document/person/database/chat tool silently failed to start a
    // PlaceGesture; fixed here alongside the W2 additions below since it's
    // the same one-line pattern in the same switch.
    case "document":
    case "person":
    case "database":
    case "chat":
    // W2 — FigJam sections + V2 Flow shape vocabulary:
    case "section":
    case "pill":
    case "arrow-shape":
    case "predefined-process":
    case "code-block":
    case "chip-icon":
      return tool;
    default:
      return null;
  }
}

export const MIN_PLACE_DRAG_SIZE = 24;

/**
 * Sizes/positions the ghost preview (and eventual created object) for a place
 * gesture: below the drag threshold it's the default-size box centered on the
 * start point (so a plain click still shows/creates a sensible default-sized
 * shape); past the threshold it's the normalized drag rect, clamped so neither
 * dimension collapses below MIN_PLACE_DRAG_SIZE.
 */
export function placeGeometryFor(state: PlaceGesture): CanvasGeometry {
  const distance = worldDistance(state.startWorld, state.currentWorld);
  if (distance < DRAG_THRESHOLD) {
    return defaultGeometryForPlacement(state.objectType, state.startWorld);
  }
  const bounds = normalizeBounds({
    x1: state.startWorld.x,
    y1: state.startWorld.y,
    x2: state.currentWorld.x,
    y2: state.currentWorld.y,
  });
  return {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(bounds.width, MIN_PLACE_DRAG_SIZE),
    height: Math.max(bounds.height, MIN_PLACE_DRAG_SIZE),
  };
}

/**
 * Armed-tool object creation (4.2.2). Tracks the pointer from the initial
 * down through move/up, always exposing a live `placePreview` ghost so the
 * editor can render an outline of what will be created. On release, finalizes
 * the object (click -> default size at point; drag -> normalized/clamped
 * rect), assigns parentId via the same full-bounds drop-target hit-test used
 * by drag-and-drop-into-container moves, dispatches the creation, reverts the
 * tool to "select" (canvas.addObject's reducer already selects the new
 * object), and returns to idle.
 */
export function stepFromPlace(
  state: PlaceGesture,
  event: CanvasPointerEvent,
  ctx: InteractionContext,
): InteractionResult {
  if (event.type === "cancel") {
    return { state: IDLE_INTERACTION_STATE, dispatch: [], overlay: emptyOverlay() };
  }

  if (event.type === "up") {
    const geometry = placeGeometryFor(state);
    const center: CanvasPoint = {
      x: geometry.x + geometry.width / 2,
      y: geometry.y + geometry.height / 2,
    };
    const dropTarget = hitTestDropTarget(ctx.document, center, new Set());
    return {
      state: IDLE_INTERACTION_STATE,
      dispatch: [
        {
          type: "canvas.addObject",
          objectType: state.objectType,
          parentId: dropTarget?.id ?? null,
          geometry,
        },
        { type: "canvas.setTool", tool: "select" },
      ],
      overlay: emptyOverlay(),
    };
  }

  if (event.type !== "move") {
    return { state, dispatch: [], overlay: { placePreview: placeGeometryFor(state) } };
  }

  const nextState: PlaceGesture = { ...state, currentWorld: event.world };
  return { state: nextState, dispatch: [], overlay: { placePreview: placeGeometryFor(nextState) } };
}
