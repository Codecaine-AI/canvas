import { existsSync, readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { Resvg } from "@resvg/resvg-js";

import type { InteractiveCanvasDocument } from "../../../../canvas/src/state/schema.ts";

import type { CanvasFileClient } from "./harness.ts";

export const SNAPSHOT_WIDTH = 2800;
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
