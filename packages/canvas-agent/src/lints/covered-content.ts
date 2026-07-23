/**
 * covered-content — anything hiding text/content (v5 Tier A graph lint,
 * ERROR tier with warning-tier clearance findings).
 *
 * Merge of the v4 overlap + label-clearance rules, extended per Round 1:
 *  - box-on-box (ERROR, unchanged): two sibling boxes (same parentId;
 *    sections, stickies, annotation markers exempt) whose intersection
 *    exceeds 25% of the smaller box, or covers a box's text center;
 *  - chip-on-box (ERROR) / chip-near-box (warning): a label chip over a
 *    third box's face; contact within CHIP_CLEARANCE (16px) is a warning
 *    (nested-arch R1: chips kissing pills shipped clean under pure overlap);
 *  - chip-on-chip (ERROR) / chip-near-chip (warning): same margin logic;
 *  - chip-on-edge (ERROR) / chip-near-edge (warning) — NEW (flowchart R1
 *    blind spot): a chip lying on ANOTHER edge's routed polyline for >8px
 *    of overlap; the same >8px run inside the 16px-inflated chip rect is
 *    the margin warning.
 *
 * The chip's own edge and its endpoint boxes are not counted — a chip
 * nosing into its endpoints is a breathing matter (unreadable-labels).
 */
import {
  CHIP_CLEARANCE,
  chipFor,
  inflate,
  intersects,
  polylineLengthInRect,
  rectOf,
  routedPolyline,
  type Chip,
  type Rect,
} from "./geometry";

import type { BoardNode } from "../digest/board-model";
import type { LayoutRule } from "../rules/types";

/** Intersection larger than this fraction of the smaller box is an error. */
const OVERLAP_FRACTION = 0.25;
/** A chip lying on another edge's path for more than this run is a finding. */
const EDGE_RUN_TOLERANCE = 8;

function intersection(a: BoardNode, b: BoardNode): Rect | undefined {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  if (width <= 0 || height <= 0) return undefined;
  return { x, y, width, height };
}

/** Is the node's text center (its geometric center) strictly inside `rect`? */
function coversTextCenter(node: BoardNode, rect: Rect): boolean {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  return cx > rect.x && cx < rect.x + rect.width && cy > rect.y && cy < rect.y + rect.height;
}

