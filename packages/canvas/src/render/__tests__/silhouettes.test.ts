import { describe, expect, it } from "bun:test";
import { renderDocumentToSvg } from "../static-svg";
import { resolveShapeColors } from "../../theme/palette";
import { FIRST_USE_COLORS } from "../../state/schema/object-defaults";
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
  return renderDocumentToSvg(shapeDocument(type), { background: "transparent" }).svg;
}

const COLORS = resolveShapeColors(FIRST_USE_COLORS.shape);

describe("custom silhouettes", () => {
  it("predefined-process: 5px-radius rect plus two inner bars", () => {
    const svg = render("predefined-process");
    // Corner radius 5 minus the half-stroke inset → rx 3; no 8px-track rect.
    expect(count(svg, 'rx="3"')).toBe(1);
    expect(svg).not.toContain('rx="6"');
    // Two 4px-wide border-colored bars inset 0.047 of the 172px padding box.
    expect(count(svg, `width="4" height="112" fill="${COLORS.border}"`)).toBe(2);
    expect(svg).toContain('x="12.08"');
    expect(svg).toContain('x="163.92"');
  });

  it("stays deterministic and keeps rendering the base tiers elsewhere", () => {
    for (const type of ["predefined-process"] as const) {
      expect(render(type)).toBe(render(type));
    }
    // A plain process still renders the base rounded rect.
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
      { background: "transparent" },
    ).svg;
    expect(process).toContain('rx="6"');
  });
});
