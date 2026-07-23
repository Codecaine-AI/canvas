/**
 * unreadable-labels — a labeled edge's chip needs breathing room
 * (v5 Tier A graph lint, warning tier).
 *
 * The labeled-edge breathing check EXTRACTED from v4 rules/spacing.ts
 * (WORKING verdict twice in Round 1); the general ladder-conformance check
 * stays behind as Phase-B style prose. One calibration change (flowchart R1:
 * "the floor max(96, chip+32) is below the house bar; the reference's
 * corridors are ~2× it"): the floor is raised to max(128, chip+32) so short
 * chips ("Yes"/"No") can't legally sit in 96px slots.
 *
 * Org-tree R1's miss (the "acting" chip tangled against a NON-adjacent fan
 * edge, v4r1-org-tree.md S1) is deliberately NOT handled here: the pair was
 * not axis-adjacent, so no gap window applies — that defect is a chip-vs-
 * edge-polyline contact, owned by covered-content's clearance check.
 *
 * Quickfix (opt-in): widen the pair along the gap axis to the chip's
 * breathing minimum, rounded up to the 16px grid.
 */
import { chipWidth } from "./geometry";

import type { BoardModel, BoardNode } from "../digest/board-model";
import type { AgentPatchOperation } from "../protocol";
import type { Diagnostic, LayoutRule } from "../rules/types";

/** Absolute floor for a labeled pair's gap (raised from 96 — flowchart R1). */
const LABELED_GAP_FLOOR = 128;
/** Window for the breathing-room check (beyond it, the chip has room). */
const LABELED_GAP_WINDOW = 224;

/** Gap a labeled pair needs so the chip can breathe. */
function labeledGapMinimum(label: string): number {
  return Math.max(LABELED_GAP_FLOOR, chipWidth(label) + 32);
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

interface LabeledGapFinding {
  a: BoardNode;
  b: BoardNode;
  axis: "x" | "y";
  gap: number;
  label: string;
  needed: number;
}

function labeledGapFindings(board: BoardModel): LabeledGapFinding[] {
  const boxes = board.nodes.filter((node) => node.kind !== "section");
  const findings: LabeledGapFinding[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      for (const axis of ["x", "y"] as const) {
        const { gap, crossOverlap } = gapBetween(a, b, axis);
        if (crossOverlap <= 0 || gap <= 0 || gap > LABELED_GAP_WINDOW) continue;
        const label = labelBetween(board, a.id, b.id);
        if (label === null || gap >= labeledGapMinimum(label)) continue;
        findings.push({ a, b, axis, gap, label, needed: labeledGapMinimum(label) });
      }
    }
  }
  return findings;
}

/** The croppable region between the two boxes (the gap itself). */
function gapRegion(finding: LabeledGapFinding): { x: number; y: number; width: number; height: number } {
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
  id: "unreadable-labels",
  title: "Unreadable labels",
  tier: "warning",
  guidance: [
    "A LABELED edge needs its chip to breathe: give the pair at least",
    `max(${LABELED_GAP_FLOOR}, chip width + 32) of gap — cramped labels wedged between boxes are the #1`,
    "readability killer; the reference boards use generous corridors (128+) between stages so",
    "every label owns clear air.",
  ].join("\n"),
  check(board) {
    return labeledGapFindings(board).map((finding) => ({
      rule: "unreadable-labels",
      severity: "warning" as const,
      at: [finding.a.id, finding.b.id],
      where: gapRegion(finding),
      message: `labeled edge ${finding.a.id}↔${finding.b.id}: ${Math.round(finding.gap)}px gap is too tight for its "${finding.label}" chip`,
      suggestion: `give it ≥${finding.needed}px so the label breathes`,
    }));
  },
  quickfix(board, d: Diagnostic): AgentPatchOperation[] {
    const [aId, bId] = d.at;
    const a = aId !== undefined ? board.byId(aId) : undefined;
    const b = bId !== undefined ? board.byId(bId) : undefined;
    if (!a || !b) return [];
    // Recover the offending axis/gap from geometry (the diagnostic's facts).
    const label = labelBetween(board, a.id, b.id);
    if (label === null) return [];
    const offending = (["x", "y"] as const)
      .map((axis) => ({ axis, ...gapBetween(a, b, axis) }))
      .find(({ gap, crossOverlap }) => crossOverlap > 0 && gap > 0
        && gap <= LABELED_GAP_WINDOW && gap < labeledGapMinimum(label));
    if (!offending) return [];
    const { axis, gap } = offending;
    const later = (axis === "x" ? b.x >= a.x : b.y >= a.y) ? b : a;
    const target = Math.ceil(labeledGapMinimum(label) / 16) * 16;
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
