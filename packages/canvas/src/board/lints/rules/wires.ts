/**
 * How the drawn wires read, measured on the renderer's own routes
 * and chips (board/lints/geometry.ts), so the verdicts hold for any router
 * or chip placement. Run only at canvas_check and finalize (FINISHING_RULES),
 * never on each edit (warning tier, never blocks):
 * - shared-wire: two wires run within SHARED_GAP_PX of each other on one
 *   axis for more than SHARED_MIN_RUN_PX in total. Runs the lane pass merges
 *   on purpose (connectors/lanes.ts runsAreMates: a trunk of one meaning, or a
 *   junction of related arrowheads into one port) are fine. The pass leaves the rest
 *   where it finds no free lane: two end runs, or a run boxes hem in;
 * - chip-on-border: a label chip that a section's frame line runs through;
 * - short-wire: a labelled wire shorter than its chip (along the segment it
 *   sits on) plus SHORT_WIRE_SLACK_PX: two 24px stubs and an arrowhead;
 * - hidden-arrowhead: an arrowhead under a label chip, on a last run too
 *   short to show a shaft before it, or on the same spot as another wire's
 *   head where the two are not one junction.
 */
import { CONNECTOR_END_GAP_PX, laneMeaningsOf } from "../../../connectors/routing";
import { ARROWHEAD_TIP_OVERSHOOT_RATIO, arrowheadStrokeRatio } from "../../../connectors/arrowhead";
import { runsAreMates, simplified, type LaneMeaning } from "../../../connectors/lanes";
import { DEFAULT_CANVAS_STYLE, type CanvasStyle } from "../../../theme/canvas-style";
import { kindOf } from "../../helpers";
import { isPageSection } from "../../section-colors";
import { chipFor, intersects, polylineLength, routedPolyline, type Chip, type Point, type Rect } from "../geometry";

import type { InteractiveCanvasConnection, InteractiveCanvasDocument } from "../../../state/schema";
import type { LayoutRule, LintContext } from "../types";

/** Two parallel runs closer than this read as one line. */
export const SHARED_GAP_PX = 8;
/** Two wires may share this much line before it counts. */
export const SHARED_MIN_RUN_PX = 40;
/** A labelled wire needs its chip plus this: two 24px stubs and a 20px arrowhead. */
export const SHORT_WIRE_SLACK_PX = 68;
/** The least shaft an arrowhead needs before it to read as a head, not a hook. */
const MIN_SHAFT_PX = 6;
/** Two head tips closer than this paint as one head. */
const STACKED_TIP_PX = 8;

interface Wire {
  edge: InteractiveCanvasConnection;
  /** The painted polyline, simplified as the lane pass reads it. */
  points: Point[];
  meaning: LaneMeaning;
}

interface Head {
  wire: Wire;
  /** The index of the run the head ends. */
  run: number;
  tip: Point;
  /** The head's bounding box. */
  box: Rect;
  /** Visible shaft between the bend (or the far end) and the head's base. */
  shaft: number;
}

const round = (value: number) => Math.round(value);

/** Run `i` of `a` and run `j` of `b` are a trunk or a junction the lane pass merges on purpose. */
const mates = (a: Wire, i: number, b: Wire, j: number) => runsAreMates(a.meaning, a.points, i, b.meaning, b.points, j);

