import { mulberry32 } from "../rng";
import {
  frameFromParams,
  numberParam,
  type AlgorithmDef,
  type AlgorithmParams,
  type RectRegion,
} from "../types";
import { assertRectTiling } from "../validation";

type WeightedPoint = {
  x: number;
  y: number;
  weight: number;
};

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

function weightedCutIndex(points: readonly WeightedPoint[]): number {
  const totalWeight = points.reduce((sum, point) => sum + point.weight, 0);
  const target = totalWeight / 2;
  let cumulative = 0;
  let bestIndex = 1;
  let bestDistance = Infinity;

  // A cut is made between samples, so neither child loses its population.
  for (let index = 1; index < points.length; index += 1) {
    cumulative += points[index - 1].weight;
    const distance = Math.abs(target - cumulative);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function partition(
  rect: Rect,
  points: readonly WeightedPoint[],
  currentDepth: number,
  targetDepth: number,
  result: RectRegion[],
): void {
  if (currentDepth >= targetDepth) {
    result.push({ kind: "rect", ...rect, depth: currentDepth });
    return;
  }

  const axis = rect.w >= rect.h ? "x" : "y";
  const origin = axis === "x" ? rect.x : rect.y;
  const span = axis === "x" ? rect.w : rect.h;

  if (points.length < 2) {
    // This is only a numerical safety net for extreme parameter values. The
    // normal sample budget leaves many samples in every terminal cell.
    const split = origin + span / 2;
    if (axis === "x") {
      partition({ x: rect.x, y: rect.y, w: split - rect.x, h: rect.h }, points, currentDepth + 1, targetDepth, result);
      partition({ x: split, y: rect.y, w: rect.x + rect.w - split, h: rect.h }, [], currentDepth + 1, targetDepth, result);
    } else {
      partition({ x: rect.x, y: rect.y, w: rect.w, h: split - rect.y }, points, currentDepth + 1, targetDepth, result);
      partition({ x: rect.x, y: split, w: rect.w, h: rect.y + rect.h - split }, [], currentDepth + 1, targetDepth, result);
    }
    return;
  }

  const sorted = [...points].sort((a, b) => a[axis] - b[axis]);
  const cutIndex = weightedCutIndex(sorted);
  const lower = sorted[cutIndex - 1][axis];
  const upper = sorted[cutIndex][axis];
  const rawSplit = (lower + upper) / 2;
  const inset = span * 1e-9;
  const split = Math.min(origin + span - inset, Math.max(origin + inset, rawSplit));
  const firstPoints = sorted.slice(0, cutIndex);
  const secondPoints = sorted.slice(cutIndex);

  if (axis === "x") {
    partition(
      { x: rect.x, y: rect.y, w: split - rect.x, h: rect.h },
      firstPoints,
      currentDepth + 1,
      targetDepth,
      result,
    );
    partition(
      { x: split, y: rect.y, w: rect.x + rect.w - split, h: rect.h },
      secondPoints,
      currentDepth + 1,
      targetDepth,
      result,
    );
  } else {
    partition(
      { x: rect.x, y: rect.y, w: rect.w, h: split - rect.y },
      firstPoints,
      currentDepth + 1,
      targetDepth,
      result,
    );
    partition(
      { x: rect.x, y: split, w: rect.w, h: rect.y + rect.h - split },
      secondPoints,
      currentDepth + 1,
      targetDepth,
      result,
    );
  }
}

/** Partition a frame by recursively cutting at seeded weighted medians. */
export function runMedianKd(params: AlgorithmParams, seed: number): RectRegion[] {
  const { width, height } = frameFromParams(params);
  const depth = Math.round(numberParam(params, "depth", 5, 1, 8));
  const random = mulberry32(seed);
  const sampleCount = Math.max(128, 2 ** (depth + 4));
  const points: WeightedPoint[] = Array.from({ length: sampleCount }, () => ({
    x: random() * width,
    y: random() * height,
    weight: 0.65 + random() * 0.7,
  }));
  const result: RectRegion[] = [];

  partition({ x: 0, y: 0, w: width, h: height }, points, 0, depth, result);
  assertRectTiling(result, { width, height }, "Median k-d");
  return result;
}

export const medianKdAlgorithm: AlgorithmDef = {
  id: "median-kd",
  name: "Median k-d",
  description: "Long-axis cuts balanced by seeded weighted medians.",
  params: [
    {
      key: "depth",
      label: "Depth",
      type: "range",
      default: 5,
      min: 1,
      max: 8,
      step: 1,
    },
  ],
  run: runMedianKd,
};
