/**
 * zz-dom-capture — renders the DOM-equivalence corpus through CanvasStage
 * (react-dom/server renderToStaticMarkup) under three prop profiles and
 * writes { [docName]: { [profile]: html } } to a JSON file.
 *
 * Usage:
 *   bun packages/canvas/zz-dom-capture.ts <out.json>
 *   bun packages/canvas/zz-dom-capture.ts --compare <a.json> <b.json>
 *
 * ZZ_CANVASES_DIR overrides the repo-root canvases/ fixture directory (used
 * to capture in an older worktree against the CURRENT fixture documents so
 * only rendering-code differences show up).
 */

import { readFileSync, writeFileSync } from "node:fs";
import {
  buildCorpus,
  captureCorpus,
  compareCaptures,
  partitionByAdversarial,
  type Capture,
} from "./src/zz-dom-fixtures";

function runCompare(pathA: string, pathB: string): number {
  const a = JSON.parse(readFileSync(pathA, "utf8")) as Capture;
  const b = JSON.parse(readFileSync(pathB, "utf8")) as Capture;
  const result = compareCaptures(a, b);
  const failures = partitionByAdversarial(result.failures);
  const warnings = partitionByAdversarial(result.warnings);

  if (failures.normal.length === 0 && warnings.normal.length === 0) {
    console.log("OK: all non-adversarial docs/profiles are DOM-equivalent.");
  }
  if (failures.normal.length > 0) {
    console.log(`\nFAILURES (${failures.normal.length}):`);
    for (const line of failures.normal) console.log(`  - ${line}`);
  }
  if (warnings.normal.length > 0) {
    console.log(`\nWARNINGS (${warnings.normal.length}) — manual cascade audit:`);
    for (const line of warnings.normal) console.log(`  - ${line}`);
  }
  if (failures.adversarial.length > 0 || warnings.adversarial.length > 0) {
    console.log(
      `\nADVERSARIAL DIFFS (${failures.adversarial.length + warnings.adversarial.length}) — adjudicated by the orchestrator, not auto-fail:`,
    );
    for (const line of failures.adversarial) console.log(`  - [diff] ${line}`);
    for (const line of warnings.adversarial) console.log(`  - [warn] ${line}`);
  } else {
    console.log("\nAdversarial docs: no diffs.");
  }
  return failures.normal.length > 0 ? 1 : 0;
}

function runCapture(outPath: string): number {
  const corpus = buildCorpus();
  if (corpus.failures.length > 0) {
    console.warn(`Fixture load/validation failures (${corpus.failures.length}):`);
    for (const failure of corpus.failures) console.warn(`  - ${failure.file}: ${failure.message}`);
  }
  const capture = captureCorpus(corpus);
  writeFileSync(outPath, JSON.stringify(capture, null, 1));
  console.log(
    `Captured ${corpus.entries.length} documents x 3 profiles (${corpus.entries.filter((e) => e.adversarial).length} adversarial) -> ${outPath}`,
  );
  return 0;
}

function main(): number {
  const args = process.argv.slice(2);
  if (args[0] === "--compare") {
    const [, pathA, pathB] = args;
    if (!pathA || !pathB) {
      console.error("Usage: bun packages/canvas/zz-dom-capture.ts --compare <a.json> <b.json>");
      return 2;
    }
    return runCompare(pathA, pathB);
  }
  const outPath = args[0];
  if (!outPath) {
    console.error("Usage: bun packages/canvas/zz-dom-capture.ts <out.json>");
    return 2;
  }
  return runCapture(outPath);
}

process.exit(main());
