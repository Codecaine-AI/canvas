/**
 * The smart guides, asked of a whole board at rest.
 *
 * In Studio a dragged box snaps to a peer's edge or center line, or into an
 * equal gap, and a guide lights up (snapping.ts, snap-distribution.ts). Here
 * every box is asked the same question where it stands: would it snap? A snap
 * of zero is a line the board already sits on. A snap of a few px is a
 * near-miss, and the snap is the move that fixes it. Boxes are judged where
 * they paint (an icon by its tile), against the peers a reader lines them up
 * with:
 * - off-line: a box against the box its bent wire runs to (center lines), and
 *   against its siblings of one kind (like lines: left with left, center with
 *   center). The closest line wins, as in a drag, so a box that already sits on
 *   a line with one peer is at rest;
 * - ragged-edge: a section's frame edge against the same edge of its sibling
 *   sections, each edge on its own;
 * - uneven-gap: a box between its two neighbours in a row or column;
 * - off-center: the one row a section holds, against the section's center line;
 * - arrow-off-center: an arrowhead alone on a side, against that side's center.
 */
import { simplified } from "../../connectors/lanes";
import { AGENT_GRID } from "../../state/geometry";
import { DEFAULT_CANVAS_STYLE, type CanvasStyle } from "../../theme/canvas-style";
import { kindOf } from "../helpers";
import { drawnRectOf, routedPolyline, type Point, type Rect } from "../lints/geometry";
import { isPageSection } from "../section-colors";
import { alignDistributeHorizontally, alignDistributeVertically } from "./snap-distribution";
import { computeSnapGuides, type SnapGuide, type SnapLinePairing } from "./snapping";

import type {
  InteractiveCanvasConnection, InteractiveCanvasDocument, InteractiveCanvasObject,
} from "../../state/schema";

/** How far off a line still reads as "meant to be on it": one step of the agent's grid. */
export const NEAR_MISS_PX = AGENT_GRID;
/** At most this far off, a box reads as on the line. */
export const ON_LINE_PX = 2;
/**
 * A section's content can sit this far off its center and still be meant to be
 * centered. Half a grid step is the floor: no move on the grid gets closer.
 */
const OFF_CENTER_PX = { over: AGENT_GRID / 2, upTo: AGENT_GRID * 2 };
/** The router lands an arrowhead on the grid, so it can sit this far off a side's center. */
const ARROW_SLACK_PX = 4;
/** Two wire ends this close on one side are one port (a merged junction). */
const SAME_PORT_PX = 1;

export type NearMissKind = "off-line" | "ragged-edge" | "uneven-gap" | "off-center" | "arrow-off-center";

/** One guide line, in board coordinates. */
export interface GuideSegment { x1: number; y1: number; x2: number; y2: number }

/** One call of a board tool, with the arguments the tool takes. */
export interface GuideFix {
  tool: "move" | "arrange" | "resize" | "route";
  args: Record<string, unknown>;
}

export interface NearMiss {
  kind: NearMissKind;
  /** What to change first, then what it lines up with. */
  at: string[];
  /** How far off the line, in px. */
  offBy: number;
  message: string;
  /** The tool calls that put it on the line, in order. */
  fix: GuideFix[];
  /** The line the guide draws: where the box, gap or arrowhead belongs. */
  guides: GuideSegment[];
}

export interface BoardGuides {
  nearMisses: NearMiss[];
  /** The lines the board already sits on. */
  aligned: GuideSegment[];
}

type Axis = "x" | "y";
type Side = "left" | "right" | "top" | "bottom";

interface Box {
  object: InteractiveCanvasObject;
  /** Where the box paints: an icon's tile. */
  rect: Rect;
  /** True when the box paints inside its stored box, as an icon's tile does. The board tools place the stored box. */
  inset: boolean;
  index: number;
}

interface Port {
  wire: InteractiveCanvasConnection;
  box: Box;
  side: Side;
  point: Point;
  head: boolean;
  /** True when the wire runs from end to end with no corner. */
  straight: boolean;
}

const LINE_NAMES: Record<Axis, readonly [string, string, string]> = {
  x: ["left edge", "center line", "right edge"],
  y: ["top edge", "center line", "bottom edge"],
};
const ALIGN_EDGES: Record<Axis, readonly [string, string, string]> = {
  x: ["left", "center_h", "right"],
  y: ["top", "center_v", "bottom"],
};

