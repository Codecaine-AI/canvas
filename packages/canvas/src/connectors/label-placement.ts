/**
 * Where each connection's label chip is DRAWN — the one placement every chip
 * consumer reads (stage chip in Connector.tsx, the static-SVG export, painted
 * bounds, the inline label editor, and the agent's chip lints through
 * board/lints/geometry.ts chipFor), so the app, the PNG and the lints agree.
 *
 * The renderer, not the drawer, keeps chips clear. For each labeled
 * connection, in document order (so two chips never both claim one spot: a
 * chip placed earlier is an obstacle to every chip after it), candidate
 * centers are sampled along the connection's own routed wire. Each candidate
 * chip is scored, in order:
 *
 * 1. blocked: 1 when it hits anything — a box's painted face (an icon's tile
 *    and caption, else the box; its own endpoints too, except on a
 *    self-loop), a chip already placed, or another wire running through it
 *    for more than EDGE_RUN_TOLERANCE_PX: the same tests covered-content
 *    judges;
 * 2. covered: how much it covers (overlap area, a wire run as an 8px band),
 *    so with no clear spot the least-bad one wins — a chip squeezed between
 *    its endpoints keeps bridging both rather than sliding onto one;
 * 3. near misses (clear chips only): the hit count for the chip grown
 *    NEAR_MISS_PX a side, so a clear chip also keeps some air;
 * 4. bend: 1 when the chip does not fit on one straight segment;
 * 5. distance from the preferred point.
 *
 * The preferred point is `labelPointFor`: the arc-length midpoint, or the
 * drawer's `move_label` pin. The lowest score wins, so a clean board keeps
 * its middle chips (moved only off a bend onto the nearest straight run).
 *
 * Pin rule: a pinned chip with no hits stays exactly at its pin, bend or
 * not. A pinned chip that hits something moves only to a clear spot, the
 * one nearest the pin; with no clear spot it keeps its pin.
 *
 * When no candidate is clear (dense boards), an unpinned chip takes the
 * least-bad one; the lint still reports what is left.
 *
 * Results are cached per (objects array, connections array, style value,
 * measuring-backend switch): documents are immutable, so one board version is
 * placed once however many chips read it, and placed again when fonts load
 * and chip widths change. The same cache holds each wire's route
 * (`routedConnectionIn`), so the connectors that draw the wires reuse the
 * routes placement made instead of routing every wire twice.
 *
 * Pure: no React, no DOM.
 */

import type { CanvasPoint } from "../state/geometry";
import type { InteractiveCanvasConnection, InteractiveCanvasDocument, InteractiveCanvasObject } from "../state/schema";
import { captionBandBounds } from "../objects/geometry";
import { iconGlyphBoxPx } from "../objects/text-slots";
import { DEFAULT_CANVAS_STYLE, type CanvasStyle } from "../theme/canvas-style";
import { onBackendChange } from "../theme/text-measure";
import { connectionLabelChipMetrics } from "./label-chip";
import { labelPointFor, routeConnection, type RoutedConnection } from "./routing";

interface Rect { x: number; y: number; width: number; height: number }

/** Candidate spacing along the wire. */
const SAMPLE_STEP_PX = 8;
/** A wire's run through a chip counts as this wide a band of covered area. */
const WIRE_BAND_PX = 8;
/** The air a chip prefers around it: a tie-break, never a reason to leave a clear spot for a hit. */
const NEAR_MISS_PX = 4;
/** Another wire may cross a chip for this long before it counts (covered-content's tolerance). */
export const EDGE_RUN_TOLERANCE_PX = 8;

/**
 * Where an object's box paints: its geometry, except a tile-style icon,
 * which paints only its tile (capped at the style's `iconTileMaxPx`,
 * centered in the box — the rect connectors meet and routes avoid).
 * Default style when `canvasStyle` is omitted.
 */
export function drawnRectOf(object: InteractiveCanvasObject, canvasStyle?: CanvasStyle): Rect {
  const local = iconGlyphBoxPx(object, canvasStyle);
  return {
    x: object.geometry.x + local.x,
    y: object.geometry.y + local.y,
    width: local.width,
    height: local.height,
  };
}

function isBox(object: InteractiveCanvasObject): boolean {
  return object.type !== "section" && object.type !== "sticky";
}

/**
 * The world rect of `object`'s caption band — the name and detail an icon
 * paints under its tile (the below-extended bounds minus the glyph box) — or
 * null when nothing paints under its glyph. Default style when omitted.
 */
