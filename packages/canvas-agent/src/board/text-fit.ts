/**
 * text-fit — "would this text still be readable in this box?", answered by the
 * RENDERER's own wrap/clamp decision rather than a second implementation of
 * it (docs/10-system-design/70-agent-tool-surface/20-gestures §Arrange, "Size has
 * rules").
 *
 * `resize` shrinking a box below what its text needs, and `update_text`
 * writing text longer than its box holds, both fire a report-only warning in
 * the tool result (an `OpOutcome.notes` line under the APPLIED headline) —
 * the same philosophy as the unreadable-labels lint: say it, don't block it.
 *
 * Parity, not estimation. The verdict comes from the exact functions the
 * static renderer paints with, under the workspace `CanvasStyle` (the name's
 * weight, the detail line's font and size):
 *   - slot geometry     `resolveTextSlot` + `textSlotForObject` (the slot the
 *                        renderer picks, inscribed rects included, and the
 *                        detail line it paints there)
 *   - body wrap/clamp   `wrapTextLines` / `clampLines` over real Inter
 *                        advances (render/text-metrics.ts), the name's clamp
 *                        shortened by the detail line's reserve
 *                        (`slotNameLineCapacity`)
 *   - detail lines      `ellipsizeDetailText` / `measureDetailTextPx` (IBM
 *                        Plex Mono at its fixed advance — measureMonoTextPx —
 *                        or Inter's table)
 *   - sticky bodies     `layoutStickyText` + `STICKY_LINE_PITCH_PX`
 *   - section titles    `titleChipLayout` + `titleChipMaxWidthPx` (the chip
 *                        as the workspace style draws it: header font, icon,
 *                        detail, border — the one measured layout the
 *                        renderers paint and hit-test with)
 *   - edge labels       `connectionLabelChipMetrics` (connectors/label-chip.ts,
 *                        the chip the renderers draw: the 30px sans chip in
 *                        figjam, the 22px mono chip in the schematic themes)
 * Those renderer internals are module-private to the read-only canvas package
 * and are NOT on its public `./render` export surface, so they are deep-
 * imported here — the established pattern (board/lints/geometry.ts does the
 * same for `routeConnection`). test/text-fit-parity.test.ts pins the verdict
 * to actual clipped SVG output; drift fails that test.
 *
 * Scope of `fits`: TRUNCATION only — a dropped line or an ellipsis, in the
 * name or in its detail line, or a detail line the box is too short to paint
 * at all. Intra-word breaking (a single word wider than the slot) is not
 * truncation, so it does not on its own flip `fits`; it does drive
 * `neededSize.width`, since no amount of extra height ever un-breaks a
 * too-long word.
 */

