/**
 * `find_icon` — look up the icon id for a product or a role by name. The brand
 * catalog is too large for place_shape's `type` enum to list, so this is how
 * the drawer reaches a logo: find the id, then place it as the type. Read-only:
 * it never touches the board.
 */
import { Type } from "@mariozechner/pi-ai";

import { findIcons, type IconMatch } from "../icon-search";
import type { LayoutToolRenderResult } from "../runtime";
import { defineWorkflowTool } from "./workflow-tool";

/** How many matches a search returns. */
const FIND_ICON_LIMIT = 5;

function matchLine(match: IconMatch, rank: number): string {
  const draws = match.kind === "logo"
    ? `logo ${match.color}`
    : match.kind === "fallback"
      ? `no logo, draws the ${match.glyph} glyph`
      : "glyph";
  return `${rank}. ${match.id} · ${match.title} · ${draws}`;
}

/** The result text for one query. */
export function findIconText(query: string): LayoutToolRenderResult {
  const trimmed = query.trim();
  if (trimmed === "") {
    return { isError: true, text: "ERROR · find_icon — name the product or role to find, e.g. {\"query\": \"postgres\"}." };
  }
  const matches = findIcons(trimmed, FIND_ICON_LIMIT);
  if (matches.length === 0) {
    return {
      text: `FIND_ICON ${JSON.stringify(trimmed)} · no icon matches. Use a generic glyph for its role, such as "database" or "server", and name the node.`,
    };
  }
  return {
    text: [
      `FIND_ICON ${JSON.stringify(trimmed)} · ${matches.length} match${matches.length === 1 ? "" : "es"}, best first`,
      ...matches.map((match, index) => matchLine(match, index + 1)),
      `Place one as the type: place_shape {"type": "${matches[0]!.id}"}, or change_shape {"patch": {"type": "${matches[0]!.id}"}} on a node you already placed.`,
    ].join("\n"),
  };
}

export const findIcon = defineWorkflowTool({
  name: "find_icon",
  label: "Find icon",
  description:
    "Find the icon id for a product or a role, without changing the board. Search by name: a product (\"claude code\", \"postgres\", \"gcp\") returns its brand logo id, a role (\"queue\", \"database\") returns the generic glyph. "
    + `Returns the ${FIND_ICON_LIMIT} best matches, best first, each with its id, its title and how it draws: a logo in its brand color, or, for a brand with no logo, the generic glyph it draws. `
    + "place_shape and change_shape take any id it returns as the type.",
  fields: {
    query: Type.String({ description: "The product or role to find, e.g. \"claude code\", \"openai\", \"redis\", \"queue\"." }),
  },
  invoke: async (_runtime, params) => findIconText(params.query),
});
