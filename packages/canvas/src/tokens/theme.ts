"use client";

import {
  SECTION_FAMILIES,
  SHAPE_STROKE_WIDTH_PX,
  STICKY_COLORS,
  type SectionFamilyStyle,
} from "./figjam-tokens";
import type {
  CanvasObjectStyle,
  CanvasPaletteToken,
  CanvasSectionTint,
  InteractiveCanvasTone,
} from "../state/schema";

export type CanvasToneStyle = {
  fill: string;
  border: string;
  text: string;
  accent: string;
};

const toneMix: Record<InteractiveCanvasTone, { fill: string; border: string; accent: string }> = {
  neutral: { fill: "var(--background)", border: "var(--border)", accent: "var(--muted-foreground)" },
  input: {
    fill: "color-mix(in oklab, var(--primary) 8%, var(--background))",
    border: "color-mix(in oklab, var(--primary) 45%, var(--border))",
    accent: "var(--primary)",
  },
  process: {
    fill: "color-mix(in oklab, var(--accent) 34%, var(--background))",
    border: "color-mix(in oklab, var(--primary) 30%, var(--border))",
    accent: "var(--primary)",
  },
  decision: {
    fill: "color-mix(in oklab, var(--secondary) 58%, var(--background))",
    border: "color-mix(in oklab, var(--primary) 36%, var(--border))",
    accent: "var(--secondary-foreground)",
  },
  memory: {
    fill: "color-mix(in oklab, var(--muted) 72%, var(--background))",
    border: "color-mix(in oklab, var(--muted-foreground) 28%, var(--border))",
    accent: "var(--muted-foreground)",
  },
  agent: {
    fill: "color-mix(in oklab, var(--primary) 14%, var(--background))",
    border: "color-mix(in oklab, var(--primary) 62%, var(--border))",
    accent: "var(--primary)",
  },
  warning: {
    fill: "color-mix(in oklab, var(--destructive) 7%, var(--background))",
    border: "color-mix(in oklab, var(--destructive) 34%, var(--border))",
    accent: "var(--destructive)",
  },
  annotation: {
    fill: "color-mix(in oklab, var(--primary) 18%, var(--background))",
    border: "color-mix(in oklab, var(--primary) 74%, var(--border))",
    accent: "var(--primary)",
  },
};

export function canvasToneStyle(tone: InteractiveCanvasTone | undefined): CanvasToneStyle {
  const resolved = toneMix[tone ?? "neutral"] ?? toneMix.neutral;
  return {
    ...resolved,
    text: "var(--foreground)",
  };
}

export const canvasSurfaceStyle = {
  "--interactive-canvas-grid": "color-mix(in oklab, var(--border) 52%, transparent)",
  "--interactive-canvas-guide": "color-mix(in oklab, var(--primary) 42%, transparent)",
  "--interactive-canvas-highlight": "color-mix(in oklab, var(--primary) 18%, transparent)",
} as const;

/**
 * Semantic color-as-meaning presets (D16, design doc §4.4). The app theme's
 * CSS vars are alias-based (`--primary` etc. resolve through the active
 * theme's token graph, not fixed hues), so these presets anchor to fixed
 * OKLCH hues and blend them with `var(--background)` / `var(--border)` —
 * same color-mix idiom as `toneMix` above — so both light and dark themes
 * stay legible: the anchor hue supplies the meaning, the background/border
 * mix supplies contrast and theme fit.
 *
 * Hue anchors (OKLCH lightness ~55-60%, moderate chroma so text stays legible
 * over the mixed fill at low percentages):
 *   process — blue    oklch(58% 0.15 255)
 *   input   — green   oklch(60% 0.14 145)
 *   hot     — orange/red oklch(58% 0.19 35)
 *   memory  — purple  oklch(55% 0.17 300)
 *   note    — yellow  oklch(75% 0.15 95)
 */
