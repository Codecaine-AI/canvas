/**
 * containment — child outside its section; object off the locked frame
 * (v5 Tier A graph lint, ERROR tier).
 *
 * Moved unchanged from rules/containment.ts (v4). Originally migrated from
 * session-store's wreckedDocumentError: the section-containment check (a
 * section must contain every parentId child) and the locked-frame overflow
 * check (nothing sits more than 16px past the locked background page frame).
 * Reported per offending child/object so each diagnostic is individually
 * croppable and addressable.
 */
import type { BoardModel, BoardNode } from "../digest/board-model";
import type { LayoutRule } from "../rules/types";

/** Allowed bleed past the locked page frame, in px (as the old gate). */
const FRAME_TOLERANCE = 16;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function overflowPast(inner: BoardNode, outer: BoardNode): number {
  return Math.max(
    outer.x - inner.x,
    outer.y - inner.y,
    inner.x + inner.width - (outer.x + outer.width),
    inner.y + inner.height - (outer.y + outer.height),
  );
}

function regionOf(node: BoardNode): { x: number; y: number; width: number; height: number } {
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

export const rule: LayoutRule = {
  id: "containment",
  title: "Containment",
  tier: "error",
  guidance: [
    "A section contains its children — when content wants out, grow the section",
    "(fitSectionToChildren) or move the child somewhere it belongs; never leave it straddling",
    "the boundary. The locked page frame is the page: keep everything within it",
    `(${FRAME_TOLERANCE}px of bleed is tolerated, more is an error that blocks commit).`,
  ].join("\n"),
  check(board: BoardModel) {
    const findings: ReturnType<LayoutRule["check"]> = [];

    for (const section of board.nodes.filter((node) => node.kind === "section")) {
      for (const child of board.childrenOf(section.id)) {
        const overflow = overflowPast(child, section);
        if (!Number.isFinite(overflow) || !(overflow > 0)) continue;
        findings.push({
          rule: "containment",
          severity: "error",
          at: [child.id, section.id],
          where: regionOf(child),
          message: `${child.id} extends ${round2(overflow)}px outside its section ${section.id}`,
          suggestion: `move ${child.id} back inside, or grow ${section.id} (fitSectionToChildren)`,
        });
      }
    }

    const lockedFrames = board.nodes.filter(
      (node) => node.kind === "section" && node.locked === "background",
    );
    const frameNode = lockedFrames.find((node) => node.parentId === null) ?? lockedFrames[0];
    if (frameNode) {
      for (const node of board.nodes) {
        if (node.id === frameNode.id) continue;
        const overflow = overflowPast(node, frameNode);
        if (!Number.isFinite(overflow) || !(overflow > FRAME_TOLERANCE)) continue;
        findings.push({
          rule: "containment",
          severity: "error",
          at: [node.id, frameNode.id],
          where: regionOf(node),
          message: `${node.id} extends ${round2(overflow)}px past the locked frame ${frameNode.id} (maximum ${FRAME_TOLERANCE}px)`,
          suggestion: `move ${node.id} inside the frame`,
        });
      }
    }

    return findings;
  },
};
