import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";

import type { InteractiveCanvasDocument } from "../../../state/schema";
import { InteractiveCanvasViewer } from "../InteractiveCanvasViewer";

const document: InteractiveCanvasDocument = {
  schemaVersion: 1,
  id: "interactive-viewer-test",
  mode: "diagram",
  size: { width: 1000, height: 600 },
  viewport: { x: 0, y: 0, zoom: 1 },
  objects: [
    {
      id: "focus-section",
      type: "section",
      text: "Focus",
      geometry: { x: 100, y: 100, width: 500, height: 300 },
      color: "blue",
    },
    {
      id: "child",
      type: "process",
      text: "Child",
      parentId: "focus-section",
      geometry: { x: 240, y: 210, width: 180, height: 80 },
    },
  ],
  connections: [],
};

afterEach(() => cleanup());

function withMeasuredStage(run: () => void) {
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if (
      (this as HTMLElement).classList.contains("interactive-canvas-shell") ||
      (this as HTMLElement).dataset.canvasStage === "true"
    ) {
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: 960,
        height: 540,
        right: 960,
        bottom: 540,
        toJSON: () => ({}),
      } as DOMRect;
    }
    return originalRect.call(this);
  };
  try {
    run();
  } finally {
    HTMLElement.prototype.getBoundingClientRect = originalRect;
  }
}

describe("InteractiveCanvasViewer navigation", () => {
  it("enables bare section-focused zoom without mounting editor mutation surfaces", () => {
    withMeasuredStage(() => {
      const { container, getByRole } = render(
        <InteractiveCanvasViewer
          document={document}
          view="focus-section"
          interactive
          bare
        />,
      );

      expect(container.querySelector("[data-canvas-viewer-interactive='true']")).toBeTruthy();
      expect(container.querySelector("[data-canvas-viewer-controls='true']")).toBeTruthy();
      expect(container.textContent).not.toContain("Interactive Canvas");

      const worldLayer = container.querySelector(".interactive-canvas-world-layer") as HTMLElement;
      const initialTransform = worldLayer.style.transform;
      fireEvent.click(getByRole("button", { name: "Zoom in" }));
      expect(worldLayer.style.transform).not.toBe(initialTransform);

      expect(container.querySelector("[data-canvas-dock]")).toBeNull();
      expect(container.querySelector("[data-selection-toolbar]")).toBeNull();
    });
  });
});

describe("InteractiveCanvasViewer fit on open", () => {
  it("fits to the stage's layout size while a host animation scales it down", () => {
    const isStage = (element: HTMLElement) =>
      element.classList.contains("interactive-canvas-shell") || element.dataset.canvasStage === "true";
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    // Mid-animation the stage's rect is a tenth of its laid-out size.
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (!isStage(this)) return originalRect.call(this);
      return { x: 0, y: 0, left: 0, top: 0, width: 96, height: 54, right: 96, bottom: 54, toJSON: () => ({}) } as DOMRect;
    };
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() { return isStage(this) ? 960 : 0; },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() { return isStage(this) ? 540 : 0; },
    });
    try {
      const { getByRole } = render(<InteractiveCanvasViewer document={document} interactive bare />);
      // 540 / (600 + 2 * 48 padding) at 960x540; the scaled rect bottoms out at 10%.
      expect(getByRole("button", { name: /^Zoom level/ }).getAttribute("aria-label")).toBe("Zoom level 78%");
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalRect;
      if (originalWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalWidth);
      if (originalHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalHeight);
    }
  });
});
