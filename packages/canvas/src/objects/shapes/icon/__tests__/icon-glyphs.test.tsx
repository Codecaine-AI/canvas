import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import {
  ICON_GLYPHS,
  ICON_GLYPH_CANVAS_STROKE_WIDTH,
  ICON_GLYPH_IDS,
  ICON_GLYPH_REFERENCE_SIZE_PX,
  ICON_GLYPH_STROKE_WIDTH,
  iconGlyphStrokeWidthForSize,
  type IconGlyphId,
} from "../icon-glyphs";
import { IconShapeBody } from "../IconShapeBody";

afterEach(() => {
  cleanup();
});

const EXPECTED_IDS: IconGlyphId[] = [
  "activity",
  "archive",
  "key",
  "chat",
  "cloud",
  "cpu",
  "database",
  "display",
  "mail",
  "file",
  "code",
  "bolt",
  "pin",
  "phone",
  "package",
  "coin",
  "shield",
  "send",
  "server",
  "cube",
  "gear",
  "drive",
  "terminal",
  "person",
  "wallet",
  "globe",
];

describe("ICON_GLYPH_IDS", () => {
  it("has exactly 26 entries matching the parity brief's ids", () => {
    expect(ICON_GLYPH_IDS.length).toBe(26);
    expect([...ICON_GLYPH_IDS].sort()).toEqual([...EXPECTED_IDS].sort());
  });
});

describe("ICON_GLYPHS registry", () => {
  it("has exactly one definition per glyph id, keyed consistently", () => {
    const keys = Object.keys(ICON_GLYPHS);
    expect(keys.length).toBe(26);
    for (const id of EXPECTED_IDS) {
      expect(ICON_GLYPHS[id]).toBeDefined();
      expect(ICON_GLYPHS[id].id).toBe(id);
    }
  });

  it("every glyph has an 18x18 (native Nucleo grid) viewBox and at least one drawable element", () => {
    for (const id of EXPECTED_IDS) {
      const glyph = ICON_GLYPHS[id];
      expect(glyph.viewBoxSize).toBe(18);
      expect(glyph.elements.length).toBeGreaterThan(0);
    }
  });

  for (const id of EXPECTED_IDS) {
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
  it("keeps the reference size identical to the canvas base glyph stroke", () => {
    expect(iconGlyphStrokeWidthForSize(ICON_GLYPH_REFERENCE_SIZE_PX)).toBe(ICON_GLYPH_CANVAS_STROKE_WIDTH);
  });

  it("renders a 4x-size icon at the same reference pixel weight (full falloff)", () => {
    // viewBox stroke * 4 (linear scale-up) = exactly the reference pixel weight
    expect(iconGlyphStrokeWidthForSize(ICON_GLYPH_REFERENCE_SIZE_PX * 4)).toBeCloseTo(ICON_GLYPH_CANVAS_STROKE_WIDTH / 4);
  });

  it("stays lighter than the preview stroke that panel previews keep", () => {
    expect(ICON_GLYPH_CANVAS_STROKE_WIDTH).toBeLessThan(ICON_GLYPH_STROKE_WIDTH);
  });

  it("falls back to the canvas base glyph stroke for non-positive sizes", () => {
    expect(iconGlyphStrokeWidthForSize(0)).toBe(ICON_GLYPH_CANVAS_STROKE_WIDTH);
    expect(iconGlyphStrokeWidthForSize(-1)).toBe(ICON_GLYPH_CANVAS_STROKE_WIDTH);
  });
});

describe("IconShapeBody", () => {
  it("renders only the glyph body; text is rendered by the icon object def", () => {
    const { container } = render(
      <IconShapeBody
        object={{ icon: "server", geometry: { width: 120, height: 120 } }}
        colors={{ stroke: "#111111", fill: "#EEEEEE" }}
      />,
    );

    expect(container.querySelector(".interactive-canvas-label-below-icon")).toBeNull();

    const svg = container.querySelector("svg[data-canvas-icon-glyph='server']");
    expect(svg).not.toBeNull();

    const root = container.querySelector("[data-canvas-icon-shape-body]");
    expect(root).not.toBeNull();
    expect(root?.children.length).toBe(1);
  });

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
