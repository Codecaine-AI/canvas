import { describe, expect, test } from "bun:test";

import {
  declinedFindings, findingLine, ledgerText, loopSummary, parseAnswers, reaskPrompt, reviewLoop, reviseMessage, roundFindings,
  type LoopFinding, type Review,
} from "./critic-loop.ts";
import { parseCritic, type MergedFinding, type ReviewLint } from "./critic.ts";

const lint = (overrides: Partial<ReviewLint> = {}): ReviewLint => ({
  rule: "near-miss", severity: "warning", at: ["a", "b"], message: "b is 20px off a's center line, so w bends", suggestion: "move b by dy -20", state: "s1", ...overrides,
});
const seen = (overrides: Partial<MergedFinding> = {}): MergedFinding => ({
  kind: "routing", ids: ["w"], labels: ["ghost"], problem: "The wire bends twice.", severity: "should", regions: ["sec_a"], marks: [], ...overrides,
});
const review = (overrides: Partial<Review> = {}): Review => ({
  reviewMs: 40, renderMs: 4, effort: "medium", reviewers: { section: 1, gap: 0, wire: 1, space: 1, choices: 1, loose: 0 }, regions: 4, unparsed: 0, lints: [], findings: [], ...overrides,
});
const ran = (reply: string, exitCode: number | null = 0, limit: { tries?: number; rateLimited?: boolean } = {}) =>
  ({ run: { exitCode, signal: null, timedOut: exitCode === null, durationMs: 9, tries: 1, rateLimited: false, ...limit }, reply });
const answered = (findings: LoopFinding[], verdict: string) => findings.map((finding) => `${finding.id} ${verdict}`).join("\n");
/** The round's findings with the drawer's answers on them: the ledger the next round reads. */
const answeredRound = (ledger: LoopFinding[], input: Pick<Review, "lints" | "findings">, reply: string, round = 1) => {
  const { findings } = roundFindings(ledger, input, round);
  const answers = parseAnswers(reply);
  for (const finding of findings) finding.answer = answers.get(finding.id) ?? null;
  return [...ledger, ...findings];
};

