/**
 * Style topic: connector and label craft.
 * Mined from src/rules/edge-clarity.ts + src/rules/label-clearance.ts
 * guidance and Round-1 findings (v4r1-nested-arch: 9 unrequested relay pills
 * grown under label-clearance pressure; v4r1-swimlane: margin-stranded
 * chips; v4r1-state-machine: unanchored badge drift, anchor fields unused).
 */
import type { StyleTopic } from "./types";

export const style: StyleTopic = {
  id: "connectors-and-labels",
  title: "Connectors and labels",
  prose: [
    "Label edges DIRECTLY: the label rides the connection itself. Never introduce relay or",
    "port nodes (pills, junctions, way-stations) just to carry a label or dodge a collision —",
    "unrequested scaffolding is worse than the crowding it fixes; make room with geometry",
    "instead. Every chip owns clear air: keep ~16–24px around each label chip against other",
    "chips, nodes, and foreign edges — a chip touching anything reads as covered. Keep the",
    "chip near its own run so the binding is obvious; a chip stranded in a margin naming a",
    "2000px run forces the reader to trace the dash. Two opposite edges between the same pair",
    "read as one ambiguous line: prefer a single edge with a both-ends arrow over an",
    "anti-parallel pair. Use the from/to `anchor` fields to control which side an edge leaves",
    "and enters — that is how you keep entries clean instead of letting the router pick a",
    "side. Never let two runs share a line (co-linear dashed-over-solid) or trace a section",
    "border; separate the routes. A badge or sticky that annotates a node sits touching it or",
    "stub-connected to it — a free-floating pill drifts until it reads as some other wire's",
    "label. Defaults, not laws.",
  ].join("\n"),
};
