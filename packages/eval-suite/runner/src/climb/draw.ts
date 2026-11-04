/**
 * `climb draw`: the fixed drawer. One headless Claude Code process per brief
 * (Opus 5.5, medium effort, the canvas MCP and nothing else) draws the brief
 * on a new board in `round-<n>/<brief>/`.
 *
 * The drawer must be the same in every round, so it runs in bare mode: no
 * CLAUDE.md discovery, hooks, plugins or skills, and no built-in tools. Auth
 * comes from the user settings file passed with `--settings` (its
 * `apiKeyHelper`), the only setting bare mode reads from it that matters here.
 */
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { Semaphore } from "../semaphore.ts";
import {
  CANVAS_REPO_ROOT,
  DEFAULT_CLIMB_ROOT,
  briefPath,
  parseFlags,
  readSets,
  roundDir,
  roundNumber,
} from "./paths.ts";

export const DRAWER_MODEL = "claude-opus-5-5";
export const DRAWER_EFFORT = "medium";
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

export function drawerArgs(dir: string, prompt: string, settingsPath: string): string[] {
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
    "--no-session-persistence",
    "--output-format", "stream-json",
    "--verbose",
  ];
}

async function drawOne(options: {
  brief: string;
  round: number;
  climbRoot: string;
  settingsPath: string;
  timeoutMs: number;
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

  const prompt = drawerPrompt(brief, readFileSync(briefPath(brief), "utf8"));
  const startedAt = new Date();
  const transcript = createWriteStream(resolve(dir, "transcript.jsonl"));
  const stderr = createWriteStream(resolve(dir, "stderr.log"));
  const child = spawn("claude", drawerArgs(dir, prompt, options.settingsPath), {
    cwd: dir,
    env: drawerEnv(dir),
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(transcript);
  child.stderr.pipe(stderr);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, options.timeoutMs);
  const [exitCode, signal] = await new Promise<[number | null, NodeJS.Signals | null]>((done, fail) => {
    child.on("error", fail);
    child.on("close", (code, sig) => done([code, sig]));
  });
  clearTimeout(timer);
  await Promise.all([transcript, stderr].map((stream) => new Promise((done) => stream.end(done))));

  // The board moves up beside its transcript; the empty canvases folder goes.
  const created = resolve(canvasesDir, `${brief}.canvas.json`);
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
  };
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  const seconds = Math.round(record.durationMs / 1000);
  process.stdout.write(`${brief}: exit ${exitCode ?? signal}${timedOut ? " (timed out)" : ""} · ${seconds} s · board ${hasBoard ? "saved" : "missing"}\n`);
  return record;
}

export async function runDraw(argv: string[]): Promise<void> {
  const flags = parseFlags(argv, ["--round", "--set", "--briefs", "--climb-root", "--settings", "--timeout-min"]);
  const round = roundNumber(flags.get("--round"));
  const sets = readSets();
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
  for (const brief of briefs) briefPath(brief);

  const timeoutMinutes = Number(flags.get("--timeout-min") ?? DEFAULT_TIMEOUT_MINUTES);
  if (!(timeoutMinutes > 0)) throw new Error("--timeout-min must be a positive number");
  const settingsPath = flags.get("--settings") ?? resolve(homedir(), ".claude", "settings.json");
  if (!existsSync(settingsPath)) throw new Error(`No Claude Code settings file at ${settingsPath} (pass --settings)`);
  const climbRoot = resolve(flags.get("--climb-root") ?? DEFAULT_CLIMB_ROOT);

  const gate = new Semaphore(MAX_PARALLEL);
  const records = await Promise.all(briefs.map((brief) => gate.run(() =>
    drawOne({ brief, round, climbRoot, settingsPath, timeoutMs: timeoutMinutes * 60_000 }))));
  const failed = records.filter((record) => record.exitCode !== 0 || !record.board);
  if (failed.length > 0) {
    process.stderr.write(`${failed.length} of ${records.length} drawers failed: ${failed.map((record) => record.brief).join(", ")}\n`);
    process.exitCode = 1;
  }
}
