/**
 * The drawer process: one headless Claude Code run (Opus 5.5, high effort,
 * the canvas MCP and nothing else). `climb draw` starts one per brief
 * (draw.ts), and the critic loop resumes its session for each revise pass
 * (critic-loop.ts).
 *
 * A pass reads its message on stdin as one `stream-json` user event, so the
 * message can hold images beside its text: the reviewers' highlights
 * (highlights.ts). The drawer has no tool that reads a file, and gets none.
 *
 * A pass that the API turns down for a rate limit or an overload runs again
 * after a wait (drawerPass). Round 4 lost 5 loops to HTTP 429.
 *
 * The drawer must be the same in every round, so it runs in bare mode: no
 * CLAUDE.md discovery, hooks, plugins or skills, and no built-in tools. Auth
 * comes from the user settings file passed with `--settings` (its
 * `apiKeyHelper`), the only setting bare mode reads from it that matters here.
 */
import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { isRateLimitText, retryRateLimited } from "./backoff.ts";
import { CANVAS_REPO_ROOT } from "./paths.ts";

export const DRAWER_MODEL = "claude-opus-5-5";
export const DRAWER_EFFORT = "high";
const MCP_SERVER = "canvas";
/**
 * The first draw. The longest of round 2 took 49.5 minutes. A revise pass has
 * its own, shorter clock (critic.ts DEFAULT_REVISE_MINUTES).
 */
const DEFAULT_TIMEOUT_MINUTES = 75;
/** The first wait after the API turns a pass down for a rate limit. It doubles: 1, 2, 4, 8 minutes. */
const DRAWER_FIRST_WAIT_MS = 60_000;
/** The HTTP statuses of a rate limit and an overload. */
const LIMIT_STATUSES: readonly unknown[] = [429, 503, 529];

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

/** `--settings <path>` and `--timeout-min <n>`: the drawer's auth file and the time the first draw may take. */
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

/**
 * Whether a pass stopped because the API turned a request down for a rate
 * limit or an overload: the transcript's closing `result` event is an API
 * error with HTTP 429, 529 or 503, or with a text that names the limit.
 */
export function rateLimitedPass(jsonl: string): boolean {
  const result = events(jsonl).findLast((event) => event.type === "result");
  if (result?.is_error !== true) return false;
  return LIMIT_STATUSES.includes(result.api_error_status)
    || (result.terminal_reason === "api_error" && typeof result.result === "string" && isRateLimitText(result.result));
}

/** One drawer process. */
export interface ProcessRun { exitCode: number | null; signal: NodeJS.Signals | null; timedOut: boolean; durationMs: number }
/** One pass: its last process, and the tries a rate limit cost it. */
export interface DrawerRun extends ProcessRun {
  /** How many processes the pass ran: over 1 after a rate limit or an overload. `durationMs` holds them all, the waits too. */
  tries: number;
  /** True when the last try hit the limit too: the pass did not run to its end. */
  rateLimited: boolean;
}

/**
 * One drawer process, its stdout to `transcriptPath` and its stderr appended to stderr.log.
 *
 * The child writes to the files itself. Through a pipe, a transcript can end
 * inside a large event (a board image) and lose the closing `result` event,
 * and with it the drawer's answers.
 */
export async function runDrawer(dir: string, args: string[], message: DrawerPart[], transcriptPath: string, timeoutMs: number): Promise<ProcessRun> {
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
 * One pass, run again while the API turns it down for a rate limit or an
 * overload: 5 tries, with waits of 1, 2, 4 and 8 minutes. A try after the
 * first resumes the session the try before it left, when the pass keeps its
 * session, and reads the same message again. `transcriptPath` holds the last
 * try, and `<name>.try-<n>.jsonl` each try before it.
 */
export async function drawerPass(options: {
  dir: string;
  settingsPath: string;
  session: { persist: boolean; resume?: string };
  message: DrawerPart[];
  transcriptPath: string;
  timeoutMs: number;
  run?: typeof runDrawer;
  sleep?(ms: number): Promise<void>;
}): Promise<{ run: DrawerRun; transcript: string }> {
  const { dir, transcriptPath } = options;
  const started = Date.now();
  let resume = options.session.resume;
  const { result, tries, limited } = await retryRateLimited({
    attempt: async (attempt) => {
      if (attempt > 1) renameSync(transcriptPath, transcriptPath.replace(/(\.jsonl)?$/, `.try-${attempt - 1}.jsonl`));
      const args = drawerArgs(dir, options.settingsPath, { persist: options.session.persist, resume });
      const run = await (options.run ?? runDrawer)(dir, args, options.message, transcriptPath, options.timeoutMs);
      const transcript = readFileSync(transcriptPath, "utf8");
      if (options.session.persist) resume = sessionIdOf(transcript) ?? resume;
      return { run, transcript };
    },
    limited: ({ run, transcript }) => run.exitCode !== 0 && !run.timedOut && rateLimitedPass(transcript),
    firstWaitMs: DRAWER_FIRST_WAIT_MS,
    sleep: options.sleep,
    onWait: (attempt, waitMs) => process.stdout.write(`drawer in ${dir}: rate limited on try ${attempt}, waits ${waitMs / 1000} s\n`),
  });
  return { run: { ...result.run, durationMs: Date.now() - started, tries, rateLimited: limited }, transcript: result.transcript };
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
  sleep?: (ms: number) => Promise<void>,
): (message: DrawerPart[], transcriptPath: string) => Promise<{ run: DrawerRun; reply: string }> {
  let session = drawer.session;
  return async (message, transcriptPath) => {
    const pass = await drawerPass({
      dir: drawer.dir, settingsPath: drawer.settingsPath, session: { persist: true, resume: session }, message, transcriptPath, timeoutMs: drawer.timeoutMs, run, sleep,
    });
    session = sessionIdOf(pass.transcript) ?? session;
    return { run: pass.run, reply: replyOf(pass.transcript) };
  };
}
