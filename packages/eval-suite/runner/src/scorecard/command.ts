import {
  assembleScorecard,
  type ScorecardResult,
} from "./assemble.ts";
import { EVAL_SUITE_DIR, canonicalizeRunId } from "../scenario/scenario.ts";
import { resolve } from "node:path";

export async function runScorecardCommand(
  argv: string[],
): Promise<ScorecardResult> {
  const args = argv[0] === "scorecard" ? argv.slice(1) : argv;
  let runId: string | undefined;
  let previousRunId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--run-id") {
      runId = requiredValue(args, ++index, "--run-id");
    } else if (argument === "--previous") {
      previousRunId = requiredValue(args, ++index, "--previous");
    } else {
      throw new Error(`Unknown scorecard argument: ${argument}`);
    }
  }

  if (runId === undefined) {
    throw new Error(
      "Usage: scorecard --run-id <YYYY-MM-DD-label> [--previous <run-id>]",
    );
  }

  runId = canonicalizeRunId(runId);
  previousRunId = previousRunId === undefined
    ? undefined
    : canonicalizeRunId(previousRunId);
  const result = await assembleScorecard({
    runId,
    previousRunId,
    axesDir: resolve(EVAL_SUITE_DIR, "axes-system"),
  });
  process.stdout.write(`${result.markdownPath}\n`);
  return result;
}

export const runScorecardSubcommand = runScorecardCommand;

function requiredValue(
  args: string[],
  index: number,
  option: string,
): string {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}
