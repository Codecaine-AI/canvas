import { describe, expect, it } from "bun:test";
import { screenToWorld, worldToScreen, zoomAtPoint, type ViewportState } from "../viewport";

/**
 * T1.1.2 requires cursor-anchored zoom: the world point currently under the
 * cursor must stay fixed on screen across a zoom step. use-canvas-viewport.ts
 * wires wheel/pinch events through screenToWorld + zoomAtPoint (both pure,
 * viewport.ts) and only adds rAF-coalescing on top (a scheduling concern, not
 * a math one) — so the invariant itself is tested directly against the pure
 * viewport math, which is what actually guarantees correctness regardless of
 * how many wheel events get coalesced into one commit.
 */
const EPSILON = 1e-9;

function expectPointClose(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThan(EPSILON);
  expect(Math.abs(actual.y - expected.y)).toBeLessThan(EPSILON);
}

describe("cursor-anchored zoom invariance (T1.1.2)", () => {
  it("keeps the world point under the cursor fixed on screen across a single zoom-in step", () => {
    const viewport: ViewportState = { x: 100, y: 50, zoom: 1 };
    const cursorScreen = { x: 320, y: 180 };
    const cursorWorld = screenToWorld(viewport, cursorScreen);

    const zoomed = zoomAtPoint(viewport, cursorScreen, viewport.zoom * 1.2);

    // The same world point, reprojected through the new viewport, must land
    // back at the same screen coordinates the cursor was at.
    expectPointClose(worldToScreen(zoomed, cursorWorld), cursorScreen);
  });

  it("keeps the world point under the cursor fixed across a zoom-out step", () => {
    const viewport: ViewportState = { x: -40, y: 200, zoom: 2 };
    const cursorScreen = { x: 12, y: 640 };
    const cursorWorld = screenToWorld(viewport, cursorScreen);

    const zoomed = zoomAtPoint(viewport, cursorScreen, viewport.zoom / 1.2);

    expectPointClose(worldToScreen(zoomed, cursorWorld), cursorScreen);
  });

  it("holds across a compounded sequence of zoom steps at a fixed cursor point (simulating several coalesced wheel events)", () => {
    let viewport: ViewportState = { x: 0, y: 0, zoom: 1 };
    const cursorScreen = { x: 500, y: 300 };
    const cursorWorld = screenToWorld(viewport, cursorScreen);

    for (const factor of [1.2, 1.2, 1.2, 1 / 1.2]) {
      viewport = zoomAtPoint(viewport, cursorScreen, viewport.zoom * factor);
    }

    expectPointClose(worldToScreen(viewport, cursorWorld), cursorScreen);
  });

  it("holds at the min/max zoom clamp boundaries", () => {
    const viewport: ViewportState = { x: 30, y: -10, zoom: 0.15 };
    const cursorScreen = { x: 100, y: 100 };
    const cursorWorld = screenToWorld(viewport, cursorScreen);

    // Requesting an absurdly small zoom clamps to MIN_ZOOM inside zoomAtPoint;
    // the invariant must still hold against the clamped result.
    const zoomed = zoomAtPoint(viewport, cursorScreen, 0.0001);
    expectPointClose(worldToScreen(zoomed, cursorWorld), cursorScreen);
  });
});
