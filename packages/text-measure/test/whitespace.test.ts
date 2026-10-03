/**
 * Degenerate white space and zero-width text: line counts as Chromium 153 lays
 * them out (headless, macOS, bundled faces via fonts.css, 200px box,
 * overflow-wrap: break-word; count = block height / line-height). Recorded
 * with /tmp/tm-fix/probe-ws.ts; every string of length 1-3 over
 * {a, space, LF, CR, FF, ZWSP, SHY, WJ, tab} (1,638 cases) matches as well.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { useHarfBuzz } from "../src/headless.ts";
import { fitText, wrapRuns, wrapText, type FontSpec } from "../src/index.ts";

const font: FontSpec = { family: "Inter", size: 16 };

beforeAll(async () => {
  await useHarfBuzz();
});

/** [text, Chromium lines under white-space: normal, under pre-wrap] */
const CHROMIUM: Array<[string, number, number]> = [
  ["", 0, 0],
  [" ", 0, 1],
  ["\t", 0, 1],
  ["\n", 0, 1],
  ["\r", 0, 0],
  ["\f", 0, 0],
  ["\r\n", 0, 1],
  ["\n\r", 0, 1],
  ["\r\r", 0, 0],
  ["\f\f", 0, 0],
  ["\n\n", 0, 2],
  ["​", 1, 1],
  ["​​", 1, 1],
  ["­", 1, 1],
  ["­­", 1, 1],
  ["⁠", 1, 1],
  ["﻿", 1, 1],
  [" ​", 1, 1],
  ["​ ", 1, 1],
  ["​\n", 1, 1],
  ["\n​", 1, 2],
  ["​\r", 1, 1],
  ["\r ", 0, 1],
  ["\ra", 1, 1],
  ["a\rb", 1, 1],
  ["a\fb", 1, 1],
  ["a\r\nb", 1, 2],
  ["a\n\rb", 1, 2],
  ["a\r\rb", 1, 1],
  ["a\n\r", 1, 1],
  ["a \r b", 1, 1],
  ["a\r\n\r\n", 1, 2],
];

describe("degenerate white space (finding 6)", () => {
  test("line counts match Chromium in both white-space modes", () => {
    const got = CHROMIUM.map(([text]) => [
      text,
      wrapText(text, font, { maxWidth: 200, lineHeight: 24 }).lineCount,
      wrapText(text, font, { maxWidth: 200, lineHeight: 24, whiteSpace: "pre-wrap" }).lineCount,
    ]);
    expect(got).toEqual(CHROMIUM);
  });

  test("wrapRuns agrees with wrapText on every case", () => {
    for (const [text] of CHROMIUM) {
      for (const whiteSpace of ["normal", "pre-wrap"] as const) {
        const opts = { maxWidth: 200, lineHeight: 24, whiteSpace };
        expect({ text, whiteSpace, lines: wrapRuns([{ text, font }], opts).lines.map((l) => ({ text: l.text, width: l.width })) }).toEqual({
          text,
          whiteSpace,
          lines: wrapText(text, font, opts).lines,
        });
      }
    }
  });

  test("pre-wrap drops CR and FF (CR LF is one line break), as Chromium does", () => {
    const pre = { maxWidth: 200, lineHeight: 24, whiteSpace: "pre-wrap" as const };
    expect(wrapText("a\rb", font, pre).lines.map((l) => l.text)).toEqual(["ab"]);
    expect(wrapText("a\r\nb\r\n", font, pre).lines.map((l) => l.text)).toEqual(["a", "b"]);
    expect(fitText("abc\r\n", font, { width: 200, lineHeight: 24, maxLines: 1, whiteSpace: "pre-wrap" }).verdict).toBe("fits");
    expect(fitText("abc\r", font, { width: 200, lineHeight: 24, maxLines: 1, whiteSpace: "pre-wrap" }).verdict).toBe("fits");
  });

  test("a zero-width space alone is one line, and fitText counts it", () => {
    // Chromium: "​" is one line box (0 px wide) in a 1px box; zero lines fit nothing.
    expect(wrapText("​", font, { maxWidth: 1, lineHeight: 24 })).toEqual({ lines: [{ text: "​", width: 0 }], lineCount: 1, height: 24, maxLineWidth: 0 });
    expect(fitText("​", font, { width: 1, lineHeight: 24, maxLines: 1 }).verdict).toBe("fits");
    expect(fitText("​", font, { width: 1, lineHeight: 24, maxLines: 0 }).verdict).toBe("overflows");
    expect(fitText("­", font, { width: 1, lineHeight: 24, maxLines: 1 })).toMatchObject({ verdict: "fits", lineCount: 1 });
  });

  test("a zero-width space that starts a line keeps its own line when what follows does not fit", () => {
    // Chromium, Inter 12px: "​AV" is 3 lines in a 13.421875px box (ZWSP | A | V) and 1 line at 20px;
    // Inter 16px "​Save changes" at 40px: "​Save " | "chan" | "ges".
    const inter12: FontSpec = { family: "Inter", size: 12 };
    expect(wrapText("​AV", inter12, { maxWidth: 13.421875, lineHeight: 18 }).lines.map((l) => l.text)).toEqual(["​", "A", "V"]);
    expect(wrapText("​AV", inter12, { maxWidth: 20, lineHeight: 18 }).lineCount).toBe(1);
    expect(wrapText("​Save changes", font, { maxWidth: 40, lineHeight: 24 }).lines.map((l) => l.text)).toEqual(["​Save ", "chan", "ges"]);
    expect(wrapRuns([{ text: "​AV", font: inter12 }], { maxWidth: 13.421875, lineHeight: 18 }).lineCount).toBe(3);
  });

  test("preserved spaces hang: a run of them fits any box (pre-wrap)", () => {
    // Chromium: "        " Inter 12px pre-wrap in a 25px box is one line that does not overflow; so is
    // "A                V" (17.5px, letter-spacing 1) in 80px, 2 lines.
    const inter12: FontSpec = { family: "Inter", size: 12 };
    expect(fitText("        ", inter12, { width: 25, lineHeight: 18, maxLines: 1, whiteSpace: "pre-wrap" }, { tolerance: 0 })).toMatchObject({ verdict: "fits", reliable: true });
    const spaced: FontSpec = { family: "Inter", size: 17.5, letterSpacing: 1 };
    expect(fitText("A                V", spaced, { width: 80, lineHeight: 26, maxLines: 2, whiteSpace: "pre-wrap" }, { tolerance: 0 })).toMatchObject({ verdict: "fits", lineCount: 2 });
  });
});
