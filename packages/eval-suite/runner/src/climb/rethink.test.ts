import { describe, expect, test } from "bun:test";

import { box, wire } from "./fixtures/review/stubs.ts";
import { rethinkAnswers, rethinkMessage, rethinkReask, rethinkRecord, sectionMoves, unanswered, type Measured } from "./rethink.ts";
import type { Board, BoardObject } from "./review-inputs.ts";
import { planOf, type GapRule } from "./space.ts";
import type { WireFact } from "./wires.ts";

const RULE: GapRule = { base: 200, perWire: 20, labelBase: 100, labelPerCharacter: 10, perLabel: 20, padding: 40 };
const measured = (objects: BoardObject[], facts: WireFact[] = []): Measured => {
  const board: Board = { objects, connections: [] };
  return { board, facts, plan: planOf(board, facts, RULE) };
};
/** A section with one node that fills it. */
const full = (id: string, node: string, parent: string | null, x: number, y: number, width: number, height: number) =>
  [box(id, "section", parent, x, y, width, height), box(node, "rectangle", id, x, y, width, height)];
/** 3 sections in a 1700 × 1000 frame: a and b side by side over c, and nothing right of b. */
const draft = (bX = 500) => [box("page", "section", null, 0, 0, 1700, 1000), ...full("a", "p", "page", 0, 0, 300, 400), ...full("b", "q", "page", bX, 0, 300, 400), ...full("c", "r", "page", 0, 600, 1700, 400)];
const wires = [
  wire("w1", "p", "q", [[300, 100], [500, 100]]), wire("w2", "p", "q", [[300, 200], [500, 200]]), wire("w3", "p", "q", [[300, 300], [500, 300]]),
  wire("w4", "q", "r", [[650, 400], [650, 500], [1500, 500], [1500, 600]]),
];
/** A drawer pass as its stream-json transcript: each text is one assistant message, each tool one call. */
const transcript = (texts: string[], tools: string[] = []) => [
  ...texts.map((text) => ({ type: "assistant", message: { content: [{ type: "text", text }] } })),
  ...tools.map((name) => ({ type: "assistant", message: { content: [{ type: "tool_use", name: `mcp__canvas__${name}` }] } })),
  { type: "result", subtype: "success", result: "done" },
].map((event) => JSON.stringify(event)).join("\n");

