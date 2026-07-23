/**
 * overlap — a box hides another box's content (ERROR tier).
 *
 * Grown from pipeline/lint.ts overlapViolations: two sibling boxes (same
 * parentId; sections, stickies and annotation markers exempt) whose
 * intersection exceeds 25% of the smaller box, OR whose intersection covers
 * a box's text center (strictly inside the intersection). Either way one of
 * them is unreadable, and that blocks commit.
 */
import type { BoardModel, BoardNode } from "../digest/board-model";
import type { LayoutRule } from "./types";

/** Intersection larger than this fraction of the smaller box is an error. */
const OVERLAP_FRACTION = 0.25;

interface Rect { x: number; y: number; width: number; height: number }

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
  id: "overlap",
  title: "Overlap",
  tier: "error",
  guidance: [
    "Boxes do not sit on each other: an overlap that swallows a quarter of the smaller box,",
    "or lands on a box's text, hides content and blocks commit. Move one aside onto the",
    "spacing ladder. Stickies and annotation markers float above the diagram and are exempt —",
    "deliberate layering belongs to them, not to nodes.",
  ].join("\n"),
  check(board) {
    const findings: ReturnType<LayoutRule["check"]> = [];
    const boxes = board.nodes.filter((node) => node.kind === "node");
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
          rule: "overlap",
          severity: "error",
          at: [a.id, b.id],
          where: rect,
          message: `${a.id} and ${b.id} overlap by ${pct}% of the smaller box${centerNote}`,
          suggestion: `move ${b.id} clear of ${a.id} (sibling gaps come from the spacing ladder)`,
        });
      }
    }
    return findings;
  },
};
