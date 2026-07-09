import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CanvasStage } from "../CanvasStage";
import { ANCHOR_DOT_OFFSET_PX, ANCHOR_DOTS_MIN_ZOOM } from "../../connectors/AnchorDots";
import { connectionBoundsForObject } from "../../objects/geometry";
import { CONNECTOR_END_GAP_PX } from "../../connectors/routing";
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

const iconWithBelowLabel: InteractiveCanvasObject = {
  id: "icon-with-label",
  type: "icon",
  icon: "person",
  text: "Interviewee Response",
  geometry: { x: 10, y: 20, width: 87, height: 87 },
};

function dots(container: HTMLElement, objectId: string): HTMLElement[] {
  return Array.from(
    container.querySelectorAll(`[data-canvas-object-id="${objectId}"][data-canvas-port]`),
  ) as HTMLElement[];
}

function lastPointOf(path: string): { x: number; y: number } {
  const numbers = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  return { x: numbers[numbers.length - 2]!, y: numbers[numbers.length - 1]! };
}

function expectClose(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThan(1e-6);
}

function packageTextFiles(dir = join(import.meta.dir, "../../../..")): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const path = join(dir, entry.name);
    if (path.endsWith(join("canvas", "src", "vendor"))) continue;
    if (entry.isDirectory()) {
      files.push(...packageTextFiles(path));
    } else if (/\.(?:css|html|js|json|ts|tsx)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
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

  it("places the bottom dot outside the full visual bounds for below-slot labels", () => {
    const { container } = render(
      <CanvasStage
        document={makeDocument([iconWithBelowLabel])}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        selectedObjectIds={["icon-with-label"]}
        onStagePointerEvent={() => {}}
      />,
    );
    const bottom = dots(container, "icon-with-label").find(
      (dot) => dot.getAttribute("data-canvas-port") === "bottom",
    );
    const visualBounds = connectionBoundsForObject(iconWithBelowLabel);
    expect(bottom).toBeDefined();
    expect(bottom!.style.left).toBe(`${visualBounds.x + visualBounds.width / 2}px`);
    expect(bottom!.style.top).toBe(`${visualBounds.y + visualBounds.height + ANCHOR_DOT_OFFSET_PX}px`);
    expect(Number.parseFloat(bottom!.style.top)).toBeGreaterThan(
      iconWithBelowLabel.geometry.y + iconWithBelowLabel.geometry.height + ANCHOR_DOT_OFFSET_PX,
    );
  });

  it("previews quick-connect on dot hover and clears it on unhover", () => {
    const { container } = render(
      <CanvasStage
        document={makeDocument([rect])}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        selectedObjectIds={["rect"]}
        onStagePointerEvent={() => {}}
      />,
    );
    const right = dots(container, "rect").find(
      (dot) => dot.getAttribute("data-canvas-port") === "right",
    );
    expect(right).toBeDefined();
    expect(right!.style.cursor).toBe("default");

    fireEvent.pointerEnter(right!);

    const ghost = container.querySelector("[data-canvas-quick-connect-ghost]") as HTMLElement;
    expect(ghost).toBeTruthy();
    expect(ghost.style.opacity).toBe("0.35");
    expect(ghost.style.pointerEvents).toBe("none");
    expect(ghost.querySelector('[data-canvas-object-id="rect-quick-connect-ghost"]')).toBeTruthy();

    const previewPath = container.querySelector("[data-canvas-connector-preview-path]") as SVGPathElement;
    expect(previewPath).toBeTruthy();
    expect(previewPath.getAttribute("stroke")).toBe("#757575");
    expect(previewPath.getAttribute("opacity")).toBe("0.6");
    // Ghost sits half a source-width away (quickConnectClickPoint gap / 2);
    // the drawn end stops CONNECTOR_END_GAP_PX short of its near edge.
    expect(previewPath.getAttribute("d")).toBe("M 410 50 L 450 50");
    expect(previewPath.getAttribute("marker-end")).toBe("url(#anchor-dots-doc-arrow-forward)");

    fireEvent.pointerLeave(right!);

    expect(container.querySelector("[data-canvas-quick-connect-ghost]")).toBeNull();
    expect(container.querySelector("[data-canvas-connector-preview-path]")).toBeNull();
  });

  it("terminates quick-connect hover preview at the ghost's near edge", () => {
    const { container } = render(
      <CanvasStage
        document={makeDocument([rect])}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        selectedObjectIds={["rect"]}
        onStagePointerEvent={() => {}}
      />,
    );
    const right = dots(container, "rect").find(
      (dot) => dot.getAttribute("data-canvas-port") === "right",
    );
    expect(right).toBeDefined();

    fireEvent.pointerEnter(right!);

    const ghostWrapper = container.querySelector(
      "[data-canvas-quick-connect-ghost]",
    ) as HTMLElement;
    const ghostObject = ghostWrapper.querySelector(
      '[data-canvas-object-id="rect-quick-connect-ghost"]',
    ) as HTMLElement;
    const previewPath = container.querySelector("[data-canvas-connector-preview-path]") as SVGPathElement;
    const renderedEnd = lastPointOf(previewPath.getAttribute("d")!);
    // Screen position lives on the zoom-scaled wrapper; the object inside is
    // world-sized at 0,0 (zoom is 1 here, so no scale factor to apply).
    const ghostLeft = Number.parseFloat(ghostWrapper.style.left);
    const ghostCenter = ghostLeft + Number.parseFloat(ghostObject.style.width) / 2;

    expectClose(renderedEnd.x, ghostLeft - CONNECTOR_END_GAP_PX);
    expectClose(renderedEnd.y, rect.geometry.y + rect.geometry.height / 2);
    expect(Math.abs(renderedEnd.x - ghostCenter)).toBeGreaterThan(CONNECTOR_END_GAP_PX);
  });

  it("makes select-mode dots hidden and inert below the zoom gate", () => {
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
      expect(dot.style.pointerEvents).toBe("none");
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
      expect(dot.style.pointerEvents).toBe("auto");
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

  it("renders connector-mode dots for an unselected hovered object only", () => {
    const { container } = render(
      <CanvasStage
        document={makeDocument([triangle, rect])}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        selectedObjectIds={["tri"]}
        activeTool="connector"
        hoveredObjectId="rect"
        onStagePointerEvent={() => {}}
      />,
    );

    expect(dots(container as HTMLElement, "rect").length).toBe(4);
    expect(dots(container as HTMLElement, "tri").length).toBe(0);
  });

  it("keeps connector-mode hovered dots visible and interactive below the select-mode zoom gate", () => {
    const { container } = render(
      <CanvasStage
        document={makeDocument([rect])}
        viewport={{ x: 0, y: 0, zoom: 0.25 }}
        activeTool="connector"
        hoveredObjectId="rect"
        onStagePointerEvent={() => {}}
      />,
    );

    const visibleDots = dots(container as HTMLElement, "rect");
    expect(visibleDots.length).toBe(4);
    for (const dot of visibleDots) {
      expect(dot.style.opacity).toBe("1");
      expect(dot.style.pointerEvents).toBe("auto");
    }
  });

  it("keeps select-mode dots driven by selection rather than hover", () => {
    const { container } = render(
      <CanvasStage
        document={makeDocument([triangle, rect])}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        selectedObjectIds={["tri"]}
        activeTool="select"
        hoveredObjectId="rect"
        onStagePointerEvent={() => {}}
      />,
    );

    expect(dots(container as HTMLElement, "tri").length).toBe(4);
    expect(dots(container as HTMLElement, "rect").length).toBe(0);
  });

  it("keeps select-mode selected dots hidden below the zoom gate", () => {
    const { container } = render(
      <CanvasStage
        document={makeDocument([rect])}
        viewport={{ x: 0, y: 0, zoom: 0.25 }}
        selectedObjectIds={["rect"]}
        activeTool="select"
        hoveredObjectId="rect"
        onStagePointerEvent={() => {}}
      />,
    );

    const hiddenDots = dots(container as HTMLElement, "rect");
    expect(hiddenDots.length).toBe(4);
    for (const dot of hiddenDots) {
      expect(dot.style.opacity).toBe("0");
    }
  });

  it("renders the hover highlight only for idle connector-mode hover", () => {
    const connector = render(
      <CanvasStage
        document={makeDocument([rect])}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        activeTool="connector"
        hoveredObjectId="rect"
        onStagePointerEvent={() => {}}
      />,
    );

    const highlight = connector.container.querySelector(
      "[data-canvas-hover-highlight]",
    ) as HTMLElement;
    expect(highlight).toBeTruthy();
    expect(highlight.getAttribute("data-canvas-object-id")).toBe("rect");
    expect(highlight.style.left).toBe(`${rect.geometry.x - 3}px`);
    expect(highlight.style.top).toBe(`${rect.geometry.y - 3}px`);
    connector.unmount();

    const select = render(
      <CanvasStage
        document={makeDocument([rect])}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        activeTool="select"
        hoveredObjectId="rect"
        onStagePointerEvent={() => {}}
      />,
    );
    expect(select.container.querySelector("[data-canvas-hover-highlight]")).toBeNull();
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

  it("keeps the connector cursor token confined to CanvasStage's connector-mode cursor", () => {
    const banned = "cross" + "hair";
    const offenders = packageTextFiles().filter((file) => readFileSync(file, "utf8").includes(banned));
    expect(offenders).toEqual([join(import.meta.dir, "../CanvasStage.tsx")]);
  });
});
