/**
 * Break opportunities where Pretext's segmentation and Chromium's line
 * breaker (ICU, UAX #14) disagree, fixed on Pretext's prepared text before
 * any width pass:
 *   - Pretext splits some letter/number sequences into separate text
 *     segments (Intl.Segmenter puts superscript digits and "x²" apart), and a
 *     boundary between two text segments is a break opportunity to its line
 *     walker. Chromium does not break inside "x²+y²" or "⁰¹²³", so such
 *     neighbours are merged into one segment.
 *   - Pretext joins numbers around an en or em dash into one numeric run
 *     ("10:30–11:45"); Chromium breaks after the dash (UAX #14 class BA / B2),
 *     so the run is split after it. Likewise after a "?" followed by a letter
 *     or digit (UAX #14 EX: Chromium breaks after it inside a URL's query,
 *     where Pretext keeps the query as one segment).
 * Rewrites every parallel array of the prepared text (pinned Pretext 0.0.9;
 * nothing is touched when the arrays are not the shape it expects). Widths
 * are placeholders the contextual width pass replaces.
 */

import { graphemes } from "./text.ts";

interface Chunk {
  startSegmentIndex: number;
  endSegmentIndex: number;
  consumedEndSegmentIndex: number;
}

interface PreparedArrays {
  segments: string[];
  kinds: string[];
  widths: number[];
  lineEndFitAdvances: number[];
  lineEndPaintAdvances: number[];
  breakableFitAdvances: Array<number[] | null>;
  breakablePreferredBreaks: Array<number[] | null>;
  spacingGraphemeCounts: number[];
  letterSpacing: number;
  chunks: Chunk[];
  segLevels: ArrayLike<number> | null;
}

const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;
/** Scripts broken by dictionary or per character (CJK, South-East Asian): their segment boundaries stay. */
const KEEP_BOUNDARY = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Extended_Pictographic}]/u;
const DASH_BREAK = /(?<=\p{Nd})[\u2013\u2014](?=\p{Nd})|\?(?=[\p{L}\p{N}])/gu;
const PREFERRED_BREAK = new Set(["-", "֊", "‐", "‒", "–", "—"]);

function preparedArrays(prepared: unknown): PreparedArrays | null {
  const p = prepared as Partial<PreparedArrays> | null;
  if (!p || !Array.isArray(p.segments) || !Array.isArray(p.chunks) || typeof p.letterSpacing !== "number") return null;
  const n = p.segments.length;
  for (const key of ["kinds", "widths", "lineEndFitAdvances", "lineEndPaintAdvances", "breakableFitAdvances", "breakablePreferredBreaks"] as const) {
    const value = p[key];
    if (!Array.isArray(value) || value.length !== n) return null;
  }
  if (p.letterSpacing !== 0 && (!Array.isArray(p.spacingGraphemeCounts) || p.spacingGraphemeCounts.length !== n)) return null;
  return p as PreparedArrays;
}

function lastChar(text: string): string {
  return String.fromCodePoint(text.codePointAt(text.length - 1 - (text.length > 1 && /[\udc00-\udfff]/.test(text[text.length - 1]!) ? 1 : 0))!);
}

/** Pretext's preferred emergency-break positions (grapheme ends after a dash that is not a numeric sign). */
function preferredBreaks(text: string): number[] | null {
  const parts = graphemes(text);
  const out: number[] = [];
  parts.forEach((g, index) => {
    if (!PREFERRED_BREAK.has(g) || index === parts.length - 1) return;
    const next = parts[index + 1]!;
    if (g === "-" && /\p{Nd}/u.test(next) && (index === 0 || !/[\p{L}\p{N}]/u.test(parts[index - 1]!))) return;
    out.push(index + 1);
  });
  return out.length > 0 ? out : null;
}

