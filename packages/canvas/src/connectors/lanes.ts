/**
 * The board's lane pass. The router draws each wire alone, so two wires often
 * pick the same run and paint as one line. This pass reads every routed wire
 * of a board and moves runs apart into parallel lanes:
 *
 * - Wires that leave one port with one meaning (colour, dash, head) are one
 *   trunk: they stay on one line until they branch.
 * - Wires that end on one port with one dash are one junction: they join and
 *   share the arrowhead.
 * - Every other pair that would share a run gets lanes LANE_GAP_PX apart. An
 *   incoming and an outgoing wire never share a port.
 *
 * It is pure geometry: routing.ts hands it polylines and gets polylines back.
 */
import type { CanvasPoint } from "../state/geometry";

/** Distance between two lanes, and between two ports the pass spreads on one side. */
export const LANE_GAP_PX = 16;
/** Two parallel runs closer than this read as one line. */
const CONFLICT_GAP_PX = 10;
/** Shortest shared stretch that counts: a shorter one is two corners passing. */
const CONFLICT_RUN_PX = 12;
/** A lane a run moves into stays this clear of every other wire. */
const LANE_CLEAR_PX = 12;
/** Shortest run a move may leave next to an end (the router's stub) and between two corners. */
const MIN_END_RUN_PX = 24;
const MIN_INNER_RUN_PX = 8;
const SAME_PX = 0.5;
const EPSILON = 0.01;
/** How many lanes to each side a run may move. */
const MAX_LANE_STEPS = 6;
/** Ports that land on a neighbour port lose to any line-up that stays clear. */
const CROWDED_COST = 1e6;
const MAX_UNCROSS_PASSES = 4;
/** Ports a side can only hold closer than this stay where they are. */
const MIN_PORT_GAP_PX = 4;
/**
 * Wires of several colours that end on one port stay one junction with one
 * arrowhead. Set false to give each colour its own lane and head there.
 */
const JUNCTION_MERGES_COLOURS = true;

export type LaneSpan = { min: number; max: number };

export type LaneWire = {
  id: string;
  from: string;
  to: string;
  color: string;
  dash: string;
  headAtStart: boolean;
  headAtEnd: boolean;
  /** The routed polyline, start to end. */
  points: ReadonlyArray<CanvasPoint>;
  /** The author placed this wire's corners: its lanes stay, only its end runs follow their ports. */
  lanesFixed: boolean;
  /** Room for the port on the side each end sits on, along that side. Null: the end stays. */
  startSpan: LaneSpan | null;
  endSpan: LaneSpan | null;
  /** How many boxes and own captions a polyline of this wire runs through. */
  blockers: (points: ReadonlyArray<CanvasPoint>) => number;
};

type Axis = "h" | "v";
type Wire = { wire: LaneWire; points: CanvasPoint[]; blocked: number; moved: boolean };
type Segment = { wire: Wire; index: number; at: number; lo: number; hi: number };

/** The moved polylines by wire id. A wire the pass left alone is absent. */
export function assignLanes(laneWires: ReadonlyArray<LaneWire>): Map<string, CanvasPoint[]> {
  const wires: Wire[] = [];
  for (const wire of laneWires) {
    const points = simplified(wire.points);
    if (wire.from === wire.to || !isLaneable(points)) continue;
    wires.push({ wire, points, blocked: -1, moved: false });
  }
  spreadPorts(wires);
  for (let round = 0; round < 2; round += 1) {
    separateRuns(wires, "v");
    separateRuns(wires, "h");
  }
  uncrossRuns(wires, "v");
  uncrossRuns(wires, "h");
  const result = new Map<string, CanvasPoint[]>();
  for (const wire of wires) {
    if (wire.moved) result.set(wire.wire.id, simplified(wire.points));
  }
  return result;
}

