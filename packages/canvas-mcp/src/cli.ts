#!/usr/bin/env bun
/**
 * `codecaine-canvas` — command-line entry for the canvas MCP.
 *
 *   codecaine-canvas mcp [--workspace <dir>] [--canvases <dir>]   serve the canvas tools over stdio
 *   codecaine-canvas guidance [--write | --check]   print, write or check the canvas skill folder
 *
 * Three roots, one role each:
 * - Containment root: `--workspace`, else the project root. canvas_open opens
 *   nothing outside it.
 * - Project root: `CLAUDE_PROJECT_DIR` (set by Claude Code), else the current
 *   directory. A relative board path resolves against it first.
 * - Boards folder: the standalone boards that ids, canvas_list and
 *   canvas_create use.
 * stdout carries the MCP protocol, so diagnostics go to stderr only.
 */
import { existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

import { useHarfBuzz } from "@codecaine-ai/text-measure/headless";

import { guidanceCommand } from "./guidance";
import { startMcp } from "./mcp";
import { loadCodecaineEnv } from "./codecaine-env";
// Background and client-launched processes do not inherit the shell. See codecaine-env.ts.
loadCodecaineEnv();

const args = process.argv.slice(2);
const command = args.shift() ?? "help";

function option(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

/** A root in canonical form, so the cwd (always real) and a symlinked `--workspace` compare. */
function root(path: string): string {
  return existsSync(path) ? realpathSync(path) : resolve(path);
}

const project = root(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const workspace = root(option("--workspace") ?? project);

/**
 * The boards folder: `<project>/canvases`, else `<workspace>/canvases`, the
 * first that exists. Else `--canvases`, else the canvas repo this package
 * lives in, so a user-scoped install always has a board set to edit.
 */
const canvasesDir = [join(project, "canvases"), join(workspace, "canvases")].find((dir) => existsSync(dir))
  ?? resolve(option("--canvases") ?? resolve(import.meta.dir, "../../../canvases"));

try {
  switch (command) {
    case "mcp":
      await startMcp({ workspace, project, canvasesDir });
      break;
    case "guidance":
      // The contact sheet measures its captions; measure exactly, as the server does.
      await useHarfBuzz();
      process.exitCode = await guidanceCommand(args);
      break;
    default:
      console.error("Codecaine Canvas\n\n  mcp [--workspace PATH] [--canvases DIR]   Serve the canvas editing tools over stdio (boards in the project's canvases/, else PATH/canvases, else DIR)\n  guidance [--write | --check]   Print the guidance snapshot, write skills/canvas, or exit 1 when it is stale");
      if (command !== "help") process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
