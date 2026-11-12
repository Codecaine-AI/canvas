/**
 * One frame of a board as a PNG, with marks drawn over it: the images a
 * reviewer reads (critic.ts) and the before and after of a trial (trial.ts).
 * The frame renders from the board file at world scale, so a mark's
 * coordinates are board coordinates.
 */
import type { CanvasFile, CanvasModules, WorldRect } from "./render.ts";

/** A wider crop is scaled down to this width, and its ruler must state the scale. */
export const CROP_MAX_WIDTH = 2000;

interface CropBoard { objects: unknown[]; connections: unknown[] }

/**
 * `rect` of the board at 1:1, or scaled down to `maxWidth` px. `marks` is SVG
 * in board coordinates, painted on top of the board.
 */
export function renderCropPng(
  canvas: CanvasModules,
  file: CanvasFile,
  rect: WorldRect,
  options: { marks?: string; maxWidth?: number } = {},
): { png: Buffer; width: number; height: number; scale: number } {
  const board = file.persisted as CropBoard;
  const scale = Math.min(1, (options.maxWidth ?? CROP_MAX_WIDTH) / rect.width);
  const scene = { bounds: rect, objects: board.objects, connections: board.connections, obstacles: board.objects, chipZoom: 1 };
  const size = { width: Math.round(rect.width * scale), height: Math.round(rect.height * scale) };
  const { svg } = canvas.render.renderSceneToSvg(board, scene, { ...size, canvasStyle: file.session.canvasStyle });
  const end = svg.lastIndexOf("</svg>");
  const png = canvas.rasterize.rasterizeSvgToPng(`${svg.slice(0, end)}${options.marks ?? ""}${svg.slice(end)}`);
  return { png: png.png, width: png.width, height: png.height, scale };
}
