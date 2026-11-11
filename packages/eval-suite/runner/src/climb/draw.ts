/**
 * `climb draw`: the fixed drawer (drawer.ts). One drawer per brief draws the
 * brief on a new board in `round-<n>/<brief>/`.
 *
 * `--critic on` adds the critic loop (critic-loop.ts) after the first pass:
 * the canvas_check lints and the region critics review the board, the drawer
 * revises in the same session (`--resume`), and the review runs again, until
 * a round has no blocker and no should or `--critic-rounds` (3) are spent.
 * `critic/` in the brief folder keeps each round's board, renders, findings
 * and timings.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { Semaphore } from "../semaphore.ts";
import { loopSummary, reviewBoard, type LoopRecord } from "./critic-loop.ts";
import { loadReviewCanvas, parseCount, parseGrid, parseRounds, type CriticOptions, type ReviewCanvas } from "./critic.ts";
import { DRAWER_EFFORT, DRAWER_MODEL, drawerArgs, drawerFlags, runDrawer, sessionIdOf } from "./drawer.ts";
import {
  DEFAULT_CLIMB_ROOT,
  briefPath,
  parseFlags,
  readSets,
  roundDir,
  roundNumber,
} from "./paths.ts";

const MAX_PARALLEL = 5;

export interface DrawRecord {
  brief: string;
  round: number;
  model: string;
  effort: string;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  durationMs: number;
  startedAt: string;
  /** The board file relative to the brief folder, or null when the drawer made none. */
  board: string | null;
  /** The critic loop, or null when the critic was off or the first pass failed. */
  critic: LoopRecord | null;
}

export function drawerPrompt(brief: string, briefText: string): string {
  return [
    "Draw the diagram this brief asks for as a new Codecaine Canvas board.",
    `Create the board with canvas_create, canvas id "${brief}". Every edit saves to the board file by itself.`,
    "Stop when the board is finished.",
    "",
    "<brief>",
    briefText.trim(),
    "</brief>",
  ].join("\n");
}

async function drawOne(options: {
  brief: string;
  round: number;
  climbRoot: string;
  settingsPath: string;
  timeoutMs: number;
  /** A brief folder (index.json and <brief>.md), or undefined for the frozen scenario briefs. */
  briefDir?: string;
  /** The critic's settings and the canvas modules it reviews with, or undefined when the critic is off. */
  critic?: { options: CriticOptions; canvas: ReviewCanvas };
}): Promise<DrawRecord> {
  const { brief, round } = options;
  const dir = resolve(roundDir(options.climbRoot, round), brief);
  // A rerun of a round redraws only the briefs that have no finished board.
  const recordPath = resolve(dir, "draw.json");
  if (existsSync(recordPath)) {
    const previous = JSON.parse(readFileSync(recordPath, "utf8")) as DrawRecord;
    if (previous.exitCode === 0 && previous.board) {
      process.stdout.write(`${brief}: already drawn in round ${round}, skipped\n`);
      return previous;
    }
  }
  rmSync(dir, { recursive: true, force: true });
  const canvasesDir = resolve(dir, "canvases");
  mkdirSync(canvasesDir, { recursive: true });

  const prompt = drawerPrompt(brief, readFileSync(briefPath(brief, options.briefDir), "utf8"));
  const startedAt = new Date();
  const args = drawerArgs(dir, prompt, options.settingsPath, { persist: options.critic !== undefined });
  const { exitCode, signal, timedOut } = await runDrawer(dir, args, resolve(dir, "transcript.jsonl"), options.timeoutMs);

  // The critics and the revise passes work on the board where the drawer's canvas server keeps it.
  const created = resolve(canvasesDir, `${brief}.canvas.json`);
  let critic: LoopRecord | null = null;
  if (options.critic && exitCode === 0 && existsSync(created)) {
    try {
      const session = sessionIdOf(readFileSync(resolve(dir, "transcript.jsonl"), "utf8"));
      if (!session) throw new Error("the first pass's transcript names no session to resume");
      critic = await reviewBoard({
        canvas: options.critic.canvas, board: brief, boardPath: created, outDir: resolve(dir, "critic"), critic: options.critic.options,
        drawer: { dir, settingsPath: options.settingsPath, timeoutMs: options.timeoutMs, session },
      });
    } catch (error) {
      critic = { budget: options.critic.options.rounds, rounds: [], stop: "failed", error: error instanceof Error ? error.message : String(error), durationMs: 0 };
    }
    // The board stands as the last pass left it; draw.json says how the loop stopped.
    process.stdout.write(`${brief}: critic · ${loopSummary(critic)}\n`);
  }

  // The board moves up beside its transcript; the empty canvases folder goes.
  const board = `${brief}.canvas.json`;
  const hasBoard = existsSync(created);
  if (hasBoard) renameSync(created, resolve(dir, board));
  try { rmdirSync(canvasesDir); } catch { /* keep a folder the drawer put other files in */ }

  const record: DrawRecord = {
    brief,
    round,
    model: DRAWER_MODEL,
    effort: DRAWER_EFFORT,
    exitCode,
    signal,
    timedOut,
    durationMs: Date.now() - startedAt.getTime(),
    startedAt: startedAt.toISOString(),
    board: hasBoard ? board : null,
    critic,
  };
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  const seconds = Math.round(record.durationMs / 1000);
  process.stdout.write(`${brief}: exit ${exitCode ?? signal}${timedOut ? " (timed out)" : ""} · ${seconds} s · board ${hasBoard ? "saved" : "missing"}\n`);
  return record;
}

