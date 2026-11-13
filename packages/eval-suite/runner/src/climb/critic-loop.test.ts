import { describe, expect, test } from "bun:test";

import {
  declinedFindings, findingLine, ledgerText, loopSummary, parseAnswers, reaskPrompt, reviewLoop, reviseMessage, roundFindings,
  type LoopFinding, type Review,
} from "./critic-loop.ts";
import { parseCritic, type MergedFinding, type ReviewLint } from "./critic.ts";
import type { RethinkRecord } from "./rethink.ts";
import type { ComputedFault } from "./space.ts";

const lint = (overrides: Partial<ReviewLint> = {}): ReviewLint => ({
  rule: "near-miss", severity: "warning", at: ["a", "b"], message: "b is 20px off a's center line, so w bends", suggestion: "move b by dy -20", state: "s1", ...overrides,
});
const seen = (overrides: Partial<MergedFinding> = {}): MergedFinding => ({
  kind: "routing", ids: ["w"], labels: ["ghost"], problem: "The wire bends twice.", severity: "should", regions: ["sec_a"], marks: [], ...overrides,
});
const NARROW = "The gap between sec_a and sec_b (side by side) is 200 px wide and 3 wires cross it or run along it: the gap rule asks 240 px, so it is 40 px too narrow";
/** A measure of the runner that fails (space.ts): a gap under its rule number. */
const measure = (overrides: Partial<ComputedFault> = {}): ComputedFault => ({
  kind: "space", key: `["gap","under",["sec_a","sec_b"]]`, ids: ["sec_a", "sec_b"], problem: NARROW, marks: [{ box: { x: 300, y: 0, width: 200, height: 400 } }], ...overrides,
});
/** An empty block of the board frame (space.ts): 2 of them share the key, and the place tells them apart. */
const hole = (x: number, y: number, width: number, height: number): ComputedFault => ({
  kind: "space", key: `["empty-block","page"]`, ids: ["page"], block: { x, y, width, height }, marks: [{ box: { x, y, width, height } }],
  problem: `An empty block of ${width} × ${height} px sits in the board frame`,
});
const review = (overrides: Partial<Review> = {}): Review => ({
  reviewMs: 40, renderMs: 4, effort: "medium", reviewers: { section: 1, gap: 0, wire: 1, space: 1, choices: 1, loose: 0 }, regions: 4, unparsed: 0, lints: [], findings: [], computed: [], ...overrides,
});
const ran = (reply: string, exitCode: number | null = 0, limit: { tries?: number; rateLimited?: boolean } = {}) =>
  ({ run: { exitCode, signal: null, timedOut: exitCode === null, durationMs: 9, tries: 1, rateLimited: false, ...limit }, reply });
