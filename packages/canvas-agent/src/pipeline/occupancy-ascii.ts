import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";

import { buildOccupancyGrid, type OccupancyGrid, type OccupancyRect } from "./occupancy";
import type { SketchRect } from "./types";

/**
 * Legend characters in assignment order. Beyond 62 objects the map degrades
 * honestly: every further object shares the overflow mark `#` (its legend
 * entry still records that).
 */
const LEGEND_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const OVERFLOW_CHARACTER = "#";

export interface OccupancyAsciiOptions {
  /** World rect to map; defaults to the bounds of the document's objects. */
  scope?: SketchRect;
  /** Cell size in px (default 64). */
  cellSize?: number;
}

export interface OccupancyAsciiLegendEntry {
  character: string;
  id: string;
  type: string;
  text: string;
  /** World geometry, for the inspect close-up. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OccupancyAsciiResult {
  /** The complete block: header, coordinate frame, map, legend. */
  text: string;
  /** The map body alone (rows of cells, no frame). */
  map: string;
  grid: OccupancyGrid;
  legend: OccupancyAsciiLegendEntry[];
}

function intersects(geometry: SketchRect, scope: SketchRect): boolean {
  return geometry.x < scope.x + scope.width
    && scope.x < geometry.x + geometry.width
    && geometry.y < scope.y + scope.height
    && scope.y < geometry.y + geometry.height;
}

function boundsOf(objects: readonly InteractiveCanvasObject[]): SketchRect {
  if (!objects.length) return { x: 0, y: 0, width: 1, height: 1 };
  const x = Math.min(...objects.map((object) => object.geometry.x));
  const y = Math.min(...objects.map((object) => object.geometry.y));
  const right = Math.max(...objects.map((object) => object.geometry.x + object.geometry.width));
  const bottom = Math.max(...objects.map((object) => object.geometry.y + object.geometry.height));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

/** Perimeter rects (1px bands) so a section reads as an outline, not a flood. */
function outlineRects(geometry: SketchRect, character: string): OccupancyRect[] {
  const { x, y, width, height } = geometry;
  return [
    { x, y, width, height: 1, character },
    { x, y: y + height - 1, width, height: 1, character },
    { x, y, width: 1, height, character },
    { x: x + width - 1, y, width: 1, height, character },
  ];
}

/**
 * Serialize a document's occupancy into a compact ASCII map for the model's
 * `inspect` tool: one legend character per object (sections drawn as
 * outlines, boxes filled, later objects overwrite earlier), `.` for empty
 * cells, and a coordinate frame (column digit ruler + world-y row labels)
 * so the model can convert any cell back to world coordinates.
 */
export function documentToOccupancyAscii(
  document: InteractiveCanvasDocument,
  options: OccupancyAsciiOptions = {},
): OccupancyAsciiResult {
  const included = options.scope
    ? document.objects.filter((object) => intersects(object.geometry, options.scope!))
    : document.objects;
  const bounds = options.scope ?? boundsOf(included);

  const legend: OccupancyAsciiLegendEntry[] = included.map((object, index) => ({
    character: LEGEND_ALPHABET[index] ?? OVERFLOW_CHARACTER,
    id: object.id,
    type: object.type,
    text: object.text,
    x: object.geometry.x,
    y: object.geometry.y,
    width: object.geometry.width,
    height: object.geometry.height,
  }));
  const characterById = new Map(legend.map((entry) => [entry.id, entry.character]));

  // Sections first (outlines), then boxes fill over them.
  const rects: OccupancyRect[] = [
    ...included
      .filter((object) => object.type === "section")
      .flatMap((object) => outlineRects(object.geometry, characterById.get(object.id)!)),
    ...included
      .filter((object) => object.type !== "section")
      .map((object) => ({
        x: object.geometry.x,
        y: object.geometry.y,
        width: object.geometry.width,
        height: object.geometry.height,
        character: characterById.get(object.id)!,
      })),
  ];

  const grid = buildOccupancyGrid(rects, bounds, { cellSize: options.cellSize ?? 64 });
  const map = grid.cells.map((row) => row.join("")).join("\n");

  // Coordinate frame: right-aligned world-y row labels, and a two-line column
  // digit ruler (tens over ones) — world x = originX + column * cellSize.
  const rowLabel = (row: number): string => String(Math.round(grid.originY + row * grid.cellSize));
  const labelWidth = Math.max(...Array.from({ length: grid.rows }, (_, row) => rowLabel(row).length));
  const gutter = " ".repeat(labelWidth + 1);
  const tens = Array.from({ length: grid.columns }, (_, column) => (
    column % 10 === 0 ? String(Math.floor(column / 10) % 10) : " "
  )).join("");
  const ones = Array.from({ length: grid.columns }, (_, column) => String(column % 10)).join("");
  const frameLines = [
    `${grid.cellSize}px cells · origin (${Math.round(grid.originX)}, ${Math.round(grid.originY)}) · ${grid.columns}×${grid.rows} · x = origin.x + column·${grid.cellSize}`,
    `${gutter}${tens}`,
    `${gutter}${ones}`,
    ...grid.cells.map((row, index) => `${rowLabel(index).padStart(labelWidth)} ${row.join("")}`),
  ];
  const legendLines = legend.map((entry) => (
    `${entry.character} ${entry.type} ${JSON.stringify(entry.text)} ${Math.round(entry.width)}×${Math.round(entry.height)} at (${Math.round(entry.x)}, ${Math.round(entry.y)})`
  ));

  return {
    text: [...frameLines, "", ...legendLines].join("\n"),
    map,
    grid,
    legend,
  };
}
