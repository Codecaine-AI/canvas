import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import { loadReviewCanvas } from "./critic.ts";
import { box, labelled, wire } from "./fixtures/review/stubs.ts";
import { reviewUnits, type Board, type BoardObject } from "./review-inputs.ts";
import { FAR_WIRE_PX, SPACE_FIXES, blockLine, emptyBlocks, gapLine, gapMeasures, gapRule, planOf, type GapRule } from "./space.ts";
import { wireFacts, type WireFact } from "./wires.ts";

/** The gap rule of topic `rules` when round 5 cycle 3 ran. */
const RULE: GapRule = { base: 200, perWire: 20, labelBase: 100, labelPerCharacter: 10, perLabel: 20, padding: 40 };
const LIMIT = "The limit is 120,000 px² with a short side of 200 px.";

/** A section with one node that fills it: its inside holds no empty block. */
const full = (id: string, parent: string | null, x: number, y: number, width: number, height: number): BoardObject[] =>
  [box(id, "section", parent, x, y, width, height), box(`${id}-n`, "rectangle", id, x, y, width, height)];
const board = (...objects: Array<BoardObject | BoardObject[]>): Board => ({ objects: objects.flat(), connections: [] });
const plan = (file: Board, facts: WireFact[] = []) => planOf(file, facts, RULE);
const blocks = (file: Board, facts: WireFact[] = []) => plan(file, facts).blocks.map(blockLine);
/** A straight wire from x 250 to `toX` at height `y`. */
const across = (id: string, y: number, toX = 550) => wire(id, "p", "q", [[250, y], [toX, y]]);

