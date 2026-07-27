import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  closeSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  openSync,
} from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { spawn, type ChildProcess } from "node:child_process";

import type {
  AxisCode,
  ReasoningEffort,
  RunProgress,
  ScenarioId,
  ScenarioProgressStatus,
  StageId,
  SutThinkingLevel,
} from "../contract.ts";
import {
  AXIS_CODES,
  SUT_THINKING_LEVELS,
} from "../contract.ts";
import {
  EVAL_CANVASES_DIR,
  EVAL_SUITE_DIR,
  REPO_ROOT,
  RUNS_DIR,
  boardIdFor,
  canonicalizeRunId,
  type ScenarioFixture,
  type ScenarioResult,
} from "./scenario.ts";
import { snapshotReferences, type ReferenceSnapshotResult } from "./snapshot.ts";

const execFileAsync = promisify(execFile);
const RUNNER_DIR = resolve(REPO_ROOT, "packages", "eval-suite", "runner");
const SCENARIO_CHILD_PATH = resolve(RUNNER_DIR, "src", "scenario", "scenario.ts");
const EVAL_FILE_API_PATH = resolve(
  RUNNER_DIR,
  "src",
  "scenario",
  "eval_file_api.ts",
);
const HARNESS_SERVER_PATH = resolve(
  REPO_ROOT,
  "packages",
  "canvas-agent",
  "src",
  "service",
  "server.ts",
);
const EVAL_HARNESS_PORT = 4821;
const EVAL_HARNESS_STATE_PATH = resolve(
  REPO_ROOT,
  ".agent-kernel",
  "eval-harness-state.json",
);

interface EvalHarnessState {
  port: typeof EVAL_HARNESS_PORT;
  pid: number;
  thinking: SutThinkingLevel;
  started_at: string;
  run_id: string;
  log_path: string;
}

interface ServiceHandle {
  name: string;
  spawned: boolean;
  pid: number | null;
  startedAt: string | null;
  healthCheckedAt: string;
  child: ChildProcess | null;
}

export interface JudgeClientOptions {
  model: string;
  baseUrl: string;
  effort: ReasoningEffort;
}

export interface SuiteQueueOptions {
  runId: string;
  sutThinking: SutThinkingLevel;
  sutThinkingSource: "eval default" | "--sut-thinking";
  fixtures: ScenarioFixture[];
  parallel: number;
  judgeConcurrency: number;
  previous?: string;
  teardown?: boolean;
  judgeClient: JudgeClientOptions;
  observer?: SuiteQueueObserver;
}

export interface SuiteQueueResult {
  runId: string;
  progress: RunProgress;
  runDir: string;
}

export interface QueueServiceStatus {
  name: "file-api" | "harness";
  up: boolean;
}

export interface QueueScenarioStatus {
  scenario: ScenarioId;
  name: string;
  status: ScenarioProgressStatus;
  currentStage: StageId | null;
  sessionNumber: number;
  sessionTotal: number;
  axesDone: number;
  axesTotal: number;
  startedAt: string | null;
  finishedAt: string | null;
  flags: string[];
}

export interface SuiteQueueStatus {
  runId: string;
  tier: "system";
  runStatus: RunProgress["status"];
  startedAt: string;
  finishedAt: string | null;
  observedAt: string;
  services: QueueServiceStatus[];
  judgeInFlight: number;
  judgeLimit: number;
  scenarios: QueueScenarioStatus[];
}

export interface SuiteQueueObserver {
  onStatus(status: SuiteQueueStatus): void;
}

class ProgressWriter {
  private tail: Promise<void> = Promise.resolve();

  constructor(
    readonly path: string,
    readonly progress: RunProgress,
    private readonly onUpdate?: () => void,
  ) {}

  update(mutator: (progress: RunProgress) => void): Promise<void> {
    this.tail = this.tail.then(async () => {
      mutator(this.progress);
      const snapshot = structuredClone(this.progress);
      const tempPath = `${this.path}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`);
      await rename(tempPath, this.path);
      this.onUpdate?.();
    });
    return this.tail;
  }

  settled(): Promise<void> {
    return this.tail;
  }
}

interface ScenarioRuntimeStatus {
  fixture: ScenarioFixture;
  startedAt: string | null;
  finishedAt: string | null;
  completedStages: StageId[];
  outcomes: ScenarioResult["outcomes"];
  axesDone: Set<AxisCode>;
  judgeFlags: Set<string>;
}

function serviceStatus(handles: ServiceHandle[]): QueueServiceStatus[] {
  const statusFor = (
    handle: ServiceHandle | undefined,
    name: QueueServiceStatus["name"],
  ): QueueServiceStatus => ({
    name,
    up: handle
      ? !handle.spawned
        || (handle.child?.exitCode === null && handle.child.signalCode === null)
      : false,
  });
  return [
    statusFor(
      handles.find((handle) => handle.name === "eval file API"),
      "file-api",
    ),
    statusFor(
      handles.find((handle) => handle.name === "eval harness"),
      "harness",
    ),
  ];
}

