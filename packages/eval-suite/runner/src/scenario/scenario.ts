import { isDeepStrictEqual } from "node:util";
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import { basename, resolve } from "node:path";

import type { InteractiveCanvasDocument } from "../../../../canvas/src/state/schema.ts";
import type { ScenarioId, StageId } from "../contract.ts";
import {
  CanvasFileClient,
  HarnessClient,
  HttpRequestError,
  applyProposalOperations,
  evalFileApiOrigin,
  evalHarnessOrigin,
  liveScopeObjectIds,
  materializeAcceptedProposal,
  proposalWouldDestroyContent,
  transcriptEndsOnRenderDraftStart,
  type SessionState,
  type SessionTranscript,
} from "./harness.ts";
import { writeCanvasSnapshot } from "./snapshot.ts";

export const REPO_ROOT = resolve(import.meta.dir, "../../../../..");
export const EVAL_SUITE_DIR = resolve(REPO_ROOT, "packages", "eval-suite");
export const RUNS_DIR = resolve(EVAL_SUITE_DIR, "runs");
export const SYSTEM_SCENARIOS_DIR = resolve(EVAL_SUITE_DIR, "scenarios-system");
export const EVAL_CANVASES_DIR = resolve(REPO_ROOT, "canvases", "evals");

const RUN_ID_PATTERN = /^(\d{4}-\d{2}-\d{2})-([A-Za-z0-9][A-Za-z0-9._-]*)$/;
const BOARD_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SYSTEM_SCENARIO_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export type StageOutcome =
  | "committed"
  | "rejected"
  | "invalid-infra"
  | "agent-abandon";

export interface ScenarioStage {
  id: StageId;
  title: string;
  instruction: string;
  scopeDescription: string | null;
}

export interface ScenarioFixture {
  tier: "system";
  scenario: ScenarioId;
  fixtureId: string;
  title: string;
  genre: string;
  complexity: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  board: { width: number; height: number };
  pollCapMinutes: number;
  declaredEditCount: number;
  sourcePath: string;
  stages: ScenarioStage[];
}

export interface StageTiming {
  started_at: string;
  finished_at: string;
  wall_ms: number;
  retries: number;
}

export interface ScenarioResult {
  run_id: string;
  tier: "system";
  scenario: ScenarioId;
  board_id: string;
  stages: StageId[];
  outcomes: Partial<Record<StageId, StageOutcome>>;
  timings: Partial<Record<StageId, StageTiming>>;
  session_ids: Partial<Record<StageId, string[]>>;
  finished_at: string;
  exit_code: 0 | 1 | 2;
  error?: string;
}

interface StageAttemptResult {
  outcome: StageOutcome;
  state: SessionState | null;
  sessionId: string | null;
  containerId: string | null;
  startedAt: string;
  finishedAt: string;
  wallMs: number;
  summary: string | null;
  opCount: number;
  reason: string | null;
  retryableInfra: boolean;
}

interface SystemScenarioEditConfig {
  title: string;
  instruction: string;
}

interface SystemScenarioConfig {
  complexity: 1 | 2 | 3 | 4 | 5;
  page: { width: number; height: number };
  edits: SystemScenarioEditConfig[];
  tags: string[];
}

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function parseSystemScenarioConfig(
  value: unknown,
  sourcePath: string,
): SystemScenarioConfig {
  const config = recordValue(value, sourcePath);
  const complexity = positiveInteger(config.complexity, `${sourcePath} complexity`);
  if (complexity > 5) {
    throw new Error(`${sourcePath} complexity must be from 1 to 5.`);
  }
  const page = recordValue(config.page, `${sourcePath} page`);
  const tagsValue = config.tags;
  if (!Array.isArray(tagsValue) || tagsValue.length === 0) {
    throw new Error(`${sourcePath} tags must be a non-empty array.`);
  }
  const tags = tagsValue.map((tag, index) => {
    const parsed = nonEmptyString(tag, `${sourcePath} tags[${index}]`);
    if (!/^[a-z][a-z0-9-]*$/.test(parsed)) {
      throw new Error(`${sourcePath} tag ${JSON.stringify(parsed)} must be lowercase kebab-case.`);
    }
    return parsed;
  });
  if (new Set(tags).size !== tags.length) {
    throw new Error(`${sourcePath} tags must be unique.`);
  }

  const editsValue = config.edits ?? [];
  if (!Array.isArray(editsValue)) {
    throw new Error(`${sourcePath} edits must be an array when present.`);
  }
  const edits = editsValue.map((edit, index) => {
    const parsed = recordValue(edit, `${sourcePath} edits[${index}]`);
    return {
      title: nonEmptyString(parsed.title, `${sourcePath} edits[${index}].title`),
      instruction: nonEmptyString(
        parsed.instruction,
        `${sourcePath} edits[${index}].instruction`,
      ),
    };
  });

  return {
    complexity: complexity as SystemScenarioConfig["complexity"],
    page: {
      width: positiveInteger(page.width, `${sourcePath} page.width`),
      height: positiveInteger(page.height, `${sourcePath} page.height`),
    },
    edits,
    tags,
  };
}

