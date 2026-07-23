/**
 * R2 · spacing — the spacing ladder (warning tier).
 *
 * Migrated from pipeline/lint.ts spacingViolations (KERNEL-PROPOSAL §2.2):
 * axis-adjacent non-section pairs that overlap on the cross axis with a
 * positive gap inside the ladder window must sit within tolerance of a
 * ladder rung. Same ladder constants as the expansion corpus
 * (pipeline/expand.ts SPACING_LADDER), not re-invented.
 *
 * Quickfix (opt-in): shift the later box along the gap axis so the pair
 * lands on the nearest rung.
 */
import { SPACING_LADDER } from "../pipeline/expand";

import type { BoardModel, BoardNode } from "../digest/board-model";
import type { AgentPatchOperation } from "../protocol";
import type { Diagnostic, LayoutRule } from "./types";

/** Tolerance around a ladder rung, in px (matches the fitter's gap classes). */
const LADDER_TOLERANCE = 8;
/** Rungs in ascending order for reporting/snapping. */
const LADDER = [...SPACING_LADDER].sort((a, b) => a - b);
/**
 * Adjacent-gap window: gaps wider than the top rung plus tolerance are
 * "apart", not sibling spacing, and carry no ladder obligation.
 */
const LADDER_MAX_GAP = LADDER[LADDER.length - 1]! + LADDER_TOLERANCE;

interface GapFinding {
  a: BoardNode;
  b: BoardNode;
  axis: "x" | "y";
  gap: number;
}

function nearestRung(gap: number): number {
  let best = LADDER[0]!;
  for (const rung of LADDER) {
    if (Math.abs(gap - rung) < Math.abs(gap - best)) best = rung;
  }
  return best;
}

function rungNeighbors(gap: number): string {
  const lower = [...LADDER].reverse().find((rung) => rung <= gap);
  const upper = LADDER.find((rung) => rung >= gap);
  if (lower !== undefined && upper !== undefined && lower !== upper) {
    return `nearest rungs ${lower} / ${upper}`;
  }
  return `nearest rung ${nearestRung(gap)}`;
}

/** The measured gap between a and b along `axis`, when axis-adjacent. */
function gapBetween(a: BoardNode, b: BoardNode, axis: "x" | "y"): { gap: number; crossOverlap: number } {
  if (axis === "x") {
    return {
      gap: Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width),
      crossOverlap: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
    };
  }
  return {
    gap: Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height),
    crossOverlap: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  };
}

/** Estimated label-chip width (matches label-clearance's estimate). */
function chipWidth(label: string): number {
  return label.length * 8 + 24;
}

/** The widest label on any edge between the two nodes, if any. */
function labelBetween(board: BoardModel, aId: string, bId: string): string | null {
  let widest: string | null = null;
  for (const edge of board.edges) {
    const connects = (edge.fromId === aId && edge.toId === bId)
      || (edge.fromId === bId && edge.toId === aId);
    if (!connects || !edge.label) continue;
    if (widest === null || chipWidth(edge.label) > chipWidth(widest)) widest = edge.label;
  }
  return widest;
}

/** Gap a labeled pair needs so the chip can breathe. */
function labeledGapMinimum(label: string): number {
  return Math.max(96, chipWidth(label) + 32);
}

interface LabeledGapFinding extends GapFinding {
  label: string;
  needed: number;
}

/** Window for the labeled-edge breathing-room check (beyond it, the chip has room). */
const LABELED_GAP_WINDOW = 224;

function gapFindings(board: BoardModel): { ladder: GapFinding[]; labeled: LabeledGapFinding[] } {
  const boxes = board.nodes.filter((node) => node.kind !== "section");
  const ladder: GapFinding[] = [];
  const labeled: LabeledGapFinding[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      for (const axis of ["x", "y"] as const) {
        const { gap, crossOverlap } = gapBetween(a, b, axis);
        if (crossOverlap <= 0 || gap <= 0) continue;
        const label = gap <= LABELED_GAP_WINDOW ? labelBetween(board, a.id, b.id) : null;
        if (label !== null && gap < labeledGapMinimum(label)) {
          labeled.push({ a, b, axis, gap, label, needed: labeledGapMinimum(label) });
          continue; // the breathing-room finding supersedes the plain ladder finding
        }
        if (gap > LADDER_MAX_GAP) continue;
        if (Math.abs(gap - nearestRung(gap)) > LADDER_TOLERANCE) {
          ladder.push({ a, b, axis, gap });
        }
      }
    }
  }
  return { ladder, labeled };
}

