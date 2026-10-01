/**
 * SECTIONS — the only container. Behavioral truth lives in
 * service/session/tools/operations/op-context.ts (geometric membership
 * reconciliation and the fit_section resolver); the page frame's own rules
 * are stated in the prompt's board_model.
 */
import type { KindSpec } from "./spec";

export const SECTIONS_SPEC: KindSpec = {
  description:
    "A section is a titled frame that owns everything geometrically inside it; nothing else contains anything.",
  functionality: [
    {
      topic: "containment",
      items: [
        {
          point:
            "membership is geometric: whatever sits inside a frame's bounds is that section's child, reconciled from geometry after every operation",
          subpoints: [
            "position is the only membership signal — you never name a parent",
            "moving an object out of the frame moves it out of the section",
          ],
        },
        "sections nest: a frame wholly inside another frame is its child, and the digest's indentation shows the resulting tree",
      ],
    },
    {
      topic: "sizing",
      items: [
        {
          point:
            "nothing fits automatically — a section keeps exactly the geometry you give it, however its children come and go",
          subpoints: [
            "fit_section snugs a frame around its current children when you ask for it, and only then",
            "it fits the one section named: a nested frame and its ancestors keep their size, so fit them yourself, innermost first",
          ],
        },
        "the base section is simply the page: size it to the diagram you are drawing and grow it when the content needs room",
      ],
    },
    {
      topic: "title_and_color",
      items: [
        "the text field renders as the frame's title chip — the chip is not a separate object",
        "the chip can open with an `icon`, any glyph name, generic or `brand-*`, and close with a `detail` after the title: one short fact such as a host, runtime, or path",
        "color comes from the roster and initially defaults to gray; the finished region tint can express its semantic role",
      ],
    },
  ],
  tips: [
    "design the section skeleton before placing content — the sections are the reading structure of the board",
    "title a frame with a short name and give its one distinguishing fact as the detail, like `Bun services` with `127.0.0.1`",
    "give a frame an icon when a glyph fits what it holds: a generic glyph for its role, a `brand-*` logo for a technology the board names; when none fits, leave it off",
    "size the base section to the diagram you are about to draw, and grow it whenever the content starts to feel tight — space is the cheapest thing on a board",
    "size a frame for the content you are about to put in it, then call fit_section once it is filled if you want the frame closed snugly around it",
    "a section endpoint intentionally treats the subsystem as one unit; participant endpoints expose individual causal handoffs, fan-out, or merge rather than hiding them at the frame",
    "when a frame gets dense, spend a look on its close-up view and judge it at readable scale",
    "before removing a section, remember the cascade — move children out first if you mean to keep them",
  ],
};
