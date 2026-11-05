/**
 * broken-edges — connectors must read (error + warning tiers).
 *
 * Every path judged here is the renderer's true routed polyline. Checks:
 * - through-box (error): a routed path passes through a box that is not one
 *   of its endpoints;
 * - through-own-caption (error): a routed path runs CAPTION_RUN px or more
 *   through the caption band (name and detail painted under an icon's tile)
 *   of one of its own endpoints — the through-box check exempts endpoints,
 *   and the router avoids only other icons' tiles, so nothing else sees it;
 * - degenerate edge (error): a self-loop, dangling endpoint, or zero-length
 *   route says nothing;
 * - anti-parallel pair (warning): two edges sharing both endpoints in
 *   opposite directions whose drawn wires lie on one another for SHARED_RUN
 *   px or more — visually one ambiguous double-headed line. A reply routed
 *   apart from its request reads as two wires and is not a finding;
 * - stranded chip (warning): a labeled edge whose chip hangs >160px from the
 *   wire actually drawn (diagonal waypoint legs park labels in empty space).
 *
 * Crossings and wire length are layout numbers (canvas_check prints them),
 * not findings.
 */
import {
  captionBand,
  center,
  chipFor,
  distanceToPolyline,
  elbowize,
  pathBoxViolationIds,
  polylineLengthInRect,
  routedPolyline,
  type Point,
  type Rect,
} from "../geometry";

import type {
  InteractiveCanvasConnection, InteractiveCanvasObject,
} from "../../../state/schema";
import type { CanvasStyle } from "../../../theme/canvas-style";
import type { LayoutRule } from "../types";

/** Shortest run inside an endpoint's caption band that reads as a line through its text. */
const CAPTION_RUN = 8;
/** A chip farther than this from its own wire is stranded. */
const STRANDED_DISTANCE = 160;
/** Two drawn wires closer than this (center to center) paint as one line. */
const SHARED_TOLERANCE = 4;
/** Shortest stretch two opposite wires must share to read as one line. */
const SHARED_RUN = 16;

/** How far along `a` its wire lies within SHARED_TOLERANCE of `b`, sampled every 2px or less. */
function sharedRun(a: readonly Point[], b: readonly Point[]): number {
  let run = 0;
  for (let i = 1; i < a.length; i += 1) {
    const start = a[i - 1]!;
    const end = a[i]!;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const steps = Math.ceil(length / 2);
    for (let k = 0; k < steps; k += 1) {
      const t = (k + 0.5) / steps;
      const sample = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
      if (distanceToPolyline(sample, b) <= SHARED_TOLERANCE) run += length / steps;
    }
  }
  return run;
}

function pathBounds(points: readonly Point[]): { x: number; y: number; width: number; height: number } {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(1, Math.max(...xs) - x), height: Math.max(1, Math.max(...ys) - y) };
}

/**
 * The caption bands of `edge`'s own endpoints that its routed `path` runs
 * through for CAPTION_RUN px or more. Shared with tighten_wires, which may
 * not add one.
 */
export function ownCaptionRuns(
  edge: InteractiveCanvasConnection,
  path: readonly Point[],
  byId: ReadonlyMap<string, InteractiveCanvasObject>,
  canvasStyle?: CanvasStyle,
): { object: InteractiveCanvasObject; band: Rect; run: number }[] {
  if (edge.from.objectId === edge.to.objectId) return [];
  const runs: { object: InteractiveCanvasObject; band: Rect; run: number }[] = [];
  for (const id of [edge.from.objectId, edge.to.objectId]) {
    const object = byId.get(id);
    if (!object) continue;
    const band = captionBand(object, canvasStyle);
    if (!band) continue;
    const run = polylineLengthInRect(path, band);
    if (run >= CAPTION_RUN) runs.push({ object, band, run });
  }
  return runs;
}

const GUIDANCE = `Connectors must read. Blocking (error tier — blocks commit):
- a connector that ploughs through a box;
- a connector that runs through its own endpoint's caption, the name and detail under an icon's
  tile — change_connection it to meet the tile on the side away from the caption, or move_to the
  other end level with the tile; a waypoint cannot clear it;
- zero-length, dangling, and self-loop edges — delete or reconnect them; a self-loop's
  meaning belongs in the node's own text, or on a sticky beside it.
Warnings:
- two opposite edges between the same pair drawn on one line read as one ambiguous line;
  prefer a single edge with a both-ends arrow, or route the reply apart;
- a label stranded far from its wire reads as something it is not.`;

