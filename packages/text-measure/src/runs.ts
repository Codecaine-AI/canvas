/**
 * wrapRuns(): line breaking for a paragraph of inline runs with their own
 * fonts and inline padding, the way Chromium lays out an HTML block whose
 * inline children are those runs (white-space normal or pre-wrap,
 * overflow-wrap: break-word).
 *
 *   1. The runs' texts are concatenated and whitespace-normalized the way
 *      Pretext normalizes one block, keeping a map from every laid-out unit
 *      back to its run and source offset. "normal" collapses whitespace
 *      across run boundaries as HTML does: the kept space belongs to the run
 *      of the first whitespace character.
 *   2. Pretext prepares that text, so break opportunities come from the
 *      whole paragraph and a run boundary is not one ("foo" + "bar" is one
 *      word); pretext-runs.ts then rewrites its widths run font by run font.
 *   3. Pretext breaks the lines. Each line's cursors map back to source
 *      offsets, the line splits into one fragment per run, and fragments are
 *      positioned by whole-run shaping, like wrapText's line widths.
 */

import { measureRunPx } from "./backend.ts";
import { resolveFont, splitFamilies, type ResolvedFont } from "./font.ts";
import {
  assertNumber,
  blankInsertIndex,
  blankParagraphs,
  ceilLayoutUnit,
  floorLayoutUnit,
  keepZeroWidthSpacesAtLineStart,
  MAX_EXACT_UNITS,
  pretextMaxWidth,
  whiteSpaceOf,
  type WhiteSpace,
} from "./measure.ts";
import { pretext } from "./pretext-binding.ts";
import { applyRunsWidths, type ShapingGroup } from "./pretext-runs.ts";
import { alignBreakOpportunities } from "./pretext-segments.ts";
import { countSpacingGraphemes, graphemes } from "./text.ts";
import type { RunFragment, RunsLine, RunsWrapResult, TextRun, WrapOptions } from "./types.ts";

interface Run {
  readonly text: string;
  readonly font: ResolvedFont;
  /** Runs with equal keys and no padding between them are shaped as one, as Chromium does across inline elements. */
  readonly shapingKey: string;
  /** Padding in layout units (1/64 px, rounded down like Chromium's LayoutUnit). */
  readonly padStart: number;
  readonly padEnd: number;
}

/** The laid-out (whitespace-normalized) text and, for every UTF-16 unit, its run and source range in that run's text. */
interface Laid {
  readonly text: string;
  readonly runOf: number[];
  readonly src: number[];
  readonly srcEnd: number[];
}

interface Draft {
  run: number;
  text: string;
  /** Length of `text` before the line's trailing spaces. */
  visible: number;
}

function toRun(input: TextRun, index: number): Run {
  if (input === null || typeof input !== "object") throw new TypeError(`text-measure: runs[${index}] must be a TextRun object`);
  const font = resolveFont(input.font);
  const pad = (value: unknown, what: string): number => (value === undefined ? 0 : floorLayoutUnit(assertNumber(value, `runs[${index}].${what}`, { min: 0 })));
  const family = splitFamilies(typeof input.font.family === "string" ? input.font.family : "").join(",");
  return {
    text: String(input.text),
    font,
    // Chromium shapes adjacent inline items together when their fonts are equal: family list, size, weight, spacing.
    shapingKey: `${family}\u0000${font.size}\u0000${input.font.weight ?? 400}\u0000${font.letterSpacing}`,
    padStart: pad(input.padStart, "padStart"),
    padEnd: pad(input.padEnd, "padEnd"),
  };
}

/**
 * The text Pretext lays out for the concatenated runs (its own
 * normalization, so Pretext leaves it as it is) with the unit-to-source map.
 */
