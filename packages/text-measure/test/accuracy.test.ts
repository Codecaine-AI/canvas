/**
 * The CI guarantee. Recomputes the committed Chromium ground truth
 * (test/accuracy/chromium-truth.json, from scripts/truth-chromium.ts) with the
 * HarfBuzz backend and checks, on every string the bundled face covers:
 *   - line counts equal the DOM at every grid width (Inter 12-24px incl. 13.5
 *     and 17.5, four weights, letter-spacing; IBM Plex Mono 13/14px),
 *   - every edge-sweep disagreement (box = natural width +/- 0.1..1px) is
 *     reported "borderline" by fitText (tolerance 1px),
 *   - fitText never contradicts the DOM (says "fits" where the DOM needs more
 *     lines, or "overflows" where it does not),
 *   - single-line widths are within one Chromium layout unit (1/64 px): DOM
 *     widths are quantized to 1/64 px and Chromium sums glyph advances in
 *     fixed point, so a sum that lands within ~0.001px of a unit boundary can
 *     round to the neighbouring unit (8 of 6,652 rows at 13.5/17.5px when the
 *     truth was recorded; everything else is exact),
 *   - strings with uncovered characters are never reported reliable.
 * The table backend runs the same grid and prints its numbers (loose sanity
 * bounds only: it is approximate by design).
 */

import { afterAll, describe, expect, test } from "bun:test";
import { useHarfBuzz } from "../src/headless.ts";
import { useTableBackend } from "../src/index.ts";
import { absQuantile, evaluate, summarize } from "./accuracy/evaluate.ts";

const LAYOUT_UNIT = 1 / 64;
const TIMEOUT = 120_000;

afterAll(async () => {
  await useHarfBuzz();
});

describe("accuracy against Chromium (committed truth)", () => {
  test(
    "harfbuzz: exact line counts, borderline edges, widths within one layout unit",
    async () => {
      await useHarfBuzz();
      const e = evaluate();
      console.log(summarize("harfbuzz", e));

      expect(e.covered.lines).toBeGreaterThan(18_000);
      expect(e.mismatches.filter((m) => m.covered)).toEqual([]);
      expect(e.edgeNotBorderline).toEqual([]);
      expect(e.contradictions).toEqual([]);
      expect(absQuantile(e.covered.widthErrors, 0.95)).toBeLessThanOrEqual(LAYOUT_UNIT + 1e-9);
      expect(absQuantile(e.covered.widthErrors, 1)).toBeLessThanOrEqual(LAYOUT_UNIT + 1e-9);
      expect(e.uncoveredReliable).toEqual([]);
      // Fractional product sizes hold like the integer ones.
      for (const size of ["Inter 13.5px", "Inter 17.5px"]) expect(e.bySize.get(size)!.lineMismatches).toBe(0);
    },
    TIMEOUT,
  );

  test(
    "table: same grid, approximate (printed; loose bounds)",
    () => {
      useTableBackend();
      const e = evaluate();
      console.log(summarize("table", e));
      expect(e.covered.lineMismatches / e.covered.lines).toBeLessThan(0.01);
      expect(absQuantile(e.covered.widthErrors, 0.95)).toBeLessThan(0.5);
      expect(e.uncoveredReliable).toEqual([]);
    },
    TIMEOUT,
  );
});
