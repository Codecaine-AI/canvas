import { describe, expect, it } from "bun:test";
import { clampLines, renderDocumentToSvg, wrapTextLines } from "../static-svg";
import { CENTER_TEXT_INSET_PX, SHAPE_TEXT_TYPOGRAPHY } from "../../objects/text-slots";
import { DEFAULT_CANVAS_STYLE } from "../../theme/canvas-style";
import { measureLineWidth, measureWidth } from "../../theme/text-measure";
import type { InteractiveCanvasDocument } from "../../state/schema";

/**
 * Slot names in the static renderer wrap the way the stage's slot paints
 * them — `white-space: pre-wrap; overflow-wrap: break-word` — with
 * text-measure's line breaking on the bundled faces (the test preload runs
 * the exact HarfBuzz backend, as every Bun/Node host does).
 */

/** Body-text tspan strings from a rendered SVG, in document order. */
function tspanLines(svg: string): string[] {
  return [...svg.matchAll(/<tspan [^>]*>([^<]*)<\/tspan>/g)].map((match) => match[1]!);
}

function processDocument(text: string, width: number, height: number): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "wrap-fixture",
    mode: "diagram",
    objects: [
      {
        id: "p1",
        type: "process",
        text,
        geometry: { x: 0, y: 0, width, height },
        style: { shape: "rounded-rect" },
      },
    ],
    connections: [],
  };
}

function render(text: string, width: number, height = 400): string {
  return renderDocumentToSvg(processDocument(text, width, height), { background: "transparent" }).svg;
}

/** Shape names render in the default style's name size and weight (the renders below pass no style). */
const NAME_FONT = {
  family: "Inter",
  size: DEFAULT_CANVAS_STYLE.textFontSizePx,
  weight: DEFAULT_CANVAS_STYLE.textFontWeight,
};
const TYPOGRAPHY = {
  ...SHAPE_TEXT_TYPOGRAPHY,
  fontSizePx: DEFAULT_CANVAS_STYLE.textFontSizePx,
  fontWeight: DEFAULT_CANVAS_STYLE.textFontWeight,
};
const width = (text: string) => measureWidth(text, NAME_FONT);

