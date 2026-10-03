/**
 * FitResult.reasons: why an answer is not reliable. Every expectation about
 * Chromium below was measured with headless Chromium 153 (macOS, device scale
 * 1, the bundled woff2 faces through fonts.css, white-space as given,
 * overflow-wrap: break-word): line counts are block height / line-height,
 * widths are white-space: nowrap max-content rounded up to 1/64 px.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { useHarfBuzz } from "../src/headless.ts";
import { fitText, useTableBackend, wrapText, type FitBox, type FontSpec } from "../src/index.ts";

const inter12: FontSpec = { family: "Inter", size: 12 };
const inter16: FontSpec = { family: "Inter", size: 16 };

beforeAll(async () => {
  await useHarfBuzz();
});

/** fitText at Chromium's line count with no tolerance: the answer whose reliability is in question. */
function fitAt(text: string, font: FontSpec, width: number, domLines: number, whiteSpace: FitBox["whiteSpace"] = "normal") {
  return fitText(text, font, { width, lineHeight: 20, maxLines: domLines, whiteSpace }, { tolerance: 0 });
}

describe("reasons", () => {
  test("reliable answers have no reasons; the backend, family and weight come first", async () => {
    expect(fitText("Hello, world", inter16, { width: 200, lineHeight: 20, maxLines: 1 })).toMatchObject({ reliable: true, reasons: [] });
    useTableBackend();
    try {
      expect(fitText("Hello, world", { family: "Roboto", size: 16, weight: 1200 }, { width: 200, lineHeight: 20 }).reasons).toEqual([
        "approximate-backend",
        "unknown-family",
        "unsupported-weight",
      ]);
    } finally {
      await useHarfBuzz();
    }
    expect(fitText("Ship it \u{1F680}", inter16, { width: 200, lineHeight: 20 })).toMatchObject({ reliable: false, reasons: ["uncovered"], uncovered: ["\u{1F680}"] });
  });
});

describe("control characters", () => {
  test("C0 controls: Chromium paints them about 0.33em wide and breaks around them", () => {
    // Chromium: "a\u0001b" Inter 12px natural 18.21875 ("ab" is 14.21875); in a 7.5px box 3 lines: a | U+0001 | b.
    expect(wrapText("a\u0001b", inter12, { maxWidth: 7.5, lineHeight: 18 }).lineCount).toBe(2); // the library: 2
    expect(fitAt("a\u0001b", inter12, 7.5, 3)).toMatchObject({ reliable: false, reasons: ["control-characters"] });
    expect(fitAt("a\u0001b", inter12, 100, 1).reasons).toEqual(["control-characters"]);
    for (const text of ["a\u0007b", "a\u000bb", "x\u007f", "a\u0085b", "a\u009fb"]) expect(fitAt(text, inter12, 100, 1).reasons).toEqual(["control-characters"]);
  });

  test("NUL, tab and LF are not flagged in normal: Chromium lays them out as the library does", () => {
    // Chromium: "a\u0000b" measures 14.21875 like "ab"; tab and LF collapse to a space.
    for (const text of ["a\u0000b", "a\tb", "a\nb"]) expect(fitAt(text, inter12, 100, 1)).toMatchObject({ reliable: true, reasons: [] });
  });

  test("ZWNJ changes Chromium's breaks: unreliable in both white-space modes", () => {
    // Chromium: "A‌V" Inter 12px in a 15.75px pre-wrap box is 2 lines (natural 15.421875); the library keeps 1.
    expect(wrapText("A‌V", inter12, { maxWidth: 15.75, lineHeight: 18, whiteSpace: "pre-wrap" }).lineCount).toBe(1);
    expect(fitAt("A‌V", inter12, 15.75, 2, "pre-wrap").reasons).toEqual(["control-characters"]);
    expect(fitAt("A‌V", inter12, 15.75, 1, "normal").reasons).toEqual(["control-characters"]);
  });

  test("CR: a space under normal, CR LF a line break under pre-wrap, a lone CR or FF splits shaping", () => {
    const font: FontSpec = { family: "Inter", size: 13.5, weight: 600 };
    // Chromium, pre-wrap: "A\rV" in a 19px box is 2 lines (A\r | V) while "AV" (18.421875 wide) is 1: the CR is
    // invisible but A and V lose their kerning. The library drops the CR (no break, no line), so it is flagged.
    expect(wrapText("A\rV", font, { maxWidth: 19, lineHeight: 20, whiteSpace: "pre-wrap" }).lines.map((l) => l.text)).toEqual(["AV"]);
    expect(fitAt("A\rV", font, 19, 2, "pre-wrap").reasons).toEqual(["control-characters"]);
    expect(fitAt("A\fV", font, 19, 2, "pre-wrap").reasons).toEqual(["control-characters"]);
    expect(fitAt("A\fV", font, 100, 1, "normal").reasons).toEqual(["control-characters"]);
    // Chromium: "A\r\nV" pre-wrap is 2 lines, "A\rV" normal is 1 line 22.90625 wide ("A V"): both as the library.
    expect(fitAt("A\r\nV", font, 100, 2, "pre-wrap")).toMatchObject({ reliable: true, lineCount: 2 });
    expect(fitAt("A\rV", font, 100, 1, "normal")).toMatchObject({ reliable: true, lines: [{ text: "A V", width: 22.90625 }] });
  });
});

