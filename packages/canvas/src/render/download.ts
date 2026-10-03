/**
 * Browser-side file export for canvas documents — the UI face of the static
 * renderer (./static-svg.ts). Renders the document at natural size with the
 * board background, then hands the result to the browser as a file download:
 * SVG as-is, PNG via an offscreen <canvas> rasterization.
 *
 * Both carry the bundled faces their text was measured with (./svg-fonts.ts):
 * an SVG decoded as an image, or opened on its own, cannot use the page's
 * @font-face rules, so without them it would paint the machine's fonts.
 *
 * This module is deliberately DOM-dependent (Blob, object URLs, Image,
 * <canvas>, <a download>) — it must only be imported from UI code, never from
 * the renderer or server paths.
 */

import type { BundledFace } from "@codecaine-ai/text-measure";
import type { InteractiveCanvasDocument } from "../state/schema";
import { renderDocumentToSvg } from "./static-svg";
import { embedSvgFonts } from "./svg-fonts";
import { normalizeCanvasStyle, type CanvasStyle } from "../theme/canvas-style";

/**
 * The bundled woff2 files beside @codecaine-ai/text-measure, one literal URL
 * per face so bundlers (Vite) see and copy each file.
 */
const PACKAGE_FONT_URLS: Record<string, () => string> = {
  "Inter-Regular": () => new URL("../../../text-measure/fonts/Inter-Regular.woff2", import.meta.url).href,
  "Inter-Medium": () => new URL("../../../text-measure/fonts/Inter-Medium.woff2", import.meta.url).href,
  "Inter-SemiBold": () => new URL("../../../text-measure/fonts/Inter-SemiBold.woff2", import.meta.url).href,
  "Inter-Bold": () => new URL("../../../text-measure/fonts/Inter-Bold.woff2", import.meta.url).href,
  "IBMPlexMono-Regular": () => new URL("../../../text-measure/fonts/IBMPlexMono-Regular.woff2", import.meta.url).href,
  "IBMPlexMono-Medium": () => new URL("../../../text-measure/fonts/IBMPlexMono-Medium.woff2", import.meta.url).href,
  "IBMPlexMono-SemiBold": () => new URL("../../../text-measure/fonts/IBMPlexMono-SemiBold.woff2", import.meta.url).href,
};

/**
 * Where the page loads `face` from: its own @font-face rule for the face (a
 * host that imported text-measure's fonts.css), else the package's file.
 */