/** `points` without repeats and without the points a straight run passes through. */
export function simplified(points: ReadonlyArray<CanvasPoint>): CanvasPoint[] {
  const result: CanvasPoint[] = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (last && Math.abs(last.x - point.x) <= EPSILON && Math.abs(last.y - point.y) <= EPSILON) continue;
    const before = result[result.length - 2];
    if (last && before) {
      const sameRun =
        (Math.abs(before.x - last.x) <= EPSILON && Math.abs(last.x - point.x) <= EPSILON && Math.sign(last.y - before.y) === Math.sign(point.y - last.y)) ||
        (Math.abs(before.y - last.y) <= EPSILON && Math.abs(last.y - point.y) <= EPSILON && Math.sign(last.x - before.x) === Math.sign(point.x - last.x));
      if (sameRun) result.pop();
    }
    result.push({ x: point.x, y: point.y });
  }
  return result;
}

function axisOf(a: CanvasPoint, b: CanvasPoint): Axis | null {
  if (Math.abs(a.y - b.y) <= EPSILON && Math.abs(a.x - b.x) > EPSILON) return "h";
  if (Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) > EPSILON) return "v";
  return null;
}

/** Runs are axis-aligned and turn at every corner. */
function isLaneable(points: ReadonlyArray<CanvasPoint>): boolean {
  if (points.length < 2) return false;
  let previous: Axis | null = null;
  for (let index = 1; index < points.length; index += 1) {
    const axis = axisOf(points[index - 1]!, points[index]!);
    if (!axis || axis === previous) return false;
    previous = axis;
  }
  return true;
}

/** The coordinate a run on `axis` holds constant, and the one it runs along. */
const across = (axis: Axis): "x" | "y" => (axis === "h" ? "y" : "x");
const along = (axis: Axis): "x" | "y" => (axis === "h" ? "x" : "y");

function blockedBy(wire: Wire, points: ReadonlyArray<CanvasPoint>): number {
  if (wire.blocked < 0) wire.blocked = wire.wire.blockers(wire.points);
  return wire.wire.blockers(points);
}

function clonePoints(points: ReadonlyArray<CanvasPoint>): CanvasPoint[] {
  return points.map((point) => ({ x: point.x, y: point.y }));
}

// ---------------------------------------------------------------------------
// Ports: wire ends that meet on one node side.

type End = {
  wire: Wire;
  atStart: boolean;
  /** Position along the node side. */
  at: number;
  /** One group shares one port. */
  group: string;
  /** Sorts ports so the wires leave without crossing: first the ends that turn back along the side, nearest turn first. */
  order: number;
  straight: boolean;
  span: LaneSpan | null;
};

function endOf(wire: Wire, atStart: boolean): { end: End; side: string } | null {
  const points = wire.points;
  const tip = points[atStart ? 0 : points.length - 1]!;
  const corner = points[atStart ? 1 : points.length - 2]!;
  const axis = axisOf(tip, corner);
  if (!axis) return null;
  const side = across(axis);
  const run = along(axis);
  const beyond = points[atStart ? 2 : points.length - 3];
  const { color, dash, headAtStart, headAtEnd } = wire.wire;
  return {
    side: `${atStart ? wire.wire.from : wire.wire.to}|${axis}|${Math.sign(corner[run] - tip[run])}|${Math.round(tip[run])}`,
    end: {
      wire,
      atStart,
      at: tip[side],
      group: atStart
        ? `out|${color}|${dash}|${headAtStart}`
        : `in|${JUNCTION_MERGES_COLOURS ? "" : color}|${dash}|${headAtEnd}`,
      order: beyond ? Math.sign(beyond[side] - corner[side]) / (1 + Math.abs(corner[run] - tip[run])) : 0,
      straight: !beyond,
      span: atStart ? wire.wire.startSpan : wire.wire.endSpan,
    },
  };
}

function spreadPorts(wires: ReadonlyArray<Wire>): void {
  const sides = new Map<string, End[]>();
  for (const wire of wires) {
    for (const atStart of [true, false]) {
      const found = endOf(wire, atStart);
      if (!found) continue;
      const ends = sides.get(found.side);
      if (ends) ends.push(found.end);
      else sides.set(found.side, [found.end]);
    }
  }
  for (const ends of sides.values()) {
    ends.sort((a, b) => a.at - b.at);
    const clusters: End[][] = [];
    for (const end of ends) {
      const cluster = clusters[clusters.length - 1];
      if (cluster && end.at - cluster[cluster.length - 1]!.at < CONFLICT_GAP_PX) cluster.push(end);
      else clusters.push([end]);
    }
    const settled = new Set<End[]>();
    for (const cluster of clusters) {
      if (settled.has(cluster) || cluster.length < 2) continue;
      // A line-up that lands on a neighbour port takes that port in and lines up again.
      const members = [cluster];
      for (;;) {
        const crowding = lineUpPorts(members, clusters.filter((other) => !members.includes(other)));
        if (crowding.length === 0) break;
        members.push(...crowding);
      }
      for (const member of members) settled.add(member);
    }
  }
}