describe("bidi", () => {
  test("bidi controls and right-to-left text are flagged", () => {
    // Chromium: "AV‮To->ffi‬WA" Inter 24px in an 80px box is 3 lines; the library (no bidi reordering) 2.
    const font: FontSpec = { family: "Inter", size: 24 };
    expect(wrapText("AV‮To->ffi‬WA", font, { maxWidth: 80, lineHeight: 36 }).lineCount).toBe(2);
    expect(fitText("AV‮To->ffi‬WA", font, { width: 80, lineHeight: 36, maxLines: 2 })).toMatchObject({ reliable: false, reasons: ["bidi"] });
    for (const text of ["a‎b‏c", "x⁧y⁩", "x؜y"]) expect(fitAt(text, inter12, 200, 1).reasons).toEqual(["bidi"]);
    expect(fitAt("User שלום", inter12, 200, 1).reasons).toEqual(["uncovered", "bidi"]);
  });
});

describe("tabs", () => {
  test("a tab in pre-wrap is flagged; a trailing tab no longer overflows", () => {
    // Chromium: "a\t" Inter 12px pre-wrap in a 25px box is one line that does not overflow (the tab hangs).
    const result = fitText("a\t", inter12, { width: 25, lineHeight: 18, maxLines: 1, whiteSpace: "pre-wrap" }, { tolerance: 0 });
    expect(result).toMatchObject({ verdict: "fits", reliable: false, reasons: ["tabs"] });
    expect(fitAt("a\tb", inter12, 200, 1, "normal").reasons).toEqual([]);
  });
});

describe("soft hyphens", () => {
  test("a soft hyphen at a break is flagged: Chromium splits without the hyphen when char + hyphen does not fit", () => {
    // Chromium, Inter 16px: "ab­cd" is 3 lines at 20px (a | b- | cd), 5 at 10px (a | b | - | c | d), 1 at 100px.
    expect(wrapText("ab­cd", inter16, { maxWidth: 20, lineHeight: 24 }).lines.map((l) => l.text)).toEqual(["ab-", "cd"]);
    expect(fitAt("ab­cd", inter16, 20, 3)).toMatchObject({ reliable: false, reasons: ["soft-hyphen"] });
    expect(fitAt("ab­cd", inter16, 10, 5).reasons).toEqual(["soft-hyphen"]);
    expect(fitAt("ab­cd", inter16, 100, 1)).toMatchObject({ reliable: true, reasons: [] });
    // Chromium paints the hyphen before a space it breaks at too: "Ab­ cd" at 22px is 3 lines (A | b- | cd).
    expect(fitAt("Ab­ cd", inter16, 22, 3).reasons).toEqual(["soft-hyphen"]);
  });

  test("a soft hyphen away from every break stays reliable", () => {
    // Chromium, Inter 16px: "co­operate with the whole team today" is 3 lines at 120px and 2 at 200px, as the library.
    const text = "co­operate with the whole team today";
    expect(fitAt(text, inter16, 120, 3)).toMatchObject({ reliable: true, lineCount: 3 });
    expect(fitAt(text, inter16, 200, 2)).toMatchObject({ reliable: true, lineCount: 2 });
  });
});

describe("oversized input", () => {
  test("text over 16,384 UTF-16 units is answered approximately and flagged", () => {
    const text = "lorem ipsum dolor sit amet ".repeat(700); // 18,900 units
    const result = fitText(text, inter12, { width: 300, lineHeight: 18 });
    expect(result.reasons).toEqual(["oversized-input"]);
    expect(result.lineCount).toBeGreaterThan(100);
  });

  test("one unbreakable run over 4,096 units keeps approximate break advances and is flagged", () => {
    const word = "AVATAR".repeat(700); // 4,200 units, no break opportunity
    expect(fitText(word, inter12, { width: 300, lineHeight: 18 }).reasons).toEqual(["oversized-input"]);
    expect(fitText(word.slice(0, 4000), inter12, { width: 300, lineHeight: 18 }).reasons).toEqual([]);
  });
});
