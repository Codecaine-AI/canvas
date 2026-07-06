"use client";

/**
 * Ported (adapted, not verbatim) from BlockSuite.
 *
 * Upstream source: packages/affine/gfx/connector/src/connector-manager.ts
 *   - `getAnchors` (lines 133-159)
 *   - `ConnectionOverlay.renderConnector`'s decision cascade (lines 958-1061)
 * License: MPL-2.0 (see ./vendor/blocksuite/NOTICE for details)
 *
 * This module lifts the ALGORITHM only: 4 cardinal port candidates offset
 * outside an object's bound, each projected onto the object's real outline
 * (not its bounding box) via a center->candidate line/outline intersection;
 * plus the `renderConnector` decision cascade (anchor snap within a screen-px
 * radius, else nearest-outline-point within a world-px radius, else
 * inside-the-shape, else free point). No `Overlay`/canvas-paint code, no
 * `GfxController`/grid search, no rotation (this repo's schema has no
 * per-object rotation field, unlike BlockSuite's `ele.rotate`) — anchors are
 * computed directly against each object's axis-aligned bounds/outline.
 *
 * Constants copied verbatim from `affine-mining-map.md`'s Feature 3 table
 * (itself sourced from the file above): anchor offset outside bound = 10
 * world px (`connector-manager.ts:135`), hover hit-zone expansion = bound
 * `.expand(10)` (`:976`), anchor snap distance < 8 VIEW px (`:1006`), outline
 * snap distance < 8 world px (`:1011`).
 *
 * True-outline anchors are implemented for the shapes whose outline is a
 * simple analytic polygon/curve we already have geometry for: rect/rounded-
 * rect ("rect"), pill/stadium ("pill"), diamond ("diamond"), and the
 * arrow-shape chevron ("arrow-shape", using ARROW_SHAPE_GEOMETRY's
 * headWidthRatio to build the actual chevron outline). Every other object
 * type (icons, sticky, section, code-block, etc.) falls back to its
 * axis-aligned bounding rect outline — same fallback upstream uses for
 * "diamond, ellipse, triangle" per the `FIXME` at `connector-manager.ts:975`
 * (our fallback is intentionally the same conservative choice, not a gap).
 */

import type { CanvasBounds, CanvasPoint } from "../model/geometry";
import { ARROW_SHAPE_GEOMETRY } from "../render/figjam-tokens";
import type { InteractiveCanvasObject } from "../model/schema";

/** World-space offset each cardinal anchor candidate starts at, outside the object's bound. Upstream `connector-manager.ts:135`. */
export const ANCHOR_OFFSET_PX = 10;
/** Hover hit-zone expansion applied to an object's bound before it's considered a connect target. Upstream `:976`. */
export const HOVER_HIT_EXPAND_PX = 10;
/** Anchor-snap radius, VIEW (screen) px — divide by zoom to compare against world distances. Upstream `:1006`. */
export const ANCHOR_SNAP_VIEW_PX = 8;
/** Outline-snap radius, WORLD px. Upstream `:1011`. */
export const OUTLINE_SNAP_WORLD_PX = 8;

export type ConnectionAnchor = {
  /** Absolute world point on the object's outline. */
  point: CanvasPoint;
  /** Position relative to the object's bounds, 0..1 on each axis — what gets stored on a connection endpoint. */
  coord: [number, number];
};

/** Which real-outline shapes get true (non-bbox) outline projection. Every other InteractiveCanvasObjectType falls back to its axis-aligned bounds. */
type OutlineShape = "rect" | "pill" | "diamond" | "arrow-shape";

function outlineShapeFor(object: InteractiveCanvasObject): OutlineShape | null {
  if (object.type === "arrow-shape") return "arrow-shape";
  if (object.type === "pill" || object.style?.shape === "pill") return "pill";
  if (object.style?.shape === "diamond") return "diamond";
  // "container"/"process"/"document"/etc. all render as plain (rounded) rects
  // for outline purposes — corner radius doesn't change where a line from the
  // center crosses the border for any of our practical shape sizes.
  return "rect";
}

