"use client";

import type { CanvasPaletteToken } from "../model/schema";

/**
 * Hex color -> nearest CanvasPaletteToken, for bridging ColorPalettePopover's
 * raw FigJam hex swatches onto the schema's 5-value semantic palette
 * (CanvasPaletteToken). Converts to HSL and picks the token whose anchor hue
 * (theme.ts's PALETTE_TOKEN_HUE, restated here as plain hue angles since
 * that map is OKLCH-string-only and not exported in a form usable for
 * distance math) is angularly closest on the hue circle. Low-saturation
 * (near-gray) swatches fall back to "note" (yellow) only when hue is
 * otherwise undefined (achromatic) — picked arbitrarily among the 5 anchors
 * since a gray swap has no strong semantic match; documented as a known
 * approximation in the wave-3a report.
 *
 * Lives in objects/ (not editor/) so toolbar flyout components declared on
 * ObjectDefs can use it; editor/features/context-toolbar/use-context-toolbar
 * re-exports it for its existing importers.
 */
const PALETTE_TOKEN_HUE_ANGLES: Record<CanvasPaletteToken, number> = {
  process: 255,
  input: 145,
  hot: 35,
  memory: 300,
  note: 95,
};

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return null;
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  if ([r, g, b].some((value) => Number.isNaN(value))) return null;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export function nearestPaletteToken(hex: string): CanvasPaletteToken {
  const hsl = hexToHsl(hex);
  if (!hsl || hsl.s < 0.08) return "note";
  let best: CanvasPaletteToken = "note";
  let bestDistance = Infinity;
  for (const token of Object.keys(PALETTE_TOKEN_HUE_ANGLES) as CanvasPaletteToken[]) {
    const distance = hueDistance(hsl.h, PALETTE_TOKEN_HUE_ANGLES[token]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = token;
    }
  }
  return best;
}
