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

/** One image of a set, under a bar that says what it shows. */
export interface Panel { png: Buffer; width: number; height: number; title: string; colour: string }

/** The height of a panel's title bar, in image px. */
export const PANEL_BAR = 44;
/** The gap between two panels, in image px. */
export const PANEL_GAP = 16;

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The panels side by side (`row`) or one above the other (`column`), each under its title bar, as one PNG. */
export function joinPanels(canvas: CanvasModules, panels: Panel[], layout: "row" | "column"): { png: Buffer; width: number; height: number } {
  let [width, height] = [0, 0];
  const parts = panels.map((panel) => {
    const [x, y] = layout === "row" ? [width && width + PANEL_GAP, 0] : [0, height && height + PANEL_GAP];
    width = Math.max(width, x + panel.width);
    height = Math.max(height, y + PANEL_BAR + panel.height);
    // The title shrinks to fit its bar: a cut title would drop a number.
    const size = Math.min(20, (panel.width - 24) / (panel.title.length * 0.6));
    return `<rect x="${x}" y="${y}" width="${panel.width}" height="${PANEL_BAR}" fill="${panel.colour}"/>`
      + `<text x="${x + 12}" y="${y + PANEL_BAR / 2}" dominant-baseline="central" font-family="Inter" font-weight="700" font-size="${size.toFixed(1)}" fill="#ffffff">${escapeXml(panel.title)}</text>`
      + `<image x="${x}" y="${y + PANEL_BAR}" width="${panel.width}" height="${panel.height}" href="data:image/png;base64,${panel.png.toString("base64")}"/>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<rect width="${width}" height="${height}" fill="#ffffff"/>${parts.join("")}</svg>`;
  return canvas.rasterize.rasterizeSvgToPng(svg);
}
