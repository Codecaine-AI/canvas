import { beforeAll, describe, expect, test } from "bun:test";
import * as browserEntry from "../src/browser.ts";
import * as headlessEntry from "../src/headless.ts";
import { useHarfBuzz } from "../src/headless.ts";
import { measureWidth, useTableBackend, wrapRuns, wrapText, type FontSpec, type RunsWrapResult, type TextRun, type WrapOptions } from "../src/index.ts";
import { corpus } from "./accuracy/evaluate.ts";

const inter: FontSpec = { family: "Inter", size: 24 };
const bold: FontSpec = { family: "Inter", size: 24, weight: 700 };
const mono: FontSpec = { family: "IBM Plex Mono", size: 20.4 };
const unit = 1 / 64;
const pre = (maxWidth: number): WrapOptions => ({ maxWidth, lineHeight: 36, whiteSpace: "pre-wrap" });
const texts = (result: RunsWrapResult) => result.lines.map((line) => line.text);

/** Structural invariants every result keeps. */
function checkShape(runs: readonly TextRun[], result: RunsWrapResult, opts: WrapOptions): void {
  expect(result.lineCount).toBe(result.lines.length);
  expect(result.height).toBe(result.lineCount * opts.lineHeight);
  expect(result.maxLineWidth).toBe(Math.max(0, ...result.lines.map((line) => line.width)));
  for (const line of result.lines) {
    expect(line.fragments.map((f) => f.text).join("")).toBe(line.text);
    let x = 0;
    for (const f of line.fragments) {
      expect(f.x).toBe(x);
      expect(Number.isInteger(f.width * 64)).toBe(true);
      expect(0 <= f.start && f.start <= f.end && f.end <= runs[f.run]!.text.length).toBe(true);
      x += f.width;
    }
    expect(line.width).toBe(x);
    const order = line.fragments.map((f) => f.run);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  }
}

beforeAll(async () => {
  await useHarfBuzz();
});

describe("wrapRuns: one run is wrapText", () => {
  const fonts: FontSpec[] = [
    { family: "Inter", size: 13.5 },
    { family: "Inter", size: 24, weight: 700 },
    { family: "IBM Plex Mono", size: 14 },
    { family: "Inter", size: 14, letterSpacing: 1.5 },
  ];

  test("same lines (texts, count, widths) on the accuracy corpus, both white-space modes", () => {
    let compared = 0;
    for (const font of fonts) {
      for (const whiteSpace of ["normal", "pre-wrap"] as const) {
        for (const maxWidth of [60, 120, 200, 320, Infinity]) {
          const opts = { maxWidth, lineHeight: 20, whiteSpace };
          for (const { text } of corpus) {
            const expected = wrapText(text, font, opts);
            const got = wrapRuns([{ text, font }], opts);
            expect({ text, lines: got.lines.map(({ text, width }) => ({ text, width })), lineCount: got.lineCount, height: got.height, maxLineWidth: got.maxLineWidth }).toEqual({
              text,
              ...expected,
            });
            compared++;
          }
        }
      }
    }
    expect(compared).toBe(fonts.length * 2 * 5 * corpus.length);
  });

  test("the same holds on the table backend", async () => {
    useTableBackend();
    try {
      for (const { text } of corpus) {
        const opts = { maxWidth: 120, lineHeight: 20 };
        expect(wrapRuns([{ text, font: inter }], opts).lines.map(({ text, width }) => ({ text, width }))).toEqual(wrapText(text, inter, opts).lines);
      }
    } finally {
      await useHarfBuzz();
    }
  });

  test("one fragment per line, covering the run's source", () => {
    const text = "Static export is read-only by construction";
    const result = wrapRuns([{ text, font: inter }], pre(160));
    checkShape([{ text, font: inter }], result, pre(160));
    expect(result.lines.map((line) => line.fragments.length)).toEqual(result.lines.map(() => 1));
    expect(result.lines.map((line) => text.slice(line.fragments[0]!.start, line.fragments[0]!.end))).toEqual(texts(result));
  });
});

