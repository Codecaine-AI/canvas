/**
 * Where each connection's label chip is DRAWN — the one placement every chip
 * consumer reads (stage chip in Connector.tsx, the static-SVG export, painted
 * bounds, the inline label editor, and tighten_wires through
 * board/lints/geometry.ts chipFor), so the app and the PNG agree.
 *
 * The renderer, not the drawer, keeps chips clear. Each chip is first placed
 * on its own, and a chip placed earlier is an obstacle to every chip after
 * it (so two chips never both claim one spot): the drawer's `move_label`
 * pins, then every other chip, each in document order. Then the chips of
 * side-by-side runs (below) move to one line. Candidate centers are sampled
 * along the connection's own routed wire. Each candidate chip is scored, in
 * order:
 *
 * 1. blocked: 1 when it hits anything — a box's painted face (an icon's tile
 *    and caption, else the box; its own endpoints too, except on a
 *    self-loop), a sticky, a section's title chip, a chip already placed,
 *    another wire running through it for more than EDGE_RUN_TOLERANCE_PX (a
 *    junction, a shared trunk, a crossing), a section frame edge, or the
 *    last ARROW_KEEP_OUT_PX of any wire's arrowed end (its own too);
 * 2. covered: how much it covers (overlap area, a wire run, frame edge or
 *    arrow zone as an 8px band),
 *    so with no clear spot the least-bad one wins — a chip squeezed between
 *    its endpoints keeps bridging both rather than sliding onto one;
 * 3. bend: 1 when the chip does not fit on one straight segment;
 * 4. crowded (clear chips only): 1 when a section frame edge is within
 *    FRAME_AIR_PX of it, so a chip between two frames shows line on both
 *    sides and reads as one gap's chip, or a corner of its own wire within
 *    BEND_AIR_PX, so a chip moved off a bend does not stop at its rounding;
 * 5. foreign (clear chips only): 1 when it sits inside a section that does
 *    not hold both of its wire's ends, so a wire that leaves a section
 *    carries its chip in the white space outside it;
 * 6. near misses (clear chips only): the hit count for the chip grown
 *    NEAR_MISS_PX a side, so a clear chip also keeps some air;
 * 7. distance from the preferred point.
 *
 * The preferred point is `labelPointFor`: the arc-length midpoint, or the
 * drawer's `move_label` pin. The lowest score wins, so a clean board keeps
 * its middle chips (moved only off a bend onto the nearest straight run).
 *
 * Side-by-side runs. Ford: "making sure that there is enough space for the,
 * like, tags, making sure the tags line up in line." A wire's label runs are
 * its horizontal and vertical segments that fit its chip. Two runs sit side
 * by side when they point the same way, lie between one chip (plus
 * GROUP_CHIP_AIR_PX) and GROUP_MAX_APART_PX apart, and one line across them
 * holds both chips clear. A sweep across the runs chains neighbours into a
 * group while one line still holds every chip clear; a wire with runs in two
 * groups stays in the larger. A group's chips all take one line, clear of
 * every chip outside the group (those do not move): the one with the fewest
 * crowded, then foreign, then near-miss chips, then the least total move
 * from each wire's preferred point. Pinned chips join no group.
 *
 * Pin rule: a pinned chip with no hits stays exactly at its pin, unless it
 * lies on its wire across a bend: then it moves to the nearest clear spot on
 * a straight run, when the wire has one. A pinned chip that hits something
 * moves only to a clear spot, the one nearest the pin; with no clear spot it
 * keeps its pin. A pin is not scored for a frame edge or foreign, but one
 * that moves keeps BEND_AIR_PX from the corners of its wire when it can.
 *
 * When no candidate is clear, a chip on a vertical run may also slide
 * sideways, as long as its wire stays SIDE_WIRE_INSET_PX inside its edge: a
 * wide chip on a wire that hugs a frame edge or a column of boxes clears
 * them that way. Only a clear sideways spot is taken.
 *
 * When still no candidate is clear (dense boards), an unpinned chip takes the
 * least-bad one; `blockedLabelIds` counts what is left (canvas_check's
 * LAYOUT block). No lint judges chips.
 *
 * `labelledGapPx` is the other half: the room a gap needs for the chips of
 * the wires that cross it, which `arrange` flow and make-room
 * (state/section-grow.ts) size their gutters by. `arrange_section` sizes the
 * gap between two nodes by the same LABELLED_GAP_AIR_PX.
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
import { sectionTitleChipWorldRect } from "../objects/section/title-chip-geometry";
import { iconGlyphBoxPx } from "../objects/text-slots";
import { DEFAULT_CANVAS_STYLE, type CanvasStyle } from "../theme/canvas-style";
import { onBackendChange } from "../theme/text-measure";
import { connectionLabelChipMetrics } from "./label-chip";
import {
  CONNECTOR_END_GAP_PX,
  labelPointFor,
  routeConnection,
  routeConnectionOnBoard,
  type RoutedConnection,
} from "./routing";

interface Rect { x: number; y: number; width: number; height: number }

/** Candidate spacing along the wire. */
const SAMPLE_STEP_PX = 8;
/** A wire's run through a chip counts as this wide a band of covered area. */
const WIRE_BAND_PX = 8;
/** The air a chip prefers around it: a tie-break, never a reason to leave a clear spot for a hit. */
const NEAR_MISS_PX = 4;
/** Another wire may cross a chip for this long before it counts. */
export const EDGE_RUN_TOLERANCE_PX = 8;
/** A chip keeps off this much of a wire's arrowed end, so the head always shows. */
export const ARROW_KEEP_OUT_PX = 24;
/** How far inside a chip's edge its own wire stays when the chip slides sideways off a vertical run. */
const SIDE_WIRE_INSET_PX = 12;
/** The line a chip prefers to show between itself and a section frame edge. */
const FRAME_AIR_PX = 16;
/** The line a chip prefers to show between itself and a corner of its own wire. */
const BEND_AIR_PX = 12;
/** Two label runs further apart than this are not side by side. */
const GROUP_MAX_APART_PX = 240;
/** The air two chips on one line across their runs keep between them. */
const GROUP_CHIP_AIR_PX = 8;
/** How far apart the lines a group may share are tried. */
const GROUP_LINE_STEP_PX = 2;
/**
 * The gap a labelled wire needs past its chip's length: 24px of air before the
 * chip, ARROW_KEEP_OUT_PX after it for the arrowhead, and the end gap the
 * wire leaves at each box. 68px at the default end gap.
 */
