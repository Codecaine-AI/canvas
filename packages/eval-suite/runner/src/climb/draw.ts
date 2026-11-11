/**
 * `climb draw`: the fixed drawer. One headless Claude Code process per brief
 * (Opus 5.5, high effort, the canvas MCP and nothing else) draws the brief
 * on a new board in `round-<n>/<brief>/`.
 *
 * The drawer must be the same in every round, so it runs in bare mode: no
 * CLAUDE.md discovery, hooks, plugins or skills, and no built-in tools. Auth
 * comes from the user settings file passed with `--settings` (its
 * `apiKeyHelper`), the only setting bare mode reads from it that matters here.
 *
 * `--critic on` adds the region critic (critic.ts) after the first pass: the
 * critics review the board, and the drawer gets their merged findings for one
 * revise pass in the same session (`--resume`). `critic/` in the brief folder
 * keeps the findings, their timings, before.canvas.json, before.png and
 * after.png.
 */
import { spawn } from "node:child_process";
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { Semaphore } from "../semaphore.ts";
import { critiqueBoard, critiqueSummary, parseCount, parseGrid, revisePrompt, type CriticOptions } from "./critic.ts";
import {
  CANVAS_REPO_ROOT,
  DEFAULT_CLIMB_ROOT,
  briefPath,
  parseFlags,
  readSets,
  roundDir,
  roundNumber,
} from "./paths.ts";
import { loadCanvas, renderBoardPng, type CanvasModules } from "./render.ts";

export const DRAWER_MODEL = "claude-opus-5-5";
export const DRAWER_EFFORT = "high";
const MCP_SERVER = "canvas";
const MAX_PARALLEL = 5;
const DEFAULT_TIMEOUT_MINUTES = 45;

/** The session variables of the Claude Code that launched the climb, which must not leak into a drawer. */
const PARENT_SESSION_VARIABLES = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_CODE_CHILD_SESSION",
  "CLAUDE_CODE_SESSION_ATTENDED",
  "CLAUDE_CODE_MESSAGING_SOCKET",
  "CLAUDE_CODE_MESSAGING_TOKEN",
  "CLAUDE_AGENT_SDK_VERSION",
  "CLAUDE_EFFORT",
  "CLAUDE_PID",
];

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
  /** The critic step and the revise pass, or null when the critic was off or the first pass failed. */
  critic: CriticRecord | null;
}

export interface CriticRecord {
  regions: number;
  unparsed: number;
  findings: number;
  /** Wall clock for the critic step: renders, critics and the merge. */
  critiqueMs: number;
  /** The revise pass, or null when the critics found nothing. */
  revise: { exitCode: number | null; signal: string | null; timedOut: boolean; durationMs: number } | null;
  /** Why the critic step stopped, or null when it ran through. */
  error: string | null;
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

function drawerEnv(dir: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of PARENT_SESSION_VARIABLES) delete env[name];
  // The drawer's canvas calls go to a log in its own folder, not the shared action log.
  env.CODECAINE_ACTION_LOG = resolve(dir, "action-log.sqlite");
  return env;
}

/**
 * `session.persist` keeps the session on disk so a revise pass can resume
 * it; `session.resume` is that session's id.
 */
export function drawerArgs(dir: string, prompt: string, settingsPath: string, session: { persist: boolean; resume?: string } = { persist: false }): string[] {
  const mcpConfig = {
    mcpServers: {
      [MCP_SERVER]: {
        command: process.execPath,
        args: [resolve(CANVAS_REPO_ROOT, "packages/canvas-mcp/src/cli.ts"), "mcp", "--workspace", dir],
        env: { CODECAINE_ACTION_LOG: resolve(dir, "action-log.sqlite") },
      },
    },
  };
  return [
    "-p", prompt,
    "--model", DRAWER_MODEL,
    "--effort", DRAWER_EFFORT,
    "--bare",
    "--settings", settingsPath,
    "--mcp-config", JSON.stringify(mcpConfig),
    "--strict-mcp-config",
    "--tools", "",
    "--allowedTools", `mcp__${MCP_SERVER}`,
    "--disable-slash-commands",
    ...(session.persist ? [] : ["--no-session-persistence"]),
    ...(session.resume ? ["--resume", session.resume] : []),
    "--output-format", "stream-json",
    "--verbose",
  ];
}

/** The session id of a Claude Code `stream-json` transcript: its first event that names one. */
export function sessionIdOf(jsonl: string): string | null {
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    try {
      const id = (JSON.parse(line) as { session_id?: unknown }).session_id;
      if (typeof id === "string" && id) return id;
    } catch { /* a torn last line */ }
  }
  return null;
}