type Port = { ends: End[]; order: number; at: number; straight: End | undefined };

/**
 * Gives each meaning in `members` one port, LANE_GAP_PX apart. Returns the
 * neighbour clusters the line-up lands on when taking them in can clear it.
 */
function lineUpPorts(members: ReadonlyArray<ReadonlyArray<End>>, others: ReadonlyArray<End[]>): End[][] {
  const all = members.flat();
  const span = all.find((end) => end.span)?.span;
  if (!span) return [];
  // A neighbour port taken in stays a port of its own.
  const groups = new Map<string, End[]>();
  members.forEach((cluster, index) => {
    for (const end of cluster) {
      const key = `${index}|${end.group}`;
      const group = groups.get(key);
      if (group) group.push(end);
      else groups.set(key, [end]);
    }
  });
  const ports: Port[] = [...groups.values()]
    .map((ends) => ({
      ends,
      order: ends.reduce((sum, end) => sum + end.order, 0) / ends.length,
      at: ends.reduce((sum, end) => sum + end.at, 0) / ends.length,
      straight: ends.find((end) => end.straight),
    }))
    .sort((a, b) => a.order - b.order || a.at - b.at);
  const first = Math.min(...all.map((end) => end.at));
  const last = Math.max(...all.map((end) => end.at));
  if (ports.length === 1 && last - first <= SAME_PX) return [];

  // A straight wire keeps its port and the others line up on its two sides.
  // Else the ports line up where they move their ends the least. A side too
  // short for LANE_GAP_PX packs its ports closer.
  const anchors = ports.filter((port) => port.straight);
  if (anchors.length > 1) return [];
  const anchor = ports.indexOf(anchors[0]!);
  const lineUps: number[][] = [];
  if (anchor >= 0) {
    const at = ports[anchor]!.straight!.at;
    const after = ports.length - 1 - anchor;
    const gapBefore = anchor > 0 ? Math.min(LANE_GAP_PX, Math.max(0, at - span.min) / anchor) : 0;
    const gapAfter = after > 0 ? Math.min(LANE_GAP_PX, Math.max(0, span.max - at) / after) : 0;
    lineUps.push(ports.map((_, index) => at + (index - anchor) * (index < anchor ? gapBefore : gapAfter)));
  } else {
    const gap = ports.length > 1 ? Math.min(LANE_GAP_PX, (span.max - span.min) / (ports.length - 1)) : 0;
    const width = (ports.length - 1) * gap;
    const origins = [...all.flatMap((end) => ports.map((_, index) => end.at - index * gap)), span.min, span.max - width];
    for (const origin of origins) {
      if (origin < span.min - SAME_PX || origin + width > span.max + SAME_PX) continue;
      lineUps.push(ports.map((_, index) => origin + index * gap));
    }
  }
  let best: { lineUp: number[]; cost: number; crowding: End[][] } | null = null;
  for (const lineUp of lineUps) {
    const low = lineUp[0]! - LANE_CLEAR_PX;
    const high = lineUp[lineUp.length - 1]! + LANE_CLEAR_PX;
    // The side's other ports that this line-up lands on.
    const crowding = others.filter((cluster) => cluster.some((end) => end.at > low && end.at < high));
    const moved = ports.reduce(
      (sum, port, index) => sum + port.ends.reduce((total, end) => total + Math.abs(end.at - lineUp[index]!), 0),
      0,
    );
    const cost = moved + crowding.length * CROWDED_COST;
    if (!best || cost < best.cost - EPSILON) best = { lineUp, cost, crowding };
  }
  if (!best) return [];
  const { lineUp, crowding } = best;
  if (crowding.length > 0 && crowding.every((cluster) => cluster.every((end) => end.span && !end.straight))) return crowding;
  ports.forEach((port, index) => {
    const at = lineUp[index]!;
    const packed = ports.some((_, other) => other !== index && Math.abs(lineUp[other]! - at) < MIN_PORT_GAP_PX);
    if (packed || at < span.min - SAME_PX || at > span.max + SAME_PX) return;
    for (const end of port.ends) {
      if (!end.straight && end.span) slideEnd(end.wire, end.atStart, at);
    }
  });
  return [];
}