export const LABELLED_GAP_AIR_PX = 24 + ARROW_KEEP_OUT_PX + 2 * CONNECTOR_END_GAP_PX;

/**
 * The clear space the gap between two sets of boxes needs along `axis` for
 * the label chips of the wires that join them: the longest chip's length
 * along the axis (its width along x, its height along y) plus
 * LABELLED_GAP_AIR_PX. 0 when no labelled wire joins them.
 */
export function labelledGapPx(
  document: Pick<InteractiveCanvasDocument, "connections">,
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
  axis: "x" | "y",
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): number {
  let need = 0;
  for (const connection of document.connections) {
    if (!connection.label?.trim()) continue;
    const { objectId: from } = connection.from;
    const { objectId: to } = connection.to;
    if (!((a.has(from) && b.has(to)) || (b.has(from) && a.has(to)))) continue;
    const chip = connectionLabelChipMetrics(connection.label, canvasStyle);
    need = Math.max(need, (axis === "x" ? chip.width : chip.height) + LABELLED_GAP_AIR_PX);
  }
  return need;
}

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
 * The world rect of `object`'s caption band — the name an icon
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
/** A segment this close to vertical counts as a vertical run. */
const ROUTE_EPSILON_PX = 0.5;

/**
 * An obstacle, how far along the wire the chip may still overlap it and stay
 * clear (a wire's EDGE_RUN_TOLERANCE_PX), and the air the chip prefers to
 * keep from it (a frame edge's FRAME_AIR_PX).
 */