function normalize(texts: readonly string[], whiteSpace: WhiteSpace): Laid {
  const out: string[] = [];
  const runOf: number[] = [];
  const src: number[] = [];
  const srcEnd: number[] = [];
  const emit = (unit: string, run: number, from: number, to: number): void => {
    out.push(unit);
    runOf.push(run);
    src.push(from);
    srcEnd.push(to);
  };
  if (whiteSpace === "normal") {
    // Runs of space, tab, LF, CR, FF become one space, kept in the run of the first; none at either end.
    let inSpace = false;
    let spaceRun = 0;
    let spaceFrom = 0;
    let spaceTo = 0;
    texts.forEach((text, run) => {
      for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d || c === 0x0c) {
          if (!inSpace) {
            inSpace = true;
            spaceRun = run;
            spaceFrom = i;
            spaceTo = i + 1;
          } else if (run === spaceRun) {
            spaceTo = i + 1;
          }
          continue;
        }
        if (inSpace) {
          if (out.length > 0) emit(" ", spaceRun, spaceFrom, spaceTo);
          inSpace = false;
        }
        emit(text[i]!, run, i, i + 1);
      }
    });
  } else {
    // CR and FF are dropped, as Chromium drops them in pre-wrap (CR LF is one LF); everything else stays.
    // A dropped character joins the source range of its run's previous unit, else of its run's next one.
    texts.forEach((text, run) => {
      let pendingFrom = -1;
      for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (c === 0x0d || c === 0x0c) {
          if (runOf.length > 0 && runOf[runOf.length - 1] === run && srcEnd[srcEnd.length - 1] === i) srcEnd[srcEnd.length - 1] = i + 1;
          else if (pendingFrom < 0) pendingFrom = i;
          continue;
        }
        emit(text[i]!, run, pendingFrom >= 0 ? pendingFrom : i, i + 1);
        pendingFrom = -1;
      }
    });
  }
  return { text: out.join(""), runOf, src, srcEnd };
}

/** Ranges [start, end) of Inter's contextual arrow clusters in `text`, as Chromium 153 merges them (verified pairwise). */
export function arrowClusters(text: string): Array<[number, number]> {
  if (!/[-=]/.test(text)) return [];
  const out: Array<[number, number]> = [];
  for (const m of text.matchAll(/<-{1,3}>?|<={2}>?|<=>|-{1,3}>|={1,2}>/g)) out.push([m.index!, m.index! + m[0].length]);
  return out;
}

/** Pretext's tab advance: to the next multiple of the tab stop (a full stop when already on one). */
function tabAdvance(at: number, stop: number): number {
  if (stop <= 0) return 0;
  const remainder = at % stop;
  return Math.abs(remainder) <= 1e-6 ? stop : stop - remainder;
}

/** Width of `text` shaped as one run plus letter-spacing after every grapheme, as wrapText measures a line. */
function runWidth(text: string, font: ResolvedFont): number {
  if (text === "") return 0;
  let width = measureRunPx(text, font.face, font.size, font.ligatures);
  if (font.letterSpacing !== 0) width += font.letterSpacing * countSpacingGraphemes(text);
  return width;
}

const EMPTY: RunsWrapResult = { lines: [], lineCount: 0, height: 0, maxLineWidth: 0 };

/**
 * Breaks a paragraph of inline runs (mixed fonts, inline padding) into lines
 * the way the browser lays out a block holding them as inline children, for
 * a box `opts.maxWidth` wide. See README.md ("Mixed runs") for the semantics.
 */
