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

describe("connector bend editing", () => {
  it("finds every straight segment with midpoint and axis metadata", () => {
    const segments = connectorBendSegments([p(0, 0), p(80, 0), p(80, 60), p(160, 60)]);

    expect(segments).toEqual([
      { index: 0, start: p(0, 0), end: p(80, 0), midpoint: p(40, 0), axis: "horizontal" },
      { index: 1, start: p(80, 0), end: p(80, 60), midpoint: p(80, 30), axis: "vertical" },
      { index: 2, start: p(80, 60), end: p(160, 60), midpoint: p(120, 60), axis: "horizontal" },
    ]);
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

  it("adds bends on both sides when dragging a direct endpoint-to-endpoint segment", () => {
    expect(dragOrthogonalSegment([p(0, 0), p(160, 0)], 0, { dx: 99, dy: 40 })).toEqual([
      p(0, 0),
      p(0, 40),
      p(160, 40),
      p(160, 0),
    ]);
  });

  it("auto-simplifies adjacent collinear segments and clears near-auto waypoints", () => {
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
