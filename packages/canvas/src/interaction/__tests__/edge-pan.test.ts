import { describe, expect, it } from "bun:test";
import { computeEdgePan, type StageRect } from "../edge-pan";

const STAGE: StageRect = { width: 800, height: 600 };
const BAND = 40;
const MAX_SPEED = 20;

describe("computeEdgePan", () => {
  it("returns zero in the safe interior", () => {
    const result = computeEdgePan({ x: 400, y: 300 }, STAGE, BAND, MAX_SPEED);
    expect(result).toEqual({ dx: 0, dy: 0 });
  });

  it.each([
    { name: "maxSpeed", band: BAND, maxSpeed: 0 },
    { name: "band", band: 0, maxSpeed: MAX_SPEED },
  ])("returns zero when $name is non-positive", ({ band, maxSpeed }) => {
    const result = computeEdgePan({ x: 0, y: 0 }, STAGE, band, maxSpeed);
    expect(result).toEqual({ dx: 0, dy: 0 });
  });

  it.each([
    { where: "exactly at the left/top edge", pointer: { x: 0, y: 0 }, expected: -MAX_SPEED },
    { where: "exactly at the right/bottom edge", pointer: { x: 800, y: 600 }, expected: MAX_SPEED },
    { where: "outside the left/top bounds", pointer: { x: -50, y: -50 }, expected: -MAX_SPEED },
    { where: "outside the right/bottom bounds", pointer: { x: 850, y: 650 }, expected: MAX_SPEED },
  ])("clamps to maxSpeed $where", ({ pointer, expected }) => {
    const result = computeEdgePan(pointer, STAGE, BAND, MAX_SPEED);
    expect(result.dx).toBeCloseTo(expected, 6);
    expect(result.dy).toBeCloseTo(expected, 6);
  });

  it("ramps linearly with proximity to an edge", () => {
    // Halfway into the band from the left edge -> half of maxSpeed.
    const halfway = computeEdgePan({ x: BAND / 2, y: 300 }, STAGE, BAND, MAX_SPEED);
    expect(halfway.dx).toBeCloseTo(-MAX_SPEED / 2, 6);
    expect(halfway.dy).toBeCloseTo(0, 6);

    // Just inside the band boundary -> speed approaches 0.
    const nearBoundary = computeEdgePan({ x: BAND - 1, y: 300 }, STAGE, BAND, MAX_SPEED);
    expect(nearBoundary.dx).toBeCloseTo(-(MAX_SPEED * (1 / BAND)), 6);

    // Exactly at the band boundary -> speed is 0.
    const atBoundary = computeEdgePan({ x: BAND, y: 300 }, STAGE, BAND, MAX_SPEED);
    expect(atBoundary.dx).toBeCloseTo(0, 6);
  });

  it("computes each axis independently: zero on one axis, or both nonzero in a corner", () => {
    const result = computeEdgePan({ x: 5, y: 300 }, STAGE, BAND, MAX_SPEED);
    expect(result.dx).toBeLessThan(0);
    expect(result.dy).toBeCloseTo(0, 6);

    // 5px into a 40px band on both axes: 20 * (1 - 5/40) = 17.5 toward the corner.
    const corner = computeEdgePan({ x: 5, y: 5 }, STAGE, BAND, MAX_SPEED);
    expect(corner.dx).toBeCloseTo(-17.5, 6);
    expect(corner.dy).toBeCloseTo(-17.5, 6);
  });
});