import type {
  InteractiveCanvasConnection,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";

import {
  clampLines,
  effectiveRenderShape,
  ellipsizeDetailText,
  measureDetailTextPx,
  textSlotForObject,
  wrapTextLines,
} from "../../../canvas/src/render/static-svg.ts";
import { measureInterTextPx } from "../../../canvas/src/render/text-metrics.ts";
import {
  layoutStickyText,
  STICKY_LINE_PITCH_PX,
} from "../../../canvas/src/render/sticky-text.ts";
import {
  detailTypography,
  INSET_BODY_TEXT_SLOT,
  resolveTextSlot,
  slotDetailText,
  slotNameLineCapacity,
  TITLE_CHIP,
  titleChipMaxWidthPx,
  type DetailTypography,
  type ResolvedTextSlot,
} from "../../../canvas/src/objects/text-slots.ts";
import {
  titleChipHasContent,
  titleChipLayout,
  titleChipVisibleRuns,
} from "../../../canvas/src/objects/section/title-chip-layout.ts";
import { connectionLabelChipMetrics } from "../../../canvas/src/connectors/label-chip.ts";

import { DEFAULT_CANVAS_STYLE, type CanvasStyle } from "@codecaine-ai/canvas/style";

import { CHIP_CLEARANCE } from "./lints/geometry";

/** A box size in world units. */
export interface TextFitSize {
  width: number;
  height: number;
}

/**
 * What `textFitReport` was asked about — an object (shape label, sticky body,
 * section title) or a connection (edge label chip).
 */
export type TextFitTarget = InteractiveCanvasObject | InteractiveCanvasConnection;

/** Which rendering path decided the verdict (useful in tests and prose). */
export type TextFitSlot =
  | "shape-label"
  | "sticky-body"
  | "section-title"
  | "edge-label"
  | "none";

/**
 * How an object's one-line `detail` paints at the asked size — present on
 * shape-label (shapes and icons) and section-title reports whenever the
 * object has a detail.
 */
export interface DetailLineFit {
  /** The detail as its one line (whitespace collapsed, trimmed). */
  text: string;
  /** False when the line is not painted at all (a shape box too short for a name line plus the detail). */
  shown: boolean;
  /** True when the painted line ends in an ellipsis. */
  truncated: boolean;
  /** The line as painted ("" when not shown). */
  painted: string;
  /** The most characters of this detail that paint whole at this width. */
  fittingChars: number;
  /** Characters the detail has. */
  totalChars: number;
}

export interface TextFitReport {
  /** True when the render at `size` would show the text whole (name and detail line). */
  fits: boolean;
  /** Smallest box that shows it whole. Present only when `fits` is false. */
  neededSize?: TextFitSize;
  /** One short line, emitted verbatim as an `OpOutcome.notes` entry. */
  detail: string;
  /** The rendering path this verdict came from. */
  slot: TextFitSlot;
  /**
   * Whether the name alone shows whole (no dropped line, no ellipsis) —
   * present on shape-label and section-title reports, so a caller can tell a
   * cut name from a cut detail line.
   */
  nameFits?: boolean;
  /** The object's detail line at `size`, when it has one. */
  detailLine?: DetailLineFit;
}

/** Upper bound for the needed-size search — past this the box is absurd. */
const MAX_SEARCH_PX = 20000;

function isConnection(target: TextFitTarget): target is InteractiveCanvasConnection {
  return (target as InteractiveCanvasConnection).from !== undefined;
}

/** The target object re-measured at a candidate size, carrying the new text. */
function probe(
  object: InteractiveCanvasObject,
  width: number,
  height: number,
  text: string,
): InteractiveCanvasObject {
  return { ...object, text, geometry: { ...object.geometry, width, height } };
}

/**
 * Smallest integer `value >= start` satisfying `fits`, or undefined when even
 * MAX_SEARCH_PX does not. Geometric probe then bisection; `fits` is monotonic
 * in both box dimensions for every slot here (a bigger box never shows less).
 */
function smallestFitting(start: number, fits: (value: number) => boolean): number | undefined {
  const from = Math.max(1, Math.ceil(start));
  if (fits(from)) return from;
  let hi = from;
  while (hi < MAX_SEARCH_PX) {
    hi = Math.min(hi * 2, MAX_SEARCH_PX);
    if (fits(hi)) break;
  }
  if (!fits(hi)) return undefined;
  let lo = from;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Widest single word, in px — the width no wrap can ever reduce. */
function longestWordWidthPx(text: string, fontSizePx: number, fontWeight: number): number {
  let widest = 0;
  for (const hardLine of text.split("\n")) {
    for (const word of hardLine.trim().split(/\s+/)) {
      if (word === "") continue;
      widest = Math.max(widest, measureInterTextPx(word, fontSizePx, fontWeight));
    }
  }
  return widest;
}

function round(size: TextFitSize): TextFitSize {
  return { width: Math.ceil(size.width), height: Math.ceil(size.height) };
}

function fitted(slot: TextFitSlot, detail: string, detailLine?: DetailLineFit): TextFitReport {
  const named = slot === "shape-label" || slot === "section-title";
  return { fits: true, detail, slot, ...(named ? { nameFits: true } : null), ...(detailLine ? { detailLine } : null) };
}

/** The most leading characters of `text` whose run fits `widthPx` whole (no ellipsis). */
function fittingCharCount(text: string, widthPx: number, typography: DetailTypography): number {
  let used = 0;
  let count = 0;
  for (const char of text) {
    used += measureDetailTextPx(char, typography);
    if (used > widthPx) break;
    count += 1;
  }
  return count;
}

/** The detail line as the renderer paints it in `resolved` (renderDetailLine's ellipsis at the slot width). */
function slotDetailFit(text: string, resolved: ResolvedTextSlot, canvasStyle: CanvasStyle): DetailLineFit {
  const totalChars = [...text].length;
  const detail = resolved.detail;
  if (!detail) {
    const typography = detailTypography(canvasStyle);
    return {
      text,
      shown: false,
      truncated: false,
      painted: "",
      fittingChars: fittingCharCount(text, Math.max(0, resolved.rect.width), typography),
      totalChars,
    };
  }
  const painted = ellipsizeDetailText(detail.text, resolved.rect.width, detail.typography);
  return {
    text,
    shown: true,
    truncated: painted !== detail.text,
    painted,
    fittingChars: fittingCharCount(detail.text, resolved.rect.width, detail.typography),
    totalChars,
  };
}

/** A detail line that paints whole. */
function detailWhole(line: DetailLineFit | undefined): boolean {
  return !line || (line.shown && !line.truncated);
}

/** The detail clause of a report line ("" when the detail paints whole). */
function detailClause(line: DetailLineFit | undefined): string {
  if (!line || detailWhole(line)) return "";
  return line.shown
    ? `detail cut to ${line.fittingChars} of ${line.totalChars} chars`
    : "detail line hidden (no room under the name)";
}

// ---------------------------------------------------------------------------
// Shape labels — the center / rect / below slots, wrapped and clamped exactly
// as renderSlotTextBlock does, plus the slot's detail line.
// ---------------------------------------------------------------------------

function shapeLabelReport(
  object: InteractiveCanvasObject,
  size: TextFitSize,
  text: string,
  canvasStyle: CanvasStyle,
): TextFitReport {
  const slot = textSlotForObject(object);
  if (!slot) return fitted("none", "this shape renders no text");

  // The "below" band sizes itself to the text (renderObjectText passes
  // clampToRect: false), so its name never truncates; its detail line still
  // ellipsizes at the band's width.
  const clamps = slot.multiline && slot.placement !== "below";
  const detailText = slotDetailText(object);

  const measured = (width: number, height: number) => {
    const resolved = resolveTextSlot(slot, probe(object, width, height, text), 1, { canvasStyle });
    const { rect, typography } = resolved;
    const lines =
      rect.width > 0 && text !== ""
        ? wrapTextLines(text, rect.width, typography.fontSizePx, typography.fontWeight)
        : [];
    const capacity =
      clamps && rect.height > 0 ? slotNameLineCapacity(resolved) : Number.POSITIVE_INFINITY;
    const detailLine = detailText === "" ? undefined : slotDetailFit(detailText, resolved, canvasStyle);
    return { resolved, rect, typography, lines, capacity, detailLine };
  };

  const nameFits = (at: ReturnType<typeof measured>): boolean => {
    const { lines, capacity, rect, typography } = at;
    if (lines.length === 0 || capacity === Number.POSITIVE_INFINITY) return true;
    // Ask clampLines itself: an unchanged line count means nothing was
    // dropped and no ellipsis was appended.
    return (
      clampLines(lines, capacity, rect.width, typography.fontSizePx, typography.fontWeight)
        .length === lines.length
    );
  };

  const fitsAt = (width: number, height: number): boolean => {
    const at = measured(width, height);
    // renderObjectText bails on a hidden slot; renderSlotTextBlock bails on a
    // zero-width rect. Either way the text is simply not painted.
    if (at.resolved.hidden || at.rect.width <= 0) return false;
    return nameFits(at) && detailWhole(at.detailLine);
  };

  const at = measured(size.width, size.height);
  if (fitsAt(size.width, size.height)) {
    const held = at.capacity === Number.POSITIVE_INFINITY ? "any" : String(at.capacity);
    return fitted(
      "shape-label",
      `label fits at ${fmtSize(size)}: ${at.lines.length} wrapped line(s), the box holds ${held}`,
      at.detailLine,
    );
  }

  // A word wider than the slot breaks mid-word no matter how tall the box is,
  // and a detail line ellipsizes at the slot's width at any height — so width
  // comes first.
  const widestWord = longestWordWidthPx(
    text,
    at.typography.fontSizePx,
    at.typography.fontWeight,
  );
  const detailWidth =
    detailText === "" ? 0 : measureDetailTextPx(detailText, detailTypography(canvasStyle));
  const wideEnough = (rectWidth: number) =>
    rectWidth > 0 && rectWidth >= widestWord && rectWidth >= detailWidth;
  const neededWidth = wideEnough(at.rect.width)
    ? Math.ceil(size.width)
    : (smallestFitting(size.width, (width) =>
        wideEnough(resolveTextSlot(slot, probe(object, width, size.height, text), 1, { canvasStyle }).rect.width),
      ) ?? Math.ceil(size.width));

  const neededHeight = smallestFitting(size.height, (height) => fitsAt(neededWidth, height));
  const detailLine = at.detailLine;
  const painted = !at.resolved.hidden && at.rect.width > 0;
  const nameShown = painted && nameFits(at);
  const extras = { nameFits: nameShown, ...(detailLine ? { detailLine } : null) };
  if (neededHeight === undefined) {
    return {
      fits: false,
      detail: `label clips at ${fmtSize(size)} and no reasonable box holds it — shorten it`,
      slot: "shape-label",
      ...extras,
    };
  }
  const needed = round({ width: neededWidth, height: neededHeight });
  if (!painted) {
    // Hidden slot / no width at all: the text is not painted, period.
    return {
      fits: false,
      neededSize: needed,
      detail: `label paints nothing at ${fmtSize(size)} — needs ${fmtSize(needed)}`,
      slot: "shape-label",
      ...extras,
    };
  }
  const clause = detailClause(detailLine);
  const detail = nameShown
    ? `${clause} at ${fmtSize(size)} — needs ${fmtSize(needed)}`
    : `label clips at ${fmtSize(size)}: ${at.lines.length} wrapped line(s), ` +
      `the box holds ${at.capacity}${clause ? `; ${clause}` : ""} — needs ${fmtSize(needed)}`;
  return {
    fits: false,
    neededSize: needed,
    detail,
    slot: "shape-label",
    ...extras,
  };
}

// ---------------------------------------------------------------------------
// Sticky bodies — markdown line boxes on the 36px pitch.
// ---------------------------------------------------------------------------

function stickyBodyReport(
  object: InteractiveCanvasObject,
  size: TextFitSize,
  text: string,
): TextFitReport {
  const measured = (width: number, height: number) => {
    const resolved = resolveTextSlot(INSET_BODY_TEXT_SLOT, probe(object, width, height, text));
    const { rect, typography } = resolved;
    const rows =
      rect.width > 0 ? layoutStickyText(text, rect.width, typography.fontSizePx) : [];
    const capacity = rect.height > 0 ? Math.max(1, Math.floor(rect.height / STICKY_LINE_PITCH_PX)) : 0;
    return { resolved, rect, rows, capacity };
  };

  const fitsAt = (width: number, height: number): boolean => {
    const { resolved, rect, rows, capacity } = measured(width, height);
    if (resolved.hidden || rect.width <= 0 || rect.height <= 0) return false;
    return rows.length <= capacity;
  };

  const at = measured(size.width, size.height);
  if (fitsAt(size.width, size.height)) {
    return fitted(
      "sticky-body",
      `sticky body fits at ${fmtSize(size)}: ${at.rows.length} row(s), the note holds ${at.capacity}`,
    );
  }

  const neededHeight = smallestFitting(size.height, (height) => fitsAt(size.width, height));
  if (neededHeight === undefined) {
    return {
      fits: false,
      detail: `sticky body clips at ${fmtSize(size)} and no reasonable note holds it — shorten it`,
      slot: "sticky-body",
    };
  }
  const needed = round({ width: size.width, height: neededHeight });
  return {
    fits: false,
    neededSize: needed,
    detail:
      `sticky body clips at ${fmtSize(size)}: ${at.rows.length} row(s), ` +
      `the note holds ${at.capacity} — needs ${fmtSize(needed)}`,
    slot: "sticky-body",
  };
}

// ---------------------------------------------------------------------------
// Section titles — a chip, not a body slot. The chip auto-sizes to its
// content ([icon] TITLE  detail, in the workspace style's header font) and
// ellipsizes at the section's inner width (objects/section/title-chip-layout
// .ts, the layout the renderers draw with) — the detail run gives way first.
// Judged at natural document scale (scale 1): zoomed-out renders
// counter-scale the chip, which only ever clips it sooner.
// ---------------------------------------------------------------------------

function sectionTitleReport(
  object: InteractiveCanvasObject,
  size: TextFitSize,
  text: string,
  canvasStyle: CanvasStyle,
): TextFitReport {
  const layout = titleChipLayout(
    { ...object, text, geometry: { ...object.geometry, width: size.width, height: size.height } },
    canvasStyle,
    1,
  );
  const chip = layout.naturalWidthPx;
  const budget = titleChipMaxWidthPx(size.width, 1);
  const detailLine = sectionDetailFit(layout);
  if (chip <= budget) {
    return fitted(
      "section-title",
      `section title fits at ${fmtSize(size)}: the chip wants ${Math.ceil(chip)}px of ${Math.floor(budget)}px`,
      detailLine,
    );
  }
  const needed = round({
    width: chip + TITLE_CHIP.insetFromSectionCornerPx * 2,
    height: size.height,
  });
  // The detail run gives way first: the title is whole while any of the detail still shows.
  const titleWhole = titleChipVisibleRuns(layout).title === layout.title.text;
  return {
    fits: false,
    neededSize: needed,
    detail: titleWhole && detailLine
      ? `section detail cut at ${fmtSize(size)}: the chip wants ${Math.ceil(chip)}px ` +
        `of ${Math.floor(budget)}px — needs ${needed.width} wide`
      : `section title ellipsizes at ${fmtSize(size)}: the chip wants ${Math.ceil(chip)}px ` +
        `of ${Math.floor(budget)}px — needs ${needed.width} wide`,
    slot: "section-title",
    nameFits: titleWhole,
    ...(detailLine ? { detailLine } : null),
  };
}

/** The header chip's detail run as painted (titleChipVisibleRuns), when the section has a detail. */
function sectionDetailFit(layout: ReturnType<typeof titleChipLayout>): DetailLineFit | undefined {
  const detail = layout.detail;
  if (!detail) return undefined;
  const visible = titleChipVisibleRuns(layout).detail;
  const totalChars = [...detail.text].length;
  const painted = visible ?? "";
  const truncated = visible !== null && visible !== detail.text;
  return {
    text: detail.text,
    shown: visible !== null,
    truncated,
    painted,
    fittingChars: visible === null ? 0 : truncated ? [...visible].length - 1 : totalChars,
    totalChars,
  };
}

// ---------------------------------------------------------------------------
// Edge labels — the fixed-height chip from connectors/label-chip.ts, at the
// size the workspace style draws it. The chip never truncates; it grows, and
// an oversized chip stops fitting where it renders (exactly the
// unreadable-labels finding). `size` is therefore the room available to the
// chip — the corridor between the endpoint boxes.
// ---------------------------------------------------------------------------

function edgeLabelReport(size: TextFitSize, text: string, canvasStyle: CanvasStyle): TextFitReport {
  const chip = connectionLabelChipMetrics(text, canvasStyle);
  const needed = round({
    width: chip.width + CHIP_CLEARANCE * 2,
    height: chip.height + CHIP_CLEARANCE * 2,
  });
  if (needed.width <= size.width && needed.height <= size.height) {
    return fitted(
      "edge-label",
      `edge label fits: the chip wants ${needed.width}px of the ${Math.floor(size.width)}px corridor`,
    );
  }
  return {
    fits: false,
    neededSize: needed,
    detail:
      `edge label crowds its route: the chip wants ${needed.width}×${needed.height} ` +
      `of ${fmtSize(size)} — shorten it or open the gap`,
    slot: "edge-label",
  };
}

function fmtSize(size: TextFitSize): string {
  return `${Math.round(size.width)}×${Math.round(size.height)}`;
}

/**
 * Would `text` render whole in a `size` box on `object`?
 *
 * `size` is the box under consideration — the post-resize geometry for
 * `resize`, the object's current geometry for `update_text`. For a connection
 * target it is the room available to the label chip (the endpoint corridor);
 * pass the current corridor, or `Infinity` to ask only what the chip wants.
 *
 * "Whole" covers the object's one-line `detail` too (shapes, icons, and
 * sections): a detail line that ellipsizes, or that a shape box is too short
 * to paint under the name, fails the fit like a clipped name — and since the
 * name gives up lines to keep the detail, a detail can push a name that fit
 * into clipping. `detailLine` reports the detail line's own state.
 *
 * `neededSize` is the smallest box that shows the text whole, and is present
 * only when `fits` is false. Aspect handling is deliberately simple: the
 * needed HEIGHT is measured at the given width, and the width grows only when
 * a single word or the detail line cannot fit it (or, for a section title,
 * when the chip itself overruns the frame).
 *
 * `canvasStyle` is the workspace style the board renders with (the session's
 * `canvasStyle`); the name weight, the detail font, and the section and
 * edge-label chip sizes come from it.
 */
export function textFitReport(
  object: TextFitTarget,
  size: TextFitSize,
  text: string,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): TextFitReport {
  if (isConnection(object)) {
    if (text.trim() === "") return fitted("none", "no label to fit");
    return edgeLabelReport(size, text, canvasStyle);
  }
  // A section's header carries its own icon and detail (never a slot
  // detail), so an empty title still has a detail run to fit.
  const hasText =
    object.type === "section"
      ? titleChipHasContent({ ...object, text }, canvasStyle)
      : text !== "" || slotDetailText(object) !== "";
  if (!hasText) return fitted("none", "no text to fit");
  if (size.width <= 0 || size.height <= 0) {
    return { fits: false, detail: "a zero-sized box paints no text", slot: "none" };
  }
  if (object.type === "section") return sectionTitleReport(object, size, text, canvasStyle);
  if (effectiveRenderShape(object) === "note") return stickyBodyReport(object, size, text);
  return shapeLabelReport(object, size, text, canvasStyle);
}
