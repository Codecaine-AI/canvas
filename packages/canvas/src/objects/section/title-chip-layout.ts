"use client";

/**
 * Section header chip layout — the ONE geometry + typography source for a
 * section's title chip: the live chip (SectionTitleChip.tsx), the in-place
 * title editor, the static SVG renderer, hit-testing and painted extents
 * (title-chip-geometry.ts), and the agent's title fit all read it, so the
 * chip lines up the same way everywhere.
 *
 * Anatomy, left to right: `[icon] TITLE  detail`.
 *  - icon: the section's optional `icon` glyph in a 16px box — a solid ink
 *    tile in the theme's `tile` icon style, the bare glyph in `glyph` style.
 *  - title: the section's `text` in the header font (`headerFont` /
 *    `headerFontSizePx` / `textFontWeight`, uppercased with 0.08em tracking
 *    for mono when `headerUppercase`).
 *  - detail: the section's optional one-line `detail`, inline 10px after the
 *    title, same font, regular weight, never uppercased.
 *
 * Placement (`headerPlacement`):
 *  - `floating` (FigJam): a fully bordered chip inset 3px from the section's
 *    top-left corner.
 *  - `pinned`: the chip is flush in the corner — it starts right inside the
 *    section frame, which serves as its top and left edge (no gap, no doubled
 *    line), and paints only its right and bottom edges. Its outer extent from
 *    the section's top edge is the same 27px a floating chip is tall.
 *
 * Zoomed out, the chip counter-scales about its own top-left corner (the
 * frame's inner corner for a pinned chip, so it stays flush at every zoom).
 *
 * Widths mirror the live chip's CSS auto width, and every consumer — the
 * static chip, hit-testing, painted extents, view framing, the title editor,
 * the agent's text-fit — reads them from this one layout: mono runs measure
 * exactly (IBM Plex Mono advances one MONO_ADVANCE_EM cell per codepoint —
 * render/text-metrics.ts measureMonoTextPx's rule); sans runs of a chip
 * carrying an icon or a detail measure on real Inter advances
 * (theme/inter-metrics.ts), with no floor, so the detail lands where the live
 * chip's flow puts it and the chip hits where it paints; a plain sans title
 * keeps the original 0.62em-per-character heuristic and 72px floor
 * (unchanged figjam output).
 *
 * Pure: no React, no DOM — safe for the Node-side static renderer.
 */

import {
  DEFAULT_CANVAS_STYLE,
  FIGJAM_CANVAS_STYLE,
  type CanvasStyle,
  type CanvasStyleFont,
} from "../../theme/canvas-style";
import { MONO_ADVANCE_EM } from "../../theme/fonts";
import { measureInterTextPx } from "../../theme/inter-metrics";
import type { InteractiveCanvasObject } from "../../state/schema";
import { resolveIconGlyph, type IconGlyphElement } from "../shapes/icon/icon-glyphs";
import type { LocalRect } from "../text-slots";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Title chip geometry + the figjam typography. The live values of the border
 * width, radii, and typography come from the workspace canvas style; these
 * fields stay as the figjam values (back-compat, and the values the chip's
 * static CSS in objects/section/def.tsx is written with) whatever the default
 * theme is.
 */
export const TITLE_CHIP = {
  heightPx: 27,
  /**
   * Figjam chip border width — the live value is
   * `CanvasStyle.titleChipBorderWidthPx` (theme/canvas-style.ts); this field
   * stays for back-compat.
   */
  borderWidthPx: FIGJAM_CANVAS_STYLE.titleChipBorderWidthPx,
  /** The figjam title color — the one figjam object-text color, OBJECT_TEXT_COLOR. */
  textColor: FIGJAM_CANVAS_STYLE.textColor,
  fontSizePx: 16,
  fontWeight: 700,
  paddingXPx: 10,
  insetFromSectionCornerPx: 3,
  maxZoomOutScale: 6,
  // Sub-linear zoom-out growth: 1 = constant screen size (full 1/zoom
  // compensation, reads oversized next to the shrunken content), 0 = no
  // growth. 0.6 keeps titles readable from afar without dwarfing the board.
  zoomOutGrowth: 0.6,
} as const;

