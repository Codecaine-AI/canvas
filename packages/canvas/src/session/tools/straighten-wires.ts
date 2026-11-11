/**
 * Straighten wires — when two wired boxes sit a little off one axis, so their
 * wire takes a small jog, move one of them onto the axis.
 *
 * The board owner asks for it pin after pin: "The icon should be moved so
 * that it's in line with the green icon above it. And that the line is
 * straight." And for a box that sits in a frame: "the workflow event should
 * be centered within this box. And then, like, move so that this line is
 * straight."
 *
 * tighten_wires (./tighten-wires.ts) leaves these jogs, for two measured
 * reasons. On the 40 boards of rules climb round 1, 35 wires had a jog under
 * 40px.
 * - A drawer calls tighten_wires once and keeps editing: after the last call
 *   those boards took 1301 moves, 407 resizes and 27 new wires. So this pass
 *   runs on its own, on the wires each edit touches (operations/
 *   operation-tool.ts), and on every wire at the end of tighten_wires.
 * - tighten_wires works on the 20px agent grid and keeps a move that saves
 *   40px of wire cost. 17 of the 35 jogs were 2px: an icon 300 wide has its
 *   centre 2px off the 4px write grid, a decision 280 wide has it on the
 *   grid, and a decision has no flat side for the router to slide a port
 *   along. No move on the grid lines them up. So this pass works on the 4px
 *   write grid, and it can grow a node 4px across the wire, which moves its
 *   centre 2px.
 *
 * Method, one jog at a time, the smallest first:
 * - A jog is a wire whose two end runs are parallel and point the same way,
 *   with its ends under JOG_REACH apart across them.
 * - The candidates are each end, and each section above an end up to the
 *   section that holds both, slid across the wire by the offset. A section
 *   moves with what it holds. An end with a straight wire the slide would
 *   bend is also tried with its row: the boxes those wires join to it slide,
 *   and grow, with it.
 * - Each candidate is settled the way an edit is (a section grows to hold a
 *   moved child and makes room), then judged on the real routes. It is legal
 *   when the wire loses its jog and has fewer corners (none, unless it also
 *   goes round a box), nothing locked moves, nothing changes section, no box
 *   comes closer to another box or to its frame's border than tighten_wires
 *   allows (the frame moves with its box, not the box inside its frame), no
 *   wire breaks, no other wire loses a route drawn by hand, the board has
 *   fewer corners (so a jog never just moves to another wire), no two wires
 *   cross that did not cross before, and it has no more wire length, wire
 *   faults or findings of any check rule than before. After an edit, no box
 *   that edit moved goes back where it stood, also when it grows on the way.
 * - Of the legal candidates, the one that bends the fewest other wires wins.
 *   Ties go to the one that leaves a box the edit just placed where it is,
 *   then moves no row, then takes no grid step out of its frame's padding,
 *   then breaks the fewest rows and columns, then moves the fewest other
 *   boxes, then touches the fewest other wires, then the larger unit.
 *
 * Pure over the document: a settled document in, a settled document out.
 */
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../state/schema";
import type { CanvasStyle } from "../../theme/canvas-style";
import { kindOf } from "../../board/helpers";
import { FINISHING_RULES } from "../../board/lints";
import { routedPolyline, type Point, type Rect } from "../../board/lints/geometry";
import { runDiagnostics } from "../../board/lints/run";
import { newBrokenWires } from "../../board/wire-integrity";
import {
  GEOMETRY_NORMALIZATION_GRID,
  moveClosureIds,
  snapCanvasNumber,
  snapGeometry,
  translateWithDescendants,
} from "../../state/geometry";
import { reconcileConnectionWaypoints } from "../../state/actions/waypoints";
import { growSectionsToChildren, reconcileHolding } from "../../state/section-grow";
import { reconcileSectionMembership } from "../../state/section-membership";
import { lockHolding } from "./operations/op-context";
import {
  FRAME_PADDING,
  SECTION_GAP,
  SIBLING_GAP,
  boardFaults,
  crossingPairs,
  manhattan,
  routeAll,
  totalLength,
  type Routes,
} from "./tighten-wires";

