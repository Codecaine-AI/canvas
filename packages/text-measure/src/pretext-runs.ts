/**
 * Contextual segment widths for Pretext when one prepared text holds several
 * inline runs with their own fonts (wrapRuns, src/runs.ts).
 *
 * Pretext prepares the runs' concatenated text, so its break opportunities
 * come from the whole paragraph (a run boundary is not one), but it measures
 * every segment in the one font it was given. This pass rewrites the
 * prepared widths the way pretext-context.ts does for a single run, per
 * shaping group: adjacent runs Chromium shapes as one (same font, no padding
 * between them) form a group, and a segment is worth what it adds to its
 * group's run before it. A segment that crosses a group boundary is split
 * there and each piece is shaped on its own, the way Chromium shapes each
 * inline item separately: no kerning or ligature crosses a font change.
 * Padding is added at the unit it is attached to (a run's first or last),
 * and letter-spacing that differs between groups is folded into the widths.
 *
 * For a single group without padding every number is computed exactly as
 * pretext-context.ts computes it, so wrapRuns of one run breaks where
 * wrapText does. Reads and writes Pretext's internal prepared arrays (pinned
 * 0.0.9, as pretext-context.ts does); returns null, before writing anything,
 * when they are not the shape this expects.
 */

import { measureRunPx } from "./backend.ts";
import { isSimpleCoveredRun, isUncoveredGrapheme } from "./coverage.ts";
import type { ResolvedFont } from "./font.ts";
import { MAX_CONTEXTUAL_SEGMENT_UNITS, withLastAdvance } from "./pretext-context.ts";
import { countSpacingGraphemes, graphemes } from "./text.ts";

/** Runs Chromium shapes as one: same font and letter-spacing, nothing between them that breaks shaping. */
export interface ShapingGroup {
  readonly font: ResolvedFont;
  /** Letter-spacing (px) after each grapheme that the prepared text does not add itself. */
  readonly extraSpacing: number;
}

export interface RunsShaping {
  /** The text Pretext prepared, whitespace already normalized. */
  readonly text: string;
  /** Shaping group of every UTF-16 unit of `text`. */
  readonly groupOf: ArrayLike<number>;
  readonly groups: readonly ShapingGroup[];
  /** Padding (px) attached to each unit of `text` (padStart on a run's first unit, padEnd on its last); null when there is none. */
  readonly padAt: ArrayLike<number> | null;
  /** Font string the text was prepared with. */
  readonly preparedKey: string;
  /**
   * Recompute per-grapheme break advances in context (default true). False
   * for huge input: every breakable segment keeps context-free grapheme
   * widths, as wrapText does past MAX_EXACT_UNITS.
   */
  readonly contextualBreaks?: boolean;
}

interface PreparedArrays {
  segments: string[];
  kinds: string[];
  widths: number[];
  lineEndFitAdvances: number[];
  lineEndPaintAdvances: number[];
  breakableFitAdvances: Array<number[] | null>;
  spacingGraphemeCounts: number[];
  letterSpacing: number;
  discretionaryHyphenWidth: number;
  tabStopAdvance: number;
}

/** A stretch of one segment inside one shaping group, with the shaping context it starts in. */
interface Span {
  readonly group: number;
  readonly start: number;
  readonly end: number;
  context: string;
  contextWidth: number;
}

/** Emoji Pretext measured at 1em (estimateGraphemePx forPretext) and the width pass re-estimates. */
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u;

/** Same limits as pretext-context.ts. */
const MAX_PREFIX_GRAPHEMES = 96;
const MAX_CONTEXT_LENGTH = 256;

function preparedArrays(prepared: unknown): PreparedArrays | null {
  const p = prepared as Partial<PreparedArrays> | null;
  if (!p || !Array.isArray(p.segments) || typeof p.letterSpacing !== "number") return null;
  if (typeof p.discretionaryHyphenWidth !== "number" || typeof p.tabStopAdvance !== "number") return null;
  const n = p.segments.length;
  for (const key of ["kinds", "widths", "lineEndFitAdvances", "lineEndPaintAdvances", "breakableFitAdvances"] as const) {
    const value = p[key];
    if (!Array.isArray(value) || value.length !== n) return null;
  }
  if (p.letterSpacing !== 0 && (!Array.isArray(p.spacingGraphemeCounts) || p.spacingGraphemeCounts.length !== n)) return null;
  return p as PreparedArrays;
}

function hasUncovered(text: string, font: ResolvedFont): boolean {
  if (isSimpleCoveredRun(text, font.face)) return false;
  return graphemes(text).some((g) => isUncoveredGrapheme(g, font.face));
}