/** How much of two wires runs on one line apart from mate runs, and where the longest such run starts. */
function sharedRun(wireA: Wire, wireB: Wire): { length: number; at: Point } {
  const [a, b] = [wireA.points, wireB.points];
  let length = 0;
  let longest = 0;
  let at: Point = a[0]!;
  for (let i = 1; i < a.length; i += 1) {
    const [p, q] = [a[i - 1]!, a[i]!];
    const horizontal = p.y === q.y;
    if (!horizontal && p.x !== q.x) continue;
    for (let j = 1; j < b.length; j += 1) {
      if (mates(wireA, i - 1, wireB, j - 1)) continue;
      const [r, s] = [b[j - 1]!, b[j]!];
      if (horizontal ? r.y !== s.y : r.x !== s.x) continue;
      if (horizontal ? r.x === s.x : r.y === s.y) continue;
      if (Math.abs(horizontal ? p.y - r.y : p.x - r.x) > SHARED_GAP_PX) continue;
      const [a0, a1] = horizontal ? [Math.min(p.x, q.x), Math.max(p.x, q.x)] : [Math.min(p.y, q.y), Math.max(p.y, q.y)];
      const [b0, b1] = horizontal ? [Math.min(r.x, s.x), Math.max(r.x, s.x)] : [Math.min(r.y, s.y), Math.max(r.y, s.y)];
      const run = Math.min(a1, b1) - Math.max(a0, b0);
      if (run <= 0) continue;
      length += run;
      if (run > longest) {
        longest = run;
        at = horizontal ? { x: Math.max(a0, b0), y: p.y } : { x: p.x, y: Math.max(a0, b0) };
      }
    }
  }
  return { length, at };
}

/** The arrowheads a wire paints, as the static renderer draws them. */
function headsOf(wire: Wire, strokeWidth: number): Head[] {
  const arrow = wire.edge.arrow ?? "forward";
  const ends: [Point, Point, number][] = [];
  const { points } = wire;
  if (arrow === "forward" || arrow === "both") ends.push([points[points.length - 1]!, points[points.length - 2]!, points.length - 2]);
  if (arrow === "back" || arrow === "both") ends.push([points[0]!, points[1]!, 0]);
  const length = arrowheadStrokeRatio(strokeWidth) * strokeWidth;
  return ends.flatMap(([end, neighbor, index]) => {
    const step = Math.hypot(end.x - neighbor.x, end.y - neighbor.y);
    if (step === 0) return [];
    const ux = (end.x - neighbor.x) / step;
    const uy = (end.y - neighbor.y) / step;
    const run = straightRun(end === points[0] ? points : [...points].reverse(), ux, uy);
    const pullback = Math.min(CONNECTOR_END_GAP_PX, run / 2);
    const tipFromEnd = ARROWHEAD_TIP_OVERSHOOT_RATIO * strokeWidth - pullback;
    const tip = { x: end.x + ux * tipFromEnd, y: end.y + uy * tipFromEnd };
    const base = { x: tip.x - ux * length, y: tip.y - uy * length };
    const half = length / 2;
    const box = {
      x: Math.min(tip.x, base.x) - Math.abs(uy) * half,
      y: Math.min(tip.y, base.y) - Math.abs(ux) * half,
      width: Math.abs(tip.x - base.x) + Math.abs(uy) * length,
      height: Math.abs(tip.y - base.y) + Math.abs(ux) * length,
    };
    return [{ wire, run: index, tip, box, shaft: run + tipFromEnd - length }];
  });
}

/**
 * How far `points` runs straight from its first point, against direction
 * (ux, uy): the router splits a straight leg at its stub, so collinear
 * segments join into one run.
 */
function straightRun(points: readonly Point[], ux: number, uy: number): number {
  let run = 0;
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i - 1]!.x - points[i]!.x;
    const dy = points[i - 1]!.y - points[i]!.y;
    const step = Math.hypot(dx, dy);
    if (step === 0) continue;
    if (Math.abs(dx / step - ux) > 1e-6 || Math.abs(dy / step - uy) > 1e-6) break;
    run += step;
  }
  return run;
}

