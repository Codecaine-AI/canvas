/**
 * The drawer process: one headless Claude Code run (Opus 5.5, medium effort,
 * the canvas MCP and nothing else). `climb draw` starts one per brief
 * (draw.ts), and the critic loop resumes its session for each revise pass
 * (critic-loop.ts).
 *
 * The drawer must be the same in every round, so it runs in bare mode: no
 * CLAUDE.md discovery, hooks, plugins or skills, and no built-in tools. Auth
 * comes from the user settings file passed with `--settings` (its
 * `apiKeyHelper`), the only setting bare mode reads from it that matters here.
 */
import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { CANVAS_REPO_ROOT } from "./paths.ts";

export const DRAWER_MODEL = "claude-opus-5-5";
export const DRAWER_EFFORT = "medium";
const MCP_SERVER = "canvas";
/**
 * One pass: the first draw, or one revise. Each pass has its own clock, and
 * nothing times the critic loop as a whole, so more rounds never cut a loop
 * off. The longest pass of round 2 was a first draw of 49.5 minutes.
 */
const DEFAULT_TIMEOUT_MINUTES = 75;

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

/** `--settings <path>` and `--timeout-min <n>`: the drawer's auth file and the time one pass may take. */
export function drawerFlags(flags: Map<string, string>): { settingsPath: string; timeoutMs: number } {
  const timeoutMinutes = Number(flags.get("--timeout-min") ?? DEFAULT_TIMEOUT_MINUTES);
  if (!(timeoutMinutes > 0)) throw new Error("--timeout-min must be a positive number");
  const settingsPath = flags.get("--settings") ?? resolve(homedir(), ".claude", "settings.json");
  if (!existsSync(settingsPath)) throw new Error(`No Claude Code settings file at ${settingsPath} (pass --settings)`);
  return { settingsPath, timeoutMs: timeoutMinutes * 60_000 };
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

/** The events of a Claude Code `stream-json` transcript, skipping a torn last line. */
function events(jsonl: string): Array<Record<string, unknown>> {
  return jsonl.split("\n").flatMap((line) => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line) as Record<string, unknown>]; } catch { return []; }
  });
}

/** The session id of a transcript: its first event that names one. */
export function sessionIdOf(jsonl: string): string | null {
  for (const event of events(jsonl)) if (typeof event.session_id === "string" && event.session_id) return event.session_id;
  return null;
}

/** The drawer's closing reply: the text of the transcript's `result` event, or "" when the pass did not finish. */
export function replyOf(jsonl: string): string {
  const result = events(jsonl).findLast((event) => event.type === "result")?.result;
  return typeof result === "string" ? result : "";
}

export interface DrawerRun { exitCode: number | null; signal: NodeJS.Signals | null; timedOut: boolean; durationMs: number }

/** One drawer process, its stdout to `transcriptPath` and its stderr appended to stderr.log. */
export async function runDrawer(dir: string, args: string[], transcriptPath: string, timeoutMs: number): Promise<DrawerRun> {
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
