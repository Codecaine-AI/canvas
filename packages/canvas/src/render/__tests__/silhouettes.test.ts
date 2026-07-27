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

describe("custom flowchart silhouettes", () => {
  it("document: wavy-bottom path, no rounded-rect fallback", () => {
    const svg = render("document");
    // documentWavyPath at 180×120: shoulder 0.82·120 = 98.4, crest 0.96·120 = 115.2.
    expect(svg).toContain('d="M 0 0 L 180 0 L 180 98.4');
    expect(svg).toContain(`fill="${COLORS.fill}"`);
    expect(svg).toContain(`stroke="${COLORS.border}"`);
    expect(svg).toContain('stroke-linejoin="round"');
    expect(svg).not.toContain("<rect");
  });

  it("document-stack: two offset pages with a dimmed back page", () => {
    const svg = render("document-stack");
    expect(count(svg, "<path ")).toBe(2);
    expect(count(svg, 'opacity="0.82"')).toBe(1);
    // Front page offset by 0.06 of the bbox: 10.8 / 7.2.
    expect(svg).toContain("M 10.8 7.2");
    expect(svg).not.toContain("<rect");
  });

  it("database: curved body plus lid ellipse", () => {
    const svg = render("database");
    // Lid ellipse at the def's proportions: cx 90, cy 0.22·120 = 26.4, rx 0.46·180 = 82.8.
    expect(svg).toContain('<ellipse cx="90" cy="26.4" rx="82.8" ry="14.4"');
    expect(count(svg, "<path ")).toBe(1);
    expect(svg).not.toContain("<rect");
  });

  it("folder: tab-notch outline", () => {
    const svg = render("folder");
    // Tab: width 0.38·180 = 68.4, top 0.08·120 = 9.6, bottom 0.24·120 = 28.8.
    expect(svg).toContain('d="M 0 9.6 H 68.4 V 28.8 H 180 V 120 H 0 Z"');
    expect(svg).not.toContain("<rect");
  });

  it("cylinder-horizontal: capped body plus two open side curves", () => {
    const svg = render("cylinder-horizontal");
    expect(count(svg, "<path ")).toBe(3);
    // The side curves are unfilled strokes.
    expect(count(svg, 'fill="none"')).toBe(2);
    expect(svg).not.toContain("<rect");
  });

  it("internal-storage: base rounded rect plus the inset L divider rules", () => {
    const svg = render("internal-storage");
    // The base trim keeps the bbox tier's 8px track (rx 6 at the 4px stroke).
    expect(count(svg, 'rx="6"')).toBe(1);
    // Two 2px border-colored rules inside the border: vertical at 15% of the
    // 172px padding box (4 + 0.15·172 = 29.8), horizontal at 4 + 0.15·112 = 20.8.
    expect(svg).toContain(`<rect x="29.8" y="4" width="2" height="112" fill="${COLORS.border}"/>`);
    expect(svg).toContain(`<rect x="4" y="20.8" width="172" height="2" fill="${COLORS.border}"/>`);
  });

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

  it("page-corner: folded-corner fill with the fold edge left unstroked", () => {
    const svg = render("page-corner");
    expect(count(svg, "<path ")).toBe(2);
    expect(svg).not.toContain("<rect");
    // Fill covers the fold polygon (inset rect 2..178 × 2..118; fold at
    // 2 + 0.76·176 = 135.76 and 2 + 0.24·116 = 29.84).
    expect(svg).toContain(
      `<path d="M 2 2 L 135.76 2 L 178 29.84 L 178 118 L 2 118 Z" fill="${COLORS.fill}"/>`,
    );
    // The border path is open and skips the diagonal (the live clip-path cuts
    // the CSS border along the fold).
    expect(svg).toContain(
      `<path d="M 178 29.84 L 178 118 L 2 118 L 2 2 L 135.76 2" fill="none" stroke="${COLORS.border}"`,
    );
  });

  it("stays deterministic and keeps rendering the base tiers elsewhere", () => {
    for (const type of [
      "document",
      "database",
      "folder",
      "document-stack",
      "cylinder-horizontal",
      "internal-storage",
      "page-corner",
      "predefined-process",
    ] as const) {
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
