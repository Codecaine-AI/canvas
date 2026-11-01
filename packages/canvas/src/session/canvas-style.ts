/**
 * The workspace's canvas style settings — the visual theme and its token
 * overrides — as the agent sees them.
 *
 * Studio persists the operator's choice in `canvases/canvas-style.json`,
 * beside the canvas files: the active theme (figjam, schematic-light,
 * schematic-dark) plus each theme's own overrides. With no file the board is
 * drawn in the default theme, schematic-light. Files written before themes
 * existed hold a flat bag of overrides, which the canvas package's resolver
 * reads as the figjam theme's overrides, so they keep working unchanged. A
 * layout session reads the file once when it opens its canvas — the in-app
 * agent at session create, the canvas MCP on every `canvas_open` — so a change
 * made in Studio is picked up by the next open. Every static render the
 * session produces and every geometry judgement that depends on a border or
 * chip (text fit, lints) then resolves through that one value.
 *
 * The theme is a person's choice. The agent reads it so its renders match what
 * Studio draws, and never writes it.
 *
 * Pure file read, no watcher: a missing, unreadable, or malformed file means
 * the defaults, never an error — a style file can only change how the board is
 * drawn, so it must never stop the agent from opening it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CANVAS_STYLE_FILENAME,
  DEFAULT_CANVAS_STYLE,
  resolveCanvasStyle,
  type CanvasStyle,
} from "@codecaine-ai/canvas/style";

export { DEFAULT_CANVAS_STYLE, type CanvasStyle };

/** Path of the style override file for a `canvases/` directory. */
export function canvasStylePath(canvasesDir: string): string {
  return join(canvasesDir, CANVAS_STYLE_FILENAME);
}

/** A fresh copy of the defaults (the schematic-light preset) — never the frozen constant itself. */
function defaultStyle(): CanvasStyle {
  return { ...DEFAULT_CANVAS_STYLE, palette: { ...DEFAULT_CANVAS_STYLE.palette } };
}

/**
 * The workspace canvas style for a `canvases/` directory: `canvas-style.json`
 * resolved by the canvas package's `resolveCanvasStyle` — the active theme's
 * preset plus that theme's overrides, validated and clamped, a pre-theme flat
 * bag read as figjam overrides — or the defaults (schematic-light) when the
 * file is missing or is not valid JSON.
 */
export function loadCanvasStyle(canvasesDir: string): CanvasStyle {
  let raw: string;
  try {
    raw = readFileSync(canvasStylePath(canvasesDir), "utf8");
  } catch {
    return defaultStyle();
  }
  try {
    return resolveCanvasStyle(JSON.parse(raw));
  } catch {
    return defaultStyle();
  }
}

/** The style a session renders and measures with — the defaults when none was loaded. */
export function sessionCanvasStyle(session: { canvasStyle?: CanvasStyle }): CanvasStyle {
  return session.canvasStyle ?? DEFAULT_CANVAS_STYLE;
}
