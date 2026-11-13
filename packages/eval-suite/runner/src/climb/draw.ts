/**
 * `climb draw`: the fixed drawer (drawer.ts). One drawer per brief draws the
 * brief on a new board in `round-<n>/<brief>/`.
 *
 * The drawer and the reviewers never see the brief key: it names what the
 * brief tests. The board has a neutral canvas id (paths.ts canvasIdOf), and
 * the run works in `round-<n>/.drawing/<canvas id>/` until it ends. Then the
 * folder gets its name, `round-<n>/<brief>/`.
 *
 * `--critic on` adds the critic loop (critic-loop.ts) after the first pass:
 * the canvas_check lints and the reviewers review the board, the drawer
 * revises in the same session (`--resume`), and the review runs again, until
 * a round has no blocker and no should and the drawer has answered every
 * finding it got, or `--critic-rounds` (20) are spent.
 * The board saved is the one that scored best. `critic/` in the brief folder
 * keeps each round's board, renders, findings and timings.
 *
 * `--timeout-min` is the time the first draw may take. A revise pass and the
 * whole loop have their own (critic.ts CRITIC_FLAGS).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { Semaphore } from "../semaphore.ts";
import { failedLoop, loopSummary, reviewBoard, type LoopRecord } from "./critic-loop.ts";
import { CRITIC_FLAGS, loadReviewCanvas, parseCritic, type CriticOptions, type ReviewCanvas } from "./critic.ts";
import { DRAWER_EFFORT, DRAWER_MODEL, drawerFlags, drawerPass, sessionIdOf, type runDrawer } from "./drawer.ts";
import {
  DEFAULT_CLIMB_ROOT,
  briefPath,
  canvasIdOf,
  parseFlags,
  readSets,
  roundDir,
  roundNumber,
} from "./paths.ts";

/** How many briefs draw at once, unless `--parallel <n>` says otherwise. */
const DEFAULT_PARALLEL = 5;

export interface DrawRecord {
  brief: string;
  round: number;
  model: string;
  effort: string;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  /** The processes the first draw ran: over 1 after a rate limit (drawer.ts drawerPass). */
  tries: number;
  durationMs: number;
  startedAt: string;
  /** The board file relative to the brief folder, or null when the drawer made none. */
  board: string | null;
  /** The critic loop, or null when the critic was off or the first pass failed. */
  critic: LoopRecord | null;
}

/** `canvasId`: the board's neutral id (paths.ts canvasIdOf), never the brief key. */
export function drawerPrompt(canvasId: string, briefText: string): string {
  return [
    "Draw the diagram this brief asks for as a new Codecaine Canvas board.",
    `Create the board with canvas_create, canvas id "${canvasId}". Every edit saves to the board file by itself.`,
    "Stop when the board is finished.",
    "",
    "<brief>",
    briefText.trim(),
    "</brief>",
  ].join("\n");
}