interface Obstacle { rect: Rect; slack: number; air: number }

/**
 * Points along the wire, with whether the chip fits there on one straight
 * run: SAMPLE_STEP_PX apart, each segment's middle, the two centers where
 * the chip just fits on the segment, and, for each obstacle the chip's path
 * along a segment meets, the two centers where the chip's edge just clears
 * it (and where it keeps the obstacle's air) — so a gap narrower than the
 * step is still found.
 */
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
    if (length >= half * 2) out.push(at(half), at(length - half));
    // Everything the chip sweeps over moving from a to b.
    const swept: Rect = {
      x: Math.min(a.x, b.x) - width / 2,
      y: Math.min(a.y, b.y) - height / 2,
      width: Math.abs(b.x - a.x) + width,
      height: Math.abs(b.y - a.y) + height,
    };
    for (const { rect, slack, air } of obstacles) {
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
      if (air > 0) edges.push(lo - air - BOUNDARY_EPSILON_PX, hi + air + BOUNDARY_EPSILON_PX);
      for (const d of edges) {
        if (d >= 0 && d <= length) out.push(at(d));
      }
    }
  }
  return out;
}

/**
 * Chip centers slid sideways off each vertical run of `points`, the wire
 * kept SIDE_WIRE_INSET_PX inside the chip: every SAMPLE_STEP_PX of slide,
 * plus the slides where the chip's side just clears an obstacle, at each
 * point `candidatesAlong` finds for a chip that wide.
 */