describe("climb computed checks on the boards of round 5 cycle 2", () => {
  /** A final board of round 5 cycle 2 (rounds/r5-b), as the judges saw it. */
  const measured = async (name: string) => {
    const canvas = await loadReviewCanvas();
    const file = canvas.toolkit.openCanvasFile(resolve(import.meta.dir, "fixtures/space", `${name}.canvas.json`));
    const rule = gapRule(canvas.wires);
    return { rule, plan: planOf(file.persisted as Board, wireFacts(canvas.wires, file), rule) };
  };
  const bands = (found: Awaited<ReturnType<typeof measured>>["plan"]) => found.bands.map(({ worst, sections }) => [worst.side, sections.join(" "), worst.gap, worst.counted.length, worst.need]);

  test("board h1: the hole of 1270 × 340 px the old limit missed, the 2 bands between its rows, the wire through sec-runner and the far wires", async () => {
    const { rule, plan: found } = await measured("r5b-h1");
    expect(rule).toEqual(RULE);
    // The hole at x 2292 to 3560, y 1320 to 1660 is under 400 px high: by area it is the largest block of the board.
    expect(found.blocks.map(blockLine).slice(0, 2)).toEqual([
      "1640 × 308 px empty at x 1940 to 3580, y 1352 to 1660, in the board frame (6% of it)",
      "1288 × 320 px empty at x 2292 to 3580, y 580 to 900, in the board frame (5% of it)",
    ]);
    expect(bands(found)).toEqual([
      ["stacked", "sec-client sec-runner sec-control", 320, 7, 460],
      ["stacked", "sec-runner sec-tree", 368, 9, 480],
      ["side by side", "sec-client sec-control", 420, 3, 460],
      ["side by side", "sec-control sec-life", 420, 7, 460],
    ]);
    expect(found.links.filter((link) => link.through.length).map((link) => [link.fact.id, link.through])).toEqual([["w-treespend", ["sec-runner"]]]);
    expect(found.links.filter((link) => link.fact.length > FAR_WIRE_PX && !link.neighbours).map((link) => [link.fact.id, link.fact.length, link.between]))
      .toEqual([["w-replay", 4216, ["sec-control", "sec-runner"]], ["w-treespend", 1637, ["sec-runner"]], ["w-continue", 3176, []]]);
    // 4 space faults, then 6 wire faults: a band, a section a wire runs through and a far wire in turn, the worst of each first.
    expect(found.faults.map((fault) => [fault.kind, fault.key])).toEqual([
      ["space", `["empty-block","page-frame"]`], ["space", `["empty-block","page-frame"]`], ["space", `["empty-block","page-frame"]`], ["space", `["empty-block","sec-runner"]`],
      ["wire", `["band","stacked","page-frame"]`], ["wire", `["through","sec-runner"]`], ["wire", `["long",["sec-client","sec-durable"]]`],
      ["wire", `["band","stacked","page-frame"]`], ["wire", `["long",["sec-life","sec-runner"]]`], ["wire", `["band","side by side","page-frame"]`],
    ]);
    const wires = found.faults.filter((fault) => fault.kind === "wire");
    expect(wires[0]!.problem).toBe(
      "The band between sec-client and sec-control (above) and sec-runner (below), y 460 to 780, is 320 px wide and 7 wires cross it or run along it:"
      + " w-place, w-ceilhit, w-done, w-intrelease, w-treespend, w-continue, w-crash."
      + " The gap rule asks 460 px for them (200 px, plus 20 px for each wire after the first, plus 20 px for each of the 7 with a label), so the band is 140 px too narrow");
    expect(wires[0]!.facts).toBe(
      "the band is 320 px wide now with 7 wires, and it needs 460 px; 3 of them join a section that is not beside the band:"
      + " w-treespend (sec-tree → sec-control), w-continue (sec-life → sec-runner), w-crash (sec-control → sec-life)");
    expect(wires[1]!.problem).toBe("1 wire runs through section sec-runner, which holds neither end of it: w-treespend (sec-tree → sec-control, 1637 px)");
    expect(wires[1]!.ids).toEqual(["sec-runner", "w-treespend"]);
    expect(wires[2]!.problem).toBe("1 wire over 1500 px joins sections sec-client and sec-durable, which are not neighbours (sec-control and sec-runner lie between them): w-replay (4216 px)");
    expect(wires[2]!.facts).toBe(
      "w-replay is 4216 px now, sec-client → sec-durable, not neighbours: sec-control and sec-runner lie between them;"
      + " by section centres, a swap of sec-client and sec-life saves about 520 px of wire between sections");
  });

  test("board h4: the strip of 312 px in sec-rollout, and the band of 260 px under sec-turn with its 7 wires", async () => {
    const { plan: found } = await measured("r5b-h4");
    expect(found.blocks.map(blockLine)).toContain("312 × 1000 px empty at x 2488 to 2800, y 1660 to 2660, inside section sec-rollout (15% of it)");
    expect(found.bands[0]!.worst.counted).toEqual(["w22", "w25", "w26", "w27", "w31", "w32", "w46"]);
    expect(bands(found)).toEqual([
      ["stacked", "sec-turn sec-memory sec-rollout", 260, 7, 460],
      ["side by side", "sec-turn sec-handoff sec-monitor", 280, 4, 340],
      ["side by side", "sec-chat sec-turn", 260, 4, 300],
    ]);
    // The gap of 216 px between sec-memory and sec-rollout is 4 px under its 220: no fault.
    expect(found.gaps.filter((gap) => gap.ruled && gap.gap < gap.need && !gap.fault).map((gap) => [gap.a, gap.b, gap.gap, gap.need])).toEqual([["sec-memory", "sec-rollout", 216, 220]]);
    expect(found.faults.find((fault) => fault.kind === "wire")!.facts).toBe(
      "the band is 260 px wide now with 7 wires, and it needs 460 px; 1 of them joins a section that is not beside the band: w46 (sec-monitor → sec-rollout)");
    expect(found.faults).toHaveLength(8);
  });

  test("board 02: the block of 1304 × 276 px inside the pack section, and the band over the stores", async () => {
    const { plan: found } = await measured("r5b-02");
    expect(found.blocks.map(blockLine)[0]).toBe("1304 × 276 px empty at x 920 to 2224, y 1704 to 1980, inside section pack (12% of it)");
    expect(found.faults[0]!.problem).toBe(`An empty block of 1304 × 276 px sits inside section pack at x 920 to 2224, y 1704 to 1980: 12% of the section holds nothing. ${LIMIT} ${SPACE_FIXES}`);
    expect(found.bands.map(({ worst, sections }) => [sections, worst.gap, worst.counted, worst.need])).toEqual([
      [["pack", "outside", "stores"], 240, ["e-tag-coderabbit", "e-events", "e-spans-extract", "e-spans-ctx"], 340],
    ]);
  });

  test("board h6: 3 nodes fill 29% of section ret_ev, and its empty block is that fault, not a second one", async () => {
    const { plan: found } = await measured("r5b-h6");
    expect(found.thin.map((section) => [section.id, section.items, Math.round(section.fill * 100)])).toEqual([["ret_ev", 3, 29]]);
    const thin = found.faults.filter((fault) => fault.key === `["thin","ret_ev"]`);
    expect(thin.map((fault) => fault.problem)).toEqual([
      "Section ret_ev is 696 × 724 px and its 3 items fill 29% of the 616 × 604 px inside its padding and title band: the limit is 35%."
      + ` Its largest empty block is 376 × 400 px at x 3124 to 3500, y 1340 to 1740. ${SPACE_FIXES}`,
    ]);
    expect(found.blocks.some((block) => block.in === "ret_ev")).toBe(true);
    expect(found.faults.some((fault) => fault.key === `["empty-block","ret_ev"]`)).toBe(false);
  });
});

