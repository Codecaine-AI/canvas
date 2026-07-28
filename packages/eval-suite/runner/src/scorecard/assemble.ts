import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  AnyJudgeEnvelope,
  ToolCallCap,
  ToolCallCapSource,
} from "../contract.ts";

const DEFAULT_EVAL_SUITE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const DEFAULT_AXES_DIR = join(DEFAULT_EVAL_SUITE_DIR, "axes-system");
const RUN_SUPPORT_DIRECTORIES = new Set(["refs", "services"]);

type JsonRecord = Record<string, unknown>;

interface AxisDefinition {
  code: string;
  order: number;
  file: string;
}

type JudgeEnvelope = Pick<AnyJudgeEnvelope, "score" | "flags"> & {
  verdict?: unknown;
};

interface PreviousScorecard {
  axes: string[];
  scores: Map<string, Map<string, number | null>>;
}

interface SessionCounts {
  ok: number;
  rejected: number;
  abandoned: number;
  invalidInfra: number;
}

export interface FingerprintSummary {
  line: string;
  repo: string;
  model: string;
  prompt: string;
  lints: string;
  styles: string;
  /** Absent when reading a fingerprint.md written before the surface hash existed. */
  surface?: string;
  /** Absent when reading a fingerprint.md written before tool-call caps existed. */
  toolCallCap?: ToolCallCap;
  toolCallCapSource?: ToolCallCapSource;
}

interface ProgressSummary {
  runId: string;
  status: string;
  sessions: SessionCounts;
  scenarioRecords: Map<string, JsonRecord>;
}

interface ScenarioDefinition {
  id: string;
  label: string;
}

interface ScenarioAssembly {
  id: string;
  label: string;
  status: string;
  scores: Record<string, number | null>;
  deltas: Record<string, number | null>;
  flags: string[];
}

interface Movement {
  scenario: string;
  axis: string;
  previous: number;
  current: number;
  delta: number;
  evidence: string;
}

interface LockstepPair {
  axes: [string, string];
  count: number;
  scenarios: string[];
}

export interface AssembleScorecardOptions {
  runId: string;
  previousRunId?: string;
  previous?: string;
  runsDir?: string;
  axesDir?: string;
}

export interface ScorecardJson {
  schema_version: 1;
  run_id: string;
  status: string;
  fingerprint: Omit<
    FingerprintSummary,
    "line" | "toolCallCap" | "toolCallCapSource"
  > & {
    tool_call_cap?: ToolCallCap;
    tool_call_cap_source?: ToolCallCapSource;
  };
  previous_run: {
    run_id: string | null;
    available: boolean;
    comparable: boolean;
    axis_set_changed: boolean;
    axes: string[];
  };
  sessions: SessionCounts;
  axes: Array<{ code: string; order: number }>;
  scenarios: ScenarioAssembly[];
  means: {
    scores: Record<string, number | null>;
    deltas: Record<string, number | null>;
    flags: string[];
  };
  movements: Movement[];
  axis_correlation: {
    threshold: 6;
    denominator: 8;
    lockstep_pairs: LockstepPair[];
  };
}

export interface ScorecardResult {
  markdown: string;
  json: ScorecardJson;
  markdownPath: string;
  jsonPath: string;
}

