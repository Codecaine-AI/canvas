/**
 * The object-preference registry — the shipped base corpus of placeable
 * names: what each object MEANS, the scenarios it is used in, and its
 * preferred color (docs/specs/operational-maps §Registry).
 *
 * `name` IS the stored glyph or shape id — no aliasing, no render pointer.
 * One string names the object here, in the picker, in the agent's
 * <vocabulary> context listing, and in lint wording.
 *
 * The data lives beside this module in object-preferences.json (the studio
 * registry editor writes that file); this module is the typed read surface
 * every consumer shares. Meaning and scenarios are shared language and do
 * not vary per placement; color is the one per-placement override, warranted
 * only by legibility against a section's fill or a board's palette.
 */
import { CANVAS_COLORS } from "../../state/schema/colors";
import type { CanvasColor } from "../../state/schema/colors";

import preferences from "./object-preferences.json";

export interface ObjectPreference {
  /** The stored glyph or shape id itself — the one canonical name. */
  readonly name: string;
  /** One line: what this object represents. */
  readonly meaning: string;
  /** "use when …" — the boards' shared language, one bullet per line. */
  readonly scenarios: readonly string[];
  /** Default swatch — used almost always; per-placement override allowed. */
  readonly color: CanvasColor;
}

const KNOWN_COLORS: ReadonlySet<string> = new Set<string>(CANVAS_COLORS);

/**
 * Every entry, in roster order: shapes first, then glyphs in glyph-roster
 * order. This order is load-bearing — the agent's <vocabulary> listing and
 * the picker both walk it as-is.
 */
export const OBJECT_PREFERENCES: readonly ObjectPreference[] = (
  preferences as ReadonlyArray<{
    name: string;
    meaning: string;
    scenarios: string[];
    color: string;
  }>
).map((entry) => {
  if (!KNOWN_COLORS.has(entry.color)) {
    throw new Error(
      `object-preferences.json: "${entry.name}" names unknown color "${entry.color}" — `
        + `pick from [${CANVAS_COLORS.join(", ")}].`,
    );
  }
  return { ...entry, color: entry.color as CanvasColor };
});

const BY_NAME = new Map<string, ObjectPreference>(
  OBJECT_PREFERENCES.map((entry) => [entry.name, entry]),
);

if (BY_NAME.size !== OBJECT_PREFERENCES.length) {
  throw new Error("object-preferences.json holds duplicate names — every name is one entry.");
}

/** The registry entry for a placeable name, or undefined for a name outside it. */
export function objectPreferenceFor(name: string): ObjectPreference | undefined {
  return BY_NAME.get(name);
}

/**
 * The registry's preferred color for a placeable name — what a creation flow
 * stamps when the caller carries no pick of its own. Undefined for names the
 * registry does not know (section, sticky, and anything retired), so callers
 * can fall through to their own per-kind default.
 */
export function preferredObjectColor(name: string): CanvasColor | undefined {
  return BY_NAME.get(name)?.color;
}