describe("slot names wrap like the stage paints them", () => {
  it("breaks greedily: every line fits, no line could take the next word", () => {
    const text = "the quick brown fox jumps over the lazy dog near the riverbank";
    const box = 200;
    const lines = tspanLines(render(text, box));
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe(text);

    const available = box - CENTER_TEXT_INSET_PX.x * 2;
    for (const line of lines) expect(width(line)).toBeLessThanOrEqual(available);
    for (let index = 0; index < lines.length - 1; index += 1) {
      const nextWord = lines[index + 1]!.split(" ")[0]!;
      expect(width(`${lines[index]!} ${nextWord}`)).toBeGreaterThan(available);
    }
  });

  it("breaks a single word wider than the box intra-word at the overflow point", () => {
    const word = "Antidisestablishmentarianismus";
    const box = 120;
    const lines = tspanLines(render(word, box));
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe(word);

    const available = box - CENTER_TEXT_INSET_PX.x * 2;
    for (const line of lines) expect(width(line)).toBeLessThanOrEqual(available);
    // Every chunk except the last is maximal: one more character overflows.
    for (let index = 0; index < lines.length - 1; index += 1) {
      expect(width(lines[index]! + [...lines[index + 1]!][0]!)).toBeGreaterThan(available);
    }
  });

  it("breaks after a hyphen like the browser, not only at spaces", () => {
    // "long-running" may break after its hyphen (UAX #14); the old space-only
    // wrapper broke it mid-word instead.
    const lines = wrapTextLines("Daily long-running reconciliation", 150, TYPOGRAPHY);
    expect(lines.some((line) => line.trimEnd().endsWith("-"))).toBe(true);
    expect(lines.join("")).toBe("Daily long-running reconciliation");
  });

  it("keeps a no-break space as glue", () => {
    const nbsp = "Version two point zero";
    const lines = wrapTextLines(nbsp, width("Version two") + 2, TYPOGRAPHY);
    expect(lines[0]).toBe("Version two ");
  });

  it("measures real advances with kerning, not a per-character estimate", () => {
    // 24 lowercase letters: a 0.62em char-count estimate calls this wider than
    // the 172px slot (24 × 17.5 × 0.62 = 260px); Inter measures it far narrower.
    const text = "iiiiiiiiiiiillllllllllll";
    const available = 200 - CENTER_TEXT_INSET_PX.x * 2;
    expect(width(text)).toBeLessThan(available);
    expect(text.length * NAME_FONT.size * 0.62).toBeGreaterThan(available);
    expect(tspanLines(render(text, 200))).toEqual([text]);
  });

  it("follows pre-wrap: newlines break, a trailing newline adds no line, a blank line keeps its line box", () => {
    expect(wrapTextLines("alpha\nbeta", 400, TYPOGRAPHY)).toEqual(["alpha", "beta"]);
    expect(wrapTextLines("alpha\n", 400, TYPOGRAPHY)).toEqual(["alpha"]);
    expect(wrapTextLines("alpha\n\nbeta", 400, TYPOGRAPHY)).toEqual(["alpha", "", "beta"]);
  });

  it("preserves leading and repeated spaces in the SVG (xml:space) and drops hanging trailing ones", () => {
    const svg = render("  two  spaces   ", 400);
    expect(svg).toContain('xml:space="preserve"');
    expect(tspanLines(svg)).toEqual(["  two  spaces"]);
    // Ordinary text needs no preserve flag.
    expect(render("plain name", 400)).not.toContain("xml:space");
  });

  it("clamps to the slot height and ellipsizes so the last line still fits", () => {
    const text = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    const box = 160;
    const lines = tspanLines(render(text, box, 80));
    // Center slot: height − 2×12 inset = 56px of name line boxes (1.2em each).
    expect(lines.length).toBe(Math.floor(56 / (NAME_FONT.size * 1.2)));
    expect(lines.length).toBeGreaterThan(1);
    const last = lines[lines.length - 1]!;
    expect(last.endsWith("…")).toBe(true);
    expect(width(last)).toBeLessThanOrEqual(box - CENTER_TEXT_INSET_PX.x * 2);
  });

  it("measures the clamped line's kept spaces as painted (pre-wrap), so the ellipsis stays inside the slot", () => {
    const clamped = clampLines(wrapTextLines("a  a  a  a\nnext", 400, TYPOGRAPHY), 1, 80, TYPOGRAPHY);
    expect(clamped).toHaveLength(1);
    const last = clamped[0]!;
    expect(last.endsWith("…")).toBe(true);
    // Measured with its repeated spaces kept — not collapsed to single spaces.
    const painted = wrapTextLines(last, Number.POSITIVE_INFINITY, TYPOGRAPHY)[0]!;
    expect(painted).toBe(last);
    expect(width(last.replace(/ {2}/g, " "))).toBeLessThan(80);
    expect(measureLineWidth(last, NAME_FONT, "pre-wrap")).toBeLessThanOrEqual(80);
  });

  it("cuts the clamped line on grapheme clusters, never inside one", () => {
    const lines = ["first line", "👩‍👩‍👧‍👦👩‍👩‍👧‍👦👩‍👩‍👧‍👦 family"];
    const clamped = clampLines([...lines, "third"], 2, 60, TYPOGRAPHY);
    expect(clamped).toHaveLength(2);
    const last = clamped[1]!;
    expect(last.endsWith("…")).toBe(true);
    // Whole family emoji only: no lone surrogates or broken ZWJ sequences.
    expect(last.replace(/…$/, "").replace(/👩‍👩‍👧‍👦/g, "").trim()).toBe("");
  });
  it("keeps no-break spaces before the ellipsis: only collapsible whitespace is trimmed", () => {
    // A one-line center slot just wide enough for "a␣␣…" but not "a␣␣b…".
    const nbsp = "a\u00a0\u00a0";
    const slot = Math.ceil(width(`${nbsp}…`)) + 1;
    expect(width(`${nbsp}b…`)).toBeGreaterThan(slot);
    const box = slot + CENTER_TEXT_INSET_PX.x * 2;
    const oneLine = Math.ceil(NAME_FONT.size * 1.2) + CENTER_TEXT_INSET_PX.y * 2;
    expect(tspanLines(render(`${nbsp}bbbbbbbb`, box, oneLine))).toEqual([`${nbsp}…`]);
    // Ordinary spaces before the cut collapse away.
    expect(tspanLines(render("a  bbbbbbbb", box, oneLine))).toEqual(["a…"]);
  });
});
