import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import syntheticCanvas from "../../../../../canvases/synthetic.canvas.json";
import {
  containerViewBounds,
  fitBounds,
  fitDocument,
  InteractiveCanvasViewer,
  paletteTokenStyle,
  type InteractiveCanvasDocument,
} from "../../index";

const syntheticCanvasDocument = syntheticCanvas as InteractiveCanvasDocument;

afterEach(() => {
  cleanup();
});

/**
 * jsdom/happy-dom performs no real layout, so getBoundingClientRect() on the
 * measured `.interactive-canvas-shell` element returns all-zero by default.
 * Mock it (scoped + restored) so InteractiveCanvasViewer's useMeasuredSize
 * hook sees a stable, realistic screen size, following the same
 * prototype-patch pattern used in schema-and-actions.test.tsx.
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

const SCREEN = { width: 960, height: 360 };

describe("InteractiveCanvasViewer view cropping", () => {
  it("renders every object at raw world px coordinates under one transformed world layer", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(
        <InteractiveCanvasViewer document={syntheticCanvasDocument} />,
      );

      const worldLayer = container.querySelector(".interactive-canvas-world-layer") as HTMLElement | null;
      expect(worldLayer).toBeTruthy();
      expect(worldLayer!.style.transform).toMatch(/^translate\(.+\) scale\(.+\)$/);

      for (const object of syntheticCanvasDocument.objects) {
        const node = container.querySelector(`[data-canvas-object-id="${object.id}"]`) as HTMLElement | null;
        expect(node).toBeTruthy();
        expect(node!.style.left).toBe(`${object.geometry.x}px`);
        expect(node!.style.top).toBe(`${object.geometry.y}px`);
        expect(node!.style.width).toBe(`${object.geometry.width}px`);
        expect(node!.style.height).toBe(`${object.geometry.height}px`);
      }
    });
  });

  it("fits the viewport to the full document when no view is set", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(
        <InteractiveCanvasViewer document={syntheticCanvasDocument} />,
      );

      const expected = fitDocument(syntheticCanvasDocument, SCREEN);
      const worldLayer = container.querySelector(".interactive-canvas-world-layer") as HTMLElement;
      const expectedTransform = `translate(${-expected.x * expected.zoom}px, ${-expected.y * expected.zoom}px) scale(${expected.zoom})`;
      expect(worldLayer.style.transform).toBe(expectedTransform);
    });
  });

  it("crops the viewport to a container's bounds when view is set, matching fitBounds(containerViewBounds(...))", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const bounds = containerViewBounds(syntheticCanvasDocument, "input-context");
      expect(bounds).toBeTruthy();
      const expected = fitBounds(bounds!, SCREEN);

      const { container } = render(
        <InteractiveCanvasViewer document={syntheticCanvasDocument} view="input-context" />,
      );

      const worldLayer = container.querySelector(".interactive-canvas-world-layer") as HTMLElement;
      const expectedTransform = `translate(${-expected.x * expected.zoom}px, ${-expected.y * expected.zoom}px) scale(${expected.zoom})`;
      expect(worldLayer.style.transform).toBe(expectedTransform);

      // Sanity: cropped zoom should differ from the full-document fit.
      const fullFit = fitDocument(syntheticCanvasDocument, SCREEN);
      expect(expected.zoom).not.toBeCloseTo(fullFit.zoom, 5);
    });
  });

  it("falls back to the full document and shows a warning badge when view references an unknown or non-container id", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container, getByText } = render(
        <InteractiveCanvasViewer document={syntheticCanvasDocument} view="does-not-exist" />,
      );

      expect(getByText("View not found: does-not-exist")).toBeTruthy();

      const expected = fitDocument(syntheticCanvasDocument, SCREEN);
      const worldLayer = container.querySelector(".interactive-canvas-world-layer") as HTMLElement;
      const expectedTransform = `translate(${-expected.x * expected.zoom}px, ${-expected.y * expected.zoom}px) scale(${expected.zoom})`;
      expect(worldLayer.style.transform).toBe(expectedTransform);
    });
  });
});

function makeExpandedVocabDocument(): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "expanded-vocab-render-doc",
    mode: "diagram",
    size: { width: 800, height: 400 },
    viewport: { x: 0, y: 0, zoom: 1 },
    objects: [
      {
        id: "doc-a",
        type: "document",
        label: "Doc A",
        geometry: { x: 0, y: 0, width: 160, height: 128 },
        style: { shape: "document", paletteToken: "memory" },
      },
      {
        id: "person-a",
        type: "person",
        label: "Person A",
        geometry: { x: 200, y: 0, width: 128, height: 144 },
        style: { shape: "person", paletteToken: "input" },
      },
      {
        id: "person-compact",
        type: "person",
        label: "Compact Person",
        geometry: { x: 200, y: 200, width: 128, height: 80 },
        style: { shape: "person", paletteToken: "input" },
      },
      {
        id: "database-a",
        type: "database",
        label: "Database A",
        geometry: { x: 400, y: 0, width: 144, height: 128 },
        style: { shape: "database", paletteToken: "memory" },
      },
      {
        id: "chat-a",
        type: "chat",
        label: "Chat A",
        body: "Hello there",
        geometry: { x: 600, y: 0, width: 176, height: 112 },
        style: { shape: "chat", paletteToken: "process" },
      },
      {
        id: "chat-compact",
        type: "chat",
        label: "Compact Chat",
        body: "Hello there",
        geometry: { x: 600, y: 200, width: 176, height: 80 },
        style: { shape: "chat", paletteToken: "process" },
      },
    ],
    connections: [],
  };
}

describe("InteractiveCanvasViewer: expanded shape vocabulary rendering (checkpoint 5)", () => {
  it("renders a distinct shape class for each new object type", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(
        <InteractiveCanvasViewer document={makeExpandedVocabDocument()} />,
      );

      expect(
        container.querySelector('[data-canvas-object-id="doc-a"].interactive-canvas-object-document'),
      ).toBeTruthy();
      expect(
        container.querySelector('[data-canvas-object-id="person-a"].interactive-canvas-object-person'),
      ).toBeTruthy();
      expect(
        container.querySelector(
          '[data-canvas-object-id="database-a"].interactive-canvas-object-database',
        ),
      ).toBeTruthy();
      expect(
        container.querySelector('[data-canvas-object-id="chat-a"].interactive-canvas-object-chat'),
      ).toBeTruthy();
    });
  });

  it("renders inline SVG silhouettes for person/database/chat, filled from the palette token", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(
        <InteractiveCanvasViewer document={makeExpandedVocabDocument()} />,
      );

      const personSvg = container.querySelector('[data-canvas-shape-silhouette="person"]');
      const databaseSvg = container.querySelector('[data-canvas-shape-silhouette="database"]');
      const chatSvg = container.querySelector('[data-canvas-shape-silhouette="chat"]');
      expect(personSvg).toBeTruthy();
      expect(databaseSvg).toBeTruthy();
      expect(chatSvg).toBeTruthy();

      const inputStyle = paletteTokenStyle("input");
      const memoryStyle = paletteTokenStyle("memory");
      const processStyle = paletteTokenStyle("process");

      const personFill = personSvg!.querySelector("circle")?.getAttribute("fill");
      expect(personFill).toBe(inputStyle.fill);

      const databaseFill = databaseSvg!.querySelector("ellipse")?.getAttribute("fill");
      expect(databaseFill).toBe(memoryStyle.fill);

      const chatFill = chatSvg!.querySelector("path")?.getAttribute("fill");
      expect(chatFill).toBe(processStyle.fill);
    });
  });

  it("hides label and body text for person/chat objects under 100px height", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(
        <InteractiveCanvasViewer document={makeExpandedVocabDocument()} />,
      );

      const tallPerson = container.querySelector('[data-canvas-object-id="person-a"]');
      expect(tallPerson?.querySelector(".interactive-canvas-object-label")).toBeTruthy();

      const compactPerson = container.querySelector('[data-canvas-object-id="person-compact"]');
      expect(compactPerson?.querySelector(".interactive-canvas-object-label")).toBeNull();

      // Tall chat still renders its body copy (only person hides its label
      // when compact; body copy hides for both person and chat).
      const chat = container.querySelector('[data-canvas-object-id="chat-a"]');
      expect(chat?.querySelector(".interactive-canvas-object-body")).toBeTruthy();

      const compactChat = container.querySelector('[data-canvas-object-id="chat-compact"]');
      expect(compactChat?.querySelector(".interactive-canvas-object-body")).toBeNull();
    });
  });

  it("gives the document shape the wavy-bottom SVG silhouette (Wave B1 — the dog-ear clip-path moved to page-corner)", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(
        <InteractiveCanvasViewer document={makeExpandedVocabDocument()} />,
      );
      const node = container.querySelector('[data-canvas-object-id="doc-a"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      expect(node!.className).toContain("interactive-canvas-object-document");
      const silhouettePath = node!.querySelector('[data-canvas-shape-silhouette="document"] path');
      expect(silhouettePath).toBeTruthy();
      // Wavy bottom = cubic Bezier crests, not the old straight-edged clip-path.
      expect(silhouettePath?.getAttribute("d") ?? "").toContain("C");
    });
  });
});
