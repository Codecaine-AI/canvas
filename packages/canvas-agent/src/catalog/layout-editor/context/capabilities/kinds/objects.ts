/**
 * OBJECTS — shapes and icons, the diagram nodes. The type/color/glyph
 * rosters are generated into ../vocabulary.generated.ts from the validator's
 * schema tables and render between this spec's functionality and tips; the
 * boot-time contact sheet is the visual reference for what each type looks
 * like.
 */
import { DETAIL_MAX_CHARS, NAME_TARGET_WORDS } from "../../../../../board/text-rules";
import type { KindSpec } from "./spec";

export const OBJECTS_SPEC: KindSpec = {
  description:
    "An object is a placeable node carrying type, text, color, and geometry; objects contain nothing — only sections do.",
  functionality: [
    {
      topic: "fields",
      items: [
        "text is the object's name and renders inside the shape (an icon's name renders below it, as a caption)",
        `\`detail\` is an optional second line under the name: one short fact of at most ${DETAIL_MAX_CHARS} characters, such as a port, path, or version, drawn muted on a single line and ellipsized if it outruns the box`,
        "the types that point or lean take a `direction` — their roster lines name the accepted values",
        "the icon types are glyph names — picking one is the whole choice, there is no separate glyph field",
        "glyph names are generic outline pictograms (`database`, `cloud`) or filled `brand-*` product logos (`brand-postgres`)",
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
    `name the thing in ${NAME_TARGET_WORDS} words or fewer, put one fact in its detail, and move any explanation onto a sticky beside it`,
    "use a `brand-*` logo only for the exact product the board names; a role gets the generic glyph",
  ],
};
