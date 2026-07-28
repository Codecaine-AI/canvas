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
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { relative, resolve } from "node:path";
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
  ToolCallCap,
  ToolCallCapSource,
} from "../contract.ts";
import { AXIS_CODES } from "../contract.ts";
import {
  EVAL_FILE_API_ORIGIN_ENV,
  EVAL_HARNESS_ORIGIN_ENV,
} from "./harness.ts";
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
const LAYOUT_EDITOR_DIR = resolve(
  REPO_ROOT,
  "packages",
  "canvas-agent",
  "src",
  "catalog",
  "layout-editor",
);

type ServiceName = "eval file API" | "eval harness";

interface ServiceHandle {
  name: ServiceName;
  spawned: boolean;
  pid: number | null;
  port: number | null;
  origin: string | null;
  logPath: string | null;
  startedAt: string | null;
  healthCheckedAt: string;
  child: ChildProcess | null;
}

/** The per-run service pair, addressed by origin rather than by fixed port. */
interface EvalServices {
  handles: ServiceHandle[];
  fileApiOrigin: string;
  harnessOrigin: string;
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
  toolCallCap: ToolCallCap;
  toolCallCapSource: ToolCallCapSource;
  fixtures: ScenarioFixture[];
  parallel: number;
  judgeConcurrency: number;
  previous?: string;
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

/**
 * Reserve a loopback port by binding :0 and reading back the kernel's pick.
 *
 * Ports are chosen per run, which is what makes the service pair ephemeral: a
 * run can never attach to a service left behind by an earlier run (a stale
 * reused harness once served a three-day-old tool surface into a live eval),
 * and two suite runs can execute concurrently without colliding on a port.
 *
 * The bind is released before the service starts, so the reservation is
 * advisory — if something grabs the port in between, the service simply fails
 * its health check and the run aborts. That is the intended failure mode:
 * never adopt a listener this run did not spawn.
 */
export async function pickEphemeralPort(): Promise<number> {
  return await new Promise<number>((resolvePort, rejectPort) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", rejectPort);
    probe.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = probe.address();
      if (address === null || typeof address === "string") {
        probe.close(() => rejectPort(new Error("Could not read an ephemeral port.")));
        return;
      }
      const { port } = address;
      probe.close((error) => (error ? rejectPort(error) : resolvePort(port)));
    });
  });
}

export function loopbackOrigin(port: number): string {
  return `http://127.0.0.1:${port}`;
}

