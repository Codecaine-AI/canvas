import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import { loadReviewCanvas } from "./critic.ts";
import { box, wire } from "./fixtures/review/stubs.ts";
import { ORDER_ALL_CELLS, namesStart, orderGain, orderLines, orderSearch } from "./order.ts";
import { rethinkMessage } from "./rethink.ts";
import type { Board, BoardObject } from "./review-inputs.ts";
import { gapRule, planOf } from "./space.ts";
import { wireFacts, type WireFact } from "./wires.ts";

/** A section 300 × 300 px with one node, at a place of a grid with 500 px between 2 places. */
const cell = (id: string, column: number, row = 0): BoardObject[] =>
  [box(id, "section", null, 500 * column, 500 * row, 300, 300), box(`${id}-n`, "rectangle", id, 500 * column + 100, 500 * row + 100)];
const board = (...objects: BoardObject[][]): Board => ({ objects: objects.flat(), connections: [] });
/** A wire between the nodes of 2 sections. Its corners do not count: the search reads its ends. */
const link = (from: string, to: string, at = 0): WireFact => wire(`${from}-${to}-${at}`, `${from}-n`, `${to}-n`, [[0, 0], [100, 0]]);
const search = (file: Board, facts: WireFact[], keepFirstRow = false) => orderSearch(file, facts, null, 200, keepFirstRow)!;

describe("climb order search", () => {
  test("a pair with a section between it costs a non-neighbour pair, and the best order makes the 2 neighbours", () => {
    const found = search(board(cell("a", 0), cell("b", 1), cell("c", 2)), [link("a", "c", 1), link("a", "c", 2), link("c", "b")]);
    expect(found).toMatchObject({ cells: ["a", "b", "c"], method: "every order", kept: null, shown: true });
    // 2 wires over 2 places of 300 px and a band of 200 px, one wire back over 1 place.
    expect(found.current).toEqual({ rows: 1, columns: 3, grid: [["a", "b", "c"]], cost: { total: 2 * 1000 + 500 + 300 + 1000, length: 2500, back: 1, far: 1 } });
    expect(found.best[0]).toEqual({ rows: 1, columns: 3, grid: [["a", "c", "b"]], cost: { total: 1500, length: 1500, back: 0, far: 0 } });
    expect(orderGain(found, found.best[0]!)).toBe(61);
    expect(found.drawn).toBe(2500);
  });

  test("an order as cheap as any is not shown, and the lines give each order with its shape, cost and rows", () => {
    const found = search(board(cell("a", 0), cell("b", 1), cell("c", 2)), [link("a", "b"), link("b", "c")]);
    expect(found.shown).toBe(false);
    expect(orderLines(found).slice(0, 4)).toEqual([
      "Now, 1 rows × 3 columns: cost 1000 (1000 px of wire, 0 back, 0 not neighbours)",
      "  row 1: a | b | c",
      "Order 1, 1 rows × 3 columns: cost 1000 (1000 px of wire, 0 back, 0 not neighbours), 0% cheaper",
      "  row 1: a | b | c",
    ]);
  });

  test("a board of 2 rows reads its own rows and columns, and an empty place shows", () => {
    const found = search(board(cell("a", 0), cell("b", 1), cell("c", 0, 1)), [link("a", "b"), link("a", "c")]);
    expect(found.current.grid).toEqual([["a", "b"], ["c", null]]);
    expect(orderLines(found)[2]).toBe("  row 2: c | ·");
    expect(found.current.cost).toEqual({ total: 1000, length: 1000, back: 0, far: 0 });
  });

  test("with a start in the brief the first row stays, and without one the search is free", () => {
    // d feeds a, which sits in the first row: the free search puts d before a.
    const file = board(cell("a", 0), cell("b", 1), cell("c", 0, 1), cell("d", 1, 1));
    const facts = [link("d", "a", 1), link("d", "a", 2), link("d", "a", 3), link("a", "b"), link("b", "c")];
    const kept = search(file, facts, true);
    expect(kept.kept).toEqual(["a", "b"]);
    for (const order of kept.best) expect(order.grid[0]!.slice(0, 2)).toEqual(["a", "b"]);
    const free = search(file, facts);
    expect(free.kept).toBeNull();
    expect(free.best[0]!.cost.total).toBeLessThan(kept.best[0]!.cost.total);
  });

  test("over 9 cells a local search runs from the board's own order", () => {
    // A chain of 10 sections, drawn in 2 rows with each pair of the chain apart.
    const ids = ["s0", "s5", "s1", "s6", "s2", "s7", "s3", "s8", "s4", "s9"];
    expect(ids.length).toBeGreaterThan(ORDER_ALL_CELLS);
    const file = board(...ids.map((id, at) => cell(id, at % 5, Math.floor(at / 5))));
    const found = search(file, Array.from({ length: 9 }, (_, at) => link(`s${at}`, `s${at + 1}`)));
    expect(found.method).toBe("local search");
    expect(found.best[0]!.cost.total).toBeLessThan(found.current.cost.total);
    expect(found.best[0]!.grid.flat().filter(Boolean).sort()).toEqual([...ids].sort());
  });

  test("no search on a board with under 3 cells, with no wire between 2, or with 2 cells on one place", () => {
    expect(orderSearch(board(cell("a", 0), cell("b", 1)), [link("a", "b")], null, 200, false)).toBeNull();
    expect(orderSearch(board(cell("a", 0), cell("b", 1), cell("c", 2)), [], null, 200, false)).toBeNull();
    const over = [box("c", "section", null, 100, 100, 300, 300), box("c-n", "rectangle", "c", 200, 200)];
    expect(orderSearch(board(cell("a", 0), cell("b", 1), over), [link("a", "b")], null, 200, false)).toBeNull();
  });

  test("a brief names a start only in so many words", () => {
    expect(namesStart("Show that every path into nas-01 starts on services-01.")).toBe(true);
    expect(namesStart("The CLI is the entry point of the build.")).toBe(true);
    expect(namesStart("Show the 6 sections of the session and the wires between them.")).toBe(false);
  });
});

