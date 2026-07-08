import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { InteractiveCanvasViewer } from "../../editor/InteractiveCanvasViewer";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";

afterEach(() => {
  cleanup();
});

/**
 * jsdom/happy-dom performs no real layout, so getBoundingClientRect() on the
 * measured `.interactive-canvas-shell` element returns all-zero by default —
 * same mock pattern as b1-shapes-render.test.tsx / w2-render-smoke.test.tsx.
 */
function withMeasuredShell<T>(width: number, height: number, run: () => T): T {
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if ((this as HTMLElement).classList.contains("interactive-canvas-shell")) {
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width,
        height,
        right: width,
        bottom: height,
        toJSON: () => ({}),
      } as DOMRect;
    }
    return originalRect.call(this);
  };
  try {
    return run();
  } finally {
    HTMLElement.prototype.getBoundingClientRect = originalRect;
  }
}

const SCREEN = { width: 1600, height: 900 };

function iconObject(id: string, icon: string, index: number): InteractiveCanvasObject {
  return {
    id,
    type: "icon",
    text: `${id} label`,
    icon: icon as InteractiveCanvasObject["icon"],
    geometry: { x: (index % 6) * 160, y: Math.floor(index / 6) * 160, width: 120, height: 120 },
    style: { shape: "icon" },
  };
}

const ICON_OBJECTS: InteractiveCanvasObject[] = [
  iconObject("icon-cpu", "cpu", 0),
  iconObject("icon-database", "database", 1),
  iconObject("icon-globe", "globe", 2),
];

function iconDocument(objects: InteractiveCanvasObject[]): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "icon-shape-smoke",
    title: "Wave C icon shape smoke",
    mode: "diagram",
    size: { width: 1600, height: 900 },
    viewport: { x: 0, y: 0, zoom: 1 },
    objects,
    connections: [],
  } as InteractiveCanvasDocument;
}

function expectGlyphFillAndInk(svg: Element | null, fill: string, stroke: string) {
  expect(svg).toBeTruthy();
  const glyphSvg = svg as SVGSVGElement;
  expect(glyphSvg.getAttribute("fill")).toBe("none");
  expect(glyphSvg.getAttribute("stroke")).toBe(stroke);
  expect(glyphSvg.querySelector("rect")).toBeNull();

  const fillLayer = glyphSvg.querySelector("[data-canvas-icon-fill-layer]");
  expect(fillLayer).toBeTruthy();
  expect(fillLayer?.getAttribute("fill")).toBe(fill);
  expect(fillLayer?.getAttribute("stroke")).toBe("none");
}

describe("Wave C render smoke: the `icon` object type", () => {
  it("renders IconShapeBody for each sampled glyph (cpu/database/globe)", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(<InteractiveCanvasViewer document={iconDocument(ICON_OBJECTS)} />);
      for (const object of ICON_OBJECTS) {
        const node = container.querySelector(`[data-canvas-object-id="${object.id}"]`);
        expect(node).toBeTruthy();
        const body = node?.querySelector("[data-canvas-icon-shape-body]");
        expect(body).toBeTruthy();
        expect(body?.getAttribute("data-canvas-icon-id")).toBe(object.icon as string);
        const glyphSvg = body?.querySelector(`[data-canvas-icon-glyph="${object.icon}"]`);
        expect(glyphSvg).toBeTruthy();
      }
    });
  });

  it("renders the label BELOW the glyph", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(<InteractiveCanvasViewer document={iconDocument(ICON_OBJECTS)} />);
      const node = container.querySelector('[data-canvas-object-id="icon-cpu"]');
      const label = node?.querySelector(".interactive-canvas-label-below-icon");
      expect(label?.textContent).toBe("icon-cpu label");
      // No plain (non-below-icon) label span should also render for icon shapes.
      const plainLabel = node?.querySelector(".interactive-canvas-object-label:not(.interactive-canvas-label-below-icon)");
      expect(plainLabel).toBeNull();
    });
  });

  it("applies the interactive-canvas-object-icon class", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(<InteractiveCanvasViewer document={iconDocument(ICON_OBJECTS)} />);
      const node = container.querySelector('[data-canvas-object-id="icon-cpu"]') as HTMLElement | null;
      expect(node?.className.trim()).toBe("interactive-canvas-object interactive-canvas-object-icon");
    });
  });

  it("sizes the glyph svg to the icon body without fixed pixel attributes", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(<InteractiveCanvasViewer document={iconDocument(ICON_OBJECTS)} />);
      const svg = container.querySelector('[data-canvas-object-id="icon-cpu"] [data-canvas-icon-glyph="cpu"]') as
        | SVGSVGElement
        | null;
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute("width")).toBeNull();
      expect(svg?.getAttribute("height")).toBeNull();
      expect(svg?.style.width).toBe("100%");
      expect(svg?.style.height).toBe("100%");
      expect(svg?.getAttribute("preserveAspectRatio")).toBeNull();
    });
  });

  it("renders the default (gray) pick as glyph-interior fill + saturated stroke (P1/D13 — no fixed colors)", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(<InteractiveCanvasViewer document={iconDocument(ICON_OBJECTS)} />);
      const svg = container.querySelector('[data-canvas-object-id="icon-cpu"] [data-canvas-icon-glyph="cpu"]');
      // gray shape cells: ink #757575 strokes the glyph, fill #E6E6E6 paints glyph interiors.
      expectGlyphFillAndInk(svg, "#E6E6E6", "#757575");
    });
  });

  it("renders every pick as glyph-interior fill + ink stroke", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const softObject: InteractiveCanvasObject = {
        ...iconObject("icon-blue", "shield", 0),
        color: "blue",
      };
      const boldObject: InteractiveCanvasObject = {
        ...iconObject("icon-bold", "gear", 1),
        color: "red",
      };
      const { container } = render(
        <InteractiveCanvasViewer document={iconDocument([softObject, boldObject])} />,
      );
      const softSvg = container.querySelector('[data-canvas-object-id="icon-blue"] [data-canvas-icon-glyph="shield"]');
      expectGlyphFillAndInk(softSvg, "#C2E5FF", "#0D99FF");
      const boldSvg = container.querySelector('[data-canvas-object-id="icon-bold"] [data-canvas-icon-glyph="gear"]');
      expectGlyphFillAndInk(boldSvg, "#FFC7C2", "#F24822");
    });
  });

  it("skips the fill layer for all-open line-art icons", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const lineArtObject = iconObject("icon-code", "code", 0);
      const closedObject = iconObject("icon-cpu-closed", "cpu", 1);
      const { container } = render(
        <InteractiveCanvasViewer document={iconDocument([lineArtObject, closedObject])} />,
      );

      const lineArtSvg = container.querySelector('[data-canvas-object-id="icon-code"] [data-canvas-icon-glyph="code"]');
      expect(lineArtSvg).toBeTruthy();
      expect(lineArtSvg?.querySelector("[data-canvas-icon-fill-layer]")).toBeNull();
      expect(lineArtSvg?.querySelector("[data-canvas-icon-ink-layer]")).toBeTruthy();

      const closedSvg = container.querySelector('[data-canvas-object-id="icon-cpu-closed"] [data-canvas-icon-glyph="cpu"]');
      expect(closedSvg).toBeTruthy();
      expect(closedSvg?.querySelector("[data-canvas-icon-fill-layer]")).toBeTruthy();
      expect(closedSvg?.querySelector("[data-canvas-icon-ink-layer]")).toBeTruthy();
    });
  });
});
