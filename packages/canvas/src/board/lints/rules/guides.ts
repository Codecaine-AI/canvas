/**
 * The smart guides, run at the check (board/smart-guides/near-misses.ts).
 *
 * Studio lights a pink guide when a dragged box comes within reach of a
 * peer's line. near-miss asks the same of every box where it stands, and
 * reports each one a few px off: a box off its wired partner's or a sibling's
 * line, a ragged section edge, an unequal gap in a row, a row off its
 * section's center, an arrowhead off the center of a side. Each finding names
 * the tool call that puts it on the line. Run only at canvas_check and
 * finalize (FINISHING_RULES), never on each edit (warning tier, never blocks).
 */
import { findBoardGuides, fixText, type GuideSegment } from "../../smart-guides/near-misses";

import type { LayoutRule } from "../types";

/** Room around a guide line, so a crop of the finding shows what it runs through. */
const CROP_MARGIN_PX = 40;

function regionOf(guides: readonly GuideSegment[]) {
  const xs = guides.flatMap((guide) => [guide.x1, guide.x2]);
  const ys = guides.flatMap((guide) => [guide.y1, guide.y2]);
  const [x, y] = [Math.min(...xs) - CROP_MARGIN_PX, Math.min(...ys) - CROP_MARGIN_PX];
  return { x, y, width: Math.max(...xs) + CROP_MARGIN_PX - x, height: Math.max(...ys) + CROP_MARGIN_PX - y };
}

export const rule: LayoutRule = {
  id: "near-miss",
  title: "A few px off a guide line",
  tier: "warning",
  guidance: `Fires only at the check, never blocking: a box, a section edge, a gap or an arrowhead sits a few px off the line a smart guide would snap it to.
Fix: make the call the finding names, then check again.`,
  check(document, context) {
    return findBoardGuides(document, context?.canvasStyle).nearMisses.map((miss) => ({
      rule: "near-miss",
      severity: "warning" as const,
      at: miss.at,
      where: regionOf(miss.guides),
      message: miss.message,
      suggestion: fixText(miss.fix),
    }));
  },
};
