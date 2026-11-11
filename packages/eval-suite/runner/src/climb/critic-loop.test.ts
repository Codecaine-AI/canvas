import { describe, expect, test } from "bun:test";

import {
  findingLine, ledgerText, parseAnswers, reviewLoop, revisePrompt, roundFindings,
  type LoopFinding, type Review,
} from "./critic-loop.ts";
import type { MergedFinding } from "./critic.ts";
import type { Lint } from "./render.ts";

const lint = (overrides: Partial<Lint> = {}): Lint => ({
  rule: "near-miss", severity: "warning", at: ["a", "b"], message: "b is 20px off a's center line, so w bends", suggestion: "move b by dy -20", ...overrides,
});
const seen = (overrides: Partial<MergedFinding> = {}): MergedFinding => ({
  kind: "routing", ids: ["w"], labels: ["ghost"], problem: "The wire bends twice.", fix: "Route it straight.", severity: "should", regions: ["r01"], ...overrides,
});
const review = (overrides: Partial<Review> = {}): Review => ({ reviewMs: 40, renderMs: 4, regions: 2, unparsed: 0, lints: [], findings: [], ...overrides });
const ran = (reply: string, exitCode: number | null = 0) =>
  ({ run: { exitCode, signal: null, timedOut: exitCode === null, durationMs: 9 }, reply });
const answered = (findings: LoopFinding[], verdict: string) => findings.map((finding) => `${finding.id} ${verdict}`).join("\n");

describe("critic loop findings", () => {
  test("a round's findings are the lints and the critics', most severe first, each with an id", () => {
    const findings = roundFindings([], {
      lints: [lint(), lint({ rule: "tangent-wires", severity: "error", at: ["w"], message: "w runs along b", suggestion: undefined })],
      findings: [seen({ severity: "blocker" }), seen({ severity: "nit", kind: "colour", ids: ["a"], labels: [] })],
    });
    expect(findings.map((finding) => [finding.id, finding.source, finding.severity, finding.kind])).toEqual([
      ["F2", "check", "blocker", "tangent-wires"],
      ["F3", "reviewer", "blocker", "routing"],
      ["F1", "check", "should", "near-miss"],
      ["F4", "reviewer", "nit", "colour"],
    ]);
    expect(findings.map(findingLine)).toEqual([
      "F2 [blocker, check tangent-wires] w runs along b.",
      `F3 [blocker, routing] w, "ghost": The wire bends twice. Fix: Route it straight.`,
      "F1 [should, check near-miss] b is 20px off a's center line, so w bends. Fix: move b by dy -20",
      "F4 [nit, colour] a: The wire bends twice. Fix: Route it straight.",
    ]);
  });

  test("a lint still on the board keeps its id and is raised again, whatever the drawer answered", () => {
    const error = lint({ rule: "tangent-wires", severity: "error", at: ["w"], message: "w runs along b" });
    const gap = lint({ at: ["c"], message: "c sits 120px from b and 140px from d" });
    const first = roundFindings([], { lints: [lint(), gap, error], findings: [seen()] });
    const answers = parseAnswers("F1 fixed\nF2 declined: the gap holds a label\nF3 disagree: it does not\nF4 fixed");
    for (const finding of first) finding.answer = answers.get(finding.id) ?? null;

    // The first lint is gone. The two the drawer left stand, and the critics' finding is a new one.
    const second = roundFindings(first, { lints: [gap, error], findings: [seen()] });
    expect(second.map((finding) => [finding.id, finding.severity])).toEqual([["F3", "blocker"], ["F2", "should"], ["F5", "should"]]);
    expect(second.every((finding) => finding.answer === null)).toBe(true);
  });

  test("the drawer's closing lines are its answers, however it marks them up", () => {
    const answers = parseAnswers([
      "I moved b and rerouted w.",
      "F1 fixed",
      "- **F2** disagree: the wire must clear the label",
      "F3: declined - a taste call.",
      "| F4 | fixed | moved b |",
      "F5, F6 fixed",
      "F7 was hard to judge",
    ].join("\n"));
    expect([...answers]).toEqual([
      ["F1", { verdict: "fixed", reason: "" }],
      ["F2", { verdict: "disagree", reason: "the wire must clear the label" }],
      ["F3", { verdict: "declined", reason: "a taste call." }],
      ["F4", { verdict: "fixed", reason: "moved b" }],
      ["F5", { verdict: "fixed", reason: "" }],
      ["F6", { verdict: "fixed", reason: "" }],
    ]);
  });

  test("the revise prompt lists the findings by id and asks for one answer line each", () => {
    const prompt = revisePrompt("b1", roundFindings([], { lints: [lint()], findings: [] }));
    expect(prompt).toContain(`canvas_open, canvas id "b1"`);
    expect(prompt).toContain("<findings>\nF1 [should, check near-miss] b is 20px off a's center line, so w bends. Fix: move b by dy -20\n</findings>");
    expect(prompt).toContain("<id> declined: <why you left it>");
  });
});