export interface StraightenOptions {
  canvasStyle: CanvasStyle;
  /**
   * The board before the edit that made `document`. With it the pass works
   * only on the wires that edit touched, a box the edit placed moves only
   * when no other move straightens the wire as well (the other end comes to
   * the box the drawer just placed), and no move puts a box the edit moved
   * back where it stood: the edit is never undone.
   */
  since?: InteractiveCanvasDocument;
}

export interface StraightenMove {
  /** The wire that lost its jog. */
  wire: string;
  /** The corners it keeps: none when it went straight, some when it also goes round a box. */
  corners: number;
  /** The box that moved, with what it holds. */
  moved: string;
  dx: number;
  dy: number;
  /** The side that grew one grid step, when the box grew. */
  grew?: "width" | "height";
  /** The row that moved with the box, sections that grew to hold the move, and boxes they pushed clear. */
  alsoMoved: string[];
}

export interface StraightenResult {
  document: InteractiveCanvasDocument;
  moves: StraightenMove[];
}

/** Ends further apart than this across the wire make an elbow, not a jog. */
export const JOG_REACH = 40;
/** Ends closer than this sit on one axis. */
const ON_AXIS = 0.5;
const GRID = GEOMETRY_NORMALIZATION_GRID;
/** A wire that fails is tried again after other wires moved, this many times over. */
const ROUNDS = 3;

type Axis = "x" | "y";

interface Jog {
  edge: InteractiveCanvasConnection;
  /** The axis across the wire: the one a box slides along to line the ends up. */
  axis: Axis;
  /** How far the wire's end sits from its start on that axis. */
  offset: number;
}

interface Candidate {
  /** The box that moves, with what it holds. */
  unit: InteractiveCanvasObject;
  /** Sections between the unit and the wire's end: 0 for the end itself. */
  depth: number;
  slide: number;
  /** The unit, and its row, also grow one grid step across the wire. */
  grows: boolean;
  /** The boxes that slide and grow with the unit, so the straight wires that join them stay straight. */
  row: string[];
}

/** What the wires of a board cost a reader. */
interface Standing {
  routes: Routes;
  corners: Map<string, number>;
  cornerSum: number;
  /** The pairs of wires that cross. */
  crossings: ReadonlySet<string>;
  length: number;
}

/** What an edit did, as the pass sees it. */
interface Edit {
  /** Where each box the edit moved, and did not size, stood before it. */
  stood: ReadonlyMap<string, Rect>;
  /** The boxes the edit placed, moved or sized. */
  boxes: ReadonlySet<string>;
  /** The boxes the edit gave a new size: the pass never changes that size. */
  sized: ReadonlySet<string>;
  /** The wires the edit hands to the pass. */
  wires: ReadonlySet<string>;
}

interface Verdict {
  candidate: Candidate;
  document: InteractiveCanvasDocument;
  standing: Standing;
  /** The corners the wire keeps. */
  kept: number;
  alsoMoved: string[];
  /** Lower is better, compared entry by entry. */
  rank: number[];
}

/** The route's ends and corners: repeated points and points on a straight run dropped. */
function turns(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - point.x) < ON_AXIS && Math.abs(last.y - point.y) < ON_AXIS) continue;
    const prior = out[out.length - 2];
    if (last && prior) {
      const cross = (last.x - prior.x) * (point.y - last.y) - (last.y - prior.y) * (point.x - last.x);
      const dot = (last.x - prior.x) * (point.x - last.x) + (last.y - prior.y) * (point.y - last.y);
      if (Math.abs(cross) < 1e-6 && dot > 0) out.pop();
    }
    out.push(point);
  }
  return out;
}

function cornersOf(points: readonly Point[]): number {
  return Math.max(0, turns(points).length - 2);
}

function jogOf(edge: InteractiveCanvasConnection, points: readonly Point[]): Jog | null {
  if (edge.from.objectId === edge.to.objectId) return null;
  const path = turns(points);
  if (path.length < 3) return null;
  const first = path[0]!;
  const second = path[1]!;
  const penultimate = path[path.length - 2]!;
  const last = path[path.length - 1]!;
  const horizontal = (a: Point, b: Point) => Math.abs(a.y - b.y) < Math.abs(a.x - b.x);
  const along: Axis = horizontal(first, second) ? "x" : "y";
  if (horizontal(penultimate, last) !== (along === "x")) return null;
  // End runs that point two ways make a U: it keeps its corners wherever its boxes stand.
  if (Math.sign(second[along] - first[along]) !== Math.sign(last[along] - penultimate[along])) return null;
  const axis: Axis = along === "x" ? "y" : "x";
  const offset = last[axis] - first[axis];
  if (Math.abs(offset) < ON_AXIS || Math.abs(offset) >= JOG_REACH) return null;
  return { edge, axis, offset };
}

