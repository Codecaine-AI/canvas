/**
 * Recomputes the Chromium truth grid (chromium-truth.json) with the active
 * backend and scores it. Shared by test/accuracy.test.ts and
 * scripts/accuracy-report.ts.
 */

import { readFileSync } from "node:fs";
import { fitText, measureWidth, uncoveredChars, wrapText, type FontSpec } from "../../src/index.ts";
import { decodeRows, edgeWidths, type TruthFile } from "./truth-format.ts";

export const truth: TruthFile = JSON.parse(readFileSync(new URL("./chromium-truth.json", import.meta.url), "utf8"));
export const corpus: Array<{ id: string; tag: string; text: string }> = JSON.parse(readFileSync(new URL("./corpus.json", import.meta.url), "utf8"));

export interface Mismatch {
  covered: boolean;
  grid: string;
  font: string;
  id: string;
  text: string;
  width: number;
  ours: number;
  dom: number;
}

export interface EdgeMiss {
  grid: string;
  font: string;
  id: string;
  text: string;
  delta: number;
  width: number;
  ours: number;
  dom: number;
  verdict: string;
}

export interface Bucket {
  /** Line-count comparisons at the grid widths. */
  lines: number;
  lineMismatches: number;
  /** Edge-sweep comparisons ("fits on one line?") and disagreements. */
  edges: number;
  edgeMisses: number;
  /** Signed single-line width errors (ours - DOM). */
  widthErrors: number[];
}

export interface Evaluation {
  covered: Bucket;
  uncovered: Bucket;
  bySize: Map<string, Bucket>;
  mismatches: Mismatch[];
  edgeMisses: EdgeMiss[];
  /** Covered edge disagreements fitText did not call borderline. */
  edgeNotBorderline: EdgeMiss[];
  /** Uncovered strings fitText reported as reliable (must stay empty). */
  uncoveredReliable: string[];
  /** fitText verdicts that contradict the DOM (fits vs overflows) on covered rows, at grid and edge widths. */
  contradictions: Array<{ font: string; id: string; width: number; maxLines: number; dom: number; verdict: string }>;
  verdictChecks: number;
  ms: number;
}

const emptyBucket = (): Bucket => ({ lines: 0, lineMismatches: 0, edges: 0, edgeMisses: 0, widthErrors: [] });

