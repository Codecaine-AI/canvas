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
 * Provenance notes: red/green/blue/violet/pink inks carry over from the
 * sampled saturated palette and connector strokes. Yellow/orange/gray inks
 * reuse sampled FigJam connector strokes (#E8A302 mustard, #EB7500 orange,
 * #757575 gray) so 2px lines read on the #F5F5F5 board. Teal's fill is
 * lightened from the old sampled #5AD8CC to #C6FAF6 so it sits in the same
 * pastel band as its siblings; teal wash #EAFDFB is derived.
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
    swatch: "#F24822",
    shape: { fill: "#FFC7C2", border: "#F24822" },
    section: { tint: "#FFF5F5", chip: { fill: "#FFC7C2", border: "#F24822" } },
    sticky: "#FFAFA3",
    connector: "#F24822",
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
    swatch: "#14AE5C",
    shape: { fill: "#DDF8E2", border: "#14AE5C" },
    section: { tint: "#EBFFEE", chip: { fill: "#DDF8E2", border: "#14AE5C" } },
    sticky: "#DDF8E2",
    connector: "#14AE5C",
  },
  teal: {
    swatch: "#369E94",
    shape: { fill: "#C6FAF6", border: "#369E94" },
    section: { tint: "#EAFDFB", chip: { fill: "#C6FAF6", border: "#369E94" } },
    sticky: "#C6FAF6",
    connector: "#369E94",
  },
  blue: {
    swatch: "#0D99FF",
    shape: { fill: "#C2E5FF", border: "#0D99FF" },
    section: { tint: "#F5FBFF", chip: { fill: "#C2E5FF", border: "#0D99FF" } },
    sticky: "#A8DAFF",
    connector: "#0D99FF",
  },
  violet: {
    swatch: "#9747FF",
    shape: { fill: "#DCCCFF", border: "#9747FF" },
    section: { tint: "#F8F5FF", chip: { fill: "#DCCCFF", border: "#9747FF" } },
    sticky: "#DCCCFF",
    connector: "#9747FF",
  },
  pink: {
    swatch: "#F849C1",
    shape: { fill: "#FFC2EC", border: "#F849C1" },
    section: { tint: "#FFF0FA", chip: { fill: "#FFC2EC", border: "#F849C1" } },
    sticky: "#FFC2EC",
    connector: "#F849C1",
  },
  white: {
    swatch: "#FFFFFF",
    shape: { fill: "#FFFFFF", border: "#757575" },
    section: { tint: "#FFFFFF", chip: { fill: "#E6E6E6", border: "#C4C4C4" } },
    sticky: "#FFFFFF",
    connector: "#757575",
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
