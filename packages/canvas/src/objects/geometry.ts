"use client";

/**
 * Pure, React-free connection/outline geometry for the object defs
 * (OBJECT-DEF-OVERHAUL.md §3.4/§3.6, D4): outline polygon builders, the
 * per-object outline lookup, and the 4-cardinal connection anchors. This is
 * the surface connectors/connection-cascade.ts consumes - connector routing
 * must never import def COMPONENTS, only this geometry module (see
 * __tests__/import-boundaries.test.ts).
 *
 * Anchor projection ported (adapted, not verbatim) from BlockSuite.
 *
 * Upstream source: packages/affine/gfx/connector/src/connector-manager.ts
 *   - `getAnchors` (lines 133-159)
 * License: MPL-2.0 (see repo-root PROVENANCE.md for details)
 *
 * This module lifts the ALGORITHM only: 4 cardinal port candidates offset
 * outside an object's bound, each projected onto the object's real outline
 * (not its bounding box) via a center->candidate line/outline intersection.
 * No `Overlay`/canvas-paint code, no `GfxController`/grid search, no rotation
 * (this repo's schema has no per-object rotation field, unlike BlockSuite's
 * `ele.rotate`) — anchors are computed directly against each object's
 * axis-aligned bounds/outline.
 *
 * True-outline anchors are implemented for the shapes whose outline is a
 * simple analytic polygon/curve we already have geometry for; every other
 * object type (icons, sticky, section, etc.) falls back to its
 * axis-aligned bounding rect outline — same fallback upstream uses for
 * "diamond, ellipse, triangle" per the `FIXME` at `connector-manager.ts:975`
 * (our fallback is intentionally the same conservative choice, not a gap).
 */

import type { CanvasBounds, CanvasPoint } from "../state/geometry";
import type {
  CanvasObjectStyle,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
} from "../state/schema";
import { belowBandSize, belowExtendedBoundsPx } from "./text-slots";
export { inscribedTextRect, type InscribedTextRectResolver } from "./inscribed-text-rects";

/**
 * The geometric outline a def declares (OBJECT-DEF-OVERHAUL.md §3.4, D4):
 * anchors, outline snap, and hit-testing (D16) all derive from it. Distinct
 * from the def's visual SilhouetteSpec (shapes/shape-def.ts) — a silhouette
 * is how the shape PAINTS; the outline is its connection/hit geometry —
 * though both should trace the same curve (cross-checked by test).
 */
export type OutlineSpec =
  | { kind: "bbox" }
  | { kind: "polygon"; points: (bounds: CanvasBounds, object: InteractiveCanvasObject) => CanvasPoint[] }
  | { kind: "ellipse" };

/**
 * Arrow-shape (fat chevron) proportions (moved from theme/tokens.ts in the
 * theme dispersal — the true-outline generator below is the shared consumer;
 * the arrow-shape def imports it from here): the head takes 38% of total
 * width; the body is intentionally tall (0.60 of height) so the rendered
 * arrow reads blocky; body corners are rounded.
 */
export const ARROW_SHAPE_GEOMETRY = {
  /** Fraction of total width occupied by the chevron head. */
  headWidthRatio: 0.38,
  /** Fraction of total height occupied by the arrow body. */
  bodyHeightRatio: 0.6,
  bodyCornerRadiusPx: 10,
} as const;

/** World-space offset each cardinal anchor candidate starts at, outside the object's bound. Upstream `connector-manager.ts:135`. */
export const ANCHOR_OFFSET_PX = 10;

export type ConnectionAnchor = {
  /** Absolute world point on the object's outline. */
  point: CanvasPoint;
  /** Position relative to the object's bounds, 0..1 on each axis — what gets stored on a connection endpoint. */
  coord: [number, number];
};

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
// for that wave — not ported from BlockSuite. Geometry follows the Wave A
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

