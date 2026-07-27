import { describe, expect, it } from "bun:test";
import {
  layoutStickyText,
  STICKY_CODE_FONT_EM,
  STICKY_CODE_MONO_ADVANCE_EM,
  STICKY_LINE_PITCH_PX,
} from "../sticky-text";
import { measureInterTextPx } from "../text-metrics";
import { renderDocumentToSvg } from "../static-svg";
import { INSET_BODY_PADDING_PX } from "../../objects/text-slots";
import type { InteractiveCanvasDocument } from "../../state/schema";

const BODY_FONT_SIZE_PX = 24; // the inset-body slot's typography

function stickyDocument(text: string, width = 416, height = 420): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "sticky-fixture",
    mode: "diagram",
    objects: [
      {
        id: "s1",
        type: "sticky",
        text,
        color: "yellow",
        geometry: { x: 0, y: 0, width, height },
        style: { shape: "note" },
      },
    ],
    connections: [],
  };
}

/** The inset-body slot width of the default 416px sticky. */
const SLOT_WIDTH_PX = 416 - INSET_BODY_PADDING_PX.left - INSET_BODY_PADDING_PX.right;

describe("layoutStickyText", () => {
  it("mirrors the live markdown line boxes: heading sizes, bullet grid, blank lines", () => {
    const rows = layoutStickyText(
      "# Plan\n## Sub\n### Third\n- alpha\n  - beta\n\nparagraph",
      SLOT_WIDTH_PX,
      BODY_FONT_SIZE_PX,
    );
    // One visual row per source line — line-count parity when nothing wraps.
    expect(rows.length).toBe(7);

    // Headings: 1.5em/1.25em/1.1em of the 24px body, bold, flush left.
    expect(rows[0]).toMatchObject({ fontSizePx: 36, fontWeight: 700, indentPx: 0 });
    expect(rows[1]).toMatchObject({ fontSizePx: 30, fontWeight: 700 });
    expect(rows[2]!.fontSizePx).toBeCloseTo(26.4, 10);
    expect(rows[2]!.fontWeight).toBe(700);

    // Depth-0 bullet: text at 1em, glyph "•" flush in its 0.75em gutter at 0.25em.
    expect(rows[3]!.indentPx).toBeCloseTo(24, 10);
    expect(rows[3]!.bullet).toEqual({ glyph: "•", xPx: 6 });
    // Depth-1 bullet: text at 1.75em, glyph "◦" at 1em.
    expect(rows[4]!.indentPx).toBeCloseTo(42, 10);
    expect(rows[4]!.bullet).toEqual({ glyph: "◦", xPx: 24 });

    // The blank line keeps its line box but paints nothing.
    expect(rows[5]!.segments).toEqual([]);

    // Plain paragraphs nest 0.125em under headings.
    expect(rows[6]!.indentPx).toBeCloseTo(3, 10);
    expect(rows[6]!.segments[0]!.text).toBe("paragraph");
  });

  it("wraps long lines on real Inter advances within the indented width", () => {
    const text = "Some longer paragraph text that should wrap across the sticky width naturally";
    const rows = layoutStickyText(text, SLOT_WIDTH_PX, BODY_FONT_SIZE_PX);
    expect(rows.length).toBeGreaterThan(1);
    const joined = rows
      .flatMap((row) => row.segments.map((segment) => segment.text))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    expect(joined).toBe(text);
    for (const row of rows) {
      const last = row.segments[row.segments.length - 1]!;
      // Content fits the box; only hanging trailing spaces may pass the edge.
      const paintedEnd =
        last.xPx + last.widthPx - measureInterTextPx(" ", 24, 400) * (last.text.length - last.text.trimEnd().length);
      expect(paintedEnd).toBeLessThanOrEqual(SLOT_WIDTH_PX + 0.001);
    }
  });

  it("breaks a word wider than the slot intra-word", () => {
    const word = "Onomatopoeticmegaword".repeat(3);
    const rows = layoutStickyText(word, 200, BODY_FONT_SIZE_PX);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.flatMap((row) => row.segments.map((s) => s.text)).join("")).toBe(word);
  });

  it("measures bold runs with the wght-700 instance and code runs with the mono approximation", () => {
    const rows = layoutStickyText("**bold** and `code`", SLOT_WIDTH_PX, BODY_FONT_SIZE_PX);
    const [row] = rows;
    const strong = row!.segments.find((segment) => segment.style === "strong")!;
    expect(strong.text).toBe("bold");
    expect(strong.fontWeight).toBe(700);
    expect(strong.widthPx).toBeCloseTo(measureInterTextPx("bold", 24, 700), 10);

    const code = row!.segments.find((segment) => segment.style === "code")!;
    const codeFontSize = 24 * STICKY_CODE_FONT_EM;
    expect(code.fontSizePx).toBeCloseTo(codeFontSize, 10);
    // 4 chars at the flat mono advance plus 0.15em padding each side.
    expect(code.widthPx).toBeCloseTo(
      4 * codeFontSize * STICKY_CODE_MONO_ADVANCE_EM + 2 * codeFontSize * 0.15,
      10,
    );
  });

  it("keeps heading indentation on the heading's own em grid", () => {
    const rows = layoutStickyText("  # Nested", SLOT_WIDTH_PX, BODY_FONT_SIZE_PX);
    // Depth 1 heading: 1em of the 36px heading size.
    expect(rows[0]).toMatchObject({ fontSizePx: 36, indentPx: 36 });
  });
});

