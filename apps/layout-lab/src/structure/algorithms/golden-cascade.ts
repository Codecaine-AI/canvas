import type { AlgorithmDef, AlgorithmParams, RectRegion } from "../types";
import { frameFromParams, numberParam } from "../types";
import { assertRectTiling } from "../validation";

const PHI = (1 + Math.sqrt(5)) / 2;
const GOLDEN_SHARE = 1 / PHI;

type Axis = "x" | "y";

export function runGoldenCascade(params: AlgorithmParams, _seed: number): RectRegion[] {
  const frame = frameFromParams(params);
  const maxDepth = Math.trunc(numberParam(params, "depth", 4, 1, 7));
  const firstAxis: Axis = params.firstAxis === "y" ? "y" : "x";
  const regions: RectRegion[] = [];

  function partition(
    x: number,
    y: number,
    w: number,
    h: number,
    depth: number,
    ordinal: number,
  ): void {
    if (depth === maxDepth) {
      regions.push({ kind: "rect", x, y, w, h, depth });
      return;
    }

    const axis: Axis = depth % 2 === 0
      ? firstAxis
      : firstAxis === "x" ? "y" : "x";
    // Mirroring alternating branches prevents the golden cuts from collapsing
    // into a conventional aligned grid while keeping every split exactly 1:phi.
    const goldenFirst = (depth + ordinal) % 2 === 0;
    const firstShare = goldenFirst ? GOLDEN_SHARE : 1 - GOLDEN_SHARE;

    if (axis === "x") {
      const firstWidth = w * firstShare;
      partition(x, y, firstWidth, h, depth + 1, ordinal * 2);
      partition(x + firstWidth, y, w - firstWidth, h, depth + 1, ordinal * 2 + 1);
    } else {
      const firstHeight = h * firstShare;
      partition(x, y, w, firstHeight, depth + 1, ordinal * 2);
      partition(x, y + firstHeight, w, h - firstHeight, depth + 1, ordinal * 2 + 1);
    }
  }

  partition(0, 0, frame.width, frame.height, 0, 0);
  assertRectTiling(regions, frame, "Golden cascade");
  return regions;
}

export const goldenCascadeAlgorithm: AlgorithmDef = {
  id: "golden-cascade",
  name: "Golden Cascade",
  description: "Recursive 1:phi guillotine cuts on alternating axes.",
  params: [
    {
      key: "depth",
      label: "Depth",
      type: "range",
      default: 4,
      min: 1,
      max: 7,
      step: 1,
    },
    {
      key: "firstAxis",
      label: "First axis",
      type: "select",
      default: "x",
      options: [
        { label: "Horizontal", value: "x" },
        { label: "Vertical", value: "y" },
      ],
    },
  ],
  run: runGoldenCascade,
};
