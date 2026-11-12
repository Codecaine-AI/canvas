/**
 * The routed facts of every wire on a board, as the renderer draws it: the
 * wire sheet a reviewer reads, and the before and after numbers of a trial.
 * Ford: "if it's given a section, it also then gets to see the like, all of
 * the arrows and so it can, like, propose different routings".
 *
 * Every number comes from the canvas engine's own route, never from the
 * picture. The canvas modules load by path at run time, as render.ts loads
 * its own.
 */
import { resolve } from "node:path";

import { CANVAS_REPO_ROOT } from "./paths.ts";
import type { CanvasFile, WorldRect } from "./render.ts";

export interface Point { x: number; y: number }

interface WireObject { id: string; type: string; parentId?: string | null; geometry: WorldRect }
interface WireConnection {
  id: string;
  from: { objectId: string };
  to: { objectId: string };
  label?: string;
  style?: string;
  color?: string;
  arrow?: string;
  waypoints?: unknown[];
}
interface WireBoard { objects: WireObject[]; connections: WireConnection[] }
interface Routed { start: Point; end: Point; startAnchor: string; endAnchor: string; points?: Point[] }

/** The slice of `@codecaine-ai/canvas` the wire facts call. */
export interface WireModules {
  routing: {
    routeConnectionOnBoard(board: unknown, connection: unknown, from: unknown, to: unknown, canvasStyle: unknown): Routed;
    chipPointOnRoute(point: Point, routed: Routed, connection: unknown): Point;
  };
  placement: { placedLabelPoint(routed: Routed, connection: unknown, board: unknown, canvasStyle: unknown): Point };
  geometry: {
    pathBoxViolationIds(points: readonly Point[], fromId: string, toId: string, objects: readonly unknown[], canvasStyle: unknown): string[];
    crossingPoints(a: readonly Point[], b: readonly Point[]): Point[];
  };
  edgeRoute: {
    numberedSegmentsForPolyline(points: readonly Point[]): unknown[];
    formatNumberedSegments(fromId: string, toId: string, segments: readonly unknown[]): string;
  };
  layout: {
    layoutNumbers(board: unknown, canvasStyle: unknown): BoardTotals;
    layoutBlock(numbers: BoardTotals): string;
  };
}

export async function loadWireModules(root = CANVAS_REPO_ROOT): Promise<WireModules> {
  const source = (path: string) => import(resolve(root, "packages/canvas/src", path));
  return {
    routing: (await source("connectors/routing.ts")) as WireModules["routing"],
    placement: (await source("connectors/label-placement.ts")) as WireModules["placement"],
    geometry: (await source("board/lints/geometry.ts")) as WireModules["geometry"],
    edgeRoute: (await source("board/edge-route.ts")) as WireModules["edgeRoute"],
    layout: (await source("board/layout-numbers.ts")) as WireModules["layout"],
  };
}

/** What canvas_check prints as its LAYOUT block (board/layout-numbers.ts). */
export interface BoardTotals {
  wireLength: number;
  crossings: number;
  crossingPairs: number;
  topCrossingPairs: Array<{ a: string; b: string; crossings: number }>;
  topTraversals: Array<{ wire: string; section: string; run: number }>;
  longestWires: Array<{ wire: string; length: number }>;
  blockedLabels: readonly string[];
}

export interface WireFact {
  id: string;
  from: string;
  to: string;
  /** The sides the wire leaves and enters by: top, right, bottom, left. */
  ports: { from: string; to: string };
  /** The routed corner points, both ends included, in board coordinates. */
  points: Point[];
  /** Routed length in px, rounded. */
  length: number;
  /** Changes of direction along the route. */
  bends: number;
  /** True when the wire keeps hand-set corners (`route` with `points` or `shift`). `change_connection` drops them. */
  byHand: boolean;
  style: string;
  colour: string;
  arrow: string;
  label: string;
  /** The centre of the label chip as the board paints it, or null with no label. */
  labelAt: Point | null;
  /** The route as the canvas prints it. Its segment numbers (s0, s1, ...) are the ones the `route` tool takes. */
  route: string;
  /** Boxes the wire runs through that hold neither of its ends. */
  through: string[];
  /** Wires it crosses, by the rule the board totals count crossings with. */
  crosses: string[];
  /** Wires that run on top of it (a shared trunk), and for how many px. */
  trunks: Array<{ wire: string; length: number }>;
}

