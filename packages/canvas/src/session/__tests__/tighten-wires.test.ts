/**
 * tighten_wires: boxes slide toward what they are wired to, and nothing
 * else about the board changes — section membership, sizes, the wires.
 */
import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument } from "../../state/schema";
import { makeTestSession, runOp } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

function objectOf(document: InteractiveCanvasDocument, id: string) {
  return document.objects.find((object) => object.id === id)!;
}

/** A frame holding a chain whose last node was dropped far from the node that feeds it. */
function strayBoard(): InteractiveCanvasDocument {
  return makeDocument(
    [
      { ...box("page", 0, 0, 2000, 1400, "section"), text: "Page" },
      { ...box("frame", 40, 80, 1800, 1200, "section"), text: "Frame", parentId: "page" },
      { ...box("a", 120, 200, 280, 100), parentId: "frame" },
      { ...box("b", 120, 400, 280, 100), parentId: "frame" },
      { ...box("c", 1400, 1000, 280, 100), parentId: "frame" },
    ],
    [connect("a-b", "a", "b"), connect("b-c", "b", "c")],
  );
}

describe("arrange · tighten_wires", () => {
  test("pulls a stray node toward the node that feeds it and reports the saving", () => {
    const session = makeTestSession(strayBoard(), ["page"]);
    const before = objectOf(session.draft, "c").geometry;

    const result = runOp(session, "tighten_wires", {});

    expect(result.isError).toBeUndefined();
    expect(result.text).toMatch(/APPLIED · tighten_wires · \d+ box(es)? moved · wire \d+px → \d+px \(−\d+%\)/);
    const after = objectOf(session.draft, "c").geometry;
    // Closer to b on both axes, still the same box.
    expect(Math.abs(after.x - 120) + Math.abs(after.y - 400)).toBeLessThan(Math.abs(before.x - 120) + Math.abs(before.y - 400));
    expect(after.width).toBe(280);
    expect(after.height).toBe(100);
    // On the grid, inside its frame, still a child of it.
    expect(after.x % 20).toBe(0);
    expect(after.y % 20).toBe(0);
    expect(objectOf(session.draft, "c").parentId).toBe("frame");
    // The wires are untouched as wires.
    expect(session.draft.connections).toEqual(strayBoard().connections);
  });

  test("a board whose wires are already short is a no-op", () => {
    const document = makeDocument(
      [
        { ...box("page", 0, 0, 1200, 800, "section"), text: "Page" },
        { ...box("a", 100, 100, 280, 100), parentId: "page" },
        { ...box("b", 100, 300, 280, 100), parentId: "page" },
      ],
      [connect("a-b", "a", "b")],
    );
    const session = makeTestSession(document, ["page"]);

    const result = runOp(session, "tighten_wires", {});

    expect(result.text).toContain("NO-OP · tighten_wires");
    expect(session.draft).toEqual(document);
  });

  test("a box never lands on a sibling or outside its frame", () => {
    const document = makeDocument(
      [
        { ...box("page", 0, 0, 2000, 1400, "section"), text: "Page" },
        { ...box("frame", 40, 80, 800, 600, "section"), text: "Frame", parentId: "page" },
        { ...box("a", 120, 200, 280, 100), parentId: "frame" },
        { ...box("wall", 120, 400, 280, 100), parentId: "frame" },
        { ...box("c", 500, 560, 280, 100), parentId: "frame" },
      ],
      [connect("a-c", "a", "c")],
    );
    const session = makeTestSession(document, ["page"]);

    runOp(session, "tighten_wires", {});

    const c = objectOf(session.draft, "c").geometry;
    const wall = objectOf(session.draft, "wall").geometry;
    const frame = objectOf(session.draft, "frame").geometry;
    const apart = c.x + c.width + 16 <= wall.x || wall.x + wall.width + 16 <= c.x
      || c.y + c.height + 16 <= wall.y || wall.y + wall.height + 16 <= c.y;
    expect(apart).toBe(true);
    expect(c.x).toBeGreaterThanOrEqual(frame.x + 40);
    expect(c.y).toBeGreaterThanOrEqual(frame.y + 80);
    expect(c.x + c.width).toBeLessThanOrEqual(frame.x + frame.width - 40);
    expect(c.y + c.height).toBeLessThanOrEqual(frame.y + frame.height - 40);
  });

  test("slides a box so its wire runs straight when the total length stays the same", () => {
    // a → b jogs 200px. Each of the two has a second wire that pulls it the
    // other way, so every move that lines them up adds 200px elsewhere.
    const document = makeDocument(
      [
        { ...box("page", 0, 0, 2000, 1400, "section"), text: "Page" },
        { ...box("over-a", 100, 100, 280, 100), parentId: "page" },
        { ...box("a", 100, 300, 280, 100), parentId: "page" },
        { ...box("b", 700, 500, 280, 100), parentId: "page" },
        { ...box("under-b", 700, 700, 280, 100), parentId: "page" },
      ],
      [connect("over-a-a", "over-a", "a"), connect("a-b", "a", "b"), connect("b-under-b", "b", "under-b")],
    );
    const session = makeTestSession(document, ["page"]);

    const result = runOp(session, "tighten_wires", {});

    expect(result.text).toMatch(/APPLIED · tighten_wires · .* · corners 2 → 0 · crossings 0 → 0/);
    const a = objectOf(session.draft, "a").geometry;
    const b = objectOf(session.draft, "b").geometry;
    expect(a.y + a.height / 2).toBe(b.y + b.height / 2);
  });

  test("slides a section so the wire into it runs straight", () => {
    // kernel → event jogs 260px. A slide of either section lines them up and
    // makes one other wire 260px longer, so the length does not change.
    const document = makeDocument(
      [
        { ...box("page", 0, 0, 2400, 1600, "section"), text: "Page" },
        { ...box("engine", 100, 60, 280, 100), parentId: "page" },
        { ...box("providers", 80, 560, 360, 240, "section"), text: "Providers", parentId: "page" },
        { ...box("kernel", 120, 660, 280, 100), parentId: "providers" },
        { ...box("gateway", 120, 900, 280, 100), parentId: "page" },
        { ...box("records", 900, 100, 360, 480, "section"), text: "Records", parentId: "page" },
        { ...box("row", 940, 180, 280, 100), parentId: "records" },
        { ...box("event", 940, 400, 280, 100), parentId: "records" },
      ],
      [
        connect("engine-row", "engine", "row"),
        connect("row-event", "row", "event"),
        connect("kernel-event", "kernel", "event"),
        connect("kernel-gateway", "kernel", "gateway"),
      ],
    );
    const session = makeTestSession(document, ["page"]);

    runOp(session, "tighten_wires", {});

    const kernel = objectOf(session.draft, "kernel").geometry;
    const event = objectOf(session.draft, "event").geometry;
    expect(kernel.y + kernel.height / 2).toBe(event.y + event.height / 2);
    // Each section moved as one body.
    const records = objectOf(session.draft, "records").geometry;
    expect(event.y - records.y).toBe(300);
    expect(objectOf(session.draft, "row").geometry.y - records.y).toBe(80);
    expect(kernel.y - objectOf(session.draft, "providers").geometry.y).toBe(100);
  });

  test("counts a corner that merged wires share as one corner", () => {
    // Two wires meet at (640, 400) and drop into the sink as one line.
    const document = makeDocument(
      [
        { ...box("page", 0, 0, 1600, 1000, "section"), text: "Page" },
        { ...box("left", 100, 100, 280, 100), parentId: "page" },
        { ...box("right", 900, 100, 280, 100), parentId: "page" },
        { ...box("sink", 500, 500, 280, 100), parentId: "page" },
      ],
      [
        { id: "left-sink", from: { objectId: "left", anchor: "bottom" }, to: { objectId: "sink", anchor: "top" }, waypoints: [[240, 400], [640, 400]] },
        { id: "right-sink", from: { objectId: "right", anchor: "bottom" }, to: { objectId: "sink", anchor: "top" }, waypoints: [[1040, 400], [640, 400]] },
      ],
    );
    const session = makeTestSession(document, ["page"]);

    const result = runOp(session, "tighten_wires", {});

    expect(result.text).toMatch(/corners 3 → \d+|, 3 corners,/);
  });

  test("refuses a board with no wires", () => {
    const session = makeTestSession(makeDocument([box("alpha", 0, 0, 160, 100)]), ["alpha"]);

    const result = runOp(session, "tighten_wires", {});

    expect(result.isError).toBe(true);
    expect(result.text).toContain("no wires to tighten");
  });
});