export async function assembleScorecard(
  options: AssembleScorecardOptions,
): Promise<ScorecardResult> {
  const runId = requireRunId(options.runId);
  const runsDir = resolve(options.runsDir ?? join(DEFAULT_EVAL_SUITE_DIR, "runs"));
  const runDir = join(runsDir, runId);
  const axesDir = resolve(options.axesDir ?? DEFAULT_AXES_DIR);
  const axes = await readAxes(axesDir);
  const progress = await readProgress(join(runDir, "run_progress.json"), runId);
  const scenarios = await readScenarios(runDir, progress);
  const fingerprint = await readFingerprint(join(runDir, "fingerprint.md"));
  const requestedPreviousRunId = options.previousRunId ?? options.previous;
  const selectedPreviousRunId =
    requestedPreviousRunId === undefined
      ? await findPreviousRunId(runsDir, runId)
      : requireRunId(requestedPreviousRunId);
  const previous = selectedPreviousRunId
    ? await readPreviousIfPresent(runsDir, selectedPreviousRunId)
    : null;
  const currentAxisCodes = axes.map((axis) => axis.code);
  const axisSetChanged =
    previous !== null && !sameAxisSet(currentAxisCodes, previous.axes);
  const comparable = previous !== null && !axisSetChanged;

  const judges = new Map<string, Map<string, JudgeEnvelope | null>>();
  for (const scenario of scenarios) {
    const scenarioJudges = new Map<string, JudgeEnvelope | null>();
    for (const axis of axes) {
      const judgePath = join(
        runDir,
        scenario.id,
        `judge-${axis.code.toLowerCase()}.json`,
      );
      scenarioJudges.set(
        axis.code,
        await readJudgeIfPresent(judgePath, {
          runId,
          scenario: scenario.id,
          axis: axis.code,
        }),
      );
    }
    judges.set(scenario.id, scenarioJudges);
  }

  const scenarioRows: ScenarioAssembly[] = scenarios.map((scenario) => {
    const progressRecord = progress.scenarioRecords.get(scenario.id);
    const status = stringValue(progressRecord?.status) ?? "missing";
    const flags = collectScenarioFlags(
      scenario.id,
      status,
      progressRecord,
      judges.get(scenario.id),
      axes,
    );
    const scores: Record<string, number | null> = {};
    const deltas: Record<string, number | null> = {};

    for (const axis of axes) {
      const score =
        status === "invalid_infra"
          ? null
          : judges.get(scenario.id)?.get(axis.code)?.score ?? null;
      scores[axis.code] = score;
      deltas[axis.code] = comparable
        ? scoreDelta(
            score,
            previous?.scores.get(scenario.id)?.get(axis.code) ?? null,
          )
        : null;
    }

    return {
      id: scenario.id,
      label: scenario.label,
      status,
      scores,
      deltas,
      flags,
    };
  });

  const movements = collectMovements(
    scenarioRows,
    axes,
    judges,
    previous,
    comparable,
  );
  const lockstepPairs = comparable
    ? findLockstepPairs(scenarioRows, currentAxisCodes)
    : [];
  const scoreMeans = Object.fromEntries(
    axes.map((axis) => [
      axis.code,
      mean(scenarioRows.map((row) => row.scores[axis.code])),
    ]),
  );
  const deltaMeans = Object.fromEntries(
    axes.map((axis) => [
      axis.code,
      comparable
        ? mean(scenarioRows.map((row) => row.deltas[axis.code]))
        : null,
    ]),
  );
  const meanFlags = scenarioRows.some(
    (row) =>
      row.status !== "graded" ||
      axes.some((axis) => {
        const judge = judges.get(row.id)?.get(axis.code);
        return judge === null || judge === undefined ||
          judge.flags.some(isErrorFlag);
      }),
  )
      ? ["PARTIAL"]
      : [];

  const json: ScorecardJson = {
    schema_version: 1,
    run_id: runId,
    status: progress.status,
    fingerprint: {
      repo: fingerprint.repo,
      model: fingerprint.model,
      prompt: fingerprint.prompt,
      lints: fingerprint.lints,
      styles: fingerprint.styles,
      ...(fingerprint.surface === undefined
        ? {}
        : { surface: fingerprint.surface }),
      ...(fingerprint.toolCallCap === undefined
        ? {}
        : {
            tool_call_cap: fingerprint.toolCallCap,
            tool_call_cap_source: fingerprint.toolCallCapSource,
          }),
    },
    previous_run: {
      run_id: selectedPreviousRunId ?? null,
      available: previous !== null,
      comparable,
      axis_set_changed: axisSetChanged,
      axes: previous?.axes ?? [],
    },
    sessions: progress.sessions,
    axes: axes.map(({ code, order }) => ({ code, order })),
    scenarios: scenarioRows,
    means: {
      scores: scoreMeans,
      deltas: deltaMeans,
      flags: meanFlags,
    },
    movements,
    axis_correlation: {
      threshold: 6,
      denominator: 8,
      lockstep_pairs: lockstepPairs,
    },
  };

  const markdown = renderMarkdown({
    runId,
    axes,
    fingerprint,
    progress,
    selectedPreviousRunId,
    previous,
    axisSetChanged,
    comparable,
    scenarioRows,
    scoreMeans,
    deltaMeans,
    meanFlags,
    movements,
    lockstepPairs,
  });
  const markdownPath = join(runDir, "scorecard.md");
  const jsonPath = join(runDir, "scorecard.json");
  await writeAtomic(markdownPath, markdown);
  await writeAtomic(jsonPath, `${JSON.stringify(json, null, 2)}\n`);

  return { markdown, json, markdownPath, jsonPath };
}

