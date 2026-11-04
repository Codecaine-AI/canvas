import { describe, expect, test } from "bun:test";

import { rule as denseNote } from "../../board/lints/rules/dense-note";
import { LAYOUT_RULES } from "../../board/lints";
import { box, makeDocument } from "./synthetic";

/**
 * A sticky note the agent wrote holds at most 40 words. Past that it is a
 * wall of prose whose rules belong on the board as wires, and the finding
 * says so. A person's own note is never judged.
 */

function note(id: string, words: number) {
  return {
    ...box(id, 0, 0, 480, 400, "sticky"),
    text: Array.from({ length: words }, (_, index) => `w${index}`).join(" "),
    style: { shape: "note" as const },
  };
}

const EMPTY_START = { baseline: makeDocument([]) };

describe("dense-note lint", () => {
  test("runs on every edit", () => {
    expect(LAYOUT_RULES.map((rule) => rule.id)).toContain("dense-note");
  });

  test("a 41-word note warns and names the drawn fix", () => {
    const [finding] = denseNote.check(makeDocument([note("rules", 41)]), EMPTY_START);
    expect(finding?.severity).toBe("warning");
    expect(finding?.at).toEqual(["rules"]);
    expect(finding?.message).toBe("rules note has 41 words — a note holds ≤ 40");
    expect(finding?.suggestion).toContain("as a labeled wire, branch or node");
  });

  test("a 40-word note is quiet", () => {
    expect(denseNote.check(makeDocument([note("rules", 40)]), EMPTY_START)).toEqual([]);
  });

  test("a person's unchanged note is never judged", () => {
    const theirs = makeDocument([note("rules", 80)]);
    expect(denseNote.check(theirs, { baseline: theirs })).toEqual([]);
  });
});
