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
 * Parity, not estimation. Every width comes from @codecaine-ai/text-measure
 * (the canvas's theme/text-measure.ts: Pretext line breaking over the active
 * backend — HarfBuzz on the bundled faces in every Bun/Node host), through
 * the functions the static renderer paints with, under the workspace
 * `CanvasStyle` (the name's weight, the detail line's font and size):
 *   - slot geometry     `resolveTextSlot` + `textSlotForObject` (the slot the
 *                        renderer picks, inscribed rects included, and the
 *                        detail line it paints there)
 *   - body wrap/clamp   `wrapTextLines` / `clampLines` (pre-wrap, break-word —
 *                        the stage's slot CSS), the name's clamp shortened by
 *                        the detail line's reserve (`slotNameLineCapacity`)
 *   - detail lines      `ellipsizeDetailText` (the stage's nowrap ellipsis)
 *   - sticky bodies     `layoutStickyText` + `STICKY_LINE_PITCH_PX`
 *   - section titles    `titleChipLayout` + `titleChipMaxWidthPx` (the chip
 *                        as the workspace style draws it: header font, icon,
 *                        detail, border — the one measured layout the
 *                        renderers paint and hit-test with)
 *   - edge labels       `connectionLabelChipMetrics` (connectors/label-chip.ts,
 *                        the chip the renderers draw: the 30px sans chip in
 *                        figjam, the 26px mono chip in the schematic themes —
 *                        the style's connectorLabelHeightPx)
 * Those renderer internals are module-private to the read-only canvas package
 * and are NOT on its public `./render` export surface, so they are deep-
 * imported here — the established pattern (board/lints/geometry.ts does the
 * same for `routeConnection`). test/text-fit-parity.test.ts pins the verdict
 * to actual clipped SVG output; drift fails that test.
 *
 * Three answers, never two. Near a box edge the browser's answer depends on
 * details no measurement reproduces everywhere (1/64 px layout rounding,
 * where a long word's break lands), so every verdict is asked at the box
 * size and at ±TEXT_FIT_TOLERANCE_PX: `fits` when all three agree it fits,
 * `overflows` when all three agree it does not, `borderline` otherwise — "it
 * may wrap", never a finding that blocks. Separately, `reliable` is false
 * when the text holds characters the bundled faces cannot paint (CJK, emoji,
 * …: the browser paints them in per-machine fallback fonts, so their widths
 * are estimates) or the measuring backend is not an exact one; such an answer
 * is reported, never judged — except an overflow that holds even with every
 * uncovered character at zero width, which is `definite`.
 *
 * Scope of `overflows`: TRUNCATION only — a dropped line or an ellipsis, in
 * the name or in its detail line, or a detail line the box is too short to
 * paint at all. Intra-word breaking (a single word wider than the slot) is
 * not truncation, so it does not on its own make text overflow; it does drive
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
  textSlotForObject,
  wrapTextLines,
} from "../../../canvas/src/render/static-svg.ts";
import {
  layoutStickyText,
  STICKY_LINE_PITCH_PX,
  stickyTextUncovered,
} from "../../../canvas/src/render/sticky-text.ts";
import {
  belowBandMaxWidthPx,
  detailFontSpec,
  detailTypography,
  INSET_BODY_TEXT_SLOT,
  resolveTextSlot,
  slotDetailText,
  slotFontSpec,
  slotLineHeightPx,
  slotNameLineCapacity,
  TITLE_CHIP,
  titleChipMaxWidthPx,
  type DetailTypography,
  type ResolvedTextSlot,
} from "../../../canvas/src/objects/text-slots.ts";
import {
  titleChipFontSpec,
  titleChipHasContent,
  titleChipLayout,
  titleChipVisibleRuns,
} from "../../../canvas/src/objects/section/title-chip-layout.ts";
import { connectionLabelChipMetrics, connectionLabelFontSpec } from "../../../canvas/src/connectors/label-chip.ts";
import {
  activeBackend,
  fitText,
  graphemeClusters,
  measureWidth,
  type FitVerdict,
  type FontSpec,
} from "../../../canvas/src/theme/text-measure.ts";

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

/** `fits` / `overflows` hold at the box size and ±TEXT_FIT_TOLERANCE_PX; `borderline` flips inside that band. */
export type TextFitVerdict = FitVerdict;

/**
 * Half-width, px, of the band around the box edge where an answer is
 * `borderline` (text-measure's fitText default): within it the browser may
 * wrap or cut where the measurement does not.
 */
export const TEXT_FIT_TOLERANCE_PX = 1;

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
  /** The verdict at `size` (see TextFitVerdict). */
  verdict: TextFitVerdict;
  /** True when the verdict is `fits`: the render shows the text whole (name and detail line), with margin. */
  fits: boolean;
  /**
   * False when the answer is an estimate: the text holds characters the
   * bundled faces lack (`uncovered`), or the measuring backend is not exact.
   * Report such an answer; never block on it — unless it is `definite`.
   */
  reliable: boolean;
  /**
   * The verdict holds whatever the uncertain parts measure: the answer is
   * reliable, or it is an overflow that remains with every uncovered
   * character at zero width (forced rows, or a margin no fallback glyph can
   * close). Lints judge — and block on — definite overflows only.
   */
  definite: boolean;
  /** Characters (grapheme clusters) the bundled faces cannot paint, when there are any. */
  uncovered?: string[];
  /** Smallest box that surely shows it whole. Present whenever the verdict is not `fits`. */
  neededSize?: TextFitSize;
  /** One short line, emitted verbatim as an `OpOutcome.notes` entry. */
  detail: string;
  /** The rendering path this verdict came from. */
  slot: TextFitSlot;
  /**
   * Whether the name alone shows whole (no dropped line, no ellipsis) at the
   * box size — present on shape-label and section-title reports, so a caller
   * can tell a cut name from a cut detail line.
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

/** The three-state verdict of a yes/no question asked at the box size and at ±TEXT_FIT_TOLERANCE_PX. */
function threeState(answers: readonly boolean[]): TextFitVerdict {
  if (answers.every(Boolean)) return "fits";
  return answers.some(Boolean) ? "borderline" : "overflows";
}

/** The worse of two verdicts (overflows > borderline > fits). */
function worse(a: TextFitVerdict, b: TextFitVerdict): TextFitVerdict {
  if (a === "overflows" || b === "overflows") return "overflows";
  return a === "borderline" || b === "borderline" ? "borderline" : "fits";
}

/**
 * `text` with every grapheme in `missing` replaced by a zero-width space: the
 * least room the text can take (no fallback glyph paints narrower than
 * nothing) with the same break opportunity at each replaced position.
 */
function atZeroWidth(text: string, missing: ReadonlySet<string>): string {
  if (missing.size === 0) return text;
  return graphemeClusters(text)
    .map((grapheme) => (missing.has(grapheme) ? "\u200B" : grapheme))
    .join("");
}

type MeasuredPart = readonly [text: string, font: FontSpec, whiteSpace?: "normal" | "pre-wrap"];

/** Why measuring `text` in `font` is not exact (fitText's own reasons), and the graphemes the face lacks. */
function partReliability(text: string, font: FontSpec, whiteSpace: "normal" | "pre-wrap"): { reasons: string[]; uncovered: string[] } {
  const key = `${activeBackend().name}|${whiteSpace}|${JSON.stringify(font)}|${text}`;
  const cached = reliabilityCache.get(key);
  if (cached) return cached;
  const fit = fitText(text, font, { width: Number.POSITIVE_INFINITY, lineHeight: 1, whiteSpace });
  const result = { reasons: [...fit.reasons], uncovered: [...fit.uncovered] };
  if (reliabilityCache.size > 20_000) reliabilityCache.clear();
  reliabilityCache.set(key, result);
  return result;
}
const reliabilityCache = new Map<string, { reasons: string[]; uncovered: string[] }>();

/**
 * Reliability fields from text-measure's own verdict on the real text of
 * every part: an exact backend, a bundled family at a weight it paints as
 * is, and text its guarantee covers (no uncovered glyphs, control
 * characters, bidi, tabs, soft hyphens, oversized input).
 */
function reliability(parts: ReadonlyArray<MeasuredPart>): Pick<TextFitReport, "reliable" | "definite" | "uncovered"> {
  const reasons = new Set<string>();
  const uncovered = new Set<string>();
  for (const [text, font, whiteSpace = "pre-wrap"] of parts) {
    const part = partReliability(text, font, whiteSpace);
    for (const reason of part.reasons) reasons.add(reason);
    for (const grapheme of part.uncovered) uncovered.add(grapheme);
  }
  const reliable = reasons.size === 0;
  // textFitReport upgrades an unreliable overflow to definite when it holds at zero-width glyphs.
  return { reliable, definite: reliable, ...(uncovered.size > 0 ? { uncovered: [...uncovered] } : null) };
}

/**
 * The widest whitespace-separated word of `text`, in px — the width below
 * which some word must break mid-word (a sizing hint for neededSize; the
 * browser can also break after hyphens and dashes, so this errs wide).
 */
function longestWordWidthPx(text: string, font: FontSpec): number {
  let widest = 0;
  for (const word of text.split(/\s+/)) {
    if (word !== "") widest = Math.max(widest, measureWidth(word, font));
  }
  return widest;
}

function round(size: TextFitSize): TextFitSize {
  return { width: Math.ceil(size.width), height: Math.ceil(size.height) };
}

/** The "may wrap" / "estimated" clause a borderline or unreliable report ends with ("" otherwise). */
function cautionClause(verdict: TextFitVerdict, reliable: boolean, uncovered?: string[]): string {
  const parts: string[] = [];
  if (verdict === "borderline") parts.push(`within ${TEXT_FIT_TOLERANCE_PX}px of the box edge — it may wrap or clip, can't promise`);
  if (!reliable) {
    parts.push(
      uncovered && uncovered.length > 0
        ? `estimated: the bundled fonts lack ${uncovered.map((g) => JSON.stringify(g)).join(" ")}, so the browser paints them in fallback fonts`
        : "estimated: the text measurement is not exact here",
    );
  }
  return parts.join("; ");
}

/** The most leading graphemes of `text` whose run fits `widthPx` whole (no ellipsis). */
function fittingCharCount(text: string, widthPx: number, typography: DetailTypography): number {
  const font = detailFontSpec(typography);
  const parts = graphemeClusters(text);
  let low = 0;
  let high = parts.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measureWidth(parts.slice(0, mid).join(""), font) <= widthPx) low = mid;
    else high = mid - 1;
  }
  return low;
}

/** The detail line as the renderer paints it in `resolved` (renderDetailLine's ellipsis at the slot width). */
function slotDetailFit(text: string, resolved: ResolvedTextSlot, canvasStyle: CanvasStyle): DetailLineFit {
  const totalChars = graphemeClusters(text).length;
  const detail = resolved.detail;
  if (!detail) {
    return {
      text,
      shown: false,
      truncated: false,
      painted: "",
      fittingChars: fittingCharCount(text, Math.max(0, resolved.rect.width), detailTypography(canvasStyle)),
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
  if (!slot) {
    return { verdict: "fits", fits: true, reliable: true, definite: true, detail: "this shape renders no text", slot: "none" };
  }

  // The "below" band sizes itself to the text (renderObjectText passes
  // clampToRect: false), so its name never truncates; its detail line still
  // ellipsizes at the band's width.
  const clamps = slot.multiline && slot.placement !== "below";
  const detailText = slotDetailText(object);

  /**
   * The width the detail line is judged against: the slot's own width in a
   * shape, the band's max width in an icon caption — the band sizes itself to
   * its widest line, so the detail is cut only past that cap.
   */
  const detailRoomFor = (probed: InteractiveCanvasObject, rectWidth: number) =>
    slot.placement === "below" ? belowBandMaxWidthPx(probed) : rectWidth;

  // Wrapping and fit answers depend on the slot width (and the line limit),
  // not on the probe: the needed-size searches reuse them.
  const wrapCache = new Map<number, string[]>();
  const fitCache = new Map<string, TextFitVerdict>();
  const cachedFit = (key: string, compute: () => TextFitVerdict): TextFitVerdict => {
    let verdict = fitCache.get(key);
    if (verdict === undefined) {
      verdict = compute();
      fitCache.set(key, verdict);
    }
    return verdict;
  };

  const measured = (width: number, height: number) => {
    const probed = probe(object, width, height, text);
    const resolved = resolveTextSlot(slot, probed, 1, { canvasStyle });
    const { rect, typography } = resolved;
    let lines = wrapCache.get(rect.width);
    if (lines === undefined) {
      lines = rect.width > 0 ? wrapTextLines(text, rect.width, typography) : [];
      wrapCache.set(rect.width, lines);
    }
    const capacity =
      clamps && rect.height > 0 ? slotNameLineCapacity(resolved) : Number.POSITIVE_INFINITY;
    const detailLine = detailText === "" ? undefined : slotDetailFit(detailText, resolved, canvasStyle);
    return { resolved, rect, typography, lines, capacity, detailLine, detailRoom: detailRoomFor(probed, rect.width) };
  };
  type Measured = ReturnType<typeof measured>;

  /** The name's verdict: its clamp at the slot width and at ±tolerance (text-measure's fitText). */
  const nameVerdict = (at: Measured): TextFitVerdict => {
    const { rect, typography, capacity } = at;
    if (text === "" || capacity === Number.POSITIVE_INFINITY) return "fits";
    return cachedFit(`name|${rect.width}|${capacity}`, () =>
      fitText(
        text,
        slotFontSpec(typography),
        { width: rect.width, lineHeight: slotLineHeightPx(typography), maxLines: capacity, whiteSpace: "pre-wrap" },
        { tolerance: TEXT_FIT_TOLERANCE_PX },
      ).verdict,
    );
  };

  /** The detail's verdict: one nowrap line in its room and at ±tolerance, or a hidden line. */
  const detailVerdict = (at: Measured): TextFitVerdict => {
    if (detailText === "") return "fits";
    const detail = at.resolved.detail;
    if (!detail) return "overflows";
    return cachedFit(`detail|${at.detailRoom}`, () =>
      fitText(
        detail.text,
        detailFontSpec(detail.typography),
        { width: at.detailRoom, lineHeight: detail.typography.lineHeightPx, maxLines: 1 },
        { tolerance: TEXT_FIT_TOLERANCE_PX },
      ).verdict,
    );
  };

  const verdictAt = (at: Measured): TextFitVerdict => {
    // renderObjectText bails on a hidden slot; renderSlotTextBlock bails on a
    // zero-width rect. Either way the text is simply not painted.
    if (at.resolved.hidden || at.rect.width <= 0) return "overflows";
    return worse(nameVerdict(at), detailVerdict(at));
  };

  /** The renderer's own answer at exactly this box: no dropped line, no ellipsis. */
  const nameShownAt = (at: Measured): boolean => {
    const { lines, capacity, rect, typography } = at;
    if (lines.length === 0 || capacity === Number.POSITIVE_INFINITY) return true;
    // Ask clampLines itself: an unchanged line count means nothing was
    // dropped and no ellipsis was appended.
    return clampLines(lines, capacity, rect.width, typography).length === lines.length;
  };

  const at = measured(size.width, size.height);
  const verdict = verdictAt(at);
  const font = slotFontSpec(at.typography);
  const detailFont = detailFontSpec(detailTypography(canvasStyle));
  const measuredParts: MeasuredPart[] = [
    ...(text === "" ? [] : [[text, font, "pre-wrap"] as const]),
    ...(detailText === "" ? [] : [[detailText, detailFont, "normal"] as const]),
  ];
  const reliable = reliability(measuredParts);
  const caution = cautionClause(verdict, reliable.reliable, reliable.uncovered);
  const detailLine = at.detailLine;

  if (verdict === "fits") {
    const held = at.capacity === Number.POSITIVE_INFINITY ? "any" : String(at.capacity);
    return {
      verdict,
      fits: true,
      ...reliable,
      detail: `label fits at ${fmtSize(size)}: ${at.lines.length} wrapped line(s), the box holds ${held}${caution ? ` (${caution})` : ""}`,
      slot: "shape-label",
      nameFits: true,
      ...(detailLine ? { detailLine } : null),
    };
  }

  // A word wider than the slot breaks mid-word no matter how tall the box is,
  // and a detail line ellipsizes at the slot's width at any height — so width
  // comes first.
  const widestWord = longestWordWidthPx(text, font) + TEXT_FIT_TOLERANCE_PX;
  const detailWidth = detailText === "" ? 0 : measureWidth(detailText, detailFont) + TEXT_FIT_TOLERANCE_PX;
  // A caption band sizes itself to its lines, so only its detail can need more width.
  const nameRoom = (rectWidth: number) => (slot.placement === "below" ? Number.POSITIVE_INFINITY : rectWidth);
  const wideEnough = (rectWidth: number, detailRoom: number) =>
    rectWidth > 0 && nameRoom(rectWidth) >= widestWord && detailRoom >= detailWidth;
  const neededWidth = wideEnough(at.rect.width, at.detailRoom)
    ? Math.ceil(size.width)
    : (smallestFitting(size.width, (width) => {
        const probed = probe(object, width, size.height, text);
        const rectWidth = resolveTextSlot(slot, probed, 1, { canvasStyle }).rect.width;
        return wideEnough(rectWidth, detailRoomFor(probed, rectWidth));
      }) ?? Math.ceil(size.width));

  const surelyFits = (width: number, height: number) => verdictAt(measured(width, height)) === "fits";
  const neededHeight = smallestFitting(size.height, (height) => surelyFits(neededWidth, height));
  const painted = !at.resolved.hidden && at.rect.width > 0;
  const nameShown = painted && nameShownAt(at);
  const extras = { nameFits: nameShown, ...(detailLine ? { detailLine } : null) };
  const base = { verdict, fits: false, ...reliable, slot: "shape-label" as const, ...extras };
  if (neededHeight === undefined) {
    return {
      ...base,
      detail: `label clips at ${fmtSize(size)} and no reasonable box holds it — shorten it`,
    };
  }
  const needed = round({ width: neededWidth, height: neededHeight });
  if (!painted) {
    // Hidden slot / no width at all: the text is not painted, period.
    return {
      ...base,
      neededSize: needed,
      detail: `label paints nothing at ${fmtSize(size)} — needs ${fmtSize(needed)}`,
    };
  }
  if (verdict === "borderline") {
    return {
      ...base,
      neededSize: needed,
      detail:
        `label may not fit at ${fmtSize(size)}: ${at.lines.length} wrapped line(s), the box holds ` +
        `${at.capacity === Number.POSITIVE_INFINITY ? "any" : at.capacity} (${caution}) — ${fmtSize(needed)} surely fits`,
    };
  }
  const clause = detailClause(detailLine);
  const tail = caution ? ` (${caution})` : "";
  const detail = nameShown
    ? `${clause || "label clips"} at ${fmtSize(size)} — needs ${fmtSize(needed)}${tail}`
    : `label clips at ${fmtSize(size)}: ${at.lines.length} wrapped line(s), ` +
      `the box holds ${at.capacity}${clause ? `; ${clause}` : ""} — needs ${fmtSize(needed)}${tail}`;
  return { ...base, neededSize: needed, detail };
}

// ---------------------------------------------------------------------------
// Sticky bodies — markdown line boxes on the 36px pitch.
// ---------------------------------------------------------------------------

function stickyBodyReport(
  object: InteractiveCanvasObject,
  size: TextFitSize,
  text: string,
): TextFitReport {
  // Rows depend on the slot width only: a height search must not wrap the
  // same text again for every probe.
  const rowCache = new Map<string, number>();
  const measured = (width: number, height: number) => {
    const resolved = resolveTextSlot(INSET_BODY_TEXT_SLOT, probe(object, width, height, text));
    const { rect, typography } = resolved;
    // A slot with no width holds no row at all.
    const rowsAt = (slotWidth: number): number => {
      if (slotWidth <= 0) return Number.POSITIVE_INFINITY;
      const key = `${slotWidth}|${typography.fontSizePx}`;
      let rows = rowCache.get(key);
      if (rows === undefined) {
        rows = layoutStickyText(text, slotWidth, typography.fontSizePx).length;
        rowCache.set(key, rows);
      }
      return rows;
    };
    const capacity = rect.height > 0 ? Math.max(1, Math.floor(rect.height / STICKY_LINE_PITCH_PX)) : 0;
    return {
      resolved,
      rect,
      rows: rect.width > 0 ? rowsAt(rect.width) : 0,
      rowsAt,
      capacity,
      fontSizePx: typography.fontSizePx,
    };
  };

  const verdictAt = (width: number, height: number): TextFitVerdict => {
    const at = measured(width, height);
    if (at.resolved.hidden || at.rect.width <= 0 || at.rect.height <= 0) return "overflows";
    // The narrow probe never drops below a pixel: a slot that thin is judged as it is.
    const narrow = Math.max(Math.min(at.rect.width, 1), at.rect.width - TEXT_FIT_TOLERANCE_PX);
    return threeState(
      [narrow, at.rect.width, at.rect.width + TEXT_FIT_TOLERANCE_PX].map(
        (slotWidth) => at.rowsAt(slotWidth) <= at.capacity,
      ),
    );
  };

  const at = measured(size.width, size.height);
  const verdict = verdictAt(size.width, size.height);
  // Body, bold and code runs are all bundled faces: what can make the answer
  // an estimate is an uncovered character or an inexact backend.
  const bodyReliable = reliability([[text, { family: "Inter", size: at.fontSizePx, weight: 400 }]]);
  const runUncovered = stickyTextUncovered(text);
  const reliable =
    runUncovered.length === 0
      ? bodyReliable
      : {
          reliable: false,
          definite: false,
          uncovered: [...new Set([...(bodyReliable.uncovered ?? []), ...runUncovered])],
        };
  const caution = cautionClause(verdict, reliable.reliable, reliable.uncovered);
  if (verdict === "fits") {
    return {
      verdict,
      fits: true,
      ...reliable,
      detail: `sticky body fits at ${fmtSize(size)}: ${at.rows} row(s), the note holds ${at.capacity}${caution ? ` (${caution})` : ""}`,
      slot: "sticky-body",
    };
  }

  const neededHeight = smallestFitting(size.height, (height) => verdictAt(size.width, height) === "fits");
  const base = { verdict, fits: false, ...reliable, slot: "sticky-body" as const };
  if (neededHeight === undefined) {
    return { ...base, detail: `sticky body clips at ${fmtSize(size)} and no reasonable note holds it — shorten it` };
  }
  const needed = round({ width: size.width, height: neededHeight });
  return {
    ...base,
    neededSize: needed,
    detail:
      verdict === "borderline"
        ? `sticky body may not fit at ${fmtSize(size)}: ${at.rows} row(s), the note holds ${at.capacity} ` +
          `(${caution}) — ${fmtSize(needed)} surely fits`
        : `sticky body clips at ${fmtSize(size)}: ${at.rows} row(s), ` +
          `the note holds ${at.capacity} — needs ${fmtSize(needed)}${caution ? ` (${caution})` : ""}`,
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
  const verdict = threeState(
    [budget - TEXT_FIT_TOLERANCE_PX, budget, budget + TEXT_FIT_TOLERANCE_PX].map((room) => chip <= room),
  );
  const runs: Array<readonly [string, FontSpec]> = [
    [layout.title.text, titleChipFontSpec(layout.title.font)],
    ...(layout.detail ? [[layout.detail.text, titleChipFontSpec(layout.detail.font)] as const] : []),
  ];
  const reliable = reliability(runs.map(([runText, runFont]) => [runText, runFont, "normal"] as const));
  const caution = cautionClause(verdict, reliable.reliable, reliable.uncovered);
  const wants = `the chip wants ${Math.ceil(chip)}px of ${Math.floor(budget)}px`;
  if (verdict === "fits") {
    return {
      verdict,
      fits: true,
      ...reliable,
      detail: `section title fits at ${fmtSize(size)}: ${wants}${caution ? ` (${caution})` : ""}`,
      slot: "section-title",
      nameFits: true,
      ...(detailLine ? { detailLine } : null),
    };
  }
  const needed = round({
    width: chip + TITLE_CHIP.insetFromSectionCornerPx * 2 + TEXT_FIT_TOLERANCE_PX,
    height: size.height,
  });
  // The detail run gives way first: the title is whole while any of the detail still shows.
  const titleWhole = titleChipVisibleRuns(layout).title === layout.title.text;
  const base = {
    verdict,
    fits: false,
    ...reliable,
    neededSize: needed,
    slot: "section-title" as const,
    nameFits: titleWhole,
    ...(detailLine ? { detailLine } : null),
  };
  if (verdict === "borderline") {
    return { ...base, detail: `section title may not fit at ${fmtSize(size)}: ${wants} (${caution}) — needs ${needed.width} wide to be sure` };
  }
  const tail = caution ? ` (${caution})` : "";
  return {
    ...base,
    detail: titleWhole && detailLine
      ? `section detail cut at ${fmtSize(size)}: ${wants} — needs ${needed.width} wide${tail}`
      : `section title ellipsizes at ${fmtSize(size)}: ${wants} — needs ${needed.width} wide${tail}`,
  };
}

/** The header chip's detail run as painted (titleChipVisibleRuns), when the section has a detail. */
function sectionDetailFit(layout: ReturnType<typeof titleChipLayout>): DetailLineFit | undefined {
  const detail = layout.detail;
  if (!detail) return undefined;
  const visible = titleChipVisibleRuns(layout).detail;
  const totalChars = graphemeClusters(detail.text).length;
  const painted = visible ?? "";
  const truncated = visible !== null && visible !== detail.text;
  return {
    text: detail.text,
    shown: visible !== null,
    truncated,
    painted,
    fittingChars: visible === null ? 0 : truncated ? graphemeClusters(visible).length - 1 : totalChars,
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
  const wantsWidth = chip.width + CHIP_CLEARANCE * 2;
  const wantsHeight = chip.height + CHIP_CLEARANCE * 2;
  const needed = round({ width: wantsWidth + TEXT_FIT_TOLERANCE_PX, height: wantsHeight });
  const verdict =
    wantsHeight > size.height
      ? "overflows"
      : threeState(
          [size.width - TEXT_FIT_TOLERANCE_PX, size.width, size.width + TEXT_FIT_TOLERANCE_PX].map(
            (room) => wantsWidth <= room,
          ),
        );
  const labelFont = connectionLabelFontSpec(canvasStyle);
  const reliable = reliability([[text, labelFont, "normal"]]);
  const caution = cautionClause(verdict, reliable.reliable, reliable.uncovered);
  const tail = caution ? ` (${caution})` : "";
  if (verdict === "fits") {
    return {
      verdict,
      fits: true,
      ...reliable,
      detail: `edge label fits: the chip wants ${Math.ceil(wantsWidth)}px of the ${Math.floor(size.width)}px corridor${tail}`,
      slot: "edge-label",
    };
  }
  return {
    verdict,
    fits: false,
    ...reliable,
    neededSize: needed,
    detail:
      verdict === "borderline"
        ? `edge label may crowd its route: the chip wants ${Math.ceil(wantsWidth)}×${Math.ceil(wantsHeight)} of ${fmtSize(size)}${tail}`
        : `edge label crowds its route: the chip wants ${Math.ceil(wantsWidth)}×${Math.ceil(wantsHeight)} ` +
          `of ${fmtSize(size)} — shorten it or open the gap${tail}`,
    slot: "edge-label",
  };
}

function fmtSize(size: TextFitSize): string {
  return `${Math.round(size.width)}×${Math.round(size.height)}`;
}

/** A report for a target with nothing to measure. */
function nothingToFit(slot: TextFitSlot, detail: string): TextFitReport {
  return { verdict: "fits", fits: true, reliable: true, definite: true, detail, slot };
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
 * `verdict` is three-state (see the module doc): `borderline` answers and
 * `reliable: false` answers are things to say, never to block on — unless
 * the report is `definite` (an overflow that holds even with every uncovered
 * character at zero width).
 * `neededSize` is the smallest box that surely shows the text whole, present
 * whenever the verdict is not `fits`. Aspect handling is deliberately simple:
 * the needed HEIGHT is measured at the given width, and the width grows only
 * when a single word or the detail line cannot fit it (or, for a section
 * title, when the chip itself overruns the frame).
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
  const report = measuredReport(object, size, text, canvasStyle);
  if (report.verdict !== "overflows" || report.definite || !report.uncovered?.length) return report;
  // An overflow over glyphs the bundled faces lack: ask again with every one
  // of them at zero width. If even that overflows — forced rows, or more text
  // than any fallback glyph can make room for — the overflow is definite.
  const missing = new Set(report.uncovered);
  const leastText = atZeroWidth(text, missing);
  const leastObject = isConnection(object)
    ? object
    : { ...object, ...(typeof object.detail === "string" ? { detail: atZeroWidth(object.detail, missing) } : null) };
  const least = measuredReport(leastObject, size, leastText, canvasStyle);
  if (least.verdict !== "overflows" || !least.reliable) return report;
  return {
    ...report,
    definite: true,
    detail: report.detail.replace(
      /estimated: the bundled fonts lack ([^)]*?), so the browser paints them in fallback fonts/,
      "it clips even if $1 paint at no width",
    ),
  };
}

/** The verdict for one target, before textFitReport's definite-overflow check. */
function measuredReport(
  object: TextFitTarget,
  size: TextFitSize,
  text: string,
  canvasStyle: CanvasStyle,
): TextFitReport {
  if (isConnection(object)) {
    if (text.trim() === "") return nothingToFit("none", "no label to fit");
    return edgeLabelReport(size, text, canvasStyle);
  }
  // A section's header carries its own icon and detail (never a slot
  // detail), so an empty title still has a detail run to fit.
  const hasText =
    object.type === "section"
      ? titleChipHasContent({ ...object, text }, canvasStyle)
      : text !== "" || slotDetailText(object) !== "";
  if (!hasText) return nothingToFit("none", "no text to fit");
  if (size.width <= 0 || size.height <= 0) {
    return {
      verdict: "overflows",
      fits: false,
      reliable: true,
      definite: true,
      detail: "a zero-sized box paints no text",
      slot: "none",
    };
  }
  if (object.type === "section") return sectionTitleReport(object, size, text, canvasStyle);
  if (effectiveRenderShape(object) === "note") return stickyBodyReport(object, size, text);
  return shapeLabelReport(object, size, text, canvasStyle);
}
