/**
 * broken-edges — connectors must read (error + warning tiers).
 *
 * Every path judged here is the renderer's true routed polyline. Checks:
 * - through-box (error): a routed path passes through a box that is not one
 *   of its endpoints;
 * - degenerate edge (error): a self-loop, dangling endpoint, or zero-length
 *   route says nothing;
 * - anti-parallel pair (warning): two edges sharing both endpoints in
 *   opposite directions — visually one ambiguous double line;
 * - co-linear shared run (warning): two edges with no shared endpoint whose
 *   parallel segments sit ≤8px apart for ≥100px — one wire visually
 *   swallowing another;
 * - border-hugging (warning): an edge tracking a section border within 12px
 *   for ≥200px — the wire reads as part of the section frame;
 * - stranded chip (warning): a labeled edge whose chip hangs >160px from the
 *   wire actually drawn (diagonal waypoint legs park labels in empty space);
 * - crossing tangle (warning): more than 6 edge pairs crossing board-wide,
 *   reported with the count.
 *
 * Shared-endpoint pairs are exempt from the co-linear check: fan edges
 * legitimately share a trunk out of their common node.
 */
import {
  center,
  chipFor,
  distanceToPolyline,
  elbowize,
  pathBoxViolationIds,
  polylineMidpoint,
  routedPolyline,
  type Point,
} from "../geometry";
import { kindOf } from "../../helpers";

import type {
  InteractiveCanvasConnection, InteractiveCanvasDocument,
} from "@codecaine-ai/canvas/schema";
import type { LayoutRule } from "../types";

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

function pathsCross(a: readonly Point[], b: readonly Point[]): boolean {
  for (let i = 1; i < a.length; i += 1) {
    for (let j = 1; j < b.length; j += 1) {
      if (segmentsCross(a[i - 1]!, a[i]!, b[j - 1]!, b[j]!)) {
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

function sharedEndpoint(a: InteractiveCanvasConnection, b: InteractiveCanvasConnection): boolean {
  const aFrom = a.from.objectId;
  const aTo = a.to.objectId;
  const bFrom = b.from.objectId;
  const bTo = b.to.objectId;
  return aFrom === bFrom || aFrom === bTo || aTo === bFrom || aTo === bTo;
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

const GUIDANCE = `Connectors must read. Blocking (error tier — blocks commit):
- a connector that ploughs through a box;
- zero-length, dangling, and self-loop edges — delete, reconnect, or badge them.
Warnings — wires must own their space:
- two opposite edges between the same pair read as one ambiguous line; prefer a single
  edge with a both-ends arrow;
- two routes sharing a lane closer than ${COLINEAR_SEPARATION}px, a route hugging a section border, or a
  label stranded far from its wire all read as something they are not;
- a few crossings are life; past ${CROSSING_THRESHOLD} the board is a tangle — regroup the clusters so
  related nodes sit together.`;

export const rule: LayoutRule = {
  id: "broken-edges",
  title: "Broken edges",
  tier: "error",
  guidance: GUIDANCE,
  check(document) {
    const findings: ReturnType<LayoutRule["check"]> = [];
    const byId = new Map(document.objects.map((object) => [object.id, object]));

    // The same raw orthogonal polylines the renderer computed, with the full
    // document as the obstacle set.
    const routed = new Map<string, Point[]>();
    for (const edge of document.connections) {
      const points = routedPolyline(edge, document);
      if (points.length >= 2) routed.set(edge.id, points);
    }

    // Through-box (ERROR) — the old lint crossing check, per edge.
    for (const edge of document.connections) {
      const fromId = edge.from.objectId;
      const toId = edge.to.objectId;
      const path = routed.get(edge.id);
      if (!path || fromId === toId) continue;
      if (pathBoxViolationIds(path, fromId, toId, document.objects).length === 0) continue;
      findings.push({
        rule: "broken-edges",
        severity: "error",
        at: [edge.id, fromId, toId],
        where: pathBounds(path),
        message: `connector ${edge.id} (${fromId}→${toId}) passes through a box`,
        suggestion: "reroute with waypoints or move the boxes so the path is clear",
      });
    }

    // Degenerate edges (error): self-loop, dangling endpoint, zero length.
    for (const edge of document.connections) {
      const fromId = edge.from.objectId;
      const toId = edge.to.objectId;
      const from = byId.get(fromId);
      const to = byId.get(toId);
      if (fromId === toId) {
        findings.push({
          rule: "broken-edges",
          severity: "error",
          at: [edge.id, fromId],
          message: `connector ${edge.id} connects ${fromId} to itself`,
          suggestion: "delete it, or make the self-transition an explicit labeled loop",
        });
        continue;
      }
      if (!from || !to) {
        const missing = [!from ? fromId : undefined, !to ? toId : undefined]
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
          at: [edge.id, fromId, toId],
          where: pathBounds([a, b]),
          message: `connector ${edge.id} has a zero-length route (${fromId} and ${toId} coincide)`,
          suggestion: "separate the boxes so the connector can be seen",
        });
      }
    }

    // Anti-parallel pair sharing both endpoints (warning).
    for (let i = 0; i < document.connections.length; i += 1) {
      for (let j = i + 1; j < document.connections.length; j += 1) {
        const a = document.connections[i]!;
        const b = document.connections[j]!;
        const aFrom = a.from.objectId;
        const aTo = a.to.objectId;
        if (aFrom === aTo) continue;
        if (aFrom !== b.to.objectId || aTo !== b.from.objectId) continue;
        findings.push({
          rule: "broken-edges",
          severity: "warning",
          at: [a.id, b.id, aFrom, aTo],
          message: `${a.id} and ${b.id} run anti-parallel between ${aFrom} and ${aTo}`,
          suggestion: "use one edge with a both-ends arrow, or offset the two routes",
        });
      }
    }

    // Every routing-debt check judges the same true renderer paths.
    const polylines = routed;

    // Co-linear shared runs (warning, NEW): distinct-endpoint pairs whose
    // parallel segments sit ≤8px apart for ≥100px.
    for (let i = 0; i < document.connections.length; i += 1) {
      for (let j = i + 1; j < document.connections.length; j += 1) {
        const a = document.connections[i]!;
        const b = document.connections[j]!;
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
    const sections = document.objects.filter((object) => kindOf(object) === "section");
    for (const edge of document.connections) {
      const polyline = polylines.get(edge.id);
      if (!polyline) continue;
      const segments = axisSegments(polyline);
      for (const section of sections) {
        if (edge.from.objectId === section.id || edge.to.objectId === section.id) continue;
        const sectionRect = section.geometry;
        const borders: Array<{ name: string; axis: "h" | "v"; level: number; lo: number; hi: number }> = [
          { name: "top", axis: "h", level: sectionRect.y, lo: sectionRect.x, hi: sectionRect.x + sectionRect.width },
          { name: "bottom", axis: "h", level: sectionRect.y + sectionRect.height, lo: sectionRect.x, hi: sectionRect.x + sectionRect.width },
          { name: "left", axis: "v", level: sectionRect.x, lo: sectionRect.y, hi: sectionRect.y + sectionRect.height },
          { name: "right", axis: "v", level: sectionRect.x + sectionRect.width, lo: sectionRect.y, hi: sectionRect.y + sectionRect.height },
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
    for (const edge of document.connections) {
      const chip = chipFor(edge, document);
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
    for (let i = 0; i < document.connections.length; i += 1) {
      for (let j = i + 1; j < document.connections.length; j += 1) {
        const a = document.connections[i]!;
        const b = document.connections[j]!;
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
