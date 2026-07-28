/**
 * OBJECTS — shapes and icons, the diagram nodes. The type/color/glyph
 * rosters are generated into ../vocabulary.generated.ts from the validator's
 * schema tables and render between this spec's functionality and tips; the
 * boot-time contact sheet is the visual reference for what each type looks
 * like.
 */
import type { KindSpec } from "./spec";

export const OBJECTS_SPEC: KindSpec = {
  description:
    "An object is a placeable node carrying type, text, color, and geometry; objects contain nothing — only sections do.",
  functionality: [
    {
      topic: "fields",
      items: [
        "text renders inside the shape (an icon's text renders below it, as a caption)",
        "the types that point or lean take a `direction` — their roster lines name the accepted values",
        "the icon types are glyph names — picking one is the whole choice, there is no separate glyph field",
      ],
    },
    {
      topic: "contact_sheet",
      items: [
        {
          point:
            "boot attaches a vocabulary contact sheet — every object type, icon glyph, and color rendered and labeled, plus the connection arrows and styles",
          subpoints: [
            "it is the visual reference for everything the board can draw: check it when choosing, not just the names below",
          ],
        },
      ],
    },
  ],
  tips: [
    "pick the type whose look and name fit the idea — rectangle is the neutral fallback, not the house style",
    "size objects to their content and role — nodes with the same role read best at the same size",
    "keep object text to a short label; anything longer belongs on a sticky",
  ],
};
