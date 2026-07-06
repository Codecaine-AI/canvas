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

function objectGeometry(id: string): CanvasBounds {
  const object = syntheticCanvasDocument.objects.find((candidate) => candidate.id === id);
  if (!object) throw new Error(`Missing canvas JSON object: ${id}`);
  return object.geometry;
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
    it("includes transitive descendants for a top-level container", () => {
      const bounds = containerViewBounds(syntheticCanvasDocument, "interview-flow");
      const interviewFlow = objectGeometry("interview-flow");
      const userBrief = objectGeometry("user-brief");

      expect(bounds).not.toBeNull();
      if (!bounds) return;

      expect(bounds.width).toBeGreaterThanOrEqual(interviewFlow.width);
      expect(bounds.height).toBeGreaterThanOrEqual(interviewFlow.height);
      expectBoundsEncloses(bounds, interviewFlow);
      expectBoundsEncloses(bounds, userBrief);
    });

    it("includes children for a nested container", () => {
      const bounds = containerViewBounds(syntheticCanvasDocument, "input-context");
      const userBrief = objectGeometry("user-brief");
      const currentDocs = objectGeometry("current-docs");

      expect(bounds).not.toBeNull();
      if (!bounds) return;

      expectBoundsEncloses(bounds, objectGeometry("input-context"));
      expectBoundsEncloses(bounds, userBrief);
      expectBoundsEncloses(bounds, currentDocs);
    });

    it("returns null for non-container and unknown ids", () => {
      expect(containerViewBounds(syntheticCanvasDocument, "agent-summarizes")).toBeNull();
      expect(containerViewBounds(syntheticCanvasDocument, "does-not-exist")).toBeNull();
    });
  });
});
