#!/usr/bin/env bun
/**
 * Timing for 1,000 labels (the accuracy corpus, topped up with numbered
 * variants) at 400 14px Inter in a 200px box, per backend:
 *   prepare  Pretext prepareWithSegments + contextual widths (cold: caches flushed; warm: repeated)
 *   layout   Pretext layout() line counts at one width: first pass (computes the
 *            break advances of words wider than the box), then repeated
 *   wrap     wrapText() (prepare + lines + whole-run line widths)
 *   fit      fitText() with maxLines 2
 *   measure  measureWidth()
 * Medians of 7 rounds, milliseconds per 1,000 labels.
 *   bun canvas/packages/text-measure/scripts/bench.ts
 */

import { readFileSync } from "node:fs";
import { harfBuzzStats, useHarfBuzz } from "../src/headless.ts";
import { fitText, measureWidth, useTableBackend, wrapText, type FontSpec } from "../src/index.ts";
import { resolveFont } from "../src/font.ts";
import { pretext } from "../src/pretext-binding.ts";
import { applyContextualWidths } from "../src/pretext-context.ts";

const corpus = JSON.parse(readFileSync(new URL("../test/accuracy/corpus.json", import.meta.url), "utf8")) as Array<{ text: string }>;
const labels: string[] = [];
for (let i = 0; labels.length < 1000; i++) labels.push(i < corpus.length ? corpus[i]!.text : `${corpus[i % corpus.length]!.text} (${Math.floor(i / corpus.length) + 1})`);

const font: FontSpec = { family: "Inter", size: 14 };
const resolved = resolveFont(font);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const time = (fn: () => void) => {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
};

async function run(name: string, flush: () => Promise<void> | void) {
  const P = pretext();
  const cold: number[] = [];
  const warm: number[] = [];
  const layout: number[] = [];
  const relayout: number[] = [];
  const wrap: number[] = [];
  const fit: number[] = [];
  const measure: number[] = [];
  for (let round = 0; round < 7; round++) {
    await flush();
    let prepared: ReturnType<typeof P.prepareWithSegments>[] = [];
    cold.push(time(() => {
      prepared = labels.map((t) => {
        const p = P.prepareWithSegments(t, resolved.key);
        applyContextualWidths(p, resolved);
        return p;
      });
    }));
    warm.push(time(() => {
      prepared = labels.map((t) => {
        const p = P.prepareWithSegments(t, resolved.key);
        applyContextualWidths(p, resolved);
        return p;
      });
    }));
    const layoutAll = () => {
      let sum = 0;
      for (const p of prepared) sum += P.layout(p, 200, 21).lineCount;
      if (sum < 0) throw new Error("unreachable");
    };
    layout.push(time(layoutAll));
    relayout.push(time(layoutAll));
    wrap.push(time(() => labels.forEach((t) => wrapText(t, font, { maxWidth: 200, lineHeight: 21 }))));
    fit.push(time(() => labels.forEach((t) => fitText(t, font, { width: 200, lineHeight: 21, maxLines: 2 }))));
    measure.push(time(() => labels.forEach((t) => measureWidth(t, font))));
  }
  const f = (xs: number[]) => median(xs).toFixed(1).padStart(6);
  console.log(`${name.padEnd(9)} prepare cold ${f(cold)}  warm ${f(warm)}  layout ${f(layout)} / again ${f(relayout)}  wrap ${f(wrap)}  fit ${f(fit)}  measure ${f(measure)}  (first cold ${cold[0]!.toFixed(1)})`);
}

useTableBackend();
await run("table", () => useTableBackend());
await useHarfBuzz();
// Flushing = switching away and back (clears Pretext's caches; the HarfBuzz LRU stays warm).
await run("harfbuzz", async () => {
  useTableBackend();
  await useHarfBuzz();
});
console.log("harfbuzz cache", JSON.stringify(harfBuzzStats()));
