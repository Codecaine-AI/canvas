/**
 * `arrange` flow: sibling sections and free nodes laid out again in the
 * reading order they sit in, every gutter one gap, the empty space packed
 * out. Sections carry what they hold, wires stay attached, and the parent
 * grows to hold the block.
 */
import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";

import { createInteractiveCanvasState, reduceInteractiveCanvasState } from "../../state/actions";
import { diffDocuments } from "../../board/doc-diff";
import { connectionLabelChipMetrics } from "../../connectors/label-chip";
import { AGENT_GRID } from "../tools/grid";
import { makeTestSession, runOp } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

function section(id: string, x: number, y: number, width = 400, height = 300, parentId: string | null = "page") {
  return { ...box(id, x, y, width, height, "section"), parentId } as InteractiveCanvasObject;
}

function node(id: string, x: number, y: number, parentId: string) {
  return { ...box(id, x, y, 160, 100), parentId };
}

function at(document: InteractiveCanvasDocument, id: string) {
  const { x, y } = document.objects.find((object) => object.id === id)!.geometry;
  return [x, y];
}

function parentOf(document: InteractiveCanvasDocument, id: string) {
  return document.objects.find((object) => object.id === id)!.parentId ?? null;
}

/**
 * Two ragged rows on one page. Row one: a, then b 60px on and 40px lower,
 * then c past a 540px hole. Row two starts 360px under row one: d and a
 * free node.
 */
function ragged(extra: Partial<Record<"b", Partial<InteractiveCanvasObject>>> = {}) {
  return makeDocument([
    section("page", -200, -200, 3000, 2000, null),
    section("a", 0, 0),
    node("a-one", 40, 80, "a"),
    { ...section("b", 460, 40), ...extra.b },
    node("b-one", 500, 120, "b"),
    node("b-two", 680, 220, "b"),
    section("c", 1400, 0),
    node("c-one", 1440, 80, "c"),
    section("d", 0, 700),
    node("d-one", 40, 780, "d"),
    node("solo", 500, 760, "page"),
  ], [
    { ...connect("inside-b", "b-one", "b-two"), waypoints: [[760, 170]] },
    { ...connect("a-to-c", "a-one", "c-one"), waypoints: [[900, 130]] },
  ]);
}

const ALL = ["a", "b", "c", "d", "solo"];