export function evaluate(): Evaluation {
  const t0 = performance.now();
  const result: Evaluation = {
    covered: emptyBucket(),
    uncovered: emptyBucket(),
    bySize: new Map(),
    mismatches: [],
    edgeMisses: [],
    edgeNotBorderline: [],
    uncoveredReliable: [],
    contradictions: [],
    verdictChecks: 0,
    ms: 0,
  };
  for (const grid of truth.grids) {
    const coveredIds = corpus.map((entry) => uncoveredChars(entry.text, grid.family).length === 0);
    for (const font of grid.fonts) {
      const spec: FontSpec = { family: grid.family, size: font.size, weight: font.weight, letterSpacing: font.letterSpacing };
      const label = `${grid.name} ${font.weight} ${font.size}px${font.letterSpacing ? ` ls ${font.letterSpacing}` : ""}`;
      const sizeKey = `${grid.family} ${font.size}px${font.letterSpacing ? " spaced" : ""}`;
      if (!result.bySize.has(sizeKey)) result.bySize.set(sizeKey, emptyBucket());
      const bySize = result.bySize.get(sizeKey)!;
      decodeRows(font.rows).forEach((row, index) => {
        const entry = corpus[index]!;
        const covered = coveredIds[index]!;
        const bucket = covered ? result.covered : result.uncovered;
        const err = measureWidth(entry.text, spec) - row.natural;
        bucket.widthErrors.push(err);
        if (covered) bySize.widthErrors.push(err);

        grid.widths.forEach((width, j) => {
          const dom = row.counts[j]!;
          const ours = wrapText(entry.text, spec, { maxWidth: width, lineHeight: font.lineHeight }).lineCount;
          bucket.lines++;
          if (covered) bySize.lines++;
          if (ours !== dom) {
            bucket.lineMismatches++;
            if (covered) bySize.lineMismatches++;
            result.mismatches.push({ covered, grid: grid.name, font: label, id: entry.id, text: entry.text, width, ours, dom });
          }
          if (covered) {
            // Never contradict the DOM: a box of exactly `dom` lines must not "overflow", one line fewer must not "fit".
            for (const maxLines of dom > 1 ? [dom, dom - 1] : [dom]) {
              const verdict = fitText(entry.text, spec, { width, lineHeight: font.lineHeight, maxLines }).verdict;
              result.verdictChecks++;
              const domFits = dom <= maxLines;
              if ((domFits && verdict === "overflows") || (!domFits && verdict === "fits")) {
                result.contradictions.push({ font: label, id: entry.id, width, maxLines, dom, verdict });
              }
            }
          }
        });

        const widths = edgeWidths(row.natural, truth.deltas);
        widths.forEach((width, k) => {
          const dom = row.edges[k]!;
          const fit = fitText(entry.text, spec, { width, lineHeight: font.lineHeight, maxLines: 1 }, { tolerance: 1 });
          bucket.edges++;
          if (covered) {
            bySize.edges++;
            result.verdictChecks++;
            const domFits = dom <= 1;
            if ((domFits && fit.verdict === "overflows") || (!domFits && fit.verdict === "fits")) {
              result.contradictions.push({ font: label, id: entry.id, width, maxLines: 1, dom, verdict: fit.verdict });
            }
          } else if (fit.reliable && k === 0) {
            result.uncoveredReliable.push(entry.id);
          }
          if ((fit.lineCount <= 1) !== (dom <= 1)) {
            bucket.edgeMisses++;
            if (covered) bySize.edgeMisses++;
            const miss: EdgeMiss = { grid: grid.name, font: label, id: entry.id, text: entry.text, delta: truth.deltas[k]!, width, ours: fit.lineCount, dom, verdict: fit.verdict };
            result.edgeMisses.push(miss);
            if (covered && fit.verdict !== "borderline") result.edgeNotBorderline.push(miss);
          }
        });
      });
    }
  }
  result.ms = performance.now() - t0;
  return result;
}

/** Quantile of the absolute values (nearest rank). */
export function absQuantile(values: readonly number[], q: number): number {
  const sorted = values.map(Math.abs).sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

export function signedQuantile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

export function summarize(name: string, e: Evaluation): string {
  const fmt = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(3);
  const c = e.covered;
  const u = e.uncovered;
  const borderline = e.edgeMisses.filter((m) => m.verdict === "borderline").length;
  const coveredEdgeMisses = c.edgeMisses;
  const lines = [
    `=== ${name} (${(e.ms / 1000).toFixed(1)}s)`,
    `line-count mismatches at grid widths: covered ${c.lineMismatches}/${c.lines}, all ${c.lineMismatches + u.lineMismatches}/${c.lines + u.lines}`,
    `edge sweep "fits one line?" disagreements: covered ${coveredEdgeMisses}/${c.edges} (borderline ${coveredEdgeMisses - e.edgeNotBorderline.length}), all ${c.edgeMisses + u.edgeMisses}/${c.edges + u.edges} (borderline ${borderline})`,
    `fitText verdicts contradicting the DOM (covered): ${e.contradictions.length}/${e.verdictChecks}`,
    `single-line width error (ours - DOM), covered: p50 ${fmt(signedQuantile(c.widthErrors, 0.5))}  |p95| ${absQuantile(c.widthErrors, 0.95).toFixed(3)}  |max| ${absQuantile(c.widthErrors, 1).toFixed(3)}  [min ${fmt(signedQuantile(c.widthErrors, 0))}, max ${fmt(signedQuantile(c.widthErrors, 1))}]`,
    `single-line width error, uncovered: |p95| ${absQuantile(u.widthErrors, 0.95).toFixed(2)}  |max| ${absQuantile(u.widthErrors, 1).toFixed(2)}`,
    `by size (covered): ${[...e.bySize.entries()].map(([k, b]) => `${k}: lines ${b.lineMismatches}/${b.lines}, edges ${b.edgeMisses}/${b.edges}, |max err| ${absQuantile(b.widthErrors, 1).toFixed(3)}`).join("; ")}`,
  ];
  return lines.join("\n");
}
