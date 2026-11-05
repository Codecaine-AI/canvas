/**
 * Layout numbers — what a viewer reads as layout, measured on the renderer's
 * routed wires: total wire length, crossings, wires that run through a
 * section holding neither of their ends, and the longest wires.
 *
 * These are numbers, not findings: nothing here blocks, and canvas_check
 * prints them under the lints (LAYOUT block) so the drawer sees which wires
 * cost the layout, by id, without a rule nagging every edit.
 */
import type { InteractiveCanvasConnection, InteractiveCanvasDocument } from "../state/schema";
import type { CanvasStyle } from "../theme/canvas-style";
import { sectionDescendantIds } from "../state/geometry";
import { kindOf } from "./helpers";
import {
  crossingCount,
  polylineLength,
  polylineLengthInRect,
  rectOf,
  routedPolyline,
  type Point,
} from "./lints/geometry";

/** How many entries each ranked list keeps. */
const TOP_PAIRS = 5;
const TOP_TRAVERSALS = 5;
const TOP_LONGEST = 3;
/** A run shorter than this inside a section is a corner clip, not a traversal. */
const TRAVERSAL_MIN_RUN = 1;

export interface LayoutNumbers {
  /** Routed length of every wire, summed, in px. */
  wireLength: number;
  /** Points where two wires that share no endpoint cross. */
  crossings: number;
  /** Wire pairs that cross at least once. */
  crossingPairs: number;
  /** The pairs with the most crossings, most first. */
  topCrossingPairs: { a: string; b: string; crossings: number }[];
  /** Wires running through a section that holds neither end, longest run first. */
  topTraversals: { wire: string; section: string; run: number }[];
  /** The longest wires, longest first. */
  longestWires: { wire: string; length: number }[];
}

function sharesEnd(a: InteractiveCanvasConnection, b: InteractiveCanvasConnection): boolean {
  const ends = new Set([a.from.objectId, a.to.objectId]);
  return ends.has(b.from.objectId) || ends.has(b.to.objectId);
}

export function layoutNumbers(document: InteractiveCanvasDocument, canvasStyle?: CanvasStyle): LayoutNumbers {
  const routed: { edge: InteractiveCanvasConnection; points: Point[]; length: number }[] = [];
  for (const edge of document.connections) {
    const points = routedPolyline(edge, document, canvasStyle);
    if (points.length >= 2) routed.push({ edge, points, length: polylineLength(points) });
  }

  let crossings = 0;
  const pairs: LayoutNumbers["topCrossingPairs"] = [];
  for (let i = 0; i < routed.length; i += 1) {
    for (let j = i + 1; j < routed.length; j += 1) {
      const a = routed[i]!;
      const b = routed[j]!;
      if (sharesEnd(a.edge, b.edge)) continue;
      const count = crossingCount(a.points, b.points);
      if (count === 0) continue;
      crossings += count;
      pairs.push({ a: a.edge.id, b: b.edge.id, crossings: count });
    }
  }

  const traversals: LayoutNumbers["topTraversals"] = [];
  for (const section of document.objects.filter((object) => kindOf(object) === "section")) {
    const holds = sectionDescendantIds(document, section.id);
    holds.add(section.id);
    const rect = rectOf(section);
    for (const { edge, points } of routed) {
      if (holds.has(edge.from.objectId) || holds.has(edge.to.objectId)) continue;
      const run = polylineLengthInRect(points, rect);
      if (run >= TRAVERSAL_MIN_RUN) traversals.push({ wire: edge.id, section: section.id, run });
    }
  }

  return {
    wireLength: routed.reduce((total, wire) => total + wire.length, 0),
    crossings,
    crossingPairs: pairs.length,
    topCrossingPairs: pairs
      .sort((x, y) => y.crossings - x.crossings || x.a.localeCompare(y.a) || x.b.localeCompare(y.b))
      .slice(0, TOP_PAIRS),
    topTraversals: traversals
      .sort((x, y) => y.run - x.run || x.wire.localeCompare(y.wire))
      .slice(0, TOP_TRAVERSALS),
    longestWires: routed
      .map(({ edge, length }) => ({ wire: edge.id, length }))
      .sort((x, y) => y.length - x.length || x.wire.localeCompare(y.wire))
      .slice(0, TOP_LONGEST),
  };
}

/** The LAYOUT block: one header line of totals, then one line per ranked list that has entries. */
export function layoutBlock(numbers: LayoutNumbers): string {
  const px = (value: number) => `${Math.round(value)}px`;
  const lines = [
    `LAYOUT · wire length ${px(numbers.wireLength)} · ${numbers.crossings} crossing${numbers.crossings === 1 ? "" : "s"}`
    + ` (${numbers.crossingPairs} wire pair${numbers.crossingPairs === 1 ? "" : "s"})`,
  ];
  if (numbers.topCrossingPairs.length > 0) {
    lines.push(`  crossing pairs: ${numbers.topCrossingPairs.map((pair) => `${pair.a} × ${pair.b} ${pair.crossings}`).join(" · ")}`);
  }
  if (numbers.topTraversals.length > 0) {
    lines.push(`  through a section holding neither end: ${numbers.topTraversals
      .map((entry) => `${entry.wire} through ${entry.section} ${px(entry.run)}`).join(" · ")}`);
  }
  if (numbers.longestWires.length > 0) {
    lines.push(`  longest wires: ${numbers.longestWires.map((wire) => `${wire.wire} ${px(wire.length)}`).join(" · ")}`);
  }
  return lines.join("\n");
}
