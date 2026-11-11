/**
 * Icon search behind `find_icon`: a product or role name in, the best icon
 * ids out. The brand catalog holds hundreds of logos, too many to list in
 * place_shape's `type` enum, so the drawer asks for one by name instead.
 *
 * Every icon id is a candidate: each brand catalog row under its title, its id
 * and its aliases (the manifest's own and the ones Simple Icons records), and
 * each generic glyph under its label and its id. Names are compared compact:
 * lower case with spaces and punctuation dropped, so "Google Gemini",
 * "google-gemini" and "googlegemini" are one name.
 */
import { CANVAS_ICON_IDS, type CanvasIconGlyph } from "../../state/schema";
import { BRAND_ICON_CATALOG } from "../../objects/shapes/icon/icon-glyph-data-brands.generated";
import { resolveIconGlyph } from "../../objects/shapes/icon/icon-glyphs";
import { BRAND_GLYPH_PREFIX, editDistance, isBrandGlyph } from "./glyph-names";

/** One search result: what to place and how it will draw. */
export interface IconMatch {
  id: CanvasIconGlyph;
  title: string;
  /** `logo`: the brand's own mark in `color`. `fallback`: a brand with no logo, drawn as `glyph`. `glyph`: a generic pictogram. */
  kind: "logo" | "fallback" | "glyph";
  /** A logo's brand color (#RRGGBB). */
  color?: string;
  /** The generic glyph a fallback brand draws. */
  glyph?: string;
}

/** Lower case, accents and every character but letters, digits, `+` and `#` dropped. */
function compact(value: string): string {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9+#]/g, "");
}

function words(value: string): string[] {
  return value.normalize("NFKD").toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean);
}

interface Candidate {
  match: IconMatch;
  /** Every name the candidate answers to, the title first. */
  names: readonly string[];
  index: number;
}

const CANDIDATES: readonly Candidate[] = CANVAS_ICON_IDS.map((id, index) => {
  const glyph = resolveIconGlyph(id, "nucleo");
  const row = isBrandGlyph(id) ? BRAND_ICON_CATALOG[id] : undefined;
  const match: IconMatch = row
    ? row.glyph
      ? { id, title: row.title, kind: "fallback", glyph: row.glyph }
      : { id, title: row.title, kind: "logo", color: row.hex }
    : { id, title: glyph.label, kind: "glyph" };
  const bare = isBrandGlyph(id) ? id.slice(BRAND_GLYPH_PREFIX.length) : id;
  return { match, names: [match.title, bare, ...(row?.aliases ?? [])], index };
});

/**
 * How well `query` names `name`, lower is better, null for no match: the same
 * name, then a whole word of it ("gemini" in "Google Gemini"), then its start,
 * then any part of it, then a near spelling.
 */
function nameScore(query: string, queryWords: readonly string[], name: string): number | null {
  const target = compact(name);
  if (target === query) return 0;
  const nameWords = words(name);
  if (queryWords.length > 0 && queryWords.every((word) => nameWords.includes(word))) return 1;
  if (query.length >= 2 && target.startsWith(query)) return 2;
  if (query.length >= 3 && target.includes(query)) return 3;
  const distance = editDistance(query, target);
  return distance <= Math.max(1, Math.floor(query.length / 4)) ? 4 + distance : null;
}

/** The icons that best match `query`, best first, at most `limit` of them. */
export function findIcons(query: string, limit = 5): IconMatch[] {
  const target = compact(query);
  if (target === "") return [];
  const queryWords = words(query);
  return CANDIDATES
    .map((candidate) => {
      const scores = candidate.names
        .map((name) => nameScore(target, queryWords, name))
        .filter((score): score is number => score !== null);
      return { candidate, score: scores.length > 0 ? Math.min(...scores) : null };
    })
    .filter((entry): entry is { candidate: Candidate; score: number } => entry.score !== null)
    .sort((a, b) =>
      a.score - b.score
      || compact(a.candidate.match.title).length - compact(b.candidate.match.title).length
      || a.candidate.index - b.candidate.index)
    .slice(0, limit)
    .map((entry) => entry.candidate.match);
}
