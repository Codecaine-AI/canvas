import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  ClientRegistry,
  Collector,
  Image,
  type Image as BamlImage,
} from "@boundaryml/baml";
import { b } from "../../baml_client/index.js";
import type {
  PHVerdict as GeneratedPHVerdict,
  RequirementCoverageVerdict as GeneratedRequirementCoverageVerdict,
  ScopeDisciplineEditVerdict as GeneratedScopeDisciplineEditVerdict,
  SurfaceQualityVerdict as GeneratedSurfaceQualityVerdict,
  SystemFidelityVerdict as GeneratedSystemFidelityVerdict,
  SystemReconstruction as GeneratedSystemReconstruction,
} from "../../baml_client/types.js";
import type {
  AnyJudgeEnvelope,
  AxisCode,
  JudgeEnvelope,
  JudgeIdentity,
  JudgeUsage,
  PHVerdict,
  ReasoningEffort,
  RequirementCoverageVerdict,
  ScenarioId,
  ScopeDisciplineEditVerdict,
  ScopeDisciplineVerdict,
  SurfaceQualityVerdict,
  SystemFidelityVerdict,
  SystemReconstruction,
} from "../contract.ts";
import { Semaphore } from "../semaphore.ts";
import {
  buildSystemFidelityScorerPayload,
  gatherScenarioJudgeInputs,
  type JudgeImageInput,
  type PreparedJudgeInput,
} from "./inputs.ts";
import {
  renderJudgeMarkdown,
  renderSystemReconstructionMarkdown,
} from "./render_md.ts";

const DEFAULT_MODEL = "gpt-5.6-sol";
const DEFAULT_BASE_URL = "http://127.0.0.1:2455/v1";
const DEFAULT_EFFORT: ReasoningEffort = "low";
const RUNTIME_CLIENT_NAME = "RuntimeJudgeClient";
const MAX_VALIDATION_RETRIES = 2;

export interface JudgeClientConfig {
  model?: string;
  baseUrl?: string;
  effort?: ReasoningEffort;
  apiKey?: string;
}

export interface ResolvedJudgeClient {
  model: string;
  baseUrl: string;
  effort: ReasoningEffort;
  apiKey: string;
}

export interface JudgeRunnerOptions {
  concurrency?: number;
  client?: JudgeClientConfig;
  runsRoot?: string;
}

export interface RunScenarioJudgeOptions {
  runId: string;
  scenario: string;
}

interface BamlResult<T> {
  value: T;
  usage: JudgeUsage;
  attempts: number;
}

class OutputValidationError extends Error {
  constructor(issues: string[]) {
    super(`Structured verdict validation failed:\n- ${issues.join("\n- ")}`);
    this.name = "OutputValidationError";
  }
}

export function resolveJudgeClient(config: JudgeClientConfig = {}): ResolvedJudgeClient {
  return {
    model: config.model ?? DEFAULT_MODEL,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    effort: config.effort ?? DEFAULT_EFFORT,
    apiKey: config.apiKey ?? process.env.CODEX_LB_API_KEY ?? "sk-clb-local",
  };
}

export function runtimeClientRegistry(config: ResolvedJudgeClient): ClientRegistry {
  const registry = new ClientRegistry();
  registry.addLlmClient(
    RUNTIME_CLIENT_NAME,
    "openai-generic",
    {
      base_url: config.baseUrl,
      api_key: config.apiKey,
      model: config.model,
      reasoning_effort: config.effort,
      response_format: { type: "json_object" },
    },
    "Exponential",
  );
  registry.setPrimary(RUNTIME_CLIENT_NAME);
  return registry;
}

function runtimeEnv(config: ResolvedJudgeClient): Record<string, string> {
  return {
    CODEX_LB_API_KEY: config.apiKey,
    OPENAI_API_KEY: config.apiKey,
  };
}

function judgeIdentity(config: ResolvedJudgeClient, bamlFn: string, attempts: number): JudgeIdentity {
  return {
    model: config.model,
    reasoning_effort: config.effort,
    baml_fn: bamlFn,
    attempts,
  };
}

function sumUsage(left: JudgeUsage, right: JudgeUsage): JudgeUsage {
  return {
    input_tokens: left.input_tokens + right.input_tokens,
    output_tokens: left.output_tokens + right.output_tokens,
  };
}

