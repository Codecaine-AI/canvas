/**
 * broken-edges — connectors must read (v5 Tier A graph lint, mixed tier).
 *
 * From v4 edge-clarity, extended with the swimlane round's routing-debt
 * blind spots (v4r1-swimlane.md: the co-linear dashed-over-solid run,
 * border-hugging status route, and margin-stranded labels all shipped with
 * zero findings):
 *  - through-box (ERROR): a connector's routed path passes through a box
 *    that is not one of its endpoints (elbow routing + countPathBoxViolations
 *    sampling, unchanged);
 *  - degenerate edge (ERROR — promoted from warning per v5-plan §1; a
 *    self-loop, dangling endpoint, or zero-length route says nothing):
 *  - anti-parallel pair (warning): two edges sharing both endpoints in
 *    opposite directions — visually one ambiguous double line;
 *  - co-linear shared run (warning, NEW): two edges with no shared endpoint
 *    whose parallel axis-aligned segments sit ≤8px apart for ≥100px — one
 *    wire visually swallowing another;
 *  - border-hugging (warning, NEW): an edge tracking a section border within
 *    12px for ≥200px — the wire reads as part of the section frame;
 *  - stranded chip (warning, NEW): a labeled edge whose chip midpoint hangs
 *    >160px from the axis-aligned wire actually drawn (diagonal waypoint
 *    legs park the label in empty space);
 *  - crossing tangle (warning): more than CROSSING_THRESHOLD edge pairs
 *    crossing board-wide, reported with the count.
 *
 * Shared-endpoint pairs are exempt from the co-linear check: fan edges
 * legitimately share a trunk out of their common node.
 */
import {
  countPathBoxViolations,
  directElbowEdges,
  type RoutableObject,
  type RoutedSketchEdge,
} from "../pipeline/route";
import {
  center,
  chipFor,
  distanceToPolyline,
  elbowize,
  polylineMidpoint,
  routedPolyline,
  type Point,
} from "./geometry";

import type { BoardEdge, BoardModel } from "../digest/board-model";
import type { LayoutRule } from "../rules/types";

/** Board-wide crossing-pair count above which the tangle warning fires. */
const CROSSING_THRESHOLD = 6;
/** Two parallel segments this close read as one wire. */
const COLINEAR_SEPARATION = 8;
/** Minimum shared-run length before the co-linear warning fires. */
const COLINEAR_RUN = 100;
/** An edge this close to a section border is hugging it. */
const BORDER_DISTANCE = 12;
/** Minimum hugged run length before the border warning fires. */
const BORDER_RUN = 200;
/** A chip farther than this from its own wire is stranded. */
const STRANDED_DISTANCE = 160;

function routables(board: BoardModel): RoutableObject[] {
  return board.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    geometry: { x: node.x, y: node.y, width: node.width, height: node.height },
  }));
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

interface AxisSegment { axis: "h" | "v"; level: number; lo: number; hi: number }

/** Axis-aligned segments of a polyline (diagonal legs skipped). */
function axisSegments(points: readonly Point[]): AxisSegment[] {
  const segments: AxisSegment[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (a.y === b.y && a.x !== b.x) {
      segments.push({ axis: "h", level: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) });
    } else if (a.x === b.x && a.y !== b.y) {
      segments.push({ axis: "v", level: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) });
    }
  }
  return segments;
}

function sharedEndpoint(a: BoardEdge, b: BoardEdge): boolean {
  return a.fromId === b.fromId || a.fromId === b.toId
    || a.toId === b.fromId || a.toId === b.toId;
}

/** Longest parallel co-run (≤ separation apart) between two segment sets. */
function longestCoRun(a: AxisSegment[], b: AxisSegment[]): { run: number; separation: number } {
  let best = { run: 0, separation: 0 };
  for (const sa of a) {
    for (const sb of b) {
      if (sa.axis !== sb.axis) continue;
      const separation = Math.abs(sa.level - sb.level);
      if (separation > COLINEAR_SEPARATION) continue;
      const run = Math.min(sa.hi, sb.hi) - Math.max(sa.lo, sb.lo);
      if (run > best.run) best = { run, separation };
    }
  }
  return best;
}

