import { mulberry32, pick } from "../rng";
import type { AlgorithmDef, AlgorithmParams, RectRegion } from "../types";
import { frameFromParams, numberParam } from "../types";
import { assertRectTiling } from "../validation";

const PHI = (1 + Math.sqrt(5)) / 2;
const SPLIT_RATIOS = [1 / 2, 1 / PHI, 1 / 3] as const;

type SplitCandidate = {
  index: number;
  cell: RectRegion;
  axis: "x" | "y";
  ratios: number[];
};

function splitOptions(cell: RectRegion, index: number, minCell: number): SplitCandidate | null {
  const axis = cell.w >= cell.h ? "x" : "y";
  const length = axis === "x" ? cell.w : cell.h;
  const ratios = SPLIT_RATIOS.filter((ratio) => (
    length * ratio >= minCell && length * (1 - ratio) >= minCell
  ));

  return ratios.length > 0 ? { index, cell, axis, ratios } : null;
}

function weightedByArea(randomValue: number, candidates: readonly SplitCandidate[]): SplitCandidate {
  const totalArea = candidates.reduce(
    (sum, candidate) => sum + candidate.cell.w * candidate.cell.h,
    0,
  );
  let threshold = randomValue * totalArea;

  for (const candidate of candidates) {
    threshold -= candidate.cell.w * candidate.cell.h;
    if (threshold <= 0) return candidate;
  }

  return candidates[candidates.length - 1];
}

export function runMondrian(params: AlgorithmParams, seed: number): RectRegion[] {
  const frame = frameFromParams(params);
  const requestedSplits = Math.trunc(numberParam(params, "splits", 20, 0, 120));
  const minCell = numberParam(params, "minCell", 48, 4);
  const random = mulberry32(seed);
  const leaves: RectRegion[] = [
    { kind: "rect", x: 0, y: 0, w: frame.width, h: frame.height, depth: 0 },
  ];

  for (let splitIndex = 0; splitIndex < requestedSplits; splitIndex += 1) {
    const candidates = leaves
      .map((cell, index) => splitOptions(cell, index, minCell))
      .filter((candidate): candidate is SplitCandidate => candidate !== null);
    if (candidates.length === 0) break;

    const candidate = weightedByArea(random(), candidates);
    const baseRatio = pick(random, candidate.ratios);
    const splitRatio = random() < 0.5 ? baseRatio : 1 - baseRatio;
    const { cell } = candidate;
    const childDepth = cell.depth + 1;
    let children: [RectRegion, RectRegion];

    if (candidate.axis === "x") {
      const firstWidth = cell.w * splitRatio;
      children = [
        { ...cell, w: firstWidth, depth: childDepth },
        {
          ...cell,
          x: cell.x + firstWidth,
          w: cell.w - firstWidth,
          depth: childDepth,
        },
      ];
    } else {
      const firstHeight = cell.h * splitRatio;
      children = [
        { ...cell, h: firstHeight, depth: childDepth },
        {
          ...cell,
          y: cell.y + firstHeight,
          h: cell.h - firstHeight,
          depth: childDepth,
        },
      ];
    }

    leaves.splice(candidate.index, 1, ...children);
  }

  assertRectTiling(leaves, frame, "Mondrian guillotine");
  return leaves;
}

export const mondrianAlgorithm: AlgorithmDef = {
  id: "mondrian",
  name: "Mondrian Guillotine",
  description: "Area-weighted longer-axis cuts at harmonic ratios.",
  params: [
    {
      key: "splits",
      label: "Splits",
      type: "range",
      default: 20,
      min: 1,
      max: 60,
      step: 1,
    },
    {
      key: "minCell",
      label: "Minimum cell",
      type: "range",
      default: 48,
      min: 16,
      max: 128,
      step: 4,
    },
  ],
  run: runMondrian,
};