describe("climb empty blocks", () => {
  /** A 2000 × 1000 frame: section a fills its left half, section b the top of its right half behind a 200 px gap. */
  const page = (...more: BoardObject[]) => board(box("page", "section", null, 0, 0, 2000, 1000), full("a", "page", 0, 0, 1000, 1000), full("b", "page", 1200, 0, 800, 400), more);

  test("a block of the board frame that no section, loose node or sticky fills is found with its size, its place and its share of the frame", () => {
    expect(blocks(page())).toEqual(["1000 × 600 px empty at x 1000 to 2000, y 400 to 1000, in the board frame (30% of it)"]);
    // A wire fills nothing: the block stays with a wire through it.
    expect(blocks(page(), [wire("w", "a-n", "b-n", [[900, 700], [1900, 700], [1900, 400]])])).toEqual(blocks(page()));
    // A sticky and a loose node fill space as a section does.
    expect(blocks(page(box("note", "sticky", "page", 1000, 500, 900, 400)))).toEqual([]);
    expect(blocks(page(box("key", "rectangle", "page", 1000, 500, 900, 400)))).toEqual([]);
  });

  test("the limit is 120 000 px² with a short side of 200 px, in the frame and in a section", () => {
    const left = (width: number, height: number) => blocks(page(box("note", "sticky", "page", 1000 + width, 400, 1000 - width, 600), box("low", "sticky", "page", 1000, 400 + height, width, 600 - height)));
    expect(left(400, 300)).toEqual(["400 × 300 px empty at x 1000 to 1400, y 400 to 700, in the board frame (6% of it)"]);
    expect(left(390, 300)).toEqual([]);
    expect(left(600, 200)).toEqual(["600 × 200 px empty at x 1000 to 1600, y 400 to 600, in the board frame (6% of it)"]);
    expect(left(800, 190)).toEqual([]);
    const section = (...nodes: BoardObject[]) => blocks(board(box("s", "section", null, 0, 0, 1000, 800), nodes));
    expect(section(box("n", "rectangle", "s", 0, 0, 800, 800))).toEqual(["200 × 800 px empty at x 800 to 1000, y 0 to 800, inside section s (20% of it)"]);
    expect(section(box("n", "rectangle", "s", 0, 0, 810, 800))).toEqual([]);
    expect(section(box("n", "rectangle", "s", 0, 0, 1000, 500))).toEqual(["1000 × 300 px empty at x 0 to 1000, y 500 to 800, inside section s (38% of it)"]);
    // A subsection fills its parent, and its own inside is measured too.
    expect(section(box("n", "rectangle", "s", 0, 0, 500, 800), box("sub", "section", "s", 500, 0, 500, 800)))
      .toEqual(["500 × 800 px empty at x 500 to 1000, y 0 to 800, inside section sub (100% of it)"]);
  });

  test("an empty block is a space fault that says what fixes it and what does not, and a section that moves takes its block along", () => {
    const found = plan(board(box("s", "section", null, 0, 0, 1000, 800), box("n", "rectangle", "s", 0, 0, 500, 800)));
    expect(found.faults).toEqual([{
      kind: "space", key: `["empty-block","s"]`, block: { x: 500, y: 0, width: 500, height: 800 }, ids: ["s"],
      problem: `An empty block of 500 × 800 px sits inside section s at x 500 to 1000, y 0 to 800: 50% of the section holds nothing. ${LIMIT}`
        + " The allowed fixes: shrink the section or the frame, or move a neighbour in. Not a fix: widen a section, add a sticky, reverse a chain.",
      marks: [{ box: { x: 500, y: 0, width: 500, height: 800 } }],
    }]);
    const moved = (x: number, y: number) => plan(board(box("s", "section", null, x, y, 1000, 800), box("n", "rectangle", "s", x, y, 500, 800))).faults.map((fault) => fault.block);
    expect(moved(900, 300)).toEqual(moved(0, 0));
  });

  test("a band within its rule number is the room of its wires, not an empty block, and a wider one is", () => {
    const row = (gap: number) => board(box("page", "section", null, 0, 0, 1600 + gap, 800), full("a", "page", 0, 0, 800, 800), full("b", "page", 800 + gap, 0, 800, 800));
    expect(blocks(row(200))).toEqual([]);
    // Round 5 cycle 2 took a gutter up to 120 px over its number out as filled.
    expect(plan(row(220)).faults.map((fault) => fault.problem)).toEqual([
      `An empty block of 220 × 800 px sits in the board frame at x 800 to 1020, y 0 to 800: 12% of the frame holds no section, node or sticky. ${LIMIT} ${SPACE_FIXES}`,
    ]);
    // 3 wires across it give the band a number of 240 px: the same 220 px is their room.
    expect(blocks(row(220), [wire("w1", "p", "q", [[750, 100], [1070, 100]]), wire("w2", "p", "q", [[750, 200], [1070, 200]]), wire("w3", "p", "q", [[750, 300], [1070, 300]])])).toEqual([]);
    // A band runs as far as sections lie on both sides of it: the corner of the frame past the shorter section is empty.
    const corner = board(box("page", "section", null, 0, 0, 1800, 1200), full("a", "page", 0, 0, 800, 1200), full("b", "page", 1000, 0, 800, 500));
    expect(blocks(corner)).toEqual(["1000 × 700 px empty at x 800 to 1800, y 500 to 1200, in the board frame (32% of it)"]);
  });

  test("a section its items fill under 35% of is thin: one fault for the section, with its largest block", () => {
    // The room inside the padding and the title band of a 1000 × 800 section is 920 × 680 px.
    const section = (width: number, height: number) => plan(board(box("s", "section", null, 0, 0, 1000, 800), box("n", "rectangle", "s", 40, 80, width, height)));
    expect(section(500, 440).thin).toEqual([]);
    expect(section(500, 430).thin.map((thin) => [thin.id, thin.items, thin.inner, Math.round(thin.fill * 1000)])).toEqual([["s", 1, { width: 920, height: 680 }, 344]]);
    const found = section(280, 100);
    expect(found.blocks.map((block) => block.in)).toEqual(["s"]);
    expect(found.faults).toEqual([{
      kind: "space", key: `["thin","s"]`, ids: ["s"],
      problem: "Section s is 1000 × 800 px and its 1 item fills 4% of the 920 × 680 px inside its padding and title band: the limit is 35%."
        + ` Its largest empty block is 1000 × 620 px at x 0 to 1000, y 180 to 800. ${SPACE_FIXES}`,
      marks: [{ box: { x: 0, y: 180, width: 1000, height: 620 } }],
    }]);
    // A section that holds nothing is an empty block of its parent's plan, not a thin section.
    expect(plan(board(box("s", "section", null, 0, 0, 1000, 800))).thin).toEqual([]);
  });

  test("a frame or a section reports its 4 largest blocks, and a board 4 space faults, the largest first", () => {
    const holes = (id: string, x: number, size: number) => [box(id, "section", "page", x, 0, 600, 3500), ...[0, 1, 2, 3, 4].map((row) => box(`${id}-${row}`, "rectangle", id, x, row * 700 + size, 600, 700 - size))];
    const found = plan(board(box("page", "section", null, 0, 0, 3000, 3500), holes("a", 0, 300), holes("b", 800, 350), holes("c", 1600, 250), full("d", "page", 2400, 0, 600, 700)));
    const count = (holder: string) => found.blocks.filter((block) => block.in === holder).length;
    expect([count("page"), count("a"), count("b"), count("c")]).toEqual([1, 4, 4, 4]);
    expect(found.blocks.slice(0, 5).map((block) => [block.in, `${block.rect.width} × ${block.rect.height}`])).toEqual([
      ["page", "800 × 2800"], ["b", "600 × 350"], ["b", "600 × 350"], ["b", "600 × 350"], ["b", "600 × 350"],
    ]);
    // 2 blocks of one holder share a key: the place of each tells them apart from round to round.
    expect(found.faults.map((fault) => [fault.key, fault.block?.y])).toEqual([[`["empty-block","page"]`, 700], [`["empty-block","b"]`, 0], [`["empty-block","b"]`, 700], [`["empty-block","b"]`, 1400]]);
  });

  test("a board with no frame is measured inside the box round its sections", () => {
    const file = board(full("a", null, 0, 0, 1000, 500), full("b", null, 0, 700, 400, 600));
    expect(emptyBlocks(file, null, gapMeasures(file, reviewUnits(file).units, [], RULE, null)).map((block) => [block.in, blockLine(block)]))
      .toEqual([[null, "600 × 800 px empty at x 400 to 1000, y 500 to 1300, in the board frame (37% of it)"]]);
  });
});

