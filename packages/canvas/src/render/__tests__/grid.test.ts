import { describe, expect, it } from "bun:test";
import {
  BASE_DOT_RADIUS_PX,
  BASE_GRID_STEP,
  gridBackground,
  MAX_DOT_RADIUS_PX,
  MAX_SCREEN_STEP_PX,
  MIN_DOT_RADIUS_PX,
  MIN_SCREEN_STEP_PX,
} from "../grid";

describe("gridBackground", () => {
  it("keeps the base step at scale 1", () => {
    const result = gridBackground(1, { x: 0, y: 0 });
    expect(result.backgroundSize).toBe(`${BASE_GRID_STEP}px ${BASE_GRID_STEP}px`);
    expect(result.dotRadius).toBeCloseTo(BASE_DOT_RADIUS_PX, 6);
  });

  it("doubles the effective step when zoomed out past the min screen threshold", () => {
    // At scale 1, BASE_GRID_STEP (8) * scale stays within [6.5, 13]. Zooming
    // out far enough that 8*scale < MIN_SCREEN_STEP_PX should double the
    // world step (to 16) so the on-screen pitch re-enters the legible band.
    const scale = (MIN_SCREEN_STEP_PX / BASE_GRID_STEP) * 0.5; // forces one halving-of-density (doubled step)
    const result = gridBackground(scale, { x: 0, y: 0 });
    const sizePx = parseFloat(result.backgroundSize);
    expect(sizePx).toBeGreaterThanOrEqual(MIN_SCREEN_STEP_PX - 1e-6);
    expect(sizePx).toBeLessThanOrEqual(MAX_SCREEN_STEP_PX + 1e-6);
  });

  it("halves the effective step when zoomed in past the max screen threshold", () => {
    const scale = (MAX_SCREEN_STEP_PX / BASE_GRID_STEP) * 2; // forces one step halving
    const result = gridBackground(scale, { x: 0, y: 0 });
    const sizePx = parseFloat(result.backgroundSize);
    expect(sizePx).toBeGreaterThanOrEqual(MIN_SCREEN_STEP_PX - 1e-6);
    expect(sizePx).toBeLessThanOrEqual(MAX_SCREEN_STEP_PX + 1e-6);
  });

  it("stays within the screen-space band across a wide range of zoom levels", () => {
    for (const scale of [0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 8]) {
      const result = gridBackground(scale, { x: 0, y: 0 });
      const sizePx = parseFloat(result.backgroundSize);
      expect(sizePx).toBeGreaterThanOrEqual(MIN_SCREEN_STEP_PX - 1e-6);
      expect(sizePx).toBeLessThanOrEqual(MAX_SCREEN_STEP_PX + 1e-6);
      expect(result.dotRadius).toBeGreaterThanOrEqual(MIN_DOT_RADIUS_PX - 1e-6);
      expect(result.dotRadius).toBeLessThanOrEqual(MAX_DOT_RADIUS_PX + 1e-6);
    }
  });

  it("keeps high-zoom grid dots nonempty and smaller than the pitch", () => {
    for (const scale of [4, 8]) {
      const result = gridBackground(scale, { x: 0, y: 0 });
      const sizePx = parseFloat(result.backgroundSize);
      expect(sizePx).toBeGreaterThanOrEqual(MIN_SCREEN_STEP_PX - 1e-6);
      expect(sizePx).toBeLessThanOrEqual(MAX_SCREEN_STEP_PX + 1e-6);
      expect(result.dotRadius).toBeGreaterThan(0);
      expect(result.dotRadius * 2).toBeLessThan(sizePx);
    }
  });

  it("tracks translate in backgroundPosition proportional to scale", () => {
    const scale = 2;
    const result = gridBackground(scale, { x: 10, y: -5 });
    expect(result.backgroundPosition).toBe("-20px 10px");
  });

  it("moves backgroundPosition continuously as translate changes at a fixed scale", () => {
    const a = gridBackground(1, { x: 0, y: 0 });
    const b = gridBackground(1, { x: 5, y: 5 });
    expect(a.backgroundPosition).toBe("0px 0px");
    expect(b.backgroundPosition).toBe("-5px -5px");
  });

  it("is deterministic for identical inputs", () => {
    const a = gridBackground(1.3, { x: 12, y: -8 });
    const b = gridBackground(1.3, { x: 12, y: -8 });
    expect(a).toEqual(b);
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

    it("reproduces the 21% zoom observation: 32px logical, ~6.9px on screen", () => {
      const zoom = 0.21;
      const result = gridBackground(zoom, { x: 0, y: 0 });
      const screenSpacingPx = parseFloat(result.backgroundSize);
      const logicalStepPx = screenSpacingPx / zoom;

      expect(logicalStepPx).toBe(32);
      // within the observed 6.9px screen measurement (33px logical was the
      // raw sample; 32px — the same n=2 tier — reproduces it within noise)
      expect(Math.abs(screenSpacingPx - 6.9)).toBeLessThan(0.2);
    });

    it("both observed zooms land in the same step tier (n=2, step=32)", () => {
      const zoomA = 0.305;
      const zoomB = 0.21;
      const a = gridBackground(zoomA, { x: 0, y: 0 });
      const b = gridBackground(zoomB, { x: 0, y: 0 });
      const logicalStepA = parseFloat(a.backgroundSize) / zoomA;
      const logicalStepB = parseFloat(b.backgroundSize) / zoomB;
      expect(logicalStepA).toBe(logicalStepB);
      expect(logicalStepA).toBe(32);
    });
  });
});
