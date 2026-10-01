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
 * (predefined-process) draw the same silhouette geometry here. Icon objects
 * render their real glyph from the style's icon pack via the pure registry
 * (objects/shapes/icon/icon-glyphs.ts) — bare or on a tile
 * (objects/shapes/icon/icon-tile.ts) — falling back to a neutral rounded
 * rect only for unknown glyph ids. Detail lines (one muted line under a
 * shape's or icon's name) measure IBM Plex Mono at its fixed advance, or
 * Inter's table, for their ellipsis. Known approximations:
 * measurement ignores kerning/ligatures (marginally conservative), and the
 * section title chip and connection label chip size themselves through the
 * shared geometry the live stage uses (objects/section/title-chip-layout.ts,
 * connectors/label-chip.ts): exact cells for IBM Plex Mono, the char-count
 * heuristics for Inter — those ARE the live stage's own sizing rules (a
 * title chip carrying an icon or a detail measures its Inter runs exactly).
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
import { connectorDashArray } from "../connectors/def";
import {
  resolveConnectorPaint,
  resolveIconPaint,
  resolveIconTilePaint,
  resolveSectionPaint,
  resolveShapePaint,
  resolveStickyPaint,
  type IconTilePaint,
  type SectionPaint,
} from "../theme/palette";
import { sectionDepthMap } from "../state/section-depth";
import {
  titleChipHasContent,
  titleChipIconDrawing,
  titleChipLayout,
  titleChipVisibleRuns,
  type TitleChipFont,
  type TitleChipIconDrawing,
  type TitleChipLayout,
} from "../objects/section/title-chip-layout";
import {
  CONNECTION_LABEL_CHIP,
  connectionLabelChipMetrics,
  connectionLabelChipRect as labelChipRect,
} from "../connectors/label-chip";
import { FIRST_USE_COLORS } from "../state/schema/object-defaults";
import { resolveObjectStrokeWidth, resolveShapeCornerRadius } from "../theme/tokens";
import { DEFAULT_CANVAS_STYLE, normalizeCanvasStyle, type CanvasStyle } from "../theme/canvas-style";
import { CANVAS_MONO_FONT_STACK_SVG, CANVAS_SANS_FONT_STACK_SVG } from "../theme/fonts";
import {
  BELOW_TEXT_SLOT,
  CENTER_TEXT_SLOT,
  CENTER_TEXT_INSET_PX,
  INSET_BODY_TEXT_SLOT,
  iconTileRectPx,
  rectTextSlot,
  resolveTextSlot,
  slotLineHeightPx,
  slotNameLineCapacity,
  type DetailTypography,
  type LocalRect,
  type ResolvedSlotDetail,
  type SlotTypography,
  type TextSlot,
} from "../objects/text-slots";
import {
  resolveIconGlyph,
  type IconGlyphDefinition,
  type IconGlyphElement,
} from "../objects/shapes/icon/icon-glyphs";
import {
  ICON_TILE,
  glyphHasClosedInterior,
  iconBareGlyphStrokeWidth,
  iconTileGlyphStrokeWidth,
  iconTileLayout,
} from "../objects/shapes/icon/icon-tile";
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../state/schema";
import { STICKY_MARKDOWN_MONO_FONT } from "../objects/sticky/markdown-editing";
import { interCharWidthPx, measureInterTextPx, measureMonoTextPx } from "./text-metrics";
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

/**
 * Canvas content font — the stage's stack from theme/fonts.ts, in its
 * SVG-attribute form (quotes dropped: multi-word family names are valid
 * unquoted CSS idents, which keeps the attribute free of escaped quote noise).
 */
const CANVAS_FONT_FAMILY = CANVAS_SANS_FONT_STACK_SVG;

// The board color, corner radii and border/stroke widths (base rounded rect,
// section frame, title chip, connector line, label chip, elbow bends), the
// section/sticky/connector paints, and the label chip's font are NOT mirrored
// here: they come from the scene's CanvasStyle (theme/canvas-style.ts) — the
// same settings object the live stage resolves through useCanvasStyle — and
// the shared pure geometry modules (objects/section/title-chip-layout.ts,
// connectors/label-chip.ts) the live renderers read too.

/** Arrowhead geometry in stroke-width units — mirrors the marker `<defs>` in stage/CanvasStage.tsx. */
const ARROW_LENGTH_RATIO = 5;
const ARROW_WIDTH_RATIO = 5;
/** The marker's refX is (length - 0.5): the tip overshoots the path end by half a stroke width. */
const ARROW_TIP_OVERSHOOT_RATIO = 0.5;

/** Sticky shadow — mirrors STICKY_GEOMETRY.shadow ("0 3px 12px rgba(0,0,0,0.15)") in objects/sticky/def.tsx. */
const STICKY_SHADOW = { dx: 0, dy: 3, stdDeviation: 6, opacity: 0.15 } as const;

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
 * Width of a detail-line run at its font's real advances: IBM Plex Mono's
 * fixed cell (measureMonoTextPx) or Inter's per-glyph table.
 */
