import { mulberry32 } from "../rng";
import {
  frameFromParams,
  numberParam,
  type AlgorithmDef,
  type AlgorithmParams,
  type RectRegion,
} from "../types";
import { assertRectTiling } from "../validation";

type AreaItem = {
  area: number;
};

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

function rowArea(row: readonly AreaItem[]): number {
  return row.reduce((sum, item) => sum + item.area, 0);
}

/** The Bruls et al. worst-aspect-ratio objective for a candidate row. */
function worstRatio(row: readonly AreaItem[], side: number): number {
  if (row.length === 0 || side <= 0) return Infinity;
  let sum = 0;
  let minimum = Infinity;
  let maximum = 0;

  for (const item of row) {
    sum += item.area;
    minimum = Math.min(minimum, item.area);
    maximum = Math.max(maximum, item.area);
  }

  const sideSquared = side * side;
  const sumSquared = sum * sum;
  return Math.max(
    (sideSquared * maximum) / sumSquared,
    sumSquared / (sideSquared * minimum),
  );
}

function layoutRow(
  row: readonly AreaItem[],
  remaining: Rect,
  depth: number,
  result: RectRegion[],
): Rect {
  const area = rowArea(row);

  // Rows run along the remaining rectangle's short side, as in the original
  // squarified algorithm. The final item absorbs floating-point remainder.
  if (remaining.w >= remaining.h) {
    const stripWidth = area / remaining.h;
    let y = remaining.y;
    for (let index = 0; index < row.length; index += 1) {
      const h = index === row.length - 1
        ? remaining.y + remaining.h - y
        : row[index].area / stripWidth;
      result.push({ kind: "rect", x: remaining.x, y, w: stripWidth, h, depth });
      y += h;
    }
    return {
      x: remaining.x + stripWidth,
      y: remaining.y,
      w: Math.max(0, remaining.w - stripWidth),
      h: remaining.h,
    };
  }

  const stripHeight = area / remaining.w;
  let x = remaining.x;
  for (let index = 0; index < row.length; index += 1) {
    const w = index === row.length - 1
      ? remaining.x + remaining.w - x
      : row[index].area / stripHeight;
    result.push({ kind: "rect", x, y: remaining.y, w, h: stripHeight, depth });
    x += w;
  }
  return {
    x: remaining.x,
    y: remaining.y + stripHeight,
    w: remaining.w,
    h: Math.max(0, remaining.h - stripHeight),
  };
}

/** Squarify seeded Zipf-like weights into an exact rectangular tiling. */
export function runSquarified(params: AlgorithmParams, seed: number): RectRegion[] {
  const { width, height } = frameFromParams(params);
  const count = Math.round(numberParam(params, "count", 24, 4, 80));
  const skew = numberParam(params, "skew", 0.85, 0.3, 1.5);
  const random = mulberry32(seed);
  const weights = Array.from({ length: count }, (_, index) =>
    (0.55 + random() * 0.9) / ((index + 1) ** skew));
  weights.sort((a, b) => b - a);

  const frameArea = width * height;
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const items: AreaItem[] = weights.map((weight) => ({
    area: frameArea * weight / totalWeight,
  }));
  const result: RectRegion[] = [];
  let remaining: Rect = { x: 0, y: 0, w: width, h: height };
  let row: AreaItem[] = [];
  let rowIndex = 0;

  while (items.length > 0) {
    const next = items[0];
    const candidate = [...row, next];
    const side = Math.min(remaining.w, remaining.h);
    if (row.length === 0 || worstRatio(candidate, side) <= worstRatio(row, side)) {
      row.push(next);
      items.shift();
    } else {
      remaining = layoutRow(row, remaining, rowIndex, result);
      row = [];
      rowIndex += 1;
    }
  }

  if (row.length > 0) layoutRow(row, remaining, rowIndex, result);
  assertRectTiling(result, { width, height }, "Squarified treemap");
  return result;
}

export const squarifiedAlgorithm: AlgorithmDef = {
  id: "squarified",
  name: "Squarified",
  description: "Bruls treemap rows over seeded Zipf-like weights.",
  params: [
    {
      key: "count",
      label: "Cells",
      type: "range",
      default: 24,
      min: 4,
      max: 80,
      step: 1,
    },
    {
      key: "skew",
      label: "Weight skew",
      type: "range",
      default: 0.85,
      min: 0.3,
      max: 1.5,
      step: 0.05,
    },
  ],
  run: runSquarified,
};
