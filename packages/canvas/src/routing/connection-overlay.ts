"use client";

/**
 * Ported (adapted, not verbatim) from BlockSuite.
 *
 * Upstream source: packages/affine/gfx/connector/src/connector-manager.ts
 *   - `ConnectionOverlay.renderConnector`'s decision cascade (lines 958-1061)
 * License: MPL-2.0 (see ./vendor/blocksuite/NOTICE for details)
 *
 * This module lifts the ALGORITHM only: the `renderConnector` decision
 * cascade (anchor snap within a screen-px radius, else nearest-outline-point
 * within a world-px radius, else inside-the-shape, else free point). No
 * `Overlay`/canvas-paint code, no `GfxController`/grid search.
 *
 * The per-object outline polygons and 4-cardinal anchor projection the
 * cascade consumes live in objects/geometry.ts (P3, D4 — the defs own their
 * outline geometry; routing consumes the pure React-free lookup, never def
 * components).
 *
 * Constants copied verbatim from `affine-mining-map.md`'s Feature 3 table
 * (itself sourced from the file above): hover hit-zone expansion = bound
 * `.expand(10)` (`:976`), anchor snap distance < 8 VIEW px (`:1006`), outline
 * snap distance < 8 world px (`:1011`).
 */

import type { CanvasBounds, CanvasPoint } from "../state/geometry";
import type { InteractiveCanvasObject } from "../state/schema";
import {
  connectionBoundsForObject,
  distance,
  getConnectionAnchors,
  nearestOutlinePoint,
  outlinePolygon,
  pointInPolygon,
  toRelative,
  type ConnectionAnchor,
} from "../objects/geometry";

/** Hover hit-zone expansion applied to an object's bound before it's considered a connect target. Upstream `:976`. */
export const HOVER_HIT_EXPAND_PX = 10;
/** Anchor-snap radius, VIEW (screen) px — divide by zoom to compare against world distances. Upstream `:1006`. */
export const ANCHOR_SNAP_VIEW_PX = 8;
/** Outline-snap radius, WORLD px. Upstream `:1011`. */
export const OUTLINE_SNAP_WORLD_PX = 8;

/** Bound expanded by `margin` on every side — upstream `Bound.expand(10)`. */
function expandBounds(bounds: CanvasBounds, margin: number): CanvasBounds {
  return {
    x: bounds.x - margin,
    y: bounds.y - margin,
    width: bounds.width + margin * 2,
    height: bounds.height + margin * 2,
  };
}

function boundsContainsPoint(bounds: CanvasBounds, point: CanvasPoint): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

export type ConnectionCascadeResult =
  | { kind: "anchor"; objectId: string; point: CanvasPoint; coord: [number, number] }
  | { kind: "outline"; objectId: string; point: CanvasPoint; coord: [number, number] }
  | { kind: "inside"; objectId: string }
  | { kind: "free"; point: CanvasPoint };

/**
 * Ported from upstream `ConnectionOverlay.renderConnector`'s decision cascade.
 * Given the current pointer `point` (world space) and the full list of
 * connectable `candidates` (topmost-first, matching hitTestObjects),
 * returns the single winning connection target:
 *
 *   1. only objects whose bound expanded by HOVER_HIT_EXPAND_PX contains the
 *      pointer are considered;
 *   2. among those, snap to the nearest of the 4 cardinal anchors if its
 *      SCREEN distance is < ANCHOR_SNAP_VIEW_PX;
 *   3. else snap to the nearest outline point if its WORLD distance is <
 *      OUTLINE_SNAP_WORLD_PX;
 *   4. else, if the pointer is inside the shape, connect to its center
 *      (id-only, no explicit `position`);
 *   5. else (pointer near but outside, beyond both snap radii) the object
 *      doesn't win and the loop continues to the next candidate.
 *
 * If nothing wins, returns a free-floating `{ kind: "free", point }` — this
 * is what lets a connector endpoint land on empty canvas.
 *
 * `zoom` converts the anchor-snap screen-px threshold to world space (worldPx
 * = screenPx / zoom), matching every other screen-constant threshold in this
 * engine (see interaction.ts's SNAP_THRESHOLD_SCREEN_PX).
 */
export function resolveConnectionCascade(
  point: CanvasPoint,
  candidates: ReadonlyArray<InteractiveCanvasObject>,
  zoom: number,
  excludeIds: ReadonlySet<string> = new Set(),
): ConnectionCascadeResult {
  const anchorSnapWorldPx = ANCHOR_SNAP_VIEW_PX / zoom;
  for (const candidate of candidates) {
    if (excludeIds.has(candidate.id)) continue;
    const bounds = connectionBoundsForObject(candidate);
    if (!boundsContainsPoint(expandBounds(bounds, HOVER_HIT_EXPAND_PX), point)) continue;

    const anchors = getConnectionAnchors(candidate);
    let nearestAnchorDistance = Infinity;
    let nearestAnchor: ConnectionAnchor | null = null;
    for (const anchor of anchors) {
      const d = distance(anchor.point, point);
      if (d < nearestAnchorDistance) {
        nearestAnchorDistance = d;
        nearestAnchor = anchor;
      }
    }

    if (nearestAnchor && nearestAnchorDistance < anchorSnapWorldPx) {
      return { kind: "anchor", objectId: candidate.id, point: nearestAnchor.point, coord: nearestAnchor.coord };
    }

    const polygon = outlinePolygon(candidate);
    const nearestOutline = nearestOutlinePoint(point, polygon);
    if (distance(nearestOutline, point) < OUTLINE_SNAP_WORLD_PX) {
      return {
        kind: "outline",
        objectId: candidate.id,
        point: nearestOutline,
        coord: toRelative(bounds, nearestOutline),
      };
    }

    if (pointInPolygon(point, polygon)) {
      return { kind: "inside", objectId: candidate.id };
    }
  }

  return { kind: "free", point };
}