export async function drawOne(options: {
  brief: string;
  round: number;
  climbRoot: string;
  settingsPath: string;
  timeoutMs: number;
  /** A brief folder (index.json and <brief>.md), or undefined for the frozen scenario briefs. */
  briefDir?: string;
  /** The critic's settings and the canvas modules it reviews with, or undefined when the critic is off. */
  critic?: { options: CriticOptions; canvas: ReviewCanvas };
  /** The drawer process of the first draw (drawer.ts runDrawer), for a test. */
  run?: typeof runDrawer;
}): Promise<DrawRecord> {
  const { brief, round } = options;
  const kept = resolve(roundDir(options.climbRoot, round), brief);
  // A rerun of a round redraws only the briefs that have no finished board.
  if (existsSync(resolve(kept, "draw.json"))) {
    const previous = JSON.parse(readFileSync(resolve(kept, "draw.json"), "utf8")) as DrawRecord;
    if (previous.exitCode === 0 && previous.board) {
      process.stdout.write(`${brief}: already drawn in round ${round}, skipped\n`);
      return previous;
    }
  }
  rmSync(kept, { recursive: true, force: true });
  // The drawer's working folder and the reviewers' are under `dir`, and each reads its own path: `dir` has the canvas id for its name until the run ends.
  const canvasId = canvasIdOf(brief, options.briefDir);
  const drawing = resolve(roundDir(options.climbRoot, round), ".drawing");
  const dir = resolve(drawing, canvasId);
  rmSync(dir, { recursive: true, force: true });
  const canvasesDir = resolve(dir, "canvases");
  mkdirSync(canvasesDir, { recursive: true });

  const briefText = readFileSync(briefPath(brief, options.briefDir), "utf8");
  const startedAt = new Date();
  const first = await drawerPass({
    dir, settingsPath: options.settingsPath, session: { persist: options.critic !== undefined },
    message: [drawerPrompt(canvasId, briefText)], transcriptPath: resolve(dir, "transcript.jsonl"), timeoutMs: options.timeoutMs, run: options.run,
  });
  const { exitCode, signal, timedOut, tries } = first.run;

  // The critics and the revise passes work on the board where the drawer's canvas server keeps it.
  const created = resolve(canvasesDir, `${canvasId}.canvas.json`);
  let critic: LoopRecord | null = null;
  if (options.critic && exitCode === 0 && existsSync(created)) {
    try {
      const session = sessionIdOf(first.transcript);
      if (!session) throw new Error("the first pass's transcript names no session to resume");
      critic = await reviewBoard({
        canvas: options.critic.canvas, board: canvasId, label: brief, boardPath: created, outDir: resolve(dir, "critic"), critic: options.critic.options, brief: briefText,
        drawer: { dir, settingsPath: options.settingsPath, session },
      });
    } catch (error) {
      critic = failedLoop(options.critic.options.rounds, error instanceof Error ? error.message : String(error));
    }
    // The board stands as the loop kept it; draw.json says how the loop stopped and which round it kept.
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
    tries,
    durationMs: Date.now() - startedAt.getTime(),
    startedAt: startedAt.toISOString(),
    board: hasBoard ? board : null,
    critic,
  };
  writeFileSync(resolve(dir, "draw.json"), `${JSON.stringify(record, null, 2)}\n`);
  // The run is over: the folder gets the brief key for its name.
  renameSync(dir, kept);
  try { rmdirSync(drawing); } catch { /* other briefs still draw */ }
  const seconds = Math.round(record.durationMs / 1000);
  process.stdout.write(`${brief}: exit ${exitCode ?? signal}${timedOut ? " (timed out)" : ""} · ${seconds} s · board ${hasBoard ? "saved" : "missing"}\n`);
  return record;
}

export async function runDraw(argv: string[]): Promise<void> {
  const flags = parseFlags(argv, ["--round", "--set", "--briefs", "--climb-root", "--brief-dir", "--settings", "--timeout-min", "--critic", "--parallel", ...CRITIC_FLAGS]);
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
  const ids = briefs.map((brief) => canvasIdOf(brief, briefDir));
  const twice = ids.find((id, index) => ids.indexOf(id) !== index);
  if (twice) throw new Error(`2 briefs share the canvas id ${twice}: each needs its own working folder`);

  const { settingsPath, timeoutMs } = drawerFlags(flags);
  const climbRoot = resolve(flags.get("--climb-root") ?? DEFAULT_CLIMB_ROOT);
  const criticFlag = flags.get("--critic") ?? "off";
  if (criticFlag !== "on" && criticFlag !== "off") throw new Error(`--critic must be on or off, not ${criticFlag}`);
  const criticOptions = parseCritic(flags);
  const critic = criticFlag === "on" ? { options: criticOptions, canvas: await loadReviewCanvas() } : undefined;

  const parallel = Number(flags.get("--parallel") ?? DEFAULT_PARALLEL);
  if (!Number.isInteger(parallel) || parallel < 1) throw new Error(`--parallel must be a whole number of briefs (5, ...), not ${flags.get("--parallel")}`);
  const gate = new Semaphore(parallel);
  const records = await Promise.all(briefs.map((brief) => gate.run(() =>
    drawOne({ brief, round, climbRoot, settingsPath, timeoutMs, briefDir, critic }))));
  const failed = records.filter((record) => record.exitCode !== 0 || !record.board);
  if (failed.length > 0) {
    process.stderr.write(`${failed.length} of ${records.length} drawers failed: ${failed.map((record) => record.brief).join(", ")}\n`);
    process.exitCode = 1;
  }
}
