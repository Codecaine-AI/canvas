import { mulberry32, pick, type RandomSource } from "../rng";
import type { AlgorithmDef, AlgorithmParams, RectRegion } from "../types";
import { frameFromParams, numberParam } from "../types";
import { assertRectTiling } from "../validation";

const PHI = (1 + Math.sqrt(5)) / 2;
const HERO_SHARE = 1 / PHI;
const MIN_CELL = 48;
const SPLIT_RATIOS = [1 / 2, 1 / PHI, 1 / 3] as const;
const HERO_PLACEMENTS = ["left", "right", "top"] as const;

type SplitCandidate = {
  index: number;
  cell: RectRegion;
  axis: "x" | "y";
  ratios: number[];
};

type SatelliteLayout = {
  satellite: RectRegion;
  leaves: RectRegion[];
  score: number;
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

function splitCell(candidate: SplitCandidate, ratio: number): [RectRegion, RectRegion] {
  const { cell } = candidate;
  const childDepth = cell.depth + 1;
  if (candidate.axis === "x") {
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

function mondrianSubdivide(
  initialCell: RectRegion,
  targetCells: number,
  minCell: number,
  random: RandomSource,
): RectRegion[] {
  const leaves = [initialCell];

  while (leaves.length < targetCells) {
    const candidates = leaves
      .map((cell, index) => splitOptions(cell, index, minCell))
      .filter((candidate): candidate is SplitCandidate => candidate !== null);
    if (candidates.length === 0) break;

    const candidate = weightedByArea(random(), candidates);
    const baseRatio = pick(random, candidate.ratios);
    const splitRatio = random() < 0.5 ? baseRatio : 1 - baseRatio;
    leaves.splice(candidate.index, 1, ...splitCell(candidate, splitRatio));
  }

  return leaves;
}

function reserveHero(
  frame: { width: number; height: number },
  placement: typeof HERO_PLACEMENTS[number],
): [RectRegion, RectRegion] {
  if (placement === "top") {
    const heroHeight = frame.height * HERO_SHARE;
    return [
      { kind: "rect", x: 0, y: 0, w: frame.width, h: heroHeight, depth: 1 },
      {
        kind: "rect",
        x: 0,
        y: heroHeight,
        w: frame.width,
        h: frame.height - heroHeight,
        depth: 1,
      },
    ];
  }

  const heroWidth = frame.width * HERO_SHARE;
  if (placement === "left") {
    return [
      { kind: "rect", x: 0, y: 0, w: heroWidth, h: frame.height, depth: 1 },
      {
        kind: "rect",
        x: heroWidth,
        y: 0,
        w: frame.width - heroWidth,
        h: frame.height,
        depth: 1,
      },
    ];
  }

  return [
    {
      kind: "rect",
      x: frame.width - heroWidth,
      y: 0,
      w: heroWidth,
      h: frame.height,
      depth: 1,
    },
    {
      kind: "rect",
      x: 0,
      y: 0,
      w: frame.width - heroWidth,
      h: frame.height,
      depth: 1,
    },
  ];
}

function reserveSatellite(
  remainder: RectRegion,
  share: number,
  atStart: boolean,
): [RectRegion, RectRegion] {
  const depth = remainder.depth + 1;
  if (remainder.w >= remainder.h) {
    const satelliteWidth = remainder.w * share;
    if (atStart) {
      return [
        { ...remainder, w: satelliteWidth, depth },
        {
          ...remainder,
          x: remainder.x + satelliteWidth,
          w: remainder.w - satelliteWidth,
          depth,
        },
      ];
    }
    return [
      {
        ...remainder,
        x: remainder.x + remainder.w - satelliteWidth,
        w: satelliteWidth,
        depth,
      },
      { ...remainder, w: remainder.w - satelliteWidth, depth },
    ];
  }

  const satelliteHeight = remainder.h * share;
  if (atStart) {
    return [
      { ...remainder, h: satelliteHeight, depth },
      {
        ...remainder,
        y: remainder.y + satelliteHeight,
        h: remainder.h - satelliteHeight,
        depth,
      },
    ];
  }
  return [
    {
      ...remainder,
      y: remainder.y + remainder.h - satelliteHeight,
      h: satelliteHeight,
      depth,
    },
    { ...remainder, h: remainder.h - satelliteHeight, depth },
  ];
}

function medianArea(regions: readonly RectRegion[]): number {
  const areas = regions.map((region) => region.w * region.h).sort((left, right) => left - right);
  const middle = Math.floor(areas.length / 2);
  return areas.length % 2 === 0
    ? (areas[middle - 1] + areas[middle]) / 2
    : areas[middle];
}

function withSatellite(
  remainder: RectRegion,
  targetCells: number,
  minCell: number,
  seed: number,
  atStart: boolean,
): { satellite: RectRegion; leaves: RectRegion[] } {
  const splitLength = Math.max(remainder.w, remainder.h);
  const minimumShare = Math.min(0.45, minCell / splitLength);
  const low = Math.max(0.08, minimumShare);
  const high = Math.max(low, Math.min(0.48, 1 - minimumShare));
  let best: SatelliteLayout | null = null;

  // Search a narrow one-dimensional family of exact tilings. Reusing the same
  // subdivision seed makes the selected satellite deterministic and finds a
  // cell whose area is genuinely close to twice the median of its peers.
  for (let step = 0; step <= 120; step += 1) {
    const share = low + (high - low) * step / 120;
    const [satellite, rest] = reserveSatellite(remainder, share, atStart);
    const leaves = mondrianSubdivide(rest, targetCells - 1, minCell, mulberry32(seed));
    const median = medianArea(leaves);
    const ratioError = median > 0
      ? Math.abs(Math.log((satellite.w * satellite.h) / (2 * median)))
      : Infinity;
    const score = Math.abs(leaves.length - (targetCells - 1)) * 100 + ratioError;
    if (best === null || score < best.score) best = { satellite, leaves, score };
  }

  if (best === null) {
    const [satellite, rest] = reserveSatellite(remainder, 1 / 3, atStart);
    return {
      satellite,
      leaves: mondrianSubdivide(rest, targetCells - 1, minCell, mulberry32(seed)),
    };
  }
  return best;
}

export function runHeroCascade(params: AlgorithmParams, seed: number): RectRegion[] {
  const frame = frameFromParams(params);
  const remainderCells = Math.round(numberParam(params, "cells", 6, 4, 9));
  const secondHero = params.secondHero === true
    || params.secondHero === "on"
    || params.secondHero === "true";
  const random = mulberry32(seed);
  const placement = pick(random, HERO_PLACEMENTS);
  const [hero, remainder] = reserveHero(frame, placement);
  const minCell = Math.min(MIN_CELL, remainder.w / 3, remainder.h / 3);
  let leaves: RectRegion[];

  if (secondHero) {
    const atStart = random() < 0.5;
    const subdivisionSeed = Math.floor(random() * 4294967296) >>> 0;
    const { satellite, leaves: subdivisions } = withSatellite(
      remainder,
      remainderCells,
      minCell,
      subdivisionSeed,
      atStart,
    );
    leaves = [hero, satellite, ...subdivisions];
  } else {
    leaves = [hero, ...mondrianSubdivide(remainder, remainderCells, minCell, random)];
  }

  assertRectTiling(leaves, frame, "Hero Mondrian");
  return leaves;
}

export const heroCascadeAlgorithm: AlgorithmDef = {
  id: "hero-cascade",
  name: "Hero Mondrian",
  description: "An uncut golden hero beside a Mondrian supporting cast.",
  params: [
    {
      key: "cells",
      label: "Supporting cells",
      type: "range",
      default: 6,
      min: 4,
      max: 9,
      step: 1,
    },
    {
      key: "secondHero",
      label: "Second hero tier",
      type: "select",
      default: "off",
      options: [
        { label: "Off", value: "off" },
        { label: "On", value: "on" },
      ],
    },
  ],
  run: runHeroCascade,
};
