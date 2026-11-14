import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import {
  answerSchema, askReviewer, choicesPrompt, criticArgs, critiqueSummary, gapPrompt, loadReviewCanvas, lookPrompt, marksOf, mergeFindings, parseAnswer, parseCritic,
  reviewerEffort, sectionPrompt, spacePrompt, wirePrompt,
  type CritiqueRecord, type Finding, type UnitFinding, type UnitRecord,
} from "./critic.ts";
import { boardWireSheet, lookFrame, measuresOf, ownerUnits, reviewUnits, routesOf, wireSheet, wireSheetLines, type Board, type BoardObject } from "./review-inputs.ts";
import { wireFacts } from "./wires.ts";

/** Board 05 as round 3 drew it: the board the round 4 design measures. */
const BOARD = resolve(import.meta.dir, "fixtures/review/b05.canvas.json");

const finding = (overrides: Partial<UnitFinding>): UnitFinding => ({
  kind: "routing", ids: [], labels: [], problem: "Two wires share a segment.", severity: "should", marks: [], ...overrides,
});
const box = (id: string, type: string, parentId: string | null, x = 0, y = 0, width = 100, height = 100): BoardObject =>
  ({ id, type, parentId, geometry: { x, y, width, height } });
const unitIds = (board: Board) => reviewUnits(board).units.map((unit) => `${unit.id}:${unit.owned.map((object) => object.id).join("+")}`);

describe("climb review units", () => {
  test("board 05 has a space, a wire and a choices reviewer, its 5 sections and the loose items: the page frame has no reviewer", async () => {
    const canvas = await loadReviewCanvas();
    const board = canvas.toolkit.openCanvasFile(BOARD).persisted as Board;
    const { pageFrame, units } = reviewUnits(board);
    expect(pageFrame?.id).toBe("page-frame");
    expect(units.map((unit) => [unit.id, unit.kind])).toEqual([
      ["space", "space"], ["wires", "wire"], ["choices", "choices"],
      ["sec_engine", "section"], ["sec_contract", "section"], ["sec_records", "section"], ["sec_providers", "section"], ["sec_ford", "section"], ["loose", "loose"],
    ]);
    const unit = (id: string) => units.find((entry) => entry.id === id)!;
    expect(unit("space").owned.map((object) => object.id)).toEqual(["sec_engine", "sec_contract", "sec_records", "sec_providers", "sec_ford"]);
    expect(unit("choices").owned).toHaveLength(board.objects.length);
    expect(unit("sec_contract").owned.map((object) => object.id).sort()).toEqual(
      ["capabilities", "chunk_stream", "exec_context", "result_chunk", "s_caps", "s_chunks", "s_ctx", "s_send", "send_query"]);
    expect(unit("sec_contract").rect).toEqual({ x: 660, y: 80, width: 1380, height: 648 });
    // The key sits in the page frame, in no section of its own.
    expect(unit("loose").owned.map((object) => object.id)).toEqual(["s_legend"]);
    expect(ownerUnits(units).get("send_query")).toBe("sec_contract");
    expect(ownerUnits(units).get("s_legend")).toBe("loose");
    expect(ownerUnits(units).has("page-frame")).toBe(false);
  });

  test("each object goes to the deepest section that holds it, and a parent section owns where its child section sits", () => {
    const board: Board = {
      objects: [
        box("page", "section", null), box("outer", "section", "page"), box("inner", "section", "outer"),
        box("a", "rectangle", "outer"), box("b", "rectangle", "inner"), box("key", "sticky", "page"), box("stray", "rectangle", null),
      ],
      connections: [],
    };
    expect(reviewUnits(board).pageFrame?.id).toBe("page");
    expect(unitIds(board)).toEqual(["space:outer+inner", "choices:page+outer+inner+a+b+key+stray", "outer:inner+a", "inner:b", "loose:key+stray"]);
    const owners = ownerUnits(reviewUnits(board).units);
    expect([owners.get("a"), owners.get("b"), owners.get("inner"), owners.get("stray")]).toEqual(["outer", "inner", "inner", "loose"]);
  });

  test("a root section is a page frame only when it is the one root section and it holds sections", () => {
    // Two root sections: neither frames the whole page.
    const two: Board = { objects: [box("left", "section", null), box("in", "section", "left"), box("right", "section", null), box("a", "rectangle", "in")], connections: [] };
    expect(reviewUnits(two).pageFrame).toBeNull();
    expect(unitIds(two)).toEqual(["space:left+in+right", "choices:left+in+right+a", "left:in", "in:a", "right:"]);
    // One root section that holds only items is a section like any other, and a board with no loose item has no loose reviewer.
    const flat: Board = { objects: [box("only", "section", null), box("a", "rectangle", "only")], connections: [] };
    expect(reviewUnits(flat).pageFrame).toBeNull();
    expect(unitIds(flat)).toEqual(["space:only", "choices:only+a", "only:a"]);
  });

  test("a board with a wire has one wire reviewer, and a board with none has none", () => {
    const objects = [box("only", "section", null), box("a", "rectangle", "only"), box("b", "rectangle", "only")];
    const kinds = (board: Board) => reviewUnits(board).units.map((unit) => unit.kind);
    expect(kinds({ objects, connections: [] })).toEqual(["space", "choices", "section"]);
    expect(kinds({ objects, connections: [{ id: "w", from: { objectId: "a" }, to: { objectId: "b" } }] })).toEqual(["space", "wire", "choices", "section"]);
  });
});

