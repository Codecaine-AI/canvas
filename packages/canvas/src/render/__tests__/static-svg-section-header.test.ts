import { describe, expect, it } from "bun:test";
import { renderDocumentToSvg, renderSceneToSvg } from "../static-svg";
import { objectPaintedBounds } from "../painted-bounds";
import { renderBoardView, renderSectionView } from "../views";
import { canvasThemePreset, FIGJAM_CANVAS_STYLE } from "../../theme/canvas-style";
import { resolveSectionPaint } from "../../theme/palette";
import { sectionTitleChipWorldRect } from "../../objects/section/title-chip-geometry";
import { titleChipLayout } from "../../objects/section/title-chip-layout";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";
// The production rasterizer: every emitted header must stay rasterizer-safe.
import { rasterizeSvgToPng } from "../../../../canvas-agent/src/service/render";

/**
 * Section headers in the static renderer against the shared chip layout
 * (objects/section/title-chip-layout.ts): the chip paints exactly the box
 * hit-testing and text-fit reason about, clips its contents the way the live
 * chip's `overflow: hidden` does, and counts as painted whenever it carries a
 * title, an icon, or a detail.
 */

const LIGHT = canvasThemePreset("schematic-light");

function section(partial: Partial<InteractiveCanvasObject> = {}): InteractiveCanvasObject {
  return {
    id: "zone",
    type: "section",
    text: "CLI",
    color: "teal",
    parentId: null,
    geometry: { x: 0, y: 0, width: 100, height: 300 },
    style: { shape: "section" },
    ...partial,
  } as InteractiveCanvasObject;
}

function documentOf(objects: InteractiveCanvasObject[]): InteractiveCanvasDocument {
  return { schemaVersion: 1, id: "header-fixture", mode: "diagram", objects, connections: [] };
}

function rectWithFill(svg: string, fill: string): { x: number; width: number } {
  const match = new RegExp(`<rect x="([^"]+)" y="[^"]+" width="([^"]+)"[^>]*fill="${fill}"`).exec(svg);
  expect(match).not.toBeNull();
  return { x: Number(match![1]), width: Number(match![2]) };
}

describe("static header = the box hits and text-fit use", () => {
  it("a figjam chip with a detail paints the measured box hit-testing tests against", () => {
    const cli = section({ detail: "cli.ts" });
    const svg = renderDocumentToSvg(documentOf([cli]), { background: "transparent", padding: 0, canvasStyle: FIGJAM_CANVAS_STYLE }).svg;
    const chipFill = resolveSectionPaint("teal", 1, FIGJAM_CANVAS_STYLE).chipFill;
    const body = rectWithFill(svg, chipFill);
    const hit = sectionTitleChipWorldRect(cli, 1, FIGJAM_CANVAS_STYLE);
    // The floating body strokes its 1.5px border inside the box.
    expect(body.x - 0.75).toBeCloseTo(hit.x, 1);
    expect(body.width + 1.5).toBeCloseTo(hit.width, 1);
    expect(svg).toContain(">CLI</text>");
    expect(svg).toContain(">cli.ts</text>");
  });
});

describe("static header clips to the chip", () => {
  const servers = section({ text: "Servers", icon: "server", geometry: { x: 0, y: 0, width: 120, height: 300 } });
  const scene = (bounds = { x: -10, y: -10, width: 200, height: 400 }) =>
    renderSceneToSvg(
      documentOf([servers]),
      { bounds, objects: [servers], connections: [], obstacles: [servers], chipZoom: 0.05 },
      { canvasStyle: LIGHT, background: "transparent" },
    ).svg;

  it("at zoom 0.05 a 120px schematic section keeps its icon inside the chip and paints no forced character", () => {
    const layout = titleChipLayout(servers, LIGHT, 0.05);
    expect(layout.box.width).toBeCloseTo(19, 9);
    const svg = scene();
    // No title run: the 19px chip has no room for even the ellipsis.
    expect(svg).not.toContain("<text");
    // The icon paints inside a clip to the chip's padding box (inside the 1.5px right/bottom edges of the 25.5px pinned box).
    const clip = /<clipPath id="([^"]+)"><rect x="0" y="0" width="([^"]+)" height="([^"]+)"\/><\/clipPath>/.exec(svg);
    expect(clip).not.toBeNull();
    expect(Number(clip![2])).toBeCloseTo(17.5, 2);
    expect(Number(clip![3])).toBeCloseTo(24, 2);
    expect(svg).toContain(`<g clip-path="url(#${clip![1]})">`);
    expect(() => rasterizeSvgToPng(svg)).not.toThrow();
  });

  it("stays rasterizer-safe when the chip lies outside the camera", () => {
    expect(() => rasterizeSvgToPng(scene({ x: 500, y: 500, width: 100, height: 100 }))).not.toThrow();
  });

  it("an unclipped chip emits no clip (existing headers render as before)", () => {
    const svg = renderDocumentToSvg(documentOf([section({ text: "Plenty of room", geometry: { x: 0, y: 0, width: 600, height: 300 } })]), {
      canvasStyle: LIGHT,
    }).svg;
    expect(svg).not.toContain("clip-path");
  });
});

describe("headers with an empty title but an icon or detail still count as painted", () => {
  const headerOnly = section({ text: "", icon: "server", detail: "port 80", geometry: { x: 0, y: 0, width: 1000, height: 20 } });

  it("objectPaintedBounds includes the chip", () => {
    const painted = objectPaintedBounds(headerOnly, LIGHT);
    const chip = sectionTitleChipWorldRect(headerOnly, 1, LIGHT);
    expect(painted.y + painted.height).toBeGreaterThanOrEqual(chip.y + chip.height);
  });

  it("board and section views frame the zoom-scaled chip", () => {
    for (const view of [
      renderBoardView(documentOf([headerOnly]), { width: 100, canvasStyle: LIGHT }),
      renderSectionView(documentOf([headerOnly]), "zone", { width: 100, canvasStyle: LIGHT }),
    ]) {
      const chip = sectionTitleChipWorldRect(headerOnly, 100 / view.camera.width, LIGHT);
      expect(view.camera.y + view.camera.height).toBeGreaterThanOrEqual(chip.y + chip.height - 0.5);
      expect(view.camera.x + view.camera.width).toBeGreaterThanOrEqual(chip.x + chip.width - 0.5);
    }
  });
});

describe("a cut section detail paints its ellipsis in the title font", () => {
  it("like CSS text-overflow on the chip: the title's weight and tracking, not the detail's", () => {
    const zone = section({ text: "Bun services", detail: "127.0.0.1", icon: "brand-bun", geometry: { x: 0, y: 0, width: 200, height: 200 } } as Partial<InteractiveCanvasObject>);
    const svg = renderDocumentToSvg(documentOf([zone]), { background: "transparent", canvasStyle: LIGHT }).svg;
    const layout = titleChipLayout(zone, LIGHT);
    const ellipsis = /<text ([^>]*)>…<\/text>/.exec(svg);
    expect(ellipsis).not.toBeNull();
    expect(ellipsis![1]).toContain('font-weight="600"');
    expect(layout.truncated).toBe(true);
    expect(Number(/letter-spacing="([^"]+)"/.exec(ellipsis![1])![1])).toBeCloseTo(1.12, 8);
  });
});
