import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import {
  answerSchema, boardPrompt, decodeCall, loadReviewCanvas, lookPrompt, mergeFindings, parseAnswer, parseCritic, sectionPrompt,
  type Finding, type UnitFinding,
} from "./critic.ts";
import { drawerArgs, replyOf, sessionIdOf } from "./drawer.ts";
import { boardWireSheet, lookFrame, measuresOf, ownerUnits, reviewUnits, routesOf, wireSheet, wireSheetLines, type Board, type BoardObject } from "./review-inputs.ts";
import { BOARD_CALL_TOOLS, SECTION_CALL_TOOLS } from "./review-types.ts";
import { wireFacts } from "./wires.ts";

/** Board 05 as round 3 drew it: the board the round 4 design measures. */
const BOARD = resolve(import.meta.dir, "fixtures/review/b05.canvas.json");

const finding = (overrides: Partial<UnitFinding>): UnitFinding => ({
  kind: "routing", ids: [], labels: [], problem: "Two wires share a segment.", fix: "Route them apart.", severity: "should", call: null, marks: [], ...overrides,
});
const box = (id: string, type: string, parentId: string | null, x = 0, y = 0, width = 100, height = 100): BoardObject =>
  ({ id, type, parentId, geometry: { x, y, width, height } });
const unitIds = (board: Board) => reviewUnits(board).units.map((unit) => `${unit.id}:${unit.owned.map((object) => object.id).join("+")}`);

