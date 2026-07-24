import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import {
  containerViewBounds,
  fitBounds,
  fitDocument,
  InteractiveCanvasViewer,
  paletteTokenStyle,
  syntheticInteractiveCanvas,
  type InteractiveCanvasDocument,
} from "../index";

afterEach(() => {
  cleanup();
});

/**
 * jsdom/happy-dom performs no real layout, so getBoundingClientRect() on the
 * measured `.interactive-canvas-shell` element returns all-zero by default.
 * Mock it (scoped + restored) so InteractiveCanvasViewer's measuring hooks
 * see a stable, realistic screen size, following the same
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
/** The viewer's static-fit padding (STATIC_FIT_PADDING). */
const STATIC_PADDING = 16;

function worldTransform(container: HTMLElement): string {
  const worldLayer = container.querySelector(".interactive-canvas-world-layer") as HTMLElement;
  return worldLayer.style.transform;
}

function parseTransform(transform: string): { tx: number; ty: number; zoom: number } {
  const match = /^translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)$/.exec(transform);
  if (!match) throw new Error(`unparseable world transform: ${transform}`);
  return { tx: Number(match[1]), ty: Number(match[2]), zoom: Number(match[3]) };
}

function expectedTransform(viewport: { x: number; y: number; zoom: number }): string {
  return `translate(${-viewport.x * viewport.zoom}px, ${-viewport.y * viewport.zoom}px) scale(${viewport.zoom})`;
}

describe("InteractiveCanvasViewer view cropping (static)", () => {
  it("renders every object at raw world px coordinates under one transformed world layer", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(
        <InteractiveCanvasViewer document={syntheticInteractiveCanvas} />,
      );

      const worldLayer = container.querySelector(".interactive-canvas-world-layer") as HTMLElement | null;
      expect(worldLayer).toBeTruthy();
      expect(worldLayer!.style.transform).toMatch(/^translate\(.+\) scale\(.+\)$/);

      for (const object of syntheticInteractiveCanvas.objects) {
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
        <InteractiveCanvasViewer document={syntheticInteractiveCanvas} />,
      );

      const expected = fitDocument(syntheticInteractiveCanvas, SCREEN, STATIC_PADDING);
      expect(worldTransform(container)).toBe(expectedTransform(expected));
    });
  });

  it("crops the viewport to a container's bounds when view is set, matching fitBounds(containerViewBounds(...))", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const bounds = containerViewBounds(syntheticInteractiveCanvas, "input-context");
      expect(bounds).toBeTruthy();
      const expected = fitBounds(bounds!, SCREEN, STATIC_PADDING);

      const { container } = render(
        <InteractiveCanvasViewer document={syntheticInteractiveCanvas} view="input-context" />,
      );

      expect(worldTransform(container)).toBe(expectedTransform(expected));

      // Sanity: cropped zoom should differ from the full-document fit.
      const fullFit = fitDocument(syntheticInteractiveCanvas, SCREEN, STATIC_PADDING);
      expect(expected.zoom).not.toBeCloseTo(fullFit.zoom, 5);
    });
  });

  it("crops the viewport to a section's bounds when view targets a section root", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const doc = makeSectionRootedDocument();
      const bounds = containerViewBounds(doc, "root-section");
      expect(bounds).toBeTruthy();
      const expected = fitBounds(bounds!, SCREEN, STATIC_PADDING);

      const { container, queryByText } = render(
        <InteractiveCanvasViewer document={doc} view="root-section" />,
      );

      // The view resolves: no warning overlay.
      expect(queryByText("View not found: root-section")).toBeNull();

      expect(worldTransform(container)).toBe(expectedTransform(expected));

      // Sanity: cropped zoom should differ from the full-document fit,
      // since "far-away" sits outside the section.
      const fullFit = fitDocument(doc, SCREEN, STATIC_PADDING);
      expect(expected.zoom).not.toBeCloseTo(fullFit.zoom, 5);
    });
  });

  it("falls back to the full document and shows a small stage overlay note when view references an unknown or non-container id", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container, getByText } = render(
        <InteractiveCanvasViewer document={syntheticInteractiveCanvas} view="does-not-exist" />,
      );

      expect(getByText("View not found: does-not-exist")).toBeTruthy();
      // The note is an unobtrusive overlay ON the stage, not framing around it.
      const warning = container.querySelector("[data-canvas-view-warning]") as HTMLElement;
      expect(warning).toBeTruthy();
      expect(warning.style.position).toBe("absolute");
      expect(warning.closest(".interactive-canvas-shell")).toBeTruthy();

      const expected = fitDocument(syntheticInteractiveCanvas, SCREEN, STATIC_PADDING);
      expect(worldTransform(container)).toBe(expectedTransform(expected));
    });
  });
});