export function measureDetailTextPx(text: string, typography: DetailTypography): number {
  return typography.font === "mono"
    ? measureMonoTextPx(text, typography.fontSizePx)
    : measureInterTextPx(text, typography.fontSizePx, typography.fontWeight);
}

/** Float slack for detail-line fit checks (far below any glyph advance). */
const DETAIL_FIT_EPSILON_PX = 1e-6;

/**
 * The detail line as painted at `widthPx` (mirrors the live line's
 * `text-overflow: ellipsis`): unchanged when it fits; otherwise the longest
 * prefix that fits WITH a trailing ellipsis, trailing whitespace dropped.
 * Exported (deep-import, like wrapTextLines / clampLines) so the agent's
 * text-fit asks the renderer whether a detail is cut.
 */
export function ellipsizeDetailText(text: string, widthPx: number, typography: DetailTypography): string {
  // Summed advances carry float error (ten 8.4px mono cells add up to
  // 84.00000000000001), so a run that fits exactly must not lose a cell.
  const fitWidthPx = widthPx + DETAIL_FIT_EPSILON_PX;
  if (measureDetailTextPx(text, typography) <= fitWidthPx) return text;
  const ellipsisWidth = measureDetailTextPx("…", typography);
  const chars = [...text];
  let used = 0;
  let kept = 0;
  for (const char of chars) {
    const charWidth = measureDetailTextPx(char, typography);
    if (used + charWidth + ellipsisWidth > fitWidthPx) break;
    used += charWidth;
    kept += 1;
  }
  return `${chars.slice(0, kept).join("").replace(/\s+$/, "")}…`;
}

/** One detail line as a `<text>`, centered vertically on `centerY` (world coordinates). */
function renderDetailLine(
  detail: ResolvedSlotDetail,
  widthPx: number,
  x: number,
  centerY: number,
  anchor: "middle" | "start",
): string {
  const { typography } = detail;
  return tag(
    "text",
    {
      x,
      y: centerY,
      fill: typography.color,
      "font-size": typography.fontSizePx,
      "font-weight": typography.fontWeight,
      "text-anchor": anchor,
      "dominant-baseline": "central",
      // The root <svg> already carries the sans stack.
      ...(typography.font === "mono" ? { "font-family": CANVAS_MONO_FONT_STACK_SVG } : null),
    },
    escapeXml(ellipsizeDetailText(detail.text, widthPx, typography)),
  );
}

/**
 * Renders wrapped slot text as a `<text>` with one `<tspan>` per line, plus
 * the slot's detail line (its own `<text>`) when `options.detail` is set:
 * the name block and the detail line lay out as ONE block anchored by
 * `verticalAlign` (mirroring the live flex column), the name's clamp gives up
 * the detail line's reserve, and the detail ellipsizes at the slot width.
 * `rect` is in world coordinates.
 */