describe("sticky markdown static rendering", () => {
  it("emits the live line grid: 36px pitch from the inset-body slot top", () => {
    const { svg } = renderDocumentToSvg(stickyDocument("# Plan\n- alpha\n  - beta\ngamma"), {
      background: "transparent",
    });
    // Row centers: top padding 28 + 18 + n×36.
    const ys = [...svg.matchAll(/<tspan [^>]*?y="(-?[0-9.]+)"/g)].map((match) => Number(match[1]));
    // Heading, bullet glyph + text, bullet glyph + text, paragraph.
    expect(ys).toEqual([46, 82, 82, 118, 118, 154]);

    expect(svg).toContain('font-size="36"');
    expect(svg).toContain('font-weight="700"');
    expect(svg).toContain(">•</tspan>");
    expect(svg).toContain(">◦</tspan>");
    expect(svg).toContain(">gamma</tspan>");
  });

  it("draws inline-code chip backgrounds behind the code run", () => {
    const { svg } = renderDocumentToSvg(stickyDocument("run `deploy` now"), {
      background: "transparent",
    });
    expect(svg).toContain('rx="3"');
    expect(svg).toContain('fill-opacity="0.08"');
    expect(svg).toContain(">deploy</tspan>");
    // The chip rect paints before (under) the text element.
    expect(svg.indexOf('rx="3"')).toBeLessThan(svg.indexOf(">deploy</tspan>"));
  });

  it("clamps to whole line boxes in the slot height and ellipsizes the last row", () => {
    const source = Array.from({ length: 14 }, (_, i) => `line ${i}`).join("\n");
    const { svg } = renderDocumentToSvg(stickyDocument(source), { background: "transparent" });
    const lines = [...svg.matchAll(/<tspan [^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]!);
    // Slot height 420 − 28 − 21 = 371px → 10 full 36px line boxes.
    expect(lines.length).toBe(10);
    expect(lines[lines.length - 1]!.endsWith("…")).toBe(true);
    expect(svg).not.toContain(">line 10</tspan>");
  });

  it("line count matches the live layout for a mixed heading/bullet/wrap fixture", () => {
    // 6 source lines; the long paragraph wraps into 3 visual rows at the
    // default sticky width → 8 line boxes total, all within the slot height.
    const source = [
      "# Retro",
      "- keep",
      "- drop",
      "",
      "**Next sprint** we should double down on the canvas renderer work",
      "`bun test` stays green",
    ].join("\n");
    const rows = layoutStickyText(source, SLOT_WIDTH_PX, BODY_FONT_SIZE_PX);
    expect(rows.length).toBe(8);
    // All rows fit the default sticky's 10-line budget, so nothing ellipsizes.
    const { svg } = renderDocumentToSvg(stickyDocument(source), { background: "transparent" });
    expect(svg).not.toContain("…");
    const ys = new Set(
      [...svg.matchAll(/<tspan [^>]*?y="(-?[0-9.]+)"/g)].map((match) => Number(match[1])),
    );
    expect(ys.size).toBe(7); // 8 line boxes minus the blank one that paints nothing
    for (const y of ys) {
      expect((y - 46) % STICKY_LINE_PITCH_PX).toBe(0);
    }
  });
});