/** N-point regular polygon centered in `bounds`, independently scaled on x/y to fill a non-square bbox. `startAngle` in radians, measured from the +x axis, matching standard trig convention (angle 0 = due "east/right", -PI/2 = "up"). */
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

/**
 * Arrow-shape (fat chevron) outline polygon, built from ARROW_SHAPE_GEOMETRY.headWidthRatio and the object's own `direction`.
 * Exported (W4) so the arrow-shape def traces the same 7-point silhouette it uses for connector attachment.
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

export function connectionBoundsForObject(object: InteractiveCanvasObject): CanvasBounds {
  const local = belowExtendedBoundsPx(object);
  return {
    x: object.geometry.x + local.x,
    y: object.geometry.y + local.y,
    width: local.width,
    height: local.height,
  };
}

function hasExternalBelowBand(object: InteractiveCanvasObject): boolean {
  return belowBandSize(object.text, object).lines > 0;
}

// ---------------------------------------------------------------------------
// Outline specs (P3, D4): one shared spec object per outline family. Each
// true-outline def declares its `outline` by referencing the SAME exported
// spec object listed in the dispatch tables below — the registry cross-check
// (objects/__tests__/geometry-def-agreement.test.ts) asserts identity, so a
// def and the tables can never disagree.
// ---------------------------------------------------------------------------

/** Axis-aligned bounding rect — the default outline tier (sections, stickies, icons, document/folder/... silhouettes whose connection outline is the plain box). */
export const BBOX_OUTLINE: OutlineSpec = { kind: "bbox" };

/** True axis-aligned ellipse inscribed in the bounds (dense 32-segment polygon). */
export const ELLIPSE_OUTLINE: OutlineSpec = { kind: "ellipse" };

export const DIAMOND_OUTLINE: OutlineSpec = { kind: "polygon", points: diamondPoints };

/**
 * Direction-aware: `object.direction` is up/down for triangle and left/right
 * for arrow-shape/chevron/parallelogram (validated in schema.ts's
 * validateInteractiveCanvasDocument); the `=== "down"` / `=== "left"` checks
 * narrow it to the 2-value subset each polygon builder expects.
 */
export const TRIANGLE_OUTLINE: OutlineSpec = {
  kind: "polygon",
  points: (bounds, object) => trianglePoints(bounds, object.direction === "down" ? "down" : "up"),
};

export const PILL_OUTLINE: OutlineSpec = { kind: "polygon", points: pillPoints };

export const ARROW_SHAPE_OUTLINE: OutlineSpec = {
  kind: "polygon",
  points: (bounds, object) => arrowShapePoints(bounds, object.direction === "left" ? "left" : "right"),
};

export const PARALLELOGRAM_OUTLINE: OutlineSpec = {
  kind: "polygon",
  points: (bounds, object) =>
    parallelogramPoints(bounds, object.direction === "left" ? "left" : "right"),
};

export const PENTAGON_OUTLINE: OutlineSpec = { kind: "polygon", points: pentagonPoints };

export const OCTAGON_OUTLINE: OutlineSpec = { kind: "polygon", points: octagonPoints };

export const STAR_OUTLINE: OutlineSpec = { kind: "polygon", points: starPoints };

export const PLUS_OUTLINE: OutlineSpec = { kind: "polygon", points: plusPoints };

export const CHEVRON_OUTLINE: OutlineSpec = {
  kind: "polygon",
  points: (bounds, object) => chevronPoints(bounds, object.direction === "left" ? "left" : "right"),
};

export const OFF_PAGE_CONNECTOR_OUTLINE: OutlineSpec = {
  kind: "polygon",
  points: offPageConnectorPoints,
};

export const TRAPEZOID_OUTLINE: OutlineSpec = { kind: "polygon", points: trapezoidPoints };

export const MANUAL_INPUT_OUTLINE: OutlineSpec = { kind: "polygon", points: manualInputPoints };

export const HEXAGON_OUTLINE: OutlineSpec = { kind: "polygon", points: hexagonPoints };