async function fileApiHealthy(origin: string): Promise<boolean> {
  try {
    const response = await fetch(`${origin}/health`, {
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

async function harnessHealthy(origin: string): Promise<boolean> {
  try {
    const response = await fetch(`${origin}/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return false;
    const payload = await response.json() as { status?: string; kernel?: string };
    return payload.status === "ok" && payload.kernel === "canvas-agent";
  } catch {
    return false;
  }
}

async function serviceHealthy(handle: ServiceHandle): Promise<boolean> {
  if (!handle.origin) return false;
  return handle.name === "eval harness"
    ? await harnessHealthy(handle.origin)
    : await fileApiHealthy(handle.origin);
}

function spawnService(options: {
  name: ServiceName;
  entryPath: string;
  logPath: string;
  port: number;
  env: NodeJS.ProcessEnv;
}): ServiceHandle {
  const logFd = openSync(options.logPath, "a");
  const startedAt = new Date().toISOString();
  // Detached so the whole service process group can be signalled at teardown.
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
    port: options.port,
    origin: loopbackOrigin(options.port),
    logPath: options.logPath,
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

/**
 * Start one service for this run. There is no reuse branch by design: the
 * suite always owns its services, so a healthy listener is never adopted.
 */
async function startService(options: {
  name: ServiceName;
  entryPath: string;
  servicesDir: string;
  logName: string;
  port: number;
  env: NodeJS.ProcessEnv;
  check: (origin: string) => Promise<boolean>;
}): Promise<ServiceHandle> {
  const origin = loopbackOrigin(options.port);
  const handle = spawnService({
    name: options.name,
    entryPath: options.entryPath,
    logPath: resolve(options.servicesDir, options.logName),
    port: options.port,
    env: options.env,
  });
  try {
    await waitForHealthy({ handle, check: () => options.check(origin) });
  } catch (error) {
    await teardownServices([handle]);
    throw error;
  }
  if (!handle.pid || !handle.startedAt) {
    await teardownServices([handle]);
    throw new Error(`${options.name} spawned without process identity.`);
  }
  process.stdout.write(
    `${options.name} listening on ${origin} (pid ${handle.pid}; ephemeral, stopped at run end).\n`,
  );
  return handle;
}

/** Spawn the run's own file API + harness. One pair serves every scenario. */
export function toolCallCapOverrideEnv(
  toolCallCap: ToolCallCap,
  toolCallCapSource: ToolCallCapSource,
): Record<string, string> {
  return toolCallCapSource === "--tool-call-cap"
    ? { CANVAS_AGENT_TOOL_CALL_CAP: String(toolCallCap) }
    : {};
}

async function startEvalServices(options: {
  runDir: string;
  sutThinking: SutThinkingLevel;
  toolCallCap: ToolCallCap;
  toolCallCapSource: ToolCallCapSource;
}): Promise<EvalServices> {
  provisionHarnessExemplar();
  const servicesDir = resolve(options.runDir, "services");
  await mkdir(servicesDir, { recursive: true });
  const handles: ServiceHandle[] = [];
  try {
    const fileApiPort = await pickEphemeralPort();
    handles.push(await startService({
      name: "eval file API",
      entryPath: EVAL_FILE_API_PATH,
      servicesDir,
      logName: "file-api.log",
      port: fileApiPort,
      env: { EVAL_FILE_API_PORT: String(fileApiPort) },
      check: fileApiHealthy,
    }));
    const harnessPort = await pickEphemeralPort();
    handles.push(await startService({
      name: "eval harness",
      entryPath: HARNESS_SERVER_PATH,
      servicesDir,
      logName: "harness.log",
      port: harnessPort,
      env: {
        CANVAS_AGENT_CANVASES_DIR: EVAL_CANVASES_DIR,
        CANVAS_AGENT_PORT: String(harnessPort),
        CANVAS_AGENT_THINKING: options.sutThinking,
        ...toolCallCapOverrideEnv(
          options.toolCallCap,
          options.toolCallCapSource,
        ),
      },
      check: harnessHealthy,
    }));
    return {
      handles,
      fileApiOrigin: loopbackOrigin(fileApiPort),
      harnessOrigin: loopbackOrigin(harnessPort),
    };
  } catch (error) {
    await teardownServices(handles);
    throw error;
  }
}

function signalService(handle: ServiceHandle, signal: NodeJS.Signals): void {
  if (!handle.spawned || !handle.pid) return;
  try {
    // The service leads its own process group (spawned detached).
    process.kill(-handle.pid, signal);
  } catch {
    try {
      process.kill(handle.pid, signal);
    } catch {
      // Already gone.
    }
  }
}

async function waitForServicesDown(
  handles: ServiceHandle[],
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await Promise.all(handles.map(serviceHealthy))).some(Boolean)) {
      return true;
    }
    await Bun.sleep(250);
  }
  return !(await Promise.all(handles.map(serviceHealthy))).some(Boolean);
}

/**
 * Stop every service this run spawned. Always called — on success, on failure,
 * and from the run's `finally` — so it reports a survivor on stderr instead of
 * throwing over whatever outcome the run already has. A survivor cannot poison
 * a later run: ports are ephemeral, so nothing will ever connect to it again.
 */
async function teardownServices(handles: ServiceHandle[]): Promise<void> {
  const spawned = handles.filter((handle) => handle.spawned && handle.pid);
  if (spawned.length === 0) return;
  for (const handle of spawned) signalService(handle, "SIGTERM");
  if (await waitForServicesDown(spawned, 10_000)) return;
  for (const handle of spawned) signalService(handle, "SIGKILL");
  if (await waitForServicesDown(spawned, 5_000)) return;
  const stuck = spawned
    .map((handle) => `${handle.name} (pid ${handle.pid}, ${handle.origin})`)
    .join(", ");
  process.stderr.write(`eval services did not stop: ${stuck}.\n`);
}

/**
 * Signal-path teardown: handlers cannot await, so fire SIGTERM at each service
 * group synchronously and let the services' own SIGTERM handlers close down.
 */
function teardownServicesSync(handles: ServiceHandle[]): void {
  for (const handle of handles) signalService(handle, "SIGTERM");
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

export interface FileFingerprint {
  hash: string;
  files: string[];
}

/**
 * The SUT source hashes. Computed once per run and shared by the audit record
 * written at service spawn (services/identity.json) and by fingerprint.md, so
 * both describe exactly the same tree.
 */
export interface SourceFingerprints {
  prompt: FileFingerprint;
  lints: FileFingerprint;
  styles: FileFingerprint;
  surface: FileFingerprint;
}

async function collectSourceFingerprints(): Promise<SourceFingerprints> {
  const [prompt, lints, styles, surface] = await Promise.all([
    hashFiles([
      resolve(LAYOUT_EDITOR_DIR, "prompt", "prompt.json"),
      resolve(LAYOUT_EDITOR_DIR, "prompt", "system.md"),
    ]),
    hashFiles([
      resolve(REPO_ROOT, "packages", "canvas-agent", "src", "board", "lints"),
    ]),
    hashFiles([resolve(LAYOUT_EDITOR_DIR, "context", "style-guide")]),
    hashFiles([
      resolve(REPO_ROOT, "packages", "canvas-agent", "src", "service", "session"),
      resolve(LAYOUT_EDITOR_DIR, "context", "capabilities"),
      resolve(LAYOUT_EDITOR_DIR, "tools"),
    ]),
  ]);
  return { prompt, lints, styles, surface };
}

export interface ServiceIdentityInput {
  name: string;
  pid: number | null;
  port: number | null;
  origin: string | null;
  startedAt: string | null;
  healthCheckedAt: string;
  logPath: string | null;
}

export interface ServiceIdentity {
  run_id: string;
  written_at: string;
  git: { revision: string; dirty: boolean };
  hashes: { prompt: string; lint: string; style: string; surface: string };
  services: Array<{
    name: string;
    pid: number | null;
    port: number | null;
    origin: string | null;
    started_at: string | null;
    health_checked_at: string;
    log: string | null;
  }>;
}

/**
 * Identity is recorded for audit, never for reuse: nothing reads this file back
 * to decide whether to adopt a service. It exists so a finished run can be
 * tied to the exact processes and source tree that produced it.
 */
export function buildServiceIdentity(options: {
  runId: string;
  git: { revision: string; dirty: boolean };
  fingerprints: SourceFingerprints;
  services: ServiceIdentityInput[];
  now?: Date;
}): ServiceIdentity {
  return {
    run_id: options.runId,
    written_at: (options.now ?? new Date()).toISOString(),
    git: { ...options.git },
    hashes: {
      prompt: options.fingerprints.prompt.hash,
      lint: options.fingerprints.lints.hash,
      style: options.fingerprints.styles.hash,
      surface: options.fingerprints.surface.hash,
    },
    services: options.services.map((service) => ({
      name: service.name,
      pid: service.pid,
      port: service.port,
      origin: service.origin,
      started_at: service.startedAt,
      health_checked_at: service.healthCheckedAt,
      log: service.logPath === null ? null : relative(REPO_ROOT, service.logPath),
    })),
  };
}

export async function writeServiceIdentity(options: {
  servicesDir: string;
  identity: ServiceIdentity;
}): Promise<string> {
  await mkdir(options.servicesDir, { recursive: true });
  const path = resolve(options.servicesDir, "identity.json");
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(options.identity, null, 2)}\n`);
  await rename(tempPath, path);
  return path;
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
  toolCallCap: ToolCallCap;
  toolCallCapSource: ToolCallCapSource;
  runDir: string;
  judgeClient: JudgeClientOptions;
  services: ServiceHandle[];
  git: { revision: string; dirty: boolean };
  fingerprints: SourceFingerprints;
}): Promise<void> {
  const agentConfigPath = resolve(LAYOUT_EDITOR_DIR, "agent.json");
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
  const { prompt, lints, styles, surface } = options.fingerprints;
  const harness = options.services.find((service) => service.name === "eval harness");
  const fileApi = options.services.find((service) => service.name === "eval file API");
  const lines = [
    `# Eval-suite fingerprint — ${options.runId}`,
    "",
    `- run id: \`${options.runId}\``,
    "- tier: `system`",
    `- git: \`${options.git.revision}${options.git.dirty ? "+dirty" : ""}\``,
    `- SUT agent config: model \`${resolvedModel}\` @ \`${options.sutThinking}\` (${options.sutThinkingSource}; agent.json \`${agentConfig.thinking ?? "unknown"}\`), max turns \`${agentConfig.maxTurns ?? "unknown"}\``,
    `- tool-call cap: ${options.toolCallCap} (${options.toolCallCapSource})`,
    `- prompt hash: \`${prompt.hash}\``,
    `- lint hash: \`${lints.hash}\``,
    `- style hash: \`${styles.hash}\``,
    `- surface hash: \`${surface.hash}\``,
    `- judge client: model \`${options.judgeClient.model}\`, effort \`${options.judgeClient.effort}\`, base URL \`${options.judgeClient.baseUrl}\``,
    "- snapshot fonts: bundled Inter + system fallback (Helvetica default/sans-serif)",
    `- harness start time: ${harness?.startedAt ?? "unknown"} (ephemeral, spawned for this run and stopped at run end)`,
    `- eval services: harness \`${harness?.origin ?? "unknown"}\` pid \`${harness?.pid ?? "unknown"}\`, file API \`${fileApi?.origin ?? "unknown"}\` pid \`${fileApi?.pid ?? "unknown"}\` (see \`services/identity.json\`)`,
    `- eval canvas directory: \`${relative(REPO_ROOT, EVAL_CANVASES_DIR)}\``,
    "",
    markdownFileList("Prompt files", prompt.files),
    "",
    markdownFileList("Active lint files", lints.files),
    "",
    markdownFileList("Active style files", styles.files),
    "",
    markdownFileList("Active tool-surface files", surface.files),
    "",
  ];
  await writeFile(resolve(options.runDir, "fingerprint.md"), lines.join("\n"));
}

function initialProgress(
  runId: string,
  sutThinking: SutThinkingLevel,
  toolCallCap: ToolCallCap,
  toolCallCapSource: ToolCallCapSource,
  fixtures: ScenarioFixture[],
): RunProgress {
  return {
    run_id: runId,
    tier: "system",
    sut_thinking: sutThinking,
    tool_call_cap: toolCallCap,
    tool_call_cap_source: toolCallCapSource,
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
  env: NodeJS.ProcessEnv;
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
      env: options.env,
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
  toolCallCap: ToolCallCap;
  toolCallCapSource: ToolCallCapSource;
  fixtures: ScenarioFixture[];
  judgeClient: JudgeClientOptions;
}): Promise<{
  runDir: string;
  services: EvalServices;
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
  const [git, fingerprints] = await Promise.all([
    gitFingerprint(),
    collectSourceFingerprints(),
  ]);
  await mkdir(runDir, { recursive: true });
  const services = await startEvalServices({
    runDir,
    sutThinking: options.sutThinking,
    toolCallCap: options.toolCallCap,
    toolCallCapSource: options.toolCallCapSource,
  });
  try {
    await writeServiceIdentity({
      servicesDir: resolve(runDir, "services"),
      identity: buildServiceIdentity({
        runId: options.runId,
        git,
        fingerprints,
        services: services.handles,
      }),
    });
    await writeFingerprint({
      runId: options.runId,
      sutThinking: options.sutThinking,
      sutThinkingSource: options.sutThinkingSource,
      toolCallCap: options.toolCallCap,
      toolCallCapSource: options.toolCallCapSource,
      runDir,
      judgeClient: options.judgeClient,
      services: services.handles,
      git,
      fingerprints,
    });
  } catch (error) {
    await teardownServices(services.handles);
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
    toolCallCap: rawOptions.toolCallCap,
    toolCallCapSource: rawOptions.toolCallCapSource,
    fixtures: rawOptions.fixtures,
    judgeClient: rawOptions.judgeClient,
  });
  // Scenario children learn where this run's services listen; the ports are
  // ephemeral, so nothing may assume a fixed origin.
  const scenarioEnv: NodeJS.ProcessEnv = {
    ...process.env,
    [EVAL_FILE_API_ORIGIN_ENV]: services.fileApiOrigin,
    [EVAL_HARNESS_ORIGIN_ENV]: services.harnessOrigin,
  };
  // The status display re-raises SIGINT after painting its final frame, which
  // kills this process before the finally block runs — so the signal path gets
  // its own synchronous teardown, registered ahead of that handler.
  const interruptTeardown = (): void => {
    teardownServicesSync(services.handles);
  };
  process.prependOnceListener("SIGINT", interruptTeardown);
  process.prependOnceListener("SIGTERM", interruptTeardown);
  const progress = initialProgress(
    runId,
    rawOptions.sutThinking,
    rawOptions.toolCallCap,
    rawOptions.toolCallCapSource,
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
      services: services.handles,
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
        env: scenarioEnv,
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
    process.off("SIGINT", interruptTeardown);
    process.off("SIGTERM", interruptTeardown);
    // The services belong to this run and never outlive it.
    await teardownServices(services.handles);
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
  const progress = initialProgress(
    "2026-07-23-stub",
    "low",
    3,
    "agent default",
    fixtures,
  );
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
  // Dry runs never touch a service; these placeholders only feed the display.
  const services: ServiceHandle[] = (
    ["eval file API", "eval harness"] as const
  ).map((name) => ({
    name,
    spawned: false,
    pid: null,
    port: null,
    origin: null,
    logPath: null,
    startedAt: null,
    healthCheckedAt: new Date().toISOString(),
    child: null,
  }));
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
