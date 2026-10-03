import { beforeAll, describe, expect, test } from "bun:test";
import { useHarfBuzz } from "../src/headless.ts";
import { fitText, measureWidth, useTableBackend, wrapText, type FontSpec } from "../src/index.ts";

const font: FontSpec = { family: "Inter", size: 14 };
const label = "Static export is read-only by construction";

beforeAll(async () => {
  await useHarfBuzz();
});

describe("fitText verdicts", () => {
  test("one-line boxes: fits, overflows, and borderline within the tolerance", () => {
    const natural = measureWidth(label, font);
    const at = (width: number, tolerance?: number) => fitText(label, font, { width, lineHeight: 21, maxLines: 1 }, { tolerance }).verdict;
    expect(at(natural + 5)).toBe("fits");
    expect(at(natural - 5)).toBe("overflows");
    // Inside [width - 1, width + 1] the answer flips: borderline, whichever side the box is on.
    expect(at(natural)).toBe("borderline");
    expect(at(natural + 0.5)).toBe("borderline");
    expect(at(natural - 0.5)).toBe("borderline");
    expect(at(natural + 2)).toBe("fits");
    // A smaller tolerance narrows the band; with none, only the 1/64 px rounding step stays ambiguous.
    expect(at(natural + 0.5, 0.25)).toBe("fits");
    expect(at(natural, 0)).toBe("fits");
    expect(at(natural - 0.1, 0)).toBe("overflows");
  });

  test("multi-line boxes: the line-count boundary is borderline too", () => {
    const two = fitText(label, font, { width: 300, lineHeight: 21, maxLines: 2 }).neededWidth;
    const at = (width: number) => fitText(label, font, { width, lineHeight: 21, maxLines: 2 }).verdict;
    expect(at(two + 3)).toBe("fits");
    expect(at(two - 3)).toBe("overflows");
    expect(at(two)).toBe("borderline");
  });

  test("height limits lines like maxLines; the smaller limit wins", () => {
    const narrow = { width: 120, lineHeight: 21 };
    expect(wrapText(label, font, { maxWidth: 120, lineHeight: 21 }).lineCount).toBe(3);
    expect(fitText(label, font, { ...narrow, height: 63 }).verdict).toBe("fits");
    expect(fitText(label, font, { ...narrow, height: 62 }).verdict).toBe("overflows");
    expect(fitText(label, font, { ...narrow, height: 63, maxLines: 2 }).verdict).toBe("overflows");
  });

  test("without a line limit only a grapheme wider than the box overflows", () => {
    expect(fitText(label, font, { width: 60, lineHeight: 21 }).verdict).toBe("fits");
    const w = measureWidth("W", { family: "Inter", size: 40 });
    expect(fitText("W", { family: "Inter", size: 40 }, { width: w - 5, lineHeight: 50 }).verdict).toBe("overflows");
    expect(fitText("W", { family: "Inter", size: 40 }, { width: w + 5, lineHeight: 50 }).verdict).toBe("fits");
  });

  test("empty text always fits; a zero-line box fits nothing else", () => {
    const empty = fitText("", font, { width: 10, lineHeight: 21, maxLines: 1 });
    expect(empty.verdict).toBe("fits");
    expect(empty.lineCount).toBe(0);
    expect(empty.neededWidth).toBe(0);
    const none = fitText("x", font, { width: 100, lineHeight: 21, maxLines: 0 });
    expect(none.verdict).toBe("overflows");
    expect(none.neededWidth).toBe(Infinity);
  });

  test("pre-wrap: a newline cannot fit one line", () => {
    const result = fitText("a\nb", font, { width: 500, lineHeight: 21, maxLines: 1, whiteSpace: "pre-wrap" });
    expect(result.verdict).toBe("overflows");
    expect(result.neededWidth).toBe(Infinity);
    expect(fitText("a\nb", font, { width: 500, lineHeight: 21, maxLines: 2, whiteSpace: "pre-wrap" }).verdict).toBe("fits");
    // One trailing newline ends the line; a second one starts an empty line.
    expect(fitText("abc\n", font, { width: 500, lineHeight: 21, maxLines: 1, whiteSpace: "pre-wrap" }).verdict).toBe("fits");
    expect(fitText("abc\n\n", font, { width: 500, lineHeight: 21, maxLines: 1, whiteSpace: "pre-wrap" }).verdict).toBe("overflows");
  });
});

describe("neededWidth", () => {
  test("is the natural width for one line", () => {
    const result = fitText(label, font, { width: 50, lineHeight: 21, maxLines: 1 });
    expect(result.neededWidth).toBe(measureWidth(label, font));
    expect(fitText(label, font, { width: result.neededWidth, lineHeight: 21, maxLines: 1 }, { tolerance: 0 }).verdict).toBe("fits");
  });

  test("is the smallest width that keeps the line limit", () => {
    for (const maxLines of [2, 3]) {
      const needed = fitText(label, font, { width: 50, lineHeight: 21, maxLines }).neededWidth;
      expect(Number.isInteger(needed * 64)).toBe(true);
      expect(wrapText(label, font, { maxWidth: needed, lineHeight: 21 }).lineCount).toBeLessThanOrEqual(maxLines);
      expect(wrapText(label, font, { maxWidth: needed - 1 / 64 - 0.011, lineHeight: 21 }).lineCount).toBeGreaterThan(maxLines);
    }
  });

  test("is the widest grapheme without a line limit", () => {
    const needed = fitText("iWi", font, { width: 500, lineHeight: 21 }).neededWidth;
    expect(needed).toBe(measureWidth("W", font));
  });
});

describe("reliable and uncovered", () => {
  test("exact backend, bundled face, covered text: reliable", () => {
    const result = fitText("Hello, world", font, { width: 200, lineHeight: 21, maxLines: 1 });
    expect(result).toMatchObject({ reliable: true, uncovered: [], backend: "harfbuzz" });
  });

  test("uncovered characters make the answer unreliable and are listed", () => {
    const result = fitText("Ship it 🚀 春", font, { width: 200, lineHeight: 21, maxLines: 1 });
    expect(result.uncovered).toEqual(["🚀", "春"]);
    expect(result.reliable).toBe(false);
  });

  test("the table backend is never reliable", async () => {
    useTableBackend();
    try {
      const result = fitText("Hello, world", font, { width: 200, lineHeight: 21, maxLines: 1 });
      expect(result).toMatchObject({ reliable: false, backend: "table", verdict: "fits" });
    } finally {
      await useHarfBuzz();
    }
  });
});