describe("climb order search on first drafts of round 5 cycle 4", () => {
  /** A first draft of round 5 cycle 4, as the rethink turn saw it. No brief of the 4 names a start. */
  const draft = async (name: string) => {
    const canvas = await loadReviewCanvas();
    const file = canvas.toolkit.openCanvasFile(resolve(import.meta.dir, "fixtures/order", `r5d-${name}-draft.canvas.json`));
    const rule = gapRule(canvas.wires);
    const facts = wireFacts(canvas.wires, file);
    const measured = { board: file.persisted as Board, facts, plan: planOf(file.persisted as Board, facts, rule) };
    const found = orderSearch(measured.board, facts, measured.plan.pageFrame, rule.base, false)!;
    return { found, message: rethinkMessage(name, measured, rule, found) };
  };

  test("h1 and 04 have an order 15% cheaper or more, and the rethink turn reads the best 2", async () => {
    for (const name of ["h1", "04"]) {
      const { found, message } = await draft(name);
      expect(found.shown).toBe(true);
      expect(orderGain(found, found.best[0]!)).toBeGreaterThanOrEqual(15);
      expect(found.best).toHaveLength(2);
      expect(message).toContain("\nSection orders the runner measured for A3.");
      for (const line of orderLines(found)) expect(message).toContain(`\n${line}\n`);
    }
  });

  test("r5 and r3 have none, and the rethink turn reads no orders", async () => {
    for (const name of ["r5", "r3"]) {
      const { found, message } = await draft(name);
      expect(found.shown).toBe(false);
      expect(orderGain(found, found.best[0]!)).toBeLessThan(15);
      expect(message).not.toContain("Section orders");
    }
  });
});
