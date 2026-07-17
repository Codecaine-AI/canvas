import { mulberry32 } from "../rng";
import type { AlgorithmDef, AlgorithmParams, RectRegion } from "../types";
import { frameFromParams, numberParam } from "../types";
import { assertRectTiling } from "../validation";

const PHI = (1 + Math.sqrt(5)) / 2;
const GOLDEN_MIN = 1 / PHI;

type Axis = "x" | "y";

type SplitPlan = {
  axis: Axis;
  ratio: number;
  weight: number;
};

type SplitCandidate = {
  index: number;
  cell: RectRegion;
  plans: SplitPlan[];
};

const RATIO_OPTIONS: readonly SplitPlan[] = [
  { axis: "x", ratio: 1 / 2, weight: 1 },
  { axis: "x", ratio: 1 / (1 + PHI), weight: 2 },
  { axis: "x", ratio: PHI / (1 + PHI), weight: 2 },
];

function childrenFor(cell: RectRegion, axis: Axis, ratio: number): [RectRegion, RectRegion] {
  const childDepth = cell.depth + 1;
  if (axis === "x") {
    const firstWidth = cell.w * ratio;
    return [
      { ...cell, w: firstWidth, depth: childDepth },
      { ...cell, x: cell.x + firstWidth, w: cell.w - firstWidth, depth: childDepth },
    ];
  }

  const firstHeight = cell.h * ratio;
  return [
    { ...cell, h: firstHeight, depth: childDepth },
    { ...cell, y: cell.y + firstHeight, h: cell.h - firstHeight, depth: childDepth },
  ];
}

function aspectScore(region: RectRegion): number {
  const aspect = region.w / region.h;
  if (aspect >= GOLDEN_MIN && aspect <= PHI) return 0;
  return aspect < GOLDEN_MIN
    ? Math.log(GOLDEN_MIN / aspect)
    : Math.log(aspect / PHI);
}

function isValidChild(region: RectRegion, minCell: number): boolean {
  const aspect = region.w / region.h;
  return region.w >= minCell
    && region.h >= minCell
    && aspect >= 0.5
    && aspect <= 2;
}

function bestPlanForRatio(
  cell: RectRegion,
  option: SplitPlan,
  minCell: number,
): SplitPlan | null {
  let best: { plan: SplitPlan; score: number; tieBreak: number } | null = null;

  for (const axis of ["x", "y"] as const) {
    const children = childrenFor(cell, axis, option.ratio);
    if (!children.every((child) => isValidChild(child, minCell))) continue;

    const score = aspectScore(children[0]) + aspectScore(children[1]);
    const tieBreak = axis === (cell.w >= cell.h ? "x" : "y") ? 0 : 1;
    if (best === null
      || score < best.score - 1e-12
      || (Math.abs(score - best.score) <= 1e-12 && tieBreak < best.tieBreak)) {
      best = { plan: { ...option, axis }, score, tieBreak };
    }
  }

  return best?.plan ?? null;
}

function splitOptions(cell: RectRegion, index: number, minCell: number): SplitCandidate | null {
  const plans = RATIO_OPTIONS
    .map((option) => bestPlanForRatio(cell, option, minCell))
    .filter((plan): plan is SplitPlan => plan !== null);
  return plans.length > 0 ? { index, cell, plans } : null;
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

function weightedPlan(randomValue: number, plans: readonly SplitPlan[]): SplitPlan {
  const totalWeight = plans.reduce((sum, plan) => sum + plan.weight, 0);
  let threshold = randomValue * totalWeight;

  for (const plan of plans) {
    threshold -= plan.weight;
    if (threshold <= 0) return plan;
  }

  return plans[plans.length - 1];
}

export function runMondrianGolden(params: AlgorithmParams, seed: number): RectRegion[] {
  const frame = frameFromParams(params);
  const requestedSplits = Math.trunc(numberParam(params, "splits", 16, 0, 120));
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
    const plan = weightedPlan(random(), candidate.plans);
    leaves.splice(
      candidate.index,
      1,
      ...childrenFor(candidate.cell, plan.axis, plan.ratio),
    );
  }

  assertRectTiling(leaves, frame, "Golden Mondrian");
  return leaves;
}

export const mondrianGoldenAlgorithm: AlgorithmDef = {
  id: "mondrian-golden",
  name: "Golden Mondrian",
  description: "Area-weighted Mondrian cuts disciplined by golden aspect.",
  params: [
    {
      key: "splits",
      label: "Splits",
      type: "range",
      default: 16,
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
  run: runMondrianGolden,
};
