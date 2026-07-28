import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AxisCode,
  ScenarioId,
  StageId,
  SystemReconstruction,
} from "../contract.ts";

const RUNNER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const EVAL_SUITE_ROOT = resolve(RUNNER_ROOT, "..");
const SYSTEM_AXES_ROOT = resolve(EVAL_SUITE_ROOT, "axes-system");
const SYSTEM_SCENARIOS_ROOT = resolve(EVAL_SUITE_ROOT, "scenarios-system");
const SHARED_JUDGE_RULES = [
  "Each axis is judged independently from only its declared payload and attachments.",
  "Use the 1–10 rubric exactly; half-points are allowed.",
  "Every score must include the axis output contract and concrete evidence.",
  "Exclude declared infrastructure failures from scoring.",
  "Visual axes are scored absolutely against their rubric anchors; no comparison or reference board exists.",
].join("\n");

export interface JudgeImageInput {
  index: number;
  label: string;
  path: string;
}

export interface PreparedJudgeInput {
  payload: string;
  images: JudgeImageInput[];
  skip_reason: string | null;
}

export interface PreparedEditInput extends PreparedJudgeInput {
  stage: `e${number}`;
  outcome: string | null;
}

export interface GatheredJudgeInputs {
  run_id: string;
  scenario: ScenarioId;
  scenario_dir: string;
  final_stage: StageId | null;
  shared_rules: string;
  rubrics: Record<AxisCode, string>;
  sf_blind: PreparedJudgeInput;
  sf_scorer_base: PreparedJudgeInput;
  requirement_coverage: PreparedJudgeInput;
  readability: PreparedJudgeInput;
  craft: PreparedJudgeInput;
  scope_discipline_edits: PreparedEditInput[];
  skipped_scope_discipline_edits: Array<{ stage: `e${number}`; reason: string }>;
  prompt_hygiene: PreparedJudgeInput;
}

interface SessionRecord {
  stage: StageId;
  outcome: string | null;
  summary: string | null;
  raw: string;
}

interface SystemEditSpec {
  stage: `e${number}`;
  title: string;
  instruction: string;
}

export interface GatherJudgeInputOptions {
  runId: string;
  scenario: string;
  runsRoot?: string;
}

function assertIdentifiers(runId: string, scenario: string): asserts scenario is ScenarioId {
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9._-]*$/.test(runId)) {
    throw new Error(`Invalid run id: ${runId}`);
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(scenario)) {
    throw new Error(`Invalid scenario id: ${scenario}`);
  }
}

async function readText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

async function readTextIfPresent(path: string): Promise<string | null> {
  return existsSync(path) ? readText(path) : null;
}