function standingOf(document: InteractiveCanvasDocument, canvasStyle: CanvasStyle): Standing {
  const routes = routeAll(document, canvasStyle);
  const corners = new Map([...routes].map(([id, points]) => [id, cornersOf(points)]));
  let cornerSum = 0;
  for (const count of corners.values()) cornerSum += count;
  return { routes, corners, cornerSum, crossings: crossingPairs(routes), length: totalLength(routes) };
}

function sameGeometry(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** Whether a box covers the place where it stood: it is back there, however many grid steps it grew on the way. */
function backWhereItStood(stood: Rect | undefined, now: Rect): boolean {
  return stood !== undefined
    && now.x <= stood.x && now.x + now.width >= stood.x + stood.width
    && now.y <= stood.y && now.y + now.height >= stood.y + stood.height;
}

/** The clear space between two boxes; negative when they overlap, by how deep. */
function gapBetween(a: Rect, b: Rect): number {
  return Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), a.y - (b.y + b.height), b.y - (a.y + a.height));
}

/**
 * The boxes that slide, and grow, with an end so that no straight wire bends:
 * each box joined to it, one after another, by a wire that runs straight the
 * way the jog's wire does.
 */
function rowOf(end: string, jog: Jog, current: InteractiveCanvasDocument, now: Standing): string[] {
  const row = new Set([end]);
  for (const member of row) {
    for (const edge of current.connections) {
      if (edge.id === jog.edge.id || now.corners.get(edge.id) !== 0) continue;
      const other = edge.from.objectId === member ? edge.to.objectId : edge.to.objectId === member ? edge.from.objectId : null;
      const points = now.routes.get(edge.id) ?? [];
      if (other === null || points.length < 2) continue;
      if (Math.abs(points[0]![jog.axis] - points[points.length - 1]![jog.axis]) < ON_AXIS) row.add(other);
    }
  }
  row.delete(end);
  return [...row];
}

function candidatesFor(jog: Jog, current: InteractiveCanvasDocument, now: Standing): Candidate[] {
  const byId = new Map(current.objects.map((object) => [object.id, object]));
  const chainOf = (id: string) => {
    const chain: InteractiveCanvasObject[] = [];
    for (
      let object = byId.get(id);
      object && !chain.includes(object);
      object = object.parentId ? byId.get(object.parentId) : undefined
    ) chain.push(object);
    return chain;
  };
  const fromChain = chainOf(jog.edge.from.objectId);
  const toChain = chainOf(jog.edge.to.objectId);
  const out: Candidate[] = [];
  for (const [chain, other, slide] of [[fromChain, toChain, jog.offset], [toChain, fromChain, -jog.offset]] as const) {
    for (const [depth, unit] of chain.entries()) {
      // A section that holds both ends carries the jog with it.
      if (other.includes(unit)) break;
      const joined = depth === 0 ? rowOf(unit.id, jog, current, now) : [];
      // A row that reaches the other end carries the jog with it.
      const rows: string[][] = joined.length > 0 && !joined.includes(other[0]!.id) ? [[], joined] : [[]];
      const whole = snapCanvasNumber(slide, GRID);
      // A node whose centre sits half a grid step off the other end's: one
      // grid step of size moves the centre that half step.
      const half = snapCanvasNumber(slide - GRID / 2, GRID);
      const offGrid = Math.abs(slide - whole) >= ON_AXIS && Math.abs(slide - GRID / 2 - half) < ON_AXIS;
      for (const row of rows) {
        if (whole !== 0) out.push({ unit, depth, slide: whole, grows: false, row });
        if (offGrid && depth === 0 && [unit.id, ...row].every((id) => kindOf(byId.get(id)!) === "node")) {
          out.push({ unit, depth, slide: half, grows: true, row });
        }
      }
    }
  }
  return out;
}

