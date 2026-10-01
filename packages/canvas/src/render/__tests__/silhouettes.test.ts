import { describe, expect, it } from "bun:test";
import { renderDocumentToSvg } from "../static-svg";
import { resolveShapeColors } from "../../theme/palette";
import { FIRST_USE_COLORS } from "../../state/schema/object-defaults";
import { FIGJAM_CANVAS_STYLE } from "../../theme/canvas-style";
import type {
  CanvasObjectStyle,
  InteractiveCanvasDocument,
  InteractiveCanvasObjectType,
} from "../../state/schema";

/** Occurrences of a literal substring. */
function count(haystack: string, needle: string): number {
  let total = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    total += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return total;
}

function shapeDocument(type: InteractiveCanvasObjectType): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: `silhouette-${type}`,
    mode: "diagram",
    objects: [
      {
        id: "o1",
        type,
        text: "",
        geometry: { x: 0, y: 0, width: 180, height: 120 },
        style: { shape: type as CanvasObjectStyle["shape"] },
      },
    ],
    connections: [],
  };
}

function render(type: InteractiveCanvasObjectType): string {
  return renderDocumentToSvg(shapeDocument(type), { background: "transparent", canvasStyle: FIGJAM_CANVAS_STYLE }).svg;
}

const COLORS = resolveShapeColors(FIRST_USE_COLORS.shape);

describe("custom silhouettes", () => {
  it("predefined-process: shape-radius rect plus two inner bars", () => {
    const svg = render("predefined-process");
    // Figjam shape corner radius 2 minus the half-stroke inset (2px stroke) →
    // rx 1, on exactly one rounded rect (the bars carry no radius).
    expect(count(svg, "rx=")).toBe(1);
    expect(count(svg, 'rx="1"')).toBe(1);
    expect(count(svg, 'stroke-width="2"')).toBe(1);
    // Two 4px-wide border-colored bars inset 0.047 of the 176px padding box.
    expect(count(svg, `width="4" height="116" fill="${COLORS.border}"`)).toBe(2);
    expect(svg).toContain('x="10.27"');
    expect(svg).toContain('x="165.73"');
  });

  it("stays deterministic and keeps rendering the base tiers elsewhere", () => {
    for (const type of ["predefined-process"] as const) {
      expect(render(type)).toBe(render(type));
    }
    // A plain process still renders the base rounded rect (figjam 2px shape
    // radius inset by half the 2px stroke).
    const process = renderDocumentToSvg(
      {
        schemaVersion: 1,
        id: "base-tier",
        mode: "diagram",
        objects: [
          {
            id: "p1",
            type: "process",
            text: "",
            geometry: { x: 0, y: 0, width: 180, height: 120 },
            style: { shape: "rounded-rect" },
          },
        ],
        connections: [],
      },
      { background: "transparent", canvasStyle: FIGJAM_CANVAS_STYLE },
    ).svg;
    expect(process).toContain('rx="1" fill=');
  });
});