export function wrapRuns(runs: readonly TextRun[], opts: WrapOptions): RunsWrapResult {
  if (!Array.isArray(runs)) throw new TypeError("text-measure: wrapRuns needs an array of TextRun");
  const inputs = runs.map(toRun);
  if (opts === null || typeof opts !== "object") throw new TypeError("text-measure: wrapRuns needs { maxWidth, lineHeight }");
  const maxWidth = assertNumber(opts.maxWidth, "maxWidth", { min: 0, allowInfinity: true });
  const lineHeight = assertNumber(opts.lineHeight, "lineHeight", { min: 0 });
  const whiteSpace = whiteSpaceOf(opts.whiteSpace);

  const laid = normalize(
    inputs.map((run) => run.text),
    whiteSpace,
  );
  const text = laid.text;
  if (text === "") return { ...EMPTY, lines: [] };

  // Each run's laid-out units are contiguous: [first, last].
  const first = new Array<number>(inputs.length).fill(-1);
  const last = new Array<number>(inputs.length).fill(-1);
  laid.runOf.forEach((run, k) => {
    if (first[run] === -1) first[run] = k;
    last[run] = k;
  });

  // Letter-spacing every run shares is Pretext's own; otherwise it is folded into the widths.
  const present = inputs.flatMap((run, r) => (first[r]! >= 0 ? [r] : []));
  const shared = inputs[present[0]!]!.font.letterSpacing;
  const nativeSpacing = present.every((r) => inputs[r]!.font.letterSpacing === shared) ? shared : 0;

  const groups: ShapingGroup[] = [];
  const groupOfRun = new Array<number>(inputs.length).fill(-1);
  let previous = -1;
  for (const r of present) {
    const run = inputs[r]!;
    const before = previous >= 0 ? inputs[previous]! : null;
    if (!before || before.shapingKey !== run.shapingKey || before.padEnd !== 0 || run.padStart !== 0) {
      groups.push({ font: run.font, extraSpacing: run.font.letterSpacing - nativeSpacing });
    }
    groupOfRun[r] = groups.length - 1;
    previous = r;
  }
  const groupOf = laid.runOf.map((run) => groupOfRun[run]!);

  let padAt: Float64Array | null = null;
  for (const r of present) {
    const run = inputs[r]!;
    if (run.padStart === 0 && run.padEnd === 0) continue;
    padAt ??= new Float64Array(text.length);
    padAt[first[r]!]! += run.padStart;
    padAt[last[r]!]! += run.padEnd;
  }

  const P = pretext();
  const base = inputs[laid.runOf[0]!]!.font;
  const prepared = P.prepareWithSegments(text, base.key, nativeSpacing === 0 ? { whiteSpace } : { whiteSpace, letterSpacing: nativeSpacing });
  alignBreakOpportunities(prepared);
  const starts = applyRunsWidths(prepared, { text, groupOf, groups, padAt, preparedKey: base.key, contextualBreaks: text.length <= MAX_EXACT_UNITS });
  if (!starts) {
    throw new Error("text-measure: wrapRuns cannot use this @chenglou/pretext build (its prepared text is not the shape 0.0.9 has); widths would be wrong, so nothing is guessed");
  }
  keepZeroWidthSpacesAtLineStart(prepared); // as wrapText does, after the widths
  const { kinds, segments } = prepared as unknown as { kinds: string[]; segments: string[] };
  const n = segments.length;
  const tabStop = (prepared as unknown as { tabStopAdvance: number }).tabStopAdvance;

  const graphemeEnds = new Map<number, number[]>();
  const offsetOf = (cursor: { segmentIndex: number; graphemeIndex: number }): number => {
    const s = cursor.segmentIndex;
    if (s >= n) return text.length;
    if (cursor.graphemeIndex === 0) return starts[s]!;
    let ends = graphemeEnds.get(s);
    if (!ends) {
      ends = [];
      let offset = 0;
      for (const g of graphemes(segments[s]!)) ends.push((offset += g.length));
      graphemeEnds.set(s, ends);
    }
    return starts[s]! + ends[cursor.graphemeIndex - 1]!;
  };

  const result = P.layoutWithLines(prepared, pretextMaxWidth(maxWidth), lineHeight);
  type PretextLine = (typeof result.lines)[number];
  const laidLines: Array<Pick<PretextLine, "text" | "width" | "start" | "end">> = [...result.lines];
  // Paragraphs of only zero-width spaces and soft hyphens get one line in Chromium, none in Pretext (as in wrapText).
  const blanks = blankParagraphs(prepared);
  for (let b = blanks.length - 1; b >= 0; b--) {
    const blank = blanks[b]!;
    const at = blankInsertIndex(
      result.lines.map((line) => line.start.segmentIndex),
      blank,
    );
    laidLines.splice(at, 0, { text: blank.text, width: 0, start: { segmentIndex: blank.start, graphemeIndex: 0 }, end: { segmentIndex: blank.end, graphemeIndex: 0 } });
  }
  const lines: RunsLine[] = laidLines.map((line) => {
    const from = offsetOf(line.start);
    const to = offsetOf(line.end);

    // The line's text as Pretext builds it: soft hyphens and hard breaks left out, "-" at a soft-hyphen break.
    const drafts: Draft[] = [];
    const lastSegment = line.end.graphemeIndex > 0 ? line.end.segmentIndex : line.end.segmentIndex - 1;
    for (let s = line.start.segmentIndex; s <= lastSegment && s < n; s++) {
      if (kinds[s] === "soft-hyphen" || kinds[s] === "hard-break") continue;
      const end = Math.min(starts[s + 1]!, to);
      for (let k = Math.max(starts[s]!, from); k < end; ) {
        const run = laid.runOf[k]!;
        const stop = Math.min(end, last[run]! + 1);
        const piece = text.slice(k, stop);
        const tail = drafts[drafts.length - 1];
        if (tail && tail.run === run) tail.text += piece;
        else drafts.push({ run, text: piece, visible: 0 });
        k = stop;
      }
    }
    const e = line.end;
    if (e.graphemeIndex === 0 && e.segmentIndex > 0 && e.segmentIndex < n && kinds[e.segmentIndex - 1] === "soft-hyphen") {
      const run = laid.runOf[starts[e.segmentIndex - 1]!]!;
      const tail = drafts[drafts.length - 1];
      if (tail && tail.run === run) tail.text += "-";
      else drafts.push({ run, text: "-", visible: 0 });
    }
    const joined = drafts.map((d) => d.text).join("");
    if (joined !== line.text) {
      throw new Error(`text-measure: wrapRuns could not map Pretext's line ${JSON.stringify(line.text)} back to the runs (got ${JSON.stringify(joined)})`);
    }

    // Spaces at the end of the line hang (pre-wrap) or collapse (normal): they take no width.
    let trailing = joined.length - joined.replace(/ +$/, "").length;
    for (let i = drafts.length - 1; i >= 0; i--) {
      const d = drafts[i]!;
      d.visible = Math.max(0, d.text.length - trailing);
      trailing = Math.max(0, trailing - d.text.length);
    }
    const hasTab = joined.replace(/ +$/, "").includes("\t");

    const fragments: RunFragment[] = [];
    let x = 0;
    const place = (d: Draft, advance: number): void => {
      const run = inputs[d.run]!;
      const runFirst = first[d.run]!;
      const runLast = last[d.run]!;
      const pad = (runFirst >= from && runFirst < to ? run.padStart : 0) + (runLast >= from && runLast < to ? run.padEnd : 0);
      // Never negative (negative letter-spacing; a contextual glyph split across runs).
      const width = ceilLayoutUnit(Math.max(0, advance)) + pad;
      fragments.push({
        run: d.run,
        text: d.text,
        start: laid.src[Math.max(from, runFirst)]!,
        end: laid.srcEnd[Math.min(to, runLast + 1) - 1]!,
        x,
        width,
      });
      x += width;
    };

    if (hasTab) {
      // Tab stops depend on the position along the whole line: approximate fragments, Pretext's line width.
      for (const d of drafts) {
        const run = inputs[d.run]!;
        const textStart = x + (first[d.run]! >= from && first[d.run]! < to ? run.padStart : 0);
        let at = textStart;
        d.text
          .slice(0, d.visible)
          .split("\t")
          .forEach((piece, index) => {
            if (index > 0) at += tabAdvance(at, tabStop);
            at += runWidth(piece, run.font);
          });
        place(d, at - textStart);
      }
      return { text: line.text, width: ceilLayoutUnit(Math.max(0, line.width)), fragments };
    }

    // Runs of one shaping group are shaped together: positions inside them are prefix widths, with
    // the kerning across a run boundary on the left run (HarfBuzz adds a pair's kerning to its first glyph).
    for (let i = 0; i < drafts.length; ) {
      const group = groupOfRun[drafts[i]!.run];
      const font = inputs[drafts[i]!.run]!.font;
      let shaped = "";
      let position = 0;
      // Inter's arrow clusters (-> <=> -->...) are one glyph cluster: Chromium gives a run boundary inside one
      // to the run where the cluster starts, the whole cluster width, and 0 to the runs inside it.
      let groupText = "";
      for (let k = i; k < drafts.length && groupOfRun[drafts[k]!.run] === group; k++) groupText += drafts[k]!.text;
      const clusters = font.ligatures ? arrowClusters(groupText) : [];
      for (; i < drafts.length && groupOfRun[drafts[i]!.run] === group; i++) {
        const d = drafts[i]!;
        const next = drafts[i + 1];
        let advance = 0;
        const boundary = shaped.length + d.text.length;
        const inside = d.visible === d.text.length ? clusters.find(([s, e]) => s < boundary && boundary < e) : undefined;
        if (d.visible > 0) {
          let end: number;
          if (inside) {
            end = runWidth(groupText.slice(0, inside[1]), font);
          } else if (d.visible === d.text.length && next && next.visible > 0 && groupOfRun[next.run] === group) {
            const following = graphemes(next.text)[0]!;
            end = runWidth(shaped + d.text + following, font) - runWidth(following, font);
          } else if (d.visible < d.text.length || (next && next.visible === 0 && groupOfRun[next.run] === group && next.text.startsWith(" "))) {
            // Spaces end the line: the last glyph keeps its kerning with the first of them, as in wrapText.
            end = runWidth(shaped + d.text.slice(0, d.visible) + " ", font) - runWidth(" ", font);
          } else {
            end = runWidth(shaped + d.text.slice(0, d.visible), font);
          }
          // Positions only move forward: a prefix can measure wider than a longer one when a contextual
          // glyph (Inter's <=> or -> arrows) spans the run boundary; the later run then advances 0.
          advance = Math.max(0, end - position);
          position = Math.max(position, end);
        }
        shaped += d.text;
        place(d, advance);
      }
    }
    return { text: line.text, width: x, fragments };
  });

  let maxLineWidth = 0;
  for (const line of lines) if (line.width > maxLineWidth) maxLineWidth = line.width;
  return { lines, lineCount: lines.length, height: lines.length * lineHeight, maxLineWidth };
}