describe("arrange flow", () => {
  test("every gutter becomes the gap, in the reading order the boxes sit in", () => {
    const session = makeTestSession(ragged(), ["page"]);

    const result = runOp(session, "arrange", { ids: ALL, flow: { axis: "x", gap: 100 } });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("arrange flow x gap 100 · rows a | b | c // d | solo");
    // Row one: 100 between a, b and c. b keeps its 40px drop.
    expect(at(session.draft, "a")).toEqual([0, 0]);
    expect(at(session.draft, "b")).toEqual([500, 40]);
    expect(at(session.draft, "c")).toEqual([1000, 0]);
    // Row two: 100 under b, the lowest box of row one. solo keeps its 60px drop.
    expect(at(session.draft, "d")).toEqual([0, 440]);
    expect(at(session.draft, "solo")).toEqual([500, 500]);
  });

  test("a gutter that a labelled wire crosses is as wide as its chip needs", () => {
    const label = "the reply with every field the caller asked for";
    const document = ragged();
    const labelled = { ...document, connections: [...document.connections, { ...connect("a-to-b", "a-one", "b-one"), label }] };
    const session = makeTestSession(labelled, ["page"]);

    const result = runOp(session, "arrange", { ids: ALL, flow: { axis: "x", gap: 100 } });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("arrange flow x gap 100 (1 wider for its label chip) · rows a | b | c // d | solo");
    // The chip, an arrowhead, the wire ends and clear line each side of the chip: 68 on top of the chip.
    const room = connectionLabelChipMetrics(label).width + 68;
    expect(room).toBeGreaterThan(100);
    const gutter = at(session.draft, "b")[0]! - 400;
    expect(gutter).toBeGreaterThanOrEqual(room);
    expect(gutter).toBeLessThan(room + AGENT_GRID);
    // The unlabelled gutters keep the gap.
    expect(at(session.draft, "c")[0]! - at(session.draft, "b")[0]!).toBe(500);
    expect(at(session.draft, "d")).toEqual([0, 440]);
  });

  test("a gap with room for the chip stays the gap", () => {
    const document = ragged();
    const labelled = { ...document, connections: [...document.connections, { ...connect("a-to-b", "a-one", "b-one"), label: "ok" }] };
    const session = makeTestSession(labelled, ["page"]);

    const result = runOp(session, "arrange", { ids: ALL, flow: { axis: "x", gap: 200 } });

    expect(result.text).toContain("arrange flow x gap 200 · rows");
    expect(at(session.draft, "b")).toEqual([600, 40]);
  });

  test("a section carries what it holds, and nothing changes parent", () => {
    const session = makeTestSession(ragged(), ["page"]);

    runOp(session, "arrange", { ids: ALL, flow: { axis: "x", gap: 100 } });

    expect(at(session.draft, "b-one")).toEqual([540, 120]);
    expect(at(session.draft, "b-two")).toEqual([720, 220]);
    expect(at(session.draft, "c-one")).toEqual([1040, 80]);
    expect(at(session.draft, "d-one")).toEqual([40, 520]);
    for (const [id, parent] of [["b-one", "b"], ["c-one", "c"], ["d-one", "d"], ["solo", "page"], ["c", "page"]]) {
      expect(parentOf(session.draft, id!)).toBe(parent!);
    }
  });

  test("with no gap named, sections get the 200 gutter and free nodes the 100 one", () => {
    const sections = makeTestSession(ragged(), ["page"]);
    const sectionResult = runOp(sections, "arrange", { ids: ALL, flow: { axis: "x" } });
    expect(sectionResult.text).toContain("arrange flow x gap 200");
    expect(at(sections.draft, "b")).toEqual([600, 40]);
    expect(at(sections.draft, "d")).toEqual([0, 540]);

    const nodes = makeTestSession(makeDocument([
      section("page", -200, -200, 3000, 2000, null),
      node("one", 0, 0, "page"),
      node("two", 180, 0, "page"),
      node("three", 900, 20, "page"),
    ]), ["page"]);
    const nodeResult = runOp(nodes, "arrange", { ids: ["one", "two", "three"], flow: { axis: "x", gap: null } });
    expect(nodeResult.text).toContain("arrange flow x gap 100 · rows one | two | three");
    expect(at(nodes.draft, "two")).toEqual([260, 0]);
    expect(at(nodes.draft, "three")).toEqual([520, 20]);
  });

  test("axis y keeps the columns and reads each top to bottom", () => {
    const session = makeTestSession(makeDocument([
      section("page", -200, -200, 3000, 2000, null),
      section("a", 0, 0),
      section("d", 0, 700),
      section("c", 1400, 0),
      section("e", 1400, 360),
    ]), ["page"]);

    const result = runOp(session, "arrange", { ids: ["a", "c", "d", "e"], flow: { axis: "y", gap: 100 } });

    expect(result.text).toContain("arrange flow y gap 100 · columns a | d // c | e");
    expect(at(session.draft, "d")).toEqual([0, 400]);
    expect(at(session.draft, "c")).toEqual([500, 0]);
    expect(at(session.draft, "e")).toEqual([500, 400]);
  });

  test("boxes that overlap come apart, in reading order", () => {
    const session = makeTestSession(makeDocument([
      section("page", -200, -200, 3000, 2000, null),
      section("a", 0, 0),
      section("b", 300, 200),
    ]), ["page"]);

    const result = runOp(session, "arrange", { ids: ["a", "b"], flow: { axis: "x", gap: 100 } });

    expect(result.isError).toBeUndefined();
    expect(at(session.draft, "a")).toEqual([0, 0]);
    // No room beside a within the pair's own width, so b starts the next line.
    expect(at(session.draft, "b")).toEqual([0, 400]);
  });

  test("a wire inside a moved section keeps its bends, and a wire whose ends moved apart routes again", () => {
    const session = makeTestSession(ragged(), ["page"]);

    runOp(session, "arrange", { ids: ALL, flow: { axis: "x", gap: 100 } });

    const wire = (id: string) => session.draft.connections.find((connection) => connection.id === id)!;
    expect(wire("inside-b").waypoints).toEqual([[800, 170]]);
    expect(wire("a-to-c").waypoints).toBeUndefined();
    expect(wire("a-to-c").from.objectId).toBe("a-one");
    expect(wire("a-to-c").to.objectId).toBe("c-one");
  });

  test("the parent grows to hold the block, and makes room for itself", () => {
    const session = makeTestSession(makeDocument([
      section("page", -200, -200, 3000, 2000, null),
      section("a", 0, 0),
      node("one", 40, 80, "a"),
      node("two", 220, 80, "a"),
      section("b", 460, 0),
      node("b-one", 500, 80, "b"),
    ]), ["page"]);

    // two lands at x 400..560, wholly past a's old right edge.
    const result = runOp(session, "arrange", { ids: ["one", "two"], flow: { axis: "x", gap: 200 } });

    expect(result.isError).toBeUndefined();
    expect(at(session.draft, "two")).toEqual([400, 80]);
    expect(parentOf(session.draft, "two")).toBe("a");
    expect(session.draft.objects.find((object) => object.id === "a")!.geometry.width).toBe(600);
    expect(result.text).toContain("made room for a: pushed b clear of it");
    expect(at(session.draft, "b")[0]).toBeGreaterThanOrEqual(640);
  });

  test("the accepted proposal replays to the same board", () => {
    const baseline = makeDocument([
      section("page", -200, -200, 3000, 2000, null),
      section("a", 0, 0),
      // Off the 4px grid, like a hand-drawn import.
      section("b", 461.3, 41.7, 401.9, 303.2),
      node("b-one", 501.3, 121.7, "b"),
      section("c", 1400, 0),
      node("c-one", 1440, 80, "c"),
    ]);
    const session = makeTestSession(baseline, ["page"]);

    runOp(session, "arrange", { ids: ["a", "b", "c"], flow: { axis: "x", gap: 100 } });
    const replayed = reduceInteractiveCanvasState(createInteractiveCanvasState(baseline), {
      type: "canvas.applyAgentPatch",
      operations: diffDocuments(baseline, session.draft),
      summary: "accept",
    }).document;

    expect(at(session.draft, "b")).toEqual([500, 40]);
    expect(diffDocuments(replayed, session.draft)).toEqual([]);
  });

  test("boxes already in flow are a no-op", () => {
    const session = makeTestSession(ragged(), ["page"]);
    runOp(session, "arrange", { ids: ALL, flow: { axis: "x", gap: 100 } });
    const flowed = session.draft;

    const again = runOp(session, "arrange", { ids: ALL, flow: { axis: "x", gap: 100 } });

    expect(again.text).toContain("NO-OP");
    expect(session.draft).toBe(flowed);
  });

  test("boxes of two parents are refused", () => {
    const session = makeTestSession(ragged(), ["page"]);
    const before = session.draft;

    const result = runOp(session, "arrange", { ids: ["a-one", "b"], flow: { axis: "x", gap: 100 } });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("flow lays out boxes that share one parent");
    expect(result.text).toContain("a-one in a; b in page");
    expect(session.draft).toBe(before);
  });

  test("a flow that would land on a sibling the call left out is refused", () => {
    const session = makeTestSession(ragged(), ["page"]);
    const before = session.draft;

    // b would land at x 1100..1500, over c at 1400.
    const result = runOp(session, "arrange", { ids: ["a", "b"], flow: { axis: "x", gap: 700 } });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("flow would put b over c, which the call does not list");
    expect(session.draft).toBe(before);
  });

  test("an overlap the board already has is refused only when the flow deepens it", () => {
    // two sits 20px over wall, which neither call lists.
    const board = () => makeTestSession(makeDocument([
      section("page", -200, -200, 3000, 2000, null),
      node("one", 0, 0, "page"),
      node("two", 200, 0, "page"),
      section("wall", 340, -100),
    ]), ["page"]);

    const deeper = board();
    const refused = runOp(deeper, "arrange", { ids: ["one", "two"], flow: { axis: "x", gap: 100 } });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("flow would put two over wall, which the call does not list");

    const clear = board();
    const applied = runOp(clear, "arrange", { ids: ["one", "two"], flow: { axis: "x", gap: 20 } });
    expect(applied.isError).toBeUndefined();
    expect(at(clear.draft, "two")).toEqual([180, 0]);
    expect(parentOf(clear.draft, "two")).toBe("page");
  });

  test("a locked box refuses the whole flow", () => {
    const session = makeTestSession(ragged({ b: { locked: "all" } }), ["page"]);
    const before = session.draft;

    const result = runOp(session, "arrange", { ids: ALL, flow: { axis: "x", gap: 100 } });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('ids "b"');
    expect(session.draft).toBe(before);
  });

  test("flow is one of three modes, and exactly one is sent", () => {
    const session = makeTestSession(ragged(), ["page"]);

    const two = runOp(session, "arrange", { ids: ALL, align: "top", flow: { axis: "x" } });
    const none = runOp(session, "arrange", { ids: ALL });

    expect(two.text).toContain("send exactly one of align, space or flow, not several");
    expect(none.text).toContain("send exactly one of align, space or flow");
  });
});