function sidewaysCandidates(points: readonly CanvasPoint[], width: number, height: number, obstacles: readonly Obstacle[]): Candidate[] {
  const reach = width / 2 - SIDE_WIRE_INSET_PX;
  if (reach <= 0) return [];
  const out: Candidate[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (Math.abs(a.x - b.x) > ROUTE_EPSILON_PX || a.y === b.y) continue;
    const slides: number[] = [];
    for (let slide = SAMPLE_STEP_PX; slide <= reach; slide += SAMPLE_STEP_PX) slides.push(slide, -slide);
    for (const { rect } of obstacles) {
      slides.push(
        rect.x - width / 2 - BOUNDARY_EPSILON_PX - a.x,
        rect.x + rect.width + width / 2 + BOUNDARY_EPSILON_PX - a.x,
      );
    }
    const inReach = slides.filter((slide) => slide !== 0 && Math.abs(slide) <= reach);
    for (const along of candidatesAlong([a, b], width + reach * 2, height, obstacles)) {
      for (const slide of inReach) out.push({ point: { x: along.point.x + slide, y: along.point.y }, bend: along.bend });
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
  placements?: { points: Placements; blocked: readonly string[] };
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
  if (!routed) entry.routes.set(connection.id, (routed = routeConnectionOnBoard(document, connection, from, to, canvasStyle)));
  return routed;
}

/**
 * The wire as the board paints it (`routeConnectionOnBoard`, in its lane),
 * shared with the placement through the board cache. A
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
  return (entry.placements ??= computePlacements(entry, document, canvasStyle)).points;
}

/**
 * The labeled connections whose chip found no clear spot: drawn where it
 * still hits a box, a chip or another wire (dense boards). A number for
 * canvas_check's LAYOUT block, never a finding.
 */
export function blockedLabelIds(document: Board, canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE): readonly string[] {
  const entry = boardCache(document, canvasStyle);
  return (entry.placements ??= computePlacements(entry, document, canvasStyle)).blocked;
}

function computePlacements(
  entry: BoardCache, document: Board, canvasStyle: CanvasStyle,
): { points: Placements; blocked: string[] } {
  const result = new Map<string, CanvasPoint>();
  const blocked: string[] = [];
  if (!document.connections.some((connection) => connection.label?.trim())) return { points: result, blocked };
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
  // A sticky paints its whole note and a section its title chip; chips keep off both.
  const faces = document.objects.map((object) => ({
    id: object.id,
    rects: object.type === "section"
      ? [sectionTitleChipWorldRect(object, 1, canvasStyle)]
      : object.type === "sticky" ? [object.geometry] : paintedRects(object, canvasStyle),
  }));
  // Lines no chip may cross at all: every frame edge (a chip across one
  // reads as in neither section — Ford: "for the Text Bobs on lines to make
  // it so that they aren't, like, ideally on borders and such"), and each
  // wire's arrowed ends.
  const sections = document.objects.filter((object) => object.type === "section");
  const frames: Wire[] = sections.map((object) => {
    const { x, y, width, height } = object.geometry;
    const frame = [
      { x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }, { x, y },
    ];
    return { id: object.id, points: frame, bounds: boundsOf(frame) };
  });
  const arrows: Wire[] = [];
  for (const connection of document.connections) {
    const routed = routes.get(connection.id);
    if (!routed) continue;
    const points = routed.points ?? [routed.start, routed.end];
    const arrow = connection.arrow ?? "forward";
    const ends = [
      ...(arrow === "forward" || arrow === "both" ? [points] : []),
      ...(arrow === "back" || arrow === "both" ? [[...points].reverse()] : []),
    ];
    for (const end of ends) {
      const zone = lastRun(end, ARROW_KEEP_OUT_PX);
      if (zone.length >= 2) arrows.push({ id: connection.id, points: zone, bounds: boundsOf(zone) });
    }
  }
  const lines = [...frames, ...arrows];

  /** `id` and every section around it. */
  const chainOf = (id: string): Set<string> => {
    const chain = new Set<string>();
    for (let at = entry.byId.get(id); at && !chain.has(at.id); at = at.parentId ? entry.byId.get(at.parentId) : undefined) {
      chain.add(at.id);
    }
    return chain;
  };
  const labels: Label[] = [];
  for (const connection of document.connections) {
    const label = connection.label?.trim() ? connection.label : null;
    const routed = routes.get(connection.id);
    if (!label || !routed) continue;
    const { width, height } = connectionLabelChipMetrics(label, canvasStyle);
    const to = chainOf(connection.to.objectId);
    const points = routed.points ?? [routed.start, routed.end];
    labels.push({
      connection,
      points,
      corners: points.slice(1, -1).filter((at, index) => {
        const before = points[index]!;
        const after = points[index + 2]!;
        return Math.abs((at.x - before.x) * (after.y - at.y) - (at.y - before.y) * (after.x - at.x)) > ROUTE_EPSILON_PX;
      }),
      width,
      height,
      selfLoop: connection.from.objectId === connection.to.objectId,
      preferred: labelPointFor(routed, connection),
      pinned: connection.labelPosition !== undefined,
      home: new Set([...chainOf(connection.from.objectId)].filter((id) => to.has(id))),
    });
  }

  const chips = new Map<Label, Rect>();
  const rectAt = ({ width, height }: Label, center: CanvasPoint, margin = 0): Rect => ({
    x: center.x - width / 2 - margin,
    y: center.y - height / 2 - margin,
    width: width + margin * 2,
    height: height + margin * 2,
  });
  // How many things the chip grown `margin` a side touches, and how much
  // of them it covers (overlap area; a wire's run counts as a band
  // WIRE_BAND_PX wide). `others` are the chips it must keep off: every chip
  // placed so far, unless the caller names fewer.
  const hits = (
    label: Label, center: CanvasPoint, margin = 0, others: Iterable<Rect> = chips.values(),
  ): { count: number; covered: number } => {
    const rect = rectAt(label, center, margin);
    let count = 0;
    let covered = 0;
    for (const face of faces) {
      if (label.selfLoop && face.id === label.connection.from.objectId) continue;
      const area = face.rects.reduce((sum, painted) => sum + overlapArea(rect, painted), 0);
      if (area > 0) {
        count += 1;
        covered += area;
      }
    }
    for (const chip of others) {
      const area = overlapArea(rect, chip);
      if (area > 0) {
        count += 1;
        covered += area;
      }
    }
    for (const wire of wires) {
      if (wire.id === label.connection.id) continue;
      const run = wireRunInRect(wire, rect);
      if (run > EDGE_RUN_TOLERANCE_PX) {
        count += 1;
        covered += run * WIRE_BAND_PX;
      }
    }
    for (const line of lines) {
      const run = wireRunInRect(line, rect);
      if (run > 0) {
        count += 1;
        covered += run * WIRE_BAND_PX;
      }
    }
    return { count, covered };
  };
  /** Whether a corner of the chip's own wire is in the chip or within BEND_AIR_PX of it. */
  const tightToCorner = (label: Label, center: CanvasPoint): boolean => {
    const turn = rectAt(label, center, BEND_AIR_PX);
    return label.corners.some((corner) =>
      corner.x > turn.x && corner.x < turn.x + turn.width && corner.y > turn.y && corner.y < turn.y + turn.height);
  };
  /** Where a clear chip would rather not sit: tight to a frame edge or a corner of its wire, inside a section its wire only passes, short of air. */
  const taste = (
    label: Label, center: CanvasPoint, others?: Iterable<Rect>,
  ): [crowded: number, foreign: number, nearMisses: number] => {
    const aired = rectAt(label, center, FRAME_AIR_PX);
    const rect = rectAt(label, center);
    return [
      frames.some((frame) => wireRunInRect(frame, aired) > 0) || tightToCorner(label, center) ? 1 : 0,
      sections.some((section) => !label.home.has(section.id) && intersects(rect, section.geometry)) ? 1 : 0,
      hits(label, center, NEAR_MISS_PX, others).count,
    ];
  };
  const take = (label: Label, center: CanvasPoint): void => {
    result.set(label.connection.id, center);
    chips.set(label, rectAt(label, center));
  };

  const placeAlone = (label: Label): void => {
    const { connection, points, width, height, preferred, pinned } = label;
    const scoreAt = (point: CanvasPoint, bend: number): Score => {
      const { count, covered } = hits(label, point);
      // Taste matters only once a chip is clear; a blocked chip's ties go to the preferred point.
      // A pin has no taste but air to the corner it moves off.
      const [crowded, foreign, nearMisses] = count > 0
        ? [0, 0, 0]
        : pinned ? [tightToCorner(label, point) ? 1 : 0, 0, 0] : taste(label, point);
      return [
        count > 0 ? 1 : 0,
        covered,
        bend,
        crowded,
        foreign,
        nearMisses,
        Math.hypot(point.x - preferred.x, point.y - preferred.y),
      ];
    };

    const preferredScore = scoreAt(preferred, bendAt(preferred, points, width, height));
    let best = preferred;
    let bestScore = preferredScore;
    // A clear pin stays, unless it lies on its wire across a bend (a pin
    // moved off the wire is the drawer's own spot).
    const stays = pinned && preferredScore[0] === 0 && (preferredScore[2] === 0 || !!connection.labelPosition?.offset);
    if (!stays) {
      const obstacles: Obstacle[] = [
        ...faces.flatMap((face) => (label.selfLoop && face.id === connection.from.objectId ? [] : face.rects)),
        ...chips.values(),
      ].map((rect) => ({ rect, slack: 0, air: 0 }));
      for (const other of wires) {
        if (other.id === connection.id) continue;
        for (const rect of segmentBoxes(other.points)) obstacles.push({ rect, slack: EDGE_RUN_TOLERANCE_PX, air: 0 });
      }
      for (const frame of frames) {
        for (const rect of segmentBoxes(frame.points)) obstacles.push({ rect, slack: 0, air: FRAME_AIR_PX });
      }
      for (const arrow of arrows) {
        for (const rect of segmentBoxes(arrow.points)) obstacles.push({ rect, slack: 0, air: 0 });
      }
      for (const corner of label.corners) obstacles.push({ rect: { ...corner, width: 0, height: 0 }, slack: 0, air: BEND_AIR_PX });
      for (const candidate of candidatesAlong(points, width, height, obstacles)) {
        const score = scoreAt(candidate.point, candidate.bend);
        if (lexLess(score, bestScore)) {
          bestScore = score;
          best = candidate.point;
        }
      }
      if (bestScore[0] !== 0) {
        for (const candidate of sidewaysCandidates(points, width, height, obstacles)) {
          const score = scoreAt(candidate.point, candidate.bend);
          if (score[0] === 0 && lexLess(score, bestScore)) {
            bestScore = score;
            best = candidate.point;
          }
        }
      }
      // A pin moves only to a clear spot, never to one that is merely less bad.
      if (pinned && bestScore[0] !== 0) {
        best = preferred;
        bestScore = preferredScore;
      }
    }
    if (bestScore[0] !== 0) blocked.push(connection.id);
    take(label, best);
  };

  // Each chip on its own first: the pins, then the rest.
  const free = labels.filter((label) => !label.pinned);
  for (const label of labels) {
    if (label.pinned) placeAlone(label);
  }
  free.forEach(placeAlone);

  // Then the side-by-side runs: one sweep across the runs of each direction.
  const groups: Array<{ runs: Run[]; lines: Set<number> }> = [];
  /** The lines across a run where its chip is clear of the board. */
  const clearLines = new Map<Run, number[]>();
  for (const horizontal of [true, false]) {
    const runs = free.flatMap(labelRuns).filter((run) => run.horizontal === horizontal)
      .sort((a, b) => a.at - b.at || a.lo - b.lo);
    const open: typeof groups = [];
    for (const run of runs) {
      const clear: number[] = [];
      for (let line = Math.ceil(run.lo / GROUP_LINE_STEP_PX) * GROUP_LINE_STEP_PX; line <= run.hi; line += GROUP_LINE_STEP_PX) {
        if (hits(run.label, centerOn(run, line), 0, []).count === 0) clear.push(line);
      }
      clearLines.set(run, clear);
      let join: { group: (typeof groups)[number]; lines: Set<number> } | null = null;
      for (const group of open) {
        const last = group.runs[group.runs.length - 1]!;
        const apart = run.at - last.at;
        if (apart < (run.across + last.across) / 2 + GROUP_CHIP_AIR_PX || apart > GROUP_MAX_APART_PX) continue;
        if (group.runs.some((member) => member.label === run.label)) continue;
        const shared = new Set(clear.filter((line) => group.lines.has(line)));
        if (shared.size > 0 && (!join || shared.size > join.lines.size)) join = { group, lines: shared };
      }
      if (join) {
        join.group.runs.push(run);
        join.group.lines = join.lines;
      } else {
        open.push({ runs: [run], lines: new Set(clear) });
      }
    }
    groups.push(...open);
  }
  // A group's chips move to one line, clear of every chip outside the group
  // (those stay where they are). The larger group first, so a wire with runs
  // in two stays in the larger; the smaller keeps the runs that still sit
  // side by side without it.
  const grouped = new Set<Label>();
  for (const group of groups.filter(({ runs }) => runs.length >= 2).sort((a, b) => b.runs.length - a.runs.length)) {
    const chains: Run[][] = [[]];
    for (const run of group.runs) {
      if (grouped.has(run.label)) continue;
      const chain = chains[chains.length - 1]!;
      if (chain.length > 0 && run.at - chain[chain.length - 1]!.at > GROUP_MAX_APART_PX) chains.push([run]);
      else chain.push(run);
    }
    for (const runs of chains) {
      if (runs.length < 2) continue;
      const members = new Set(runs.map((run) => run.label));
      const others = [...chips].flatMap(([label, rect]) => (members.has(label) ? [] : [rect]));
      let best: number | null = null;
      let bestScore: number[] = [];
      for (const line of clearLines.get(runs[0]!)!) {
        if (runs.some((run) => !clearLines.get(run)!.includes(line) || hits(run.label, centerOn(run, line), 0, others).count > 0)) continue;
        const score = [0, 0, 0, 0];
        for (const run of runs) {
          const center = centerOn(run, line);
          taste(run.label, center, others).forEach((value, index) => (score[index]! += value));
          score[3]! += (center.x - run.label.preferred.x) ** 2 + (center.y - run.label.preferred.y) ** 2;
        }
        if (best === null || lexLess(score, bestScore)) {
          best = line;
          bestScore = score;
        }
      }
      if (best === null) continue;
      for (const run of runs) {
        grouped.add(run.label);
        take(run.label, centerOn(run, best));
      }
    }
  }
  const moved = new Set([...grouped].map((label) => label.connection.id));
  // Document order, whichever pass placed the chip.
  const order = new Map(labels.map((label, index) => [label.connection.id, index]));
  return {
    points: new Map([...result].sort(([a], [b]) => order.get(a)! - order.get(b)!)),
    blocked: blocked.filter((id) => !moved.has(id)).sort((a, b) => order.get(a)! - order.get(b)!),
  };
}

/** A labelled wire as the placement reads it. */
interface Label {
  connection: InteractiveCanvasConnection;
  points: CanvasPoint[];
  /** The points where the wire turns. */
  corners: CanvasPoint[];
  width: number;
  height: number;
  selfLoop: boolean;
  /** The arc-length midpoint, or the drawer's pin. */
  preferred: CanvasPoint;
  pinned: boolean;
  /** The sections that hold both of the wire's ends. */
  home: ReadonlySet<string>;
}

/** A straight run of a wire that fits its chip: the chip's center may sit from `lo` to `hi` along it. */
interface Run { label: Label; horizontal: boolean; at: number; lo: number; hi: number; across: number }

function labelRuns(label: Label): Run[] {
  const runs: Run[] = [];
  for (let i = 1; i < label.points.length; i += 1) {
    const a = label.points[i - 1]!;
    const b = label.points[i]!;
    const horizontal = Math.abs(a.y - b.y) <= ROUTE_EPSILON_PX;
    if (horizontal === (Math.abs(a.x - b.x) <= ROUTE_EPSILON_PX)) continue;
    const half = (horizontal ? label.width : label.height) / 2;
    const lo = Math.min(horizontal ? a.x : a.y, horizontal ? b.x : b.y) + half;
    const hi = Math.max(horizontal ? a.x : a.y, horizontal ? b.x : b.y) - half;
    if (hi < lo) continue;
    runs.push({ label, horizontal, at: horizontal ? a.y : a.x, lo, hi, across: horizontal ? label.height : label.width });
  }
  return runs;
}

function centerOn(run: Run, line: number): CanvasPoint {
  return run.horizontal ? { x: line, y: run.at } : { x: run.at, y: line };
}

/** The last `length` px of `points`, from its end back: the stretch an arrowhead paints over. */
function lastRun(points: readonly CanvasPoint[], length: number): CanvasPoint[] {
  const out: CanvasPoint[] = [points[points.length - 1]!];
  let left = length;
  for (let i = points.length - 1; i > 0 && left > 0; i -= 1) {
    const a = points[i]!;
    const b = points[i - 1]!;
    const run = Math.hypot(b.x - a.x, b.y - a.y);
    if (run >= left) {
      out.push({ x: a.x + ((b.x - a.x) * left) / run, y: a.y + ((b.y - a.y) * left) / run });
      break;
    }
    out.push(b);
    left -= run;
  }
  return out;
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

type Score = [blocked: number, covered: number, bend: number, crowded: number, foreign: number, nearMisses: number, distance: number];

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