async function readScenarios(
  runDir: string,
  progress: ProgressSummary,
): Promise<ScenarioDefinition[]> {
  const scenarioIds = new Set(progress.scenarioRecords.keys());
  const entries = await readdir(runDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && !RUN_SUPPORT_DIRECTORIES.has(entry.name)) {
      scenarioIds.add(entry.name);
    }
  }

  return [...scenarioIds]
    .sort(compareScenarioIds)
    .map((id) => ({ id, label: id }));
}

function compareScenarioIds(left: string, right: string): number {
  return left.localeCompare(right, "en", { numeric: true });
}

async function readAxes(axesDir: string): Promise<AxisDefinition[]> {
  const entries = await readdir(axesDir, { withFileTypes: true });
  const axes: AxisDefinition[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }
    const markdown = await readFile(join(axesDir, entry.name), "utf8");
    const code = markdown.match(/^- code:\s*([A-Za-z0-9_-]+)\s*$/m)?.[1];
    const orderText = markdown.match(/^- scorecard-order:\s*(\d+)\s*$/m)?.[1];
    if (code === undefined || orderText === undefined) {
      continue;
    }
    axes.push({
      code: code.toUpperCase(),
      order: Number(orderText),
      file: entry.name,
    });
  }

  axes.sort((left, right) => left.order - right.order || left.code.localeCompare(right.code));
  if (axes.length === 0) {
    throw new Error(`No scorecard axes found in ${axesDir}`);
  }
  const codes = new Set<string>();
  const orders = new Set<number>();
  for (const axis of axes) {
    if (codes.has(axis.code)) {
      throw new Error(`Duplicate scorecard axis code ${axis.code}`);
    }
    if (orders.has(axis.order)) {
      throw new Error(`Duplicate scorecard order ${axis.order}`);
    }
    codes.add(axis.code);
    orders.add(axis.order);
  }
  return axes;
}

async function readProgress(path: string, runId: string): Promise<ProgressSummary> {
  const parsed = asRecord(JSON.parse(await readFile(path, "utf8")), path);
  const progressRunId = stringValue(parsed.run_id);
  if (progressRunId !== runId) {
    throw new Error(
      `${path} has run_id ${progressRunId ?? "<missing>"}, expected ${runId}`,
    );
  }
  const scenarioObject = recordValue(parsed.scenarios) ?? {};
  const scenarioRecords = new Map<string, JsonRecord>();
  for (const [scenario, value] of Object.entries(scenarioObject)) {
    const record = recordValue(value);
    if (record !== null) {
      scenarioRecords.set(scenario, record);
    }
  }

  return {
    runId,
    status: stringValue(parsed.status) ?? "unknown",
    sessions: readSessionCounts(parsed, scenarioRecords),
    scenarioRecords,
  };
}

function readSessionCounts(
  progress: JsonRecord,
  scenarios: Map<string, JsonRecord>,
): SessionCounts {
  const aggregate =
    recordValue(progress.sessions) ?? recordValue(progress.session_counts);
  if (aggregate !== null) {
    return countsFromRecord(aggregate);
  }

  const counts = emptyCounts();
  for (const scenario of scenarios.values()) {
    const scenarioCounts = recordValue(scenario.session_counts);
    if (scenarioCounts !== null) {
      addCounts(counts, countsFromRecord(scenarioCounts));
      continue;
    }
    if (scenario.outcomes !== undefined) {
      addOutcomes(counts, scenario.outcomes);
      continue;
    }
    const stagesDone = arrayValue(scenario.stages_done);
    counts.ok += stagesDone?.length ?? 0;
    if (stringValue(scenario.status) === "invalid_infra") {
      counts.invalidInfra += 1;
    }
  }
  return counts;
}

function countsFromRecord(record: JsonRecord): SessionCounts {
  return {
    ok: numericCount(record.ok ?? record.committed ?? record.accepted),
    rejected: numericCount(record.rejected),
    abandoned: numericCount(record.abandoned ?? record.abandon),
    invalidInfra: numericCount(
      record.invalid_infra ?? record["invalid-infra"] ?? record.invalidInfra,
    ),
  };
}

