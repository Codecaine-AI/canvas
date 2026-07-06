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
    label: `${id} label`,
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

  it("renders the label BELOW the glyph, matching the chip-icon/person convention", () => {
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

  it("falls back to a neutral stroke glyph when no explicit color is set (bbox tier — no chip background)", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(<InteractiveCanvasViewer document={iconDocument(ICON_OBJECTS)} />);
      const svg = container.querySelector('[data-canvas-object-id="icon-cpu"] [data-canvas-icon-glyph="cpu"]');
      expect(svg?.getAttribute("fill")).toBe("none");
      expect(svg?.getAttribute("stroke")).toBeTruthy();
      // No filled background rect behind the glyph when the object has no explicit fill/stroke.
      expect(svg?.querySelector("rect")).toBeNull();
    });
  });

  it("honors an explicit stroke/fill override (hasExplicitColor precedent shared with chip-icon/person)", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const coloredObject: InteractiveCanvasObject = {
        ...iconObject("icon-colored", "shield", 0),
        style: { shape: "icon", stroke: "#123456", fill: "#abcdef" },
      };
      const { container } = render(<InteractiveCanvasViewer document={iconDocument([coloredObject])} />);
      const svg = container.querySelector('[data-canvas-object-id="icon-colored"] [data-canvas-icon-glyph="shield"]');
      expect(svg?.getAttribute("stroke")).toBe("#123456");
      const backgroundRect = svg?.querySelector("rect");
      expect(backgroundRect?.getAttribute("fill")).toBe("#abcdef");
    });
  });
});