/** The chip's extent along the segment its center sits on. */
function chipExtent(chip: Chip, points: readonly Point[]): number {
  const cx = chip.rect.x + chip.rect.width / 2;
  const cy = chip.rect.y + chip.rect.height / 2;
  let best = Infinity;
  let horizontal = true;
  for (let i = 1; i < points.length; i += 1) {
    const [p, q] = [points[i - 1]!, points[i]!];
    const x = Math.max(Math.min(p.x, q.x), Math.min(cx, Math.max(p.x, q.x)));
    const y = Math.max(Math.min(p.y, q.y), Math.min(cy, Math.max(p.y, q.y)));
    const distance = Math.hypot(cx - x, cy - y);
    if (distance < best) {
      best = distance;
      horizontal = Math.abs(q.x - p.x) >= Math.abs(q.y - p.y);
    }
  }
  return horizontal ? chip.rect.width : chip.rect.height;
}

/** True when the frame line of `frame` runs through the inside of `rect`. */
function frameCrosses(frame: Rect, rect: Rect): boolean {
  const inside = (value: number, lo: number, hi: number) => value > lo + 1 && value < hi - 1;
  const spansX = rect.x < frame.x + frame.width && rect.x + rect.width > frame.x;
  const spansY = rect.y < frame.y + frame.height && rect.y + rect.height > frame.y;
  return (spansY && (inside(frame.x, rect.x, rect.x + rect.width) || inside(frame.x + frame.width, rect.x, rect.x + rect.width)))
    || (spansX && (inside(frame.y, rect.y, rect.y + rect.height) || inside(frame.y + frame.height, rect.y, rect.y + rect.height)));
}

interface Measured {
  style: CanvasStyle;
  wires: Wire[];
  chips: Map<string, Chip>;
}

/** One measurement per board version and style, shared by the four rules. */
const measured = new WeakMap<InteractiveCanvasDocument, Measured>();

function measure(document: InteractiveCanvasDocument, context?: LintContext): Measured {
  const style = context?.canvasStyle ?? DEFAULT_CANVAS_STYLE;
  const cached = measured.get(document);
  if (cached?.style === style) return cached;
  const meaningOf = laneMeaningsOf(document);
  const wires: Wire[] = document.connections
    .map((edge) => ({ edge, points: simplified(routedPolyline(edge, document, style)), meaning: meaningOf(edge) }))
    .filter((wire) => wire.points.length >= 2);
  const chips = new Map<string, Chip>();
  for (const wire of wires) {
    const chip = chipFor(wire.edge, document, style);
    if (chip) chips.set(wire.edge.id, chip);
  }
  const result = { style, wires, chips };
  measured.set(document, result);
  return result;
}

const ONLY_AT_CHECK = "Fires only at the check, never blocking:";

export const sharedWire: LayoutRule = {
  id: "shared-wire",
  title: "Wires on one line",
  tier: "warning",
  guidance: `${ONLY_AT_CHECK} two wires run on one line, so a reader cannot follow either.
Fix: route one of them 16px aside, or give both one start and one stroke (a trunk) or one end and one dash (a junction).`,
  check(document, context) {
    const { wires } = measure(document, context);
    const findings: ReturnType<LayoutRule["check"]> = [];
    for (let i = 0; i < wires.length; i += 1) {
      for (let j = i + 1; j < wires.length; j += 1) {
        const [a, b] = [wires[i]!, wires[j]!];
        const shared = sharedRun(a, b);
        if (shared.length <= SHARED_MIN_RUN_PX) continue;
        findings.push({
          rule: "shared-wire",
          severity: "warning",
          at: [a.edge.id, b.edge.id],
          where: { x: shared.at.x - 20, y: shared.at.y - 20, width: 40, height: 40 },
          message: `${a.edge.id} and ${b.edge.id} share ${round(shared.length)}px at ${round(shared.at.x)},${round(shared.at.y)}`,
          suggestion: `route ${b.edge.id} 16px aside`,
        });
      }
    }
    return findings;
  },
};

