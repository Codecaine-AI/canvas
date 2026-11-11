/**
 * Make room: on the agent path, a section that must grow into a neighbour
 * pushes the neighbour (and everything it holds) away along the grow
 * direction, and the pushed neighbour pushes its own neighbours in turn.
 * Wires stay attached. A lock still pins, and the edit is then refused.
 */
import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";

import { createInteractiveCanvasState, reduceInteractiveCanvasState } from "../../state/actions";
import { diffDocuments } from "../../board/doc-diff";
import { connectionLabelChipMetrics } from "../../connectors/label-chip";
import { AGENT_GRID } from "../tools/grid";
import { makeTestSession, runOp } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

function section(id: string, x: number, y: number, width: number, height: number, parentId: string | null = null) {
  return { ...box(id, x, y, width, height, "section"), parentId } as InteractiveCanvasObject;
}

function child(id: string, x: number, y: number, parentId: string, width = 160, height = 100) {
  return { ...box(id, x, y, width, height), parentId };
}

function geometryOf(document: InteractiveCanvasDocument, id: string) {
  return document.objects.find((object) => object.id === id)!.geometry;
}

function parentOf(document: InteractiveCanvasDocument, id: string) {
  return document.objects.find((object) => object.id === id)!.parentId ?? null;
}

/** Pairs of sibling sections whose frames overlap. */
function sectionOverlaps(document: InteractiveCanvasDocument): string[] {
  const sections = document.objects.filter((object) => object.type === "section");
  return sections.flatMap((a, index) => sections.slice(index + 1).flatMap((b) => {
    if ((a.parentId ?? null) !== (b.parentId ?? null)) return [];
    const p = a.geometry;
    const q = b.geometry;
    const apart = p.x + p.width <= q.x || q.x + q.width <= p.x || p.y + p.height <= q.y || q.y + q.height <= p.y;
    return apart ? [] : [`${a.id}/${b.id}`];
  }));
}

/** A row of three sections, 60px apart, with a node far past the last one. */
function row(extra: Partial<Record<"b" | "c", Partial<InteractiveCanvasObject>>> = {}) {
  return makeDocument([
    section("page", -200, -200, 2400, 1000),
    section("a", 0, 0, 400, 300, "page"),
    child("kid", 200, 100, "a"),
    { ...section("b", 460, 0, 400, 300, "page"), ...extra.b },
    child("b-one", 500, 80, "b"),
    child("b-two", 660, 180, "b"),
    { ...section("c", 920, 0, 400, 300, "page"), ...extra.c },
    child("c-one", 960, 100, "c"),
    child("far", 1800, 100, "page"),
  ], [
    connect("inside-b", "b-one", "b-two"),
    connect("c-to-far", "c-one", "far"),
  ]);
}

/** kid ends at 460, 60px past a's right edge and still its child: a must grow from 400 to 500. */
const GROW_A = { id: "kid", by: { dx: 100, dy: 0 } };