describe("climb gap rule", () => {
  const pair = (gap: number, ...more: BoardObject[]) => board(full("a", null, 0, 0, 300, 400), full("b", null, 300 + gap, 0, 300, 400), more);
  const measure = (file: Board, facts: WireFact[] = []) => gapMeasures(file, reviewUnits(file).units, facts, RULE, null);
  const faults = (file: Board, facts: WireFact[] = []) => measure(file, facts).map((gap) => [gap.a, gap.b, gap.gap, gap.counted.length, gap.need, gap.fault]);

  test("a gap needs 200 px, and 20 px more for each wire after the first that crosses it or runs along it", () => {
    expect(faults(pair(200), [across("w1", 100)])).toEqual([["a", "b", 200, 1, 200, null]]);
    expect(faults(pair(200), [across("w1", 100), across("w2", 200), across("w3", 300)])).toEqual([["a", "b", 200, 3, 240, "under"]]);
    expect(faults(pair(240), [across("w1", 100), across("w2", 200, 790), across("w3", 300, 790)])).toEqual([["a", "b", 240, 3, 240, null]]);
    // A wire along the gutter counts as one that crosses it.
    expect(faults(pair(200), [across("w1", 100), wire("along", "p", "q", [[250, 50], [400, 50], [400, 350], [250, 350]])])).toEqual([["a", "b", 200, 2, 220, "under"]]);
    // A gap no wire uses needs the 200 px too.
    expect(faults(pair(150))).toEqual([["a", "b", 150, 0, 200, "under"]]);
    // A fitted section is off the grid: a gap short by less than one wire's room is no fault.
    expect(faults(pair(184))).toEqual([["a", "b", 184, 0, 200, null]]);
    expect(faults(pair(180))).toEqual([["a", "b", 180, 0, 200, "under"]]);
  });

  test("a label adds 20 px to the room of its wire, and a labelled wire across a side-by-side gap starts the gap from its label leg: 100 px and 10 px a character", () => {
    const calls = labelled("w1", "p", "q", [[250, 100], [550, 100]], "streams the events back", 320, 90);
    expect(measure(pair(200), [calls]).map((gap) => [gap.first, gap.labelled, gap.need, gap.fault])).toEqual([[330, 1, 350, "under"]]);
    expect(measure(pair(200), [labelled("w1", "p", "q", [[250, 100], [550, 100]], "calls", 320, 90)]).map((gap) => [gap.first, gap.labelled, gap.need])).toEqual([[200, 1, 220]]);
    // The chip is not in the gutter: the leg needs no room there, and the label still widens its wire's lane.
    expect(measure(pair(200), [labelled("w1", "p", "q", [[250, 100], [550, 100]], "streams the events back", 20, 90)]).map((gap) => [gap.first, gap.labelled, gap.need])).toEqual([[200, 1, 220]]);
    // 3 wires, 2 with a label: 200 + 2 × 20 + 2 × 20.
    expect(faults(pair(280), [across("w1", 100, 630), labelled("w2", "p", "q", [[250, 200], [630, 200]], "ok", 20, 190), labelled("w3", "p", "q", [[250, 300], [630, 300]], "no", 20, 290)]))
      .toEqual([["a", "b", 280, 3, 280, null]]);
  });

  test("a band between 2 rows counts every wire that crosses it or runs along it, whichever pair of sections it joins", () => {
    // a and b in a row over c: w1 crosses the band under a and w2 under b, and a wire from a to b that drops into the band runs along it.
    const file = board(full("a", null, 0, 0, 300, 400), full("b", null, 500, 0, 300, 400), full("c", null, 0, 600, 800, 400));
    const down = (id: string, from: string, x: number) => wire(id, from, "c-n", [[x, 400], [x, 600]]);
    const round = (id: string, y: number) => wire(id, "a-n", "b-n", [[150, 400], [150, y], [650, y], [650, 400]]);
    const found = plan(file, [down("w1", "a-n", 100), down("w2", "b-n", 600), round("w3", 500), round("w4", 540)]);
    expect(found.gaps.map((gap) => [gap.a, gap.b, gap.side, gap.band, gap.counted, gap.need, gap.fault])).toEqual([
      ["a", "b", "side by side", { x: 300, y: 0, width: 200, height: 400 }, [], 200, null],
      ["a", "c", "stacked", { x: 0, y: 400, width: 800, height: 200 }, ["w1", "w2", "w3", "w4"], 260, "under"],
      ["b", "c", "stacked", { x: 0, y: 400, width: 800, height: 200 }, ["w1", "w2", "w3", "w4"], 260, "under"],
    ]);
    // The 2 gaps under their number share the band: one fault, with the sections of both.
    expect(found.bands.map(({ worst, sections }) => [worst.a, worst.b, sections])).toEqual([["a", "c", ["a", "c", "b"]]]);
    expect(found.faults).toEqual([{
      kind: "wire", key: `["band","stacked","board"]`, block: { x: 0, y: 400, width: 800, height: 200 }, ids: ["a", "c", "b", "w1", "w2", "w3", "w4"],
      problem: "The band between a and b (above) and c (below), y 400 to 600, is 200 px wide and 4 wires cross it or run along it: w1, w2, w3, w4."
        + " The gap rule asks 260 px for them (200 px, plus 20 px for each wire after the first), so the band is 60 px too narrow",
      facts: "the band is 200 px wide now with 4 wires, and it needs 260 px",
      marks: [{ box: { x: 0, y: 400, width: 800, height: 200 } }],
    }]);
    // The drawer widens the band by 20 px: the same fault, with new numbers. At 260 px it is gone.
    const lower = (gap: number) => plan(
      board(full("a", null, 0, 0, 300, 400), full("b", null, 500, 0, 300, 400), full("c", null, 0, 400 + gap, 800, 400)),
      [wire("w1", "a-n", "c-n", [[100, 400], [100, 400 + gap]]), wire("w2", "b-n", "c-n", [[600, 400], [600, 400 + gap]]), round("w3", 500), round("w4", 540)],
    );
    expect(lower(220).faults.map((fault) => [fault.key, fault.facts])).toEqual([[`["band","stacked","board"]`, "the band is 220 px wide now with 4 wires, and it needs 260 px"]]);
    expect(lower(260).faults).toEqual([]);
    // 2 wires that cross one band at 2 pairs are 2 wires of the band: each pair alone would pass at 200 px.
    const rows = board(full("a", null, 0, 0, 300, 400), full("b", null, 500, 0, 300, 400), full("c", null, 0, 600, 300, 400), full("d", null, 500, 600, 300, 400));
    const straight = [wire("w1", "a-n", "c-n", [[100, 400], [100, 600]]), wire("w2", "b-n", "d-n", [[600, 400], [600, 600]])];
    expect(plan(rows, straight).gaps.filter((gap) => gap.side === "stacked").map((gap) => [gap.a, gap.b, gap.counted, gap.need, gap.fault]))
      .toEqual([["a", "c", ["w1", "w2"], 220, "under"], ["b", "d", ["w1", "w2"], 220, "under"]]);
  });

  test("a gap is too wide past its number + 120 px when nothing sits in it", () => {
    expect(faults(pair(320))).toEqual([["a", "b", 320, 0, 200, null]]);
    expect(faults(pair(321))).toEqual([["a", "b", 321, 0, 200, "over"]]);
    expect(faults(pair(361), [across("w1", 100, 700), across("w2", 200, 700), across("w3", 300, 700)])).toEqual([["a", "b", 361, 3, 240, "over"]]);
    // A loose node or a sticky in the gutter uses the room.
    expect(faults(pair(500, box("note", "sticky", null, 350, 100, 200, 100)))).toEqual([["a", "b", 500, 0, 200, null]]);
  });

  test("the gaps of one row share the number of its widest pair: one arrange call sets them all", () => {
    const row = (gap: number) => board(full("a", null, 0, 0, 300, 400), full("b", null, 540, 0, 300, 400), full("c", null, 840 + gap, 0, 300, 400));
    const wires = [across("w1", 100, 590), across("w2", 200, 590), across("w3", 300, 590)];
    expect(measure(row(360), wires).map((gap) => [gap.a, gap.b, gap.need, gap.lineNeed, gap.fault])).toEqual([["a", "b", 240, 240, null], ["b", "c", 200, 240, null]]);
    expect(measure(row(361), wires).map((gap) => gap.fault)).toEqual([null, "over"]);
    expect(gapLine(measure(row(361), wires)[1]!)).toBe(
      "b ↔ c · side by side · gap 361 px · gutter x 840 to 1201, y 0 to 400 · band y 0 to 400 · 0 wires cross it or run along its band · 0 label chips in it"
      + " · rule number 200 px (its row's widest pair: 240 px) · OVER its number + 120 by 1 px");
  });

  test("the rule is for sections that share a parent: a subsection and a section outside its parent are not measured", () => {
    const file = board(box("outer", "section", null, 0, 0, 400, 400), full("inner", "outer", 100, 0, 300, 400), full("c", null, 450, 0, 300, 400));
    expect(faults(file, [across("w1", 100, 500)])).toEqual([["outer", "c", 50, 1, 200, "under"]]);
  });

  test("the rule sets the gaps of the sections in the board frame: a gap inside a section is listed with no fault", () => {
    // 2 subsections 80 px apart with a wire between them, as `arrange_section` leaves them.
    const nested = plan(board(
      box("page", "section", null, 0, 0, 1180, 400), box("group", "section", "page", 0, 0, 680, 400),
      full("s1", "group", 0, 0, 300, 400), full("s2", "group", 380, 0, 300, 400), full("c", "page", 880, 0, 300, 400),
    ), [across("w1", 100, 430)]);
    expect(nested.gaps.map((gap) => [gap.a, gap.b, gap.gap, gap.ruled, gap.fault])).toEqual([["group", "c", 200, true, null], ["s1", "s2", 80, false, null]]);
    expect(gapLine(nested.gaps[1]!)).toBe(
      "s1 ↔ s2 · side by side · gap 80 px · gutter x 300 to 380, y 0 to 400 · band y 0 to 400 · 1 wire crosses it or runs along its band · 0 label chips in it"
      + " · inside section group: `arrange_section` sets it, not the gap rule");
    expect(nested.faults).toEqual([]);
  });

  test("a gap too wide is a fault of its own when no empty block covers it", () => {
    // 2 sections 300 px high: the 330 px gutter between them is 99 000 px², too small for a block.
    const low = board(full("a", null, 0, 0, 1000, 300), full("b", null, 1330, 0, 1000, 300));
    expect(plan(low).blocks).toEqual([]);
    expect(plan(low).faults.map((fault) => [fault.kind, fault.key, fault.problem])).toEqual([[
      "space", `["gap","over",["a","b"]]`,
      "The gap between a and b (side by side) is 330 px wide and 0 wires cross it or run along its band: the gap rule asks 200 px, so it is 130 px wider than its number, and the limit is 120 px wider",
    ]]);
    // 800 px high, the same gap is an empty block, and that is the one fault.
    const high = board(full("a", null, 0, 0, 1000, 800), full("b", null, 1330, 0, 1000, 800));
    expect(plan(high).faults.map((fault) => fault.key)).toEqual([`["empty-block","board"]`]);
  });
});

