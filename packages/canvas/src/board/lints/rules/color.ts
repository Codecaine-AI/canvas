/**
 * The board's color rules, run only at canvas_check and finalize
 * (FINISHING_RULES), never on each edit (warning tier, never blocks):
 * - same-color: a section painted the color of a node or sticky it holds
 *   directly, gray included (section-colors.ts heldNodeClashes). Ford: "Don't
 *   use green inside of a green area." One finding per section.
 * - gray-share: gray is more than half of the board's sections and nodes
 *   (the page and stickies aside). Ford, on four boards: "less grey".
 *
 * Gray directly in gray is a same-hue nest, which integrity reports on every
 * edit, so it is not repeated here.
 */
import { kindOf } from "../../helpers";
import { heldNodeClashes, isPageSection, pickSectionColor, sectionHue } from "../../section-colors";
import { rectOf } from "../geometry";

import type { LayoutRule } from "../types";

/** Gray may be at most this share of a board's sections and nodes. */
export const MAX_GRAY_SHARE = 0.5;

/** How many ids one finding names before it says "+N". */
const MAX_NAMED = 4;

function named(ids: readonly string[]): string {
  const shown = ids.slice(0, MAX_NAMED).join(", ");
  return ids.length > MAX_NAMED ? `${shown} +${ids.length - MAX_NAMED}` : shown;
}

export const sameColor: LayoutRule = {
  id: "same-color",
  title: "Same color as its section",
  tier: "warning",
  guidance: `Fires only at the check, never blocking: a section in the color of a node or sticky it holds.
Fix: change_color the section to the color the finding names.`,
  check(document, context) {
    const byId = new Map(document.objects.map((object) => [object.id, object]));
    return heldNodeClashes(document, context?.canvasStyle).map((clash) => ({
      rule: "same-color",
      severity: "warning",
      at: [clash.section, ...clash.held],
      where: rectOf(byId.get(clash.section)!),
      message: `${clash.section} is ${clash.color}, as is ${named(clash.held)} in it`,
      suggestion: `change_color ${clash.section} ${clash.suggestion}`,
    }));
  },
};

export const grayShare: LayoutRule = {
  id: "gray-share",
  title: "Too much gray",
  tier: "warning",
  guidance: `Fires only at the check, never blocking: gray is over half of the board's sections and nodes.
Fix: change_color the gray sections named to the colors named.`,
  check(document, context) {
    const style = context?.canvasStyle;
    const sections = document.objects.filter((object) => kindOf(object) === "section" && !isPageSection(object));
    const nodes = document.objects.filter((object) => kindOf(object) === "node");
    const graySections = sections.filter((section) => sectionHue(section, style) === "gray");
    const gray = graySections.length + nodes.filter((node) => node.color === "gray").length;
    const total = sections.length + nodes.length;
    if (total === 0 || gray / total <= MAX_GRAY_SHARE) return [];
    const fixes = graySections
      .map((section) => ({ id: section.id, color: pickSectionColor(document, section.id, style) }))
      .filter((fix) => fix.color !== "gray")
      .map((fix) => `${fix.id} ${fix.color}`);
    return [{
      rule: "gray-share",
      severity: "warning",
      at: graySections.map((section) => section.id),
      message: `gray is ${gray} of ${total} sections and nodes (${Math.round((gray / total) * 100)}%)`,
      suggestion: fixes.length > 0 ? `change_color ${named(fixes)}` : "recolor gray nodes to their role's hue",
    }];
  },
};

export const rules: readonly LayoutRule[] = [sameColor, grayShare];
