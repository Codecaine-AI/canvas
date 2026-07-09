/**
 * Minimal, dependency-free reimplementation of the `@blocksuite/global/gfx`
 * primitives needed by the vendored `a-star.ts`, `graph.ts`, and
 * `path-generator.ts` in this directory.
 *
 * Reimplemented (not copied) from BlockSuite's public `@blocksuite/global`
 * package so the vendored files can typecheck without a `@blocksuite/*`
 * dependency. See repo-root PROVENANCE.md for upstream source paths:
 *   - packages/framework/global/src/gfx/math.ts (almostEqual, isOverlap,
 *     lineIntersects, linePolygonIntersects, clamp)
 *   - packages/framework/global/src/gfx/model/vec.ts (Vec — subset used here)
 *   - packages/framework/global/src/gfx/model/bound.ts (Bound — subset used
 *     here: x/y/w/h, points/lines getters, expand, isPointInBound, clone,
 *     fromPoints, getVerticesAndMidpoints, unite, include)
 *   - packages/framework/global/src/gfx/model/point-location.ts
 *     (PointLocation — subset: a plain IVec-like tuple with a `tangent`)
 *
 * This file is licensed MPL-2.0 (same as upstream BlockSuite) since it is a
 * derivative of the above sources.
 */

export type IVec = [number, number];
export type IVec3 = [number, number, number];

const MACHINE_EPSILON = 1.12e-16;
const EPSILON = 1e-8;

export function almostEqual(a: number, b: number, epsilon = 0.0001): boolean {
  return Math.abs(a - b) < epsilon;
}

export function clamp(n: number, min: number, max?: number): number {
  return Math.max(min, max !== undefined ? Math.min(n, max) : n);
}

/** Minimal vector helpers (subset of BlockSuite's `Vec`). */
export const Vec = {
  sub(a: IVec, b: IVec): IVec {
    return [a[0] - b[0], a[1] - b[1]];
  },
  cpr(a: IVec, b: IVec): number {
    return a[0] * b[1] - a[1] * b[0];
  },
  lrp(a: IVec, b: IVec, t: number): IVec {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  },
};

/**
 * Line-segment (or infinite-line) intersection test, ported from
 * BlockSuite's `lineIntersects`.
 */
export function lineIntersects(
  sp: IVec,
  ep: IVec,
  sp2: IVec,
  ep2: IVec,
  infinite = false,
): IVec | null {
  const v1 = Vec.sub(ep, sp);
  const v2 = Vec.sub(ep2, sp2);
  const cross = Vec.cpr(v1, v2);
  if (almostEqual(cross, 0, MACHINE_EPSILON)) return null;
  const d = Vec.sub(sp, sp2);
  let u1 = Vec.cpr(v2, d) / cross;
  const u2 = Vec.cpr(v1, d) / cross;
  const uMin = -EPSILON;
  const uMax = 1 + EPSILON;

  if (infinite || (uMin < u1 && u1 < uMax && uMin < u2 && u2 < uMax)) {
    if (!infinite) {
      u1 = clamp(u1, 0, 1);
    }
    return Vec.lrp(sp, ep, u1);
  }

  return null;
}

/**
 * Tests whether the segment [sp, ep] intersects the closed polygon
 * described by `points`, returning intersection points (ported from
 * BlockSuite's `linePolygonIntersects`, simplified to plain IVec results
 * since callers here only need coordinates, not tangents).
 */
export function linePolygonIntersects(sp: IVec, ep: IVec, points: IVec[]): IVec[] | null {
  const result: IVec[] = [];
  const len = points.length;
  for (let i = 0; i < len; i += 1) {
    const p = points[i]!;
    const p2 = points[(i + 1) % len]!;
    const hit = lineIntersects(sp, ep, p, p2);
    if (hit) result.push(hit);
  }
  return result.length ? result : null;
}

/**
 * 0 means x axis, 1 means y axis. Ported verbatim from BlockSuite's
 * `isOverlap`.
 */
export function isOverlap(line1: IVec[], line2: IVec[], axis: 0 | 1, strict = true): boolean {
  const less = strict ? (a: number, b: number) => a < b : (a: number, b: number) => a <= b;
  return !(
    less(
      Math.max(line1[0]![axis], line1[1]![axis]),
      Math.min(line2[0]![axis], line2[1]![axis]),
    ) ||
    less(
      Math.max(line2[0]![axis], line2[1]![axis]),
      Math.min(line1[0]![axis], line1[1]![axis]),
    )
  );
}

