import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { readSets } from "./paths.ts";
import { CATEGORIES, gateVerdict, prTable, readRoundScores, tenthsOf, type ScoreFile, type Stage } from "./score.ts";

const FIXTURES = resolve(import.meta.dir, "fixtures", "score");
const sets = readSets(resolve(FIXTURES, "sets.json"));

function verdictFor(fixture: string, stage: Stage) {
  const climbRoot = resolve(FIXTURES, fixture);
  return gateVerdict(readRoundScores(climbRoot, 1, sets), sets, 1, stage);
}

describe("climb score gate", () => {
  test("passes when every counting judge reaches the mean with no board below the floor", () => {
    const verdict = verdictFor("pass", 1);
    expect(verdict.failures).toEqual([]);
    expect(verdict.pass).toBe(true);
    expect(verdict.sets.climb.judges.sol.categories.craft).toEqual({ mean: 9.5, min: 9, meanPass: true, floorPass: true, pass: true });
  });

  test("fails a category whose climb mean is below the gate", () => {
    const verdict = verdictFor("mean-fail", 1);
    expect(verdict.pass).toBe(false);
    expect(verdict.failures).toEqual(["opus climb readability: mean 9.25 is below 9.5"]);
  });

  test("fails a category where one board scores below 9 even when the mean passes", () => {
    const verdict = verdictFor("board-below-9", 1);
    expect(verdict.pass).toBe(false);
    expect(verdict.sets.climb.judges.sol.categories.craft).toEqual({ mean: 9.5, min: 8, meanPass: true, floorPass: false, pass: false });
    expect(verdict.failures).toEqual(["sol climb craft: a board scored 8, below 9"]);
  });

  test("fails on the held-out set while the climb set passes", () => {
    const verdict = verdictFor("held-out-fail", 1);
    expect(verdict.sets.climb.pass).toBe(true);
    expect(verdict.sets.heldOut.pass).toBe(false);
    expect(verdict.pass).toBe(false);
    expect(verdict.failures).toEqual(["sol heldOut hierarchy_grouping: mean 9 is below 9.5"]);
  });

  test("ignores the jester's scores in the gate and the PR table", () => {
    const verdict = verdictFor("jester-ignored", 3);
    expect(verdict.countingJudges).toEqual(["sol", "opus", "muse", "fable"]);
    expect(verdict.ignoredJudges).toEqual(["gemini"]);
    expect(verdict.pass).toBe(true);
    const table = prTable(resolve(FIXTURES, "jester-ignored"), sets, 1);
    expect(table).toContain("| fable | Craft | 9.50 (held out 9.50) |");
    expect(table).not.toContain("gemini");
  });

  test("a stage fails when one of its judges has not scored", () => {
    const verdict = verdictFor("pass", 2);
    expect(verdict.pass).toBe(false);
    expect(verdict.failures).toContain("muse climb: not scored: climb-a, climb-b, climb-c, climb-d");
  });

  test("decimal scores: a mean of exactly 9.5 passes at every verdict level despite float error", () => {
    // (9 + 9 + 9.3 + 10 + 9.8 + 9.9) / 6 is 9.499999999999998 in floats.
    const values = [9, 9, 9.3, 10, 9.8, 9.9];
    const six = { climb: values.map((_, i) => `c${i}`), heldOut: ["h0"] };
    const file = (judge: string): ScoreFile => ({
      judge,
      round: 1,
      boards: [...six.climb.map((brief, i) => ({ brief, v: values[i] })), { brief: "h0", v: 9.5 }].map(({ brief, v }) => ({
        brief,
        scores: Object.fromEntries(CATEGORIES.map(([key]) => [key, v])) as ScoreFile["boards"][number]["scores"],
        findings: [],
      })),
    });
    const verdict = gateVerdict([file("sol"), file("opus")], six, 1, 1);
    expect(verdict.sets.climb.judges.sol.categories.craft?.pass).toBe(true);
    expect(verdict.sets.climb.pass).toBe(true);
    expect(verdict.failures).toEqual([]);
    expect(verdict.pass).toBe(true);
  });

  test("decimal scores: 9.3 is on the scale; two decimals, 0.9 and 10.1 are not", () => {
    expect(tenthsOf(9.3)).toBe(93);
    expect(tenthsOf(10)).toBe(100);
    expect(tenthsOf(1)).toBe(10);
    expect(tenthsOf(9.35)).toBeNull();
    expect(tenthsOf(0.9)).toBeNull();
    expect(tenthsOf(10.1)).toBeNull();
    expect(tenthsOf(10.00000001)).toBeNull();
    expect(tenthsOf(8.99999999)).toBeNull();
  });
});

describe("climb score command", () => {
  /** Run `climb score` on a copy of a fixture (the command writes pr-table.md into the round). */
  function scoreExit(fixture: string): number {
    const climbRoot = mkdtempSync(join(tmpdir(), "climb-score-"));
    try {
      cpSync(resolve(FIXTURES, fixture), climbRoot, { recursive: true });
      const cli = resolve(import.meta.dir, "..", "cli.ts");
      const args = ["climb", "score", "--round", "1", "--stage", "1", "--climb-root", climbRoot, "--sets", resolve(FIXTURES, "sets.json")];
      return Bun.spawnSync([process.execPath, cli, ...args], { stdout: "ignore", stderr: "ignore" }).exitCode;
    } finally {
      rmSync(climbRoot, { recursive: true, force: true });
    }
  }

  test("exits nonzero when the gate fails and zero when it passes", () => {
    expect(scoreExit("mean-fail")).toBe(1);
    expect(scoreExit("pass")).toBe(0);
  });
});
