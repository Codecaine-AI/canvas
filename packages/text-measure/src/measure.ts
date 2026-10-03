/**
 * The synchronous API: single-line widths (whole-run shaping through the
 * active backend), wrapping (Pretext line breaking) and fit verdicts.
 */

import { getBackend, isExactFor, measureRunPx } from "./backend.ts";
import { uncoveredGraphemes } from "./coverage.ts";
import { matchFace } from "./faces.ts";
import { bundledFamilyOf, resolveFont, splitFamilies, type ResolvedFont } from "./font.ts";
import { pretext } from "./pretext-binding.ts";
import { applyContextualWidths } from "./pretext-context.ts";
import { alignBreakOpportunities } from "./pretext-segments.ts";
import { collapseWhitespace, countSpacingGraphemes, hasBidi, hasControlCharacters, hasPreservedTab, stripPreWrapControls } from "./text.ts";
import type { FitBox, FitOptions, FitResult, FontSpec, TextLine, UnreliableReason, WrapOptions, WrapResult } from "./types.ts";

type Pretext = ReturnType<typeof pretext>;
type Prepared = ReturnType<Pretext["prepareWithSegments"]>;
export type WhiteSpace = "normal" | "pre-wrap";

/** Pretext's line-fit epsilon for Chromium and headless (lineFitEpsilon in its engine profile). */
const FIT_EPSILON = 0.005;

/**
 * Longest text (UTF-16 units) fitText answers exactly. Longer input still
 * lays out, but HarfBuzz shapes runs this long in chunks and very long
 * unbreakable runs keep approximate break advances, so its answers are
 * flagged "oversized-input".
 */
export const MAX_EXACT_UNITS = 16_384;

/**
 * Chromium lays out in 1/64 px units (LayoutUnit): a text run's width rounds
 * up to the next unit and a box width rounds down. Widths we report are in
 * those units, so a box exactly measureWidth() wide holds the text.
 */
export function ceilLayoutUnit(px: number): number {
  // "+ 0" turns the -0 that Math.ceil gives for (-1e-6, 0] into 0.
  return Number.isFinite(px) ? Math.ceil(px * 64 - 1e-6) / 64 + 0 : px;
}

export function floorLayoutUnit(px: number): number {
  return Number.isFinite(px) ? Math.floor(px * 64 + 1e-6) / 64 : px;
}

/**
 * The widest line Chromium keeps in a box `boxWidth` px wide: it floors the
 * box to layout units and fits a line while the line's width, rounded up to
 * a layout unit, is at most one unit more (NGLineBreaker's
 * AvailableWidthToFit, AvailableWidth().AddEpsilon()). So text overflowing
 * the box by up to 1/64 px stays on its line; measureWidth(text) - 1/64 still
 * holds `text` on one line.
 */
export function lineFitLimit(boxWidth: number): number {
  return Number.isFinite(boxWidth) ? floorLayoutUnit(boxWidth) + 1 / 64 + 1e-6 : boxWidth;
}

/** The max width to hand Pretext so that its fit test (width + its 0.005 epsilon) is Chromium's lineFitLimit. */
export function pretextMaxWidth(boxWidth: number): number {
  return Number.isFinite(boxWidth) ? lineFitLimit(boxWidth) - FIT_EPSILON : boxWidth;
}

export function assertNumber(value: unknown, what: string, opts: { min?: number; allowInfinity?: boolean } = {}): number {
  const ok =
    typeof value === "number" &&
    !Number.isNaN(value) &&
    (opts.allowInfinity ? value !== -Infinity : Number.isFinite(value)) &&
    (opts.min === undefined || value >= opts.min);
  if (!ok) throw new TypeError(`text-measure: ${what} must be a number${opts.min !== undefined ? ` >= ${opts.min}` : ""}, got ${String(value)}`);
  return value as number;
}

export function whiteSpaceOf(value: unknown): WhiteSpace {
  if (value === undefined || value === "normal") return "normal";
  if (value === "pre-wrap") return "pre-wrap";
  throw new TypeError(`text-measure: whiteSpace must be "normal" or "pre-wrap", got ${String(value)}`);
}

/**
 * The text Pretext lays out for `whiteSpace`: pre-wrap drops carriage
 * returns and form feeds the way Chromium does (CR LF is one line break, a
 * lone CR or FF is nothing); normal leaves them to Pretext's whitespace
 * collapsing (a CR collapses like a space there).
 */
export function layoutText(text: string, whiteSpace: WhiteSpace): string {
  return whiteSpace === "pre-wrap" ? stripPreWrapControls(text) : text;
}

