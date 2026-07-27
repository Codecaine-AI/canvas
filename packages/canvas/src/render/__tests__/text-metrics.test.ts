import { describe, expect, it } from "bun:test";
import {
  INTER_BOLD_MIN_WEIGHT,
  INTER_UNITS_PER_EM,
  interAdvanceUnits,
  measureInterTextPx,
} from "../text-metrics";
import {
  INTER_FALLBACK_ADVANCE_BOLD,
  INTER_FALLBACK_ADVANCE_REGULAR,
} from "../inter-metrics.generated";
import { renderDocumentToSvg } from "../static-svg";
import { CENTER_TEXT_INSET_PX } from "../../objects/text-slots";
import type { InteractiveCanvasDocument } from "../../state/schema";

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

/** Shape body text renders bold (SHAPE_TEXT_TYPOGRAPHY fontWeight 700) at 15px. */
const BODY_FONT_SIZE_PX = 15;
const BODY_FONT_WEIGHT = 700;

describe("inter text metrics", () => {
  it("exposes the font's real units-per-em and per-glyph advances", () => {
    expect(INTER_UNITS_PER_EM).toBe(2816);
    // Values cross-checked against the TTF's hmtx (regular) and the wght-700
    // instance (hmtx + HVAR), via fontTools ground truth at generation time.
    expect(interAdvanceUnits("n".codePointAt(0)!, 400)).toBe(1648);
    expect(interAdvanceUnits("n".codePointAt(0)!, 700)).toBe(1751);
    expect(interAdvanceUnits(" ".codePointAt(0)!, 400)).toBe(792);
    // Bold space is genuinely NARROWER in Inter — a flat bold factor would get
    // every space-separated measurement wrong.
    expect(interAdvanceUnits(" ".codePointAt(0)!, 700)).toBe(653);
    // The ellipsis and the sticky bullet glyphs are covered.
    expect(interAdvanceUnits("…".codePointAt(0)!, 400)).toBe(2312);
    expect(interAdvanceUnits("•".codePointAt(0)!, 400)).toBe(1584);
    expect(interAdvanceUnits("◦".codePointAt(0)!, 400)).toBe(1584);
    expect(interAdvanceUnits("▪".codePointAt(0)!, 400)).toBe(1584);
  });

  it("falls back to the documented mean advance for uncovered codepoints", () => {
    expect(interAdvanceUnits(0x4e2d, 400)).toBe(INTER_FALLBACK_ADVANCE_REGULAR);
    expect(interAdvanceUnits(0x4e2d, 700)).toBe(INTER_FALLBACK_ADVANCE_BOLD);
  });

  it("measures runs as the sum of advances scaled by fontSize/upem", () => {
    expect(measureInterTextPx("no", 24, 400)).toBeCloseTo(((1648 + 1680) * 24) / 2816, 10);
    expect(measureInterTextPx("", 24, 400)).toBe(0);
    // The weight threshold splits the two instances.
    expect(measureInterTextPx("n", 10, INTER_BOLD_MIN_WEIGHT)).toBeCloseTo(
      (1751 * 10) / 2816,
      10,
    );
    expect(measureInterTextPx("n", 10, INTER_BOLD_MIN_WEIGHT - 1)).toBeCloseTo(
      (1648 * 10) / 2816,
      10,
    );
  });
});

describe("body-text wrapping on real metrics", () => {
  it("wraps greedily at spaces: every line fits, no line could take the next word", () => {
    const text = "the quick brown fox jumps over the lazy dog near the riverbank";
    const width = 200;
    const { svg } = renderDocumentToSvg(processDocument(text, width, 400), {
      background: "transparent",
    });
    const lines = tspanLines(svg);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe(text);

    const available = width - CENTER_TEXT_INSET_PX.x * 2;
    for (const line of lines) {
      expect(measureInterTextPx(line, BODY_FONT_SIZE_PX, BODY_FONT_WEIGHT)).toBeLessThanOrEqual(
        available,
      );
    }
    // Greedy: each line rejected the next line's first word.
    for (let index = 0; index < lines.length - 1; index += 1) {
      const nextWord = lines[index + 1]!.split(" ")[0]!;
      expect(
        measureInterTextPx(`${lines[index]!} ${nextWord}`, BODY_FONT_SIZE_PX, BODY_FONT_WEIGHT),
      ).toBeGreaterThan(available);
    }
  });

  it("breaks a single word wider than the box intra-word at the overflow point", () => {
    const word = "Antidisestablishmentarianismus";
    const width = 120;
    const { svg } = renderDocumentToSvg(processDocument(word, width, 400), {
      background: "transparent",
    });
    const lines = tspanLines(svg);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe(word);

    const available = width - CENTER_TEXT_INSET_PX.x * 2;
    for (const line of lines) {
      expect(measureInterTextPx(line, BODY_FONT_SIZE_PX, BODY_FONT_WEIGHT)).toBeLessThanOrEqual(
        available,
      );
    }
    // Every chunk except the last is maximal: one more character overflows.
    for (let index = 0; index < lines.length - 1; index += 1) {
      const nextChar = [...lines[index + 1]!][0]!;
      expect(
        measureInterTextPx(lines[index]! + nextChar, BODY_FONT_SIZE_PX, BODY_FONT_WEIGHT),
      ).toBeGreaterThan(available);
    }
  });

  it("wraps real metrics more truthfully than the char-count heuristic", () => {
    // 24 lowercase letters: the 0.62em char-count heuristic calls this wider
    // than 172px (24 × 15 × 0.62 = 223), but real Inter advances measure it
    // narrower than the box — the browser keeps it on one line.
    const text = "iiiiiiiiiiiillllllllllll";
    const width = 200;
    const available = width - CENTER_TEXT_INSET_PX.x * 2;
    expect(measureInterTextPx(text, BODY_FONT_SIZE_PX, BODY_FONT_WEIGHT)).toBeLessThan(available);
    expect(text.length * BODY_FONT_SIZE_PX * 0.62).toBeGreaterThan(available);
    const { svg } = renderDocumentToSvg(processDocument(text, width, 400), {
      background: "transparent",
    });
    expect(tspanLines(svg)).toEqual([text]);
  });

  it("clamps to the slot height and ellipsizes so the last line still fits", () => {
    const text = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    const width = 160;
    const height = 80;
    const { svg } = renderDocumentToSvg(processDocument(text, width, height), {
      background: "transparent",
    });
    const lines = tspanLines(svg);
    // Center slot: height − 2×12 inset = 56px at 18px line height → 3 lines.
    expect(lines.length).toBe(3);
    const last = lines[lines.length - 1]!;
    expect(last.endsWith("…")).toBe(true);
    const available = width - CENTER_TEXT_INSET_PX.x * 2;
    expect(measureInterTextPx(last, BODY_FONT_SIZE_PX, BODY_FONT_WEIGHT)).toBeLessThanOrEqual(
      available,
    );
  });
});