/** Diamond outline as a 4-point polygon (top, right, bottom, left of the bounds). */
function diamondPoints(bounds: CanvasBounds): CanvasPoint[] {
  return [
    { x: bounds.x + bounds.width / 2, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
    { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height / 2 },
  ];
}

/** Pill/stadium outline approximated as a polygon: two half-circle fans (8 segments each) joined by the straight sides. Dense enough for anchor/nearest-point purposes. */
function pillPoints(bounds: CanvasBounds): CanvasPoint[] {
  const radius = Math.min(bounds.height, bounds.width) / 2;
  const cy = bounds.y + bounds.height / 2;
  const leftCx = bounds.x + radius;
  const rightCx = bounds.x + bounds.width - radius;
  if (rightCx <= leftCx || radius <= 0) return rectPoints(bounds);

  const points: CanvasPoint[] = [];
  const segments = 8;
  // Right semicircle: -90deg to +90deg (through 0deg, i.e. the right side).
  for (let i = 0; i <= segments; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI * i) / segments;
    points.push({ x: rightCx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  }
  // Left semicircle: 90deg to 270deg.
  for (let i = 0; i <= segments; i += 1) {
    const angle = Math.PI / 2 + (Math.PI * i) / segments;
    points.push({ x: leftCx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  }
  return points;
}

/**
 * Arrow-shape (fat chevron) outline polygon, built from ARROW_SHAPE_GEOMETRY.headWidthRatio and the object's own `direction`.
 * Exported (W4) so CanvasStage traces the same 7-point silhouette it uses for connector attachment.
 */
export function arrowShapePoints(bounds: CanvasBounds, direction: "left" | "right"): CanvasPoint[] {
  const { x, y, width, height } = bounds;
  const bodyHeight = height * ARROW_SHAPE_GEOMETRY.bodyHeightRatio;
  const bodyInset = (height - bodyHeight) / 2;
  const headWidth = width * ARROW_SHAPE_GEOMETRY.headWidthRatio;

  if (direction === "right") {
    const bodyRight = x + width - headWidth;
    return [
      { x, y: y + bodyInset },
      { x: bodyRight, y: y + bodyInset },
      { x: bodyRight, y },
      { x: x + width, y: y + height / 2 },
      { x: bodyRight, y: y + height },
      { x: bodyRight, y: y + height - bodyInset },
      { x, y: y + height - bodyInset },
    ];
  }

  const bodyLeft = x + headWidth;
  return [
    { x: x + width, y: y + bodyInset },
    { x: bodyLeft, y: y + bodyInset },
    { x: bodyLeft, y },
    { x, y: y + height / 2 },
    { x: bodyLeft, y: y + height },
    { x: bodyLeft, y: y + height - bodyInset },
    { x: x + width, y: y + height - bodyInset },
  ];
}

function rectPoints(bounds: CanvasBounds): CanvasPoint[] {
  return [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ];
}

/** Closed outline polygon for `object`, in its real shape where we model one (rect/pill/diamond/arrow-shape), falling back to the axis-aligned bounds rect otherwise. */
export function outlinePolygon(object: InteractiveCanvasObject): CanvasPoint[] {
  const shape = outlineShapeFor(object);
  if (shape === "diamond") return diamondPoints(object.geometry);
  if (shape === "pill") return pillPoints(object.geometry);
  if (shape === "arrow-shape") return arrowShapePoints(object.geometry, object.direction ?? "right");
  return rectPoints(object.geometry);
}

/** Segment-segment intersection (finite segments only), returning the intersection point or null. Same algorithm as the vendored `lineIntersects` in gfx-types.ts, inlined here to avoid coupling this pure UX module to the routing vendor tree. */
function segmentIntersection(
  a1: CanvasPoint,
  a2: CanvasPoint,
  b1: CanvasPoint,
  b2: CanvasPoint,
): CanvasPoint | null {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-8) return null;

  const dx = b1.x - a1.x;
  const dy = b1.y - a1.y;
  const t = (dx * d2y - dy * d2x) / cross;
  const u = (dx * d1y - dy * d1x) / cross;
  const EPSILON = 1e-8;
  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) return null;
  return { x: a1.x + d1x * t, y: a1.y + d1y * t };
}

/** First point where segment [from, to] crosses `polygon`'s boundary, or null if it doesn't cross. Mirrors upstream `getLineIntersections`. */
function polygonLineIntersection(from: CanvasPoint, to: CanvasPoint, polygon: CanvasPoint[]): CanvasPoint | null {
  for (let i = 0; i < polygon.length; i += 1) {
    const p1 = polygon[i]!;
    const p2 = polygon[(i + 1) % polygon.length]!;
    const hit = segmentIntersection(from, to, p1, p2);
    if (hit) return hit;
  }
  return null;
}

function distance(a: CanvasPoint, b: CanvasPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Closest point on segment [a, b] to `point`. */
function nearestPointOnSegment(point: CanvasPoint, a: CanvasPoint, b: CanvasPoint): CanvasPoint {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSquared = abx * abx + aby * aby;
  if (lengthSquared === 0) return a;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * abx + (point.y - a.y) * aby) / lengthSquared));
  return { x: a.x + abx * t, y: a.y + aby * t };
}

