"use client";

/**
 * canvas-style-context.tsx — React plumbing for the workspace canvas style
 * (theme/canvas-style.ts). Every live renderer (stage objects, sections, title
 * chips, connectors, editor overlays) reads the resolved tokens through
 * `useCanvasStyle()`; with no provider mounted it returns
 * DEFAULT_CANVAS_STYLE (the schematic-light preset), so standalone renders
 * draw in the default theme.
 *
 * Providers nest: a provider's (possibly partial) `value` is merged over the
 * nearest parent provider's style, then normalized (validated, ranges
 * clamped). A `value` naming a different theme than the parent starts from
 * THAT theme's preset instead — the parent's tokens belong to another look. A
 * provider without a `value` simply re-provides its parent's style, so
 * components can always mount one and stay transparent when their caller
 * omits the prop.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  CANVAS_STYLE_CONTROLS,
  DEFAULT_CANVAS_STYLE,
  FIGJAM_CANVAS_STYLE,
  isCanvasThemeId,
  normalizeCanvasStyle,
  type CanvasStyle,
  type CanvasStyleColorKey,
  type CanvasStyleInput,
  type CanvasStyleKey,
  type CanvasStyleNumberKey,
} from "./canvas-style";

const CanvasStyleContext = createContext<CanvasStyle>(DEFAULT_CANVAS_STYLE);

/** The canvas style in effect for this subtree (DEFAULT_CANVAS_STYLE without a provider). */
export function useCanvasStyle(): CanvasStyle {
  return useContext(CanvasStyleContext);
}

/** `value` resolved against the inherited style (see the module doc for the theme rule). */
function resolveAgainstParent(parent: CanvasStyle, value: CanvasStyleInput): CanvasStyle {
  // An explicitly-undefined key inherits, like an absent one.
  const given = Object.fromEntries(
    Object.entries(value).filter(([, token]) => token !== undefined),
  ) as CanvasStyleInput;
  const theme = isCanvasThemeId(given.theme) ? given.theme : parent.theme;
  if (theme !== parent.theme) return normalizeCanvasStyle({ ...given, theme });
  return normalizeCanvasStyle({
    ...parent,
    ...given,
    theme,
    palette: { ...parent.palette, ...given.palette },
  });
}

/**
 * `value` merged over the inherited style and normalized. The result is
 * memoized on the resolved tokens (all of them, palette included), not on
 * `value`'s identity, so a caller passing a fresh object literal every render
 * does not churn consumers.
 */
export function useResolvedCanvasStyle(value?: CanvasStyleInput): CanvasStyle {
  const parent = useCanvasStyle();
  const merged = value === undefined ? parent : resolveAgainstParent(parent, value);
  // Normalized styles share one key order, so the JSON is a stable identity.
  const key = JSON.stringify(merged);
  // `merged` is intentionally captured from the render that changed `key`.
  return useMemo(() => merged, [key]);
}

export interface CanvasStyleProviderProps {
  /** Overrides merged over the inherited style; omit to inherit unchanged. */
  value?: CanvasStyleInput;
  children?: ReactNode;
}

export function CanvasStyleProvider({ value, children }: CanvasStyleProviderProps) {
  const style = useResolvedCanvasStyle(value);
  return <CanvasStyleContext.Provider value={style}>{children}</CanvasStyleContext.Provider>;
}

/** The original six variables static CSS has always read (names kept stable). */
const CSS_VARIABLE_KEYS = [
  ["--canvas-shape-radius", "shapeCornerRadiusPx"],
  ["--canvas-shape-border", "shapeBorderWidthPx"],
  ["--canvas-section-radius", "sectionCornerRadiusPx"],
  ["--canvas-section-border", "sectionBorderWidthPx"],
  ["--canvas-title-chip-radius", "titleChipCornerRadiusPx"],
  ["--canvas-title-chip-border", "titleChipBorderWidthPx"],
] as const satisfies ReadonlyArray<readonly [`--${string}`, CanvasStyleKey]>;

