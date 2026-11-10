import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { CanvasStage } from "../CanvasStage";
import { renderDocumentToSvg } from "../../render/static-svg";
import { formatHex, parseColor } from "../../theme/color-math";
import { canvasThemePreset, type CanvasStyle, type CanvasThemeId } from "../../theme/canvas-style";
import { resolveIconPaint, resolveIconTilePaint, resolveStickyPaint, resolveShapePaint } from "../../theme/palette";
import { resolveIconGlyph } from "../../objects/shapes/icon/icon-glyphs";
import { iconTileGlyphStrokeWidth } from "../../objects/shapes/icon/icon-tile";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";

afterEach(() => {
  cleanup();
});

/**
 * The LIVE stage's shape / icon rendering under the theme model — the same
 * decisions the static renderer makes (render/__tests__/
 * static-svg-shapes-icons.test.ts pins those). A stored detail never paints.
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

describe("a stored detail never paints live: a node shows its name only", () => {
  it("a center slot shows the name alone, with the whole slot for its lines", () => {
    const node = objectNode(stage([shape({ detail: "Function\nCalling LLM" })], "schematic-light"), "s1");
    expect(node.querySelector("[data-canvas-text-detail]")).toBeNull();
    expect(node.textContent).not.toContain("Calling");
    const label = node.querySelector(".interactive-canvas-object-label") as HTMLElement;
    expect(label.nextElementSibling).toBeNull();
    // The 56px slot holds two 21px name lines (17.5px × 1.2), nothing reserved under them.
    expect(label.style.maxHeight).toBe("42px");
    expect(label.style.fontSize).toBe("17.5px");
    expect(label.style.color).toBe("#1F1F1F");
    expect(label.style.fontWeight).toBe("600");
  });

  it("an icon's below band holds the caption only, and a detail-only node paints no text", () => {
    const container = stage(
      [icon({ detail: "postgres 16" }), shape({ id: "s2", text: "", detail: "detail only", geometry: { x: 300, y: 0, width: 240, height: 80 } })],
      "schematic-dark",
    );
    const slot = objectNode(container, "i1").querySelector('[data-canvas-text-slot="below"]') as HTMLElement;
    expect(slot.style.height).toBe("21px");
    const caption = slot.querySelector(".interactive-canvas-label-below-icon") as HTMLElement;
    expect(caption.textContent).toBe("Orders DB");
    expect(caption.style.color).toBe(resolveIconPaint("violet", canvasThemePreset("schematic-dark")).label);
    expect(caption.nextElementSibling).toBeNull();
    expect(objectNode(container, "s2").querySelector("[data-canvas-text-slot]")).toBeNull();
    expect(container.querySelector("[data-canvas-text-detail]")).toBeNull();
    expect(container.textContent).not.toContain("postgres 16");
    expect(container.textContent).not.toContain("detail only");
  });
});

describe("live shape paint", () => {
  it("card shapes: card fill + ink border; figjam keeps the tint", () => {
    const dark = canvasThemePreset("schematic-dark");
    const card = objectNode(stage([shape()], "schematic-dark"), "s1");
    expect(card.style.background).toBe(dark.cardFill);
    expect(card.style.color).toBe(dark.textColor);
    // A whole-px border stays a CSS border; the process radius equals
    // shapeCornerRadiusPx (2px), so the rounded rect takes no inline radius.
    expect(card.style.borderWidth).toBe("2px");
    expect(dark.processCornerRadiusPx).toBe(dark.shapeCornerRadiusPx);
    expect(card.style.borderRadius).toBe("");
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
    expect(border.getAttribute("stroke")).toBe("#0B6E99");
    expect(border.getAttribute("stroke-width")).toBe("1.5");
    expect(border.getAttribute("x")).toBe("0.75");
    expect(border.getAttribute("width")).toBe("238.5");
    // The rounded rect's 2px process radius, less half the stroke.
    expect(border.getAttribute("rx")).toBe("1.25");
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
    expect(polygon.getAttribute("fill")).toBe(resolveShapePaint("blue", canvasThemePreset("schematic-light")).fill);
    expect(polygon.getAttribute("stroke")).toBe("#0B6E99");
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

  it("tile style: a node-paint tile, capped at iconTileMaxPx and centered, with the Tabler glyph inset in the ink", () => {
    const node = objectNode(stage([icon()], "schematic-light"), "i1");
    const body = node.querySelector("[data-canvas-icon-shape-body]") as HTMLElement;
    expect(body.getAttribute("data-canvas-icon-style")).toBe("tile");
    const tile = node.querySelector("[data-canvas-icon-tile]") as SVGRectElement;
    // The violet node's pastel fill (stage C: the lighter L 0.915 step Ford picked from mockup2), edged in its ink.
    expect(tile.getAttribute("fill")).toBe("#E6DDFF");
    expect(tile.getAttribute("stroke")).toBe("#6940A5");
    // The node border width (stage B round 4: at 1.5px tiles read thinner than the nodes beside them).
    expect(tile.getAttribute("stroke-width")).toBe("2");
    // The 64px box carries the 56px (iconTileMaxPx) tile, centered: 4px in on every side, the edge inside it.
    expect(tile.getAttribute("width")).toBe("54");
    expect(tile.getAttribute("height")).toBe("54");
    expect(tile.getAttribute("x")).toBe("5");
    expect(tile.getAttribute("y")).toBe("5");
    // The 2px outer corner, less half the edge.
    expect(tile.getAttribute("rx")).toBe("1");
    const glyph = node.querySelector('[data-canvas-icon-glyph="database"]') as SVGSVGElement;
    expect(glyph.getAttribute("viewBox")).toBe("0 0 24 24");
    // The ink held at 4.5:1 on the tile.
    expect(glyph.getAttribute("stroke")).toBe("#633C9B");
    expect(Number(glyph.getAttribute("stroke-width"))).toBeCloseTo(iconTileGlyphStrokeWidth(24), 10);
    expect(Number(glyph.getAttribute("x"))).toBeCloseTo(4 + 56 * 0.2, 10);
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

  it("draws a white tile as the white node and fills brand glyphs in their brand color", () => {
    const container = stage([icon({ color: "white" }), icon({ id: "i2", icon: "brand-docker", geometry: { x: 200, y: 0, width: 64, height: 64 } })], "schematic-light");
    const white = objectNode(container, "i1").querySelector("[data-canvas-icon-tile]") as SVGRectElement;
    expect(white.getAttribute("fill")).toBe("#FDFDFD");
    expect(white.getAttribute("stroke")).toBe("#666562");
    expect(white.getAttribute("stroke-width")).toBe("2");
    const brand = objectNode(container, "i2").querySelector('[data-canvas-icon-glyph="brand-docker"]') as SVGSVGElement;
    // Docker's Simple Icons color in its optical box on the neutral brand tile, not on the violet tile.
    expect(brand.getAttribute("fill")).toBe("#2496ED");
    expect(brand.getAttribute("stroke")).toBe("none");
    expect(brand.getAttribute("viewBox")).toBe(resolveIconGlyph("brand-docker", "tabler").viewBox.join(" "));
    const brandTile = objectNode(container, "i2").querySelector("[data-canvas-icon-tile]") as SVGRectElement;
    expect(brandTile.getAttribute("fill")).toBe("#FDFDFD");
    // The white node's full gray edge (stage B round 4: the 55% edge read lighter than the colored tiles).
    expect(brandTile.getAttribute("stroke")).toBe("#666562");
  });
});


describe("note code-chip paint parity", () => {
  it.each(["schematic-light", "schematic-dark"] as const)("uses the card paint in the stage and export (%s)", (theme) => {
    const style = canvasThemePreset(theme);
    const note = shape({ type: "sticky", color: "yellow", text: "run `deploy` now", style: { shape: "note" } });
    const container = stage([note], style);
    const chip = objectNode(container, note.id).querySelector("code");
    if (!(chip instanceof HTMLElement)) throw new Error("note has no code chip");
    const paint = resolveStickyPaint("yellow", style);
    expect(chip.style.background).toBe(paint.codeChip!);
    const { svg } = renderDocumentToSvg({ schemaVersion: 1, id: "note-paint", mode: "diagram", objects: [note], connections: [] }, { canvasStyle: style });
    const chipColor = parseColor(paint.codeChip!)!;
    expect(svg).toContain(`fill="${formatHex(chipColor)}" fill-opacity="${chipColor.a}"`);
    expect(chip.textContent).toBe("deploy");
    expect(svg).toContain(">deploy</tspan>");
  });

  it("colors each code span by its kind in the stage and the export, as the docs viewer does", () => {
    // Stage C: Ford picked the docs viewer's typed chips for note code (mockup2 change 2).
    const style = canvasThemePreset("schematic-light");
    const note = shape({ type: "sticky", color: "blue", text: "`abandonRun()` writes `cli/src/run.ts` and `RawRecord`", geometry: { x: 0, y: 0, width: 240, height: 160 }, style: { shape: "note" } });
    const container = stage([note], style);
    const chips = [...objectNode(container, note.id).querySelectorAll("code")] as HTMLElement[];
    const paint = resolveStickyPaint("blue", style);
    const expected = [paint.codeText!.call, paint.codeText!.path, paint.codeText!.type];
    expect(chips.map((chip) => formatHex(parseColor(chip.style.color)!))).toEqual(expected);
    const { svg } = renderDocumentToSvg({ schemaVersion: 1, id: "note-kinds", mode: "diagram", objects: [note], connections: [] }, { canvasStyle: style });
    for (const [text, color] of [["abandonRun()", expected[0]], ["cli/src/run.ts", expected[1]], ["RawRecord", expected[2]]] as const) {
      expect(svg).toMatch(new RegExp(`fill="${color}"[^>]*>${text.replace(/[().]/g, "\\$&")}</tspan>`));
    }
    // The dark card keeps code in the body text color.
    const dark = canvasThemePreset("schematic-dark");
    const darkChip = objectNode(stage([note], dark), note.id).querySelector("code") as HTMLElement;
    expect(darkChip.style.color).toBe("");
  });
});
