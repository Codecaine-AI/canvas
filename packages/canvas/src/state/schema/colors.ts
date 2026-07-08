"use client";

/**
 * Canvas color vocabulary (P0, OBJECT-DEF-OVERHAUL.md §3.1, D1/D2/D7/D12).
 *
 * Replaces the four disjoint color systems (palette tokens, legacy tones,
 * section tints, raw connector hexes — see the overhaul doc §1.4) with one
 * closed, stored vocabulary: 10 hue picks. Each pick resolves through the
 * ink/fill/wash role table in `palette.ts`: ink for strokes and swatch
 * previews, fill for objects/title chips, and wash for section backgrounds.
 *
 * This file only declares the ids — no hexes, no role tables — so it stays a
 * pure schema/vocabulary module like its `state/schema/` siblings.
 */

/** The 10 FigJam hue families (black dropped per D12; "white" is a hue here, not a neutral escape hatch). */
export type CanvasHue =
  | "gray"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "teal"
  | "blue"
  | "violet"
  | "pink"
  | "white";

/** The 10 stored color ids objects/connections may store in `color?: CanvasColor`. */
export type CanvasColor = CanvasHue;

/** Ordered hue list, left to right, matching the picker. */
export const CANVAS_HUES: readonly CanvasHue[] = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
  "white",
];

/** The 10 picker ids in hue order. Consumers should iterate this list directly. */
export const CANVAS_COLORS: readonly CanvasColor[] = CANVAS_HUES;

const CANVAS_COLOR_SET: ReadonlySet<string> = new Set(CANVAS_COLORS);

/** Type guard for the closed 10-id roster — use at schema/validator boundaries. */
export function isCanvasColor(value: unknown): value is CanvasColor {
  return typeof value === "string" && CANVAS_COLOR_SET.has(value);
}
