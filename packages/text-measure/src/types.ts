/** Public types of @codecaine-ai/text-measure (see README.md for semantics). */

import type { FaceId } from "./faces.ts";

export interface FontSpec {
  /**
   * CSS font-family. Only the first family is measured: "Inter" or
   * "IBM Plex Mono" (case-insensitive, quotes optional). Any other family is
   * measured as Inter and reported as not reliable.
   */
  family: string;
  /** CSS px; fractional sizes such as 13.5 and 17.5 are fine. */
  size: number;
  /** CSS font-weight, default 400. Snaps to a bundled weight the way CSS font matching does. */
  weight?: number;
  /** CSS letter-spacing in px, default 0. Non-zero spacing turns ligatures off, as browsers do. */
  letterSpacing?: number;
}

export interface TextLine {
  text: string;
  /** Painted width of the line, shaped as one run (kerning and ligatures across words included). */
  width: number;
}

export interface WrapOptions {
  /** Box width in px. Infinity means no wrapping. */
  maxWidth: number;
  /** Line height in px. */
  lineHeight: number;
  /** CSS white-space; overflow-wrap: break-word is assumed. Default "normal". */
  whiteSpace?: "normal" | "pre-wrap";
}

export interface WrapResult {
  lines: TextLine[];
  lineCount: number;
  height: number;
  maxLineWidth: number;
}

export type FitVerdict = "fits" | "overflows" | "borderline";

export interface FitBox {
  /** Box width in px. */
  width: number;
  /** Line height in px. */
  lineHeight: number;
  /** Most lines the box shows. */
  maxLines?: number;
  /** Box height in px; allows floor(height / lineHeight) lines. Combined with maxLines, the smaller wins. */
  height?: number;
  /** CSS white-space of the box, default "normal". */
  whiteSpace?: "normal" | "pre-wrap";
}

export interface FitOptions {
  /** Half-width in px of the band around box.width where a flipping answer is "borderline". Default 1. */
  tolerance?: number;
}

/**
 * One inline run of a mixed-font paragraph for wrapRuns(): the text of one
 * inline element (a text node, <strong>, <code>, ...) laid out with its font.
 */
export interface TextRun {
  text: string;
  font: FontSpec;
  /**
   * CSS inline padding in px at the run's start and end, like
   * padding-inline on an inline box with box-decoration-break: slice: the
   * run's first fragment carries padStart, its last fragment padEnd. Default 0.
   * Kept in Chromium's layout units (rounded down to 1/64 px).
   */
  padStart?: number;
  padEnd?: number;
}

/** The part of one run that lands on one line. */
export interface RunFragment {
  /** Index into the runs array. */
  run: number;
  /**
   * The run's text on this line as laid out: whitespace collapsed in
   * "normal", hard breaks left out, a soft hyphen the line breaks at shown
   * as "-", trailing spaces kept (they hang or collapse, see width).
   */
  text: string;
  /** Source range [start, end) of runs[run].text this fragment lays out (collapsed whitespace and a line-ending hard break included). */
  start: number;
  end: number;
  /** Px from the line start to the fragment's start edge (its padStart, if any, starts there). */
  x: number;
  /**
   * Px the fragment advances, padding included, in 1/64 px layout units.
   * Spaces at the end of the line count zero (they hang in pre-wrap and
   * collapse in normal), so the last fragment ends at the line's width.
   */
  width: number;
}

/**
 * One line of wrapRuns(). `text` is the fragments' texts joined; `width` is
 * the visible width (trailing spaces excluded), where the last fragment ends.
 */
export interface RunsLine extends TextLine {
  /** The line's runs in order; fragments[i + 1].x === fragments[i].x + fragments[i].width. */
  fragments: RunFragment[];
}

export interface RunsWrapResult {
  lines: RunsLine[];
  lineCount: number;
  height: number;
  maxLineWidth: number;
}

export type BackendName = "table" | "harfbuzz" | "canvas";

/**
 * Why a fitText answer is not reliable (README "Reliability"), most
 * fundamental first:
 *   "approximate-backend"  the active backend does not measure this face exactly (the table backend, or a face useBrowserFonts did not load)
 *   "unknown-family"       the first CSS family is not a bundled family; it was measured as Inter
 *   "unsupported-weight"   a font-weight the bundled faces cannot paint as is: outside CSS's 1..1000 (browsers drop it),
 *                          or a bold request (>= 600) matched to a face under 600, which browsers embolden synthetically
 *                          (never with the bundled faces: 1..1000 all paint a bundled face as is)
 *   "oversized-input"      longer than 16,384 UTF-16 units, or one unbreakable run over 4,096: approximate fast path
 *   "uncovered"            characters the bundled face lacks (listed in `uncovered`) paint in per-machine fallback fonts
 *   "control-characters"   C0/C1 controls, a form feed, a lone carriage return in pre-wrap, or ZWNJ: Chromium paints
 *                          them as fallback glyphs or splits shaping and breaking around them
 *   "bidi"                 right-to-left text or bidi controls; line breaking here does not reorder bidi runs
 *   "tabs"                 a tab in pre-wrap: tab stops and tabs at a line end are approximate
 *   "soft-hyphen"          a soft hyphen at or next to a line break, where Chromium's fallback differs
 */
export type UnreliableReason =
  | "approximate-backend"
  | "unknown-family"
  | "unsupported-weight"
  | "oversized-input"
  | "uncovered"
  | "control-characters"
  | "bidi"
  | "tabs"
  | "soft-hyphen";

export interface FitResult extends WrapResult {
  /** "borderline": the fits/overflows answer flips somewhere in [width - tolerance, width + tolerance]. */
  verdict: FitVerdict;
  /** True when `reasons` is empty: an exact backend, a bundled family at a weight it paints as is, and text the guarantee covers. */
  reliable: boolean;
  /** Why `reliable` is false, most fundamental first; empty when it is true. */
  reasons: UnreliableReason[];
  /** Distinct characters (grapheme clusters) the bundled face lacks. */
  uncovered: string[];
  backend: BackendName;
  /**
   * Smallest box width that satisfies the line limit: the natural single-line
   * width when the limit is 1 line, the widest unbreakable grapheme when there
   * is no limit, Infinity when no width can satisfy it.
   */
  neededWidth: number;
}

export interface ActiveBackend {
  name: BackendName;
  /** True for harfbuzz and canvas: widths match the browser for covered text. */
  exact: boolean;
  /**
   * Present only when the backend measures just some bundled faces exactly
   * (useBrowserFonts with a `faces` filter): the face ids it measures exactly.
   * Other faces are measured with the table backend's approximations.
   */
  faces?: FaceId[];
}