/** Moves one end, with its end run, to `at` along its node side. The next run changes length. */
function slideEnd(wire: Wire, atStart: boolean, at: number): void {
  const points = clonePoints(wire.points);
  const count = points.length;
  const tip = points[atStart ? 0 : count - 1]!;
  const corner = points[atStart ? 1 : count - 2]!;
  const beyond = points[atStart ? 2 : count - 3];
  const axis = axisOf(tip, corner);
  if (!axis || !beyond) return;
  const side = across(axis);
  if (Math.abs(tip[side] - at) <= EPSILON) return;
  const before = beyond[side] - corner[side];
  tip[side] = at;
  corner[side] = at;
  const after = beyond[side] - at;
  if (Math.sign(before) !== Math.sign(after) || Math.abs(after) < MIN_INNER_RUN_PX) return;
  if (blockedBy(wire, points) > wire.blocked) return;
  wire.points = points;
  wire.moved = true;
}

// ---------------------------------------------------------------------------
// Runs: parallel stretches of different wires.

function segmentsOn(wires: ReadonlyArray<Wire>, axis: Axis): Segment[] {
  const segments: Segment[] = [];
  const run = along(axis);
  const side = across(axis);
  for (const wire of wires) {
    for (let index = 0; index + 1 < wire.points.length; index += 1) {
      const a = wire.points[index]!;
      const b = wire.points[index + 1]!;
      if (axisOf(a, b) !== axis) continue;
      segments.push({ wire, index, at: a[side], lo: Math.min(a[run], b[run]), hi: Math.max(a[run], b[run]) });
    }
  }
  return segments;
}

const overlap = (a: Segment, b: Segment): number => Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo);
const near = (a: CanvasPoint, b: CanvasPoint, by: number): boolean => Math.abs(a.x - b.x) < by && Math.abs(a.y - b.y) < by;

/** What decides whether two wires may share a line: their ends and their meaning. */
export type LaneMeaning = Pick<LaneWire, "from" | "to" | "color" | "dash" | "headAtStart" | "headAtEnd">;

const areMates = (a: Segment, b: Segment): boolean =>
  runsAreMates(a.wire.wire, a.wire.points, a.index, b.wire.wire, b.wire.points, b.index);

/**
 * Whether run `a` of `p` and run `b` of `q` belong to one trunk (one meaning,
 * one start, the same way so far) or one junction (one dash, one end, the same
 * way from here on). The lane pass paints mates on one line on purpose.
 * `p` and `q` hold no repeats and no points inside a straight run (`simplified`).
 */
export function runsAreMates(
  first: LaneMeaning,
  p: ReadonlyArray<CanvasPoint>,
  a: number,
  second: LaneMeaning,
  q: ReadonlyArray<CanvasPoint>,
  b: number,
): boolean {
  if (
    a === b && first.from === second.from && first.color === second.color &&
    first.dash === second.dash && first.headAtStart === second.headAtStart
  ) {
    let same = near(p[a]!, q[b]!, CONFLICT_GAP_PX);
    for (let index = 0; same && index < a; index += 1) same = near(p[index]!, q[index]!, SAME_PX);
    if (same) return true;
  }
  const fromEndA = p.length - 2 - a;
  const fromEndB = q.length - 2 - b;
  if (
    fromEndA === fromEndB && first.to === second.to && first.dash === second.dash &&
    first.headAtEnd === second.headAtEnd && (JUNCTION_MERGES_COLOURS || first.color === second.color)
  ) {
    let same = near(p[a + 1]!, q[b + 1]!, CONFLICT_GAP_PX);
    for (let back = 0; same && back < fromEndA; back += 1) same = near(p[p.length - 1 - back]!, q[q.length - 1 - back]!, SAME_PX);
    if (same) return true;
  }
  return false;
}