export function captionBand(object: InteractiveCanvasObject, canvasStyle?: CanvasStyle): Rect | null {
  return isBox(object) ? captionBandBounds(object, canvasStyle) : null;
}

/**
 * Where a box paints content a chip can cover: its drawn rect (a tile-style
 * icon's tile, else the whole box) and, under an icon, its caption band.
 * The empty sides of an icon's box paint nothing.
 */
export function paintedRects(object: InteractiveCanvasObject, canvasStyle?: CanvasStyle): Rect[] {
  const band = captionBand(object, canvasStyle);
  return band ? [drawnRectOf(object, canvasStyle), band] : [drawnRectOf(object, canvasStyle)];
}

function intersects(a: Rect, b: Rect): boolean {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0
    && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0;
}

/** Length of segment a→b inside `rect` (Liang–Barsky clip). */
function segmentLengthInRect(a: CanvasPoint, b: CanvasPoint, rect: Rect): number {
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
      if (q < 0) return 0;
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

interface Wire { id: string; points: CanvasPoint[]; bounds: Rect }

function wireRunInRect(wire: Wire, rect: Rect): number {
  if (!intersectsInclusive(wire.bounds, rect)) return 0;
  let total = 0;
  for (let i = 1; i < wire.points.length; i += 1) {
    total += segmentLengthInRect(wire.points[i - 1]!, wire.points[i]!, rect);
  }
  return total;
}

function intersectsInclusive(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

function boundsOf(points: readonly CanvasPoint[]): Rect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

interface Candidate { point: CanvasPoint; bend: 0 | 1 }

/** How far past an obstacle's edge a boundary candidate sits, so float error never reads as overlap. */
const BOUNDARY_EPSILON_PX = 0.01;

/**
 * Points along the wire, with whether the chip fits there on one straight
 * run: SAMPLE_STEP_PX apart, each segment's middle, and, for each obstacle
 * the chip's path along a segment meets, the two centers where the chip's
 * edge just clears it — so a gap narrower than the step is still found.
 */
/** An obstacle and how far along the wire the chip may still overlap it and stay clear (a wire's EDGE_RUN_TOLERANCE_PX). */
interface Obstacle { rect: Rect; slack: number }

function candidatesAlong(points: readonly CanvasPoint[], width: number, height: number, obstacles: readonly Obstacle[]): Candidate[] {
  const out: Candidate[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) continue;
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    // Half the chip's extent along this segment's direction.
    const half = (Math.abs(ux) * width + Math.abs(uy) * height) / 2;
    const at = (d: number): Candidate => ({
      point: { x: a.x + ux * d, y: a.y + uy * d },
      bend: d >= half && length - d >= half ? 0 : 1,
    });
    for (let d = 0; d <= length; d += SAMPLE_STEP_PX) out.push(at(d));
    out.push(at(length / 2));
    // Everything the chip sweeps over moving from a to b.
    const swept: Rect = {
      x: Math.min(a.x, b.x) - width / 2,
      y: Math.min(a.y, b.y) - height / 2,
      width: Math.abs(b.x - a.x) + width,
      height: Math.abs(b.y - a.y) + height,
    };
    for (const { rect, slack } of obstacles) {
      if (!intersectsInclusive(swept, rect)) continue;
      // The obstacle's extent along the segment.
      const along = [rect.x, rect.x + rect.width].flatMap((x) =>
        [rect.y, rect.y + rect.height].map((y) => (x - a.x) * ux + (y - a.y) * uy));
      const lo = Math.min(...along) - half;
      const hi = Math.max(...along) + half;
      const edges = [lo - BOUNDARY_EPSILON_PX, hi + BOUNDARY_EPSILON_PX];
      // A wire stays clear while the chip overlaps its run by up to `slack`.
      // The run sums every segment of that wire inside the chip, so a bend
      // can use part of the slack: also try half of it.
      for (const take of slack > 0 ? [slack, slack / 2] : []) {
        edges.push(lo + take - BOUNDARY_EPSILON_PX, hi - take + BOUNDARY_EPSILON_PX);
      }
      for (const d of edges) {
        if (d >= 0 && d <= length) out.push(at(d));
      }
    }
  }
  return out;
}

/** Whether a chip centered on `point` fits on one straight segment of `points`. */
function bendAt(point: CanvasPoint, points: readonly CanvasPoint[], width: number, height: number): 0 | 1 {
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) continue;
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    const d = (point.x - a.x) * ux + (point.y - a.y) * uy;
    const off = Math.abs((point.x - a.x) * uy - (point.y - a.y) * ux);
    if (off > 0.5 || d < -0.5 || d > length + 0.5) continue;
    const half = (Math.abs(ux) * width + Math.abs(uy) * height) / 2;
    if (d >= half && length - d >= half) return 0;
  }
  return 1;
}

