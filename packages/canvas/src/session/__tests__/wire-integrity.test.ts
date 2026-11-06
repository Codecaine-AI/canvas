import { describe, expect, test } from "bun:test";

import { brokenWires } from "../../board/wire-integrity";
import { makeTestSession, runOp } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

describe("wire integrity at edit time", () => {
  test("move_to that puts a wire's two ends on one center is refused and changes nothing", () => {
    const baseline = makeDocument([box("a", 0, 0, 160, 96), box("b", 400, 0, 160, 96)], [connect("a-b", "a", "b")]);
    const session = makeTestSession(baseline, ["a", "b"]);

    const result = runOp(session, "move_to", { id: "b", x: 0, y: 0 });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("ERROR · move_to — refused: it would break a wire");
    expect(result.text).toContain("a-b has zero length: a and b share one center");
    expect(session.draft).toBe(baseline);
  });

  test("resize that centers one end on the other is refused", () => {
    // b at (-80, -48) grown to 320×200 centers on (80, 52), a's center.
    const baseline = makeDocument(
      [box("a", 0, 4, 160, 96), box("b", -80, -48, 160, 96)],
      [connect("a-b", "a", "b")],
    );
    const session = makeTestSession(baseline, ["a", "b"]);

    const result = runOp(session, "resize", { id: "b", width: 320, height: 200 });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("a-b has zero length");
    expect(session.draft).toBe(baseline);
  });

  test("a wire already broken in the file does not block an unrelated edit", () => {
    const baseline = makeDocument(
      [box("a", 0, 0), box("twin", 0, 0), box("c", 600, 0)],
      [connect("flat", "a", "twin")],
    );
    const session = makeTestSession(baseline, ["c"]);

    const result = runOp(session, "move_to", { id: "c", x: 800, y: 0 });

    expect(result.isError).toBeUndefined();
    expect(brokenWires(session.draft).map((wire) => wire.kind)).toEqual(["zero-length"]);
  });

  test("brokenWires names self-loops, dangling ends and zero-length wires", () => {
    const document = makeDocument(
      [box("a", 0, 0), box("twin", 0, 0), box("b", 400, 0)],
      [connect("loop", "a", "a"), connect("ghost", "a", "nobody"), connect("flat", "a", "twin"), connect("fine", "a", "b")],
    );
    expect(brokenWires(document).map((wire) => [wire.id, wire.kind])).toEqual([
      ["loop", "self-loop"],
      ["ghost", "dangling"],
      ["flat", "zero-length"],
    ]);
  });
});
