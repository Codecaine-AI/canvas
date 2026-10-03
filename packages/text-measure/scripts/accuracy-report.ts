#!/usr/bin/env bun
/**
 * Prints the accuracy of both headless backends against the committed
 * Chromium truth, with the worst cases. The test (test/accuracy.test.ts)
 * asserts on the same numbers; this is the human-readable view.
 *   bun canvas/packages/text-measure/scripts/accuracy-report.ts [--worst N]
 */

import { useHarfBuzz } from "../src/headless.ts";
import { useTableBackend } from "../src/index.ts";
import { evaluate, summarize, type Evaluation } from "../test/accuracy/evaluate.ts";

const worstArg = process.argv.indexOf("--worst");
const WORST = worstArg > 0 ? Number(process.argv[worstArg + 1]) : 8;

function details(e: Evaluation): string {
  const out: string[] = [];
  const covered = e.mismatches.filter((m) => m.covered);
  if (e.edgeNotBorderline.length) {
    out.push("covered edge disagreements NOT borderline:");
    for (const m of e.edgeNotBorderline.slice(0, WORST)) out.push(`  ${m.font} ${m.id} delta ${m.delta} ours ${m.ours} dom ${m.dom} ${m.verdict} ${JSON.stringify(m.text).slice(0, 70)}`);
  }
  if (e.contradictions.length) {
    out.push("contradictions:");
    for (const c of e.contradictions.slice(0, WORST)) out.push(`  ${c.font} ${c.id} w ${c.width.toFixed(3)} maxLines ${c.maxLines} dom ${c.dom} verdict ${c.verdict}`);
  }
  out.push(`covered line mismatches (first ${WORST}):`);
  for (const m of covered.slice(0, WORST)) out.push(`  ${m.font} ${m.id} @${m.width} ours ${m.ours} dom ${m.dom} ${JSON.stringify(m.text).slice(0, 70)}`);
  if (e.uncoveredReliable.length) out.push(`uncovered strings reported reliable: ${e.uncoveredReliable.join(", ")}`);
  return out.join("\n");
}

await useHarfBuzz();
const hb = evaluate();
console.log(summarize("harfbuzz", hb));
console.log(details(hb));

useTableBackend();
const table = evaluate();
console.log(summarize("table", table));
console.log(details(table));