/** Painted width of one line: the text shaped as one run plus letter-spacing after every grapheme, never below 0. */
function lineWidthPx(text: string, font: ResolvedFont): number {
  if (text === "") return 0;
  let width = measureRunPx(text, font.face, font.size, font.ligatures);
  if (font.letterSpacing !== 0) width += font.letterSpacing * countSpacingGraphemes(text);
  // Negative letter-spacing can pull the advances below zero; a box (and Chromium's line) is never narrower than 0.
  return ceilLayoutUnit(Math.max(0, width));
}

/**
 * Width of a laid-out line's visible text. Trailing spaces collapse
 * (normal) or hang (pre-wrap), so they are not part of it. Lines with tabs
 * keep Pretext's width, which places tab stops.
 */
function visibleLineWidth(line: { text: string; width: number }, font: ResolvedFont): number {
  const visible = line.text.replace(/ +$/, "");
  if (visible.includes("\t")) return ceilLayoutUnit(Math.max(0, line.width));
  if (visible === "" || visible.length === line.text.length) return lineWidthPx(visible, font);
  // A line ending in spaces keeps the kerning of its last glyph with the first space (Chromium's line box does).
  let width = measureRunPx(visible + " ", font.face, font.size, font.ligatures) - measureRunPx(" ", font.face, font.size, font.ligatures);
  if (font.letterSpacing !== 0) width += font.letterSpacing * countSpacingGraphemes(visible);
  return ceilLayoutUnit(Math.max(0, width));
}

interface PreparedText {
  prepared: Prepared;
  /** Paragraphs Pretext lays out as no line but Chromium shows as one (see blankParagraphs). */
  blanks: BlankParagraph[];
  /** Some unbreakable run was too long for contextual break advances (pretext-context.ts). */
  approximated: boolean;
}

/** Pretext's prepared text with segment widths corrected for shaping across segments (pretext-context.ts). */
function prepare(P: Pretext, text: string, font: ResolvedFont, whiteSpace: WhiteSpace): PreparedText {
  const prepared = P.prepareWithSegments(layoutText(text, whiteSpace), font.key, font.letterSpacing === 0 ? { whiteSpace } : { whiteSpace, letterSpacing: font.letterSpacing });
  alignBreakOpportunities(prepared);
  const approximated = applyContextualWidths(prepared, font, text.length <= MAX_EXACT_UNITS);
  keepZeroWidthSpacesAtLineStart(prepared);
  return { prepared, blanks: blankParagraphs(prepared), approximated };
}

/**
 * Chromium keeps a zero-width space that starts a line (it is a character,
 * not collapsible white space): "​" alone is one line, and when what
 * follows it does not fit, the break after it is taken first ("​AV" in
 * a box narrower than "AV" is three lines: ZWSP, "A", "V"). Pretext consumes
 * a ZWSP at a line start like a space. Relabelling its segments as
 * preserved spaces (zero width, a break after, hanging at a line end, no
 * letter-spacing since the prepared counts stay 0) gives Chromium's lines.
 * Run after the contextual widths, which still read them as ZWSP.
 */
export function keepZeroWidthSpacesAtLineStart(prepared: unknown): void {
  const kinds = (prepared as { kinds?: unknown } | null)?.kinds;
  if (!Array.isArray(kinds)) return;
  for (let i = 0; i < kinds.length; i++) if (kinds[i] === "zero-width-break") kinds[i] = "preserved-space";
}

/** A paragraph Pretext skips: its segments [start, end) (end past its hard break, if any) and the text of its one line. */
export interface BlankParagraph {
  start: number;
  end: number;
  text: string;
}

interface PreparedChunks {
  segments: string[];
  kinds: string[];
  chunks: Array<{ startSegmentIndex: number; endSegmentIndex: number; consumedEndSegmentIndex: number }>;
}

/**
 * Paragraphs (Pretext's chunks, split at hard breaks) made only of soft
 * hyphens and collapsible spaces. Pretext consumes those segments at a line
 * start and lays such a paragraph out as no line at all; Chromium gives it
 * one empty-looking line box ("­" alone is one line). Width-independent,
 * so the line count of every layout grows by blankParagraphs().length.
 */
