import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReasoningEffort } from "./contract.ts";
import { reconcileJudgeProgress } from "./judge/progress.ts";
import {
  createJudgeRunner,
  type JudgeClientConfig,
} from "./judge/run_judges.ts";

const RUNNER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUNS_ROOT = resolve(RUNNER_ROOT, "..", "runs");
const EFFORTS = new Set<ReasoningEffort>([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

interface JudgeArgs {
  runId: string;
  scenario?: string;
  concurrency: number;
  client: JudgeClientConfig;
}

function usage(): string {
  return [
    "Usage:",
    "  bun run src/cli.ts suite --run-id <id> [--sut-thinking low] [--tool-call-cap <1|2|3>] [--scenarios <names>] [--parallel 8] [--judge-concurrency 30] [--previous <run-id>]",
    "  bun run src/cli.ts judge --run-id <id> [--scenario <name>] [--judge-concurrency 30] [--judge-model <id>] [--judge-base-url <url>] [--judge-effort low]",
    "  bun run src/cli.ts scorecard --run-id <id> [--previous <run-id>]",
    "  bun run src/cli.ts clean --run-id <id> | --all",
  ].join("\n");
}

function valueAfter(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

function parseJudgeArgs(argv: string[]): JudgeArgs {
  let runId: string | undefined;
  let scenario: string | undefined;
  let concurrency = 30;
  const client: JudgeClientConfig = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--run-id") {
      runId = valueAfter(argv, index, flag);
      index += 1;
    } else if (flag === "--scenario") {
      scenario = valueAfter(argv, index, flag);
      index += 1;
    } else if (flag === "--judge-concurrency") {
      concurrency = positiveInteger(valueAfter(argv, index, flag), flag);
      index += 1;
    } else if (flag === "--judge-model") {
      client.model = valueAfter(argv, index, flag);
      index += 1;
    } else if (flag === "--judge-base-url") {
      client.baseUrl = valueAfter(argv, index, flag);
      index += 1;
    } else if (flag === "--judge-effort") {
      const effort = valueAfter(argv, index, flag) as ReasoningEffort;
      if (!EFFORTS.has(effort)) throw new Error(`Unsupported judge effort: ${effort}`);
      client.effort = effort;
      index += 1;
    } else {
      throw new Error(`Unknown judge argument: ${flag}`);
    }
  }
  if (!runId) throw new Error(`Missing --run-id\n\n${usage()}`);
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9._-]*$/.test(runId)) {
    throw new Error(`Invalid run id: ${runId}`);
  }
  return { runId, scenario, concurrency, client };
}

async function scenariosForRun(runId: string, requested?: string): Promise<string[]> {
  const runDir = resolve(RUNS_ROOT, runId);
  if (!existsSync(runDir)) throw new Error(`Run directory does not exist: ${runDir}`);
  const progressPath = resolve(runDir, "run_progress.json");
  const progress = JSON.parse(await readFile(progressPath, "utf8")) as {
    run_id?: unknown;
    scenarios?: unknown;
  };
  if (progress.run_id !== runId) {
    throw new Error(
      `${progressPath} has run_id ${JSON.stringify(progress.run_id)}, expected ${runId}`,
    );
  }
  if (
    progress.scenarios === null ||
    typeof progress.scenarios !== "object" ||
    Array.isArray(progress.scenarios)
  ) {
    throw new Error(`${progressPath} has no scenario records`);
  }
  const recordedScenarios = Object.keys(progress.scenarios);
  if (requested) {
    if (!recordedScenarios.includes(requested)) {
      throw new Error(`Scenario ${requested} is not recorded in ${progressPath}`);
    }
    recordedScenarios.splice(0, recordedScenarios.length, requested);
  }
  for (const scenario of recordedScenarios) {
    const scenarioDir = resolve(runDir, scenario);
    if (dirname(scenarioDir) !== runDir || !existsSync(scenarioDir)) {
      throw new Error(`Scenario directory does not exist: ${scenarioDir}`);
    }
  }
  return recordedScenarios;
}

async function runJudgeCommand(argv: string[]): Promise<void> {
  const args = parseJudgeArgs(argv);
  const scenarios = await scenariosForRun(args.runId, args.scenario);
  if (scenarios.length === 0) throw new Error(`No scenario directories found for ${args.runId}`);
  const runner = createJudgeRunner({
    concurrency: args.concurrency,
    client: args.client,
  });
  const results = await Promise.all(
    scenarios.map((scenario) => runner.runScenario({ runId: args.runId, scenario })),
  );
  await reconcileJudgeProgress({
    runDir: resolve(RUNS_ROOT, args.runId),
    runId: args.runId,
    scenarios,
  });
  for (const envelopes of results) {
    const summary = envelopes
      .map((envelope) => `${envelope.axis.toUpperCase()}=${envelope.score ?? "SKIPPED"}`)
      .join(" ");
    process.stdout.write(`${envelopes[0]?.scenario ?? "unknown"} ${summary}\n`);
  }
}

async function runSuiteStub(argv: string[]): Promise<void> {
  const module = await import("./scenario/suite.ts");
  await module.runSuiteSubcommand(argv);
}

async function runScorecardStub(argv: string[]): Promise<void> {
  const module = await import("./scorecard/command.ts");
  await module.runScorecardSubcommand(argv);
}

async function runCleanStub(argv: string[]): Promise<void> {
  const module = await import("./scenario/suite.ts");
  await module.runCleanSubcommand(argv);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const [subcommand, ...rest] = argv;
  if (subcommand === "judge") await runJudgeCommand(rest);
  else if (subcommand === "suite") await runSuiteStub(rest);
  else if (subcommand === "scorecard") await runScorecardStub(rest);
  else if (subcommand === "clean") await runCleanStub(rest);
  else if (subcommand === "--help" || subcommand === "-h") process.stdout.write(`${usage()}\n`);
  else throw new Error(usage());
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
