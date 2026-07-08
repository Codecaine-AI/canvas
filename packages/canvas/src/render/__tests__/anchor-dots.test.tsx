import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { CanvasStage } from "../CanvasStage";
import { ANCHOR_DOT_OFFSET_PX, ANCHOR_DOTS_MIN_ZOOM } from "../overlays/AnchorDots";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";

afterEach(() => {
  cleanup();
});

function makeDocument(objects: InteractiveCanvasObject[]): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "anchor-dots-doc",
    mode: "diagram",
    objects,
    connections: [],
  };
}

const triangle: InteractiveCanvasObject = {
  id: "tri",
  type: "triangle",
  text: "Tri",
  geometry: { x: 0, y: 0, width: 100, height: 100 },
  style: { shape: "triangle" },
};

const rect: InteractiveCanvasObject = {
  id: "rect",
  type: "process",
  text: "Rect",
  geometry: { x: 300, y: 0, width: 100, height: 100 },
};

function dots(container: HTMLElement, objectId: string): HTMLElement[] {
  return Array.from(
    container.querySelectorAll(`[data-canvas-object-id="${objectId}"][data-canvas-port]`),
  ) as HTMLElement[];
}

describe("AnchorDots (P3 — D5/D15)", () => {
  it("places dots 20 screen px outside the object bounds at edge midpoints", () => {
    const { container } = render(
      <CanvasStage
        document={makeDocument([rect])}
        viewport={{ x: 0, y: 0, zoom: 2 }}
        selectedObjectIds={["rect"]}
        onStagePointerEvent={() => {}}
      />,
    );
    const left = dots(container, "rect").find(
      (dot) => dot.getAttribute("data-canvas-port") === "left",
    );
    const top = dots(container, "rect").find(
      (dot) => dot.getAttribute("data-canvas-port") === "top",
    );
    expect(left).toBeDefined();
    expect(top).toBeDefined();
    expect(left!.style.left).toBe(`${rect.geometry.x * 2 - ANCHOR_DOT_OFFSET_PX}px`);
    expect(left!.style.top).toBe(`${(rect.geometry.y + rect.geometry.height / 2) * 2}px`);
    expect(top!.style.left).toBe(`${(rect.geometry.x + rect.geometry.width / 2) * 2}px`);
    expect(top!.style.top).toBe(`${rect.geometry.y * 2 - ANCHOR_DOT_OFFSET_PX}px`);
    expect(left!.style.width).toBe("28px");
    expect(left!.style.height).toBe("28px");
  });

  it("zoom-gates VISIBILITY only: below the threshold dots are opacity 0 but still present and grabbable", () => {
    const below = render(
      <CanvasStage
        document={makeDocument([triangle])}
        viewport={{ x: 0, y: 0, zoom: ANCHOR_DOTS_MIN_ZOOM / 2 }}
        selectedObjectIds={["tri"]}
        onStagePointerEvent={() => {}}
      />,
    );
    const hiddenDots = dots(below.container as HTMLElement, "tri");
    expect(hiddenDots.length).toBe(4);
    for (const dot of hiddenDots) {
      expect(dot.style.opacity).toBe("0");
      expect(dot.style.pointerEvents).toBe("auto");
    }
    below.unmount();

    const above = render(
      <CanvasStage
        document={makeDocument([triangle])}
        viewport={{ x: 0, y: 0, zoom: ANCHOR_DOTS_MIN_ZOOM }}
        selectedObjectIds={["tri"]}
        onStagePointerEvent={() => {}}
      />,
    );
    for (const dot of dots(above.container as HTMLElement, "tri")) {
      expect(dot.style.opacity).toBe("1");
    }
  });

  it("renders 4 dots per selected object in a multi-selection", () => {
    const { container } = render(
      <CanvasStage
        document={makeDocument([triangle, rect])}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        selectedObjectIds={["tri", "rect"]}
        onStagePointerEvent={() => {}}
      />,
    );
    expect(dots(container as HTMLElement, "tri").length).toBe(4);
    expect(dots(container as HTMLElement, "rect").length).toBe(4);
  });

  it("does not show dots for an unselected object on hover", () => {
    const { container } = render(
      <CanvasStage
        document={makeDocument([rect])}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        onStagePointerEvent={() => {}}
      />,
    );
    expect(dots(container as HTMLElement, "rect").length).toBe(0);

    const object = container.querySelector('[data-canvas-object-id="rect"]') as HTMLElement;
    fireEvent.pointerMove(object);
    expect(dots(container as HTMLElement, "rect").length).toBe(0);
  });
});
