/**
 * Shared chip/polyline geometry for the graph lints. All path geometry comes
 * from the production `routeConnection` router — anchors, waypoints, and
 * obstacles honored — so lint verdicts and renders can never disagree
 * (pinned by test/lints-routing-truth.test.ts).
 *
 * Chip rects are the RENDERER's chips, not an estimate: width
 * max(41, chars×9.6 + 2×12), height 30, centered on the route's own
 * `labelPoint`, and no chip at all for empty/whitespace labels — exactly
 * what `connectionLabelWidth` + CONNECTION_LABEL_* in
 * packages/canvas/src/connectors/Connector.tsx draw on the stage and
 * packages/canvas/src/render/static-svg.ts draws in the headless preview
 * export. Those constants are module-private in the read-only canvas
 * package, so they are restated ONCE here (nowhere else in the lints) and
 * pinned to the static renderer's actual SVG output by
 * test/lints-chip-parity.test.ts — drift fails that test.
 *
 * CHIP_CLEARANCE: chips physically kissing boxes or wires read as merged
 * even without true overlap, so contact within 16px of a chip is a finding
 * too (warning tier; true overlap stays error tier).
 */
import { routeConnection } from "../../../../canvas/src/connectors/routing.ts";

import type {
  InteractiveCanvasConnection, InteractiveCanvasDocument, InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";

export interface Rect { x: number; y: number; width: number; height: number }
export interface Point { x: number; y: number }

/** Renderer chip height (Connector.tsx CONNECTION_LABEL_HEIGHT_PX). */
export const CHIP_HEIGHT = 30;
/** Renderer per-character width approximation (CONNECTION_LABEL_AVERAGE_CHAR_WIDTH_PX). */
export const CHIP_AVG_CHAR_WIDTH = 9.6;
/** Renderer horizontal text padding, per side (CONNECTION_LABEL_PADDING_X_PX). */
export const CHIP_PADDING_X = 12;
/** Renderer minimum chip width (CONNECTION_LABEL_MIN_WIDTH_PX). */
export const CHIP_MIN_WIDTH = 41;
/** Clearance margin around a chip (nested-arch R1: kissing chips read merged). */
export const CHIP_CLEARANCE = 16;

export interface Chip { edge: InteractiveCanvasConnection; label: string; rect: Rect }

/** The renderer's chip width — Connector.tsx `connectionLabelWidth`, exactly. */
export function chipWidth(label: string): number {
  return Math.max(
    CHIP_MIN_WIDTH,
    label.length * CHIP_AVG_CHAR_WIDTH + CHIP_PADDING_X * 2,
  );
}

export function center(object: InteractiveCanvasObject): Point {
  const { x, y, width, height } = object.geometry;
  return { x: x + width / 2, y: y + height / 2 };
}

export function rectOf(object: InteractiveCanvasObject): Rect {
  return object.geometry;
}

export function inflate(rect: Rect, margin: number): Rect {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
}

/** Strictly-positive rect intersection. */
export function intersects(a: Rect, b: Rect): boolean {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0
    && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width
    && b.x < a.x + a.width
    && a.y < b.y + b.height
    && b.y < a.y + a.height;
}

/**
 * Arc-length midpoint of a polyline — same math as the router's own
 * `labelPoint` (polylineHalfwayPoint). Chips themselves take the router's
 * labelPoint directly via `chipFor`; this helper remains for callers judging
 * arbitrary polylines (broken-edges' stranded-chip check).
 */
export function polylineMidpoint(points: readonly Point[]): Point | undefined {
  if (points.length === 0) return undefined;
  if (points.length === 1) return points[0];
  let total = 0;
  const lengths: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const length = Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
    lengths.push(length);
    total += length;
  }
  let remaining = total / 2;
  for (let i = 0; i < lengths.length; i += 1) {
    if (remaining <= lengths[i]! || i === lengths.length - 1) {
      const t = lengths[i]! === 0 ? 0 : remaining / lengths[i]!;
      return {
        x: points[i]!.x + (points[i + 1]!.x - points[i]!.x) * t,
        y: points[i]!.y + (points[i + 1]!.y - points[i]!.y) * t,
      };
    }
    remaining -= lengths[i]!;
  }
  return points[points.length - 1];
}

/**
 * The edge's true renderer polyline, including stored anchors, endpoint
 * positions, waypoints, and all document objects as routing obstacles.
 * Empty when an endpoint is missing.
 */
