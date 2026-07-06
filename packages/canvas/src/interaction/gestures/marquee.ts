"use client";

/**
 * Marquee gesture: rubber-band selection from an empty-canvas drag. Additive
 * (shift) marquees union with the existing selection; plain marquees replace
 * it (or clear it when nothing intersects).
 */
import { normalizeBounds } from "../../model/geometry";
import { objectsIntersectingBounds } from "../hit-testing";
import {
  IDLE_INTERACTION_STATE,
  emptyOverlay,
  selectedObjectIds,
  toIdle,
  type CanvasPointerEvent,
  type InteractionContext,
  type InteractionResult,
  type MarqueeGesture,
} from "../types";

export function stepFromMarquee(
  state: MarqueeGesture,
  event: CanvasPointerEvent,
  ctx: InteractionContext,
  alreadyEntered = false,
): InteractionResult {
  if (event.type === "cancel") {
    return toIdle();
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
        state: IDLE_INTERACTION_STATE,
        dispatch: state.additive ? [] : [{ type: "canvas.select", selection: { kind: "none" } }],
        overlay: emptyOverlay(),
      };
    }
    const nextIds = state.additive
      ? Array.from(new Set([...selectedObjectIds(ctx.selection), ...intersecting]))
      : intersecting;
    return {
      state: IDLE_INTERACTION_STATE,
      dispatch: [{ type: "canvas.select", selection: { kind: "objects", objectIds: nextIds } }],
      overlay: emptyOverlay(),
    };
  }

  if (event.type !== "move") {
    const bounds = normalizeBounds({
      x1: state.startWorld.x,
      y1: state.startWorld.y,
      x2: state.currentWorld.x,
      y2: state.currentWorld.y,
    });
    return { state, dispatch: [], overlay: { marquee: bounds } };
  }

  const nextState: MarqueeGesture = { ...state, currentWorld: event.world };
  const bounds = normalizeBounds({
    x1: nextState.startWorld.x,
    y1: nextState.startWorld.y,
    x2: nextState.currentWorld.x,
    y2: nextState.currentWorld.y,
  });
  return { state: nextState, dispatch: [], overlay: { marquee: bounds } };
}
