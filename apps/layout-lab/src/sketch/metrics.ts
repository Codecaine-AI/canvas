import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import type {
  ExpandedSketch,
  ExpandedSketchObject,
  Sketch,
  SketchNode,
  SketchRect,
} from "./types";

export interface SketchMetrics {
  serializedChars: number;
  geometryChars: number;
  /** Serialized sketch characters divided by raw geometry JSON characters. */
  compressionRatio: number;
  /** Fraction from zero to one. */
  relationPreservation: number;
  /** Fraction from zero to one. */
  adjacencyPreservation: number;
  /**
   * Spatial decisions spelled by the DSL: split weights, compass slots,
   * size classes, grid dimensions, and tier/fan/lane declarations.
   */
  dslDecisions: number;
  /**
   * Spatial decisions in the raw document: four per object geometry, two per
   * connector waypoint, one per explicit connector endpoint anchor.
   */
  rawDecisions: number;
  /** dslDecisions / rawDecisions. */
  decisionRatio: number;
}

interface SpatialObject {
  id: string;
  type: string;
  geometry: SketchRect;
}

interface RelationSignature {
  leftOf: boolean;
  above: boolean;
  containedIn: boolean;
}

const ADJACENCY_DISTANCE = 64;

function centerX(rect: SketchRect): number {
  return rect.x + rect.width / 2;
}

function centerY(rect: SketchRect): number {
  return rect.y + rect.height / 2;
}

function area(rect: SketchRect): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function isContainedIn(item: SpatialObject, container: SpatialObject): boolean {
  if (container.type !== "section" || area(item.geometry) >= area(container.geometry)) {
    return false;
  }
  const x = centerX(item.geometry);
  const y = centerY(item.geometry);
  const bounds = container.geometry;
  return x >= bounds.x
    && x <= bounds.x + bounds.width
    && y >= bounds.y
    && y <= bounds.y + bounds.height;
}

function relationSignature(left: SpatialObject, right: SpatialObject): RelationSignature {
  return {
    // Qualitative ordering is only asserted when the boxes are separated on
    // that axis. Overlapping/aligned boxes therefore do not acquire a false
    // left/above fact from tiny center offsets in the source geometry.
    leftOf: left.geometry.x + left.geometry.width <= right.geometry.x,
    above: left.geometry.y + left.geometry.height <= right.geometry.y,
    containedIn: isContainedIn(left, right),
  };
}

function sameSignature(left: RelationSignature, right: RelationSignature): boolean {
  return left.leftOf === right.leftOf
    && left.above === right.above
    && left.containedIn === right.containedIn;
}

function axisGap(
  firstStart: number,
  firstLength: number,
  secondStart: number,
  secondLength: number,
): number {
  return Math.max(
    0,
    secondStart - (firstStart + firstLength),
    firstStart - (secondStart + secondLength),
  );
}

function bboxGap(first: SketchRect, second: SketchRect, scaleX = 1, scaleY = 1): number {
  const x = axisGap(first.x, first.width, second.x, second.width) * scaleX;
  const y = axisGap(first.y, first.height, second.y, second.height) * scaleY;
  return Math.hypot(x, y);
}