export function blankParagraphs(prepared: unknown): BlankParagraph[] {
  const p = prepared as Partial<PreparedChunks> | null;
  if (!p || !Array.isArray(p.kinds) || !Array.isArray(p.chunks) || !Array.isArray(p.segments)) return [];
  let out: BlankParagraph[] | null = null;
  for (const chunk of p.chunks) {
    if (chunk.endSegmentIndex <= chunk.startSegmentIndex) continue; // an empty line Pretext already shows
    let blank = true;
    let invisible = false;
    let text = "";
    for (let i = chunk.startSegmentIndex; i < chunk.endSegmentIndex; i++) {
      const kind = p.kinds[i];
      if (kind === "zero-width-break" || kind === "soft-hyphen") invisible = true;
      else if (kind !== "space") {
        blank = false;
        break;
      }
      if (kind !== "soft-hyphen") text += p.segments[i];
    }
    if (blank && invisible) (out ??= []).push({ start: chunk.startSegmentIndex, end: chunk.consumedEndSegmentIndex, text });
  }
  return out ?? [];
}

/** Segments that never stick out of a line: they collapse or hang at its end, or take no room of their own. */
const HANGING_KINDS = new Set(["space", "preserved-space", "zero-width-break", "soft-hyphen", "hard-break", "tab"]);

/**
 * The widest unit that must sit alone on a line (a segment that cannot break,
 * or one grapheme of one that can), letter-spacing after it included: with
 * overflow-wrap: break-word only such a unit overflows a box sideways.
 * Pretext's own answer (its lines at width 0) also counts preserved spaces
 * and tabs that hang after a unit in pre-wrap, which Chromium never lets
 * overflow, so text that has them is measured unit by unit instead.
 */
function widestUnit(P: Pretext, prepared: Prepared): number {
  const p = prepared as unknown as {
    kinds?: string[];
    widths?: number[];
    breakableFitAdvances?: Array<ArrayLike<number> | null>;
    spacingGraphemeCounts?: number[];
    letterSpacing?: number;
  };
  const { kinds, widths, breakableFitAdvances: advances } = p;
  if (!Array.isArray(kinds) || !Array.isArray(widths) || !Array.isArray(advances) || !kinds.some((k) => k === "preserved-space" || k === "tab")) {
    return Math.max(0, P.measureLineStats(prepared, 0).maxLineWidth);
  }
  const ls = p.letterSpacing ?? 0;
  let widest = 0;
  for (let i = 0; i < kinds.length; i++) {
    if (HANGING_KINDS.has(kinds[i]!)) continue;
    const trailing = ls !== 0 && (p.spacingGraphemeCounts?.[i] ?? 0) > 0 ? ls : 0;
    const graphemeAdvances = advances[i];
    if (graphemeAdvances && widths[i]! + trailing > FIT_EPSILON) {
      for (let g = 0; g < graphemeAdvances.length; g++) widest = Math.max(widest, graphemeAdvances[g]! + trailing);
    } else {
      widest = Math.max(widest, widths[i]! + trailing);
    }
  }
  return widest;
}

/** Where blank paragraph `blank` goes among lines (in order) that start at the given segment indices. */
export function blankInsertIndex(lineStarts: ArrayLike<number>, blank: BlankParagraph): number {
  let index = 0;
  while (index < lineStarts.length && lineStarts[index]! < blank.start) index++;
  return index;
}

function layoutLines(P: Pretext, text: PreparedText, maxWidth: number, lineHeight: number, font: ResolvedFont): WrapResult {
  const result = P.layoutWithLines(text.prepared, pretextMaxWidth(maxWidth), lineHeight);
  const lines: TextLine[] = result.lines.map((line) => ({ text: line.text, width: visibleLineWidth(line, font) }));
  if (text.blanks.length > 0) {
    const starts = result.lines.map((line) => line.start.segmentIndex);
    // Insert from the last blank so earlier insertion indices stay valid.
    for (let b = text.blanks.length - 1; b >= 0; b--) {
      const blank = text.blanks[b]!;
      lines.splice(blankInsertIndex(starts, blank), 0, { text: blank.text, width: 0 });
    }
  }
  let maxLineWidth = 0;
  for (const line of lines) if (line.width > maxLineWidth) maxLineWidth = line.width;
  return { lines, lineCount: lines.length, height: lines.length * lineHeight, maxLineWidth };
}

/**
 * Width in px of `text` on one line (CSS white-space: nowrap): whitespace
 * runs collapse to one space, ends are trimmed, and the rest is shaped as a
 * single run, so kerning and ligatures across words count. Letter-spacing is
 * added after every grapheme, the last included, as browsers paint it. The
 * result is in Chromium's 1/64 px layout units (rounded up), the width of a
 * box that holds the text on one line, and never negative.
 */
export function measureWidth(text: string, font: FontSpec): number {
  return lineWidthPx(collapseWhitespace(String(text)), resolveFont(font));
}

