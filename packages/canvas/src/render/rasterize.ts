/**
 * The agent's camera: SVG → PNG rasterization via @resvg/resvg-js
 * (KERNEL-PROPOSAL §4, D3).
 *
 * The SVG comes from packages/canvas's deterministic renderDocumentToSvg; this
 * module only rasterizes. Fonts: resvg gets every TTF in
 * @codecaine-ai/text-measure's fonts/ directory, the static faces text-measure
 * shapes with (Inter 3.19 Regular/Medium/SemiBold/Bold, IBM Plex Mono 2.5
 * Regular/Medium/SemiBold; OFL licenses alongside). The camera therefore
 * paints the advances the lints and the static renderer measured: the canvas
 * font stacks ("Inter, …", "IBM Plex Mono, …") resolve to those faces at the
 * weight the SVG asks for, and system fonts remain as fallback for anything
 * outside their coverage. Bundled-font renders are stable across machines for
 * the glyphs the faces cover.
 *
 * Every face is a static instance: resvg does not instance variable fonts, so
 * a variable face would paint every weight as Regular.
 */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";

/** text-measure's fonts/ directory, resolved through the package's "./fonts/*" export. */
const FONTS_DIR = dirname(
  fileURLToPath(import.meta.resolve("@codecaine-ai/text-measure/fonts/Inter-Regular.ttf")),
);
/** Keep native allocations bounded even if an SVG declares absurd dimensions. */
const MAX_RASTER_DIMENSION = 4096;

interface SvgViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

let fontFiles: string[] | undefined;

/** Every TTF text-measure ships, sorted: the seven static faces it measures with. */
function bundledFontFiles(): string[] {
  fontFiles ??= readdirSync(FONTS_DIR)
    .filter((file) => /\.ttf$/i.test(file))
    .sort()
    .map((file) => join(FONTS_DIR, file));
  return fontFiles;
}

export interface RenderPngResult {
  png: Buffer;
  width: number;
  height: number;
}

function attributeValue(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(tag);
  return match?.[2];
}

function svgLength(tag: string, name: string): number | undefined {
  const raw = attributeValue(tag, name)?.trim();
  if (raw === undefined) return undefined;
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(?:px)?$/i.exec(raw);
  return match ? Number(match[1]) : Number.NaN;
}

function replaceAttribute(tag: string, name: string, value: number): string {
  return tag.replace(
    new RegExp(`(\\b${name}\\s*=\\s*["'])[^"']*(["'])`, "i"),
    `$1${value}$2`,
  );
}

function rectIntersectsViewport(rect: SvgViewport, viewport: SvgViewport): boolean {
  return rect.x < viewport.x + viewport.width
    && rect.x + rect.width > viewport.x
    && rect.y < viewport.y + viewport.height
    && rect.y + rect.height > viewport.y;
}

function elementRect(tag: string): SvgViewport | null {
  const x = svgLength(tag, "x") ?? 0;
  const y = svgLength(tag, "y") ?? 0;
  const width = svgLength(tag, "width");
  const height = svgLength(tag, "height");
  if (![x, y, width, height].every((value) => Number.isFinite(value))) return null;
  if (width === undefined || height === undefined || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

/**
 * resvg 2.6 aborts natively when an off-viewport filter or nested SVG is
 * clipped to an empty IntRect. Refuse such SVGs in JS before native code is
 * entered. Harness crop renders cull these elements at the document boundary;
 * this is a final guard against a future call-site regression.
 */
function validateClipElements(svg: string, viewport: SvgViewport, rootTag: string): void {
  const nestedSvgs = [...svg.matchAll(/<svg\b[^>]*>/gi)].map((match) => match[0]);
  for (const [index, tag] of nestedSvgs.entries()) {
    if (index === 0 && tag === rootTag) continue;
    const rect = elementRect(tag);
    if (!rect || !rectIntersectsViewport(rect, viewport)) {
      throw new Error("SVG contains a degenerate or off-viewport nested SVG.");
    }
  }

  for (const match of svg.matchAll(/<[^/!][^>]*\bfilter\s*=\s*["'][^"']+["'][^>]*>/gi)) {
    const rect = elementRect(match[0]);
    if (!rect || !rectIntersectsViewport(rect, viewport)) {
      throw new Error("SVG contains a degenerate or off-viewport filtered element.");
    }
  }
}

function prepareSvgForRasterization(svg: string): string {
  const rootTag = /^\s*(<svg\b[^>]*>)/i.exec(svg)?.[1];
  if (!rootTag) throw new Error("Raster SVG must start with a root <svg> element.");

  const declaredWidth = svgLength(rootTag, "width");
  const declaredHeight = svgLength(rootTag, "height");
  if (!Number.isFinite(declaredWidth) || !Number.isFinite(declaredHeight)
    || declaredWidth === undefined || declaredHeight === undefined
    || declaredWidth <= 0 || declaredHeight <= 0) {
    throw new Error("Raster SVG width and height must be finite positive pixel lengths.");
  }

  const width = Math.min(MAX_RASTER_DIMENSION, Math.max(1, Math.round(declaredWidth)));
  const height = Math.min(MAX_RASTER_DIMENSION, Math.max(1, Math.round(declaredHeight)));
  const viewBoxValue = attributeValue(rootTag, "viewBox");
  let viewport: SvgViewport = { x: 0, y: 0, width, height };
  if (viewBoxValue !== undefined) {
    const parts = viewBoxValue.trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 4 || !parts.every(Number.isFinite) || parts[2]! <= 0 || parts[3]! <= 0) {
      throw new Error("Raster SVG viewBox must have finite coordinates and positive dimensions.");
    }
    viewport = { x: parts[0]!, y: parts[1]!, width: parts[2]!, height: parts[3]! };
  }

  const normalizedRoot = replaceAttribute(
    replaceAttribute(rootTag, "width", width),
    "height",
    height,
  );
  const normalizedSvg = svg.replace(rootTag, normalizedRoot);
  validateClipElements(normalizedSvg, viewport, normalizedRoot);
  return normalizedSvg;
}

/** Rasterize a complete standalone <svg> string at its declared pixel size. */
export function rasterizeSvgToPng(svg: string): RenderPngResult {
  const preparedSvg = prepareSvgForRasterization(svg);
  const fontFiles = bundledFontFiles();
  const resvg = new Resvg(preparedSvg, {
    font: {
      // text-measure's faces win; system fonts cover the fallbacks.
      fontFiles,
      loadSystemFonts: true,
      defaultFontFamily: "Helvetica",
      // The canvas font stack ends in generic sans-serif; without this pin
      // fontdb's generic default can land on a serif face.
      sansSerifFamily: "Helvetica",
    },
  });
  const rendered = resvg.render();
  const png = rendered.asPng();
  return { png: Buffer.from(png), width: rendered.width, height: rendered.height };
}