function collectorUsage(collector: Collector): JudgeUsage {
  const usage = collector.usage;
  return {
    input_tokens: usage.inputTokens ?? 0,
    output_tokens: usage.outputTokens ?? 0,
  };
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause;
    return cause ? `${error.stack ?? error.message}\nCaused by: ${errorText(cause)}` : error.stack ?? error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isBamlValidationFailure(error: unknown): boolean {
  if (error instanceof OutputValidationError) return true;
  const text = errorText(error);
  return [
    "BamlValidationError",
    "Failed to parse LLM response",
    "Failed to coerce",
    "invalid type",
    "invalid value",
  ].some((needle) => text.includes(needle));
}

function validateScore(score: number | null | undefined, field = "score"): string[] {
  if (typeof score !== "number" || !Number.isFinite(score)) return [`${field} must be a finite number`];
  const issues: string[] = [];
  if (score < 1 || score > 10) issues.push(`${field} must be between 1 and 10`);
  if (Math.abs(score * 2 - Math.round(score * 2)) > 1e-9) issues.push(`${field} must use half-point increments`);
  return issues;
}

function validateSq(verdict: GeneratedSurfaceQualityVerdict): string[] {
  const requiredNames = [
    "frame_use",
    "corridors_and_air",
    "grouping",
    "color",
    "machinery_leakage",
    "alignment_and_rhythm",
    "edge_legibility",
  ];
  const issues = [
    ...validateScore(verdict.score),
    ...validateScore(verdict.calibration.gc, "calibration.gc"),
    ...validateScore(verdict.calibration.intent, "calibration.intent"),
  ];
  const names = verdict.sub_checks.map((item) => item.name);
  if (JSON.stringify(names) !== JSON.stringify(requiredNames)) {
    issues.push("sub_checks must contain the seven required names once, in rubric order");
  }
  for (const item of verdict.sub_checks) {
    issues.push(...validateScore(item.score, `sub_checks.${item.name}.score`));
    if (!item.note.trim()) issues.push(`sub_checks.${item.name}.note is empty`);
  }
  if (!verdict.delta_sentence.trim()) issues.push("delta_sentence is empty");
  if (!verdict.rank_order_sanity_note.trim()) issues.push("rank_order_sanity_note is empty");
  return issues;
}

function validateSystemReconstruction(
  reconstruction: GeneratedSystemReconstruction,
): string[] {
  const issues: string[] = [];
  if (!reconstruction.system_purpose.trim()) issues.push("system_purpose is empty");
  for (const [index, component] of reconstruction.components.entries()) {
    if (!component.name.trim()) issues.push(`components[${index}].name is empty`);
    if (!component.responsibility.trim()) {
      issues.push(`components[${index}].responsibility is empty`);
    }
    if (!component.visible_evidence.trim()) {
      issues.push(`components[${index}].visible_evidence is empty`);
    }
  }
  for (const [index, flow] of reconstruction.flows.entries()) {
    if (!flow.name.trim()) issues.push(`flows[${index}].name is empty`);
    if (flow.steps.length === 0) issues.push(`flows[${index}].steps is empty`);
    if (!flow.visible_evidence.trim()) {
      issues.push(`flows[${index}].visible_evidence is empty`);
    }
  }
  for (const [index, path] of reconstruction.failure_paths.entries()) {
    if (!path.trigger.trim()) issues.push(`failure_paths[${index}].trigger is empty`);
    if (path.path.length === 0) issues.push(`failure_paths[${index}].path is empty`);
    if (!path.outcome.trim()) issues.push(`failure_paths[${index}].outcome is empty`);
    if (!path.visible_evidence.trim()) {
      issues.push(`failure_paths[${index}].visible_evidence is empty`);
    }
  }
  for (const [index, constraint] of reconstruction.constraints.entries()) {
    if (!constraint.constraint.trim()) {
      issues.push(`constraints[${index}].constraint is empty`);
    }
    if (!constraint.visible_evidence.trim()) {
      issues.push(`constraints[${index}].visible_evidence is empty`);
    }
  }
  return issues;
}

function validateSf(verdict: GeneratedSystemFidelityVerdict): string[] {
  const issues = validateScore(verdict.score);
  if (verdict.elements.length === 0) issues.push("elements must atomize the non-empty brief");
  for (const [index, element] of verdict.elements.entries()) {
    if (!element.brief_element.trim()) issues.push(`elements[${index}].brief_element is empty`);
    if (!element.brief_evidence.trim()) issues.push(`elements[${index}].brief_evidence is empty`);
    if (!element.reconstruction_evidence.trim()) {
      issues.push(`elements[${index}].reconstruction_evidence is empty`);
    }
    if (!element.note.trim()) issues.push(`elements[${index}].note is empty`);
  }
  for (const [index, claim] of verdict.unsupported_claims.entries()) {
    if (!claim.claim.trim()) issues.push(`unsupported_claims[${index}].claim is empty`);
    if (!claim.reconstruction_evidence.trim()) {
      issues.push(`unsupported_claims[${index}].reconstruction_evidence is empty`);
    }
    if (!claim.why_unsupported.trim()) {
      issues.push(`unsupported_claims[${index}].why_unsupported is empty`);
    }
  }
  if (!verdict.strongest_transmitted_behavior.trim()) {
    issues.push("strongest_transmitted_behavior is empty");
  }
  if (!verdict.most_consequential_loss.trim()) {
    issues.push("most_consequential_loss is empty");
  }
  if (!verdict.overall_summary.trim()) issues.push("overall_summary is empty");
  return issues;
}

function validateRc(verdict: GeneratedRequirementCoverageVerdict): string[] {
  const issues = validateScore(verdict.score);
  if (verdict.requirements.length === 0) {
    issues.push("requirements must atomize the non-empty brief");
  }
  const expectedIds = verdict.requirements.map((_, index) => `R${index + 1}`);
  const actualIds = verdict.requirements.map((item) => item.id);
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    issues.push("requirements must use sequential R1, R2, … ids in brief order");
  }
  for (const [index, requirement] of verdict.requirements.entries()) {
    if (!requirement.requirement.trim()) {
      issues.push(`requirements[${index}].requirement is empty`);
    }
    if (!requirement.brief_evidence.trim()) {
      issues.push(`requirements[${index}].brief_evidence is empty`);
    }
    if (requirement.representation_evidence.length === 0) {
      issues.push(`requirement ${requirement.id} lacks PNG/JSON evidence`);
    }
    for (const [evidenceIndex, evidence] of requirement.representation_evidence.entries()) {
      if (!evidence.locator.trim() || !evidence.observation.trim()) {
        issues.push(
          `requirement ${requirement.id} evidence ${evidenceIndex + 1} lacks locator or observation`,
        );
      }
    }
  }
  if (!verdict.strongest_covered_cluster.trim()) {
    issues.push("strongest_covered_cluster is empty");
  }
  if (!verdict.most_consequential_gap.trim()) {
    issues.push("most_consequential_gap is empty");
  }
  if (!verdict.coverage_summary.trim()) issues.push("coverage_summary is empty");
  return issues;
}

