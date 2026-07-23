import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

export const FIXTURES_DIR = join(import.meta.dir, "fixtures");

export interface FixtureProgram {
  file: string;
  text: string;
  width: number;
  height: number;
}

interface FixtureMeta {
  file: string;
  width: number;
  height: number;
}

/** The corpus programs lifted from the lab's guide examples. */
export function loadFixtures(): FixtureProgram[] {
  const manifest = JSON.parse(
    readFileSync(join(FIXTURES_DIR, "fixtures.json"), "utf8"),
  ) as FixtureMeta[];
  return manifest.map(({ file, width, height }) => ({
    file,
    text: readFileSync(join(FIXTURES_DIR, file), "utf8").replace(/\n$/, ""),
    width,
    height,
  }));
}

export interface CanvasBoard {
  file: string;
  document: InteractiveCanvasDocument;
}

/** Immutable board snapshots used by the lab's promoted assertions. */
export function loadCanvasBoards(): CanvasBoard[] {
  return readdirSync(FIXTURES_DIR)
    .filter((file) => file.endsWith(".canvas.json"))
    .sort()
    .map((file) => ({
      file,
      document: JSON.parse(
        readFileSync(join(FIXTURES_DIR, file), "utf8"),
      ) as InteractiveCanvasDocument,
    }));
}

function contentBounds(document: InteractiveCanvasDocument): { width: number; height: number } {
  const objects = document.objects;
  const left = Math.min(...objects.map(({ geometry }) => geometry.x));
  const top = Math.min(...objects.map(({ geometry }) => geometry.y));
  const right = Math.max(...objects.map(({ geometry }) => geometry.x + geometry.width));
  const bottom = Math.max(...objects.map(({ geometry }) => geometry.y + geometry.height));
  return { width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

/** The expansion canvas the lab's dev assertions used for real boards. */
export function dimensionFor(document: InteractiveCanvasDocument): { width: number; height: number } {
  const bounds = contentBounds(document);
  return {
    width: Math.max(720, Math.round(bounds.width)),
    height: Math.max(480, Math.round(bounds.height)),
  };
}