export const rule: LayoutRule = {
  id: "broken-edges",
  title: "Broken edges",
  tier: "error",
  guidance: GUIDANCE,
  check(document, context) {
    const findings: ReturnType<LayoutRule["check"]> = [];
    const byId = new Map(document.objects.map((object) => [object.id, object]));

    // The same raw orthogonal polylines the renderer computed, with the full
    // document as the obstacle set.
    const routed = new Map<string, Point[]>();
    for (const edge of document.connections) {
      const points = routedPolyline(edge, document, context?.canvasStyle);
      if (points.length >= 2) routed.set(edge.id, points);
    }

    // Through-box (error): a routed path crossing a box that is not one of its
    // own endpoints, judged per edge.
    for (const edge of document.connections) {
      const fromId = edge.from.objectId;
      const toId = edge.to.objectId;
      const path = routed.get(edge.id);
      if (!path || fromId === toId) continue;
      if (pathBoxViolationIds(path, fromId, toId, document.objects, context?.canvasStyle).length === 0) continue;
      findings.push({
        rule: "broken-edges",
        severity: "error",
        at: [edge.id, fromId, toId],
        where: pathBounds(path),
        message: `connector ${edge.id} (${fromId}→${toId}) passes through a box`,
        suggestion: "reroute with waypoints or move the boxes so the path is clear",
      });
    }

    // Through-own-caption (error): a routed path running through the caption
    // band of one of its own endpoints, which through-box exempts.
    for (const edge of document.connections) {
      const path = routed.get(edge.id);
      if (!path) continue;
      for (const { object, band, run } of ownCaptionRuns(edge, path, byId, context?.canvasStyle)) {
        const other = object.id === edge.from.objectId ? edge.to.objectId : edge.from.objectId;
        findings.push({
          rule: "broken-edges",
          severity: "error",
          at: [edge.id, object.id],
          where: band,
          message: `connector ${edge.id} runs ${Math.round(run)}px through its endpoint ${object.id}'s caption`,
          suggestion: `change_connection ${edge.id} to meet ${object.id} on the side away from the caption `
            + `(anchor top, or left or right when ${other} is level with the tile), `
            + `or move_to ${other} level with ${object.id}'s tile`,
        });
      }
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

    // Anti-parallel pair sharing both endpoints and drawn on one line (warning).
    for (let i = 0; i < document.connections.length; i += 1) {
      for (let j = i + 1; j < document.connections.length; j += 1) {
        const a = document.connections[i]!;
        const b = document.connections[j]!;
        const aFrom = a.from.objectId;
        const aTo = a.to.objectId;
        if (aFrom === aTo) continue;
        if (aFrom !== b.to.objectId || aTo !== b.from.objectId) continue;
        const aPath = routed.get(a.id);
        const bPath = routed.get(b.id);
        if (!aPath || !bPath) continue;
        const run = sharedRun(elbowize(aPath), elbowize(bPath));
        if (run < SHARED_RUN) continue;
        findings.push({
          rule: "broken-edges",
          severity: "warning",
          at: [a.id, b.id, aFrom, aTo],
          where: pathBounds(aPath),
          message: `${a.id} and ${b.id} run anti-parallel between ${aFrom} and ${aTo}`,
          suggestion: "use one edge with a both-ends arrow, or offset the two routes",
        });
      }
    }

    // Stranded chips (warning): where the chip is actually DRAWN vs the
    // axis-aligned wire actually drawn (elbowized polyline). Only diagonal
    // waypoint legs can diverge; elbow-routed edges are on-wire by
    // construction.
    //
    // A `labelPosition.offset` pushes the chip off the wire ON PURPOSE
    // (that is how `move_label` clears a covered label), so the authored
    // offset is spent as budget before the distance is judged. A pin whose
    // drift is no more than what its author asked for is placed, not
    // stranded; drift beyond it still reads as a broken route.
    for (const edge of document.connections) {
      const chip = chipFor(edge, document, context?.canvasStyle);
      const polyline = routed.get(edge.id);
      if (!chip || !polyline) continue;
      const chipCenter = {
        x: chip.rect.x + chip.rect.width / 2,
        y: chip.rect.y + chip.rect.height / 2,
      };
      const authoredOffset = Math.abs(edge.labelPosition?.offset ?? 0);
      const distance = distanceToPolyline(chipCenter, elbowize(polyline)) - authoredOffset;
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

    return findings;
  },
};