/** Or-junction / summing-junction: always circular/compact — the +/x overlay glyph is a rendering nuance, not part of the connection outline. Deliberately the SAME spec object as ELLIPSE_OUTLINE (junctionPoints === ellipsePoints before P3). */
export const JUNCTION_OUTLINE: OutlineSpec = ELLIPSE_OUTLINE;

/**
 * True-outline dispatch by object TYPE (16 keys). Every other
 * InteractiveCanvasObjectType falls back through OUTLINES_BY_STYLE_SHAPE to
 * BBOX_OUTLINE.
 *
 * W5 (Wave A) set the true-outline tier per the implementation brief's
 * per-type "outline tier" column. Internal-storage is TRUE-tier too but its
 * outline IS a plain rect (interior rule lines don't change the outline), so
 * it stays on the bbox default. folder/document-stack/cylinder-horizontal/
 * page-corner/icon are intentionally NOT here — the brief marks them
 * bbox-fallback, same tier as document: corner radius
 * (and interior detailing) doesn't change where a line from the center
 * crosses the border for any of our practical shape sizes.
 */
export const OUTLINES_BY_TYPE: Partial<Record<InteractiveCanvasObjectType, OutlineSpec>> = {
  "arrow-shape": ARROW_SHAPE_OUTLINE,
  pill: PILL_OUTLINE,
  ellipse: ELLIPSE_OUTLINE,
  triangle: TRIANGLE_OUTLINE,
  parallelogram: PARALLELOGRAM_OUTLINE,
  pentagon: PENTAGON_OUTLINE,
  octagon: OCTAGON_OUTLINE,
  star: STAR_OUTLINE,
  plus: PLUS_OUTLINE,
  chevron: CHEVRON_OUTLINE,
  "off-page-connector": OFF_PAGE_CONNECTOR_OUTLINE,
  trapezoid: TRAPEZOID_OUTLINE,
  "manual-input": MANUAL_INPUT_OUTLINE,
  hexagon: HEXAGON_OUTLINE,
  "or-junction": JUNCTION_OUTLINE,
  "summing-junction": JUNCTION_OUTLINE,
};

/**
 * Secondary dispatch by `style.shape` — ONLY pill/diamond/ellipse, exactly
 * the three the pre-P3 outlineShapeFor() switch consulted style for (a
 * pre-W5 type like plain "rectangle"/"process" can carry a shape override).
 */
export const OUTLINES_BY_STYLE_SHAPE: Partial<
  Record<NonNullable<CanvasObjectStyle["shape"]>, OutlineSpec>
> = {
  pill: PILL_OUTLINE,
  diamond: DIAMOND_OUTLINE,
  ellipse: ELLIPSE_OUTLINE,
};

/**
 * Resolves the outline spec for an object. The ordering reproduces the
 * pre-P3 `outlineShapeFor()` switch VERBATIM — including its quirks — so
 * connection geometry is byte-identical (rationalizing dispatch is P4):
 *
 *   1. `type === "arrow-shape"` wins over everything;
 *   2. `type === "pill"` wins over a mismatched diamond/ellipse style
 *      (the old switch's pill check preceded the style-diamond check);
 *   3. a pill/diamond/ellipse `style.shape` override wins over the
 *      remaining TYPE checks (the old switch's style checks sat ABOVE the
 *      W5 type checks — e.g. `type: "triangle"` + `style.shape: "diamond"`
 *      resolves DIAMOND, while `type: "process"` + `style.shape:
 *      "triangle"` stays BBOX because triangle is never a style key);
 *   4. the type table;
 *   5. bbox fallback.
 *
 * NOTE this is deliberately NOT `objectDefFor`'s render-shape dispatch —
 * hit-testing (D16) and connection geometry stay consistent with each other
 * by both using THIS lookup. TODO(P4): unify outline dispatch with render
 * dispatch when defs consolidate.
 */
