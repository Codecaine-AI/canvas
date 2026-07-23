/**
 * Style topic: the spacing ladder and corridor generosity.
 * Mined from src/rules/spacing.ts guidance + rulebook R2 + Round-1 findings
 * (v4r1-flowchart: the labeled-edge floor trails the house bar; the reference
 * corridors run ~2x the minimum).
 */
import type { StyleTopic } from "./types";

export const style: StyleTopic = {
  id: "spacing-and-corridors",
  title: "Spacing and corridors",
  prose: [
    "Sibling gaps come from the ladder {0, 32, 64, 96, 128}; unrelated clusters sit 128+ apart.",
    "Flush (0) is for repeated cells; 64 is the default sibling gap. Cramped labels wedged",
    "between boxes are the #1 readability killer: a LABELED edge needs its chip to breathe —",
    "give the pair at least max(96, chip width + 32) of gap, and treat that as a floor, not a",
    "target. The reference boards use generous corridors (128+) between stages so every label",
    "owns clear air; when you are chasing reference quality, out-do the floor rather than",
    "resting on it. Corridors are also annotation lanes: a wide gap between stages is where",
    "chips, stickies, and cross-flows live without touching anything. Density variation is",
    "deliberate craft — tight inside a cluster, open air between clusters — so do not equalize",
    "every gap into one uniform band. Defaults, not laws: deviate when the diagram calls for",
    "it, and say so.",
  ].join("\n"),
};