/** The header icon (a section's `icon`): its box, gap, tile, and glyph sizes, px. */
export const TITLE_CHIP_ICON = {
  /** Icon box: the tile, or the bare glyph in glyph mode. */
  sizePx: 16,
  /** Gap between the icon and the title. */
  gapPx: 6,
  /** Left padding when the icon leads — a tile fills its own box, so it sits nearer the edge than text does. */
  leadPaddingPx: 6,
  tileRadiusPx: 2,
  /** Glyph box on a tile (centered, ~15% inset). */
  tileGlyphPx: 11,
  /** Glyph box without a tile. */
  bareGlyphPx: 16,
  /** Glyph stroke per px of glyph box: Tabler's 1.75 on its 24-unit grid, at any grid. */
  strokePerGlyphPx: 1.75 / 24,
  /** Outlined tile border (white tiles on a light board). */
  tileBorderPx: 1,
} as const;

/** The inline detail run after the title. */
export const TITLE_CHIP_DETAIL = {
  /** Gap between the title and the detail. */
  gapPx: 10,
  fontWeight: 400,
} as const;

/** Tracking for uppercase mono titles. */
export const TITLE_CHIP_MONO_UPPERCASE_TRACKING_EM = 0.08;

/** Average sans glyph advance, em — the chip's char-count width heuristic (live CSS auto width mirror). */
export const TITLE_CHIP_SANS_CHAR_WIDTH_EM = 0.62;

/** Narrowest estimated sans chip (the original floor). */
const TITLE_CHIP_MIN_SANS_WIDTH_PX = 72;

// ---------------------------------------------------------------------------
// Scale + width budget
// ---------------------------------------------------------------------------

/**
 * FigJam-style counter-scale for the section title chip: when zoomed out the
 * chip grows by (1/zoom)^zoomOutGrowth — sub-linear, so titles read from afar
 * yet still shrink somewhat with the board instead of staying full-size on
 * screen. Uniform across all sections regardless of their width (a long
 * title truncates to its section via `titleChipMaxWidthPx` rather than
 * shrinking, so labels never come out in mismatched sizes). At zoom >= 1 the
 * scale is 1 (the chip renders at its natural document size).
 */
export function titleChipScale(zoom: number): number {
  const { maxZoomOutScale, zoomOutGrowth } = TITLE_CHIP;
  return Math.min(Math.max((1 / zoom) ** zoomOutGrowth, 1), maxZoomOutScale);
}

/**
 * Pre-transform width budget for a scaled chip: the scaled chip may span up
 * to its section's inner width but never spill past it — overflow renders as
 * an ellipsis instead of a mid-letter clip at the section's overflow:hidden
 * edge.
 */
export function titleChipMaxWidthPx(sectionWidthPx: number, scale: number): number {
  const inner = sectionWidthPx - TITLE_CHIP.insetFromSectionCornerPx * 2;
  return Math.max(0, inner / scale);
}

// ---------------------------------------------------------------------------
// Typography + measurement
// ---------------------------------------------------------------------------

/** One run's font: family token, size, weight, tracking, case. */
export interface TitleChipFont {
  font: CanvasStyleFont;
  fontSizePx: number;
  fontWeight: number;
  /** Letter spacing after every glyph, em. */
  letterSpacingEm: number;
  uppercase: boolean;
}

/** The title run's font under `canvasStyle`. */
export function titleChipTitleFont(canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE): TitleChipFont {
  const uppercase = canvasStyle.headerUppercase;
  return {
    font: canvasStyle.headerFont,
    fontSizePx: canvasStyle.headerFontSizePx,
    fontWeight: canvasStyle.textFontWeight,
    letterSpacingEm:
      canvasStyle.headerFont === "mono" && uppercase ? TITLE_CHIP_MONO_UPPERCASE_TRACKING_EM : 0,
    uppercase,
  };
}

/** The detail run's font: the header font at regular weight, never uppercased. */
export function titleChipDetailFont(canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE): TitleChipFont {
  return {
    font: canvasStyle.headerFont,
    fontSizePx: canvasStyle.headerFontSizePx,
    fontWeight: TITLE_CHIP_DETAIL.fontWeight,
    letterSpacingEm: 0,
    uppercase: false,
  };
}

