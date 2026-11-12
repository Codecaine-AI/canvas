import { describe, expect, test } from "bun:test";

import {
  findingLine, ledgerText, loopSummary, parseAnswers, reaskPrompt, reviewLoop, reviseMessage, roundFindings,
  type LoopFinding, type Review,
} from "./critic-loop.ts";
import type { MergedFinding } from "./critic.ts";
import type { Lint } from "./render.ts";
import type { ProposedCall } from "./review-types.ts";

const lint = (overrides: Partial<Lint> = {}): Lint => ({
  rule: "near-miss", severity: "warning", at: ["a", "b"], message: "b is 20px off a's center line, so w bends", suggestion: "move b by dy -20", ...overrides,
});
const seen = (overrides: Partial<MergedFinding> = {}): MergedFinding => ({
  kind: "routing", ids: ["w"], labels: ["ghost"], problem: "The wire bends twice.", fix: "Route it straight.", severity: "should", regions: ["r01"], calls: [], ...overrides,
});
const review = (overrides: Partial<Review> = {}): Review => ({ reviewMs: 40, renderMs: 4, regions: 2, unparsed: 0, lints: [], findings: [], ...overrides });
const ran = (reply: string, exitCode: number | null = 0) =>
  ({ run: { exitCode, signal: null, timedOut: exitCode === null, durationMs: 9 }, reply });
const answered = (findings: LoopFinding[], verdict: string) => findings.map((finding) => `${finding.id} ${verdict}`).join("\n");
const call = (unit: string, tool: string, args: Record<string, unknown>): ProposedCall => ({ unit, call: { tool, args }, marks: [] });

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

  test("the revise message lists the findings by id and asks for one answer line each", () => {
    const message = reviseMessage("b1", roundFindings([], { lints: [lint()], findings: [] }));
    expect(message).toHaveLength(1);
    const prompt = message[0] as string;
    expect(prompt).toContain(`canvas_open, canvas id "b1"`);
    expect(prompt).toContain("<findings>\nF1 [should, check near-miss] b is 20px off a's center line, so w bends. Fix: move b by dy -20\n</findings>");
    expect(prompt).toContain("<id> declined: <why you left it>");
    // With no call, no image and every earlier id answered, the message says nothing about them.
    expect(prompt).not.toMatch(/A call is advice|section|image|Red marks|no_answer_yet/);
  });

  test("the revise message puts section moves first, and under each finding its calls as exact JSON, the trial's lines and its images", () => {
    const findings = roundFindings([], { lints: [], findings: [
      seen({ severity: "blocker", calls: [
        call("sec_a", "change_connection", { id: "w", patch: { from: { objectId: "a", anchor: "right" } } }),
        call("board", "route", { id: "w", reset: true }),
      ] }),
      seen({ kind: "placement", ids: ["sec_b"], labels: [], calls: [call("board", "move", { id: "sec_b", by: { dx: 200, dy: 0 } })] }),
      seen({ kind: "placement", ids: ["n"], labels: [], calls: [call("sec_a", "move", { id: "n", by: { dx: 20, dy: 0 } })] }),
      seen({ severity: "nit", kind: "nesting", ids: ["sec_a"], labels: [], calls: [call("board", "fit_section", { id: "sec_a" })] }),
    ] });
    const message = reviseMessage("b1", findings, {
      sections: new Set(["sec_a", "sec_b"]),
      advice: [
        { finding: "F1", lines: ["call 1 applied: w 874 px, 3 bends, now 2 bends", "call 2 refused: w has no hand-set corner"], images: ["/t/F1-alone.png", "/t/F1-sequence.png"] },
        { finding: "F2", lines: ["applied: sec_b landed at x 860"], images: ["/t/F2.png"] },
      ],
    });
    const text = message[0] as string;
    // The two section moves, most severe first, then the other findings, most severe first.
    expect(text.match(/^F\d+/gm)).toEqual(["F2", "F4", "F1", "F3"]);
    expect(text).toContain([
      "F2 [should, placement] sec_b: The wire bends twice. Fix: Route it straight.",
      `  call from board: {"tool":"move","args":{"id":"sec_b","by":{"dx":200,"dy":0}}}`,
      "  applied: sec_b landed at x 860",
      "  image: 1",
      "F4 [nit, nesting] sec_a: The wire bends twice. Fix: Route it straight.",
      `  call from board: {"tool":"fit_section","args":{"id":"sec_a"}}`,
      `F1 [blocker, routing] w, "ghost": The wire bends twice. Fix: Route it straight.`,
      `  call from sec_a: {"tool":"change_connection","args":{"id":"w","patch":{"from":{"objectId":"a","anchor":"right"}}}}`,
      `  call from board: {"tool":"route","args":{"id":"w","reset":true}}`,
      "  call 1 applied: w 874 px, 3 bends, now 2 bends",
      "  call 2 refused: w has no hand-set corner",
      "  images: 2, 3",
      "F3 [should, placement] n: The wire bends twice. Fix: Route it straight.",
      `  call from sec_a: {"tool":"move","args":{"id":"n","by":{"dx":20,"dy":0}}}`,
      "</findings>",
    ].join("\n"));
    expect(message.slice(1)).toEqual([
      "Image 1 · F2", { image: "/t/F2.png" }, "Image 2 · F1", { image: "/t/F1-alone.png" }, "Image 3 · F1", { image: "/t/F1-sequence.png" },
    ]);
    // The drawer learns what the marks mean, and that it decides.
    expect(text).toContain("Red marks: the board as it is now. Green marks: what the canvas engine drew when the call ran on the copy. Dashed marks: a reviewer's sketch");
    expect(text).toContain("A call is advice, not an order: apply it, do something better, or decline it with a reason.");
    expect(text).toContain("The findings whose call moves, arranges or fits a section come first.");
  });

  test("the re-ask names the ids and asks for their answer lines only", () => {
    const prompt = reaskPrompt(["F2", "F5"]);
    expect(prompt).toContain("no answer line for F2, F5");
    expect(prompt).toContain("Make no new edits");
    expect(parseAnswers(prompt).size).toBe(0);
  });
});

