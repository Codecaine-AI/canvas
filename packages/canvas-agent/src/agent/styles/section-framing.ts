/**
 * Style topic: automatic section framing and interior balance.
 */
import type { StyleTopic } from "./types";

const PROSE = `Sections follow their children; you arrange the children.

- A section whose direct children changed auto-fits after each apply_ops batch, innermost
  first, with title clearance above and padding around. Never resize a section to chase
  its contents — an explicit resize is preserved only for that batch, so use one only
  when the section size itself is the intent. The locked page frame never auto-fits.
- Judge interior balance through child arrangement, not frame manipulation: empty towers
  and wide dead bands mean the children need regrouping even when the frame hugs
  correctly. A node stranded far from everything reads as forgotten — pull it into a
  cluster or give it a section of its own.
- The same taste governs the page: the diagram should inhabit the frame, and a large dead
  band on one side reads as unfinished. Rebalance, center, or shrink the frame to what
  the diagram needs.
- Sparse is fine while building. Judge balance on the final render before committing,
  not mid-build when half-empty frames are normal.

Defaults, not laws.`;

export const style: StyleTopic = {
  id: "section-framing",
  title: "Section framing",
  prose: PROSE,
};