/** Two wires on one node can meet where they leave it. The board totals do not count that as a crossing (layout-numbers.ts). */
const SHARED_END_MARGIN = 24;
/** Two runs share a trunk when they lie on one line (within 1 px) for more than this many px. */
const TRUNK_MIN_PX = 20;

const bendsOf = (points: Point[]): number => {
  const axes = points.slice(1).map((point, index) => point.y === points[index]!.y ? "h" : point.x === points[index]!.x ? "v" : "d");
  return axes.slice(1).filter((axis, index) => axis !== axes[index]).length;
};
const lengthOf = (points: Point[]): number =>
  points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y), 0);

/** The px two polylines run on one line, summed over their straight runs. */
export function sharedRun(a: Point[], b: Point[]): number {
  let total = 0;
  for (let i = 1; i < a.length; i += 1) for (let j = 1; j < b.length; j += 1) {
    const [p, q, r, s] = [a[i - 1]!, a[i]!, b[j - 1]!, b[j]!];
    for (const [fixed, along] of [["x", "y"], ["y", "x"]] as const) {
      if (p[fixed] !== q[fixed] || r[fixed] !== s[fixed] || Math.abs(p[fixed] - r[fixed]) >= 1) continue;
      const run = Math.min(Math.max(p[along], q[along]), Math.max(r[along], s[along])) - Math.max(Math.min(p[along], q[along]), Math.min(r[along], s[along]));
      if (run > TRUNK_MIN_PX) total += run;
    }
  }
  return Math.round(total);
}

/** Every routable wire of the board, in board order. A wire with a missing end is left out. */
export function wireFacts(modules: WireModules, file: CanvasFile): WireFact[] {
  const board = file.persisted as WireBoard;
  const style = file.session.canvasStyle;
  const byId = new Map(board.objects.map((object) => [object.id, object]));
  const routed = board.connections.flatMap((wire) => {
    const from = byId.get(wire.from.objectId);
    const to = byId.get(wire.to.objectId);
    if (!from || !to) return [];
    const route = modules.routing.routeConnectionOnBoard(board, wire, from, to, style);
    return [{ wire, route, points: route.points ?? [route.start, route.end] }];
  });
  const inside = (point: Point, rect: WorldRect) =>
    point.x >= rect.x - SHARED_END_MARGIN && point.x <= rect.x + rect.width + SHARED_END_MARGIN
    && point.y >= rect.y - SHARED_END_MARGIN && point.y <= rect.y + rect.height + SHARED_END_MARGIN;
  return routed.map(({ wire, route, points }): WireFact => {
    const ends = [wire.from.objectId, wire.to.objectId];
    const others = routed.filter((other) => other.wire.id !== wire.id);
    const crosses = others.filter((other) => {
      const near = [other.wire.from.objectId, other.wire.to.objectId].filter((id) => ends.includes(id)).map((id) => byId.get(id)!.geometry);
      return modules.geometry.crossingPoints(points, other.points).some((point) => !near.some((rect) => inside(point, rect)));
    });
    const label = wire.label ?? "";
    const at = label ? modules.routing.chipPointOnRoute(modules.placement.placedLabelPoint(route, wire, board, style), route, wire) : null;
    return {
      id: wire.id,
      from: wire.from.objectId,
      to: wire.to.objectId,
      ports: { from: route.startAnchor, to: route.endAnchor },
      points: points.map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) })),
      length: Math.round(lengthOf(points)),
      bends: bendsOf(points),
      byHand: Boolean(wire.waypoints?.length),
      style: wire.style ?? "solid",
      colour: wire.color ?? "default",
      arrow: wire.arrow ?? "forward",
      label,
      labelAt: at && { x: Math.round(at.x), y: Math.round(at.y) },
      route: modules.edgeRoute.formatNumberedSegments(ends[0]!, ends[1]!, modules.edgeRoute.numberedSegmentsForPolyline(points)),
      through: ends[0] === ends[1] ? [] : modules.geometry.pathBoxViolationIds(points, ends[0]!, ends[1]!, board.objects, style),
      crosses: crosses.map((other) => other.wire.id),
      trunks: others.map((other) => ({ wire: other.wire.id, length: sharedRun(points, other.points) })).filter((trunk) => trunk.length > 0),
    };
  });
}

/** The board's layout totals, and the LAYOUT block canvas_check prints for them. */
export function boardTotals(modules: WireModules, file: CanvasFile): { totals: BoardTotals; text: string } {
  const totals = modules.layout.layoutNumbers(file.persisted, file.session.canvasStyle);
  return { totals, text: modules.layout.layoutBlock(totals) };
}
