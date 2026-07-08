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
 * One object per Wave B1 native type (default sizes from the implementation
 * brief), laid out on a simple grid. `style.shape` mirrors `type` the same way
 * `shapeForType` (state/actions.ts) writes it for placed objects.
 */
function b1Object(
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

const B1_OBJECTS: InteractiveCanvasObject[] = [
  b1Object("ellipse-1", "ellipse", 160, 120, 0),
  b1Object("triangle-up", "triangle", 140, 120, 1),
  b1Object("triangle-down", "triangle", 140, 120, 2, { direction: "down" }),
  b1Object("parallelogram-1", "parallelogram", 160, 100, 3),
  b1Object("pentagon-1", "pentagon", 140, 140, 4),
  b1Object("octagon-1", "octagon", 140, 140, 5),
  b1Object("star-1", "star", 140, 140, 6),
  b1Object("plus-1", "plus", 120, 120, 7),
  b1Object("chevron-1", "chevron", 160, 120, 8),
  b1Object("folder-1", "folder", 140, 110, 9),
  b1Object("document-stack-1", "document-stack", 160, 120, 10),
  b1Object("off-page-connector-1", "off-page-connector", 120, 100, 11),
  b1Object("trapezoid-1", "trapezoid", 150, 100, 12),
  b1Object("manual-input-1", "manual-input", 150, 100, 13),
  b1Object("hexagon-1", "hexagon", 150, 100, 14),
  b1Object("internal-storage-1", "internal-storage", 150, 110, 15),
  b1Object("or-junction-1", "or-junction", 100, 100, 16),
  b1Object("summing-junction-1", "summing-junction", 100, 100, 17),
  b1Object("cylinder-horizontal-1", "cylinder-horizontal", 150, 100, 18),
  b1Object("page-corner-1", "page-corner", 160, 120, 19),
  // HBW parity fixes under test alongside the new set:
  b1Object("document-1", "document", 160, 120, 20),
  b1Object("arrow-1", "arrow-shape", 200, 100, 21, { direction: "right" }),
];

const b1Document: InteractiveCanvasDocument = {
  schemaVersion: 1,
  id: "b1-shape-smoke",
  title: "Wave B1 shape vocabulary smoke",
  mode: "diagram",
  size: { width: 1600, height: 900 },
  viewport: { x: 0, y: 0, zoom: 1 },
  objects: B1_OBJECTS,
  connections: [],
} as InteractiveCanvasDocument;

function renderB1() {
  return render(<InteractiveCanvasViewer document={b1Document} />);
}

function polygonPointCount(container: HTMLElement, objectId: string): number | undefined {
  const polygon = container.querySelector(`[data-canvas-object-id="${objectId}"] polygon`);
  return polygon?.getAttribute("points")?.trim().split(/\s+/).length;
}

describe("Wave B1 render smoke: every new native shape renders without crashing", () => {
  it("renders a node for every new object type", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = renderB1();
      for (const object of B1_OBJECTS) {
        expect(container.querySelector(`[data-canvas-object-id="${object.id}"]`)).toBeTruthy();
      }
    });
  });

  it("renders each true-outline polygon shape with the expected vertex count (same math as connection-overlay.ts)", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = renderB1();
      expect(polygonPointCount(container as HTMLElement, "triangle-up")).toBe(3);
      expect(polygonPointCount(container as HTMLElement, "triangle-down")).toBe(3);
      expect(polygonPointCount(container as HTMLElement, "parallelogram-1")).toBe(4);
      expect(polygonPointCount(container as HTMLElement, "pentagon-1")).toBe(5);
      expect(polygonPointCount(container as HTMLElement, "octagon-1")).toBe(8);
      expect(polygonPointCount(container as HTMLElement, "star-1")).toBe(10);
      expect(polygonPointCount(container as HTMLElement, "plus-1")).toBe(12);
      expect(polygonPointCount(container as HTMLElement, "chevron-1")).toBe(6);
      expect(polygonPointCount(container as HTMLElement, "off-page-connector-1")).toBe(5);
      expect(polygonPointCount(container as HTMLElement, "trapezoid-1")).toBe(4);
      expect(polygonPointCount(container as HTMLElement, "manual-input-1")).toBe(4);
      expect(polygonPointCount(container as HTMLElement, "hexagon-1")).toBe(6);
    });
  });

  it("orients the triangle by its direction field (apex up vs apex down)", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = renderB1();
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

  it("renders ellipse / or-junction / summing-junction as SVG ellipses", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = renderB1();
      for (const id of ["ellipse-1", "or-junction-1", "summing-junction-1"]) {
        expect(container.querySelector(`[data-canvas-object-id="${id}"] ellipse`)).toBeTruthy();
      }
    });
  });

  it("distinguishes the junctions: or-junction carries a + cross, summing-junction an x", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = renderB1();
      const orLines = container.querySelectorAll('[data-canvas-object-id="or-junction-1"] line');
      const sumLines = container.querySelectorAll('[data-canvas-object-id="summing-junction-1"] line');
      expect(orLines.length).toBe(2);
      expect(sumLines.length).toBe(2);
      // "+" runs through the cardinals; "x" endpoints sit at the 45deg outline points.
      expect(orLines[0]?.getAttribute("x1")).toBe("50%");
      expect(sumLines[0]?.getAttribute("x1")).toBe("14.64%");
    });
  });

  it("renders NO visible text for plus / or-junction / summing-junction (a11y-only labels)", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = renderB1();
      for (const id of ["plus-1", "or-junction-1", "summing-junction-1"]) {
        const node = container.querySelector(`[data-canvas-object-id="${id}"]`);
        expect(node?.querySelector(".interactive-canvas-object-label")).toBeNull();
        // Schema still requires text; it survives as the accessible name.
        expect(node?.getAttribute("aria-label")).toContain(id);
      }
      // Sanity: a labeled shape from the same set does show its label span.
      const hexagon = container.querySelector('[data-canvas-object-id="hexagon-1"]');
      expect(hexagon?.querySelector(".interactive-canvas-object-label")?.textContent).toBe(
        "hexagon-1 label",
      );
    });
  });

  it("renders internal-storage with its two interior rule lines and a visible label", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = renderB1();
      const node = container.querySelector('[data-canvas-object-id="internal-storage-1"]');
      expect(node?.querySelectorAll(".interactive-canvas-internal-storage-rule").length).toBe(2);
      expect(node?.querySelector(".interactive-canvas-object-label")).toBeTruthy();
    });
  });

  it("renders folder / cylinder-horizontal as SVG path silhouettes", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = renderB1();
      expect(
        container.querySelector('[data-canvas-shape-silhouette="folder"] path'),
      ).toBeTruthy();
      expect(
        container.querySelector('[data-canvas-shape-silhouette="cylinder-horizontal"] path'),
      ).toBeTruthy();
    });
  });

  it("HBW: document renders the wavy-bottom silhouette (SVG path with cubic Bezier commands)", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = renderB1();
      const path = container.querySelector('[data-canvas-shape-silhouette="document"] path');
      expect(path).toBeTruthy();
      expect(path?.getAttribute("d") ?? "").toContain("C");
    });
  });

  it("renders document-stack as two wavy-document copies (front + offset back)", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = renderB1();
      const paths = container.querySelectorAll(
        '[data-canvas-shape-silhouette="document-stack"] path',
      );
      expect(paths.length).toBe(2);
      for (const path of paths) {
        expect(path.getAttribute("d") ?? "").toContain("C");
      }
    });
  });

  it("HBW: page-corner carries the old document dog-ear class (clip-path silhouette)", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = renderB1();
      const node = container.querySelector(
        '[data-canvas-object-id="page-corner-1"]',
      ) as HTMLElement | null;
      expect(node).toBeTruthy();
      expect(node!.className).toContain("interactive-canvas-object-page-corner");
      // The document class no longer applies the dog-ear — the two are distinct.
      expect(node!.className).not.toContain("interactive-canvas-object-document");
    });
  });

  it("HBW: arrow-shape body is blockier — bodyHeightRatio 0.60 puts the body top edge at 20% of height", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = renderB1();
      const points = container
        .querySelector('[data-canvas-object-id="arrow-1"] polygon')
        ?.getAttribute("points");
      // 200x100 right arrow: bodyInset = (1 - 0.60) / 2 * 100 = 20.
      expect(points?.startsWith("0,20")).toBe(true);
      expect(points?.trim().split(/\s+/).length).toBe(7);
    });
  });

  it("Wave C: special-cases the icon type via IconShapeBody (glyph + label-below-glyph)", () => {
    // Superseded by Wave C's icon-case wiring in CanvasStage.tsx — this used
    // to assert the pre-Wave-C fallthrough-to-default-box stub; see
    // icon-shape-render.test.tsx for the fuller Wave C render coverage
    // (multiple glyphs, hideText behavior, explicit-color override).
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const iconDocument: InteractiveCanvasDocument = {
        ...b1Document,
        objects: [
          {
            id: "icon-1",
            type: "icon",
            text: "CPU icon",
            icon: "cpu",
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
      expect(body?.getAttribute("data-canvas-icon-id")).toBe("cpu");
      expect(node?.querySelector(".interactive-canvas-label-below-icon")?.textContent).toBe("CPU icon");
      expect((node as HTMLElement).className.trim()).toBe("interactive-canvas-object interactive-canvas-object-icon");
    });
  });
});