describe("climb wires between sections", () => {
  /** 3 sections in a row, the last `far` px from the first: a wire from a to b passes m. */
  const row = (far: number) => board(full("a", null, 0, 0, 300, 400), full("m", null, 500, 0, 300, 400), full("b", null, far, 0, 300, 400));

  test("a wire through a section that holds neither of its ends is a wire fault, with the section, the wire and its length", () => {
    const straight = wire("w", "a-n", "b-n", [[300, 200], [1000, 200]]);
    const found = plan(row(1000), [straight]);
    expect(found.links.map((link) => [link.a, link.b, link.neighbours, link.between, link.through])).toEqual([["a", "b", false, ["m"], ["m"]]]);
    expect(found.faults).toEqual([{
      kind: "wire", key: `["through","m"]`, ids: ["m", "w"],
      problem: "1 wire runs through section m, which holds neither end of it: w (a → b, 700 px)",
      facts: "w is 700 px now, a → b, not neighbours: m lies between them; it runs through m; by section centres, a swap of a and m saves about 500 px of wire between sections",
      marks: [{ box: { x: 500, y: 0, width: 300, height: 400 } }, { path: [[300, 200], [1000, 200]] }],
    }]);
    // A wire that ends in the section, or in a subsection of it, runs through nothing.
    expect(plan(row(1000), [wire("w", "a-n", "m-n", [[300, 200], [650, 200]])]).faults).toEqual([]);
  });

  test("a wire through 2 sections is a fault of each, and a wire that joins no 2 sections is read as well", () => {
    const through = (file: Board, facts: WireFact[]) => plan(file, facts).faults.filter((fault) => fault.key.startsWith(`["through"`)).map((fault) => [fault.key, fault.ids, fault.problem]);
    const two = board(full("a", null, 0, 0, 300, 400), full("m1", null, 500, 0, 300, 400), full("m2", null, 1000, 0, 300, 400), full("b", null, 1500, 0, 300, 400));
    expect(through(two, [wire("w", "a-n", "b-n", [[300, 200], [1500, 200]])])).toEqual([
      [`["through","m1"]`, ["m1", "w"], "1 wire runs through section m1, which holds neither end of it: w (a → b, 1200 px)"],
      [`["through","m2"]`, ["m2", "w"], "1 wire runs through section m2, which holds neither end of it: w (a → b, 1200 px)"],
    ]);
    // A loose node past m: the wire from a to it joins no 2 sections, and it runs through m.
    const loose = board(row(1300).objects, box("note", "rectangle", null, 1000, 100, 200, 200));
    const found = plan(loose, [wire("w", "a-n", "note", [[300, 200], [1000, 200]])]);
    expect(found.links).toEqual([]);
    expect(found.faults.filter((fault) => fault.kind === "wire")).toEqual([{
      kind: "wire", key: `["through","m"]`, ids: ["m", "w"],
      problem: "1 wire runs through section m, which holds neither end of it: w (a-n → note, 700 px)",
      facts: "w is 700 px now, a-n → note; it runs through m",
      marks: [{ box: { x: 500, y: 0, width: 300, height: 400 } }, { path: [[300, 200], [1000, 200]] }],
    }]);
    // The loop reads it as a wire of m: a move of m earns a decline of a finding on it.
    expect(found.layout.holders.w).toEqual(["a", "m"]);
    expect(found.layout.wires.w).toBe("w is 700 px now, a-n → note; it runs through m");
    // 2 nodes of one section, and the wire between them leaves it and runs through m.
    const inside = board(row(1000).objects, box("a-2", "rectangle", "a", 100, 300, 100, 60));
    expect(through(inside, [wire("w", "a-n", "a-2", [[300, 200], [650, 200], [650, 330], [200, 330]])])).toEqual([
      [`["through","m"]`, ["m", "w"], expect.stringContaining("w (a-n → a-2, ")],
    ]);
  });

  test("a wire over 1500 px between sections that are not neighbours is a wire fault, and a long wire between neighbours is not", () => {
    const over = wire("w", "a-n", "b-n", [[150, 0], [150, -100], [2150, -100], [2150, 0]]);
    expect(plan(row(2000), [over]).faults.filter((fault) => fault.kind === "wire")).toEqual([{
      kind: "wire", key: `["long",["a","b"]]`, ids: ["a", "b", "w"],
      problem: "1 wire over 1500 px joins sections a and b, which are not neighbours (m lies between them): w (2200 px)",
      facts: "w is 2200 px now, a → b, not neighbours: m lies between them; by section centres, a swap of b and m saves about 1500 px of wire between sections",
      marks: [{ path: [[150, 0], [150, -100], [2150, -100], [2150, 0]] }],
    }]);
    // 1500 px is no fault, and a wire of any length between 2 sections that face each other is none.
    expect(plan(row(1300), [wire("w", "a-n", "b-n", [[150, 0], [150, -100], [1450, -100], [1450, 0]])]).faults.filter((fault) => fault.kind === "wire")).toEqual([]);
    const detour = wire("w", "a-n", "m-n", [[150, 0], [150, -700], [650, -700], [650, 0]]);
    expect(detour.length).toBeGreaterThan(FAR_WIRE_PX);
    expect(plan(row(1000), [detour]).faults).toEqual([]);
  });

  test("the layout facts name the sections of each item, and of each wire the sections between its ends and under it", () => {
    const { layout } = plan(board(row(1000).objects.map((object) => object.id === "m" ? { ...object, text: "Middle" } : object)), [wire("w", "a-n", "b-n", [[300, 200], [1000, 200]]), wire("short", "a-n", "m-n", [[300, 100], [500, 100]])]);
    expect(layout.sections).toEqual({ a: "", m: "Middle", b: "" });
    expect(layout.holders).toEqual({ a: ["a"], "a-n": ["a"], m: ["m"], "m-n": ["m"], b: ["b"], "b-n": ["b"], w: ["a", "b", "m"], short: ["a", "m"] });
    // A wire between neighbours that crosses nothing and is short has no fault of where the sections sit.
    expect(Object.keys(layout.wires)).toEqual(["w"]);
    expect(layout.wires.w).toStartWith("w is 700 px now, a → b, not neighbours: m lies between them; it runs through m");
  });
});
