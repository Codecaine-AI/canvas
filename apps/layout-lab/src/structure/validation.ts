import type { RectEdge, Region } from "./types";

type Frame = { width: number; height: number };

/**
 * Development-only sanity check for algorithms that promise an exact rectangular
 * tiling. Area plus containment and non-overlap proves that the frame is covered.
 */
export function assertRectTiling(
  regions: readonly Region[],
  frame: Frame,
  algorithmName = "rectangular partition",
): void {
  if (!import.meta.env.DEV) return;

  const frameArea = frame.width * frame.height;
  const areaTolerance = Math.max(1, frameArea) * 1e-8;
  const coordinateTolerance = Math.max(1, frame.width, frame.height) * 1e-9;

  let tiledArea = 0;

  for (const [index, region] of regions.entries()) {
    if (region.kind !== "rect") {
      throw new Error(`${algorithmName}: region ${index} is not a rectangle.`);
    }

    if (!Number.isFinite(region.x)
      || !Number.isFinite(region.y)
      || !Number.isFinite(region.w)
      || !Number.isFinite(region.h)
      || region.w <= 0
      || region.h <= 0) {
      throw new Error(`${algorithmName}: region ${index} has invalid geometry.`);
    }

    if (region.x < -coordinateTolerance
      || region.y < -coordinateTolerance
      || region.x + region.w > frame.width + coordinateTolerance
      || region.y + region.h > frame.height + coordinateTolerance) {
      throw new Error(`${algorithmName}: region ${index} escapes the frame.`);
    }

    tiledArea += region.w * region.h;
  }

  if (Math.abs(tiledArea - frameArea) > areaTolerance) {
    throw new Error(
      `${algorithmName}: cell area ${tiledArea} does not match frame area ${frameArea}.`,
    );
  }

  for (let leftIndex = 0; leftIndex < regions.length; leftIndex += 1) {
    const left = regions[leftIndex];
    if (left.kind !== "rect") continue;

    for (let rightIndex = leftIndex + 1; rightIndex < regions.length; rightIndex += 1) {
      const right = regions[rightIndex];
      if (right.kind !== "rect") continue;

      const overlapWidth = Math.min(left.x + left.w, right.x + right.w)
        - Math.max(left.x, right.x);
      const overlapHeight = Math.min(left.y + left.h, right.y + right.h)
        - Math.max(left.y, right.y);

      if (overlapWidth > coordinateTolerance && overlapHeight > coordinateTolerance) {
        throw new Error(
          `${algorithmName}: regions ${leftIndex} and ${rightIndex} overlap.`,
        );
      }
    }
  }
}

const OPPOSITE_EDGE: Record<RectEdge, RectEdge> = {
  top: "bottom",
  right: "left",
  bottom: "top",
  left: "right",
};

/** Verify that every annotated street edge is mirrored across the full cut. */
export function assertGutterHierarchy(
  regions: readonly Region[],
  frame: Frame,
  algorithmName = "hierarchical partition",
): void {
  if (!import.meta.env.DEV) return;

  const tolerance = Math.max(1, frame.width, frame.height) * 1e-9;
  const edges: readonly RectEdge[] = ["top", "right", "bottom", "left"];

  for (const [index, region] of regions.entries()) {
    if (region.kind !== "rect" || region.gutterDepth === undefined) continue;

    for (const edge of edges) {
      const depth = region.gutterDepth[edge];
      if (depth === undefined) continue;
      if (!Number.isInteger(depth) || depth < 0) {
        throw new Error(`${algorithmName}: region ${index} has an invalid ${edge} gutter depth.`);
      }

      const vertical = edge === "left" || edge === "right";
      const line = vertical
        ? edge === "left" ? region.x : region.x + region.w
        : edge === "top" ? region.y : region.y + region.h;
      const frameLimit = vertical ? frame.width : frame.height;
      if (line <= tolerance || line >= frameLimit - tolerance) {
        throw new Error(`${algorithmName}: region ${index} annotates an outer ${edge} edge.`);
      }

      const start = vertical ? region.y : region.x;
      const end = start + (vertical ? region.h : region.w);
      let covered = 0;

      for (const neighbor of regions) {
        if (neighbor.kind !== "rect" || neighbor === region) continue;
        const neighborLine = vertical
          ? edge === "left" ? neighbor.x + neighbor.w : neighbor.x
          : edge === "top" ? neighbor.y + neighbor.h : neighbor.y;
        if (Math.abs(line - neighborLine) > tolerance) continue;

        const neighborStart = vertical ? neighbor.y : neighbor.x;
        const neighborEnd = neighborStart + (vertical ? neighbor.h : neighbor.w);
        const overlap = Math.min(end, neighborEnd) - Math.max(start, neighborStart);
        if (overlap <= tolerance) continue;

        if (neighbor.gutterDepth?.[OPPOSITE_EDGE[edge]] !== depth) {
          throw new Error(
            `${algorithmName}: region ${index} has an unmatched ${edge} gutter depth.`,
          );
        }
        covered += overlap;
      }

      if (Math.abs(covered - (end - start)) > tolerance * 4) {
        throw new Error(`${algorithmName}: region ${index} has an incomplete ${edge} street.`);
      }
    }
  }
}