export const chipOnBorder: LayoutRule = {
  id: "chip-on-border",
  title: "Label chip on a section border",
  tier: "warning",
  guidance: `${ONLY_AT_CHECK} a wire's label chip sits across a section frame.
Fix: move_label the wire so its chip sits clear of the frame.`,
  check(document, context) {
    const { wires, chips } = measure(document, context);
    const frames = document.objects.filter((object) => kindOf(object) === "section" && !isPageSection(object));
    return wires.flatMap((wire) => {
      const chip = chips.get(wire.edge.id);
      const crossed = chip ? frames.filter((frame) => frameCrosses(frame.geometry, chip.rect)).map((frame) => frame.id) : [];
      if (!chip || crossed.length === 0) return [];
      return [{
        rule: "chip-on-border",
        severity: "warning" as const,
        at: [wire.edge.id, ...crossed],
        where: chip.rect,
        message: `${wire.edge.id}'s chip is on ${crossed.join(", ")}'s border`,
        suggestion: "move_label it off",
      }];
    });
  },
};

export const shortWire: LayoutRule = {
  id: "short-wire",
  title: "Labelled wire too short",
  tier: "warning",
  guidance: `${ONLY_AT_CHECK} a labelled wire is shorter than its chip plus ${SHORT_WIRE_SLACK_PX}px, so the chip hides the line.
Fix: move its two ends apart to the length named, or shorten the label.`,
  check(document, context) {
    const { wires, chips } = measure(document, context);
    return wires.flatMap((wire) => {
      const chip = chips.get(wire.edge.id);
      if (!chip) return [];
      const length = polylineLength(wire.points);
      const needed = chipExtent(chip, wire.points) + SHORT_WIRE_SLACK_PX;
      if (length >= needed) return [];
      return [{
        rule: "short-wire",
        severity: "warning" as const,
        at: [wire.edge.id, wire.edge.from.objectId, wire.edge.to.objectId],
        where: chip.rect,
        message: `${wire.edge.id} is ${round(length)}px, short for its chip`,
        suggestion: `move its ends apart to ≥${Math.ceil(needed)}px`,
      }];
    });
  },
};

export const hiddenArrowhead: LayoutRule = {
  id: "hidden-arrowhead",
  title: "Hidden arrowhead",
  tier: "warning",
  guidance: `${ONLY_AT_CHECK} an arrowhead is under a label chip, crushed against a bend, or on another wire's head.
Fix: move_label the chip away, route the wire with a longer last leg, or end it at another point.`,
  check(document, context) {
    const { style, wires, chips } = measure(document, context);
    const findings: ReturnType<LayoutRule["check"]> = [];
    const heads = wires.flatMap((wire) => headsOf(wire, style.connectorStrokeWidthPx));
    for (const [index, head] of heads.entries()) {
      const id = head.wire.edge.id;
      const under = [...chips.values()].find((chip) => intersects(chip.rect, head.box));
      const stacked = heads.slice(0, index).find((other) =>
        other.wire !== head.wire
        && !mates(other.wire, other.run, head.wire, head.run)
        && Math.hypot(other.tip.x - head.tip.x, other.tip.y - head.tip.y) < STACKED_TIP_PX);
      const crushed = head.shaft < MIN_SHAFT_PX;
      if (!under && !crushed && !stacked) continue;
      findings.push({
        rule: "hidden-arrowhead",
        severity: "warning",
        at: [id, ...(under ? [under.edge.id] : stacked && !crushed ? [stacked.wire.edge.id] : [])]
          .filter((value, at, ids) => ids.indexOf(value) === at),
        where: head.box,
        message: under
          ? `${id}'s arrowhead is under ${under.edge.id === id ? "its own" : `${under.edge.id}'s`} chip`
          : crushed
            ? `${id}'s arrowhead is crushed at a bend`
            : `${id}'s arrowhead is on ${stacked!.wire.edge.id}'s`,
        suggestion: under
          ? `move_label ${under.edge.id === id ? "it" : under.edge.id} away`
          : crushed
            ? "route it with a longer last leg"
            : "end it at another point",
      });
    }
    return findings;
  },
};

export const rules: readonly LayoutRule[] = [sharedWire, chipOnBorder, shortWire, hiddenArrowhead];
