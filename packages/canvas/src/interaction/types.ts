"use client";

/**
 * Kernel vocabulary for pointer interaction: hit-test results, normalized
 * pointer events, shared thresholds, resize handles, and tiny pure helpers.
 * Gesture state/result shapes live in the editor pipeline and feature slices.
 */
import type { CanvasSelection } from "../state/actions";
import type { CanvasPoint } from "../state/geometry";
import type { Anchor } from "../state/schema/connections";

/** World-space drag threshold below which a press+release is treated as a click. */
export const DRAG_THRESHOLD = 3;

/** Screen-space snap threshold (px); divided by zoom so snapping feels constant at any zoom. */
export const SNAP_THRESHOLD_SCREEN_PX = 6;

export type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export const RESIZE_HANDLES: ResizeHandle[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

export type CanvasHit =
  | { kind: "canvas" }
  | { kind: "object"; objectId: string }
  | { kind: "handle"; objectId: string; handle: ResizeHandle }
  | { kind: "connection"; connectionId: string }
  | { kind: "endpoint"; connectionId: string; end: "from" | "to" }
  | { kind: "bend-segment"; connectionId: string; segmentIndex: number }
  | { kind: "port"; objectId: string; anchor: Anchor };

export type CanvasPointerEventType = "down" | "move" | "up" | "cancel" | "double";

export type CanvasPointerEvent = {
  type: CanvasPointerEventType;
  world: CanvasPoint;
  screen: CanvasPoint;
  button: number;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  hit: CanvasHit;
};

export function selectedObjectIds(selection: CanvasSelection): string[] {
  return selection.kind === "objects" ? selection.objectIds : [];
}

export function worldDistance(a: CanvasPoint, b: CanvasPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