/** Applies the merges and splits above; returns true when the prepared text changed. */
export function alignBreakOpportunities(prepared: unknown): boolean {
  const p = preparedArrays(prepared);
  if (!p) return false;
  const n = p.segments.length;
  // Desired pieces: [first original segment, last original segment, text].
  type Piece = { from: number; to: number; text: string; split?: [number, number] };
  const pieces: Piece[] = [];
  let changed = false;
  for (let i = 0; i < n; i++) {
    const text = p.segments[i]!;
    const prev = pieces[pieces.length - 1];
    if (
      prev &&
      p.kinds[i] === "text" &&
      p.kinds[prev.to] === "text" &&
      prev.split === undefined &&
      WORD_CHAR.test(lastChar(prev.text)) &&
      WORD_CHAR.test(String.fromCodePoint(text.codePointAt(0)!)) &&
      !KEEP_BOUNDARY.test(lastChar(prev.text)) &&
      !KEEP_BOUNDARY.test(String.fromCodePoint(text.codePointAt(0)!))
    ) {
      prev.to = i;
      prev.text += text;
      changed = true;
      continue;
    }
    pieces.push({ from: i, to: i, text });
  }
  // Splits after an en or em dash between digits.
  const split: Piece[] = [];
  for (const piece of pieces) {
    if (p.kinds[piece.from] !== "text" || !/[\u2013\u2014?]/.test(piece.text)) {
      split.push(piece);
      continue;
    }
    let start = 0;
    for (const m of piece.text.matchAll(DASH_BREAK)) {
      const cut = m.index! + m[0].length;
      if (cut >= piece.text.length) continue;
      split.push({ from: piece.from, to: piece.to, text: piece.text.slice(start, cut), split: [start, cut] });
      start = cut;
      changed = true;
    }
    split.push(start === 0 ? piece : { from: piece.from, to: piece.to, text: piece.text.slice(start), split: [start, piece.text.length] });
  }
  if (!changed) return false;

  const ls = p.letterSpacing;
  const out = {
    segments: [] as string[],
    kinds: [] as string[],
    widths: [] as number[],
    lineEndFitAdvances: [] as number[],
    lineEndPaintAdvances: [] as number[],
    breakableFitAdvances: [] as Array<number[] | null>,
    breakablePreferredBreaks: [] as Array<number[] | null>,
    spacingGraphemeCounts: [] as number[],
    levels: [] as number[],
  };
  for (const piece of split) {
    const kind = p.kinds[piece.from]!;
    const unchanged = piece.from === piece.to && piece.split === undefined;
    out.segments.push(piece.text);
    out.kinds.push(kind);
    if (p.segLevels) out.levels.push(p.segLevels[piece.from]!);
    if (unchanged) {
      const i = piece.from;
      out.widths.push(p.widths[i]!);
      out.lineEndFitAdvances.push(p.lineEndFitAdvances[i]!);
      out.lineEndPaintAdvances.push(p.lineEndPaintAdvances[i]!);
      out.breakableFitAdvances.push(p.breakableFitAdvances[i]!);
      out.breakablePreferredBreaks.push(p.breakablePreferredBreaks[i]!);
      if (ls !== 0) out.spacingGraphemeCounts.push(p.spacingGraphemeCounts[i]!);
      continue;
    }
    // Per-grapheme advances of the originals, concatenated, then cut to this piece.
    let advances: number[] = [];
    for (let i = piece.from; i <= piece.to; i++) {
      const own = p.breakableFitAdvances[i];
      if (own) advances = advances.concat(own);
      else {
        const parts = graphemes(p.segments[i]!);
        const each = (p.widths[i]! - (ls !== 0 && parts.length > 1 ? (parts.length - 1) * ls : 0)) / Math.max(1, parts.length);
        for (let g = 0; g < parts.length; g++) advances.push(each);
      }
    }
    const allParts = graphemes(split.filter((s) => s.from === piece.from && s.to === piece.to).map((s) => s.text).join(""));
    if (piece.split) {
      let offset = 0;
      let first = -1;
      let last = -1;
      allParts.forEach((g, index) => {
        if (offset >= piece.split![0] && offset < piece.split![1]) {
          if (first < 0) first = index;
          last = index;
        }
        offset += g.length;
      });
      advances = advances.length === allParts.length ? advances.slice(first, last + 1) : [];
    }
    const count = graphemes(piece.text).length;
    if (advances.length !== count) advances = new Array<number>(count).fill(0);
    let width = 0;
    for (const a of advances) width += a;
    if (ls !== 0 && count > 1) width += (count - 1) * ls;
    out.widths.push(width);
    out.lineEndFitAdvances.push(width + (ls !== 0 && count > 0 ? ls : 0));
    out.lineEndPaintAdvances.push(width);
    out.breakableFitAdvances.push(count > 1 ? advances : null);
    out.breakablePreferredBreaks.push(count > 1 ? preferredBreaks(piece.text) : null);
    if (ls !== 0) out.spacingGraphemeCounts.push(count);
  }
  const chunks: Chunk[] = [];
  let chunkStart = 0;
  out.kinds.forEach((kind, i) => {
    if (kind !== "hard-break") return;
    chunks.push({ startSegmentIndex: chunkStart, endSegmentIndex: i, consumedEndSegmentIndex: i + 1 });
    chunkStart = i + 1;
  });
  if (chunkStart < out.kinds.length) chunks.push({ startSegmentIndex: chunkStart, endSegmentIndex: out.kinds.length, consumedEndSegmentIndex: out.kinds.length });

  p.segments = out.segments;
  p.kinds = out.kinds;
  p.widths = out.widths;
  p.lineEndFitAdvances = out.lineEndFitAdvances;
  p.lineEndPaintAdvances = out.lineEndPaintAdvances;
  p.breakableFitAdvances = out.breakableFitAdvances;
  p.breakablePreferredBreaks = out.breakablePreferredBreaks;
  if (ls !== 0) p.spacingGraphemeCounts = out.spacingGraphemeCounts;
  if (p.segLevels) p.segLevels = Int8Array.from(out.levels);
  p.chunks = chunks;
  return true;
}
