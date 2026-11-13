/**
 * The highlight images the drawer gets with a round's findings: for each
 * reviewer with findings, one image of its frame, each fault marked in red
 * and tagged with its finding's id (F4, F5). Ford: "they're just kinda
 * saying, here's what's wrong and highlighting what's wrong."
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderCropPng } from "./crop.ts";
import type { CanvasFile, CanvasModules, WorldRect } from "./render.ts";
import { FONT, OWN, bounds, grow, markBox, touches, type Mark, type ReviewerKind } from "./review-inputs.ts";

/** The long edge of a highlight image: the largest image the drawer's model reads without scaling it down. */
export const HIGHLIGHT_MAX_EDGE = 1568;
/** The board a highlight image shows round its unit and its marks. */
const MARGIN = 40;
/** The board a gap reviewer's image shows round a mark that lies in none of its crops. */
const GAP_MARGIN = 200;

/** One finding's marks from one reviewer. */
export interface Highlight { id: string; marks: Mark[] }
/** A reviewer's part of the board, as its record keeps it. */
export interface HighlightUnit { id: string; kind: ReviewerKind; rect: WorldRect; crops: WorldRect[] }
/** One image as the revise message lists it. */
export interface HighlightImage { unit: string; path: string; findings: string[] }

/**
 * The marks as SVG in board coordinates, for an image at `scale` image px a
 * board px: a red box round an area, a red band along a stretch of wire, and
 * on each mark a tag with its finding's id. A tag moves down while it lies on
 * a tag before it.
 */
export function highlightSvg(highlights: Highlight[], scale: number): string {
  const px = (value: number) => value / scale;
  const tags: WorldRect[] = [];
  return highlights.flatMap(({ id, marks }) => marks.map((mark) => {
    const shape = "box" in mark
      ? `<rect x="${mark.box.x}" y="${mark.box.y}" width="${mark.box.width}" height="${mark.box.height}" fill="${OWN}" fill-opacity="0.08" stroke="${OWN}" stroke-width="${px(3)}"/>`
      : `<polyline points="${mark.path.map(([x, y]) => `${x},${y}`).join(" ")}" fill="none" stroke="${OWN}" stroke-opacity="0.45" stroke-width="${px(10)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    const [x, y] = "box" in mark ? [mark.box.x, mark.box.y - px(22)] : [mark.path[0]![0] + px(8), mark.path[0]![1] - px(26)];
    const tag = { x, y, width: px(12 + 9 * id.length), height: px(20) };
    while (tags.some((other) => touches(tag, other))) tag.y += px(22);
    tags.push(tag);
    return `${shape}<rect x="${tag.x}" y="${tag.y}" width="${tag.width}" height="${tag.height}" rx="${px(3)}" fill="${OWN}"/>`
      + `<text x="${tag.x + tag.width / 2}" y="${tag.y + px(15)}" ${FONT} font-size="${px(14)}" font-weight="700" text-anchor="middle" fill="#ffffff">${id}</text>`;
  })).join("");
}

/**
 * The board rect of a reviewer's highlight image: its unit and its marks, or
 * for a gap reviewer the crops that hold a mark. `limit` is the board's frame:
 * a mark that runs off the board does not stretch the image past it. Null
 * when nothing of it lies on the board.
 */
export function highlightFrame(unit: HighlightUnit, marks: Mark[], limit: WorldRect): WorldRect | null {
  const boxes = marks.map(markBox);
  const crops = unit.crops.filter((crop) => boxes.some((box) => touches(box, crop)));
  const frame = unit.kind !== "gap" ? grow(bounds([unit.rect, ...boxes]), MARGIN)
    : crops.length ? bounds(crops) : grow(bounds(boxes), GAP_MARGIN);
  const [left, top] = [Math.max(frame.x, limit.x), Math.max(frame.y, limit.y)];
  const [right, bottom] = [Math.min(frame.x + frame.width, limit.x + limit.width), Math.min(frame.y + frame.height, limit.y + limit.height)];
  return right - left >= 1 && bottom - top >= 1 ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

/**
 * Write `<outDir>/<unit>.png` for each unit with a marked finding, in the
 * units' order. `file` is the board as the round reviewed it.
 */
export function renderHighlights(options: {
  canvas: CanvasModules;
  file: CanvasFile;
  limit: WorldRect;
  units: HighlightUnit[];
  findings: Array<{ id: string; marks: Array<{ unit: string; marks: Mark[] }> }>;
  outDir: string;
}): HighlightImage[] {
  const images: HighlightImage[] = [];
  for (const unit of options.units) {
    const highlights = options.findings.flatMap(({ id, marks }): Highlight[] =>
      marks.filter((entry) => entry.unit === unit.id && entry.marks.length > 0).map((entry) => ({ id, marks: entry.marks })));
    const frame = highlightFrame(unit, highlights.flatMap((highlight) => highlight.marks), options.limit);
    if (highlights.length === 0 || !frame) continue;
    const scale = Math.min(1, HIGHLIGHT_MAX_EDGE / Math.max(frame.width, frame.height));
    const path = resolve(options.outDir, `${unit.id.replace(/[^A-Za-z0-9._-]/g, "_")}.png`);
    mkdirSync(options.outDir, { recursive: true });
    writeFileSync(path, renderCropPng(options.canvas, options.file, frame, { marks: highlightSvg(highlights, scale), maxWidth: Math.round(frame.width * scale) }).png);
    images.push({ unit: unit.id, path, findings: [...new Set(highlights.map((highlight) => highlight.id))] });
  }
  return images;
}
