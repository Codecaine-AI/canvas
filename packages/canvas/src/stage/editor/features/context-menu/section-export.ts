import { sanitizeExportFilename } from "../../../../render/download";
import { renderDocumentToSvg } from "../../../../render/static-svg";
import type { InteractiveCanvasDocument } from "../../../../state/schema";

export type SectionExportFormat = "svg" | "png";

const BOARD_BACKGROUND = "#F5F5F5";

export function renderSectionForExport(
  document: InteractiveCanvasDocument,
  sectionId: string,
) {
  return renderDocumentToSvg(document, {
    background: "board",
    sectionId,
  });
}

export function sectionExportFilename(
  document: InteractiveCanvasDocument,
  sectionId: string,
  extension: SectionExportFormat,
): string {
  const section = document.objects.find(
    (object) => object.id === sectionId && object.type === "section",
  );
  const boardName = sanitizeExportFilename(document.title || document.id);
  const sectionName = sanitizeExportFilename(section?.text || "section");
  return `${boardName}-${sectionName}.${extension}`;
}

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

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Canvas section export: failed to load rendered SVG image"));
    image.src = url;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas section export: PNG encoding failed"));
    }, "image/png");
  });
}

async function exportSectionAsSvg(
  document: InteractiveCanvasDocument,
  sectionId: string,
): Promise<void> {
  const { svg } = renderSectionForExport(document, sectionId);
  const blob = new Blob([svg], { type: "image/svg+xml" });
  downloadBlob(blob, sectionExportFilename(document, sectionId, "svg"));
}

async function exportSectionAsPng(
  document: InteractiveCanvasDocument,
  sectionId: string,
  scale = 2,
): Promise<void> {
  const { svg, width, height } = renderSectionForExport(document, sectionId);
  const svgBlob = new Blob([svg], { type: "image/svg+xml" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const image = await loadImage(svgUrl);
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas section export: 2d canvas context unavailable");
    context.fillStyle = BOARD_BACKGROUND;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pngBlob = await canvasToPngBlob(canvas);
    downloadBlob(pngBlob, sectionExportFilename(document, sectionId, "png"));
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export async function exportCanvasSection(
  document: InteractiveCanvasDocument,
  sectionId: string,
  format: SectionExportFormat,
): Promise<void> {
  if (format === "svg") {
    await exportSectionAsSvg(document, sectionId);
    return;
  }
  await exportSectionAsPng(document, sectionId);
}
