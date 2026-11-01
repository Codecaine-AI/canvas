/**
 * `loadCanvasStyle` — the workspace's `canvases/canvas-style.json` as a layout
 * session reads it. Two file formats must both load: the theme settings
 * document Studio writes now (`{ theme, themes: { <theme>: overrides } }`),
 * and the flat override bag written before themes existed, which reads as
 * figjam overrides. No file, or anything unreadable, is the default theme
 * (schematic-light), never an error.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_CANVAS_STYLE,
  FIGJAM_CANVAS_STYLE,
  canvasThemePreset,
} from "@codecaine-ai/canvas/style";

import { canvasStylePath, loadCanvasStyle } from "../src/service/session/canvas-style";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A temp `canvases/` directory, with `contents` as its style file when given. */
function canvasesDir(contents?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "canvas-style-load-"));
  dirs.push(dir);
  if (contents !== undefined) writeFileSync(canvasStylePath(dir), contents);
  return dir;
}

describe("loadCanvasStyle", () => {
  test("no style file: the schematic-light defaults", () => {
    const style = loadCanvasStyle(canvasesDir());

    expect(style).toEqual(canvasThemePreset("schematic-light"));
    expect(style).toEqual(DEFAULT_CANVAS_STYLE);
    expect(style.theme).toBe("schematic-light");
  });

  test("a pre-theme flat bag reads as figjam overrides", () => {
    const style = loadCanvasStyle(canvasesDir(JSON.stringify({ shapeCornerRadiusPx: 16, shapeBorderWidthPx: 6 })));

    expect(style.theme).toBe("figjam");
    expect(style.shapeCornerRadiusPx).toBe(16);
    expect(style.shapeBorderWidthPx).toBe(6);
    // Everything the bag does not name stays at the figjam preset.
    expect(style).toEqual({ ...FIGJAM_CANVAS_STYLE, shapeCornerRadiusPx: 16, shapeBorderWidthPx: 6 });
  });

  test("an explicit figjam theme is the figjam preset", () => {
    expect(loadCanvasStyle(canvasesDir(JSON.stringify({ theme: "figjam" })))).toEqual(FIGJAM_CANVAS_STYLE);
    expect(loadCanvasStyle(canvasesDir(JSON.stringify({ theme: "figjam", themes: {} })))).toEqual(FIGJAM_CANVAS_STYLE);
  });

  test("a settings document resolves its active theme plus that theme's overrides", () => {
    const style = loadCanvasStyle(canvasesDir(JSON.stringify({
      theme: "schematic-dark",
      themes: {
        "schematic-dark": { shapeCornerRadiusPx: 4, palette: { red: "#FF0000" } },
        // Another theme's edits never leak into the active one.
        figjam: { shapeCornerRadiusPx: 16 },
      },
    })));
    const preset = canvasThemePreset("schematic-dark");

    expect(style.theme).toBe("schematic-dark");
    expect(style.shapeCornerRadiusPx).toBe(4);
    expect(style.palette.red).toBe("#FF0000");
    expect(style.boardBackground).toBe(preset.boardBackground);
    expect(style.palette.blue).toBe(preset.palette.blue);
  });

  test("the same overrides load identically from either format", () => {
    const overrides = { shapeCornerRadiusPx: 16, sectionCornerRadiusPx: 12 };
    const legacy = loadCanvasStyle(canvasesDir(JSON.stringify(overrides)));
    const settings = loadCanvasStyle(canvasesDir(JSON.stringify({ theme: "figjam", themes: { figjam: overrides } })));

    expect(settings).toEqual(legacy);
  });

  test("malformed JSON and an unknown theme never block the open", () => {
    expect(loadCanvasStyle(canvasesDir("{ not json"))).toEqual(DEFAULT_CANVAS_STYLE);
    expect(loadCanvasStyle(canvasesDir("{ not json")).theme).toBe("schematic-light");
    expect(loadCanvasStyle(canvasesDir(JSON.stringify({ theme: "neon", themes: {} }))).theme).toBe("schematic-light");
  });
});