async function readJsonIfPresent(path: string): Promise<unknown | null> {
  const text = await readTextIfPresent(path);
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch (error: unknown) {
    throw new Error(`Invalid JSON at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function formatPayload(sections: Record<string, unknown>): string {
  return JSON.stringify(sections, null, 2);
}

function prepared(
  payload: Record<string, unknown> | string,
  imageSpecs: Array<{ label: string; path: string }>,
  missing: string[],
): PreparedJudgeInput {
  return {
    payload: typeof payload === "string" ? payload : formatPayload(payload),
    images: imageSpecs.map((image, index) => ({ ...image, index: index + 1 })),
    skip_reason: missing.length > 0 ? missing.join("; ") : null,
  };
}

function stageNumber(stage: string): number {
  return stage === "stage0" ? 0 : Number(stage.slice(1));
}

function isStageId(value: string): value is StageId {
  return value === "stage0" || /^e[1-9]\d*$/.test(value);
}

function stagesFromFilenames(filenames: string[]): StageId[] {
  const stages = new Set<StageId>();
  for (const filename of filenames) {
    const match = /^(stage0|e[1-9]\d*)\.(json|png)$/.exec(filename);
    if (match && isStageId(match[1])) stages.add(match[1]);
  }
  return [...stages].sort((left, right) => stageNumber(left) - stageNumber(right));
}

function parseSessions(markdown: string): Map<StageId, SessionRecord> {
  const headings = [...markdown.matchAll(/^## (stage0|e[1-9]\d*)\b[^\n]*$/gm)];
  const records = new Map<StageId, SessionRecord>();
  headings.forEach((heading, index) => {
    const stage = heading[1];
    if (!isStageId(stage)) return;
    const start = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? markdown.length;
    const raw = markdown.slice(start, end).trim();
    records.set(stage, {
      stage,
      outcome: /^- outcome:\s*(.+)$/m.exec(raw)?.[1]?.trim() ?? null,
      summary: /^- commit summary:\s*(.+)$/m.exec(raw)?.[1]?.trim() ?? null,
      raw,
    });
  });
  return records;
}

function finalStageFromSessions(markdown: string): StageId | null {
  const stage = /^final stage:\s*(stage0|e[1-9]\d*)\s*$/im.exec(markdown)?.[1];
  return stage && isStageId(stage) ? stage : null;
}

async function readSystemScenario(scenario: ScenarioId): Promise<{
  brief: string;
  edits: SystemEditSpec[];
}> {
  const scenarioRoot = resolve(SYSTEM_SCENARIOS_ROOT, scenario);
  const briefPath = resolve(scenarioRoot, "brief.md");
  const configPath = resolve(scenarioRoot, "config.json");
  const [brief, configValue] = await Promise.all([
    readText(briefPath),
    readJsonIfPresent(configPath),
  ]);
  if (!brief.trim()) throw new Error(`System brief is empty: ${briefPath}`);
  if (typeof configValue !== "object" || configValue === null || Array.isArray(configValue)) {
    throw new Error(`System scenario config must be an object: ${configPath}`);
  }
  const editsValue = (configValue as Record<string, unknown>).edits ?? [];
  if (!Array.isArray(editsValue)) {
    throw new Error(`System scenario edits must be an array: ${configPath}`);
  }
  const edits = editsValue.map((value, index): SystemEditSpec => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`System scenario edit ${index + 1} must be an object: ${configPath}`);
    }
    const record = value as Record<string, unknown>;
    if (typeof record.title !== "string" || !record.title.trim()) {
      throw new Error(`System scenario edit ${index + 1} has no title: ${configPath}`);
    }
    if (typeof record.instruction !== "string" || !record.instruction.trim()) {
      throw new Error(`System scenario edit ${index + 1} has no instruction: ${configPath}`);
    }
    return {
      stage: `e${index + 1}`,
      title: record.title,
      instruction: record.instruction,
    };
  });
  return { brief, edits };
}

async function loadRubrics(): Promise<Record<AxisCode, string>> {
  const paths: Record<AxisCode, string> = {
    sf: resolve(SYSTEM_AXES_ROOT, "system-fidelity.md"),
    rc: resolve(SYSTEM_AXES_ROOT, "requirement-coverage.md"),
    rd: resolve(SYSTEM_AXES_ROOT, "readability.md"),
    cf: resolve(SYSTEM_AXES_ROOT, "craft.md"),
    sd: resolve(SYSTEM_AXES_ROOT, "scope-discipline.md"),
    ph: resolve(SYSTEM_AXES_ROOT, "process-health.md"),
  };
  return Object.fromEntries(
    await Promise.all(
      (Object.entries(paths) as Array<[AxisCode, string]>).map(async ([axis, path]) => [
        axis,
        await readText(path),
      ]),
    ),
  ) as Record<AxisCode, string>;
}

function summarizeCollectionDiff(
  beforeValue: unknown,
  afterValue: unknown,
): { added: unknown[]; removed: string[]; changed: Array<{ id: string; before: unknown; after: unknown }> } {
  const before = Array.isArray(beforeValue) ? beforeValue : [];
  const after = Array.isArray(afterValue) ? afterValue : [];
  const identify = (item: unknown): string | null => {
    if (typeof item !== "object" || item === null) return null;
    const id = (item as Record<string, unknown>).id;
    return typeof id === "string" ? id : null;
  };
  const beforeById = new Map(before.map((item) => [identify(item), item]).filter((row): row is [string, unknown] => row[0] !== null));
  const afterById = new Map(after.map((item) => [identify(item), item]).filter((row): row is [string, unknown] => row[0] !== null));
  const added = [...afterById].filter(([id]) => !beforeById.has(id)).map(([, item]) => item);
  const removed = [...beforeById.keys()].filter((id) => !afterById.has(id));
  const changed = [...afterById].flatMap(([id, item]) => {
    const prior = beforeById.get(id);
    return prior !== undefined && JSON.stringify(prior) !== JSON.stringify(item)
      ? [{ id, before: prior, after: item }]
      : [];
  });
  return { added, removed, changed };
}

function canvasDiff(before: unknown, after: unknown): unknown {
  const beforeRecord = typeof before === "object" && before !== null ? before as Record<string, unknown> : {};
  const afterRecord = typeof after === "object" && after !== null ? after as Record<string, unknown> : {};
  return {
    objects: summarizeCollectionDiff(beforeRecord.objects, afterRecord.objects),
    connections: summarizeCollectionDiff(beforeRecord.connections, afterRecord.connections),
    annotations: summarizeCollectionDiff(beforeRecord.annotations, afterRecord.annotations),
  };
}

function missingPath(path: string, description: string, missing: string[]): void {
  if (!existsSync(path)) missing.push(`missing ${description}`);
}

async function buildPromptHygieneInput(options: {
  runId: string;
  scenario: ScenarioId;
  scenarioDir: string;
  stages: StageId[];
  sessions: Map<StageId, SessionRecord>;
  sessionsText: string | null;
}): Promise<PreparedJudgeInput> {
  const missing: string[] = [];
  if (!options.sessionsText) missing.push("missing sessions metadata");
  const transcriptPayloads: Array<{ stage: StageId; transcript: unknown }> = [];
  for (const session of options.sessions.values()) {
    const transcriptPath = resolve(options.scenarioDir, "transcripts", `${session.stage}.json`);
    const transcript = await readJsonIfPresent(transcriptPath);
    if (transcript === null) {
      missing.push(`missing transcript for ${session.stage}`);
    } else {
      transcriptPayloads.push({ stage: session.stage, transcript });
    }
  }
  if (options.sessions.size === 0) missing.push("no session records found");
  if (options.sessions.size > 0 && [...options.sessions.values()].every((session) =>
    session.outcome?.toLowerCase().includes("invalid")
  )) {
    missing.push("all sessions marked INVALID(infra)");
  }
  const diffPayloads: Array<{
    stage: StageId;
    before: StageId | "stage-blank";
    diff: unknown;
  }> = [];
  for (const stage of options.stages) {
    const number = stageNumber(stage);
    const before: StageId | "stage-blank" = number === 0
      ? "stage-blank"
      : number === 1
        ? "stage0"
        : `e${number - 1}`;
    const beforeJson = await readJsonIfPresent(resolve(options.scenarioDir, `${before}.json`));
    const afterJson = await readJsonIfPresent(resolve(options.scenarioDir, `${stage}.json`));
    if (beforeJson === null || afterJson === null) {
      missing.push(`missing stage diff input for ${stage}`);
    } else {
      diffPayloads.push({ stage, before, diff: canvasDiff(beforeJson, afterJson) });
    }
  }
  return prepared(
    {
      run_id: options.runId,
      scenario: options.scenario,
      session_metadata: options.sessionsText,
      transcripts: transcriptPayloads,
      stage_diffs: diffPayloads,
    },
    [],
    [...new Set(missing)],
  );
}

export function buildSystemFidelityScorerPayload(
  base: PreparedJudgeInput,
  reconstruction: SystemReconstruction,
): string {
  const parsed = JSON.parse(base.payload) as Record<string, unknown>;
  return formatPayload({ ...parsed, blind_reconstruction: reconstruction });
}

export async function gatherScenarioJudgeInputs(
  options: GatherJudgeInputOptions,
): Promise<GatheredJudgeInputs> {
  assertIdentifiers(options.runId, options.scenario);
  const runsRoot = options.runsRoot ? resolve(options.runsRoot) : resolve(EVAL_SUITE_ROOT, "runs");
  const runDir = resolve(runsRoot, options.runId);
  const scenarioDir = resolve(runDir, options.scenario);
  if (!existsSync(scenarioDir)) throw new Error(`Scenario run directory does not exist: ${scenarioDir}`);

  const sharedRules = SHARED_JUDGE_RULES;
  const rubrics = await loadRubrics();

  const filenames = await readdir(scenarioDir);
  const stages = stagesFromFilenames(filenames);
  const sessionsText = await readTextIfPresent(resolve(scenarioDir, "sessions.md"));
  const sessions = parseSessions(sessionsText ?? "");
  const recordedFinal = sessionsText ? finalStageFromSessions(sessionsText) : null;
  const finalStage = recordedFinal ?? stages.at(-1) ?? null;
  const finalJsonPath = finalStage ? resolve(scenarioDir, `${finalStage}.json`) : resolve(scenarioDir, "missing.json");
  const finalPngPath = finalStage ? resolve(scenarioDir, `${finalStage}.png`) : resolve(scenarioDir, "missing.png");
  const finalCanvas = finalStage ? await readJsonIfPresent(finalJsonPath) : null;
  const promptHygiene = await buildPromptHygieneInput({
    runId: options.runId,
    scenario: options.scenario,
    scenarioDir,
    stages,
    sessions,
    sessionsText,
  });

  const { brief, edits: editSpecs } = await readSystemScenario(options.scenario);
    const sfBlindMissing: string[] = [];
    missingPath(finalPngPath, "final PNG", sfBlindMissing);
    const sfBlind = prepared(
      "Reconstruct the single attached image. Report only what the picture communicates.",
      [{ label: "board", path: finalPngPath }],
      sfBlindMissing,
    );
    const sfScorerBase = prepared({ brief }, [], []);

    const rcMissing: string[] = [];
    if (finalCanvas === null) rcMissing.push("missing final canvas JSON");
    missingPath(finalPngPath, "final PNG", rcMissing);
    const requirementCoverage = prepared(
      {
        brief,
        final_canvas: finalCanvas,
        attachment_manifest: [{ index: 1, role: "final board PNG" }],
      },
      [{ label: "final board PNG", path: finalPngPath }],
      rcMissing,
    );

    const buildBoardVisualInput = (): PreparedJudgeInput => {
      const missing: string[] = [];
      missingPath(finalPngPath, "final PNG", missing);
      return prepared(
        {
          attachment_manifest: [
            { index: 1, role: "board under grade" },
          ],
        },
        [{ label: "board under grade", path: finalPngPath }],
        missing,
      );
    };
    const readability = buildBoardVisualInput();
    const craft = buildBoardVisualInput();

    const scopeDisciplineEdits: PreparedEditInput[] = [];
    const skippedScopeDisciplineEdits: Array<{ stage: `e${number}`; reason: string }> = [];
    for (const spec of editSpecs) {
      const editNumber = stageNumber(spec.stage);
      const previousStage: StageId = editNumber === 1 ? "stage0" : `e${editNumber - 1}`;
      const preJsonPath = resolve(scenarioDir, `${previousStage}.json`);
      const postJsonPath = resolve(scenarioDir, `${spec.stage}.json`);
      const prePngPath = resolve(scenarioDir, `${previousStage}.png`);
      const postPngPath = resolve(scenarioDir, `${spec.stage}.png`);
      const preCanvas = await readJsonIfPresent(preJsonPath);
      const postCanvas = await readJsonIfPresent(postJsonPath);
      const session = sessions.get(spec.stage);
      const missing: string[] = [];
      missingPath(preJsonPath, `${spec.stage} pre-edit JSON`, missing);
      missingPath(postJsonPath, `${spec.stage} post-edit JSON`, missing);
      missingPath(prePngPath, `${spec.stage} pre-edit PNG`, missing);
      missingPath(postPngPath, `${spec.stage} post-edit PNG`, missing);
      if (!session?.summary) missing.push(`missing ${spec.stage} commit summary`);
      if (session?.outcome?.toLowerCase().includes("invalid")) {
        missing.push(`${spec.stage} marked INVALID(infra)`);
      }
      const input = prepared(
        {
          edit: spec.stage,
          title: spec.title,
          instruction: spec.instruction,
          outcome: session?.outcome ?? null,
          commit_summary: session?.summary ?? null,
          pre_edit_canvas: preCanvas,
          post_edit_canvas: postCanvas,
          deterministic_diff: canvasDiff(preCanvas, postCanvas),
          attachment_manifest: [
            { index: 1, role: "pre-edit PNG" },
            { index: 2, role: "post-edit PNG" },
          ],
        },
        [
          { label: "pre-edit PNG", path: prePngPath },
          { label: "post-edit PNG", path: postPngPath },
        ],
        missing,
      );
      if (input.skip_reason) {
        skippedScopeDisciplineEdits.push({ stage: spec.stage, reason: input.skip_reason });
      } else {
        scopeDisciplineEdits.push({
          ...input,
          stage: spec.stage,
          outcome: session?.outcome ?? null,
        });
      }
    }
    if (editSpecs.length === 0) {
      skippedScopeDisciplineEdits.push({
        stage: "e1",
        reason: "system scenario has no follow-up edits",
      });
    }
  return {
    run_id: options.runId,
    scenario: options.scenario,
    scenario_dir: scenarioDir,
    final_stage: finalStage,
    shared_rules: sharedRules,
    rubrics,
    sf_blind: sfBlind,
    sf_scorer_base: sfScorerBase,
    requirement_coverage: requirementCoverage,
    readability,
    craft,
    scope_discipline_edits: scopeDisciplineEdits,
    skipped_scope_discipline_edits: skippedScopeDisciplineEdits,
    prompt_hygiene: promptHygiene,
  };
}