/**
 * Minimal axis-aligned bounds type (subset of BlockSuite's `Bound` class):
 * carries x/y/w/h plus the derived edge lines and corner/midpoint helpers
 * needed by the vendored A* graph builder and path generator.
 */
export class Bound {
  constructor(
    public x = 0,
    public y = 0,
    public w = 0,
    public h = 0,
  ) {}

  static from(b: { x: number; y: number; w: number; h: number }): Bound {
    return new Bound(b.x, b.y, b.w, b.h);
  }

  static fromPoints(points: IVec[]): Bound {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return new Bound(minX, minY, maxX - minX, maxY - minY);
  }

  get maxX(): number {
    return this.x + this.w;
  }

  get maxY(): number {
    return this.y + this.h;
  }

  get center(): IVec {
    return [this.x + this.w / 2, this.y + this.h / 2];
  }

  get leftLine(): IVec[] {
    return [
      [this.x, this.y],
      [this.x, this.y + this.h],
    ];
  }

  get rightLine(): IVec[] {
    return [
      [this.x + this.w, this.y],
      [this.x + this.w, this.y + this.h],
    ];
  }

  get upperLine(): IVec[] {
    return [
      [this.x, this.y],
      [this.x + this.w, this.y],
    ];
  }

  get lowerLine(): IVec[] {
    return [
      [this.x, this.y + this.h],
      [this.x + this.w, this.y + this.h],
    ];
  }

  get horizontalLine(): IVec[] {
    return [
      [this.x, this.y + this.h / 2],
      [this.x + this.w, this.y + this.h / 2],
    ];
  }

  get verticalLine(): IVec[] {
    return [
      [this.x + this.w / 2, this.y],
      [this.x + this.w / 2, this.y + this.h],
    ];
  }

  get points(): IVec[] {
    return [
      [this.x, this.y],
      [this.x + this.w, this.y],
      [this.x + this.w, this.y + this.h],
      [this.x, this.y + this.h],
    ];
  }

  get midPoints(): IVec[] {
    return [
      [this.x + this.w / 2, this.y],
      [this.x + this.w, this.y + this.h / 2],
      [this.x + this.w / 2, this.y + this.h],
      [this.x, this.y + this.h / 2],
    ];
  }

  getVerticesAndMidpoints(): IVec[] {
    return [...this.points, ...this.midPoints];
  }

  clone(): Bound {
    return new Bound(this.x, this.y, this.w, this.h);
  }

  expand(margin: [number, number]): Bound;
  expand(left: number, top?: number, right?: number, bottom?: number): Bound;
  expand(left: number | [number, number], top?: number, right?: number, bottom?: number): Bound {
    if (Array.isArray(left)) {
      const [mx, my] = left;
      return new Bound(this.x - mx, this.y - my, this.w + mx * 2, this.h + my * 2);
    }
    const t = top ?? left;
    const r = right ?? left;
    const b = bottom ?? t;
    return new Bound(this.x - left, this.y - t, this.w + left + r, this.h + t + b);
  }

  isPointInBound([x, y]: IVec, tolerance = 0.01): boolean {
    return (
      x >= this.x - tolerance &&
      x <= this.maxX + tolerance &&
      y >= this.y - tolerance &&
      y <= this.maxY + tolerance
    );
  }

  include(point: IVec): Bound {
    const x1 = Math.min(this.x, point[0]);
    const y1 = Math.min(this.y, point[1]);
    const x2 = Math.max(this.maxX, point[0]);
    const y2 = Math.max(this.maxY, point[1]);
    return new Bound(x1, y1, x2 - x1, y2 - y1);
  }

  /** Smallest bound containing both `this` and `other` (BlockSuite's `unite`). */
  unite(other: Bound): Bound {
    const x1 = Math.min(this.x, other.x);
    const y1 = Math.min(this.y, other.y);
    const x2 = Math.max(this.maxX, other.maxX);
    const y2 = Math.max(this.maxY, other.maxY);
    return new Bound(x1, y1, x2 - x1, y2 - y1);
  }
}