/** Where a run may sit without turning a neighbour run around or squeezing it. */
function roomOf(segment: Segment, axis: Axis): LaneSpan | null {
  const { wire } = segment;
  if (wire.points.length === 2) {
    const start = wire.wire.startSpan;
    const end = wire.wire.endSpan;
    if (!start || !end) return null;
    const room = { min: Math.max(start.min, end.min), max: Math.min(start.max, end.max) };
    return room.min <= segment.at && segment.at <= room.max ? room : null;
  }
  return reachOf(segment, axis);
}

/** The room of a run between two corners. An end run has none: its port holds it. */
function reachOf(segment: Segment, axis: Axis): LaneSpan | null {
  const { wire, index } = segment;
  const points = wire.points;
  const lastIndex = points.length - 2;
  if (index === 0 || index === lastIndex) return null;
  const side = across(axis);
  const room = { min: -Infinity, max: Infinity };
  const limit = (far: number, isEndRun: boolean) => {
    const length = Math.abs(segment.at - far);
    const keep = Math.min(length, isEndRun ? MIN_END_RUN_PX : MIN_INNER_RUN_PX);
    if (segment.at > far) room.min = Math.max(room.min, far + keep);
    else room.max = Math.min(room.max, far - keep);
  };
  limit(points[index - 1]![side], index - 1 === 0);
  limit(points[index + 2]![side], index + 1 === lastIndex);
  return room;
}

type Unit = {
  segments: Segment[];
  at: number;
  room: LaneSpan | null;
  length: number;
  straight: boolean;
  /** An author's stored lane: it moves only off a line another wire holds. */
  stored: boolean;
};

function separateRuns(wires: ReadonlyArray<Wire>, axis: Axis): void {
  const segments = segmentsOn(wires, axis);
  // Union-find twice: mates into units, then units that conflict into bundles.
  const parent = segments.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) index = parent[index] = parent[parent[index]!]!;
    return index;
  };
  const conflicts: Array<[number, number]> = [];
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const a = segments[i]!;
      const b = segments[j]!;
      if (a.wire === b.wire || Math.abs(a.at - b.at) >= CONFLICT_GAP_PX) continue;
      const shared = overlap(a, b);
      if (shared < -SAME_PX) continue;
      if (areMates(a, b)) parent[find(i)] = find(j);
      else if (shared > CONFLICT_RUN_PX) conflicts.push([i, j]);
    }
  }
  const units = new Map<number, Unit>();
  segments.forEach((segment, index) => {
    const root = find(index);
    const unit = units.get(root);
    if (unit) unit.segments.push(segment);
    else units.set(root, { segments: [segment], at: segment.at, room: null, length: 0, straight: false, stored: false });
  });
  const bundleOf = new Map<Unit, Unit>();
  const bundle = (unit: Unit): Unit => {
    let root = unit;
    while (bundleOf.get(root)) root = bundleOf.get(root)!;
    return root;
  };
  const inConflict = new Set<Unit>();
  for (const [i, j] of conflicts) {
    const a = units.get(find(i))!;
    const b = units.get(find(j))!;
    if (a === b) continue;
    inConflict.add(a).add(b);
    if (bundle(a) !== bundle(b)) bundleOf.set(bundle(a), bundle(b));
  }
  const bundles = new Map<Unit, Unit[]>();
  for (const unit of inConflict) {
    const root = bundle(unit);
    const members = bundles.get(root);
    if (members) members.push(unit);
    else bundles.set(root, [unit]);
  }

  for (const members of bundles.values()) {
    for (const unit of members) {
      // A unit sits where its fixed run is, else where its longest run is.
      let room: LaneSpan | null = { min: -Infinity, max: Infinity };
      let longest = -1;
      let fixedAt: number | null = null;
      for (const segment of unit.segments) {
        const own = roomOf(segment, axis);
        const length = segment.hi - segment.lo;
        unit.length += length;
        if (!own) fixedAt = fixedAt ?? segment.at;
        else if (room) room = { min: Math.max(room.min, own.min), max: Math.min(room.max, own.max) };
        if (length > longest) {
          longest = length;
          unit.at = segment.at;
        }
      }
      if (fixedAt !== null) unit.at = fixedAt;
      unit.room = fixedAt === null && room && room.min <= unit.at && unit.at <= room.max ? room : null;
      unit.straight = unit.segments.some((segment) => segment.wire.points.length === 2);
      unit.stored = unit.segments.some((segment) => segment.wire.wire.lanesFixed && segment.wire.points.length > 2);
    }
    // End runs hold their lanes. Then stored lanes, straight wires, and the
    // units that carry the most wire: each takes the nearest free lane.
    const rank = (unit: Unit) => (unit.room ? (unit.stored ? 1 : unit.straight ? 2 : 3) : 0);
    members.sort((a, b) => rank(a) - rank(b) || b.segments.length - a.segments.length || b.length - a.length);
    const waiting = new Set<Segment>(members.flatMap((unit) => unit.segments));
    for (const unit of members) {
      for (const segment of unit.segments) waiting.delete(segment);
      if (unit.room) placeUnit(unit, members.length, segments, waiting, wires, axis);
    }
  }
}