describe("critic loop trial run", () => {
  const routed = seen({ calls: [call("sec_a", "route", { id: "w", reset: true })] });

  test("after a review with open findings the trial runs the findings that carry calls, and its advice goes to the drawer", async () => {
    const order: string[] = [];
    const trialled: Array<Array<{ id: string; calls: ProposedCall[] }>> = [];
    const record = await reviewLoop({
      budget: 2,
      review: async (round) => { order.push(`review ${round}`); return review(round === 1 ? { lints: [lint()], findings: [routed, seen({ ids: ["v"] })] } : {}); },
      trial: async (round, findings) => {
        order.push(`trial ${round}`);
        trialled.push(findings);
        return [{ finding: "F2", lines: ["applied: w 0 bends"], images: ["/t/F2.png"] }];
      },
      revise: async (round, findings, notes) => {
        order.push(`revise ${round}`);
        expect(notes).toEqual({ unanswered: [], advice: [{ finding: "F2", lines: ["applied: w 0 bends"], images: ["/t/F2.png"] }], notTrialled: null });
        return ran(answered(findings, "fixed"));
      },
    });
    expect(order).toEqual(["review 1", "trial 1", "revise 1", "review 2"]);
    expect(trialled).toEqual([[{ id: "F2", calls: routed.calls }]]);
    expect(record.rounds[0]!.revise!.trial).toMatchObject({ findings: 1, advised: 1, images: 1, error: null });
    expect(record.stop).toBe("clean");
  });

  test("a trial that throws does not end the loop: the drawer gets the finding, its call and why no call was trialled", async () => {
    const messages: string[] = [];
    const record = await reviewLoop({
      budget: 2,
      review: async (round) => review(round === 1 ? { findings: [routed] } : {}),
      trial: async () => { throw new Error("no copy of the board"); },
      revise: async (_round, findings, notes) => {
        messages.push(reviseMessage("b1", findings, notes)[0] as string);
        return ran(answered(findings, "fixed"));
      },
    });
    expect([record.stop, record.rounds.length, record.error]).toEqual(["clean", 2, null]);
    expect(messages[0]).toContain(`  call from sec_a: {"tool":"route","args":{"id":"w","reset":true}}\n  not trialled: no copy of the board\n</findings>`);
    expect(record.rounds[0]!.revise!.trial).toMatchObject({ findings: 1, advised: 0, images: 0, error: "no copy of the board" });
  });

  test("a round whose findings carry no call has no trial", async () => {
    let trials = 0;
    const record = await reviewLoop({
      budget: 1,
      review: async (round) => review(round === 1 ? { findings: [seen()] } : {}),
      trial: async () => { trials += 1; return []; },
      revise: async (_round, findings) => ran(answered(findings, "fixed")),
    });
    expect([trials, record.rounds[0]!.revise!.trial]).toEqual([0, null]);
  });
});