describe("climb rethink turn message", () => {
  const message = rethinkMessage("b1", measured(draft(), wires), RULE);

  test("it asks for 3 written answers before the edits, and takes \"no change\" only with a reason", () => {
    expect(message).toStartWith("Your first draw is done. Before the reviewers read the board, rethink its plan: where the sections sit, the gaps between them, and the shape of the board.");
    expect(message).toContain([
      "Write 3 answers before your first edit, each on a line that starts with its tag:",
      "A1: which section moves shorten the longest wires?",
      "A2: which gap is over or under its rule number?",
      "A3: would another board shape (aspect ratio) or another order of the sections read better?",
      `An answer can be "no change", but only with its reason from the numbers below. "No change" alone is no answer.`,
    ].join("\n"));
    expect(message).toContain("Move whole sections (`arrange`, `move`, `place_section`, `fit_section`)");
    expect(message).toContain("After you move a section, close the space it left, then route the wires again.");
    expect(message).toContain("Do not spread the nodes inside a section, and do not resize a section past its content.");
    expect(message).toContain("Never narrow a gap below its rule number: the number counts every wire of its band, from every pair of sections.");
    expect(message).toContain(`canvas_open, canvas id "b1"`);
  });

  test("it gives the facts the runner measured: the board's size, the wires of each section pair, each gap against its rule number by band, the 5 longest wires and the computed findings", () => {
    expect(message.slice(message.indexOf("\nBoard:"))).toBe([
      "",
      "Board:",
      "1700 × 1000 px, aspect ratio 1.70 : 1",
      "",
      "Wires between sections (the 2 sections · wires · their total length · whether the 2 are neighbours), most wires first:",
      "a ↔ b · 3 wires · 600 px of wire in total · neighbours, side by side, gap 200 px",
      "b ↔ c · 1 wire · 1050 px of wire in total · neighbours, stacked, gap 200 px",
      "",
      "Gaps between neighbour sections, each against the gap rule. A gap's band is the gap drawn out along its row or column of sections, and the rule counts every wire that crosses the gap or runs along the band:"
      + " 200 px, plus 20 px for each wire after the first, plus 20 px more for each of them with a label."
      + " A labelled wire that crosses a side-by-side gap needs 100 px plus 10 px a character of its label."
      + " A gap is off its number when it is under it, or over it by more than 120 px with nothing in it:",
      "a ↔ b · side by side · gap 200 px · gutter x 300 to 500, y 0 to 400 · band y 0 to 400 · 3 wires cross it or run along its band · 0 label chips in it · rule number 240 px · UNDER its number by 40 px",
      // w4 leaves b and runs along the band over c: the gap of a and c counts it too.
      "a ↔ c · stacked · gap 200 px · gutter x 0 to 300, y 400 to 600 · band x 0 to 800 · 1 wire crosses it or runs along its band · 0 label chips in it · rule number 200 px · within its number",
      "b ↔ c · stacked · gap 200 px · gutter x 500 to 800, y 400 to 600 · band x 0 to 800 · 1 wire crosses it or runs along its band · 0 label chips in it · rule number 200 px · within its number",
      "",
      "The 5 longest wires (id · from (its section) → to (its section) · length · bends):",
      "w4 · q (b) → r (c) · 1050 px · 2 bends",
      "w1 · p (a) → q (b) · 200 px · 0 bends",
      "w2 · p (a) → q (b) · 200 px · 0 bends",
      "w3 · p (a) → q (b) · 200 px · 0 bends",
      "",
      "Computed findings: the measures of the board that fail now. The review loop sends you each one that still fails after this turn, until it passes:",
      "- An empty block of 900 × 600 px sits in the board frame at x 800 to 1700, y 0 to 600: 32% of the frame holds no section, node or sticky."
      + " The limit is 120,000 px² with a short side of 200 px. The allowed fixes: shrink the section or the frame, or move a neighbour in. Not a fix: widen a section, add a sticky, reverse a chain.",
      "- The band between a (left) and b (right), x 300 to 500, is 200 px wide and 3 wires cross it or run along it: w1, w2, w3."
      + " The gap rule asks 240 px for them (200 px, plus 20 px for each wire after the first), so the band is 40 px too narrow."
      + " Facts: the band is 200 px wide now with 3 wires, and it needs 240 px.",
    ].join("\n"));
  });

  test("a board with no wire between sections and no computed finding says so, and lists 5 wires at most", () => {
    const six = [1, 2, 3, 4, 5, 6].map((n) => wire(`w${n}`, "p", "p", [[0, 0], [n * 10, 0]]));
    const text = rethinkMessage("b1", measured(full("a", "p", null, 0, 0, 300, 400), six), RULE);
    expect(text).toContain("most wires first:\n(none)\n");
    expect(text).toContain("with nothing in it:\n(none)\n");
    expect(text).toContain("bends):\nw6 · p (a) → p (a) · 60 px · 0 bends\nw5 ");
    expect(text).not.toContain("\nw1 · ");
    expect(text).toEndWith("until it passes:\n(none)");
  });
});

describe("climb rethink turn answers", () => {
  test("the answers are the lines the drawer starts with A1, A2 and A3, in any message of the pass and however it marks them up", () => {
    const answers = rethinkAnswers(transcript([
      "I read the numbers.\n\n**A1:** move b under a: w4 runs 1050 px\nround c.\n\n- A2 — a ↔ b is under its number by 40 px",
      "Now the edits.",
      "A3: no change: 1.70 : 1 fits the 3 sections. |\n\nA1: done",
    ], ["arrange", "route"]));
    // An answer runs to the next blank line. The first line of a tag wins: a closing summary does not replace it.
    expect(answers).toEqual({ A1: "move b under a: w4 runs 1050 px round c.", A2: "a ↔ b is under its number by 40 px", A3: "no change: 1.70 : 1 fits the 3 sections." });
    expect(unanswered(answers)).toEqual([]);
  });

  test("a tag with no line, an empty line, or \"no change\" with no reason has no answer", () => {
    const answers = rethinkAnswers(transcript(["A1: No change.\nA2:\nThe board is fine."]));
    expect(answers).toEqual({ A1: "No change.", A2: "The board is fine.", A3: "" });
    expect(unanswered(answers)).toEqual(["A1", "A3"]);
    expect(unanswered({ A1: "no change", A2: "**no change**", A3: "no change: every gap is within its number" })).toEqual(["A1", "A2"]);
    // A transcript that is cut off, or not a transcript, has none.
    expect(unanswered(rethinkAnswers(`{"type":"assistant","message":{"content":[{"type":"text","text":"A1: mo`))).toEqual(["A1", "A2", "A3"]);
  });

  test("the second ask names the tags with no answer, asks for those lines only, and is no answer itself", () => {
    const prompt = rethinkReask(["A1", "A3"]);
    expect(prompt.split("\n")).toEqual([
      `Your reply has no answer for A1, A3, or it says "no change" with no reason.`,
      "Make no new edits and call no tool. Reply with one line for each, and nothing else:",
      `A1: <which section moves shorten the longest wires: your answer, or "no change" and the reason>`,
      `A3: <would another board shape (aspect ratio) or another order of the sections read better: your answer, or "no change" and the reason>`,
    ]);
  });
});

