import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { SHAPE_CATALOG_ENTRIES } from "../../../../objects/catalog";
import {
  iconGlyphStrokeWidthForViewBox,
  resolveIconGlyph,
  type IconGlyphId,
} from "../../../../objects/shapes/icon/icon-glyphs";
import { iconTileGlyphStrokeWidth } from "../../../../objects/shapes/icon/icon-tile";
import { canvasThemePreset, type CanvasStyle, type CanvasThemeId } from "../../../../theme/canvas-style";
import { CanvasStyleProvider } from "../../../../theme/canvas-style-context";
import { shapeCatalogPreview } from "../shape-previews";

afterEach(() => {
  cleanup();
});

/**
 * The picker previews draw what a click will place under the active canvas
 * style: the style's icon pack, fill-paint brand logos filled, outline glyphs
 * at the default icon's viewBox-normalized stroke, and — in the `tile` icon
 * style — a solid tile with the glyph knocked out.
 */

function preview(glyphId: IconGlyphId, theme?: CanvasThemeId, overrides: Partial<CanvasStyle> = {}): HTMLElement {
  const entry = SHAPE_CATALOG_ENTRIES.find((candidate) => candidate.icon === glyphId)!;
  const Icon = shapeCatalogPreview(entry);
  const wrap = (node: ReactNode) =>
    theme ? <CanvasStyleProvider value={{ ...canvasThemePreset(theme), ...overrides }}>{node}</CanvasStyleProvider> : node;
  return render(<>{wrap(<Icon className="h-5 w-5" />)}</>).container;
}

/** Solid tiles whatever the size (the default 120px icon is solid under the presets' 152px cap anyway). */
const SOLID = { iconTileFill: "solid" } as const;

describe("icon picker previews follow the canvas style", () => {
  it("figjam style: the bare Nucleo glyph stroked like the default placed icon", () => {
    const container = preview("model", "figjam");
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 18 18");
    const group = container.querySelector("svg > g")!;
    expect(group.getAttribute("stroke")).toBe("currentColor");
    expect(Number(group.getAttribute("stroke-width"))).toBe(iconGlyphStrokeWidthForViewBox(120, 18));
    expect(container.querySelector("mask")).toBeNull();
  });

  it("fills brand logos with currentColor in glyph style", () => {
    const container = preview("brand-docker", "figjam");
    const group = container.querySelector("svg > g")!;
    expect(group.getAttribute("fill")).toBe("currentColor");
    expect(group.getAttribute("stroke")).toBe("none");
  });

  it("schematic style, auto tile fill: the default 120px icon previews solid; past the solid cap, a tinted tile with the glyph in currentColor", () => {
    // 120px is within the presets' 152px solid cap.
    expect(preview("agent", "schematic-light").querySelector("mask")).not.toBeNull();
    cleanup();
    const container = preview("agent", "schematic-light", { iconTileSolidMaxPx: 96 });
    expect(container.querySelector("mask")).toBeNull();
    const tile = container.querySelector("svg > g > rect")!;
    expect(tile.getAttribute("fill")).toBe("currentColor");
    expect(tile.getAttribute("fill-opacity")).toBe("0.16");
    expect(tile.getAttribute("stroke")).toBe("currentColor");
    const glyph = container.querySelector("svg > g > g")!;
    expect(glyph.getAttribute("stroke")).toBe("currentColor");
    // The glyph is capped at 56px of the 120px tile, centered: (120 − 56) / 2 = 32px in.
    expect(glyph.getAttribute("transform")).toBe(`translate(${32 * 0.2} ${32 * 0.2}) scale(${56 / 120})`);
  });

  it("schematic style, solid tiles: Tabler geometry on a solid tile with the glyph knocked out", () => {
    const container = preview("agent", "schematic-light", SOLID);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    const tile = container.querySelector("svg > g > rect")!;
    expect(tile.getAttribute("fill")).toBe("currentColor");
    const maskId = container.querySelector("mask")!.getAttribute("id")!;
    expect(tile.getAttribute("mask")).toBe(`url(#${maskId})`);
    const knockout = container.querySelector("mask > g")!;
    expect(knockout.getAttribute("stroke")).toBe("black");
    expect(Number(knockout.getAttribute("stroke-width"))).toBe(iconTileGlyphStrokeWidth(24));
    expect(knockout.getAttribute("transform")).toContain("scale(");
    const tabler = resolveIconGlyph("agent", "tabler");
    expect(knockout.querySelectorAll("path").length).toBe(tabler.elements.filter((element) => element.kind === "path").length);
  });

  it("knocks a brand logo out of its tile by fill, and gives every preview its own mask id", () => {
    const container = preview("brand-docker", "schematic-dark", SOLID);
    expect(container.querySelector("mask > g")!.getAttribute("fill")).toBe("black");
    cleanup();
    const entries = ["agent", "database"].map((glyphId) => SHAPE_CATALOG_ENTRIES.find((candidate) => candidate.icon === glyphId)!);
    const [First, Second] = entries.map((entry) => shapeCatalogPreview(entry));
    const both = render(
      <CanvasStyleProvider value={{ ...canvasThemePreset("schematic-light"), ...SOLID }}>
        {First ? <First /> : null}
        {Second ? <Second /> : null}
      </CanvasStyleProvider>,
    ).container;
    const ids = [...both.querySelectorAll("mask")].map((mask) => mask.getAttribute("id"));
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
