import { Delaunay } from "d3-delaunay";

import { mulberry32 } from "../rng";
import {
  frameFromParams,
  numberParam,
  type AlgorithmDef,
  type Point,
  type PolygonRegion,
} from "../types";

type Coordinate = [number, number];

function polygonCentroid(points: readonly Coordinate[]): Coordinate {
  let twiceArea = 0;
  let weightedX = 0;
  let weightedY = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current[0] * next[1] - next[0] * current[1];
    twiceArea += cross;
    weightedX += (current[0] + next[0]) * cross;
    weightedY += (current[1] + next[1]) * cross;
  }

  if (Math.abs(twiceArea) < 1e-9) {
    const total = points.reduce(
      (sum, point) => [sum[0] + point[0], sum[1] + point[1]] as Coordinate,
      [0, 0] as Coordinate,
    );
    return [total[0] / points.length, total[1] / points.length];
  }

  return [weightedX / (3 * twiceArea), weightedY / (3 * twiceArea)];
}

function openCell(cell: readonly Coordinate[]): Coordinate[] {
  if (cell.length > 1) {
    const first = cell[0];
    const last = cell[cell.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) return cell.slice(0, -1);
  }
  return [...cell];
}

function makeVoronoi(points: readonly Coordinate[], width: number, height: number) {
  return Delaunay.from(points).voronoi([0, 0, width, height]);
}

export function runVoronoiLloyd(
  rawParams: Parameters<AlgorithmDef["run"]>[0],
  seed: number,
): PolygonRegion[] {
  const { width, height } = frameFromParams(rawParams);
  const pointCount = Math.round(numberParam(rawParams, "points", 42, 3, 160));
  const iterations = Math.round(numberParam(rawParams, "iterations", 2, 0, 12));
  const random = mulberry32(seed);

  let sites: Coordinate[] = Array.from({ length: pointCount }, () => [
    random() * width,
    random() * height,
  ]);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const voronoi = makeVoronoi(sites, width, height);
    sites = sites.map((site, index) => {
      const cell = voronoi.cellPolygon(index) as Coordinate[] | null;
      if (!cell || cell.length < 4) return site;
      const [x, y] = polygonCentroid(openCell(cell));
      return [Math.min(width, Math.max(0, x)), Math.min(height, Math.max(0, y))];
    });
  }

  const voronoi = makeVoronoi(sites, width, height);
  const cells = sites.map((site, index) => {
    const cell = voronoi.cellPolygon(index) as Coordinate[] | null;
    const coordinates = cell ? openCell(cell) : [site];
    return {
      coordinates,
      centroid: coordinates.length >= 3 ? polygonCentroid(coordinates) : site,
      index,
    };
  });

  // Distance-ranked depth gives the optional tint a quiet center-to-edge rhythm
  // without changing the geometry or relying on the cells' generation order.
  const depthByIndex = new Map(
    [...cells]
      .sort((left, right) => {
        const leftDistance = Math.hypot(
          (left.centroid[0] - width / 2) / width,
          (left.centroid[1] - height / 2) / height,
        );
        const rightDistance = Math.hypot(
          (right.centroid[0] - width / 2) / width,
          (right.centroid[1] - height / 2) / height,
        );
        return leftDistance - rightDistance || left.index - right.index;
      })
      .map((cell, rank) => [cell.index, rank] as const),
  );

  return cells
    .filter((cell) => cell.coordinates.length >= 3)
    .map((cell) => ({
      kind: "polygon",
      points: cell.coordinates.map(([x, y]): Point => ({ x, y })),
      depth: depthByIndex.get(cell.index) ?? 0,
    }));
}

export const voronoiLloydAlgorithm: AlgorithmDef = {
  id: "voronoi-lloyd",
  name: "Voronoi / Lloyd",
  description: "Relaxed nearest-site cells settle into an even organic tessellation.",
  params: [
    { key: "points", label: "Cells", type: "range", default: 42, min: 6, max: 120, step: 1 },
    { key: "iterations", label: "Relaxation", type: "range", default: 2, min: 0, max: 8, step: 1 },
  ],
  run: runVoronoiLloyd,
};