describe("critic loop stop rule", () => {
  test("a round with nits only is clean: the loop stops and the drawer is not called", async () => {
    let revises = 0;
    const record = await reviewLoop({
      budget: 3,
      review: async () => review({ findings: [seen({ severity: "nit" })] }),
      revise: async () => { revises += 1; return ran(""); },
    });
    expect([record.stop, record.rounds.length, revises]).toEqual(["clean", 1, 0]);
    expect(record.rounds[0]!.revise).toBeNull();
  });

  test("the drawer revises and the review runs again until a round is clean", async () => {
    const earlierSeen: string[][] = [];
    const record = await reviewLoop({
      budget: 3,
      review: async (round, earlier) => {
        earlierSeen.push(earlier.map((finding) => finding.line));
        return review(round === 1 ? { lints: [lint()], findings: [seen()] } : {});
      },
      revise: async (_round, findings) => ran(`${findings[0]!.id} fixed\n${findings[1]!.id} declined: the bend clears a label`),
    });
    expect([record.stop, record.rounds.length]).toEqual(["clean", 2]);
    expect(record.rounds[0]!.findings.map((finding) => finding.answer?.verdict)).toEqual(["fixed", "declined"]);
    expect(record.rounds[0]!.revise).toMatchObject({ exitCode: 0, answered: 2 });
    // The second round's critics read the first round's finding and the drawer's answer to it.
    expect(earlierSeen).toEqual([[], [`[routing] w, "ghost": The wire bends twice. Drawer: declined, the bend clears a label`]]);
    expect(ledgerText(record)).toContain("F1 [should, check near-miss] b is 20px off a's center line, so w bends. Fix: move b by dy -20\n  → fixed");
  });

  test("the budget ends a loop that never comes clean, after the last round's revise", async () => {
    let revises = 0;
    const record = await reviewLoop({
      budget: 2,
      review: async () => review({ findings: [seen()] }),
      revise: async (_round, findings) => { revises += 1; return ran(answered(findings, "fixed")); },
    });
    expect([record.stop, record.rounds.length, revises]).toEqual(["budget", 2, 2]);
    expect(record.rounds.map((round) => round.findings[0]!.id)).toEqual(["F1", "F2"]);
  });

  test("a lint the drawer declines is still on the board: the loop does not call it clean", async () => {
    const record = await reviewLoop({
      budget: 3,
      review: async () => review({ lints: [lint()] }),
      revise: async (_round, findings) => ran(answered(findings, "declined: the bend clears a label")),
    });
    expect([record.stop, record.rounds.length]).toEqual(["budget", 3]);
    expect(record.rounds.map((round) => round.findings.map((finding) => finding.id))).toEqual([["F1"], ["F1"], ["F1"]]);
    expect(record.rounds.map((round) => round.findings[0]!.answer?.verdict)).toEqual(["declined", "declined", "declined"]);
  });

  test("a critic that gave no answer did not approve", async () => {
    const record = await reviewLoop({
      budget: 2,
      review: async (round) => review({ unparsed: round === 1 ? 1 : 0 }),
      revise: async () => { throw new Error("nothing to revise"); },
    });
    expect([record.stop, record.rounds.length]).toEqual(["clean", 2]);
  });

  test("with no drawer the loop is one review", async () => {
    const record = await reviewLoop({ budget: 3, review: async () => review({ lints: [lint()] }) });
    expect([record.stop, record.rounds.length]).toEqual(["review-only", 1]);
  });

  test("a revise pass that fails stops the loop and says why", async () => {
    const record = await reviewLoop({ budget: 3, review: async () => review({ lints: [lint()] }), revise: async () => ran("", null) });
    expect(record).toMatchObject({ stop: "failed", error: "round 1: the revise pass timed out" });
    expect(record.rounds).toHaveLength(1);
    const thrown = await reviewLoop({ budget: 3, review: async () => { throw new Error("no board"); } });
    expect(thrown).toMatchObject({ stop: "failed", error: "no board", rounds: [] });
  });
});
