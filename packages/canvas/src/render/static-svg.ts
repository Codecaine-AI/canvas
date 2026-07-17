/**
 * Static document → SVG renderer (render/types.ts is the contract).
 *
 * Pure and Node-safe: no React, no DOM, no browser globals — the same code
 * runs inside a Node/Bun server handler and in the browser. The output is a
 * fully self-contained standalone `<svg>`: inline presentation attributes
 * only (no CSS classes, no external fonts, no `<foreignObject>`), all user
 * text XML-escaped, and nothing time- or randomness-dependent (two calls on
 * the same document produce byte-identical markup).
 *
 * Camera: the root `<svg>` viewBox is set to the (padded) world bounds and
 * the width/height attributes to the target pixel size, with
 * `preserveAspectRatio="xMidYMid meet"` — the browser does the contain-fit
 * scaling, no manual scale math. When the caller gives BOTH `width` and
 * `height` and their ratio differs from the content's, the letterbox bands
 * around the fitted content are TRANSPARENT (the optional "board" background
 * rect covers the viewBox/world area only, not the letterbox).
 *
 * Fidelity: geometry reuses the exact primitives the live stage uses —
 * `documentBounds`/`containerViewBounds` for the camera,
 * `outlineSpecFor`/`outlinePolygonForSpec` for shape silhouettes,
 * `routeConnection` for elbow connector paths, the palette role tables for
 * every color, and the text-slot system for text placement — so a static
 * render matches the app. Known approximations (v1): text wrapping uses the
 * repo's shared char-width heuristic rather than real font metrics; sticky
 * text renders as plain lines (no markdown); flowchart silhouettes whose
 * outline is the plain bbox (document, database, folder, …) render as the
 * base rounded rect. Icon objects render their real Nucleo glyph via the
 * pure registry (objects/shapes/icon/icon-glyphs.ts), falling back to a
 * neutral rounded rect only for unknown glyph ids.
 */

import {
  boundsForGeometries,
  documentBounds,
  sectionDescendantIds,
  type CanvasBounds,
  type CanvasPoint,
} from "../state/geometry";
import { containerViewBounds } from "../stage/viewport";
import { paintOrderedObjects } from "../state/z-order";
import {
  outlinePolygonForSpec,
  outlineSpecFor,
  ARROW_SHAPE_GEOMETRY,
} from "../objects/geometry";
import { routeConnection, CONNECTOR_END_GAP_PX } from "../connectors/routing";
import { CONNECTOR_DASH_PATTERN_PX } from "../connectors/def";
import {
  resolveConnectorStroke,
  resolveSectionColors,
  resolveShapeColors,
  resolveStickyFill,
} from "../theme/palette";
import { FIRST_USE_COLORS } from "../state/schema/object-defaults";
import { resolveObjectStrokeWidth } from "../theme/tokens";
import {
  BELOW_TEXT_SLOT,
  CENTER_TEXT_SLOT,
  CENTER_TEXT_INSET_PX,
  INSET_BODY_TEXT_SLOT,
  OBJECT_TEXT_COLOR,
  TITLE_CHIP,
  estimateTitleChipWidthPx,
  rectTextSlot,
  resolveTextSlot,
  slotLineHeightPx,
  titleChipMaxWidthPx,
  type LocalRect,
  type SlotTypography,
  type TextSlot,
} from "../objects/text-slots";
import {
  ICON_GLYPHS,
  iconGlyphStrokeWidthForSize,
  type IconGlyphElement,
  type IconGlyphId,
} from "../objects/shapes/icon/icon-glyphs";
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../state/schema";
import type { RenderDocumentToSvg, RenderStaticSvgOptions, RenderedSvg } from "./types";

// ---------------------------------------------------------------------------
// Visual constants mirrored from stage modules that cannot be imported here
// (CanvasStage.tsx and the def .tsx files pull in React). Each carries a
// pointer to its source of truth.
// ---------------------------------------------------------------------------

/** Board surface color — mirrors CANVAS_BG in stage/CanvasStage.tsx. */
const CANVAS_BG = "#F5F5F5";
/**
 * Canvas content font — mirrors CANVAS_FONT_FAMILY in stage/CanvasStage.tsx
 * (quotes dropped: multi-word family names are valid unquoted CSS idents,
 * which keeps the attribute free of escaped quote noise).
 */
const CANVAS_FONT_FAMILY =
  "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";

/** Base rounded-rect corner radius — mirrors the `.interactive-canvas-object` CSS (border-radius: 8px). */
const BASE_CORNER_RADIUS_PX = 8;
/** Section frame — mirrors SECTION_GEOMETRY in objects/section/def.tsx. */
const SECTION_CORNER_RADIUS_PX = 8.5;
const SECTION_BORDER_WIDTH_PX = 2;
/** Section title chip corner radius — mirrors the chip CSS in objects/section/def.tsx (border-radius: 6px). */
const TITLE_CHIP_CORNER_RADIUS_PX = 6;