describe("wrapRuns: break opportunities come from the whole paragraph", () => {
  test("a run boundary is not a break opportunity", () => {
    const runs: TextRun[] = [
      { text: "Use the ", font: inter },
      { text: "fetch", font: bold },
      { text: "Profile", font: mono },
      { text: " call", font: inter },
    ];
    const natural = wrapRuns(runs, pre(Infinity)).lines[0]!.fragments;
    // Room for "Use the fetch" but not for the whole word: the word moves to the next line as one.
    const box = natural[2]!.x + natural[2]!.width - 2;
    const result = wrapRuns(runs, pre(box));
    expect(texts(result)[0]).toBe("Use the ");
    expect(texts(result)[1]!.startsWith("fetchProfile")).toBe(true);
    checkShape(runs, result, pre(box));
  });

  test("a word wider than the box breaks at graphemes, across runs (overflow-wrap: break-word)", () => {
    const runs: TextRun[] = [
      { text: "super", font: bold },
      { text: "califragilistic", font: inter },
    ];
    const result = wrapRuns(runs, pre(90));
    expect(result.lineCount).toBeGreaterThan(1);
    expect(texts(result).join("")).toBe("supercalifragilistic");
    for (const line of result.lines) expect(line.width).toBeLessThanOrEqual(90);
    checkShape(runs, result, pre(90));
  });

  test("punctuation after a bold run stays with it", () => {
    const runs: TextRun[] = [
      { text: "Say hi to ", font: inter },
      { text: "Owner", font: bold },
      { text: ", the team", font: inter },
    ];
    // "Say hi to Owner" fits, "Say hi to Owner," does not: the comma cannot start a line, so "Owner," wraps as one.
    const natural = wrapRuns(runs, pre(Infinity)).lines[0]!.fragments;
    const result = wrapRuns(runs, pre(natural[1]!.x + natural[1]!.width + 1));
    expect(texts(result)[0]).toBe("Say hi to ");
    expect(texts(result)[1]!.startsWith("Owner, ")).toBe(true);
  });

  test("a soft hyphen in one run breaks before text in the next", () => {
    const runs: TextRun[] = [
      { text: "co­", font: bold },
      { text: "operation", font: inter },
    ];
    const result = wrapRuns(runs, pre(measureWidth("co-", bold) + 2));
    expect(texts(result)[0]).toBe("co-");
    expect(result.lines[0]!.fragments).toMatchObject([{ run: 0, text: "co-", start: 0, end: 3 }]);
  });
});