/**
 * Puts `unit` on the free lane with the fewest crossings, then the nearest,
 * then the shortest wire. A stored lane takes the nearest free lane first.
 */
function placeUnit(
  unit: Unit,
  bundleSize: number,
  segments: ReadonlyArray<Segment>,
  waiting: ReadonlySet<Segment>,
  wires: ReadonlyArray<Wire>,
  axis: Axis,
): void {
  const side = across(axis);
  const room = unit.room!;
  const own = new Set(unit.segments);
  const ownWires = new Set(unit.segments.map((segment) => segment.wire));
  const others = segments.filter((segment) => !own.has(segment) && !waiting.has(segment) && !ownWires.has(segment.wire));
  const steps = Math.min(MAX_LANE_STEPS, bundleSize);
  let best: { score: number[]; at: number; moved: Map<Wire, CanvasPoint[]> } | null = null;
  for (let step = 0; step <= steps; step += 1) {
    for (const direction of step === 0 ? [1] : [1, -1]) {
      const at = unit.at + direction * step * LANE_GAP_PX;
      if (at < room.min - EPSILON || at > room.max + EPSILON) continue;
      const clearance = step === 0 ? CONFLICT_GAP_PX : LANE_CLEAR_PX;
      const taken = unit.segments.some((segment) => others.some((other) =>
        Math.abs(other.at - at) < clearance && overlap(segment, other) > CONFLICT_RUN_PX && !areMates(segment, other)));
      if (taken) continue;
      const moved = new Map<Wire, CanvasPoint[]>();
      for (const segment of unit.segments) {
        const points = moved.get(segment.wire) ?? clonePoints(segment.wire.points);
        points[segment.index]![side] = at;
        points[segment.index + 1]![side] = at;
        moved.set(segment.wire, points);
      }
      let crossings = 0;
      let length = 0;
      let blocked = false;
      for (const [wire, points] of moved) {
        if (blockedBy(wire, points) > wire.blocked) blocked = true;
        length += lengthOf(points) - lengthOf(wire.points);
        for (const other of wires) {
          if (!ownWires.has(other)) crossings += crossingsBetween(points, other.points);
        }
      }
      if (blocked) continue;
      const score = unit.stored ? [step, crossings, length] : [crossings, step, length];
      if (!best || lexLess(score, best.score)) best = { score, at, moved };
    }
  }
  if (!best) return;
  for (const [wire, points] of best.moved) {
    if (points.some((point, index) => Math.abs(point[side] - wire.points[index]![side]) > EPSILON)) wire.moved = true;
    wire.points = points;
  }
  for (const segment of unit.segments) segment.at = best.at;
}

/**
 * Two wires that cross trade lanes when the trade removes a crossing. The
 * lanes stay where they are, so an author's stored lanes stay too: only the
 * order of the wires on them changes.
 */
