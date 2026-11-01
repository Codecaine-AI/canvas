#!/usr/bin/env bun
/**
 * `codecaine-canvas` — command-line entry for the canvas MCP.
 *
 *   codecaine-canvas mcp [--workspace <dir>] [--canvases <dir>]   serve the canvas tools over stdio
 *
 * The workspace is the containment root: canvas_open opens a board file by
 * path only inside it. It is `--workspace`, else `CLAUDE_PROJECT_DIR` (set by
 * Claude Code for project MCP servers), else the current directory, and it
 * holds even when it has no `canvases/`. The boards folder holds the
 * standalone boards that ids, canvas_list and canvas_create use. stdout
 * carries the MCP protocol, so diagnostics go to stderr only.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { startMcp } from "./mcp";
import { loadCodecaineEnv } from "./codecaine-env";
// Background and client-launched processes do not inherit the shell. See codecaine-env.ts.
loadCodecaineEnv();

const args = process.argv.slice(2);
const command = args.shift() ?? "help";

function option(name: string, fallback?: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

const workspace = resolve(option("--workspace", process.env.CLAUDE_PROJECT_DIR || process.cwd())!);

/**
 * The boards folder: `<workspace>/canvases` when it exists, else `--canvases`,
 * else the canvas repo this package lives in, so a user-scoped install always
 * has a board set to edit.
 */
const projectCanvases = join(workspace, "canvases");
const canvasesDir = existsSync(projectCanvases)
  ? projectCanvases
  : resolve(option("--canvases", resolve(import.meta.dir, "../../../canvases"))!);

try {
  switch (command) {
    case "mcp":
      await startMcp(workspace, canvasesDir);
      break;
    default:
      console.error("Codecaine Canvas\n\n  mcp [--workspace PATH] [--canvases DIR]   Serve the canvas editing tools over stdio (boards in PATH/canvases, else DIR)");
      if (command !== "help") process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
