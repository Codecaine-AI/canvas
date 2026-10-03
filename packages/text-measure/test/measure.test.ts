import { beforeAll, describe, expect, test } from "bun:test";
import { matchFace } from "../src/faces.ts";
import { useHarfBuzz } from "../src/headless.ts";
import { fitText, fontToCss, measureWidth, wrapText, type FontSpec } from "../src/index.ts";

const inter: FontSpec = { family: "Inter", size: 16 };
const unit = 1 / 64;

beforeAll(async () => {
  await useHarfBuzz();
});

describe("measureWidth", () => {
  test("shapes the whole string: kerning and Inter's arrow ligature count", () => {
    expect(measureWidth("AV", inter)).toBeLessThan(measureWidth("A", inter) + measureWidth("V", inter) - 1);
    // "->" is one contextual arrow glyph, narrower than its parts.
    expect(measureWidth("->", inter)).toBeLessThan(measureWidth("-", inter) + measureWidth(">", inter) - 2);
  });

  test("collapses whitespace like white-space: nowrap and trims the ends", () => {
    expect(measureWidth("  a \n\t  b  ", inter)).toBe(measureWidth("a b", inter));
    expect(measureWidth("", inter)).toBe(0);
    expect(measureWidth("   ", inter)).toBe(0);
    // A no-break space is not collapsible.
    expect(measureWidth("a  b", inter)).toBeGreaterThan(measureWidth("a b", inter));
  });

  test("returns Chromium layout units (1/64 px, rounded up)", () => {
    for (const text of ["Hamburgefonstiv", "Static export is read-only", "Ünïcödé"]) {
      const width = measureWidth(text, { family: "Inter", size: 13.5, weight: 500 });
      expect(Number.isInteger(width * 64)).toBe(true);
    }
  });

  test("scales with size and differs by weight", () => {
    const at16 = measureWidth("Hamburgefonstiv", inter);
    expect(Math.abs(measureWidth("Hamburgefonstiv", { family: "Inter", size: 32 }) - 2 * at16)).toBeLessThanOrEqual(2 * unit);
    expect(measureWidth("Hamburgefonstiv", { ...inter, weight: 700 })).toBeGreaterThan(at16);
  });

  test("letter-spacing goes after every grapheme, the last included, spaces too", () => {
    const plain = measureWidth("ab c", inter);
    expect(Math.abs(measureWidth("ab c", { ...inter, letterSpacing: 2 }) - (plain + 4 * 2))).toBeLessThanOrEqual(unit);
    expect(Math.abs(measureWidth("ab c", { ...inter, letterSpacing: -0.5 }) - (plain - 4 * 0.5))).toBeLessThanOrEqual(unit);
    // Invisible format characters get no spacing.
    expect(Math.abs(measureWidth("ab​c", { ...inter, letterSpacing: 2 }) - (measureWidth("ab​c", inter) + 3 * 2))).toBeLessThanOrEqual(unit);
  });

  test("letter-spacing turns ligatures off, as browsers do", () => {
    const spaced = measureWidth("->", { ...inter, letterSpacing: 1 });
    const parts = measureWidth("-", inter) + measureWidth(">", inter);
    expect(Math.abs(spaced - (parts + 2))).toBeLessThanOrEqual(2 * unit);
  });

  test("measures IBM Plex Mono as a monospace face", () => {
    const mono: FontSpec = { family: "IBM Plex Mono", size: 14 };
    expect(measureWidth("iiii", mono)).toBe(measureWidth("WWWW", mono));
    expect(measureWidth("iiii", mono)).toBeCloseTo(4 * 0.6 * 14, 1);
  });

  test("rejects invalid sizes", () => {
    expect(() => measureWidth("x", { family: "Inter", size: 0 })).toThrow(TypeError);
    expect(() => measureWidth("x", { family: "Inter", size: Number.NaN })).toThrow(TypeError);
    expect(() => measureWidth("x", { family: "Inter", size: 12, weight: -1 })).toThrow(TypeError);
  });
});

