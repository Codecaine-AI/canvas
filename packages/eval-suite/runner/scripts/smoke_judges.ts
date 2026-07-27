import { Collector, type HTTPRequest } from "@boundaryml/baml";
import { b } from "../baml_client/index.js";
import type { SystemReconstruction } from "../src/contract.ts";
import {
  buildSystemFidelityScorerPayload,
  gatherScenarioJudgeInputs,
  type PreparedJudgeInput,
} from "../src/judge/inputs.ts";
import {
  loadBamlImages,
  resolveJudgeClient,
  runtimeClientRegistry,
} from "../src/judge/run_judges.ts";

const DEFAULT_RUN_ID = "2026-07-23-system-smoke";
const DEFAULT_SCENARIO = "incident-response";

const VERDICT_SCHEMAS = {
  sf_blind: {
    system_purpose: "string",
    components: "{name,responsibility,visible_evidence}[]",
    flows: "{name,kind,steps,visible_evidence}[]",
    failure_paths: "{trigger,path,outcome,visible_evidence}[]",
    constraints: "{constraint,visible_evidence}[]",
    uncertain: "{observation,ambiguity}[]",
  },
  sf_scorer: {
    elements:
      "{brief_element,brief_evidence,importance,is_main_end_to_end_flow,status,reconstruction_evidence,note}[]",
    unsupported_claims: "{claim,reconstruction_evidence,why_unsupported}[]",
    strongest_transmitted_behavior: "string",
    most_consequential_loss: "string",
    overall_summary: "string",
    score: "float",
  },
  requirement_coverage: {
    requirements:
      "{id,requirement,brief_evidence,importance,status,representation_evidence[],note}[]",
    coverage_fraction: "float",
    caps_applied: "{cap,requirement_id,reason}[]",
    strongest_covered_cluster: "string",
    most_consequential_gap: "string",
    coverage_summary: "string",
    score: "float",
  },
  readability: {
    calibration: { gc: "float", intent: "float" },
    score: "float",
    delta_sentence: "string",
    sub_checks: "7 × {name, score, note}",
    rank_order_sanity_note: "string",
  },
  scope_discipline: {
    requested_changes: "{requirement,status,evidence[],note}[]",
    changes: "{object_id,object_kind,classification,what_changed,impact,declared,evidence[]}[]",
    collateral_change_count: "int",
    scope_summary: "string",
    scoring_status: "scored | excluded_refusal",
    exclusion_reason: "string | null",
    score: "float | null",
  },
  prompt_hygiene: {
    failed_calls_retries: "assessment + counts + moments",
    perception_loop: "assessment + counts + moments",
    lint_etiquette: "assessment + counts + moments",
    commit_honesty: "assessment + counts + verbatim summary_lines + moments",
    economy: "assessment + counts + wall_time_minutes + moments",
    infra_exclusions: "assessment + invalid-infra count + moments",
    score: "float",
  },
} as const;

interface SmokeArgs {
  runId: string;
  scenario: string;
  live: boolean;
}

function parseArgs(argv: string[]): SmokeArgs {
  let runId = DEFAULT_RUN_ID;
  let scenario = DEFAULT_SCENARIO;
  let live = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`${flag} requires a value`);
      index += 1;
      return next;
    };
    if (flag === "--run-id") runId = value();
    else if (flag === "--scenario") scenario = value();
    else if (flag === "--live") live = true;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return { runId, scenario, live };
}

function redactImageData(value: unknown): unknown {
  if (typeof value === "string" && value.startsWith("data:image/")) {
    return `[inline image redacted; ${value.length} characters]`;
  }
  if (Array.isArray(value)) return value.map(redactImageData);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, redactImageData(item)]),
    );
  }
  return value;
}

function requestPreview(name: string, request: HTTPRequest): void {
  process.stdout.write(`\n===== ${name} =====\n`);
  process.stdout.write(`${JSON.stringify({
    method: request.method,
    url: request.url,
    headers: request.headers,
    body: redactImageData(request.body.json()),
  }, null, 2)}\n`);
}

const EMPTY_SYSTEM_RECONSTRUCTION: SystemReconstruction = {
  system_purpose: "Smoke placeholder system reconstruction",
  components: [],
  flows: [],
  failure_paths: [],
  constraints: [],
  uncertain: [],
};

async function images(input: PreparedJudgeInput) {
  return input.skip_reason ? [] : loadBamlImages(input.images);
}

