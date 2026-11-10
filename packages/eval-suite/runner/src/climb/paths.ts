/**
 * Where a quality climb keeps its inputs and outputs.
 *
 * Inputs are committed: the brief sets (`eval-suite/climb/sets.json`) and the
 * frozen briefs (`eval-suite/scenarios-system/<id>/brief.md`). Outputs are
 * machine-local: `eval-suite/runs/climb/round-<n>/<brief>/` holds one drawer
 * run and its render, and `round-<n>/scores/<judge>.json` holds one judge's
 * scores for that round.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RUNNER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const EVAL_SUITE_ROOT = resolve(RUNNER_ROOT, "..");
/** The canvas checkout this runner lives in. */
export const CANVAS_REPO_ROOT = resolve(EVAL_SUITE_ROOT, "..", "..");
export const SCENARIOS_ROOT = resolve(EVAL_SUITE_ROOT, "scenarios-system");
export const DEFAULT_CLIMB_ROOT = resolve(EVAL_SUITE_ROOT, "runs", "climb");
export const DEFAULT_SETS_PATH = resolve(EVAL_SUITE_ROOT, "climb", "sets.json");

export const SET_NAMES = ["climb", "heldOut"] as const;
export type SetName = (typeof SET_NAMES)[number];
export type BriefSets = Record<SetName, string[]>;

export function roundDir(climbRoot: string, round: number): string {
  return resolve(climbRoot, `round-${round}`);
}

export function readSets(path = DEFAULT_SETS_PATH): BriefSets {
  const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const sets = {} as BriefSets;
  for (const name of SET_NAMES) {
    const ids = value[name];
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string" && id)) {
      throw new Error(`${path}: "${name}" must be a non-empty list of brief ids`);
    }
    sets[name] = ids as string[];
  }
  const all = [...sets.climb, ...sets.heldOut];
  const repeated = all.find((id, index) => all.indexOf(id) !== index);
  if (repeated) throw new Error(`${path}: brief ${repeated} is in more than one set`);
  return sets;
}

/** The set a brief belongs to, or undefined when no set lists it. */
export function setOf(sets: BriefSets, brief: string): SetName | undefined {
  return SET_NAMES.find((name) => sets[name].includes(brief));
}

export function briefPath(brief: string): string {
  const path = resolve(SCENARIOS_ROOT, brief, "brief.md");
  if (!existsSync(path)) throw new Error(`No brief for ${brief}: ${path}`);
  return path;
}

export function roundNumber(value: string | undefined, flag = "--round"): number {
  const round = Number(value);
  if (value === undefined || !Number.isInteger(round) || round < 0) {
    throw new Error(`${flag} must be a round number (0, 1, 2, ...)`);
  }
  return round;
}

/** `--flag value` pairs and bare `--switch`es, in any order. */
export function parseFlags(argv: string[], valued: readonly string[], switches: readonly string[] = []): Map<string, string> {
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (switches.includes(flag)) {
      flags.set(flag, "true");
    } else if (valued.includes(flag)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${flag} requires a value`);
      flags.set(flag, value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return flags;
}