/**
 * The wires routed by hand, after a candidate moved their ends. The jog's own
 * corners go: they drew the jog. Corners between two ends that moved as one
 * move with them. A wire with one end moved keeps its corners where they are
 * when that end slid along the run that leaves it, so the run only changes
 * length. Null when another hand-routed wire would lose its route.
 *
 * The canvas reducer drops a route when one end moves (state/actions/
 * waypoints.ts), so a board replayed through it re-routes a wire kept here.
 * A board the toolkit saves keeps it.
 */
function handRoutes(
  current: InteractiveCanvasDocument,
  next: InteractiveCanvasDocument,
  routes: Routes,
  jog: Jog,
): InteractiveCanvasDocument | null {
  // Corners between ends that moved as one are moved; every other corner on a moved end is dropped.
  const reconciled = reconcileConnectionWaypoints(current, next);
  if (reconciled === next) return next;
  const was = new Map(current.objects.map((object) => [object.id, object.geometry]));
  const is = new Map(next.objects.map((object) => [object.id, object.geometry]));
  const drawn = new Map(current.connections.map((edge) => [edge.id, edge]));
  const slidAlong = (edge: InteractiveCanvasConnection, end: "from" | "to") => {
    const before = was.get(edge[end].objectId);
    const after = is.get(edge[end].objectId);
    if (!before || !after || sameGeometry(before, after)) return true;
    const route = routes.get(edge.id) ?? [];
    const port = end === "from" ? route[0] : route[route.length - 1];
    const corner = end === "from" ? edge.waypoints![0] : edge.waypoints![edge.waypoints!.length - 1];
    if (!port || !corner) return false;
    const [x, y] = corner;
    // The run from the port to its first corner, and the box unchanged across it.
    if (Math.abs(x - port.x) < 1 && before.x === after.x && before.width === after.width) {
      return y < Math.min(before.y, after.y) || y > Math.max(before.y + before.height, after.y + after.height);
    }
    if (Math.abs(y - port.y) < 1 && before.y === after.y && before.height === after.height) {
      return x < Math.min(before.x, after.x) || x > Math.max(before.x + before.width, after.x + after.width);
    }
    return false;
  };
  let lost = false;
  const connections = reconciled.connections.map((edge) => {
    const hand = drawn.get(edge.id);
    if (edge.waypoints?.length || !hand?.waypoints?.length || edge.id === jog.edge.id) return edge;
    if (slidAlong(hand, "from") && slidAlong(hand, "to")) return { ...edge, waypoints: hand.waypoints };
    lost = true;
    return edge;
  });
  return lost ? null : { ...reconciled, connections };
}

/**
 * The board with the candidate made and settled the way the operation
 * pipeline settles an edit: the unit keeps its section, which grows to hold
 * it and makes room. Null when a section cannot grow, when anything would
 * change section, or when a hand-routed wire would lose its route.
 */
function settled(
  current: InteractiveCanvasDocument,
  routes: Routes,
  jog: Jog,
  candidate: Candidate,
  stuck: ReadonlySet<string>,
): InteractiveCanvasDocument | null {
  const { axis } = jog;
  const { unit, slide, grows, row } = candidate;
  const size = axis === "x" ? "width" : "height";
  const sliding = [unit.id, ...row];
  const objects = translateWithDescendants(current, sliding, axis === "x" ? { dx: slide, dy: 0 } : { dx: 0, dy: slide })
    .map((object) => (grows && sliding.includes(object.id)
      ? { ...object, geometry: { ...object.geometry, [size]: object.geometry[size] + GRID } }
      : object));
  const was = new Map(current.objects.map((object) => [object.id, object]));
  const held = new Map(sliding.map((id) => [id, was.get(id)?.parentId ?? null]));
  const grow = growSectionsToChildren(reconcileHolding({ ...current, objects }, held), held, { makeRoom: true });
  if (grow.blocked.some((entry) => !stuck.has(entry.section))) return null;
  // Every changed box lands on the write grid, so a replay of the board keeps it.
  const onGrid = {
    ...grow.document,
    objects: grow.document.objects.map((object) => {
      const before = was.get(object.id);
      return before && sameGeometry(before.geometry, object.geometry)
        ? object
        : { ...object, geometry: snapGeometry(object.geometry, GRID) };
    }),
  };
  const routed = handRoutes(current, onGrid, routes, jog);
  if (!routed) return null;
  const next = reconcileSectionMembership(routed);
  if (next.objects.some((object) => (object.parentId ?? null) !== (was.get(object.id)?.parentId ?? null))) return null;
  return next;
}

