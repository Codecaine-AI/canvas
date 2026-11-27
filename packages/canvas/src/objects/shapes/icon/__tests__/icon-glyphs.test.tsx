import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { ICON_GLYPHS, ICON_GLYPH_BASE_VIEWBOX_SIZE, ICON_GLYPH_CANVAS_STROKE_WIDTH, ICON_GLYPH_IDS, ICON_GLYPH_REFERENCE_SIZE_PX, iconGlyphStrokeWidthForSize, iconGlyphStrokeWidthForViewBox, type IconGlyphId } from "../icon-glyphs";
import { IconShapeBody } from "../IconShapeBody";

afterEach(() => {
  cleanup();
});

// The 30 operational-map ids. Documents have persisted them since the first
// icon release, so they stay first in the roster, in this order, and keep
// drawing their Nucleo geometry in the default (nucleo) pack.
const BASE_IDS: IconGlyphId[] = [
  "agent",
  "model",
  "human",
  "orchestrator",
  "memory",
  "knowledge",
  "queue",
  "server",
  "terminal",
  "config",
  "api",
  "message",
  "send",
  "event",
  "guardrail",
  "monitor",
  "judge",
  "document",
  "documents",
  "activity",
  "archive",
  "key",
  "coin",
  "package",
  "voice",
  "search",
  "tool",
  "wait",
  "lock",
  "eval",
];

describe("ICON_GLYPH_IDS", () => {
  it("starts with the 30 operational-map ids, in roster order", () => {
    expect(ICON_GLYPH_IDS.slice(0, BASE_IDS.length)).toEqual(BASE_IDS);
  });
});

describe("ICON_GLYPHS registry", () => {
  it("every operational-map glyph keeps its Nucleo outline: 18x18 grid, stroke paint, at least one drawable element", () => {
    for (const id of BASE_IDS) {
      const glyph = ICON_GLYPHS[id];
      expect(glyph.source).toBe("nucleo");
      expect(glyph.paint).toBe("stroke");
      expect(glyph.viewBoxSize).toBe(18);
      expect(glyph.elements.length).toBeGreaterThan(0);
    }
  });

  for (const id of BASE_IDS) {
    it(`renders valid, non-empty SVG markup for "${id}"`, () => {
      const glyph = ICON_GLYPHS[id];
      const { container } = render(
        <IconShapeBody object={{ icon: id, geometry: { width: 120, height: 120 } }} />,
      );
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute("viewBox")).toBe(`0 0 ${glyph.viewBoxSize} ${glyph.viewBoxSize}`);
      expect(svg?.getAttribute("fill")).toBe("none");
      // At least one drawable primitive per glyph (path/circle/line).
      const drawables = svg?.querySelectorAll("path, circle, line") ?? [];
      expect(drawables.length).toBeGreaterThan(0);
      cleanup();
    });
  }
});

describe("iconGlyphStrokeWidthForSize", () => {
  it("renders a 4x-size icon at the same reference pixel weight (full falloff)", () => {
    // viewBox stroke * 4 (linear scale-up) = exactly the reference pixel weight
    expect(iconGlyphStrokeWidthForSize(ICON_GLYPH_REFERENCE_SIZE_PX * 4)).toBeCloseTo(ICON_GLYPH_CANVAS_STROKE_WIDTH / 4);
  });

  it("falls back to the canvas base glyph stroke for non-positive sizes", () => {
    expect(iconGlyphStrokeWidthForSize(0)).toBe(ICON_GLYPH_CANVAS_STROKE_WIDTH);
    expect(iconGlyphStrokeWidthForSize(-1)).toBe(ICON_GLYPH_CANVAS_STROKE_WIDTH);
  });
});

describe("iconGlyphStrokeWidthForViewBox", () => {
  it("draws a glyph on any grid at the Nucleo glyph's rendered pixel weight for the same box", () => {
    // A stroke of w viewBox units on a V-unit grid drawn into a B px box renders w * B / V px.
    for (const sizePx of [20, 64, ICON_GLYPH_REFERENCE_SIZE_PX, 520]) {
      const nucleoPx = (iconGlyphStrokeWidthForSize(sizePx) * sizePx) / ICON_GLYPH_BASE_VIEWBOX_SIZE;
      const tablerPx = (iconGlyphStrokeWidthForViewBox(sizePx, 24) * sizePx) / 24;
      expect(tablerPx).toBeCloseTo(nucleoPx, 10);
    }
  });
});

describe("IconShapeBody", () => {
  it("scales the glyph stroke from the smaller geometry dimension", () => {
    const { container } = render(
      <IconShapeBody object={{ icon: "server", geometry: { width: 520, height: 260 } }} />,
    );
    const svg = container.querySelector("svg[data-canvas-icon-glyph='server']");
    expect(svg).not.toBeNull();
    expect(Number(svg?.getAttribute("stroke-width"))).toBeCloseTo(iconGlyphStrokeWidthForSize(260));
  });

  it("renders gracefully with no icon set (unknown glyph)", () => {
    const { container } = render(
      <IconShapeBody object={{ geometry: { width: 120, height: 120 } }} />,
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("data-canvas-icon-glyph")).toBe("unknown");
    expect(container.textContent).toBe("");
  });
});
