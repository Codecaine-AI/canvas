#!/usr/bin/env bun
/**
 * `canvas` — command-line entry for the canvas MCP.
 *
 *   canvas mcp [--workspace <dir>] [--canvases <dir>] [--exclude <dir>]...   serve the canvas tools over stdio
 *   canvas instructions                    print the prompt block (MCP instructions)
 *   canvas manifest                        print the rule-unit manifest as JSON
 *
 * Three roots, one role each:
 * - Containment root: `--workspace`, else the project root. canvas_open opens
 *   nothing outside it.
 * - Project root: `CLAUDE_PROJECT_DIR` (set by Claude Code), else the current
 *   directory. A relative board path resolves against it first.
 * - Boards folder: the standalone boards that ids, canvas_list and
 *   canvas_create use.
 * - Excluded folders: each `--exclude` (repeatable, default none). No board
 *   inside one opens or is created, even inside the containment root.
 * stdout carries the MCP protocol, so diagnostics go to stderr only.
 */
import { existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

import { guidanceManifest } from "./guidance-manifest";
import { INSTRUCTIONS, startMcp } from "./mcp";
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

/** Every value of a repeatable option, in order. */
function options(name: string): string[] {
  return args.flatMap((arg, index) => (arg === name && index + 1 < args.length ? [args[index + 1]!] : []));
}

const project = root(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const workspace = root(option("--workspace") ?? project);
const exclude = options("--exclude").map(root);

/**
 * The boards folder: `<project>/canvases`, else `<workspace>/canvases`, the
 * first that exists outside every `--exclude`. Else `--canvases`, else the canvas repo this package
 * lives in, so a user-scoped install always has a board set to edit.
 */
const notExcluded = (dir: string) => !exclude.some((root) => dir === root || dir.startsWith(`${root}/`));
const canvasesDir = [join(project, "canvases"), join(workspace, "canvases")].find((dir) => existsSync(dir) && notExcluded(dir))
  ?? resolve(option("--canvases") ?? resolve(import.meta.dir, "../../../canvases"));

try {
  switch (command) {
    case "mcp":
      await startMcp({ workspace, project, canvasesDir, exclude });
      break;
    case "instructions":
      console.log(INSTRUCTIONS);
      break;
    case "manifest":
      console.log(JSON.stringify(await guidanceManifest(), null, 2));
      break;
    default:
      console.error("Codecaine Canvas\n\n  mcp [--workspace PATH] [--canvases DIR] [--exclude DIR]...   Serve the canvas editing tools over stdio (boards in the project's canvases/, else PATH/canvases, else DIR)\n  instructions   Print the prompt block (MCP instructions)\n  manifest   Print the rule-unit manifest as JSON");
      if (command !== "help") process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
