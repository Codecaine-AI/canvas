import { describe, expect, it } from "bun:test";
import syntheticCanvas from "../../../../../canvases/synthetic.canvas.json";
import type { CanvasBounds, CanvasPoint } from "../../state/geometry";
import type { InteractiveCanvasDocument } from "../../state/schema";
import {
  clampZoom,
  containerViewBounds,
  fitBounds,
  fitDocument,
  MAX_ZOOM,
  MIN_ZOOM,
  screenToWorld,
  worldToScreen,
  zoomAtPoint,
  type ScreenSize,
  type ViewportState,
} from "../../render/viewport";

const syntheticCanvasDocument = syntheticCanvas as InteractiveCanvasDocument;
const EPSILON = 1e-6;

function expectClose(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThan(EPSILON);
}

function expectPointClose(actual: CanvasPoint, expected: CanvasPoint): void {
  expectClose(actual.x, expected.x);
  expectClose(actual.y, expected.y);
}

function expectBoundsEncloses(bounds: CanvasBounds, geometry: CanvasBounds): void {
  expect(bounds.x).toBeLessThanOrEqual(geometry.x);
  expect(bounds.y).toBeLessThanOrEqual(geometry.y);
  expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(geometry.x + geometry.width);
  expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(geometry.y + geometry.height);
}

