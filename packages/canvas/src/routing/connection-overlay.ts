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

import type { CanvasBounds, CanvasPoint } from "../state/geometry";
import { ARROW_SHAPE_GEOMETRY } from "../theme/tokens";
import type { InteractiveCanvasObject } from "../state/schema";

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

/**
 * Which real-outline shapes get true (non-bbox) outline projection. Every
 * other InteractiveCanvasObjectType falls back to its axis-aligned bounds.
 *
 * W5 (Wave A) adds the FigJam parity shape set's true-outline tier per the
 * implementation brief's per-type "outline tier" column: ellipse/triangle/
 * parallelogram/pentagon/octagon/star/plus/chevron/off-page-connector/
 * trapezoid/manual-input/hexagon/or-junction/summing-junction. Internal-
 * storage is TRUE too but its outline IS a plain rect (interior rule lines
 * don't change the outline), so it doesn't need its own OutlineShape tag —
 * "rect" already covers it via the default fallback. folder/document-stack/
 * cylinder-horizontal/page-corner/icon are intentionally NOT added here —
 * the brief marks them bbox-fallback, same tier as document/chat/person/
 * chip-icon today.
 */
type OutlineShape =
  | "rect"
  | "pill"
  | "diamond"
  | "arrow-shape"
  | "ellipse"
  | "triangle"
  | "parallelogram"
  | "pentagon"
  | "octagon"
  | "star"
  | "plus"
  | "chevron"
  | "off-page-connector"
  | "trapezoid"
  | "manual-input"
  | "hexagon"
  | "junction";