/** Connector stroke width — mirrors CONNECTOR_STROKE_WIDTH_PX in connectors/Connector.tsx. */
const CONNECTOR_STROKE_WIDTH_PX = 4;
/** Arrowhead geometry in stroke-width units — mirrors the marker `<defs>` in stage/CanvasStage.tsx. */
const ARROW_LENGTH_RATIO = 5;
const ARROW_WIDTH_RATIO = 5;
/** The marker's refX is (length - 0.5): the tip overshoots the path end by half a stroke width. */
const ARROW_TIP_OVERSHOOT_RATIO = 0.5;

/** Connection label chip — mirrors the CONNECTION_LABEL_* constants in connectors/Connector.tsx. */
const CONNECTION_LABEL_HEIGHT_PX = 30;
const CONNECTION_LABEL_PADDING_X_PX = 12;
const CONNECTION_LABEL_FONT_SIZE_PX = 16;
const CONNECTION_LABEL_FONT_WEIGHT = 700;
const CONNECTION_LABEL_RADIUS_PX = 15;
const CONNECTION_LABEL_AVERAGE_CHAR_WIDTH_PX = 9.6;
const CONNECTION_LABEL_MIN_WIDTH_PX = 41;
const CONNECTION_LABEL_BACKGROUND = "#F5F5F5";
const CONNECTION_LABEL_BORDER = "#D9D9D9";
/** Label text color — the stage uses var(--foreground); light-theme near-black inlined. */
const CONNECTION_LABEL_TEXT_COLOR = OBJECT_TEXT_COLOR;

/** Sticky shadow — mirrors STICKY_GEOMETRY.shadow ("0 3px 12px rgba(0,0,0,0.15)") in objects/sticky/def.tsx. */
const STICKY_SHADOW = { dx: 0, dy: 3, stdDeviation: 6, opacity: 0.15 } as const;

/**
 * Average glyph width as a fraction of font size — the repo-wide wrap
 * heuristic (objects/text-slots.ts BELOW_TEXT_CHAR_WIDTH_PX = 15 * 0.62).
 */
const CHAR_WIDTH_RATIO = 0.62;

/** Default world padding, mirroring each bounds primitive's own default (documentBounds 80 / containerViewBounds 32). */
const DEFAULT_DOCUMENT_PADDING_PX = 80;
const DEFAULT_SECTION_PADDING_PX = 32;
/** Tight padding for `fit: "content"` crops — the embed supplies its own framing. */
const DEFAULT_CONTENT_FIT_PADDING_PX = 16;

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Compact deterministic number formatting (2-decimal, no trailing zeros, no "-0"). */
function fmt(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded === 0 ? 0 : rounded);
}

/** Serializes an attribute map, skipping undefined values. Values are XML-escaped. */
function attrs(map: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    const raw = typeof value === "number" ? fmt(value) : value;
    parts.push(`${key}="${escapeXml(raw)}"`);
  }
  return parts.join(" ");
}

function tag(name: string, attributes: Record<string, string | number | undefined>, children?: string): string {
  const attributeText = attrs(attributes);
  const open = attributeText.length > 0 ? `<${name} ${attributeText}` : `<${name}`;
  if (children === undefined || children === "") return `${open}/>`;
  return `${open}>${children}</${name}>`;
}

