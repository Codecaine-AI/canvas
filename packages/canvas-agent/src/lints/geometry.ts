/**
 * Shared chip/polyline geometry for the graph lints (v5 Tier A).
 *
 * Chip rect estimate carried over from v4 label-clearance (v4-build-spec.md,
 * Agent R2): label.length*8+24 wide × 28 tall, centered at the arc-length
 * midpoint of the edge's polyline — stored waypoints when present, else the
 * same elbow router the renderer uses (pipeline/route.ts), else the straight
 * from→to segment.
 *
 * CHIP_CLEARANCE is the v5 addition (nested-arch Round 1): chips physically
 * kissing pills/edges shipped clean under pure-overlap checks, so contact
 * within 16px of a chip is a finding too (warning tier; true overlap stays
 * error tier).
 */
import { directElbowEdges } from "../pipeline/route";

import type { BoardEdge, BoardModel, BoardNode } from "../digest/board-model";

export interface Rect { x: number; y: number; width: number; height: number }
export interface Point { x: number; y: number }

/** Chip width estimate per label character, plus padding (px). */
export const CHIP_CHAR_WIDTH = 8;
export const CHIP_PADDING = 24;
export const CHIP_HEIGHT = 28;
/** Clearance margin around a chip (nested-arch R1: kissing chips read merged). */
export const CHIP_CLEARANCE = 16;

export interface Chip { edge: BoardEdge; label: string; rect: Rect }

export function chipWidth(label: string): number {
  return label.length * CHIP_CHAR_WIDTH + CHIP_PADDING;
}

export function center(node: BoardNode): Point {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

export function rectOf(node: BoardNode): Rect {
  return { x: node.x, y: node.y, width: node.width, height: node.height };
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

/**
 * Arc-length midpoint of a polyline — where the renderer actually hangs the
 * chip (carried over from v4 label-clearance; the straight-segment estimate
 * it replaced mislocated chips on any elbowed route).
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
 * The edge's polyline as the lints reason about it: stored waypoints
 * (center-from → waypoints → center-to) when present, else the shared elbow
 * route, else the straight from→to segment. Empty when an endpoint is missing.
 */
export function routedPolyline(edge: BoardEdge, board: BoardModel): Point[] {
  const from = board.byId(edge.fromId);
  const to = board.byId(edge.toId);
  if (!from || !to) return [];
  if (edge.waypoints && edge.waypoints.length > 0) {
    return [center(from), ...edge.waypoints.map(([x, y]) => ({ x, y })), center(to)];
  }
  const objects = board.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    geometry: rectOf(node),
  }));
  const [path] = directElbowEdges(objects, [{ from: edge.fromId, to: edge.toId }]);
  if (path) return path.points.map((point) => ({ x: point.x, y: point.y }));
  return [center(from), center(to)];
}

/** Estimated label chip for an edge, or undefined when unlabeled/unroutable. */
export function chipFor(edge: BoardEdge, board: BoardModel): Chip | undefined {
  const label = edge.label;
  if (label === undefined || label === "") return undefined;
  const polyline = routedPolyline(edge, board);
  if (polyline.length === 0) return undefined;
  const mid = polylineMidpoint(polyline);
  if (!mid) return undefined;
  const width = chipWidth(label);
  return {
    edge,
    label,
    rect: { x: mid.x - width / 2, y: mid.y - CHIP_HEIGHT / 2, width, height: CHIP_HEIGHT },
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