type Placements = ReadonlyMap<string, CanvasPoint>;
type Board = Pick<InteractiveCanvasDocument, "objects" | "connections">;

/** One board version under one style and measuring backend: its routes, filled as read, and its placements. */
interface BoardCache {
  byId: ReadonlyMap<string, InteractiveCanvasObject>;
  connections: ReadonlySet<InteractiveCanvasConnection>;
  routes: Map<string, RoutedConnection>;
  placements?: Placements;
}

const cache = new WeakMap<
  readonly InteractiveCanvasObject[],
  WeakMap<readonly InteractiveCanvasConnection[], Map<string, BoardCache>>
>();
// Styles are often freshly normalized copies, so the cache keys them by value.
const styleKeys = new WeakMap<CanvasStyle, string>();
function styleKey(style: CanvasStyle): string {
  let key = styleKeys.get(style);
  if (key === undefined) styleKeys.set(style, (key = JSON.stringify(style)));
  return key;
}
// Chip widths (and icon captions) change when the measuring backend switches
// (fonts loaded, HarfBuzz ready), so every switch starts a fresh cache entry.
let backendRevision = 0;
onBackendChange(() => {
  backendRevision += 1;
});

function boardCache(document: Board, canvasStyle: CanvasStyle): BoardCache {
  let byConnections = cache.get(document.objects);
  if (!byConnections) cache.set(document.objects, (byConnections = new WeakMap()));
  let byStyle = byConnections.get(document.connections);
  if (!byStyle) byConnections.set(document.connections, (byStyle = new Map()));
  const key = `${backendRevision}:${styleKey(canvasStyle)}`;
  let entry = byStyle.get(key);
  if (!entry) {
    // Entries for older backends are dead: drop them.
    byStyle.forEach((_, old) => {
      if (!old.startsWith(`${backendRevision}:`)) byStyle!.delete(old);
    });
    entry = {
      byId: new Map(document.objects.map((object) => [object.id, object])),
      connections: new Set(document.connections),
      routes: new Map(),
    };
    byStyle.set(key, entry);
  }
  return entry;
}

function cachedRoute(
  entry: BoardCache, document: Board, connection: InteractiveCanvasConnection,
  from: InteractiveCanvasObject, to: InteractiveCanvasObject, canvasStyle: CanvasStyle,
): RoutedConnection {
  let routed = entry.routes.get(connection.id);
  if (!routed) entry.routes.set(connection.id, (routed = routeConnection(from, to, connection, document.objects, canvasStyle)));
  return routed;
}

/**
 * `routeConnection(fromObject, toObject, connection, document.objects,
 * canvasStyle)`, shared with the placement through the board cache. A
 * connection or endpoint that is not the document's own (a drag preview's
 * stand-in) is routed afresh.
 */
export function routedConnectionIn(
  document: Board,
  connection: InteractiveCanvasConnection,
  fromObject: InteractiveCanvasObject,
  toObject: InteractiveCanvasObject,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): RoutedConnection {
  const entry = boardCache(document, canvasStyle);
  const own = entry.byId.get(connection.from.objectId) === fromObject
    && entry.byId.get(connection.to.objectId) === toObject
    && entry.connections.has(connection);
  return own
    ? cachedRoute(entry, document, connection, fromObject, toObject, canvasStyle)
    : routeConnection(fromObject, toObject, connection, document.objects, canvasStyle);
}

/** Every labeled connection's drawn chip center, by connection id. */
export function placeConnectionLabels(document: Board, canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE): Placements {
  const entry = boardCache(document, canvasStyle);
  return (entry.placements ??= computePlacements(entry, document, canvasStyle));
}

