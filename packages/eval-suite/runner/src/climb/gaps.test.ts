import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import { loadReviewCanvas } from "./critic.ts";
import { box, labelled, wire } from "./fixtures/review/stubs.ts";
import { GAP_MAX_REVIEWERS, borderDistance, gapChips, gapCoverage, gapCropLines, gapCrops, gapUnits, packCrops } from "./gaps.ts";
import { reviewUnits, type Board } from "./review-inputs.ts";
import { wireFacts } from "./wires.ts";

const BOARD = resolve(import.meta.dir, "fixtures/review/b05.canvas.json");

/** A board frame with 2 sections side by side, 200 px apart. */
const page = box("page", "section", null, 0, 0, 1200, 800);
const board: Board = {
  objects: [page, box("s1", "section", "page", 100, 100, 400, 300, { text: "Engine" }), box("s2", "section", "page", 700, 100, 400, 300, { text: "Store" })],
  connections: [],
};
const chip = (id: string, x: number, y: number) => labelled(id, "n1", "n2", [[450, 250], [750, 250]], "calls", x, y);

describe("climb gap reviewers", () => {
  test("the distance from a box to a section border is 0 on the border, and measured from inside or outside it", () => {
    const section = { x: 100, y: 100, width: 400, height: 300 };
    const distance = (x: number, y: number, width = 60, height = 20) => Math.round(borderDistance({ x, y, width, height }, section));
    expect([distance(120, 200), distance(80, 200), distance(20, 200), distance(40, 40, 30, 30)]).toEqual([20, 0, 20, 42]);
  });

  test("a gap reviewer's chips are those outside every section, and those within 40 px of a section border", () => {
    const facts = [
      chip("deep", 250, 240), chip("near", 110, 240), chip("gutter", 570, 240), chip("on", 680, 300), chip("edge", 10, 500),
      wire("bare", "n1", "n2", [[450, 250], [750, 250]]),
    ];
    expect(gapChips(board, page, facts).map((fact) => fact.id)).toEqual(["near", "gutter", "on", "edge"]);
  });

  test("items pack into few windows of 1600 × 1200 at most, either way round, and a crop is 480 × 360 at least", () => {
    const item = (x: number, y: number) => ({ x, y, width: 100, height: 100 });
    expect(packCrops([{ x: 100, y: 100, width: 60, height: 20 }])).toEqual([{ x: -110, y: -70, width: 480, height: 360 }]);
    expect(packCrops([item(0, 0), item(1000, 0)])).toEqual([{ x: 0, y: -130, width: 1100, height: 360 }]);
    expect(packCrops([item(0, 0), item(0, 1400)])).toEqual([{ x: -190, y: 0, width: 480, height: 1500 }]);
    // Too far apart for one window: 2 crops, in reading order.
    expect(packCrops([item(2000, 0), item(0, 0)])).toEqual([{ x: -190, y: -130, width: 480, height: 360 }, { x: 1810, y: -130, width: 480, height: 360 }]);
    expect(packCrops([item(0, 2000), item(0, 0)]).map((crop) => crop.y)).toEqual([-130, 1870]);
    expect(packCrops([])).toEqual([]);
  });

  test("every gap chip is whole in a crop, and a gutter with 2 wires along it is cropped with no chip in it", () => {
    const units = reviewUnits(board).units;
    const chips = [chip("gutter", 570, 240), chip("deep", 250, 240)];
    const crops = gapCrops(board, page, units, chips);
    expect(crops).toEqual([{ x: 360, y: 70, width: 480, height: 360 }]);
    expect(gapCoverage(board, page, chips, crops)).toEqual({ chips: 1, covered: 1 });
    // A chip that a crop cuts is not covered.
    expect(gapCoverage(board, page, chips, [{ x: 0, y: 0, width: 600, height: 400 }])).toEqual({ chips: 1, covered: 0 });

    const lane = (id: string, x: number) => wire(id, "n1", "n2", [[450, 150], [x, 150], [x, 350], [750, 350]]);
    // The gutter is x 500 to 700, y 100 to 400: the crop is that with 48 px of each section, grown to the least crop.
    expect(gapCrops(board, page, units, [lane("w1", 560)])).toEqual([]);
    expect(gapCrops(board, page, units, [lane("w1", 560), lane("w2", 640)])).toEqual([{ x: 360, y: 70, width: 480, height: 360 }]);
  });

  test("board 05: each gap chip is whole in a crop at full size, and no crop is over one window", async () => {
    const canvas = await loadReviewCanvas();
    const file = canvas.toolkit.openCanvasFile(BOARD);
    const real = file.persisted as Board;
    const facts = wireFacts(canvas.wires, file);
    const { pageFrame, units } = reviewUnits(real);
    const crops = gapCrops(real, pageFrame, units, facts);
    const coverage = gapCoverage(real, pageFrame, facts, crops);
    expect(coverage.chips).toBeGreaterThan(0);
    expect(coverage.covered).toBe(coverage.chips);
    for (const crop of crops) {
      expect(Math.max(crop.width, crop.height)).toBeLessThanOrEqual(1600);
      expect(Math.min(crop.width, crop.height)).toBeLessThanOrEqual(1200);
    }
    expect(gapUnits(crops).flatMap((unit) => unit.crops)).toEqual(crops);
  });

  test("a gap reviewer reads 4 crops, and a board never gets over 8 gap reviewers", () => {
    const crops = (count: number) => Array.from({ length: count }, (_, index) => ({ x: index * 500, y: 0, width: 480, height: 360 }));
    const sizes = (count: number) => gapUnits(crops(count)).map((unit) => unit.crops.length);
    expect(gapUnits([])).toEqual([]);
    expect(gapUnits(crops(3))).toMatchObject([{ id: "gap-1", kind: "gap", section: null, rect: { x: 0, y: 0, width: 1480, height: 360 } }]);
    expect(sizes(9)).toEqual([4, 4, 1]);
    expect(sizes(32)).toEqual([4, 4, 4, 4, 4, 4, 4, 4]);
    // More crops than 8 reviewers of 4: each reviewer reads more.
    expect(sizes(33)).toEqual([5, 5, 5, 5, 5, 5, 3]);
    for (let count = 1; count <= 100; count += 1) expect(sizes(count).length).toBeLessThanOrEqual(GAP_MAX_REVIEWERS);
  });

  test("under a crop the reviewer reads its borders, each chip with its distance to a border, each wire, and what the runner measured", () => {
    const facts = [
      chip("w1", 570, 240),
      wire("w2", "a", "b", [[520, 120], [520, 380]]),
      wire("w3", "a", "c", [[530, 120], [530, 380]]),
      labelled("w4", "n1", "n3", [[450, 275], [750, 275]], "reads", 575, 265),
      wire("w5", "x", "y", [[0, 300], [1200, 300]]),
      wire("away", "x", "y", [[0, 700], [1200, 700]]),
    ];
    expect(gapCropLines({ x: 400, y: 150, width: 400, height: 250 }, board, page, facts)).toEqual([
      `board frame page "" · x 0 to 1200, y 0 to 800`,
      `section s1 "Engine" · x 100 to 500, y 100 to 400`,
      `section s2 "Store" · x 700 to 1100, y 100 to 400`,
      `chip "calls" of w1 · x 570 to 630, y 240 to 260 (60×20) · 70 px outside the border of section s1 · its wire is 300 px long`,
      `chip "reads" of w4 · x 575 to 635, y 265 to 285 (60×20) · 65 px outside the border of section s2 · its wire is 300 px long`,
      "wire w1 · n1 → n2 · corners (450, 250) (750, 250)",
      "wire w2 · a → b · corners (520, 120) (520, 380)",
      "wire w3 · a → c · corners (530, 120) (530, 380)",
      "wire w4 · n1 → n3 · corners (450, 275) (750, 275)",
      "wire w5 · x → y · corners (0, 300) (1200, 300) (it passes through the crop)",
      "measured: w2 runs 260 px at 20 px from the right border of s1 (a wire within 24 px of a border runs along it)",
      "measured: w2 and w3 run 260 px on 2 lines 10 px apart",
      "measured: chips of w1 and w4 are 5 px apart",
    ]);
    const where = (x: number, y: number) => gapCropLines({ x: 400, y: 150, width: 400, height: 250 }, board, page, [chip("w", x, y)])[3]!.split(" · ")[2];
    expect([where(480, 200), where(420, 300)]).toEqual(["ON the border of section s1", "20 px inside the border of section s1"]);
  });
});
