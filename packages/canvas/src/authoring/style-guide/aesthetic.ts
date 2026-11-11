/** Composition guidance. Numeric defaults are starting points for local groups. */
import type { StyleTopic } from "./types";

const PROSE = `Let the system determine the composition.

- Size each region to its role and contents. Match sizes and gaps among real peers; unrelated regions need not share a size.
- Give node labels, edge labels, and branch points readable clearance; enlarge or reposition a cluster instead of scaling its labels down.
- Leave purposeful whitespace between groups, and wider corridors where wires pass.
- After the main graph exists, move and resize regions around its routes; never keep equal bands or append rows to a full board.
- Type participants, actions, decisions, stores, and artifacts before you repeat them; clone only correctly typed peers.
- Tint regions by role or owner, reusing a color for the same meaning; avoid one gray template or a rainbow of unrelated stage colors.
- Place closely related regions near each other, and align directly connected endpoints on one axis across region boundaries, so main runs are straight.
- Place shared stores and feedback targets near their consumers, and notes beside their subject outside the flow corridors.`;

export const style: StyleTopic = {
  id: "aesthetic",
  title: "The aesthetic",
  prose: PROSE,
};