function computePlacements(entry: BoardCache, document: Board, canvasStyle: CanvasStyle): Placements {
  const result = new Map<string, CanvasPoint>();
  if (!document.connections.some((connection) => connection.label?.trim())) return result;
  const routes = new Map<string, RoutedConnection>();
  const wires: Wire[] = [];
  for (const connection of document.connections) {
    const from = entry.byId.get(connection.from.objectId);
    const to = entry.byId.get(connection.to.objectId);
    if (!from || !to) continue;
    const routed = cachedRoute(entry, document, connection, from, to, canvasStyle);
    routes.set(connection.id, routed);
    const points = routed.points ?? [routed.start, routed.end];
    if (points.length >= 2) wires.push({ id: connection.id, points, bounds: boundsOf(points) });
  }
  const faces = document.objects
    .filter(isBox)
    .map((object) => ({ id: object.id, rects: paintedRects(object, canvasStyle) }));

  const chips: Rect[] = [];
  for (const connection of document.connections) {
    const label = connection.label?.trim() ? connection.label : null;
    const routed = routes.get(connection.id);
    if (!label || !routed) continue;
    const { width, height } = connectionLabelChipMetrics(label, canvasStyle);
    const selfLoop = connection.from.objectId === connection.to.objectId;
    const points = routed.points ?? [routed.start, routed.end];

    const rectAt = (center: CanvasPoint, margin: number): Rect => ({
      x: center.x - width / 2 - margin,
      y: center.y - height / 2 - margin,
      width: width + margin * 2,
      height: height + margin * 2,
    });
    // How many things the chip grown `margin` a side touches, and how much
    // of them it covers (overlap area; a wire's run counts as a band
    // WIRE_BAND_PX wide).
    const hits = (center: CanvasPoint, margin = 0): { count: number; covered: number } => {
      const rect = rectAt(center, margin);
      let count = 0;
      let covered = 0;
      for (const face of faces) {
        if (selfLoop && face.id === connection.from.objectId) continue;
        const area = face.rects.reduce((sum, painted) => sum + overlapArea(rect, painted), 0);
        if (area > 0) {
          count += 1;
          covered += area;
        }
      }
      for (const chip of chips) {
        const area = overlapArea(rect, chip);
        if (area > 0) {
          count += 1;
          covered += area;
        }
      }
      for (const wire of wires) {
        if (wire.id === connection.id) continue;
        const run = wireRunInRect(wire, rect);
        if (run > EDGE_RUN_TOLERANCE_PX) {
          count += 1;
          covered += run * WIRE_BAND_PX;
        }
      }
      return { count, covered };
    };
    const scoreAt = (point: CanvasPoint, bend: number): Score => {
      const { count, covered } = hits(point);
      return [
        count > 0 ? 1 : 0,
        covered,
        // Air matters only once a chip is clear; a blocked chip ties go to the preferred point.
        count > 0 ? 0 : hits(point, NEAR_MISS_PX).count,
        bend,
        Math.hypot(point.x - preferred.x, point.y - preferred.y),
      ];
    };

    const preferred = labelPointFor(routed, connection);
    const pinned = connection.labelPosition !== undefined;
    const preferredScore = scoreAt(preferred, bendAt(preferred, points, width, height));
    let best = preferred;
    if (!(pinned && preferredScore[0] === 0)) {
      let bestScore = preferredScore;
      const obstacles: Obstacle[] = [
        ...faces.flatMap((face) => (selfLoop && face.id === connection.from.objectId ? [] : face.rects)),
        ...chips,
      ].map((rect) => ({ rect, slack: 0 }));
      for (const other of wires) {
        if (other.id === connection.id) continue;
        for (const rect of segmentBoxes(other.points)) obstacles.push({ rect, slack: EDGE_RUN_TOLERANCE_PX });
      }
      for (const candidate of candidatesAlong(points, width, height, obstacles)) {
        const score = scoreAt(candidate.point, candidate.bend);
        if (lexLess(score, bestScore)) {
          bestScore = score;
          best = candidate.point;
        }
      }
      // A pin moves only to a clear spot: never to leave a bend, never to a
      // spot that is merely less bad.
      if (pinned && bestScore[0] !== 0) best = preferred;
    }
    result.set(connection.id, best);
    chips.push(rectAt(best, 0));
  }
  return result;
}

/** Each segment's bounding box. */
function segmentBoxes(points: readonly CanvasPoint[]): Rect[] {
  const out: Rect[] = [];
  for (let i = 1; i < points.length; i += 1) out.push(boundsOf([points[i - 1]!, points[i]!]));
  return out;
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

type Score = [blocked: number, covered: number, nearMisses: number, bend: number, distance: number];

function lexLess(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]! < b[i]!) return true;
    if (a[i]! > b[i]!) return false;
  }
  return false;
}

/**
 * The chip center `connection` is drawn at in `document`: its placement, or
 * `labelPointFor` for a connection the placement skipped (no label yet —
 * the inline editor opening on a fresh wire).
 */
export function placedLabelPoint(
  routed: RoutedConnection,
  connection: InteractiveCanvasConnection,
  document: Board,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): CanvasPoint {
  return placeConnectionLabels(document, canvasStyle).get(connection.id) ?? labelPointFor(routed, connection);
}