/** Closest point on `polygon`'s boundary to `point`. Mirrors upstream `Element.getNearestPoint`. */
export function nearestOutlinePoint(point: CanvasPoint, polygon: CanvasPoint[]): CanvasPoint {
  let best = polygon[0]!;
  let bestDistance = Infinity;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const candidate = nearestPointOnSegment(point, a, b);
    const d = distance(point, candidate);
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }
  return best;
}

function toRelative(bounds: CanvasBounds, point: CanvasPoint): [number, number] {
  const rx = bounds.width === 0 ? 0.5 : (point.x - bounds.x) / bounds.width;
  const ry = bounds.height === 0 ? 0.5 : (point.y - bounds.y) / bounds.height;
  return [clamp01(rx), clamp01(ry)];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function pointInPolygon(point: CanvasPoint, polygon: CanvasPoint[]): boolean {
  // Standard ray-casting test.
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    const intersects =
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Ported from upstream `getAnchors`. Returns the 4 cardinal port anchors (N/S/E/W of
 * the object's center, each offset `ANCHOR_OFFSET_PX` outside the bound) projected
 * onto the object's real outline — i.e. where the line from the object's center to
 * that offset candidate actually crosses the shape's border, not the bounding box.
 * Falls back to the bounding-box edge midpoint when the candidate ray doesn't
 * cross the polygon (degenerate/zero-size objects).
 */
export function getConnectionAnchors(object: InteractiveCanvasObject): ConnectionAnchor[] {
  const bounds = object.geometry;
  const center: CanvasPoint = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const polygon = outlinePolygon(object);

  const candidates: CanvasPoint[] = [
    { x: center.x, y: bounds.y - ANCHOR_OFFSET_PX },
    { x: center.x, y: bounds.y + bounds.height + ANCHOR_OFFSET_PX },
    { x: bounds.x - ANCHOR_OFFSET_PX, y: center.y },
    { x: bounds.x + bounds.width + ANCHOR_OFFSET_PX, y: center.y },
  ];

  const fallbackPoints: CanvasPoint[] = [
    { x: center.x, y: bounds.y },
    { x: center.x, y: bounds.y + bounds.height },
    { x: bounds.x, y: center.y },
    { x: bounds.x + bounds.width, y: center.y },
  ];

  return candidates.map((candidate, index) => {
    const hit = polygonLineIntersection(center, candidate, polygon) ?? fallbackPoints[index]!;
    return { point: hit, coord: toRelative(bounds, hit) };
  });
}

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
 * connectable `candidates` (topmost-last, i.e. iterated in z-order so a later
 * entry can overwrite an earlier match exactly like upstream's for-loop),
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
  let result: ConnectionCascadeResult | null = null;

  for (const candidate of candidates) {
    if (excludeIds.has(candidate.id)) continue;
    const bounds = candidate.geometry;
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
      result = { kind: "anchor", objectId: candidate.id, point: nearestAnchor.point, coord: nearestAnchor.coord };
      continue;
    }

    const polygon = outlinePolygon(candidate);
    const nearestOutline = nearestOutlinePoint(point, polygon);
    if (distance(nearestOutline, point) < OUTLINE_SNAP_WORLD_PX) {
      result = {
        kind: "outline",
        objectId: candidate.id,
        point: nearestOutline,
        coord: toRelative(bounds, nearestOutline),
      };
      continue;
    }

    if (pointInPolygon(point, polygon)) {
      result = { kind: "inside", objectId: candidate.id };
      continue;
    }
  }

  return result ?? { kind: "free", point };
}