describe("wrapText", () => {
  test("normal collapses newlines and space runs; pre-wrap keeps them", () => {
    const normal = wrapText("a\nb", inter, { maxWidth: 1000, lineHeight: 20 });
    expect(normal.lines.map((l) => l.text)).toEqual(["a b"]);
    const pre = wrapText("a\nb", inter, { maxWidth: 1000, lineHeight: 20, whiteSpace: "pre-wrap" });
    expect(pre.lines.map((l) => l.text)).toEqual(["a", "b"]);
    expect(pre.height).toBe(40);

    const runs = "a    b";
    expect(wrapText(runs, inter, { maxWidth: 1000, lineHeight: 20 }).lines[0]!.width).toBe(measureWidth("a b", inter));
    const kept = wrapText(runs, inter, { maxWidth: 1000, lineHeight: 20, whiteSpace: "pre-wrap" });
    expect(kept.lines[0]!.text).toBe(runs);
    const space = measureWidth("a a", inter) - measureWidth("aa", inter);
    expect(Math.abs(kept.lines[0]!.width - (measureWidth("a b", inter) + 3 * space))).toBeLessThanOrEqual(2 * unit);
    expect(wrapText("a\n\nb", inter, { maxWidth: 1000, lineHeight: 20, whiteSpace: "pre-wrap" }).lineCount).toBe(3);
  });

  test("line widths are whole-run widths of the visible line text", () => {
    const result = wrapText("Static export is read-only by construction", { family: "Inter", size: 12 }, { maxWidth: 120, lineHeight: 18 });
    expect(result.lines.map((l) => l.text)).toEqual(["Static export is read-", "only by construction"]);
    for (const line of result.lines) expect(line.width).toBe(measureWidth(line.text, { family: "Inter", size: 12 }));
    expect(result.maxLineWidth).toBe(Math.max(...result.lines.map((l) => l.width)));
    expect(result.maxLineWidth).toBeLessThanOrEqual(120);
  });

  test("Infinity means one line per paragraph; empty text has no lines", () => {
    const text = "ASCII arrows -> => <- <=> -->";
    const one = wrapText(text, inter, { maxWidth: Infinity, lineHeight: 20 });
    expect(one.lineCount).toBe(1);
    expect(one.maxLineWidth).toBe(measureWidth(text, inter));
    expect(wrapText("", inter, { maxWidth: 100, lineHeight: 20 })).toEqual({ lines: [], lineCount: 0, height: 0, maxLineWidth: 0 });
  });

  test("breaks overlong words at grapheme boundaries (overflow-wrap: break-word)", () => {
    const result = wrapText("Supercalifragilisticexpialidocious", inter, { maxWidth: 60, lineHeight: 20 });
    expect(result.lineCount).toBeGreaterThan(3);
    expect(result.lines.map((l) => l.text).join("")).toBe("Supercalifragilisticexpialidocious");
    for (const line of result.lines) expect(line.width).toBeLessThanOrEqual(60);
  });

  test("letter-spacing makes lines wider and can add lines", () => {
    const text = "Static export is read-only by construction";
    const plain = wrapText(text, inter, { maxWidth: 200, lineHeight: 20 });
    const spaced = wrapText(text, { ...inter, letterSpacing: 3 }, { maxWidth: 200, lineHeight: 20 });
    expect(spaced.lineCount).toBeGreaterThan(plain.lineCount);
    for (const line of spaced.lines) expect(line.width).toBeLessThanOrEqual(200);
  });

  test("rejects invalid boxes", () => {
    expect(() => wrapText("x", inter, { maxWidth: Number.NaN, lineHeight: 20 })).toThrow(TypeError);
    expect(() => wrapText("x", inter, { maxWidth: 100, lineHeight: 20, whiteSpace: "pre" as "normal" })).toThrow(TypeError);
  });
});

describe("weights and families", () => {
  test("snap to the bundled face CSS font matching paints", () => {
    expect(matchFace("Inter", 300).weight).toBe(400);
    expect(matchFace("Inter", 450).weight).toBe(500);
    expect(matchFace("Inter", 550).weight).toBe(600);
    expect(matchFace("Inter", 620).weight).toBe(700);
    expect(matchFace("Inter", 900).weight).toBe(700);
    expect(matchFace("IBM Plex Mono", 700).weight).toBe(600);
    expect(matchFace("IBM Plex Mono", 100).weight).toBe(400);
  });

  test("a snapped weight measures as its face and stays reliable: the browser paints that face as is", () => {
    expect(measureWidth("Hamburgefonstiv", { ...inter, weight: 800 })).toBe(measureWidth("Hamburgefonstiv", { ...inter, weight: 700 }));
    const box = { width: 300, lineHeight: 20, maxLines: 1 };
    // Chromium 153 (fonts.css faces): every weight 1..1000 paints the face CSS font matching picks, with identical
    // widths and pixels and no synthetic bold (300 -> 400, 800/900 -> 700, Plex 700-1000 -> 600).
    for (const weight of [1, 100, 300, 450, 550, 650, 800, 900, 1000]) {
      expect(fitText("Hamburgefonstiv", { ...inter, weight }, box)).toMatchObject({ reliable: true, reasons: [] });
      expect(fitText("Hamburgefonstiv", { family: "IBM Plex Mono", size: 13, weight }, box).reliable).toBe(true);
    }
    // Outside CSS's 1..1000 the browser drops the declaration: not what was measured.
    for (const weight of [0.5, 1001, 1500]) {
      expect(fitText("Hamburgefonstiv", { ...inter, weight }, box)).toMatchObject({ reliable: false, reasons: ["unsupported-weight"] });
    }
  });

  test("the first family decides; unknown families measure as Inter, not reliable", () => {
    const box = { width: 300, lineHeight: 20, maxLines: 1 };
    expect(fitText("Hello", { family: "Inter, system-ui, sans-serif", size: 16 }, box).reliable).toBe(true);
    expect(fitText("Hello", { family: "'IBM Plex Mono', monospace", size: 16 }, box).reliable).toBe(true);
    expect(measureWidth("Hello", { family: '"ibm plex mono"', size: 16 })).toBe(measureWidth("Hello", { family: "IBM Plex Mono", size: 16 }));
    expect(measureWidth("Hello", { family: "Roboto", size: 16 })).toBe(measureWidth("Hello", inter));
    expect(fitText("Hello", { family: "Roboto", size: 16 }, box).reliable).toBe(false);
    expect(fitText("Hello", { family: "system-ui, Inter", size: 16 }, box).reliable).toBe(false);
  });

  test("fontToCss writes the CSS font shorthand", () => {
    expect(fontToCss({ family: "Inter", size: 17.5, weight: 600 })).toBe("600 17.5px Inter");
    expect(fontToCss({ family: "IBM Plex Mono", size: 13 })).toBe('400 13px "IBM Plex Mono"');
    expect(fontToCss({ family: "Inter, system-ui, sans-serif", size: 14, weight: 500 })).toBe("500 14px Inter, system-ui, sans-serif");
  });
});