describe("critic loop answer check", () => {
  const two = { findings: [seen(), seen({ ids: ["v"] })] };

  test("the runner asks once more for the ids a reply did not answer, and the second reply fills them", async () => {
    const asked: string[][] = [];
    const record = await reviewLoop({
      budget: 3,
      review: async (round) => review(round === 1 ? { lints: [lint()], ...two } : {}),
      revise: async () => ran("I rerouted w.\nF1 fixed"),
      reask: async (_round, ids) => { asked.push(ids); return ran("F2 declined: the bend clears a label\nF3 fixed"); },
    });
    expect(asked).toEqual([["F2", "F3"]]);
    expect(record.rounds[0]!.findings.map((finding) => finding.answer?.verdict)).toEqual(["fixed", "declined", "fixed"]);
    expect(record.rounds[0]!.revise).toMatchObject({ answered: 3, reask: { exitCode: 0, ids: ["F2", "F3"] }, unanswered: [] });
    expect([record.stop, record.unanswered, record.rounds.length]).toEqual(["clean", [], 2]);
  });

  test("a reply that answers every id gets no second ask, and neither does a revise pass that failed", async () => {
    let asks = 0;
    const loop = (reply: (findings: LoopFinding[]) => ReturnType<typeof ran>) => reviewLoop({
      budget: 1,
      review: async () => review(two),
      revise: async (_round, findings) => reply(findings),
      reask: async () => { asks += 1; return ran(""); },
    });
    expect((await loop((findings) => ran(answered(findings, "fixed")))).rounds[0]!.revise).toMatchObject({ reask: null, unanswered: [] });
    expect(await loop(() => ran("", 1))).toMatchObject({ stop: "failed", unanswered: ["F1", "F2"] });
    expect(asks).toBe(0);
  });

  test("an id with no answer after the second ask goes into the next review and the next revise, and a clean round does not stop the loop", async () => {
    const earlierSeen: string[][] = [];
    const messages: string[] = [];
    const record = await reviewLoop({
      budget: 4,
      // Round 2 finds nothing. F2 still has no answer, so round 2 goes to the drawer.
      review: async (round, earlier) => { earlierSeen.push(earlier.map((finding) => finding.line)); return review(round === 1 ? two : {}); },
      revise: async (round, findings, notes) => {
        messages.push(reviseMessage("b1", findings, notes)[0] as string);
        return ran(round === 1 ? "F1 fixed" : "F2 declined: it reads well");
      },
      reask: async () => ran("I made no edits."),
    });
    expect(earlierSeen[1]).toEqual([
      `[routing] w, "ghost": The wire bends twice. Drawer: fixed`,
      `[routing] v, "ghost": The wire bends twice. Drawer: no answer`,
    ]);
    expect(messages[0]).not.toContain("no_answer_yet");
    expect(messages[1]).toContain("You gave no answer to the findings in <no_answer_yet>");
    expect(messages[1]).toContain(`<findings>\n</findings>\n\n<no_answer_yet>\nF2 [should, routing] v, "ghost": The wire bends twice. Fix: Route it straight.\n</no_answer_yet>`);
    expect(record.rounds.map((round) => [round.score, round.revise?.unanswered ?? null])).toEqual([[2, ["F2"]], [0, []], [0, null]]);
    // The answer lands on the finding where round 1 raised it.
    expect(record.rounds[0]!.findings[1]!.answer).toEqual({ verdict: "declined", reason: "it reads well" });
    expect([record.stop, record.unanswered]).toEqual(["clean", []]);
  });

  test("a loop that ends with an id unanswered is incomplete, never clean", async () => {
    let revises = 0;
    const record = await reviewLoop({
      budget: 2,
      review: async (round) => review(round === 1 ? two : {}),
      revise: async () => { revises += 1; return ran("F1 fixed"); },
      reask: async () => ran(""),
    });
    // Round 2 and the check round find nothing, and F2 never gets its answer.
    expect([record.stop, record.unanswered, record.rounds.length, revises]).toEqual(["incomplete", ["F2"], 3, 2]);
    expect(record.rounds.map((round) => round.revise?.reask?.ids ?? null)).toEqual([["F2"], ["F2"], null]);
    expect(ledgerText(record)).toContain(`F2 [should, routing] v, "ghost": The wire bends twice. Fix: Route it straight.\n  → no answer`);
    expect(ledgerText(record)).toContain("Stop: incomplete\nNo answer: F2\n");
    expect(loopSummary(record)).toContain("stop incomplete after 2 of 2 rounds and a check round · last round: 0 blocker, 0 should, 0 nit · no answer: F2");
  });

  test("a lint the drawer never answers, raised again under its id, is asked for once a round and cleared by one answer", async () => {
    const messages: string[] = [];
    const record = await reviewLoop({
      budget: 3,
      review: async (round) => review(round < 3 ? { lints: [lint()] } : {}),
      revise: async (round, findings, notes) => {
        messages.push(reviseMessage("b1", findings, notes)[0] as string);
        return ran(round === 1 ? "" : "F1 fixed");
      },
    });
    expect(messages[1]).not.toContain("no_answer_yet");
    expect(record.rounds.map((round) => round.findings[0]?.answer?.verdict)).toEqual(["fixed", "fixed", undefined]);
    expect([record.stop, record.unanswered]).toEqual(["clean", []]);
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

  test("the budget ends a loop that never comes clean, and a check round reviews what the last revise left", async () => {
    let revises = 0;
    const record = await reviewLoop({
      budget: 2,
      review: async () => review({ findings: [seen()] }),
      revise: async (_round, findings) => { revises += 1; return ran(answered(findings, "fixed")); },
    });
    expect([record.stop, record.rounds.length, revises]).toEqual(["budget", 3, 2]);
    expect(record.rounds.map((round) => round.findings[0]!.id)).toEqual(["F1", "F2", "F3"]);
    // The check round has findings and no revise, and it is not a failed pass.
    expect(record.rounds.map((round) => [round.check, round.revise?.exitCode ?? null])).toEqual([[false, 0], [false, 0], [true, null]]);
    expect(record.error).toBeNull();
    expect(loopSummary(record)).toContain("stop budget after 2 of 2 rounds and a check round · last round: 0 blocker, 1 should, 0 nit");
    expect(ledgerText(record)).toContain("## Round 3 (check round: no revise) · score 1\nF3 [should, routing]");
  });

  test("a check round that comes back clean stops the loop clean", async () => {
    const record = await reviewLoop({
      budget: 1,
      review: async (round) => review(round === 1 ? { findings: [seen()] } : {}),
      revise: async (_round, findings) => ran(answered(findings, "fixed")),
    });
    expect([record.stop, record.rounds.map((round) => round.check)]).toEqual(["clean", [false, true]]);
  });

  test("a lint the drawer declines is still on the board: the loop does not call it clean", async () => {
    const record = await reviewLoop({
      budget: 3,
      review: async () => review({ lints: [lint()] }),
      revise: async (_round, findings) => ran(answered(findings, "declined: the bend clears a label")),
    });
    expect([record.stop, record.rounds.length]).toEqual(["budget", 4]);
    expect(record.rounds.map((round) => round.findings.map((finding) => finding.id))).toEqual([["F1"], ["F1"], ["F1"], ["F1"]]);
    expect(record.rounds.map((round) => round.findings[0]!.answer?.verdict)).toEqual(["declined", "declined", "declined", undefined]);
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

  test("a revise pass that fails stops the loop and says why, after a check round on what it left", async () => {
    const record = await reviewLoop({ budget: 3, review: async () => review({ lints: [lint()] }), revise: async () => ran("", null) });
    expect(record).toMatchObject({ stop: "failed", error: "round 1: the revise pass timed out" });
    expect(record.rounds.map((round) => [round.check, round.revise === null])).toEqual([[false, false], [true, true]]);
    const thrown = await reviewLoop({ budget: 3, review: async () => { throw new Error("no board"); } });
    expect(thrown).toMatchObject({ stop: "failed", error: "no board", rounds: [], kept: null });
  });
});

describe("critic loop keeps its best board", () => {
  /** A drawer whose every revise changes the board, and a reviewer that finds `shoulds[board]` faults on it. */
  const drawing = (shoulds: Record<string, number>, unparsed: Record<string, number> = {}) => {
    const state = { board: "first pass", snapshots: new Map<number, string>(), restored: [] as number[] };
    const loop = {
      review: async (round: number) => {
        state.snapshots.set(round, state.board);
        const findings = Array.from({ length: shoulds[state.board] ?? 0 }, (_, index) => seen({ ids: [`w${index}`] }));
        return review({ findings, unparsed: unparsed[state.board] ?? 0 });
      },
      revise: async (round: number, findings: LoopFinding[]) => { state.board = `revise ${round}`; return ran(answered(findings, "fixed")); },
      restore: (round: number) => { state.restored.push(round); state.board = state.snapshots.get(round)!; },
    };
    return { state, loop };
  };

  test("an earlier board that scored better than the last one goes back over the board", async () => {
    // Round 2 reviews the board revise 1 left: 1 fault. The later revises make it worse.
    const { state, loop } = drawing({ "first pass": 5, "revise 1": 1, "revise 2": 4, "revise 3": 3 });
    const record = await reviewLoop({ budget: 3, ...loop });
    expect(record.rounds.map((round) => round.score)).toEqual([5, 1, 4, 3]);
    expect(record.kept).toEqual({ round: 2, restored: true, reason: "round 2 scored 1, and the last board (round 4) scored 3" });
    expect([state.board, state.restored]).toEqual(["revise 1", [2]]);
    expect(ledgerText(record)).toEndWith("Stop: budget\nKept: round 2, restored. round 2 scored 1, and the last board (round 4) scored 3.\n");
    expect(loopSummary(record)).toContain("kept round 2 (restored)");
  });

  test("a blocker weighs 3 shoulds, and a lint counts as the critics' findings do", async () => {
    const error = lint({ rule: "tangent-wires", severity: "error", at: ["w"], message: "w runs along b" });
    const record = await reviewLoop({
      budget: 1,
      review: async (round) => review(round === 1 ? { findings: [seen(), seen({ ids: ["v"] })] } : { lints: [error] }),
      revise: async (_round, findings) => ran(answered(findings, "fixed")),
      restore: () => {},
    });
    expect(record.rounds.map((round) => round.score)).toEqual([2, 3]);
    expect(record.kept).toMatchObject({ round: 1, restored: true });
  });

  test("the last board stays when it scored best, and on a tie", async () => {
    const better = drawing({ "first pass": 5, "revise 1": 3, "revise 2": 2 });
    expect((await reviewLoop({ budget: 2, ...better.loop })).kept)
      .toEqual({ round: 3, restored: false, reason: "round 3 is the last board and scored 2, the best of the loop" });
    const tie = drawing({ "first pass": 5, "revise 1": 2, "revise 2": 2 });
    expect((await reviewLoop({ budget: 2, ...tie.loop })).kept)
      .toEqual({ round: 3, restored: false, reason: "round 3 is the last board and scored 2, level with round 2: a tie keeps the later board" });
    expect([better.state.board, tie.state.board, tie.state.restored]).toEqual(["revise 2", "revise 2", []]);
  });

  test("a review that lost a critic's answer undercounts: early it cannot win, and last it loses only to a lower full score", async () => {
    // Round 2 lost a region and scored 1. It does not beat the last board, which scored 2.
    const early = drawing({ "first pass": 5, "revise 1": 1, "revise 2": 2 }, { "revise 1": 1 });
    expect((await reviewLoop({ budget: 2, ...early.loop })).kept).toMatchObject({ round: 3, restored: false });
    // The last review lost a region and still found 2 faults. Round 2 found 3 with every region, which may be no worse.
    const last = drawing({ "first pass": 5, "revise 1": 3, "revise 2": 2 }, { "revise 2": 1 });
    expect((await reviewLoop({ budget: 2, ...last.loop })).kept).toEqual({
      round: 3, restored: false, reason: "round 3 is the last board. Its review lost 1 of 2 regions, so it scored 2 or more, and no full review scored less than 2",
    });
    // The last review lost a region and still found 4 faults. Round 2 found 1 with every region: the better board.
    const worse = drawing({ "first pass": 5, "revise 1": 1, "revise 2": 4 }, { "revise 2": 1 });
    expect((await reviewLoop({ budget: 2, ...worse.loop })).kept)
      .toEqual({ round: 2, restored: true, reason: "round 2 scored 1, and the last board (round 3) scored 4 or more" });
    expect([early.state.restored, last.state.restored, worse.state.board]).toEqual([[], [], "revise 1"]);
  });

  test("a failed revise leaves a board the check round scores, and a better earlier board replaces it", async () => {
    const { state, loop } = drawing({ "first pass": 2, "revise 1": 6 });
    const record = await reviewLoop({ budget: 5, ...loop, revise: async (round) => { state.board = `revise ${round}`; return ran("", 1); } });
    expect(record).toMatchObject({ stop: "failed", error: "round 1: the revise pass exited 1", kept: { round: 1, restored: true } });
    expect(state.board).toBe("first pass");
  });

  test("with no review of the last board, the loop keeps it and names no round", async () => {
    const { state, loop } = drawing({ "first pass": 2 });
    const record = await reviewLoop({ budget: 2, ...loop, revise: async () => { state.board = "half revised"; throw new Error("no drawer"); } });
    expect(record).toMatchObject({ stop: "failed", error: "no drawer", kept: null });
    expect([state.board, state.restored]).toEqual(["half revised", []]);
  });
});
