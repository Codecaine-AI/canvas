/**
 * Style topic: section trim, hugging, and interior voids.
 * Mined from src/rules/section-trim.ts + src/rules/density.ts guidance,
 * rulebook R3/R7, and Round-1 findings (v4r1-nested-arch: unflagged 400px+
 * interior voids; the <40% occupancy craft note comes from its change 3).
 */
import type { StyleTopic } from "./types";

export const style: StyleTopic = {
  id: "section-framing",
  title: "Section framing",
  prose: [
    "A section frames itself: reserve a ~64px header band for the label chip, pad content",
    "~48px on the sides and bottom, and shrink the section to hug what is inside (corpus top",
    "insets run 64–128; cramped regions may degrade proportionally). A header band under 48px",
    "or side padding under 24px reads as cramped; more than ~160px of slack on a side reads as",
    "an unfinished frame — fitSectionToChildren is the usual answer. Watch the interior too:",
    "a section whose content occupies less than ~40% of its area reads as unfinished even when",
    "every edge hugs — rebalance the children to inhabit the space, or shrink the section.",
    "Empty towers and 400px dead bands between two children are the classic form of this.",
    "A node stranded far (512px+) from everything else reads as forgotten — pull it into a",
    "cluster or give it a section of its own. Sparse is fine while building; imbalance at",
    "commit time is what to fix. Defaults, not laws.",
  ].join("\n"),
};
