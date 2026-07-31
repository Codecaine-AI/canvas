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
 * render matches the app. Body-text line breaks and ellipsis decisions use
 * real Inter advance widths (render/text-metrics.ts over the generated glyph
 * table), sticky text lays out as its markdown line boxes
 * (render/sticky-text.ts mirroring objects/sticky/markdown.tsx), and the
 * types whose live defs draw custom inline-SVG silhouettes
 * (predefined-process) draw the same silhouette geometry here. Icon objects render their real Nucleo glyph via
 * the pure registry (objects/shapes/icon/icon-glyphs.ts), falling back to a
 * neutral rounded rect only for unknown glyph ids. Known approximations:
 * measurement ignores kerning/ligatures (marginally conservative), and the
 * section title chip and connection label chip keep their char-count width
 * heuristics — those ARE the live stage's own sizing rules.
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
import { labelPointFor, routeConnection, CONNECTOR_END_GAP_PX } from "../connectors/routing";
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
  titleChipScale,
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
import { STICKY_MARKDOWN_MONO_FONT } from "../objects/sticky/markdown-editing";
import { interCharWidthPx, measureInterTextPx } from "./text-metrics";
import {
  layoutStickyText,
  STICKY_CODE_MONO_ADVANCE_EM,
  STICKY_LINE_PITCH_PX,
  type StickyTextRow,
  type StickyTextSegment,
} from "./sticky-text";
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
 * Average glyph width as a fraction of font size — the char-count heuristic
 * the SECTION TITLE CHIP sizes itself with, live and here (objects/
 * text-slots.ts estimateTitleChipWidthPx). Body-text wrapping does NOT use
 * this: it measures real Inter advances (render/text-metrics.ts).
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

/**
 * Strict-interior overlap between an element rect and the camera viewBox,
 * matching the rasterizer's own viewport test (see the guard in the resvg
 * wrapper): filtered elements and nested `<svg>`s whose rect has no interior
 * intersection with the viewBox abort resvg natively when clipped to an empty
 * IntRect. Elements that fail this check must render without those features
 * (sticky without its shadow filter, icon as its fallback rect) so every
 * emitted SVG is rasterizer-safe regardless of how far the camera is cropped.
 */
function paintsInsideViewBox(
  rect: { x: number; y: number; width: number; height: number },
  viewBox: CanvasBounds,
): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.x < viewBox.x + viewBox.width &&
    rect.x + rect.width > viewBox.x &&
    rect.y < viewBox.y + viewBox.height &&
    rect.y + rect.height > viewBox.y
  );
}

// ---------------------------------------------------------------------------
// Text layout — greedy word wrap on REAL Inter advance widths
// (render/text-metrics.ts), mirroring the browser's word-wrap-then-
// break-word behavior for body text (objects/object-shell.tsx renders slot
// text with white-space: pre-wrap + overflow-wrap: break-word): lines break
// at spaces, and a single word wider than the box breaks intra-word at the
// overflow point. Whitespace runs collapse to single spaces, matching the
// wrapped-line model the text-slot estimators use.
//
// `overflowBreakIndex` / `wrapTextLines` / `clampLines` are exported (they are
// not on the package's public `./render` surface — deep-import them) so that
// off-renderer consumers can ask "would this text clip in this box?" and get
// the RENDERER's answer rather than a second implementation of it. The agent's
// text-fit warnings (canvas-agent board/text-fit.ts) are built on exactly
// these functions for that reason.
// ---------------------------------------------------------------------------

/** Longest prefix of `word` that fits `widthPx` (min 1 codepoint). */
export function overflowBreakIndex(
  word: string,
  widthPx: number,
  fontSizePx: number,
  fontWeight: number,
): number {
  const codePoints = [...word];
  let used = 0;
  let taken = 0;
  let endIndex = 0;
  for (const char of codePoints) {
    const charWidth = measureInterTextPx(char, fontSizePx, fontWeight);
    if (taken > 0 && used + charWidth > widthPx) break;
    used += charWidth;
    taken += 1;
    endIndex += char.length;
  }
  return endIndex;
}

