import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { AXIS_CODES } from "../contract.ts";

type JsonRecord = Record<string, unknown>;

export interface JudgeProgressResult {
  gradedScenarios: string[];
  runStatus: string;
}

export async function reconcileJudgeProgress(options: {
  runDir: string;
  runId: string;
  scenarios: string[];
}): Promise<JudgeProgressResult> {
  const progressPath = resolve(options.runDir, "run_progress.json");
  const source = await readFile(progressPath, "utf8");
  const progress = asRecord(JSON.parse(source), progressPath);
  if (progress.run_id !== options.runId) {
    throw new Error(
      `${progressPath} has run_id ${JSON.stringify(progress.run_id)}, expected ${options.runId}`,
    );
  }
  const scenarios = asRecord(progress.scenarios, `${progressPath} scenarios`);
  const originalRunStatus = progress.status;
  const gradedScenarios: string[] = [];

  for (const scenario of options.scenarios) {
    const scenarioProgress = asRecord(
      scenarios[scenario],
      `${progressPath} scenario ${scenario}`,
    );
    if (
      scenarioProgress.status === "failed" &&
      await hasCompleteVerdictSet(options.runDir, options.runId, scenario)
    ) {
      scenarioProgress.status = "graded";
      gradedScenarios.push(scenario);
    }
  }

  const remainingStatuses = Object.values(scenarios).map((value) =>
    asRecord(value, `${progressPath} scenario`).status
  );
  if (
    !remainingStatuses.some((status) =>
      status === "failed" || status === "pending"
    )
  ) {
    progress.status = "completed";
  }

  if (gradedScenarios.length > 0 || progress.status !== originalRunStatus) {
    await writeAtomic(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
  }

  return {
    gradedScenarios,
    runStatus: typeof progress.status === "string" ? progress.status : "unknown",
  };
}

async function hasCompleteVerdictSet(
  runDir: string,
  runId: string,
  scenario: string,
): Promise<boolean> {
  return (await Promise.all(AXIS_CODES.map(async (axis) => {
    const path = resolve(runDir, scenario, `judge-${axis}.json`);
    let source: string;
    try {
      source = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch {
      return false;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return false;
    }
    const envelope = parsed as JsonRecord;
    const flags = envelope.flags;
    return envelope.run_id === runId &&
      envelope.scenario === scenario &&
      envelope.axis === axis &&
      Array.isArray(flags) &&
      flags.every((flag) =>
        typeof flag === "string" && !/^ERROR(?:\b|\()/i.test(flag.trim())
      );
  }))).every(Boolean);
}

function asRecord(value: unknown, source: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${source} must contain a JSON object`);
  }
  return value as JsonRecord;
}

async function writeAtomic(path: string, contents: string): Promise<void> {
  const temporaryPath = resolve(dirname(path), `.${randomUUID()}.tmp`);
  await writeFile(temporaryPath, contents, "utf8");
  await rename(temporaryPath, path);
}
