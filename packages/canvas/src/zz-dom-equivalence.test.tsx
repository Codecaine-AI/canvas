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
 * The adversarial doc (zz-d-adversarial) is reported but never auto-fails —
 * its diffs are adjudicated manually.
 */

import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ADVERSARIAL_DOC_NAMES,
  buildCorpus,
  captureCorpus,
  compareCaptures,
  partitionByAdversarial,
  type Capture,
} from "./zz-dom-fixtures";

const baselinePath = fileURLToPath(new URL("../zz-dom-baseline.json", import.meta.url));

if (!existsSync(baselinePath)) {
  describe("zz-dom-equivalence", () => {
    it.skip(`baseline missing at ${baselinePath} — capture one first`, () => {});
  });
} else {
  describe("zz-dom-equivalence", () => {
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as Capture;
    const corpus = buildCorpus();
    const fresh = captureCorpus(corpus);
    const result = compareCaptures(baseline, fresh);
    const failures = partitionByAdversarial(result.failures);
    const warnings = partitionByAdversarial(result.warnings);

    it("loads and validates every fixture canvas", () => {
      expect(
        corpus.failures.map((failure) => `${failure.file}: ${failure.message}`),
      ).toEqual([]);
      // Corpus = all repo fixtures (4 since the W6 fixture prune) + the 4
      // synthetic docs.
      expect(corpus.entries.length).toBeGreaterThanOrEqual(8);
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
          `zz-dom-equivalence WARNINGS (cross-selector order — manual cascade audit):\n${warnings.normal
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
          `zz-dom-equivalence ADVERSARIAL DIFFS (adjudicate manually):\n${adversarialLines
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
  });
}
