import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import { loadReviewCanvas } from "./critic.ts";
import { box, labelled, wire } from "./fixtures/review/stubs.ts";
import { reviewUnits, type Board, type BoardObject } from "./review-inputs.ts";
import { blockLine, computedFaults, emptyBlocks, gapLine, gapMeasures, gapRule, planOf, type GapRule } from "./space.ts";
import { wireFacts, type WireFact } from "./wires.ts";

/** The gap rule of topic `rules` when round 5 ran. */
const RULE: GapRule = { base: 200, perWire: 20, labelBase: 100, labelPerCharacter: 10 };

/** A section with one node that fills it: its inside holds no empty block. */
const full = (id: string, parent: string | null, x: number, y: number, width: number, height: number): BoardObject[] =>
  [box(id, "section", parent, x, y, width, height), box(`${id}-n`, "rectangle", id, x, y, width, height)];
const board = (...objects: Array<BoardObject | BoardObject[]>): Board => ({ objects: objects.flat(), connections: [] });
const plan = (file: Board, facts: WireFact[] = []) => planOf(file, facts, RULE);
const blocks = (file: Board, facts: WireFact[] = []) => plan(file, facts).blocks.map(blockLine);
/** A straight wire from x 250 to `toX` at height `y`. */
const across = (id: string, y: number, toX = 550) => wire(id, "p", "q", [[250, y], [toX, y]]);

