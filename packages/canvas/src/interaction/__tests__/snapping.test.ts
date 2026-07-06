import { describe, expect, it } from "bun:test";
import { CANVAS_GRID_SIZE, type CanvasBounds } from "../../state/geometry";
import {
  applyGridFallback,
  computeSnapGuides,
  computeSpacingHints,
  isGridAligned,
} from "../snapping";

const EPSILON = 1e-6;

function expectClose(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThan(EPSILON);
}

function bounds(x: number, y: number, width = 40, height = 40): CanvasBounds {
  return { x, y, width, height };
}

describe("snapping", () => {
  describe("computeSnapGuides", () => {
    it("detects edge and center guides within threshold", () => {
      const moving = bounds(103, 92, 40, 40);
      const other = bounds(40, 80, 60, 60);
      const snap = computeSnapGuides(moving, [other], 5);

      expectClose(snap.dx, -3);
      expectClose(snap.dy, -2);
      expect(snap.guides).toHaveLength(2);

      const xGuide = snap.guides.find((guide) => guide.axis === "x");
      const yGuide = snap.guides.find((guide) => guide.axis === "y");
      expect(xGuide).toBeDefined();
      expect(yGuide).toBeDefined();
      expectClose(xGuide!.position, 100);
      expectClose(yGuide!.position, 110);
    });

    it("uses the closest match when multiple candidates are within threshold", () => {
      const moving = bounds(103, 0);
      const farther = bounds(58, 0, 40, 40);
      const closer = bounds(62, 80, 40, 40);
      const snap = computeSnapGuides(moving, [farther, closer], 6);

      expectClose(snap.dx, -1);
      expectClose(snap.guides.find((guide) => guide.axis === "x")!.position, 102);
    });

    it("merges tied matches into one guide spanning all tied bounds", () => {
      const moving = bounds(103, 50, 40, 40);
      const upper = bounds(60, -20, 40, 40);
      const lower = bounds(60, 150, 40, 40);
      const snap = computeSnapGuides(moving, [upper, lower], 5);
      const xGuide = snap.guides.find((guide) => guide.axis === "x");

      expectClose(snap.dx, -3);
      expect(xGuide).toBeDefined();
      expectClose(xGuide!.position, 100);
      expectClose(xGuide!.span.start, -20);
      expectClose(xGuide!.span.end, 190);
    });

    it("returns zero corrections when candidates are outside threshold", () => {
      const snap = computeSnapGuides(bounds(0, 0), [bounds(500, 500)], 4);

      expect(snap.dx).toBe(0);
      expect(snap.dy).toBe(0);
      expect(snap.guides).toEqual([]);
    });

    it("caps candidates while preserving nearby matches", () => {
      const moving = bounds(103, 0);
      const farCandidates = Array.from({ length: 150 }, (_, index) => bounds(10_000 + index * 100, 10_000));
      const nearby = bounds(60, 0);
      const snap = computeSnapGuides(moving, [...farCandidates, nearby], 5);

      expectClose(snap.dx, -3);
      expectClose(snap.guides.find((guide) => guide.axis === "x")!.position, 100);
    });
  });

  describe("computeSpacingHints", () => {
    it("detects equal horizontal gaps anchored on the moving object", () => {
      const moving = bounds(60, 0, 40, 40);
      const hints = computeSpacingHints(moving, [bounds(0, 0, 40, 40), bounds(120, 0, 40, 40)], "x");

      expect(hints).toHaveLength(1);
      expect(hints[0]!.axis).toBe("x");
      expectClose(hints[0]!.gap, 20);
      // cross = midpoint of the flanking bounds' vertical overlap (0..40 -> 20),
      // so gap chips render centered on the row being measured.
      expect(hints[0]!.segments).toEqual([
        { start: 40, end: 60, cross: 20 },
        { start: 100, end: 120, cross: 20 },
      ]);
    });

    it("detects equal vertical gaps anchored on the moving object", () => {
      const moving = bounds(0, 60, 40, 40);
      const hints = computeSpacingHints(moving, [bounds(0, 0, 40, 40), bounds(0, 120, 40, 40)], "y");

      expect(hints).toHaveLength(1);
      expect(hints[0]!.axis).toBe("y");
      expectClose(hints[0]!.gap, 20);
      expect(hints[0]!.segments).toEqual([
        { start: 40, end: 60, cross: 20 },
        { start: 100, end: 120, cross: 20 },
      ]);
    });
  });

  describe("grid fallback helpers", () => {
    it("applies grid fallback only when drag started grid aligned", () => {
      expect(applyGridFallback(29, false, true)).toBe(32);
      expect(applyGridFallback(29.4, false, false)).toBe(29);
      expect(applyGridFallback(29.4, true, true)).toBe(29.4);
      expect(applyGridFallback(23, false, true, 10)).toBe(20);
    });

    it("detects grid alignment within epsilon", () => {
      expect(isGridAligned(CANVAS_GRID_SIZE * 3)).toBe(true);
      expect(isGridAligned(CANVAS_GRID_SIZE * 3 + 0.005)).toBe(true);
      expect(isGridAligned(CANVAS_GRID_SIZE * 3 + 0.5)).toBe(false);
      expect(isGridAligned(30, 10)).toBe(true);
    });
  });
});