/** Greedy word wrap of `text` into lines that fit `availableWidthPx`. */
export function wrapTextLines(
  text: string,
  availableWidthPx: number,
  fontSizePx: number,
  fontWeight: number,
): string[] {
  if (text === "") return [];
  const width = Math.max(1, availableWidthPx);
  const spaceWidth = measureInterTextPx(" ", fontSizePx, fontWeight);
  const lines: string[] = [];

  for (const hardLine of text.split("\n")) {
    const words = hardLine.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    let currentWidth = 0;
    for (let word of words) {
      let wordWidth = measureInterTextPx(word, fontSizePx, fontWeight);
      // Break words wider than the line at the overflow point.
      while (wordWidth > width) {
        if (current !== "") {
          lines.push(current);
          current = "";
          currentWidth = 0;
        }
        const breakIndex = overflowBreakIndex(word, width, fontSizePx, fontWeight);
        lines.push(word.slice(0, breakIndex));
        word = word.slice(breakIndex);
        wordWidth = measureInterTextPx(word, fontSizePx, fontWeight);
      }
      if (word === "") continue;
      if (current === "") {
        current = word;
        currentWidth = wordWidth;
      } else if (currentWidth + spaceWidth + wordWidth <= width) {
        current = `${current} ${word}`;
        currentWidth += spaceWidth + wordWidth;
      } else {
        lines.push(current);
        current = word;
        currentWidth = wordWidth;
      }
    }
    if (current !== "") lines.push(current);
  }

  return lines;
}

/**
 * Clamp wrapped lines to the slot rect, ellipsizing the last visible line
 * (mirrors the app's -webkit-line-clamp): trailing characters drop until the
 * line plus the ellipsis — measured at its real advance — fits the width.
 */
