/**
 * section-child-color — a section must not hold direct children wearing the
 * section's own color (warning tier, report-only).
 *
 * A colored section renders as a wash of its hue, so a child in the same hue
 * sinks into its own container — a red section must not hold red children
 * (docs/specs/operational-maps §Decisions, color guidance). Only the CHROMATIC
 * hues fire: gray and white are the neutral dress most boards are built from
 * (a gray shape in a gray section is the default look, and both stay legible
 * against the pale neutral wash), so same-neutral pairs are not findings.
 * Wording quotes the object-preference registry: when the child has a
 * preferred color to return to, the suggestion names it.
 */
import { objectPreferenceFor } from "../../../../../canvas/src/objects/registry";

import { fromDocumentFields } from "../../../service/session/tools/placeable-types";
import { childrenOf, kindOf } from "../../helpers";
import { rectOf } from "../geometry";

import type { InteractiveCanvasObject } from "@codecaine-ai/canvas/schema";
import type { LayoutRule } from "../types";

/** The neutral hues — the board's default dress, never a wash collision. */
const NEUTRAL_COLORS: ReadonlySet<string> = new Set(["gray", "white"]);

/** The color an object renders as when none is stored (digest parity). */
function effectiveColor(object: InteractiveCanvasObject): string {
  return object.color ?? (kindOf(object) === "sticky" ? "yellow" : "gray");
}

const GUIDANCE = `A section's direct children must not wear the section's own color:
- this warning fires when a chromatic section (any hue but gray/white) directly holds a
  child stored in that same hue — a red section must not hold red children;
- the section renders as a wash of its hue, so a same-hue child sinks into its own
  container instead of reading against it;
- change_color the child — its registry-preferred color is the default answer — or, when
  the frame is what is wrong, recolor the section.`;

export const rule: LayoutRule = {
  id: "section-child-color",
  title: "Section-colored children",
  tier: "warning",
  guidance: GUIDANCE,
  check(document) {
    const findings: ReturnType<LayoutRule["check"]> = [];

    for (const section of document.objects.filter((object) => kindOf(object) === "section")) {
      const sectionColor = effectiveColor(section);
      if (NEUTRAL_COLORS.has(sectionColor)) continue;

      for (const child of childrenOf(document, section.id)) {
        if (effectiveColor(child) !== sectionColor) continue;

        const name = fromDocumentFields(child);
        const preferred = objectPreferenceFor(String(name))?.color;
        findings.push({
          rule: "section-child-color",
          severity: "warning",
          at: [child.id, section.id],
          where: rectOf(child),
          message:
            `${child.id} is ${sectionColor} inside the ${sectionColor} section ${section.id} — `
            + `a ${sectionColor} section must not hold ${sectionColor} children`,
          suggestion:
            preferred !== undefined && preferred !== sectionColor
              ? `change_color ${child.id} — ${name}'s preferred color is ${preferred}`
              : `change_color ${child.id} to a hue that reads against ${sectionColor}, or recolor ${section.id}`,
        });
      }
    }

    return findings;
  },
};
