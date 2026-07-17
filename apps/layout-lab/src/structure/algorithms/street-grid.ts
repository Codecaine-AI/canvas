import { mulberry32 } from "../rng";
import type { AlgorithmDef, AlgorithmParams, RectRegion } from "../types";
import { frameFromParams, numberParam } from "../types";
import { assertRectTiling } from "../validation";

/**
 * Faithful continuous-coordinate port of the original subGridCell loop: choose
 * the leaf with the largest max-side, then bisect one currently valid axis.
 */
export function runStreetGrid(params: AlgorithmParams, seed: number): RectRegion[] {
  const frame = frameFromParams(params);
  const minSpacing = numberParam(params, "minSpacing", 160, 16);
  const random = mulberry32(seed);
  const cells: RectRegion[] = [
    { kind: "rect", x: 0, y: 0, w: frame.width, h: frame.height, depth: 0 },
  ];

  while (true) {
    let largestIndex = -1;
    let largestSide = minSpacing;

    for (let index = 0; index < cells.length; index += 1) {
      const maxSide = Math.max(cells[index].w, cells[index].h);
      if (maxSide > largestSide) {
        largestSide = maxSide;
        largestIndex = index;
      }
    }

    if (largestIndex === -1) break;

    const cell = cells[largestIndex];
    const canSplitX = cell.w > minSpacing;
    const canSplitY = cell.h > minSpacing;
    const splitAxis = canSplitX && canSplitY
      ? random() < 0.5 ? "x" : "y"
      : canSplitX ? "x" : "y";
    const childDepth = cell.depth + 1;
    let children: [RectRegion, RectRegion];

    if (splitAxis === "x") {
      const halfWidth = cell.w / 2;
      children = [
        { ...cell, w: halfWidth, depth: childDepth },
        { ...cell, x: cell.x + halfWidth, w: cell.w - halfWidth, depth: childDepth },
      ];
    } else {
      const halfHeight = cell.h / 2;
      children = [
        { ...cell, h: halfHeight, depth: childDepth },
        { ...cell, y: cell.y + halfHeight, h: cell.h - halfHeight, depth: childDepth },
      ];
    }

    cells.splice(largestIndex, 1, ...children);
  }

  assertRectTiling(cells, frame, "Street grid");
  return cells;
}

export const streetGridAlgorithm: AlgorithmDef = {
  id: "street-grid",
  name: "Street Grid",
  description: "Largest-cell midpoint subdivision with seeded axis choices.",
  params: [
    {
      key: "minSpacing",
      label: "Maximum cell side",
      type: "range",
      default: 160,
      min: 48,
      max: 320,
      step: 8,
    },
  ],
  run: runStreetGrid,
};