/** One drawer process, its stdout to `transcriptPath` and its stderr appended to stderr.log. */
async function runDrawer(dir: string, args: string[], transcriptPath: string, timeoutMs: number): Promise<{
  exitCode: number | null; signal: NodeJS.Signals | null; timedOut: boolean; durationMs: number;
}> {
  const started = Date.now();
  const transcript = createWriteStream(transcriptPath);
  const stderr = createWriteStream(resolve(dir, "stderr.log"), { flags: "a" });
  const child = spawn("claude", args, { cwd: dir, env: drawerEnv(dir), stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(transcript);
  child.stderr.pipe(stderr);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, timeoutMs);
  const [exitCode, signal] = await new Promise<[number | null, NodeJS.Signals | null]>((done, fail) => {
    child.on("error", fail);
    child.on("close", (code, sig) => done([code, sig]));
  });
  clearTimeout(timer);
  await Promise.all([transcript, stderr].map((stream) => new Promise((done) => stream.end(done))));
  return { exitCode, signal, timedOut, durationMs: Date.now() - started };
}

/**
 * The critic step on the first pass's board, then one revise pass in the
 * drawer's own session. Writes `critic/` in the brief folder.
 */
async function critiqueAndRevise(options: {
  brief: string;
  dir: string;
  boardPath: string;
  settingsPath: string;
  timeoutMs: number;
  canvas: CanvasModules;
  critic: CriticOptions;
}): Promise<CriticRecord> {
  const { brief, dir, boardPath, canvas } = options;
  const outDir = resolve(dir, "critic");
  mkdirSync(outDir, { recursive: true });
  copyFileSync(boardPath, resolve(outDir, "before.canvas.json"));
  const critique = await critiqueBoard({ canvas, boardPath, outDir, critic: options.critic });
  renameSync(resolve(outDir, "overview.png"), resolve(outDir, "before.png"));
  process.stdout.write(`${brief}: critic · ${critiqueSummary(critique)}\n`);
  const record: CriticRecord = {
    regions: critique.regions.length,
    unparsed: critique.regions.filter((region) => region.error !== null).length,
    findings: critique.findings.length,
    critiqueMs: critique.durationMs,
    revise: null,
    error: null,
  };
  if (critique.findings.length === 0) return record;

  const session = sessionIdOf(readFileSync(resolve(dir, "transcript.jsonl"), "utf8"));
  if (!session) throw new Error(`${brief}: the first pass's transcript names no session to resume`);
  const args = drawerArgs(dir, revisePrompt(brief, critique.findings), options.settingsPath, { persist: false, resume: session });
  const revise = await runDrawer(dir, args, resolve(dir, "revise-transcript.jsonl"), options.timeoutMs);
  record.revise = revise;
  writeFileSync(resolve(outDir, "after.png"), renderBoardPng(canvas, canvas.toolkit.openCanvasFile(boardPath), undefined).png);
  process.stdout.write(`${brief}: revise · exit ${revise.exitCode ?? revise.signal}${revise.timedOut ? " (timed out)" : ""} · ${Math.round(revise.durationMs / 1000)} s\n`);
  return record;
}

async function drawOne(options: {
  brief: string;
  round: number;
  climbRoot: string;
  settingsPath: string;
  timeoutMs: number;
  /** A brief folder (index.json and <brief>.md), or undefined for the frozen scenario briefs. */
  briefDir?: string;
  /** The critic's settings and the canvas modules it renders with, or undefined when the critic is off. */
  critic?: { options: CriticOptions; canvas: CanvasModules };
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

  // The critic and the revise pass work on the board where the drawer's canvas server keeps it.
  const created = resolve(canvasesDir, `${brief}.canvas.json`);
  let critic: CriticRecord | null = null;
  if (options.critic && exitCode === 0 && existsSync(created)) {
    try {
      critic = await critiqueAndRevise({
        brief, dir, boardPath: created, settingsPath: options.settingsPath, timeoutMs: options.timeoutMs,
        canvas: options.critic.canvas, critic: options.critic.options,
      });
    } catch (error) {
      // The first pass's board stands; draw.json says the critic step failed.
      critic = { regions: 0, unparsed: 0, findings: 0, critiqueMs: 0, revise: null, error: error instanceof Error ? error.message : String(error) };
      process.stdout.write(`${brief}: critic failed · ${critic.error}\n`);
    }
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
  const flags = parseFlags(argv, ["--round", "--set", "--briefs", "--climb-root", "--brief-dir", "--settings", "--timeout-min", "--critic", "--critic-grid", "--critic-count"]);
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

  const timeoutMinutes = Number(flags.get("--timeout-min") ?? DEFAULT_TIMEOUT_MINUTES);
  if (!(timeoutMinutes > 0)) throw new Error("--timeout-min must be a positive number");
  const settingsPath = flags.get("--settings") ?? resolve(homedir(), ".claude", "settings.json");
  if (!existsSync(settingsPath)) throw new Error(`No Claude Code settings file at ${settingsPath} (pass --settings)`);
  const climbRoot = resolve(flags.get("--climb-root") ?? DEFAULT_CLIMB_ROOT);
  const criticFlag = flags.get("--critic") ?? "off";
  if (criticFlag !== "on" && criticFlag !== "off") throw new Error(`--critic must be on or off, not ${criticFlag}`);
  const criticOptions = { grid: parseGrid(flags.get("--critic-grid")), count: parseCount(flags.get("--critic-count")) };
  const critic = criticFlag === "on" ? { options: criticOptions, canvas: await loadCanvas(CANVAS_REPO_ROOT) } : undefined;

  const gate = new Semaphore(MAX_PARALLEL);
  const records = await Promise.all(briefs.map((brief) => gate.run(() =>
    drawOne({ brief, round, climbRoot, settingsPath, timeoutMs: timeoutMinutes * 60_000, briefDir, critic }))));
  const failed = records.filter((record) => record.exitCode !== 0 || !record.board);
  if (failed.length > 0) {
    process.stderr.write(`${failed.length} of ${records.length} drawers failed: ${failed.map((record) => record.brief).join(", ")}\n`);
    process.exitCode = 1;
  }
}
