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

  it("returns zero when band is non-positive", () => {
    const result = computeEdgePan({ x: 0, y: 0 }, STAGE, 0, MAX_SPEED);
    expect(result).toEqual({ dx: 0, dy: 0 });
  });

  it("returns zero when maxSpeed is non-positive", () => {
    const result = computeEdgePan({ x: 0, y: 0 }, STAGE, BAND, 0);
    expect(result).toEqual({ dx: 0, dy: 0 });
  });

  it("clamps to maxSpeed exactly at the left/top edge", () => {
    const result = computeEdgePan({ x: 0, y: 0 }, STAGE, BAND, MAX_SPEED);
    expect(result.dx).toBeCloseTo(-MAX_SPEED, 6);
    expect(result.dy).toBeCloseTo(-MAX_SPEED, 6);
  });

  it("clamps to maxSpeed exactly at the right/bottom edge", () => {
    const result = computeEdgePan({ x: STAGE.width, y: STAGE.height }, STAGE, BAND, MAX_SPEED);
    expect(result.dx).toBeCloseTo(MAX_SPEED, 6);
    expect(result.dy).toBeCloseTo(MAX_SPEED, 6);
  });

  it("clamps to maxSpeed when pointer is outside the stage bounds", () => {
    const result = computeEdgePan({ x: -50, y: -50 }, STAGE, BAND, MAX_SPEED);
    expect(result.dx).toBeCloseTo(-MAX_SPEED, 6);
    expect(result.dy).toBeCloseTo(-MAX_SPEED, 6);

    const resultFar = computeEdgePan(
      { x: STAGE.width + 50, y: STAGE.height + 50 },
      STAGE,
      BAND,
      MAX_SPEED,
    );
    expect(resultFar.dx).toBeCloseTo(MAX_SPEED, 6);
    expect(resultFar.dy).toBeCloseTo(MAX_SPEED, 6);
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

  it("computes both axes independently in a corner", () => {
    const result = computeEdgePan({ x: 5, y: 5 }, STAGE, BAND, MAX_SPEED);
    expect(result.dx).toBeLessThan(0);
    expect(result.dy).toBeLessThan(0);
    expect(Math.abs(result.dx)).toBeCloseTo(Math.abs(result.dy), 6);
  });

  it("returns zero on one axis while nonzero on the other", () => {
    const result = computeEdgePan({ x: 5, y: 300 }, STAGE, BAND, MAX_SPEED);
    expect(result.dx).toBeLessThan(0);
    expect(result.dy).toBeCloseTo(0, 6);
  });
});