function objectExtents(objects: readonly SpatialObject[]): SketchRect | null {
  if (objects.length === 0) return null;
  const left = Math.min(...objects.map((object) => object.geometry.x));
  const top = Math.min(...objects.map((object) => object.geometry.y));
  const right = Math.max(...objects.map((object) => object.geometry.x + object.geometry.width));
  const bottom = Math.max(...objects.map((object) => object.geometry.y + object.geometry.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function finiteScale(original: number, reconstruction: number): number {
  const scale = original / reconstruction;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function calculateRelationPreservation(
  original: readonly SpatialObject[],
  reconstructedById: ReadonlyMap<string, ExpandedSketchObject>,
): number {
  let matching = 0;
  let compared = 0;
  for (const left of original) {
    const reconstructedLeft = reconstructedById.get(left.id);
    if (!reconstructedLeft) continue;
    for (const right of original) {
      if (left.id === right.id) continue;
      const reconstructedRight = reconstructedById.get(right.id);
      if (!reconstructedRight) continue;
      compared += 1;
      if (sameSignature(
        relationSignature(left, right),
        relationSignature(reconstructedLeft, reconstructedRight),
      )) matching += 1;
    }
  }
  return compared === 0 ? 1 : matching / compared;
}

function calculateAdjacencyPreservation(
  original: readonly SpatialObject[],
  reconstructedById: ReadonlyMap<string, ExpandedSketchObject>,
): number {
  const commonOriginal = original.filter((object) => reconstructedById.has(object.id));
  const commonReconstruction = commonOriginal.map((object) => reconstructedById.get(object.id)!);
  const originalExtents = objectExtents(commonOriginal);
  const reconstructedExtents = objectExtents(commonReconstruction);
  const scaleX = originalExtents && reconstructedExtents
    ? finiteScale(originalExtents.width, reconstructedExtents.width)
    : 1;
  const scaleY = originalExtents && reconstructedExtents
    ? finiteScale(originalExtents.height, reconstructedExtents.height)
    : 1;

  let originalAdjacent = 0;
  let preserved = 0;
  for (let firstIndex = 0; firstIndex < commonOriginal.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < commonOriginal.length; secondIndex += 1) {
      const first = commonOriginal[firstIndex];
      const second = commonOriginal[secondIndex];
      if (bboxGap(first.geometry, second.geometry) >= ADJACENCY_DISTANCE) continue;
      originalAdjacent += 1;
      const reconstructedFirst = reconstructedById.get(first.id)!;
      const reconstructedSecond = reconstructedById.get(second.id)!;
      if (bboxGap(
        reconstructedFirst.geometry,
        reconstructedSecond.geometry,
        scaleX,
        scaleY,
      ) < ADJACENCY_DISTANCE) preserved += 1;
    }
  }
  return originalAdjacent === 0 ? 1 : preserved / originalAdjacent;
}

function countNodeDecisions(node: SketchNode): number {
  if (node.kind === "split") {
    const hugCount = node.hugs?.filter((hug) => hug !== null).length ?? 0;
    return node.weights.length
      + hugCount
      + node.children.reduce((sum, child) => sum + countNodeDecisions(child), 0);
  }
  if (node.kind === "section") return countNodeDecisions(node.child);
  if (node.kind === "grid") {
    // Two lattice dimensions, one gap choice, one size class per cell.
    return 3 + node.items.length;
  }
  // One compass slot and one size class per placed item.
  return node.items.length * 2;
}

/**
 * Count the spatial decisions the DSL spells out: split weights (plus lane
 * hugs), compass slots, size classes, grid dimensions, and tier/fan
 * declarations (one per axis or direction, one per referenced member).
 */
export function countSketchDecisions(sketch: Sketch): number {
  const tree = countNodeDecisions(sketch.root);
  const tiers = sketch.tiers.reduce((sum, tier) => sum + 1 + tier.members.length, 0);
  const fans = sketch.fans.reduce((sum, fan) => sum + 1 + fan.children.length, 0);
  return tree + tiers + fans;
}

/**
 * Count the spatial decisions a raw canvas document carries: x/y/width/height
 * per object, two coordinates per connector waypoint, and one anchor pick per
 * explicitly anchored connector endpoint.
 */
export function countRawDecisions(document: InteractiveCanvasDocument): number {
  const objectDecisions = document.objects.length * 4;
  const connectionDecisions = document.connections.reduce((sum, connection) => (
    sum
    + (connection.waypoints?.length ?? 0) * 2
    + (connection.from.anchor === undefined ? 0 : 1)
    + (connection.to.anchor === undefined ? 0 : 1)
  ), 0);
  return objectDecisions + connectionDecisions;
}

/** Compare the coordinate-free sketch artifact with its geometric round trip. */
export function calculateSketchMetrics(
  original: InteractiveCanvasDocument,
  reconstruction: ExpandedSketch,
  serialized: string,
  sketch: Sketch,
): SketchMetrics {
  const serializedChars = serialized.length;
  const geometryChars = JSON.stringify(
    original.objects.map((object) => object.geometry),
  ).length;
  const reconstructedById = new Map(
    reconstruction.objects.map((object) => [object.id, object]),
  );
  const dslDecisions = countSketchDecisions(sketch);
  const rawDecisions = countRawDecisions(original);
  return {
    serializedChars,
    geometryChars,
    compressionRatio: serializedChars / geometryChars,
    relationPreservation: calculateRelationPreservation(original.objects, reconstructedById),
    adjacencyPreservation: calculateAdjacencyPreservation(original.objects, reconstructedById),
    dslDecisions,
    rawDecisions,
    decisionRatio: rawDecisions === 0 ? 1 : dslDecisions / rawDecisions,
  };
}
