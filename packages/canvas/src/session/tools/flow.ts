/**
 * Flow — lay sibling boxes out in reading order along an axis, one even gap
 * apart, with the empty space packed out. The whole-board answer to a board
 * that filled up one edit at a time, where a grown section pushed its
 * neighbours and the gutters ended up every width.
 *
 * It keeps the rows and columns the drawer made. Measured on three dense
 * boards, every layout built from scratch (a reading order taken from the
 * wires, then packed) made the routed wires 2% to 140% longer, because the
 * drawer lines nodes up across sections so wires run straight, and a new order
 * breaks those lines. tighten-wires.ts found the same thing for nodes. So the
 * structure stays and the distances change:
 *
 * - The boxes are cut into lines by the gutters that run right across them,
 *   each line into the boxes or stacks that sit side by side in it, each stack
 *   into lines again, and so on down. Along axis "x" the top cut is into rows
 *   that read left to right; along axis "y" into columns that read top to
 *   bottom.
 * - Every cut is then set to one gap, or to the room its label chips need
 *   when that is more (labelledGapPx: the longest chip of the labelled wires
 *   that join the two sides, plus clear line before and after it). Ford:
 *   "making sure that there is enough space for the, like, tags". Reading
 *   order is the order the boxes sit in. Across a line a box keeps its
 *   offset, so two neighbours that were level stay level and the wire between
 *   them stays straight.
 * - A group that no gutter cuts (boxes that overlap, or a pinwheel) is packed
 *   in reading order instead: each box takes the earliest free corner on the
 *   line, one gap clear of the boxes before it.
 *
 * Pure over the document: geometry in, geometry out. A section travels whole
 * (translateWithDescendants). The gesture (operations/flow.ts) lowers the
 * result; the commit path drops the waypoints of every wire whose ends moved
 * apart, so those wires route again.
 */
import { labelledGapPx } from "../../connectors/label-placement";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";
import { moveClosureIds, moveRootIds, translateWithDescendants } from "../../state/geometry";
import type { CanvasStyle } from "../../theme/canvas-style";
import { AGENT_GRID } from "./grid";

export interface FlowOptions {
  axis: "x" | "y";
  /** Clear space between neighbouring boxes, along and across the axis. */
  gap: number;
  /** The style the label chips are measured in. The default style when omitted. */
  canvasStyle?: CanvasStyle;
}

export interface FlowResult {
  objects: InteractiveCanvasObject[];
  /** The boxes in reading order, one array per line: a row for axis "x", a column for axis "y". */
  lines: string[][];
  movedIds: string[];
  /** How many gutters are wider than the gap, for the label chips they carry. */
  widened: number;
}

/** A box in flow coordinates: `u` runs along the axis, `v` across it. */
type Box = { u: number; v: number; du: number; dv: number };
type Along = "u" | "v";

/** The slicing tree: a box, boxes in sequence along one direction, or a group no gutter cuts. */
type Slice =
  | { kind: "box"; index: number }
  | { kind: "run"; along: Along; parts: Slice[] }
  | { kind: "knot"; indices: number[] };

const ceilGrid = (value: number) => Math.ceil(value / AGENT_GRID) * AGENT_GRID;
const floorGrid = (value: number) => Math.floor(value / AGENT_GRID) * AGENT_GRID;
const roundGrid = (value: number) => Math.round(value / AGENT_GRID) * AGENT_GRID;

function toBox(geometry: { x: number; y: number; width: number; height: number }, axis: "x" | "y"): Box {
  return axis === "x"
    ? { u: geometry.x, v: geometry.y, du: geometry.width, dv: geometry.height }
    : { u: geometry.y, v: geometry.x, du: geometry.height, dv: geometry.width };
}

const start = (box: Box, along: Along) => (along === "u" ? box.u : box.v);
const extent = (box: Box, along: Along) => (along === "u" ? box.du : box.dv);
const other = (along: Along): Along => (along === "u" ? "v" : "u");

