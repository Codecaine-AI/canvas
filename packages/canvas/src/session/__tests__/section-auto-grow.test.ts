/**
 * Section auto-grow: after any edit, a section whose child crosses its edge or
 * intrudes on its padding or title band grows outward to the fit_section air,
 * through its ancestors, with no fit_section call. It runs on both commit
 * paths (the agent's operations and Studio's reducer). It never shrinks, never
 * changes membership, and never touches a locked section; an agent edit whose
 * grow would capture a neighbor is refused.
 */
import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";

import { growSectionsToChildren } from "../../state/section-grow";
import { createInteractiveCanvasState, reduceInteractiveCanvasState } from "../../state/actions";
import { diffDocuments } from "../../board/doc-diff";
import { makeTestSession, runOp } from "./helpers";
import { box, makeDocument } from "./synthetic";

function section(id: string, x: number, y: number, width: number, height: number, parentId: string | null = null) {
  return { ...box(id, x, y, width, height, "section"), parentId } as InteractiveCanvasObject;
}

function child(id: string, x: number, y: number, parentId: string, width = 160, height = 100) {
  return { ...box(id, x, y, width, height), parentId };
}

/** Children whose box crosses their section's edge (what the containment lint used to report). */
function escapes(document: InteractiveCanvasDocument): string[] {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  return document.objects.filter((object) => {
    const parent = object.parentId ? byId.get(object.parentId) : undefined;
    if (!parent) return false;
    const a = object.geometry;
    const b = parent.geometry;
    return a.x < b.x || a.y < b.y || a.x + a.width > b.x + b.width || a.y + a.height > b.y + b.height;
  }).map((object) => object.id);
}

function geometryOf(document: InteractiveCanvasDocument, id: string) {
  return document.objects.find((object) => object.id === id)!.geometry;
}