function runtimeFlags(runtime: ScenarioRuntimeStatus): string[] {
  const flags = new Set(runtime.judgeFlags);
  for (const [stage, outcome] of Object.entries(runtime.outcomes)) {
    if (outcome === "rejected") flags.add(`REJECTED(${stage})`);
    else if (outcome === "invalid-infra") flags.add(`INFRA(${stage})`);
    else if (outcome === "agent-abandon") flags.add(`ABANDON(${stage})`);
  }
  return [...flags].sort();
}

function buildQueueStatus(options: {
  progress: RunProgress;
  fixtures: ScenarioFixture[];
  runtime: Map<ScenarioId, ScenarioRuntimeStatus>;
  services: ServiceHandle[];
  judgeInFlight: number;
  judgeLimit: number;
}): SuiteQueueStatus {
  const axesTotal = AXIS_CODES.length;
  return {
    runId: options.progress.run_id,
    tier: options.progress.tier,
    runStatus: options.progress.status,
    startedAt: options.progress.started_at,
    finishedAt: options.progress.finished_at,
    observedAt: new Date().toISOString(),
    services: serviceStatus(options.services),
    judgeInFlight: options.judgeInFlight,
    judgeLimit: options.judgeLimit,
    scenarios: options.fixtures.map((fixture) => {
      const progress = options.progress.scenarios[fixture.scenario];
      const runtime = options.runtime.get(fixture.scenario);
      const completedCount = runtime?.completedStages.length
        ?? progress.stages_done.length;
      const stageIndex = Math.min(
        Math.max(0, completedCount),
        fixture.stages.length - 1,
      );
      return {
        scenario: fixture.scenario,
        name: fixture.title,
        status: progress.status,
        currentStage: progress.status === "building"
          ? fixture.stages[stageIndex]?.id ?? null
          : null,
        sessionNumber: progress.status === "building"
          ? Math.min(completedCount + 1, fixture.stages.length)
          : fixture.stages.length,
        sessionTotal: fixture.stages.length,
        axesDone: runtime?.axesDone.size ?? 0,
        axesTotal,
        startedAt: runtime?.startedAt ?? null,
        finishedAt: runtime?.finishedAt ?? progress.finished_at,
        flags: runtime ? runtimeFlags(runtime) : [],
      };
    }),
  };
}