describe("make room", () => {
  test("a grow into a neighbour section pushes it, and what it pushes, along the grow direction", () => {
    const session = makeTestSession(row(), ["a"]);

    const result = runOp(session, "move", GROW_A);

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("made room for a: pushed b, c clear of it");
    expect(geometryOf(session.draft, "a")).toEqual({ x: 0, y: 0, width: 500, height: 300 });
    // Both keep the 60px gutter they had, and neither moves across the direction.
    expect(geometryOf(session.draft, "b")).toEqual({ x: 560, y: 0, width: 400, height: 300 });
    expect(geometryOf(session.draft, "c")).toEqual({ x: 1020, y: 0, width: 400, height: 300 });
    expect(sectionOverlaps(session.draft)).toEqual([]);
  });

  test("a push leaves the room the label chip of a wire across the gutter needs", () => {
    const label = "the reply with every field the caller asked for";
    const document = row();
    const labelled = { ...document, connections: [...document.connections, { ...connect("kid-to-b", "kid", "b-one"), label }] };
    const session = makeTestSession(labelled, ["a"]);

    const result = runOp(session, "move", GROW_A);

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("made room for a: pushed b, c");
    // The chip, an arrowhead, the wire ends and clear line each side of the chip: 68 on top of the chip.
    const room = connectionLabelChipMetrics(label).width + 68;
    expect(room).toBeGreaterThan(100);
    const gutter = geometryOf(session.draft, "b").x - 500;
    expect(gutter).toBeGreaterThanOrEqual(room);
    expect(gutter).toBeLessThan(room + AGENT_GRID);
    // b to c carries no label: it keeps the 60px gutter it had.
    expect(geometryOf(session.draft, "c").x - geometryOf(session.draft, "b").x).toBe(460);
    expect(sectionOverlaps(session.draft)).toEqual([]);
  });

  test("a pushed section carries everything it holds", () => {
    const session = makeTestSession(row(), ["a"]);

    runOp(session, "move", GROW_A);

    expect(geometryOf(session.draft, "b-one")).toEqual({ x: 600, y: 80, width: 160, height: 100 });
    expect(geometryOf(session.draft, "b-two")).toEqual({ x: 760, y: 180, width: 160, height: 100 });
    expect(geometryOf(session.draft, "c-one")).toEqual({ x: 1060, y: 100, width: 160, height: 100 });
    for (const [id, parent] of [["b-one", "b"], ["b-two", "b"], ["c-one", "c"], ["b", "page"], ["c", "page"], ["kid", "a"]] as const) {
      expect(parentOf(session.draft, id)).toBe(parent);
    }
  });

  test("a neighbour with room to spare stays where it is", () => {
    const session = makeTestSession(row(), ["a"]);

    runOp(session, "move", GROW_A);

    // c lands at 1020..1420; far (at 1800) is still more than a gutter away.
    expect(geometryOf(session.draft, "far")).toEqual({ x: 1800, y: 100, width: 160, height: 100 });
  });

  test("a wide gutter is used up before the neighbour moves", () => {
    const baseline = makeDocument([
      section("page", -200, -200, 2400, 1000),
      section("a", 0, 0, 400, 300, "page"),
      child("kid", 200, 100, "a"),
      section("b", 640, 0, 400, 300, "page"),
    ]);
    const session = makeTestSession(baseline, ["a"]);

    // a grows to 500: 140px of the 240px gutter is left.
    runOp(session, "move", GROW_A);
    expect(geometryOf(session.draft, "a").width).toBe(500);
    expect(geometryOf(session.draft, "b").x).toBe(640);

    // a grows to 600: b moves to keep a 100px gutter.
    runOp(session, "move", GROW_A);
    expect(geometryOf(session.draft, "a").width).toBe(600);
    expect(geometryOf(session.draft, "b").x).toBe(700);
  });

  test("a neighbour that is not level with the grown frame stays", () => {
    const baseline = makeDocument([
      section("page", -200, -200, 2400, 1400),
      section("a", 0, 0, 400, 300, "page"),
      child("kid", 200, 100, "a"),
      section("below", 420, 400, 400, 300, "page"),
    ]);
    const session = makeTestSession(baseline, ["a"]);

    runOp(session, "move", GROW_A);

    expect(geometryOf(session.draft, "a").width).toBe(500);
    expect(geometryOf(session.draft, "below")).toEqual({ x: 420, y: 400, width: 400, height: 300 });
  });

  test("a grow downward pushes the section below, and the frame that holds both grows", () => {
    const baseline = makeDocument([
      section("page", -40, -80, 480, 760),
      section("a", 0, 0, 400, 300, "page"),
      child("kid", 40, 100, "a"),
      section("below", 0, 340, 400, 300, "page"),
      child("below-kid", 40, 440, "below"),
    ]);
    const session = makeTestSession(baseline, ["a"]);

    const result = runOp(session, "move", { id: "kid", by: { dx: 0, dy: 120 } });

    expect(result.isError).toBeUndefined();
    // kid ends at 320, so a grows to 360 and below keeps its 40px gutter.
    expect(geometryOf(session.draft, "a")).toEqual({ x: 0, y: 0, width: 400, height: 360 });
    expect(geometryOf(session.draft, "below")).toEqual({ x: 0, y: 400, width: 400, height: 300 });
    expect(geometryOf(session.draft, "below-kid").y).toBe(500);
    const page = geometryOf(session.draft, "page");
    expect(page.y + page.height).toBeGreaterThanOrEqual(700 + 40);
    expect(parentOf(session.draft, "below")).toBe("page");
  });

  test("wires stay attached: one inside a pushed section keeps its shape, one to a box that stayed routes again", () => {
    const baseline = row();
    const routed: InteractiveCanvasDocument = {
      ...baseline,
      connections: baseline.connections.map((connection) => connection.id === "inside-b"
        ? { ...connection, waypoints: [[740, 130], [740, 230]] }
        : { ...connection, waypoints: [[1500, 150], [1500, 130]] }),
    };
    const session = makeTestSession(routed, ["a"]);

    runOp(session, "move", GROW_A);

    const wire = (id: string) => session.draft.connections.find((connection) => connection.id === id)!;
    expect(wire("inside-b").from.objectId).toBe("b-one");
    expect(wire("inside-b").to.objectId).toBe("b-two");
    // b moved 100px right with both ends, so the hand route moved with it.
    expect(wire("inside-b").waypoints).toEqual([[840, 130], [840, 230]]);
    expect(wire("c-to-far").from.objectId).toBe("c-one");
    expect(wire("c-to-far").to.objectId).toBe("far");
    expect(wire("c-to-far").waypoints).toBeUndefined();
  });

  test("the accepted proposal replays to the same board", () => {
    const baseline = makeDocument([
      section("page", -200, -200, 2400, 1000),
      section("a", 0, 0, 400, 300, "page"),
      child("kid", 200, 100, "a"),
      // Off the 4px grid, like a hand-drawn import.
      section("b", 461.3, 1.7, 401.9, 303.2, "page"),
      child("b-one", 501.3, 81.7, "b"),
      child("loose", 921, 100, "page"),
    ]);
    const session = makeTestSession(baseline, ["a"]);

    runOp(session, "move", GROW_A);
    const replayed = reduceInteractiveCanvasState(createInteractiveCanvasState(baseline), {
      type: "canvas.applyAgentPatch",
      operations: diffDocuments(baseline, session.draft),
      summary: "accept",
    }).document;

    expect(geometryOf(session.draft, "b").x).toBeGreaterThan(500);
    expect(geometryOf(session.draft, "loose").x).toBeGreaterThan(921);
    expect(diffDocuments(replayed, session.draft)).toEqual([]);
  });

  test("a locked neighbour stays put, and the edit that would take it is refused", () => {
    const baseline = makeDocument([
      section("page", -200, -200, 2400, 1000),
      section("a", 0, 0, 400, 300, "page"),
      child("kid", 200, 100, "a"),
      // a, grown to 500, would cover 80% of this frame.
      { ...section("b", 420, 0, 100, 300, "page"), locked: "background" },
    ]);
    const session = makeTestSession(baseline, ["a"]);
    const before = session.draft;

    const result = runOp(session, "move", GROW_A);

    expect(result.isError).toBe(true);
    expect(result.text).toContain("the lock on b keeps it from being pushed clear");
    expect(result.text).toContain('Release the lock on b with lock mode "none"');
    expect(session.draft).toBe(before);
  });

  test("a lock further down the row stops the whole push", () => {
    const session = makeTestSession(row({ c: { locked: "all" } }), ["a"]);

    // a grows to 500 over b's left edge without taking a child of b: the grow
    // is made as before, and nothing is pushed because c cannot move.
    const result = runOp(session, "move", GROW_A);

    expect(result.isError).toBeUndefined();
    expect(result.text).not.toContain("made room");
    expect(geometryOf(session.draft, "a").width).toBe(500);
    expect(geometryOf(session.draft, "b").x).toBe(460);
    expect(geometryOf(session.draft, "c").x).toBe(920);
  });

  test("a locked frame around the row is a wall no push crosses", () => {
    const baseline = makeDocument([
      // Its right edge is at 600.
      { ...section("page", -40, -80, 640, 460), locked: "background" },
      section("a", 0, 0, 400, 300, "page"),
      child("kid", 200, 100, "a"),
      child("neighbor", 420, 220, "page", 100, 60),
    ]);
    const session = makeTestSession(baseline, ["a"]);
    const before = session.draft;

    // Pushed clear of a (500), neighbor would end at 640.
    const result = runOp(session, "move", GROW_A);

    expect(result.isError).toBe(true);
    expect(result.text).toContain("growing would pull neighbor into it");
    expect(result.text).toContain("the lock on page keeps it from being pushed clear");
    expect(session.draft).toBe(before);
  });
});
