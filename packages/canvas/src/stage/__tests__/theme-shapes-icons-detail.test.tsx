import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { CanvasStage } from "../CanvasStage";
import { canvasThemePreset, type CanvasStyle, type CanvasThemeId } from "../../theme/canvas-style";
import { CANVAS_MONO_FONT_STACK } from "../../theme/fonts";
import { resolveIconPaint, resolveIconTilePaint } from "../../theme/palette";
import { resolveIconGlyph } from "../../objects/shapes/icon/icon-glyphs";
import { iconTileGlyphStrokeWidth } from "../../objects/shapes/icon/icon-tile";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";

afterEach(() => {
  cleanup();
});

/**
 * The LIVE stage's shape / icon / detail rendering under the theme model —
 * the same decisions the static renderer makes (render/__tests__/
 * static-svg-shapes-detail.test.ts pins those).
 */

function stage(objects: InteractiveCanvasObject[], theme: CanvasThemeId | CanvasStyle = "figjam") {
  const document: InteractiveCanvasDocument = {
    schemaVersion: 1,
    id: "live-detail",
    mode: "diagram",
    objects,
    connections: [],
  };
  return render(
    <CanvasStage document={document} viewport={{ x: 0, y: 0, zoom: 1 }} canvasStyle={typeof theme === "string" ? canvasThemePreset(theme) : theme} />,
  ).container;
}

function shape(partial: Partial<InteractiveCanvasObject> = {}): InteractiveCanvasObject {
  return {
    id: "s1",
    type: "process",
    text: "Run Executor LLM",
    parentId: null,
    geometry: { x: 0, y: 0, width: 240, height: 80 },
    style: { shape: "rounded-rect" },
    color: "blue",
    ...partial,
  } as InteractiveCanvasObject;
}

function icon(partial: Partial<InteractiveCanvasObject> = {}): InteractiveCanvasObject {
  return {
    id: "i1",
    type: "icon",
    icon: "database",
    text: "Orders DB",
    parentId: null,
    geometry: { x: 0, y: 0, width: 64, height: 64 },
    style: { shape: "icon" },
    color: "violet",
    ...partial,
  } as InteractiveCanvasObject;
}

function objectNode(container: HTMLElement, id: string): HTMLElement {
  const node = container.querySelector(`[data-canvas-object-id="${id}"]`) as HTMLElement | null;
  if (!node) throw new Error(`no object ${id}`);
  return node;
}

describe("live detail line", () => {
  it("renders under the name in a center slot: collapsed, one line, ellipsized, muted mono", () => {
    const container = stage([shape({ detail: "Function\nCalling LLM" })], "schematic-light");
    const node = objectNode(container, "s1");
    const detail = node.querySelector("[data-canvas-text-detail]") as HTMLElement;
    expect(detail.textContent).toBe("Function Calling LLM");
    expect(detail.style.whiteSpace).toBe("nowrap");
    expect(detail.style.overflow).toBe("hidden");
    expect(detail.style.textOverflow).toBe("ellipsis");
    expect(detail.style.fontFamily).toBe(CANVAS_MONO_FONT_STACK);
    expect(detail.style.fontSize).toBe("14px");
    expect(detail.style.fontWeight).toBe("500");
    expect(detail.style.lineHeight).toBe("18.2px");
    expect(detail.style.marginTop).toBe("3px");
    expect(detail.style.color).toBe("#5B6578");
    // Name block + detail sit in one centered flex column; the name's clamp
    // gave up lines to the detail's 3 + 18.2px reserve (56px slot of 21px name
    // lines — 17.5px × 1.2: 2 lines → 1).
    const slot = node.querySelector("[data-canvas-text-slot]") as HTMLElement;
    expect(slot.style.justifyContent).toBe("center");
    const label = node.querySelector(".interactive-canvas-object-label") as HTMLElement;
    expect(label.nextElementSibling).toBe(detail);
    expect(label.style.maxHeight).toBe("21px");
    expect(label.style.fontSize).toBe("17.5px");
    expect(label.style.color).toBe("#0F1E36");
    expect(label.style.fontWeight).toBe("600");
  });

  it("is absent when the box is too short for a name line plus the detail, and on stickies", () => {
    const container = stage(
      [
        shape({ detail: ":4820", geometry: { x: 0, y: 0, width: 200, height: 40 } }),
        shape({
          id: "n1",
          type: "sticky",
          style: { shape: "note" },
          text: "Body",
          detail: "never",
          color: "yellow",
          geometry: { x: 300, y: 0, width: 240, height: 200 },
        }),
      ],
      "schematic-light",
    );
    expect(container.querySelector("[data-canvas-text-detail]")).toBeNull();
    expect(container.textContent).not.toContain("never");
  });

  it("renders alone, without the gap, when the name is empty", () => {
    const node = objectNode(stage([shape({ text: "", detail: "detail only" })], "schematic-light"), "s1");
    expect(node.querySelector(".interactive-canvas-object-label")).toBeNull();
    const detail = node.querySelector("[data-canvas-text-detail]") as HTMLElement;
    expect(detail.textContent).toBe("detail only");
    expect(detail.style.marginTop).toBe("");
  });

  it("follows an icon's caption in the below band, which grows by the line", () => {
    const node = objectNode(stage([icon({ detail: "postgres 16" })], "schematic-dark"), "i1");
    const slot = node.querySelector('[data-canvas-text-slot="below"]') as HTMLElement;
    expect(slot.style.height).toBe(`${21 + 3 + 14 * 1.3}px`);
    const caption = slot.querySelector(".interactive-canvas-label-below-icon") as HTMLElement;
    expect(caption.textContent).toBe("Orders DB");
    expect(caption.style.color).toBe(resolveIconPaint("violet", canvasThemePreset("schematic-dark")).label);
    const detail = slot.querySelector("[data-canvas-text-detail]") as HTMLElement;
    expect(caption.nextElementSibling).toBe(detail);
    expect(detail.textContent).toBe("postgres 16");
    expect(detail.style.color).toBe("#8B93B5");
  });

  it("figjam paints a sans detail at 13px", () => {
    const detail = objectNode(stage([shape({ detail: ":4820" })]), "s1").querySelector(
      "[data-canvas-text-detail]",
    ) as HTMLElement;
    expect(detail.style.fontSize).toBe("13px");
    expect(detail.style.fontWeight).toBe("400");
    expect(detail.style.color).toBe("#5C5C5C");
  });
});

