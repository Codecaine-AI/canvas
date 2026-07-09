import { describe, expect, it } from "bun:test";
import {
  ALIGN_THRESHOLD,
  ALIGNMENT_GUIDE_COLOR,
  alignDistributeHorizontally,
  alignDistributeVertically,
  calculateClosestDistances,
  DISTRIBUTION_GUIDE_COLOR,
  type SnapBounds,
} from "../snap-distribution";

function box(x: number, y: number, width: number, height: number): SnapBounds {
  return { x, y, width, height };
}

describe("vendored blocksuite snap-distribution constants", () => {
  it("matches upstream ALIGN_THRESHOLD and guide colors", () => {
    expect(ALIGN_THRESHOLD).toBe(8);
    expect(ALIGNMENT_GUIDE_COLOR).toBe("#8B5CF6");
    expect(DISTRIBUTION_GUIDE_COLOR).toBe("#CC4187");
  });
});

describe("alignDistributeHorizontally", () => {
  it("snaps a box positioned between two evenly-spaced siblings into the exact equal-gap slot", () => {
    // Left box [0,0,100,100], right box [300,0,100,100] -> the equalized
    // gap-of-100 slot for a 100-wide moving box sits at x=150 (center 200).
    const left = box(0, 0, 100, 100);
    const right = box(300, 0, 100, 100);
    // Moving box currently centered at 205 (close to, but not exactly, 200).
    const moving = box(155, 0, 100, 100);

    const { dx, guides } = alignDistributeHorizontally(moving, [left, right], 8, 1);

    expect(dx).toBeCloseTo(-5, 5); // 205 + dx = 200
    expect(guides.length).toBeGreaterThanOrEqual(2);
  });

  it("produces chained equal-gap guides across 3+ boxes at identical spacing", () => {
    // a=[0,100], c=[400,500], d=[600,700]: the moving box (width 100) lands in
    // the [200,300] slot between a and c (gap 100 on each side), and the c->d
    // gap is also exactly 100, so the chain should discover d on the right.
    const a = box(0, 0, 100, 100);
    const c = box(400, 0, 100, 100);
    const d = box(600, 0, 100, 100); // gap c->d = 100, matches the snap spacing
    const moving = box(202, 0, 100, 100); // center 252, close to the slot center 250

    const { dx, guides } = alignDistributeHorizontally(moving, [a, c, d], 8, 1);

    expect(dx).toBeCloseTo(-2, 5); // 252 + dx = 250
    // Expect 3 guide segments: the two flanking the matched a<->c pair, plus the chained c->d gap.
    expect(guides.length).toBe(3);
  });

  it("returns dx=0 and no guides when nothing is within threshold", () => {
    const left = box(0, 0, 100, 100);
    const right = box(3000, 0, 100, 100);
    const moving = box(1400, 0, 100, 100);

    const { dx, guides } = alignDistributeHorizontally(moving, [left, right], 8, 1);
    expect(dx).toBe(0);
    expect(guides).toEqual([]);
  });

  it("scales the threshold check correctly (zoom affects guide offset, not the dx search itself since threshold is pre-divided by caller)", () => {
    const left = box(0, 0, 100, 100);
    const right = box(300, 0, 100, 100);
    const moving = box(152, 0, 100, 100);

    const atZoom1 = alignDistributeHorizontally(moving, [left, right], 8, 1);
    const atZoom2 = alignDistributeHorizontally(moving, [left, right], 8, 2);

    expect(atZoom1.dx).toBeCloseTo(atZoom2.dx, 5);
  });
});

describe("alignDistributeVertically", () => {
  it("snaps a box positioned between two evenly-spaced siblings into the exact equal-gap slot", () => {
    const upper = box(0, 0, 100, 100);
    const lower = box(0, 300, 100, 100);
    const moving = box(0, 155, 100, 100);

    const { dy, guides } = alignDistributeVertically(moving, [upper, lower], 8, 1);

    expect(dy).toBeCloseTo(-5, 5);
    expect(guides.length).toBeGreaterThanOrEqual(2);
  });

  it("chains equal-gap guides across vertically-stacked boxes even when their X centers are NOT in Y order (regression for the fixed upstream axis bug)", () => {
    // Deliberately give the boxes X centers that DISAGREE with their Y order
    // (top has X-center 150, mid — the vertically middle box — has the
    // LARGEST X-center 350, bottom has X-center 200): a center[0]-sort (the
    // literal upstream bug) would process/pair these boxes out of Y sequence
    // and fail to find the 3-box chain. Our fix sorts/compares on the Y axis,
    // so the chain must still be found correctly regardless of X ordering.
    const top = box(0, 0, 300, 100); // X center 150, Y [0,100]
    const mid = box(200, 400, 300, 100); // X center 350, Y [400,500]
    const bottom = box(50, 600, 300, 100); // X center 200, Y [600,700]
    const moving = box(100, 202, 100, 100); // Y center 252, near the slot center 250 between top and mid

    const { dy, guides } = alignDistributeVertically(moving, [top, mid, bottom], 8, 1);

    expect(dy).toBeCloseTo(-2, 5); // 252 + dy = 250
    // Expect 3 guides: the two flanking the matched top<->mid pair, plus the chained mid->bottom gap.
    expect(guides.length).toBe(3);
  });

  it("returns dy=0 and no guides when nothing is within threshold", () => {
    const upper = box(0, 0, 100, 100);
    const lower = box(0, 3000, 100, 100);
    const moving = box(0, 1400, 100, 100);

    const { dy, guides } = alignDistributeVertically(moving, [upper, lower], 8, 1);
    expect(dy).toBe(0);
    expect(guides).toEqual([]);
  });
});

describe("calculateClosestDistances", () => {
  it("finds center-to-center alignment as the closest distance when centers nearly coincide", () => {
    const moving = box(0, 0, 100, 100); // center (50,50)
    const other = box(2, 0, 100, 100); // center (52,50) -> horiz center-center distance 2

    const result = calculateClosestDistances(moving, other, 8);
    expect(result.horiz).toBeDefined();
    expect(result.horiz!.distance).toBeCloseTo(2, 5);
  });

  it("returns undefined for an axis beyond threshold", () => {
    const moving = box(0, 0, 100, 100);
    const other = box(500, 500, 100, 100);

    const result = calculateClosestDistances(moving, other, 8);
    expect(result.horiz).toBeUndefined();
    expect(result.vert).toBeUndefined();
  });

  it("detects left-edge-to-left-edge alignment", () => {
    const moving = box(10, 0, 100, 100);
    const other = box(12, 200, 80, 50); // left edges 10 vs 12 -> distance 2

    const result = calculateClosestDistances(moving, other, 8);
    expect(result.horiz).toBeDefined();
    expect(result.horiz!.distance).toBeCloseTo(2, 5);
  });

  it("reports multiple tied alignPositionIndices when several distance types coincide", () => {
    // Two identical-size boxes stacked with matching left AND right edges
    // (same width, same X) should tie on left-left and right-right indices.
    const moving = box(0, 0, 100, 100);
    const other = box(0, 300, 100, 100);

    const result = calculateClosestDistances(moving, other, 8);
    expect(result.horiz).toBeDefined();
    // center-center(0), left-left(3), right-right(6) should all be ~0 and tie.
    expect(result.horiz!.alignPositionIndices.length).toBeGreaterThanOrEqual(2);
  });
});