async function refreshScenarioArtifacts(options: {
  runId: string;
  runDir: string;
  runtime: ScenarioRuntimeStatus;
}): Promise<void> {
  const scenario = options.runtime.fixture.scenario;
  try {
    const result = JSON.parse(
      await readFile(
        resolve(options.runDir, scenario, "scenario_result.json"),
        "utf8",
      ),
    ) as ScenarioResult;
    if (result.run_id === options.runId && result.scenario === scenario) {
      options.runtime.completedStages = [...result.stages];
      options.runtime.outcomes = { ...result.outcomes };
    }
  } catch {
    // The child writes this file atomically; absence only means it has not started yet.
  }

  await Promise.all(
    AXIS_CODES.map(async (axis) => {
      try {
        const envelope = JSON.parse(
          await readFile(
            resolve(options.runDir, scenario, `judge-${axis}.json`),
            "utf8",
          ),
        ) as { axis?: string; scenario?: string; flags?: unknown };
        if (envelope.axis !== axis || envelope.scenario !== scenario) return;
        options.runtime.axesDone.add(axis);
        if (Array.isArray(envelope.flags)) {
          for (const flag of envelope.flags) {
            if (typeof flag === "string" && flag.length > 0) {
              options.runtime.judgeFlags.add(flag);
            }
          }
        }
      } catch {
        // A missing judge artifact is represented by the current axes-done count.
      }
    }),
  );
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function provisionHarnessExemplar(): void {
  try {
    if (lstatSync(EVAL_CANVASES_DIR).isSymbolicLink()) {
      throw new Error("Refusing to use a canvases/evals symlink.");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    mkdirSync(EVAL_CANVASES_DIR, { recursive: true });
  }
  const source = resolve(REPO_ROOT, "canvases", "gc-decomp-harness.canvas.json");
  const target = resolve(EVAL_CANVASES_DIR, "gc-decomp-harness.canvas.json");
  copyFileSync(source, target);
}

async function fileApiHealthy(): Promise<boolean> {
  try {
    const response = await fetch("http://127.0.0.1:4010/health", {
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return false;
    const payload = await response.json() as {
      status?: string;
      canvases_dir?: string;
    };
    return payload.status === "ok"
      && resolve(payload.canvases_dir ?? "") === EVAL_CANVASES_DIR;
  } catch {
    return false;
  }
}

async function harnessHealthy(): Promise<boolean> {
  try {
    const response = await fetch(
      `http://127.0.0.1:${EVAL_HARNESS_PORT}/health`,
      {
        signal: AbortSignal.timeout(2_000),
      },
    );
    if (!response.ok) return false;
    const payload = await response.json() as { status?: string; kernel?: string };
    return payload.status === "ok" && payload.kernel === "canvas-agent";
  } catch {
    return false;
  }
}

const SUT_THINKING_LEVEL_SET = new Set<SutThinkingLevel>(SUT_THINKING_LEVELS);

function isEvalHarnessState(value: unknown): value is EvalHarnessState {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const state = value as Partial<EvalHarnessState>;
  return state.port === EVAL_HARNESS_PORT
    && typeof state.pid === "number"
    && Number.isInteger(state.pid)
    && state.pid > 0
    && typeof state.thinking === "string"
    && SUT_THINKING_LEVEL_SET.has(state.thinking as SutThinkingLevel)
    && typeof state.started_at === "string"
    && typeof state.run_id === "string"
    && typeof state.log_path === "string";
}

async function readEvalHarnessState(): Promise<EvalHarnessState | null> {
  let source: string;
  try {
    source = await readFile(EVAL_HARNESS_STATE_PATH, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    const parsed: unknown = JSON.parse(source);
    return isEvalHarnessState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeEvalHarnessState(state: EvalHarnessState): Promise<void> {
  await mkdir(dirname(EVAL_HARNESS_STATE_PATH), { recursive: true });
  const tempPath = `${EVAL_HARNESS_STATE_PATH}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`);
  await rename(tempPath, EVAL_HARNESS_STATE_PATH);
}

async function evalHarnessListenerPids(): Promise<number[]> {
  try {
    const { stdout } = await execFileAsync(
      "lsof",
      [
        "-nP",
        "-t",
        `-iTCP:${EVAL_HARNESS_PORT}`,
        "-sTCP:LISTEN",
      ],
      { cwd: REPO_ROOT },
    );
    return [...new Set(
      stdout
        .split(/\s+/)
        .filter(Boolean)
        .map(Number)
        .filter((pid) => Number.isInteger(pid) && pid > 0),
    )];
  } catch (error) {
    if ((error as { code?: number | string }).code === 1) return [];
    throw error;
  }
}

async function waitForEvalHarnessExit(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await evalHarnessListenerPids()).length === 0) return true;
    await Bun.sleep(250);
  }
  return (await evalHarnessListenerPids()).length === 0;
}

async function stopEvalHarness(listenerPids: number[]): Promise<void> {
  if (listenerPids.length === 0) {
    throw new Error(
      `Eval harness answered on :${EVAL_HARNESS_PORT}, but its listener process could not be identified.`,
    );
  }
  for (const pid of listenerPids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
  if (await waitForEvalHarnessExit(10_000)) return;

  for (const pid of await evalHarnessListenerPids()) {
    try {
      process.kill(pid, "SIGKILL");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
  if (!await waitForEvalHarnessExit(5_000)) {
    throw new Error(`Eval harness on :${EVAL_HARNESS_PORT} did not stop.`);
  }
}

function spawnService(options: {
  name: string;
  entryPath: string;
  logPath: string;
  env?: NodeJS.ProcessEnv;
}): ServiceHandle {
  const logFd = openSync(options.logPath, "a");
  const startedAt = new Date().toISOString();
  const child = spawn(process.execPath, [options.entryPath], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", logFd, logFd],
    detached: true,
  });
  closeSync(logFd);
  child.unref();
  return {
    name: options.name,
    spawned: true,
    pid: child.pid ?? null,
    startedAt,
    healthCheckedAt: startedAt,
    child,
  };
}

async function waitForHealthy(options: {
  handle: ServiceHandle;
  check: () => Promise<boolean>;
  timeoutMs?: number;
}): Promise<void> {
  const deadline = Date.now() + (options.timeoutMs ?? 45_000);
  while (Date.now() < deadline) {
    if (await options.check()) {
      options.handle.healthCheckedAt = new Date().toISOString();
      return;
    }
    if (options.handle.child?.exitCode !== null) {
      throw new Error(
        `${options.handle.name} exited before becoming healthy (code ${options.handle.child?.exitCode}).`,
      );
    }
    await Bun.sleep(500);
  }
  throw new Error(`${options.handle.name} did not become healthy before the startup deadline.`);
}

async function ensureService(options: {
  name: string;
  check: () => Promise<boolean>;
  spawn: () => ServiceHandle;
}): Promise<ServiceHandle> {
  if (await options.check()) {
    return {
      name: options.name,
      spawned: false,
      pid: null,
      startedAt: null,
      healthCheckedAt: new Date().toISOString(),
      child: null,
    };
  }
  const handle = options.spawn();
  await waitForHealthy({ handle, check: options.check });
  return handle;
}

async function ensureEvalHarness(options: {
  runId: string;
  servicesDir: string;
  thinking: SutThinkingLevel;
}): Promise<ServiceHandle> {
  if (await harnessHealthy()) {
    const listenerPids = await evalHarnessListenerPids();
    const state = await readEvalHarnessState();
    const recordedState = state && listenerPids.includes(state.pid)
      ? state
      : null;
    if (recordedState?.thinking === options.thinking) {
      return {
        name: "eval harness",
        spawned: false,
        pid: null,
        startedAt: null,
        healthCheckedAt: new Date().toISOString(),
        child: null,
      };
    }
    const recorded = recordedState
      ? `recorded thinking ${recordedState.thinking}`
      : "no recorded thinking";
    process.stdout.write(
      `eval harness :${EVAL_HARNESS_PORT} restarting (${recorded}; requested ${options.thinking}).\n`,
    );
    await stopEvalHarness(listenerPids);
  }

  const logPath = resolve(options.servicesDir, "harness.log");
  const handle = spawnService({
    name: "eval harness",
    entryPath: HARNESS_SERVER_PATH,
    logPath,
    env: {
      CANVAS_AGENT_CANVASES_DIR: EVAL_CANVASES_DIR,
      CANVAS_AGENT_PORT: String(EVAL_HARNESS_PORT),
      CANVAS_AGENT_THINKING: options.thinking,
    },
  });
  try {
    await waitForHealthy({ handle, check: harnessHealthy });
    if (!handle.pid || !handle.startedAt) {
      throw new Error("Eval harness spawned without process identity.");
    }
    await writeEvalHarnessState({
      port: EVAL_HARNESS_PORT,
      pid: handle.pid,
      thinking: options.thinking,
      started_at: handle.startedAt,
      run_id: options.runId,
      log_path: relative(REPO_ROOT, logPath),
    });
    return handle;
  } catch (error) {
    await teardownServices([handle]);
    throw error;
  }
}

async function ensureEvalServices(options: {
  runId: string;
  runDir: string;
  sutThinking: SutThinkingLevel;
}): Promise<ServiceHandle[]> {
  provisionHarnessExemplar();
  const servicesDir = resolve(options.runDir, "services");
  await mkdir(servicesDir, { recursive: true });
  const handles: ServiceHandle[] = [];
  try {
    handles.push(await ensureService({
      name: "eval file API",
      check: fileApiHealthy,
      spawn: () => spawnService({
        name: "eval file API",
        entryPath: EVAL_FILE_API_PATH,
        logPath: resolve(servicesDir, "file-api.log"),
        env: { EVAL_FILE_API_PORT: "4010" },
      }),
    }));
    handles.push(await ensureEvalHarness({
      runId: options.runId,
      servicesDir,
      thinking: options.sutThinking,
    }));
    return handles;
  } catch (error) {
    await teardownServices(handles);
    throw error;
  }
}

async function teardownServices(handles: ServiceHandle[]): Promise<void> {
  for (const handle of handles) {
    if (!handle.spawned || !handle.pid) continue;
    try {
      process.kill(-handle.pid, "SIGTERM");
    } catch {
      try {
        process.kill(handle.pid, "SIGTERM");
      } catch {
        continue;
      }
    }
  }
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const stillHealthy = await Promise.all([
      handles.some((handle) => handle.spawned && handle.name === "eval file API")
        ? fileApiHealthy()
        : false,
      handles.some((handle) => handle.spawned && handle.name === "eval harness")
        ? harnessHealthy()
        : false,
    ]);
    if (!stillHealthy.some(Boolean)) break;
    await Bun.sleep(250);
  }
  const harness = handles.find((handle) =>
    handle.spawned && handle.name === "eval harness"
  );
  if (harness?.pid && !await harnessHealthy()) {
    const state = await readEvalHarnessState();
    if (state?.pid === harness.pid) {
      try {
        await unlink(EVAL_HARNESS_STATE_PATH);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}

async function recursiveFiles(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = resolve(path, entry.name);
    if (entry.isDirectory()) files.push(...await recursiveFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files.sort();
}

async function hashFiles(paths: string[]): Promise<{ hash: string; files: string[] }> {
  const files: string[] = [];
  for (const path of paths) {
    const stat = lstatSync(path);
    files.push(...(stat.isDirectory() ? await recursiveFiles(path) : [path]));
  }
  files.sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(relative(REPO_ROOT, file));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return {
    hash: hash.digest("hex").slice(0, 8),
    files: files.map((file) => relative(REPO_ROOT, file)),
  };
}

async function gitFingerprint(): Promise<{ revision: string; dirty: boolean }> {
  const revision = (
    await execFileAsync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO_ROOT })
  ).stdout.trim();
  const status = (
    await execFileAsync("git", ["status", "--porcelain"], { cwd: REPO_ROOT })
  ).stdout;
  return { revision, dirty: status.trim().length > 0 };
}

function markdownFileList(title: string, files: string[]): string {
  return [
    `<details><summary>${title}</summary>`,
    "",
    ...files.map((file) => `- \`${file}\``),
    "",
    "</details>",
  ].join("\n");
}

async function writeFingerprint(options: {
  runId: string;
  sutThinking: SutThinkingLevel;
  sutThinkingSource: SuiteQueueOptions["sutThinkingSource"];
  runDir: string;
  judgeClient: JudgeClientOptions;
  services: ServiceHandle[];
  references: ReferenceSnapshotResult[];
  git: { revision: string; dirty: boolean };
}): Promise<void> {
  const agentConfigPath = resolve(
    REPO_ROOT,
    "packages",
    "canvas-agent",
    "src",
    "agent",
    "catalog",
    "layout-editor",
    "agent.json",
  );
  const agentConfig = JSON.parse(await readFile(agentConfigPath, "utf8")) as {
    model?: string;
    thinking?: string;
    maxTurns?: number;
  };
  const kernelSource = await readFile(
    resolve(REPO_ROOT, "packages", "canvas-agent", "src", "service", "kernel.ts"),
    "utf8",
  );
  const resolvedModel = kernelSource.match(
    /export const LAYOUT_MODEL\s*=\s*"([^"]+)"/,
  )?.[1] ?? agentConfig.model ?? "unknown";
  const prompt = await hashFiles([
    resolve(
      REPO_ROOT,
      "packages",
      "canvas-agent",
      "src",
      "agent",
      "catalog",
      "layout-editor",
      "prompt",
      "prompt.json",
    ),
    resolve(
      REPO_ROOT,
      "packages",
      "canvas-agent",
      "src",
      "agent",
      "catalog",
      "layout-editor",
      "prompt",
      "system.md",
    ),
  ]);
  const lints = await hashFiles([
    resolve(REPO_ROOT, "packages", "canvas-agent", "src", "board", "lints"),
  ]);
  const styles = await hashFiles([
    resolve(
      REPO_ROOT,
      "packages",
      "canvas-agent",
      "src",
      "agent",
      "catalog",
      "layout-editor",
      "context",
      "style-guide",
    ),
  ]);
  const harness = options.services.find((service) => service.name === "eval harness");
  const lines = [
    `# Eval-suite fingerprint — ${options.runId}`,
    "",
    `- run id: \`${options.runId}\``,
    "- tier: `system`",
    `- git: \`${options.git.revision}${options.git.dirty ? "+dirty" : ""}\``,
    `- SUT agent config: model \`${resolvedModel}\` @ \`${options.sutThinking}\` (${options.sutThinkingSource}; agent.json \`${agentConfig.thinking ?? "unknown"}\`), max turns \`${agentConfig.maxTurns ?? "unknown"}\``,
    `- prompt hash: \`${prompt.hash}\``,
    `- lint hash: \`${lints.hash}\``,
    `- style hash: \`${styles.hash}\``,
    `- judge client: model \`${options.judgeClient.model}\`, effort \`${options.judgeClient.effort}\`, base URL \`${options.judgeClient.baseUrl}\``,
    "- snapshot fonts: bundled Inter + system fallback (Helvetica default/sans-serif)",
    `- harness start time: ${harness?.startedAt ?? `pre-existing; health checked ${harness?.healthCheckedAt ?? "unknown"}`}`,
    `- eval canvas directory: \`${relative(REPO_ROOT, EVAL_CANVASES_DIR)}\``,
    "",
    "## Reference renders",
    "",
    ...options.references.map(
      (reference) => `- \`${reference.id}\`: \`${reference.source}\``,
    ),
    "",
    markdownFileList("Prompt files", prompt.files),
    "",
    markdownFileList("Active lint files", lints.files),
    "",
    markdownFileList("Active style files", styles.files),
    "",
  ];
  await writeFile(resolve(options.runDir, "fingerprint.md"), lines.join("\n"));
}

function initialProgress(
  runId: string,
  sutThinking: SutThinkingLevel,
  fixtures: ScenarioFixture[],
): RunProgress {
  return {
    run_id: runId,
    tier: "system",
    sut_thinking: sutThinking,
    status: "running",
    started_at: new Date().toISOString(),
    finished_at: null,
    scenarios: Object.fromEntries(
      fixtures.map((fixture) => [
        fixture.scenario,
        {
          status: "pending",
          stages_done: [],
          pid: null,
          finished_at: null,
        },
      ]),
    ),
  };
}

function spawnScenarioChild(options: {
  runId: string;
  scenario: ScenarioId;
  scenarioDir: string;
}): {
  child: ChildProcess;
  completion: Promise<{ code: number; signal: NodeJS.Signals | null }>;
} {
  mkdirSync(options.scenarioDir, { recursive: true });
  const logFd = openSync(resolve(options.scenarioDir, "scenario.log"), "a");
  const child = spawn(
    process.execPath,
    [
      SCENARIO_CHILD_PATH,
      "--run-id",
      options.runId,
      "--scenario",
      options.scenario,
    ],
    {
      cwd: RUNNER_DIR,
      env: process.env,
      stdio: ["ignore", logFd, logFd],
    },
  );
  closeSync(logFd);
  const completion = new Promise<{ code: number; signal: NodeJS.Signals | null }>(
    (resolveCompletion, rejectCompletion) => {
      child.once("error", rejectCompletion);
      child.once("exit", (code, signal) => {
        resolveCompletion({ code: code ?? 1, signal });
      });
    },
  );
  return { child, completion };
}

async function readScenarioResult(
  path: string,
  runId: string,
  scenario: ScenarioId,
): Promise<ScenarioResult> {
  const result = JSON.parse(await readFile(path, "utf8")) as ScenarioResult;
  if (result.run_id !== runId || result.scenario !== scenario) {
    throw new Error(`Scenario result identity mismatch in ${path}.`);
  }
  return result;
}

type JudgeModuleFunction = (options: Record<string, unknown>) => Promise<unknown>;
interface JudgeRunnerLike {
  readonly semaphore?: {
    readonly active: number;
    readonly capacity: number;
  };
  runScenario(options: {
    runId: string;
    scenario: string;
  }): Promise<unknown>;
}
let judgeRunnerPromise: Promise<JudgeRunnerLike> | null = null;
let activeJudgeRunner: JudgeRunnerLike | null = null;

async function judgeScenario(options: {
  runId: string;
  scenario: ScenarioId;
  judgeConcurrency: number;
  judgeClient: JudgeClientOptions;
}): Promise<void> {
  judgeRunnerPromise ??= (async () => {
    const module = await import(
      pathToFileURL(resolve(RUNNER_DIR, "src", "judge", "run_judges.ts")).href
    ) as Record<string, unknown>;
    const create = module.createJudgeRunner as
      | ((options: Record<string, unknown>) => JudgeRunnerLike)
      | undefined;
    if (typeof create === "function") {
      return create({
        concurrency: options.judgeConcurrency,
        client: {
          model: options.judgeClient.model,
          baseUrl: options.judgeClient.baseUrl,
          effort: options.judgeClient.effort,
        },
      });
    }
    const run = (
      module.runJudgesForScenario
      ?? module.runScenarioJudges
      ?? module.runJudges
    ) as JudgeModuleFunction | undefined;
    if (typeof run !== "function") {
      throw new Error("Judge module exports no per-scenario runner.");
    }
    return {
      runScenario: async (scenarioOptions) => await run({
        ...scenarioOptions,
        concurrency: options.judgeConcurrency,
        client: {
          model: options.judgeClient.model,
          baseUrl: options.judgeClient.baseUrl,
          effort: options.judgeClient.effort,
        },
      }),
    };
  })();
  const runner = await judgeRunnerPromise;
  activeJudgeRunner = runner;
  await runner.runScenario({
    runId: options.runId,
    scenario: options.scenario,
  });
}

async function assembleScorecard(options: {
  runId: string;
  previous?: string;
}): Promise<void> {
  const module = await import(
    pathToFileURL(resolve(RUNNER_DIR, "src", "scorecard", "assemble.ts")).href
  ) as Record<string, unknown>;
  const candidate = (
    module.assembleScorecard
    ?? module.runScorecard
    ?? module.default
  ) as ((options: Record<string, unknown>) => Promise<unknown>) | undefined;
  if (typeof candidate !== "function") {
    throw new Error("Scorecard module exports no assembler.");
  }
  await candidate({
    runId: options.runId,
    run_id: options.runId,
    previousRunId: options.previous,
    axesDir: resolve(EVAL_SUITE_DIR, "axes-system"),
  });
}

async function prepareRun(options: {
  runId: string;
  sutThinking: SutThinkingLevel;
  sutThinkingSource: SuiteQueueOptions["sutThinkingSource"];
  fixtures: ScenarioFixture[];
  judgeClient: JudgeClientOptions;
}): Promise<{
  runDir: string;
  services: ServiceHandle[];
}> {
  for (const fixture of options.fixtures) {
    boardIdFor(options.runId, fixture.scenario);
  }
  const runDir = resolve(RUNS_DIR, options.runId);
  try {
    if ((await readdir(runDir)).length > 0) {
      throw new Error(`Run directory already contains artifacts: ${runDir}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const git = await gitFingerprint();
  await mkdir(runDir, { recursive: true });
  const services = await ensureEvalServices({
    runId: options.runId,
    runDir,
    sutThinking: options.sutThinking,
  });
  try {
    const references = await snapshotReferences({ repoRoot: REPO_ROOT, runDir });
    await writeFingerprint({
      runId: options.runId,
      sutThinking: options.sutThinking,
      sutThinkingSource: options.sutThinkingSource,
      runDir,
      judgeClient: options.judgeClient,
      services,
      references,
      git,
    });
  } catch (error) {
    await teardownServices(services);
    throw error;
  }
  return { runDir, services };
}

export async function runSuiteQueue(
  rawOptions: SuiteQueueOptions,
): Promise<SuiteQueueResult> {
  const runId = canonicalizeRunId(rawOptions.runId);
  const parallel = requirePositiveInteger(rawOptions.parallel, "parallel");
  const judgeConcurrency = requirePositiveInteger(
    rawOptions.judgeConcurrency,
    "judge concurrency",
  );
  if (rawOptions.fixtures.length === 0) throw new Error("No scenarios were selected.");
  judgeRunnerPromise = null;
  activeJudgeRunner = null;
  const { runDir, services } = await prepareRun({
    runId,
    sutThinking: rawOptions.sutThinking,
    sutThinkingSource: rawOptions.sutThinkingSource,
    fixtures: rawOptions.fixtures,
    judgeClient: rawOptions.judgeClient,
  });
  const progress = initialProgress(
    runId,
    rawOptions.sutThinking,
    rawOptions.fixtures,
  );
  const runtime = new Map<ScenarioId, ScenarioRuntimeStatus>(
    rawOptions.fixtures.map((fixture) => [
      fixture.scenario,
      {
        fixture,
        startedAt: null,
        finishedAt: null,
        completedStages: [],
        outcomes: {},
        axesDone: new Set(),
        judgeFlags: new Set(),
      },
    ]),
  );
  const emitStatus = (): void => {
    rawOptions.observer?.onStatus(buildQueueStatus({
      progress,
      fixtures: rawOptions.fixtures,
      runtime,
      services,
      judgeInFlight: activeJudgeRunner?.semaphore?.active ?? 0,
      judgeLimit: activeJudgeRunner?.semaphore?.capacity ?? judgeConcurrency,
    }));
  };
  const progressWriter = new ProgressWriter(
    resolve(runDir, "run_progress.json"),
    progress,
    emitStatus,
  );
  const judgeTasks: Promise<void>[] = [];
  let nextFixture = 0;
  let monitorTail = Promise.resolve();
  const refreshObservedArtifacts = (): Promise<void> => {
    monitorTail = monitorTail.then(async () => {
      const active = rawOptions.fixtures
        .map((fixture) => ({
          progress: progress.scenarios[fixture.scenario],
          runtime: runtime.get(fixture.scenario),
        }))
        .filter((entry): entry is {
          progress: RunProgress["scenarios"][ScenarioId];
          runtime: ScenarioRuntimeStatus;
        } =>
          entry.runtime !== undefined
          && (
            entry.progress.status === "building"
            || entry.progress.status === "sessions_done"
            || entry.progress.status === "judging"
          )
        );
      await Promise.all(
        active.map(({ runtime: scenarioRuntime }) =>
          refreshScenarioArtifacts({
            runId,
            runDir,
            runtime: scenarioRuntime,
          })
        ),
      );
      emitStatus();
    });
    return monitorTail;
  };
  const monitor = rawOptions.observer
    ? setInterval(() => {
      void refreshObservedArtifacts().catch(() => {});
    }, 1_000)
    : null;
  monitor?.unref?.();

  const worker = async (): Promise<void> => {
    while (true) {
      const fixtureIndex = nextFixture;
      nextFixture += 1;
      const fixture = rawOptions.fixtures[fixtureIndex];
      if (!fixture) return;
      const scenarioDir = resolve(runDir, fixture.scenario);
      const scenarioRuntime = runtime.get(fixture.scenario);
      if (!scenarioRuntime) {
        throw new Error(`Missing runtime status for ${fixture.scenario}.`);
      }
      const spawned = spawnScenarioChild({
        runId,
        scenario: fixture.scenario,
        scenarioDir,
      });
      scenarioRuntime.startedAt = new Date().toISOString();
      await progressWriter.update((current) => {
        const item = current.scenarios[fixture.scenario];
        item.status = "building";
        item.pid = spawned.child.pid ?? null;
      });

      let exitCode = 1;
      try {
        exitCode = (await spawned.completion).code;
      } catch {
        exitCode = 1;
      }
      let result: ScenarioResult | null = null;
      try {
        result = await readScenarioResult(
          resolve(scenarioDir, "scenario_result.json"),
          runId,
          fixture.scenario,
        );
      } catch {
        result = null;
      }
      if (result) {
        scenarioRuntime.completedStages = [...result.stages];
        scenarioRuntime.outcomes = { ...result.outcomes };
      }
      const stagesDone = (result?.stages ?? []).filter(
        (stage) => result?.outcomes[stage] !== "invalid-infra",
      ) as StageId[];
      const mergeOutcomes = (
        item: RunProgress["scenarios"][ScenarioId],
      ): void => {
        Object.assign(item, { outcomes: result?.outcomes ?? {} });
      };

      if (exitCode !== 0 && exitCode !== 2) {
        scenarioRuntime.finishedAt = new Date().toISOString();
        await progressWriter.update((current) => {
          const item = current.scenarios[fixture.scenario];
          mergeOutcomes(item);
          item.status = "failed";
          item.stages_done = stagesDone;
          item.finished_at = scenarioRuntime.finishedAt;
        });
        continue;
      }

      await progressWriter.update((current) => {
        const item = current.scenarios[fixture.scenario];
        mergeOutcomes(item);
        item.status = exitCode === 2 ? "invalid_infra" : "sessions_done";
        item.stages_done = stagesDone;
      });
      await progressWriter.update((current) => {
        current.scenarios[fixture.scenario].status = "judging";
      });
      const judgeTask = judgeScenario({
        runId,
        scenario: fixture.scenario,
        judgeConcurrency,
        judgeClient: rawOptions.judgeClient,
      }).then(
        async () => {
          await refreshScenarioArtifacts({
            runId,
            runDir,
            runtime: scenarioRuntime,
          });
          scenarioRuntime.finishedAt = new Date().toISOString();
          await progressWriter.update((current) => {
            const item = current.scenarios[fixture.scenario];
            item.status = exitCode === 2 ? "invalid_infra" : "graded";
            item.finished_at = scenarioRuntime.finishedAt;
          });
        },
        async () => {
          await refreshScenarioArtifacts({
            runId,
            runDir,
            runtime: scenarioRuntime,
          });
          scenarioRuntime.finishedAt = new Date().toISOString();
          await progressWriter.update((current) => {
            const item = current.scenarios[fixture.scenario];
            item.status = "failed";
            item.finished_at = scenarioRuntime.finishedAt;
          });
        },
      );
      judgeTasks.push(judgeTask);
    }
  };

  try {
    await progressWriter.update(() => {});
    await Promise.all(
      Array.from(
        { length: Math.min(parallel, rawOptions.fixtures.length) },
        () => worker(),
      ),
    );
    await Promise.all(judgeTasks);
    let assemblerFailed = false;
    try {
      await assembleScorecard({
        runId,
        previous: rawOptions.previous,
      });
    } catch {
      assemblerFailed = true;
    }
    await progressWriter.update((current) => {
      const scenarioFailed = Object.values(current.scenarios)
        .some((scenario) => scenario.status === "failed");
      current.status = scenarioFailed || assemblerFailed ? "failed" : "completed";
      current.finished_at = new Date().toISOString();
    });
    await progressWriter.settled();
  } catch (error) {
    await progressWriter.update((current) => {
      current.status = "failed";
      current.finished_at = new Date().toISOString();
    });
    throw error;
  } finally {
    if (monitor) clearInterval(monitor);
    await monitorTail;
    if (rawOptions.teardown) await teardownServices(services);
  }
  return { runId, progress, runDir };
}

export interface StubQueueEvent {
  scenario: ScenarioId;
  event: "start" | "exit" | "judge" | "graded";
}

export async function runStubQueue(
  fixtures: ScenarioFixture[],
  parallel: number,
  onEvent?: (event: StubQueueEvent) => void,
  observer?: SuiteQueueObserver,
): Promise<StubQueueEvent[]> {
  requirePositiveInteger(parallel, "parallel");
  if (fixtures.length === 0) return [];
  const events: StubQueueEvent[] = [];
  const emit = (event: StubQueueEvent): void => {
    events.push(event);
    onEvent?.(event);
  };
  const progress = initialProgress("2026-07-23-stub", "low", fixtures);
  const runtime = new Map<ScenarioId, ScenarioRuntimeStatus>(
    fixtures.map((fixture) => [
      fixture.scenario,
      {
        fixture,
        startedAt: null,
        finishedAt: null,
        completedStages: [],
        outcomes: {},
        axesDone: new Set(),
        judgeFlags: new Set(),
      },
    ]),
  );
  const services: ServiceHandle[] = [
    {
      name: "eval file API",
      spawned: false,
      pid: null,
      startedAt: null,
      healthCheckedAt: new Date().toISOString(),
      child: null,
    },
    {
      name: "eval harness",
      spawned: false,
      pid: null,
      startedAt: null,
      healthCheckedAt: new Date().toISOString(),
      child: null,
    },
  ];
  let judgeInFlight = 0;
  const publish = (): void => {
    observer?.onStatus(buildQueueStatus({
      progress,
      fixtures,
      runtime,
      services,
      judgeInFlight,
      judgeLimit: parallel,
    }));
  };
  publish();
  let next = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const fixture = fixtures[next];
      next += 1;
      if (!fixture) return;
      const scenarioRuntime = runtime.get(fixture.scenario);
      if (!scenarioRuntime) {
        throw new Error(`Missing stub runtime status for ${fixture.scenario}.`);
      }
      scenarioRuntime.startedAt = new Date().toISOString();
      progress.scenarios[fixture.scenario].status = "building";
      emit({ scenario: fixture.scenario, event: "start" });
      publish();
      for (let index = 0; index < fixture.stages.length; index += 1) {
        scenarioRuntime.completedStages = fixture.stages
          .slice(0, index)
          .map((stage) => stage.id);
        publish();
        await Bun.sleep(0);
      }
      scenarioRuntime.completedStages = fixture.stages.map((stage) => stage.id);
      progress.scenarios[fixture.scenario].stages_done = [
        ...scenarioRuntime.completedStages,
      ];
      progress.scenarios[fixture.scenario].status = "sessions_done";
      emit({ scenario: fixture.scenario, event: "exit" });
      publish();
      progress.scenarios[fixture.scenario].status = "judging";
      judgeInFlight += 1;
      emit({ scenario: fixture.scenario, event: "judge" });
      publish();
      for (const axis of AXIS_CODES) {
        scenarioRuntime.axesDone.add(axis);
        publish();
        await Bun.sleep(0);
      }
      judgeInFlight -= 1;
      scenarioRuntime.finishedAt = new Date().toISOString();
      progress.scenarios[fixture.scenario].status = "graded";
      progress.scenarios[fixture.scenario].finished_at =
        scenarioRuntime.finishedAt;
      emit({ scenario: fixture.scenario, event: "graded" });
      publish();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(parallel, fixtures.length) }, () => worker()),
  );
  progress.status = "completed";
  progress.finished_at = new Date().toISOString();
  publish();
  return events;
}