describe("live shape paint", () => {
  it("card shapes: card fill + ink border; figjam keeps the tint", () => {
    const dark = canvasThemePreset("schematic-dark");
    const card = objectNode(stage([shape()], "schematic-dark"), "s1");
    expect(card.style.background).toBe(dark.cardFill);
    expect(card.style.color).toBe(dark.textColor);
    // A whole-px border stays a CSS border; the rounded rect takes the
    // process radius (12px) inline, since it differs from shapeCornerRadiusPx.
    expect(card.style.borderWidth).toBe("2px");
    expect(card.style.borderRadius).toBe(`${dark.processCornerRadiusPx}px`);
    expect(card.querySelector("[data-canvas-shape-silhouette]")).toBeNull();
    cleanup();
    const tint = objectNode(stage([shape()]), "s1");
    expect(tint.style.background).toBe("#CDDFFF");
    expect(tint.style.borderColor).toBe("#1A5CDF");
    expect(tint.style.borderWidth).toBe("2px");
    // figjam's process radius equals shapeCornerRadiusPx: no inline radius.
    expect(tint.style.borderRadius).toBe("");
    expect(tint.querySelector("[data-canvas-shape-silhouette]")).toBeNull();
  });

  // The schematic presets' shape border is a whole 2px; a 1.5px override is
  // the fractional case.
  const FRACTIONAL_BORDER: CanvasStyle = { ...canvasThemePreset("schematic-light"), shapeBorderWidthPx: 1.5 };

  it("a fractional schematic border paints as an SVG stroke so it keeps its width (CSS borders snap to whole px)", () => {
    const node = objectNode(stage([shape()], FRACTIONAL_BORDER), "s1");
    expect(node.style.borderWidth).toBe("0px");
    const border = node.querySelector('[data-canvas-shape-silhouette="border"] rect') as SVGRectElement;
    expect(border.getAttribute("stroke")).toBe("#2F5BD3");
    expect(border.getAttribute("stroke-width")).toBe("1.5");
    expect(border.getAttribute("x")).toBe("0.75");
    expect(border.getAttribute("width")).toBe("238.5");
    // The rounded rect's 12px process radius, less half the stroke.
    expect(border.getAttribute("rx")).toBe("11.25");
    // The slot text no longer offsets by a CSS border.
    const slot = node.querySelector("[data-canvas-text-slot]") as HTMLElement;
    expect(slot.style.left).toBe("14px");
  });

  it("keeps predefined-process bars inside a stroked border", () => {
    const node = objectNode(
      stage([shape({ type: "predefined-process", style: { shape: "predefined-process" }, geometry: { x: 0, y: 0, width: 400, height: 64 } })], FRACTIONAL_BORDER),
      "s1",
    );
    const bars = [...node.querySelectorAll(".interactive-canvas-predefined-process-bar")] as HTMLElement[];
    expect(bars).toHaveLength(2);
    expect(bars[0]!.style.top).toBe("1.5px");
    expect(bars[0]!.style.left).toContain("calc(");
    expect(bars[1]!.style.right).toContain("calc(");
  });

  it("the decision diamond draws its true outline outside the figjam tint mode", () => {
    const decision = shape({ type: "decision", style: { shape: "diamond" }, geometry: { x: 0, y: 0, width: 200, height: 140 } });
    const outlined = objectNode(stage([decision], "schematic-light"), "s1");
    const polygon = outlined.querySelector('[data-canvas-shape-silhouette="diamond"] polygon') as SVGPolygonElement;
    expect(polygon.getAttribute("points")).toBe("100,0 200,70 100,140 0,70");
    expect(polygon.getAttribute("fill")).toBe("#FFFFFF");
    expect(polygon.getAttribute("stroke")).toBe("#2F5BD3");
    expect(outlined.style.clipPath).toBe("none");
    expect(outlined.style.borderWidth).toBe("0px");
    cleanup();
    const figjam = objectNode(stage([decision]), "s1");
    expect(figjam.querySelector("[data-canvas-shape-silhouette]")).toBeNull();
    expect(figjam.style.clipPath).toBe("");
  });
});