export async function runDraw(argv: string[]): Promise<void> {
  const flags = parseFlags(argv, ["--round", "--set", "--briefs", "--climb-root", "--brief-dir", "--settings", "--timeout-min", "--critic", "--critic-grid", "--critic-count", "--critic-rounds"]);
  const round = roundNumber(flags.get("--round"));
  const briefDir = flags.has("--brief-dir") ? resolve(flags.get("--brief-dir")!) : undefined;
  const sets = briefDir ? readSets(resolve(briefDir, "index.json")) : readSets();
  const setName = flags.get("--set") ?? (flags.has("--briefs") ? undefined : "climb");
  let briefs: string[];
  if (setName === "climb" || setName === "heldOut") briefs = sets[setName];
  else if (setName === "all") briefs = [...sets.climb, ...sets.heldOut];
  else if (setName === undefined) briefs = [];
  else throw new Error(`--set must be climb, heldOut or all, not ${setName}`);
  if (flags.has("--briefs")) {
    const picked = flags.get("--briefs")!.split(",").map((id) => id.trim()).filter(Boolean);
    briefs = setName === undefined ? picked : briefs.filter((id) => picked.includes(id));
  }
  if (briefs.length === 0) throw new Error("No briefs to draw");
  for (const brief of briefs) briefPath(brief, briefDir);

  const { settingsPath, timeoutMs } = drawerFlags(flags);
  const climbRoot = resolve(flags.get("--climb-root") ?? DEFAULT_CLIMB_ROOT);
  const criticFlag = flags.get("--critic") ?? "off";
  if (criticFlag !== "on" && criticFlag !== "off") throw new Error(`--critic must be on or off, not ${criticFlag}`);
  const criticOptions = { grid: parseGrid(flags.get("--critic-grid")), count: parseCount(flags.get("--critic-count")), rounds: parseRounds(flags.get("--critic-rounds")) };
  const critic = criticFlag === "on" ? { options: criticOptions, canvas: await loadReviewCanvas() } : undefined;

  const gate = new Semaphore(MAX_PARALLEL);
  const records = await Promise.all(briefs.map((brief) => gate.run(() =>
    drawOne({ brief, round, climbRoot, settingsPath, timeoutMs, briefDir, critic }))));
  const failed = records.filter((record) => record.exitCode !== 0 || !record.board);
  if (failed.length > 0) {
    process.stderr.write(`${failed.length} of ${records.length} drawers failed: ${failed.map((record) => record.brief).join(", ")}\n`);
    process.exitCode = 1;
  }
}