/**
 * Estimated px width of `text` (already cased for display) in `font`. Mono is
 * exact — render/text-metrics.ts measureMonoTextPx's rule, one cell per
 * codepoint plus tracking after each glyph; sans is the chip's char-count
 * heuristic (UTF-16 length, as it always was).
 */
export function titleChipTextWidthPx(text: string, font: TitleChipFont): number {
  if (font.font === "mono") {
    let glyphs = 0;
    for (const _char of text) glyphs += 1;
    return glyphs * (MONO_ADVANCE_EM + font.letterSpacingEm) * font.fontSizePx;
  }
  return text.length * font.fontSizePx * TITLE_CHIP_SANS_CHAR_WIDTH_EM;
}

/** Width of one character in `font` — the ellipsis and the sans truncation step. */
export function titleChipCharWidthPx(font: TitleChipFont): number {
  return font.font === "mono"
    ? (MONO_ADVANCE_EM + font.letterSpacingEm) * font.fontSizePx
    : font.fontSizePx * TITLE_CHIP_SANS_CHAR_WIDTH_EM;
}

/** `text` as the chip displays it (uppercased when the font says so). */
export function titleChipDisplayText(text: string, font: TitleChipFont): string {
  return font.uppercase ? text.toUpperCase() : text;
}

/**
 * The section's header detail as displayed — one line, whitespace runs
 * (newlines included) collapsed to single spaces — or null when it has none.
 */
export function titleChipDetailText(section: Pick<InteractiveCanvasObject, "detail">): string | null {
  const detail = typeof section.detail === "string" ? section.detail.replace(/\s+/g, " ").trim() : "";
  return detail === "" ? null : detail;
}

/** The section's header icon id when it names a glyph the registry knows, else null. */
export function titleChipIconId(
  section: Pick<InteractiveCanvasObject, "icon">,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): NonNullable<InteractiveCanvasObject["icon"]> | null {
  // Validation drops unknown section icons, but a hand-built document may still carry one.
  const id: unknown = section.icon;
  if (typeof id !== "string") return null;
  return resolveIconGlyph(id, canvasStyle.iconPack) ? (id as NonNullable<InteractiveCanvasObject["icon"]>) : null;
}

/**
 * The section frame's painted width: the frame the stage draws (a CSS border,
 * or the dashed SVG frame) — 0 for a borderless section. A pinned chip sits
 * right inside it.
 */