function validateSd(verdict: GeneratedScopeDisciplineEditVerdict): string[] {
  const issues: string[] = [];
  if (verdict.scoring_status === "scored") {
    issues.push(...validateScore(verdict.score));
  } else if (verdict.score !== null && verdict.score !== undefined) {
    issues.push("excluded_refusal must have a null score");
  }
  if (verdict.requested_changes.length === 0) {
    issues.push("requested_changes must contain every atomic ask");
  }
  for (const [index, requirement] of verdict.requested_changes.entries()) {
    if (!requirement.requirement.trim()) {
      issues.push(`requested_changes[${index}].requirement is empty`);
    }
    if (requirement.evidence.length === 0) {
      issues.push(`requested_changes[${index}] lacks evidence`);
    }
  }
  for (const [index, change] of verdict.changes.entries()) {
    if (!change.object_id.trim()) issues.push(`changes[${index}].object_id is empty`);
    if (!change.what_changed.trim()) issues.push(`changes[${index}].what_changed is empty`);
    if (change.evidence.length === 0) issues.push(`changes[${index}] lacks evidence`);
  }
  const collateralCount = verdict.changes.filter((change) =>
    change.classification === "collateral_rework"
  ).length;
  if (verdict.collateral_change_count !== collateralCount) {
    issues.push(
      `collateral_change_count is ${verdict.collateral_change_count}, expected ${collateralCount}`,
    );
  }
  if (!verdict.scope_summary.trim()) issues.push("scope_summary is empty");
  return issues;
}