function addOutcomes(counts: SessionCounts, outcomes: unknown): void {
  if (Array.isArray(outcomes)) {
    for (const outcome of outcomes) {
      incrementOutcome(counts, outcome);
    }
    return;
  }
  const record = recordValue(outcomes);
  if (record === null) {
    return;
  }
  const numericAggregate = Object.entries(record).some(
    ([key, value]) =>
      typeof value === "number" &&
      /^(?:ok|committed|accepted|rejected|abandoned|abandon|invalid[-_]?infra)$/i.test(
        key,
      ),
  );
  if (numericAggregate) {
    addCounts(counts, countsFromRecord(record));
    return;
  }
  for (const outcome of Object.values(record)) {
    incrementOutcome(counts, outcome);
  }
}

function incrementOutcome(counts: SessionCounts, value: unknown): void {
  const record = recordValue(value);
  const outcome = stringValue(record?.outcome ?? record?.status ?? value)?.toLowerCase();
  if (outcome === undefined) {
    return;
  }
  if (/invalid.*infra|infra.*invalid/.test(outcome)) {
    counts.invalidInfra += 1;
  } else if (outcome.includes("reject")) {
    counts.rejected += 1;
  } else if (outcome.includes("abandon")) {
    counts.abandoned += 1;
  } else if (/committed|accepted|complete|^ok$/.test(outcome)) {
    counts.ok += 1;
  }
}

export async function readFingerprint(path: string): Promise<FingerprintSummary> {
  const markdown = await readFile(path, "utf8");
  const exactLine = markdown.match(/^SUT:\s*(.+)$/m)?.[1]?.trim();
  const repo = normalizedRepo(
    bulletValue(markdown, "repo") ?? bulletValue(markdown, "git") ?? "unknown",
  );
  const model = normalizedFingerprintModel(markdown);
  const prompt = normalizedHash(
    bulletValue(markdown, "prompt") ??
      bulletValue(markdown, "prompt hash") ??
      "unknown",
  );
  const lints = normalizedHash(
    bulletValue(markdown, "lints") ??
      bulletValue(markdown, "lint hash") ??
      "unknown",
  );
  const styles = normalizedHash(
    bulletValue(markdown, "styles") ??
      bulletValue(markdown, "style hash") ??
      "unknown",
  );
  const surfaceBullet =
    bulletValue(markdown, "surface") ?? bulletValue(markdown, "surface hash");
  const surface =
    surfaceBullet === undefined ? undefined : normalizedHash(surfaceBullet);
  const toolCallCap = normalizedToolCallCap(
    bulletValue(markdown, "tool-call cap"),
  );
  return {
    line:
      exactLine ??
      `${repo} · model ${model} · prompt ${prompt} · lints ${lints} · styles ${styles}` +
        (surface === undefined ? "" : ` · surface ${surface}`) +
        (toolCallCap === undefined
          ? ""
          : ` · tool-call cap ${toolCallCap.value} (${toolCallCap.source})`),
    repo,
    model,
    prompt,
    lints,
    styles,
    ...(surface === undefined ? {} : { surface }),
    ...(toolCallCap === undefined
      ? {}
      : {
          toolCallCap: toolCallCap.value,
          toolCallCapSource: toolCallCap.source,
        }),
  };
}

function bulletValue(markdown: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(
    new RegExp(`^- ${escapedName}(?:\\s*\\([^\\n]*?\\))?:\\s*(.+)$`, "im"),
  );
  return match?.[1]?.trim();
}

function normalizedRepo(value: string): string {
  return value.replaceAll("`", "").split(/\s+/)[0] ?? "unknown";
}

function normalizedFingerprintModel(markdown: string): string {
  const direct = bulletValue(markdown, "model");
  if (direct !== undefined) {
    return direct
      .split(/\s+·\s+|\s+\([^)]*\)\s*$/)[0]!
      .replace(/\s+@\s+thinking=/i, " @ ")
      .trim();
  }
  const agentConfig = bulletValue(markdown, "SUT agent config");
  const model = agentConfig?.match(/\bmodel\s+`([^`]+)`/i)?.[1] ?? "unknown";
  const thinking =
    agentConfig?.match(/\bmodel\s+`[^`]+`\s+@\s+`([^`]+)`/i)?.[1]
    ?? agentConfig?.match(/\bthinking\s+`([^`]+)`/i)?.[1]
    ?? "unknown";
  return `${model} @ ${thinking}`;
}