const answered = (findings: LoopFinding[], verdict: string) => findings.map((finding) => `${finding.id} ${verdict}`).join("\n");
/** The round's findings with the drawer's answers on them: the ledger the next round reads. */
const answeredRound = (ledger: LoopFinding[], input: Parameters<typeof roundFindings>[1], reply: string, round = 1) => {
  const { findings } = roundFindings(ledger, input, round);
  const answers = parseAnswers(reply);
  for (const finding of findings) finding.answer = answers.has(finding.id) ? { ...answers.get(finding.id)!, round } : null;
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
    // 2 faults of one kind on one wire, declined in one round, are one decline: the wire's next fault is still sent.
    const pair = answeredRound([], { lints: [], findings: [seen(), seen({ problem: "The wire runs along the border." })] }, "F1 declined: the bend clears a label\nF2 declined: the border is 30 px off");
    expect(roundFindings(pair, { lints: [], findings: [seen()] }, 2)).toMatchObject({ findings: [{ id: "F3" }], withheld: [] });
    // The reviewers read both problems, each with its reason.
    expect(declinedFindings(pair).map((fault) => [fault.line, fault.settled])).toEqual([
      [`[routing] w, "ghost": The wire bends twice. The drawer declined: the bend clears a label`, false],
      [`[routing] w, "ghost": The wire runs along the border. The drawer declined: the border is 30 px off`, false],
    ]);
    // A finding with no answer until the next round's pass, declined there with that round's report of the fault: one pass, one decline.
    const late = roundFindings([], { lints: [], findings: [seen()] }).findings;
    const both = answeredRound(late, { lints: [], findings: [seen()] }, "F2 declined: the bend clears a label", 2);
    both[0]!.answer = { verdict: "declined", reason: "the bend clears a label", round: 2 };
    expect(roundFindings(both, { lints: [], findings: [seen()] }, 3)).toMatchObject({ findings: [{ id: "F3" }], withheld: [] });
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
    expect(prompt).toContain("A fix must not resize a section past its content, merge nodes, or grow an empty block. After you move a section, close the space it left.");
    // With no space finding, no image and every earlier id answered, the message says nothing about them.
    expect(prompt).not.toMatch(/fixed by moving or resizing whole sections|The images after this text|no_answer_yet|`measured`|`history`/);
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
    expect(text).toContain("The `measured` findings and the findings from the `space` reviewer come first. They are fixed by moving or resizing whole sections: `arrange`, `move`, `place_section`, `fit_section`."
      + " That is expected, and nothing in this loop counts against it.");
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

describe("critic loop computed findings", () => {
  const only = (computed: ComputedFault[]) => ({ lints: [], findings: [], computed });

  test("a measure of the runner that fails is a finding: a should of kind space, after the lints and ahead of the reviewers' findings", () => {
    const { findings, score } = roundFindings([], { lints: [lint()], findings: [seen()], computed: [measure()] });
    expect(findings.map((finding) => [finding.id, finding.source, finding.severity, finding.kind, finding.regions])).toEqual([
      ["F1", "check", "should", "near-miss", []], ["F2", "computed", "should", "space", ["space"]], ["F3", "reviewer", "should", "routing", ["sec_a"]],
    ]);
    // Its problem names its items and holds its numbers. Its mark goes on the image of the space reviewer.
    expect(findingLine(findings[1]!)).toBe(`F2 [should, measured space] ${NARROW}.`);
    expect(findings[1]!.marks).toEqual([{ unit: "space", marks: [{ box: { x: 300, y: 0, width: 200, height: 400 } }] }]);
    expect(score).toBe(3);
  });

  test("no decline settles or holds a computed finding: it comes back under its id, with its new numbers, and counts in the score", () => {
    const wider = measure({ problem: NARROW.replace("200 px wide", "220 px wide").replace("40 px too", "20 px too") });
    let ledger = answeredRound([], only([measure()]), "F1 declined: the 3 wires fit in 200 px");
    // A lint declined with a reason is held here, and a reviewer's finding goes to the next reviewers with the reason.
    const second = roundFindings(ledger, only([wider]), 2);
    expect(second.findings.map((finding) => [finding.id, finding.problem, finding.answer])).toEqual([["F1", wider.problem, null]]);
    expect([second.withheld, second.score]).toEqual([[], 1]);
    expect(declinedFindings(ledger)).toEqual([]);

    ledger = answeredRound(ledger, only([wider]), "F1 declined: the 3 wires still fit", 2);
    // 2 declines settle any other finding.
    const third = roundFindings(ledger, only([wider]), 3);
    expect([third.findings.map((finding) => finding.id), third.withheld, third.score]).toEqual([["F1"], [], 1]);
  });

  test("a computed finding the drawer got 3 times is stuck: it is listed with the drawer's last answer, not sent, and still scored, until the measure passes", () => {
    let ledger = answeredRound([], only([measure()]), "F1 fixed");
    ledger = answeredRound(ledger, only([measure()]), "F1 declined: sec_b cannot move right", 2);
    ledger = answeredRound(ledger, only([measure()]), "F1 disagree: the wires fit", 3);
    const fourth = roundFindings(ledger, { lints: [], findings: [seen({ severity: "nit" })], computed: [measure()] }, 4);
    expect(fourth.findings.map((finding) => finding.id)).toEqual(["F2"]);
    expect(fourth.withheld).toEqual([{
      id: "F1", source: "computed", severity: "should", kind: "space", ids: ["sec_a", "sec_b"], problem: NARROW, why: "stuck", answer: { verdict: "disagree", reason: "the wires fit" },
    }]);
    expect(fourth.score).toBe(1);
    // Another measure that fails in round 4 is new: it is sent.
    const block = hole(0, 0, 900, 600);
    expect(roundFindings(ledger, only([measure(), block]), 4)).toMatchObject({ findings: [{ id: "F2", state: block.key }], withheld: [{ id: "F1" }], score: 2 });
    expect(roundFindings(ledger, only([]), 4)).toEqual({ findings: [], withheld: [], score: 0, grace: 0 });
  });

  test("an empty block is the fault of the earlier block at its place, not of the block that had its rank", () => {
    const [large, small] = [hole(0, 0, 1000, 600), hole(2000, 0, 500, 500)];
    let ledger = answeredRound([], only([large, small]), "F1 fixed\nF2 declined: the legend goes there");
    // The drawer filled the large block. The small one is now the first of the frame, 50 px narrower: it is still F2.
    const left = hole(2050, 0, 450, 500);
    expect(roundFindings(ledger, only([left]), 2).findings.map((finding) => [finding.id, finding.problem, finding.history])).toEqual([["F2", left.problem, undefined]]);
    ledger = answeredRound(ledger, only([left]), "F2 declined: the legend goes there", 2);
    ledger = answeredRound(ledger, only([left]), "F2 declined: the legend goes there", 3);
    // A new block, larger than the one that is stuck, is a new finding: the 3 sends of F2 are not its own. It may come from the fix of F1.
    const fresh = hole(0, 1000, 800, 800);
    const fourth = roundFindings(ledger, only([fresh, left]), 4);
    expect(fourth.findings.map((finding) => [finding.id, finding.problem])).toEqual([["F3", fresh.problem]]);
    expect(fourth.findings[0]!.history).toStartWith("in round 1 you fixed F1 on page:");
    expect(fourth.withheld.map((fault) => [fault.id, fault.why, fault.answer])).toEqual([["F2", "stuck", { verdict: "declined", reason: "the legend goes there" }]]);
    // A node cuts one block in 2: the larger part keeps the id, and the other part is a new finding.
    const cut = roundFindings(answeredRound([], only([large]), "F1 fixed"), only([hole(0, 0, 600, 600), hole(700, 0, 300, 600)]), 2);
    expect(cut.findings.map((finding) => finding.id)).toEqual(["F1", "F2"]);
  });

  test("a block that drifts is matched at its latest place, sent or stuck: a new block at its first place is a new finding", () => {
    const at = (x: number) => hole(x, 0, 1000, 600);
    // The block moves 500 px a round: each round's block holds half of the one before.
    let ledger: LoopFinding[] = [];
    for (const [index, x] of [0, 500, 1000].entries()) ledger = answeredRound(ledger, only([at(x)]), "F1 declined: the room is for the legend", index + 1);
    expect(ledger.map((finding) => finding.id)).toEqual(["F1", "F1", "F1"]);
    const fourth = roundFindings(ledger, only([at(1500), at(0)]), 4, { findings: ledger.slice(2), withheld: [] });
    expect(fourth.findings.map((finding) => [finding.id, finding.block?.x])).toEqual([["F2", 0]]);
    expect(fourth.withheld.map((fault) => [fault.id, fault.why, fault.block?.x])).toEqual([["F1", "stuck", 1500]]);
    // The stuck block moves on: its place is the one round 4 held, not the last one sent.
    const fifth = roundFindings(ledger, only([at(2000)]), 5, fourth);
    expect(fifth.withheld.map((fault) => [fault.id, fault.block?.x])).toEqual([["F1", 2000]]);
    expect(fifth.findings).toEqual([]);
  });

  test("a measure that passed closed its finding: the same fault back on the board is a new finding, with the fix that may have caused it", async () => {
    const moved = seen({ kind: "placement", ids: ["sec_b"], labels: [], problem: "sec_b sits under the legend.", regions: ["space"] });
    const record = await reviewLoop({
      budget: 3,
      // The gap is too narrow, the drawer widens it, and its fix of the round 2 finding closes it again.
      review: async (round) => review(round === 2 ? { findings: [moved] } : { computed: [measure()] }),
      revise: async (_round, findings) => ran(answered(findings, "fixed")),
    });
    const after = (round: number, id: string, on: string, problem: string) =>
      `in round ${round} you fixed ${id} on ${on}: ${JSON.stringify(problem)}. This finding is on the same items, so that fix may have caused it. Fix it in a way that keeps ${id} fixed.`;
    expect(record.rounds.map((round) => round.findings.map((finding) => [finding.id, finding.history]))).toEqual([
      [["F1", undefined]], [["F2", after(1, "F1", "sec_a, sec_b", NARROW)]], [["F3", after(2, "F2", "sec_b", "sec_b sits under the legend.")]],
    ]);
    // With no other fix between, it is new all the same, and its own earlier fix is no history.
    const ledger = answeredRound([], only([measure()]), "F1 fixed");
    expect(roundFindings(ledger, only([measure()]), 3, { findings: [], withheld: [] }).findings.map((finding) => [finding.id, finding.history])).toEqual([["F2", undefined]]);
    // On the board in the round before, it keeps its id.
    expect(roundFindings(ledger, only([measure()]), 2, { findings: ledger, withheld: [] }).findings.map((finding) => finding.id)).toEqual(["F1"]);
  });

  test("a finding that was stuck is not asked for when its measure passes later", async () => {
    const asked: string[][] = [];
    const record = await reviewLoop({
      budget: 8,
      // The gap fails for 4 rounds, with one reviewer finding a round. Round 5 has neither.
      review: async (round) => review(round < 5 ? { computed: [measure()], findings: [seen()] } : {}),
      // The drawer answers each finding but F1.
      revise: async (_round, findings, notes) => {
        asked.push([...findings, ...notes.unanswered].map((finding) => finding.id));
        return ran(answered(findings.filter((finding) => finding.id !== "F1"), "fixed"));
      },
    });
    expect(asked).toEqual([["F1", "F2"], ["F1", "F3"], ["F1", "F4"], ["F5"]]);
    expect([record.stop, record.rounds.length, record.unanswered]).toEqual(["clean", 5, ["F1"]]);
  });

  test("a stuck finding the drawer never answered is not asked for again: the loop stops stuck", async () => {
    const asked: string[][] = [];
    const record = await reviewLoop({
      budget: 7,
      review: async () => review({ computed: [measure()] }),
      revise: async (_round, findings, notes) => { asked.push([...findings, ...notes.unanswered].map((finding) => finding.id)); return ran(""); },
    });
    expect([record.stop, record.rounds.length, asked]).toEqual(["stuck", 4, [["F1"], ["F1"], ["F1"]]]);
    expect(record.unanswered).toEqual(["F1"]);
  });

  test("a measure that never passes goes to the drawer in 3 revise passes, then the loop stops stuck and its record lists the finding", async () => {
    let revises = 0;
    const record = await reviewLoop({
      budget: 20,
      review: async () => review({ computed: [measure()] }),
      revise: async (_round, findings) => { revises += 1; return ran(answered(findings, "declined: the wires fit")); },
    });
    expect([record.stop, record.rounds.length, revises]).toEqual(["stuck", 4, 3]);
    expect(record.rounds.map((round) => [round.findings.map((finding) => finding.id), round.score])).toEqual([[["F1"], 1], [["F1"], 1], [["F1"], 1], [[], 1]]);
    expect(ledgerText(record)).toContain(`## Round 4 · score 1 · 4 reviewers at medium\nNo findings.\nNot sent (stuck): F1 [should, measured space] sec_a, sec_b: ${NARROW}. The drawer's last answer: declined: the wires fit\n`);
    expect(ledgerText(record)).toContain("\nStop: stuck\n");
    expect(loopSummary(record)).toContain("stop stuck after 4 of 20 rounds");
  });

  test("a measure that passes closes its finding: the loop stops clean, whatever the drawer answered", async () => {
    const record = await reviewLoop({
      budget: 20,
      review: async (round) => review({ computed: round === 1 ? [measure()] : [] }),
      revise: async (_round, findings) => ran(answered(findings, "declined: the wires fit")),
    });
    expect([record.stop, record.rounds.length, record.rounds[1]!.withheld]).toEqual(["clean", 2, []]);
  });

  test("a computed finding counts when the loop chooses its best board", async () => {
    const restored: number[] = [];
    const boards = (first: Partial<Review>, last: Partial<Review>) => reviewLoop({
      budget: 2,
      review: async (round) => review(round === 1 ? first : last),
      revise: async (_round, findings) => ran(answered(findings, "fixed")),
      restore: (round) => restored.push(round),
    });
    const block = hole(0, 0, 900, 600);
    // The first board fails 2 measures, and the last one has 1 fault a reviewer saw: the last one is better.
    expect((await boards({ computed: [measure(), block] }, { findings: [seen()] })).kept).toMatchObject({ round: 2, restored: false });
    // The last board fails 2 measures, and the first one had 1 fault a reviewer saw: the first one goes back.
    expect((await boards({ findings: [seen()] }, { computed: [measure(), block] })).kept).toMatchObject({ round: 1, restored: true });
    expect(restored).toEqual([1]);
  });

  test("the revise message says a computed finding is the runner's own number, and that a decline does not close it", () => {
    const { findings } = roundFindings([], { lints: [lint()], findings: [seen()], computed: [measure()] });
    const text = reviseMessage("b1", findings, { images: [{ unit: "space", path: "/t/space.png", findings: ["F2"] }] })[0] as string;
    // The computed finding is a space finding: it comes first.
    expect(text).toContain([
      "<findings>",
      `F2 [should, measured space] ${NARROW}.`,
      "  measured by the runner on the board file · image 1",
      "F1 [should, check near-miss] b is 20px off a's center line, so w bends. Fix: move b by dy -20",
      `F3 [should, routing] w, "ghost": The wire bends twice.`,
      "  from sec_a",
      "</findings>",
    ].join("\n"));
    expect(text).toContain("A `measured` finding is a number the runner computed on the board file: an empty block, or a gap between sections off its gap rule number."
      + " A decline does not close it: it comes back until the number passes.");
    expect(text).toContain("The `measured` findings and the findings from the `space` reviewer come first.");
  });
});

describe("critic loop reversal guard", () => {
  const apart = seen({ kind: "spacing", ids: ["sec_a", "sec_b"], labels: [], problem: "sec_a and sec_b sit 900 px apart, and 5 wires join them.", regions: ["space"] });
  const covers = seen({ kind: "placement", ids: ["sec_a"], labels: [], problem: "sec_a covers the legend.", regions: ["space"] });
  const HISTORY = `in round 1 you fixed F1 on sec_a, sec_b: "sec_a and sec_b sit 900 px apart, and 5 wires join them.".`
    + " This finding is on the same items, so that fix may have caused it. Fix it in a way that keeps F1 fixed.";

  test("a layout finding on the items of a layout finding the drawer fixed in an earlier round is sent with that fix in one line", () => {
    const ledger = answeredRound([], { lints: [], findings: [apart, seen()] }, "F1 fixed\nF2 fixed");
    const second = roundFindings(ledger, { lints: [], findings: [covers, seen()], computed: [measure()] }, 2);
    // The gap finding names both sections of F1, and the placement finding one of them. The wire finding is no layout finding.
    expect(second.findings.map((finding) => [finding.id, finding.kind, finding.history])).toEqual([["F3", "space", HISTORY], ["F4", "placement", HISTORY], ["F5", "routing", undefined]]);
    // It is not dropped: it counts, and the drawer reads the history under it.
    expect([second.withheld, second.score]).toEqual([[], 3]);
    const text = reviseMessage("b1", second.findings)[0] as string;
    expect(text).toContain([
      "<findings>",
      `F3 [should, measured space] ${NARROW}.`,
      "  measured by the runner on the board file",
      `  history: ${HISTORY}`,
      "F4 [should, placement] sec_a: sec_a covers the legend.",
      "  from space",
      `  history: ${HISTORY}`,
      `F5 [should, routing] w, "ghost": The wire bends twice.`,
      "  from sec_a",
      "</findings>",
    ].join("\n"));
    expect(text).toContain("A `history` line under a finding names a fix of an earlier round on the same items. Do not swap one fault for the other: find the layout that clears both.");
  });

  test("a finding has no history when the earlier one was declined, was a lint, is on other items, or is the same measure", () => {
    const history = (ledger: LoopFinding[], input: Parameters<typeof roundFindings>[1]) => roundFindings(ledger, input, 2).findings.map((finding) => finding.history);
    expect(history(answeredRound([], { lints: [], findings: [apart] }, "F1 declined: they are neighbours"), { lints: [], findings: [covers] })).toEqual([undefined]);
    expect(history(answeredRound([], { lints: [lint({ rule: "spacing", at: ["sec_a"] })], findings: [] }, "F1 fixed"), { lints: [], findings: [covers] })).toEqual([undefined]);
    expect(history(answeredRound([], { lints: [], findings: [apart] }, "F1 fixed"), { lints: [], findings: [{ ...covers, ids: ["sec_c"] }] })).toEqual([undefined]);
    // A measure the drawer called fixed that still fails is the same finding, not the undo of a fix.
    expect(history(answeredRound([], { lints: [], findings: [], computed: [measure()] }, "F1 fixed"), { lints: [], findings: [], computed: [measure()] })).toEqual([undefined]);
    // The other way round: the gap went from too narrow to too wide.
    const wide = measure({ key: `["gap","over",["sec_a","sec_b"]]`, problem: "The gap between sec_a and sec_b (side by side) is 400 px wide" });
    expect(history(answeredRound([], { lints: [], findings: [], computed: [measure()] }, "F1 fixed"), { lints: [], findings: [], computed: [wide] }))
      .toEqual([`in round 1 you fixed F1 on sec_a, sec_b: ${JSON.stringify(NARROW)}. This finding is on the same items, so that fix may have caused it. Fix it in a way that keeps F1 fixed.`]);
  });
});

describe("critic loop rethink turn", () => {
  const turn = (): RethinkRecord => ({
    ...ran("").run,
    answers: { A1: "move sec_b under sec_a: w4 runs 1900 px", A2: "no change: every gap is within its number", A3: "" }, reask: null,
    toolCalls: { total: 7, byTool: { arrange: 2, route: 5 } }, moved: [{ id: "sec_b", dx: -900, dy: 600 }],
    frame: { before: "2400 × 900 px", after: "1500 × 1500 px" }, faults: { before: 3, after: 1 },
  });

  test("the rethink turn runs once, before the first review, and the record keeps it", async () => {
    const order: string[] = [];
    const record = await reviewLoop({
      budget: 3,
      rethink: async () => { order.push("rethink"); return turn(); },
      review: async (round) => { order.push(`review ${round}`); return review(round === 1 ? { findings: [seen()] } : {}); },
      revise: async (round, findings) => { order.push(`revise ${round}`); return ran(answered(findings, "fixed")); },
    });
    expect(order).toEqual(["rethink", "review 1", "revise 1", "review 2"]);
    expect([record.stop, record.rethink]).toEqual(["clean", turn()]);
    expect(ledgerText(record)).toStartWith([
      "## Rethink turn · exit 0 · 7 tool calls · moved sec_b · frame 2400 × 900 px → 1500 × 1500 px · 3 → 1 computed findings",
      "A1: move sec_b under sec_a: w4 runs 1900 px",
      "A2: no change: every gap is within its number",
      "A3: no answer",
      "",
      "## Round 1 · score 1",
    ].join("\n"));
    expect(loopSummary(record)).toContain("stop clean after 2 of 3 rounds at medium effort · rethink: 7 tool calls, 1 section moved · last round:");
  });

  test("a loop with no rethink turn has none in its record", async () => {
    const record = await reviewLoop({ budget: 3, review: async () => review() });
    expect(record.rethink).toBeNull();
    expect(ledgerText(record)).toStartWith("## Round 1 ");
    expect(loopSummary(record)).not.toContain("rethink");
  });

  test("a rethink turn that breaks fails the loop before its first review, and the loop keeps the board as it is", async () => {
    const restored: number[] = [];
    const record = await reviewLoop({
      budget: 3, rethink: async () => { throw new Error("no drawer"); }, review: async () => review(), restore: (round) => restored.push(round),
    });
    expect(record).toMatchObject({ stop: "failed", error: "no drawer", rethink: null, rounds: [], kept: null });
    expect(restored).toEqual([]);
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
    // The answer lands on the finding where round 1 raised it, with the round whose pass gave it.
    expect(record.rounds[0]!.findings[1]!.answer).toEqual({ verdict: "declined", reason: "it reads well", round: 2 });
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
    expect(loopSummary(record)).toContain("1 not sent (held, settled or stuck)");
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
    // The warning both boards have counts on both. The 2 new ones are the grace of round 2: as the last round it counts 1.
    expect(two.rounds.map((round) => [round.score, round.grace])).toEqual([[2, 0], [3, 2]]);
    expect(two.kept).toEqual({ round: 2, restored: false, reason: "round 2 is the last board and scored 1 (3 less 2 for the lint warnings new in it), the best of the loop" });
    // The drawer still gets them, and a round later they count: the board that kept them loses to the first.
    expect(two.rounds[1]!.findings.map((finding) => finding.kind)).toEqual(["near-miss", "near-miss", "tight-gap"]);
    const three = await loop(3);
    expect(three.rounds.map((round) => [round.score, round.grace])).toEqual([[2, 0], [3, 2], [3, 0]]);
    expect(three.kept).toMatchObject({ round: 1, restored: true });
  });

  test("the grace is for the last board only: a board that left 3 new warnings does not beat the later board that cleared 2 of them", async () => {
    const left = [lint({ at: ["sec_a", "n1"] }), lint({ at: ["sec_a", "n2"] }), lint({ at: ["sec_a", "n3"] })];
    const record = await reviewLoop({
      budget: 3,
      review: async (round) => review(round === 1 ? { findings: [seen({ kind: "spacing", ids: ["sec_a", "sec_b"], regions: ["space"] })] } : { lints: left.slice(0, round === 2 ? 3 : 1) }),
      revise: async (_round, findings) => ran(answered(findings, "fixed")),
      restore: () => {},
    });
    expect(record.rounds.map((round) => [round.score, round.grace])).toEqual([[1, 0], [3, 3], [1, 0]]);
    expect(record.kept).toEqual({ round: 3, restored: false, reason: "round 3 is the last board and scored 1, level with round 1: a tie keeps the later board" });
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