function outlineShapeFor(object: InteractiveCanvasObject): OutlineShape | null {
  if (object.type === "arrow-shape") return "arrow-shape";
  if (object.type === "pill" || object.style?.shape === "pill") return "pill";
  if (object.style?.shape === "diamond") return "diamond";
  // W5 — FigJam parity shape set (Wave A): each new true-outline type maps
  // 1:1 to its own polygon builder below. Checked via `type` (not
  // `style.shape`) to mirror how `arrow-shape`/`pill` are checked above —
  // `style.shape` is consulted as a secondary signal only where a pre-W5
  // type (e.g. plain "container"/"process") might carry a shape override.
  if (object.type === "ellipse" || object.style?.shape === "ellipse") return "ellipse";
  if (object.type === "triangle") return "triangle";
  if (object.type === "parallelogram") return "parallelogram";
  if (object.type === "pentagon") return "pentagon";
  if (object.type === "octagon") return "octagon";
  if (object.type === "star") return "star";
  if (object.type === "plus") return "plus";
  if (object.type === "chevron") return "chevron";
  if (object.type === "off-page-connector") return "off-page-connector";
  if (object.type === "trapezoid") return "trapezoid";
  if (object.type === "manual-input") return "manual-input";
  if (object.type === "hexagon") return "hexagon";
  if (object.type === "or-junction" || object.type === "summing-junction") return "junction";
  // "container"/"process"/"document"/etc. all render as plain (rounded) rects
  // for outline purposes — corner radius doesn't change where a line from the
  // center crosses the border for any of our practical shape sizes. This also
  // covers "internal-storage" (TRUE-tier but its outline is a plain rect —
  // interior rule lines don't perturb it) and every bbox-fallback type
  // (folder/document-stack/cylinder-horizontal/page-corner/icon/chip-icon/...).
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

// ---------------------------------------------------------------------------
// W5 — FigJam parity shape set (Wave A). Everything below this banner and
// down to arrowShapePoints (upstream-derived, unchanged) is NEW code written
// for this wave — not ported from BlockSuite. Geometry follows the Wave A
// implementation brief and docs/10-system-design/20-figjam-parity's "Missing
// shape specs" section.
// ---------------------------------------------------------------------------

/** Ellipse outline as a dense parametric polygon (same segment-fan style as pillPoints), true axis-aligned ellipse inscribed in the bounds. */
export function ellipsePoints(bounds: CanvasBounds): CanvasPoint[] {
  const rx = bounds.width / 2;
  const ry = bounds.height / 2;
  const cx = bounds.x + rx;
  const cy = bounds.y + ry;
  if (rx <= 0 || ry <= 0) return rectPoints(bounds);

  const points: CanvasPoint[] = [];
  const segments = 32;
  for (let i = 0; i < segments; i += 1) {
    const angle = (2 * Math.PI * i) / segments;
    points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  }
  return points;
}

/** Isosceles triangle inscribed in the bounds. "up": apex at top-center, base along the bottom. "down": vertically mirrored. */
export function trianglePoints(bounds: CanvasBounds, direction: "up" | "down"): CanvasPoint[] {
  const { x, y, width, height } = bounds;
  if (direction === "down") {
    return [
      { x, y },
      { x: x + width, y },
      { x: x + width / 2, y: y + height },
    ];
  }
  return [
    { x: x + width / 2, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

/** Fraction of width the top/bottom edge shifts for a skewed parallelogram (Wave A brief: ~18%, flagged approximate pending a pixel-reference check). */
const PARALLELOGRAM_SKEW_RATIO = 0.18;

/** Skewed quadrilateral. "right": top edge shifted right relative to the bottom. "left": horizontally mirrored. */
export function parallelogramPoints(bounds: CanvasBounds, direction: "left" | "right"): CanvasPoint[] {
  const { x, y, width, height } = bounds;
  const skew = width * PARALLELOGRAM_SKEW_RATIO;
  if (direction === "left") {
    return [
      { x, y },
      { x: x + width - skew, y },
      { x: x + width, y: y + height },
      { x: x + skew, y: y + height },
    ];
  }
  return [
    { x: x + skew, y },
    { x: x + width, y },
    { x: x + width - skew, y: y + height },
    { x, y: y + height },
  ];
}

/** N-point regular polygon centered in `bounds`, independently scaled on x/y to fill a non-square bbox (same non-uniform-scale trick as person/database/chip-icon's SVG). `startAngle` in radians, measured from the +x axis, matching standard trig convention (angle 0 = due "east/right", -PI/2 = "up"). */
function regularPolygonPoints(bounds: CanvasBounds, sides: number, startAngle: number): CanvasPoint[] {
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const rx = bounds.width / 2;
  const ry = bounds.height / 2;
  const points: CanvasPoint[] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = startAngle + (2 * Math.PI * i) / sides;
    points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  }
  return points;
}

/** Pentagon: 5-point regular polygon, point-up (first vertex straight up from center). */
export function pentagonPoints(bounds: CanvasBounds): CanvasPoint[] {
  return regularPolygonPoints(bounds, 5, -Math.PI / 2);
}

/** Octagon: 8-point regular polygon, flat-top orientation (no vertex due north/south — the first edge is horizontal across the top). */
export function octagonPoints(bounds: CanvasBounds): CanvasPoint[] {
  return regularPolygonPoints(bounds, 8, -Math.PI / 2 + Math.PI / 8);
}

/** Inner-radius fraction of a star's points relative to its outer radius (Wave A brief: ~0.4x, flagged approximate pending a pixel-reference check). */
const STAR_INNER_RADIUS_RATIO = 0.4;

/** 5-point star: 10 alternating outer/inner vertices, outer radius touching the bbox edge, point-up. */
export function starPoints(bounds: CanvasBounds): CanvasPoint[] {
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const rx = bounds.width / 2;
  const ry = bounds.height / 2;
  const points: CanvasPoint[] = [];
  const spikes = 5;
  const totalVertices = spikes * 2;
  for (let i = 0; i < totalVertices; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI * i) / spikes;
    const scale = i % 2 === 0 ? 1 : STAR_INNER_RADIUS_RATIO;
    points.push({ x: cx + rx * scale * Math.cos(angle), y: cy + ry * scale * Math.sin(angle) });
  }
  return points;
}

/** Fraction of the smaller bbox dimension used as the plus/cross bar thickness (Wave A brief: ~1/3). */
const PLUS_BAR_THICKNESS_RATIO = 1 / 3;

/** 12-point cross/plus polygon: a horizontal bar and vertical bar of equal thickness crossing at the object's center. */
export function plusPoints(bounds: CanvasBounds): CanvasPoint[] {
  const { x, y, width, height } = bounds;
  const thickness = Math.min(width, height) * PLUS_BAR_THICKNESS_RATIO;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const left = cx - thickness / 2;
  const right = cx + thickness / 2;
  const top = cy - thickness / 2;
  const bottom = cy + thickness / 2;
  return [
    { x: left, y },
    { x: right, y },
    { x: right, y: top },
    { x: x + width, y: top },
    { x: x + width, y: bottom },
    { x: right, y: bottom },
    { x: right, y: y + height },
    { x: left, y: y + height },
    { x: left, y: bottom },
    { x, y: bottom },
    { x, y: top },
    { x: left, y: top },
  ];
}

/**
 * Fat chevron (Figma CHEVRON, distinct from arrow-shape's thinner 7-point
 * sliver) — 6-point "fast-forward"-style pointer: a notched tail (concave V
 * cut into the back edge) and a pointed head (V point at the front), per the
 * Wave A brief's "blocky fast-forward pointer" description. `direction`
 * mirrors arrow-shape's left|right (default "right").
 */
export function chevronPoints(bounds: CanvasBounds, direction: "left" | "right"): CanvasPoint[] {
  const { x, y, width, height } = bounds;
  const notchWidth = width * 0.25;
  if (direction === "left") {
    return [
      { x: x + width, y },
      { x: x + notchWidth, y },
      { x, y: y + height / 2 },
      { x: x + notchWidth, y: y + height },
      { x: x + width, y: y + height },
      { x: x + width - notchWidth, y: y + height / 2 },
    ];
  }
  return [
    { x, y },
    { x: x + width - notchWidth, y },
    { x: x + width, y: y + height / 2 },
    { x: x + width - notchWidth, y: y + height },
    { x, y: y + height },
    { x: x + notchWidth, y: y + height / 2 },
  ];
}

/** Off-page connector: downward-pointing pentagon (Figma's own `SHIELD` shapeType — see the parity doc's naming note). Exact vertices per the Wave A brief. */
export function offPageConnectorPoints(bounds: CanvasBounds): CanvasPoint[] {
  const { x, y, width, height } = bounds;
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height * 0.6 },
    { x: x + width / 2, y: y + height },
    { x, y: y + height * 0.6 },
  ];
}

