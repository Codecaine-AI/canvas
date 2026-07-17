import type { AlgorithmDef, AlgorithmParams, RectRegion } from "../types";
import { frameFromParams } from "../types";
import { assertRectTiling } from "../validation";

const FIBONACCI_SIZES = [1, 1, 2, 3, 5, 8, 13, 21] as const;
const SPIRAL_SIDES = ["left", "top", "right", "bottom"] as const;

type LogicalRect = { x: number; y: number; w: number; h: number; depth: number };

/** Build the classic 34 by 21 eight-square Fibonacci dissection. */
function fibonacciDissection(): LogicalRect[] {
  const descendingSizes = [...FIBONACCI_SIZES].reverse();
  const remaining = { x: 0, y: 0, w: 34, h: 21 };
  const squares: LogicalRect[] = [];

  for (let index = 0; index < descendingSizes.length - 1; index += 1) {
    const size = descendingSizes[index];
    const side = SPIRAL_SIDES[index % SPIRAL_SIDES.length];

    if (side === "left") {
      squares.push({ x: remaining.x, y: remaining.y, w: size, h: size, depth: index });
      remaining.x += size;
      remaining.w -= size;
    } else if (side === "top") {
      squares.push({ x: remaining.x, y: remaining.y, w: size, h: size, depth: index });
      remaining.y += size;
      remaining.h -= size;
    } else if (side === "right") {
      squares.push({
        x: remaining.x + remaining.w - size,
        y: remaining.y,
        w: size,
        h: size,
        depth: index,
      });
      remaining.w -= size;
    } else {
      squares.push({
        x: remaining.x,
        y: remaining.y + remaining.h - size,
        w: size,
        h: size,
        depth: index,
      });
      remaining.h -= size;
    }
  }

  squares.push({ ...remaining, depth: descendingSizes.length - 1 });
  return squares;
}

export function runFibSquares(params: AlgorithmParams, _seed: number): RectRegion[] {
  const frame = frameFromParams(params);
  const scaleX = frame.width / 34;
  const scaleY = frame.height / 21;

  // Non-uniform scaling keeps the canonical dissection while making it an exact
  // tiling of every selected frame aspect.
  const regions: RectRegion[] = fibonacciDissection().map((region) => ({
    kind: "rect",
    x: region.x * scaleX,
    y: region.y * scaleY,
    w: region.w * scaleX,
    h: region.h * scaleY,
    depth: region.depth,
  }));

  assertRectTiling(regions, frame, "Fibonacci squares");
  return regions;
}

export const fibSquaresAlgorithm: AlgorithmDef = {
  id: "fib-squares",
  name: "Fibonacci Squares",
  description: "The 1, 1, 2, 3, 5, 8, 13, 21 spiral dissection.",
  params: [],
  run: runFibSquares,
};
