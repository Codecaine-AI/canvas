/**
 * Browser-side file export for canvas documents — the UI face of the static
 * renderer (./static-svg.ts). Renders the document at natural size with the
 * board background, then hands the result to the browser as a file download:
 * SVG as-is, PNG via an offscreen <canvas> rasterization.
 *
 * This module is deliberately DOM-dependent (Blob, object URLs, Image,
 * <canvas>, <a download>) — it must only be imported from UI code, never from
 * the renderer or server paths.
 */

import type { InteractiveCanvasDocument } from "../state/schema";
import { renderDocumentToSvg } from "./static-svg";

/**
 * Board surface color — keep in sync with CANVAS_BG in stage/CanvasStage.tsx
 * (the board surface is light-only, even under the app's dark theme). Used to
 * pre-fill the PNG raster so no transparent letterbox survives rasterization.
 */
const BOARD_BACKGROUND = "#F5F5F5";

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

/**
 * Download the document as a standalone .svg file, rendered at natural size
 * (zoom 1) with the board background. Rejects when rendering fails.
 */
export async function exportDocumentAsSvg(
  canvasDocument: InteractiveCanvasDocument,
): Promise<void> {
  const { svg } = renderDocumentToSvg(canvasDocument, { background: "board" });
  const blob = new Blob([svg], { type: "image/svg+xml" });
  downloadBlob(blob, exportFilenameFor(canvasDocument, "svg"));
}

export interface ExportPngOptions {
  /** Raster scale over the natural SVG size (2 = retina-crisp default). */
  scale?: number;
}

/**
 * Download the document as a .png: renders the same natural-size board SVG,
 * loads it through a same-origin Blob object URL (which does not taint the
 * canvas), draws it onto an offscreen <canvas> at `scale`× resolution over a
 * board-color fill, and downloads the PNG encoding. Rejects on render, image
 * load, or encode failure.
 */
export async function exportDocumentAsPng(
  canvasDocument: InteractiveCanvasDocument,
  { scale = 2 }: ExportPngOptions = {},
): Promise<void> {
  const { svg, width, height } = renderDocumentToSvg(canvasDocument, { background: "board" });
  const svgBlob = new Blob([svg], { type: "image/svg+xml" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const image = await loadImage(svgUrl);
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas export: 2d canvas context unavailable");
    context.fillStyle = BOARD_BACKGROUND;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pngBlob = await canvasToPngBlob(canvas);
    downloadBlob(pngBlob, exportFilenameFor(canvasDocument, "png"));
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