/**
 * Whether a changed box comes closer to another box than it stood, inside
 * the gap tighten_wires keeps between boxes. A box that grows a grid step can
 * take that step out of a gap, and never the whole gap.
 */
function crowds(
  current: InteractiveCanvasDocument,
  next: InteractiveCanvasDocument,
  changed: ReadonlySet<string>,
  grown: ReadonlySet<string>,
): boolean {
  const was = new Map(current.objects.map((object) => [object.id, object]));
  const holds = (ancestor: string, id: string) => {
    for (let parent = was.get(id)?.parentId, guard = 0; parent && guard <= was.size; parent = was.get(parent)?.parentId, guard += 1) {
      if (parent === ancestor) return true;
    }
    return false;
  };
  for (const object of next.objects) {
    if (!changed.has(object.id)) continue;
    for (const other of next.objects) {
      if (other.id === object.id || holds(object.id, other.id) || holds(other.id, object.id)) continue;
      const before = gapBetween(was.get(object.id)!.geometry, was.get(other.id)!.geometry);
      const after = gapBetween(object.geometry, other.geometry);
      const kept = kindOf(object) === "section" && kindOf(other) === "section" ? SECTION_GAP : SIBLING_GAP;
      const slack = grown.has(object.id) || grown.has(other.id) ? GRID : 0;
      if (after < Math.min(before, kept) - slack || after < Math.min(before, 1)) return true;
    }
  }
  return false;
}

/** Siblings left behind that share an edge or a centre line with the box on the axis it slides along: a row or column the slide breaks. */
function sharedLines(document: InteractiveCanvasDocument, { unit, row }: Candidate, axis: Axis): number {
  const size = axis === "x" ? "width" : "height";
  const lines = (rect: Rect) => [rect[axis], rect[axis] + rect[size] / 2, rect[axis] + rect[size]];
  const own = lines(unit.geometry);
  return document.objects.filter((object) =>
    object.id !== unit.id
    && !row.includes(object.id)
    && (object.parentId ?? null) === (unit.parentId ?? null)
    && lines(object.geometry).some((line, index) => Math.abs(line - own[index]!) < ON_AXIS)).length;
}

/**
 * How far the slide takes a box toward its section's border, inside the
 * padding tighten_wires keeps there: the box no longer sits where its frame
 * was drawn round it, and the wires that leave it lose their room.
 */
function squeeze(current: InteractiveCanvasDocument, next: InteractiveCanvasDocument, { unit, row }: Candidate): number {
  const margin = (document: InteractiveCanvasDocument, id: string) => {
    const box = document.objects.find((object) => object.id === id)!;
    const frame = document.objects.find((object) => object.id === box.parentId)?.geometry;
    if (!frame) return Infinity;
    const { x, y, width, height } = box.geometry;
    return Math.min(x - frame.x, frame.x + frame.width - (x + width), y - frame.y, frame.y + frame.height - (y + height));
  };
  return Math.max(0, ...[unit.id, ...row].map((id) => {
    const after = margin(next, id);
    return after < FRAME_PADDING ? margin(current, id) - after : 0;
  }));
}

/**
 * What canvas_check would count against the board: the wire and label faults
 * tighten_wires counts, and the findings of each check rule.
 */
function blemishes(document: InteractiveCanvasDocument, routes: Routes, canvasStyle: CanvasStyle): Map<string, number> {
  const counts = new Map([["faults", boardFaults(document, routes, canvasStyle)]]);
  for (const finding of runDiagnostics(document, FINISHING_RULES, { canvasStyle })) {
    counts.set(finding.rule, (counts.get(finding.rule) ?? 0) + 1);
  }
  return counts;
}