/** Breaks `text` into lines the way the browser does for a box `opts.maxWidth` wide (Pretext). */
export function wrapText(text: string, font: FontSpec, opts: WrapOptions): WrapResult {
  const resolved = resolveFont(font);
  if (opts === null || typeof opts !== "object") throw new TypeError("text-measure: wrapText needs { maxWidth, lineHeight }");
  const maxWidth = assertNumber(opts.maxWidth, "maxWidth", { min: 0, allowInfinity: true });
  const lineHeight = assertNumber(opts.lineHeight, "lineHeight", { min: 0 });
  const whiteSpace = whiteSpaceOf(opts.whiteSpace);
  const P = pretext();
  return layoutLines(P, prepare(P, String(text), resolved, whiteSpace), maxWidth, lineHeight, resolved);
}

/** Line limit of a box: maxLines and floor(height / lineHeight), whichever is smaller. */
function lineLimit(box: FitBox): number {
  let limit = Infinity;
  if (box.maxLines !== undefined) limit = Math.floor(assertNumber(box.maxLines, "box.maxLines", { min: 0, allowInfinity: true }));
  if (box.height !== undefined) {
    const height = assertNumber(box.height, "box.height", { min: 0, allowInfinity: true });
    if (box.lineHeight > 0) limit = Math.min(limit, Math.floor(height / box.lineHeight + 1e-9));
  }
  return limit;
}

/**
 * Natural single-line width for the maxLines = 1 check, measured as one run.
 * Infinity when a forced break (pre-wrap newline) makes one line impossible.
 */
function naturalWidth(text: string, font: ResolvedFont, whiteSpace: WhiteSpace): number {
  if (whiteSpace === "normal") return lineWidthPx(collapseWhitespace(text), font);
  // One trailing line break ends the line without starting another (CR and FF are dropped in pre-wrap).
  const body = stripPreWrapControls(text).replace(/\n$/, "");
  if (body.includes("\n")) return Infinity;
  const line = body.replace(/ +$/, "");
  if (line.includes("\t")) return NaN;
  return lineWidthPx(line, font);
}

/**
 * Whether a layout at one of `widths` breaks a line at a soft hyphen (also
 * through spaces after it: Chromium paints the hyphen there too) or breaks a
 * word next to one. Chromium's fallback there differs from Pretext's (when
 * "char + hyphen" does not fit it splits the word without a hyphen, and can
 * put the hyphen on a line of its own), so such answers are not reliable.
 */
function softHyphenAtBreak(P: Pretext, prepared: Prepared, widths: readonly number[]): boolean {
  const kinds = (prepared as unknown as { kinds?: string[] }).kinds;
  if (!Array.isArray(kinds)) return true;
  const shy = (i: number): boolean => kinds[i] === "soft-hyphen";
  /** The segments before a line end at segment boundary `s` reach a soft hyphen through spaces only. */
  const afterSoftHyphen = (s: number): boolean => {
    for (let i = s - 1; i >= 0; i--) {
      const kind = kinds[i];
      if (kind === "soft-hyphen") return true;
      if (kind !== "space" && kind !== "preserved-space" && kind !== "zero-width-break") return false;
    }
    return false;
  };
  for (const width of widths) {
    let hit = false;
    P.walkLineRanges(prepared, pretextMaxWidth(width), (line) => {
      const { segmentIndex: s, graphemeIndex: g } = line.end;
      if (g === 0 ? s < kinds.length && afterSoftHyphen(s) : shy(s - 1) || shy(s + 1)) hit = true;
    });
    if (hit) return true;
  }
  return false;
}

/**
 * Does `text` fit `box`? Wraps at box.width, then asks the same question at
 * box.width - tolerance and box.width + tolerance (and, for one-line boxes,
 * against the whole-run single-line width too): when the answers disagree
 * the verdict is "borderline": near the edge the browser's answer depends
 * on details no estimate reproduces everywhere (where a long word's break
 * lands, 1/64 px layout rounding, fallback fonts).
 */
