import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import { readSets } from "./paths.ts";
import { gateVerdict, prTable, readRoundScores, type Stage } from "./score.ts";

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
    expect(verdict.sets.climb.judges.sol.categories.craft).toEqual({ mean: 9.5, min: 9, pass: true });
  });

  test("fails a category whose climb mean is below the gate", () => {
    const verdict = verdictFor("mean-fail", 1);
    expect(verdict.pass).toBe(false);
    expect(verdict.failures).toEqual(["opus climb readability: mean 9.25 is below 9.5"]);
  });

  test("fails a category where one board scores below 9 even when the mean passes", () => {
    const verdict = verdictFor("board-below-9", 1);
    expect(verdict.pass).toBe(false);
    expect(verdict.sets.climb.judges.sol.categories.craft).toEqual({ mean: 9.5, min: 8, pass: false });
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
});
