import type {
  CanvasGeometry,
  InteractiveCanvasDocument,
} from "@codecaine-ai/canvas/schema";

import {
  buildOccupancyGrid,
  occupancyGridToAscii,
  type OccupancyBounds,
  type OccupancyGrid,
  type OccupancyOptions,
  type OccupancyRect,
} from "../agent/occupancy";
import type { RegionAddress } from "../agent/types";

export interface CanvasOccupancyOptions extends OccupancyOptions {
  /** Sections are layout backdrops, so they are non-occupying by default. */
  includeSections?: boolean;
}

export interface InferredRegionNode {
  address: RegionAddress;
  geometry: CanvasGeometry;
  children: InferredRegionNode[];
}

export interface RegionTreeInferenceResult {
  root: InferredRegionNode | null;
  complete: boolean;
  messages: string[];
}

function boundsForDocument(document: InteractiveCanvasDocument): OccupancyBounds {
  const geometries = document.objects.map((object) => object.geometry);
  const originX = Math.min(0, ...geometries.map((geometry) => geometry.x));
  const originY = Math.min(0, ...geometries.map((geometry) => geometry.y));
  const right = Math.max(
    document.size?.width ?? 0,
    ...geometries.map((geometry) => geometry.x + geometry.width),
    originX + 1,
  );
  const bottom = Math.max(
    document.size?.height ?? 0,
    ...geometries.map((geometry) => geometry.y + geometry.height),
    originY + 1,
  );
  return {
    x: originX,
    y: originY,
    width: right - originX,
    height: bottom - originY,
  };
}

/**
 * Read the real canvas model back into the agent's deliberately lossy coarse
 * occupancy representation. Section frames are excluded unless requested,
 * because they describe layout space rather than blocking its contents.
 */
export function canvasDocumentToOccupancyGrid(
  document: InteractiveCanvasDocument,
  options: CanvasOccupancyOptions = {},
): OccupancyGrid {
  const { includeSections = false, cellSize, emptyCharacter } = options;
  const rects: OccupancyRect[] = document.objects
    .filter((object) => includeSections || object.type !== "section")
    // Put optional section backdrops first so foreground objects remain
    // visible in cells where they overlap.
    .sort((left, right) => Number(right.type === "section") - Number(left.type === "section"))
    .map((object) => ({
      ...object.geometry,
      character: object.type === "section" ? "S" : "#",
    }));

  return buildOccupancyGrid(
    rects,
    boundsForDocument(document),
    { cellSize, emptyCharacter },
  );
}

export function canvasDocumentToOccupancyAscii(
  document: InteractiveCanvasDocument,
  options: CanvasOccupancyOptions = {},
  includeHeader = true,
): string {
  return occupancyGridToAscii(
    canvasDocumentToOccupancyGrid(document, options),
    includeHeader,
  );
}

/**
 * TODO: infer split axes, weights, and region path addresses from geometric
 * relationships. Occupancy is the only supported read mapping for now.
 */
export function inferRegionTreeFromDocument(
  _document: InteractiveCanvasDocument,
): RegionTreeInferenceResult {
  return {
    root: null,
    complete: false,
    messages: ["Region-tree inference from canvas geometry is not implemented yet."],
  };
}