export const rule: LayoutRule = {
  id: "broken-edges",
  title: "Broken edges",
  tier: "error",
  guidance: [
    "A connector that ploughs through a box is unreadable — that blocks commit; so do",
    "zero-length, dangling, and self-loop edges (delete, reconnect, or badge them). Two",
    "opposite edges between the same pair read as one ambiguous line: prefer a single edge",
    "with a both-ends arrow. Wires must own their space: two routes sharing a lane closer",
    `than ${COLINEAR_SEPARATION}px, a route hugging a section border, or a label stranded far from its wire`,
    `all read as something they are not. A few crossings are life; past ${CROSSING_THRESHOLD} the board is a`,
    "tangle — regroup the clusters so related nodes sit together.",
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
        rule: "broken-edges",
        severity: "error",
        at: [edge.id, edge.fromId, edge.toId],
        where: pathBounds(path.points),
        message: `connector ${edge.id} (${edge.fromId}→${edge.toId}) passes through a box`,
        suggestion: "reroute with waypoints or move the boxes so the path is clear",
      });
    }

    // Degenerate edges (ERROR — promoted per v5-plan): self-loop, dangling
    // endpoint, zero length.
    for (const edge of board.edges) {
      const from = board.byId(edge.fromId);
      const to = board.byId(edge.toId);
      if (edge.fromId === edge.toId) {
        findings.push({
          rule: "broken-edges",
          severity: "error",
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
          rule: "broken-edges",
          severity: "error",
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
          rule: "broken-edges",
          severity: "error",
          at: [edge.id, edge.fromId, edge.toId],
          where: pathBounds([a, b]),
          message: `connector ${edge.id} has a zero-length route (${edge.fromId} and ${edge.toId} coincide)`,
          suggestion: "separate the boxes so the connector can be seen",
        });
      }
    }

    // Anti-parallel pair sharing both endpoints (warning).
    for (let i = 0; i < board.edges.length; i += 1) {
      for (let j = i + 1; j < board.edges.length; j += 1) {
        const a = board.edges[i]!;
        const b = board.edges[j]!;
        if (a.fromId === a.toId) continue;
        if (a.fromId !== b.toId || a.toId !== b.fromId) continue;
        findings.push({
          rule: "broken-edges",
          severity: "warning",
          at: [a.id, b.id, a.fromId, a.toId],
          message: `${a.id} and ${b.id} run anti-parallel between ${a.fromId} and ${a.toId}`,
          suggestion: "use one edge with a both-ends arrow, or offset the two routes",
        });
      }
    }

    // Polylines for the routing-debt checks (waypoint-aware).
    const polylines = new Map<string, Point[]>();
    for (const edge of board.edges) {
      const polyline = routedPolyline(edge, board);
      if (polyline.length >= 2) polylines.set(edge.id, polyline);
    }

    // Co-linear shared runs (warning, NEW): distinct-endpoint pairs whose
    // parallel segments sit ≤8px apart for ≥100px.
    for (let i = 0; i < board.edges.length; i += 1) {
      for (let j = i + 1; j < board.edges.length; j += 1) {
        const a = board.edges[i]!;
        const b = board.edges[j]!;
        if (sharedEndpoint(a, b)) continue;
        const pa = polylines.get(a.id);
        const pb = polylines.get(b.id);
        if (!pa || !pb) continue;
        const { run, separation } = longestCoRun(axisSegments(pa), axisSegments(pb));
        if (run < COLINEAR_RUN) continue;
        findings.push({
          rule: "broken-edges",
          severity: "warning",
          at: [a.id, b.id],
          message: `${a.id} and ${b.id} run co-linear for ${Math.round(run)}px (${Math.round(separation)}px apart)`,
          suggestion: "offset one route so the two wires read separately",
        });
      }
    }

    // Border-hugging (warning, NEW): an edge tracking one section border
    // within 12px for ≥200px total.
    const sections = board.nodes.filter((node) => node.kind === "section");
    for (const edge of board.edges) {
      const polyline = polylines.get(edge.id);
      if (!polyline) continue;
      const segments = axisSegments(polyline);
      for (const section of sections) {
        if (edge.fromId === section.id || edge.toId === section.id) continue;
        const borders: Array<{ name: string; axis: "h" | "v"; level: number; lo: number; hi: number }> = [
          { name: "top", axis: "h", level: section.y, lo: section.x, hi: section.x + section.width },
          { name: "bottom", axis: "h", level: section.y + section.height, lo: section.x, hi: section.x + section.width },
          { name: "left", axis: "v", level: section.x, lo: section.y, hi: section.y + section.height },
          { name: "right", axis: "v", level: section.x + section.width, lo: section.y, hi: section.y + section.height },
        ];
        let worst: { name: string; run: number } | undefined;
        for (const border of borders) {
          let run = 0;
          for (const segment of segments) {
            if (segment.axis !== border.axis) continue;
            if (Math.abs(segment.level - border.level) > BORDER_DISTANCE) continue;
            run += Math.max(0, Math.min(segment.hi, border.hi) - Math.max(segment.lo, border.lo));
          }
          if (run >= BORDER_RUN && (worst === undefined || run > worst.run)) {
            worst = { name: border.name, run };
          }
        }
        if (!worst) continue;
        findings.push({
          rule: "broken-edges",
          severity: "warning",
          at: [edge.id, section.id],
          message: `connector ${edge.id} hugs the ${worst.name} border of ${section.id} for ${Math.round(worst.run)}px`,
          suggestion: `route ${edge.id} clear of ${section.id}'s frame so it reads as a wire, not a border`,
        });
      }
    }

    // Stranded chips (warning, NEW): the chip midpoint estimate vs the
    // axis-aligned wire actually drawn (elbowized polyline). Only diagonal
    // waypoint legs can diverge; elbow-routed edges are on-wire by
    // construction.
    for (const edge of board.edges) {
      const chip = chipFor(edge, board);
      const polyline = polylines.get(edge.id);
      if (!chip || !polyline) continue;
      const mid = polylineMidpoint(polyline);
      if (!mid) continue;
      const distance = distanceToPolyline(mid, elbowize(polyline));
      if (distance <= STRANDED_DISTANCE) continue;
      findings.push({
        rule: "broken-edges",
        severity: "warning",
        at: [edge.id],
        where: chip.rect,
        message: `label "${chip.label}" chip on ${edge.id} hangs ${Math.round(distance)}px from its own wire`,
        suggestion: `re-place ${edge.id}'s waypoints so the label sits on the drawn route`,
      });
    }

    // Board-wide crossing tangle (warning), pairs not sharing an endpoint.
    let crossings = 0;
    const involved: string[] = [];
    for (let i = 0; i < board.edges.length; i += 1) {
      for (let j = i + 1; j < board.edges.length; j += 1) {
        const a = board.edges[i]!;
        const b = board.edges[j]!;
        if (sharedEndpoint(a, b)) continue;
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
        rule: "broken-edges",
        severity: "warning",
        at: involved,
        message: `${crossings} connector crossings board-wide (threshold ${CROSSING_THRESHOLD})`,
        suggestion: "regroup the clusters so connected nodes sit near each other",
      });
    }

    return findings;
  },
};
