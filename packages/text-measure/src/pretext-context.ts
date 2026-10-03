/**
 * Contextual segment widths for Pretext.
 *
 * Pretext measures every segment (word, space, punctuation piece) on its own
 * and adds the widths up, while the browser shapes the whole line. The sums
 * miss whatever crosses a segment boundary:
 *   - Inter's contextual arrows when Pretext splits "->" or "-->" into
 *     separate segments (up to ~0.6em per arrow),
 *   - kerning across a boundary (Inter Bold kerns ", " and ". "; kerning
 *     across zero-width spaces),
 *   - inside an overlong word broken by overflow-wrap, Pretext's per-grapheme
 *     advances are standalone glyph widths without any kerning, so it breaks
 *     long identifiers and URLs earlier than the browser.
 *
 * After prepareWithSegments() this pass rewrites the prepared widths so each
 * segment is worth what it adds to the run before it (whole-run shaping
 * through the active backend), and replaces the per-grapheme advances of
 * breakable segments with prefix differences (computed lazily, only when a
 * segment actually has to be broken). Lines then add up to whole-run widths.
 *
 * Reads and writes Pretext's prepared arrays, which PreparedTextWithSegments
 * declares in its .d.ts but Pretext treats as internal: valid for the pinned
 * 0.0.9. If the shape is not what this expects, it does nothing and Pretext's
 * own widths stand (the accuracy test catches that on an upgrade).
 */

import { measureRunPx } from "./backend.ts";
import { isInvisibleGrapheme, isSimpleCoveredRun, isUncoveredGrapheme } from "./coverage.ts";
import type { ResolvedFont } from "./font.ts";
import { countSpacingGraphemes, graphemes } from "./text.ts";

interface PreparedArrays {
  segments: string[];
  kinds: string[];
  widths: number[];
  lineEndFitAdvances: number[];
  lineEndPaintAdvances: number[];
  breakableFitAdvances: Array<number[] | null>;
  spacingGraphemeCounts: number[];
  letterSpacing: number;
}

/** Longest segment whose break advances use full prefixes; longer ones use pairs (as Pretext does). */
const MAX_PREFIX_GRAPHEMES = 96;
/** Context kept for a run without spaces; longer runs restart from the current segment. */
const MAX_CONTEXT_LENGTH = 256;
/**
 * Longest segment (UTF-16 units) whose per-grapheme break advances are
 * recomputed in context. A longer unbreakable run (a pasted blob, a huge
 * URL) keeps Pretext's standalone grapheme widths: the contextual pass would
 * cost three measurements per grapheme. Its emergency breaks are approximate.
 */
export const MAX_CONTEXTUAL_SEGMENT_UNITS = 4096;

function preparedArrays(prepared: unknown): PreparedArrays | null {
  const p = prepared as Partial<PreparedArrays> | null;
  if (!p || !Array.isArray(p.segments) || typeof p.letterSpacing !== "number") return null;
  const n = p.segments.length;
  for (const key of ["kinds", "widths", "lineEndFitAdvances", "lineEndPaintAdvances", "breakableFitAdvances"] as const) {
    const value = p[key];
    if (!Array.isArray(value) || value.length !== n) return null;
  }
  if (p.letterSpacing !== 0 && (!Array.isArray(p.spacingGraphemeCounts) || p.spacingGraphemeCounts.length !== n)) return null;
  return p as PreparedArrays;
}

function hasUncovered(segment: string, font: ResolvedFont): boolean {
  if (isSimpleCoveredRun(segment, font.face)) return false;
  return graphemes(segment).some((g) => isUncoveredGrapheme(g, font.face));
}

/**
 * Per-grapheme fit advances of `segment` after `context`, computed on first
 * read. Pretext only reads `.length` and numeric indices, and only for a
 * segment wider than the line.
 *
 * Each grapheme is worth what it adds to the shaped prefix, with the kerning
 * of each pair inside the segment moved onto the pair's left grapheme. That
 * is how a shaped run stores it (HarfBuzz adds a pair's kerning to the first
 * glyph's advance) and what Chromium's line breaker reads positions from, so
 * a line that starts mid-word (overflow-wrap) does not carry the kerning with
 * the grapheme left behind on the previous line. The advances still add up
 * to the segment's width.
 */