describe("live icons", () => {
  it("figjam draws the bare Nucleo glyph exactly as before", () => {
    const node = objectNode(stage([icon({ icon: "model", color: "red" })]), "i1");
    const svg = node.querySelector('[data-canvas-icon-glyph="model"]') as SVGSVGElement;
    expect(svg.getAttribute("viewBox")).toBe("0 0 18 18");
    expect(svg.getAttribute("stroke")).toBe("#D5322F");
    expect(svg.querySelector("[data-canvas-icon-fill-layer]")?.getAttribute("fill")).toBe("#FFD2CC");
    expect(node.querySelector("[data-canvas-icon-tile]")).toBeNull();
  });

  it("tile style: an ink tile, capped at iconTileMaxPx and centered, with the Tabler glyph inset in the tile glyph color", () => {
    const node = objectNode(stage([icon()], "schematic-light"), "i1");
    const body = node.querySelector("[data-canvas-icon-shape-body]") as HTMLElement;
    expect(body.getAttribute("data-canvas-icon-style")).toBe("tile");
    const tile = node.querySelector("[data-canvas-icon-tile]") as SVGRectElement;
    expect(tile.getAttribute("fill")).toBe("#6B4FC4");
    // The 64px box carries the 56px (iconTileMaxPx) tile, centered: 4px in on every side.
    expect(tile.getAttribute("width")).toBe("56");
    expect(tile.getAttribute("height")).toBe("56");
    expect(tile.getAttribute("x")).toBe("4");
    expect(tile.getAttribute("y")).toBe("4");
    expect(tile.getAttribute("rx")).toBe("3");
    const glyph = node.querySelector('[data-canvas-icon-glyph="database"]') as SVGSVGElement;
    expect(glyph.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(glyph.getAttribute("stroke")).toBe("#FFFFFF");
    expect(Number(glyph.getAttribute("stroke-width"))).toBeCloseTo(iconTileGlyphStrokeWidth(24), 10);
    expect(Number(glyph.getAttribute("x"))).toBeCloseTo(4 + 56 * 0.22, 10);
    const tabler = resolveIconGlyph("database", "tabler");
    expect(glyph.querySelectorAll("path").length).toBe(tabler.elements.filter((element) => element.kind === "path").length);
    // The caption band hangs 6px under the TILE (not the box), centered on it.
    const caption = node.querySelector('[data-canvas-text-slot="below"]') as HTMLElement;
    expect(caption.style.top).toBe(`${4 + 56 + 6}px`);
    expect(parseFloat(caption.style.left) + parseFloat(caption.style.width) / 2).toBeCloseTo(32, 10);
  });

  it("tints a large tile (auto fill) and caps its glyph at 56px, centered — live as static", () => {
    // The schematic presets cap tiles at 56px (solid); lift the cap so a
    // tile can grow past iconTileSolidMaxPx and take the tint.
    const style: CanvasStyle = { ...canvasThemePreset("schematic-light"), iconTileMaxPx: 240 };
    const node = objectNode(stage([icon({ geometry: { x: 0, y: 0, width: 170, height: 170 } })], style), "i1");
    const tile = node.querySelector("[data-canvas-icon-tile]") as SVGRectElement;
    expect(tile.getAttribute("fill")).toBe(resolveIconTilePaint("violet", style, 170).tileFill);
    expect(tile.getAttribute("stroke")).toBe(style.palette.violet);
    // The tint outline is the shape border width (2px), painted inside the tile edge.
    expect(tile.getAttribute("stroke-width")).toBe("2");
    expect(tile.getAttribute("x")).toBe("1");
    const glyph = node.querySelector('[data-canvas-icon-glyph="database"]') as SVGSVGElement;
    expect(glyph.getAttribute("width")).toBe("56");
    expect(glyph.getAttribute("x")).toBe("57");
    expect(glyph.getAttribute("stroke")).toBe(style.palette.violet);
  });

  it("outlines a white tile on a light board and fills brand glyphs", () => {
    const container = stage([icon({ color: "white" }), icon({ id: "i2", icon: "brand-docker", geometry: { x: 200, y: 0, width: 64, height: 64 } })], "schematic-light");
    const white = objectNode(container, "i1").querySelector("[data-canvas-icon-tile]") as SVGRectElement;
    expect(white.getAttribute("fill")).toBe("#FFFFFF");
    expect(white.getAttribute("stroke")).toBe("#0F1E36");
    expect(white.getAttribute("stroke-width")).toBe("1");
    const brand = objectNode(container, "i2").querySelector('[data-canvas-icon-glyph="brand-docker"]') as SVGSVGElement;
    expect(brand.getAttribute("fill")).toBe("#FFFFFF");
    expect(brand.getAttribute("stroke")).toBe("none");
  });
});