function distance(a: CanvasPoint, b: CanvasPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointToward(from: CanvasPoint, to: CanvasPoint, length: number): CanvasPoint {
  const segment = distance(from, to);
  if (segment === 0) return from;
  const scale = length / segment;
  return { x: from.x + (to.x - from.x) * scale, y: from.y + (to.y - from.y) * scale };
}

/** XML-id-safe slug of the document id, for defs references. */
function idSlug(value: string): string {
  const slug = value.replace(/[^A-Za-z0-9_-]/g, "-");
  return slug.length > 0 ? slug : "canvas";
}

// ---------------------------------------------------------------------------
// Text layout — the string-producing twin of text-slots.ts's
// estimateWrappedText (same greedy algorithm and char-width heuristic, but
// keeping the actual line strings so we can emit <tspan>s).
// ---------------------------------------------------------------------------

function wrapTextLines(text: string, availableWidthPx: number, fontSizePx: number): string[] {
  if (text === "") return [];
  const charWidth = fontSizePx * CHAR_WIDTH_RATIO;
  const width = Math.max(charWidth, availableWidthPx);
  const maxChars = Math.max(1, Math.floor(width / charWidth));
  const lines: string[] = [];

  for (const hardLine of text.split("\n")) {
    const words = hardLine.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (let word of words) {
      // Break words longer than the line onto their own chunked lines.
      while (word.length > maxChars) {
        if (current !== "") {
          lines.push(current);
          current = "";
        }
        lines.push(word.slice(0, maxChars));
        word = word.slice(maxChars);
      }
      if (word === "") continue;
      if (current === "") {
        current = word;
      } else if ((current.length + 1 + word.length) * charWidth <= width) {
        current = `${current} ${word}`;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current !== "") lines.push(current);
  }

  return lines;
}

/** Clamp wrapped lines to the slot rect, ellipsizing the last visible line (mirrors the app's line-clamp). */
function clampLines(lines: string[], maxLines: number): string[] {
  if (lines.length <= maxLines) return lines;
  const clamped = lines.slice(0, maxLines);
  const lastIndex = clamped.length - 1;
  clamped[lastIndex] = `${(clamped[lastIndex] ?? "").replace(/\s+$/, "")}…`;
  return clamped;
}

/**
 * Renders wrapped slot text as a `<text>` with one `<tspan>` per line.
 * `rect` is in world coordinates.
 */
function renderSlotTextBlock(
  text: string,
  rect: { x: number; y: number; width: number; height: number },
  typography: SlotTypography,
  verticalAlign: "top" | "center" | "bottom",
  options?: { clampToRect?: boolean },
): string {
  if (text === "" || rect.width <= 0) return "";
  const lineHeight = slotLineHeightPx(typography);
  let lines = wrapTextLines(text, rect.width, typography.fontSizePx);
  if (lines.length === 0) return "";
  if (options?.clampToRect !== false && rect.height > 0) {
    const maxLines = Math.max(1, Math.floor(rect.height / lineHeight));
    lines = clampLines(lines, maxLines);
  }

  const blockHeight = lines.length * lineHeight;
  let firstLineCenterY: number;
  if (verticalAlign === "top") {
    firstLineCenterY = rect.y + lineHeight / 2;
  } else if (verticalAlign === "bottom") {
    firstLineCenterY = rect.y + rect.height - blockHeight + lineHeight / 2;
  } else {
    firstLineCenterY = rect.y + (rect.height - blockHeight) / 2 + lineHeight / 2;
  }

  const anchor = typography.textAlign === "center" ? "middle" : "start";
  const x = typography.textAlign === "center" ? rect.x + rect.width / 2 : rect.x;

  const tspans = lines
    .map((line, index) =>
      line === ""
        ? ""
        : tag("tspan", { x, y: firstLineCenterY + index * lineHeight }, escapeXml(line)),
    )
    .join("");
  if (tspans === "") return "";

  return tag(
    "text",
    {
      fill: typography.color,
      "font-size": typography.fontSizePx,
      "font-weight": typography.fontWeight,
      "text-anchor": anchor,
      "dominant-baseline": "central",
      ...(typography.fontFamily ? { "font-family": typography.fontFamily } : null),
    },
    tspans,
  );
}

// ---------------------------------------------------------------------------
// Text slots per shape — mirrors the per-def slot picks (the def modules are
// .tsx/React and cannot be imported here).
// ---------------------------------------------------------------------------

/** Mirrors arrowShapeTextRect in objects/shapes/basic/arrow-shape.tsx. */
function arrowShapeTextRect(object: InteractiveCanvasObject): LocalRect {
  const direction: "left" | "right" = object.direction === "left" ? "left" : "right";
  const contentWidth = Math.max(0, object.geometry.width - CENTER_TEXT_INSET_PX.x * 2);
  const bodyWidth = contentWidth * (1 - ARROW_SHAPE_GEOMETRY.headWidthRatio);
  const bodyInset = (object.geometry.height * (1 - ARROW_SHAPE_GEOMETRY.bodyHeightRatio)) / 2;
  return {
    x:
      direction === "left"
        ? CENTER_TEXT_INSET_PX.x + (contentWidth - bodyWidth)
        : CENTER_TEXT_INSET_PX.x,
    y: bodyInset + 4,
    width: bodyWidth,
    height: Math.max(0, object.geometry.height * ARROW_SHAPE_GEOMETRY.bodyHeightRatio - 8),
  };
}

/** Mirrors chevronTextRect in objects/shapes/basic/chevron.tsx. */
function chevronTextRect(object: InteractiveCanvasObject): LocalRect {
  const x1 = object.geometry.width * 0.25 + 6;
  const x2 = object.geometry.width * 0.75 - 6;
  return {
    x: x1,
    y: 8,
    width: Math.max(0, x2 - x1),
    height: Math.max(0, object.geometry.height - 16),
  };
}

const ARROW_SHAPE_TEXT_SLOT = rectTextSlot(arrowShapeTextRect);
const CHEVRON_TEXT_SLOT = rectTextSlot(chevronTextRect);

/** Types whose defs declare text: "none" (pure glyphs — see plus/or-junction/summing-junction defs). */
const NO_TEXT_TYPES = new Set<InteractiveCanvasObject["type"]>([
  "plus",
  "or-junction",
  "summing-junction",
]);

function textSlotForObject(object: InteractiveCanvasObject): TextSlot | null {
  if (NO_TEXT_TYPES.has(object.type)) return null;
  if (object.type === "icon") return BELOW_TEXT_SLOT;
  if (object.type === "arrow-shape") return ARROW_SHAPE_TEXT_SLOT;
  if (object.type === "chevron") return CHEVRON_TEXT_SLOT;
  if (effectiveRenderShape(object) === "note") return INSET_BODY_TEXT_SLOT;
  return CENTER_TEXT_SLOT;
}

/** The stage's render dispatch key: style.shape with the rounded-rect fallback. */
function effectiveRenderShape(object: InteractiveCanvasObject): string {
  return object.style?.shape ?? "rounded-rect";
}

// ---------------------------------------------------------------------------
// Object rendering
// ---------------------------------------------------------------------------

function renderObjectText(object: InteractiveCanvasObject): string {
  if (object.text === "") return "";
  const slot = textSlotForObject(object);
  if (!slot) return "";
  const resolved = resolveTextSlot(slot, object);
  if (resolved.hidden) return "";
  const worldRect = {
    x: object.geometry.x + resolved.rect.x,
    y: object.geometry.y + resolved.rect.y,
    width: resolved.rect.width,
    height: resolved.rect.height,
  };
  // The "below" band renders every wrapped line (it sizes itself to the text)
  // rather than clamping to the glyph box.
  const clampToRect = resolved.multiline && slot.placement !== "below";
  return renderSlotTextBlock(object.text, worldRect, resolved.typography, resolved.verticalAlign, {
    clampToRect,
  });
}

function polygonPointsAttribute(points: CanvasPoint[]): string {
  return points.map((point) => `${fmt(point.x)},${fmt(point.y)}`).join(" ");
}

// ---------------------------------------------------------------------------
// Icon glyphs — mirrors objects/shapes/icon/IconShapeBody.tsx over the pure
// glyph registry (icon-glyphs.ts, React-free data).
// ---------------------------------------------------------------------------

function glyphElementMarkup(element: IconGlyphElement): string {
  if (element.kind === "path") return tag("path", { d: element.d });
  if (element.kind === "circle") {
    return tag("circle", { cx: element.cx, cy: element.cy, r: element.r });
  }
  return tag("line", { x1: element.x1, y1: element.y1, x2: element.x2, y2: element.y2 });
}

function isFillGlyphElement(element: IconGlyphElement): boolean {
  return element.kind === "path" || element.kind === "circle";
}

/**
 * SVG fills open paths by chord-closing them; all-open line-art glyphs would
 * expose naked chord-fill triangles, so the fill layer is gated on at least
 * one closed element — same rule as IconShapeBody's
 * glyphElementHasClosedInterior.
 */
function glyphElementHasClosedInterior(element: IconGlyphElement): boolean {
  return element.kind === "circle" || (element.kind === "path" && /[zZ]/.test(element.d));
}

/**
 * The real icon glyph as a NESTED `<svg>` filling the object's bbox — the
 * nested viewBox keeps stroke widths in viewBox units (exactly how the live
 * IconShapeBody scales them) and the default-equivalent
 * preserveAspectRatio="xMidYMid meet" centers the square glyph in a
 * non-square bbox. Returns null for an unknown/missing glyph id (caller
 * falls back to the neutral rect).
 */
function renderIconGlyph(
  object: InteractiveCanvasObject,
  fill: string,
  stroke: string,
): string | null {
  const glyphId = object.icon as IconGlyphId | undefined;
  const glyph = glyphId ? ICON_GLYPHS[glyphId] : undefined;
  if (!glyph) return null;

  const { geometry } = object;
  const sizePx = Math.min(geometry.width, geometry.height);
  const glyphStrokeWidth = iconGlyphStrokeWidthForSize(sizePx);

  const shouldRenderFillLayer = Boolean(
    fill && glyph.elements.some(glyphElementHasClosedInterior),
  );
  const fillLayer = shouldRenderFillLayer
    ? tag(
        "g",
        { fill, stroke: "none" },
        glyph.elements
          .filter(isFillGlyphElement)
          .map(glyphElementMarkup)
          .join(""),
      )
    : "";
  const inkLayer = tag("g", {}, glyph.elements.map(glyphElementMarkup).join(""));

  return tag(
    "svg",
    {
      x: geometry.x,
      y: geometry.y,
      width: Math.max(0, geometry.width),
      height: Math.max(0, geometry.height),
      viewBox: `0 0 ${fmt(glyph.viewBoxSize)} ${fmt(glyph.viewBoxSize)}`,
      preserveAspectRatio: "xMidYMid meet",
      fill: "none",
      stroke,
      "stroke-width": glyphStrokeWidth,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
    fillLayer + inkLayer,
  );
}

/**
 * The shape body silhouette. Polygon/ellipse outline kinds stroke the true
 * outline exactly like the app's SVG silhouettes (stroke centered on the
 * path). Bbox kinds mimic the CSS border-box border by insetting the rect by
 * half the stroke width.
 */
function renderShapeBody(object: InteractiveCanvasObject, stickyShadowFilterId: string | null): string {
  const geometry = object.geometry;
  const renderShape = effectiveRenderShape(object);

  // Sticky note ("note" render shape): flat square sticky fill, no border,
  // down-biased shadow (objects/sticky/def.tsx STICKY_GEOMETRY).
  if (renderShape === "note") {
    const fill = resolveStickyFill(object.color ?? FIRST_USE_COLORS.sticky);
    return tag("rect", {
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      fill,
      ...(stickyShadowFilterId ? { filter: `url(#${stickyShadowFilterId})` } : null),
    });
  }

  const colors = resolveShapeColors(object.color ?? FIRST_USE_COLORS.shape);
  const strokeWidth = resolveObjectStrokeWidth(object.style);

  // Icon glyph family: render the real Nucleo glyph via the pure registry
  // (objects/shapes/icon/icon-glyphs.ts), mirroring IconShapeBody.tsx.
  // Unknown/missing glyph id falls through to the neutral-rect bbox tier.
  if (renderShape === "icon" || object.type === "icon") {
    const glyphMarkup = renderIconGlyph(object, colors.fill, colors.border);
    if (glyphMarkup !== null) return glyphMarkup;
  }

  // Pill/stadium: a perfect rounded rect beats the outline module's 8-segment
  // polygon approximation.
  if (object.type === "pill" || renderShape === "pill") {
    const radius = Math.min(geometry.width, geometry.height) / 2;
    return tag("rect", {
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      rx: radius,
      fill: colors.fill,
      stroke: colors.border,
      "stroke-width": strokeWidth,
    });
  }

  const spec = outlineSpecFor(object);

  if (spec.kind === "ellipse") {
    const body = tag("ellipse", {
      cx: geometry.x + geometry.width / 2,
      cy: geometry.y + geometry.height / 2,
      rx: geometry.width / 2,
      ry: geometry.height / 2,
      fill: colors.fill,
      stroke: colors.border,
      "stroke-width": strokeWidth,
    });
    // Junction overlay glyphs (or-junction "+", summing-junction "x") —
    // mirrors the silhouettes in objects/shapes/flowchart/{or,summing}-junction.tsx.
    if (object.type === "or-junction") {
      const cx = geometry.x + geometry.width / 2;
      const cy = geometry.y + geometry.height / 2;
      return (
        body +
        tag("line", { x1: cx, y1: geometry.y, x2: cx, y2: geometry.y + geometry.height, stroke: colors.border, "stroke-width": strokeWidth }) +
        tag("line", { x1: geometry.x, y1: cy, x2: geometry.x + geometry.width, y2: cy, stroke: colors.border, "stroke-width": strokeWidth })
      );
    }
    if (object.type === "summing-junction") {
      const x1 = geometry.x + geometry.width * 0.1464;
      const x2 = geometry.x + geometry.width * 0.8536;
      const y1 = geometry.y + geometry.height * 0.1464;
      const y2 = geometry.y + geometry.height * 0.8536;
      return (
        body +
        tag("line", { x1, y1, x2, y2, stroke: colors.border, "stroke-width": strokeWidth }) +
        tag("line", { x1, y1: y2, x2, y2: y1, stroke: colors.border, "stroke-width": strokeWidth })
      );
    }
    return body;
  }

  if (spec.kind === "polygon") {
    const points = outlinePolygonForSpec(spec, geometry, object);
    // Arrow-shape/chevron silhouettes use round joins in the app.
    const roundJoin = object.type === "arrow-shape" || object.type === "chevron";
    return tag("polygon", {
      points: polygonPointsAttribute(points),
      fill: colors.fill,
      stroke: colors.border,
      "stroke-width": strokeWidth,
      ...(roundJoin ? { "stroke-linejoin": "round" } : null),
    });
  }

  // Bbox tier: the base rounded-rect chrome (2px CSS radius track — the CSS
  // border paints inside the box, so inset by half the stroke).
  const inset = strokeWidth / 2;
  return tag("rect", {
    x: geometry.x + inset,
    y: geometry.y + inset,
    width: Math.max(0, geometry.width - strokeWidth),
    height: Math.max(0, geometry.height - strokeWidth),
    rx: Math.max(0, BASE_CORNER_RADIUS_PX - inset),
    fill: colors.fill,
    stroke: colors.border,
    "stroke-width": strokeWidth,
  });
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function renderSectionBackdrop(section: InteractiveCanvasObject): string {
  const family = resolveSectionColors(section.color ?? FIRST_USE_COLORS.section);
  const geometry = section.geometry;
  const borderStyle = section.style?.strokeStyle ?? "solid";
  const strokeWidth = section.style?.strokeWidth ?? SECTION_BORDER_WIDTH_PX;
  const inset = strokeWidth / 2;

  if (borderStyle === "none") {
    return tag("rect", {
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      rx: SECTION_CORNER_RADIUS_PX,
      fill: family.tint,
    });
  }

  return tag("rect", {
    x: geometry.x + inset,
    y: geometry.y + inset,
    width: Math.max(0, geometry.width - strokeWidth),
    height: Math.max(0, geometry.height - strokeWidth),
    rx: SECTION_CORNER_RADIUS_PX,
    fill: family.tint,
    // Per spec the section border IS the title chip's fill color.
    stroke: family.chip.fill,
    "stroke-width": strokeWidth,
    ...(borderStyle === "dashed"
      ? { "stroke-dasharray": CONNECTOR_DASH_PATTERN_PX.join(" ") }
      : null),
  });
}

function renderSectionTitleChip(section: InteractiveCanvasObject): string {
  if (section.text === "") return "";
  const family = resolveSectionColors(section.color ?? FIRST_USE_COLORS.section);
  // Static render is zoom 1 → chip scale 1 (titleChipScale(1) === 1).
  const maxWidth = titleChipMaxWidthPx(section.geometry.width, 1);
  const estimated = estimateTitleChipWidthPx(section.text);
  const chipWidth = Math.min(estimated, maxWidth);
  if (chipWidth <= 0) return "";
  const chipX = section.geometry.x + TITLE_CHIP.insetFromSectionCornerPx;
  const chipY = section.geometry.y + TITLE_CHIP.insetFromSectionCornerPx;
  const borderInset = TITLE_CHIP.borderWidthPx / 2;

  // Ellipsize when the estimated natural width exceeds the section's budget
  // (mirrors the chip CSS's text-overflow: ellipsis).
  let label = section.text;
  if (estimated > maxWidth) {
    const charWidth = TITLE_CHIP.fontSizePx * CHAR_WIDTH_RATIO;
    const available =
      chipWidth - TITLE_CHIP.paddingXPx * 2 - TITLE_CHIP.borderWidthPx * 2 - charWidth;
    const maxChars = Math.max(1, Math.floor(available / charWidth));
    label = `${section.text.slice(0, maxChars)}…`;
  }

  const rect = tag("rect", {
    x: chipX + borderInset,
    y: chipY + borderInset,
    width: Math.max(0, chipWidth - TITLE_CHIP.borderWidthPx),
    height: TITLE_CHIP.heightPx - TITLE_CHIP.borderWidthPx,
    rx: TITLE_CHIP_CORNER_RADIUS_PX,
    fill: family.chip.fill,
    stroke: family.chip.border,
    "stroke-width": TITLE_CHIP.borderWidthPx,
  });
  const text = tag(
    "text",
    {
      x: chipX + TITLE_CHIP.borderWidthPx + TITLE_CHIP.paddingXPx,
      y: chipY + TITLE_CHIP.heightPx / 2,
      fill: TITLE_CHIP.textColor,
      "font-size": TITLE_CHIP.fontSizePx,
      "font-weight": TITLE_CHIP.fontWeight,
      "text-anchor": "start",
      "dominant-baseline": "central",
    },
    escapeXml(label),
  );
  return rect + text;
}

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------

/**
 * The rendered path end after routing's END_GAP pullback (mirrors
 * connectors/routing.ts withEndGap): the drawn path stops short of the true
 * anchor by min(END_GAP, half the end segment).
 */
function renderedEndpoint(endpoint: CanvasPoint, neighbor: CanvasPoint): CanvasPoint {
  const gap = Math.min(CONNECTOR_END_GAP_PX, distance(endpoint, neighbor) / 2);
  return pointToward(endpoint, neighbor, gap);
}

/**
 * Arrowhead triangle matching the stage's SVG marker geometry
 * (stage/CanvasStage.tsx `<defs>`): a solid triangle 5 stroke-widths long and
 * 5 wide, whose tip overshoots the rendered path end by 0.5 stroke widths
 * (marker refX = length − 0.5), oriented along the end segment's tangent.
 */
function arrowheadPolygon(
  pathEnd: CanvasPoint,
  neighbor: CanvasPoint,
  strokeWidth: number,
  color: string,
): string {
  const segment = distance(pathEnd, neighbor);
  if (segment === 0) return "";
  const dirX = (pathEnd.x - neighbor.x) / segment;
  const dirY = (pathEnd.y - neighbor.y) / segment;
  const tip = {
    x: pathEnd.x + dirX * ARROW_TIP_OVERSHOOT_RATIO * strokeWidth,
    y: pathEnd.y + dirY * ARROW_TIP_OVERSHOOT_RATIO * strokeWidth,
  };
  const base = {
    x: tip.x - dirX * ARROW_LENGTH_RATIO * strokeWidth,
    y: tip.y - dirY * ARROW_LENGTH_RATIO * strokeWidth,
  };
  const halfWidth = (ARROW_WIDTH_RATIO / 2) * strokeWidth;
  const perpX = -dirY;
  const perpY = dirX;
  const points: CanvasPoint[] = [
    tip,
    { x: base.x + perpX * halfWidth, y: base.y + perpY * halfWidth },
    { x: base.x - perpX * halfWidth, y: base.y - perpY * halfWidth },
  ];
  return tag("polygon", { points: polygonPointsAttribute(points), fill: color });
}

function renderConnector(
  connection: InteractiveCanvasConnection,
  objectsById: Map<string, InteractiveCanvasObject>,
  obstacles: InteractiveCanvasObject[],
): string {
  const fromObject = objectsById.get(connection.from.objectId);
  const toObject = objectsById.get(connection.to.objectId);
  if (!fromObject || !toObject) return "";

  const routed = routeConnection(fromObject, toObject, connection, obstacles);
  const stroke = resolveConnectorStroke(connection.color ?? FIRST_USE_COLORS.connector);
  const dashed = connection.style === "dashed";

  const parts: string[] = [
    tag("path", {
      d: routed.path,
      fill: "none",
      stroke,
      "stroke-width": CONNECTOR_STROKE_WIDTH_PX,
      "stroke-linecap": "butt",
      ...(dashed ? { "stroke-dasharray": CONNECTOR_DASH_PATTERN_PX.join(" ") } : null),
    }),
  ];

  const arrow = connection.arrow ?? "forward";
  const points = routed.points ?? [];
  if (points.length >= 2) {
    const first = points[0]!;
    const second = points[1]!;
    const last = points[points.length - 1]!;
    const beforeLast = points[points.length - 2]!;
    if (arrow === "forward" || arrow === "both") {
      parts.push(
        arrowheadPolygon(renderedEndpoint(last, beforeLast), beforeLast, CONNECTOR_STROKE_WIDTH_PX, stroke),
      );
    }
    if (arrow === "back" || arrow === "both") {
      parts.push(
        arrowheadPolygon(renderedEndpoint(first, second), second, CONNECTOR_STROKE_WIDTH_PX, stroke),
      );
    }
  }

  // Label chip at the routed midpoint — mirrors the stage's SVG label chip
  // (connectors/Connector.tsx).
  const label = connection.label?.trim() ? connection.label : null;
  if (label) {
    const labelWidth = Math.max(
      CONNECTION_LABEL_MIN_WIDTH_PX,
      label.length * CONNECTION_LABEL_AVERAGE_CHAR_WIDTH_PX + CONNECTION_LABEL_PADDING_X_PX * 2,
    );
    const { x, y } = routed.labelPoint;
    parts.push(
      tag("rect", {
        x: x - labelWidth / 2,
        y: y - CONNECTION_LABEL_HEIGHT_PX / 2,
        width: labelWidth,
        height: CONNECTION_LABEL_HEIGHT_PX,
        rx: CONNECTION_LABEL_RADIUS_PX,
        fill: CONNECTION_LABEL_BACKGROUND,
        stroke: CONNECTION_LABEL_BORDER,
        "stroke-width": 1,
      }),
      tag(
        "text",
        {
          x,
          y,
          fill: CONNECTION_LABEL_TEXT_COLOR,
          "font-size": CONNECTION_LABEL_FONT_SIZE_PX,
          "font-weight": CONNECTION_LABEL_FONT_WEIGHT,
          "text-anchor": "middle",
          "dominant-baseline": "central",
        },
        escapeXml(label),
      ),
    );
  }

  return parts.join("");
}

// ---------------------------------------------------------------------------
// Camera / content selection
// ---------------------------------------------------------------------------

type RenderContent = {
  bounds: CanvasBounds;
  objects: InteractiveCanvasObject[];
  connections: InteractiveCanvasConnection[];
};

function selectContent(
  document: InteractiveCanvasDocument,
  options: RenderStaticSvgOptions,
): RenderContent {
  const { sectionId, padding } = options;

  if (sectionId && options.fit === "content") {
    const includedIds = sectionDescendantIds(document, sectionId);
    const members = document.objects.filter((object) => includedIds.has(object.id));
    const fitted = boundsForGeometries(
      members.map((object) => object.geometry),
      padding ?? DEFAULT_CONTENT_FIT_PADDING_PX,
    );
    if (fitted) {
      return {
        bounds: fitted,
        objects: members,
        connections: document.connections.filter(
          (connection) =>
            includedIds.has(connection.from.objectId) && includedIds.has(connection.to.objectId),
        ),
      };
    }
    // Empty/unknown section: fall through to the frame crop's semantics.
  }

  if (sectionId) {
    const sectionBounds = containerViewBounds(
      document,
      sectionId,
      padding ?? DEFAULT_SECTION_PADDING_PX,
    );
    if (sectionBounds) {
      const includedIds = sectionDescendantIds(document, sectionId);
      includedIds.add(sectionId);
      return {
        bounds: sectionBounds,
        objects: document.objects.filter((object) => includedIds.has(object.id)),
        connections: document.connections.filter(
          (connection) =>
            includedIds.has(connection.from.objectId) && includedIds.has(connection.to.objectId),
        ),
      };
    }
    // Unknown/non-section id: fall back to the whole document (same semantics
    // as the stage's containerViewBounds consumers).
  }

  return {
    bounds: documentBounds(document, padding ?? DEFAULT_DOCUMENT_PADDING_PX),
    objects: document.objects,
    connections: document.connections,
  };
}

function resolvePixelSize(
  bounds: CanvasBounds,
  options: RenderStaticSvgOptions,
): { width: number; height: number } {
  const contentWidth = Math.max(1, bounds.width);
  const contentHeight = Math.max(1, bounds.height);
  const { width, height } = options;

  if (width !== undefined && height !== undefined) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }
  if (width !== undefined) {
    const w = Math.max(1, Math.round(width));
    return { width: w, height: Math.max(1, Math.round((w * contentHeight) / contentWidth)) };
  }
  if (height !== undefined) {
    const h = Math.max(1, Math.round(height));
    return { width: Math.max(1, Math.round((h * contentWidth) / contentHeight)), height: h };
  }
  return { width: Math.max(1, Math.round(contentWidth)), height: Math.max(1, Math.round(contentHeight)) };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export const renderDocumentToSvg: RenderDocumentToSvg = (
  document: InteractiveCanvasDocument,
  options: RenderStaticSvgOptions = {},
): RenderedSvg => {
  const content = selectContent(document, options);
  const { bounds } = content;
  const { width, height } = resolvePixelSize(bounds, options);

  // The stage's five-tier layer cake, minus interactive tiers: section
  // backdrops → connectors → non-section objects → section title chips.
  const ordered = paintOrderedObjects(content.objects);
  const sections = ordered.filter((object) => object.type === "section");
  const nonSections = ordered.filter((object) => object.type !== "section");
  const objectsById = new Map(content.objects.map((object) => [object.id, object]));

  const hasSticky = nonSections.some((object) => effectiveRenderShape(object) === "note");
  const stickyShadowFilterId = hasSticky ? `${idSlug(document.id)}-sticky-shadow` : null;

  const parts: string[] = [];

  if (stickyShadowFilterId) {
    parts.push(
      `<defs><filter id="${escapeXml(stickyShadowFilterId)}" x="-20%" y="-20%" width="140%" height="140%">` +
        `<feDropShadow dx="${fmt(STICKY_SHADOW.dx)}" dy="${fmt(STICKY_SHADOW.dy)}" stdDeviation="${fmt(
          STICKY_SHADOW.stdDeviation,
        )}" flood-color="#000000" flood-opacity="${fmt(STICKY_SHADOW.opacity)}"/></filter></defs>`,
    );
  }

  // "board" (the default) paints the light board surface across the world
  // viewBox; letterbox bands outside the viewBox stay transparent either way.
  if ((options.background ?? "board") === "board") {
    parts.push(
      tag("rect", {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        fill: CANVAS_BG,
      }),
    );
  }

  for (const section of sections) parts.push(renderSectionBackdrop(section));
  for (const connection of content.connections) {
    parts.push(renderConnector(connection, objectsById, content.objects));
  }
  for (const object of nonSections) {
    parts.push(renderShapeBody(object, stickyShadowFilterId));
    parts.push(renderObjectText(object));
  }
  for (const section of sections) parts.push(renderSectionTitleChip(section));

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="${fmt(bounds.x)} ${fmt(bounds.y)} ${fmt(Math.max(1, bounds.width))} ${fmt(
      Math.max(1, bounds.height),
    )}" preserveAspectRatio="xMidYMid meet" font-family="${escapeXml(CANVAS_FONT_FAMILY)}">` +
    parts.filter((part) => part !== "").join("") +
    `</svg>`;

  return { svg, width, height };
};