/** Style keys with one of the original six custom properties. */
export type CanvasStyleCssKey = (typeof CSS_VARIABLE_KEYS)[number][1];

/**
 * Number tokens no static CSS reads — renderers apply them in JS (the process
 * radius as an inline trim, the icon tile cap as geometry, the name size as
 * slot typography) — so they carry no custom property, and adding them left
 * every stage's root style unchanged.
 */
export const CANVAS_STYLE_JS_ONLY_KEYS = ["processCornerRadiusPx", "iconTileMaxPx", "textFontSizePx"] as const;

/** Every other color or number token — each has a `--canvas-<kebab-key>` custom property. */
export type CanvasStyleCssVarKey = Exclude<
  CanvasStyleColorKey | CanvasStyleNumberKey,
  (typeof CANVAS_STYLE_JS_ONLY_KEYS)[number]
>;

const JS_ONLY_KEYS = new Set<string>(CANVAS_STYLE_JS_ONLY_KEYS);

/** The color and number tokens with a custom property, in control order. */
const CSS_TOKEN_KEYS = CANVAS_STYLE_CONTROLS.filter(
  (control) =>
    control.key !== "palette" &&
    (control.kind === "color" || control.kind === "number") &&
    !JS_ONLY_KEYS.has(control.key),
).map((control) => control.key as CanvasStyleCssVarKey);

/** The palette rows' colors, in roster order. */
const CSS_PALETTE_COLORS = CANVAS_STYLE_CONTROLS.flatMap((control) =>
  control.key === "palette" && control.paletteColor ? [control.paletteColor] : [],
);

function kebabCase(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** `--canvas-<kebab-key>` — e.g. `boardBackground` → `--canvas-board-background`. */
function tokenVariable(key: CanvasStyleCssVarKey): `--${string}` {
  return `--canvas-${kebabCase(key)}`;
}

/** CSS value of a token: `*Px` numbers carry the unit, other numbers are unitless, colors verbatim. */
function tokenCssValue(key: CanvasStyleCssVarKey, value: string | number): string {
  return typeof value === "number" && key.endsWith("Px") ? `${value}px` : String(value);
}

/**
 * CSS custom properties carrying the style to static per-kind CSS (the
 * OBJECT_DEFS_CSS block cannot interpolate runtime values). CanvasStage sets
 * these on its root; the CSS rules read them via `canvasStyleCssVar`. Emits
 * the original six variables plus `--canvas-<kebab-key>` for every color and
 * number token (CANVAS_STYLE_JS_ONLY_KEYS aside) and `--canvas-ink-<color>`
 * for every palette ink.
 */
export function canvasStyleCssVariables(style: CanvasStyle): Record<`--${string}`, string> {
  const variables: Record<`--${string}`, string> = {};
  for (const [variable, key] of CSS_VARIABLE_KEYS) variables[variable] = `${style[key]}px`;
  for (const key of CSS_TOKEN_KEYS) variables[tokenVariable(key)] = tokenCssValue(key, style[key]);
  for (const color of CSS_PALETTE_COLORS) variables[`--canvas-ink-${color}`] = style.palette[color];
  return variables;
}

/**
 * `var(--canvas-…, <figjam value>)` for static CSS. The literal fallback is
 * the figjam preset's value whatever the default theme is: CanvasStage sets
 * every variable on its root from the resolved style (the default theme
 * included), so the fallback never decides a stage render, and pinning it
 * keeps the static stylesheet byte-identical across default-theme changes.
 * The original six keys keep their original variable names; every other
 * color/number token uses `--canvas-<kebab-key>`.
 */
export function canvasStyleCssVar(key: CanvasStyleCssVarKey): string {
  const legacy = CSS_VARIABLE_KEYS.find(([, styleKey]) => styleKey === key);
  const variable = legacy ? legacy[0] : tokenVariable(key);
  return `var(${variable}, ${tokenCssValue(key, FIGJAM_CANVAS_STYLE[key])})`;
}