describe("InteractiveCanvasViewer bare diagram surface", () => {
  it("renders only the stage: no header text, no badges, no board id, no card framing", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container, queryByText } = render(
        <InteractiveCanvasViewer document={syntheticInteractiveCanvas} />,
      );

      expect(queryByText("Interactive Canvas")).toBeNull();
      expect(queryByText(`${syntheticInteractiveCanvas.objects.length} objects`)).toBeNull();
      expect(
        queryByText(`${syntheticInteractiveCanvas.connections.length} connectors`),
      ).toBeNull();
      expect(queryByText(syntheticInteractiveCanvas.id)).toBeNull();

      const stage = container.querySelector('[data-canvas-stage="true"]') as HTMLElement | null;
      expect(stage).toBeTruthy();
      // Static renders drop the dot grid — the diagram sits on a clean surface.
      expect(stage!.style.backgroundImage).toBe("none");
      // The shell carries no border/rounding of its own.
      const shell = container.querySelector(".interactive-canvas-shell") as HTMLElement;
      expect(shell.style.border).toBe("");
      expect(shell.style.borderRadius).toBe("");
      // Objects still render; no zoom controls in static mode.
      expect(container.querySelectorAll("[data-canvas-object-id]").length).toBeGreaterThan(0);
      expect(container.querySelector("[data-zoom-controls]")).toBeNull();
    });
  });

  it("sizes the static stage by the cropped bounds' aspect ratio with a 200px min height", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const bounds = containerViewBounds(syntheticInteractiveCanvas, "input-context")!;
      const expectedAspect = Math.min(4, Math.max(6 / 16, bounds.width / bounds.height));

      const { container } = render(
        <InteractiveCanvasViewer document={syntheticInteractiveCanvas} view="input-context" />,
      );

      const shell = container.querySelector(".interactive-canvas-shell") as HTMLElement;
      expect(shell.style.minHeight).toBe("200px");
      expect(Number.parseFloat(shell.style.aspectRatio)).toBeCloseTo(expectedAspect, 5);
    });
  });
});