describe("viewport", () => {
  describe("coordinate conversion", () => {
    it("round-trips world points through screen coordinates", () => {
      const viewportBase = { x: -128, y: 96 };
      const points: CanvasPoint[] = [
        { x: 0, y: 0 },
        { x: 144.5, y: -32.25 },
        { x: 2048, y: 1536 },
      ];

      for (const zoom of [0.25, 1, 2.5]) {
        const viewport: ViewportState = { ...viewportBase, zoom };

        for (const point of points) {
          expectPointClose(screenToWorld(viewport, worldToScreen(viewport, point)), point);
        }
      }
    });
  });

  describe("zoomAtPoint", () => {
    it("keeps the world point under the cursor anchored when zooming in and out", () => {
      const viewport: ViewportState = { x: 120, y: -80, zoom: 1.25 };
      const screenPoint: CanvasPoint = { x: 300, y: 200 };

      for (const nextZoom of [2.5, 0.5]) {
        const anchoredWorldPoint = screenToWorld(viewport, screenPoint);
        const nextViewport = zoomAtPoint(viewport, screenPoint, nextZoom);

        expectPointClose(worldToScreen(nextViewport, anchoredWorldPoint), screenPoint);
      }
    });
  });

  describe("clampZoom", () => {
    it("clamps zoom to supported bounds", () => {
      expect(clampZoom(0)).toBe(MIN_ZOOM);
      expect(clampZoom(100)).toBe(MAX_ZOOM);
      expect(clampZoom(1)).toBe(1);
      expect(clampZoom(MIN_ZOOM)).toBe(MIN_ZOOM);
      expect(clampZoom(MAX_ZOOM)).toBe(MAX_ZOOM);
    });
  });

  describe("fitBounds", () => {
    it("centers smaller bounds without upscaling past 1", () => {
      const bounds: CanvasBounds = { x: 320, y: -180, width: 100, height: 100 };
      const screen: ScreenSize = { width: 2000, height: 2000 };
      const viewport = fitBounds(bounds, screen);
      const center = {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      };

      expect(viewport.zoom).toBe(1);
      expectPointClose(worldToScreen(viewport, center), {
        x: screen.width / 2,
        y: screen.height / 2,
      });
      expect(viewport.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
      expect(viewport.zoom).toBeLessThanOrEqual(1);
    });

    it("scales larger bounds using padded screen fit", () => {
      const bounds: CanvasBounds = { x: -600, y: 240, width: 4000, height: 3000 };
      const screen: ScreenSize = { width: 800, height: 600 };
      const padding = 48;
      const viewport = fitBounds(bounds, screen, padding);
      const expectedZoom = Math.min(
        screen.width / (bounds.width + padding * 2),
        screen.height / (bounds.height + padding * 2),
        1,
      );

      expectClose(viewport.zoom, expectedZoom);
      expect(viewport.zoom).toBeGreaterThan(0);
      expect(viewport.zoom).toBeLessThan(1);
      expect(viewport.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
      expect(viewport.zoom).toBeLessThanOrEqual(1);
    });
  });

  describe("fitDocument", () => {
    it("returns a finite viewport for the synthetic canvas", () => {
      const viewport = fitDocument(syntheticCanvasDocument, { width: 1600, height: 900 });

      expect(Number.isFinite(viewport.x)).toBe(true);
      expect(Number.isFinite(viewport.y)).toBe(true);
      expect(Number.isFinite(viewport.zoom)).toBe(true);
      expect(viewport.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
      expect(viewport.zoom).toBeLessThanOrEqual(1);
    });
  });

  describe("containerViewBounds", () => {
    // Sections are the only grouping object; membership is the persisted
    // parentId chain, so the fixture wires descendants explicitly.
    const sectionDocument: InteractiveCanvasDocument = {
      schemaVersion: 1,
      id: "section-view-bounds",
      mode: "diagram",
      objects: [
        {
          id: "outer-section",
          type: "section",
          text: "Outer Section",
          tint: "gray",
          parentId: null,
          geometry: { x: 80, y: 80, width: 600, height: 400 },
        },
        {
          id: "inner-section",
          type: "section",
          text: "Inner Section",
          tint: "blue",
          parentId: "outer-section",
          geometry: { x: 120, y: 140, width: 320, height: 240 },
        },
        {
          id: "inner-child",
          type: "process",
          text: "Inner Child",
          parentId: "inner-section",
          geometry: { x: 160, y: 180, width: 180, height: 90 },
        },
        {
          id: "overflowing-child",
          type: "sticky",
          text: "",
          parentId: "outer-section",
          geometry: { x: 640, y: 460, width: 160, height: 120 },
        },
        {
          id: "unparented-rectangle",
          type: "rectangle",
          text: "Unparented Rectangle",
          parentId: null,
          geometry: { x: 2000, y: 2000, width: 360, height: 240 },
        },
      ],
      connections: [],
    };

    function sectionObjectGeometry(id: string): CanvasBounds {
      const object = sectionDocument.objects.find((candidate) => candidate.id === id);
      if (!object) throw new Error(`Missing fixture object: ${id}`);
      return object.geometry;
    }

    it("includes transitive parentId descendants for a root section", () => {
      const bounds = containerViewBounds(sectionDocument, "outer-section");
      const outerSection = sectionObjectGeometry("outer-section");

      expect(bounds).not.toBeNull();
      if (!bounds) return;

      expect(bounds.width).toBeGreaterThanOrEqual(outerSection.width);
      expect(bounds.height).toBeGreaterThanOrEqual(outerSection.height);
      expectBoundsEncloses(bounds, outerSection);
      expectBoundsEncloses(bounds, sectionObjectGeometry("inner-section"));
      expectBoundsEncloses(bounds, sectionObjectGeometry("inner-child"));
      expectBoundsEncloses(bounds, sectionObjectGeometry("overflowing-child"));
    });

    it("excludes objects outside the parentId chain", () => {
      const bounds = containerViewBounds(sectionDocument, "outer-section");
      const outsider = sectionObjectGeometry("unparented-rectangle");

      expect(bounds).not.toBeNull();
      if (!bounds) return;

      expect(bounds.x + bounds.width).toBeLessThan(outsider.x);
      expect(bounds.y + bounds.height).toBeLessThan(outsider.y);
    });

    it("includes recorded children for a nested section", () => {
      const bounds = containerViewBounds(sectionDocument, "inner-section");

      expect(bounds).not.toBeNull();
      if (!bounds) return;

      expectBoundsEncloses(bounds, sectionObjectGeometry("inner-section"));
      expectBoundsEncloses(bounds, sectionObjectGeometry("inner-child"));
    });

    it("returns null for non-section and unknown ids", () => {
      // Rectangles (the ex-container type) are dumb shapes, not view targets.
      expect(containerViewBounds(sectionDocument, "unparented-rectangle")).toBeNull();
      expect(containerViewBounds(syntheticCanvasDocument, "interview-flow")).toBeNull();
      expect(containerViewBounds(syntheticCanvasDocument, "agent-summarizes")).toBeNull();
      expect(containerViewBounds(syntheticCanvasDocument, "does-not-exist")).toBeNull();
    });
  });
});
