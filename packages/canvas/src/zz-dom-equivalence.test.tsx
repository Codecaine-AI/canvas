/**
 * zz-dom-equivalence — DOM-equivalence gate for the registry refactor.
 *
 * When packages/canvas/zz-dom-baseline.json exists (captured via
 * `bun packages/canvas/zz-dom-capture.ts packages/canvas/zz-dom-baseline.json`),
 * this test re-renders the full corpus with the CURRENT code and compares
 * against the baseline:
 *   - HTML outside the single <style> block must be byte-identical;
 *   - the style block is compared structurally (selectors + per-selector
 *     declaration-sequence; cross-selector reordering is a printed warning).
 *
 * The figjam baseline (rendered with an explicit figjam style) must not move
 * unless figjam rendering changes on purpose — it was recaptured deliberately
 * when text measurement moved to @codecaine-ai/text-measure (caption bands,
 * label chips and the routes ending on them, the stage's pinned text
 * rendering, the title chip's box-sizing). The
 * schematic themes have their own baseline, packages/canvas/
 * zz-dom-baseline-themes.json (`bun packages/canvas/zz-dom-capture.ts --themes
 * packages/canvas/zz-dom-baseline-themes.json`): the corpus under
 * schematic-light and schematic-dark, plus the detail doc (object `detail`
 * lines, icon tiles, brand glyphs) under all three themes. Recapture it — and
 * only it — when schematic rendering changes on purpose.
 *
 * The adversarial doc (zz-d-adversarial) is reported but never auto-fails —
 * its diffs are adjudicated manually.
 */

import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ADVERSARIAL_DOC_NAMES,
  buildCorpus,
  buildThemedCorpus,
  captureCorpus,
  captureThemedCorpus,
  compareCaptures,
  partitionByAdversarial,
  type Capture,
} from "./zz-dom-fixtures";

const baselinePath = fileURLToPath(new URL("../zz-dom-baseline.json", import.meta.url));
const themedBaselinePath = fileURLToPath(new URL("../zz-dom-baseline-themes.json", import.meta.url));

/** The gate's assertions for one baseline file against a fresh capture. */
function gate(label: string, baseline: Capture, fresh: Capture, corpusFailures: string[], minEntries: number) {
  const result = compareCaptures(baseline, fresh);
  const failures = partitionByAdversarial(result.failures);
  const warnings = partitionByAdversarial(result.warnings);

  it("loads and validates every fixture canvas", () => {
    expect(corpusFailures).toEqual([]);
    expect(Object.keys(fresh).length).toBeGreaterThanOrEqual(minEntries);
  });

  it("covers every doc/profile present in the baseline (and vice versa)", () => {
    const coverage = [...failures.normal, ...failures.adversarial].filter((line) =>
      line.includes("present only in"),
    );
    expect(coverage).toEqual([]);
  });

  it("matches the baseline on every non-adversarial doc/profile", () => {
    if (warnings.normal.length > 0) {
      console.warn(
        `${label} WARNINGS (cross-selector order — manual cascade audit):\n${warnings.normal
          .map((line) => `  - ${line}`)
          .join("\n")}`,
      );
    }
    expect(failures.normal).toEqual([]);
  });

  it("reports (but does not fail on) adversarial-doc diffs", () => {
    const adversarialLines = [...failures.adversarial, ...warnings.adversarial];
    if (adversarialLines.length > 0) {
      console.warn(
        `${label} ADVERSARIAL DIFFS (adjudicate manually):\n${adversarialLines
          .map((line) => `  - ${line}`)
          .join("\n")}`,
      );
    }
    // Sanity: the adversarial set is exactly the docs we declared.
    for (const line of adversarialLines) {
      const docName = line.split("/")[0]?.split(":")[0] ?? "";
      expect(ADVERSARIAL_DOC_NAMES.has(docName)).toBe(true);
    }
  });
}

if (!existsSync(baselinePath)) {
  describe("zz-dom-equivalence", () => {
    it.skip(`baseline missing at ${baselinePath} — capture one first`, () => {});
  });
} else {
  describe("zz-dom-equivalence", () => {
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as Capture;
    const corpus = buildCorpus();
    // Corpus = all repo fixtures (4 since the W6 fixture prune) + the 4
    // synthetic docs.
    gate(
      "zz-dom-equivalence",
      baseline,
      captureCorpus(corpus),
      corpus.failures.map((failure) => `${failure.file}: ${failure.message}`),
      8,
    );
  });
}

if (!existsSync(themedBaselinePath)) {
  describe("zz-dom-equivalence (schematic themes)", () => {
    it.skip(`themed baseline missing at ${themedBaselinePath} — capture one with --themes`, () => {});
  });
} else {
  describe("zz-dom-equivalence (schematic themes)", () => {
    const baseline = JSON.parse(readFileSync(themedBaselinePath, "utf8")) as Capture;
    const corpus = buildThemedCorpus();
    gate(
      "zz-dom-equivalence (schematic themes)",
      baseline,
      captureThemedCorpus(corpus),
      corpus.failures.map((failure) => `${failure.file}: ${failure.message}`),
      // The 5 synthetic docs + the 2 real boards it keeps.
      7,
    );
  });
}