function normalizedToolCallCap(
  value: string | undefined,
): { value: ToolCallCap; source: ToolCallCapSource } | undefined {
  if (value === undefined) return undefined;
  const match = value.replaceAll("`", "").match(
    /^([123])\s+\((agent default|--tool-call-cap)\)$/,
  );
  if (!match) {
    throw new Error(`Invalid tool-call cap fingerprint value: ${value}`);
  }
  return {
    value: Number(match[1]) as ToolCallCap,
    source: match[2] as ToolCallCapSource,
  };
}

function normalizedHash(value: string): string {
  const unquoted = value.replaceAll("`", "");
  return (
    unquoted.match(/\b[0-9a-f]{8}\b/i)?.[0]?.toLowerCase() ??
    unquoted.split(/\s+/)[0]!
  );
}

async function readJudgeIfPresent(
  path: string,
  expected: { runId: string; scenario: string; axis: string },
): Promise<JudgeEnvelope | null> {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return null;
    }
    throw error;
  }

  const parsed = asRecord(JSON.parse(source), path);
  const axis = stringValue(parsed.axis);
  const scenario = stringValue(parsed.scenario);
  const runId = stringValue(parsed.run_id);
  if (axis?.toUpperCase() !== expected.axis) {
    throw new Error(`${path} has axis ${axis ?? "<missing>"}, expected ${expected.axis}`);
  }
  if (scenario !== expected.scenario) {
    throw new Error(
      `${path} has scenario ${scenario ?? "<missing>"}, expected ${expected.scenario}`,
    );
  }
  if (runId !== expected.runId) {
    throw new Error(
      `${path} has run_id ${runId ?? "<missing>"}, expected ${expected.runId}`,
    );
  }
  const rawScore = parsed.score;
  if (
    rawScore !== null &&
    (typeof rawScore !== "number" ||
      !Number.isFinite(rawScore) ||
      rawScore < 1 ||
      rawScore > 10)
  ) {
    throw new Error(`${path} score must be null or a finite number from 1 to 10`);
  }
  const rawFlags = parsed.flags;
  const flags =
    rawFlags === undefined
      ? []
      : arrayValue(rawFlags)?.map((flag) => {
          if (typeof flag !== "string") {
            throw new Error(`${path} flags must contain only strings`);
          }
          return flag;
        }) ?? (() => {
          throw new Error(`${path} flags must be an array`);
        })();

  return { score: rawScore, verdict: parsed.verdict, flags };
}

async function findPreviousRunId(
  runsDir: string,
  runId: string,
): Promise<string | undefined> {
  const entries = await readdir(runsDir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory() && entry.name.localeCompare(runId) < 0)
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));
  for (const candidate of candidates) {
    if (await pathIsFile(join(runsDir, candidate, "scorecard.md"))) {
      return candidate;
    }
  }
  return undefined;
}

async function readPreviousIfPresent(
  runsDir: string,
  runId: string,
): Promise<PreviousScorecard | null> {
  const path = join(runsDir, runId, "scorecard.md");
  try {
    return parsePreviousScorecard(await readFile(path, "utf8"), path);
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return null;
    }
    throw error;
  }
}

export function parsePreviousScorecard(
  markdown: string,
  source = "scorecard.md",
): PreviousScorecard {
  const lines = markdown.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => {
    const cells = splitTableRow(line);
    return (
      cells[0]?.toLowerCase() === "scenario" &&
      cells.some((cell) => cell.toLowerCase() === "flags")
    );
  });
  if (headerIndex < 0) {
    throw new Error(`${source} has no scorecard table`);
  }
  const headers = splitTableRow(lines[headerIndex]!);
  const axes = headers.filter(
    (header) =>
      header.toLowerCase() !== "scenario" &&
      header.toLowerCase() !== "flags" &&
      !header.startsWith("Δ"),
  );
  if (axes.length === 0) {
    throw new Error(`${source} has no axis columns`);
  }
  const scores = new Map<string, Map<string, number | null>>();

  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    const cells = splitTableRow(lines[index]!);
    if (cells.length === 0) {
      break;
    }
    const rowName = stripEmphasis(cells[0] ?? "");
    if (rowName.toLowerCase() === "mean") {
      break;
    }
    const scenarioId = rowName;
    const rowScores = new Map<string, number | null>();
    for (const axis of axes) {
      const column = headers.indexOf(axis);
      rowScores.set(axis, parseScoreCell(cells[column] ?? ""));
    }
    scores.set(scenarioId, rowScores);
  }

  return { axes, scores };
}

