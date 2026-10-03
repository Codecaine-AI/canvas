/**
 * Chromium parity for findings 1, 2, 7, 14, 15, 16, 17 and 19 of the
 * adversarial review. One case is still a known gap, marked test.failing (it
 * fails once fixed, and then `.failing` must go).
 *
 * Chromium facts: rows of the adversarial truth
 * (/tmp/pretext-adversarial/text-measure/truth.json, Chromium 153, macOS) and
 * fresh headless Chromium 153 runs (/tmp/tm-fix/facts-b.ts): bundled woff2
 * faces via fonts.css, white-space normal, overflow-wrap: break-word, line
 * count = block height / line-height, widths = nowrap max-content ceiled to
 * 1/64 px.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { useHarfBuzz } from "../src/headless.ts";
import { fitText, measureWidth, wrapRuns, wrapText, type FontSpec } from "../src/index.ts";

beforeAll(async () => {
  await useHarfBuzz();
});

const lines = (text: string, font: FontSpec, maxWidth: number) => wrapText(text, font, { maxWidth, lineHeight: 20 });

describe("finding 1: no letter-spacing on zero-width characters", () => {
  const spaced: FontSpec = { family: "Inter", size: 12, letterSpacing: 1 };
  // truth.json: each is one line in Chromium at this width; the library wraps it.
  test("LRM/RLM", () => expect(lines("a‎b‏c", spaced, 24.021875).lineCount).toBe(1));
  test("word joiner", () => expect(lines("a⁠b", spaced, 16.31875).lineCount).toBe(1));
  // Known gap: Chromium adds no letter-spacing at all to digits joined by U+202F ("1\u202f2" is as wide at
  // 1px spacing as at 0), which no per-grapheme rule explains; the library spaces every grapheme.
  test.failing("narrow no-break spaces in a number", () => expect(lines("1 234 567,89 €", spaced, 83.1).lineCount).toBe(1));
});

describe("finding 2: letter-spacing with emergency (break-word) breaks", () => {
  // truth.json, 80px box.
  // Where a break-word break lands depends on how Chromium reshapes the kerned line ends; when the library's
  // own line comes out wider than the box, fitText reads the box as borderline instead of contradicting.
  test("Inter 700 12px ls 1: 28 x To (Chromium 7 lines) is borderline at 6 and 7", () => {
    const font: FontSpec = { family: "Inter", size: 12, weight: 700, letterSpacing: 1 };
    for (const maxLines of [6, 7]) expect(fitText("To".repeat(28), font, { width: 80, lineHeight: 18, maxLines }).verdict).toBe("borderline");
  });
  test("Inter 17.5px ls 1: Save x²+y²=z² is 3 lines", () =>
    expect(lines("Save x²+y²=z²", { family: "Inter", size: 17.5, letterSpacing: 1 }, 80).lineCount).toBe(3));
  test("IBM Plex Mono 13px ls 1: superscript digits are 3 lines", () =>
    expect(lines("Save ⁰¹²³⁴⁵⁶⁷⁸⁹", { family: "IBM Plex Mono", size: 13, letterSpacing: 1 }, 80).lineCount).toBe(3));
});

describe("finding 7: kerning residue in long emergency breaks (letter-spacing 0)", () => {
  // truth.json, 80px box.
  test("Inter 700 24px: AVAV...AV--> (Chromium 20 lines) is borderline at 19 and 20", () => {
    const font: FontSpec = { family: "Inter", size: 24, weight: 700 };
    for (const maxLines of [19, 20]) expect(fitText("AV".repeat(46) + "-->", font, { width: 80, lineHeight: 36, maxLines }).verdict).toBe("borderline");
  });
  test("Inter 24px: a doubled encoded URL is 15 lines", () =>
    expect(lines("https://example.com/a%20b%2Fc?x=1&y=2".repeat(2), { family: "Inter", size: 24 }, 80).lineCount).toBe(15));
});

describe("finding 14: emoji width estimate", () => {
  // Chromium (Apple Color Emoji): 15px at 12px, 20px at 16px, 24px at 24px for 😀 🚀 👍🏽 🇺🇸 1️⃣ and a ZWJ family.
  for (const [size, px] of [[12, 15], [16, 20]] as const) {
    test(`emoji at ${size}px reserve ${px}px`, () => {
      for (const emoji of ["\u{1F600}", "\u{1F680}", "\u{1F44D}\u{1F3FD}", "\u{1F1FA}\u{1F1F8}", "1️⃣"]) {
        expect(measureWidth(emoji, { family: "Inter", size })).toBeGreaterThanOrEqual(px);
      }
    });
  }
});

describe("finding 15: Chromium fits a line that overflows by one layout unit", () => {
  // Fresh Chromium: at measureWidth(text) - 1/64 these stay on one line; at - 2/64 they wrap.
  const font: FontSpec = { family: "Inter", size: 16 };
  for (const text of ["Static export is read-only", "Account settings", "Save changes"]) {
    test(`"${text}" at natural - 1/64 px is one line`, () => expect(lines(text, font, measureWidth(text, font) - 1 / 64).lineCount).toBe(1));
  }
});

describe("finding 16: kerning before a trailing space stays on the line's last glyph", () => {
  const bold36: FontSpec = { family: "Inter", size: 36, weight: 700 };
  // Fresh Chromium, white-space normal.
  test('"re-entry, co-author" at 155px', () =>
    expect(lines("re-entry, co-author", bold36, 155).lines.map((l) => l.text)).toEqual(["re-entry, ", "co-", "author"]));
  test('"Done, next. Then, go" at 198px', () =>
    expect(lines("Done, next. Then, go", bold36, 198).lines.map((l) => l.text)).toEqual(["Done, next. ", "Then, go"]));
  test('"Owner, platform, infra" at 125px', () =>
    expect(lines("Owner, platform, infra", bold36, 125).lines.map((l) => l.text)).toEqual(["Owner, ", "platfor", "m, ", "infra"]));
});

describe("finding 17: Chromium breaks after an en dash between numbers", () => {
  const font: FontSpec = { family: "Inter", size: 16 };
  // Fresh Chromium, white-space normal.
  test("10:30–11:45 at 117px", () =>
    expect(lines("standup 10:30–11:45 today", font, 117).lines.map((l) => l.text)).toEqual(["standup 10:30–", "11:45 today"]));
  test("wrapRuns: 10:30–11:45 in bold (Chromium: 2 lines at 125px, 3 at 117px)", () => {
    const result = wrapRuns(
      [
        { text: "standup ", font },
        { text: "10:30–11:45", font: { ...font, weight: 700 } },
        { text: " today", font },
      ],
      { maxWidth: 125, lineHeight: 24 },
    );
    expect(result.lines.map((l) => l.text)).toEqual(["standup 10:30–", "11:45 today"]);
  });
});

describe("finding 19: a contextual glyph split across equal-font runs", () => {
  // Fresh Chromium: spans "<", "=", ">" in Inter 24px paint one arrow; the first span is 32.1875px wide, the others 0.
  test("the first run carries the whole cluster", () => {
    const font: FontSpec = { family: "Inter", size: 24 };
    const result = wrapRuns(
      ["<", "=", ">"].map((text) => ({ text, font })),
      { maxWidth: Infinity, lineHeight: 36, whiteSpace: "pre-wrap" },
    );
    expect(result.lines[0]!.fragments.map((f) => [f.x, f.width])).toEqual([
      [0, 32.1875],
      [32.1875, 0],
      [32.1875, 0],
    ]);
  });
});
