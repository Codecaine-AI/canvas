/**
 * frame-balance — the diagram must inhabit its locked frame
 * (v5 Tier A graph lint, warning tier, NEW).
 *
 * The "rebalance had nothing to push against" gap (v4r1-state-machine.md S2:
 * a lint-clean commit with the bottom ~40% of the locked frame empty;
 * flowchart R1 shipped the same dead bottom band): at the locked frame
 * level, if any single side's empty strip exceeds 40% of the frame extent
 * along that axis, warn. Rough occupancy by design — content bounding box
 * vs frame, nothing subtler.
 *
 * Content excludes stickies and annotation markers (they float above the
 * diagram; a stray sticky must not rescue a dead half). One finding max —
 * the largest dead strip.
 */
import type { BoardNode } from "../digest/board-model";
import type { LayoutRule } from "../rules/types";

/** A single side's empty strip past this fraction of the frame extent warns. */
const DEAD_FRACTION = 0.4;

interface Strip { side: "left" | "right" | "top" | "bottom"; size: number; fraction: number }

/** Where the content actually lives, named from the dead side's opposite. */
const INHABITED: Record<Strip["side"], string> = {
  left: "right",
  right: "left",
  top: "bottom",
  bottom: "top",
};

export const rule: LayoutRule = {
  id: "frame-balance",
  title: "Frame balance",
  tier: "warning",
  guidance: [
    "The locked frame is the page, and the diagram should inhabit it: a board whose content",
    `bounding box leaves more than ${Math.round(DEAD_FRACTION * 100)}% of the frame dead on any one side reads as`,
    "unfinished. Rebalance or center the content — or shrink the frame to what the diagram",
    "actually needs.",
  ].join("\n"),
  check(board) {
    const lockedFrames = board.nodes.filter(
      (node) => node.kind === "section" && node.locked === "background",
    );
    const frame = lockedFrames.find((node) => node.parentId === null) ?? lockedFrames[0];
    if (!frame || frame.width <= 0 || frame.height <= 0) return [];

    const content = board.nodes.filter((node: BoardNode) => node.id !== frame.id
      && node.kind !== "sticky"
      && node.kind !== "annotationish");
    if (content.length === 0) return [];

    const minX = Math.max(frame.x, Math.min(...content.map((node) => node.x)));
    const minY = Math.max(frame.y, Math.min(...content.map((node) => node.y)));
    const maxX = Math.min(frame.x + frame.width, Math.max(...content.map((node) => node.x + node.width)));
    const maxY = Math.min(frame.y + frame.height, Math.max(...content.map((node) => node.y + node.height)));

    const strips: Strip[] = [
      { side: "left", size: Math.max(0, minX - frame.x), fraction: Math.max(0, minX - frame.x) / frame.width },
      { side: "right", size: Math.max(0, frame.x + frame.width - maxX), fraction: Math.max(0, frame.x + frame.width - maxX) / frame.width },
      { side: "top", size: Math.max(0, minY - frame.y), fraction: Math.max(0, minY - frame.y) / frame.height },
      { side: "bottom", size: Math.max(0, frame.y + frame.height - maxY), fraction: Math.max(0, frame.y + frame.height - maxY) / frame.height },
    ];
    const worst = strips.reduce((a, b) => (b.fraction > a.fraction ? b : a));
    if (worst.fraction <= DEAD_FRACTION) return [];

    const where = worst.side === "left"
      ? { x: frame.x, y: frame.y, width: worst.size, height: frame.height }
      : worst.side === "right"
        ? { x: maxX, y: frame.y, width: worst.size, height: frame.height }
        : worst.side === "top"
          ? { x: frame.x, y: frame.y, width: frame.width, height: worst.size }
          : { x: frame.x, y: maxY, width: frame.width, height: worst.size };

    return [{
      rule: "frame-balance",
      severity: "warning",
      at: [frame.id],
      where,
      message: `the diagram inhabits only the ${INHABITED[worst.side]} of the frame `
        + `(${Math.round(worst.fraction * 100)}% dead on the ${worst.side}); rebalance or center`,
      suggestion: "spread the content across the frame, or shrink the frame to the diagram",
    }];
  },
};