function bounds(boxes: readonly Box[]): Box {
  const u = Math.min(...boxes.map((box) => box.u));
  const v = Math.min(...boxes.map((box) => box.v));
  return {
    u,
    v,
    du: Math.max(...boxes.map((box) => box.u + box.du)) - u,
    dv: Math.max(...boxes.map((box) => box.v + box.dv)) - v,
  };
}

/** The groups a set falls into along one direction: a gutter right across the set parts two of them. */
function cut(indices: readonly number[], boxes: readonly Box[], along: Along): number[][] {
  const sorted = [...indices].sort((a, b) =>
    start(boxes[a]!, along) - start(boxes[b]!, along)
    || start(boxes[a]!, other(along)) - start(boxes[b]!, other(along)));
  const groups: number[][] = [];
  let end = -Infinity;
  for (const index of sorted) {
    const box = boxes[index]!;
    if (start(box, along) >= end) groups.push([]);
    groups[groups.length - 1]!.push(index);
    end = Math.max(end, start(box, along) + extent(box, along));
  }
  return groups;
}

function slice(indices: readonly number[], boxes: readonly Box[], prefer: Along): Slice {
  if (indices.length === 1) return { kind: "box", index: indices[0]! };
  for (const along of [prefer, other(prefer)]) {
    const groups = cut(indices, boxes, along);
    if (groups.length > 1) {
      return { kind: "run", along, parts: groups.map((group) => slice(group, boxes, other(along))) };
    }
  }
  return { kind: "knot", indices: [...indices] };
}

function leaves(node: Slice): number[] {
  if (node.kind === "box") return [node.index];
  if (node.kind === "knot") return node.indices;
  return node.parts.flatMap(leaves);
}

/** Clear distance between two spans on one axis (negative when they overlap). */
function clear(aStart: number, aSize: number, bStart: number, bSize: number): number {
  return Math.max(aStart, bStart) - Math.min(aStart + aSize, bStart + bSize);
}

/** Two boxes are too close when neither axis keeps `gap` between them. */
function crowds(a: Box, b: Box, gap: number): boolean {
  return clear(a.u, a.du, b.u, b.du) < gap && clear(a.v, a.dv, b.v, b.dv) < gap;
}

/**
 * Lay `node` out with its corner at (u, v) and write each box's corner into
 * `out`. Returns the room the node takes. `gutter` is the clear space a run
 * leaves between two neighbouring parts.
 */