/** The candidate judged on everything but the blemishes; null when it is not legal. */
function judge(
  current: InteractiveCanvasDocument,
  now: Standing,
  jog: Jog,
  candidate: Candidate,
  stuck: ReadonlySet<string>,
  edit: Edit | null,
  canvasStyle: CanvasStyle,
): Verdict | null {
  const next = settled(current, now.routes, jog, candidate, stuck);
  if (!next) return null;
  const was = new Map(current.objects.map((object) => [object.id, object]));
  const changed = new Set(next.objects
    .filter((object) => !sameGeometry(was.get(object.id)!.geometry, object.geometry))
    .map((object) => object.id));
  // A move that takes a box the edit moved back where it stood takes the edit back.
  if (edit && next.objects.some((object) => backWhereItStood(edit.stood.get(object.id), object.geometry))) return null;
  // A size the edit just set is the drawer's: a candidate that changes it takes the edit back.
  if (edit && next.objects.some((object) => {
    const before = was.get(object.id)!.geometry;
    return edit.sized.has(object.id) && (object.geometry.width !== before.width || object.geometry.height !== before.height);
  })) return null;
  for (const id of changed) if (lockHolding(current, id)) return null;
  if (crowds(current, next, changed, new Set(candidate.grows ? [candidate.unit.id, ...candidate.row] : []))) return null;
  // A box that grows a grid step can take that step out of its frame's padding, and no more.
  const squeezed = squeeze(current, next, candidate);
  if (squeezed > (candidate.grows ? GRID : 0)) return null;
  if (newBrokenWires(current, next).length > 0) return null;

  const standing = standingOf(next, canvasStyle);
  // The wire loses its jog and the two corners the jog made. A wire that
  // also goes round a box keeps the corners of that detour.
  const kept = standing.corners.get(jog.edge.id) ?? 0;
  if (jogOf(jog.edge, standing.routes.get(jog.edge.id) ?? []) || kept >= (now.corners.get(jog.edge.id) ?? 0)) return null;
  if (standing.cornerSum >= now.cornerSum || standing.length > now.length + ON_AXIS) return null;
  for (const pair of standing.crossings) if (!now.crossings.has(pair)) return null;

  let bent = 0;
  let touched = 0;
  for (const [id, points] of standing.routes) {
    if (id === jog.edge.id) continue;
    const corners = standing.corners.get(id)!;
    const before = now.corners.get(id) ?? 0;
    if (corners > before) bent += 1;
    if (corners !== before || Math.abs(manhattan(points) - manhattan(now.routes.get(id) ?? [])) >= ON_AXIS) touched += 1;
  }
  const unit = moveClosureIds(current, [candidate.unit.id]);
  const alsoMoved = [...changed].filter((id) => !unit.has(id));
  const carried = moveClosureIds(current, [candidate.unit.id, ...candidate.row]);
  return {
    candidate,
    document: next,
    standing,
    kept,
    alsoMoved,
    rank: [
      bent,
      kept,
      edit && [...carried].some((id) => edit.boxes.has(id)) ? 1 : 0,
      candidate.row.length,
      squeezed > 0 ? 1 : 0,
      candidate.slide === 0 ? 0 : sharedLines(current, candidate, jog.axis),
      alsoMoved.length,
      touched,
      -candidate.depth,
      // An icon's tile sits at the centre of its box: a wider box shows nothing.
      candidate.grows ? (candidate.unit.type === "icon" ? 1 : 2) : 0,
      Math.round(standing.length),
    ],
  };
}

function better(a: Verdict, b: Verdict): number {
  for (let index = 0; index < a.rank.length; index += 1) {
    if (a.rank[index] !== b.rank[index]) return a.rank[index]! - b.rank[index]!;
  }
  return 0;
}

function straightenOne(
  current: InteractiveCanvasDocument,
  now: Standing,
  jog: Jog,
  edit: Edit | null,
  canvasStyle: CanvasStyle,
): Verdict | null {
  // A section that could not grow before the move does not block it.
  const stuck = new Set(growSectionsToChildren(current, undefined, { makeRoom: true }).blocked.map((entry) => entry.section));
  const verdicts = candidatesFor(jog, current, now)
    .map((candidate) => judge(current, now, jog, candidate, stuck, edit, canvasStyle))
    .filter((verdict): verdict is Verdict => verdict !== null)
    .sort(better);
  if (verdicts.length === 0) return null;
  // The costly check last, on the best first: a move may not add a fault or a check finding.
  const had = blemishes(current, now.routes, canvasStyle);
  return verdicts.find((verdict) =>
    [...blemishes(verdict.document, verdict.standing.routes, canvasStyle)]
      .every(([kind, count]) => count <= (had.get(kind) ?? 0))) ?? null;
}