/** The croppable region between the two boxes (the gap itself). */
function gapRegion(finding: GapFinding): { x: number; y: number; width: number; height: number } {
  const { a, b, axis, gap } = finding;
  if (axis === "x") {
    const left = Math.min(a.x + a.width, b.x + b.width);
    const top = Math.max(a.y, b.y);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    return { x: left, y: top, width: gap, height: Math.max(1, bottom - top) };
  }
  const top = Math.min(a.y + a.height, b.y + b.height);
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  return { x: left, y: top, width: Math.max(1, right - left), height: gap };
}

export const rule: LayoutRule = {
  id: "spacing",
  title: "The spacing ladder",
  tier: "warning",
  guidance: [
    `Sibling gaps come from the ladder {${LADDER.join(", ")}}; unrelated clusters sit ${LADDER[LADDER.length - 1]}+ apart.`,
    "Flush (0) is for repeated cells; 64 is the default sibling gap. A LABELED edge needs its",
    "chip to breathe: give the pair at least max(96, chip width + 32) of gap — cramped labels",
    "wedged between boxes are the #1 readability killer; the reference boards use generous",
    "corridors (128+) between stages so every label owns clear air. Deviate when the diagram",
    "calls for it — this is a default, not a law.",
  ].join("\n"),
  check(board) {
    const { ladder, labeled } = gapFindings(board);
    return [
      ...labeled.map((finding) => ({
        rule: "spacing",
        severity: "warning" as const,
        at: [finding.a.id, finding.b.id],
        where: gapRegion(finding),
        message: `labeled edge ${finding.a.id}↔${finding.b.id}: ${Math.round(finding.gap)}px gap is too tight for its "${finding.label}" chip`,
        suggestion: `give it ≥${finding.needed}px so the label breathes`,
      })),
      ...ladder.map((finding) => ({
        rule: "spacing",
        severity: "warning" as const,
        at: [finding.a.id, finding.b.id],
        where: gapRegion(finding),
        message: `gap ${finding.a.id}↔${finding.b.id} ${Math.round(finding.gap)}px off the ladder (axis ${finding.axis})`,
        suggestion: rungNeighbors(finding.gap),
      })),
    ];
  },
  quickfix(board, d: Diagnostic): AgentPatchOperation[] {
    const [aId, bId] = d.at;
    const a = aId !== undefined ? board.byId(aId) : undefined;
    const b = bId !== undefined ? board.byId(bId) : undefined;
    if (!a || !b) return [];
    // Recover the offending axis/gap from geometry (the diagnostic's facts).
    const label = labelBetween(board, a.id, b.id);
    const candidates = (["x", "y"] as const)
      .map((axis) => ({ axis, ...gapBetween(a, b, axis) }))
      .filter(({ gap, crossOverlap }) => {
        if (crossOverlap <= 0 || gap <= 0) return false;
        if (label !== null && gap <= LABELED_GAP_WINDOW && gap < labeledGapMinimum(label)) return true;
        return gap <= LADDER_MAX_GAP && Math.abs(gap - nearestRung(gap)) > LADDER_TOLERANCE;
      });
    const offending = candidates[0];
    if (!offending) return [];
    const { axis, gap } = offending;
    const later = (axis === "x" ? b.x >= a.x : b.y >= a.y) ? b : a;
    const target = label !== null && gap < labeledGapMinimum(label)
      ? Math.ceil(labeledGapMinimum(label) / 16) * 16
      : nearestRung(gap);
    const shift = target - gap;
    const geometry = {
      x: axis === "x" ? later.x + shift : later.x,
      y: axis === "y" ? later.y + shift : later.y,
      width: later.width,
      height: later.height,
    };
    return [{ type: "updateObject", objectId: later.id, patch: { geometry } }];
  },
};
