"use client";

/**
 * palette.ts — the canonical 10-pick ink/fill/wash color table (P0,
 * OBJECT-DEF-OVERHAUL.md §3.1/§3.2, D1/D2/D7/D12).
 *
 * A theme leaf module (sibling of tokens.ts), deliberately NOT inside
 * `state/` or `objects/`: `tokens.ts` and `objects/` must both be able to
 * import it without a layering violation (theme must not import objects/,
 * and objects/ sits above theme) — see OBJECT-DEF-OVERHAUL.md §3.6. This
 * kills the sticky-hex duplication hazard flagged in tokens.ts's
 * STICKY_TOKEN_FILL comment and gives every kind (shape / sticky / section /
 * connector) one shared source for "what does color X look like here".
 *
 * Import discipline (enforced by packages/canvas/src/__tests__/boundaries):
 * this file may import ONLY `state/schema/colors.ts` (the id vocabulary). It
 * must NOT import tokens.ts or anything under objects/.
 *
 * Model:
 *   - ink: line-safe stroke color. Picker swatches use ink, and shapes,
 *     connectors, and section title-chip borders all stroke with it.
 *   - fill: object/chip body color. Shapes and title chips use shape fill;
 *     stickies may use a stickier hue-specific fill from the same family.
 *   - wash: lightest section background tint, kept lighter than objects.
 *
 * Provenance notes: yellow/orange/gray inks reuse sampled FigJam connector
 * strokes (#E8A302 mustard, #EB7500 orange, #757575 gray) so 2px lines read
 * on the #F5F5F5 board; violet ink carries the sampled saturated stroke.
 * Red/green/blue/pink inks are OKLCH picks tuned line-safe against the board
 * — racing red #D5322F, kelly #019142, cobalt #1A5CDF, flamingo #B74D85 —
 * from reference/board-design-reference/analysis/mw2-palette-proposal.html.
 * Teal fill is lightened from the sampled #5AD8CC to #C6FAF6 so it sits in
 * the same pastel band as its siblings; teal wash #EAFDFB is derived. White
 * strokes use the near-neutral stone #757980 with #DBDEE3/#C1C4CB chips.
 */

import type { CanvasColor, CanvasHue } from "../state/schema/colors";
import { CANVAS_COLORS } from "../state/schema/colors";

export type ShapeColors = {
  fill: string;
  /** Ink border; every pick now renders a visible border. */
  border: string;
};

export type SectionChipColors = {
  fill: string;
  border: string;
};

export type SectionColors = {
  tint: string;
  chip: SectionChipColors;
};

export type Swatch = {
  /** Picker preview hex. White remains #FFFFFF and uses the picker contrast ring. */
  swatch: string;
  shape: ShapeColors;
  section: SectionColors;
  /** Exact sticky fill hex. */
  sticky: string;
  /** Connector stroke hex. */
  connector: string;
};

export const CANVAS_PALETTE: Record<CanvasColor, Swatch> = {
  gray: {
    swatch: "#757575",
    shape: { fill: "#E6E6E6", border: "#757575" },
    section: { tint: "#F9F9F9", chip: { fill: "#E6E6E6", border: "#757575" } },
    sticky: "#E6E6E6",
    connector: "#757575",
  },
  red: {
    swatch: "#D5322F",
    shape: { fill: "#FFD2CC", border: "#D5322F" },
    section: { tint: "#FEF3F1", chip: { fill: "#FFD2CC", border: "#D5322F" } },
    sticky: "#FFBFB7",
    connector: "#D5322F",
  },
  orange: {
    swatch: "#EB7500",
    shape: { fill: "#FFE0C2", border: "#EB7500" },
    section: { tint: "#FFF7F0", chip: { fill: "#FFE0C2", border: "#EB7500" } },
    sticky: "#FFE0C2",
    connector: "#EB7500",
  },
  yellow: {
    swatch: "#E8A302",
    shape: { fill: "#FFECBD", border: "#E8A302" },
    section: { tint: "#FFFBF0", chip: { fill: "#FFECBD", border: "#E8A302" } },
    sticky: "#FFE299",
    connector: "#E8A302",
  },
  green: {
    swatch: "#019142",
    shape: { fill: "#C5E9CB", border: "#019142" },
    section: { tint: "#F0F8F2", chip: { fill: "#C5E9CB", border: "#019142" } },
    sticky: "#C5E9CB",
    connector: "#019142",
  },
  teal: {
    swatch: "#369E94",
    shape: { fill: "#C6FAF6", border: "#369E94" },
    section: { tint: "#EAFDFB", chip: { fill: "#C6FAF6", border: "#369E94" } },
    sticky: "#C6FAF6",
    connector: "#369E94",
  },
  blue: {
    swatch: "#1A5CDF",
    shape: { fill: "#CDDFFF", border: "#1A5CDF" },
    section: { tint: "#F1F6FE", chip: { fill: "#CDDFFF", border: "#1A5CDF" } },
    sticky: "#B9D2FF",
    connector: "#1A5CDF",
  },
  violet: {
    swatch: "#9747FF",
    shape: { fill: "#DCCCFF", border: "#9747FF" },
    section: { tint: "#F8F5FF", chip: { fill: "#DCCCFF", border: "#9747FF" } },
    sticky: "#DCCCFF",
    connector: "#9747FF",
  },
  pink: {
    swatch: "#B74D85",
    shape: { fill: "#F9D1E3", border: "#B74D85" },
    section: { tint: "#FDF3F7", chip: { fill: "#F9D1E3", border: "#B74D85" } },
    sticky: "#F9D1E3",
    connector: "#B74D85",
  },
  white: {
    swatch: "#FFFFFF",
    shape: { fill: "#FFFFFF", border: "#757980" },
    section: { tint: "#FFFFFF", chip: { fill: "#DBDEE3", border: "#C1C4CB" } },
    sticky: "#FFFFFF",
    connector: "#757980",
  },
};

export { CANVAS_COLORS };
export type { CanvasColor, CanvasHue };

function swatchFor(color: CanvasColor): Swatch {
  const entry = CANVAS_PALETTE[color];
  if (!entry) {
    throw new Error(`palette.ts: unknown CanvasColor "${color}"`);
  }
  return entry;
}

/** Resolves a color pick to its shape fill/ink-border pair. */
export function resolveShapeColors(color: CanvasColor): ShapeColors {
  return swatchFor(color).shape;
}

/** Resolves a color pick to its section wash + title-chip colors. */
export function resolveSectionColors(color: CanvasColor): SectionColors {
  return swatchFor(color).section;
}

/** Resolves a color pick to its exact sticky fill hex. */
export function resolveStickyFill(color: CanvasColor): string {
  return swatchFor(color).sticky;
}

/** Resolves a color pick to its connector ink stroke hex. */
export function resolveConnectorStroke(color: CanvasColor): string {
  return swatchFor(color).connector;
}

/** Resolves a color pick to its picker-preview swatch hex. */
export function resolveSwatchPreview(color: CanvasColor): string {
  return swatchFor(color).swatch;
}
