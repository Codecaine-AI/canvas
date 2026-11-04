/**
 * `climb score`: apply a stage gate to one round's judge scores.
 *
 * Each judge writes `round-<n>/scores/<judge>.json` (the schema is in
 * `eval-suite/climb/judge-brief.md`). The gate counts the stage's judges
 * only. For each counting judge, set and category, the mean over the set's
 * boards must reach GATE_MEAN and no board may score below GATE_FLOOR. Both
 * sets must pass, so a round whose held-out boards were not scored cannot
 * pass. The jester's scores never count and never reach the PR table.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DEFAULT_CLIMB_ROOT,
  DEFAULT_SETS_PATH,
  SET_NAMES,
  parseFlags,
  readSets,
  roundDir,
  roundNumber,
  setOf,
  type BriefSets,
  type SetName,
} from "./paths.ts";

export const CATEGORIES = [
  ["system_fidelity", "System fidelity"],
  ["requirement_coverage", "Requirement coverage"],
  ["scope_discipline", "Scope discipline"],
  ["readability", "Readability"],
  ["hierarchy_grouping", "Hierarchy & grouping"],
  ["layout_flow", "Layout & flow"],
  ["color_contrast", "Color & contrast"],
  ["typography_labels", "Typography & labels"],
  ["craft", "Craft"],
] as const;
export type Category = (typeof CATEGORIES)[number][0];
const CATEGORY_KEYS: readonly string[] = CATEGORIES.map(([key]) => key);

export const STAGE_JUDGES = { 1: ["sol", "opus"], 2: ["sol", "opus", "muse"], 3: ["sol", "opus", "muse", "fable"] } as const;
export type Stage = keyof typeof STAGE_JUDGES;
export const JESTER = "gemini";
const JUDGES: readonly string[] = [...STAGE_JUDGES[3], JESTER];
const GATE_MEAN = 9.5;
const GATE_FLOOR = 9;

export interface BoardScore {
  brief: string;
  scores: Record<Category, number>;
  findings: Array<{ category: Category; finding: string }>;
}
export interface ScoreFile { judge: string; round: number; boards: BoardScore[] }

/** Parse one score file, refusing anything off the judge brief's schema. */
export function parseScoreFile(path: string, round: number, sets: BriefSets): ScoreFile {
  const where = (detail: string) => new Error(`${path}: ${detail}`);
  const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const judge = path.replace(/^.*\//, "").replace(/\.json$/, "");
  if (!JUDGES.includes(judge)) throw where(`unknown judge "${judge}" (expected one of ${JUDGES.join(", ")})`);
  if (value.judge !== judge) throw where(`"judge" is ${JSON.stringify(value.judge)}, expected "${judge}"`);
  if (value.round !== round) throw where(`"round" is ${JSON.stringify(value.round)}, expected ${round}`);
  if (!Array.isArray(value.boards) || value.boards.length === 0) throw where(`"boards" must be a non-empty list`);
  const seen = new Set<string>();
  const boards = value.boards.map((raw: unknown, index: number): BoardScore => {
    const board = raw as Record<string, unknown>;
    const brief = board?.brief;
    if (typeof brief !== "string" || !setOf(sets, brief)) throw where(`boards[${index}].brief ${JSON.stringify(brief)} is in no set`);
    if (seen.has(brief)) throw where(`brief ${brief} is scored twice`);
    seen.add(brief);
    const scores = board.scores as Record<string, unknown> | undefined;
    if (!scores || typeof scores !== "object") throw where(`${brief}: "scores" is missing`);
    const keys = Object.keys(scores);
    const extra = keys.find((key) => !CATEGORY_KEYS.includes(key));
    if (extra) throw where(`${brief}: unknown category "${extra}"`);
    for (const key of CATEGORY_KEYS) {
      const score = scores[key];
      if (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > 10) {
        throw where(`${brief}: ${key} must be a whole number from 1 to 10, got ${JSON.stringify(score)}`);
      }
    }
    const findings = board.findings ?? [];
    if (!Array.isArray(findings)) throw where(`${brief}: "findings" must be a list`);
    return { brief, scores: scores as Record<Category, number>, findings: findings as BoardScore["findings"] };
  });
  return { judge, round, boards };
}

export function readRoundScores(climbRoot: string, round: number, sets: BriefSets): ScoreFile[] {
  const dir = resolve(roundDir(climbRoot, round), "scores");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => parseScoreFile(resolve(dir, name), round, sets));
}

export interface CategoryResult { mean: number; min: number; pass: boolean }
export interface JudgeSetResult {
  pass: boolean;
  /** Set briefs this judge did not score. A judge with any missing brief fails the set. */
  missing: string[];
  categories: Partial<Record<Category, CategoryResult>>;
}
export interface Verdict {
  round: number;
  stage: Stage;
  pass: boolean;
  countingJudges: string[];
  ignoredJudges: string[];
  sets: Record<SetName, { pass: boolean; judges: Record<string, JudgeSetResult> }>;
  failures: string[];
}

const round2 = (value: number) => Math.round(value * 100) / 100;

