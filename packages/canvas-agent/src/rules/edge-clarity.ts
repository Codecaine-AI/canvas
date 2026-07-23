/**
 * edge-clarity — connectors must read (mixed tier).
 *
 * Four checks (v4-build-spec.md, Agent R2; grown from pipeline/lint.ts
 * crossingViolations):
 *  - through-box (ERROR): a connector's routed path passes through a box that
 *    is not one of its endpoints — reuses the pipeline's elbow routing +
 *    countPathBoxViolations sampling, exactly as the old lint did;
 *  - anti-parallel pair (warning): two edges sharing both endpoints in
 *    opposite directions — visually one ambiguous double line;
 *  - degenerate edge (warning): self-loop to the same object, dangling
 *    endpoint, or a zero-length route between coincident centers;
 *  - crossing tangle (warning): more than CROSSING_THRESHOLD edge pairs
 *    crossing each other board-wide, reported with the count.
 */
import {
  countPathBoxViolations,
  directElbowEdges,
  type RoutableObject,
  type RoutedSketchEdge,
} from "../pipeline/route";

import type { BoardEdge, BoardModel, BoardNode } from "../digest/board-model";
import type { LayoutRule } from "./types";

/** Board-wide crossing-pair count above which the tangle warning fires. */
const CROSSING_THRESHOLD = 6;

interface Point { x: number; y: number }

function routables(board: BoardModel): RoutableObject[] {
  return board.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    geometry: { x: node.x, y: node.y, width: node.width, height: node.height },
  }));
}

function center(node: BoardNode): Point {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function pathBounds(points: readonly Point[]): { x: number; y: number; width: number; height: number } {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(1, Math.max(...xs) - x), height: Math.max(1, Math.max(...ys) - y) };
}

function orientation(a: Point, b: Point, c: Point): number {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (value > 1e-9) return 1;
  if (value < -1e-9) return -1;
  return 0;
}

/** Proper (interior) crossing of segments ab and cd. */
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

function pathsCross(a: RoutedSketchEdge, b: RoutedSketchEdge): boolean {
  for (let i = 1; i < a.points.length; i += 1) {
    for (let j = 1; j < b.points.length; j += 1) {
      if (segmentsCross(a.points[i - 1]!, a.points[i]!, b.points[j - 1]!, b.points[j]!)) {
        return true;
      }
    }
  }
  return false;
}

export const rule: LayoutRule = {
  id: "edge-clarity",
  title: "Edge clarity",
  tier: "error",
  guidance: [
    "A connector that ploughs through a box is unreadable — that blocks commit; route around,",
    "or move the boxes so the path is clear. Two opposite edges between the same pair read as",
    "one ambiguous line: prefer a single edge with a both-ends arrow, or separate the routes.",
    `A few crossings are life; past ${CROSSING_THRESHOLD} the board is a tangle — regroup the`,
    "clusters so related nodes sit together. Zero-length or dangling edges say nothing: delete",
    "or reconnect them.",
  ].join("\n"),
  check(board) {
    const findings: ReturnType<LayoutRule["check"]> = [];
    const objects = routables(board);

    // Route each edge alone so ids stay attached (directElbowEdges drops
    // edges with missing endpoints and takes id-less SketchEdge inputs).
    const routed = new Map<string, RoutedSketchEdge>();
    for (const edge of board.edges) {
      const [path] = directElbowEdges(objects, [{ from: edge.fromId, to: edge.toId }]);
      if (path) routed.set(edge.id, path);
    }

    // Through-box (ERROR) — the old lint crossing check, per edge.
    for (const edge of board.edges) {
      const path = routed.get(edge.id);
      if (!path || edge.fromId === edge.toId) continue;
      if (countPathBoxViolations([path], objects) === 0) continue;
      findings.push({
        rule: "edge-clarity",
        severity: "error",
        at: [edge.id, edge.fromId, edge.toId],
        where: pathBounds(path.points),
        message: `connector ${edge.id} (${edge.fromId}→${edge.toId}) passes through a box`,
        suggestion: "reroute with waypoints or move the boxes so the path is clear",
      });
    }

    // Anti-parallel pair sharing both endpoints (warning).
    for (let i = 0; i < board.edges.length; i += 1) {
      for (let j = i + 1; j < board.edges.length; j += 1) {
        const a = board.edges[i]!;
        const b = board.edges[j]!;
        if (a.fromId === a.toId) continue;
        if (a.fromId !== b.toId || a.toId !== b.fromId) continue;
        findings.push({
          rule: "edge-clarity",
          severity: "warning",
          at: [a.id, b.id, a.fromId, a.toId],
          message: `${a.id} and ${b.id} run anti-parallel between ${a.fromId} and ${a.toId}`,
          suggestion: "use one edge with a both-ends arrow, or offset the two routes",
        });
      }
    }

    // Degenerate edges (warning): self-loop, dangling endpoint, zero length.
    for (const edge of board.edges) {
      const from = board.byId(edge.fromId);
      const to = board.byId(edge.toId);
      if (edge.fromId === edge.toId) {
        findings.push({
          rule: "edge-clarity",
          severity: "warning",
          at: [edge.id, edge.fromId],
          message: `connector ${edge.id} connects ${edge.fromId} to itself`,
          suggestion: "delete it, or make the self-transition an explicit labeled loop",
        });
        continue;
      }
      if (!from || !to) {
        const missing = [!from ? edge.fromId : undefined, !to ? edge.toId : undefined]
          .filter((id): id is string => id !== undefined);
        findings.push({
          rule: "edge-clarity",
          severity: "warning",
          at: [edge.id, ...missing],
          message: `connector ${edge.id} dangles: no object ${missing.join(", ")}`,
          suggestion: "reconnect or delete the edge",
        });
        continue;
      }
      const a = center(from);
      const b = center(to);
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1) {
        findings.push({
          rule: "edge-clarity",
          severity: "warning",
          at: [edge.id, edge.fromId, edge.toId],
          where: pathBounds([a, b]),
          message: `connector ${edge.id} has a zero-length route (${edge.fromId} and ${edge.toId} coincide)`,
          suggestion: "separate the boxes so the connector can be seen",
        });
      }
    }

    // Board-wide crossing tangle (warning), pairs not sharing an endpoint.
    let crossings = 0;
    const involved: string[] = [];
    for (let i = 0; i < board.edges.length; i += 1) {
      for (let j = i + 1; j < board.edges.length; j += 1) {
        const a = board.edges[i]!;
        const b = board.edges[j]!;
        if (a.fromId === b.fromId || a.fromId === b.toId
          || a.toId === b.fromId || a.toId === b.toId) continue;
        const pathA = routed.get(a.id);
        const pathB = routed.get(b.id);
        if (!pathA || !pathB || !pathsCross(pathA, pathB)) continue;
        crossings += 1;
        if (!involved.includes(a.id)) involved.push(a.id);
        if (!involved.includes(b.id)) involved.push(b.id);
      }
    }
    if (crossings > CROSSING_THRESHOLD) {
      findings.push({
        rule: "edge-clarity",
        severity: "warning",
        at: involved,
        message: `${crossings} connector crossings board-wide (threshold ${CROSSING_THRESHOLD})`,
        suggestion: "regroup the clusters so connected nodes sit near each other",
      });
    }

    return findings;
  },
};