function uncrossRuns(wires: ReadonlyArray<Wire>, axis: Axis): void {
  const side = across(axis);
  const segments = segmentsOn(wires, axis);
  const inner = segments.filter((segment) => reachOf(segment, axis));
  const crossingsOf = (wire: Wire, points: ReadonlyArray<CanvasPoint>, skip: Wire) =>
    wires.reduce((sum, other) => (other === wire || other === skip ? sum : sum + crossingsBetween(points, other.points)), 0);
  const moveTo = (segment: Segment, at: number) => {
    const points = clonePoints(segment.wire.points);
    points[segment.index]![side] = at;
    points[segment.index + 1]![side] = at;
    return points;
  };
  for (let pass = 0; pass < MAX_UNCROSS_PASSES; pass += 1) {
    let traded = false;
    for (let i = 0; i < inner.length; i += 1) {
      for (let j = i + 1; j < inner.length; j += 1) {
        const a = inner[i]!;
        const b = inner[j]!;
        const apart = Math.abs(a.at - b.at);
        if (a.wire === b.wire || apart <= SAME_PX || apart > MAX_LANE_STEPS * LANE_GAP_PX) continue;
        if (overlap(a, b) <= CONFLICT_RUN_PX) continue;
        const between = crossingsBetween(a.wire.points, b.wire.points);
        if (between === 0) continue;
        const reachA = reachOf(a, axis)!;
        const reachB = reachOf(b, axis)!;
        if (b.at < reachA.min || b.at > reachA.max || a.at < reachB.min || a.at > reachB.max) continue;
        // A run of a trunk or a junction stays with its mates.
        const lone = (segment: Segment) => !segments.some((other) =>
          other.wire !== segment.wire && Math.abs(other.at - segment.at) < CONFLICT_GAP_PX &&
          overlap(segment, other) >= -SAME_PX && areMates(segment, other));
        if (!lone(a) || !lone(b)) continue;
        const pointsA = moveTo(a, b.at);
        const pointsB = moveTo(b, a.at);
        const before = between + crossingsOf(a.wire, a.wire.points, b.wire) + crossingsOf(b.wire, b.wire.points, a.wire);
        const after = crossingsBetween(pointsA, pointsB) + crossingsOf(a.wire, pointsA, b.wire) + crossingsOf(b.wire, pointsB, a.wire);
        if (after >= before) continue;
        if (blockedBy(a.wire, pointsA) > a.wire.blocked || blockedBy(b.wire, pointsB) > b.wire.blocked) continue;
        const crowds = (segment: Segment, at: number) => segments.some((other) =>
          other !== a && other !== b && other.wire !== segment.wire &&
          Math.abs(other.at - at) < CONFLICT_GAP_PX && overlap(segment, other) > CONFLICT_RUN_PX);
        if (crowds(a, b.at) || crowds(b, a.at)) continue;
        a.wire.points = pointsA;
        b.wire.points = pointsB;
        a.wire.moved = true;
        b.wire.moved = true;
        [a.at, b.at] = [b.at, a.at];
        traded = true;
      }
    }
    if (!traded) return;
  }
}

function lexLess(a: ReadonlyArray<number>, b: ReadonlyArray<number>): boolean {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index]! < b[index]! - EPSILON) return true;
    if (a[index]! > b[index]! + EPSILON) return false;
  }
  return false;
}

function lengthOf(points: ReadonlyArray<CanvasPoint>): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.abs(points[index]!.x - points[index - 1]!.x) + Math.abs(points[index]!.y - points[index - 1]!.y);
  }
  return total;
}

/** Points where a run of `a` and a run of `b` cross through each other. A touch at a corner is not one. */
function crossingsBetween(a: ReadonlyArray<CanvasPoint>, b: ReadonlyArray<CanvasPoint>): number {
  let count = 0;
  for (let i = 1; i < a.length; i += 1) {
    const p = a[i - 1]!;
    const q = a[i]!;
    const axis = axisOf(p, q);
    if (!axis) continue;
    for (let j = 1; j < b.length; j += 1) {
      const r = b[j - 1]!;
      const s = b[j]!;
      const other = axisOf(r, s);
      if (!other || other === axis) continue;
      const [h0, h1, v0, v1] = axis === "h" ? [p, q, r, s] : [r, s, p, q];
      if (
        v0.x > Math.min(h0.x, h1.x) + SAME_PX && v0.x < Math.max(h0.x, h1.x) - SAME_PX &&
        h0.y > Math.min(v0.y, v1.y) + SAME_PX && h0.y < Math.max(v0.y, v1.y) - SAME_PX
      ) count += 1;
    }
  }
  return count;
}