function lazyAdvances(original: number[], context: string, contextWidth: number, segment: string, measure: (text: string) => number, letterSpacing = 0): number[] {
  let computed: number[] | null = null;
  const compute = (): number[] => {
    const parts = graphemes(segment);
    if (parts.length !== original.length) return (computed = original);
    const n = parts.length;
    const out: number[] = new Array(n);
    if (n <= MAX_PREFIX_GRAPHEMES) {
      let prefix = context;
      let previous = contextWidth;
      for (let g = 0; g < n; g++) {
        prefix += parts[g];
        const width = measure(prefix);
        out[g] = width - previous;
        previous = width;
      }
    } else {
      // Very long runs: each grapheme in the context of the one before it (Pretext's pair mode).
      for (let g = 0; g < n; g++) out[g] = g === 0 ? measure(parts[0]!) : measure(parts[g - 1]! + parts[g]!) - measure(parts[g - 1]!);
    }
    for (let g = 0; g + 1 < n; g++) {
      const pair = measure(parts[g]! + parts[g + 1]!) - measure(parts[g]!) - measure(parts[g + 1]!);
      if (pair !== 0) {
        out[g]! += pair;
        out[g + 1]! -= pair;
      }
    }
    if (letterSpacing !== 0) {
      // Pretext adds the spacing after every grapheme; Chromium adds none after an invisible one (LRM, WJ, ZWJ, BOM...).
      for (let g = 0; g < n; g++) if (isInvisibleGrapheme(parts[g]!)) out[g]! -= letterSpacing;
    }
    return (computed = out);
  };
  return new Proxy(original, {
    get(target, prop, receiver) {
      if (typeof prop === "string") {
        const c = prop.charCodeAt(0);
        if (c >= 48 && c <= 57) return (computed ?? compute())[Number(prop)];
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/** `advances` with `extra` added to its last entry, read lazily like lazyAdvances. */
export function withLastAdvance(advances: number[], extra: number): number[] {
  return new Proxy(advances, {
    get(target, prop, receiver) {
      if (typeof prop === "string") {
        const c = prop.charCodeAt(0);
        if (c >= 48 && c <= 57) {
          const value = Reflect.get(target, prop, receiver) as number;
          return Number(prop) === target.length - 1 ? value + extra : value;
        }
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Rewrites `prepared` (from Pretext.prepareWithSegments) in place; see the
 * file comment. Returns true when some breakable segment kept Pretext's
 * approximate break advances: it was too long for contextual ones
 * (MAX_CONTEXTUAL_SEGMENT_UNITS), or `breakAdvances` is false (huge input,
 * where recomputing every word's per-grapheme advances costs more than the
 * approximate answer is worth).
 */
export function applyContextualWidths(prepared: unknown, font: ResolvedFont, breakAdvances = true): boolean {
  const p = preparedArrays(prepared);
  if (!p) return false;
  let approximated = false;
  const measure = (text: string): number => (text === "" ? 0 : measureRunPx(text, font.face, font.size, font.ligatures));
  let run = "";
  let runWidth = 0;
  for (let i = 0; i < p.segments.length; i++) {
    const kind = p.kinds[i]!;
    const segment = p.segments[i]!;
    if (kind === "hard-break" || kind === "tab") {
      // Tabs advance to a stop at layout time: no shaping context crosses them.
      run = "";
      runWidth = 0;
      continue;
    }
    if (hasUncovered(segment, font)) {
      // Uncovered text is estimated grapheme by grapheme, without context. Pretext measured it with emoji at
      // 1em (see estimateGraphemePx); the estimates here reserve the room the emoji font takes.
      run = "";
      runWidth = 0;
      const counted = p.letterSpacing !== 0 ? p.spacingGraphemeCounts[i]! : 0;
      const delta = measure(segment) - (p.widths[i]! - (counted > 1 ? (counted - 1) * p.letterSpacing : 0));
      if (kind !== "soft-hyphen" && Math.abs(delta) > 1e-9) {
        p.widths[i]! += delta;
        if (p.lineEndFitAdvances[i] !== 0) p.lineEndFitAdvances[i]! += delta;
        if (p.lineEndPaintAdvances[i] !== 0) p.lineEndPaintAdvances[i]! += delta;
      }
      const advances = p.breakableFitAdvances[i];
      if (advances && /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(segment)) {
        const parts = graphemes(segment);
        if (parts.length === advances.length) p.breakableFitAdvances[i] = parts.map((g) => measure(g));
      }
      continue;
    }
    if (run.length > MAX_CONTEXT_LENGTH) {
      run = "";
      runWidth = 0;
    }
    const context = run;
    const contextWidth = runWidth;
    const total = measure(context + segment);
    const ls = p.letterSpacing;
    const counted = ls !== 0 ? p.spacingGraphemeCounts[i]! : 0;
    const spacing = counted > 1 ? (counted - 1) * ls : 0;
    let delta = total - contextWidth - (p.widths[i]! - spacing);
    // Chromium adds no letter-spacing after invisible graphemes (LRM, RLM, WJ, ZWJ, BOM, variation selectors).
    const visible = counted > 0 && kind !== "tab" ? countSpacingGraphemes(segment) : counted;
    if (visible !== counted) {
      delta += (visible > 1 ? (visible - 1) * ls : 0) - spacing;
      p.spacingGraphemeCounts[i] = visible;
      if (visible === 0 && p.lineEndFitAdvances[i] !== 0) p.lineEndFitAdvances[i]! -= ls;
    }
    if (kind !== "soft-hyphen" && Math.abs(delta) > 1e-9) {
      p.widths[i]! += delta;
      if (p.lineEndFitAdvances[i] !== 0) p.lineEndFitAdvances[i]! += delta;
      if (p.lineEndPaintAdvances[i] !== 0) p.lineEndPaintAdvances[i]! += delta;
    }
    const advances = p.breakableFitAdvances[i];
    if (advances) {
      if (!breakAdvances || segment.length > MAX_CONTEXTUAL_SEGMENT_UNITS) approximated = true;
      else p.breakableFitAdvances[i] = lazyAdvances(advances, context, contextWidth, segment, measure, visible !== counted ? ls : 0);
    }
    if ((kind === "space" || kind === "preserved-space") && i > 0 && context !== "") {
      // The kerning between a word's last glyph and the space after it sits on that glyph, as the shaper
      // stores it, so it stays when the space ends the line (Inter Bold kerns ", " by up to 0.035em).
      const kern = total - contextWidth - measure(segment);
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
    if (kind === "space" || kind === "preserved-space") {
      // A line can start after a space: what follows is shaped in the space's context only.
      run = segment;
      runWidth = measure(segment);
    } else {
      run = context + segment;
      runWidth = total;
    }
  }
  return approximated;
}