describe("climb review wire sheet", () => {
  test("sec_contract has the 8 rows of the design's wire table", async () => {
    const canvas = await loadReviewCanvas();
    const file = canvas.toolkit.openCanvasFile(BOARD);
    const board = file.persisted as Board;
    const facts = wireFacts(canvas.wires, file);
    const { units } = reviewUnits(board);
    const rows = wireSheet(units.find((unit) => unit.id === "sec_contract")!, facts);
    expect(rows.map(({ tag, kind, fact }) => [
      tag, fact.id, fact.from, fact.to, `${fact.ports.from}→${fact.ports.to}`, fact.length, fact.bends, fact.byHand ? "by hand" : "auto", kind,
      fact.trunks.map((trunk) => trunk.wire).sort(), fact.label, fact.labelAt && [fact.labelAt.x, fact.labelAt.y], fact.style, fact.colour, fact.through, fact.crosses,
    ] as unknown[])).toEqual([
      ["W1", "e_calls", "executor", "send_query", "right→left", 456, 0, "auto", "enters", [], "calls", [614, 640], "solid", "default", [], []],
      ["W2", "e_yields", "send_query", "chunk_stream", "right→left", 312, 0, "auto", "inside", [], "yields", [1066, 640], "solid", "default", [], []],
      ["W3", "e_ends", "chunk_stream", "result_chunk", "right→left", 322, 0, "auto", "inside", [], "ends in", [1439, 642], "solid", "default", [], []],
      ["W4", "e_preflight", "executor", "capabilities", "top→left", 874, 3, "by hand", "enters", [], "preflight before dispatch", [370, 545], "solid", "default", [], []],
      ["W5", "e_d_claude", "send_query", "p_claude", "bottom→top", 505, 2, "auto", "leaves", ["e_d_codex", "e_d_pi"], "", null, "solid", "default", [], []],
      ["W6", "e_d_codex", "send_query", "p_codex", "bottom→top", 859, 2, "auto", "leaves", ["e_d_claude", "e_d_pi"], "", null, "solid", "default", [], []],
      ["W7", "e_d_pi", "send_query", "p_pi", "bottom→top", 1229, 2, "auto", "leaves", ["e_d_claude", "e_d_codex"], "", null, "solid", "default", [], []],
      ["W8", "e_d_kernel", "send_query", "p_kernel", "bottom→top", 197, 0, "auto", "leaves", [], "", null, "dashed", "violet", [], []],
    ]);
    const lines = wireSheetLines(rows);
    expect(lines.slice(6, 8)).toEqual([
      `W4 e_preflight · executor → capabilities · enters · ports top→left · 874 px · 3 bends · by hand · solid default · arrow forward · label "preflight before dispatch" at (370, 545)`,
      "   route executor (s0 v x=370) ─(s1 h y=520)→ (s2 v x=620) ─(s3 h y=220)→ capabilities · corners (370, 612) (370, 520) (620, 520) (620, 220) (852, 220) · through none · crosses none · shares a trunk with none",
    ]);
    // A trunk names its wires by their tags on this sheet.
    expect(lines[9]).toEndWith("shares a trunk with W6 e_d_codex (407 px), W7 e_d_pi (407 px)");
    // A wire with a label has the box of its chip, as the board paints it: the gap reviewers read it.
    const chip = rows[0]!.fact.chip!;
    expect([Math.round(chip.x + chip.width / 2), Math.round(chip.y + chip.height / 2)]).toEqual([614, 640]);
    expect(rows[4]!.fact.chip).toBeNull();

    // The wire reviewer has the wires that join 2 units, each with the units it joins.
    const between = boardWireSheet(units, facts);
    expect(between.map((row) => row.fact.id)).not.toContain("e_yields");
    expect(between.find((row) => row.fact.id === "e_calls")!.kind).toBe("sec_engine → sec_contract");

    // A look frames its ids with a 128 px ring, wires by their whole route.
    expect(lookFrame(["capabilities", "e_preflight"], board, facts)).toEqual({ x: 370 - 128, y: 160 - 128, width: 980 - 370 + 256, height: 612 - 160 + 256 });
    expect(lookFrame(["ghost"], board, facts)).toBeNull();
    // A finding with no mark of its own is shown by its items: a box an object, a path a wire.
    expect(marksOf(["capabilities", "ghost", "e_calls"], board, facts)).toEqual([
      { box: board.objects.find((object) => object.id === "capabilities")!.geometry },
      { path: facts.find((fact) => fact.id === "e_calls")!.points.map((point) => [point.x, point.y]) },
    ]);
  });

  test("a wire passes through a section that holds neither end and that its route crosses", () => {
    const board: Board = { objects: [box("mid", "section", null, 200, 0, 100, 100), box("far", "section", null, 200, 400, 100, 100)], connections: [] };
    const wire = (points: Array<[number, number]>) => [{ id: "w", from: "a", to: "b", points: points.map(([x, y]) => ({ x, y })) }] as never;
    const kinds = (points: Array<[number, number]>): Array<string | null> =>
      reviewUnits(board).units.filter((unit) => unit.section).map((unit) => wireSheet(unit, wire(points))[0]?.kind ?? null);
    expect(kinds([[0, 50], [500, 50]])).toEqual(["passes through", null]);
    // A wire that runs along a section's border is outside it.
    expect(kinds([[0, 100], [500, 100]])).toEqual([null, null]);
  });

  test("the look text gives a view its MEASURES block and the routes of its own wires", () => {
    const text = [
      "ROUTES", "  e_calls  anchors right→left  path a ─(s0 h y=640)→ b  through none", "  e_other  anchors top→left  path c (s0 v x=1) d  through none",
      "REQUESTS · none", "MEASURES · section sec_contract 660,80 1380×648", "  gaps x  68, 200", "  ink 31%",
    ].join("\n");
    expect(measuresOf(text)).toEqual(["MEASURES · section sec_contract 660,80 1380×648", "  gaps x  68, 200", "  ink 31%"]);
    expect(routesOf(text, new Set(["e_calls"]))).toEqual(["  e_calls  anchors right→left  path a ─(s0 h y=640)→ b  through none"]);
  });
});

