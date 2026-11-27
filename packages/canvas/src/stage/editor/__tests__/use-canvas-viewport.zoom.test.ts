import { describe, expect, it } from "bun:test";
import { screenToWorld, worldToScreen, zoomAtPoint, type ViewportState } from "../../viewport";

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
  // The last row requests an absurdly small zoom, which zoomAtPoint clamps to
  // MIN_ZOOM; the invariant must still hold against the clamped result.
  it.each([
    ["zoom-in", { x: 100, y: 50, zoom: 1 }, { x: 320, y: 180 }, 1 * 1.2],
    ["zoom-out", { x: -40, y: 200, zoom: 2 }, { x: 12, y: 640 }, 2 / 1.2],
    ["min-zoom clamp", { x: 30, y: -10, zoom: 0.15 }, { x: 100, y: 100 }, 0.0001],
  ] as [string, ViewportState, { x: number; y: number }, number][])(
    "keeps the world point under the cursor fixed on screen across a single %s step",
    (_label, viewport, cursorScreen, requestedZoom) => {
      const cursorWorld = screenToWorld(viewport, cursorScreen);

      const zoomed = zoomAtPoint(viewport, cursorScreen, requestedZoom);

      // The same world point, reprojected through the new viewport, must land
      // back at the same screen coordinates the cursor was at.
      expectPointClose(worldToScreen(zoomed, cursorWorld), cursorScreen);
    },
  );

  it("holds across a compounded sequence of zoom steps at a fixed cursor point (simulating several coalesced wheel events)", () => {
    let viewport: ViewportState = { x: 0, y: 0, zoom: 1 };
    const cursorScreen = { x: 500, y: 300 };
    const cursorWorld = screenToWorld(viewport, cursorScreen);

    for (const factor of [1.2, 1.2, 1.2, 1 / 1.2]) {
      viewport = zoomAtPoint(viewport, cursorScreen, viewport.zoom * factor);
    }

    expectPointClose(worldToScreen(viewport, cursorWorld), cursorScreen);
  });
});
