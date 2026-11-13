import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import { loadReviewCanvas } from "./critic.ts";
import { box, labelled, wire } from "./fixtures/review/stubs.ts";
import { reviewUnits, type Board, type BoardObject } from "./review-inputs.ts";
import { EMPTY_BLOCK, FAR_WIRE_PX, SPACE_FIXES, blockLine, emptyBlocks, gapLine, gapMeasures, gapRule, planOf, type GapRule } from "./space.ts";
import { wireFacts, type WireFact } from "./wires.ts";

/** The band rule of topic `rules` in round 5 cycle 4. */
const RULE: GapRule = { base: 200, perWire: 20, labelBase: 100, labelPerCharacter: 10, labelVertical: 120, slack: 120, needMax: 400, padding: 40 };
const LIMIT = "The limit is 120,000 px² with a short side of 200 px.";

/** A section with one node that fills it: its inside holds no empty block. */
const full = (id: string, parent: string | null, x: number, y: number, width: number, height: number): BoardObject[] =>
  [box(id, "section", parent, x, y, width, height), box(`${id}-n`, "rectangle", id, x, y, width, height)];
const board = (...objects: Array<BoardObject | BoardObject[]>): Board => ({ objects: objects.flat(), connections: [] });
const plan = (file: Board, facts: WireFact[] = []) => planOf(file, facts, RULE);
const blocks = (file: Board, facts: WireFact[] = []) => plan(file, facts).blocks.map(blockLine);
/** A straight wire from x 250 to `toX` at height `y`: it crosses a band there, and runs along none. */
const across = (id: string, y: number, toX = 550) => wire(id, "p", "q", [[250, y], [toX, y]]);
/** `n` wires from section a to section b that each run down the band at x 320, 340 and so on, from y 50 to y 350. */
const lanes = (n: number, toX = 550) => Array.from({ length: n }, (_, i) => wire(`l${i + 1}`, "a-n", "b-n", [[250, 50], [320 + 20 * i, 50], [320 + 20 * i, 350], [toX, 350]]));

