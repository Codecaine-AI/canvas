import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import { renderCropPng } from "./crop.ts";
import { CANVAS_REPO_ROOT } from "./paths.ts";
import { loadCanvas } from "./render.ts";

const BOARD = resolve(import.meta.dir, "fixtures/review/b05.canvas.json");

describe("board crops", () => {
  test("render a frame at 1:1, and scale a wide one down", async () => {
    const canvas = await loadCanvas(CANVAS_REPO_ROOT);
    const file = canvas.toolkit.openCanvasFile(BOARD);
    const frame = { x: 300, y: 100, width: 800, height: 600 };
    const plain = renderCropPng(canvas, file, frame);
    expect(plain).toMatchObject({ width: 800, height: 600, scale: 1 });
    const marked = renderCropPng(canvas, file, frame, { marks: `<rect x="320" y="120" width="200" height="100" fill="#d92d20"/>` });
    expect(marked.png.equals(plain.png)).toBe(false);
    expect(renderCropPng(canvas, file, { x: 0, y: 0, width: 2500, height: 1000 })).toMatchObject({ width: 2000, height: 800, scale: 0.8 });
  });
});
