import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { InteractiveCanvasViewer } from "../viewer/InteractiveCanvasViewer";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";

afterEach(() => {
  cleanup();
});

/**
 * jsdom/happy-dom performs no real layout, so getBoundingClientRect() on the
 * measured `.interactive-canvas-shell` element returns all-zero by default —
 * same mock pattern as w2-render-smoke.test.tsx / viewer-view-crop.test.tsx.
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

/**
 * One object per native shape type (default sizes from the implementation
 * brief), laid out on a simple grid. `style.shape` mirrors `type` the same way
 * `shapeForType` (state/schema/object-defaults.ts) writes it for placed objects.
 */
function shapeObject(
  id: string,
  type: InteractiveCanvasObject["type"],
  width: number,
  height: number,
  index: number,
  extra: Partial<InteractiveCanvasObject> = {},
): InteractiveCanvasObject {
  return {
    id,
    type,
    text: `${id} label`,
    geometry: { x: (index % 6) * 220, y: Math.floor(index / 6) * 220, width, height },
    style: { shape: type as NonNullable<InteractiveCanvasObject["style"]>["shape"] },
    ...extra,
  };
}

const SHAPE_OBJECTS: InteractiveCanvasObject[] = [
  shapeObject("ellipse-1", "ellipse", 160, 120, 0),
  shapeObject("triangle-up", "triangle", 140, 120, 1),
  shapeObject("triangle-down", "triangle", 140, 120, 2, { direction: "down" }),
  shapeObject("octagon-1", "octagon", 140, 140, 3),
  shapeObject("predefined-process-1", "predefined-process", 200, 100, 4),
  shapeObject("arrow-1", "arrow-shape", 200, 100, 5, { direction: "right" }),
];

const shapeDocument: InteractiveCanvasDocument = {
  schemaVersion: 1,
  id: "b1-shape-smoke",
  title: "Native shape vocabulary smoke",
  mode: "diagram",
  size: { width: 1600, height: 900 },
  viewport: { x: 0, y: 0, zoom: 1 },
  objects: SHAPE_OBJECTS,
  connections: [],
} as InteractiveCanvasDocument;

function renderShapes() {
  return render(<InteractiveCanvasViewer document={shapeDocument} />);
}

function polygonPointCount(container: HTMLElement, objectId: string): number | undefined {
  const polygon = container.querySelector(`[data-canvas-object-id="${objectId}"] polygon`);
  return polygon?.getAttribute("points")?.trim().split(/\s+/).length;
}

describe("Native shape render smoke: every shape renders without crashing", () => {
  it("renders a node for every shape type", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = renderShapes();
      for (const object of SHAPE_OBJECTS) {
        expect(container.querySelector(`[data-canvas-object-id="${object.id}"]`)).toBeTruthy();
      }
    });
  });

  it("renders each true-outline polygon shape with the expected vertex count (same math as connection-cascade.ts)", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = renderShapes();
      expect(polygonPointCount(container as HTMLElement, "triangle-up")).toBe(3);
      expect(polygonPointCount(container as HTMLElement, "triangle-down")).toBe(3);
      expect(polygonPointCount(container as HTMLElement, "octagon-1")).toBe(8);
    });
  });

  it("orients the triangle by its direction field (apex up vs apex down)", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = renderShapes();
      const up = container
        .querySelector('[data-canvas-object-id="triangle-up"] polygon')
        ?.getAttribute("points");
      const down = container
        .querySelector('[data-canvas-object-id="triangle-down"] polygon')
        ?.getAttribute("points");
      // Up: apex at top-center (70, 0). Down: apex at bottom-center (70, 120).
      expect(up).toContain("70,0");
      expect(down).toContain("70,120");
      expect(up).not.toBe(down);
    });
  });

  it("renders ellipse as an SVG ellipse", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = renderShapes();
      expect(container.querySelector('[data-canvas-object-id="ellipse-1"] ellipse')).toBeTruthy();
    });
  });

  it("renders every shape's label span", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = renderShapes();
      const octagon = container.querySelector('[data-canvas-object-id="octagon-1"]');
      expect(octagon?.querySelector(".interactive-canvas-object-label")?.textContent).toBe(
        "octagon-1 label",
      );
    });
  });

  it("arrow-shape body is blocky — bodyHeightRatio 0.60 puts the body top edge at 20% of height", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = renderShapes();
      const points = container
        .querySelector('[data-canvas-object-id="arrow-1"] polygon')
        ?.getAttribute("points");
      // 200x100 right arrow: bodyInset = (1 - 0.60) / 2 * 100 = 20.
      expect(points?.startsWith("0,20")).toBe(true);
      expect(points?.trim().split(/\s+/).length).toBe(7);
    });
  });

  it("special-cases the icon type via IconShapeBody (glyph + label-below-glyph)", () => {
    // See icon-shape-render.test.tsx for the fuller render coverage
    // (multiple glyphs, hideText behavior, explicit-color override).
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const iconDocument: InteractiveCanvasDocument = {
        ...shapeDocument,
        objects: [
          {
            id: "icon-1",
            type: "icon",
            text: "Model icon",
            icon: "model",
            geometry: { x: 0, y: 0, width: 120, height: 120 },
            style: { shape: "icon" },
          },
        ],
      } as InteractiveCanvasDocument;
      const { container } = render(<InteractiveCanvasViewer document={iconDocument} />);
      const node = container.querySelector('[data-canvas-object-id="icon-1"]');
      expect(node).toBeTruthy();
      const body = node?.querySelector("[data-canvas-icon-shape-body]");
      expect(body).toBeTruthy();
      expect(body?.getAttribute("data-canvas-icon-id")).toBe("model");
      expect(node?.querySelector(".interactive-canvas-label-below-icon")?.textContent).toBe("Model icon");
      expect((node as HTMLElement).className.trim()).toBe("interactive-canvas-object interactive-canvas-object-icon");
    });
  });
});
