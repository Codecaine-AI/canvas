/**
 * Inputs at the edges: negative letter-spacing (finding 9), runs that split a
 * contextual glyph (finding 19), huge input (finding 8). Chromium facts were
 * measured with headless Chromium 153 (macOS, bundled faces via fonts.css).
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { useHarfBuzz } from "../src/headless.ts";
import { fitText, measureWidth, wrapRuns, wrapText, type FontSpec } from "../src/index.ts";

beforeAll(async () => {
  await useHarfBuzz();
});

describe("negative letter-spacing", () => {
  test("widths never go below 0, as Chromium's boxes", () => {
    // Chromium, Inter 16px nowrap max-content: "abc" at letter-spacing -100px is 0 wide, "abc def" at -9px is 0,
    // and "abc def" at -5px is 22.421875.
    expect(measureWidth("abc", { family: "Inter", size: 16, letterSpacing: -100 })).toBe(0);
    expect(measureWidth("abc def", { family: "Inter", size: 16, letterSpacing: -9 })).toBe(0);
    expect(measureWidth("abc def", { family: "Inter", size: 16, letterSpacing: -5 })).toBe(22.421875);
    const wrapped = wrapText("abc def ghi", { family: "Inter", size: 16, letterSpacing: -100 }, { maxWidth: 40, lineHeight: 24 });
    for (const line of wrapped.lines) expect(line.width).toBe(0);
    const fit = fitText("abc", { family: "Inter", size: 16, letterSpacing: -100 }, { width: 40, lineHeight: 24 });
    expect(fit.neededWidth).toBeGreaterThanOrEqual(0);
    expect(fit.maxLineWidth).toBe(0);
    const runs = wrapRuns([{ text: "abc ", font: { family: "Inter", size: 16, letterSpacing: -100 } }, { text: "def", font: { family: "Inter", size: 16 } }], { maxWidth: 400, lineHeight: 24 });
    for (const line of runs.lines) for (const fragment of line.fragments) expect(fragment.width).toBeGreaterThanOrEqual(0);
  });
});

describe("runs that split a contextual glyph", () => {
  test("fragments never get a negative width and the line stays the whole-run width", () => {
    // Chromium shapes equal-font spans together: "<", "=", ">" in three spans paints one <=> arrow 32.1875px wide
    // (Inter 24px), the whole cluster on the first span, 0 on the others. Fragments here split the cluster
    // differently but never go negative, and the line ends where the arrow does.
    const font: FontSpec = { family: "Inter", size: 24 };
    for (const parts of [["<", "=", ">"], ["<=", ">"], ["<", "=>"], ["-", ">"], ["Save <", "=", "> ok"], ["a <", "=> b"]]) {
      const result = wrapRuns(
        parts.map((text) => ({ text, font })),
        { maxWidth: Infinity, lineHeight: 36, whiteSpace: "pre-wrap" },
      );
      const line = result.lines[0]!;
      for (const fragment of line.fragments) expect(fragment.width).toBeGreaterThanOrEqual(0);
      expect(Math.abs(line.width - measureWidth(parts.join(""), font))).toBeLessThanOrEqual(parts.length / 64);
    }
    expect(measureWidth("<=>", { family: "Inter", size: 24 })).toBe(32.1875);
  });
});

describe("huge input", () => {
  test("a 1 MiB string lays out in bounded time and is flagged oversized", () => {
    const text = "W".repeat(1 << 20);
    const started = performance.now();
    const result = fitText(text, { family: "Inter", size: 16 }, { width: 120, lineHeight: 20, maxLines: 3 });
    expect(result).toMatchObject({ verdict: "overflows", reliable: false, reasons: ["oversized-input"] });
    expect(performance.now() - started).toBeLessThan(10_000);
  }, 20_000);
});