describe("climb empty blocks on the boards of round 5", () => {
  /** A final board of round 5 cycle 1 (rounds/r5-a), as the judges saw it. */
  const measured = async (name: string) => {
    const canvas = await loadReviewCanvas();
    const file = canvas.toolkit.openCanvasFile(resolve(import.meta.dir, "fixtures/space", `${name}.canvas.json`));
    const rule = gapRule(canvas.wires);
    return { rule, plan: planOf(file.persisted as Board, wireFacts(canvas.wires, file), rule) };
  };

  test("board 08: the 1460 × 580 block under its sections is found, and no gap is off its number", async () => {
    const { rule, plan: found } = await measured("r5a-08");
    expect(rule).toEqual(RULE);
    expect(found.blocks.map(blockLine)).toEqual([
      "1460 × 580 px empty at x 920 to 2380, y 1200 to 1780, in the board frame (21% of it)",
      "840 × 320 px empty at x 1540 to 2380, y 20 to 340, in the board frame (7% of it)",
    ]);
    expect(found.gaps.map((gap) => gap.fault)).toEqual([null, null, null, null, null, null]);
    expect(found.faults.map((fault) => fault.problem)).toEqual([
      "An empty block of 1460 × 580 px sits in the board frame at x 920 to 2380, y 1200 to 1780: 21% of the frame holds no section, node or sticky. The limit is 400 × 400 px, or 5% of the frame",
      "An empty block of 840 × 320 px sits in the board frame at x 1540 to 2380, y 20 to 340: 7% of the frame holds no section, node or sticky. The limit is 400 × 400 px, or 5% of the frame",
    ]);
  });

  test("board 05: the empty column is found, a block in a section too, and the gap too wide is the block that covers it", async () => {
    const { plan: found } = await measured("r5a-05");
    expect(found.blocks.map(blockLine)).toEqual([
      "720 × 840 px empty at x 60 to 780, y 560 to 1400, in the board frame (10% of it)",
      "416 × 1168 px empty at x 2180 to 2596, y 1080 to 2248, in the board frame (8% of it)",
      "712 × 320 px empty at x 1848 to 2560, y 20 to 340, inside section sec-contract (24% of it)",
    ]);
    expect(found.gaps.filter((gap) => gap.fault).map((gap) => [gap.a, gap.b, gap.side, gap.gap, gap.counted.length, gap.need, gap.fault])).toEqual([
      ["sec-engine", "sec-contract", "side by side", 340, 2, 370, "under"],
      ["sec-engine", "sec-events", "stacked", 840, 1, 200, "over"],
    ]);
    // 4 findings: the 3 blocks and the gap too narrow. The 840 px gap is the 720 × 840 block.
    expect(found.faults.map((fault) => [fault.key, fault.ids])).toEqual([
      [`["empty-block","page-frame"]`, ["page-frame"]],
      [`["empty-block","page-frame"]`, ["page-frame"]],
      [`["empty-block","sec-contract"]`, ["sec-contract"]],
      [`["gap","under",["sec-contract","sec-engine"]]`, ["sec-engine", "sec-contract"]],
    ]);
    expect(found.faults[3]!.problem).toStartWith("The gap between sec-engine and sec-contract (side by side) is 340 px wide and 2 wires cross it or run along it: the gap rule asks 370 px, so it is 30 px too narrow");
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
    expect(blocks(page(box("note", "sticky", "page", 1200, 500, 700, 400)))).toEqual([]);
    expect(blocks(page(box("key", "rectangle", "page", 1200, 500, 700, 400)))).toEqual([]);
  });

  test("the limit in the frame is 400 × 400 px, or 5% of the frame for a block that is no thin strip", () => {
    const left = (width: number, height: number) => blocks(page(box("note", "sticky", "page", 1000 + width, 400, 1000 - width, 600), box("low", "sticky", "page", 1000, 400 + height, width, 600 - height)));
    // 400 × 400 is 8% of this frame, so its share alone reports it.
    expect(left(400, 400)).toEqual(["400 × 400 px empty at x 1000 to 1400, y 400 to 800, in the board frame (8% of it)"]);
    // A frame of 4000 × 2000 px with one empty corner: 5% of it is 400 000 px².
    const corner = (width: number, height: number) => blocks(board(
      box("page", "section", null, 0, 0, 4000, 2000), full("a", "page", 0, 0, 4000, 500), full("b", "page", width, 500, 4000 - width, 1500),
      height < 1500 ? full("c", "page", 0, 500 + height, width, 1500 - height) : [],
    ));
    expect(corner(400, 400)).toEqual([]);
    expect(corner(420, 420)).toEqual(["420 × 420 px empty at x 0 to 420, y 500 to 920, in the board frame (2% of it)"]);
    // A strip 300 px wide is a margin however long it is, and one of 320 px is a block.
    expect(corner(300, 1500)).toEqual([]);
    expect(corner(320, 1500)).toEqual(["320 × 1500 px empty at x 0 to 320, y 500 to 2000, in the board frame (6% of it)"]);
  });

  test("a gutter within its rule number is the room of its wires, not an empty block, and a gap too wide is one", () => {
    const row = (gap: number) => board(box("page", "section", null, 0, 0, 1600 + gap, 800), full("a", "page", 0, 0, 800, 800), full("b", "page", 800 + gap, 0, 800, 800));
    expect(blocks(row(320))).toEqual([]);
    expect(plan(row(420)).faults.map((fault) => fault.problem)).toEqual([
      "An empty block of 420 × 800 px sits in the board frame at x 800 to 1220, y 0 to 800: 21% of the frame holds no section, node or sticky. The limit is 400 × 400 px, or 5% of the frame",
    ]);
    // A sticky in a gap too wide fills its own box, not the gutter: the rest of the gap is a block.
    const noted = board(row(700).objects, box("note", "sticky", "page", 900, 0, 200, 100));
    expect(plan(noted).gaps.map((gap) => gap.fault)).toEqual([null]);
    expect(blocks(noted)).toEqual(["700 × 700 px empty at x 800 to 1500, y 100 to 800, in the board frame (27% of it)"]);
  });

  test("a block inside a section is found past 400 × 300 px, either way up", () => {
    const section = (...nodes: BoardObject[]) => blocks(board(box("s", "section", null, 0, 0, 1000, 800), nodes));
    expect(section(box("n", "rectangle", "s", 0, 0, 500, 800))).toEqual(["500 × 800 px empty at x 500 to 1000, y 0 to 800, inside section s (50% of it)"]);
    expect(section(box("n", "rectangle", "s", 0, 0, 1000, 480))).toEqual(["1000 × 320 px empty at x 0 to 1000, y 480 to 800, inside section s (40% of it)"]);
    expect(section(box("n", "rectangle", "s", 0, 0, 690, 800))).toEqual(["310 × 800 px empty at x 690 to 1000, y 0 to 800, inside section s (31% of it)"]);
    // 300 px on its short side, and 400 px on its long side.
    expect(section(box("n", "rectangle", "s", 0, 0, 700, 800))).toEqual([]);
    expect(section(box("n", "rectangle", "s", 0, 0, 600, 800), box("m", "rectangle", "s", 600, 400, 400, 400))).toEqual([]);
    // A subsection fills its parent, and its own inside is measured too.
    expect(section(box("n", "rectangle", "s", 0, 0, 500, 800), box("sub", "section", "s", 500, 0, 500, 800)))
      .toEqual(["500 × 800 px empty at x 500 to 1000, y 0 to 800, inside section sub (100% of it)"]);
  });

  test("a frame or a section reports its 2 largest blocks, and a board 4: the frame's first, then the largest", () => {
    const holes = (id: string, x: number, size: number) => [box(id, "section", "page", x, 0, 600, 2100), ...[0, 1, 2].map((row) => box(`${id}-${row}`, "rectangle", id, x, row * 700 + size, 600, 700 - size))];
    const found = plan(board(box("page", "section", null, 0, 0, 3000, 2100), holes("a", 0, 500), holes("b", 800, 600), holes("c", 1600, 400), full("d", "page", 2400, 0, 600, 700)));
    expect(found.blocks.map((block) => [block.in, `${block.rect.width} × ${block.rect.height}`])).toEqual([
      ["page", "800 × 1400"], ["b", "600 × 600"], ["b", "600 × 600"], ["a", "600 × 500"],
    ]);
    // 2 blocks of one holder share a key: the place of each tells them apart from round to round.
    expect(found.faults.map((fault) => [fault.key, fault.block?.y])).toEqual([[`["empty-block","page"]`, 700], [`["empty-block","b"]`, 0], [`["empty-block","b"]`, 700], [`["empty-block","a"]`, 0]]);
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
  });

  test("a labelled wire across a side-by-side gap needs 100 px and 10 px a character of its label", () => {
    const calls = labelled("w1", "p", "q", [[250, 100], [550, 100]], "streams the events back", 320, 90);
    expect(faults(pair(200), [calls])).toEqual([["a", "b", 200, 1, 330, "under"]]);
    expect(faults(pair(200), [labelled("w1", "p", "q", [[250, 100], [550, 100]], "calls", 320, 90)])).toEqual([["a", "b", 200, 1, 200, null]]);
    // The chip is not in the gutter: the label needs no room there.
    expect(faults(pair(200), [labelled("w1", "p", "q", [[250, 100], [550, 100]], "streams the events back", 20, 90)])).toEqual([["a", "b", 200, 1, 200, null]]);
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
      "b ↔ c · side by side · gap 361 px · gutter x 840 to 1201, y 0 to 400 · 0 wires cross it or run along it · 0 label chips in it · rule number 200 px (its row's widest pair: 240 px) · OVER its number + 120 by 1 px");
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
      "s1 ↔ s2 · side by side · gap 80 px · gutter x 300 to 380, y 0 to 400 · 1 wire crosses it or runs along it · 0 label chips in it · inside section group: `arrange_section` sets it, not the gap rule");
    expect(nested.faults).toEqual([]);
  });

  test("a gap off its number is a fault with its numbers, and its key holds no number", () => {
    const narrow = plan(pair(200), [across("w1", 100), across("w2", 200), across("w3", 300)]);
    expect(narrow.faults).toEqual([{
      key: `["gap","under",["a","b"]]`, ids: ["a", "b"],
      problem: "The gap between a and b (side by side) is 200 px wide and 3 wires cross it or run along it: the gap rule asks 240 px, so it is 40 px too narrow",
      marks: [{ box: { x: 300, y: 0, width: 200, height: 400 } }],
    }]);
    expect(narrow.faults[0]!.block).toBeUndefined();
    // The drawer widens it by 20 px: the same fault, with new numbers.
    const wider = plan(pair(220), [across("w1", 100, 570), across("w2", 200, 570), across("w3", 300, 570)]);
    expect(wider.faults.map((fault) => [fault.key, fault.problem])).toEqual([
      [`["gap","under",["a","b"]]`, "The gap between a and b (side by side) is 220 px wide and 3 wires cross it or run along it: the gap rule asks 240 px, so it is 20 px too narrow"],
    ]);
    expect(plan(pair(240), [across("w1", 100, 590), across("w2", 200, 590), across("w3", 300, 590)]).faults).toEqual([]);
  });

  test("a gap too wide is a fault of its own when no empty block covers it", () => {
    // 2 sections 300 px high: the 330 px gutter between them is too low for a block.
    const low = board(full("a", null, 0, 0, 1000, 300), full("b", null, 1330, 0, 1000, 300));
    expect(plan(low).blocks).toEqual([]);
    expect(plan(low).faults.map((fault) => [fault.key, fault.problem])).toEqual([[
      `["gap","over",["a","b"]]`,
      "The gap between a and b (side by side) is 330 px wide and 0 wires cross it or run along it: the gap rule asks 200 px, so it is 130 px wider than its number, and the limit is 120 px wider",
    ]]);
    // 800 px high, the same gap is an empty block, and that is the one fault.
    const high = board(full("a", null, 0, 0, 1000, 800), full("b", null, 1330, 0, 1000, 800));
    expect(computedFaults(plan(high).blocks, plan(high).gaps).map((fault) => fault.key)).toEqual([`["empty-block","board"]`]);
  });
});