describe("climb rethink turn record", () => {
  test("a section that changed place is a move, and what went along with its parent or with the board frame is not", () => {
    const before: Board = { objects: [
      box("page", "section", null, 0, 0, 2000, 1000), box("a", "section", "page", 100, 100, 400, 400), box("sub", "section", "a", 150, 150, 200, 200),
      box("b", "section", "page", 700, 100, 400, 400), box("n", "rectangle", "b", 750, 150),
    ], connections: [] };
    const moved = (shift: Record<string, [number, number]>, more: BoardObject[] = []): Board => ({
      objects: [...before.objects.map((object) => {
        const [dx, dy] = shift[object.id] ?? [0, 0];
        return { ...object, geometry: { ...object.geometry, x: object.geometry.x + dx, y: object.geometry.y + dy } };
      }), ...more],
      connections: [],
    });
    expect(sectionMoves(before, before, "page")).toEqual([]);
    // a moved with its subsection: one move. The node that moved inside b is no section.
    expect(sectionMoves(before, moved({ a: [0, 600], sub: [0, 600], n: [20, 0] }), "page")).toEqual([{ id: "a", dx: 0, dy: 600 }]);
    // The subsection alone moved inside a, and a section that moved further than its parent moved too.
    expect(sectionMoves(before, moved({ sub: [100, 0] }), "page")).toEqual([{ id: "sub", dx: 100, dy: 0 }]);
    expect(sectionMoves(before, moved({ a: [0, 600], sub: [50, 600] }), "page")).toEqual([{ id: "a", dx: 0, dy: 600 }, { id: "sub", dx: 50, dy: 600 }]);
    // The board frame grew round its sections: not a move. A section drawn in the turn is not one either.
    expect(sectionMoves(before, moved({ page: [-100, -100], b: [-300, 0] }, [box("new", "section", "page", 0, 600, 300, 300)]), "page")).toEqual([{ id: "b", dx: -300, dy: 0 }]);
  });

  test("the record keeps the answers, the tool calls by tool, the sections moved, the frame and the count of failed measures before and after", () => {
    const run = { exitCode: 0, signal: null, timedOut: false, durationMs: 9, tries: 1, rateLimited: false };
    const answers = { A1: "move b beside a", A2: "a ↔ b is under its number by 40 px", A3: "no change: the frame fits" };
    const record = rethinkRecord({
      run, answers, reask: null, transcript: transcript(["A1: move b beside a"], ["canvas_open", "arrange", "route", "route", "canvas_check"]),
      before: measured(draft(), wires),
      // The drawer widened the a ↔ b gap to 240 px.
      after: measured(draft(540), [wire("w1", "p", "q", [[300, 100], [540, 100]]), wire("w2", "p", "q", [[300, 200], [540, 200]]), wire("w3", "p", "q", [[300, 300], [540, 300]]), wires[3]!]),
    });
    expect(record).toEqual({
      ...run, answers, reask: null,
      toolCalls: { total: 5, byTool: { canvas_open: 1, arrange: 1, route: 2, canvas_check: 1 } },
      moved: [{ id: "b", dx: 40, dy: 0 }],
      frame: { before: "1700 × 1000 px", after: "1700 × 1000 px" },
      // Before: the gap under its number and the empty block. After: the block.
      faults: { before: 2, after: 1 },
    });
  });
});