function fontUrlFor(face: BundledFace): string | null {
  try {
    for (const sheet of Array.from(window.document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // a cross-origin sheet
      }
      for (const rule of Array.from(rules)) {
        if (!(typeof CSSFontFaceRule !== "undefined" && rule instanceof CSSFontFaceRule)) continue;
        const family = rule.style.getPropertyValue("font-family").trim().replace(/^["']|["']$/g, "");
        const weight = rule.style.getPropertyValue("font-weight").trim();
        if (family !== face.family || weight !== String(face.weight)) continue;
        const src = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(rule.style.getPropertyValue("src"));
        if (src) return new URL(src[1]!, sheet.href ?? window.document.baseURI).href;
      }
    }
  } catch {
    // no CSSOM: fall through to the package file
  }
  return PACKAGE_FONT_URLS[face.file]?.() ?? null;
}

interface NodeReadFile {
  readFile(path: URL): Promise<Uint8Array>;
}

/**
 * A file: URL's bytes from disk, for DOMs whose fetch cannot read file: URLs
 * (happy-dom under Bun or Node, where the package's font URLs are file:).
 * `process.getBuiltinModule` keeps node:fs out of browser bundles; browsers
 * never get here (their font URLs are http(s), and they have no `process`).
 */
async function readFileUrl(url: string): Promise<Uint8Array | null> {
  if (!url.startsWith("file:")) return null;
  const runtime = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
  const fs = runtime?.getBuiltinModule?.("node:fs/promises") as NodeReadFile | undefined;
  if (!fs) return null;
  try {
    return new Uint8Array(await fs.readFile(new URL(url)));
  } catch {
    return null;
  }
}

/** A bundled face's woff2 bytes, fetched from where the page loads it; null when unavailable. */
async function fetchFontFace(face: BundledFace): Promise<Uint8Array | null> {
  const url = fontUrlFor(face);
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (response.ok) return new Uint8Array(await response.arrayBuffer());
  } catch {
    // a fetch without file: support: read the file instead
  }
  return readFileUrl(url);
}

/** `svg` with its bundled faces embedded; the plain SVG when they cannot be loaded. */
async function withEmbeddedFonts(svg: string): Promise<string> {
  try {
    return await embedSvgFonts(svg, fetchFontFace);
  } catch {
    return svg;
  }
}

/**
 * Filename-safe slug from a document title/id: lowercased, whitespace runs
 * become single dashes, characters illegal (or hostile) in filenames are
 * stripped, and leading/trailing separators are trimmed. Falls back to
 * "canvas" when nothing printable survives.
 */
export function sanitizeExportFilename(raw: string | undefined): string {
  const slug = (raw ?? "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    // Illegal on Windows (/\:*?"<>|), plus URL/shell-hostile extras.
    .replace(/[/\\:*?"<>|#%&{}$!'`@+=~]/g, "")
    // Control characters.
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return slug || "canvas";
}

/** Full download filename for a document: sanitized title (or id) + extension. */
export function exportFilenameFor(
  canvasDocument: InteractiveCanvasDocument,
  extension: "svg" | "png",
): string {
  return `${sanitizeExportFilename(canvasDocument.title || canvasDocument.id)}.${extension}`;
}

/** Trigger a browser download of `blob` via a temporary object URL + <a download>. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Load `url` into an Image, resolving on decode and rejecting on error. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Canvas export: failed to load rendered SVG image"));
    image.src = url;
  });
}

/** Encode a raster canvas as a PNG Blob (rejects when encoding fails). */
function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas export: PNG encoding failed"));
    }, "image/png");
  });
}

export interface ExportSvgOptions {
  /** Workspace canvas style the export renders with (defaults when omitted). */
  canvasStyle?: Partial<CanvasStyle>;
}

/**
 * Download the document as a standalone .svg file, rendered at natural size
 * (zoom 1) with the board background. Rejects when rendering fails.
 */
export async function exportDocumentAsSvg(
  canvasDocument: InteractiveCanvasDocument,
  { canvasStyle }: ExportSvgOptions = {},
): Promise<void> {
  const { svg } = renderDocumentToSvg(canvasDocument, { background: "board", canvasStyle });
  const blob = new Blob([await withEmbeddedFonts(svg)], { type: "image/svg+xml" });
  downloadBlob(blob, exportFilenameFor(canvasDocument, "svg"));
}

export interface ExportPngOptions extends ExportSvgOptions {
  /** Raster scale over the natural SVG size (2 = retina-crisp default). */
  scale?: number;
}

/**
 * Download the document as a .png: renders the same natural-size board SVG,
 * loads it through a same-origin Blob object URL (which does not taint the
 * canvas), draws it onto an offscreen <canvas> at `scale`× resolution over a
 * fill in the style's board color (`boardBackground`, so no transparent
 * letterbox survives rasterization), and downloads the PNG encoding. Rejects
 * on render, image load, or encode failure.
 */
export async function exportDocumentAsPng(
  canvasDocument: InteractiveCanvasDocument,
  { scale = 2, canvasStyle }: ExportPngOptions = {},
): Promise<void> {
  const { svg, width, height } = renderDocumentToSvg(canvasDocument, {
    background: "board",
    canvasStyle,
  });
  // The Image decode is its own document: it paints the bundled faces only if the SVG carries them.
  const svgBlob = new Blob([await withEmbeddedFonts(svg)], { type: "image/svg+xml" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const image = await loadImage(svgUrl);
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas export: 2d canvas context unavailable");
    context.fillStyle = normalizeCanvasStyle(canvasStyle).boardBackground;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pngBlob = await canvasToPngBlob(canvas);
    downloadBlob(pngBlob, exportFilenameFor(canvasDocument, "png"));
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
