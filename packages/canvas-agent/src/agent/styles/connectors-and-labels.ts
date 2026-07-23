/**
 * Style topic: connector and label craft.
 */
import type { StyleTopic } from "./types";

const PROSE = `The label rides the connection; the wire owns its space.

- Label edges DIRECTLY. Never introduce relay or port nodes (pills, junctions,
  way-stations) just to carry a label or dodge a collision — unrequested scaffolding is
  worse than the crowding it fixes; make room with geometry instead.
- Every chip owns clear air: keep ~16–24px around each label chip against other chips,
  nodes, and foreign edges — a chip touching anything reads as covered. Keep the chip
  near its own run so the binding is obvious; a chip stranded in a margin naming a
  2000px run forces the reader to trace the dash.
- Two opposite edges between the same pair read as one ambiguous line: prefer a single
  edge with a both-ends arrow.
- Use the from/to \`anchor\` fields to control which side an edge leaves and enters —
  that is how entries stay clean instead of letting the router pick a side.
- Never let two runs share a line or trace a section border; separate the routes.
- A badge or sticky that explains a node sits touching it or stub-connected to it — a
  free-floating pill drifts until it reads as some other wire's label.

Defaults, not laws.`;

export const style: StyleTopic = {
  id: "connectors-and-labels",
  title: "Connectors and labels",
  prose: PROSE,
};
