import { lstat, readdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";

import {
  SUT_THINKING_LEVELS,
  TOOL_CALL_CAPS,
  type ReasoningEffort,
  type ScenarioId,
  type SutThinkingLevel,
  type ToolCallCap,
  type ToolCallCapSource,
} from "../contract.ts";
import {
  EVAL_CANVASES_DIR,
  REPO_ROOT,
  RUNS_DIR,
  boardIdFor,
  canonicalizeRunId,
  discoverScenarios,
  normalizeScenarioId,
} from "./scenario.ts";
import {
  runStubQueue,
  runSuiteQueue,
  type JudgeClientOptions,
} from "./queue.ts";
import { createStatusDisplay } from "./status_display.ts";

interface SuiteCommandOptions {
  runId: string;
  sutThinking: SutThinkingLevel;
  sutThinkingSource: "eval default" | "--sut-thinking";
  toolCallCap: ToolCallCap;
  toolCallCapSource: ToolCallCapSource;
  scenarios?: ScenarioId[];
  parallel: number;
  judgeConcurrency: number;
  previous?: string;
  dryRun: boolean;
  judgeClient: JudgeClientOptions;
}

const REASONING_EFFORTS = new Set<ReasoningEffort>([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);
const SUT_THINKING_LEVEL_SET = new Set<SutThinkingLevel>(SUT_THINKING_LEVELS);
const TOOL_CALL_CAP_VALUES = new Set<string>(TOOL_CALL_CAPS.map(String));

function valueAfter(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function parsePositiveInteger(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return value;
}

export function parseSuiteArgs(argv: string[]): SuiteCommandOptions {
  let runId: string | undefined;
  let rawScenarios: string[] | undefined;
  let sutThinking: SutThinkingLevel = "low";
  let sutThinkingSource: SuiteCommandOptions["sutThinkingSource"] = "eval default";
  let toolCallCap: ToolCallCap = 3;
  let toolCallCapSource: ToolCallCapSource = "agent default";
  let parallel = 8;
  let judgeConcurrency = 30;
  let previous: string | undefined;
  let dryRun = false;
  const judgeClient: JudgeClientOptions = {
    model: "gpt-5.6-sol",
    baseUrl: "http://127.0.0.1:2455/v1",
    effort: "low",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    switch (flag) {
      case "--run-id":
        runId = canonicalizeRunId(valueAfter(argv, index, flag));
        index += 1;
        break;
      case "--scenarios": {
        rawScenarios = valueAfter(argv, index, flag)
          .split(",")
          .map((value) => value.trim());
        index += 1;
        break;
      }
      case "--sut-thinking": {
        const thinking = valueAfter(argv, index, flag) as SutThinkingLevel;
        if (!SUT_THINKING_LEVEL_SET.has(thinking)) {
          throw new Error(`Unsupported SUT thinking level: ${thinking}.`);
        }
        sutThinking = thinking;
        sutThinkingSource = "--sut-thinking";
        index += 1;
        break;
      }
      case "--tool-call-cap": {
        const rawCap = valueAfter(argv, index, flag);
        if (!TOOL_CALL_CAP_VALUES.has(rawCap)) {
          throw new Error(`${flag} must be 1, 2, or 3.`);
        }
        toolCallCap = Number(rawCap) as ToolCallCap;
        toolCallCapSource = "--tool-call-cap";
        index += 1;
        break;
      }
      case "--parallel":
        parallel = parsePositiveInteger(valueAfter(argv, index, flag), flag);
        index += 1;
        break;
      case "--judge-concurrency":
        judgeConcurrency = parsePositiveInteger(valueAfter(argv, index, flag), flag);
        index += 1;
        break;
      case "--previous":
        previous = canonicalizeRunId(valueAfter(argv, index, flag));
        index += 1;
        break;
      case "--judge-model":
        judgeClient.model = valueAfter(argv, index, flag);
        index += 1;
        break;
      case "--judge-base-url":
        judgeClient.baseUrl = valueAfter(argv, index, flag);
        index += 1;
        break;
      case "--judge-effort": {
        const effort = valueAfter(argv, index, flag) as ReasoningEffort;
        if (!REASONING_EFFORTS.has(effort)) {
          throw new Error(`Unsupported judge effort: ${effort}.`);
        }
        judgeClient.effort = effort;
        index += 1;
        break;
      }
      case "--teardown":
        // Accepted for compatibility and ignored: the run's services are
        // spawned per run and always stopped when the run ends.
        break;
      case "--dry-run":
        dryRun = true;
        break;
      default:
        throw new Error(`Unknown suite argument: ${flag}`);
    }
  }
  if (!runId) {
    throw new Error(
      "Usage: suite --run-id <id> [--sut-thinking <level>] [--tool-call-cap <1|2|3>] [--scenarios <names>] [--parallel 8] [--judge-concurrency 30]",
    );
  }
  const scenarios = rawScenarios
    ? [...new Set(rawScenarios.map((value) => normalizeScenarioId(value)))]
    : undefined;
  return {
    runId,
    sutThinking,
    sutThinkingSource,
    toolCallCap,
    toolCallCapSource,
    scenarios,
    parallel,
    judgeConcurrency,
    previous,
    dryRun,
    judgeClient,
  };
}

export async function runSuiteCommand(argv: string[]): Promise<void> {
  const options = parseSuiteArgs(argv);
  const allFixtures = await discoverScenarios();
  const selected = options.scenarios
    ? allFixtures.filter((fixture) => options.scenarios?.includes(fixture.scenario))
    : allFixtures;
  if (selected.length !== (options.scenarios?.length ?? allFixtures.length)) {
    throw new Error("One or more selected scenarios have no fixture.");
  }
  selected.forEach((fixture) => boardIdFor(options.runId, fixture.scenario));
  if (options.dryRun) {
    for (const fixture of selected) {
      const stages = fixture.stages.map((stage) => stage.id).join(" → ");
      console.log(
        `${fixture.scenario} · complexity ${fixture.complexity} · ${fixture.board.width}×${fixture.board.height} · ${stages}`,
      );
      for (const stage of fixture.stages) {
        const defaultScope = stage.id === "stage0"
          ? "page-frame"
          : "page-frame + live objects";
        console.log(
          `  ${stage.id}: scope ${stage.scopeDescription ?? defaultScope}`,
        );
      }
    }
    await runStubQueue(selected, options.parallel, (event) => {
      console.log(`stub ${event.scenario} ${event.event}`);
    });
    return;
  }

  const scorecardPath = resolve(RUNS_DIR, options.runId, "scorecard.md");
  const display = createStatusDisplay({ scorecardPath });
  try {
    const result = await runSuiteQueue({
      runId: options.runId,
      sutThinking: options.sutThinking,
      sutThinkingSource: options.sutThinkingSource,
      toolCallCap: options.toolCallCap,
      toolCallCapSource: options.toolCallCapSource,
      fixtures: selected,
      parallel: options.parallel,
      judgeConcurrency: options.judgeConcurrency,
      previous: options.previous,
      judgeClient: options.judgeClient,
      observer: display,
    });
    display.finish({
      failed: result.progress.status === "failed",
      scorecardPath: resolve(result.runDir, "scorecard.md"),
    });
  } catch (error) {
    display.finish({ failed: true });
    throw error;
  }
}

function cleanTargetPattern(runId?: string): RegExp {
  if (runId) {
    const escaped = runId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `^eval\\.${escaped}\\.[a-z0-9][a-z0-9._-]*\\.canvas\\.json$`,
    );
  }
  return /^eval\.\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9._-]*\.[a-z0-9][a-z0-9._-]*\.canvas\.json$/;
}

export async function runCleanCommand(argv: string[]): Promise<string[]> {
  let runId: string | undefined;
  let all = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--run-id") {
      runId = canonicalizeRunId(valueAfter(argv, index, flag));
      index += 1;
    } else if (flag === "--all") {
      all = true;
    } else {
      throw new Error(`Unknown clean argument: ${flag}`);
    }
  }
  if ((runId ? 1 : 0) + (all ? 1 : 0) !== 1) {
    throw new Error("Usage: clean --run-id <id> | --all");
  }

  const expectedDir = resolve(REPO_ROOT, "canvases", "evals");
  if (resolve(EVAL_CANVASES_DIR) !== expectedDir) {
    throw new Error("Refusing cleanup outside canvases/evals.");
  }
  try {
    if ((await lstat(expectedDir)).isSymbolicLink()) {
      throw new Error("Refusing cleanup through a canvases/evals symlink.");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const pattern = cleanTargetPattern(runId);
  const removed: string[] = [];
  for (const name of await readdir(expectedDir)) {
    if (!pattern.test(name)) continue;
    const path = resolve(expectedDir, name);
    if (resolve(path).slice(0, expectedDir.length + 1) !== `${expectedDir}/`) {
      throw new Error(`Refusing cleanup target outside canvases/evals: ${path}`);
    }
    await unlink(path);
    removed.push(path);
  }
  removed.sort();
  for (const path of removed) console.log(`removed ${path}`);
  return removed;
}

export const runSuiteSubcommand = runSuiteCommand;
export const runCleanSubcommand = runCleanCommand;

if (import.meta.main) {
  const [command = "suite", ...argv] = process.argv.slice(2);
  if (command === "suite") await runSuiteCommand(argv);
  else if (command === "clean") await runCleanCommand(argv);
  else throw new Error(`Unknown scenario subcommand: ${command}`);
}