function judgeSetResult(file: ScoreFile | undefined, briefs: string[]): JudgeSetResult {
  const boards = (file?.boards ?? []).filter((board) => briefs.includes(board.brief));
  const missing = briefs.filter((brief) => !boards.some((board) => board.brief === brief));
  const categories: JudgeSetResult["categories"] = {};
  if (missing.length > 0) return { pass: false, missing, categories };
  for (const key of CATEGORY_KEYS as Category[]) {
    const values = boards.map((board) => board.scores[key]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const min = Math.min(...values);
    categories[key] = { mean: round2(mean), min, pass: mean >= GATE_MEAN && min >= GATE_FLOOR };
  }
  return { pass: Object.values(categories).every((result) => result.pass), missing, categories };
}

/** The stage gate over one round's score files. */
export function gateVerdict(files: ScoreFile[], sets: BriefSets, round: number, stage: Stage): Verdict {
  const countingJudges: string[] = [...STAGE_JUDGES[stage]];
  const failures: string[] = [];
  const result = {} as Verdict["sets"];
  for (const setName of SET_NAMES) {
    const judges: Record<string, JudgeSetResult> = {};
    for (const judge of countingJudges) {
      const judged = judgeSetResult(files.find((file) => file.judge === judge), sets[setName]);
      judges[judge] = judged;
      if (judged.missing.length > 0) failures.push(`${judge} ${setName}: not scored: ${judged.missing.join(", ")}`);
      for (const [key, category] of Object.entries(judged.categories)) {
        if (category.mean < GATE_MEAN) failures.push(`${judge} ${setName} ${key}: mean ${category.mean} is below ${GATE_MEAN}`);
        if (category.min < GATE_FLOOR) failures.push(`${judge} ${setName} ${key}: a board scored ${category.min}, below ${GATE_FLOOR}`);
      }
    }
    result[setName] = { pass: Object.values(judges).every((judged) => judged.pass), judges };
  }
  return {
    round,
    stage,
    pass: failures.length === 0,
    countingJudges,
    ignoredJudges: files.map((file) => file.judge).filter((judge) => !countingJudges.includes(judge)),
    sets: result,
    failures,
  };
}

/**
 * The PR score table: one row per judge and category, one column per round
 * that has scores, up to `round`. A cell is the climb-set mean, with the
 * held-out mean beside it when that round scored the held-out set. The
 * jester's rows never appear.
 */
export function prTable(climbRoot: string, sets: BriefSets, round: number): string {
  const rounds = Array.from({ length: round + 1 }, (_, index) => index)
    .map((index) => ({ index, files: readRoundScores(climbRoot, index, sets) }))
    .filter(({ files }) => files.length > 0);
  const judges = [...STAGE_JUDGES[3]].filter((judge) => rounds.some(({ files }) => files.some((file) => file.judge === judge)));
  const mean = (file: ScoreFile | undefined, briefs: string[], key: Category): string | null => {
    const values = (file?.boards ?? []).filter((board) => briefs.includes(board.brief)).map((board) => board.scores[key]);
    return values.length === 0 ? null : (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2);
  };
  const lines = [
    `| Judge | Category | ${rounds.map(({ index }) => `Round ${index}`).join(" | ")} |`,
    `| --- | --- | ${rounds.map(() => "---").join(" | ")} |`,
  ];
  for (const judge of judges) {
    for (const [key, label] of CATEGORIES) {
      const cells = rounds.map(({ files }) => {
        const file = files.find((candidate) => candidate.judge === judge);
        const climb = mean(file, sets.climb, key);
        const heldOut = mean(file, sets.heldOut, key);
        if (climb === null && heldOut === null) return "–";
        return heldOut === null ? `${climb}` : `${climb ?? "–"} (held out ${heldOut})`;
      });
      lines.push(`| ${judge} | ${label} | ${cells.join(" | ")} |`);
    }
  }
  return [
    `Climb-set mean per judge and category. A held-out mean shows when that round scored the held-out set.`,
    "",
    ...lines,
    "",
  ].join("\n");
}

export async function runScore(argv: string[]): Promise<void> {
  const flags = parseFlags(argv, ["--round", "--stage", "--climb-root", "--sets"]);
  const round = roundNumber(flags.get("--round"));
  const stage = Number(flags.get("--stage"));
  if (stage !== 1 && stage !== 2 && stage !== 3) throw new Error("--stage must be 1, 2 or 3");
  const climbRoot = resolve(flags.get("--climb-root") ?? DEFAULT_CLIMB_ROOT);
  const sets = readSets(resolve(flags.get("--sets") ?? DEFAULT_SETS_PATH));
  const files = readRoundScores(climbRoot, round, sets);
  if (files.length === 0) throw new Error(`No score files in ${resolve(roundDir(climbRoot, round), "scores")}`);
  const verdict = gateVerdict(files, sets, round, stage);
  const tablePath = resolve(roundDir(climbRoot, round), "pr-table.md");
  writeFileSync(tablePath, prTable(climbRoot, sets, round));
  process.stdout.write(`${JSON.stringify({ ...verdict, prTable: tablePath }, null, 2)}\n`);
}
