/**
 * The smart guides, drawn on a board render for a reviewer agent: what is in
 * line, and what sits a few px off.
 *
 * Ford: "if you, like, kind of move things in a way, it will, like, highlight
 * pink. If it is, like, in line in the same, like, shapes and such. I'd want
 * something like this, but programmatically or visually that we could do to,
 * like, have the reviewer agents be doing that."
 *
 * Each near-miss (board/smart-guides/near-misses.ts) draws its guide in the
 * Studio guide pink with a numbered tag: the line is where the box, gap or
 * arrowhead belongs. The lines the board already sits on draw in the same
 * pink, faint. A number is the near-miss's place in the whole board's list,
 * so a crop and the whole board name one guide alike, and `legend` gives each
 * number's finding as canvas_check words it.
 */
import {
  findBoardGuides, fixText, type BoardGuides, type GuideSegment,
} from "../../board/smart-guides/near-misses";
import { renderAtJudgeSize } from "../../render/judge-size";
import { rasterizeSvgToPng } from "../../render/rasterize";
import { renderSceneToSvg, type Rect } from "../../render/index";
import type { InteractiveCanvasDocument } from "../../state/schema";
import { normalizeCanvasStyle, stageMarkColors, type CanvasStyle } from "../../theme/canvas-style";
import { BOARD_VIEW_WIDTH, renderBoardView } from "./views";

/** Line widths and tag sizes, in px of the PNG at any scale. */
const NEAR_MISS_LINE_PX = 2;
const ALIGNED_LINE_PX = 1;
const ALIGNED_OPACITY = 0.4;
const TAG_PX = { height: 16, font: 11, pad: 5, glyph: 7, gap: 2 };

export interface GuideOverlayOptions {
  canvasStyle?: Partial<CanvasStyle>;
  /** A board rect to crop to, at 1:1. Without it: the whole board at the size canvas_check renders. */
  region?: Rect;
}

export interface GuideOverlaySvg {
  svg: string;
  /** The board rect the render shows. */
  camera: Rect;
  /** One line per numbered guide in the render: `G2 <finding> (<the call that fixes it>)`. */
  legend: string[];
}

export interface GuideOverlay extends Omit<GuideOverlaySvg, "svg"> {
  png: Buffer;
  width: number;
  height: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The part of a guide inside `camera`, from its top-left end, or null when none is. Guides run along an axis. */
function visible(segment: GuideSegment, camera: Rect): GuideSegment | null {
  const [right, bottom] = [camera.x + camera.width, camera.y + camera.height];
  const [left, top] = [Math.min(segment.x1, segment.x2), Math.min(segment.y1, segment.y2)];
  const [far, low] = [Math.max(segment.x1, segment.x2), Math.max(segment.y1, segment.y2)];
  if (far < camera.x || left > right || low < camera.y || top > bottom) return null;
  return { x1: clamp(left, camera.x, right), y1: clamp(top, camera.y, bottom), x2: clamp(far, camera.x, right), y2: clamp(low, camera.y, bottom) };
}

const line = ({ x1, y1, x2, y2 }: GuideSegment) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;

/** The guide marks for `camera`, in board coordinates, and the numbers of the near-misses they show. */
function guideMarks(guides: BoardGuides, camera: Rect, scale: number, color: string): { marks: string; shown: number[] } {
  const px = (value: number) => value / scale;
  const aligned = guides.aligned.flatMap((segment) => visible(segment, camera) ?? []).map(line);
  const nearMisses: string[] = [];
  const tags: string[] = [];
  const shown: number[] = [];
  for (const [index, miss] of guides.nearMisses.entries()) {
    const segments = miss.guides.flatMap((segment) => visible(segment, camera) ?? []);
    if (segments.length === 0) continue;
    shown.push(index + 1);
    nearMisses.push(...segments.map(line));
    // The tag sits beside the guide's top-left end, clear of an arrowhead on the line, and inside the camera.
    const text = `G${index + 1}`;
    const [width, height] = [px(TAG_PX.pad * 2 + text.length * TAG_PX.glyph), px(TAG_PX.height)];
    const start = segments[0]!;
    const across = start.y1 === start.y2;
    const x = clamp(start.x1 + (across ? 0 : px(TAG_PX.gap)), camera.x, camera.x + camera.width - width);
    const y = clamp(start.y1 - (across ? height + px(TAG_PX.gap) : 0), camera.y, camera.y + camera.height - height);
    tags.push(
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${px(3)}" fill="${color}" stroke="none"/>`
      + `<text x="${x + width / 2}" y="${y + height / 2 + px(TAG_PX.font * 0.36)}" font-size="${px(TAG_PX.font)}" font-weight="700"`
      + ` text-anchor="middle" fill="#ffffff" stroke="none">${text}</text>`,
    );
  }
  const marks = `<g fill="none" stroke="${color}">`
    + `<g stroke-width="${px(ALIGNED_LINE_PX)}" stroke-opacity="${ALIGNED_OPACITY}">${aligned.join("")}</g>`
    + `<g stroke-width="${px(NEAR_MISS_LINE_PX)}">${nearMisses.join("")}</g>`
    + `${tags.join("")}</g>`;
  return { marks, shown };
}

/** The board, or one region of it, as SVG with the smart guides drawn over it. */
export function renderGuideOverlaySvg(document: InteractiveCanvasDocument, options: GuideOverlayOptions = {}): GuideOverlaySvg {
  const canvasStyle = normalizeCanvasStyle(options.canvasStyle);
  const guides = findBoardGuides(document, canvasStyle);
  let view: { svg: string; camera: Rect; scale: number };
  if (options.region) {
    const camera = options.region;
    const scene = { bounds: camera, objects: document.objects, connections: document.connections, obstacles: document.objects, chipZoom: 1 };
    view = { svg: renderSceneToSvg(document, scene, { width: camera.width, height: camera.height, canvasStyle }).svg, camera, scale: 1 };
  } else {
    const { width, rendered } = renderAtJudgeSize((size) => renderBoardView(document, { width: size, canvasStyle }), BOARD_VIEW_WIDTH);
    view = { svg: rendered.svg, camera: rendered.camera, scale: width / rendered.camera.width };
  }
  const { marks, shown } = guideMarks(guides, view.camera, view.scale, stageMarkColors(canvasStyle).distribution);
  // The render's viewBox is in board coordinates, so the marks go in as they are, on top.
  const end = view.svg.lastIndexOf("</svg>");
  return {
    svg: `${view.svg.slice(0, end)}${marks}${view.svg.slice(end)}`,
    camera: view.camera,
    legend: shown.map((number) => {
      const miss = guides.nearMisses[number - 1]!;
      return `G${number} ${miss.message} (${fixText(miss.fix)})`;
    }),
  };
}

/** The board, or one region of it, as a PNG with the smart guides drawn over it. */
export function renderGuideOverlay(document: InteractiveCanvasDocument, options: GuideOverlayOptions = {}): GuideOverlay {
  const { svg, camera, legend } = renderGuideOverlaySvg(document, options);
  return { ...rasterizeSvgToPng(svg), camera, legend };
}