export function sectionFrameWidthPx(
  section: Pick<InteractiveCanvasObject, "style">,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): number {
  if (section.style?.strokeStyle === "none") return 0;
  return section.style?.strokeWidth ?? canvasStyle.sectionBorderWidthPx;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export type TitleChipPlacement = CanvasStyle["headerPlacement"];

export interface TitleChipEdges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface TitleChipCorners {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export interface TitleChipRun {
  /** Display text (cased). */
  text: string;
  /** Box-local x where the run starts. */
  x: number;
  /** Natural (untruncated) width. */
  widthPx: number;
  font: TitleChipFont;
}

/** Everything a renderer needs to draw one section's title chip. */
export interface TitleChipLayout {
  /** Sans runs measure on real Inter advances (a chip with an icon or a detail); else the char-count heuristic. */
  measuredSans: boolean;
  placement: TitleChipPlacement;
  /**
   * The painted chip box, section-local px at natural size: (x, y) is the
   * chip's anchor (3px inset when floating; the frame's inner corner when
   * pinned), and the chip scales by `scale` about it. `width` is capped to
   * the section (`titleChipMaxWidthPx`).
   */
  box: LocalRect;
  /** Counter-scale for the current zoom (`titleChipScale`). */
  scale: number;
  /** The width the content wants (uncapped). */
  naturalWidthPx: number;
  /** The box is narrower than its content: the run ellipsizes. */
  truncated: boolean;
  /** Edge widths the box paints: all four floating; right + bottom pinned. */
  border: TitleChipEdges;
  /** Corner radii: floating = titleChipCornerRadiusPx all round; pinned = the frame's inner corner top-left and titleChipCornerRadiusPx bottom-right. */
  radius: TitleChipCorners;
  paddingLeftPx: number;
  paddingRightPx: number;
  /** Box-local y of the content's vertical center. */
  centerY: number;
  /** The leading icon (box-local x of its 16px box), or null. */
  icon: { id: NonNullable<InteractiveCanvasObject["icon"]>; x: number } | null;
  title: TitleChipRun;
  detail: TitleChipRun | null;
}

type ChipSection = Pick<InteractiveCanvasObject, "text" | "geometry" | "style" | "icon" | "detail">;

export interface TitleChipLayoutOptions {
  /** Overrides the section's title (the in-place editor sizes itself against the draft). */
  text?: string;
}

/**
 * Whether a section's header paints anything: a title, a known icon, or a
 * detail. The static chip, painted extents, and view framing / retention all
 * ask this one predicate.
 */
export function titleChipHasContent(
  section: Pick<InteractiveCanvasObject, "text" | "icon" | "detail">,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): boolean {
  return section.text !== "" || titleChipIconId(section, canvasStyle) !== null || titleChipDetailText(section) !== null;
}

/** Width of a run as the layout measures it: exact mono cells, real Inter advances for a measured sans chip, else the char-count heuristic. */
function measureRun(run: string, font: TitleChipFont, measuredSans: boolean): number {
  return font.font === "sans" && measuredSans
    ? measureInterTextPx(run, font.fontSizePx, font.fontWeight)
    : titleChipTextWidthPx(run, font);
}

/** The width-relevant content of a chip, independent of the section's geometry. */
function chipContent(
  section: Pick<InteractiveCanvasObject, "text" | "style" | "icon" | "detail">,
  canvasStyle: CanvasStyle,
  text: string,
) {
  const pinned = canvasStyle.headerPlacement === "pinned";
  const chipBorder = canvasStyle.titleChipBorderWidthPx;
  const border: TitleChipEdges = pinned
    ? { top: 0, right: chipBorder, bottom: chipBorder, left: 0 }
    : { top: chipBorder, right: chipBorder, bottom: chipBorder, left: chipBorder };
  const iconId = titleChipIconId(section, canvasStyle);
  // A chip carrying an icon or a detail measures its Inter runs exactly; a
  // plain title keeps the original char-count estimate.
  const measuredSans = iconId !== null || titleChipDetailText(section) !== null;
  const measure = (run: string, font: TitleChipFont) => measureRun(run, font, measuredSans);
  const paddingLeftPx = iconId ? TITLE_CHIP_ICON.leadPaddingPx : TITLE_CHIP.paddingXPx;
  const paddingRightPx = TITLE_CHIP.paddingXPx;
  const titleFont = titleChipTitleFont(canvasStyle);
  const titleText = titleChipDisplayText(text, titleFont);
  const titleWidth = measure(titleText, titleFont);
  const detailText = titleChipDetailText(section);
  const detailFont = titleChipDetailFont(canvasStyle);
  const detailWidth = detailText === null ? 0 : measure(detailText, detailFont);

  const iconX = border.left + paddingLeftPx;
  const titleX = iconX + (iconId ? TITLE_CHIP_ICON.sizePx + TITLE_CHIP_ICON.gapPx : 0);
  const contentWidth =
    (iconId ? TITLE_CHIP_ICON.sizePx + TITLE_CHIP_ICON.gapPx : 0) +
    titleWidth +
    (detailText === null ? 0 : TITLE_CHIP_DETAIL.gapPx + detailWidth);
  let naturalWidthPx = border.left + paddingLeftPx + contentWidth + paddingRightPx + border.right;
  if (titleFont.font === "sans" && !measuredSans) {
    naturalWidthPx = Math.max(TITLE_CHIP_MIN_SANS_WIDTH_PX, naturalWidthPx);
  }

  return {
    measuredSans,
    pinned,
    border,
    paddingLeftPx,
    paddingRightPx,
    icon: iconId ? { id: iconId, x: iconX } : null,
    title: { text: titleText, x: titleX, widthPx: titleWidth, font: titleFont },
    detail:
      detailText === null
        ? null
        : {
            text: detailText,
            x: titleX + titleWidth + TITLE_CHIP_DETAIL.gapPx,
            widthPx: detailWidth,
            font: detailFont,
          },
    naturalWidthPx,
  };
}

/**
 * The chip's layout for `section` at `zoom` under `canvasStyle`. `text`
 * overrides the section's title (the in-place editor sizes itself against
 * the draft).
 */
export function titleChipLayout(
  section: ChipSection,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
  zoom = 1,
  options?: TitleChipLayoutOptions,
): TitleChipLayout {
  const content = chipContent(section, canvasStyle, options?.text ?? section.text);
  const scale = titleChipScale(zoom);
  const frame = content.pinned ? sectionFrameWidthPx(section, canvasStyle) : 0;
  const anchor = content.pinned ? frame : TITLE_CHIP.insetFromSectionCornerPx;
  const height = TITLE_CHIP.heightPx - frame;
  const width = Math.min(content.naturalWidthPx, titleChipMaxWidthPx(section.geometry.width, scale));
  const chipRadius = canvasStyle.titleChipCornerRadiusPx;
  const radius: TitleChipCorners = content.pinned
    ? {
        // The frame's inner corner: the fill follows the section's rounded corner exactly.
        topLeft: Math.max(0, canvasStyle.sectionCornerRadiusPx - frame),
        topRight: 0,
        bottomRight: chipRadius,
        bottomLeft: 0,
      }
    : { topLeft: chipRadius, topRight: chipRadius, bottomRight: chipRadius, bottomLeft: chipRadius };
  return {
    measuredSans: content.measuredSans,
    placement: content.pinned ? "pinned" : "floating",
    box: { x: anchor, y: anchor, width, height },
    scale,
    naturalWidthPx: content.naturalWidthPx,
    truncated: content.naturalWidthPx > width,
    border: content.border,
    radius,
    paddingLeftPx: content.paddingLeftPx,
    paddingRightPx: content.paddingRightPx,
    centerY: content.border.top + (height - content.border.top - content.border.bottom) / 2,
    icon: content.icon,
    title: content.title,
    detail: content.detail,
  };
}

/**
 * Natural (uncapped) chip width for a title — mirrors the chip's CSS auto
 * width. `section` adds what else sits in the chip (its icon and detail) and
 * the frame it may be pinned into; omit it for a plain title.
 */
export function estimateTitleChipWidthPx(
  text: string,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
  section: Pick<InteractiveCanvasObject, "style" | "icon" | "detail"> = {},
): number {
  return chipContent({ ...section, text }, canvasStyle, text).naturalWidthPx;
}

// ---------------------------------------------------------------------------
// Truncation (static renderer) — mirrors the live chip's text-overflow:
// ellipsis on the title + detail run
// ---------------------------------------------------------------------------

export interface TitleChipVisibleRuns {
  title: string;
  /** The detail as drawn (possibly ellipsized), or null when it does not show. */
  detail: string | null;
}

function codepointPrefix(text: string, count: number): string {
  return [...text].slice(0, count).join("");
}

/** Longest codepoint prefix of `text` whose width (by `fits`) still fits. */
function longestFittingPrefix(text: string, fits: (prefix: string) => boolean): string {
  const chars = [...text];
  let keep = chars.length;
  while (keep > 0 && !fits(chars.slice(0, keep).join(""))) keep -= 1;
  return chars.slice(0, keep).join("");
}

/**
 * What of the title + detail run is visible in the (possibly capped) box,
 * ellipsized the way CSS `text-overflow: ellipsis` cuts the run: characters
 * drop from the end — the detail first, then the title — until the rest plus
 * an ellipsis fits. Mono runs cut on their exact cells; a measured chip's
 * sans runs (`layout.measuredSans`) on real Inter advances; a plain sans
 * title on the chip's original char-count arithmetic. No character is
 * forced: when none fits, only the ellipsis shows, and when not even the
 * ellipsis fits the run paints nothing (`title: ""`) — the live chip's
 * overflow hides it the same way.
 */
export function titleChipVisibleRuns(layout: TitleChipLayout): TitleChipVisibleRuns {
  const { title, detail } = layout;
  if (!layout.truncated) return { title: title.text, detail: detail?.text ?? null };
  const contentEnd = layout.box.width - layout.paddingRightPx - layout.border.right;
  const available = contentEnd - title.x;
  const measured = (run: string, font: TitleChipFont) => measureRun(run, font, layout.measuredSans);
  const ellipsisWidth =
    title.font.font === "sans" && layout.measuredSans ? measured("…", title.font) : titleChipCharWidthPx(title.font);
  /** `kept` characters plus the ellipsis — the bare ellipsis, or nothing, when none fit. */
  const cut = (kept: string, ellipsisFits: boolean) =>
    kept !== "" ? `${kept}…` : ellipsisFits ? "…" : "";

  if (detail) {
    const detailRoom = available - title.widthPx - TITLE_CHIP_DETAIL.gapPx - ellipsisWidth;
    const kept = longestFittingPrefix(detail.text, (prefix) => measured(prefix, detail.font) <= detailRoom);
    if (kept !== "") return { title: title.text, detail: `${kept}…` };
  }

  if (title.font.font === "sans" && layout.measuredSans) {
    const kept = longestFittingPrefix(title.text, (prefix) => measured(prefix, title.font) + ellipsisWidth <= available);
    return { title: cut(kept, ellipsisWidth <= available), detail: null };
  }
  if (title.font.font === "sans") {
    // The original sans chip arithmetic: (width − paddings − borders − one
    // char) / char, floored — the run's room after the ellipsis' char.
    const charWidth = titleChipCharWidthPx(title.font);
    const iconWidth = layout.icon ? TITLE_CHIP_ICON.sizePx + TITLE_CHIP_ICON.gapPx : 0;
    const room =
      layout.box.width -
      (layout.paddingLeftPx + layout.paddingRightPx) -
      (layout.border.left + layout.border.right) -
      iconWidth -
      charWidth;
    const maxChars = Math.max(0, Math.floor(room / charWidth));
    return { title: cut(title.text.slice(0, maxChars), room >= 0), detail: null };
  }
  const keep = Math.max(0, Math.floor((available - ellipsisWidth) / titleChipCharWidthPx(title.font)));
  return { title: cut(codepointPrefix(title.text, keep), ellipsisWidth <= available), detail: null };
}

// ---------------------------------------------------------------------------
// Header icon drawing (shared by the live chip and the static renderer)
// ---------------------------------------------------------------------------

/** The icon colors a section paint resolves (theme/palette.ts SectionPaint). */
export interface TitleChipIconColors {
  iconTile: string;
  iconTileBorder: string | null;
  iconGlyph: string;
}

/** The header icon as primitives, in the icon's own 16px box (origin at its top-left). */
export interface TitleChipIconDrawing {
  sizePx: number;
  /** The solid (or outlined) tile; null in glyph mode. */
  tile: { fill: string; border: string | null; borderWidthPx: number; radiusPx: number } | null;
  glyph: {
    /** Glyph box offset inside the icon box, and its size. */
    offsetPx: number;
    sizePx: number;
    viewBoxSize: number;
    paint: "stroke" | "fill";
    color: string;
    /** Stroke width in the glyph's own viewBox units (stroke paint only). */
    strokeWidth: number;
    elements: readonly IconGlyphElement[];
  };
}

/** The header icon for `iconId` under `canvasStyle`, painted with `colors`; null for an unknown glyph. */
export function titleChipIconDrawing(
  iconId: string,
  colors: TitleChipIconColors,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): TitleChipIconDrawing | null {
  const glyph = resolveIconGlyph(iconId, canvasStyle.iconPack);
  if (!glyph) return null;
  const tiled = canvasStyle.iconStyle === "tile";
  const glyphSize = tiled ? TITLE_CHIP_ICON.tileGlyphPx : TITLE_CHIP_ICON.bareGlyphPx;
  return {
    sizePx: TITLE_CHIP_ICON.sizePx,
    tile: tiled
      ? {
          fill: colors.iconTile,
          border: colors.iconTileBorder,
          borderWidthPx: TITLE_CHIP_ICON.tileBorderPx,
          radiusPx: TITLE_CHIP_ICON.tileRadiusPx,
        }
      : null,
    glyph: {
      offsetPx: (TITLE_CHIP_ICON.sizePx - glyphSize) / 2,
      sizePx: glyphSize,
      viewBoxSize: glyph.viewBoxSize,
      paint: glyph.paint,
      color: colors.iconGlyph,
      strokeWidth: TITLE_CHIP_ICON.strokePerGlyphPx * glyph.viewBoxSize,
      elements: glyph.elements,
    },
  };
}