describe("critic loop findings", () => {
  test("a round's findings are the lints and the reviewers', most severe first, each with an id, and a reviewer's line holds no fix", () => {
    const { findings, withheld, score } = roundFindings([], {
      lints: [lint(), lint({ rule: "tangent-wires", severity: "error", at: ["w"], message: "w runs along b", suggestion: undefined })],
      findings: [seen({ severity: "blocker" }), seen({ severity: "nit", kind: "colour", ids: ["a"], labels: [] })],
    });
    expect(findings.map((finding) => [finding.id, finding.source, finding.severity, finding.kind])).toEqual([
      ["F2", "check", "blocker", "tangent-wires"],
      ["F3", "reviewer", "blocker", "routing"],
      ["F1", "check", "should", "near-miss"],
      ["F4", "reviewer", "nit", "colour"],
    ]);
    // A lint keeps canvas_check's own advice. A reviewer says what is wrong, and no more.
    expect(findings.map(findingLine)).toEqual([
      "F2 [blocker, check tangent-wires] w runs along b.",
      `F3 [blocker, routing] w, "ghost": The wire bends twice.`,
      "F1 [should, check near-miss] b is 20px off a's center line, so w bends. Fix: move b by dy -20",
      "F4 [nit, colour] a: The wire bends twice.",
    ]);
    // 3 a blocker, 1 a should, 0 a nit.
    expect([withheld, score]).toEqual([[], 7]);
  });

  test("a lint the drawer fixed or gave no reason for is raised again under its id while it is on the board", () => {
    const gap = lint({ at: ["c"], message: "c sits 120px from b and 140px from d" });
    const ledger = answeredRound([], { lints: [lint(), gap], findings: [seen()] }, "F1 fixed\nF2 declined\nF3 fixed");
    const second = roundFindings(ledger, { lints: [lint(), gap], findings: [seen()] }, 2);
    expect(second.findings.map((finding) => [finding.id, finding.answer])).toEqual([["F1", null], ["F2", null], ["F4", null]]);
    expect(second.withheld).toEqual([]);
  });

  test("a lint the drawer declined with a reason is held while its items stay as they are, and comes back when one changes", () => {
    const error = lint({ rule: "tangent-wires", severity: "error", at: ["w"], message: "w runs along b" });
    const gap = lint({ at: ["c"], message: "c sits 120px from b and 140px from d" });
    const ledger = answeredRound([], { lints: [gap, error], findings: [] }, "F1 declined: the gap holds a label\nF2 disagree: it does not");

    const same = roundFindings(ledger, { lints: [gap, error], findings: [] }, 2);
    expect(same.findings).toEqual([]);
    expect(same.withheld.map((fault) => [fault.id, fault.why, fault.severity])).toEqual([["F1", "held", "should"], ["F2", "held", "blocker"]]);
    // A held lint is still on the board, so it still counts against the board.
    expect(same.score).toBe(4);

    const moved = roundFindings(ledger, { lints: [{ ...gap, state: "s2" }, error], findings: [] }, 2);
    expect(moved.findings.map((finding) => finding.id)).toEqual(["F1"]);
    expect(moved.withheld.map((fault) => fault.id)).toEqual(["F2"]);
  });

  test("a lint the drawer declined with a reason twice is settled: it is not sent again, even when its items change", () => {
    const gap = lint({ at: ["c"], message: "c sits 120px from b and 140px from d" });
    const once = answeredRound([], { lints: [gap], findings: [] }, "F1 declined: the gap holds a label");
    const twice = answeredRound(once, { lints: [{ ...gap, state: "s2" }], findings: [] }, "F1 declined: the gap still holds a label", 2);
    const third = roundFindings(twice, { lints: [{ ...gap, state: "s3" }], findings: [] }, 3);
    expect(third.findings).toEqual([]);
    expect(third.withheld).toEqual([{ id: "F1", source: "check", severity: "should", kind: "near-miss", ids: ["c"], problem: "c sits 120px from b and 140px from d", why: "settled" }]);
  });

  test("a reviewer's fault the drawer turned down twice is settled: the third report of it is not sent and does not score", () => {
    const once = answeredRound([], { lints: [], findings: [seen()] }, "F1 declined: the bend clears a label");
    // The second report words the fault another way. It names the same wire, so it is the same fault.
    const again = seen({ problem: "W bends 2 times on its way." });
    const second = roundFindings(once, { lints: [], findings: [again] }, 2);
    expect([second.findings.map((finding) => finding.id), second.withheld]).toEqual([["F2"], []]);
    const twice = answeredRound(once, { lints: [], findings: [again] }, "F2 disagree: one bend is the port", 2);

    const third = roundFindings(twice, { lints: [], findings: [seen(), seen({ ids: ["v"] }), seen({ kind: "label_chip" })] }, 3);
    expect(third.findings.map((finding) => [finding.id, finding.kind, finding.ids])).toEqual([["F3", "routing", ["v"]], ["F4", "label_chip", ["w"]]]);
    expect(third.withheld).toEqual([{ id: null, source: "reviewer", severity: "should", kind: "routing", ids: ["w"], problem: "The wire bends twice.", why: "settled" }]);
    expect(third.score).toBe(2);
    // A fault the drawer fixed and that came back is not settled, however often.
    const fixed = answeredRound(answeredRound([], { lints: [], findings: [seen()] }, "F1 fixed"), { lints: [], findings: [seen()] }, "F2 fixed", 2);
    expect(roundFindings(fixed, { lints: [], findings: [seen()] }, 3).withheld).toEqual([]);
  });

  test("the next round's reviewers get each finding the drawer turned down, with its reason", () => {
    const first = answeredRound([], { lints: [lint()], findings: [
      seen(), seen({ ids: ["v"] }), seen({ kind: "spacing", ids: ["sec_a", "sec_b"], labels: [], regions: ["space"] }), seen({ ids: ["x"] }), seen({ ids: ["y"] }),
    ] }, "F1 declined: a lint is not theirs\nF2 declined: the bend clears a label\nF3 fixed\nF4 disagree: the gap is 120 px\nF5 declined");
    expect(declinedFindings(first)).toEqual([
      { ids: ["w"], regions: ["sec_a"], line: `[routing] w, "ghost": The wire bends twice. The drawer declined: the bend clears a label`, settled: false },
      { ids: ["sec_a", "sec_b"], regions: ["space"], line: "[spacing] sec_a, sec_b: The wire bends twice. The drawer disagreed: the gap is 120 px", settled: false },
      { ids: ["x"], regions: ["sec_a"], line: `[routing] x, "ghost": The wire bends twice. The drawer declined: it gave no reason`, settled: false },
    ]);
    // Declined again by another reviewer: one line, the last reason, both reviewers, and settled.
    const second = answeredRound(first, { lints: [], findings: [seen({ regions: ["wires"] })] }, "F7 declined: still clear of the label", 2);
    expect(declinedFindings(second)[0]).toEqual({
      ids: ["w"], regions: ["sec_a", "wires"], line: `[routing] w, "ghost": The wire bends twice. The drawer declined: still clear of the label`, settled: true,
    });
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
    const message = reviseMessage("b1", roundFindings([], { lints: [lint()], findings: [] }).findings);
    expect(message).toHaveLength(1);
    const prompt = message[0] as string;
    expect(prompt).toContain(`canvas_open, canvas id "b1"`);
    expect(prompt).toContain("<findings>\nF1 [should, check near-miss] b is 20px off a's center line, so w bends. Fix: move b by dy -20\n</findings>");
    expect(prompt).toContain("<id> declined: <why you left it>");
    expect(prompt).toContain("It does not say how to fix it: the fix is your decision.");
    // With no space finding, no image and every earlier id answered, the message says nothing about them.
    expect(prompt).not.toMatch(/A space finding is fixed|The images after this text|no_answer_yet/);
  });

  test("the revise message puts the space findings first, says a section move is expected, and names each finding's reviewer and image", () => {
    const { findings } = roundFindings([], { lints: [], findings: [
      seen({ severity: "blocker" }),
      seen({ kind: "spacing", ids: ["sec_a", "sec_b"], labels: [], problem: "5 wires join sec_a and sec_b, and sec_c lies between them.", regions: ["space"] }),
      seen({ severity: "nit", kind: "label_chip", ids: ["v"], labels: [], regions: ["gap-1", "space"] }),
    ] });
    const message = reviseMessage("b1", findings, { images: [
      { unit: "space", path: "/t/space.png", findings: ["F2", "F3"] },
      { unit: "sec_a", path: "/t/sec_a.png", findings: ["F1"] },
      { unit: "gap-1", path: "/t/gap-1.png", findings: ["F3"] },
    ] });
    const text = message[0] as string;
    // The 2 space findings, most severe first, then the rest.
    expect(text).toContain([
      "<findings>",
      "F2 [should, spacing] sec_a, sec_b: 5 wires join sec_a and sec_b, and sec_c lies between them.",
      "  from space · image 1",
      "F3 [nit, label_chip] v: The wire bends twice.",
      "  from gap-1, space · image 1, image 3",
      `F1 [blocker, routing] w, "ghost": The wire bends twice.`,
      "  from sec_a · image 2",
      "</findings>",
    ].join("\n"));
    expect(text).toContain("A space finding is fixed by moving or resizing whole sections: `arrange`, `move`, `place_section`, `fit_section`. That is expected, and nothing in this loop counts against it.");
    expect(text).toContain("Then route the wires again");
    expect(text).toContain("each fault marked in red and tagged with its finding's id");
    expect(message.slice(1)).toEqual([
      "Image 1 · space · F2, F3", { image: "/t/space.png" }, "Image 2 · sec_a · F1", { image: "/t/sec_a.png" }, "Image 3 · gap-1 · F3", { image: "/t/gap-1.png" },
    ]);
  });

  test("the re-ask names the ids and asks for their answer lines only", () => {
    const prompt = reaskPrompt(["F2", "F5"]);
    expect(prompt).toContain("no answer line for F2, F5");
    expect(prompt).toContain("Make no new edits");
    expect(parseAnswers(prompt).size).toBe(0);
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
      budget: 2,
      review: async () => review(two),
      revise: async (_round, findings) => reply(findings),
      reask: async () => { asks += 1; return ran(""); },
    });
    expect((await loop((findings) => ran(answered(findings, "fixed")))).rounds[0]!.revise).toMatchObject({ reask: null, unanswered: [] });
    expect(await loop(() => ran("", 1))).toMatchObject({ stop: "failed", unanswered: ["F1", "F2"] });
    expect(asks).toBe(0);
  });

  test("a second ask that throws fails the loop, and the record keeps the ids with no answer", async () => {
    const record = await reviewLoop({
      budget: 2,
      review: async () => review(two),
      revise: async () => ran("F1 fixed"),
      reask: async () => { throw new Error("spawn claude ENOENT"); },
    });
    expect([record.stop, record.error, record.unanswered]).toEqual(["failed", "spawn claude ENOENT", ["F2"]]);
    expect(record.rounds[0]!.revise).toMatchObject({ answered: 1, reask: null, unanswered: ["F2"] });
  });

  test("an id with no answer after the second ask goes into the next revise, and a round with no finding does not stop the loop", async () => {
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
    // The reviewers read a finding only once the drawer turned it down.
    expect(earlierSeen).toEqual([[], [], [`[routing] v, "ghost": The wire bends twice. The drawer declined: it reads well`]]);
    expect(messages[0]).not.toContain("no_answer_yet");
    expect(messages[1]).toContain("You gave no answer to the findings in <no_answer_yet>");
    expect(messages[1]).toContain(`<findings>\n</findings>\n\n<no_answer_yet>\nF2 [should, routing] v, "ghost": The wire bends twice.\n</no_answer_yet>`);
    expect(record.rounds.map((round) => [round.score, round.revise?.unanswered ?? null])).toEqual([[2, ["F2"]], [0, []], [0, null]]);
    // The answer lands on the finding where round 1 raised it.
    expect(record.rounds[0]!.findings[1]!.answer).toEqual({ verdict: "declined", reason: "it reads well" });
    expect([record.stop, record.unanswered]).toEqual(["clean", []]);
  });

  test("a loop that ends with an id unanswered is incomplete, never clean", async () => {
    let revises = 0;
    const record = await reviewLoop({
      budget: 3,
      review: async (round) => review(round === 1 ? two : {}),
      revise: async () => { revises += 1; return ran("F1 fixed"); },
      reask: async () => ran(""),
    });
    // Rounds 2 and 3 find nothing, and F2 never gets its answer.
    expect([record.stop, record.unanswered, record.rounds.length, revises]).toEqual(["incomplete", ["F2"], 3, 2]);
    expect(record.rounds.map((round) => round.revise?.reask?.ids ?? null)).toEqual([["F2"], ["F2"], null]);
    expect(ledgerText(record)).toContain(`F2 [should, routing] v, "ghost": The wire bends twice.\n  → no answer`);
    expect(ledgerText(record)).toContain("Stop: incomplete\nNo answer: F2\n");
    expect(loopSummary(record)).toContain("stop incomplete after 3 of 3 rounds at medium effort · last round: 0 blocker, 0 should, 0 nit · no answer: F2");
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

  test("the review starts again each time a revise pass ends, until a round is clean", async () => {
    const order: string[] = [];
    const earlierSeen: string[][] = [];
    const record = await reviewLoop({
      budget: 20,
      review: async (round, earlier) => {
        order.push(`review ${round}`);
        earlierSeen.push(earlier.map((finding) => finding.line));
        return review(round < 3 ? { lints: [lint({ state: `s${round}` })], findings: [seen({ ids: [`w${round}`] })] } : {});
      },
      revise: async (round, findings) => {
        order.push(`revise ${round}`);
        return ran(`${findings[0]!.id} fixed\n${findings[1]!.id} declined: the bend clears a label`);
      },
    });
    expect(order).toEqual(["review 1", "revise 1", "review 2", "revise 2", "review 3"]);
    expect([record.stop, record.rounds.length, record.effort]).toEqual(["clean", 3, "medium"]);
    expect(record.rounds[0]!.findings.map((finding) => finding.answer?.verdict)).toEqual(["fixed", "declined"]);
    expect(record.rounds[0]!.revise).toMatchObject({ exitCode: 0, answered: 2, tries: 1, rateLimited: false });
    // The second round's reviewers read the finding the drawer declined, and its reason.
    expect(earlierSeen[1]).toEqual([`[routing] w1, "ghost": The wire bends twice. The drawer declined: the bend clears a label`]);
    expect(ledgerText(record)).toContain("F1 [should, check near-miss] b is 20px off a's center line, so w bends. Fix: move b by dy -20\n  → fixed");
  });

  test("the budget counts review rounds: the last one reviews what the last revise left, and nothing revises after it", async () => {
    let revises = 0;
    const record = await reviewLoop({
      budget: 3,
      review: async () => review({ findings: [seen()] }),
      revise: async (_round, findings) => { revises += 1; return ran(answered(findings, "fixed")); },
    });
    expect([record.stop, record.rounds.length, revises]).toEqual(["budget", 3, 2]);
    expect(record.rounds.map((round) => round.findings[0]!.id)).toEqual(["F1", "F2", "F3"]);
    // The last round has findings and no revise, and it is not a failed pass.
    expect(record.rounds.map((round) => [round.check, round.revise?.exitCode ?? null])).toEqual([[false, 0], [false, 0], [true, null]]);
    expect(record.error).toBeNull();
    expect(loopSummary(record)).toContain("stop budget after 3 of 3 rounds at medium effort · last round: 0 blocker, 1 should, 0 nit");
    expect(ledgerText(record)).toContain("## Round 3 (last review: no revise) · score 1 · 4 reviewers at medium\nF3 [should, routing]");
  });

  test("with no flag, a loop that never comes clean runs 20 review rounds", async () => {
    let revises = 0;
    const record = await reviewLoop({
      budget: parseCritic(new Map()).rounds,
      review: async (round) => review({ findings: [seen({ ids: [`w${round}`] })] }),
      revise: async (_round, findings) => { revises += 1; return ran(answered(findings, "fixed")); },
    });
    expect([record.stop, record.budget, record.rounds.length, revises]).toEqual(["budget", 20, 20, 19]);
  });

  test("a last round that comes back clean stops the loop clean", async () => {
    const record = await reviewLoop({
      budget: 2,
      review: async (round) => review(round === 1 ? { findings: [seen()] } : {}),
      revise: async (_round, findings) => ran(answered(findings, "fixed")),
    });
    expect([record.stop, record.rounds.map((round) => round.check)]).toEqual(["clean", [false, true]]);
  });

  test("a lint the drawer declined with a reason does not come back each round: the loop ends, and the record says what it held", async () => {
    let revises = 0;
    const record = await reviewLoop({
      budget: 20,
      review: async () => review({ lints: [lint()] }),
      revise: async (_round, findings) => { revises += 1; return ran(answered(findings, "declined: the bend clears a label")); },
    });
    expect([record.stop, record.rounds.length, revises]).toEqual(["clean", 2, 1]);
    expect(record.rounds[1]).toMatchObject({ findings: [], score: 1, withheld: [{ id: "F1", why: "held" }] });
    expect(ledgerText(record)).toContain("Not sent (held): F1 [should, check near-miss] a, b: b is 20px off a's center line, so w bends.");
    expect(loopSummary(record)).toContain("1 not sent (held or settled)");
  });

  test("a lint the drawer declines with no reason is still sent each round", async () => {
    const record = await reviewLoop({
      budget: 3,
      review: async () => review({ lints: [lint()] }),
      revise: async (_round, findings) => ran(answered(findings, "declined")),
    });
    expect([record.stop, record.rounds.map((round) => round.findings.map((finding) => finding.id))]).toEqual(["budget", [["F1"], ["F1"], ["F1"]]]);
  });

  test("a fault the drawer declined twice is settled: the third round does not send it, and the loop ends", async () => {
    const settled: boolean[][] = [];
    const record = await reviewLoop({
      budget: 20,
      review: async (_round, earlier) => { settled.push(earlier.map((finding) => finding.settled)); return review({ findings: [seen()] }); },
      revise: async (_round, findings) => ran(answered(findings, "declined: the bend clears a label")),
    });
    expect([record.stop, record.rounds.length]).toEqual(["clean", 3]);
    expect(settled).toEqual([[], [false], [true]]);
    expect(record.rounds[2]).toMatchObject({ findings: [], score: 0, withheld: [{ id: null, why: "settled", kind: "routing", ids: ["w"] }] });
  });

  test("a reviewer that gave no answer did not approve: the round is not clean, and the review runs again", async () => {
    const record = await reviewLoop({
      budget: 2,
      review: async (round) => review({ unparsed: round === 1 ? 1 : 0 }),
      revise: async () => { throw new Error("nothing to revise"); },
    });
    expect([record.stop, record.rounds.length]).toEqual(["clean", 2]);
    const lost = await reviewLoop({ budget: 2, review: async () => review({ unparsed: 1 }), revise: async () => { throw new Error("nothing to revise"); } });
    expect([lost.stop, lost.rounds.length]).toEqual(["budget", 2]);
  });

  test("with no drawer the loop is one review", async () => {
    const record = await reviewLoop({ budget: 3, review: async () => review({ lints: [lint()] }) });
    expect([record.stop, record.rounds.length]).toEqual(["review-only", 1]);
  });

  test("a revise pass that fails stops the loop and says why, after a last review of what it left", async () => {
    const record = await reviewLoop({ budget: 5, review: async () => review({ lints: [lint()] }), revise: async () => ran("", null) });
    expect(record).toMatchObject({ stop: "failed", error: "round 1: the revise pass timed out" });
    expect(record.rounds.map((round) => [round.check, round.revise === null])).toEqual([[false, false], [true, true]]);
    const thrown = await reviewLoop({ budget: 3, review: async () => { throw new Error("no board"); } });
    expect(thrown).toMatchObject({ stop: "failed", error: "no board", rounds: [], effort: null, kept: null });
  });

  test("a revise pass that a rate limit stopped on every try does not fail the loop: a last review scores the board and the stop says rate-limited", async () => {
    const record = await reviewLoop({
      budget: 5,
      review: async () => review({ findings: [seen()] }),
      revise: async () => ran("", 1, { tries: 5, rateLimited: true }),
      restore: () => {},
    });
    expect(record).toMatchObject({ stop: "rate-limited", error: "round 1: the revise pass hit a rate limit on each of its 5 tries" });
    expect(record.rounds.map((round) => round.check)).toEqual([false, true]);
    expect(record.kept).toMatchObject({ round: 2, restored: false });
    // A pass that got through after a wait is a pass like any other.
    const waited = await reviewLoop({
      budget: 5,
      review: async (round) => review(round === 1 ? { findings: [seen()] } : {}),
      revise: async (_round, findings) => ran(answered(findings, "fixed"), 0, { tries: 3 }),
    });
    expect([waited.stop, waited.error, waited.rounds[0]!.revise!.tries]).toEqual(["clean", null, 3]);
  });

  test("when the loop's time is up it starts no new revise pass: the round then reviewed is its last", async () => {
    let revises = 0;
    const record = await reviewLoop({
      budget: 20,
      review: async () => review({ findings: [seen()] }),
      revise: async (_round, findings) => { revises += 1; return ran(answered(findings, "fixed")); },
      timeUp: () => revises >= 2,
    });
    expect([record.stop, record.error, record.rounds.length, revises]).toEqual(["time", null, 3, 2]);
    expect(record.rounds.map((round) => [round.check, round.revise === null])).toEqual([[false, false], [false, false], [true, true]]);
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
    const record = await reviewLoop({ budget: 4, ...loop });
    expect(record.rounds.map((round) => round.score)).toEqual([5, 1, 4, 3]);
    expect(record.kept).toEqual({ round: 2, restored: true, reason: "round 2 scored 1, and the last board (round 4) scored 3" });
    expect([state.board, state.restored]).toEqual(["revise 1", [2]]);
    expect(ledgerText(record)).toEndWith("Stop: budget\nKept: round 2, restored. round 2 scored 1, and the last board (round 4) scored 3.\n");
    expect(loopSummary(record)).toContain("kept round 2 (restored)");
  });

  test("a blocker weighs 3 shoulds, and a lint counts as the reviewers' findings do", async () => {
    const error = lint({ rule: "tangent-wires", severity: "error", at: ["w"], message: "w runs along b" });
    const record = await reviewLoop({
      budget: 2,
      review: async (round) => review(round === 1 ? { findings: [seen(), seen({ ids: ["v"] })] } : { lints: [error] }),
      revise: async (_round, findings) => ran(answered(findings, "fixed")),
      restore: () => {},
    });
    expect(record.rounds.map((round) => round.score)).toEqual([2, 3]);
    expect(record.kept).toMatchObject({ round: 1, restored: true });
  });

  test("a section move is not punished: the lint warnings a revise pass leaves on new items do not count in their first round", async () => {
    // Round 1: one space fault. The drawer moves 2 sections, and round 2 finds no fault and 2 new warnings on what moved.
    const moved = [lint({ at: ["sec_a", "n1"] }), lint({ rule: "tight-gap", at: ["sec_b", "sec_c"], message: "sec_b sits 30px from sec_c" })];
    const space = seen({ kind: "spacing", ids: ["sec_a", "sec_b"], regions: ["space"] });
    const loop = (budget: number) => reviewLoop({
      budget,
      review: async (round) => review(round === 1 ? { lints: [lint()], findings: [space] } : { lints: [lint(), ...moved] }),
      revise: async (_round, findings) => ran(answered(findings, "fixed")),
      restore: () => {},
    });
    const two = await loop(2);
    // The warning both boards have counts on both. The 2 new ones count 0 in round 2.
    expect(two.rounds.map((round) => round.score)).toEqual([2, 1]);
    expect(two.kept).toMatchObject({ round: 2, restored: false });
    // The drawer still gets them, and they count from the next round on.
    expect(two.rounds[1]!.findings.map((finding) => finding.kind)).toEqual(["near-miss", "near-miss", "tight-gap"]);
    expect((await loop(3)).rounds.map((round) => round.score)).toEqual([2, 1, 3]);
  });

  test("the last board stays when it scored best, and on a tie", async () => {
    const better = drawing({ "first pass": 5, "revise 1": 3, "revise 2": 2 });
    expect((await reviewLoop({ budget: 3, ...better.loop })).kept)
      .toEqual({ round: 3, restored: false, reason: "round 3 is the last board and scored 2, the best of the loop" });
    const tie = drawing({ "first pass": 5, "revise 1": 2, "revise 2": 2 });
    expect((await reviewLoop({ budget: 3, ...tie.loop })).kept)
      .toEqual({ round: 3, restored: false, reason: "round 3 is the last board and scored 2, level with round 2: a tie keeps the later board" });
    expect([better.state.board, tie.state.board, tie.state.restored]).toEqual(["revise 2", "revise 2", []]);
  });

  test("a review that lost a reviewer's answer undercounts: early it cannot win, and last it loses only to a lower full score", async () => {
    // Round 2 lost a reviewer and scored 1. It does not beat the last board, which scored 2.
    const early = drawing({ "first pass": 5, "revise 1": 1, "revise 2": 2 }, { "revise 1": 1 });
    expect((await reviewLoop({ budget: 3, ...early.loop })).kept).toMatchObject({ round: 3, restored: false });
    // The last review lost a reviewer and still found 2 faults. Round 2 found 3 with every reviewer, which may be no worse.
    const last = drawing({ "first pass": 5, "revise 1": 3, "revise 2": 2 }, { "revise 2": 1 });
    expect((await reviewLoop({ budget: 3, ...last.loop })).kept).toEqual({
      round: 3, restored: false, reason: "round 3 is the last board. Its review lost 1 of 4 reviewers, so it scored 2 or more, and no full review scored less than 2",
    });
    // The last review lost a reviewer and still found 4 faults. Round 2 found 1 with every reviewer: the better board.
    const worse = drawing({ "first pass": 5, "revise 1": 1, "revise 2": 4 }, { "revise 2": 1 });
    expect((await reviewLoop({ budget: 3, ...worse.loop })).kept)
      .toEqual({ round: 2, restored: true, reason: "round 2 scored 1, and the last board (round 3) scored 4 or more" });
    expect([early.state.restored, last.state.restored, worse.state.board]).toEqual([[], [], "revise 1"]);
  });

  test("a failed revise leaves a board the last review scores, and a better earlier board replaces it", async () => {
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
