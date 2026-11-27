import { describe, expect, it } from "bun:test";
import { gridBackground, MAX_DOT_RADIUS_PX, MAX_SCREEN_STEP_PX, MIN_DOT_RADIUS_PX, MIN_SCREEN_STEP_PX } from "../grid";

describe("gridBackground", () => {
  it("keeps zoomed-out spacing inside the legible screen-space band", () => {
    for (const scale of [0.05, 0.1, 0.25, 0.40625, 0.5, 0.75, 1, 1.5]) {
      const result = gridBackground(scale, { x: 0, y: 0 });
      const sizePx = parseFloat(result.backgroundSize);
      expect(sizePx).toBeGreaterThanOrEqual(MIN_SCREEN_STEP_PX - 1e-6);
      expect(sizePx).toBeLessThanOrEqual(MAX_SCREEN_STEP_PX + 1e-6);
      expect(result.dotRadius).toBeGreaterThanOrEqual(MIN_DOT_RADIUS_PX - 1e-6);
      expect(result.dotRadius).toBeLessThanOrEqual(MAX_DOT_RADIUS_PX + 1e-6);
    }
    const base = gridBackground(1, { x: 0, y: 0 });
    expect(base.backgroundSize).toBe("8px 8px");
    expect(base.dotRadius).toBeCloseTo(1, 6);
  });

  it.each([
    [2, 16],
    [3, 24],
    [3.25, 26],
    [4, 32],
    [8, 64],
  ])("lets high-zoom spacing grow with zoom instead of subdividing densely (zoom %p -> %ppx)", (scale, expectedPx) => {
    const result = gridBackground(scale, { x: 0, y: 0 });
    const sizePx = parseFloat(result.backgroundSize);
    expect(sizePx).toBe(expectedPx);
    expect(sizePx).toBeGreaterThan(MAX_SCREEN_STEP_PX);
    expect(result.dotRadius).toBeGreaterThan(0);
    expect(result.dotRadius * 2).toBeLessThan(sizePx);
    expect(result.dotRadius).toBeGreaterThanOrEqual(MIN_DOT_RADIUS_PX - 1e-6);
    expect(result.dotRadius).toBeLessThanOrEqual(MAX_DOT_RADIUS_PX + 1e-6);
  });

  it.each([
    [2, { x: 10, y: -5 }, "-20px 10px"],
    [1, { x: 0, y: 0 }, "0px 0px"],
    [1, { x: 5, y: 5 }, "-5px -5px"],
  ])("tracks translate in backgroundPosition proportional to scale (zoom %p, translate %o)", (scale, translate, expected) => {
    expect(gridBackground(scale, translate).backgroundPosition).toBe(expected);
  });

  describe("FigJam ground-truth reproduction (figjam-style-tokens.json canvas.gridDot.observed)", () => {
    // Both pixel-sampled frames report ~32px logical spacing even though
    // they were captured at different zoom levels (30.5% and 21%) — this is
    // the adaptive grid law's signature: 8 * 2^2 = 32 is the step tier that
    // keeps on-screen spacing inside [6.5, 13]px across both zooms.
    it.each([
      [0.305, 9.8, 0.1],
      [0.21, 6.9, 0.2],
    ])(
      "reproduces the observed zoom %p in the same 32px logical tier, ~%ppx on screen",
      (zoom, observedScreenPx, tolerancePx) => {
        const result = gridBackground(zoom, { x: 0, y: 0 });
        // backgroundSize is the on-screen spacing (logicalStep * zoom); recover
        // the logical step by dividing back out.
        const screenSpacingPx = parseFloat(result.backgroundSize);
        const logicalStepPx = screenSpacingPx / zoom;

        expect(logicalStepPx).toBe(32);
        expect(Math.abs(screenSpacingPx - observedScreenPx)).toBeLessThan(tolerancePx);
      },
    );
  });
});
