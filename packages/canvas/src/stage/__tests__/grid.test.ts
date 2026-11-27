import { describe, expect, it } from "bun:test";
import { BASE_GRID_STEP, gridBackground, MAX_DOT_RADIUS_PX, MAX_SCREEN_STEP_PX, MIN_DOT_RADIUS_PX, MIN_SCREEN_STEP_PX } from "../grid";

describe("gridBackground", () => {
  it("keeps zoomed-out spacing inside the legible screen-space band", () => {
    for (const scale of [0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5]) {
      const result = gridBackground(scale, { x: 0, y: 0 });
      const sizePx = parseFloat(result.backgroundSize);
      expect(sizePx).toBeGreaterThanOrEqual(MIN_SCREEN_STEP_PX - 1e-6);
      expect(sizePx).toBeLessThanOrEqual(MAX_SCREEN_STEP_PX + 1e-6);
      expect(result.dotRadius).toBeGreaterThanOrEqual(MIN_DOT_RADIUS_PX - 1e-6);
      expect(result.dotRadius).toBeLessThanOrEqual(MAX_DOT_RADIUS_PX + 1e-6);
    }
  });

  it("lets high-zoom spacing grow with zoom instead of subdividing densely", () => {
    for (const scale of [2, 3, 4, 8]) {
      const result = gridBackground(scale, { x: 0, y: 0 });
      const sizePx = parseFloat(result.backgroundSize);
      expect(sizePx).toBe(BASE_GRID_STEP * scale);
      expect(sizePx).toBeGreaterThan(MAX_SCREEN_STEP_PX);
      expect(result.dotRadius).toBeGreaterThanOrEqual(MIN_DOT_RADIUS_PX - 1e-6);
      expect(result.dotRadius).toBeLessThanOrEqual(MAX_DOT_RADIUS_PX + 1e-6);
    }
  });

  it("tracks translate in backgroundPosition proportional to scale", () => {
    const scale = 2;
    const result = gridBackground(scale, { x: 10, y: -5 });
    expect(result.backgroundPosition).toBe("-20px 10px");
  });

  describe("FigJam ground-truth reproduction (figjam-style-tokens.json canvas.gridDot.observed)", () => {
    // Both pixel-sampled frames report ~32px logical spacing even though
    // they were captured at different zoom levels (30.5% and 21%) — this is
    // the adaptive grid law's signature: 8 * 2^2 = 32 is the step tier that
    // keeps on-screen spacing inside [6.5, 13]px across both zooms.
    it("reproduces the 30.5% zoom observation: 32px logical, ~9.8px on screen", () => {
      const zoom = 0.305;
      const result = gridBackground(zoom, { x: 0, y: 0 });
      // backgroundSize is the on-screen spacing (logicalStep * zoom); recover
      // the logical step by dividing back out.
      const screenSpacingPx = parseFloat(result.backgroundSize);
      const logicalStepPx = screenSpacingPx / zoom;

      expect(logicalStepPx).toBe(32);
      // within the observed 9.8px screen measurement, tolerant of rounding
      expect(Math.abs(screenSpacingPx - 9.8)).toBeLessThan(0.1);
    });
  });
});
