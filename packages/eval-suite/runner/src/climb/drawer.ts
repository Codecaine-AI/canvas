/**
 * The drawer process: one headless Claude Code run (Opus 5.5, high effort,
 * the canvas MCP and nothing else). `climb draw` starts one per brief
 * (draw.ts), and the critic loop resumes its session for each revise pass
 * (critic-loop.ts).
 *
 * A pass reads its message on stdin as one `stream-json` user event, so the
 * message can hold images beside its text: the marked crops of a trial run
 * (trial.ts). The drawer has no tool that reads a file, and gets none.
 *
 * The drawer must be the same in every round, so it runs in bare mode: no
 * CLAUDE.md discovery, hooks, plugins or skills, and no built-in tools. Auth
 * comes from the user settings file passed with `--settings` (its
 * `apiKeyHelper`), the only setting bare mode reads from it that matters here.
 */
import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { CANVAS_REPO_ROOT } from "./paths.ts";

export const DRAWER_MODEL = "claude-opus-5-5";
export const DRAWER_EFFORT = "high";
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

/** One part of what a pass tells the drawer: text, or an image it sees in line with the text (a PNG file). */
export type DrawerPart = string | { image: string };

/** The message as the drawer reads it on stdin: one `stream-json` user event, its parts in order. */
export function drawerInput(message: DrawerPart[]): string {
  const content = message.map((part) => typeof part === "string"
    ? { type: "text", text: part }
    : { type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(part.image).toString("base64") } });
  return `${JSON.stringify({ type: "user", message: { role: "user", content } })}\n`;
}

/**
 * `session.persist` keeps the session on disk so a later pass can resume
 * it; `session.resume` is that session's id. The transcript repeats the
 * message the drawer read (`--replay-user-messages`), its images too, so it
 * records both sides of the pass.
 */
export function drawerArgs(dir: string, settingsPath: string, session: { persist: boolean; resume?: string } = { persist: false }): string[] {
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
    "-p",
    "--input-format", "stream-json",
    "--replay-user-messages",
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

/**
 * One drawer process, its stdout to `transcriptPath` and its stderr appended to stderr.log.
 *
 * The child writes to the files itself. Through a pipe, a transcript can end
 * inside a large event (a board image) and lose the closing `result` event,
 * and with it the drawer's answers.
 */
export async function runDrawer(dir: string, args: string[], message: DrawerPart[], transcriptPath: string, timeoutMs: number): Promise<DrawerRun> {
  const started = Date.now();
  const transcript = openSync(transcriptPath, "w");
  const stderr = openSync(resolve(dir, "stderr.log"), "a");
  try {
    const child = spawn("claude", args, { cwd: dir, env: drawerEnv(dir), stdio: ["pipe", transcript, stderr] });
    // A drawer that dies before it reads its message closes the pipe. Its exit code reports that.
    child.stdin!.on("error", () => {});
    child.stdin!.end(drawerInput(message));
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
    return { exitCode, signal, timedOut, durationMs: Date.now() - started };
  } finally {
    closeSync(transcript);
    closeSync(stderr);
  }
}

/**
 * The drawer of one critic loop. Each pass resumes the session the pass
 * before it left and saves its own, so the loop can ask in the same session
 * for an answer a reply left out, after the last revise too. `session` is the
 * session that drew the board. Without one, the first pass starts one.
 */
export function drawerSession(
  drawer: { dir: string; settingsPath: string; timeoutMs: number; session?: string },
  run: typeof runDrawer = runDrawer,
): (message: DrawerPart[], transcriptPath: string) => Promise<{ run: DrawerRun; reply: string }> {
  let session = drawer.session;
  return async (message, transcriptPath) => {
    const pass = await run(drawer.dir, drawerArgs(drawer.dir, drawer.settingsPath, { persist: true, resume: session }), message, transcriptPath, drawer.timeoutMs);
    const transcript = readFileSync(transcriptPath, "utf8");
    session = sessionIdOf(transcript) ?? session;
    return { run: pass, reply: replyOf(transcript) };
  };
}
