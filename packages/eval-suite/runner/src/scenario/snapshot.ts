import { existsSync, readdirSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { Resvg } from "@resvg/resvg-js";

import { renderDocumentToSvg } from "../../../../canvas/src/render/static-svg.ts";
import type { InteractiveCanvasDocument } from "../../../../canvas/src/state/schema.ts";

import type { CanvasFileClient } from "./harness.ts";

export const SNAPSHOT_WIDTH = 2800;
const REFERENCE_IDS = ["gc-decomp-harness", "intent-classification-2"] as const;
// Keep eval snapshots aligned with kernel perception rendering. Importing the
// kernel renderer would cross package boundaries and pull in its rasterization
// pipeline, so resolve the same bundled font assets directly here.
const FONTS_DIR = resolve(
  import.meta.dir,
  "..",
  "..",
  "..",
  "..",
  "canvas-agent",
  "assets",
  "fonts",
);

export interface ReferenceSnapshotResult {
  id: (typeof REFERENCE_IDS)[number];
  source: string;
  pngPath: string;
}

function bundledFontFiles(): string[] {
  if (!existsSync(FONTS_DIR)) return [];
  return readdirSync(FONTS_DIR)
    .filter((file) => /\.(ttf|otf|ttc)$/i.test(file))
    .sort()
    .map((file) => join(FONTS_DIR, file));
}

export function svgToPng(svg: string): Uint8Array {
  const rendered = new Resvg(svg, {
    fitTo: { mode: "width", value: SNAPSHOT_WIDTH },
    font: {
      fontFiles: bundledFontFiles(),
      loadSystemFonts: true,
      defaultFontFamily: "Helvetica",
      sansSerifFamily: "Helvetica",
    },
  });
  return rendered.render().asPng();
}

export async function writeSvgPng(svg: string, pngPath: string): Promise<void> {
  await writeFile(pngPath, svgToPng(svg));
}

export async function writeCanvasSnapshot(options: {
  files: CanvasFileClient;
  canvasId: string;
  scenarioDir: string;
  stage: string;
  svg?: string;
}): Promise<InteractiveCanvasDocument> {
  const document = await options.files.getCanvas(options.canvasId);
  await writeFile(
    resolve(options.scenarioDir, `${options.stage}.json`),
    `${JSON.stringify(document, null, 2)}\n`,
  );
  const svg = options.svg ?? await options.files.previewSvg(options.canvasId);
  await writeSvgPng(svg, resolve(options.scenarioDir, `${options.stage}.png`));
  return document;
}

function locallyRenderReference(document: InteractiveCanvasDocument): string {
  return renderDocumentToSvg(document, {
    fit: "content",
    padding: 48,
    width: 640,
    background: "board",
  }).svg;
}

async function studioIsUp(studioOrigin: string): Promise<boolean> {
  try {
    const response = await fetch(`${studioOrigin}/api/canvases`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return false;
    const payload = await response.json() as { canvases?: unknown };
    return Array.isArray(payload.canvases);
  } catch {
    return false;
  }
}

async function studioReferenceSvg(
  studioOrigin: string,
  referenceId: string,
): Promise<string> {
  const url = `${studioOrigin}/api/canvases/${encodeURIComponent(referenceId)}/preview.svg?fit=content&pad=48`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(
      `Reference ${referenceId} did not render from the main studio: ${response.status} ${await response.text()}`,
    );
  }
  return await response.text();
}

async function localReference(options: {
  repoRoot: string;
  referenceId: string;
}): Promise<{ svg: string; source: string }> {
  const candidates = [
    resolve(options.repoRoot, "canvases", "archive", `${options.referenceId}.canvas.json`),
    resolve(options.repoRoot, "canvases", `${options.referenceId}.canvas.json`),
  ];
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const document = JSON.parse(
        await readFile(candidate, "utf8"),
      ) as InteractiveCanvasDocument;
      return { svg: locallyRenderReference(document), source: candidate };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Reference ${options.referenceId} is unavailable for local rendering: ${String(lastError)}`,
  );
}

export async function snapshotReferences(options: {
  repoRoot: string;
  runDir: string;
  studioOrigin?: string;
}): Promise<ReferenceSnapshotResult[]> {
  const studioOrigin = options.studioOrigin ?? "http://127.0.0.1:4000";
  const refsDir = resolve(options.runDir, "refs");
  await mkdir(refsDir, { recursive: true });
  const useStudio = await studioIsUp(studioOrigin);
  const results: ReferenceSnapshotResult[] = [];

  for (const id of REFERENCE_IDS) {
    const pngPath = resolve(refsDir, `${id}.png`);
    if (useStudio) {
      await writeSvgPng(await studioReferenceSvg(studioOrigin, id), pngPath);
      results.push({
        id,
        source: `${studioOrigin}/api/canvases/${id}/preview.svg`,
        pngPath,
      });
      continue;
    }
    const local = await localReference({ repoRoot: options.repoRoot, referenceId: id });
    await writeSvgPng(local.svg, pngPath);
    results.push({ id, source: local.source, pngPath });
  }
  return results;
}