function collectScenarioFlags(
  scenarioId: string,
  status: string,
  progressRecord: JsonRecord | undefined,
  judges: Map<string, JudgeEnvelope | null> | undefined,
  axes: AxisDefinition[],
): string[] {
  const flags: string[] = [];
  const progressFlags = arrayValue(progressRecord?.flags);
  if (progressFlags !== null) {
    for (const flag of progressFlags) {
      if (typeof flag === "string") {
        flags.push(flag);
      }
    }
  }
  addOutcomeFlags(flags, scenarioId, progressRecord?.outcomes);
  if (status === "invalid_infra") {
    flags.push("INFRA(invalid-infra)");
  } else if (
    status === "failed" ||
    status === "pending" ||
    status === "building" ||
    status === "sessions_done" ||
    status === "judging" ||
    status === "running" ||
    status === "missing"
  ) {
    flags.push(`PARTIAL(${status})`);
  }
  for (const axis of axes) {
    flags.push(...(judges?.get(axis.code)?.flags ?? []));
  }
  return unique(flags);
}

function addOutcomeFlags(
  flags: string[],
  scenarioId: string,
  outcomes: unknown,
): void {
  const record = recordValue(outcomes);
  if (record === null) {
    return;
  }
  for (const [stage, value] of Object.entries(record)) {
    const outcomeRecord = recordValue(value);
    const outcome = stringValue(
      outcomeRecord?.outcome ?? outcomeRecord?.status ?? value,
    )?.toLowerCase();
    if (outcome === undefined) {
      continue;
    }
    const stageId = stage.startsWith(`${scenarioId}-`)
      ? stage
      : `${scenarioId}-${stage}`;
    if (/invalid.*infra|infra.*invalid/.test(outcome)) {
      flags.push(`INFRA(${stageId})`);
    } else if (outcome.includes("reject")) {
      flags.push(`REJECTED(${stageId})`);
    } else if (outcome.includes("abandon")) {
      flags.push(`ABANDON(${stageId})`);
    }
  }
}

function collectMovements(
  scenarios: ScenarioAssembly[],
  axes: AxisDefinition[],
  judges: Map<string, Map<string, JudgeEnvelope | null>>,
  previous: PreviousScorecard | null,
  comparable: boolean,
): Movement[] {
  if (!comparable || previous === null) {
    return [];
  }
  const movements: Movement[] = [];
  for (const scenario of scenarios) {
    for (const axis of axes) {
      const current = scenario.scores[axis.code];
      const old = previous.scores.get(scenario.id)?.get(axis.code) ?? null;
      if (current === null || old === null || Math.abs(current - old) < 1 - 1e-9) {
        continue;
      }
      const evidence = strongestEvidence(
        judges.get(scenario.id)?.get(axis.code)?.verdict,
      );
      if (evidence === null) {
        throw new Error(
          `Movement ${scenario.label}/${axis.code} requires evidence in judge-${axis.code.toLowerCase()}.json`,
        );
      }
      movements.push({
        scenario: scenario.label,
        axis: axis.code,
        previous: old,
        current,
        delta: round(current - old),
        evidence,
      });
    }
  }
  return movements;
}

function strongestEvidence(verdict: unknown): string | null {
  const preferredKeys = [
    "overall_summary",
    "coverage_summary",
    "most_consequential_gap",
    "scope_summary",
    "score_rationale",
    "strongest_evidence",
    "evidence",
    "note",
    "finding",
    "assessment",
    "observation",
    "summary",
    "rationale",
    "reconstruction_line",
    "transcript_moment",
    "transcript_excerpt",
    "line",
    "reason",
    "what_changed",
  ];
  const seen = new Set<object>();

  const visit = (value: unknown): string | null => {
    if (typeof value === "string") {
      const cleaned = cleanEvidence(value);
      return cleaned === "" ? null : cleaned;
    }
    if (value === null || typeof value !== "object" || seen.has(value)) {
      return null;
    }
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        const candidate = visit(item);
        if (candidate !== null) {
          return candidate;
        }
      }
      return null;
    }
    const record = value as JsonRecord;
    for (const key of preferredKeys) {
      if (record[key] !== undefined) {
        const candidate = visit(record[key]);
        if (candidate !== null) {
          return candidate;
        }
      }
    }
    for (const nested of Object.values(record)) {
      if (nested !== null && typeof nested === "object") {
        const candidate = visit(nested);
        if (candidate !== null) {
          return candidate;
        }
      }
    }
    return null;
  };

  return visit(verdict);
}