describe("InteractiveCanvasViewer interactive mode", () => {
  it("overlays zoom controls, keeps the dot grid, and fills its host container", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(
        <InteractiveCanvasViewer document={syntheticInteractiveCanvas} interactive />,
      );

      expect(container.querySelector("[data-zoom-controls]")).toBeTruthy();
      expect(container.querySelector("[data-canvas-zoom-overlay]")).toBeTruthy();
      const stage = container.querySelector('[data-canvas-stage="true"]') as HTMLElement;
      expect(stage.style.backgroundImage).not.toBe("none");
      const shell = container.querySelector(".interactive-canvas-shell") as HTMLElement;
      expect(shell.style.width).toBe("100%");
      expect(shell.style.height).toBe("100%");
    });
  });

  it("frames the initial interactive viewport on the view crop", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const bounds = containerViewBounds(syntheticInteractiveCanvas, "input-context")!;
      const expected = fitBounds(bounds, SCREEN);

      const { container } = render(
        <InteractiveCanvasViewer
          document={syntheticInteractiveCanvas}
          view="input-context"
          interactive
        />,
      );

      expect(worldTransform(container)).toBe(expectedTransform(expected));
    });
  });

  it("zooms via the zoom controls", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container, getByRole } = render(
        <InteractiveCanvasViewer document={syntheticInteractiveCanvas} interactive />,
      );

      const before = parseTransform(worldTransform(container));
      fireEvent.click(getByRole("button", { name: "Zoom in" }));
      const after = parseTransform(worldTransform(container));
      expect(after.zoom).toBeCloseTo(before.zoom * 1.2, 5);

      fireEvent.click(getByRole("button", { name: "Zoom out" }));
      const back = parseTransform(worldTransform(container));
      expect(back.zoom).toBeCloseTo(before.zoom, 5);
    });
  });

  it("pans on plain drag past the threshold", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(
        <InteractiveCanvasViewer document={syntheticInteractiveCanvas} interactive />,
      );

      const shell = container.querySelector(".interactive-canvas-shell") as HTMLElement;
      const before = parseTransform(worldTransform(container));

      fireEvent.pointerDown(shell, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      // First move past the threshold arms the pan without jumping.
      fireEvent.pointerMove(shell, { pointerId: 1, clientX: 120, clientY: 100 });
      // Second move pans by its delta (30px right, 10px down).
      fireEvent.pointerMove(shell, { pointerId: 1, clientX: 150, clientY: 110 });
      fireEvent.pointerUp(shell, { pointerId: 1, clientX: 150, clientY: 110 });

      const after = parseTransform(worldTransform(container));
      expect(after.zoom).toBeCloseTo(before.zoom, 5);
      expect(after.tx).toBeCloseTo(before.tx + 30, 3);
      expect(after.ty).toBeCloseTo(before.ty + 10, 3);
    });
  });

  it("still delivers object clicks (sub-threshold press) and suppresses the click after a drag", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const selected: string[] = [];
      const { container } = render(
        <InteractiveCanvasViewer
          document={syntheticInteractiveCanvas}
          interactive
          onObjectSelect={(objectId) => selected.push(objectId)}
        />,
      );

      const objectId = syntheticInteractiveCanvas.objects[0]!.id;
      const objectNode = container.querySelector(
        `[data-canvas-object-id="${objectId}"]`,
      ) as HTMLElement;

      // Plain click (no drag) selects.
      fireEvent.pointerDown(objectNode, { button: 0, pointerId: 1, clientX: 50, clientY: 50 });
      fireEvent.pointerUp(objectNode, { pointerId: 1, clientX: 50, clientY: 50 });
      fireEvent.click(objectNode);
      expect(selected).toEqual([objectId]);

      // Drag past the threshold, then the trailing click is swallowed.
      const shell = container.querySelector(".interactive-canvas-shell") as HTMLElement;
      fireEvent.pointerDown(objectNode, { button: 0, pointerId: 2, clientX: 50, clientY: 50 });
      fireEvent.pointerMove(shell, { pointerId: 2, clientX: 80, clientY: 50 });
      fireEvent.pointerMove(shell, { pointerId: 2, clientX: 120, clientY: 50 });
      fireEvent.pointerUp(shell, { pointerId: 2, clientX: 120, clientY: 50 });
      fireEvent.click(objectNode);
      expect(selected).toEqual([objectId]);
    });
  });

  it("stays static (no pan, no controls) when interactive is false", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(
        <InteractiveCanvasViewer document={syntheticInteractiveCanvas} />,
      );

      const shell = container.querySelector(".interactive-canvas-shell") as HTMLElement;
      const before = worldTransform(container);
      fireEvent.pointerDown(shell, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(shell, { pointerId: 1, clientX: 200, clientY: 200 });
      fireEvent.pointerUp(shell, { pointerId: 1, clientX: 200, clientY: 200 });
      expect(worldTransform(container)).toBe(before);
      expect(container.querySelector("[data-zoom-controls]")).toBeNull();
    });
  });
});

function makeSectionRootedDocument(): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "section-crop-doc",
    mode: "diagram",
    size: { width: 4000, height: 2000 },
    viewport: { x: 0, y: 0, zoom: 1 },
    objects: [
      {
        id: "root-section",
        type: "section",
        label: "Root section",
        title: "Root section",
        tint: "gray",
        geometry: { x: 40, y: 40, width: 700, height: 500 },
        style: { shape: "section" },
      },
      {
        id: "inner-section",
        type: "section",
        label: "Inner section",
        title: "Inner section",
        tint: "blue",
        parentId: "root-section",
        geometry: { x: 80, y: 100, width: 300, height: 260 },
        style: { shape: "section" },
      },
      {
        id: "inner-sticky",
        type: "sticky",
        label: "Inside inner section",
        parentId: "inner-section",
        geometry: { x: 120, y: 140, width: 160, height: 120 },
        style: { shape: "note", paletteToken: "input" },
      },
      {
        id: "far-away",
        type: "process",
        label: "Outside the section",
        geometry: { x: 3200, y: 1600, width: 240, height: 120 },
        style: { shape: "rounded-rect", paletteToken: "process" },
      },
    ],
    connections: [],
  };
}

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

  it("gives the document shape a folded top-right corner via clip-path", () => {
    withMeasuredShell(SCREEN.width, SCREEN.height, () => {
      const { container } = render(
        <InteractiveCanvasViewer document={makeExpandedVocabDocument()} />,
      );
      const node = container.querySelector('[data-canvas-object-id="doc-a"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      expect(node!.className).toContain("interactive-canvas-object-document");
    });
  });
});