/** Fraction each top corner insets inward for a trapezoid (Wave A brief: 20% each side). */
const TRAPEZOID_TOP_INSET_RATIO = 0.2;

/** Trapezoid: wider bottom edge, narrower top edge, symmetric about the vertical center line. */
export function trapezoidPoints(bounds: CanvasBounds): CanvasPoint[] {
  const { x, y, width, height } = bounds;
  const inset = width * TRAPEZOID_TOP_INSET_RATIO;
  return [
    { x: x + inset, y },
    { x: x + width - inset, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

/** Manual input: rectangle with a slanted top edge (top-left higher than top-right). Exact vertices per the Wave A brief. */
export function manualInputPoints(bounds: CanvasBounds): CanvasPoint[] {
  const { x, y, width, height } = bounds;
  return [
    { x, y: y + height * 0.25 },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

/** Hexagon: 6-point regular hexagon, flat-top orientation (flowchart "preparation" symbol convention), independently x/y-scaled to fill the bbox. */
export function hexagonPoints(bounds: CanvasBounds): CanvasPoint[] {
  return regularPolygonPoints(bounds, 6, 0);
}

/** Or-junction / summing-junction: a dense circle polygon (junction glyphs are always circular/compact — the +/x overlay glyph itself is a rendering nuance, not part of the connection outline). */
function junctionPoints(bounds: CanvasBounds): CanvasPoint[] {
  return ellipsePoints(bounds);
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

/** Closed outline polygon for `object`, in its real shape where we model one (rect/pill/diamond/arrow-shape/the W5 FigJam parity set), falling back to the axis-aligned bounds rect otherwise. */
export function outlinePolygon(object: InteractiveCanvasObject): CanvasPoint[] {
  const shape = outlineShapeFor(object);
  if (shape === "diamond") return diamondPoints(object.geometry);
  if (shape === "pill") return pillPoints(object.geometry);
  if (shape === "arrow-shape")
    return arrowShapePoints(object.geometry, object.direction === "left" ? "left" : "right");
  // W5 — FigJam parity shape set (Wave A): `object.direction` is left/right
  // for parallelogram/chevron and up/down for triangle (validated in
  // schema.ts's validateInteractiveCanvasDocument); the `!== "left"`/
  // `!== "down"` checks below narrow it to the 2-value subset each polygon
  // builder expects without needing a separate assertion helper here.
  if (shape === "ellipse") return ellipsePoints(object.geometry);
  if (shape === "triangle") return trianglePoints(object.geometry, object.direction === "down" ? "down" : "up");
  if (shape === "parallelogram")
    return parallelogramPoints(object.geometry, object.direction === "left" ? "left" : "right");
  if (shape === "pentagon") return pentagonPoints(object.geometry);
  if (shape === "octagon") return octagonPoints(object.geometry);
  if (shape === "star") return starPoints(object.geometry);
  if (shape === "plus") return plusPoints(object.geometry);
  if (shape === "chevron") return chevronPoints(object.geometry, object.direction === "left" ? "left" : "right");
  if (shape === "off-page-connector") return offPageConnectorPoints(object.geometry);
  if (shape === "trapezoid") return trapezoidPoints(object.geometry);
  if (shape === "manual-input") return manualInputPoints(object.geometry);
  if (shape === "hexagon") return hexagonPoints(object.geometry);
  if (shape === "junction") return junctionPoints(object.geometry);
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
