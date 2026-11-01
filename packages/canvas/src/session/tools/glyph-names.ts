/**
 * Glyph names at the tool boundary — the check and the "did you mean" for
 * every parameter that takes a glyph as a free string (a section's header
 * `icon`). The folded `type` enum (./placeable-types) gates itself at the
 * schema; a free string is gated here, so a near miss ("postgres", "Docker",
 * "data base") costs one turn and comes back with the names it was reaching
 * for instead of a bare "not allowed".
 *
 * The roster is the schema's own CANVAS_ICON_GLYPHS, so a glyph added there is
 * accepted and suggested here with no second list to keep in sync.
 */
import { CANVAS_ICON_GLYPHS, type CanvasIconGlyph } from "@codecaine-ai/canvas/schema";

/** Brand logos share one prefix: `brand-postgres` draws the PostgreSQL logo. */
export const BRAND_GLYPH_PREFIX = "brand-";

/** The word a section-icon parameter takes for "no glyph". */
export const NO_GLYPH = "none";

const GLYPHS: readonly CanvasIconGlyph[] = CANVAS_ICON_GLYPHS;
const GLYPH_SET: ReadonlySet<string> = new Set<string>(GLYPHS);

/** Whether `value` is a glyph id from the roster. */
export function isGlyphName(value: unknown): value is CanvasIconGlyph {
  return typeof value === "string" && GLYPH_SET.has(value);
}

/** Whether a glyph is a brand logo rather than a generic pictogram. */
export function isBrandGlyph(glyph: string): boolean {
  return glyph.startsWith(BRAND_GLYPH_PREFIX);
}

/** Lower-case, trimmed, with spaces and underscores read as the roster's hyphens. */
function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

/**
 * Edit distance with adjacent transpositions counted as one edit (optimal
 * string alignment), since a swapped pair is the commonest typo ("agnet").
 * The roster is small and the inputs are short, so the full table is cheap.
 */
function editDistance(a: string, b: string): number {
  const table = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(table[i - 1]![j]! + 1, table[i]![j - 1]! + 1, table[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, table[i - 2]![j - 2]! + 1);
      }
      table[i]![j] = best;
    }
  }
  return table[a.length]![b.length]!;
}

/**
 * How close a glyph is to what was typed — lower is closer, `null` is not a
 * candidate. Exact matches after normalizing win, then the brand spelling of
 * a bare product name, then containment either way, then a small edit
 * distance measured against the id with and without its brand prefix.
 */
function closeness(input: string, glyph: string): number | null {
  if (input === "") return null;
  const bare = isBrandGlyph(glyph) ? glyph.slice(BRAND_GLYPH_PREFIX.length) : glyph;
  if (input === glyph) return 0;
  if (input === bare) return 1;
  if (input.length >= 3 && (glyph.includes(input) || input.includes(bare))) return 2;
  const distance = Math.min(editDistance(input, glyph), editDistance(input, bare));
  const tolerance = Math.max(1, Math.floor(input.length / 3));
  return distance <= tolerance ? 2 + distance : null;
}

/**
 * The names in `roster` closest to `value`, best first, at most `limit` of
 * them. Written for glyphs (a bare product name finds its `brand-` logo) but
 * sound for any closed roster of hyphenated names — the toolkit uses it to
 * answer an enum miss on the folded `type` vocabulary the same way.
 */
export function closeNames<Name extends string>(
  value: string,
  roster: readonly Name[],
  limit = 4,
): Name[] {
  const input = normalize(value);
  return roster
    .map((name, index) => ({ name, index, score: closeness(input, name) }))
    .filter((entry): entry is { name: Name; index: number; score: number } => entry.score !== null)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.name);
}

/** The glyph names closest to `value`, best first, at most `limit` of them. */
export function closeGlyphNames(value: string, limit = 4): CanvasIconGlyph[] {
  return closeNames(value, GLYPHS, limit);
}

/**
 * The refusal for a glyph parameter that names no glyph: the near misses when
 * there are any, and where the full roster lives either way.
 */
export function unknownGlyphMessage(field: string, value: string): string {
  const matches = closeGlyphNames(value);
  const hint = matches.length > 0
    ? `did you mean ${matches.map((glyph) => `"${glyph}"`).join(", ")}?`
    : "no glyph is close to it.";
  return `${field} "${value}" is not a glyph name — ${hint} Glyph names are the icon types`
    + ` place_shape accepts: generic pictograms such as "database", and brand logos named`
    + ` "${BRAND_GLYPH_PREFIX}<product>" such as "${BRAND_GLYPH_PREFIX}postgres".`;
}
