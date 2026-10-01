"use client";

/**
 * canvas-style-context.tsx — React plumbing for the workspace canvas style
 * (theme/canvas-style.ts). Every live renderer (stage objects, sections, title
 * chips, connectors, editor overlays) reads corner radii and border/stroke
 * widths through `useCanvasStyle()`; with no provider mounted it returns
 * DEFAULT_CANVAS_STYLE, so standalone renders keep the defaults.
 *
 * Providers nest: a provider's (possibly partial) `value` is merged over the
 * nearest parent provider's style, then normalized (defaults filled, ranges
 * clamped). A provider without a `value` simply re-provides its parent's
 * style, so components can always mount one and stay transparent when their
 * caller omits the prop.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  DEFAULT_CANVAS_STYLE,
  normalizeCanvasStyle,
  type CanvasStyle,
  type CanvasStyleKey,
} from "./canvas-style";

const CanvasStyleContext = createContext<CanvasStyle>(DEFAULT_CANVAS_STYLE);

const STYLE_KEYS = Object.keys(DEFAULT_CANVAS_STYLE) as CanvasStyleKey[];

/** The canvas style in effect for this subtree (DEFAULT_CANVAS_STYLE without a provider). */
export function useCanvasStyle(): CanvasStyle {
  return useContext(CanvasStyleContext);
}

/**
 * `value` merged over the inherited style and normalized. The result is
 * memoized on the resolved numbers, not on `value`'s identity, so a caller
 * passing a fresh object literal every render does not churn consumers.
 */
export function useResolvedCanvasStyle(value?: Partial<CanvasStyle> | CanvasStyle): CanvasStyle {
  const parent = useCanvasStyle();
  const merged = value === undefined ? parent : normalizeCanvasStyle({ ...parent, ...value });
  const key = STYLE_KEYS.map((styleKey) => merged[styleKey]).join("|");
  // `merged` is intentionally captured from the render that changed `key`.
  return useMemo(() => merged, [key]);
}

export interface CanvasStyleProviderProps {
  /** Overrides merged over the inherited style; omit to inherit unchanged. */
  value?: Partial<CanvasStyle> | CanvasStyle;
  children?: ReactNode;
}

export function CanvasStyleProvider({ value, children }: CanvasStyleProviderProps) {
  const style = useResolvedCanvasStyle(value);
  return <CanvasStyleContext.Provider value={style}>{children}</CanvasStyleContext.Provider>;
}

const CSS_VARIABLE_KEYS = [
  ["--canvas-shape-radius", "shapeCornerRadiusPx"],
  ["--canvas-shape-border", "shapeBorderWidthPx"],
  ["--canvas-section-radius", "sectionCornerRadiusPx"],
  ["--canvas-section-border", "sectionBorderWidthPx"],
  ["--canvas-title-chip-radius", "titleChipCornerRadiusPx"],
  ["--canvas-title-chip-border", "titleChipBorderWidthPx"],
] as const satisfies ReadonlyArray<readonly [`--${string}`, CanvasStyleKey]>;

/** Style keys that static CSS can read through a custom property. */
export type CanvasStyleCssKey = (typeof CSS_VARIABLE_KEYS)[number][1];

/**
 * CSS custom properties carrying the style to static per-kind CSS (the
 * OBJECT_DEFS_CSS block cannot interpolate runtime values). CanvasStage sets
 * these on its root; the CSS rules read them via `canvasStyleCssVar`.
 */
export function canvasStyleCssVariables(style: CanvasStyle): Record<`--${string}`, string> {
  const variables: Record<`--${string}`, string> = {};
  for (const [variable, key] of CSS_VARIABLE_KEYS) variables[variable] = `${style[key]}px`;
  return variables;
}

/** `var(--canvas-…, <default>px)` for static CSS — falls back to the default outside a stage. */
export function canvasStyleCssVar(key: CanvasStyleCssKey): string {
  const entry = CSS_VARIABLE_KEYS.find(([, styleKey]) => styleKey === key)!;
  return `var(${entry[0]}, ${DEFAULT_CANVAS_STYLE[key]}px)`;
}
