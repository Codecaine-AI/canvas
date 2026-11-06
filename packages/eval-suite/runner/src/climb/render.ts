/**
 * `climb render`: for each drawn board in a round, `board.png` (the whole
 * board, framed as `canvas_check` frames it) and `metrics.json` (lint
 * findings by rule id, tool calls, tokens, PNG size, and the board's long
 * edge with an `overJudgeCap` flag past JUDGE_PNG_MAX_EDGE).
 *
 * Judges score `board.png` at 1:1 world scale, capped so its long edge is at
 * most 2576 px, the largest image Opus reads without scaling it down
 * (`judgePngSize`, packages/canvas/src/render/judge-size.ts). `canvas_check`
 * renders at the same size. `--view-width <px>` renders at a fixed width
 * instead.
 *
 * The PNG always comes from this checkout, because the board look is what the
 * climb changes. The lints come from `--lint-root`, a canvas checkout whose
 * rules judge the board: the guard runs them with the round 0 rules, so a
 * weaker lint cannot hide a fault. The canvas modules load by path at run
 * time, so this runner's type check never compiles the canvas package.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { JUDGE_PNG_MAX_EDGE, renderAtJudgeSize, type PngSize } from "../../../../canvas/src/render/judge-size.ts";
import type { DrawRecord } from "./draw.ts";
import { CANVAS_REPO_ROOT, DEFAULT_CLIMB_ROOT, parseFlags, roundDir, roundNumber } from "./paths.ts";

/** The slice of `@codecaine-ai/canvas` this command calls. */
interface CanvasFile { session: { canvasStyle: unknown }; persisted: unknown }
interface Toolkit {
  openCanvasFile(path: string): CanvasFile;
  checkCanvasFile(file: CanvasFile, label: string): { isError?: boolean; text: string; pngs?: Buffer[] };
}
interface Lints {
  FINISHING_RULES: readonly unknown[];
  sessionDiagnostics(session: unknown, rules: readonly unknown[]): Array<{ rule: string; severity: string }>;
}
interface Headless { useHarfBuzz(): Promise<void> }
interface WorldRect { x: number; y: number; width: number; height: number }
interface Render {
  renderBoardView(board: unknown, opts: { width: number; canvasStyle?: unknown }): { svg: string; camera: WorldRect };
}
interface Rasterize { rasterizeSvgToPng(svg: string): { png: Buffer; width: number; height: number } }
interface Views { BOARD_VIEW_WIDTH: number }

interface CanvasModules { toolkit: Toolkit; lints: Lints; render: Render; rasterize: Rasterize; views: Views }

async function loadCanvas(root: string): Promise<CanvasModules> {
  const packages = resolve(root, "packages");
  const headless = (await import(resolve(packages, "text-measure/src/headless.ts"))) as Headless;
  // Lints and renders measure text; measure it exactly, as the canvas MCP does.
  await headless.useHarfBuzz();
  return {
    toolkit: (await import(resolve(packages, "canvas/src/toolkit/index.ts"))) as Toolkit,
    lints: (await import(resolve(packages, "canvas/src/lints.ts"))) as Lints,
    render: (await import(resolve(packages, "canvas/src/render/index.ts"))) as Render,
    rasterize: (await import(resolve(packages, "canvas/src/render/rasterize.ts"))) as Rasterize,
    views: (await import(resolve(packages, "canvas/src/session/perception/views.ts"))) as Views,
  };
}

/**
 * The whole board as saved, rendered at `viewWidth` px, or at the judged size
 * (renderAtJudgeSize, the same render `canvas_check` returns) when
 * `viewWidth` is undefined.
 */
function renderBoardPng(
  canvas: CanvasModules,
  file: CanvasFile,
  viewWidth: number | undefined,
): { png: Buffer; size: PngSize; board: BoardExtent } {
  const view = (width: number) =>
    canvas.render.renderBoardView(file.persisted, { width, canvasStyle: file.session.canvasStyle });
  const rendered = viewWidth === undefined ? renderAtJudgeSize(view, canvas.views.BOARD_VIEW_WIDTH).rendered : view(viewWidth);
  const png = canvas.rasterize.rasterizeSvgToPng(rendered.svg);
  return {
    png: png.png,
    size: { width: png.width, height: png.height, scale: png.width / rendered.camera.width },
    board: boardExtent(rendered.camera),
  };
}

/**
 * The board's whole extent in world px, padding included, as the judged
 * render frames it. Past JUDGE_PNG_MAX_EDGE on the long edge the judge PNG
 * scales down and every label prints smaller than drawn. Not a lint: the
 * drawer is never asked to fix it; the climb reads it here.
 */
export interface BoardExtent {
  longEdge: number;
  overJudgeCap: boolean;
}

export function boardExtent(camera: { width: number; height: number }): BoardExtent {
  const longEdge = Math.round(Math.max(camera.width, camera.height));
  return { longEdge, overJudgeCap: longEdge > JUDGE_PNG_MAX_EDGE };
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
  const flags = parseFlags(argv, ["--round", "--lint-root", "--climb-root", "--view-width"]);
  const viewWidthFlag = flags.get("--view-width");
  const viewWidth = viewWidthFlag === undefined ? undefined : Number(viewWidthFlag);
  if (viewWidth !== undefined && (!Number.isInteger(viewWidth) || viewWidth <= 0)) {
    throw new Error("--view-width must be a width in px (1600, ...)");
  }
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
    const file = look.toolkit.openCanvasFile(boardPath);
    const check = look.toolkit.checkCanvasFile(file, brief);
    let board: { png: Buffer; size: PngSize; board: BoardExtent };
    try {
      if (check.isError) throw new Error(check.text);
      board = renderBoardPng(look, file, viewWidth);
    } catch (error) {
      process.stdout.write(`${brief}: render failed\n${error instanceof Error ? error.message : String(error)}\n`);
      failures += 1;
      continue;
    }
    writeFileSync(resolve(briefDir, "board.png"), board.png);

    const diagnostics = judge.lints.sessionDiagnostics(judge.toolkit.openCanvasFile(boardPath).session, judge.lints.FINISHING_RULES);
    const bySeverity = (severity: string) => countBy(diagnostics.filter((d) => d.severity === severity), (d) => d.rule);
    const transcriptPath = resolve(briefDir, "transcript.jsonl");
    const transcript = transcriptMetrics(existsSync(transcriptPath) ? readFileSync(transcriptPath, "utf8") : "");
    const metrics = {
      brief,
      round,
      lintRoot,
      summary: check.text.split("\n")[0],
      png: board.size,
      board: board.board,
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
      `${brief}: board.png ${board.size.width}×${board.size.height} at ${board.size.scale.toFixed(3)}`
      + ` · long edge ${board.board.longEdge}px${board.board.overJudgeCap ? ` (over ${JUDGE_PNG_MAX_EDGE})` : ""}`
      + ` · ${metrics.lints.errors} errors · ${metrics.lints.warnings} warnings`
      + ` · ${transcript.toolCalls.total} tool calls · ${transcript.tokens.input} in / ${transcript.tokens.output} out tokens\n`,
    );
  }
  if (failures > 0) process.exitCode = 1;
}
