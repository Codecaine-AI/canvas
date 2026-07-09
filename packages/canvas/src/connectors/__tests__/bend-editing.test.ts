import { describe, expect, it } from "bun:test";
import {
  commitBendPolyline,
  connectorBendSegments,
  dragOrthogonalSegment,
  simplifyOrthogonalPolyline,
} from "../bend-editing";
import type { CanvasPoint } from "../../state/geometry";

function p(x: number, y: number): CanvasPoint {
  return { x, y };
}

function expectOrthogonalPolyline(points: ReadonlyArray<CanvasPoint>) {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const dx = Math.abs(current.x - previous.x);
    const dy = Math.abs(current.y - previous.y);
    expect(dx <= 0.01 || dy <= 0.01).toBe(true);
  }
}

describe("connector bend editing", () => {
  it("finds every straight segment with midpoint and axis metadata", () => {
    const segments = connectorBendSegments([p(0, 0), p(80, 0), p(80, 60), p(160, 60)]);

    expect(segments).toEqual([
      {
        index: 0,
        start: p(0, 0),
        end: p(80, 0),
        midpoint: p(40, 0),
        handlePoint: p(40, 0),
        axis: "horizontal",
      },
      {
        index: 1,
        start: p(80, 0),
        end: p(80, 60),
        midpoint: p(80, 30),
        handlePoint: p(80, 30),
        axis: "vertical",
      },
      {
        index: 2,
        start: p(80, 60),
        end: p(160, 60),
        midpoint: p(120, 60),
        handlePoint: p(120, 60),
        axis: "horizontal",
      },
    ]);
  });

  it("finds one bend segment for a single straight connector run", () => {
    const segments = connectorBendSegments([p(100, 262), p(240, 262)]);

    expect(segments).toEqual([
      {
        index: 0,
        start: p(100, 262),
        end: p(240, 262),
        midpoint: p(170, 262),
        handlePoint: p(170, 262),
        axis: "horizontal",
      },
    ]);
  });

  it("uses explicit label clearance when the 25% bend handle point would overlap the chip", () => {
    const segments = connectorBendSegments([p(0, 0), p(200, 0)], {
      labelPoint: p(100, 0),
      labelClearancePx: 64,
    });

    expect(segments[0]?.handlePoint).toEqual(p(36, 0));
  });

  it("translates an interior segment only along its perpendicular axis", () => {
    const points = [p(0, 0), p(80, 0), p(80, 60), p(160, 60)];

    expect(dragOrthogonalSegment(points, 1, { dx: 25, dy: 80 })).toEqual([
      p(0, 0),
      p(105, 0),
      p(105, 60),
      p(160, 60),
    ]);
    expect(dragOrthogonalSegment(points, 0, { dx: 25, dy: 40 })[0]).toEqual(p(0, 0));
  });

  it("adds a bend when dragging a stub segment next to the start endpoint", () => {
    const points = [p(0, 0), p(80, 0), p(80, 60), p(160, 60)];

    expect(dragOrthogonalSegment(points, 0, { dx: 99, dy: 40 })).toEqual([
      p(0, 0),
      p(0, 40),
      p(80, 40),
      p(80, 60),
      p(160, 60),
    ]);
  });

  it("persists a stub-run-stub bend when dragging a direct endpoint-to-endpoint segment", () => {
    const preview = dragOrthogonalSegment([p(0, 0), p(160, 0)], 0, { dx: 99, dy: 40 });

    expect(preview).toEqual([
      p(0, 0),
      p(0, 40),
      p(160, 40),
      p(160, 0),
    ]);

    const commit = commitBendPolyline(preview, 8);
    expect(commit.clearedWaypoints).toBe(false);
    expect(commit.waypoints).toEqual([
      [0, 40],
      [160, 40],
    ]);
  });

  it("persists a route with exactly one interior corner", () => {
    const commit = commitBendPolyline([p(0, 0), p(80, 0), p(80, 60)], 8);

    expect(commit.interiorCornerCount).toBe(1);
    expect(commit.clearedWaypoints).toBe(false);
    expect(commit.waypoints).toEqual([[80, 0]]);
  });

  it("snaps a dragged segment collinear with its previous same-orientation segment", () => {
    const points = [p(0, 0), p(80, 0), p(80, 60), p(160, 60), p(160, 120)];
    const preview = dragOrthogonalSegment(points, 2, { dx: 0, dy: -54 }, {
      snapTolerance: 8,
      simplifyTolerance: 8,
    });

    expect(preview).toEqual([p(0, 0), p(160, 0), p(160, 120)]);

    const commit = commitBendPolyline(preview, 8);
    expect(commit.points).toEqual(preview);
    expect(commit.clearedWaypoints).toBe(false);
    expect(commit.waypoints).toEqual([[160, 0]]);
  });

  it("keeps every segment orthogonal when dragging an h,h,v,h,h route", () => {
    const points = [p(0, 0), p(40, 0), p(80, 0), p(80, 60), p(120, 60), p(160, 60)];
    const cases = [
      {
        segmentIndex: 0,
        expected: [p(0, 0), p(0, 30), p(40, 30), p(40, 0), p(80, 0), p(80, 60), p(120, 60), p(160, 60)],
      },
      {
        segmentIndex: 1,
        expected: [p(0, 0), p(40, 0), p(40, 30), p(80, 30), p(80, 60), p(120, 60), p(160, 60)],
      },
      {
        segmentIndex: 2,
        expected: [p(0, 0), p(40, 0), p(100, 0), p(100, 60), p(120, 60), p(160, 60)],
      },
      {
        segmentIndex: 3,
        expected: [p(0, 0), p(40, 0), p(80, 0), p(80, 90), p(120, 90), p(120, 60), p(160, 60)],
      },
      {
        segmentIndex: 4,
        expected: [p(0, 0), p(40, 0), p(80, 0), p(80, 60), p(120, 60), p(120, 90), p(160, 90), p(160, 60)],
      },
    ];

    for (const { segmentIndex, expected } of cases) {
      const preview = dragOrthogonalSegment(points, segmentIndex, { dx: 20, dy: 30 });
      expect(preview).toEqual(expected);
      expectOrthogonalPolyline(preview);
      expectOrthogonalPolyline(commitBendPolyline(preview, 8).points);
    }
  });

  it("inserts orthogonal joints on both sides of a dragged middle segment", () => {
    const preview = dragOrthogonalSegment(
      [p(0, 0), p(40, 0), p(80, 0), p(120, 0)],
      1,
      { dx: 0, dy: 30 },
    );

    expect(preview).toEqual([p(0, 0), p(40, 0), p(40, 30), p(80, 30), p(80, 0), p(120, 0)]);
    expectOrthogonalPolyline(preview);
    expectOrthogonalPolyline(commitBendPolyline(preview, 8).points);
  });

  it("keeps a dragged tiny off-axis jog orthogonal instead of clearing it to auto-route", () => {
    const points = [p(0, 0), p(24, 0), p(100, 0), p(100, 1), p(176, 1), p(200, 1)];
    const preview = dragOrthogonalSegment(points, 2, { dx: 71, dy: 0 }, {
      snapTolerance: 8,
      simplifyTolerance: 8,
    });

    expect(preview).toEqual([p(0, 0), p(24, 0), p(171, 0), p(171, 1), p(176, 1), p(200, 1)]);
    expectOrthogonalPolyline(preview);

    const commit = commitBendPolyline(preview, 8);
    expectOrthogonalPolyline(commit.points);
    expect(commit.clearedWaypoints).toBe(false);
    expect(commit.waypoints).toEqual([
      [171, 0],
      [171, 1],
    ]);
  });

  it("snaps a dragged middle run back to one straight route and clears waypoints", () => {
    const points = [p(0, 0), p(0, 80), p(160, 80), p(160, 0)];
    const preview = dragOrthogonalSegment(points, 1, { dx: 0, dy: -74 }, {
      snapTolerance: 8,
      simplifyTolerance: 8,
    });

    expect(preview).toEqual([p(0, 0), p(160, 0)]);

    const commit = commitBendPolyline(preview, 8);
    expect(commit.points).toEqual([p(0, 0), p(160, 0)]);
    expect(commit.clearedWaypoints).toBe(true);
    expect(commit.waypoints).toBeUndefined();
  });

  it("snaps a direct-segment bend back within tolerance and clears waypoints", () => {
    const bent = dragOrthogonalSegment([p(0, 0), p(160, 0)], 0, { dx: 0, dy: 40 });
    const preview = dragOrthogonalSegment(bent, 1, { dx: 0, dy: -34 }, {
      snapTolerance: 8,
      simplifyTolerance: 8,
    });

    expect(preview).toEqual([p(0, 0), p(160, 0)]);

    const commit = commitBendPolyline(preview, 8);
    expect(commit.points).toEqual([p(0, 0), p(160, 0)]);
    expect(commit.clearedWaypoints).toBe(true);
    expect(commit.waypoints).toBeUndefined();
  });

  it("auto-simplifies adjacent collinear segments without clearing a real remaining corner", () => {
    const simplified = simplifyOrthogonalPolyline([
      p(0, 0),
      p(40, 0),
      p(80, 1),
      p(80, 60),
      p(80, 61),
      p(160, 61),
    ]);

    expect(simplified).toEqual([p(0, 0), p(80, 0), p(80, 61), p(160, 61)]);

    const commit = commitBendPolyline([p(0, 0), p(80, 0), p(80, 60)]);
    expect(commit.interiorCornerCount).toBe(1);
    expect(commit.clearedWaypoints).toBe(false);
    expect(commit.waypoints).toEqual([[80, 0]]);
  });

  it("keeps a 20px kink outside the straight-snap window on a 3-segment route", () => {
    const points = [p(0, 0), p(0, 80), p(160, 80), p(160, 0)];
    const preview = dragOrthogonalSegment(points, 1, { dx: 0, dy: -60 }, {
      snapTolerance: 8,
      simplifyTolerance: 8,
    });

    expect(preview).toEqual([p(0, 0), p(0, 20), p(160, 20), p(160, 0)]);

    const commit = commitBendPolyline(preview, 8);
    expect(commit.points).toEqual(preview);
    expect(commit.clearedWaypoints).toBe(false);
    expect(commit.waypoints).toEqual([
      [0, 20],
      [160, 20],
    ]);
  });

  it("collapses degenerate hook segments shorter than the release tolerance", () => {
    const commit = commitBendPolyline([
      p(0, 0),
      p(80, 0),
      p(80, 6),
      p(120, 6),
      p(120, 0),
      p(160, 0),
    ], 8);

    expect(commit.points).toEqual([p(0, 0), p(160, 0)]);
    expect(commit.clearedWaypoints).toBe(true);
    expect(commit.waypoints).toBeUndefined();
  });

  it("keeps simplified waypoints when at least two interior corners remain", () => {
    const commit = commitBendPolyline([
      p(0, 0),
      p(40, 0),
      p(40, 60),
      p(120, 60),
      p(120, 120),
      p(160, 120),
    ]);

    expect(commit.interiorCornerCount).toBe(4);
    expect(commit.clearedWaypoints).toBe(false);
    expect(commit.waypoints).toEqual([
      [40, 0],
      [40, 60],
      [120, 60],
      [120, 120],
    ]);
  });
});
