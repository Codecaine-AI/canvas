import type { CompileResult, Rect } from "./types";

export interface OccupancyRect extends Rect {
  /** A single-character mark. Later rectangles overwrite earlier ones. */
  character?: string;
}

export interface OccupancyBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export interface OccupancyOptions {
  cellSize?: number;
  emptyCharacter?: string;
}

export interface OccupancyGrid {
  cellSize: number;
  originX: number;
  originY: number;
  columns: number;
  rows: number;
  emptyCharacter: string;
  cells: string[][];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function firstCharacter(value: string | undefined, fallback: string): string {
  return value?.[0] ?? fallback;
}

function inferredBounds(rects: readonly OccupancyRect[]): Required<OccupancyBounds> {
  if (!rects.length) return { x: 0, y: 0, width: 1, height: 1 };
  const x = Math.min(0, ...rects.map((rect) => rect.x));
  const y = Math.min(0, ...rects.map((rect) => rect.y));
  const right = Math.max(x + 1, ...rects.map((rect) => rect.x + Math.max(0, rect.width)));
  const bottom = Math.max(y + 1, ...rects.map((rect) => rect.y + Math.max(0, rect.height)));
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * Rasterize placed rectangles into a coarse, deterministic character grid.
 * This deliberately preserves only occupancy—not region-tree semantics.
 */
export function buildOccupancyGrid(
  rects: readonly OccupancyRect[],
  bounds?: OccupancyBounds,
  options: OccupancyOptions = {},
): OccupancyGrid {
  const inferred = bounds
    ? { x: bounds.x ?? 0, y: bounds.y ?? 0, width: bounds.width, height: bounds.height }
    : inferredBounds(rects);
  const cellSize = Number.isFinite(options.cellSize) && (options.cellSize ?? 0) > 0
    ? Number(options.cellSize)
    : 64;
  const emptyCharacter = firstCharacter(options.emptyCharacter, ".");
  const columns = Math.max(1, Math.ceil(Math.max(1, inferred.width) / cellSize));
  const rows = Math.max(1, Math.ceil(Math.max(1, inferred.height) / cellSize));
  const cells = Array.from({ length: rows }, () => new Array<string>(columns).fill(emptyCharacter));

  rects.forEach((rect) => {
    if (rect.width <= 0 || rect.height <= 0) return;
    const startColumn = clamp(Math.floor((rect.x - inferred.x) / cellSize), 0, columns - 1);
    const endColumn = clamp(Math.ceil((rect.x + rect.width - inferred.x) / cellSize) - 1, 0, columns - 1);
    const startRow = clamp(Math.floor((rect.y - inferred.y) / cellSize), 0, rows - 1);
    const endRow = clamp(Math.ceil((rect.y + rect.height - inferred.y) / cellSize) - 1, 0, rows - 1);
    const character = firstCharacter(rect.character, "#");
    for (let row = startRow; row <= endRow; row += 1) {
      const cellsRow = cells[row];
      if (!cellsRow) continue;
      for (let column = startColumn; column <= endColumn; column += 1) cellsRow[column] = character;
    }
  });

  return {
    cellSize,
    originX: inferred.x,
    originY: inferred.y,
    columns,
    rows,
    emptyCharacter,
    cells,
  };
}

/** Match the prototype read-back: gutters first, then non-section objects. */
export function buildCompileOccupancy(result: CompileResult, options: OccupancyOptions = {}): OccupancyGrid {
  const gutterRects: OccupancyRect[] = result.gutters.map((gutter) => ({
    x: gutter.x,
    y: gutter.y,
    width: gutter.width,
    height: gutter.height,
    character: gutter.orientation === "vertical" ? "|" : "-",
  }));
  const objectRects: OccupancyRect[] = result.objects
    .filter((object) => object.type !== "section")
    .map((object) => ({ x: object.x, y: object.y, width: object.width, height: object.height, character: "#" }));
  return buildOccupancyGrid(
    [...gutterRects, ...objectRects],
    { width: result.canvas.width, height: result.canvas.height },
    options,
  );
}

export function occupancyGridToAscii(grid: OccupancyGrid, includeHeader = true): string {
  const body = grid.cells.map((row) => row.join("")).join("\n");
  if (!includeHeader) return body;
  return `${grid.cellSize}px cells · ${grid.columns}×${grid.rows}\n${body}`;
}

/** Concise aliases for consumers that treat occupancy as a read-back adapter. */
export const createOccupancyGrid = buildOccupancyGrid;
export const occupancyToAscii = occupancyGridToAscii;