export function clampLines(
  lines: string[],
  maxLines: number,
  widthPx: number,
  fontSizePx: number,
  fontWeight: number,
): string[] {
  if (lines.length <= maxLines) return lines;
  const clamped = lines.slice(0, maxLines);
  const lastIndex = clamped.length - 1;
  let last = (clamped[lastIndex] ?? "").replace(/\s+$/, "");
  while (last !== "" && measureInterTextPx(`${last}…`, fontSizePx, fontWeight) > widthPx) {
    last = last.slice(0, -1).replace(/\s+$/, "");
  }
  clamped[lastIndex] = `${last}…`;
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
  let lines = wrapTextLines(text, rect.width, typography.fontSizePx, typography.fontWeight);
  if (lines.length === 0) return "";
  if (options?.clampToRect !== false && rect.height > 0) {
    const maxLines = Math.max(1, Math.floor(rect.height / lineHeight));
    lines = clampLines(lines, maxLines, rect.width, typography.fontSizePx, typography.fontWeight);
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

const ARROW_SHAPE_TEXT_SLOT = rectTextSlot(arrowShapeTextRect);

/**
 * The slot this object's text renders into, or null when the type renders no
 * text. Exported alongside the wrap/clamp primitives so off-renderer fit
 * checks resolve the SAME slot the renderer paints into.
 */
export function textSlotForObject(object: InteractiveCanvasObject): TextSlot | null {
  if (object.type === "icon") return BELOW_TEXT_SLOT;
  if (object.type === "arrow-shape") return ARROW_SHAPE_TEXT_SLOT;
  return CENTER_TEXT_SLOT;
}

/** The stage's render dispatch key: style.shape with the rounded-rect fallback. */
export function effectiveRenderShape(object: InteractiveCanvasObject): string {
  return object.style?.shape ?? "rounded-rect";
}

// ---------------------------------------------------------------------------
// Object rendering
// ---------------------------------------------------------------------------

function renderObjectText(object: InteractiveCanvasObject): string {
  if (object.text === "") return "";
  // Sticky notes render their text as markdown line boxes, not plain slot text.
  if (effectiveRenderShape(object) === "note") return renderStickyMarkdownText(object);
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
// Sticky markdown — line boxes from render/sticky-text.ts (which mirrors the
// live StickyMarkdown renderer), emitted as one <text> plus code-chip
// background rects. Only the geometry-bearing pieces are exact; the chip
// visuals approximate the live CSS tastefully (same tint, radius, size).
// ---------------------------------------------------------------------------

/** Code chip visuals — mirrors the inline `<code>` CSS in objects/sticky/markdown.tsx. */
const STICKY_CODE_CHIP_FILL_OPACITY = 0.08;
const STICKY_CODE_CHIP_RADIUS_PX = 3;
/** Chip height in em of the code font size (approximates the inline box's height). */
const STICKY_CODE_CHIP_HEIGHT_EM = 1.3;

/** Approximate advance of one already-laid-out sticky character, for tail trimming. */
function stickySegmentCharWidthPx(segment: StickyTextSegment, char: string): number {
  if (segment.style === "code") return segment.fontSizePx * STICKY_CODE_MONO_ADVANCE_EM;
  return interCharWidthPx(char.codePointAt(0)!, segment.fontSizePx, segment.fontWeight);
}

/**
 * Ellipsizes a clamped sticky row in place (mirrors -webkit-line-clamp):
 * trailing characters drop until the row plus the ellipsis fits the slot
 * width, then the ellipsis is appended to the final segment.
 */
function ellipsizeStickyRow(row: StickyTextRow, slotWidthPx: number): void {
  const ellipsisWidth = measureInterTextPx("…", row.fontSizePx, row.fontWeight);
  const rowEnd = () => {
    const last = row.segments[row.segments.length - 1];
    return last ? last.xPx + last.widthPx : row.indentPx;
  };
  while (row.segments.length > 0 && rowEnd() + ellipsisWidth > slotWidthPx) {
    const last = row.segments[row.segments.length - 1]!;
    const chars = [...last.text];
    const removed = chars.pop();
    if (removed === undefined || chars.length === 0) {
      row.segments.pop();
      continue;
    }
    last.text = chars.join("");
    last.widthPx -= stickySegmentCharWidthPx(last, removed);
  }
  const last = row.segments[row.segments.length - 1];
  if (last && last.style !== "code") {
    last.text = `${last.text}…`;
    last.widthPx += ellipsisWidth;
  } else {
    row.segments.push({
      text: "…",
      style: "plain",
      xPx: rowEnd(),
      widthPx: ellipsisWidth,
      fontSizePx: row.fontSizePx,
      fontWeight: row.fontWeight,
    });
  }
}

/**
 * Sticky body text as its markdown line stack: per-line font size/weight,
 * bullet glyph columns, depth indentation and 36px line pitch mirroring the
 * live StickyMarkdown layout, wrapped on real Inter advances. Rows beyond
 * the slot's height clamp are dropped and the last visible row ellipsized —
 * the same overflow the live -webkit-line-clamp shows.
 */
function renderStickyMarkdownText(object: InteractiveCanvasObject): string {
  const resolved = resolveTextSlot(INSET_BODY_TEXT_SLOT, object);
  if (resolved.hidden) return "";
  const rect = {
    x: object.geometry.x + resolved.rect.x,
    y: object.geometry.y + resolved.rect.y,
    width: resolved.rect.width,
    height: resolved.rect.height,
  };
  if (rect.width <= 0 || rect.height <= 0) return "";
  const typography = resolved.typography;

  const rows = layoutStickyText(object.text, rect.width, typography.fontSizePx);
  const maxRows = Math.max(1, Math.floor(rect.height / STICKY_LINE_PITCH_PX));
  const clamped = rows.slice(0, maxRows);
  if (rows.length > maxRows && clamped.length > 0) {
    ellipsizeStickyRow(clamped[clamped.length - 1]!, rect.width);
  }

  const chipRects: string[] = [];
  const tspans: string[] = [];
  clamped.forEach((row, rowIndex) => {
    const centerY = rect.y + rowIndex * STICKY_LINE_PITCH_PX + STICKY_LINE_PITCH_PX / 2;
    if (row.bullet) {
      tspans.push(
        tag(
          "tspan",
          {
            x: rect.x + row.bullet.xPx,
            y: centerY,
            ...(row.fontSizePx !== typography.fontSizePx ? { "font-size": row.fontSizePx } : null),
          },
          escapeXml(row.bullet.glyph),
        ),
      );
    }
    for (const segment of row.segments) {
      if (segment.text === "") continue;
      if (segment.style === "code") {
        const chipHeight = segment.fontSizePx * STICKY_CODE_CHIP_HEIGHT_EM;
        chipRects.push(
          tag("rect", {
            x: rect.x + segment.xPx,
            y: centerY - chipHeight / 2,
            width: segment.widthPx,
            height: chipHeight,
            rx: STICKY_CODE_CHIP_RADIUS_PX,
            fill: "#000000",
            "fill-opacity": STICKY_CODE_CHIP_FILL_OPACITY,
          }),
        );
      }
      tspans.push(
        tag(
          "tspan",
          {
            x: rect.x + segment.xPx,
            y: centerY,
            ...(segment.fontSizePx !== typography.fontSizePx
              ? { "font-size": segment.fontSizePx }
              : null),
            ...(segment.fontWeight !== typography.fontWeight
              ? { "font-weight": segment.fontWeight }
              : null),
            ...(segment.style === "code" ? { "font-family": STICKY_MARKDOWN_MONO_FONT } : null),
          },
          escapeXml(segment.text),
        ),
      );
    }
  });
  if (tspans.length === 0) return "";

  const text = tag(
    "text",
    {
      fill: typography.color,
      "font-size": typography.fontSizePx,
      "font-weight": typography.fontWeight,
      "text-anchor": "start",
      "dominant-baseline": "central",
    },
    tspans.join(""),
  );
  return chipRects.join("") + text;
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

// ---------------------------------------------------------------------------
// Custom silhouettes — types whose live defs draw their own inline-SVG (or
// CSS) silhouette instead of an outline-module polygon. Geometry is mirrored
// from each def (the def modules are .tsx/React and cannot be imported
// here); each helper carries a pointer to its source of truth. The live
// inline SVGs draw in object-local px with the stroke centered on the path,
// so these emit the same paths translated to world coordinates.
// Anchor/overlap geometry stays bbox in both worlds — only the drawn shape
// differs from the base rounded rect.
// ---------------------------------------------------------------------------

type ShapePaint = { fill: string; border: string };
type WorldRect = { x: number; y: number; width: number; height: number };

/** Mirrors PREDEFINED_PROCESS_GEOMETRY in objects/shapes/flowchart/predefined-process.tsx. */
const PREDEFINED_PROCESS_GEOMETRY = {
  cornerRadiusPx: 5,
  barWidthPx: 4,
  barInsetRatio: 0.047,
} as const;

/** The base rounded rect of the bbox tier (CSS border-box border → half-stroke inset). */
function bboxRoundedRect(
  rect: WorldRect,
  paint: ShapePaint,
  strokeWidth: number,
  cornerRadiusPx: number,
): string {
  const inset = strokeWidth / 2;
  return tag("rect", {
    x: rect.x + inset,
    y: rect.y + inset,
    width: Math.max(0, rect.width - strokeWidth),
    height: Math.max(0, rect.height - strokeWidth),
    rx: Math.max(0, cornerRadiusPx - inset),
    fill: paint.fill,
    stroke: paint.border,
    "stroke-width": strokeWidth,
  });
}

/**
 * Rounded rect + two inner vertical bars (objects/shapes/flowchart/
 * predefined-process.tsx): border-colored 4px bars inset barInsetRatio of the
 * padding-box width from each side, spanning the padding box's height.
 */
function renderPredefinedProcessSilhouette(
  rect: WorldRect,
  paint: ShapePaint,
  strokeWidth: number,
): string {
  const innerX = rect.x + strokeWidth;
  const innerY = rect.y + strokeWidth;
  const innerWidth = Math.max(0, rect.width - strokeWidth * 2);
  const innerHeight = Math.max(0, rect.height - strokeWidth * 2);
  const barInset = innerWidth * PREDEFINED_PROCESS_GEOMETRY.barInsetRatio;
  const bar = (x: number) =>
    tag("rect", {
      x,
      y: innerY,
      width: PREDEFINED_PROCESS_GEOMETRY.barWidthPx,
      height: innerHeight,
      fill: paint.border,
    });
  return (
    bboxRoundedRect(rect, paint, strokeWidth, PREDEFINED_PROCESS_GEOMETRY.cornerRadiusPx) +
    bar(innerX + barInset) +
    bar(innerX + innerWidth - barInset - PREDEFINED_PROCESS_GEOMETRY.barWidthPx)
  );
}

/** Dispatch for the custom silhouettes; null falls through to the shared tiers. */
function renderCustomSilhouette(
  renderShape: string,
  rect: WorldRect,
  paint: ShapePaint,
  strokeWidth: number,
): string | null {
  switch (renderShape) {
    case "predefined-process":
      return renderPredefinedProcessSilhouette(rect, paint, strokeWidth);
    default:
      return null;
  }
}

/**
 * The shape body silhouette. Polygon/ellipse outline kinds stroke the true
 * outline exactly like the app's SVG silhouettes (stroke centered on the
 * path). Bbox kinds mimic the CSS border-box border by insetting the rect by
 * half the stroke width.
 */
function renderShapeBody(
  object: InteractiveCanvasObject,
  stickyShadowFilterId: string | null,
  viewBox: CanvasBounds,
): string {
  const geometry = object.geometry;
  const renderShape = effectiveRenderShape(object);
  // Rasterizer safety: filter references and nested <svg>s are only legal on
  // elements that actually intersect the viewBox (paintsInsideViewBox).
  const insideViewBox = paintsInsideViewBox(geometry, viewBox);

  // Sticky note ("note" render shape): flat square sticky fill, no border,
  // down-biased shadow (objects/sticky/def.tsx STICKY_GEOMETRY). A sticky
  // wholly outside the viewBox draws without the shadow filter.
  if (renderShape === "note") {
    const fill = resolveStickyFill(object.color ?? FIRST_USE_COLORS.sticky);
    return tag("rect", {
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      fill,
      ...(stickyShadowFilterId && insideViewBox
        ? { filter: `url(#${stickyShadowFilterId})` }
        : null),
    });
  }

  const colors = resolveShapeColors(object.color ?? FIRST_USE_COLORS.shape);
  const strokeWidth = resolveObjectStrokeWidth(object.style);

  // Icon glyph family: render the real Nucleo glyph via the pure registry
  // (objects/shapes/icon/icon-glyphs.ts), mirroring IconShapeBody.tsx.
  // Unknown/missing glyph id — or a glyph wholly outside the viewBox, whose
  // nested <svg> would be rasterizer-unsafe — falls through to the
  // neutral-rect bbox tier.
  if ((renderShape === "icon" || object.type === "icon") && insideViewBox) {
    const glyphMarkup = renderIconGlyph(object, colors.fill, colors.border);
    if (glyphMarkup !== null) return glyphMarkup;
  }

  // Custom silhouettes — types whose live defs draw inline-SVG/CSS
  // silhouettes rather than an outline-module polygon.
  const custom = renderCustomSilhouette(renderShape, geometry, colors, strokeWidth);
  if (custom !== null) return custom;

  const spec = outlineSpecFor(object);

  if (spec.kind === "ellipse") {
    return tag("ellipse", {
      cx: geometry.x + geometry.width / 2,
      cy: geometry.y + geometry.height / 2,
      rx: geometry.width / 2,
      ry: geometry.height / 2,
      fill: colors.fill,
      stroke: colors.border,
      "stroke-width": strokeWidth,
    });
  }

  if (spec.kind === "polygon") {
    const points = outlinePolygonForSpec(spec, geometry, object);
    // The arrow-shape silhouette uses round joins in the app.
    const roundJoin = object.type === "arrow-shape";
    return tag("polygon", {
      points: polygonPointsAttribute(points),
      fill: colors.fill,
      stroke: colors.border,
      "stroke-width": strokeWidth,
      ...(roundJoin ? { "stroke-linejoin": "round" } : null),
    });
  }

  // Bbox tier: the base rounded-rect trim (the CSS border paints inside the
  // box, so inset by half the stroke).
  return bboxRoundedRect(geometry, colors, strokeWidth, BASE_CORNER_RADIUS_PX);
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

function renderSectionTitleChip(section: InteractiveCanvasObject, scale = 1): string {
  if (section.text === "") return "";
  const family = resolveSectionColors(section.color ?? FIRST_USE_COLORS.section);
  const maxWidth = titleChipMaxWidthPx(section.geometry.width, scale);
  const estimated = estimateTitleChipWidthPx(section.text);
  const chipWidth = Math.min(estimated, maxWidth);
  if (chipWidth <= 0) return "";
  // The live chip counter-scales via a top-left-origin CSS transform pinned
  // at the section-corner inset (SectionTitleChip.tsx + the chip CSS in
  // objects/section/def.tsx). Mirror that exactly: at scale 1 the chip is
  // drawn in absolute world coordinates; otherwise the same natural-size
  // markup is wrapped in a translate-to-anchor + scale group.
  const anchorX = section.geometry.x + TITLE_CHIP.insetFromSectionCornerPx;
  const anchorY = section.geometry.y + TITLE_CHIP.insetFromSectionCornerPx;
  const chipX = scale === 1 ? anchorX : 0;
  const chipY = scale === 1 ? anchorY : 0;
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
  const markup = rect + text;
  if (scale === 1) return markup;
  return tag(
    "g",
    { transform: `translate(${fmt(anchorX)} ${fmt(anchorY)}) scale(${fmt(scale)})` },
    markup,
  );
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

/**
 * World-space rect of a connection's label chip: fixed 30px height and the
 * min-41px char-width heuristic, centered on the route's halfway point —
 * the same chip the stage draws (connectors/Connector.tsx). The label chip
 * does NOT counter-scale with zoom: the stage renders it at natural document
 * size at every zoom level, so every consumer of this rect (the renderer
 * itself, painted-extent cameras) treats it as fixed world geometry.
 */
export function connectionLabelChipRect(
  label: string,
  center: CanvasPoint,
): { x: number; y: number; width: number; height: number } {
  const width = Math.max(
    CONNECTION_LABEL_MIN_WIDTH_PX,
    label.length * CONNECTION_LABEL_AVERAGE_CHAR_WIDTH_PX + CONNECTION_LABEL_PADDING_X_PX * 2,
  );
  return {
    x: center.x - width / 2,
    y: center.y - CONNECTION_LABEL_HEIGHT_PX / 2,
    width,
    height: CONNECTION_LABEL_HEIGHT_PX,
  };
}

function renderConnector(
  connection: InteractiveCanvasConnection,
  objectsById: Map<string, InteractiveCanvasObject>,
  obstacles: ReadonlyArray<InteractiveCanvasObject>,
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

  // Label chip at the effective label point — the routed midpoint, or the
  // connection's `labelPosition` pin when it has one. Mirrors the stage's SVG
  // label chip (connectors/Connector.tsx), which reads the same helper.
  const label = connection.label?.trim() ? connection.label : null;
  if (label) {
    const labelPoint = labelPointFor(routed, connection);
    const chip = connectionLabelChipRect(label, labelPoint);
    const { x, y } = labelPoint;
    parts.push(
      tag("rect", {
        x: chip.x,
        y: chip.y,
        width: chip.width,
        height: chip.height,
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

/**
 * Content selection for a section-scoped crop: every connection touching the
 * included set is retained — boundary-crossing edges draw up to the crop edge
 * and are clipped by the viewBox, never dropped — and the outside endpoint
 * objects of retained connections are included too (rendered clipped), both
 * because the router needs their geometry and because a partially-visible
 * edge must aim at its true endpoint.
 *
 * `excludeEndpointId` names an object that must NOT be pulled in as a
 * boundary endpoint (the content-fit crop omits its own section frame).
 */
function sectionScopedContent(
  document: InteractiveCanvasDocument,
  includedIds: ReadonlySet<string>,
  options?: { excludeEndpointId?: string },
): { objects: InteractiveCanvasObject[]; connections: InteractiveCanvasConnection[] } {
  const connections = document.connections.filter(
    (connection) =>
      includedIds.has(connection.from.objectId) || includedIds.has(connection.to.objectId),
  );
  const retainedIds = new Set(includedIds);
  for (const connection of connections) {
    retainedIds.add(connection.from.objectId);
    retainedIds.add(connection.to.objectId);
  }
  if (options?.excludeEndpointId !== undefined && !includedIds.has(options.excludeEndpointId)) {
    retainedIds.delete(options.excludeEndpointId);
  }
  return {
    objects: document.objects.filter((object) => retainedIds.has(object.id)),
    connections,
  };
}

function selectContent(
  document: InteractiveCanvasDocument,
  options: RenderStaticSvgOptions,
): RenderContent {
  const { cropRect, sectionId, padding } = options;

  // Arbitrary-rect crop wins over sectionId (see RenderStaticSvgOptions).
  // Everything renders; the viewBox clips — same camera mechanics as the
  // section frame crop, but with caller-supplied world bounds. Padding
  // defaults to 0: the rect is authoritative.
  if (cropRect) {
    const cropPadding = padding ?? 0;
    return {
      bounds: {
        x: cropRect.x - cropPadding,
        y: cropRect.y - cropPadding,
        width: cropRect.width + cropPadding * 2,
        height: cropRect.height + cropPadding * 2,
      },
      objects: document.objects,
      connections: document.connections,
    };
  }

  if (sectionId && options.fit === "content") {
    const includedIds = sectionDescendantIds(document, sectionId);
    const members = document.objects.filter((object) => includedIds.has(object.id));
    const fitted = boundsForGeometries(
      members.map((object) => object.geometry),
      padding ?? DEFAULT_CONTENT_FIT_PADDING_PX,
    );
    if (fitted) {
      // Boundary-crossing connections are retained: the viewBox clips them at
      // the crop edge instead of dropping them. Their outside endpoint objects
      // come along (clipped) so the router draws the true route. The crop
      // section itself stays excluded — this fit deliberately omits the frame,
      // so edges attached to the frame itself have no drawable endpoint here.
      return {
        bounds: fitted,
        ...sectionScopedContent(document, includedIds, { excludeEndpointId: sectionId }),
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
      // Boundary-crossing connections are retained and visibly clipped at the
      // crop edge (see sectionScopedContent).
      return {
        bounds: sectionBounds,
        ...sectionScopedContent(document, includedIds),
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
// Entry points
// ---------------------------------------------------------------------------

/**
 * A fully-resolved render pass: explicit camera bounds plus the exact content
 * to draw. `selectContent` produces one for the option-driven entry point;
 * the named views (render/views.ts) build their own.
 */
export interface RenderScene {
  /** Camera viewBox in world coordinates. */
  bounds: CanvasBounds;
  objects: InteractiveCanvasObject[];
  connections: InteractiveCanvasConnection[];
  /**
   * The router's obstacle set. Cameras that show a slice of a larger board
   * pass the WHOLE board here so every drawn route is identical to the route
   * the full board paints — a crop is a camera, not a re-layout.
   */
  obstacles: ReadonlyArray<InteractiveCanvasObject>;
  /**
   * Effective zoom (rendered px per world px) driving the section title
   * chips' counter-scale — the same titleChipScale curve the live stage
   * applies. Connection label chips never scale (the stage draws them at
   * natural size at every zoom).
   */
  chipZoom: number;
}

/** Renders a fully-resolved scene. Shared core of every SVG entry point. */
export function renderSceneToSvg(
  document: InteractiveCanvasDocument,
  scene: RenderScene,
  options: Pick<RenderStaticSvgOptions, "width" | "height" | "background"> = {},
): RenderedSvg {
  const { bounds } = scene;
  const { width, height } = resolvePixelSize(bounds, options);
  const chipScale = titleChipScale(scene.chipZoom);

  // The stage's five-tier layer cake, minus interactive tiers: section
  // backdrops → connectors → non-section objects → section title chips.
  const ordered = paintOrderedObjects(scene.objects);
  const sections = ordered.filter((object) => object.type === "section");
  const nonSections = ordered.filter((object) => object.type !== "section");
  const objectsById = new Map(scene.objects.map((object) => [object.id, object]));

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
  for (const connection of scene.connections) {
    parts.push(renderConnector(connection, objectsById, scene.obstacles));
  }
  for (const object of nonSections) {
    parts.push(renderShapeBody(object, stickyShadowFilterId, bounds));
    parts.push(renderObjectText(object));
  }
  for (const section of sections) parts.push(renderSectionTitleChip(section, chipScale));

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="${fmt(bounds.x)} ${fmt(bounds.y)} ${fmt(Math.max(1, bounds.width))} ${fmt(
      Math.max(1, bounds.height),
    )}" preserveAspectRatio="xMidYMid meet" font-family="${escapeXml(CANVAS_FONT_FAMILY)}">` +
    parts.filter((part) => part !== "").join("") +
    `</svg>`;

  return { svg, width, height };
}

export const renderDocumentToSvg: RenderDocumentToSvg = (
  document: InteractiveCanvasDocument,
  options: RenderStaticSvgOptions = {},
): RenderedSvg => {
  const content = selectContent(document, options);
  return renderSceneToSvg(
    document,
    // Option-driven renders route against the selected content only and draw
    // title chips at their natural document size (chip scale 1).
    { ...content, obstacles: content.objects, chipZoom: 1 },
    options,
  );
};
