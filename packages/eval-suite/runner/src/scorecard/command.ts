import {
  assembleScorecard,
  type ScorecardResult,
} from "./assemble.ts";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EVAL_SUITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const RUN_ID_PATTERN = /^(\d{4}-\d{2}-\d{2})-([A-Za-z0-9][A-Za-z0-9._-]*)$/;

function canonicalizeRunId(raw: string): string {
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
