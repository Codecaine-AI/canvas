/**
 * density — dead-space imbalance and orphaned regions (warning tier).
 *
 * Two checks (v4-build-spec.md, Agent R2):
 *  - a section (or the locked frame) whose content bbox leaves more than 45%
 *    of the section's extent empty on one side — the content is shoved into
 *    a corner or edge and the rest is dead air;
 *  - an orphan node sitting more than 512px from every other node — nothing
 *    reads as its neighborhood.
 *
 * Warnings only: sparse moments mid-build are normal; the model judges.
 */
import type { BoardModel, BoardNode } from "../digest/board-model";
import type { LayoutRule } from "./types";

/** A side is "dead" when its empty margin exceeds this fraction of the extent. */
const EMPTY_SIDE_FRACTION = 0.45;
/** A node with no other node within this many px (rect gap) is an orphan. */
const ORPHAN_DISTANCE = 512;

type Side = "left" | "right" | "top" | "bottom";

interface Rect { x: number; y: number; width: number; height: number }

function contentBBox(children: readonly BoardNode[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const child of children) {
    minX = Math.min(minX, child.x);
    minY = Math.min(minY, child.y);
    maxX = Math.max(maxX, child.x + child.width);
    maxY = Math.max(maxY, child.y + child.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** The empty strip along `side` of `section`, outside the content bbox. */
function emptyStrip(section: BoardNode, bbox: Rect, side: Side): Rect {
  switch (side) {
    case "left":
      return { x: section.x, y: section.y, width: bbox.x - section.x, height: section.height };
    case "right": {
      const edge = bbox.x + bbox.width;
      return { x: edge, y: section.y, width: section.x + section.width - edge, height: section.height };
    }
    case "top":
      return { x: section.x, y: section.y, width: section.width, height: bbox.y - section.y };
    case "bottom": {
      const edge = bbox.y + bbox.height;
      return { x: section.x, y: edge, width: section.width, height: section.y + section.height - edge };
    }
  }
}

/** Rect-to-rect gap distance (0 when touching or overlapping). */
function rectGap(a: BoardNode, b: BoardNode): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
  return Math.hypot(dx, dy);
}

export const rule: LayoutRule = {
  id: "density",
  title: "Density and dead space",
  tier: "warning",
  guidance: [
    "Content should inhabit its section: after placing, hug the section to its children or",
    "spread the children so no side is mostly dead air. A node stranded far (512px+) from",
    "everything else reads as forgotten — pull it into a cluster or give it a section of its",
    "own. Sparse is fine while building; imbalance at commit time is what to fix.",
  ].join("\n"),
  check(board) {
    const findings: ReturnType<LayoutRule["check"]> = [];

    // Dead space per section. The locked page frame is exempt: it is
    // seed-fixed and often deliberately larger than one diagram — flagging it
    // trains warning-blindness (org-tree eval, old S1).
    for (const section of board.nodes.filter((node) =>
      node.kind === "section" && node.locked !== "background")) {
      const children = board.childrenOf(section.id);
      if (children.length === 0) continue;
      const bbox = contentBBox(children);
      const margins: { side: Side; fraction: number }[] = [
        { side: "left", fraction: (bbox.x - section.x) / section.width },
        { side: "right", fraction: (section.x + section.width - (bbox.x + bbox.width)) / section.width },
        { side: "top", fraction: (bbox.y - section.y) / section.height },
        { side: "bottom", fraction: (section.y + section.height - (bbox.y + bbox.height)) / section.height },
      ];
      const offending = margins.filter((margin) => margin.fraction > EMPTY_SIDE_FRACTION);
      if (offending.length === 0) continue;
      const worst = offending.reduce((a, b) => (b.fraction > a.fraction ? b : a));
      findings.push({
        rule: "density",
        severity: "warning",
        at: [section.id],
        where: emptyStrip(section, bbox, worst.side),
        message: `section ${section.id}: ${Math.round(worst.fraction * 100)}% of its ${worst.side === "left" || worst.side === "right" ? "width" : "height"} is empty on the ${worst.side}`,
        suggestion: `hug ${section.id} to its content (fitSectionToChildren) or rebalance the children`,
      });
    }

    // Orphan nodes.
    const boxes = board.nodes.filter((node) => node.kind === "node");
    if (boxes.length >= 2) {
      for (const node of boxes) {
        let nearest = Infinity;
        for (const other of boxes) {
          if (other.id === node.id) continue;
          nearest = Math.min(nearest, rectGap(node, other));
        }
        if (nearest > ORPHAN_DISTANCE) {
          findings.push({
            rule: "density",
            severity: "warning",
            at: [node.id],
            where: { x: node.x, y: node.y, width: node.width, height: node.height },
            message: `${node.id} is ${Math.round(nearest)}px from its nearest node (orphan beyond ${ORPHAN_DISTANCE}px)`,
            suggestion: `pull ${node.id} toward its cluster, or make its isolation deliberate with a section`,
          });
        }
      }
    }

    return findings;
  },
};