describe("section auto-grow", () => {
  test("a child moved across its section's edge grows only that side, with no fit_section", () => {
    const baseline = makeDocument([
      section("page", 0, 0, 1200, 900),
      section("outer", 40, 40, 800, 600, "page"),
      child("kid", 100, 120, "outer"),
    ]);
    const session = makeTestSession(baseline, ["outer"]);

    // kid lands at 700..860: 20px past outer's right edge, still its child.
    const result = runOp(session, "move", { id: "kid", by: { dx: 600, dy: 0 } });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("grew outer to hold its children");
    // Right edge = child right + 40 of fit air; left, top and bottom stay put.
    expect(geometryOf(session.draft, "outer")).toEqual({ x: 40, y: 40, width: 860, height: 600 });
    expect(geometryOf(session.draft, "page")).toEqual(baseline.objects[0]!.geometry);
    expect(escapes(session.draft)).toEqual([]);
  });

  test("a nested section's growth carries out through its parent in the same edit", () => {
    const baseline = makeDocument([
      section("page", 0, 0, 1400, 1000),
      section("outer", 40, 40, 900, 700, "page"),
      section("inner", 80, 80, 800, 400, "outer"),
      child("kid", 120, 160, "inner"),
    ]);
    const session = makeTestSession(baseline, ["outer"]);

    // kid lands at 760..920, past inner (880); inner then crosses outer (940).
    runOp(session, "move", { id: "kid", by: { dx: 640, dy: 0 } });

    expect(geometryOf(session.draft, "inner")).toEqual({ x: 80, y: 80, width: 880, height: 400 });
    expect(geometryOf(session.draft, "outer")).toEqual({ x: 40, y: 40, width: 960, height: 700 });
    expect(session.draft.objects.find((object) => object.id === "kid")!.parentId).toBe("inner");
    expect(session.draft.objects.find((object) => object.id === "inner")!.parentId).toBe("outer");
    expect(escapes(session.draft)).toEqual([]);
  });

  test("the page frame grows like any section, so no child crosses its edge", () => {
    const baseline = makeDocument([
      section("page-frame", 0, 0, 1000, 700),
      section("lane", 40, 80, 600, 400, "page-frame"),
      child("kid", 80, 160, "lane"),
    ]);
    const session = makeTestSession(baseline, ["lane"]);

    // lane lands at 440..1040, 40px past the frame's right edge.
    runOp(session, "move", { id: "lane", by: { dx: 400, dy: 0 } });

    expect(geometryOf(session.draft, "page-frame")).toEqual({ x: 0, y: 0, width: 1080, height: 700 });
    expect(escapes(session.draft)).toEqual([]);
  });

  test("a section never shrinks on its own", () => {
    const baseline = makeDocument([
      section("page", 0, 0, 1200, 900),
      section("roomy", 40, 40, 1000, 800, "page"),
      child("kid", 100, 120, "roomy"),
    ]);
    const session = makeTestSession(baseline, ["roomy"]);

    runOp(session, "resize", { id: "kid", width: 120, height: 60 });

    expect(geometryOf(session.draft, "roomy")).toEqual({ x: 40, y: 40, width: 1000, height: 800 });
  });

  test("a locked section keeps its geometry", () => {
    const document = makeDocument([
      { ...section("held", 0, 0, 400, 300), locked: "background" },
      child("kid", 300, 100, "held"),
    ]);

    const { document: grown, grown: ids } = growSectionsToChildren(document);

    expect(ids).toEqual([]);
    expect(geometryOf(grown, "held")).toEqual({ x: 0, y: 0, width: 400, height: 300 });
  });

  test("a grow that would capture a neighbor is not made, and names the neighbor", () => {
    const document = makeDocument([
      section("a", 0, 0, 400, 300),
      child("kid", 300, 100, "a"),
      // Growing a to the right (to 500) would swallow 90% of this box.
      box("neighbor", 410, 100, 100, 100),
    ]);

    const { document: grown, grown: ids, blocked } = growSectionsToChildren(document);

    expect(ids).toEqual([]);
    expect(blocked).toEqual([{ section: "a", captures: ["neighbor"] }]);
    expect(grown).toBe(document);
  });

  test("an agent edit whose grow would capture a neighbor is refused and names it", () => {
    const baseline = makeDocument([
      section("page", -200, -200, 1600, 1000),
      section("a", 0, 0, 400, 300, "page"),
      child("kid", 200, 100, "a"),
      child("neighbor", 420, 220, "page", 100, 60),
    ]);
    const session = makeTestSession(baseline, ["a"]);
    const before = session.draft;

    // kid would end 60px past a's right edge; a cannot grow without taking neighbor.
    const result = runOp(session, "move", { id: "kid", by: { dx: 100, dy: 0 } });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("growing would pull neighbor into it");
    expect(session.draft).toBe(before);
    expect(escapes(session.draft)).toEqual([]);
  });

  test("a grow already stuck before the edit does not refuse an unrelated edit", () => {
    const baseline = makeDocument([
      section("page", -200, -200, 2000, 1200),
      section("a", 0, 0, 400, 300, "page"),
      child("kid", 300, 100, "a"),
      child("neighbor", 410, 100, "page", 100, 100),
      child("other", 1000, 400, "page"),
    ]);
    const session = makeTestSession(baseline, ["a"]);

    const result = runOp(session, "move", { id: "other", by: { dx: 40, dy: 0 } });

    expect(result.isError).toBeUndefined();
    expect(geometryOf(session.draft, "other").x).toBe(1040);
  });

  test("an edit that pushes a child past a frame whose grow was already stuck is refused", () => {
    // a's grow is stuck before the edit (kid sits in its right padding, and
    // growing would pull neighbor in), but kid is still inside the frame.
    const baseline = makeDocument([
      section("page", -200, -200, 1600, 1000),
      section("a", 0, 0, 400, 300, "page"),
      child("kid", 240, 100, "a"),
      child("neighbor", 400, 220, "page", 40, 60),
    ]);
    const session = makeTestSession(baseline, ["a"]);
    const before = session.draft;

    const result = runOp(session, "move", { id: "kid", by: { dx: 40, dy: 0 } });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("growing would pull neighbor into it");
    expect(session.draft).toBe(before);
    expect(escapes(session.draft)).toEqual([]);
  });

  test("a child's own overflow past a stuck frame cannot grow behind another child's larger overflow", () => {
    // old already sits 40px past a's right edge, and a's grow is stuck on
    // neighbor. Pushing kid 20px past that edge is still a new overflow.
    const baseline = makeDocument([
      section("page", -200, -200, 1600, 1200),
      section("a", 0, 0, 400, 500, "page"),
      child("old", 280, 100, "a"),
      child("kid", 200, 320, "a"),
      child("neighbor", 420, 220, "page", 100, 60),
    ]);
    const session = makeTestSession(baseline, ["a"]);
    const before = session.draft;

    const result = runOp(session, "move", { id: "kid", by: { dx: 60, dy: 0 } });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("growing would pull neighbor into it");
    expect(session.draft).toBe(before);
  });

  test("a child moved into the title band grows the top edge outward", () => {
    const baseline = makeDocument([
      section("page", -200, -200, 1600, 1000),
      { ...section("a", 0, 0, 400, 300, "page"), text: "Section heading" },
      child("kid", 40, 100, "a"),
    ]);
    const session = makeTestSession(baseline, ["a"]);

    // kid lands at y=20, inside the 27px title chip's band and still inside the frame.
    runOp(session, "move", { id: "kid", by: { dx: 0, dy: -80 } });

    // Top = kid top - (40 padding + 40 title band); the other sides keep their air.
    expect(geometryOf(session.draft, "a")).toEqual({ x: 0, y: -60, width: 400, height: 360 });
  });

  test("a grow stops at a locked parent's edge instead of crossing it", () => {
    const document = makeDocument([
      { ...section("held", 0, 0, 1000, 701.5), locked: "background" },
      section("lane", 100, 100, 400, 590, "held"),
      // 10px above lane's bottom: under the trigger, so lane wants to grow to 720.
      child("kid", 140, 480, "lane", 160, 200),
    ]);

    const { document: grown, grown: ids } = growSectionsToChildren(document);

    expect(ids).toEqual(["lane"]);
    expect(geometryOf(grown, "lane")).toEqual({ x: 100, y: 100, width: 400, height: 600 });
    expect(escapes(grown)).toEqual([]);
  });

  test("a grow against an off-grid locked parent edge never pulls that edge in", () => {
    // lane's bottom sits on held's off-grid bottom (701.5); kid ends 1px above it.
    const document = makeDocument([
      { ...section("held", 0, 0, 1000, 701.5), locked: "background" },
      section("lane", 100, 100, 400, 601.5, "held"),
      child("kid", 140, 200, "lane", 160, 501),
    ]);

    const { document: grown } = growSectionsToChildren(document);

    expect(geometryOf(grown, "lane")).toEqual({ x: 100, y: 100, width: 400, height: 601.5 });
    expect(escapes(grown)).toEqual([]);
  });

  test("a grow that keeps an off-grid edge at a locked parent's edge keeps it after accept", () => {
    // lane's bottom sits on held's off-grid bottom (701.5) and tall ends 1px
    // above it. Moving the other child grows lane's right side only.
    const baseline = makeDocument([
      { ...section("held", 0, 0, 1000, 701.5), locked: "background" },
      section("lane", 100, 100, 400, 601.5, "held"),
      child("tall", 140, 200, "lane", 160, 501),
      child("moving", 300, 160, "lane", 160, 60),
    ]);
    const session = makeTestSession(baseline, ["lane"]);

    runOp(session, "move", { id: "moving", by: { dx: 60, dy: 0 } });
    const replayed = reduceInteractiveCanvasState(createInteractiveCanvasState(baseline), {
      type: "canvas.applyAgentPatch",
      operations: diffDocuments(baseline, session.draft),
      summary: "accept",
    }).document;

    expect(geometryOf(replayed, "lane")).toEqual({ x: 100, y: 100, width: 460, height: 601.5 });
    expect(escapes(replayed)).toEqual([]);
    expect(diffDocuments(replayed, session.draft)).toEqual([]);
  });

  test("a left grow keeps an off-grid right edge at a locked parent's edge after accept", () => {
    // lane's right side sits on held's off-grid right (1001.5) and tall ends
    // 0.5px inside it. Moving the other child left grows lane's left side,
    // which changes its width; the accept must keep its right edge.
    const baseline = makeDocument([
      { ...section("held", 0, 0, 1001.5, 800), locked: "background" },
      section("lane", 100, 100, 901.5, 600, "held"),
      child("tall", 840, 300, "lane", 161, 100),
      child("moving", 140, 200, "lane", 160, 60),
    ]);
    const session = makeTestSession(baseline, ["lane"]);

    runOp(session, "move", { id: "moving", by: { dx: -60, dy: 0 } });
    const replayed = reduceInteractiveCanvasState(createInteractiveCanvasState(baseline), {
      type: "canvas.applyAgentPatch",
      operations: diffDocuments(baseline, session.draft),
      summary: "accept",
    }).document;

    expect(geometryOf(replayed, "lane")).toEqual({ x: 40, y: 100, width: 961.5, height: 600 });
    expect(escapes(replayed)).toEqual([]);
    expect(diffDocuments(replayed, session.draft)).toEqual([]);
  });

  test("a grow on an off-grid frame replays through the reducer to the same document", () => {
    const baseline = makeDocument([
      section("page", 0, 0, 2000, 1400),
      section("hand", 101.3, 97.7, 401.9, 303.2, "page"),
      child("kid", 140, 160, "hand"),
    ]);
    const session = makeTestSession(baseline, ["hand"]);

    runOp(session, "move", { id: "kid", by: { dx: 220, dy: 0 } });
    const replayed = reduceInteractiveCanvasState(createInteractiveCanvasState(baseline), {
      type: "canvas.applyAgentPatch",
      operations: diffDocuments(baseline, session.draft),
      summary: "accept",
    }).document;

    expect(geometryOf(session.draft, "hand")).not.toEqual(geometryOf(baseline, "hand"));
    expect(diffDocuments(replayed, session.draft)).toEqual([]);
  });

  test("a child close to a side but past the 20px trigger leaves the frame alone", () => {
    const document = makeDocument([
      section("a", 0, 0, 400, 300),
      child("kid", 20, 80, "a"),
    ]);

    expect(growSectionsToChildren(document).grown).toEqual([]);
  });
});

