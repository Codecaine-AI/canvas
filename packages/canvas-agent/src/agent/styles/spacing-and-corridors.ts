/**
 * Style topic: the spacing ladder and corridor generosity.
 */
import type { StyleTopic } from "./types";

const PROSE = `Gaps come from the ladder; corridors stay generous.

- Sibling gaps draw from {0, 32, 64, 96, 128}: flush (0) only for repeated cells, 64 as
  the default sibling gap, and unrelated clusters 128+ apart.
- Cramped labels wedged between boxes are the #1 readability killer. The lint only fires
  when a chip physically cannot fit — that is the floor. Corridors between labeled stages
  should be generous (the house reference uses 128+) so every label owns clear air.
- Corridors hold supporting content: a wide gap between stages is where chips, stickies,
  and cross-flows live without touching anything.
- Density variation is deliberate craft — tight inside a cluster, open air between
  clusters. Do not equalize every gap into one uniform band.

Defaults, not laws: deviate when the diagram calls for it, and say so.`;

export const style: StyleTopic = {
  id: "spacing-and-corridors",
  title: "Spacing and corridors",
  prose: PROSE,
};