export function routedPolyline(
  edge: InteractiveCanvasConnection, document: InteractiveCanvasDocument,
): Point[] {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const fromId = edge.from.objectId;
  const toId = edge.to.objectId;
  const from = byId.get(fromId);
  const to = byId.get(toId);
  if (!from || !to) return [];
  const routed = routeConnection(from, to, edge, document.objects);
  return (routed.points ?? [routed.start, routed.end])
    .map((point) => ({ x: point.x, y: point.y }));
}

/**
 * Non-endpoint boxes whose interiors are crossed by a routed polyline.
 *
 * This preserves the long-standing broken-edge semantics: sections are not
 * violation boxes; endpoint ids and boxes overlapping a non-section endpoint
 * rect are ignored; samples land at most 4px apart and must be 0.5px inside.
 */
export function pathBoxViolationIds(
  points: readonly Point[],
  fromId: string,
  toId: string,
  objects: readonly InteractiveCanvasObject[],
): string[] {
  const boxes = objects.filter((object) => object.type !== "section");
  const byId = new Map(boxes.map((object) => [object.id, object]));
  const endpointRects = [byId.get(fromId), byId.get(toId)]
    .filter((object): object is InteractiveCanvasObject => object !== undefined)
    .map(rectOf);
  const obstacles = boxes
    .filter((object) => object.id !== fromId && object.id !== toId)
    .filter((object) => !endpointRects.some((endpoint) => overlaps(endpoint, rectOf(object))));
  const hits = new Set<string>();
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    const steps = Math.max(1, Math.ceil(length / 4));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      for (const object of obstacles) {
        const rect = rectOf(object);
        if (
          x > rect.x + 0.5
          && x < rect.x + rect.width - 0.5
          && y > rect.y + 0.5
          && y < rect.y + rect.height - 0.5
        ) {
          hits.add(object.id);
        }
      }
    }
  }
  return [...hits].sort();
}

/**
 * The renderer's label chip for an edge, or undefined when it draws none
 * (no label, whitespace-only label — the renderer's own `label?.trim()`
 * gate — or a missing endpoint). Centered on the route's `labelPoint`,
 * i.e. exactly where Connector.tsx and static-svg.ts hang the chip.
 */
export function chipFor(
  edge: InteractiveCanvasConnection, document: InteractiveCanvasDocument,
): Chip | undefined {
  const label = edge.label;
  if (label === undefined || label.trim() === "") return undefined;
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const from = byId.get(edge.from.objectId);
  const to = byId.get(edge.to.objectId);
  if (!from || !to) return undefined;
  const routed = routeConnection(from, to, edge, document.objects);
  const width = chipWidth(label);
  return {
    edge,
    label,
    rect: {
      x: routed.labelPoint.x - width / 2,
      y: routed.labelPoint.y - CHIP_HEIGHT / 2,
      width,
      height: CHIP_HEIGHT,
    },
  };
}

/** Length of segment a→b that lies inside `rect` (Liang–Barsky clip). */
export function segmentLengthInRect(a: Point, b: Point, rect: Rect): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const clips: Array<[number, number]> = [
    [-dx, a.x - rect.x],
    [dx, rect.x + rect.width - a.x],
    [-dy, a.y - rect.y],
    [dy, rect.y + rect.height - a.y],
  ];
  for (const [p, q] of clips) {
    if (p === 0) {
      if (q < 0) return 0;  // parallel and outside
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return 0;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return 0;
      if (r < t1) t1 = r;
    }
  }
  if (t1 <= t0) return 0;
  return Math.hypot(dx, dy) * (t1 - t0);
}

/** Total polyline length inside `rect`. */
export function polylineLengthInRect(points: readonly Point[], rect: Rect): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += segmentLengthInRect(points[i - 1]!, points[i]!, rect);
  }
  return total;
}

/**
 * Axis-aligned rendering of a polyline: diagonal legs become
 * horizontal-then-vertical elbows (connectors render elbow-only); already
 * axis-aligned legs pass through untouched.
 */
export function elbowize(points: readonly Point[]): Point[] {
  if (points.length === 0) return [];
  const out: Point[] = [points[0]!];
  for (let i = 1; i < points.length; i += 1) {
    const prev = out[out.length - 1]!;
    const next = points[i]!;
    if (prev.x !== next.x && prev.y !== next.y) {
      out.push({ x: next.x, y: prev.y });
    }
    out.push(next);
  }
  return out;
}

export function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distanceToPolyline(p: Point, points: readonly Point[]): number {
  if (points.length === 0) return Number.POSITIVE_INFINITY;
  if (points.length === 1) return Math.hypot(p.x - points[0]!.x, p.y - points[0]!.y);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < points.length; i += 1) {
    best = Math.min(best, distancePointToSegment(p, points[i - 1]!, points[i]!));
  }
  return best;
}