describe("section auto-grow in Studio", () => {
  const baseline = () => makeDocument([
    section("page", 0, 0, 1200, 900),
    section("outer", 40, 40, 800, 600, "page"),
    child("kid", 100, 120, "outer"),
  ]);

  test("a keyboard move across the edge grows the section like the move tool", () => {
    let state = createInteractiveCanvasState(baseline());
    state = reduceInteractiveCanvasState(state, { type: "canvas.select", selection: { kind: "objects", objectIds: ["kid"] } });
    state = reduceInteractiveCanvasState(state, { type: "canvas.moveSelection", dx: 600, dy: 0, snap: false });

    const session = makeTestSession(baseline(), ["outer"]);
    runOp(session, "move", { id: "kid", by: { dx: 600, dy: 0 } });

    expect(geometryOf(state.document, "outer")).toEqual({ x: 40, y: 40, width: 860, height: 600 });
    expect(geometryOf(state.document, "outer")).toEqual(geometryOf(session.draft, "outer"));
    expect(escapes(state.document)).toEqual([]);
  });

  test("the end of a drag grows the section the child was dropped in", () => {
    let state = createInteractiveCanvasState(baseline());
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObjectGeometries",
      geometries: { kid: { x: 700, y: 120, width: 160, height: 100 } },
      recordHistory: true,
      snap: false,
    });
    state = reduceInteractiveCanvasState(state, { type: "canvas.reconcileSectionMembership", recordHistory: false });

    expect(geometryOf(state.document, "outer")).toEqual({ x: 40, y: 40, width: 860, height: 600 });
    expect(escapes(state.document)).toEqual([]);
  });
});