function inputSummary(input: PreparedJudgeInput) {
  let payload: unknown = input.payload;
  try {
    payload = JSON.parse(input.payload) as unknown;
  } catch {
    // Blind reconstruction prompts are intentionally plain text.
  }
  return {
    skip: input.skip_reason,
    payload,
    images: input.images.map(({ index, label }) => ({ index, label })),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const inputs = await gatherScenarioJudgeInputs({
    runId: args.runId,
    scenario: args.scenario,
  });
  const client = resolveJudgeClient();
  const clientRegistry = runtimeClientRegistry(client);
  const requestOptions = {
    clientRegistry,
    env: {
      CODEX_LB_API_KEY: client.apiKey,
      OPENAI_API_KEY: client.apiKey,
    },
  };

  process.stdout.write("===== SYSTEM INPUT MANIFEST =====\n");
  process.stdout.write(`${JSON.stringify({
    run_id: inputs.run_id,
    scenario: inputs.scenario,
    final_stage: inputs.final_stage,
    system_fidelity: {
      blind: inputSummary(inputs.sf_blind),
      scorer_base: inputSummary(inputs.sf_scorer_base),
    },
    requirement_coverage: inputSummary(inputs.requirement_coverage),
    readability: inputSummary(inputs.readability),
    scope_discipline: {
      edits: inputs.scope_discipline_edits.map((edit) => ({
        stage: edit.stage,
        ...inputSummary(edit),
      })),
      skipped_edits: inputs.skipped_scope_discipline_edits,
    },
    prompt_hygiene: inputSummary(inputs.prompt_hygiene),
  }, null, 2)}\n`);

  process.stdout.write("\n===== SYSTEM VERDICT SCHEMAS =====\n");
  process.stdout.write(`${JSON.stringify(VERDICT_SCHEMAS, null, 2)}\n`);

  requestPreview(
    "SF ReconstructSystem prompt + schema",
    await b.request.ReconstructSystem(
      inputs.sf_blind.payload,
      await images(inputs.sf_blind),
      requestOptions,
    ),
  );

  requestPreview(
    "SF ScoreSystemFidelity prompt + schema",
    await b.request.ScoreSystemFidelity(
      inputs.rubrics.sf,
      inputs.shared_rules,
      buildSystemFidelityScorerPayload(
        inputs.sf_scorer_base,
        EMPTY_SYSTEM_RECONSTRUCTION,
      ),
      [],
      requestOptions,
    ),
  );

  requestPreview(
    "RC JudgeRequirementCoverage prompt + schema",
    await b.request.JudgeRequirementCoverage(
      inputs.rubrics.rc,
      inputs.shared_rules,
      inputs.requirement_coverage.payload,
      await images(inputs.requirement_coverage),
      requestOptions,
    ),
  );

  const readabilityImages = await images(inputs.readability);
  requestPreview(
    "RD JudgeSurfaceQuality prompt + schema",
    await b.request.JudgeSurfaceQuality(
      inputs.rubrics.rd,
      inputs.shared_rules,
      inputs.readability.payload,
      readabilityImages,
      requestOptions,
    ),
  );

  for (const edit of inputs.scope_discipline_edits) {
    requestPreview(
      `SD JudgeScopeDiscipline ${edit.stage} prompt + schema`,
      await b.request.JudgeScopeDiscipline(
        inputs.rubrics.sd,
        inputs.shared_rules,
        edit.payload,
        await images(edit),
        requestOptions,
      ),
    );
  }

  requestPreview(
    "PH JudgePromptHygiene prompt + schema",
    await b.request.JudgePromptHygiene(
      inputs.rubrics.ph,
      inputs.shared_rules,
      inputs.prompt_hygiene.payload,
      [],
      requestOptions,
    ),
  );

  if (args.live) {
    if (inputs.readability.skip_reason) {
      throw new Error(`Cannot run live RD smoke: ${inputs.readability.skip_reason}`);
    }
    const collector = new Collector(`smoke-${inputs.run_id}-${inputs.scenario}-rd`);
    const verdict = await b.JudgeSurfaceQuality(
      inputs.rubrics.rd,
      inputs.shared_rules,
      inputs.readability.payload,
      readabilityImages,
      {
        ...requestOptions,
        collector,
        tags: { pipeline: "eval-suite-smoke", axis: "rd", scenario: inputs.scenario },
      },
    );
    process.stdout.write("\n===== LIVE RD VERDICT =====\n");
    process.stdout.write(`${JSON.stringify({
      verdict,
      usage: {
        input_tokens: collector.usage.inputTokens ?? 0,
        output_tokens: collector.usage.outputTokens ?? 0,
      },
    }, null, 2)}\n`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
