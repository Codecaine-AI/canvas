/**
 * label-clearance — an edge-label chip occludes a node or another chip
 * (ERROR tier).
 *
 * Chip rect estimate (v4-build-spec.md, Agent R2): label.length*8+24 wide ×
 * 28 tall, centered at the midpoint of the from→to segment — or of the first
 * waypoint segment when the edge stores waypoints. A chip over a third box's
 * face, or two chips over each other, makes both illegible: that blocks
 * commit. The edge's own endpoint boxes are not counted — a chip nosing into
 * its endpoints is a spacing matter (widen to the 96 rung), not occlusion.
 */
import { directElbowEdges } from "../pipeline/route";

import type { BoardEdge, BoardModel, BoardNode } from "../digest/board-model";
import type { LayoutRule } from "./types";

/** Chip width estimate per label character, plus padding (px). */
const CHIP_CHAR_WIDTH = 8;
const CHIP_PADDING = 24;
const CHIP_HEIGHT = 28;

interface Rect { x: number; y: number; width: number; height: number }

interface Chip { edge: BoardEdge; label: string; rect: Rect }

function center(node: BoardNode): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

/**
 * Arc-length midpoint of a polyline — where the renderer actually hangs the
 * chip. The straight-segment estimate this replaces mislocated chips on any
 * elbowed route (the v4 smoke board's "dispatch"/"promote" misses).
 */
function polylineMidpoint(points: readonly { x: number; y: number }[]): { x: number; y: number } | undefined {
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

function chipFor(edge: BoardEdge, board: BoardModel): Chip | undefined {
  const label = edge.label;
  if (label === undefined || label === "") return undefined;
  const from = board.byId(edge.fromId);
  const to = board.byId(edge.toId);
  if (!from || !to) return undefined;
  // Prefer the actual route: stored waypoints, else the same elbow router the
  // renderer uses. Fall back to the straight segment only if routing fails.
  let mid: { x: number; y: number } | undefined;
  if (edge.waypoints && edge.waypoints.length > 0) {
    mid = polylineMidpoint([
      center(from),
      ...edge.waypoints.map(([x, y]) => ({ x, y })),
      center(to),
    ]);
  } else {
    const objects = board.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      geometry: { x: node.x, y: node.y, width: node.width, height: node.height },
    }));
    const [path] = directElbowEdges(objects, [{ from: edge.fromId, to: edge.toId }]);
    mid = path ? polylineMidpoint(path.points) : undefined;
  }
  if (!mid) {
    const start = center(from);
    const end = center(to);
    mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  }
  const width = label.length * CHIP_CHAR_WIDTH + CHIP_PADDING;
  return {
    edge,
    label,
    rect: { x: mid.x - width / 2, y: mid.y - CHIP_HEIGHT / 2, width, height: CHIP_HEIGHT },
  };
}

/** Strictly-positive rect intersection. */
function intersects(a: Rect, b: Rect): boolean {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0
    && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0;
}

export const rule: LayoutRule = {
  id: "label-clearance",
  title: "Label clearance",
  tier: "error",
  guidance: [
    "Edge labels need clear air: a label chip sitting on a box face or on another label is",
    "unreadable, and that blocks commit. Give labeled edges room (the 96 spacing rung exists",
    "for exactly this), route around the crowd, shorten the label, or move it with a waypoint.",
  ].join("\n"),
  check(board) {
    const findings: ReturnType<LayoutRule["check"]> = [];
    const chips = board.edges
      .map((edge) => chipFor(edge, board))
      .filter((chip): chip is Chip => chip !== undefined);
    const boxes = board.nodes.filter((node) => node.kind === "node");

    // Chip over a third node's face.
    for (const chip of chips) {
      for (const node of boxes) {
        if (node.id === chip.edge.fromId || node.id === chip.edge.toId) continue;
        if (!intersects(chip.rect, { x: node.x, y: node.y, width: node.width, height: node.height })) continue;
        findings.push({
          rule: "label-clearance",
          severity: "error",
          at: [chip.edge.id, node.id],
          where: chip.rect,
          message: `label "${chip.label}" chip on ${chip.edge.id} covers ${node.id}`,
          suggestion: `route ${chip.edge.id} around ${node.id} or move the label with a waypoint`,
        });
      }
    }

    // Chip over chip.
    for (let i = 0; i < chips.length; i += 1) {
      for (let j = i + 1; j < chips.length; j += 1) {
        const a = chips[i]!;
        const b = chips[j]!;
        if (!intersects(a.rect, b.rect)) continue;
        findings.push({
          rule: "label-clearance",
          severity: "error",
          at: [a.edge.id, b.edge.id],
          where: a.rect,
          message: `label "${a.label}" chip on ${a.edge.id} overlaps label "${b.label}" chip on ${b.edge.id}`,
          suggestion: "separate the two edges (spacing or waypoints) so both labels read",
        });
      }
    }

    return findings;
  },
};