const px = (value: number) => `${Math.round(Math.abs(value))}px`;
const lines = (rect: Rect, axis: Axis) => axis === "x"
  ? [rect.x, rect.x + rect.width / 2, rect.x + rect.width]
  : [rect.y, rect.y + rect.height / 2, rect.y + rect.height];
const area = (rect: Rect) => rect.width * rect.height;
const onGrid = (value: number) => Math.abs(value) % AGENT_GRID < 0.01;
const vertical = (side: Side) => side === "left" || side === "right";

/** A fix as the drawer types it: `move a by dy 20`, `arrange a, b align center_v`. */
export function fixText(steps: readonly GuideFix[]): string {
  return steps.map(({ tool, args }) => {
    const target = Array.isArray(args.ids) ? args.ids.join(", ") : String(args.id);
    const words: string[] = [];
    const by = args.by as { dx: number; dy: number } | undefined;
    if (by?.dx) words.push(`by dx ${by.dx}`);
    if (by?.dy) words.push(`by dy ${by.dy}`);
    if (args.align) words.push(`align ${String(args.align)}`);
    const space = args.space as { axis: string; gap: number } | undefined;
    if (space) words.push(`space ${space.axis} gap ${space.gap}`);
    if (args.width !== undefined) words.push(`width ${String(args.width)}`);
    if (args.height !== undefined) words.push(`height ${String(args.height)}`);
    if (args.reset) words.push("reset");
    return `${tool} ${target} ${words.join(" ")}`;
  }).join(", then ");
}

function segmentOf(guide: SnapGuide): GuideSegment {
  return guide.axis === "x"
    ? { x1: guide.position, y1: guide.span.start, x2: guide.position, y2: guide.span.end }
    : { x1: guide.span.start, y1: guide.position, x2: guide.span.end, y2: guide.position };
}

/** The snap of `moving` to `others` on one axis: the delta and the guide, or null when nothing is in reach. */
function snapOn(
  moving: Rect, others: Rect[], threshold: number, pairing: SnapLinePairing, axis: Axis,
): { delta: number; guide: SnapGuide } | null {
  const snap = computeSnapGuides(moving, others, threshold, pairing);
  const guide = snap.guides.find((candidate) => candidate.axis === axis);
  return guide ? { delta: axis === "x" ? snap.dx : snap.dy, guide } : null;
}

/** Which of `rect`'s three lines sits on `position`: 0 near, 1 center, 2 far. */
function lineAt(rect: Rect, axis: Axis, position: number): number {
  const index = lines(rect, axis).findIndex((line) => Math.abs(line - position) < 0.01);
  return index < 0 ? 1 : index;
}

/** The side of its box a wire end sits on, read off the run that meets it. */
function sideOf(end: Point, neighbor: Point): Side {
  if (Math.abs(end.x - neighbor.x) >= Math.abs(end.y - neighbor.y)) return end.x > neighbor.x ? "left" : "right";
  return end.y > neighbor.y ? "top" : "bottom";
}

