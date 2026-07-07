import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { ICON_GLYPHS, ICON_GLYPH_IDS, type IconGlyphId } from "../../ui/icons/icon-glyphs";
import { IconShapeBody } from "../../objects/shapes/icon/IconShapeBody";

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
        <IconShapeBody object={{ label: "Sample", icon: id, geometry: { width: 120, height: 120 } }} />,
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

describe("IconShapeBody", () => {
  it("renders the object's label below the glyph", () => {
    const { container, getByText } = render(
      <IconShapeBody
        object={{ label: "My Server", icon: "server", geometry: { width: 120, height: 120 } }}
        colors={{ stroke: "#111111", fill: "#EEEEEE" }}
      />,
    );

    const label = getByText("My Server");
    expect(label).toBeTruthy();
    expect(label.className).toContain("interactive-canvas-label-below-icon");

    const svg = container.querySelector("svg[data-canvas-icon-glyph='server']");
    expect(svg).not.toBeNull();

    // Layout order: glyph svg should precede the label span in DOM order,
    // matching the "label BELOW the glyph" requirement.
    const root = container.querySelector("[data-canvas-icon-shape-body]");
    expect(root).not.toBeNull();
    const children = Array.from(root?.children ?? []);
    const svgIndex = children.findIndex((child) => child.tagName.toLowerCase() === "svg");
    const labelIndex = children.findIndex((child) => child.textContent === "My Server");
    expect(svgIndex).toBeGreaterThanOrEqual(0);
    expect(labelIndex).toBeGreaterThan(svgIndex);
  });

  it("renders gracefully with no icon set (unknown glyph)", () => {
    const { container } = render(
      <IconShapeBody object={{ label: "No Icon", geometry: { width: 120, height: 120 } }} />,
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(container.textContent).toContain("No Icon");
  });
});
