/**
 * Sticky note color vocabulary (moved from theme/tokens.ts in the theme
 * dispersal — per-kind constants co-locate with their def). Values sampled
 * from FigJam reference exports.
 *
 * NOTE: theme.ts's STICKY_TOKEN_FILL anchors deliberately coincide with the
 * yellow/red/pink/blue `bg` hexes here, as literals (theme must not import
 * objects/) — if this vocabulary changes, update both.
 */

export type StickyColorName = "yellow" | "red" | "pink" | "blue" | "lightBlue" | "blueGray";

export type StickyColorStyle = {
  bg: string;
  /** Body text = black @ 80% over fill; pre-computed exact blend. */
  text80: string;
  /** Author text = black @ 40% over fill; only defined for yellow. */
  author40?: string;
};

/** Sticky note fill + derived text colors. */
export const STICKY_COLORS: Record<StickyColorName, StickyColorStyle> = {
  yellow: { bg: "#FFE299", text80: "#332D1F", author40: "#99885C" },
  red: { bg: "#FFAFA3", text80: "#332321" },
  pink: { bg: "#FFA8DB", text80: "#33222C" },
  blue: { bg: "#80CAFF", text80: "#1A2833" },
  lightBlue: { bg: "#A8DAFF", text80: "#222C33" },
  blueGray: { bg: "#AFBCCF", text80: "#232629" },
};
