import { describe, expect, test } from "bun:test";

import { rule as longWire } from "../../board/lints/rules/long-wire";
import { LAYOUT_RULES } from "../../board/lints";
import { box, connect, makeDocument } from "./synthetic";

/**
 * A wire the agent drew never runs more than half the board's longer painted
 * edge (and never under 600px, so a small board's wires pass). Measured on
 * the routed polyline. A person's unchanged wire is theirs to keep, but a
 * wire whose end the agent moved is the agent's.
 */

const page = box("page", 0, 0, 3000, 1400, "section");
const EMPTY_START = { baseline: makeDocument([]) };

describe("long-wire lint", () => {
  test("runs on every edit", () => {
    expect(LAYOUT_RULES.map((rule) => rule.id)).toContain("long-wire");
  });

  test("a wire across the board warns with its share of the longer edge", () => {
    const document = makeDocument(
      [page, box("a", 100, 100, 280, 100, "process"), box("b", 1500, 800, 280, 100, "process")],
      [connect("return", "b", "a")],
    );
    const [finding] = longWire.check(document, EMPTY_START);
    expect(finding?.severity).toBe("warning");
    expect(finding?.at).toEqual(["return", "b", "a"]);
    expect(finding?.message).toMatch(/^return runs \d+px, \d+% of the board's 1680px longer edge — a viewer loses a wire past half the board$/);
    expect(finding?.suggestion).toStartWith("move_to a beside b, or the two sections that hold them next to each other");
  });

  test("a wire under half the board is quiet, and so is a short wire on a small board", () => {
    const wide = makeDocument(
      [page, box("a", 100, 100, 280, 100, "process"), box("b", 1300, 100, 280, 100, "process"), box("far", 3000, 100, 280, 100, "process")],
      [connect("ab", "a", "b")],
    );
    expect(longWire.check(wide, EMPTY_START)).toEqual([]);
    const small = makeDocument(
      [box("a", 100, 100, 280, 100, "process"), box("b", 500, 100, 280, 100, "process")],
      [connect("ab", "a", "b")],
    );
    expect(longWire.check(small, EMPTY_START)).toEqual([]);
  });

  test("a person's unchanged wire is never judged, but one whose end the agent moved is", () => {
    const theirs = makeDocument(
      [page, box("a", 100, 100, 280, 100, "process"), box("b", 1500, 800, 280, 100, "process")],
      [connect("return", "b", "a")],
    );
    expect(longWire.check(theirs, { baseline: theirs })).toEqual([]);
    expect(longWire.check(theirs, {})).toEqual([]);
    const moved = makeDocument(
      [page, box("a", 100, 100, 280, 100, "process"), box("b", 2000, 1000, 280, 100, "process")],
      [connect("return", "b", "a")],
    );
    expect(longWire.check(moved, { baseline: theirs })).toHaveLength(1);
  });
});