function renderSlotTextBlock(
  text: string,
  rect: { x: number; y: number; width: number; height: number },
  typography: SlotTypography,
  verticalAlign: "top" | "center" | "bottom",
  options?: { clampToRect?: boolean; detail?: ResolvedSlotDetail | null },
): string {
  const detail = options?.detail ?? null;
  if ((text === "" && !detail) || rect.width <= 0) return "";
  const lineHeight = slotLineHeightPx(typography);
  let lines = text === "" ? [] : wrapTextLines(text, rect.width, typography.fontSizePx, typography.fontWeight);
  if (lines.length === 0 && !detail) return "";
  if (options?.clampToRect !== false && rect.height > 0) {
    // slotNameLineCapacity: the detail line's reserve comes off the name's lines.
    const reserve = detail ? detail.gapPx + detail.typography.lineHeightPx : 0;
    const maxLines = Math.max(1, Math.floor((rect.height - reserve) / lineHeight));
    lines = clampLines(lines, maxLines, rect.width, typography.fontSizePx, typography.fontWeight);
  }

  const detailHeight = detail
    ? (lines.length > 0 ? detail.gapPx : 0) + detail.typography.lineHeightPx
    : 0;
  const blockHeight = lines.length * lineHeight + detailHeight;
  let top: number;
  if (verticalAlign === "top") {
    top = rect.y;
  } else if (verticalAlign === "bottom") {
    top = rect.y + rect.height - blockHeight;
  } else {
    top = rect.y + (rect.height - blockHeight) / 2;
  }
  const firstLineCenterY = top + lineHeight / 2;

  const anchor = typography.textAlign === "center" ? "middle" : "start";
  const x = typography.textAlign === "center" ? rect.x + rect.width / 2 : rect.x;

  const tspans = lines
    .map((line, index) =>
      line === ""
        ? ""
        : tag("tspan", { x, y: firstLineCenterY + index * lineHeight }, escapeXml(line)),
    )
    .join("");

  const name =
    tspans === ""
      ? ""
      : tag(
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
  if (!detail) return name;
  const detailCenterY = top + blockHeight - detail.typography.lineHeightPx / 2;
  return name + renderDetailLine(detail, rect.width, x, detailCenterY, anchor);
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

/**
 * An object's slot text under `canvasStyle`: the name in the style's name
 * color/weight, plus its detail line (resolveTextSlot decides whether one
 * paints — never for stickies, which render their markdown body).
 */
function renderObjectText(object: InteractiveCanvasObject, canvasStyle: CanvasStyle): string {
  // Sticky notes render their text as markdown line boxes, not plain slot text.
  if (effectiveRenderShape(object) === "note") {
    return object.text === "" ? "" : renderStickyMarkdownText(object, canvasStyle);
  }
  const slot = textSlotForObject(object);
  if (!slot) return "";
  const resolved = resolveTextSlot(slot, object, 1, { canvasStyle });
  if (resolved.hidden) return "";
  if (object.text === "" && !resolved.detail) return "";
  const worldRect = {
    x: object.geometry.x + resolved.rect.x,
    y: object.geometry.y + resolved.rect.y,
    width: resolved.rect.width,
    height: resolved.rect.height,
  };
  // The "below" band renders every wrapped line (it sizes itself to the text)
  // rather than clamping to the glyph box; its detail line follows the name.
  const clampToRect = resolved.multiline && slot.placement !== "below";
  return renderSlotTextBlock(object.text, worldRect, resolved.typography, resolved.verticalAlign, {
    clampToRect,
    detail: resolved.detail,
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

/**
 * Code chip visuals — mirrors the inline `<code>` CSS in objects/sticky/
 * markdown.tsx: black at 8% on a paper sticky, the text color at 8% on a card
 * (objects/sticky/def.tsx CARD_STICKY_GEOMETRY.codeChipAlpha).
 */
const STICKY_CODE_CHIP_FILL_OPACITY = 0.08;
/** Card sticky edges — mirror objects/sticky/def.tsx CARD_STICKY_GEOMETRY (React; not importable here). */
const CARD_STICKY_RULE_WIDTH_PX = 2;
const CARD_STICKY_BORDER_WIDTH_PX = 1;

/**
 * The sticky note body under the style's sticky paint (theme/palette.ts
 * resolveStickyPaint), mirroring objects/sticky/def.tsx. `paper`: the flat
 * square sticky fill with the down-biased shadow (objects/sticky/def.tsx
 * STICKY_GEOMETRY) — drawn without the filter when wholly outside the
 * viewBox. `card`: the card fill, a hairline edge, and a 2px ink rule down
 * the left side (the live inset box-shadows: inside the box, rule on top),
 * no shadow.
 */
function renderStickyBody(
  object: InteractiveCanvasObject,
  stickyShadowFilterId: string | null,
  insideViewBox: boolean,
  canvasStyle: CanvasStyle,
): string {
  const { geometry } = object;
  const paint = resolveStickyPaint(object.color ?? FIRST_USE_COLORS.sticky, canvasStyle);
  if (paint.shadow) {
    return tag("rect", {
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      fill: paint.fill,
      ...(stickyShadowFilterId && insideViewBox
        ? { filter: `url(#${stickyShadowFilterId})` }
        : null),
    });
  }
  const parts = [
    tag("rect", {
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      fill: paint.fill,
    }),
  ];
  if (paint.border) {
    const inset = CARD_STICKY_BORDER_WIDTH_PX / 2;
    parts.push(
      tag("rect", {
        x: geometry.x + inset,
        y: geometry.y + inset,
        width: Math.max(0, geometry.width - CARD_STICKY_BORDER_WIDTH_PX),
        height: Math.max(0, geometry.height - CARD_STICKY_BORDER_WIDTH_PX),
        fill: "none",
        stroke: paint.border,
        "stroke-width": CARD_STICKY_BORDER_WIDTH_PX,
      }),
    );
  }
  if (paint.rule) {
    parts.push(
      tag("rect", {
        x: geometry.x,
        y: geometry.y,
        width: Math.min(CARD_STICKY_RULE_WIDTH_PX, geometry.width),
        height: geometry.height,
        fill: paint.rule,
      }),
    );
  }
  return parts.join("");
}
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
function renderStickyMarkdownText(object: InteractiveCanvasObject, canvasStyle: CanvasStyle): string {
  // The slot typography carries the sticky paint's text color.
  const resolved = resolveTextSlot(INSET_BODY_TEXT_SLOT, object, 1, { canvasStyle });
  const codeChipFill = resolveStickyPaint(object.color ?? FIRST_USE_COLORS.sticky, canvasStyle).shadow
    ? "#000000"
    : resolved.typography.color;
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
            fill: codeChipFill,
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

/** Paint attributes of a glyph `<svg>`: outline glyphs stroke, fill-paint (brand) glyphs fill — both in `color`. */
function glyphPaintAttributes(
  glyph: IconGlyphDefinition,
  color: string,
  strokeWidth: number,
): Record<string, string | number> {
  if (glyph.paint === "fill") return { fill: color, stroke: "none" };
  return {
    fill: "none",
    stroke: color,
    "stroke-width": strokeWidth,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  };
}

/**
 * The real icon glyph for `object.icon` in the style's icon pack
 * (resolveIconGlyph), painted per resolveIconTilePaint the way IconShapeBody
 * paints it:
 *  - glyph style: a NESTED `<svg>` filling the object's bbox — the nested
 *    viewBox keeps stroke widths in viewBox units (exactly how the live body
 *    scales them) and the default-equivalent preserveAspectRatio="xMidYMid
 *    meet" centers the square glyph in a non-square bbox. Outline glyphs
 *    stroke the ink with the shape fill in their closed interiors (SVG
 *    chord-closes open paths, so all-open line art gets no fill layer);
 *    fill-paint (brand) glyphs fill with the ink.
 *  - tile style: renderIconTile.
 * Returns null for an unknown/missing glyph id (caller falls back to the
 * neutral rect).
 */
function renderIconGlyph(
  object: InteractiveCanvasObject,
  viewBox: CanvasBounds,
  canvasStyle: CanvasStyle,
): string | null {
  const glyph = resolveIconGlyph(object.icon, canvasStyle.iconPack);
  if (!glyph) return null;
  const { geometry } = object;
  const sizePx = Math.min(geometry.width, geometry.height);
  const tileSidePx = iconTileRectPx(geometry.width, geometry.height, canvasStyle.iconTileMaxPx).width;
  const paint = resolveIconTilePaint(object.color ?? FIRST_USE_COLORS.shape, canvasStyle, tileSidePx);
  if (paint.tileFill !== null) {
    return renderIconTile(object, glyph, paint, viewBox, canvasStyle.iconTileMaxPx);
  }

  const fill = paint.glyphFill;
  const shouldRenderFillLayer = Boolean(fill && glyph.paint !== "fill" && glyphHasClosedInterior(glyph));
  const fillLayer = shouldRenderFillLayer
    ? tag(
        "g",
        { fill: fill ?? undefined, stroke: "none" },
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
      ...glyphPaintAttributes(glyph, paint.glyph, iconBareGlyphStrokeWidth(sizePx, glyph)),
    },
    fillLayer + inkLayer,
  );
}

/**
 * Tile style (objects/shapes/icon/icon-tile.ts): the rounded tile in the
 * glyph box — min(width, height, iconTileMaxPx), centered — painted per
 * resolveIconTilePaint (solid ink, or a light tint with an ink border for a
 * large icon; borders drawn inside the tile edge), then the glyph in a nested
 * `<svg>` centered on it. The nested glyph viewport is emitted only when it
 * intersects the camera viewBox (rasterizer safety, see paintsInsideViewBox):
 * a crop that shows only a tile's rim draws the tile alone.
 */
function renderIconTile(
  object: InteractiveCanvasObject,
  glyph: IconGlyphDefinition,
  paint: IconTilePaint,
  viewBox: CanvasBounds,
  tileMaxPx: number,
): string {
  const { geometry } = object;
  const layout = iconTileLayout(geometry.width, geometry.height, tileMaxPx);
  const border = paint.tileBorder ? paint.tileBorderWidthPx : 0;
  const tile = tag("rect", {
    x: geometry.x + layout.tile.x + border / 2,
    y: geometry.y + layout.tile.y + border / 2,
    width: Math.max(0, layout.tile.width - border),
    height: Math.max(0, layout.tile.height - border),
    rx: Math.max(0, ICON_TILE.cornerRadiusPx - border / 2),
    fill: paint.tileFill ?? undefined,
    ...(paint.tileBorder ? { stroke: paint.tileBorder, "stroke-width": border } : null),
  });
  const glyphRect = {
    x: geometry.x + layout.glyph.x,
    y: geometry.y + layout.glyph.y,
    width: layout.glyph.width,
    height: layout.glyph.height,
  };
  if (!paintsInsideViewBox(glyphRect, viewBox)) return tile;
  return (
    tile +
    tag(
      "svg",
      {
        ...glyphRect,
        viewBox: `0 0 ${fmt(glyph.viewBoxSize)} ${fmt(glyph.viewBoxSize)}`,
        preserveAspectRatio: "xMidYMid meet",
        ...glyphPaintAttributes(glyph, paint.glyph, iconTileGlyphStrokeWidth(glyph.viewBoxSize)),
      },
      tag("g", {}, glyph.elements.map(glyphElementMarkup).join("")),
    )
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

/**
 * Mirrors PREDEFINED_PROCESS_GEOMETRY in objects/shapes/flowchart/predefined-process.tsx
 * (its corner radius is the canvas style's shape radius, like every bbox shape).
 */
const PREDEFINED_PROCESS_GEOMETRY = {
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
  cornerRadiusPx: number,
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
    bboxRoundedRect(rect, paint, strokeWidth, cornerRadiusPx) +
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
  canvasStyle: CanvasStyle,
): string | null {
  switch (renderShape) {
    case "predefined-process":
      return renderPredefinedProcessSilhouette(rect, paint, strokeWidth, canvasStyle.shapeCornerRadiusPx);
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
  canvasStyle: CanvasStyle,
): string {
  const geometry = object.geometry;
  const renderShape = effectiveRenderShape(object);
  // Rasterizer safety: filter references and nested <svg>s are only legal on
  // elements that actually intersect the viewBox (paintsInsideViewBox).
  const insideViewBox = paintsInsideViewBox(geometry, viewBox);

  // Sticky note ("note" render shape): the sticky paint's body (renderStickyBody).
  if (renderShape === "note") {
    return renderStickyBody(object, stickyShadowFilterId, insideViewBox, canvasStyle);
  }

  // The style's shape fill mode: `tint` (pastel fill + ink border) or `card`
  // (card fill + ink border) — theme/palette.ts resolveShapePaint.
  const colors = resolveShapePaint(object.color ?? FIRST_USE_COLORS.shape, canvasStyle);
  const strokeWidth = resolveObjectStrokeWidth(object.style, canvasStyle);

  // Icon glyph family: render the real glyph from the style's icon pack via
  // the pure registry (objects/shapes/icon/icon-glyphs.ts), bare or on a tile,
  // mirroring IconShapeBody.tsx. Unknown/missing glyph id — or a glyph wholly
  // outside the viewBox, whose nested <svg> would be rasterizer-unsafe —
  // falls through to the neutral-rect bbox tier.
  if ((renderShape === "icon" || object.type === "icon") && insideViewBox) {
    const glyphMarkup = renderIconGlyph(object, viewBox, canvasStyle);
    if (glyphMarkup !== null) return glyphMarkup;
  }

  // Custom silhouettes — types whose live defs draw inline-SVG/CSS
  // silhouettes rather than an outline-module polygon.
  const custom = renderCustomSilhouette(renderShape, geometry, colors, strokeWidth, canvasStyle);
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
  return bboxRoundedRect(geometry, colors, strokeWidth, resolveShapeCornerRadius(renderShape, canvasStyle));
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/**
 * A section's body + frame under the style's section paint at its nesting
 * depth (theme/palette.ts resolveSectionPaint): figjam's flat wash framed in
 * the title chip's fill color, or the opaque layer-cake tint framed in the
 * ink — mirroring objects/section/def.tsx.
 */
function renderSectionBackdrop(
  section: InteractiveCanvasObject,
  depth: number,
  canvasStyle: CanvasStyle,
): string {
  const paint = resolveSectionPaint(section.color ?? FIRST_USE_COLORS.section, depth, canvasStyle);
  const geometry = section.geometry;
  const borderStyle = section.style?.strokeStyle ?? "solid";
  const strokeWidth = section.style?.strokeWidth ?? canvasStyle.sectionBorderWidthPx;
  const inset = strokeWidth / 2;

  if (borderStyle === "none") {
    return tag("rect", {
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      rx: canvasStyle.sectionCornerRadiusPx,
      fill: paint.fill,
    });
  }

  return tag("rect", {
    x: geometry.x + inset,
    y: geometry.y + inset,
    width: Math.max(0, geometry.width - strokeWidth),
    height: Math.max(0, geometry.height - strokeWidth),
    rx: canvasStyle.sectionCornerRadiusPx,
    fill: paint.fill,
    // figjam: the section border IS the title chip's fill color (§3.2).
    stroke: paint.border,
    "stroke-width": strokeWidth,
    ...(borderStyle === "dashed"
      ? { "stroke-dasharray": connectorDashArray(canvasStyle) }
      : null),
  });
}

/** A scale factor with enough precision for glyph transforms (fmt keeps 2 decimals). */
function fmtScale(value: number): string {
  return String(Math.round(value * 1e4) / 1e4);
}

/**
 * The header icon (objects/section/title-chip-layout.ts titleChipIconDrawing
 * — the same primitives SectionTitleChip.tsx draws): the tile, then the
 * glyph scaled into its box. A transformed group, not a nested <svg>, so it
 * is rasterizer-safe wherever the camera crops.
 */
function renderTitleChipIcon(drawing: TitleChipIconDrawing, x: number, y: number): string {
  const parts: string[] = [];
  const { tile, glyph } = drawing;
  if (tile) {
    const inset = tile.border ? tile.borderWidthPx / 2 : 0;
    parts.push(
      tag("rect", {
        x: x + inset,
        y: y + inset,
        width: drawing.sizePx - inset * 2,
        height: drawing.sizePx - inset * 2,
        rx: Math.max(0, tile.radiusPx - inset),
        fill: tile.fill,
        ...(tile.border ? { stroke: tile.border, "stroke-width": tile.borderWidthPx } : null),
      }),
    );
  }
  const stroked = glyph.paint === "stroke";
  parts.push(
    tag(
      "g",
      {
        transform: `translate(${fmt(x + glyph.offsetPx)} ${fmt(y + glyph.offsetPx)}) scale(${fmtScale(
          glyph.sizePx / glyph.viewBoxSize,
        )})`,
        fill: stroked ? "none" : glyph.color,
        stroke: stroked ? glyph.color : "none",
        "stroke-width": stroked ? fmtScale(glyph.strokeWidth) : undefined,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      },
      glyph.elements.map(glyphElementMarkup).join(""),
    ),
  );
  return parts.join("");
}

/** A chip text run's `<text>` attributes (the header font; tracking in px). */
function titleChipTextAttributes(font: TitleChipFont, x: number, y: number, fill: string) {
  return {
    x,
    y,
    fill,
    "font-size": font.fontSizePx,
    "font-weight": font.fontWeight,
    "text-anchor": "start",
    "dominant-baseline": "central",
    ...(font.font === "mono" ? { "font-family": CANVAS_MONO_FONT_STACK_SVG } : null),
    ...(font.letterSpacingEm !== 0 ? { "letter-spacing": font.letterSpacingEm * font.fontSizePx } : null),
  };
}

/**
 * The chip body. Floating: one rounded rect, the border stroked on its
 * centerline inside the box (CSS border-box). Pinned: the box fill — its
 * top-left corner following the frame's inner curve — plus only the right and
 * bottom edges (the section frame is its top and left edge), stroked inside
 * the box like a CSS border.
 */
function renderTitleChipBody(layout: TitleChipLayout, paint: SectionPaint, x: number, y: number): string {
  const { box, border, radius } = layout;
  if (layout.placement === "floating") {
    const borderWidthPx = border.top;
    const borderInset = borderWidthPx / 2;
    return tag("rect", {
      x: x + borderInset,
      y: y + borderInset,
      width: Math.max(0, box.width - borderWidthPx),
      height: box.height - borderWidthPx,
      rx: radius.topLeft,
      fill: paint.chipFill,
      stroke: paint.chipBorder,
      "stroke-width": borderWidthPx,
    });
  }
  const w = box.width;
  const h = box.height;
  const tl = Math.min(radius.topLeft, w / 2, h / 2);
  const br = Math.min(radius.bottomRight, w / 2, h / 2);
  const arc = (r: number, toX: number, toY: number) =>
    r > 0 ? `A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(toX)} ${fmt(toY)}` : "";
  const fillPath =
    `M${fmt(x + tl)} ${fmt(y)}H${fmt(x + w)}V${fmt(y + h - br)}${arc(br, x + w - br, y + h)}` +
    `H${fmt(x)}V${fmt(y + tl)}${arc(tl, x + tl, y)}Z`;
  const edge = border.right;
  const parts = [tag("path", { d: fillPath, fill: paint.chipFill })];
  if (edge > 0) {
    const right = x + w - edge / 2;
    const bottom = y + h - edge / 2;
    const bend = Math.max(0, br - edge / 2);
    parts.push(
      tag("path", {
        d: `M${fmt(right)} ${fmt(y)}V${fmt(bottom - bend)}${arc(bend, right - bend, bottom)}H${fmt(x)}`,
        fill: "none",
        stroke: paint.chipBorder,
        "stroke-width": edge,
      }),
    );
  }
  return parts.join("");
}

/**
 * A section's title chip — `[icon] TITLE  detail` from the shared layout
 * (objects/section/title-chip-layout.ts) and the section paint at its depth:
 * floating (inset) or pinned (flush in the corner), ellipsized the way the
 * live chip's text-overflow cuts the run.
 */
function renderSectionTitleChip(
  section: InteractiveCanvasObject,
  depth: number,
  zoom: number,
  canvasStyle: CanvasStyle,
  clipId: string,
  viewBox: CanvasBounds,
): string {
  // The shared layout measures a chip carrying an icon or a detail on real
  // Inter advances (the box hit-testing and text-fit use too); a plain title
  // keeps the original char-count estimate (unchanged output).
  if (!titleChipHasContent(section, canvasStyle)) return "";
  const layout = titleChipLayout(section, canvasStyle, zoom);
  const { box, scale } = layout;
  if (box.width <= 0) return "";
  const paint = resolveSectionPaint(section.color ?? FIRST_USE_COLORS.section, depth, canvasStyle);
  // The live chip counter-scales via a top-left-origin CSS transform pinned
  // at its anchor (SectionTitleChip.tsx + the chip CSS in
  // objects/section/def.tsx). Mirror that exactly: at scale 1 the chip is
  // drawn in absolute world coordinates; otherwise the same natural-size
  // markup is wrapped in a translate-to-anchor + scale group.
  const anchorX = section.geometry.x + box.x;
  const anchorY = section.geometry.y + box.y;
  const chipX = scale === 1 ? anchorX : 0;
  const chipY = scale === 1 ? anchorY : 0;

  const body = renderTitleChipBody(layout, paint, chipX, chipY);
  const parts: string[] = [];
  // The live chip clips its contents at its padding box (overflow: hidden).
  // Ellipsized runs always fit it; only an icon wider than a tight chip's
  // room overflows — then the contents paint through a clip to that box.
  const clipRight = box.width - layout.border.right;
  const clipBottom = box.height - layout.border.bottom;
  let clipped = false;
  if (layout.icon) {
    const drawing = titleChipIconDrawing(layout.icon.id, paint, canvasStyle);
    if (drawing) {
      clipped = layout.icon.x + drawing.sizePx > clipRight;
      parts.push(
        renderTitleChipIcon(drawing, chipX + layout.icon.x, chipY + layout.centerY - drawing.sizePx / 2),
      );
    }
  }
  const runs = titleChipVisibleRuns(layout);
  if (runs.title !== "") {
    parts.push(
      tag(
        "text",
        titleChipTextAttributes(layout.title.font, chipX + layout.title.x, chipY + layout.centerY, paint.headerText),
        escapeXml(runs.title),
      ),
    );
  }
  if (layout.detail && runs.detail !== null) {
    parts.push(
      tag(
        "text",
        titleChipTextAttributes(
          layout.detail.font,
          chipX + layout.detail.x,
          chipY + layout.centerY,
          paint.headerDetail,
        ),
        escapeXml(runs.detail),
      ),
    );
  }
  let contents = parts.join("");
  if (clipped && contents !== "") {
    // Clip paths stay off chips the camera does not show (the rasterizer
    // guard's viewport rule, as for filters and nested viewports).
    const world = {
      x: anchorX + layout.border.left * scale,
      y: anchorY + layout.border.top * scale,
      width: (clipRight - layout.border.left) * scale,
      height: (clipBottom - layout.border.top) * scale,
    };
    if (paintsInsideViewBox(world, viewBox)) {
      contents =
        `<clipPath id="${escapeXml(clipId)}">` +
        tag("rect", {
          x: chipX + layout.border.left,
          y: chipY + layout.border.top,
          width: Math.max(0, clipRight - layout.border.left),
          height: Math.max(0, clipBottom - layout.border.top),
        }) +
        `</clipPath>` +
        tag("g", { "clip-path": `url(#${clipId})` }, contents);
    } else {
      contents = "";
    }
  }
  const markup = body + contents;
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
 * World-space rect of a connection's label chip: the shared chip geometry
 * (connectors/label-chip.ts — the chip the stage draws in
 * connectors/Connector.tsx) under `canvasStyle`, centered on the route's
 * label point. The label chip does NOT counter-scale with zoom: the stage
 * renders it at natural document size at every zoom level, so every
 * consumer of this rect (the renderer itself, painted-extent cameras, the
 * agent lints) treats it as fixed world geometry. Its height and font are
 * style tokens, so pass the board's style (default: DEFAULT_CANVAS_STYLE, schematic-light).
 */
export function connectionLabelChipRect(
  label: string,
  center: CanvasPoint,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): { x: number; y: number; width: number; height: number } {
  return labelChipRect(label, center, canvasStyle);
}

function renderConnector(
  connection: InteractiveCanvasConnection,
  objectsById: Map<string, InteractiveCanvasObject>,
  obstacles: ReadonlyArray<InteractiveCanvasObject>,
  canvasStyle: CanvasStyle,
): string {
  const fromObject = objectsById.get(connection.from.objectId);
  const toObject = objectsById.get(connection.to.objectId);
  if (!fromObject || !toObject) return "";

  const routed = routeConnection(fromObject, toObject, connection, obstacles, canvasStyle);
  const strokeWidth = canvasStyle.connectorStrokeWidthPx;
  const stroke = resolveConnectorPaint(connection.color ?? FIRST_USE_COLORS.connector, canvasStyle).stroke;
  const dashed = connection.style === "dashed";

  const parts: string[] = [
    tag("path", {
      d: routed.path,
      fill: "none",
      stroke,
      "stroke-width": strokeWidth,
      "stroke-linecap": "butt",
      ...(dashed ? { "stroke-dasharray": connectorDashArray(canvasStyle) } : null),
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
        arrowheadPolygon(renderedEndpoint(last, beforeLast), beforeLast, strokeWidth, stroke),
      );
    }
    if (arrow === "back" || arrow === "both") {
      parts.push(
        arrowheadPolygon(renderedEndpoint(first, second), second, strokeWidth, stroke),
      );
    }
  }

  // Label chip at the effective label point — the routed midpoint, or the
  // connection's `labelPosition` pin when it has one. Mirrors the stage's SVG
  // label chip (connectors/Connector.tsx), which reads the same helper.
  const label = connection.label?.trim() ? connection.label : null;
  if (label) {
    const labelPoint = labelPointFor(routed, connection);
    const chip = connectionLabelChipRect(label, labelPoint, canvasStyle);
    const metrics = connectionLabelChipMetrics(label, canvasStyle);
    const { x, y } = labelPoint;
    parts.push(
      tag("rect", {
        x: chip.x,
        y: chip.y,
        width: chip.width,
        height: chip.height,
        rx: canvasStyle.labelChipCornerRadiusPx,
        fill: canvasStyle.connectorLabelBackground,
        stroke: canvasStyle.hairlineColor,
        "stroke-width": CONNECTION_LABEL_CHIP.borderWidthPx,
      }),
      tag(
        "text",
        {
          x,
          y,
          fill: canvasStyle.connectorLabelTextColor,
          "font-size": metrics.fontSizePx,
          "font-weight": metrics.fontWeight,
          "text-anchor": "middle",
          "dominant-baseline": "central",
          ...(metrics.font === "mono" ? { "font-family": CANVAS_MONO_FONT_STACK_SVG } : null),
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
  options: Pick<RenderStaticSvgOptions, "width" | "height" | "background" | "canvasStyle"> = {},
): RenderedSvg {
  const { bounds } = scene;
  const canvasStyle = normalizeCanvasStyle(options.canvasStyle);
  const { width, height } = resolvePixelSize(bounds, options);
  // Section nesting depth over the WHOLE document (a cropped scene still
  // paints each section at its true depth) — the layer-cake fill deepens
  // with it.
  const sectionDepths = sectionDepthMap(document.objects);

  // The stage's five-tier layer cake, minus interactive tiers: section
  // backdrops → connectors → non-section objects → section title chips.
  const ordered = paintOrderedObjects(scene.objects);
  const sections = ordered.filter((object) => object.type === "section");
  const nonSections = ordered.filter((object) => object.type !== "section");
  const objectsById = new Map(scene.objects.map((object) => [object.id, object]));

  // Only paper stickies cast the shadow (card stickies have none).
  const hasShadowSticky = nonSections.some(
    (object) =>
      effectiveRenderShape(object) === "note" &&
      resolveStickyPaint(object.color ?? FIRST_USE_COLORS.sticky, canvasStyle).shadow,
  );
  const stickyShadowFilterId = hasShadowSticky ? `${idSlug(document.id)}-sticky-shadow` : null;

  const parts: string[] = [];

  if (stickyShadowFilterId) {
    parts.push(
      `<defs><filter id="${escapeXml(stickyShadowFilterId)}" x="-20%" y="-20%" width="140%" height="140%">` +
        `<feDropShadow dx="${fmt(STICKY_SHADOW.dx)}" dy="${fmt(STICKY_SHADOW.dy)}" stdDeviation="${fmt(
          STICKY_SHADOW.stdDeviation,
        )}" flood-color="#000000" flood-opacity="${fmt(STICKY_SHADOW.opacity)}"/></filter></defs>`,
    );
  }

  // "board" (the default) paints the style's board surface (boardBackground)
  // across the world viewBox; letterbox bands outside the viewBox stay
  // transparent either way.
  if ((options.background ?? "board") === "board") {
    parts.push(
      tag("rect", {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        fill: canvasStyle.boardBackground,
      }),
    );
  }

  for (const section of sections) {
    parts.push(renderSectionBackdrop(section, sectionDepths.get(section.id) ?? 1, canvasStyle));
  }
  for (const connection of scene.connections) {
    parts.push(renderConnector(connection, objectsById, scene.obstacles, canvasStyle));
  }
  for (const object of nonSections) {
    parts.push(renderShapeBody(object, stickyShadowFilterId, bounds, canvasStyle));
    parts.push(renderObjectText(object, canvasStyle));
  }
  for (const section of sections) {
    parts.push(
      renderSectionTitleChip(
        section,
        sectionDepths.get(section.id) ?? 1,
        scene.chipZoom,
        canvasStyle,
        `${idSlug(document.id)}-header-clip-${idSlug(section.id)}`,
        bounds,
      ),
    );
  }

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
