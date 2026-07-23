/**
 * R1 · grid — the 16px grid (warning tier).
 *
 * Every position and extent sits on the 16px lattice (rulebook
 * 01-r1-the-16px-grid: 88.3% of the reference corpus lands exactly on-grid;
 * the misses are hand-drag noise). This check reports off-grid x/y/w/h with
 * the measured values and nearest multiples; sub-pixel noise (<1px) is
 * ignored. Stickies and annotation markers are commentary, not layout, and
 * are exempt.
 *
 * No quickfix — snapping every field is the apply path's business; the model
 * places on-grid or owns the deviation.
 */
import { LAYOUT_GRID } from "../pipeline/expand";

import type { BoardNode } from "../digest/board-model";
import type { LayoutRule } from "./types";

/** Offsets below this are sub-pixel authoring noise, never a finding. */
const NOISE_TOLERANCE = 1;

function nearestMultiple(value: number): number {
  return Math.round(value / LAYOUT_GRID) * LAYOUT_GRID;
}

/** `field=value (nearest multiple)` for each off-grid geometry field. */
function offGridFields(node: BoardNode): string[] {
  const fields: [string, number][] = [
    ["x", node.x],
    ["y", node.y],
    ["w", node.width],
    ["h", node.height],
  ];
  const out: string[] = [];
  for (const [name, value] of fields) {
    const offset = Math.abs(value - nearestMultiple(value));
    if (offset >= NOISE_TOLERANCE) {
      out.push(`${name}=${Math.round(value * 100) / 100} (nearest ${nearestMultiple(value)})`);
    }
  }
  return out;
}

export const rule: LayoutRule = {
  id: "grid",
  title: `The ${LAYOUT_GRID}px grid`,
  tier: "warning",
  guidance: [
    `Everything sits on the ${LAYOUT_GRID}px grid: positions, widths, heights, and the pitch`,
    `between things. Offsets finer than ${LAYOUT_GRID}px are authoring noise, never intent —`,
    "roughly 88% of the reference corpus lands exactly on-grid, and the misses are hand-drag",
    `noise. Place at multiples of ${LAYOUT_GRID} and size in multiples of ${LAYOUT_GRID}; deviate only when something`,
    "real (a label that needs the room, a lattice route) demands it. A default, not a law.",
  ].join("\n"),
  check(board) {
    const findings: ReturnType<LayoutRule["check"]> = [];
    for (const node of board.nodes) {
      if (node.kind === "sticky" || node.kind === "annotationish") continue;
      // The locked page frame is seed-fixed — the agent cannot resize it, so
      // an off-grid frame is noise that trains warning-blindness.
      if (node.locked === "background") continue;
      const fields = offGridFields(node);
      if (fields.length === 0) continue;
      findings.push({
        rule: "grid",
        severity: "warning",
        at: [node.id],
        where: { x: node.x, y: node.y, width: node.width, height: node.height },
        message: `${node.id} off the ${LAYOUT_GRID}px grid: ${fields.join(", ")}`,
        suggestion: `snap to multiples of ${LAYOUT_GRID}`,
      });
    }
    return findings;
  },
};