export function fitText(text: string, font: FontSpec, box: FitBox, opts: FitOptions = {}): FitResult {
  const resolved = resolveFont(font);
  if (box === null || typeof box !== "object") throw new TypeError("text-measure: fitText needs a FitBox");
  const width = assertNumber(box.width, "box.width", { min: 0, allowInfinity: true });
  const lineHeight = assertNumber(box.lineHeight, "box.lineHeight", { min: 0 });
  const tolerance = assertNumber(opts.tolerance ?? 1, "tolerance", { min: 0 });
  const whiteSpace = whiteSpaceOf(box.whiteSpace);
  const maxLines = lineLimit(box);
  const source = String(text);

  const P = pretext();
  const prepared = prepare(P, source, resolved, whiteSpace);
  const wrapped = layoutLines(P, prepared, width, lineHeight, resolved);
  const blankLines = prepared.blanks.length;
  const count = (w: number): number => P.layout(prepared.prepared, pretextMaxWidth(Math.max(0, w)), lineHeight).lineCount + blankLines;
  // With overflow-wrap: break-word only a single grapheme wider than the box overflows it sideways.
  let widestCache: number | undefined;
  const widest = (): number => (widestCache ??= widestUnit(P, prepared.prepared));
  const fitsAt = (w: number): boolean => (maxLines === Infinity || count(w) <= maxLines) && widest() <= lineFitLimit(w);
  const low = Math.max(0, width - tolerance);
  const high = width + tolerance;

  const answers: boolean[] = [];
  let neededWidth: number;
  if (wrapped.lineCount === 0) {
    answers.push(true);
    neededWidth = 0;
  } else if (maxLines < 1) {
    answers.push(false);
    neededWidth = Infinity;
  } else {
    answers.push(fitsAt(low), fitsAt(width), fitsAt(high));
    const natural = maxLines === 1 ? naturalWidth(source, resolved, whiteSpace) : NaN;
    if (!Number.isNaN(natural)) {
      // One-line boxes: also ask the whole-run width, which Pretext's segment sums can miss by a few px.
      answers.push(natural <= lineFitLimit(low), natural <= lineFitLimit(width), natural <= lineFitLimit(high));
      neededWidth = natural;
    } else if (maxLines === Infinity) {
      neededWidth = ceilLayoutUnit(widest());
    } else {
      neededWidth = ceilLayoutUnit(Math.max(widest(), smallestWidth(count, maxLines, P.measureNaturalWidth(prepared.prepared))));
    }
  }

  let verdict: FitResult["verdict"] = answers.every(Boolean) ? "fits" : answers.some(Boolean) ? "borderline" : "overflows";
  // A line wider than the box although no unit is: an emergency (break-word) break whose position depends on
  // kerning at the break, which Chromium settles by reshaping the line ends. The line count can differ by one.
  if (verdict !== "borderline" && wrapped.lineCount > 1 && Number.isFinite(width) && wrapped.lines.some((line) => line.width > lineFitLimit(width)) && widest() <= lineFitLimit(width)) {
    verdict = "borderline";
  }
  const uncovered = uncoveredGraphemes(source, resolved.face);
  const reasons: UnreliableReason[] = [];
  if (!isExactFor(resolved.face)) reasons.push("approximate-backend");
  if (!resolved.knownFamily) reasons.push("unknown-family");
  if (!resolved.weightPaintsAsIs) reasons.push("unsupported-weight");
  if (source.length > MAX_EXACT_UNITS || prepared.approximated) reasons.push("oversized-input");
  if (uncovered.length > 0) reasons.push("uncovered");
  if (hasControlCharacters(source, whiteSpace)) reasons.push("control-characters");
  if (hasBidi(source)) reasons.push("bidi");
  if (hasPreservedTab(source, whiteSpace)) reasons.push("tabs");
  if (source.includes("­") && wrapped.lineCount > 0 && softHyphenAtBreak(P, prepared.prepared, [width, low, high])) reasons.push("soft-hyphen");
  const backend = getBackend();
  return {
    ...wrapped,
    verdict,
    reliable: reasons.length === 0,
    reasons,
    uncovered,
    backend: backend.name,
    neededWidth,
  };
}

/** Smallest width whose Pretext line count is within `maxLines` (binary search to 0.01px). */
function smallestWidth(count: (w: number) => number, maxLines: number, natural: number): number {
  let high = natural + 0.01;
  if (count(high) > maxLines) return Infinity;
  if (count(0) <= maxLines) return 0;
  let low = 0;
  for (let i = 0; i < 64 && high - low > 0.01; i++) {
    const mid = (low + high) / 2;
    if (count(mid) <= maxLines) high = mid;
    else low = mid;
  }
  return high;
}

/**
 * Distinct characters (grapheme clusters) of `text` the bundled face of
 * `family` cannot paint (default Inter; unknown families use Inter's
 * coverage). Emoji count as uncovered even when the face maps the base
 * character, because browsers paint them with the emoji font.
 */
export function uncoveredChars(text: string, family = "Inter"): string[] {
  const named = bundledFamilyOf(splitFamilies(String(family))[0]) ?? "Inter";
  return uncoveredGraphemes(String(text), matchFace(named, 400));
}