export function findBoardGuides(
  document: InteractiveCanvasDocument, canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): BoardGuides {
  const boxes = new Map<string, Box>(document.objects.map((object, index) => {
    const rect = drawnRectOf(object, canvasStyle);
    return [object.id, { object, rect, inset: rect.width !== object.geometry.width || rect.height !== object.geometry.height, index }];
  }));
  const childrenOf = new Map<string | null, Box[]>();
  for (const box of boxes.values()) {
    const parent = box.object.parentId ?? null;
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), box]);
  }
  const isFrame = (box: Box) => kindOf(box.object) === "section";
  /** The peers a reader lines a box up with: its siblings of one kind. */
  const peersOf = (box: Box) => (childrenOf.get(box.object.parentId ?? null) ?? [])
    .filter((peer) => peer !== box && kindOf(peer.object) === kindOf(box.object) && !isPageSection(peer.object));

  const ports: Port[] = [];
  const portsOfWire = new Map<string, [Port, Port]>();
  for (const wire of document.connections) {
    const [from, to] = [boxes.get(wire.from.objectId), boxes.get(wire.to.objectId)];
    const points = simplified(routedPolyline(wire, document, canvasStyle));
    if (!from || !to || from === to || points.length < 2) continue;
    const arrow = wire.arrow ?? "forward";
    const [first, last] = [points[0]!, points[points.length - 1]!];
    const straight = points.length === 2;
    const pair: [Port, Port] = [
      { wire, box: from, side: sideOf(first, points[1]!), point: first, head: arrow === "back" || arrow === "both", straight },
      { wire, box: to, side: sideOf(last, points[points.length - 2]!), point: last, head: arrow === "forward" || arrow === "both", straight },
    ];
    ports.push(...pair);
    portsOfWire.set(wire.id, pair);
  }
  const samePort = (a: Port, b: Port) => a.box === b.box && a.side === b.side
    && Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y) <= SAME_PORT_PX;
  /** True when `port` is the one place wires meet its side: one wire, or one merged junction. */
  const alone = (port: Port) => ports.every((other) =>
    other.box !== port.box || other.side !== port.side || samePort(other, port));
  const degree = (box: Box) => ports.filter((port) => port.box === box).length;
  const partnersOf = (box: Box) => [...portsOfWire.values()]
    .filter(([a, b]) => a.box === box || b.box === box)
    .map(([a, b]) => (a.box === box ? b.box : a.box));
  const sharesLine = (a: Box, b: Box, axis: Axis, pairing: SnapLinePairing = "matching") =>
    snapOn(a.rect, [b.rect], ON_LINE_PX, pairing, axis) !== null;

  /**
   * What moves when `box` has to: a section that holds only this box moves
   * with it, so the box stays centered in its frame.
   */
  const carrier = (box: Box): Box => {
    const parent = box.object.parentId ? boxes.get(box.object.parentId) : undefined;
    if (!parent || isPageSection(parent.object) || childrenOf.get(parent.object.id)!.length !== 1) return box;
    return carrier(parent);
  };
  /** How many lines `box` already shares on `axis`, which a move along it breaks. */
  const linesHeld = (box: Box, axis: Axis, except: Box): number => {
    const moved = carrier(box);
    return peersOf(moved).filter((peer) => peer !== except && sharesLine(moved, peer, axis)).length
      + partnersOf(box).filter((peer) => peer !== except && sharesLine(box, peer, axis, "center")).length;
  };
  /** Of two boxes one snap apart, the one to move: it breaks fewer lines, carries fewer wires, or is the smaller. */
  const moverOf = (a: Box, b: Box, axis: Axis): Box => {
    const rank = (box: Box) => [linesHeld(box, axis, box === a ? b : a), degree(box), area(box.rect), -box.index];
    const [ra, rb] = [rank(a), rank(b)];
    for (let i = 0; i < ra.length; i += 1) {
      if (ra[i] !== rb[i]) return ra[i]! < rb[i]! ? a : b;
    }
    return b;
  };
  /** The call that moves `box` by `delta` on `axis`, onto the `line` it shares with `other`. */
  const moveFix = (box: Box, other: Box, axis: Axis, delta: number, line: number): GuideFix => {
    const moved = carrier(box);
    const corner = axis === "x" ? moved.object.geometry.x : moved.object.geometry.y;
    // `move` lands on the grid. A snap off the grid takes `arrange`, which puts both boxes on one line.
    if (onGrid(delta) && onGrid(corner)) {
      return { tool: "move", args: { id: moved.object.id, by: { dx: axis === "x" ? delta : 0, dy: axis === "y" ? delta : 0 } } };
    }
    return { tool: "arrange", args: { ids: [moved.object.id, carrier(other).object.id], align: ALIGN_EDGES[axis][line] } };
  };

  const nearMisses: NearMiss[] = [];
  const aligned = new Map<string, GuideSegment>();
  const keepAligned = (guide: SnapGuide) => {
    const segment = segmentOf(guide);
    const key = `${guide.axis}:${guide.position}:${guide.span.start}`;
    // One stretch of a line is kept once, at its longest.
    const held = aligned.get(key);
    if (!held || guide.span.end > Math.max(held.x2, held.y2)) aligned.set(key, segment);
  };
  /** A (box, axis) a near-miss already names a move for. */
  const settled = new Set<string>();
  const offLine = (a: Box, b: Box, axis: Axis, delta: number, guide: SnapGuide, via?: string) => {
    // `delta` moves `a` onto `b`'s line. Moving `b` the other way does the same.
    const mover = moverOf(a, b, axis);
    const other = mover === a ? b : a;
    const move = mover === a ? delta : -delta;
    const key = (box: Box) => `${box.object.id}:${axis}`;
    if (settled.has(key(mover)) || settled.has(key(other))) return;
    settled.add(key(mover));
    const line = lineAt(b.rect, axis, guide.position);
    const position = lines(other.rect, axis)[line]!;
    nearMisses.push({
      kind: "off-line",
      at: [mover.object.id, other.object.id, ...(via ? [via] : [])],
      offBy: Math.abs(move),
      message: `${mover.object.id} is ${px(move)} off ${other.object.id}'s ${LINE_NAMES[axis][line]}`
        + (via ? `, so ${via} bends` : ""),
      fix: [moveFix(mover, other, axis, move, line)],
      guides: [segmentOf({ ...guide, position })],
    });
  };

  // A box against the box its bent wire runs to: center lines.
  for (const [a, b] of portsOfWire.values()) {
    if (isFrame(a.box) || isFrame(b.box)) continue;
    for (const axis of ["x", "y"] as const) {
      // Two sides that face each other across x share a center line on y.
      if (vertical(a.side) !== (axis === "y") || vertical(b.side) !== (axis === "y")) continue;
      const snap = snapOn(a.box.rect, [b.box.rect], NEAR_MISS_PX, "center", axis);
      if (!snap) continue;
      if (Math.abs(snap.delta) <= ON_LINE_PX) keepAligned(snap.guide);
      else if (!a.straight && alone(a) && alone(b)) offLine(a.box, b.box, axis, snap.delta, snap.guide, a.wire.id);
    }
  }

  // A box against its siblings of one kind: like lines.
  for (const box of boxes.values()) {
    if (isFrame(box)) continue;
    const peers = peersOf(box);
    // A tile's edge and a box's edge are not one line to a reader, and no tool puts them on one: a tile pairs by its center.
    const whole = peers.filter((peer) => !peer.inset && !box.inset);
    for (const axis of ["x", "y"] as const) {
      const snap = [
        snapOn(box.rect, whole.map((peer) => peer.rect), NEAR_MISS_PX, "matching", axis),
        snapOn(box.rect, peers.filter((peer) => !whole.includes(peer)).map((peer) => peer.rect), NEAR_MISS_PX, "center", axis),
      ].filter((found) => found !== null).sort((p, q) => Math.abs(p.delta) - Math.abs(q.delta))[0];
      if (!snap) continue;
      if (Math.abs(snap.delta) <= ON_LINE_PX) {
        keepAligned(snap.guide);
        continue;
      }
      const other = peers.find((peer) => lines(peer.rect, axis).some((line) => Math.abs(line - snap.guide.position) < 0.01));
      if (other) offLine(box, other, axis, snap.delta, snap.guide);
    }
  }

  // A section's frame edges against its sibling sections', each edge on its own.
  const edgeOf = (rect: Rect, side: Side): Rect => ({
    x: side === "right" ? rect.x + rect.width : rect.x,
    y: side === "bottom" ? rect.y + rect.height : rect.y,
    width: vertical(side) ? 0 : rect.width,
    height: vertical(side) ? rect.height : 0,
  });
  const raggedPairs = new Set<string>();
  for (const box of boxes.values()) {
    if (!isFrame(box) || isPageSection(box.object)) continue;
    const peers = peersOf(box);
    for (const side of ["left", "right", "top", "bottom"] as const) {
      const axis: Axis = vertical(side) ? "x" : "y";
      const edge = (peer: Box) => lines(edgeOf(peer.rect, side), axis)[0]!;
      const snap = snapOn(edgeOf(box.rect, side), peers.map((peer) => edgeOf(peer.rect, side)), NEAR_MISS_PX, "matching", axis);
      if (!snap) continue;
      if (Math.abs(snap.delta) <= ON_LINE_PX) {
        keepAligned(snap.guide);
        continue;
      }
      const other = peers.find((peer) => Math.abs(edge(peer) - snap.guide.position) < 0.01)!;
      // Each pair is named once per edge, and the smaller frame gives way.
      const pair = `${side}:${[box.object.id, other.object.id].sort().join("|")}`;
      if (raggedPairs.has(pair)) continue;
      raggedPairs.add(pair);
      const [mover, target] = area(box.rect) <= area(other.rect) ? [box, other] : [other, box];
      const move = mover === box ? snap.delta : -snap.delta;
      const far = side === "right" || side === "bottom";
      const { width, height } = mover.object.geometry;
      // `resize` holds the top-left corner, so a far edge resizes and a near edge moves, then resizes back.
      const grow = far ? move : -move;
      const resize: GuideFix = { tool: "resize", args: { id: mover.object.id, ...(vertical(side) ? { width: width + grow } : { height: height + grow }) } };
      const shift: GuideFix = { tool: "move", args: { id: mover.object.id, by: { dx: axis === "x" ? move : 0, dy: axis === "y" ? move : 0 } } };
      nearMisses.push({
        kind: "ragged-edge",
        at: [mover.object.id, target.object.id],
        offBy: Math.abs(move),
        message: `${mover.object.id}'s ${side} edge is ${px(move)} off ${target.object.id}'s`,
        fix: far ? [resize] : [shift, resize],
        guides: [segmentOf({ ...snap.guide, position: edge(target) })],
      });
    }
  }

  // A box between its two neighbours in a row or column: equal gaps.
  const gapRuns = new Set<string>();
  for (const box of boxes.values()) {
    if (isPageSection(box.object)) continue;
    const peers = peersOf(box);
    for (const axis of ["x", "y"] as const) {
      const cross: Axis = axis === "x" ? "y" : "x";
      const near = (rect: Rect) => lines(rect, axis)[0]!;
      const far = (rect: Rect) => lines(rect, axis)[2]!;
      // A row is the boxes that share a line across it.
      const row = [box, ...peers.filter((peer) => sharesLine(box, peer, cross))]
        .sort((a, b) => near(a.rect) - near(b.rect));
      const at = row.indexOf(box);
      const [before, after] = [row[at - 1], row[at + 1]];
      if (!before || !after || far(before.rect) > near(box.rect) || far(box.rect) > near(after.rect)) continue;
      // A tile's caption fills part of its gap, so only whole boxes are measured.
      if (before.inset || box.inset || after.inset) continue;
      const flank = [before.rect, after.rect];
      const snap = axis === "x"
        ? alignDistributeHorizontally(box.rect, flank, NEAR_MISS_PX, 1)
        : alignDistributeVertically(box.rect, flank, NEAR_MISS_PX, 1);
      if (snap.guides.length === 0) continue;
      const delta = "dx" in snap ? snap.dx : snap.dy;
      // Equal gaps, or one pitch from box to box: the row is even.
      const run3 = [before, box, after];
      const [p, q, r] = run3.map((member) => lines(member.rect, axis)) as [number[], number[], number[]];
      const pitch = [0, 1, 2].some((line) => Math.abs((q[line]! - p[line]!) - (r[line]! - q[line]!)) <= ON_LINE_PX);
      if (Math.abs(delta) <= ON_LINE_PX || pitch) {
        if (Math.abs(delta) <= ON_LINE_PX) {
          for (const guide of snap.guides) aligned.set(`gap:${guide.x1},${guide.y1},${guide.x2},${guide.y2}`, guide);
        }
        continue;
      }
      const ids = run3.map((member) => member.object.id);
      const run = `${axis}:${ids.join("|")}`;
      if (gapRuns.has(run)) continue;
      const gaps = [near(box.rect) - far(before.rect), near(after.rect) - far(box.rect)] as const;
      // One box moves: the middle one by half the difference, or an end by all of it. `move` lands on the grid,
      // so the box and its step must sit on it. Of those that do, the one that breaks the fewest lines moves.
      const steps: [Box, number][] = [[box, delta], [after, gaps[0] - gaps[1]], [before, gaps[0] - gaps[1]]];
      const step = steps
        .filter(([member, by]) => onGrid(by) && onGrid(lines(member.object.geometry, axis)[0]!))
        .map(([member, by]) => ({ member, by, breaks: linesHeld(member, axis, member) }))
        .sort((p, q) => p.breaks - q.breaks)[0];
      if (!step) continue;
      gapRuns.add(run);
      nearMisses.push({
        kind: "uneven-gap",
        at: [step.member.object.id, ...ids.filter((id) => id !== step.member.object.id)],
        offBy: Math.abs(delta),
        message: `${ids[1]} sits ${px(gaps[0])} from ${ids[0]} and ${px(gaps[1])} from ${ids[2]}`,
        fix: [{ tool: "move", args: { id: step.member.object.id, by: { dx: axis === "x" ? step.by : 0, dy: axis === "y" ? step.by : 0 } } }],
        guides: snap.guides,
      });
    }
  }

  // The one row a section holds, against the section's center line.
  for (const section of boxes.values()) {
    if (!isFrame(section) || isPageSection(section.object)) continue;
    const held = childrenOf.get(section.object.id) ?? [];
    const oneRow = held.length > 0 && held.every((child) => !isFrame(child) && sharesLine(child, held[0]!, "y"));
    if (!oneRow) continue;
    // The stored boxes: an icon's label is part of what the frame has to center.
    const left = Math.min(...held.map((child) => child.object.geometry.x));
    const right = Math.max(...held.map((child) => child.object.geometry.x + child.object.geometry.width));
    const content = { x: left, y: section.rect.y, width: right - left, height: section.rect.height };
    const snap = snapOn(content, [section.rect], OFF_CENTER_PX.upTo, "center", "x");
    if (!snap) continue;
    if (Math.abs(snap.delta) <= OFF_CENTER_PX.over) {
      if (Math.abs(snap.delta) <= ON_LINE_PX) keepAligned(snap.guide);
      continue;
    }
    const ids = held.map((child) => child.object.id);
    const dx = Math.round(snap.delta / AGENT_GRID) * AGENT_GRID;
    nearMisses.push({
      kind: "off-center",
      at: [...ids, section.object.id],
      offBy: Math.abs(snap.delta),
      message: `${ids.join(", ")} ${ids.length === 1 ? "sits" : "sit"} ${px(snap.delta)} ${snap.delta > 0 ? "left" : "right"} of ${section.object.id}'s center`,
      fix: ids.map((id) => ({ tool: "move", args: { id, by: { dx, dy: 0 } } })),
      guides: [segmentOf(snap.guide)],
    });
  }

  // An arrowhead alone on a side, against that side's center.
  const heads = new Set<string>();
  for (const port of ports) {
    if (!port.head || isFrame(port.box) || !alone(port)) continue;
    const axis: Axis = vertical(port.side) ? "y" : "x";
    const tip = { x: port.point.x, y: port.point.y, width: 0, height: 0 };
    const snap = snapOn(tip, [port.box.rect], NEAR_MISS_PX, "center", axis);
    if (!snap || Math.abs(snap.delta) <= ARROW_SLACK_PX) continue;
    const key = `${port.box.object.id}:${port.side}`;
    const [from, to] = portsOfWire.get(port.wire.id)!;
    // Two boxes a snap apart already carry the move that centers this head.
    if (heads.has(key) || settled.has(`${from.box.object.id}:${axis}`) || settled.has(`${to.box.object.id}:${axis}`)) continue;
    // A wire the drawer routed or pinned goes back to the router. A straight wire the router ran takes its two boxes onto one line.
    const pinned = ports.filter((other) => samePort(other, port)).map((other) => other.wire)
      .filter((wire) => (wire.waypoints?.length ?? 0) > 0 || wire.from.position != null || wire.to.position != null);
    const partner = from.box === port.box ? to.box : from.box;
    const fix: GuideFix[] = pinned.length > 0
      ? pinned.map((wire) => ({ tool: "route", args: { id: wire.id, reset: true } }))
      : port.straight && !isFrame(partner)
        ? [{ tool: "arrange", args: { ids: [carrier(partner).object.id, carrier(port.box).object.id], align: ALIGN_EDGES[axis][1] } }]
        : [];
    if (fix.length === 0) continue;
    heads.add(key);
    const center = { x: port.box.rect.x + port.box.rect.width / 2, y: port.box.rect.y + port.box.rect.height / 2 };
    const out = AGENT_GRID * 4;
    nearMisses.push({
      kind: "arrow-off-center",
      at: [port.wire.id, port.box.object.id],
      offBy: Math.abs(snap.delta),
      message: `${port.wire.id}'s arrowhead is ${px(snap.delta)} off the center of ${port.box.object.id}'s ${port.side} side`,
      fix,
      guides: [{
        x1: center.x - (port.side === "left" ? port.box.rect.width / 2 + out : 0),
        y1: center.y - (port.side === "top" ? port.box.rect.height / 2 + out : 0),
        x2: center.x + (port.side === "right" ? port.box.rect.width / 2 + out : 0),
        y2: center.y + (port.side === "bottom" ? port.box.rect.height / 2 + out : 0),
      }],
    });
  }

  return { nearMisses, aligned: [...aligned.values()] };
}