describe("climb computed checks on final boards of round 5", () => {
  /** A final board of round 5 cycle 2 (r5b) or cycle 3 (r5c), as the judges saw it. */
  const measured = async (name: string) => {
    const canvas = await loadReviewCanvas();
    const file = canvas.toolkit.openCanvasFile(resolve(import.meta.dir, "fixtures/space", `${name}.canvas.json`));
    const rule = gapRule(canvas.wires);
    return planOf(file.persisted as Board, wireFacts(canvas.wires, file), rule);
  };
  /** Each band the rule sets: its 2 sections, its width, its lanes, its need, the most it may be and its fault. */
  const bands = (found: Awaited<ReturnType<typeof measured>>) => found.gaps.filter((gap) => gap.ruled).map((gap) => [gap.a, gap.b, gap.gap, gap.wires.length, gap.need, gap.most, gap.fault]);
  const kinds = (found: Awaited<ReturnType<typeof measured>>) => found.faults.map((fault) => fault.key);

  test("the band rule reads the engine's numbers, and the runner's limits are the engine's", async () => {
    const { wires } = await loadReviewCanvas();
    expect(gapRule(wires)).toEqual(RULE);
    expect(wires.rules.EMPTY_BLOCK).toEqual({ area: EMPTY_BLOCK.area, side: EMPTY_BLOCK.short });
    expect(wires.rules.LONG_WIRE).toBe(FAR_WIRE_PX);
  });

  test("board 03 of cycle 3: its 2 bands of 224 and 216 px are legal, and the board has no finding", async () => {
    const found = await measured("r5c-03");
    expect(bands(found)).toEqual([["piece3", "piece2", 224, 0, 200, 320, null], ["piece2", "piece1", 216, 0, 200, 320, null]]);
    expect(found.faults).toEqual([]);
  });

  test("board 10 of cycle 3: the band of 220 px under archon is legal and no empty block, and no finding names it", async () => {
    const found = await measured("r5c-10");
    expect(bands(found)).toEqual([["archon", "kernel", 220, 0, 200, 320, null]]);
    const band = found.gaps.find((gap) => gap.ruled)!.gutter;
    // The band is 820 × 220 px: 180,400 px², over the limit of an empty block.
    expect(band.width * band.height).toBeGreaterThan(EMPTY_BLOCK.area);
    expect(found.blocks.filter((block) => block.rect.y < band.y + band.height && block.rect.y + block.rect.height > band.y && block.rect.x < band.x + band.width && block.rect.x + block.rect.width > band.x)).toEqual([]);
    expect(kinds(found)).toEqual([`["empty-block","page-frame"]`, `["empty-block","page-frame"]`]);
  });

  test("board 09 of cycle 3: the 11 wires that cross the band of 820 px are no lanes, 4 wires run along it, and it reads 240 px too wide", async () => {
    const found = await measured("r5c-09");
    expect(bands(found)).toEqual([["sec-kernel", "sec-archon", 820, 4, 460, 580, "over"], ["sec-archon", "sec-gaps", 200, 0, 200, 320, null]]);
    expect(found.gaps[0]!.chips).toBe(11);
    expect(found.faults.at(-1)).toEqual({
      kind: "space", key: `["gap","over",["sec-archon","sec-kernel"]]`, ids: ["sec-kernel", "sec-archon"],
      problem: "The band between sec-kernel and sec-archon (side by side), x 520 to 1340, y 280 to 2304, is 820 px wide and 4 wires run along it (w-model, w-manager, w-trace, w-state):"
        + " it needs 460 px (400 px for the longest label leg in it, plus 20 px for each lane after the first) and is legal to 580 px, so it is 240 px too wide."
        + " Move one of the 2 sections in. A wire that only crosses a band takes no width",
      marks: [{ box: { x: 520, y: 280, width: 820, height: 2024 } }],
    });
    // The band has its one finding: no empty block lies on it.
    expect(found.blocks.filter((block) => block.rect.x < 1340 && block.rect.x + block.rect.width > 520 && block.rect.y < 2304)).toEqual([]);
  });

  test("board 14 of cycle 3: 3 sections in a column face svc across one gap of 540 px, the widest need of the strip sets it, and the corner of 2 bands is no empty block", async () => {
    const found = await measured("r5c-14");
    expect(bands(found)).toEqual([
      ["cc", "dev01", 200, 0, 200, 320, null], ["cc", "daytona", 400, 0, 200, 550, null], ["cc", "svc", 540, 5, 430, 550, null], ["dev01", "rec01", 200, 0, 200, 320, null],
      ["dev01", "svc", 540, 3, 350, 550, null], ["rec01", "svc", 540, 1, 310, 550, null], ["daytona", "svc", 340, 1, 200, 320, "over"], ["svc", "nas", 720, 9, 510, 630, "over"],
    ]);
    // Cycle 3 read 540 × 340 px at x 960 to 1500, y 460 to 800 as an empty block: the corner where the band beside cc meets the band under daytona.
    expect(found.blocks.filter((block) => block.frame).map(blockLine)).toEqual(["1352 × 780 px empty at x 2148 to 3500, y 20 to 800, in the board frame (11% of it)"]);
    expect(gapLine(found.gaps.find((gap) => gap.a === "rec01" && gap.b === "svc")!, RULE)).toBe(
      "rec01 ↔ svc · side by side · gap 540 px · band x 960 to 1500, y 2340 to 2660 · 1 wire runs along it (w_rec) · 1 label chip in it"
      + " · needs 310 px, legal to 550 px (a band of its strip needs more) · inside its legal width");
  });

  test("board h1 of cycle 2: the wire through sec-runner and the far wires, a section a wire runs through and a far wire in turn", async () => {
    const found = await measured("r5b-h1");
    expect(found.links.filter((link) => link.through.length).map((link) => [link.fact.id, link.through])).toEqual([["w-treespend", ["sec-runner"]]]);
    expect(found.links.filter((link) => link.fact.length > FAR_WIRE_PX && !link.neighbours).map((link) => [link.fact.id, link.fact.length, link.between]))
      .toEqual([["w-replay", 4216, ["sec-control", "sec-runner"]], ["w-treespend", 1637, ["sec-runner"]], ["w-continue", 3176, []]]);
    // Cycle 3 read 4 of its bands as too narrow: it counted the wires that cross them.
    expect(bands(found).filter((band) => band.at(-1) === "under")).toEqual([]);
    expect(found.faults.filter((fault) => fault.kind === "wire").map((fault) => [fault.key, fault.number])).toEqual([
      [`["through","sec-runner"]`, 1], [`["long",["sec-client","sec-durable"]]`, 4216], [`["long",["sec-life","sec-runner"]]`, 3176], [`["long",["sec-control","sec-tree"]]`, 1637],
    ]);
    const wires = found.faults.filter((fault) => fault.kind === "wire");
    expect(wires[0]!.problem).toBe("1 wire runs through section sec-runner, which holds neither end of it: w-treespend (sec-tree → sec-control, 1637 px)");
    expect(wires[0]!.ids).toEqual(["sec-runner", "w-treespend"]);
    expect(wires[1]!.problem).toBe("1 wire over 1500 px joins sections sec-client and sec-durable, which are not neighbours (sec-control and sec-runner lie between them): w-replay (4216 px)");
    expect(wires[1]!.facts).toBe(
      "w-replay is 4216 px now, sec-client → sec-durable, not neighbours: sec-control and sec-runner lie between them;"
      + " by section centres, a swap of sec-client and sec-life saves about 520 px of wire between sections");
  });

  test("board h6 of cycle 2: 3 nodes fill 29% of section ret_ev, and its empty block is that fault, not a second one", async () => {
    const found = await measured("r5b-h6");
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

  test("a block of the board frame that no section or loose node fills is found with its size, its place and its share of the frame", () => {
    expect(blocks(page())).toEqual(["1000 × 600 px empty at x 1000 to 2000, y 400 to 1000, in the board frame (30% of it)"]);
    // A wire fills nothing: the block stays with a wire through it.
    expect(blocks(page(), [wire("w", "a-n", "b-n", [[900, 700], [1900, 700], [1900, 400]])])).toEqual(blocks(page()));
    // A loose node fills space as a section does.
    expect(blocks(page(box("store", "rectangle", "page", 1000, 500, 900, 400)))).toEqual([]);
  });

  test("a sticky fills no space: a note or the key moved into an empty block leaves the block, in the frame and in a section", () => {
    // Round 5 cycle 3, board 03: the drawer moved 2 notes and the key into gaps, and 3 findings closed.
    expect(blocks(page(box("note", "sticky", "page", 1000, 500, 900, 400), box("key", "sticky", "page", 1100, 420, 300, 60)))).toEqual(blocks(page()));
    const section = (...more: BoardObject[]) => blocks(board(box("s", "section", null, 0, 0, 1000, 800), box("n", "rectangle", "s", 0, 0, 500, 800), more));
    expect(section(box("note", "sticky", "s", 520, 20, 460, 760))).toEqual(section());
    expect(section()).toEqual(["500 × 800 px empty at x 500 to 1000, y 0 to 800, inside section s (50% of it)"]);
  });

  test("the limit is 120 000 px² with a short side of 200 px, in the frame and in a section", () => {
    const left = (width: number, height: number) => blocks(page(box("right", "rectangle", "page", 1000 + width, 400, 1000 - width, 600), box("low", "rectangle", "page", 1000, 400 + height, width, 600 - height)));
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
      problem: `An empty block of 500 × 800 px sits inside section s at x 500 to 1000, y 0 to 800: 50% of the section holds no node or subsection. ${LIMIT}`
        + " The allowed fixes: shrink the section or the frame, or move a neighbour in. Not a fix: widen a section, add a sticky, reverse a chain. Never move a note or the key into a gap.",
      marks: [{ box: { x: 500, y: 0, width: 500, height: 800 } }],
    }]);
    const moved = (x: number, y: number) => plan(board(box("s", "section", null, x, y, 1000, 800), box("n", "rectangle", "s", x, y, 500, 800))).faults.map((fault) => fault.block);
    expect(moved(900, 300)).toEqual(moved(0, 0));
  });

  test("a band holds one finding at most: none inside its legal width whatever its area, and its own when it is too wide or too narrow", () => {
    // The band is 800 px long: at 200 px it is 160,000 px², over the limit of an empty block.
    const row = (gap: number) => board(box("page", "section", null, 0, 0, 1600 + gap, 800), full("a", "page", 0, 0, 800, 800), full("b", "page", 800 + gap, 0, 800, 800));
    const keys = (gap: number, facts: WireFact[] = []) => plan(row(gap), facts).faults.map((fault) => fault.key);
    expect(keys(200)).toEqual([]);
    expect(keys(320)).toEqual([]);
    expect(keys(321)).toEqual([`["gap","over",["a","b"]]`]);
    expect(keys(150)).toEqual([`["band",["a","b"]]`]);
    // 5 lanes need 280 px: 400 px is legal, and no block.
    const five = [0, 1, 2, 3, 4].map((i) => wire(`l${i}`, "a-n", "b-n", [[700, 50], [820 + 20 * i, 50], [820 + 20 * i, 350], [1250, 350]]));
    expect(keys(400, five)).toEqual([]);
    expect(keys(401, five)).toEqual([`["gap","over",["a","b"]]`]);
    // The corner past the span 2 sections share is no band: a block.
    const corner = board(box("page", "section", null, 0, 0, 1800, 1200), full("a", "page", 0, 0, 800, 1200), full("b", "page", 1000, 0, 800, 500));
    expect(blocks(corner)).toEqual(["1000 × 700 px empty at x 800 to 1800, y 500 to 1200, in the board frame (32% of it)"]);
  });

  test("where a band between 2 columns meets a band between 2 rows, the corner is room and no empty block", () => {
    // a over c on the left, b at the right of a, and a wide d under b: the corner at x 800 to 1200, y 800 to 1120 is 128,000 px².
    const lane = (id: string, x: number) => wire(id, "a-n", "c-n", [[700, 100], [x, 100], [x, 700], [700, 700]]);
    const file = board(
      box("page", "section", null, 0, 0, 2000, 2000), full("a", "page", 0, 0, 800, 800), full("b", "page", 1200, 0, 800, 800),
      full("c", "page", 0, 1120, 800, 880), full("d", "page", 1200, 1120, 800, 880),
    );
    const facts = Array.from({ length: 6 }, (_, i) => lane(`w${i}`, 820 + 20 * i));
    expect(plan(file, facts).gaps.map((gap) => [gap.a, gap.b, gap.gap, gap.need, gap.most, gap.fault])).toEqual([
      ["a", "b", 400, 300, 420, null], ["a", "c", 320, 200, 320, null], ["b", "d", 320, 200, 320, null], ["c", "d", 400, 200, 320, "over"],
    ]);
    expect(plan(file, facts).blocks).toEqual([]);
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
    // A sticky fills nothing: a note of 500 × 440 px moved in beside the node leaves the section as thin as it was.
    const noted = plan(board(box("s", "section", null, 0, 0, 1000, 800), box("n", "rectangle", "s", 40, 80, 280, 100), box("note", "sticky", "s", 400, 200, 500, 440)));
    expect(noted.thin.map((thin) => [thin.id, thin.items, Math.round(thin.fill * 100)])).toEqual([["s", 1, 4]]);
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

describe("climb band rule", () => {
  const pair = (gap: number, ...more: BoardObject[]) => board(full("a", null, 0, 0, 300, 400), full("b", null, 300 + gap, 0, 300, 400), more);
  const measure = (file: Board, facts: WireFact[] = []) => gapMeasures(file, reviewUnits(file).units, facts, RULE, null);
  const faults = (file: Board, facts: WireFact[] = []) => measure(file, facts).map((gap) => [gap.a, gap.b, gap.gap, gap.wires.length, gap.need, gap.fault]);

  test("a band needs 200 px, and 20 px more for each lane after the first: a wire that runs along it for 40 px or more inside the span the 2 sections share", () => {
    expect(faults(pair(200))).toEqual([["a", "b", 200, 0, 200, null]]);
    expect(faults(pair(199))).toEqual([["a", "b", 199, 0, 200, "under"]]);
    expect(faults(pair(200), lanes(1))).toEqual([["a", "b", 200, 1, 200, null]]);
    expect(faults(pair(200), lanes(3))).toEqual([["a", "b", 200, 3, 240, "under"]]);
    expect(faults(pair(240), lanes(3, 590))).toEqual([["a", "b", 240, 3, 240, null]]);
    // A wire that only crosses the band straight is no lane: round 5 cycle 3 counted 11 of them on board 09.
    expect(faults(pair(200), [across("w1", 100), across("w2", 200), across("w3", 300)])).toEqual([["a", "b", 200, 0, 200, null]]);
    // A jog of 30 px in the band is no lane, and neither is a run past the span the 2 sections share (y 0 to 400).
    expect(faults(pair(200), [wire("jog", "p", "q", [[250, 100], [400, 100], [400, 130], [550, 130]])])).toEqual([["a", "b", 200, 0, 200, null]]);
    expect(faults(pair(200), [wire("past", "p", "q", [[250, 390], [400, 390], [400, 800], [550, 800]])])).toEqual([["a", "b", 200, 0, 200, null]]);
  });

  test("a label leg that crosses the band with its chip in it sets the base when it is longer: 100 px and 10 px a character", () => {
    const calls = labelled("w1", "p", "q", [[250, 100], [550, 100]], "streams the events back", 320, 90);
    expect(measure(pair(200), [calls]).map((gap) => [gap.leg, gap.need, gap.fault])).toEqual([[330, 330, "under"]]);
    expect(measure(pair(330), [labelled("w1", "p", "q", [[250, 100], [680, 100]], "streams the events back", 320, 90)]).map((gap) => [gap.leg, gap.need, gap.fault])).toEqual([[330, 330, null]]);
    // A short label needs less than the base.
    expect(measure(pair(200), [labelled("w1", "p", "q", [[250, 100], [550, 100]], "calls", 320, 90)]).map((gap) => [gap.leg, gap.need])).toEqual([[150, 200]]);
    // The chip is not in the band: the leg needs no room there.
    expect(measure(pair(200), [labelled("w1", "p", "q", [[250, 100], [550, 100]], "streams the events back", 20, 90)]).map((gap) => [gap.leg, gap.need])).toEqual([[0, 200]]);
    // The leg and 3 lanes: 330 + 2 × 20.
    expect(measure(pair(200), [calls, ...lanes(3)]).map((gap) => [gap.leg, gap.wires.length, gap.need])).toEqual([[330, 3, 370]]);
  });

  test("a band is too wide past its need + 120 px when no node sits in it, and a sticky is no node", () => {
    expect(faults(pair(320))).toEqual([["a", "b", 320, 0, 200, null]]);
    expect(faults(pair(321))).toEqual([["a", "b", 321, 0, 200, "over"]]);
    expect(faults(pair(361), lanes(3, 700))).toEqual([["a", "b", 361, 3, 240, "over"]]);
    expect(faults(pair(360), lanes(3, 700))).toEqual([["a", "b", 360, 3, 240, null]]);
    // A loose node in the band uses the room. A note moved into it does not.
    expect(faults(pair(500, box("store", "rectangle", null, 350, 100, 200, 100)))).toEqual([["a", "b", 500, 0, 200, null]]);
    expect(faults(pair(500, box("note", "sticky", null, 350, 100, 200, 100)))).toEqual([["a", "b", 500, 0, 200, "over"]]);
  });

  test("each band of a row has its own need, and 2 bands that one section faces across one gap share the widest", () => {
    // a, b and c in a row: 3 lanes between a and b, none between b and c.
    const row = (gap: number) => board(full("a", null, 0, 0, 300, 400), full("b", null, 540, 0, 300, 400), full("c", null, 840 + gap, 0, 300, 400));
    expect(measure(row(320), lanes(3, 590)).map((gap) => [gap.a, gap.b, gap.need, gap.most, gap.fault])).toEqual([["a", "b", 240, 360, null], ["b", "c", 200, 320, null]]);
    expect(measure(row(321), lanes(3, 590)).map((gap) => gap.fault)).toEqual([null, "over"]);
    // a over c, and both face b across one gap of 360 px: the 3 lanes beside a set the most the band beside c may be.
    const column = board(full("a", null, 0, 0, 300, 400), full("c", null, 0, 600, 300, 400), full("b", null, 660, 0, 300, 1000));
    expect(measure(column, lanes(3, 700)).map((gap) => [gap.a, gap.b, gap.side, gap.gap, gap.need, gap.most, gap.fault])).toEqual([
      ["a", "c", "stacked", 200, 200, 320, null], ["a", "b", "side by side", 360, 240, 360, null], ["c", "b", "side by side", 360, 200, 360, null],
    ]);
    expect(gapLine(measure(column, lanes(3, 700))[2]!, RULE)).toBe(
      "c ↔ b · side by side · gap 360 px · band x 300 to 660, y 600 to 1000 · 0 wires run along it · 0 label chips in it"
      + " · needs 200 px, legal to 360 px (a band of its strip needs more) · inside its legal width");
  });

  test("a band too narrow is a wire fault with its lanes, its need and the px it is short, and a move apart closes it", () => {
    // A wire from a to c under them runs down the band between a and b: it joins a section that is not beside the band.
    const file = (gap: number) => board(full("a", null, 0, 0, 300, 400), full("b", null, 300 + gap, 0, 300, 400), full("c", null, 0, 600, 600 + gap, 400));
    const down = wire("down", "a-n", "c-n", [[250, 40], [380, 40], [380, 600]]);
    const found = plan(file(200), [...lanes(3), down]);
    expect(found.faults).toEqual([{
      kind: "wire", key: `["band",["a","b"]]`, ids: ["a", "b", "l1", "l2", "l3", "down"], number: 60,
      problem: "The band between a and b (side by side), x 300 to 500, y 0 to 400, is 200 px wide and 4 wires run along it (l1, l2, l3, down):"
        + " it needs 260 px (200 px, plus 20 px for each lane after the first), so it is 60 px too narrow. Move the 2 sections apart to 260 px, and no more than 380 px",
      facts: "the band is 200 px wide now with 4 lanes, and it needs 260 px; 1 of them joins a section that is not beside the band: down (a → c)",
      marks: [{ box: { x: 300, y: 0, width: 200, height: 400 } }],
    }]);
    expect(plan(file(260), [...lanes(3, 610), wire("down", "a-n", "c-n", [[250, 40], [380, 40], [380, 600]])]).faults).toEqual([]);
  });

  test("a band that needs over 400 px is a section-order fault: its finding says to reorder the sections, not to widen", () => {
    const narrow = (n: number) => plan(pair(300), lanes(n, 650)).faults.map((fault) => fault.problem);
    // 11 lanes need 400 px: the finding asks for the width.
    expect(narrow(11)).toEqual([expect.stringContaining("it needs 400 px (200 px, plus 20 px for each lane after the first), so it is 100 px too narrow. Move the 2 sections apart to 400 px, and no more than 520 px")]);
    expect(narrow(12)).toEqual([expect.stringContaining(
      "it needs 420 px (200 px, plus 20 px for each lane after the first), so it is 120 px too narrow."
      + " A band that needs over 400 px is a section-order fault: reorder the sections so fewer wires run along this band. Do not widen it")]);
    expect(narrow(12)[0]).not.toContain("Move the 2 sections apart");
    // A label leg of 43 characters needs 530 px: the label is the other fix.
    const leg = labelled("w1", "p", "q", [[250, 100], [650, 100]], "streams every event of the run back to the client", 320, 90);
    expect(plan(pair(300), [leg]).faults[0]!.problem).toEndWith(
      "it needs 590 px (590 px for the longest label leg in it), so it is 290 px too narrow."
      + " A band that needs over 400 px is a section-order fault: reorder the sections so fewer wires run along this band, or shorten the label. Do not widen it");
  });

  test("the rule is for sections that share a parent: a subsection and a section outside its parent are not measured", () => {
    const file = board(box("outer", "section", null, 0, 0, 400, 400), full("inner", "outer", 100, 0, 300, 400), full("c", null, 450, 0, 300, 400));
    expect(faults(file, [across("w1", 100, 500)])).toEqual([["outer", "c", 50, 0, 200, "under"]]);
  });

  test("the rule sets the bands of the sections in the board frame: a gap inside a section is listed with no fault", () => {
    // 2 subsections 80 px apart, as `arrange_section` leaves them.
    const nested = plan(board(
      box("page", "section", null, 0, 0, 1180, 400), box("group", "section", "page", 0, 0, 680, 400),
      full("s1", "group", 0, 0, 300, 400), full("s2", "group", 380, 0, 300, 400), full("c", "page", 880, 0, 300, 400),
    ), [across("w1", 100, 430)]);
    expect(nested.gaps.map((gap) => [gap.a, gap.b, gap.gap, gap.ruled, gap.fault])).toEqual([["group", "c", 200, true, null], ["s1", "s2", 80, false, null]]);
    expect(gapLine(nested.gaps[1]!, RULE)).toBe(
      "s1 ↔ s2 · side by side · gap 80 px · band x 300 to 380, y 0 to 400 · 0 wires run along it · 0 label chips in it"
      + " · inside section group: `arrange_section` sets it, not the band rule");
    expect(nested.faults).toEqual([]);
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
      kind: "wire", key: `["through","m"]`, ids: ["m", "w"], number: 1,
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
      kind: "wire", key: `["through","m"]`, ids: ["m", "w"], number: 1,
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
      kind: "wire", key: `["long",["a","b"]]`, ids: ["a", "b", "w"], number: 2200,
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

  test("a section's place is its neighbours and the side each is on: a swap or another row changes it, and a move of a few px does not", () => {
    const places = (...sections: BoardObject[][]) => plan(board(...sections)).layout.places;
    const [a, m, b] = [full("a", null, 0, 0, 300, 400), full("m", null, 500, 0, 300, 400), full("b", null, 1000, 0, 300, 400)];
    const first = places(a, m, b);
    expect(first).toEqual({ a: `["m right"]`, m: `["a left","b right"]`, b: `["m left"]` });
    // 40 px to the right and 20 px down: the same row, the same neighbours.
    expect(places(a, m, full("b", null, 1040, 20, 300, 400))).toEqual(first);
    // The centre of each section says how far it went.
    expect(plan(board(a, m, full("b", null, 1040, 20, 300, 400))).layout.centres).toEqual({ a: [150, 200], m: [650, 200], b: [1190, 220] });
    // m and b swap: each of the 3 has another neighbour, or the same one on another side.
    expect(places(a, full("m", null, 1000, 0, 300, 400), full("b", null, 500, 0, 300, 400))).toEqual({ a: `["b right"]`, m: `["b left"]`, b: `["a left","m right"]` });
    // b goes under m: another row for b, and m has it below.
    expect(places(a, m, full("b", null, 500, 600, 300, 400))).toEqual({ a: `["m right"]`, m: `["a left","b below"]`, b: `["m above"]` });
  });

  test("the layout facts hold the numbers a decline is held against: each wire's length and crossings, and each wire fault's own number", () => {
    const over = wire("w", "a-n", "b-n", [[150, 0], [150, -100], [2150, -100], [2150, 0]]);
    const { layout, faults } = plan(row(2000), [over, { ...wire("x", "a-n", "m-n", [[300, 100], [500, 100]]), crosses: ["w"] }]);
    expect(layout.numbers).toEqual({ length: { w: 2200, x: 200 }, crossings: { w: 0, x: 1 }, faults: { [`["long",["a","b"]]`]: 2200 } });
    expect(faults.filter((fault) => fault.kind === "wire").map((fault) => [fault.key, fault.number])).toEqual([[`["long",["a","b"]]`, 2200]]);
  });
});
