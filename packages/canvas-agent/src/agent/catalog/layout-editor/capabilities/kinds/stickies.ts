/**
 * STICKIES — the note primitive, and the home of the prose-goes-on-a-sticky
 * rule.
 */
import type { KindSpec } from "./spec";

export const STICKIES_SPEC: KindSpec = {
  description:
    "A sticky is a note object; there is no standalone text type — free-standing words on the board are always a sticky.",
  functionality: [
    {
      topic: "text",
      items: [
        {
          point: "sticky text renders as simple markdown",
          subpoints: [
            "headings, bullets, code, and bold all render on the board",
          ],
        },
      ],
    },
    {
      topic: "board_behavior",
      items: [
        "a sticky is an ordinary board object: it has geometry and color, and lives inside whatever section its position puts it in",
        "connections may end on a sticky, so a note can point at what it explains",
        "color comes from the roster and defaults to yellow",
      ],
    },
  ],
  tips: [
    "any free-standing prose — summaries, legends, callouts, explanations, open questions — belongs on a sticky, never inside a rectangle; shapes are for diagram nodes",
    "place the note inside the section it talks about, so it travels with the frame",
    "use the markdown: a heading line plus bullets reads far better at board scale than a paragraph",
  ],
};