describe("wrapRuns: widths", () => {
  test("each run is measured in its own font, without kerning into a different font", () => {
    const result = wrapRuns(
      [
        { text: "A", font: inter },
        { text: "V", font: bold },
      ],
      pre(1000),
    );
    const [a, v] = result.lines[0]!.fragments;
    expect(a).toMatchObject({ text: "A", x: 0, width: measureWidth("A", inter) });
    expect(v).toMatchObject({ text: "V", x: measureWidth("A", inter), width: measureWidth("V", bold) });
    expect(result.lines[0]!.width).toBeGreaterThan(measureWidth("AV", inter) + 1);
  });

  test("adjacent runs in one font are shaped together, as Chromium shapes them; the kerning sits on the left run", () => {
    const split = wrapRuns(
      [
        { text: "A", font: inter },
        { text: "V", font: inter },
      ],
      pre(1000),
    );
    const whole = measureWidth("AV", inter);
    expect(Math.abs(split.lines[0]!.width - whole)).toBeLessThanOrEqual(unit);
    expect(split.lines[0]!.fragments[0]!.width).toBeLessThan(measureWidth("A", inter) - 0.5);
  });

  test("splitting a run into same-font runs changes nothing but layout-unit rounding", () => {
    for (const { text } of corpus.slice(0, 120)) {
      const cut = Math.floor(text.length / 2);
      const parts: TextRun[] = [
        { text: text.slice(0, cut), font: inter },
        { text: text.slice(cut), font: inter },
      ];
      for (const maxWidth of [90, 200]) {
        const one = wrapText(text, inter, pre(maxWidth));
        const two = wrapRuns(parts, pre(maxWidth));
        expect({ text, lines: texts(two) }).toEqual({ text, lines: one.lines.map((l) => l.text) });
        two.lines.forEach((line, i) => expect(Math.abs(line.width - one.lines[i]!.width)).toBeLessThanOrEqual(unit));
      }
    }
  });

  test("padding sits on the run's first and last fragment, in 1/64 px layout units", () => {
    const pad = 20.4 * 0.15; // 3.06px -> 3.046875 (Chromium's LayoutUnit rounds down)
    const runs: TextRun[] = [
      { text: "Set ", font: inter },
      { text: "MAX_CONCURRENT_UPLOADS_PER_WORKSPACE", font: mono, padStart: pad, padEnd: pad },
      { text: " to 8", font: inter },
    ];
    const one = wrapRuns(runs, pre(2000)).lines[0]!;
    const code = one.fragments[1]!;
    expect(code.width).toBe(measureWidth("MAX_CONCURRENT_UPLOADS_PER_WORKSPACE", mono) + 2 * (195 / 64));
    expect(one.fragments[2]!.x).toBe(code.x + code.width);

    const broken = wrapRuns(runs, pre(200));
    const pieces = broken.lines.flatMap((line) => line.fragments.filter((f) => f.run === 1));
    expect(pieces.length).toBeGreaterThan(2);
    const textWidth = (f: { text: string }) => measureWidth(f.text, mono);
    expect(pieces[0]!.width).toBe(textWidth(pieces[0]!) + 195 / 64);
    for (const middle of pieces.slice(1, -1)) expect(middle.width).toBe(textWidth(middle));
    expect(pieces.at(-1)!.width).toBe(textWidth(pieces.at(-1)!) + 195 / 64);
    for (const line of broken.lines) expect(line.width).toBeLessThanOrEqual(200);
    checkShape(runs, broken, pre(200));
  });

  test("padding counts when breaking: a padded run wraps where the bare one fits", () => {
    const bare: TextRun[] = [
      { text: "aaaa ", font: inter },
      { text: "bbbb", font: mono },
    ];
    const fitsBare = wrapRuns(bare, pre(Infinity)).lines[0]!.width + 1;
    expect(wrapRuns(bare, pre(fitsBare)).lineCount).toBe(1);
    expect(wrapRuns([bare[0]!, { ...bare[1]!, padStart: 4, padEnd: 4 }], pre(fitsBare)).lineCount).toBe(2);
  });

  test("trailing spaces take no width; the line ends where its last visible fragment ends", () => {
    const runs: TextRun[] = [
      { text: "bold", font: bold },
      { text: "   ", font: inter },
      { text: "next", font: inter },
    ];
    const line = wrapRuns(runs, pre(measureWidth("bold", bold) + 10)).lines[0]!;
    expect(line.text).toBe("bold   ");
    expect(line.width).toBe(measureWidth("bold", bold));
    expect(line.fragments[1]).toMatchObject({ run: 1, text: "   ", width: 0 });
  });

  test("letter-spacing per run, after every grapheme", () => {
    const spaced: FontSpec = { ...inter, letterSpacing: 3 };
    const line = wrapRuns(
      [
        { text: "abc ", font: inter },
        { text: "def", font: spaced },
      ],
      pre(1000),
    ).lines[0]!;
    expect(line.fragments[1]!.width).toBe(measureWidth("def", spaced));
    // Every run spaced alike is Pretext's own letter-spacing: wrapText's lines.
    const text = "Static export is read-only by construction";
    expect(wrapRuns([{ text, font: spaced }], pre(150)).lines.map(({ text, width }) => ({ text, width }))).toEqual(wrapText(text, spaced, pre(150)).lines);
    // Spacing one run widens it and can add lines.
    const loose = wrapRuns(
      [
        { text: "Static export is ", font: inter },
        { text: "read-only by construction", font: { ...inter, letterSpacing: 6 } },
      ],
      pre(260),
    );
    expect(loose.lineCount).toBeGreaterThan(wrapText(text, inter, pre(260)).lineCount);
    for (const l of loose.lines) expect(l.width).toBeLessThanOrEqual(260);
  });
});