function validatePh(verdict: GeneratedPHVerdict): string[] {
  const issues = validateScore(verdict.score);
  const assessments = [
    verdict.failed_calls_retries.assessment,
    verdict.perception_loop.assessment,
    verdict.lint_etiquette.assessment,
    verdict.commit_honesty.assessment,
    verdict.economy.assessment,
    verdict.infra_exclusions.assessment,
  ];
  if (assessments.some((assessment) => !assessment.trim())) issues.push("every PH signal needs an assessment");
  const failed = verdict.failed_calls_retries;
  if (
    failed.failed_call_count + failed.rejected_call_count + failed.retry_count
      + failed.parse_validation_fight_count > 0
    && failed.moments.length === 0
  ) issues.push("failed-calls/retries findings need transcript moments");
  const perception = verdict.perception_loop;
  if (perception.render_count > 0 && perception.moments.length === 0) {
    issues.push("perception-loop findings need transcript moments");
  }
  const lint = verdict.lint_etiquette;
  if (
    lint.lint_error_count + lint.lint_fight_count + lint.reasoned_warning_override_count
      + lint.silent_warning_override_count > 0
    && lint.moments.length === 0
  ) issues.push("lint-etiquette findings need transcript moments");
  if (verdict.commit_honesty.commit_count > 0 && verdict.commit_honesty.summary_lines.length === 0) {
    issues.push("commit-honesty findings need verbatim summary lines");
  }
  if (verdict.economy.operation_count > 0 && verdict.economy.moments.length === 0) {
    issues.push("economy findings need transcript moments");
  }
  if (
    verdict.infra_exclusions.invalid_infra_session_count > 0
    && verdict.infra_exclusions.moments.length === 0
  ) issues.push("infra exclusions need transcript moments");
  return issues;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function applySfCaps(
  input: GeneratedSystemFidelityVerdict,
): { verdict: SystemFidelityVerdict; changed: boolean } {
  const hasDefiningContradiction = input.elements.some((element) =>
    element.importance === "system_defining" && element.status === "contradicted"
  );
  const mainFlowMissing = input.elements.some((element) =>
    element.is_main_end_to_end_flow
      && (element.status === "missed" || element.status === "contradicted")
  );
  let score = hasDefiningContradiction ? Math.min(input.score, 5) : input.score;
  if (mainFlowMissing) score = Math.min(score, 4);
  return {
    verdict: { ...input, score },
    changed: Math.abs(input.score - score) > 0.25,
  };
}

function recomputeRc(
  input: GeneratedRequirementCoverageVerdict,
): { verdict: RequirementCoverageVerdict; changed: boolean } {
  const totalWeight = input.requirements.reduce(
    (sum, requirement) => sum + (requirement.importance === "system_defining" ? 2 : 1),
    0,
  );
  const coveredWeight = input.requirements.reduce((sum, requirement) => {
    const weight = requirement.importance === "system_defining" ? 2 : 1;
    if (requirement.status === "represented") return sum + weight;
    if (requirement.status === "partial") return sum + weight / 2;
    return sum;
  }, 0);
  const coverageFraction = totalWeight > 0 ? round(coveredWeight / totalWeight, 4) : 0;
  let score = coverageFraction >= 1 ? 10
    : coverageFraction >= 0.95 ? 9
    : coverageFraction >= 0.90 ? 8
    : coverageFraction >= 0.82 ? 7
    : coverageFraction >= 0.72 ? 6
    : coverageFraction >= 0.60 ? 5
    : coverageFraction >= 0.45 ? 4
    : coverageFraction >= 0.30 ? 3
    : coverageFraction > 0 ? 2
    : 1;
  const caps = input.requirements.flatMap((requirement) => {
    if (requirement.importance !== "system_defining") return [];
    if (requirement.status === "contradicted") {
      return [{
        cap: 4,
        requirement_id: requirement.id,
        reason: "system-defining requirement is contradicted",
      }];
    }
    if (requirement.status === "absent") {
      return [{
        cap: 6,
        requirement_id: requirement.id,
        reason: "system-defining requirement is absent",
      }];
    }
    return [];
  });
  for (const cap of caps) score = Math.min(score, cap.cap);
  return {
    verdict: {
      ...input,
      coverage_fraction: coverageFraction,
      caps_applied: caps,
      score,
    },
    changed: Math.abs(input.score - score) > 0.25,
  };
}

function normalizeScopeDisciplineEdit(
  input: GeneratedScopeDisciplineEditVerdict,
): ScopeDisciplineEditVerdict {
  return {
    ...input,
    exclusion_reason: input.exclusion_reason ?? null,
    score: input.score ?? null,
  };
}

function calibrationDrift(verdict: SurfaceQualityVerdict): boolean {
  return Math.abs(verdict.calibration.gc - 7.5) > 0.5
    || Math.abs(verdict.calibration.intent - 7.0) > 0.5;
}

export async function loadBamlImages(images: JudgeImageInput[]): Promise<BamlImage[]> {
  return Promise.all(images.map(async (image) => {
    const bytes = await readFile(image.path);
    return Image.fromBase64("image/png", bytes.toString("base64"));
  }));
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  const temporary = resolve(dirname(path), `.${randomUUID()}.tmp`);
  await writeFile(temporary, contents, "utf8");
  await rename(temporary, path);
}

async function writeEnvelope(scenarioDir: string, envelope: AnyJudgeEnvelope): Promise<void> {
  await Promise.all([
    atomicWrite(
      resolve(scenarioDir, `judge-${envelope.axis}.json`),
      `${JSON.stringify(envelope, null, 2)}\n`,
    ),
    atomicWrite(
      resolve(scenarioDir, `judge-${envelope.axis}.md`),
      renderJudgeMarkdown(envelope),
    ),
  ]);
}

function skipFlag(reason: string): string {
  return `SKIPPED(${reason.replaceAll("\n", " ")})`;
}

function oneLineErrorReason(error: unknown): string {
  const reason = error instanceof Error ? error.message : errorText(error);
  return reason.replace(/\s+/g, " ").trim() || "unknown judge error";
}

function errorFlag(reason: string): string {
  return `ERROR(${reason})`;
}

function skippedEnvelope(
  axis: AxisCode,
  runId: string,
  scenario: ScenarioId,
  config: ResolvedJudgeClient,
  bamlFn: string,
  reason: string,
): AnyJudgeEnvelope {
  return {
    axis,
    scenario,
    run_id: runId,
    judge: judgeIdentity(config, bamlFn, 0),
    score: null,
    verdict: { skipped_reason: reason },
    usage: { input_tokens: 0, output_tokens: 0 },
    flags: [skipFlag(reason)],
  } as AnyJudgeEnvelope;
}

function errorEnvelope(
  axis: AxisCode,
  runId: string,
  scenario: ScenarioId,
  config: ResolvedJudgeClient,
  bamlFn: string,
  reason: string,
): AnyJudgeEnvelope {
  const envelope = skippedEnvelope(axis, runId, scenario, config, bamlFn, reason);
  envelope.flags = [errorFlag(reason)];
  return envelope;
}

export class JudgeRunner {
  readonly semaphore: Semaphore;
  readonly client: ResolvedJudgeClient;
  readonly runsRoot?: string;
  readonly registry: ClientRegistry;
  #fingerprintWrites = new Map<string, Promise<void>>();

  constructor(options: JudgeRunnerOptions = {}) {
    this.semaphore = new Semaphore(options.concurrency ?? 30);
    this.client = resolveJudgeClient(options.client);
    this.runsRoot = options.runsRoot;
    this.registry = runtimeClientRegistry(this.client);
  }

  async #callWithValidation<T>(params: {
    label: string;
    initial: (collector: Collector) => Promise<T>;
    afterError: (error: string, collector: Collector) => Promise<T>;
    validate: (value: T) => string[];
  }): Promise<BamlResult<T>> {
    let previousError: string | null = null;
    let usage: JudgeUsage = { input_tokens: 0, output_tokens: 0 };
    for (let attempt = 1; attempt <= MAX_VALIDATION_RETRIES + 1; attempt += 1) {
      const collector = new Collector(`${params.label}-attempt-${attempt}`);
      let usageCaptured = false;
      try {
        const value = await this.semaphore.run(() =>
          previousError
            ? params.afterError(previousError, collector)
            : params.initial(collector)
        );
        usage = sumUsage(usage, collectorUsage(collector));
        usageCaptured = true;
        const issues = params.validate(value);
        if (issues.length > 0) throw new OutputValidationError(issues);
        return { value, usage, attempts: attempt };
      } catch (error: unknown) {
        if (!usageCaptured) usage = sumUsage(usage, collectorUsage(collector));
        if (!isBamlValidationFailure(error) || attempt > MAX_VALIDATION_RETRIES) throw error;
        previousError = errorText(error).slice(-6000);
      }
    }
    throw new Error("Unreachable validation retry loop");
  }

  #callOptions(collector: Collector, axis: AxisCode, scenario: ScenarioId) {
    return {
      clientRegistry: this.registry,
      collector,
      env: runtimeEnv(this.client),
      tags: {
        pipeline: "eval-suite",
        axis,
        scenario,
      },
    };
  }

  async #recordJudgeFingerprint(runDir: string): Promise<void> {
    const existing = this.#fingerprintWrites.get(runDir);
    if (existing) return existing;
    const pending = (async () => {
      const path = resolve(runDir, "fingerprint.md");
      if (!existsSync(path)) return;
      const current = await readFile(path, "utf8");
      const line = `- judge client: model \`${this.client.model}\`, effort \`${this.client.effort}\`, base URL \`${this.client.baseUrl}\``;
      const updated = /^- judge client:.*$/m.test(current)
        ? current.replace(/^- judge client:.*$/m, line)
        : `${current.trimEnd()}\n${line}\n`;
      if (updated !== current) await atomicWrite(path, updated);
    })();
    this.#fingerprintWrites.set(runDir, pending);
    return pending;
  }

  async #runAtAxisBoundary(
    axis: AxisCode,
    runId: string,
    scenario: ScenarioId,
    scenarioDir: string,
    bamlFn: string,
    run: () => Promise<AnyJudgeEnvelope>,
  ): Promise<AnyJudgeEnvelope> {
    try {
      return await run();
    } catch (error: unknown) {
      const reason = oneLineErrorReason(error);
      const envelope = errorEnvelope(
        axis,
        runId,
        scenario,
        this.client,
        bamlFn,
        reason,
      );
      await writeEnvelope(scenarioDir, envelope);
      return envelope;
    }
  }

  async #runRd(
    runId: string,
    scenario: ScenarioId,
    scenarioDir: string,
    input: PreparedJudgeInput,
    rubric: string,
    sharedRules: string,
  ): Promise<JudgeEnvelope<"rd", SurfaceQualityVerdict>> {
    if (input.skip_reason) {
      const envelope = skippedEnvelope(
        "rd",
        runId,
        scenario,
        this.client,
        "JudgeSurfaceQuality",
        input.skip_reason,
      ) as JudgeEnvelope<"rd", SurfaceQualityVerdict>;
      await writeEnvelope(scenarioDir, envelope);
      return envelope;
    }
    const images = await loadBamlImages(input.images);
    const fire = () => this.#callWithValidation({
      label: `${runId}-${scenario}-rd`,
      initial: (collector) =>
        b.JudgeSurfaceQuality(
          rubric,
          sharedRules,
          input.payload,
          images,
          this.#callOptions(collector, "rd", scenario),
        ),
      afterError: (error, collector) =>
        b.JudgeSurfaceQualityAfterError(
          error,
          rubric,
          sharedRules,
          input.payload,
          images,
          this.#callOptions(collector, "rd", scenario),
        ),
      validate: validateSq,
    });
    let result = await fire();
    let totalAttempts = result.attempts;
    let totalUsage = result.usage;
    if (calibrationDrift(result.value)) {
      try {
        const calibrationRetry = await fire();
        result = calibrationRetry;
        totalAttempts += calibrationRetry.attempts;
        totalUsage = sumUsage(totalUsage, calibrationRetry.usage);
      } catch {
        // The valid first verdict remains the only defensible record when re-calibration fails.
      }
    }
    const verdict: SurfaceQualityVerdict = result.value;
    const envelope: JudgeEnvelope<"rd", SurfaceQualityVerdict> = {
      axis: "rd",
      scenario,
      run_id: runId,
      judge: judgeIdentity(this.client, "JudgeSurfaceQuality", totalAttempts),
      score: verdict.score,
      verdict,
      usage: totalUsage,
      flags: calibrationDrift(verdict) ? ["CAL-DRIFT"] : [],
    };
    await writeEnvelope(scenarioDir, envelope);
    return envelope;
  }

  async #runSf(
    runId: string,
    scenario: ScenarioId,
    scenarioDir: string,
    blindInput: PreparedJudgeInput,
    scorerBase: PreparedJudgeInput,
    rubric: string,
    sharedRules: string,
  ): Promise<JudgeEnvelope<"sf", SystemFidelityVerdict>> {
    const missing = [blindInput.skip_reason, scorerBase.skip_reason]
      .filter((item): item is string => Boolean(item));
    if (missing.length > 0) {
      const reason = missing.join("; ");
      const envelope = skippedEnvelope(
        "sf",
        runId,
        scenario,
        this.client,
        "ReconstructSystem → ScoreSystemFidelity",
        reason,
      ) as JudgeEnvelope<"sf", SystemFidelityVerdict>;
      await writeEnvelope(scenarioDir, envelope);
      return envelope;
    }
    if (blindInput.images.length !== 1) {
      throw new Error(`SF blind requires exactly one image, got ${blindInput.images.length}`);
    }
    const blindImages = await loadBamlImages(blindInput.images);
    const blind = await this.#callWithValidation({
      label: `${runId}-${scenario}-sf-blind`,
      initial: (collector) =>
        b.ReconstructSystem(
          blindInput.payload,
          blindImages,
          this.#callOptions(collector, "sf", scenario),
        ),
      afterError: (error, collector) =>
        b.ReconstructSystemAfterError(
          error,
          blindInput.payload,
          blindImages,
          this.#callOptions(collector, "sf", scenario),
        ),
      validate: validateSystemReconstruction,
    });
    const reconstruction: SystemReconstruction = blind.value;
    await atomicWrite(
      resolve(scenarioDir, "sf-reconstruction.md"),
      renderSystemReconstructionMarkdown(reconstruction),
    );
    const scorerPayload = buildSystemFidelityScorerPayload(scorerBase, reconstruction);
    const scored = await this.#callWithValidation({
      label: `${runId}-${scenario}-sf-scorer`,
      initial: (collector) =>
        b.ScoreSystemFidelity(
          rubric,
          sharedRules,
          scorerPayload,
          [],
          this.#callOptions(collector, "sf", scenario),
        ),
      afterError: (error, collector) =>
        b.ScoreSystemFidelityAfterError(
          error,
          rubric,
          sharedRules,
          scorerPayload,
          [],
          this.#callOptions(collector, "sf", scenario),
        ),
      validate: validateSf,
    });
    const capped = applySfCaps(scored.value);
    const envelope: JudgeEnvelope<"sf", SystemFidelityVerdict> = {
      axis: "sf",
      scenario,
      run_id: runId,
      judge: judgeIdentity(
        this.client,
        "ReconstructSystem → ScoreSystemFidelity",
        blind.attempts + scored.attempts,
      ),
      score: capped.verdict.score,
      verdict: capped.verdict,
      usage: sumUsage(blind.usage, scored.usage),
      flags: capped.changed ? ["SCORE-RECOMPUTED"] : [],
    };
    await writeEnvelope(scenarioDir, envelope);
    return envelope;
  }

  async #runRc(
    runId: string,
    scenario: ScenarioId,
    scenarioDir: string,
    input: PreparedJudgeInput,
    rubric: string,
    sharedRules: string,
  ): Promise<JudgeEnvelope<"rc", RequirementCoverageVerdict>> {
    if (input.skip_reason) {
      const envelope = skippedEnvelope(
        "rc",
        runId,
        scenario,
        this.client,
        "JudgeRequirementCoverage",
        input.skip_reason,
      ) as JudgeEnvelope<"rc", RequirementCoverageVerdict>;
      await writeEnvelope(scenarioDir, envelope);
      return envelope;
    }
    const images = await loadBamlImages(input.images);
    const result = await this.#callWithValidation({
      label: `${runId}-${scenario}-rc`,
      initial: (collector) =>
        b.JudgeRequirementCoverage(
          rubric,
          sharedRules,
          input.payload,
          images,
          this.#callOptions(collector, "rc", scenario),
        ),
      afterError: (error, collector) =>
        b.JudgeRequirementCoverageAfterError(
          error,
          rubric,
          sharedRules,
          input.payload,
          images,
          this.#callOptions(collector, "rc", scenario),
        ),
      validate: validateRc,
    });
    const recomputed = recomputeRc(result.value);
    const envelope: JudgeEnvelope<"rc", RequirementCoverageVerdict> = {
      axis: "rc",
      scenario,
      run_id: runId,
      judge: judgeIdentity(this.client, "JudgeRequirementCoverage", result.attempts),
      score: recomputed.verdict.score,
      verdict: recomputed.verdict,
      usage: result.usage,
      flags: recomputed.changed ? ["SCORE-RECOMPUTED"] : [],
    };
    await writeEnvelope(scenarioDir, envelope);
    return envelope;
  }

  async #runSd(
    runId: string,
    scenario: ScenarioId,
    scenarioDir: string,
    inputs: Awaited<ReturnType<typeof gatherScenarioJudgeInputs>>,
  ): Promise<JudgeEnvelope<"sd", ScopeDisciplineVerdict>> {
    if (inputs.scope_discipline_edits.length === 0) {
      const reason = inputs.skipped_scope_discipline_edits
        .map((item) => `${item.stage}: ${item.reason}`)
        .join("; ") || "no scorable follow-up edits";
      const envelope = skippedEnvelope(
        "sd",
        runId,
        scenario,
        this.client,
        "JudgeScopeDiscipline",
        reason,
      ) as JudgeEnvelope<"sd", ScopeDisciplineVerdict>;
      await writeEnvelope(scenarioDir, envelope);
      return envelope;
    }
    const results = await Promise.all(inputs.scope_discipline_edits.map(async (input) => {
      const images = await loadBamlImages(input.images);
      const result = await this.#callWithValidation({
        label: `${runId}-${scenario}-sd-${input.stage}`,
        initial: (collector) =>
          b.JudgeScopeDiscipline(
            inputs.rubrics.sd,
            inputs.shared_rules,
            input.payload,
            images,
            this.#callOptions(collector, "sd", scenario),
          ),
        afterError: (error, collector) =>
          b.JudgeScopeDisciplineAfterError(
            error,
            inputs.rubrics.sd,
            inputs.shared_rules,
            input.payload,
            images,
            this.#callOptions(collector, "sd", scenario),
          ),
        validate: validateSd,
      });
      return {
        stage: input.stage,
        verdict: normalizeScopeDisciplineEdit(result.value),
        attempts: result.attempts,
        usage: result.usage,
      };
    }));
    const scores = results.flatMap((result) =>
      result.verdict.scoring_status === "scored" && result.verdict.score !== null
        ? [result.verdict.score]
        : []
    );
    if (scores.length === 0) {
      const reason = "all completed edits were excluded honest refusals";
      const envelope = skippedEnvelope(
        "sd",
        runId,
        scenario,
        this.client,
        "JudgeScopeDiscipline",
        reason,
      ) as JudgeEnvelope<"sd", ScopeDisciplineVerdict>;
      envelope.judge.attempts = results.reduce((sum, result) => sum + result.attempts, 0);
      envelope.usage = results.reduce(
        (usage, result) => sumUsage(usage, result.usage),
        { input_tokens: 0, output_tokens: 0 },
      );
      await writeEnvelope(scenarioDir, envelope);
      return envelope;
    }
    const score = roundHalf(scores.reduce((sum, value) => sum + value, 0) / scores.length);
    const verdict: ScopeDisciplineVerdict = {
      edits: results.map(({ stage, verdict: editVerdict }) => ({
        stage,
        verdict: editVerdict,
      })),
      score,
    };
    const envelope: JudgeEnvelope<"sd", ScopeDisciplineVerdict> = {
      axis: "sd",
      scenario,
      run_id: runId,
      judge: judgeIdentity(
        this.client,
        "JudgeScopeDiscipline",
        results.reduce((sum, result) => sum + result.attempts, 0),
      ),
      score,
      verdict,
      usage: results.reduce(
        (usage, result) => sumUsage(usage, result.usage),
        { input_tokens: 0, output_tokens: 0 },
      ),
      flags: inputs.skipped_scope_discipline_edits.map((item) =>
        skipFlag(`${item.stage}: ${item.reason}`)
      ),
    };
    await writeEnvelope(scenarioDir, envelope);
    return envelope;
  }

  async #runPh(
    runId: string,
    scenario: ScenarioId,
    scenarioDir: string,
    input: PreparedJudgeInput,
    rubric: string,
    sharedRules: string,
  ): Promise<JudgeEnvelope<"ph", PHVerdict>> {
    if (input.skip_reason) {
      const envelope = skippedEnvelope(
        "ph",
        runId,
        scenario,
        this.client,
        "JudgePromptHygiene",
        input.skip_reason,
      ) as JudgeEnvelope<"ph", PHVerdict>;
      await writeEnvelope(scenarioDir, envelope);
      return envelope;
    }
    const result = await this.#callWithValidation({
      label: `${runId}-${scenario}-ph`,
      initial: (collector) =>
        b.JudgePromptHygiene(
          rubric,
          sharedRules,
          input.payload,
          [],
          this.#callOptions(collector, "ph", scenario),
        ),
      afterError: (error, collector) =>
        b.JudgePromptHygieneAfterError(
          error,
          rubric,
          sharedRules,
          input.payload,
          [],
          this.#callOptions(collector, "ph", scenario),
        ),
      validate: validatePh,
    });
    const verdict: PHVerdict = result.value;
    const envelope: JudgeEnvelope<"ph", PHVerdict> = {
      axis: "ph",
      scenario,
      run_id: runId,
      judge: judgeIdentity(this.client, "JudgePromptHygiene", result.attempts),
      score: verdict.score,
      verdict,
      usage: result.usage,
      flags: [],
    };
    await writeEnvelope(scenarioDir, envelope);
    return envelope;
  }

  async runScenario(options: RunScenarioJudgeOptions): Promise<AnyJudgeEnvelope[]> {
    const inputs = await gatherScenarioJudgeInputs({
      runId: options.runId,
      scenario: options.scenario,
      runsRoot: this.runsRoot,
    });
    await this.#recordJudgeFingerprint(dirname(inputs.scenario_dir));
    const scenario = inputs.scenario;
    const phTask = this.#runAtAxisBoundary(
      "ph",
      options.runId,
      scenario,
      inputs.scenario_dir,
      "JudgePromptHygiene",
      () => this.#runPh(
        options.runId,
        scenario,
        inputs.scenario_dir,
        inputs.prompt_hygiene,
        inputs.rubrics.ph,
        inputs.shared_rules,
      ),
    );
    const tasks = [
        this.#runAtAxisBoundary(
          "sf",
          options.runId,
          scenario,
          inputs.scenario_dir,
          "ReconstructSystem → ScoreSystemFidelity",
          () => this.#runSf(
            options.runId,
            scenario,
            inputs.scenario_dir,
            inputs.sf_blind,
            inputs.sf_scorer_base,
            inputs.rubrics.sf,
            inputs.shared_rules,
          ),
        ),
        this.#runAtAxisBoundary(
          "rc",
          options.runId,
          scenario,
          inputs.scenario_dir,
          "JudgeRequirementCoverage",
          () => this.#runRc(
            options.runId,
            scenario,
            inputs.scenario_dir,
            inputs.requirement_coverage,
            inputs.rubrics.rc,
            inputs.shared_rules,
          ),
        ),
        this.#runAtAxisBoundary(
          "rd",
          options.runId,
          scenario,
          inputs.scenario_dir,
          "JudgeSurfaceQuality",
          () => this.#runRd(
            options.runId,
            scenario,
            inputs.scenario_dir,
            inputs.readability,
            inputs.rubrics.rd,
            inputs.shared_rules,
          ),
        ),
        this.#runAtAxisBoundary(
          "sd",
          options.runId,
          scenario,
          inputs.scenario_dir,
          "JudgeScopeDiscipline",
          () => this.#runSd(options.runId, scenario, inputs.scenario_dir, inputs),
        ),
        phTask,
      ];
    return Promise.all(tasks);
  }
}

export function createJudgeRunner(options: JudgeRunnerOptions = {}): JudgeRunner {
  return new JudgeRunner(options);
}

export async function runScenarioJudges(
  options: RunScenarioJudgeOptions & JudgeRunnerOptions,
): Promise<AnyJudgeEnvelope[]> {
  const runner = createJudgeRunner(options);
  return runner.runScenario(options);
}
