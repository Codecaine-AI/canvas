/**
 * `climb render`: for each drawn board in a round, `board.png` (the whole
 * board as `canvas_check` renders it) and `metrics.json` (lint findings by
 * rule id, tool calls, tokens).
 *
 * The PNG always comes from this checkout, because the board look is what the
 * climb changes. The lints come from `--lint-root`, a canvas checkout whose
 * rules judge the board: the guard runs them with the round 0 rules, so a
 * weaker lint cannot hide a fault. The canvas modules load by path at run
 * time, so this runner's type check never compiles the canvas package.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { DrawRecord } from "./draw.ts";
import { CANVAS_REPO_ROOT, DEFAULT_CLIMB_ROOT, parseFlags, roundDir, roundNumber } from "./paths.ts";

/** The slice of `@codecaine-ai/canvas` this command calls. */
interface CanvasFile { session: unknown }
interface Toolkit {
  openCanvasFile(path: string): CanvasFile;
  checkCanvasFile(file: CanvasFile, label: string): { isError?: boolean; text: string; pngs?: Buffer[] };
}
interface Lints {
  FINISHING_RULES: readonly unknown[];
  sessionDiagnostics(session: unknown, rules: readonly unknown[]): Array<{ rule: string; severity: string }>;
}
interface Headless { useHarfBuzz(): Promise<void> }

interface CanvasModules { toolkit: Toolkit; lints: Lints }

async function loadCanvas(root: string): Promise<CanvasModules> {
  const packages = resolve(root, "packages");
  const headless = (await import(resolve(packages, "text-measure/src/headless.ts"))) as Headless;
  // Lints and renders measure text; measure it exactly, as the canvas MCP does.
  await headless.useHarfBuzz();
  return {
    toolkit: (await import(resolve(packages, "canvas/src/toolkit/index.ts"))) as Toolkit,
    lints: (await import(resolve(packages, "canvas/src/lints.ts"))) as Lints,
  };
}

export interface TranscriptMetrics {
  toolCalls: { total: number; byTool: Record<string, number> };
  tokens: { input: number; output: number; uncachedInput: number; cacheRead: number; cacheCreation: number };
  costUsd: number | null;
  numTurns: number | null;
  resultSubtype: string | null;
}

/**
 * Tool calls and tokens from a Claude Code `stream-json` transcript. Tool
 * calls are the `tool_use` blocks of the assistant messages; tokens are the
 * final `result` event's usage, whose input splits into uncached, cache-read
 * and cache-write parts (`input` is their sum).
 */
export function transcriptMetrics(jsonl: string): TranscriptMetrics {
  const byTool: Record<string, number> = {};
  let total = 0;
  let result: Record<string, unknown> | undefined;
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let event: Record<string, unknown>;
    try { event = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
    if (event.type === "result") result = event;
    if (event.type !== "assistant") continue;
    const content = (event.message as { content?: unknown } | undefined)?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content as Array<{ type?: string; name?: string }>) {
      if (block.type !== "tool_use") continue;
      total += 1;
      const name = (block.name ?? "unknown").replace(/^mcp__canvas__/, "");
      byTool[name] = (byTool[name] ?? 0) + 1;
    }
  }
  const usage = (result?.usage ?? {}) as Record<string, unknown>;
  const count = (key: string): number => {
    const value = usage[key];
    return typeof value === "number" ? value : 0;
  };
  const uncachedInput = count("input_tokens");
  const cacheRead = count("cache_read_input_tokens");
  const cacheCreation = count("cache_creation_input_tokens");
  return {
    toolCalls: { total, byTool },
    tokens: { input: uncachedInput + cacheRead + cacheCreation, output: count("output_tokens"), uncachedInput, cacheRead, cacheCreation },
    costUsd: typeof result?.total_cost_usd === "number" ? result.total_cost_usd : null,
    numTurns: typeof result?.num_turns === "number" ? result.num_turns : null,
    resultSubtype: typeof result?.subtype === "string" ? result.subtype : null,
  };
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}

export async function runRender(argv: string[]): Promise<void> {
  const flags = parseFlags(argv, ["--round", "--lint-root", "--climb-root"]);
  const round = roundNumber(flags.get("--round"));
  const dir = roundDir(resolve(flags.get("--climb-root") ?? DEFAULT_CLIMB_ROOT), round);
  if (!existsSync(dir)) throw new Error(`No round folder: ${dir}`);
  const lintRoot = resolve(flags.get("--lint-root") ?? CANVAS_REPO_ROOT);
  if (!existsSync(resolve(lintRoot, "packages/canvas/src/lints.ts"))) {
    throw new Error(`--lint-root ${lintRoot} is not a canvas checkout (no packages/canvas/src/lints.ts)`);
  }

  const look = await loadCanvas(CANVAS_REPO_ROOT);
  const judge = lintRoot === CANVAS_REPO_ROOT ? look : await loadCanvas(lintRoot);
  const briefs = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(resolve(dir, entry.name, "draw.json")))
    .map((entry) => entry.name)
    .sort();
  if (briefs.length === 0) throw new Error(`No drawn briefs in ${dir}`);

  let failures = 0;
  for (const brief of briefs) {
    const briefDir = resolve(dir, brief);
    const draw = JSON.parse(readFileSync(resolve(briefDir, "draw.json"), "utf8")) as DrawRecord;
    if (!draw.board) {
      process.stdout.write(`${brief}: no board, skipped\n`);
      failures += 1;
      continue;
    }
    const boardPath = resolve(briefDir, draw.board);
    const check = look.toolkit.checkCanvasFile(look.toolkit.openCanvasFile(boardPath), brief);
    const png = check.pngs?.[0];
    if (check.isError || !png) {
      process.stdout.write(`${brief}: render failed\n${check.text}\n`);
      failures += 1;
      continue;
    }
    writeFileSync(resolve(briefDir, "board.png"), png);

    const diagnostics = judge.lints.sessionDiagnostics(judge.toolkit.openCanvasFile(boardPath).session, judge.lints.FINISHING_RULES);
    const bySeverity = (severity: string) => countBy(diagnostics.filter((d) => d.severity === severity), (d) => d.rule);
    const transcriptPath = resolve(briefDir, "transcript.jsonl");
    const transcript = transcriptMetrics(existsSync(transcriptPath) ? readFileSync(transcriptPath, "utf8") : "");
    const metrics = {
      brief,
      round,
      lintRoot,
      summary: check.text.split("\n")[0],
      lints: {
        errors: diagnostics.filter((d) => d.severity === "error").length,
        warnings: diagnostics.filter((d) => d.severity === "warning").length,
        notes: diagnostics.filter((d) => d.severity === "note").length,
        errorsByRule: bySeverity("error"),
        warningsByRule: bySeverity("warning"),
        notesByRule: bySeverity("note"),
      },
      ...transcript,
      durationMs: draw.durationMs,
      model: draw.model,
      effort: draw.effort,
    };
    writeFileSync(resolve(briefDir, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
    process.stdout.write(
      `${brief}: board.png · ${metrics.lints.errors} errors · ${metrics.lints.warnings} warnings`
      + ` · ${transcript.toolCalls.total} tool calls · ${transcript.tokens.input} in / ${transcript.tokens.output} out tokens\n`,
    );
  }
  if (failures > 0) process.exitCode = 1;
}
