/**
 * color-math.ts — the small, pure color toolkit the canvas theme model runs on
 * (theme/canvas-style.ts validates color tokens with it; theme/palette.ts
 * derives section / icon / sticky paints with it).
 *
 * Only the two color syntaxes the style tokens accept are understood:
 * `#RRGGBB` and `rgba(r, g, b, a)` (r/g/b integers 0–255, a in 0–1).
 * Canonical output is uppercase `#RRGGBB` when opaque and
 * `rgba(r, g, b, a)` (", " separated) otherwise, so two spellings of the same
 * color compare equal after `normalizeColor`.
 *
 * Mixing is a plain per-channel sRGB mix (`a*t + b*(1-t)`, rounded): the
 * layer-cake section fills are defined in exactly those terms. Lightness and
 * contrast use OKLab L and WCAG 2.x relative luminance respectively.
 *
 * Import-free on purpose: served to Node with the style leaf (./style).
 */

export interface RgbaColor {
  /** 0–255, integer. */
  r: number;
  g: number;
  b: number;
  /** 0–1. */
  a: number;
}

const HEX_PATTERN = /^#([0-9a-f]{6})$/i;
const RGBA_PATTERN =
  /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d*\.?\d+)\s*\)$/i;

const BLACK: RgbaColor = { r: 0, g: 0, b: 0, a: 1 };
const WHITE: RgbaColor = { r: 255, g: 255, b: 255, a: 1 };

/** Parses `#RRGGBB` or `rgba(r, g, b, a)`; anything else (or out-of-range channels) is null. */
export function parseColor(value: unknown): RgbaColor | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const hex = HEX_PATTERN.exec(text);
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = RGBA_PATTERN.exec(text);
  if (!rgba) return null;
  const [r, g, b, a] = [rgba[1], rgba[2], rgba[3], rgba[4]].map(Number) as [number, number, number, number];
  if (r > 255 || g > 255 || b > 255 || !(a >= 0 && a <= 1)) return null;
  return { r, g, b, a };
}

/** Canonical spelling of a valid color token, or null when `value` is not one. */
export function normalizeColor(value: unknown): string | null {
  const color = parseColor(value);
  return color ? formatColor(color) : null;
}

function channelHex(value: number): string {
  return Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0").toUpperCase();
}

/** Uppercase `#RRGGBB` (alpha dropped). */
export function formatHex(color: RgbaColor): string {
  return `#${channelHex(color.r)}${channelHex(color.g)}${channelHex(color.b)}`;
}

/** Compact alpha: at most 3 decimals, no trailing zeros. */
function formatAlpha(alpha: number): string {
  return String(Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000);
}

/** `#RRGGBB` when opaque, else `rgba(r, g, b, a)`. */
export function formatColor(color: RgbaColor): string {
  const alpha = Math.round(Math.min(1, Math.max(0, color.a)) * 1000) / 1000;
  if (alpha >= 1) return formatHex(color);
  const channel = (value: number) => Math.round(Math.min(255, Math.max(0, value)));
  return `rgba(${channel(color.r)}, ${channel(color.g)}, ${channel(color.b)}, ${formatAlpha(alpha)})`;
}

/** Parse with a black fallback — the math below must never throw on a bad token mid-render. */
function toRgba(color: string | RgbaColor): RgbaColor {
  if (typeof color !== "string") return color;
  return parseColor(color) ?? BLACK;
}

function mixRgba(a: RgbaColor, b: RgbaColor, t: number): RgbaColor {
  const weight = Math.min(1, Math.max(0, t));
  const channel = (x: number, y: number) => Math.round(x * weight + y * (1 - weight));
  return { r: channel(a.r, b.r), g: channel(a.g, b.g), b: channel(a.b, b.b), a: 1 };
}

/**
 * Per-channel sRGB mix `a*t + b*(1-t)` (t = the weight of `a`), rounded to an
 * opaque `#RRGGBB`. Alpha is ignored: inputs are treated as opaque colors.
 * `mixColors(ink, "#FFFFFF", 0.07)` is a 7% ink wash on white.
 */
export function mixColors(a: string, b: string, t: number): string {
  return formatHex(mixRgba(toRgba(a), toRgba(b), t));
}

/** `color` with its alpha multiplied by `alpha` — `#RRGGBB` when the result is opaque. */
export function withAlpha(color: string, alpha: number): string {
  const parsed = toRgba(color);
  return formatColor({ ...parsed, a: parsed.a * Math.min(1, Math.max(0, alpha)) });
}

function linearChannel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** OKLab lightness L (0 = black, 1 = white) of the color's RGB (alpha ignored). */
export function oklabLightness(color: string | RgbaColor): number {
  return oklab(color).L;
}

/** OKLab coordinates (L lightness, a green–red, b blue–yellow) of the color's RGB (alpha ignored). */
export function oklab(color: string | RgbaColor): { L: number; a: number; b: number } {
  const { r, g, b } = toRgba(color);
  const lr = linearChannel(r);
  const lg = linearChannel(g);
  const lb = linearChannel(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** Perceptual distance between two colors: Euclidean in OKLab (alpha ignored). */
export function oklabDistance(a: string | RgbaColor, b: string | RgbaColor): number {
  const p = oklab(a);
  const q = oklab(b);
  return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
}

/** WCAG 2.x relative luminance (alpha ignored). */
export function relativeLuminance(color: string | RgbaColor): number {
  const { r, g, b } = toRgba(color);
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}

/** WCAG 2.x contrast ratio between two colors, 1–21 (order-independent). */
export function contrastRatio(a: string | RgbaColor, b: string | RgbaColor): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const CONTRAST_SEARCH_STEPS = 100;

/**
 * `color` (as opaque `#RRGGBB`) if it already reaches `minRatio` WCAG
 * contrast against `background`; otherwise the least push that does. The
 * push mixes toward `toward` first (e.g. the ink a muted color was derived
 * from, so the result keeps its hue), then — if even `toward` falls short —
 * on toward black or white, whichever contrasts more with the background.
 * When nothing reaches the ratio the most contrasting extreme is returned.
 */
export function ensureContrast(
  color: string,
  background: string,
  minRatio: number,
  toward?: string,
): string {
  const backgroundRgba = toRgba(background);
  const extreme =
    contrastRatio(BLACK, backgroundRgba) >= contrastRatio(WHITE, backgroundRgba) ? BLACK : WHITE;
  let from: RgbaColor = { ...toRgba(color), a: 1 };
  if (contrastRatio(from, backgroundRgba) >= minRatio) return formatHex(from);
  const targets = toward === undefined ? [extreme] : [{ ...toRgba(toward), a: 1 }, extreme];
  for (const target of targets) {
    for (let step = 1; step <= CONTRAST_SEARCH_STEPS; step += 1) {
      const candidate = mixRgba(target, from, step / CONTRAST_SEARCH_STEPS);
      if (contrastRatio(candidate, backgroundRgba) >= minRatio) return formatHex(candidate);
    }
    from = target;
  }
  return formatHex(extreme);
}
