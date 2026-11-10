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
 * render matches the app. Every width, line break and ellipsis comes from
 * @codecaine-ai/text-measure (theme/text-measure.ts: Pretext line breaking
 * over the active measuring backend, the faces the stage and resvg paint),
 * names wrap the way the stage's pre-wrap / break-word slot does, sticky
 * text lays out as its markdown line boxes (objects/sticky/sticky-text.ts mirroring
 * objects/sticky/markdown.tsx), and the
 * types whose live defs draw custom inline-SVG silhouettes
 * (predefined-process) draw the same silhouette geometry here. Icon objects
 * render their real glyph from the style's icon pack via the pure registry
 * (objects/shapes/icon/icon-glyphs.ts) — bare or on a tile
 * (objects/shapes/icon/icon-tile.ts) — falling back to a neutral rounded
 * rect only for unknown glyph ids. Detail lines (one muted line under a
 * shape's or icon's name) ellipsize the way the stage's text-overflow does.
 * The section title chip and connection label chip size themselves through
 * the shared geometry the live stage uses (objects/section/title-chip-layout
 * .ts, connectors/label-chip.ts). Answers are exact only on an exact backend
 * (hosts call useHarfBuzz() first) and for text the bundled faces cover.
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
import { placedLabelPoint } from "../connectors/label-placement";
import { connectorDashArray } from "../connectors/def";
import { ARROWHEAD_TIP_OVERSHOOT_RATIO, arrowheadStrokeRatio } from "../connectors/arrowhead";
import {
  resolveBrandMarkFill,
  resolveConnectorPaint,
  resolveIconPaint,
  resolveIconTilePaint,
  resolveLabelChipBorder,
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
  titleChipVisibleTitle,
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
import {
  resolveObjectStrokeWidth,
  resolvePredefinedProcessBarWidth,
  resolveShapeCornerRadius,
  resolveTrueOutlineStrokeWidth,
} from "../theme/tokens";
import { DEFAULT_CANVAS_STYLE, normalizeCanvasStyle, type CanvasStyle } from "../theme/canvas-style";
import { formatHex, parseColor } from "../theme/color-math";
import { CANVAS_MONO_FONT_STACK_SVG, CANVAS_SANS_FONT_STACK_SVG } from "../theme/fonts";
import { ellipsizeToWidth, wrapText } from "../theme/text-measure";
import {
  BELOW_TEXT_SLOT,
  CENTER_TEXT_SLOT,
  CENTER_TEXT_INSET_PX,
  INSET_BODY_TEXT_SLOT,
  iconTileRectPx,
  rectTextSlot,
  resolveTextSlot,
  slotFontSpec,
  slotLineHeightPx,
  type LocalRect,
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
import { STICKY_MARKDOWN_MONO_FONT_WEIGHT } from "../objects/sticky/markdown-editing";
import { ellipsizeStickyRow, layoutStickyText } from "../objects/sticky/sticky-text";
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

/** Sticky shadow — mirrors STICKY_GEOMETRY.shadow ("0 3px 12px rgba(0,0,0,0.15)") in objects/sticky/def.tsx. */
const STICKY_SHADOW = { dx: 0, dy: 3, stdDeviation: 6, opacity: 0.15 } as const;

/**
 * Card sticky lift — mirrors objects/sticky/def.tsx CARD_STICKY_GEOMETRY
 * shadowLayers (offsets 1 and 2, blurs 2 and 6: a CSS blur radius is two
 * standard deviations). Its color is the sticky paint's cardShadow.
 */
const CARD_STICKY_SHADOW_LAYERS = [
  { dy: 1, stdDeviation: 1 },
  { dy: 2, stdDeviation: 3 },
] as const;

/** The sticky shadow filters a scene defines: null where no sticky casts that shadow. */
type StickyShadowFilterIds = { paper: string | null; card: string | null };

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
// Text layout — the stage's slot text is `white-space: pre-wrap;
// overflow-wrap: break-word` (objects/object-shell.tsx), so names wrap with
// text-measure's Pretext line breaking in pre-wrap mode at the slot width:
// the browser's break opportunities (spaces, hyphens, dashes, soft hyphens,
// zero-width spaces, CJK), preserved spaces, hanging trailing spaces, and
// intra-word breaks only for a word wider than the line.
//
// `wrapTextLines` / `clampLines` are exported (they
// are not on the package's public `./render` surface — deep-import them) so
// that off-renderer consumers can ask "would this text clip in this box?" and
// get the RENDERER's answer rather than a second implementation of it. The
// agent's text-fit warnings (board/text-fit.ts) are built on
// exactly these functions for that reason.
// ---------------------------------------------------------------------------

/**
 * `text` as the lines the stage paints in a slot `widthPx` wide, in
 * `typography`'s font: pre-wrap (a trailing newline adds no line, a blank
 * line is an empty line), each line as laid out (its hanging trailing spaces
 * included).
 */
export function wrapTextLines(text: string, widthPx: number, typography: SlotTypography): string[] {
  if (text === "") return [];
  return wrapText(text, slotFontSpec(typography), {
    maxWidth: Math.max(0, widthPx),
    lineHeight: slotLineHeightPx(typography),
    whiteSpace: "pre-wrap",
  }).lines.map((line) => line.text);
}

/**
 * Clamp wrapped lines to `maxLines`, ellipsizing the last visible line the
 * way the stage's -webkit-line-clamp does: its trailing graphemes drop until
 * the line plus the ellipsis fits the width. An unchanged line count means
 * nothing was clamped.
 */
export function clampLines(
  lines: string[],
  maxLines: number,
  widthPx: number,
  typography: SlotTypography,
): string[] {
  if (lines.length <= maxLines) return lines;
  const clamped = lines.slice(0, maxLines);
  const lastIndex = clamped.length - 1;
  const font = slotFontSpec(typography);
  clamped[lastIndex] = ellipsizeToWidth(clamped[lastIndex] ?? "", font, widthPx, font, "pre-wrap");
  return clamped;
}

/**
 * Renders wrapped slot text as a `<text>` with one `<tspan>` per line, the
 * block anchored by `verticalAlign` (mirroring the live flex column).
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
  let lines = wrapTextLines(text, rect.width, typography);
  if (lines.length === 0) return "";
  if (options?.clampToRect !== false && rect.height > 0) {
    const maxLines = Math.max(1, Math.floor(rect.height / lineHeight));
    lines = clampLines(lines, maxLines, rect.width, typography);
  }

  const blockHeight = lines.length * lineHeight;
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

  // Pre-wrap: a line's trailing spaces hang (they paint nothing and do not
  // move centered text); leading and repeated spaces paint, which SVG only
  // keeps under xml:space="preserve" (set when some line needs it).
  const painted = lines.map((line) => line.replace(/[ \t]+$/, ""));
  const preserveSpaces = painted.some((line) => /^[ \t]|[ \t]{2}|\t/.test(line));
  const tspans = painted
    .map((line, index) =>
      line === ""
        ? ""
        : tag("tspan", { x, y: firstLineCenterY + index * lineHeight }, escapeXml(line)),
    )
    .join("");

  return tspans === ""
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
          ...(preserveSpaces ? { "xml:space": "preserve" } : null),
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

/**
 * An object's slot text under `canvasStyle`: the name in the style's name
 * color/weight. A node shows its name only: a stored `detail` (older boards)
 * never paints. Stickies render their markdown body.
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
  if (object.text === "") return "";
  const worldRect = {
    x: object.geometry.x + resolved.rect.x,
    y: object.geometry.y + resolved.rect.y,
    width: resolved.rect.width,
    height: resolved.rect.height,
  };
  // The "below" band renders every wrapped line (it sizes itself to the text)
  // rather than clamping to the glyph box.
  const clampToRect = resolved.multiline && slot.placement !== "below";
  return renderSlotTextBlock(object.text, worldRect, resolved.typography, resolved.verticalAlign, { clampToRect });
}

function polygonPointsAttribute(points: CanvasPoint[]): string {
  return points.map((point) => `${fmt(point.x)},${fmt(point.y)}`).join(" ");
}

// ---------------------------------------------------------------------------
// Sticky markdown — line boxes from objects/sticky/sticky-text.ts (which mirrors the
// live StickyMarkdown renderer), emitted as one <text> plus code-chip
// background rects. Only the geometry-bearing pieces are exact; the chip
// visuals approximate the live CSS tastefully (same tint, radius, size).
// ---------------------------------------------------------------------------

/**
 * Code chip visuals — mirrors the inline `<code>` CSS in objects/sticky/
 * markdown.tsx: black at 8% on a paper sticky; on a card, the sticky paint's
 * codeChip, as the live note reads it.
 */
const STICKY_CODE_CHIP_FILL_OPACITY = 0.08;
/** Card sticky hairline — mirrors objects/sticky/def.tsx CARD_STICKY_GEOMETRY.borderWidthPx (React; not importable here). */
const CARD_STICKY_BORDER_WIDTH_PX = 1;

/**
 * The card note's ink rule (objects/sticky/def.tsx cardStickyTrim): the
 * vertical strip from `from` to `from + width` px in from the left edge,
 * clipped by the box's `radius` corners as the live background strip is. Its
 * inner edge stays straight; only its ends follow the corner arcs.
 */
function leftRulePath(geometry: CanvasBounds, from: number, width: number, radius: number): string {
  const { x, y, height } = geometry;
  const a = Math.min(from, geometry.width);
  const b = Math.min(from + width, geometry.width);
  const r = Math.min(radius, geometry.width / 2, height / 2);
  const bottom = y + height;
  // How far the corner arc sits below the top edge at `d` px in from the left.
  const dip = (d: number) => (d >= r ? 0 : r - Math.sqrt(r * r - (r - d) * (r - d)));
  const arc = (toX: number, toY: number) => `A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(toX)} ${fmt(toY)}`;
  const top = [`M${fmt(x + a)} ${fmt(y + dip(a))}`];
  if (a < r) top.push(arc(x + Math.min(b, r), y + dip(Math.min(b, r))));
  if (b > r) top.push(`H${fmt(x + b)}`);
  const end = [`V${fmt(bottom - dip(b))}`];
  if (b > r) end.push(`H${fmt(x + Math.max(a, r))}`);
  if (a < r) end.push(arc(x + a, bottom - dip(a)));
  return [...top, ...end, "Z"].join("");
}

/**
 * The sticky note body under the style's sticky paint (theme/palette.ts
 * resolveStickyPaint), mirroring objects/sticky/def.tsx. `paper`: the flat
 * square sticky fill with the down-biased shadow (objects/sticky/def.tsx
 * STICKY_GEOMETRY) — drawn without the filter when wholly outside the
 * viewBox. `card`: the card fill, a straight ink rule (stickyRuleWidthPx)
 * just inside the left hairline, then the hairline edge over it, no shadow.
 * Both take stickyCornerRadiusPx.
 */
function renderStickyBody(
  object: InteractiveCanvasObject,
  shadowFilters: StickyShadowFilterIds,
  insideViewBox: boolean,
  canvasStyle: CanvasStyle,
): string {
  const { geometry } = object;
  const paint = resolveStickyPaint(object.color ?? FIRST_USE_COLORS.sticky, canvasStyle);
  const radius = Math.min(canvasStyle.stickyCornerRadiusPx, geometry.width / 2, geometry.height / 2);
  const rounded = radius > 0 ? { rx: radius } : null;
  if (paint.shadow) {
    return tag("rect", {
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      ...rounded,
      fill: paint.fill,
      ...(shadowFilters.paper && insideViewBox
        ? { filter: `url(#${shadowFilters.paper})` }
        : null),
    });
  }
  const parts = [
    tag("rect", {
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      ...rounded,
      fill: paint.fill,
      ...(paint.cardShadow && shadowFilters.card && insideViewBox
        ? { filter: `url(#${shadowFilters.card})` }
        : null),
    }),
  ];
  // The rule under the hairline, as the live background strip sits under its inset shadow.
  if (paint.rule && canvasStyle.stickyRuleWidthPx > 0) {
    const d = leftRulePath(geometry, CARD_STICKY_BORDER_WIDTH_PX, canvasStyle.stickyRuleWidthPx, radius);
    parts.push(tag("path", { d, fill: paint.rule }));
  }
  if (paint.border) {
    const inset = CARD_STICKY_BORDER_WIDTH_PX / 2;
    parts.push(
      tag("rect", {
        x: geometry.x + inset,
        y: geometry.y + inset,
        width: Math.max(0, geometry.width - CARD_STICKY_BORDER_WIDTH_PX),
        height: Math.max(0, geometry.height - CARD_STICKY_BORDER_WIDTH_PX),
        ...(radius > 0 ? { rx: Math.max(0, radius - inset) } : null),
        fill: "none",
        stroke: paint.border,
        "stroke-width": CARD_STICKY_BORDER_WIDTH_PX,
      }),
    );
  }
  return parts.join("");
}
const STICKY_CODE_CHIP_RADIUS_PX = 3;
/** Chip height in em of the code font size (approximates the inline box's height). */
const STICKY_CODE_CHIP_HEIGHT_EM = 1.3;

/**
 * Sticky body text as its markdown line stack: per-line font size/weight,
 * bullet glyph columns, depth indentation and the style's line pitch mirroring the
 * live StickyMarkdown layout, each line wrapped as its mixed inline runs
 * (objects/sticky/sticky-text.ts). Rows beyond the slot's height clamp are dropped
 * and the last visible row ellipsized — the same overflow the live
 * -webkit-line-clamp shows.
 */
function renderStickyMarkdownText(object: InteractiveCanvasObject, canvasStyle: CanvasStyle): string {
  // The slot typography carries the sticky paint's text color.
  const resolved = resolveTextSlot(INSET_BODY_TEXT_SLOT, object, 1, { canvasStyle });
  const stickyPaint = resolveStickyPaint(object.color ?? FIRST_USE_COLORS.sticky, canvasStyle);
  // A card's chip is its paint's codeChip (an opaque hex or an rgba): split into fill + fill-opacity.
  const cardChip = stickyPaint.codeChip === null ? null : parseColor(stickyPaint.codeChip);
  const codeChipFill = cardChip ? formatHex(cardChip) : "#000000";
  const codeChipOpacity = cardChip ? cardChip.a : STICKY_CODE_CHIP_FILL_OPACITY;
  if (resolved.hidden) return "";
  const rect = {
    x: object.geometry.x + resolved.rect.x,
    y: object.geometry.y + resolved.rect.y,
    width: resolved.rect.width,
    height: resolved.rect.height,
  };
  if (rect.width <= 0 || rect.height <= 0) return "";
  const typography = resolved.typography;

  const rows = layoutStickyText(object.text, rect.width, typography.fontSizePx, canvasStyle.stickyHeadingScale);
  const pitch = slotLineHeightPx(typography);
  const maxRows = Math.max(1, Math.floor(rect.height / pitch));
  const clamped = rows.slice(0, maxRows);
  if (rows.length > maxRows && clamped.length > 0) {
    ellipsizeStickyRow(clamped[clamped.length - 1]!, rect.width);
  }

  const chipRects: string[] = [];
  const tspans: string[] = [];
  // Pre-wrap: repeated spaces paint, which SVG keeps only under xml:space="preserve".
  let preserveSpaces = false;
  clamped.forEach((row, rowIndex) => {
    const centerY = rect.y + rowIndex * pitch + pitch / 2;
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
    for (const [segmentIndex, segment] of row.segments.entries()) {
      // Trailing spaces at a row's end hang: they paint nothing.
      const text = segmentIndex === row.segments.length - 1 ? segment.text.replace(/[ \t]+$/, "") : segment.text;
      if (text === "") continue;
      // Leading spaces (a row's own, or one after a bold run) and repeated ones paint.
      if (/^[ \t]|[ \t]{2}|\t/.test(text)) preserveSpaces = true;
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
            "fill-opacity": String(codeChipOpacity),
          }),
        );
      }
      const code = segment.style === "code";
      const fontWeight = code ? STICKY_MARKDOWN_MONO_FONT_WEIGHT : segment.fontWeight;
      tspans.push(
        tag(
          "tspan",
          {
            // A code chip's text starts inside its leading padding.
            x: rect.x + segment.xPx + segment.textOffsetPx,
            y: centerY,
            ...(segment.fontSizePx !== typography.fontSizePx
              ? { "font-size": segment.fontSizePx }
              : null),
            ...(fontWeight !== typography.fontWeight ? { "font-weight": fontWeight } : null),
            ...(code ? { "font-family": CANVAS_MONO_FONT_STACK_SVG } : null),
          },
          escapeXml(text),
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
      ...(preserveSpaces ? { "xml:space": "preserve" } : null),
    },
    tspans.join(""),
  );
  return chipRects.join("") + text;
}

// ---------------------------------------------------------------------------
// Icon glyphs — mirrors objects/shapes/icon/IconShapeBody.tsx over the pure
// glyph registry (icon-glyphs.ts, React-free data).
// ---------------------------------------------------------------------------

/** One glyph shape; a full-color brand mark's shape carries its own fill, painted through `markFill` (raw when omitted). */
function glyphElementMarkup(element: IconGlyphElement, markFill?: (fill: string) => string): string {
  const fill = element.kind !== "line" && element.fill ? (markFill?.(element.fill) ?? element.fill) : undefined;
  if (element.kind === "path") return tag("path", { d: element.d, fill });
  if (element.kind === "circle") {
    return tag("circle", { cx: element.cx, cy: element.cy, r: element.r, fill });
  }
  return tag("line", { x1: element.x1, y1: element.y1, x2: element.x2, y2: element.y2 });
}

/** A glyph `<svg>`'s viewBox (IconGlyphDefinition.viewBox: a brand mark's optical box, else its grid). */
function glyphViewBox(glyph: IconGlyphDefinition): string {
  return glyph.viewBox.map(fmtScale).join(" ");
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
 *    fill-paint (brand) glyphs fill with their brand color.
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
  const paint = resolveIconTilePaint(object.color ?? FIRST_USE_COLORS.shape, canvasStyle, tileSidePx, glyph.brandColor);
  const markBackground = paint.tileFill ?? canvasStyle.boardBackground;
  const markFill = (fill: string) => resolveBrandMarkFill(fill, markBackground, canvasStyle);
  if (paint.tileFill !== null) {
    return renderIconTile(object, glyph, paint, viewBox, canvasStyle.iconTileMaxPx, markFill);
  }

  const fill = paint.glyphFill;
  const shouldRenderFillLayer = Boolean(fill && glyph.paint !== "fill" && glyphHasClosedInterior(glyph));
  const fillLayer = shouldRenderFillLayer
    ? tag(
        "g",
        { fill: fill ?? undefined, stroke: "none" },
        glyph.elements
          .filter(isFillGlyphElement)
          .map((element) => glyphElementMarkup(element))
          .join(""),
      )
    : "";
  const inkLayer = tag("g", {}, glyph.elements.map((element) => glyphElementMarkup(element, markFill)).join(""));

  return tag(
    "svg",
    {
      x: geometry.x,
      y: geometry.y,
      width: Math.max(0, geometry.width),
      height: Math.max(0, geometry.height),
      viewBox: glyphViewBox(glyph),
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
  markFill: (fill: string) => string,
): string {
  const { geometry } = object;
  const layout = iconTileLayout(geometry.width, geometry.height, tileMaxPx, glyph);
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
        viewBox: glyphViewBox(glyph),
        preserveAspectRatio: "xMidYMid meet",
        ...glyphPaintAttributes(glyph, paint.glyph, iconTileGlyphStrokeWidth(glyph.viewBoxSize)),
      },
      tag("g", {}, glyph.elements.map((element) => glyphElementMarkup(element, markFill)).join("")),
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
 * (its corner radius and bar width come from theme/tokens.ts, like every bbox shape).
 */
const PREDEFINED_PROCESS_GEOMETRY = {
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
 * predefined-process.tsx): border-colored bars inset barInsetRatio of the
 * padding-box width from each side, spanning the padding box's height.
 */
function renderPredefinedProcessSilhouette(
  rect: WorldRect,
  paint: ShapePaint,
  strokeWidth: number,
  canvasStyle: CanvasStyle,
): string {
  const barWidth = resolvePredefinedProcessBarWidth(strokeWidth, canvasStyle);
  const innerX = rect.x + strokeWidth;
  const innerY = rect.y + strokeWidth;
  const innerWidth = Math.max(0, rect.width - strokeWidth * 2);
  const innerHeight = Math.max(0, rect.height - strokeWidth * 2);
  const barInset = innerWidth * PREDEFINED_PROCESS_GEOMETRY.barInsetRatio;
  const bar = (x: number) =>
    tag("rect", {
      x,
      y: innerY,
      width: barWidth,
      height: innerHeight,
      fill: paint.border,
    });
  return (
    bboxRoundedRect(rect, paint, strokeWidth, resolveShapeCornerRadius("predefined-process", canvasStyle)) +
    bar(innerX + barInset) +
    bar(innerX + innerWidth - barInset - barWidth)
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
      return renderPredefinedProcessSilhouette(rect, paint, strokeWidth, canvasStyle);
    default:
      return null;
  }
}

/**
 * The shape body silhouette. Polygon/ellipse outline kinds stroke the true
 * outline exactly like the app's SVG silhouettes (stroke centered on the
 * path, at the true-outline width). Bbox kinds mimic the CSS border-box border by insetting the rect by
 * half the stroke width.
 */
function renderShapeBody(
  object: InteractiveCanvasObject,
  stickyShadowFilters: StickyShadowFilterIds,
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
    return renderStickyBody(object, stickyShadowFilters, insideViewBox, canvasStyle);
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
      "stroke-width": resolveTrueOutlineStrokeWidth(strokeWidth, canvasStyle),
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
      "stroke-width": resolveTrueOutlineStrokeWidth(strokeWidth, canvasStyle),
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
          glyph.sizePx / glyph.viewBox[2],
        )})${glyph.viewBox[0] === 0 && glyph.viewBox[1] === 0 ? "" : ` translate(${fmtScale(-glyph.viewBox[0])} ${fmtScale(-glyph.viewBox[1])})`}`,
        fill: stroked ? "none" : glyph.color,
        stroke: stroked ? glyph.color : "none",
        "stroke-width": stroked ? fmtScale(glyph.strokeWidth) : undefined,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      },
      glyph.elements.map((element) => glyphElementMarkup(element)).join(""),
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
 * A section's title chip — `[icon] TITLE` from the shared layout
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
  // The shared layout measures every run in the font it paints in — the box
  // hit-testing, painted extents and text-fit use too.
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
  const title = titleChipVisibleTitle(layout);
  if (title !== "") {
    parts.push(
      tag(
        "text",
        titleChipTextAttributes(layout.title.font, chipX + layout.title.x, chipY + layout.centerY, paint.headerText),
        escapeXml(title),
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
 * (stage/CanvasStage.tsx `<defs>`, both from connectors/arrowhead.ts): a solid
 * triangle arrowheadStrokeRatio stroke widths long and wide (5, floored at 14
 * world px), whose tip overshoots the rendered path end by 0.5 stroke widths
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
  const ratio = arrowheadStrokeRatio(strokeWidth);
  const tip = {
    x: pathEnd.x + dirX * ARROWHEAD_TIP_OVERSHOOT_RATIO * strokeWidth,
    y: pathEnd.y + dirY * ARROWHEAD_TIP_OVERSHOOT_RATIO * strokeWidth,
  };
  const base = {
    x: tip.x - dirX * ratio * strokeWidth,
    y: tip.y - dirY * ratio * strokeWidth,
  };
  const halfWidth = (ratio / 2) * strokeWidth;
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
  document: InteractiveCanvasDocument,
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

  // Label chip at the placed label point (connectors/label-placement.ts),
  // placed on the whole document. Mirrors the stage's SVG label chip
  // (connectors/Connector.tsx), which reads the same helper.
  const label = connection.label?.trim() ? connection.label : null;
  if (label) {
    const labelPoint = placedLabelPoint(routed, connection, document, canvasStyle);
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
        stroke: resolveLabelChipBorder(canvasStyle, stroke),
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

  // Paper stickies cast the paper shadow; card stickies the paint's softer
  // lift (cardShadow, light boards only). One filter per kind serves the scene.
  const stickyPaints = nonSections
    .filter((object) => effectiveRenderShape(object) === "note")
    .map((object) => resolveStickyPaint(object.color ?? FIRST_USE_COLORS.sticky, canvasStyle));
  const cardShadow = stickyPaints.find((paint) => paint.cardShadow !== null)?.cardShadow ?? null;
  const stickyShadowFilters: StickyShadowFilterIds = {
    paper: stickyPaints.some((paint) => paint.shadow) ? `${idSlug(document.id)}-sticky-shadow` : null,
    card: cardShadow ? `${idSlug(document.id)}-card-sticky-shadow` : null,
  };

  const parts: string[] = [];

  if (stickyShadowFilters.paper) {
    parts.push(
      `<defs><filter id="${escapeXml(stickyShadowFilters.paper)}" x="-20%" y="-20%" width="140%" height="140%">` +
        `<feDropShadow dx="${fmt(STICKY_SHADOW.dx)}" dy="${fmt(STICKY_SHADOW.dy)}" stdDeviation="${fmt(
          STICKY_SHADOW.stdDeviation,
        )}" flood-color="#000000" flood-opacity="${fmt(STICKY_SHADOW.opacity)}"/></filter></defs>`,
    );
  }
  if (stickyShadowFilters.card && cardShadow) {
    const flood = parseColor(cardShadow)!;
    // Each layer is the note's alpha, offset and blurred, in the lift color;
    // the layers merge under the note itself.
    const shadowLayers = CARD_STICKY_SHADOW_LAYERS.map(
      (layer, index) =>
        `<feGaussianBlur in="SourceAlpha" stdDeviation="${fmt(layer.stdDeviation)}" result="b${index}"/>` +
        `<feOffset in="b${index}" dy="${fmt(layer.dy)}" result="o${index}"/>` +
        `<feFlood flood-color="${formatHex(flood)}" flood-opacity="${fmt(flood.a)}" result="f${index}"/>` +
        `<feComposite in="f${index}" in2="o${index}" operator="in" result="s${index}"/>`,
    ).join("");
    const merge = CARD_STICKY_SHADOW_LAYERS.map((_, index) => `<feMergeNode in="s${index}"/>`).join("");
    parts.push(
      `<defs><filter id="${escapeXml(stickyShadowFilters.card)}" x="-15%" y="-25%" width="130%" height="170%">` +
        shadowLayers +
        `<feMerge>${merge}<feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`,
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
    parts.push(renderConnector(document, connection, objectsById, scene.obstacles, canvasStyle));
  }
  for (const object of nonSections) {
    parts.push(renderShapeBody(object, stickyShadowFilters, bounds, canvasStyle));
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
