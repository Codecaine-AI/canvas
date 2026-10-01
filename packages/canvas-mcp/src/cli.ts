#!/usr/bin/env bun
/**
 * `codecaine-canvas` — command-line entry for the canvas MCP.
 *
 *   codecaine-canvas mcp [--workspace <dir>]   serve the canvas tools over stdio
 *
 * The workspace is the project whose `canvases/` directory the tools edit:
 * `--workspace`, else `CLAUDE_PROJECT_DIR` (set by Claude Code for project
 * MCP servers), else the current directory. stdout carries the MCP protocol,
 * so diagnostics go to stderr only.
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

/**
 * A user-scoped install runs from whatever project the client opened. When that
 * project has no `canvases/` directory, fall back to the canvas repo this
 * package lives in, so the tools always have a board set to edit.
 */
const HOME_WORKSPACE = resolve(import.meta.dir, "../../..");
const requested = resolve(option("--workspace", process.env.CLAUDE_PROJECT_DIR || process.cwd())!);
const workspace = existsSync(join(requested, "canvases")) ? requested : HOME_WORKSPACE;

try {
  switch (command) {
    case "mcp":
      await startMcp(workspace);
      break;
    default:
      console.error("Codecaine Canvas\n\n  mcp [--workspace PATH]   Serve the canvas editing tools over stdio (canvases in PATH/canvases)");
      if (command !== "help") process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
