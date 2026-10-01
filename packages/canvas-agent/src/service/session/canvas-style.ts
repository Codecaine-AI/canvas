/**
 * The workspace's canvas style settings (corner radii, border widths) as the
 * agent sees them.
 *
 * Studio persists the operator's overrides as a partial `CanvasStyle` bag in
 * `canvases/canvas-style.json`, beside the canvas files. A layout session
 * reads it once when it opens its canvas — the in-app agent at session create,
 * the canvas MCP on every `canvas_open` — so a change made in Studio is picked
 * up by the next open. Every static render the session produces and every
 * geometry judgement that depends on a border or chip (text fit, lints) then
 * resolves through that one value.
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
  normalizeCanvasStyle,
  type CanvasStyle,
} from "@codecaine-ai/canvas/style";

export { DEFAULT_CANVAS_STYLE, type CanvasStyle };

/** Path of the style override file for a `canvases/` directory. */
export function canvasStylePath(canvasesDir: string): string {
  return join(canvasesDir, CANVAS_STYLE_FILENAME);
}

/**
 * The workspace canvas style for a `canvases/` directory: the overrides in
 * `canvas-style.json` filled with defaults and clamped by
 * `normalizeCanvasStyle`, or the defaults when the file is missing or is not
 * valid JSON.
 */
export function loadCanvasStyle(canvasesDir: string): CanvasStyle {
  let raw: string;
  try {
    raw = readFileSync(canvasStylePath(canvasesDir), "utf8");
  } catch {
    return { ...DEFAULT_CANVAS_STYLE };
  }
  try {
    return normalizeCanvasStyle(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CANVAS_STYLE };
  }
}

/** The style a session renders and measures with — the defaults when none was loaded. */
export function sessionCanvasStyle(session: { canvasStyle?: CanvasStyle }): CanvasStyle {
  return session.canvasStyle ?? DEFAULT_CANVAS_STYLE;
}