function place(
  node: Slice,
  u: number,
  v: number,
  boxes: readonly Box[],
  gap: number,
  gutter: (before: Slice, after: Slice, along: Along) => number,
  out: Box[],
): { du: number; dv: number } {
  if (node.kind === "box") {
    const { du, dv } = boxes[node.index]!;
    out[node.index] = { u, v, du, dv };
    return { du, dv };
  }
  if (node.kind === "knot") {
    // Packed like text: in the order the boxes sit, each at the earliest free
    // corner within the knot's own length, one gap clear of the boxes before it.
    const frame = bounds(node.indices.map((index) => boxes[index]!));
    const limit = Math.max(frame.du, ...node.indices.map((index) => boxes[index]!.du));
    const order = [...node.indices].sort((a, b) =>
      boxes[a]!.v - boxes[b]!.v || boxes[a]!.u - boxes[b]!.u);
    const placed: Box[] = [];
    for (const index of order) {
      const { du, dv } = boxes[index]!;
      const us = [u, ...placed.map((box) => ceilGrid(box.u + box.du + gap))];
      const vs = [v, ...placed.map((box) => ceilGrid(box.v + box.dv + gap))].sort((a, b) => a - b);
      let best: Box | null = null;
      for (const candidateV of vs) {
        for (const candidateU of us.sort((a, b) => a - b)) {
          if (candidateU + du > u + limit) continue;
          const candidate = { u: candidateU, v: candidateV, du, dv };
          if (placed.some((box) => crowds(candidate, box, gap))) continue;
          best = candidate;
          break;
        }
        if (best) break;
      }
      // Below everything there is always room at the line start.
      best ??= { u, v: vs[vs.length - 1]!, du, dv };
      placed.push(best);
      out[index] = best;
    }
    const taken = bounds(placed);
    return { du: taken.u + taken.du - u, dv: taken.v + taken.dv - v };
  }
  // A run: the parts in sequence along its direction, one gutter apart. Across
  // it each part keeps the offset it has now, so level neighbours stay level.
  const across = other(node.along);
  const frames = node.parts.map((part) => bounds(leaves(part).map((index) => boxes[index]!)));
  const edge = Math.min(...frames.map((frame) => start(frame, across)));
  const origin = node.along === "u" ? u : v;
  let cursor = origin;
  let end = origin;
  let reach = 0;
  node.parts.forEach((part, index) => {
    if (index > 0) cursor = ceilGrid(end + gutter(node.parts[index - 1]!, part, node.along));
    const offset = roundGrid(start(frames[index]!, across) - edge);
    const size = node.along === "u"
      ? place(part, cursor, v + offset, boxes, gap, gutter, out)
      : place(part, u + offset, cursor, boxes, gap, gutter, out);
    reach = Math.max(reach, offset + (node.along === "u" ? size.dv : size.du));
    end = cursor + (node.along === "u" ? size.du : size.dv);
  });
  return node.along === "u" ? { du: end - origin, dv: reach } : { du: reach, dv: end - origin };
}

/**
 * Lay the listed boxes (and what the listed sections hold) out in reading
 * order, every gutter one gap, or wider where its label chips need the room.
 * The block keeps its top-left corner.
 * Returns null when fewer than two boxes move independently.
 */
export function flowLayout(
  document: InteractiveCanvasDocument,
  ids: readonly string[],
  options: FlowOptions,
): FlowResult | null {
  const { axis, gap } = options;
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const rootIds = moveRootIds(document, ids);
  if (rootIds.length < 2) return null;
  const boxes = rootIds.map((id) => toBox(byId.get(id)!.geometry, axis));
  const frame = bounds(boxes);
  // Lines first: rows for axis "x", columns for axis "y" (both are cuts along `v`).
  const tree = slice(boxes.map((_, index) => index), boxes, "v");
  const at: Box[] = new Array(boxes.length);
  // A gutter holds the chips of the labelled wires that join its two sides
  // (a listed section counts with everything in it).
  const held = rootIds.map((id) => moveClosureIds(document, [id]));
  const side = (part: Slice) => new Set(leaves(part).flatMap((index) => [...held[index]!]));
  let widened = 0;
  const gutter = (before: Slice, after: Slice, along: Along): number => {
    const need = labelledGapPx(document, side(before), side(after), (along === "u") === (axis === "x") ? "x" : "y", options.canvasStyle);
    if (need > gap) widened += 1;
    return Math.max(gap, need);
  };
  place(tree, floorGrid(frame.u), floorGrid(frame.v), boxes, gap, gutter, at);

  let next = document;
  const movedIds: string[] = [];
  rootIds.forEach((id, index) => {
    const du = at[index]!.u - boxes[index]!.u;
    const dv = at[index]!.v - boxes[index]!.v;
    if (du === 0 && dv === 0) return;
    const delta = axis === "x" ? { dx: du, dy: dv } : { dx: dv, dy: du };
    next = { ...next, objects: translateWithDescendants(next, [id], delta) };
    movedIds.push(id);
  });

  // The lines as they landed: boxes whose spans across the axis overlap, in order along it.
  const lines = cut(at.map((_, index) => index), at, "v").map((group) =>
    group.sort((a, b) => at[a]!.u - at[b]!.u || at[a]!.v - at[b]!.v).map((index) => rootIds[index]!));
  return { objects: next.objects, lines, movedIds, widened };
}