describe("climb review units", () => {
  test("board 05 has the whole board, its 5 sections and the loose items: the page frame has no reviewer", async () => {
    const canvas = await loadReviewCanvas();
    const board = canvas.toolkit.openCanvasFile(BOARD).persisted as Board;
    const { pageFrame, units } = reviewUnits(board);
    expect(pageFrame?.id).toBe("page-frame");
    expect(units.map((unit) => [unit.id, unit.stage])).toEqual([
      ["board", "A"], ["sec_engine", "B"], ["sec_contract", "B"], ["sec_records", "B"], ["sec_providers", "B"], ["sec_ford", "B"], ["loose", "B"],
    ]);
    const unit = (id: string) => units.find((entry) => entry.id === id)!;
    expect(unit("board").owned.map((object) => object.id)).toEqual(["sec_engine", "sec_contract", "sec_records", "sec_providers", "sec_ford"]);
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
    expect(unitIds(board)).toEqual(["board:outer+inner", "outer:inner+a", "inner:b", "loose:key+stray"]);
    const owners = ownerUnits(reviewUnits(board).units);
    expect([owners.get("a"), owners.get("b"), owners.get("inner"), owners.get("stray")]).toEqual(["outer", "inner", "inner", "loose"]);
  });

  test("a root section is a page frame only when it is the one root section and it holds sections", () => {
    // Two root sections: neither frames the whole page.
    const two: Board = { objects: [box("left", "section", null), box("in", "section", "left"), box("right", "section", null), box("a", "rectangle", "in")], connections: [] };
    expect(reviewUnits(two).pageFrame).toBeNull();
    expect(unitIds(two)).toEqual(["board:left+in+right", "left:in", "in:a", "right:"]);
    // One root section that holds only items is a section like any other, and a board with no loose item has no loose reviewer.
    const flat: Board = { objects: [box("only", "section", null), box("a", "rectangle", "only")], connections: [] };
    expect(reviewUnits(flat).pageFrame).toBeNull();
    expect(unitIds(flat)).toEqual(["board:only", "only:a"]);
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

    // The whole-board reviewer has the wires that join 2 units, each with the units it joins.
    const between = boardWireSheet(units, facts);
    expect(between.map((row) => row.fact.id)).not.toContain("e_yields");
    expect(between.find((row) => row.fact.id === "e_calls")!.kind).toBe("sec_engine → sec_contract");

    // A look frames its ids with a 128 px ring, wires by their whole route.
    expect(lookFrame(["capabilities", "e_preflight"], board, facts)).toEqual({ x: 370 - 128, y: 160 - 128, width: 980 - 370 + 256, height: 612 - 160 + 256 });
    expect(lookFrame(["ghost"], board, facts)).toBeNull();
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
  const text = {
    scales: { board: 0.4, section: 1, neighbourhood: 0.5 }, ruler: true,
    objects: ["a · rectangle"], measures: ["MEASURES · section sec 100,200 800×400"], wires: ["W1 w · a → b"], totals: "LAYOUT · wire length 10px", notes: { checked: [], earlier: [] },
  };

  test("a section reviewer gets its 4 images, its numbers, the call tools of a section and the tool facts", () => {
    const prompt = sectionPrompt(unit(board, "sec"), text);
    expect(prompt).toContain(`You review one section of a diagram board: sec "", at board x 100 to 900, y 200 to 600.`);
    for (const image of ["Image 1 is the whole board", "Image 2 is your section (full size: 1 image px is 1 board px), with the board's smart guides", "Image 3 is your section with every object wired to it", "Image 4 is image 3 with each wire tagged"]) {
      expect(prompt).toContain(image);
    }
    expect(prompt).toContain("The ruler on its top and left edges gives board coordinates");
    expect(prompt).toContain("Objects:\na · rectangle\nMEASURES · section sec 100,200 800×400");
    expect(prompt).toContain("W1 w · a → b");
    expect(prompt).toContain("Board totals:\nLAYOUT · wire length 10px");
    expect(prompt).toContain("20 px");
    expect(prompt).toContain("- route {id, points: [{x, y}, ...]}");
    // Where the sections sit is the whole-board reviewer's, so its 2 tools are not offered to a section.
    expect(prompt).not.toContain("arrange_section {");
    expect(prompt).not.toContain("Do not report them again");
    expect(prompt).not.toContain("Earlier rounds");
    expect(sectionPrompt(unit(board, "sec"), { ...text, ruler: false })).not.toContain("The ruler on its top and left edges");
    expect(sectionPrompt(unit(board, "loose"), text)).toContain("You review the items of a diagram board that sit in no section: key.");
  });

  test("a reviewer is told what the lint already said and what earlier rounds settled", () => {
    const notes = {
      checked: ["G1 b is 20px off a's center line, so w bends (move b by dy -20)"],
      earlier: ["[routing] w: The wire bends twice. Drawer: declined, the bend clears the label"],
    };
    for (const prompt of [sectionPrompt(unit(board, "sec"), { ...text, notes }), boardPrompt({ scale: 0.4, sections: [], wires: [], totals: "", notes })]) {
      expect(prompt).toContain("Do not report them again:\nG1 b is 20px off a's center line, so w bends (move b by dy -20)");
      expect(prompt).toContain("the drawer's reason does not hold:\n[routing] w: The wire bends twice. Drawer: declined, the bend clears the label");
    }
  });

  test("the whole-board reviewer gets the section map, a line a section and the 2 tools that place a section", () => {
    const prompt = boardPrompt({ scale: 0.4, sections: ["sec · at the root · x 100"], wires: [], totals: "LAYOUT", notes: { checked: [], earlier: [] } });
    expect(prompt).toContain("Image 2 is a map of the board's sections");
    expect(prompt).toContain("sec · at the root · x 100");
    expect(prompt).toContain("- arrange_section {section, rows");
    expect(prompt).toContain("- fit_section {id}");
    expect(prompt).toContain("Wires between sections");
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

describe("climb review answer", () => {
  const answer = (findings: unknown[], look: unknown = []) => JSON.stringify({ findings, look });
  const route = { tool: "route", id: "e_preflight", points: [{ x: 370, y: 220 }], shift: null, reset: null };

  test("the loop runs 10 rounds and a review runs 8 reviewers at once, unless the flags say more or fewer", () => {
    expect(parseCritic(new Map())).toEqual({ count: 8, rounds: 10 });
    expect(parseCritic(new Map([["--critic-rounds", "1"], ["--critic-count", "20"]]))).toEqual({ count: 20, rounds: 1 });
    expect(() => parseCritic(new Map([["--critic-rounds", "0"]]))).toThrow("--critic-rounds");
    expect(() => parseCritic(new Map([["--critic-count", "0"]]))).toThrow("--critic-count");
  });

  test("an answer off the schema is refused", () => {
    expect(parseAnswer(answer([finding({ ids: ["a"] })]), SECTION_CALL_TOOLS).findings).toHaveLength(1);
    expect(() => parseAnswer(answer([{ ...finding({}), kind: "theme" }]), SECTION_CALL_TOOLS)).toThrow("unknown kind");
    expect(() => parseAnswer(answer([{ ...finding({}), severity: 2 }]), SECTION_CALL_TOOLS)).toThrow("severity must be blocker, should or nit");
    expect(() => parseAnswer("{}", SECTION_CALL_TOOLS)).toThrow("findings");
  });

  test("a finding carries its call as the tool takes it, and its sketch", () => {
    const { findings, look } = parseAnswer(answer([{
      ...finding({ ids: ["e_preflight"] }), call: route,
      marks: [{ path: [{ x: 370, y: 612 }, { x: 370, y: 220 }, { x: 852, y: 220 }], box: null }, { path: null, box: { x: 780, y: 160, width: 200, height: 120 } }],
    }]), SECTION_CALL_TOOLS);
    expect(findings[0]).toMatchObject({
      ids: ["e_preflight"],
      call: { tool: "route", args: { id: "e_preflight", points: [[370, 220]] } },
      marks: [{ style: "sketch", path: [[370, 612], [370, 220], [852, 220]] }, { style: "sketch", box: { x: 780, y: 160, width: 200, height: 120 } }],
    });
    expect(look).toEqual([]);
  });

  test("each tool's fields decode to the arguments the canvas tool takes", () => {
    const decode = (call: object) => decodeCall(call, BOARD_CALL_TOOLS)?.args ?? null;
    expect(decode({ tool: "move", id: "a", to: { x: 740, y: 580 }, by: null })).toEqual({ id: "a", to: { x: 740, y: 580 } });
    expect(decode({ tool: "move", id: "a", to: null, by: { dx: 0, dy: -20 } })).toEqual({ id: "a", by: { dx: 0, dy: -20 } });
    expect(decode({ tool: "resize", id: "a", width: 300, height: null, like: null })).toEqual({ id: "a", width: 300 });
    expect(decode({ tool: "resize", id: "a", width: null, height: null, like: "b" })).toEqual({ id: "a", like: "b" });
    expect(decode({ tool: "change_connection", id: "w", from: null, to: { objectId: "b", anchor: "top" } })).toEqual({ id: "w", patch: { to: { objectId: "b", anchor: "top" } } });
    expect(decode({ tool: "change_connection", id: "w", from: { objectId: "a", anchor: null }, to: null })).toEqual({ id: "w", patch: { from: { objectId: "a" } } });
    expect(decode({ tool: "route", id: "w", points: null, shift: { segment: 1, to: 500 }, reset: null })).toEqual({ id: "w", shift: { segment: 1, to: 500 } });
    expect(decode({ tool: "route", id: "w", points: [], shift: null, reset: true })).toEqual({ id: "w", reset: true });
    expect(decode({ tool: "move_label", id: "w", along: 0.3, offset: null })).toEqual({ id: "w", along: 0.3 });
    expect(decode({ tool: "move_label", id: "w", along: null, offset: 12 })).toEqual({ id: "w", along: 0.5, offset: 12 });
    expect(decode({ tool: "move_label", id: "w", along: null, offset: null })).toEqual({ id: "w", along: "auto" });
    expect(decode({ tool: "arrange_section", section: "s", rows: [["a", "b"], ["c"]] })).toEqual({ section: "s", rows: [["a", "b"], ["c"]] });
    expect(decode({ tool: "fit_section", id: "s" })).toEqual({ id: "s" });
    // Fields that do not make one call: both of to and by, none of them, 2 route modes, no size.
    expect(decode({ tool: "move", id: "a", to: { x: 1, y: 2 }, by: { dx: 1, dy: 0 } })).toBeNull();
    expect(decode({ tool: "move", id: "a", to: null, by: null })).toBeNull();
    expect(decode({ tool: "route", id: "w", points: [{ x: 1, y: 2 }], shift: { segment: 0, to: 4 }, reset: null })).toBeNull();
    expect(decode({ tool: "resize", id: "a", width: null, height: null, like: null })).toBeNull();
  });

  test("a call with a tool the reviewer cannot name is dropped, and its finding goes on as text", () => {
    const fit = { ...finding({ ids: ["sec"], problem: "The section is too tall." }), call: { tool: "fit_section", id: "sec" }, marks: [{ path: null, box: { x: 0, y: 0, width: 10, height: 10 } }] };
    const gone = { ...finding({ ids: ["a"], problem: "The box adds nothing." }), call: { tool: "delete", id: "a" } };
    const section = parseAnswer(answer([fit, gone]), SECTION_CALL_TOOLS).findings;
    expect(section.map((entry) => [entry.problem, entry.call, entry.marks])).toEqual([["The section is too tall.", null, []], ["The box adds nothing.", null, []]]);
    // The whole-board reviewer places sections, so the same call stays.
    const whole = parseAnswer(answer([fit, gone]), BOARD_CALL_TOOLS).findings;
    expect(whole.map((entry) => entry.call)).toEqual([{ tool: "fit_section", args: { id: "sec" } }, null]);
    expect(whole[0]!.marks).toHaveLength(1);
  });

  test("an answer can ask for up to 5 views, each a list of ids", () => {
    const views = [["executor", "capabilities", "e_preflight"], [], ["a", "a", " "], ["b"], ["c"], ["d"], ["e"]];
    expect(parseAnswer(answer([], views), SECTION_CALL_TOOLS).look).toEqual([["executor", "capabilities", "e_preflight"], ["a"], ["b"], ["c"], ["d"]]);
    expect(parseAnswer(`{"findings":[]}`, SECTION_CALL_TOOLS).look).toEqual([]);
  });

  test("the answer schema is strict: every field required, no open object, and only the reviewer's tools", () => {
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
    walk(answerSchema(BOARD_CALL_TOOLS), "$");
    expect(open).toEqual([]);
    const tools = (schema: object) => [...JSON.stringify(schema).matchAll(/"tool":\{"type":"string","enum":\["(\w+)"\]\}/g)].map((match) => match[1]);
    expect(tools(answerSchema(SECTION_CALL_TOOLS))).toEqual([...SECTION_CALL_TOOLS]);
    expect(tools(answerSchema(BOARD_CALL_TOOLS))).toEqual([...BOARD_CALL_TOOLS]);
  });
});

describe("climb review merge", () => {
  const plain = ({ call: _call, marks: _marks, ...rest }: UnitFinding): Finding => rest;

  test("one fault seen by two reviewers reaches the drawer once", () => {
    const boardIds = new Set(["wire-a", "wire-b", "node-c"]);
    const merged = mergeFindings([
      { region: "board", findings: [finding({ ids: ["wire-a", "wire-b"], severity: "nit" }), finding({ kind: "colour", ids: ["node-c"] })] },
      { region: "sec", findings: [finding({ ids: ["wire-b", "ghost"], severity: "blocker", problem: "The wires overlap." })] },
    ], boardIds);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual({
      ...plain(finding({ severity: "blocker", problem: "The wires overlap." })), ids: ["wire-a", "wire-b"], labels: ["ghost"], regions: ["board", "sec"], calls: [],
    });
    expect(merged[1]).toMatchObject({ kind: "colour", severity: "should", ids: ["node-c"], regions: ["board"], calls: [] });
  });

  test("a merged finding keeps each distinct call with the reviewer that sent it, and identical calls collapse to one", () => {
    const sketch = [{ style: "sketch" as const, path: [[370, 612], [370, 220]] as Array<[number, number]> }];
    const shift = { tool: "route", args: { id: "w", shift: { segment: 1, to: 500 } } };
    const merged = mergeFindings([
      { region: "board", findings: [finding({ ids: ["w"], call: { tool: "route", args: { id: "w", reset: true } } })] },
      { region: "sec_a", findings: [finding({ ids: ["w"], call: shift, marks: sketch })] },
      // The same call, its keys in another order.
      { region: "sec_b", findings: [finding({ ids: ["w"], call: { tool: "route", args: { shift: { to: 500, segment: 1 }, id: "w" } } })] },
      { region: "sec_c", findings: [finding({ ids: ["w"] })] },
    ], new Set(["w"]));
    expect(merged).toHaveLength(1);
    expect(merged[0]!.regions).toEqual(["board", "sec_a", "sec_b", "sec_c"]);
    expect(merged[0]!.calls).toEqual([
      { unit: "board", call: { tool: "route", args: { id: "w", reset: true } }, marks: [] },
      { unit: "sec_a", call: shift, marks: sketch },
    ]);
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
});

describe("climb drawer session", () => {
  test("the first pass keeps its session, a revise pass resumes it, and its closing reply is read back", () => {
    expect(drawerArgs("/tmp/b", "draw", "/s.json")).toContain("--no-session-persistence");
    expect(drawerArgs("/tmp/b", "draw", "/s.json", { persist: true })).not.toContain("--no-session-persistence");
    const revise = drawerArgs("/tmp/b", "fix", "/s.json", { persist: false, resume: "abc-123" });
    expect(revise[revise.indexOf("--resume") + 1]).toBe("abc-123");
    const transcript = [
      `{"type":"system","subtype":"ui_invalidate","session_id":"abc-123"}`,
      `{"type":"system","subtype":"init","session_id":"abc-123"}`,
    ].join("\n");
    expect(sessionIdOf(transcript)).toBe("abc-123");
    expect(sessionIdOf("not json\n")).toBeNull();
    expect(replyOf(`${transcript}\n{"type":"result","subtype":"success","result":"F1 fixed"}\n{"type":"torn`)).toBe("F1 fixed");
    expect(replyOf(transcript)).toBe("");
  });
});