/** Letter-spacing applies after every grapheme of these segments (Pretext's countRenderedSpacingGraphemes). */
function takesSpacing(kind: string): boolean {
  return kind !== "zero-width-break" && kind !== "soft-hyphen" && kind !== "hard-break";
}

/** Grapheme ranges [start, end) of `segment`, relative to it. */
function graphemeRanges(segment: string): Array<{ text: string; start: number; end: number }> {
  const out: Array<{ text: string; start: number; end: number }> = [];
  let offset = 0;
  for (const g of graphemes(segment)) {
    out.push({ text: g, start: offset, end: offset + g.length });
    offset += g.length;
  }
  return out;
}

/**
 * `original` with numeric reads served by `compute()` on first access
 * (Pretext reads `.length` and indices, and only for a segment it breaks).
 */
function lazy(original: number[], compute: () => number[]): number[] {
  let computed: number[] | null = null;
  return new Proxy(original, {
    get(target, prop, receiver) {
      if (typeof prop === "string") {
        const c = prop.charCodeAt(0);
        if (c >= 48 && c <= 57) return (computed ??= compute())[Number(prop)];
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Rewrites `prepared` (Pretext.prepareWithSegments of `runs.text`) in place
 * and returns each segment's start offset in `runs.text` (plus the end), or
 * null without touching it when its arrays are not the expected shape or
 * its segments do not spell `runs.text`.
 */
export function applyRunsWidths(prepared: unknown, runs: RunsShaping): number[] | null {
  const p = preparedArrays(prepared);
  if (!p) return null;
  const { text, groupOf, groups, padAt } = runs;
  const n = p.segments.length;
  const starts: number[] = new Array(n + 1);
  let offset = 0;
  for (let i = 0; i < n; i++) {
    const segment = p.segments[i];
    if (typeof segment !== "string" || segment === "" || !text.startsWith(segment, offset)) return null;
    starts[i] = offset;
    offset += segment.length;
  }
  if (offset !== text.length) return null;
  starts[n] = offset;

  const measures = groups.map(({ font }) => (t: string): number => (t === "" ? 0 : measureRunPx(t, font.face, font.size, font.ligatures)));
  const foldSpacing = groups.some((g) => g.extraSpacing !== 0);
  const L = p.letterSpacing;

  const spansOf = (a: number, b: number): Span[] => {
    const spans: Span[] = [];
    let start = a;
    for (let k = a + 1; k <= b; k++) {
      if (k === b || groupOf[k] !== groupOf[start]) {
        spans.push({ group: groupOf[start]!, start, end: k, context: "", contextWidth: 0 });
        start = k;
      }
    }
    return spans;
  };
  const spanIndexOf = (spans: Span[], a: number, b: number): number => {
    for (let s = 0; s < spans.length; s++) if (spans[s]!.start <= a && b <= spans[s]!.end) return s;
    return -1;
  };
  /** Padding plus folded letter-spacing that lands on the units [a, b), one grapheme or a whole segment. */
  const extraOf = (a: number, b: number, kind: string, graphemeStarts: readonly number[] | null): number => {
    let extra = 0;
    if (padAt) for (let k = a; k < b; k++) if (padAt[k] !== 0) extra += padAt[k]!;
    if (foldSpacing && takesSpacing(kind)) {
      if (graphemeStarts) for (const g of graphemeStarts) extra += groups[groupOf[g]!]!.extraSpacing;
      else extra += groups[groupOf[a]!]!.extraSpacing;
    }
    return extra;
  };
  const segmentExtra = (i: number): number => {
    const a = starts[i]!;
    const b = starts[i + 1]!;
    const kind = p.kinds[i]!;
    const graphemeStarts = foldSpacing && takesSpacing(kind) ? graphemeRanges(p.segments[i]!).map((g) => a + g.start) : null;
    return extraOf(a, b, kind, graphemeStarts);
  };
  const applyDelta = (i: number, delta: number): void => {
    if (p.kinds[i] === "soft-hyphen" || Math.abs(delta) <= 1e-9) return;
    p.widths[i]! += delta;
    if (p.lineEndFitAdvances[i] !== 0) p.lineEndFitAdvances[i]! += delta;
    if (p.lineEndPaintAdvances[i] !== 0) p.lineEndPaintAdvances[i]! += delta;
  };
  /** Pretext's letter-spacing inside a segment ((graphemes - 1) x spacing), already part of its width. */
  const internalSpacing = (i: number): number => (L !== 0 && p.spacingGraphemeCounts[i]! > 1 ? (p.spacingGraphemeCounts[i]! - 1) * L : 0);

  let ctx = "";
  let ctxWidth = 0;
  let ctxGroup = -1;
  const reset = (): void => {
    ctx = "";
    ctxWidth = 0;
    ctxGroup = -1;
  };

  for (let i = 0; i < n; i++) {
    const kind = p.kinds[i]!;
    const a = starts[i]!;
    const b = starts[i + 1]!;
    if (kind === "hard-break" || kind === "tab") {
      // Tabs advance to a stop at layout time: no shaping context crosses them.
      reset();
      continue;
    }
    const spans = spansOf(a, b);
    const extra = segmentExtra(i);
    /** Per-grapheme advances without context: each grapheme measured alone in its run's font. */
    const standalone = (original: number[]): number[] =>
      lazy(original, () => {
        const parts = graphemeRanges(p.segments[i]!);
        if (parts.length !== original.length) return original;
        return parts.map(({ start, end }) => {
          let width = 0;
          for (const s of spans) {
            const from = Math.max(a + start, s.start);
            const to = Math.min(a + end, s.end);
            if (from < to) width += measures[s.group]!(text.slice(from, to));
          }
          return width + extraOf(a + start, a + end, kind, [a + start]);
        });
      });

    if (spans.some((s) => hasUncovered(text.slice(s.start, s.end), groups[s.group]!.font))) {
      // Uncovered text is estimated grapheme by grapheme, without context.
      reset();
      const only = spans.length === 1 ? groups[spans[0]!.group]! : null;
      if (only && only.font.key === runs.preparedKey && extra === 0 && !EMOJI.test(text.slice(a, b))) continue; // Pretext measured it in this very font
      let raw = 0;
      for (const s of spans) raw += measures[s.group]!(text.slice(s.start, s.end));
      applyDelta(i, raw + extra - (p.widths[i]! - internalSpacing(i)));
      const original = p.breakableFitAdvances[i];
      if (original) p.breakableFitAdvances[i] = standalone(original);
      continue;
    }

    if (ctx.length > MAX_CONTEXT_LENGTH) reset();
    let advance = 0;
    for (const s of spans) {
      if (s.group !== ctxGroup) {
        ctx = "";
        ctxWidth = 0;
        ctxGroup = s.group;
      }
      const piece = text.slice(s.start, s.end);
      const total = measures[s.group]!(ctx + piece);
      s.context = ctx;
      s.contextWidth = ctxWidth;
      advance += total - ctxWidth;
      ctx += piece;
      ctxWidth = total;
    }
    let spacingFix = 0;
    if (L !== 0 && p.spacingGraphemeCounts[i]! > 0 && kind !== "tab") {
      // As wrapText: no letter-spacing after invisible graphemes (LRM, WJ, ZWJ, BOM...).
      const visible = countSpacingGraphemes(p.segments[i]!);
      const counted = p.spacingGraphemeCounts[i]!;
      if (visible !== counted) {
        spacingFix = (visible > 1 ? (visible - 1) * L : 0) - internalSpacing(i);
        p.spacingGraphemeCounts[i] = visible;
        if (visible === 0 && p.lineEndFitAdvances[i] !== 0) p.lineEndFitAdvances[i]! -= L;
      }
    }
    applyDelta(i, advance + extra - (p.widths[i]! - internalSpacing(i)) + spacingFix);
    if ((kind === "space" || kind === "preserved-space") && i > 0 && spans.length === 1 && spans[0]!.context !== "" && spans[0]!.group === groupOf[a - 1]) {
      // As wrapText: the kerning between a word's last glyph and the space after it stays on that glyph.
      const s = spans[0]!;
      const kern = advance - measures[s.group]!(text.slice(s.start, s.end));
      const before = i - 1;
      if (Math.abs(kern) > 1e-9 && p.kinds[before] !== "space" && p.kinds[before] !== "preserved-space" && p.kinds[before] !== "soft-hyphen") {
        p.widths[before]! += kern;
        if (p.lineEndFitAdvances[before] !== 0) p.lineEndFitAdvances[before]! += kern;
        if (p.lineEndPaintAdvances[before] !== 0) p.lineEndPaintAdvances[before]! += kern;
        const beforeAdvances = p.breakableFitAdvances[before];
        if (beforeAdvances) p.breakableFitAdvances[before] = withLastAdvance(beforeAdvances, kern);
        p.widths[i]! -= kern;
        if (p.lineEndFitAdvances[i] !== 0) p.lineEndFitAdvances[i]! -= kern;
        if (p.lineEndPaintAdvances[i] !== 0) p.lineEndPaintAdvances[i]! -= kern;
      }
    }

    const original = p.breakableFitAdvances[i];
    if (original) {
      if (runs.contextualBreaks !== false && b - a <= MAX_CONTEXTUAL_SEGMENT_UNITS) {
        p.breakableFitAdvances[i] = lazy(original, () => contextualAdvances(original, spans, a, p.segments[i]!, kind));
      } else {
        // A huge unbreakable run keeps context-free grapheme widths, as wrapText does (MAX_CONTEXTUAL_SEGMENT_UNITS):
        // Pretext's own when it measured them in this very font, else each grapheme alone in its run's font.
        const only = spans.length === 1 ? groups[spans[0]!.group]! : null;
        if (!(only && only.font.key === runs.preparedKey && extra === 0)) p.breakableFitAdvances[i] = standalone(original);
      }
    }

    if (kind === "space" || kind === "preserved-space") {
      // A line can start after a space: what follows is shaped in the space's context only.
      const last = spans[spans.length - 1]!;
      ctx = text.slice(last.start, last.end);
      ctxWidth = measures[last.group]!(ctx);
      ctxGroup = last.group;
    }
  }

  /**
   * Per-grapheme fit advances of a breakable segment, as pretext-context.ts
   * computes them inside each group (prefix differences in the group's
   * context, each pair's kerning on its left grapheme), plus padding and
   * folded letter-spacing on the grapheme they land on.
   */
  function contextualAdvances(original: number[], spans: Span[], a: number, segment: string, kind: string): number[] {
    const parts = graphemeRanges(segment);
    if (parts.length !== original.length) return original;
    const count = parts.length;
    const out: number[] = new Array(count);
    const spanOfPart = parts.map(({ start, end }) => spanIndexOf(spans, a + start, a + end));
    if (count <= MAX_PREFIX_GRAPHEMES) {
      let si = 0;
      let prefix = spans[0]!.context;
      let previous = spans[0]!.contextWidth;
      for (let g = 0; g < count; g++) {
        const end = a + parts[g]!.end;
        let k = a + parts[g]!.start;
        let width = 0;
        while (k < end) {
          while (spans[si]!.end <= k) {
            si++;
            prefix = spans[si]!.context;
            previous = spans[si]!.contextWidth;
          }
          const span = spans[si]!;
          const to = Math.min(end, span.end);
          prefix += text.slice(k, to);
          const prefixWidth = measures[span.group]!(prefix);
          width += prefixWidth - previous;
          previous = prefixWidth;
          k = to;
        }
        out[g] = width;
      }
    } else {
      // Very long runs: each grapheme in the context of the one before it (Pretext's pair mode).
      for (let g = 0; g < count; g++) {
        const s = spanOfPart[g]!;
        if (s >= 0 && g > 0 && spanOfPart[g - 1] === s) {
          const m = measures[spans[s]!.group]!;
          out[g] = m(parts[g - 1]!.text + parts[g]!.text) - m(parts[g - 1]!.text);
        } else {
          let width = 0;
          for (const span of spans) {
            const from = Math.max(a + parts[g]!.start, span.start);
            const to = Math.min(a + parts[g]!.end, span.end);
            if (from < to) width += measures[span.group]!(text.slice(from, to));
          }
          out[g] = width;
        }
      }
    }
    for (let g = 0; g + 1 < count; g++) {
      const s = spanOfPart[g]!;
      if (s < 0 || spanOfPart[g + 1] !== s) continue; // no kerning across a font change
      const m = measures[spans[s]!.group]!;
      const pair = m(parts[g]!.text + parts[g + 1]!.text) - m(parts[g]!.text) - m(parts[g + 1]!.text);
      if (pair !== 0) {
        out[g]! += pair;
        out[g + 1]! -= pair;
      }
    }
    if (padAt || foldSpacing) {
      for (let g = 0; g < count; g++) {
        const extra = extraOf(a + parts[g]!.start, a + parts[g]!.end, kind, [a + parts[g]!.start]);
        if (extra !== 0) out[g]! += extra;
      }
    }
    return out;
  }

  // One hyphen width and one tab stop per prepared text: take them from the first soft hyphen's / tab's own font.
  const firstOf = (wanted: string): number => p.kinds.indexOf(wanted);
  const shy = firstOf("soft-hyphen");
  if (shy >= 0) {
    const group = groups[groupOf[starts[shy]!]!]!;
    if (group.font.key !== runs.preparedKey || group.extraSpacing !== 0) {
      p.discretionaryHyphenWidth = measures[groupOf[starts[shy]!]!]!("-") + (L !== 0 ? L * 2 : group.extraSpacing);
    }
  }
  const tab = firstOf("tab");
  if (tab >= 0) {
    const group = groups[groupOf[starts[tab]!]!]!;
    if (group.font.key !== runs.preparedKey) p.tabStopAdvance = measures[groupOf[starts[tab]!]!]!(" ") * 8;
  }
  return starts;
}