describe("wrapRuns: white-space", () => {
  test("normal collapses whitespace across runs; the kept space belongs to the first run", () => {
    const runs: TextRun[] = [
      { text: " foo  ", font: bold },
      { text: "\t bar ", font: inter },
    ];
    const result = wrapRuns(runs, { maxWidth: 1000, lineHeight: 36 });
    expect(texts(result)).toEqual(["foo bar"]);
    expect(result.lines[0]!.fragments).toMatchObject([
      { run: 0, text: "foo ", start: 1, end: 6 },
      { run: 1, text: "bar", start: 2, end: 5 },
    ]);
    checkShape(runs, result, { maxWidth: 1000, lineHeight: 36 });
  });

  test("pre-wrap keeps leading, double and trailing spaces and hard breaks", () => {
    const runs: TextRun[] = [
      { text: "  lead  ", font: inter },
      { text: "bold\nnext", font: bold },
    ];
    const result = wrapRuns(runs, pre(1000));
    expect(texts(result)).toEqual(["  lead  bold", "next"]);
    expect(result.lines[0]!.fragments[1]).toMatchObject({ run: 1, text: "bold", start: 0, end: 5 });
    expect(result.lines[1]!.fragments).toMatchObject([{ run: 1, text: "next", start: 5, end: 9, x: 0 }]);
    checkShape(runs, result, pre(1000));
  });

  test("CR LF is one hard break; a lone CR or FF is dropped, as in wrapText (Chromium pre-wrap)", () => {
    const runs: TextRun[] = [
      { text: "a\r", font: inter },
      { text: "\nb\rc\fd", font: bold },
    ];
    expect(texts(wrapRuns(runs, pre(1000)))).toEqual(texts(wrapRuns([{ text: "a\r\nb\rc\fd", font: inter }], pre(1000))));
    expect(texts(wrapRuns(runs, pre(1000)))).toEqual(["a", "bcd"]);
    expect(texts(wrapRuns([{ text: "a\r\nb\rc\fd", font: inter }], pre(1000)))).toEqual(wrapText("a\r\nb\rc\fd", inter, pre(1000)).lines.map((l) => l.text));
    // The dropped characters stay inside their fragments' source ranges.
    const [first, second] = wrapRuns(runs, pre(1000)).lines;
    expect(first!.fragments.map((f) => [f.run, f.start, f.end])).toEqual([[0, 0, 2]]);
    expect(second!.fragments.map((f) => [f.run, f.start, f.end])).toEqual([[1, 1, 6]]);
  });

  test("a paragraph of only zero-width spaces or soft hyphens is one line, as in wrapText", () => {
    for (const text of ["​", "­­", "a\n​\nb"]) {
      const expected = wrapText(text, inter, pre(1000));
      const got = wrapRuns([{ text, font: inter }], pre(1000));
      expect(got.lines.map(({ text, width }) => ({ text, width }))).toEqual(expected.lines);
      expect(got.lineCount).toBe(expected.lineCount);
      checkShape([{ text, font: inter }], got, pre(1000));
    }
    expect(wrapRuns([{ text: "a\n", font: inter }, { text: "​", font: bold }], pre(1000)).lines.map((l) => l.fragments.map((f) => f.run))).toEqual([[0], [1]]);
  });

  test("empty and whitespace-only paragraphs have no lines", () => {
    const empty = { lines: [], lineCount: 0, height: 0, maxLineWidth: 0 };
    expect(wrapRuns([], pre(100))).toEqual(empty);
    expect(wrapRuns([{ text: "", font: inter, padStart: 4 }], pre(100))).toEqual(empty);
    expect(wrapRuns([{ text: "  \n ", font: inter }], { maxWidth: 100, lineHeight: 36 })).toEqual(empty);
  });
});

describe("wrapRuns: inputs", () => {
  test("rejects malformed runs and boxes", () => {
    expect(() => wrapRuns("text" as unknown as TextRun[], pre(100))).toThrow(TypeError);
    expect(() => wrapRuns([null as unknown as TextRun], pre(100))).toThrow(TypeError);
    expect(() => wrapRuns([{ text: "x", font: { family: "Inter", size: 0 } }], pre(100))).toThrow(TypeError);
    expect(() => wrapRuns([{ text: "x", font: inter, padStart: -1 }], pre(100))).toThrow(TypeError);
    expect(() => wrapRuns([{ text: "x", font: inter, padEnd: Number.NaN }], pre(100))).toThrow(TypeError);
    expect(() => wrapRuns([{ text: "x", font: inter }], { maxWidth: Number.NaN, lineHeight: 20 })).toThrow(TypeError);
    expect(() => wrapRuns([{ text: "x", font: inter }], { maxWidth: 100, lineHeight: 20, whiteSpace: "pre" as "normal" })).toThrow(TypeError);
  });

  test("uncovered characters are estimated like everywhere else", () => {
    const runs: TextRun[] = [
      { text: "Ship it 🚀 ", font: inter },
      { text: "日本語", font: bold },
    ];
    const line = wrapRuns(runs, pre(1000)).lines[0]!;
    expect(line.fragments[1]!.width).toBe(measureWidth("日本語", bold));
    expect(line.width).toBe(line.fragments[0]!.width + line.fragments[1]!.width);
  });

  test("exported from the core, /headless and /browser entries", () => {
    expect(headlessEntry.wrapRuns).toBe(wrapRuns);
    expect(browserEntry.wrapRuns).toBe(wrapRuns);
  });
});
