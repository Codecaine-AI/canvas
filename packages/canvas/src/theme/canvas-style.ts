/**
 * canvas-style.ts — the workspace-wide canvas style settings: corner radii and
 * border/stroke widths every renderer (live stage, static SVG, agent text fit)
 * resolves through. Hosts persist a (possibly partial) override bag — Studio
 * keeps it in `canvases/canvas-style.json` — and pass it through
 * `normalizeCanvasStyle`, which fills defaults and clamps to the ranges below.
 *
 * Pure data, no React and no DOM: safe to import from Node (Studio server,
 * Canvas MCP) via `@codecaine-ai/canvas/style`.
 *
 * Every `*Px` value is LOGICAL px (independent of canvas zoom). A per-object
 * `style.strokeWidth` still overrides `shapeBorderWidthPx` /
 * `sectionBorderWidthPx` for that object.
 */

export interface CanvasStyle {
  /** Corner radius of rectangle-family shapes (rectangle, process, predefined process). */
  shapeCornerRadiusPx: number;
  /** Default border width of shapes. */
  shapeBorderWidthPx: number;
  /** Corner radius of section frames. */
  sectionCornerRadiusPx: number;
  /** Default border width of section frames. */
  sectionBorderWidthPx: number;
  /** Corner radius of section title chips. */
  titleChipCornerRadiusPx: number;
  /** Border width of section title chips. */
  titleChipBorderWidthPx: number;
  /** Corner radius of connector label chips (half the 30px chip height = pill). */
  labelChipCornerRadiusPx: number;
  /** Connector line width. */
  connectorStrokeWidthPx: number;
  /** Radius of the rounded bends on elbow connectors. */
  connectorCornerRadiusPx: number;
}

export type CanvasStyleKey = keyof CanvasStyle;

export const DEFAULT_CANVAS_STYLE: Readonly<CanvasStyle> = Object.freeze({
  shapeCornerRadiusPx: 2,
  shapeBorderWidthPx: 2,
  sectionCornerRadiusPx: 2,
  sectionBorderWidthPx: 1.5,
  titleChipCornerRadiusPx: 2,
  titleChipBorderWidthPx: 1.5,
  labelChipCornerRadiusPx: 2,
  connectorStrokeWidthPx: 4,
  connectorCornerRadiusPx: 21.5,
});

export type CanvasStyleGroup = "shapes" | "sections" | "connectors";

export interface CanvasStyleControl {
  key: CanvasStyleKey;
  group: CanvasStyleGroup;
  label: string;
  min: number;
  max: number;
  step: number;
}

/** UI + clamp metadata, in display order. */
export const CANVAS_STYLE_CONTROLS: readonly CanvasStyleControl[] = [
  { key: "shapeCornerRadiusPx", group: "shapes", label: "Corner radius", min: 0, max: 24, step: 0.5 },
  { key: "shapeBorderWidthPx", group: "shapes", label: "Border width", min: 0.5, max: 8, step: 0.5 },
  { key: "sectionCornerRadiusPx", group: "sections", label: "Corner radius", min: 0, max: 24, step: 0.5 },
  { key: "sectionBorderWidthPx", group: "sections", label: "Border width", min: 0.5, max: 6, step: 0.5 },
  { key: "titleChipCornerRadiusPx", group: "sections", label: "Title chip radius", min: 0, max: 16, step: 0.5 },
  { key: "titleChipBorderWidthPx", group: "sections", label: "Title chip border", min: 0.5, max: 4, step: 0.5 },
  { key: "connectorStrokeWidthPx", group: "connectors", label: "Line width", min: 1, max: 8, step: 0.5 },
  { key: "connectorCornerRadiusPx", group: "connectors", label: "Bend radius", min: 0, max: 40, step: 0.5 },
  { key: "labelChipCornerRadiusPx", group: "connectors", label: "Label chip radius", min: 0, max: 15, step: 0.5 },
];

export const CANVAS_STYLE_GROUP_LABELS: Readonly<Record<CanvasStyleGroup, string>> = {
  shapes: "Shapes",
  sections: "Sections",
  connectors: "Connectors",
};

const CONTROL_BY_KEY = new Map(CANVAS_STYLE_CONTROLS.map((control) => [control.key, control]));

/**
 * Fills defaults and clamps every known key to its control range. Unknown
 * keys and non-finite values are dropped, so any parsed JSON is safe input.
 */
export function normalizeCanvasStyle(input: unknown): CanvasStyle {
  const bag = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const out = { ...DEFAULT_CANVAS_STYLE };
  for (const key of Object.keys(DEFAULT_CANVAS_STYLE) as CanvasStyleKey[]) {
    const value = bag[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const control = CONTROL_BY_KEY.get(key);
    out[key] = control ? Math.min(control.max, Math.max(control.min, value)) : value;
  }
  return out;
}

/** The keys of `style` that differ from the defaults — what a host persists. */
export function canvasStyleOverrides(style: CanvasStyle): Partial<CanvasStyle> {
  const overrides: Partial<CanvasStyle> = {};
  for (const key of Object.keys(DEFAULT_CANVAS_STYLE) as CanvasStyleKey[]) {
    if (style[key] !== DEFAULT_CANVAS_STYLE[key]) overrides[key] = style[key];
  }
  return overrides;
}

/** Workspace-relative file Studio and the Canvas MCP read the overrides from. */
export const CANVAS_STYLE_FILENAME = "canvas-style.json";