export const rule: LayoutRule = {
  id: "covered-content",
  title: "Covered content",
  tier: "error",
  guidance: [
    "Nothing sits on content: a box overlap that swallows a quarter of the smaller box or",
    "lands on its text hides content and blocks commit. Edge-label chips need the same",
    "respect — a chip on a box face, on another chip, or lying along another edge's wire is",
    `unreadable (blocks commit), and even ${CHIP_CLEARANCE}px of kissing contact reads as merged. Route`,
    "around the crowd, move the label with a waypoint, or give the region air. Stickies and",
    "annotation markers float above the diagram and are exempt.",
  ].join("\n"),
  check(board) {
    const findings: ReturnType<LayoutRule["check"]> = [];
    const boxes = board.nodes.filter((node) => node.kind === "node");

    // 1 — box-on-box (unchanged from v4 overlap).
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        if ((a.parentId ?? null) !== (b.parentId ?? null)) continue;
        const rect = intersection(a, b);
        if (!rect) continue;
        const smallerArea = Math.min(a.width * a.height, b.width * b.height);
        if (smallerArea <= 0) continue;
        const fraction = (rect.width * rect.height) / smallerArea;
        const covered = [a, b].filter((node) => coversTextCenter(node, rect));
        if (fraction <= OVERLAP_FRACTION && covered.length === 0) continue;
        const pct = Math.round(fraction * 100);
        const centerNote = covered.length > 0
          ? `; covers the text center of ${covered.map((node) => node.id).join(" and ")}`
          : "";
        findings.push({
          rule: "covered-content",
          severity: "error",
          at: [a.id, b.id],
          where: rect,
          message: `${a.id} and ${b.id} overlap by ${pct}% of the smaller box${centerNote}`,
          suggestion: `move ${b.id} clear of ${a.id}`,
        });
      }
    }

    const chips = board.edges
      .map((edge) => chipFor(edge, board))
      .filter((chip): chip is Chip => chip !== undefined);

    // 2 — chip vs box (own endpoints exempt): overlap E, 16px contact W.
    for (const chip of chips) {
      for (const node of boxes) {
        if (node.id === chip.edge.fromId || node.id === chip.edge.toId) continue;
        const boxRect = rectOf(node);
        if (intersects(chip.rect, boxRect)) {
          findings.push({
            rule: "covered-content",
            severity: "error",
            at: [chip.edge.id, node.id],
            where: chip.rect,
            message: `label "${chip.label}" chip on ${chip.edge.id} covers ${node.id}`,
            suggestion: `route ${chip.edge.id} around ${node.id} or move the label with a waypoint`,
          });
        } else if (intersects(inflate(chip.rect, CHIP_CLEARANCE), boxRect)) {
          findings.push({
            rule: "covered-content",
            severity: "warning",
            at: [chip.edge.id, node.id],
            where: chip.rect,
            message: `label "${chip.label}" chip on ${chip.edge.id} sits within ${CHIP_CLEARANCE}px of ${node.id}`,
            suggestion: `give the chip clear air — nudge ${node.id} or reroute ${chip.edge.id}`,
          });
        }
      }
    }

    // 3 — chip vs chip: overlap E, 16px contact W.
    for (let i = 0; i < chips.length; i += 1) {
      for (let j = i + 1; j < chips.length; j += 1) {
        const a = chips[i]!;
        const b = chips[j]!;
        if (intersects(a.rect, b.rect)) {
          findings.push({
            rule: "covered-content",
            severity: "error",
            at: [a.edge.id, b.edge.id],
            where: a.rect,
            message: `label "${a.label}" chip on ${a.edge.id} overlaps label "${b.label}" chip on ${b.edge.id}`,
            suggestion: "separate the two edges (spacing or waypoints) so both labels read",
          });
        } else if (intersects(inflate(a.rect, CHIP_CLEARANCE), b.rect)) {
          findings.push({
            rule: "covered-content",
            severity: "warning",
            at: [a.edge.id, b.edge.id],
            where: a.rect,
            message: `label "${a.label}" chip on ${a.edge.id} sits within ${CHIP_CLEARANCE}px of label "${b.label}" chip on ${b.edge.id}`,
            suggestion: "separate the two edges so the chips read as two labels",
          });
        }
      }
    }

    // 4 — chip vs another edge's routed polyline (flowchart R1 blind spot):
    // a run of more than EDGE_RUN_TOLERANCE px through the chip is an error;
    // the same run through the 16px-inflated chip is the margin warning.
    for (const chip of chips) {
      for (const edge of board.edges) {
        if (edge.id === chip.edge.id) continue;
        const polyline = routedPolyline(edge, board);
        if (polyline.length < 2) continue;
        const rawRun = polylineLengthInRect(polyline, chip.rect);
        if (rawRun > EDGE_RUN_TOLERANCE) {
          findings.push({
            rule: "covered-content",
            severity: "error",
            at: [chip.edge.id, edge.id],
            where: chip.rect,
            message: `label "${chip.label}" chip on ${chip.edge.id} lies on ${edge.id}'s path for ${Math.round(rawRun)}px`,
            suggestion: `move the label with a waypoint or reroute ${edge.id} so the chip owns its wire`,
          });
          continue;
        }
        const marginRun = polylineLengthInRect(polyline, inflate(chip.rect, CHIP_CLEARANCE));
        if (marginRun > EDGE_RUN_TOLERANCE) {
          findings.push({
            rule: "covered-content",
            severity: "warning",
            at: [chip.edge.id, edge.id],
            where: chip.rect,
            message: `label "${chip.label}" chip on ${chip.edge.id} sits within ${CHIP_CLEARANCE}px of ${edge.id}'s path`,
            suggestion: `offset ${edge.id} or move the label so it cannot read as ${edge.id}'s label`,
          });
        }
      }
    }

    return findings;
  },
};