function findLockstepPairs(
  scenarios: ScenarioAssembly[],
  axes: string[],
): LockstepPair[] {
  const pairs: LockstepPair[] = [];
  for (let leftIndex = 0; leftIndex < axes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < axes.length; rightIndex += 1) {
      const left = axes[leftIndex]!;
      const right = axes[rightIndex]!;
      const matchingScenarios = scenarios
        .filter((scenario) => {
          const leftDelta = scenario.deltas[left];
          const rightDelta = scenario.deltas[right];
          return (
            leftDelta !== null &&
            rightDelta !== null &&
            Math.abs(leftDelta) > 1e-9 &&
            Math.abs(rightDelta) > 1e-9 &&
            Math.sign(leftDelta) === Math.sign(rightDelta)
          );
        })
        .map((scenario) => scenario.id);
      if (matchingScenarios.length >= 6) {
        pairs.push({
          axes: [left, right],
          count: matchingScenarios.length,
          scenarios: matchingScenarios,
        });
      }
    }
  }
  return pairs;
}

function renderMarkdown(input: {
  runId: string;
  axes: AxisDefinition[];
  fingerprint: FingerprintSummary;
  progress: ProgressSummary;
  selectedPreviousRunId: string | undefined;
  previous: PreviousScorecard | null;
  axisSetChanged: boolean;
  comparable: boolean;
  scenarioRows: ScenarioAssembly[];
  scoreMeans: Record<string, number | null>;
  deltaMeans: Record<string, number | null>;
  meanFlags: string[];
  movements: Movement[];
  lockstepPairs: LockstepPair[];
}): string {
  const {
    runId,
    axes,
    fingerprint,
    progress,
    selectedPreviousRunId,
    previous,
    axisSetChanged,
    comparable,
    scenarioRows,
    scoreMeans,
    deltaMeans,
    meanFlags,
    movements,
    lockstepPairs,
  } = input;
  const previousHeader = renderPreviousHeader(
    selectedPreviousRunId,
    previous,
    axisSetChanged,
    axes.map((axis) => axis.code),
  );
  const headers = ["scenario"];
  for (const axis of axes) {
    headers.push(axis.code);
    if (comparable) {
      headers.push(`Δ${axis.code}`);
    }
  }
  headers.push("flags");

  const lines = [
    `# Eval-suite scorecard — ${runId}`,
    `SUT: ${fingerprint.line}`,
    `Previous run: ${previousHeader} · Sessions: ${progress.sessions.ok} ok / ${progress.sessions.rejected} rejected / ${progress.sessions.abandoned} abandoned / ${progress.sessions.invalidInfra} invalid-infra`,
    "",
    `| ${headers.join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
  ];

  for (const scenario of scenarioRows) {
    const cells = [scenario.label];
    for (const axis of axes) {
      cells.push(formatScore(scenario.scores[axis.code]));
      if (comparable) {
        cells.push(formatDelta(scenario.deltas[axis.code]));
      }
    }
    cells.push(scenario.flags.join(", "));
    lines.push(`| ${cells.join(" | ")} |`);
  }

  const meanCells = ["**mean**"];
  for (const axis of axes) {
    meanCells.push(formatMean(scoreMeans[axis.code]));
    if (comparable) {
      meanCells.push(formatMeanDelta(deltaMeans[axis.code]));
    }
  }
  meanCells.push(meanFlags.join(", "));
  lines.push(`| ${meanCells.join(" | ")} |`, "", "## Movements ≥ 1.0 (mandatory narration)", "");

  if (!comparable) {
    lines.push(
      axisSetChanged
        ? "Axis set changed — Δ columns omitted."
        : "No comparable previous scorecard — no Δ narration.",
    );
  } else if (movements.length === 0) {
    lines.push("- None.");
  } else {
    for (const movement of movements) {
      lines.push(
        `- ${movement.scenario}/${movement.axis} ${formatScore(movement.previous)}→${formatScore(movement.current)}: ${movement.evidence}`,
      );
    }
  }

  lines.push("", "## Axis correlation check", "");
  if (!comparable) {
    lines.push("Not evaluated — no comparable previous scorecard.");
  } else if (lockstepPairs.length === 0) {
    lines.push(
      "No axis pair moved in lockstep in ≥6/8 scenarios; discrimination requirement holds.",
    );
  } else {
    const pairs = lockstepPairs
      .map((pair) => `${pair.axes[0]}↔${pair.axes[1]} (${pair.count}/8)`)
      .join(", ");
    lines.push(
      `FLAG: ${pairs} moved in lockstep; discrimination rubric review required.`,
    );
  }

  return `${lines.join("\n")}\n`;
}

function renderPreviousHeader(
  previousRunId: string | undefined,
  previous: PreviousScorecard | null,
  axisSetChanged: boolean,
  currentAxes: string[],
): string {
  if (previousRunId === undefined) {
    return "none";
  }
  if (previous === null) {
    return `${previousRunId} (scorecard unavailable; Δ omitted)`;
  }
  if (axisSetChanged) {
    return `${previousRunId} (axis set changed: ${previous.axes.join("/")} → ${currentAxes.join("/")}; Δ omitted)`;
  }
  return previousRunId;
}

function requireRunId(runId: string): string {
  const trimmed = runId.trim();
  if (trimmed === "" || trimmed.includes("/") || trimmed === "." || trimmed === "..") {
    throw new Error(`Invalid run id: ${JSON.stringify(runId)}`);
  }
  return trimmed;
}

function sameAxisSet(current: string[], previous: string[]): boolean {
  return (
    current.length === previous.length &&
    [...current].sort().every((axis, index) => axis === [...previous].sort()[index])
  );
}

function scoreDelta(
  current: number | null,
  previous: number | null,
): number | null {
  return current === null || previous === null ? null : round(current - previous);
}

function mean(values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => value !== null);
  if (finite.length === 0) {
    return null;
  }
  return round(finite.reduce((sum, value) => sum + value, 0) / finite.length);
}

function formatScore(value: number | null): string {
  if (value === null) {
    return "–";
  }
  return round(value).toFixed(2).replace(/\.?0+$/, "");
}

function formatDelta(value: number | null): string {
  if (value === null) {
    return "";
  }
  const formatted = formatScore(Math.abs(value));
  if (Math.abs(value) < 1e-9) {
    return "0";
  }
  return value > 0 ? `+${formatted}` : `-${formatted}`;
}

function formatMean(value: number | null): string {
  return value === null ? "–" : `**${value.toFixed(2)}**`;
}

function formatMeanDelta(value: number | null): string {
  if (value === null) {
    return "";
  }
  const absolute = Math.abs(value).toFixed(2);
  const formatted =
    Math.abs(value) < 1e-9 ? absolute : value > 0 ? `+${absolute}` : `-${absolute}`;
  return `**${formatted}**`;
}

function parseScoreCell(cell: string): number | null {
  const normalized = stripEmphasis(cell).trim();
  if (normalized === "" || normalized === "–" || normalized === "-") {
    return null;
  }
  const number = Number(normalized.replace("−", "-").replace(/^\+/, ""));
  return Number.isFinite(number) ? number : null;
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) {
    return [];
  }
  return trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function stripEmphasis(value: string): string {
  return value.replace(/\*\*/g, "").trim();
}

function cleanEvidence(value: string): string {
  return value
    .replace(/^\s*[-*]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim() !== ""))];
}

function isErrorFlag(flag: string): boolean {
  return /^ERROR(?:\b|\()/i.test(flag.trim());
}

function emptyCounts(): SessionCounts {
  return { ok: 0, rejected: 0, abandoned: 0, invalidInfra: 0 };
}

function addCounts(target: SessionCounts, source: SessionCounts): void {
  target.ok += source.ok;
  target.rejected += source.rejected;
  target.abandoned += source.abandoned;
  target.invalidInfra += source.invalidInfra;
}

function numericCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : 0;
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function asRecord(value: unknown, source: string): JsonRecord {
  const record = recordValue(value);
  if (record === null) {
    throw new Error(`${source} must contain a JSON object`);
  }
  return record;
}

function recordValue(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function arrayValue(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isErrno(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

async function pathIsFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return false;
    }
    throw error;
  }
}

async function writeAtomic(path: string, contents: string): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, contents, "utf8");
  await rename(temporaryPath, path);
}