const PALETTE_TOKEN_HUE: Record<CanvasPaletteToken, string> = {
  process: "oklch(58% 0.15 255)",
  input: "oklch(60% 0.14 145)",
  hot: "oklch(58% 0.19 35)",
  memory: "oklch(55% 0.17 300)",
  note: "oklch(75% 0.15 95)",
};

export function paletteTokenStyle(token: CanvasPaletteToken): CanvasToneStyle {
  const hue = PALETTE_TOKEN_HUE[token];
  return {
    fill: `color-mix(in oklch, ${hue} 16%, var(--background))`,
    border: `color-mix(in oklch, ${hue} 55%, var(--border))`,
    accent: `color-mix(in oklch, ${hue} 82%, var(--foreground))`,
    text: "var(--foreground)",
  };
}

/**
 * Sticky notes bypass the theme-mix desaturation (W4): FigJam stickies are
 * exact saturated hexes (figjam-tokens.ts STICKY_COLORS), so palette tokens on
 * a `shape: "note"` object resolve to the literal sticky color instead of the
 * washed-out `paletteTokenStyle` mix. Tokens with no sticky analogue (input)
 * fall through to the theme mix.
 */
const STICKY_TOKEN_FILL: Partial<Record<CanvasPaletteToken, string>> = {
  note: STICKY_COLORS.yellow.bg,
  hot: STICKY_COLORS.red.bg,
  memory: STICKY_COLORS.pink.bg,
  process: STICKY_COLORS.blue.bg,
};

/**
 * Resolves the color set for an object's style with the palette precedence
 * from PD4 + W4: explicit `fill`/`stroke` always win; sticky notes resolve
 * palette tokens to exact STICKY_COLORS hexes; then `paletteToken` wins over
 * `tone`; if nothing is set, falls back to the neutral tone. Object rendering
 * (CanvasStage) should call this instead of `canvasToneStyle` directly.
 */
export function resolveObjectColors(style: CanvasObjectStyle | undefined): CanvasToneStyle {
  const base = style?.paletteToken
    ? paletteTokenStyle(style.paletteToken)
    : canvasToneStyle(style?.tone);
  const stickyFill =
    style?.shape === "note" && style.paletteToken ? STICKY_TOKEN_FILL[style.paletteToken] : undefined;
  const fill = style?.fill ?? stickyFill;
  if (fill === undefined && style?.stroke === undefined) return base;
  return {
    ...base,
    fill: fill ?? base.fill,
    border: style?.stroke ?? base.border,
  };
}

/**
 * Border width for an object's chrome (logical px). FigJam's universal shape
 * stroke is 4px whenever a stroke color is explicitly set (figjam-style-spec
 * "Shape / connector stroke width"); `strokeWidth` overrides it. Objects
 * without an explicit stroke keep the legacy 2px chrome border.
 */
export function resolveObjectStrokeWidth(style: CanvasObjectStyle | undefined): number {
  if (style?.strokeWidth !== undefined && style.strokeWidth > 0) return style.strokeWidth;
  if (style?.stroke) return SHAPE_STROKE_WIDTH_PX;
  return 2;
}

/**
 * Resolves a section's tint family (W2) to its fill/chip/border colors —
 * separate from `resolveObjectColors` since sections key off `tint`
 * (figjam-tokens.ts's SECTION_FAMILIES), not `tone`/`paletteToken`. Per spec,
 * the section's border color equals its title chip's fill color.
 */
export function resolveSectionColors(tint: CanvasSectionTint | undefined): SectionFamilyStyle {
  return SECTION_FAMILIES[tint ?? "gray"] ?? SECTION_FAMILIES.gray;
}

export const CANVAS_PALETTE_TOKENS: Array<{
  token: CanvasPaletteToken;
  label: string;
  description: string;
}> = [
  { token: "process", label: "Process", description: "Actions and processes — blue" },
  { token: "input", label: "Input", description: "User input / confirmed — green" },
  { token: "hot", label: "Hot", description: "Generation, errors, loops — orange/red" },
  { token: "memory", label: "Memory", description: "Documents, intents, memory — purple" },
  { token: "note", label: "Note", description: "Notes, decisions, cautions — yellow" },
];