export function parseSystemScenario(
  name: string,
  brief: string,
  configValue: unknown,
  sourcePath = `<system-scenario:${name}>`,
): ScenarioFixture {
  if (!SYSTEM_SCENARIO_NAME_PATTERN.test(name)) {
    throw new Error(
      `System scenario name ${JSON.stringify(name)} must match ${SYSTEM_SCENARIO_NAME_PATTERN}.`,
    );
  }
  if (brief.trim() === "") {
    throw new Error(`${sourcePath}/brief.md must not be empty.`);
  }
  const configPath = resolve(sourcePath, "config.json");
  const config = parseSystemScenarioConfig(configValue, configPath);
  const title = brief.match(/^#\s+(.+)\s*$/m)?.[1]?.trim() ?? name;
  const edits: ScenarioStage[] = config.edits.map((edit, index) => ({
    id: `e${index + 1}` as StageId,
    title: edit.title,
    instruction: edit.instruction,
    scopeDescription: null,
  }));
  return {
    tier: "system",
    scenario: name,
    fixtureId: name,
    title,
    genre: config.tags.join(", "),
    complexity: config.complexity,
    tags: config.tags,
    board: config.page,
    pollCapMinutes: 15,
    declaredEditCount: edits.length,
    sourcePath: resolve(sourcePath, "brief.md"),
    stages: [
      {
        id: "stage0",
        title: "build",
        instruction: brief,
        scopeDescription: null,
      },
      ...edits,
    ],
  };
}

export async function discoverScenarios(
  scenariosDir = SYSTEM_SCENARIOS_DIR,
): Promise<ScenarioFixture[]> {
  const entries = (await readdir(scenariosDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (entries.length === 0) {
    throw new Error(`No system scenarios found in ${scenariosDir}.`);
  }
  return await Promise.all(entries.map(async (entry) => {
    const scenarioDir = resolve(scenariosDir, entry.name);
    const [brief, configSource] = await Promise.all([
      readFile(resolve(scenarioDir, "brief.md"), "utf8"),
      readFile(resolve(scenarioDir, "config.json"), "utf8"),
    ]);
    let config: unknown;
    try {
      config = JSON.parse(configSource);
    } catch (error) {
      throw new Error(
        `${resolve(scenarioDir, "config.json")} is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return parseSystemScenario(entry.name, brief, config, scenarioDir);
  }));
}

export function canonicalizeRunId(raw: string): string {
  const match = raw.match(RUN_ID_PATTERN);
  if (!match) {
    throw new Error("Run id must match <YYYY-MM-DD>-<label> using letters, numbers, ., _, or -.");
  }
  const timestamp = Date.parse(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== match[1]) {
    throw new Error(`Run id has an invalid date: ${match[1]}.`);
  }
  return `${match[1]}-${match[2].toLowerCase()}`;
}

export function normalizeScenarioId(raw: string): ScenarioId {
  const normalized = raw.trim().toLowerCase();
  if (!SYSTEM_SCENARIO_NAME_PATTERN.test(normalized)) {
    throw new Error(`Invalid scenario name: ${raw}`);
  }
  return normalized;
}

export function boardIdFor(runId: string, scenario: ScenarioId): string {
  const boardId = `eval.${canonicalizeRunId(runId)}.${scenario}`;
  if (!BOARD_ID_PATTERN.test(boardId)) {
    throw new Error(
      `Eval board id ${JSON.stringify(boardId)} must match ${BOARD_ID_PATTERN} and fit in 64 characters.`,
    );
  }
  return boardId;
}


export function createInitialDocument(
  fixture: ScenarioFixture,
  runId: string,
  canvasId: string,
): InteractiveCanvasDocument {
  const title = `${runId} · ${fixture.fixtureId}`;
  return {
    schemaVersion: 1,
    id: canvasId,
    title,
    mode: "diagram",
    viewport: { x: 0, y: 0, zoom: 1 },
    size: {
      width: fixture.board.width + 64,
      height: fixture.board.height + 64,
    },
    objects: [
      {
        id: "page-frame",
        type: "section",
        text: title,
        color: "white",
        parentId: null,
        geometry: {
          x: 32,
          y: 32,
          width: fixture.board.width,
          height: fixture.board.height,
        },
        style: { shape: "section" },
      },
    ],
    connections: [],
    annotations: [],
  };
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tempPath, path);
}

async function initializeBoard(options: {
  files: CanvasFileClient;
  fixture: ScenarioFixture;
  runId: string;
  canvasId: string;
  scenarioDir: string;
}): Promise<InteractiveCanvasDocument> {
  const document = createInitialDocument(options.fixture, options.runId, options.canvasId);
  await options.files.deleteCanvas(options.canvasId);
  await options.files.createCanvas(options.canvasId, document);
  const verified = await options.files.getCanvas(options.canvasId);
  if (!isDeepStrictEqual(verified, document)) {
    throw new Error("Created eval board did not match its stage-blank document.");
  }
  await writeFile(
    resolve(options.scenarioDir, "stage-blank.json"),
    `${JSON.stringify(verified, null, 2)}\n`,
  );
  return verified;
}

async function saveTranscript(
  harness: HarnessClient,
  containerId: string,
  transcriptsDir: string,
  stage: StageId,
  attempt: number,
): Promise<SessionTranscript> {
  let lastError: unknown;
  for (let fetchAttempt = 0; fetchAttempt < 6; fetchAttempt += 1) {
    try {
      const transcript = await harness.transcript(containerId);
      const serialized = `${JSON.stringify(transcript, null, 2)}\n`;
      await writeFile(
        resolve(transcriptsDir, `${stage}-attempt${attempt + 1}.json`),
        serialized,
      );
      await writeFile(resolve(transcriptsDir, `${stage}.json`), serialized);
      return transcript;
    } catch (error) {
      lastError = error;
      if (fetchAttempt < 5) await Bun.sleep(2_000);
    }
  }
  throw lastError;
}

function quoteMarkdown(value: string): string {
  return value.split(/\r?\n/).map((line) => `> ${line}`).join("\n");
}

async function appendSessionRecord(
  sessionsPath: string,
  options: {
    stage: StageId;
    attempt: number;
    sessionId: string | null;
    containerId: string | null;
    wallMs: number;
    opCount: number;
    outcome: string;
    retries: number;
    summary: string | null;
    reason: string | null;
  },
): Promise<void> {
  const lines = [
    `## ${options.stage} · attempt ${options.attempt + 1}`,
    "",
    `- sessionId: ${options.sessionId ?? "unavailable"}`,
    `- containerId: ${options.containerId ?? "unavailable"}`,
    `- wall time: ${(options.wallMs / 1_000).toFixed(1)}s`,
    `- op count: ${options.opCount}`,
    `- outcome: ${options.outcome}`,
    `- retries: ${options.retries}`,
    `- commit summary: ${options.summary?.replace(/\s+/g, " ").trim() ?? "(none)"}`,
  ];
  if (options.reason) lines.push(`- reason: ${options.reason}`);
  lines.push("", "Commit summary (verbatim):", "");
  lines.push(options.summary === null ? "> (none)" : quoteMarkdown(options.summary));
  lines.push("", "");
  await appendFile(sessionsPath, lines.join("\n"));
}

async function pollSession(options: {
  harness: HarnessClient;
  canvasId: string;
  sessionId: string;
  deadlineMs: number;
}): Promise<SessionState | null> {
  let state: SessionState | null = null;
  while (Date.now() < options.deadlineMs) {
    state = await options.harness.getSession(options.canvasId, options.sessionId);
    if (state.status !== "running") return state;
    await Bun.sleep(10_000);
  }
  return state;
}

async function runStageAttempt(options: {
  fixture: ScenarioFixture;
  stage: ScenarioStage;
  attempt: number;
  files: CanvasFileClient;
  harness: HarnessClient;
  canvasId: string;
  scenarioDir: string;
  transcriptsDir: string;
}): Promise<StageAttemptResult> {
  const startedMs = Date.now();
  const startedAt = new Date(startedMs).toISOString();
  let created: { sessionId: string; containerId: string } | null = null;
  let state: SessionState | null = null;
  let transcript: SessionTranscript | null = null;
  let proposalMaterialized = false;

  try {
    const live = await options.files.getCanvas(options.canvasId);
    created = await options.harness.createSession(
      options.canvasId,
      options.stage.instruction,
      liveScopeObjectIds(live),
    );
    state = await pollSession({
      harness: options.harness,
      canvasId: options.canvasId,
      sessionId: created.sessionId,
      deadlineMs: startedMs + options.fixture.pollCapMinutes * 60_000,
    });
    transcript = await saveTranscript(
      options.harness,
      created.containerId,
      options.transcriptsDir,
      options.stage.id,
      options.attempt,
    );
    const finishedMs = Date.now();
    const base = {
      state,
      sessionId: created.sessionId,
      containerId: created.containerId,
      startedAt,
      finishedAt: new Date(finishedMs).toISOString(),
      wallMs: finishedMs - startedMs,
    };

    if (!state || state.status === "running") {
      const stuckRender = transcriptEndsOnRenderDraftStart(transcript);
      return {
        ...base,
        outcome: "invalid-infra",
        summary: null,
        opCount: 0,
        reason: stuckRender
          ? "poll cap reached with the transcript ending on a render_draft start"
          : "poll cap reached while the session remained active",
        retryableInfra: stuckRender,
      };
    }

    if (state.status === "error") {
      return {
        ...base,
        outcome: "invalid-infra",
        summary: state.proposal?.summary ?? null,
        opCount: state.proposal?.operations.length ?? 0,
        reason: state.error ?? "the harness session ended in error",
        retryableInfra: true,
      };
    }

    if (state.status === "abandoned" && !state.proposal) {
      await writeCanvasSnapshot({
        files: options.files,
        canvasId: options.canvasId,
        scenarioDir: options.scenarioDir,
        stage: options.stage.id,
      });
      return {
        ...base,
        outcome: "agent-abandon",
        summary: null,
        opCount: 0,
        reason: state.error ?? "the agent produced no proposal",
        retryableInfra: false,
      };
    }

    if (state.status === "rejected") {
      const draftSvg = state.proposal
        ? await options.harness.draftSvg(options.canvasId, created.sessionId)
        : undefined;
      await writeCanvasSnapshot({
        files: options.files,
        canvasId: options.canvasId,
        scenarioDir: options.scenarioDir,
        stage: options.stage.id,
        svg: draftSvg,
      });
      return {
        ...base,
        outcome: "rejected",
        summary: state.proposal?.summary ?? null,
        opCount: state.proposal?.operations.length ?? 0,
        reason: "the session was already rejected",
        retryableInfra: false,
      };
    }

    if (!state.proposal) {
      return {
        ...base,
        outcome: "invalid-infra",
        summary: null,
        opCount: 0,
        reason: `terminal session ${state.status} retained no proposal`,
        retryableInfra: true,
      };
    }

    const proposed = applyProposalOperations(
      live,
      state.proposal.operations,
      state.proposal.summary,
    );
    const wreckReason = proposalWouldDestroyContent(live, proposed);
    if (wreckReason && state.status !== "accepted") {
      const draftSvg = await options.harness.draftSvg(options.canvasId, created.sessionId);
      await options.harness.rejectSession(options.canvasId, created.sessionId);
      await writeCanvasSnapshot({
        files: options.files,
        canvasId: options.canvasId,
        scenarioDir: options.scenarioDir,
        stage: options.stage.id,
        svg: draftSvg,
      });
      return {
        ...base,
        outcome: "rejected",
        summary: state.proposal.summary,
        opCount: state.proposal.operations.length,
        reason: wreckReason,
        retryableInfra: false,
      };
    }

    let acceptedOperations = state.proposal.operations;
    let summary = state.proposal.summary;
    let recoverAccepted409 = state.status === "accepted";
    if (state.status !== "accepted") {
      try {
        const accepted = await options.harness.acceptSession(
          options.canvasId,
          created.sessionId,
        );
        acceptedOperations = accepted.operations;
        summary = accepted.summary;
      } catch (error) {
        if (!(error instanceof HttpRequestError) || error.status !== 409) throw error;
        const recovered = await options.harness.getSession(
          options.canvasId,
          created.sessionId,
        );
        if (recovered.status !== "accepted" || !recovered.proposal) {
          throw new Error(`Accept conflict is not an accepted-session recovery: ${error.body}`);
        }
        acceptedOperations = recovered.proposal.operations;
        summary = recovered.proposal.summary;
        recoverAccepted409 = true;
      }
    }

    const current = await options.files.getCanvas(options.canvasId);
    const materialization = await materializeAcceptedProposal({
      files: options.files,
      canvasId: options.canvasId,
      live: current,
      prior: live,
      operations: acceptedOperations,
      summary,
      recoverAccepted409,
    });
    proposalMaterialized = true;
    await writeCanvasSnapshot({
      files: options.files,
      canvasId: options.canvasId,
      scenarioDir: options.scenarioDir,
      stage: options.stage.id,
    });
    return {
      ...base,
      outcome: "committed",
      summary,
      opCount: materialization.appliedOperationCount,
      reason: recoverAccepted409 ? "recovered an already accepted proposal" : null,
      retryableInfra: false,
    };
  } catch (error) {
    const finishedMs = Date.now();
    if (created && !transcript) {
      try {
        await saveTranscript(
          options.harness,
          created.containerId,
          options.transcriptsDir,
          options.stage.id,
          options.attempt,
        );
      } catch {
        // The session metadata below preserves that the infrastructure was unavailable.
      }
    }
    return {
      outcome: "invalid-infra",
      state,
      sessionId: created?.sessionId ?? null,
      containerId: created?.containerId ?? null,
      startedAt,
      finishedAt: new Date(finishedMs).toISOString(),
      wallMs: finishedMs - startedMs,
      summary: state?.proposal?.summary ?? null,
      opCount: state?.proposal?.operations.length ?? 0,
      reason: error instanceof Error ? error.message : String(error),
      retryableInfra: !proposalMaterialized,
    };
  }
}

async function persistScenarioResult(
  path: string,
  result: ScenarioResult,
): Promise<void> {
  result.finished_at = new Date().toISOString();
  await atomicWriteJson(path, result);
}

export async function runScenario(options: {
  runId: string;
  scenario: ScenarioId;
}): Promise<ScenarioResult> {
  const runId = canonicalizeRunId(options.runId);
  const fixtures = await discoverScenarios();
  const fixture = fixtures.find((candidate) => candidate.scenario === options.scenario);
  if (!fixture) throw new Error(`Fixture not found for ${options.scenario}.`);
  const canvasId = boardIdFor(runId, options.scenario);
  const scenarioDir = resolve(RUNS_DIR, runId, options.scenario);
  const transcriptsDir = resolve(scenarioDir, "transcripts");
  const resultPath = resolve(scenarioDir, "scenario_result.json");
  await mkdir(transcriptsDir, { recursive: true });
  const sessionsPath = resolve(scenarioDir, "sessions.md");
  await writeFile(
    sessionsPath,
    `# Sessions — ${runId} / ${options.scenario}\n\nBoard: \`${canvasId}\`\n\n`,
  );

  const result: ScenarioResult = {
    run_id: runId,
    tier: "system",
    scenario: options.scenario,
    board_id: canvasId,
    stages: [],
    outcomes: {},
    timings: {},
    session_ids: {},
    finished_at: new Date().toISOString(),
    exit_code: 1,
  };
  await persistScenarioResult(resultPath, result);

  // Origins arrive from the suite queue, which owns the run's ephemeral ports.
  const files = new CanvasFileClient(evalFileApiOrigin());
  const harness = new HarnessClient(evalHarnessOrigin());
  await initializeBoard({
    files,
    fixture,
    runId,
    canvasId,
    scenarioDir,
  });

  for (const stage of fixture.stages) {
    const stageStartedMs = Date.now();
    const sessionIds: string[] = [];
    let finalAttempt: StageAttemptResult | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const stageAttempt = await runStageAttempt({
        fixture,
        stage,
        attempt,
        files,
        harness,
        canvasId,
        scenarioDir,
        transcriptsDir,
      });
      finalAttempt = stageAttempt;
      if (stageAttempt.sessionId) sessionIds.push(stageAttempt.sessionId);
      const retrying = stageAttempt.outcome === "invalid-infra"
        && stageAttempt.retryableInfra
        && attempt === 0;
      await appendSessionRecord(sessionsPath, {
        stage: stage.id,
        attempt,
        sessionId: stageAttempt.sessionId,
        containerId: stageAttempt.containerId,
        wallMs: stageAttempt.wallMs,
        opCount: stageAttempt.opCount,
        outcome: retrying ? "invalid-infra (retrying)" : stageAttempt.outcome,
        retries: attempt,
        summary: stageAttempt.summary,
        reason: stageAttempt.reason,
      });
      if (!retrying) break;
    }
    if (!finalAttempt) throw new Error(`No attempt result was recorded for ${stage.id}.`);
    result.stages.push(stage.id);
    result.outcomes[stage.id] = finalAttempt.outcome;
    result.session_ids[stage.id] = sessionIds;
    result.timings[stage.id] = {
      started_at: new Date(stageStartedMs).toISOString(),
      finished_at: finalAttempt.finishedAt,
      wall_ms: Date.now() - stageStartedMs,
      retries: Math.max(0, sessionIds.length - 1),
    };
    await persistScenarioResult(resultPath, result);
    if (finalAttempt.outcome === "invalid-infra") {
      result.exit_code = 2;
      await persistScenarioResult(resultPath, result);
      return result;
    }
  }

  result.exit_code = 0;
  await persistScenarioResult(resultPath, result);
  return result;
}

function parseCliArgs(argv: string[]): {
  runId: string;
  scenario: ScenarioId;
} {
  let runId: string | undefined;
  let rawScenario: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--run-id" && value) {
      runId = canonicalizeRunId(value);
      index += 1;
    } else if (flag === "--scenario" && value) {
      rawScenario = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete scenario argument: ${flag}`);
    }
  }
  if (!runId || !rawScenario) {
    throw new Error(
      "Usage: bun src/scenario/scenario.ts --run-id <id> --scenario <name>",
    );
  }
  return { runId, scenario: normalizeScenarioId(rawScenario) };
}

async function writeCrashResult(
  rawArgs: string[],
  error: unknown,
): Promise<void> {
  const runIndex = rawArgs.indexOf("--run-id");
  const scenarioIndex = rawArgs.indexOf("--scenario");
  if (runIndex < 0 || scenarioIndex < 0) return;
  try {
    const runId = canonicalizeRunId(rawArgs[runIndex + 1] ?? "");
    const scenario = normalizeScenarioId(rawArgs[scenarioIndex + 1] ?? "");
    const scenarioDir = resolve(RUNS_DIR, runId, scenario);
    await mkdir(scenarioDir, { recursive: true });
    const result: ScenarioResult = {
      run_id: runId,
      tier: "system",
      scenario,
      board_id: boardIdFor(runId, scenario),
      stages: [],
      outcomes: {},
      timings: {},
      session_ids: {},
      finished_at: new Date().toISOString(),
      exit_code: 1,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    };
    const existingPath = resolve(scenarioDir, "scenario_result.json");
    try {
      const existing = JSON.parse(await readFile(existingPath, "utf8")) as ScenarioResult;
      Object.assign(result, existing, {
        exit_code: 1,
        error: result.error,
        finished_at: result.finished_at,
      });
    } catch {
      // There is no partial result to merge.
    }
    await persistScenarioResult(existingPath, result);
  } catch {
    // Argument validation failed before a safe run directory could be resolved.
  }
}

if (import.meta.main) {
  const rawArgs = process.argv.slice(2);
  try {
    const args = parseCliArgs(rawArgs);
    const result = await runScenario(args);
    process.exitCode = result.exit_code;
  } catch (error) {
    await writeCrashResult(rawArgs, error);
    console.error(
      `scenario child failed (${basename(import.meta.path)}):`,
      error instanceof Error ? error.stack ?? error.message : error,
    );
    process.exitCode = 1;
  }
}