export function outlineSpecFor(object: InteractiveCanvasObject): OutlineSpec {
  if (object.type === "arrow-shape") return ARROW_SHAPE_OUTLINE;
  if (object.type === "pill") return PILL_OUTLINE;
  const styleShape = object.style?.shape;
  const styleSpec = styleShape === undefined ? undefined : OUTLINES_BY_STYLE_SHAPE[styleShape];
  if (styleSpec) return styleSpec;
  return OUTLINES_BY_TYPE[object.type] ?? BBOX_OUTLINE;
}

/** Materializes an outline spec into a closed polygon over `bounds`. */
export function outlinePolygonForSpec(
  spec: OutlineSpec,
  bounds: CanvasBounds,
  object: InteractiveCanvasObject,
): CanvasPoint[] {
  if (spec.kind === "polygon") return spec.points(bounds, object);
  if (spec.kind === "ellipse") return ellipsePoints(bounds);
  return rectPoints(bounds);
}

/** Closed outline polygon for `object`, in its real shape where we model one (rect/pill/diamond/arrow-shape/the W5 FigJam parity set), falling back to the axis-aligned bounds rect otherwise. */
export function outlinePolygon(object: InteractiveCanvasObject): CanvasPoint[] {
  return outlinePolygonForSpec(outlineSpecFor(object), connectionBoundsForObject(object), object);
}

/** Segment-segment intersection (finite segments only), returning the intersection point or null. Same algorithm as the vendored `lineIntersects` in gfx-types.ts, inlined here to avoid coupling this pure geometry module to the routing vendor tree. */
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

export function distance(a: CanvasPoint, b: CanvasPoint): number {
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

export function toRelative(bounds: CanvasBounds, point: CanvasPoint): [number, number] {
  const rx = bounds.width === 0 ? 0.5 : (point.x - bounds.x) / bounds.width;
  const ry = bounds.height === 0 ? 0.5 : (point.y - bounds.y) / bounds.height;
  return [clamp01(rx), clamp01(ry)];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function pointInPolygon(point: CanvasPoint, polygon: CanvasPoint[]): boolean {
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
  if (hasExternalBelowBand(object)) {
    const glyph = object.geometry;
    const bounds = connectionBoundsForObject(object);
    const glyphCenterY = glyph.y + glyph.height / 2;
    const points: CanvasPoint[] = [
      { x: glyph.x + glyph.width / 2, y: glyph.y },
      { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
      { x: glyph.x, y: glyphCenterY },
      { x: glyph.x + glyph.width, y: glyphCenterY },
    ];
    return points.map((point) => ({ point, coord: toRelative(bounds, point) }));
  }

  const bounds = connectionBoundsForObject(object);
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

/**
 * World-px tolerance around a shape's outline within which a point still
 * counts as hitting it (D16) — keeps the ~4px stroke of a true-outline shape
 * clickable right on its edge. TUNABLE.
 */
export const OUTLINE_HIT_TOLERANCE_WORLD_PX = 4;

/**
 * Outline-derived hit test (D16): does `point` hit `object`'s declared
 * outline? Bbox-outline kinds test the plain bounds — byte-identical to the
 * pre-D16 bbox hit test (and cheap: no polygon materialized). True-outline
 * kinds test point-in-polygon, expanded by `tolerance` world px around the
 * boundary so the stroke itself stays clickable.
 */
export function outlineContainsPoint(
  object: InteractiveCanvasObject,
  point: CanvasPoint,
  tolerance: number = OUTLINE_HIT_TOLERANCE_WORLD_PX,
): boolean {
  const { x, y, width, height } = connectionBoundsForObject(object);
  const inBounds = point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
  const spec = outlineSpecFor(object);
  if (spec.kind === "bbox") return inBounds;
  const polygon = outlinePolygonForSpec(spec, connectionBoundsForObject(object), object);
  if (pointInPolygon(point, polygon)) return true;
  return distance(nearestOutlinePoint(point, polygon), point) <= tolerance;
}
