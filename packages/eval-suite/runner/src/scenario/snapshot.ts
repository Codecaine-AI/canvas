import { readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";

import type { InteractiveCanvasDocument } from "../../../../canvas/src/state/schema.ts";

import type { CanvasFileClient } from "./harness.ts";

export const SNAPSHOT_WIDTH = 2800;
// Keep eval snapshots aligned with kernel perception rendering. Importing the
// kernel renderer would cross package boundaries and pull in its rasterization
// pipeline, so resolve the same font files directly here: every TTF in
// @codecaine-ai/text-measure's fonts/ directory, the faces the agent camera
// (canvas-agent/src/service/render.ts) hands resvg.
const FONTS_DIR = dirname(
  fileURLToPath(import.meta.resolve("@codecaine-ai/text-measure/fonts/Inter-Regular.ttf")),
);

let fontFiles: string[] | undefined;

/**
 * The text-measure TTFs. Throws when there are none, so a snapshot never
 * falls back to system fonts unnoticed (resvg would paint Helvetica).
 */
function bundledFontFiles(): string[] {
  if (fontFiles) return fontFiles;
  const files = readdirSync(FONTS_DIR)
    .filter((file) => /\.ttf$/i.test(file))
    .sort()
    .map((file) => join(FONTS_DIR, file));
  if (files.length === 0) throw new Error(`No TTF faces in ${FONTS_DIR}: eval snapshots would render in system fonts.`);
  fontFiles = files;
  return files;
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