describe("climb review prompts", () => {
  const unit = (board: Board, id: string) => reviewUnits(board).units.find((entry) => entry.id === id)!;
  const board: Board = { objects: [box("sec", "section", null, 100, 200, 800, 400), box("a", "rectangle", "sec"), box("key", "sticky", null)], connections: [] };
  const none = { checked: [], declined: [], settled: [], returned: [] };
  const section = {
    scales: { board: 0.4, section: 1, neighbourhood: 0.5 },
    objects: ["a · rectangle"], measures: ["MEASURES · section sec 100,200 800×400"], wires: ["W1 w · a → b"],
    wireMeasures: ["W1 w runs 300 px at 10 px from the top border of section sec, from (100, 210) to (400, 210)"], totals: "LAYOUT · wire length 10px", notes: none,
  };
  const crop = (x: number, lines: string[]) => ({ rect: { x, y: 200, width: 480, height: 360 }, lines });
  const gap = { scale: 0.4, crops: [crop(100, [`chip "calls" of w · x 300 to 360, y 300 to 320`]), crop(600, [])], notes: none };
  const through = "1 wire runs through section mid, which holds neither end of it: w (sec → far, 1200 px)";
  const wire = { scale: 0.4, wires: ["W1 w · a → b · sec → loose"], wireMeasures: [], computed: [through], totals: "LAYOUT", notes: none };
  const space = {
    scale: 0.4, shape: "2400 × 1200 px, aspect ratio 2.00 : 1", sections: ["sec · in board · x 100"],
    bands: ["sec ↔ far · side by side · gap 260 px · band x 900 to 1160, y 200 to 600 · 3 wires run along it (w, x, y) · 0 label chips in it · needs 240 px, legal to 360 px · inside its legal width"],
    pairs: ["sec ↔ far · 4 wires · 3200 px of wire in total · NOT neighbours: mid lies between them"],
    long: ["w · a (sec) → z (far) · 1200 px · 2 bends"], sinks: [`z "Store" in far · 3 wires in from sec · mean 900 px · longest 1200 px`],
    measured: ["An empty block of 900 × 500 px sits in the board frame at x 1500 to 2400, y 700 to 1200: 16% of the frame holds no section, node or sticky"], totals: "LAYOUT", notes: none,
  };
  const choices = {
    scale: 0.4, brief: "Draw the 3 roles.\nThe store holds every trace.\n", objects: ["a · rectangle · shape - · no icon · no colour · in sec (gray) · \"Store\""],
    wires: ["w · a → b · no label · solid default"], counts: ["1 section has colour gray: sec"], notes: none,
  };
  const prompts = () => [sectionPrompt(unit(board, "sec"), section), sectionPrompt(unit(board, "loose"), section), gapPrompt(gap), wirePrompt(wire), spacePrompt(space), choicesPrompt(choices)];

  test("every reviewer reports a wire that starts on a frame, one that ends on a frame that is no subsection round exactly its group, a label after the join of a bus, and a chip on a frame", () => {
    for (const prompt of prompts()) {
      // Round 5 cycle 3: 8 wires of h4 started on a frame, and the judges read them as wires that touch no node.
      expect(prompt).toContain("Report a wire that starts on the frame of a section or a subsection: a wire starts on a node.");
      // The frame of a subsection is an end only for the group it is drawn round: that took board 06 from 26 wires to 20.
      expect(prompt).toContain("Report a wire that ends on the frame of a section or a subsection, unless the frame is a subsection drawn round exactly the group that receives the wire:"
        + " each node in it receives it, and it holds no other node. Such a subsection is the wire's end, and it needs no node there.");
      // Round 5 cycle 4: 3 blockers on r3 made the drawer split a legal bus and delete 3 labels of the brief.
      expect(prompt).toContain("Labelled wires of one colour and one dash that enter one node as a bus are legal when each label sits before the join: never report them as wires that share an arrowhead or an entry. Report a label chip that sits on the shared line after the join: a reader cannot tell which wire it belongs to.");
      expect(prompt).not.toContain("Report 2 labelled wires that share one entry");
      expect(prompt).toContain("Report a label chip that touches the frame of a section or a subsection.");
      expect(prompt).not.toContain("when the whole group sends or receives it");
    }
  });

  test("a reviewer asks for no part, node or wire the brief does not name, and a reviewer with no brief reports none as missing", () => {
    // Round 5 cycle 3: 03 F3 split a node into parts, 03 F14 added a node with no wire, and h1 F342 added a wire. The brief names none of them.
    const read = "Never report a node as one to split into parts the brief does not name. Never report a node or a wire as missing when the brief does not name it.";
    const unread = "You do not have the board's brief: the reviewer of the choices reads it. Never report a node or a wire as missing, and never report a node as one to split into parts.";
    const [withBrief, ...without] = [choicesPrompt(choices), choicesPrompt({ ...choices, brief: null }), ...prompts().slice(0, -1)];
    expect([withBrief!.includes(read), withBrief!.includes(unread)]).toEqual([true, false]);
    expect(without.length).toBe(6);
    for (const prompt of without) expect([prompt.includes(read), prompt.includes(unread)]).toEqual([false, true]);
  });

  test("every reviewer is told to be strict, to state problems with numbers, and never to say how to fix one or propose a tool call", () => {
    for (const prompt of prompts()) {
      expect(prompt).toContain("Be strict. Report every fault you can see and measure. Do not stop at the first few.");
      expect(prompt).toContain("State each fault as a problem: what is wrong, where, and by how much, with the numbers you measured.");
      expect(prompt).toContain("Do not say how to fix it. Do not propose a tool call, a new position, a new size or a new route. The drawer decides the fix.");
      expect(prompt).toContain("`marks` highlights the fault as the board is now, in board coordinates");
      expect(prompt).toContain("Give at most 10 findings, most severe first.");
      // Round 5: a nit on a ragged outer edge widened a section of board 05 to 1780 px.
      expect(prompt).toContain("Never report the outer edge of a section as ragged or out of line with the edge of another section.");
      // A finding of kind `missing` says where the missing item goes: round 5 added nodes with no place for them (h1).
      expect(prompt).toContain("- missing: an object or a relation the brief names that the board lacks. Name the section it belongs in and the neighbour it belongs beside.");
      expect(prompt).toContain("Look further:");
      // Round 5 cycle 2. A "missing" finding asked for wires the brief does not name (h1), and one asked the drawer to take icons off (h5).
      expect(prompt).toContain("Name the section it belongs in and the neighbour it belongs beside. Never report a node or a wire the brief does not name.");
      expect(prompt).toContain("- icon: a plain box where the kind has a shape or an icon, an icon that does not fit its meaning, or one icon repeated on unlike nodes. Never report an icon as one to remove.");
      // No field of an answer holds a fix, and no canvas tool is offered.
      expect(prompt).not.toMatch(/`fix`|`call`|- (route|move|resize|move_label|change_connection|arrange_section|fit_section) \{/);
    }
  });

  test("a section reviewer gets its 4 images and its numbers, and the runner's measures of its wires", () => {
    const prompt = sectionPrompt(unit(board, "sec"), section);
    expect(prompt).toStartWith(`You review one section of a diagram board: sec "", at board x 100 to 900, y 200 to 600.`);
    for (const image of ["Image 1 is the whole board", "Image 2 is your section (full size: 1 image px is 1 board px), with the board's smart guides", "Image 3 is your section with every object wired to it", "Image 4 is image 3 with each wire tagged"]) {
      expect(prompt).toContain(image);
    }
    expect(prompt).toContain("The ruler on its top and left edges gives board coordinates");
    expect(prompt).toContain("Objects:\na · rectangle\nMEASURES · section sec 100,200 800×400");
    expect(prompt).toContain("W1 w · a → b");
    expect(prompt).toContain("Measured on your wires:\nmeasured: W1 w runs 300 px at 10 px from the top border of section sec, from (100, 210) to (400, 210)");
    expect(prompt).toContain("Board totals:\nLAYOUT · wire length 10px");
    expect(prompt).toContain("Never report a merged trunk of one meaning as a fault");
    expect(prompt).not.toContain("Do not report them again");
    expect(prompt).not.toContain("The drawer declined these findings");
    expect(sectionPrompt(unit(board, "sec"), { ...section, wireMeasures: [] })).toContain("Measured on your wires:\n(none)");
    expect(sectionPrompt(unit(board, "loose"), section)).toStartWith("You review the items of a diagram board that sit in no section: key.");
  });

  test("a gap reviewer gets the whole board and each of its crops at full size, with the lines of each crop", () => {
    const prompt = gapPrompt(gap);
    expect(prompt).toContain("Your 2 crops are outlined in red, each with its number.");
    expect(prompt).toContain("Images 2 to 3 are your crops, in order, at full size: 1 image px is 1 board px.");
    expect(prompt).toContain(`Crop 1 (image 2): board x 100 to 580, y 200 to 560.\nchip "calls" of w · x 300 to 360, y 300 to 320`);
    expect(prompt).toContain("Crop 2 (image 3): board x 600 to 1080, y 200 to 560.\n(none)");
    expect(prompt).toContain("- a label chip on a section border, or a few px from one;");
    expect(prompt).toContain("- a label chip on a corner of a wire, on a junction or on an arrowhead;");
    expect(prompt).toContain("Never report a merged trunk of one meaning as a fault");
    expect(gapPrompt({ ...gap, crops: [crop(100, [])] })).toContain("Your crop is outlined in red, each with its number.\nImage 2 is your crop at full size: 1 image px is 1 board px.");
  });

  test("the wire reviewer looks for a wire on the board's edge, through a header or along a border, and for separate lanes of one meaning into one node, and leaves the computed wire findings to the runner", () => {
    const prompt = wirePrompt(wire);
    for (const fault of [
      "- a detour, a wire that wraps round a section, or a wire along the board's outer edge;",
      "- a wire through a section it does not belong to, or through a section's header or header chip;",
      "- a wire within 24 px of a section border along 100 px or more;",
      "- wires of one dash and one colour that share a source or a target and run side by side in separate lanes, 40 px apart or less: they must read as one trunk."
      + " Not a fault when 2 of them have a label and end on one node: those can keep their own lanes.",
    ]) expect(prompt).toContain(fault);
    // Ford kept merged junctions. The reviewer must not ask the drawer to split one of one meaning, labelled wires too.
    expect(prompt).toContain(
      "Never report a merged trunk of one meaning as a fault: wires of one dash and one colour that share a source or a target and run on one line into one port, with one arrowhead, read as one trunk."
      + ` Ford kept them: "The lines just appear more aesthetic."`
      + " The pass covers labelled wires too, when each label sits before the join.");
    expect(prompt).not.toContain("report those");
    expect(prompt).toContain("W1 w · a → b · sec → loose");
    expect(prompt).toContain("Measured on your wires:\n(none)");
    expect(prompt).not.toContain("ends on a section frame and not on a node");
    expect(prompt).toContain(
      "The runner sends the drawer each of these as its own finding. Do not report one of them again"
      + ` (wires through a section that holds neither end, wires over 1500 px between sections that are not neighbours, bands too narrow for their lanes,`
      + ` wires nearer than 40 px to a border along 300 px or more, wires the last pass made longer):\n${through}`);
    expect(wirePrompt({ ...wire, computed: [] })).toContain("wires the last pass made longer):\n(none)");
  });

  test("a reviewer that reads wires reports a line that wires of different dash or colour share, and never words close lanes of such wires as a merge", () => {
    for (const prompt of [sectionPrompt(unit(board, "sec"), section), gapPrompt(gap), wirePrompt(wire)]) {
      expect(prompt).toContain("Wires that differ in dash or colour differ in meaning. Report a line or a trunk that such wires share, and a label chip on it");
      expect(prompt).toContain(`When such wires run in lanes too close to tell apart, the fault is the room between the lanes. Never word it so that it reads as "merge them".`);
    }
    const prompt = wirePrompt(wire);
    expect(prompt).toContain("- a line or a trunk shared by wires that differ in dash or colour, and a label chip on such a line;");
    // The line that asked for a merge of any 2 parallel wires is gone.
    expect(prompt).not.toContain("parallel wires that must merge");
  });

  test("the space reviewer judges adjacency first, from the wires between each pair of sections, and leaves what the runner measures to the runner", () => {
    const prompt = spacePrompt(space);
    expect(prompt).toContain("Your first job is adjacency: sections that talk to each other must sit next to each other.");
    for (const fault of [
      "- two sections with many wires between them that are not neighbours;",
      "- a section that lies between two sections that talk to each other;",
      "- a gap too narrow for the label chips in it;",
      "- a sink or a store far from its sources;",
      "- a store or an outcome section that sits before the stages that feed it: left of them or above them, against the way the board reads;",
      "- an empty area the board does not need: a hole between sections, or a corner that no section fills;",
    ]) expect(prompt).toContain(fault);
    // The band check of the runner measures a gap against its wires, and the choices reviewer has the brief to hold the start of the board against.
    expect(prompt).not.toMatch(/TIGHT|more than 1 wire per|does not start at the top/);
    // Round 5: the judges faulted an empty block on every weak board, and this reviewer was told never to report one.
    expect(prompt).not.toMatch(/Never report an empty corner|ragged section edges/);
    expect(prompt).toContain("a blue box for each section, a yellow box for each sticky");
    expect(prompt).toContain(
      "The runner measures the empty blocks, how full each section is, each band against the band rule, each wire through a section that holds neither of its ends,"
      + " and each wire over 1500 px between sections that are not neighbours. Use their numbers in your findings, and report what the measures miss.");
    // Round 5 cycle 4, board 10: this reviewer reported a band of 220 px as empty, and the finding came back until it was stuck.
    expect(prompt).toContain("A band inside its legal width is the room of its wires, whatever its area: never report it as empty, as a hole or as too wide, and never count it into an empty area.");
    expect(prompt).toContain("Bands between neighbour sections, each against the band rule:\nsec ↔ far · side by side · gap 260 px · band x 900 to 1160, y 200 to 600 · 3 wires run along it (w, x, y) · 0 label chips in it · needs 240 px, legal to 360 px · inside its legal width");
    expect(prompt).toContain(
      "The runner sends the drawer each of these as its own finding. Do not report one of them again:\n"
      + "An empty block of 900 × 500 px sits in the board frame at x 1500 to 2400, y 700 to 1200: 16% of the frame holds no section, node or sticky");
    expect(spacePrompt({ ...space, measured: [] })).toContain("Do not report one of them again:\n(none)");
    expect(prompt).toContain("most wires first:\nsec ↔ far · 4 wires · 3200 px of wire in total · NOT neighbours: mid lies between them");
    expect(prompt).toContain("Wires longer than 800 px (id · from (its section) → to (its section) · length · bends):\nw · a (sec) → z (far) · 1200 px · 2 bends");
    expect(prompt).toContain(`(sinks and stores):\nz "Store" in far · 3 wires in from sec`);
    expect(prompt).toContain("Board:\n2400 × 1200 px, aspect ratio 2.00 : 1");
    // The adjacency block comes ahead of the gaps and the long wires.
    expect(prompt.indexOf("Wires between sections (")).toBeLessThan(prompt.indexOf("Bands between neighbour sections"));
  });

  test("the choices reviewer reads the brief beside the object list, and with no brief reports nothing as missing", () => {
    const prompt = choicesPrompt(choices);
    expect(prompt).toContain("<brief>\nDraw the 3 roles.\nThe store holds every trace.\n</brief>");
    for (const fault of [
      "- a gray or colourless section;",
      "- sibling sections that all have one colour;",
      "- a plain rectangle where the brief names a kind that has a shape or an icon",
      "- one icon repeated on many unlike nodes;",
      "- colour that carries no meaning",
      "- a node with the colour of its section: it does not stand out from it;",
      "- 4 or more gray nodes in one section;",
      "- a step with no icon among nodes that have one (kind `icon`);",
      "- a section whose steps run against the reading direction of the board, or a chain that reverses direction inside a section (kind `placement`);",
      "- an object or a relation in the brief that the board lacks (kind `missing`);",
      "- a board that starts where the story of the brief does not: say what a reader meets first at the top or the left of the board, and where the brief's story starts (kind `placement`);",
      "- a hierarchy in the brief that the board shows flat (kind `nesting`).",
    ]) expect(prompt).toContain(fault);
    expect(prompt).toContain(`Objects (id · type · shape · icon · colour · parent (its colour) · text):\na · rectangle · shape - · no icon · no colour · in sec (gray) · "Store"`);
    expect(prompt).toContain("Counted:\n1 section has colour gray: sec");

    const alone = choicesPrompt({ ...choices, brief: null });
    expect(alone).toContain("No brief came with this board. Judge colour, shape and icon from the board alone, and report nothing as missing.");
    expect(alone).toContain("- a gray or colourless section;");
    expect(alone).not.toMatch(/<brief>|in the brief that the board|story of the brief/);
  });

  test("a reviewer is told what the lint already said, what the drawer declined and why, what is settled, and what the runner sends again itself", () => {
    const notes = {
      checked: ["near-miss: b is 20px off a's center line, so w bends (move b by dy -20)"],
      declined: ["[routing] w: The wire bends twice. The drawer declined: the bend clears the label"],
      settled: ["[spacing] sec, far: The gap is 60 px. The drawer declined: the chips fit"],
      returned: ["[placement] sec, far: 4 wires join sec and far, and mid lies between them."],
    };
    for (const prompt of [sectionPrompt(unit(board, "sec"), { ...section, notes }), gapPrompt({ ...gap, notes }), wirePrompt({ ...wire, notes }), spacePrompt({ ...space, notes }), choicesPrompt({ ...choices, notes })]) {
      expect(prompt).toContain("The strict lint already gave the drawer these. Do not report them again:\nnear-miss: b is 20px off a's center line, so w bends (move b by dy -20)");
      expect(prompt).toContain(
        "Raise one again only when its reason is wrong on the current images, and say why it is wrong. Name the same ids. Else do not report it:\n"
        + "[routing] w: The wire bends twice. The drawer declined: the bend clears the label");
      expect(prompt).toContain("These faults are settled: the drawer declined them twice. Do not report them:\n[spacing] sec, far: The gap is 60 px. The drawer declined: the chips fit");
      expect(prompt).toContain("The drawer declined these, and its turn changed no section's row, column or neighbours. The runner sends them again itself. Do not report them:\n[placement] sec, far: 4 wires join sec and far, and mid lies between them.");
    }
    for (const prompt of prompts()) expect(prompt).not.toMatch(/Do not report them again|The drawer declined these|These faults are settled/);
  });

  test("a reviewer that looks further gets its first prompt, its first answer and each view's image, routes and measures", () => {
    const prompt = lookPrompt("FIRST PROMPT", `{"findings":[],"look":[["a","w"]]}\n`, [
      { ids: ["a", "w"], frame: { x: -28, y: 72, width: 356, height: 300.4 }, scale: 1, routes: ["  w  anchors right→left"], measures: ["MEASURES · ids a 100,200 100×100"] },
    ], 4);
    expect(prompt).toStartWith("FIRST PROMPT\n");
    expect(prompt).toContain(`Your first answer was:\n{"findings":[],"look":[["a","w"]]}\n`);
    expect(prompt).toContain("Image 5: a, w. Board x -28 to 328, y 72 to 372 (full size: 1 image px is 1 board px).\nROUTES\n  w  anchors right→left\nMEASURES · ids a 100,200 100×100");
    expect(prompt).toEndWith("This answer replaces your first. Set `look` to [].");
  });
});

describe("climb review options", () => {
  test("the loop runs 20 rounds and a review runs 8 reviewers at once, unless the flags say more or fewer", () => {
    expect(parseCritic(new Map())).toEqual({ count: 8, rounds: 20, effort: null, reviseTimeoutMs: 30 * 60_000, loopTimeoutMs: 240 * 60_000 });
    expect(parseCritic(new Map([["--critic-rounds", "1"], ["--critic-count", "20"], ["--critic-effort", "high"], ["--revise-timeout-min", "12"], ["--loop-timeout-min", "90.5"]])))
      .toEqual({ count: 20, rounds: 1, effort: "high", reviseTimeoutMs: 720_000, loopTimeoutMs: 5_430_000 });
    expect(parseCritic(new Map([["--critic-effort", "auto"]])).effort).toBeNull();
    expect(parseCritic(new Map([["--critic-effort", "medium"]])).effort).toBe("medium");
    expect(() => parseCritic(new Map([["--critic-rounds", "0"]]))).toThrow("--critic-rounds");
    expect(() => parseCritic(new Map([["--critic-count", "0"]]))).toThrow("--critic-count");
    expect(() => parseCritic(new Map([["--critic-effort", "xhigh"]]))).toThrow("--critic-effort must be auto, medium or high");
    expect(() => parseCritic(new Map([["--revise-timeout-min", "0"]]))).toThrow("--revise-timeout-min");
    expect(() => parseCritic(new Map([["--loop-timeout-min", "soon"]]))).toThrow("--loop-timeout-min");
  });

  test("a board with 30 wires or more, or 40 objects or more, gets high effort, and a smaller one medium", () => {
    const sized = (objects: number, wires: number) => reviewerEffort({ objects: Array(objects).fill(0), connections: Array(wires).fill(0) });
    expect([sized(39, 29), sized(0, 0)]).toEqual(["medium", "medium"]);
    expect([sized(39, 30), sized(40, 29), sized(5, 60), sized(80, 0)]).toEqual(["high", "high", "high", "high"]);
  });

  test("a reviewer is Sol 6.1 in fast mode at the effort of its board", () => {
    const args = criticArgs("/tmp/u", "PROMPT", ["/tmp/u/1.png", "/tmp/u/2.png"], "/tmp/schema.json", "/tmp/u/answer-1.json", "high");
    const after = (flag: string) => args.flatMap((arg, index) => arg === flag ? [args[index + 1]] : []);
    expect(after("-m")).toEqual(["gpt-6.1-sol"]);
    expect(after("-c")).toEqual([`model_reasoning_effort="high"`, `service_tier="fast"`]);
    expect(after("--enable")).toEqual(["fast_mode"]);
    expect(after("-i")).toEqual(["/tmp/u/1.png", "/tmp/u/2.png"]);
    expect(args.at(-1)).toBe("PROMPT");
    expect(criticArgs("/tmp/u", "P", [], "/s", "/o", "medium")).toContain(`model_reasoning_effort="medium"`);
  });
});

describe("climb review answer", () => {
  const answer = (findings: unknown[], look: unknown = []) => JSON.stringify({ findings, look });

  test("an answer off the schema is refused", () => {
    expect(parseAnswer(answer([finding({ ids: ["a"] })])).findings).toHaveLength(1);
    expect(() => parseAnswer(answer([{ ...finding({}), kind: "theme" }]))).toThrow("unknown kind");
    expect(() => parseAnswer(answer([{ ...finding({}), severity: 2 }]))).toThrow("severity must be blocker, should or nit");
    expect(() => parseAnswer(answer([{ ...finding({}), problem: " " }]))).toThrow(`"problem" must be a non-empty string`);
    expect(() => parseAnswer("{}")).toThrow("findings");
  });

  test("a finding is a problem and its highlight in board coordinates: a path along a wire, a box round an area", () => {
    const { findings, look } = parseAnswer(answer([{
      ...finding({ ids: ["e_preflight"] }),
      marks: [
        { path: [{ x: 370, y: 612 }, { x: 370, y: 220 }, { x: 852, y: 220 }], box: null },
        { path: null, box: { x: 780, y: 160, width: 200, height: 120 } },
        // Not a highlight: a path of one point, a box with no area, a point that is no number.
        { path: [{ x: 1, y: 2 }], box: null }, { path: null, box: { x: 0, y: 0, width: 0, height: 10 } }, { path: [{ x: 1, y: 2 }, { x: "3", y: 4 }], box: null },
      ],
    }]));
    expect(findings).toEqual([{
      kind: "routing", ids: ["e_preflight"], labels: [], problem: "Two wires share a segment.", severity: "should",
      marks: [{ path: [[370, 612], [370, 220], [852, 220]] }, { box: { x: 780, y: 160, width: 200, height: 120 } }],
    }]);
    expect(look).toEqual([]);
  });

  test("a fix or a tool call in an answer is not read: the finding goes on as its problem alone", () => {
    const { findings } = parseAnswer(answer([{
      ...finding({ ids: ["w"], problem: "The wire bends twice." }),
      fix: "Route it along y 220.", call: { tool: "route", id: "w", points: [{ x: 370, y: 220 }] }, suggestion: "reset the route",
    }]));
    expect(findings).toEqual([{ kind: "routing", ids: ["w"], labels: [], problem: "The wire bends twice.", severity: "should", marks: [] }]);
  });

  test("an answer can ask for up to 5 views, each a list of ids", () => {
    const views = [["executor", "capabilities", "e_preflight"], [], ["a", "a", " "], ["b"], ["c"], ["d"], ["e"]];
    expect(parseAnswer(answer([], views)).look).toEqual([["executor", "capabilities", "e_preflight"], ["a"], ["b"], ["c"], ["d"]]);
    expect(parseAnswer(`{"findings":[]}`).look).toEqual([]);
  });

  test("the answer schema is strict, and a finding has no field for a fix or a tool call", () => {
    const open: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (Array.isArray(node)) return node.forEach((item, index) => walk(item, `${path}[${index}]`));
      if (node === null || typeof node !== "object") return;
      const schema = node as { type?: unknown; properties?: Record<string, unknown>; required?: string[]; additionalProperties?: unknown };
      if (schema.type === "object") {
        const keys = Object.keys(schema.properties ?? {});
        if (schema.additionalProperties !== false || keys.length === 0 || keys.join() !== (schema.required ?? []).join()) open.push(path);
      }
      for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`);
    };
    const schema = answerSchema() as { properties: { findings: { items: { properties: Record<string, unknown> } } } };
    walk(schema, "$");
    expect(open).toEqual([]);
    expect(Object.keys(schema.properties.findings.items.properties)).toEqual(["kind", "ids", "labels", "problem", "severity", "marks"]);
    expect(JSON.stringify(schema)).not.toMatch(/"(fix|call|tool|args)"/);
  });

  test("a reviewer that hits a rate limit is asked again after a wait, up to 5 times, and no other failure is", async () => {
    const asking = async (stderrs: string[], extra: { timedOut?: boolean; answeredFrom?: number } = {}) => {
      let calls = 0;
      const waits: number[] = [];
      const { result, tries, limited } = await askReviewer({
        call: async () => { calls += 1; return { exitCode: 1, timedOut: extra.timedOut ?? false, stderr: stderrs[Math.min(calls, stderrs.length) - 1]! }; },
        answered: () => calls >= (extra.answeredFrom ?? Infinity),
        sleep: async (ms) => { waits.push(ms); },
      });
      return { calls, tries, limited, waits, stderr: result.stderr };
    };
    // 2 tries turned down with HTTP 429, then an answer.
    expect(await asking(["stream error: 429 Too Many Requests", "exceeded retry limit, last status: 429", ""], { answeredFrom: 3 }))
      .toEqual({ calls: 3, tries: 3, limited: false, waits: [20_000, 40_000], stderr: "" });
    // Turned down every time: 5 tries, then the reviewer has no answer.
    expect(await asking(["the model is overloaded (529)"])).toMatchObject({ calls: 5, tries: 5, limited: true, waits: [20_000, 40_000, 80_000, 160_000] });
    // Not a rate limit: another error, a timeout, or an answer that Codex wrote before it failed.
    expect(await asking(["unknown model gpt-6.1-sol"])).toMatchObject({ calls: 1, limited: false, waits: [] });
    expect(await asking(["429 Too Many Requests"], { timedOut: true })).toMatchObject({ calls: 1, limited: false });
    expect(await asking(["429 Too Many Requests"], { answeredFrom: 1 })).toMatchObject({ calls: 1, limited: false });
    // Codex prints the prompt first. A number in it is not a rate limit: only the end of stderr holds the error.
    expect(await asking([`user\np1 · x 429 · y 503\n${"codex ".repeat(400)}\nERROR: unexpected status 400 Bad Request`])).toMatchObject({ calls: 1, limited: false, waits: [] });
  });
});

describe("climb review merge", () => {
  const plain = ({ marks: _marks, ...rest }: UnitFinding): Finding => rest;

  test("one fault seen by two reviewers reaches the drawer once", () => {
    const boardIds = new Set(["wire-a", "wire-b", "node-c"]);
    const merged = mergeFindings([
      { region: "wires", findings: [finding({ ids: ["wire-a", "wire-b"], severity: "nit" }), finding({ kind: "colour", ids: ["node-c"] })] },
      { region: "sec", findings: [finding({ ids: ["wire-b", "ghost"], severity: "blocker", problem: "The wires overlap." })] },
    ], boardIds);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual({
      ...plain(finding({ severity: "blocker", problem: "The wires overlap." })), ids: ["wire-a", "wire-b"], labels: ["ghost"], regions: ["sec", "wires"], marks: [],
    });
    expect(merged[1]).toMatchObject({ kind: "colour", severity: "should", ids: ["node-c"], regions: ["wires"], marks: [] });
  });

  test("a merged finding keeps each reviewer's highlight with the reviewer that drew it", () => {
    const along = [{ path: [[370, 612], [370, 220]] as Array<[number, number]> }];
    const round = [{ box: { x: 300, y: 200, width: 140, height: 60 } }];
    const merged = mergeFindings([
      { region: "wires", findings: [finding({ ids: ["w"], marks: along })] },
      { region: "gap-1", findings: [finding({ ids: ["w"], marks: round })] },
      { region: "sec_a", findings: [finding({ ids: ["w"] })] },
    ], new Set(["w"]));
    expect(merged).toHaveLength(1);
    expect(merged[0]!.regions).toEqual(["gap-1", "sec_a", "wires"]);
    expect(merged[0]!.marks).toEqual([{ unit: "wires", marks: along }, { unit: "gap-1", marks: round }]);
  });

  test("faults that only share an item stay separate findings, each with its own words", () => {
    const boardIds = new Set(["wire-a", "wire-b", "wire-c"]);
    const merged = mergeFindings([
      { region: "r01", findings: [
        finding({ ids: ["wire-a", "wire-b"], problem: "Wires a and b cross." }),
        // One reviewer lists separate faults, even on the same wires.
        finding({ ids: ["wire-a", "wire-b"], problem: "Wires a and b hide one arrowhead." }),
      ] },
      { region: "r02", findings: [
        finding({ ids: ["wire-b", "wire-c"], problem: "Wires b and c share a segment." }),
        finding({ ids: [], labels: ["Retry"], problem: "The label sits on a border." }),
      ] },
      { region: "r03", findings: [
        finding({ ids: ["wire-c"], problem: "Wire c takes a detour." }),
        finding({ ids: [], labels: ["retry"], problem: "The label touches a border." }),
      ] },
    ], boardIds);
    expect(merged.map((entry) => [entry.problem, entry.ids, entry.regions])).toEqual([
      ["Wires b and c share a segment.", ["wire-b", "wire-c"], ["r02", "r03"]],
      ["The label sits on a border.", [], ["r02", "r03"]],
      ["Wires a and b cross.", ["wire-a", "wire-b"], ["r01"]],
      ["Wires a and b hide one arrowhead.", ["wire-a", "wire-b"], ["r01"]],
    ]);
  });

  test("a finding that is part of two faults does not join them into one", () => {
    const merged = mergeFindings([
      { region: "r01", findings: [finding({ ids: ["wire-a", "wire-b"], problem: "Wires a and b cross." })] },
      { region: "r02", findings: [finding({ ids: ["wire-b"], problem: "Wire b cuts a corner." })] },
      { region: "r03", findings: [finding({ ids: ["wire-b", "wire-c"], problem: "Wires b and c share a segment." })] },
    ], new Set(["wire-a", "wire-b", "wire-c"]));
    expect(merged.map((entry) => [entry.problem, entry.ids, entry.regions])).toEqual([
      ["Wires a and b cross.", ["wire-a", "wire-b"], ["r01", "r02"]],
      ["Wires b and c share a segment.", ["wire-b", "wire-c"], ["r03"]],
    ]);
  });

  test("the summary of a review names its effort, its reviewers of each kind and their findings", () => {
    const region = (id: string, kind: UnitRecord["kind"], findings: number, error: string | null = null): UnitRecord => ({
      region: { id, x: 0, y: 0, width: 1, height: 1 }, kind, crops: [], dir: id, images: [], objects: 0, wires: 0, durationMs: kind === "space" ? 61_200 : 30_000,
      exitCode: 0, timedOut: false, tries: 1, error, look: kind === "wire" ? [["w"]] : [], lookError: null, findings: Array.from({ length: findings }, () => finding({})),
    });
    const record: CritiqueRecord = {
      board: "/b.canvas.json", model: "gpt-6.1-sol", effort: "high", count: 8, startedAt: "", durationMs: 75_000, renderMs: 9_400, lints: [],
      regions: [region("space", "space", 2), region("wires", "wire", 3), region("choices", "choices", 1), region("sec_a", "section", 4), region("sec_b", "section", 0, "timed out"), region("gap-1", "gap", 2)],
      gap: { chips: 7, covered: 7, crops: 3 }, findings: [], computed: [], layout: { sections: {}, holders: {}, wires: {}, places: {}, centres: {}, numbers: { length: {}, crossings: {}, faults: {} } },
    };
    expect(critiqueSummary(record)).toBe(
      "0 lints · 6 reviewers at high (2 section, 1 gap, 1 wire, 1 space, 1 choices, 0 loose) · 12 findings (section 4, gap 2, wire 3, space 2, choices 1, loose 0), 0 after merge"
      + " · gap chips 7/7 in 3 crops · 1 looked further · 75.0 s wall (render 9.4 s, slowest reviewer 61.2 s) · 1 unparsed: sec_b");
  });
});