export function straightenWires(document: InteractiveCanvasDocument, options: StraightenOptions): StraightenResult {
  const { canvasStyle } = options;
  const edit = options.since ? editOf(options.since, document) : null;
  const inScope = document.connections.filter((edge) => !edit || edit.wires.has(edge.id));
  // The cheap exit: most edits leave no jog on the wires they touch.
  if (!inScope.some((edge) => jogOf(edge, routedPolyline(edge, document, canvasStyle)))) return { document, moves: [] };

  let current = document;
  let now = standingOf(current, canvasStyle);
  const moves: StraightenMove[] = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    const jogs = inScope
      .map((edge) => jogOf(edge, now.routes.get(edge.id) ?? []))
      .filter((jog): jog is Jog => jog !== null)
      .sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset));
    let progressed = false;
    for (const { edge } of jogs) {
      // An earlier move of this round can have straightened or re-routed this wire.
      const jog = jogOf(edge, now.routes.get(edge.id) ?? []);
      const verdict = jog ? straightenOne(current, now, jog, edit, canvasStyle) : null;
      if (!jog || !verdict) continue;
      const { unit, slide, grows } = verdict.candidate;
      moves.push({
        wire: edge.id,
        corners: verdict.kept,
        moved: unit.id,
        dx: jog.axis === "x" ? slide : 0,
        dy: jog.axis === "y" ? slide : 0,
        ...(grows ? { grew: jog.axis === "x" ? "width" as const : "height" as const } : {}),
        alsoMoved: verdict.alsoMoved,
      });
      current = verdict.document;
      now = verdict.standing;
      progressed = true;
    }
    if (!progressed) break;
  }
  return { document: current, moves };
}

/**
 * The wires an edit hands to the pass are each wire it added or changed, and
 * each wire on a box it placed, moved, sized or gave a new shape. A wire
 * routed by hand is not one of them: its corners are the drawer's own line,
 * and only a tighten_wires call replaces that line.
 */
function editOf(before: InteractiveCanvasDocument, after: InteractiveCanvasDocument): Edit {
  const was = new Map(before.objects.map((object) => [object.id, object]));
  const drawn = new Map(before.connections.map((edge) => [edge.id, edge]));
  const boxes = new Set<string>();
  const stood = new Map<string, Rect>();
  const sized = new Set<string>();
  // A new shape has its ports in new places.
  const ends = new Set<string>();
  for (const object of after.objects) {
    const old = was.get(object.id);
    const placed = !old || !sameGeometry(old.geometry, object.geometry);
    if (placed) boxes.add(object.id);
    if (placed && old && old.geometry.width === object.geometry.width && old.geometry.height === object.geometry.height) {
      stood.set(object.id, old.geometry);
    } else if (placed && old) {
      sized.add(object.id);
    }
    if (placed || old.type !== object.type) ends.add(object.id);
  }
  const wires = new Set(after.connections
    .filter((edge) => !edge.waypoints?.length
      && (ends.has(edge.from.objectId) || ends.has(edge.to.objectId)
        || JSON.stringify(drawn.get(edge.id)) !== JSON.stringify(edge)))
    .map((edge) => edge.id));
  return { stood, boxes, sized, wires };
}

/** One line for the tool result: which wire went straight and what moved for it. */
export function describeStraightening(move: StraightenMove): string {
  const distance = Math.abs(move.dx + move.dy);
  const slid = distance === 0
    ? null
    : `moved ${move.moved} ${distance}px ${move.dx !== 0 ? (move.dx > 0 ? "right" : "left") : (move.dy > 0 ? "down" : "up")}`;
  const grew = move.grew ? `made ${move.moved} ${GRID}px ${move.grew === "width" ? "wider" : "taller"}` : null;
  const also = move.alsoMoved.length > 0 ? `, which also moved or grew ${move.alsoMoved.join(", ")}` : "";
  const did = move.corners === 0 ? `straightened ${move.wire}` : `took the jog out of ${move.wire}`;
  return `${did}: ${[slid, grew].filter(Boolean).join(" and ")}${also}`;
}
