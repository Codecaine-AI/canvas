/**
 * The gesture descriptors that landed in Phase 3 wave A — the Place group
 * (S3.1), the Sections group's border and lock gestures (S3.3), and `delete`
 * (S3.4).
 *
 * These live beside session-store-operations.test.ts rather than inside it:
 * that file pins the CRUD surface, which is retired wholesale in S3.8, while
 * this one pins the surface that replaces it.
 */
import { describe, expect, test } from "bun:test";

import { createInteractiveCanvasState } from "@codecaine-ai/canvas/actions";

import { handleApplyAgentPatch } from "../../canvas/src/state/actions/agent-patch";
import { CREATION_DEFAULTS } from "../src/service/session/tools/creation-defaults";
import { diffDocuments } from "../src/board/doc-diff";
import { makeTestSession, runOp } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

/** Every board here needs one section, because the board always keeps one. */
function boardWith(...objects: ReturnType<typeof box>[]) {
  return makeDocument([box("page", 0, 0, 1200, 900, "section"), ...objects]);
}

describe("place gestures", () => {
  test("place_section snaps an off-grid corner and reports what landed", () => {
    const session = makeTestSession(boardWith(), ["page"]);

    const result = runOp(session, "place_section", {
      id: "flow",
      text: "Flow",
      at: [241, 477],
    });

    expect(result.isError).toBeUndefined();
    // Snap, not reject: the summary is the APPLIED geometry, so the next
    // gesture computes off the truth rather than off what was asked for.
    expect(result.text).toContain("APPLIED · place_section flow 240,480 480×360");
    const placed = session.draft.objects.find((object) => object.id === "flow")!;
    expect(placed.type).toBe("section");
    expect(placed.text).toBe("Flow");
    expect(placed.geometry).toEqual({ x: 240, y: 480, width: 480, height: 360 });
    expect(placed.color).toBe(CREATION_DEFAULTS.section.color);
  });

  test("place_section snaps a drawn size too, and clamps nothing else", () => {
    const session = makeTestSession(boardWith(), ["page"]);

    const result = runOp(session, "place_section", {
      id: "flow",
      text: "Flow",
      at: [100, 100],
      size: { width: 313, height: 187 },
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · place_section flow 100,100 320×180");
    expect(session.draft.objects.find((object) => object.id === "flow")?.geometry)
      .toEqual({ x: 100, y: 100, width: 320, height: 180 });
  });

  test("place_sticky takes its whole box and color from the defaults", () => {
    const session = makeTestSession(boardWith(), ["page"]);

    const result = runOp(session, "place_sticky", {
      id: "note",
      text: "Remember",
      at: [58, 62],
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · place_sticky note 60,60 180×120");
    expect(session.draft.objects.find((object) => object.id === "note")).toMatchObject({
      type: "sticky",
      text: "Remember",
      color: CREATION_DEFAULTS.sticky.color,
      geometry: { x: 60, y: 60, width: 180, height: 120 },
    });
  });

  test("place_shape places a bare shape: no text, no direction, node defaults", () => {
    const session = makeTestSession(boardWith(), ["page"]);

    const result = runOp(session, "place_shape", {
      id: "step",
      type: "process",
      at: [200, 200],
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · place_shape step process 200,200 280×100");
    const placed = session.draft.objects.find((object) => object.id === "step")!;
    expect(placed.type).toBe("process");
    // The gesture carries only the pick and the click — labelling is
    // update_text, turning it is change_shape.
    expect(placed.text).toBe("");
    expect(placed.direction).toBeUndefined();
    expect(placed.icon).toBeUndefined();
    expect(placed.color).toBe(CREATION_DEFAULTS.shape.color);
    expect(placed.geometry).toEqual({ x: 200, y: 200, width: 280, height: 100 });
  });

  test("place_shape folds a glyph name onto the icon carrier and sizes it as an icon", () => {
    const session = makeTestSession(boardWith(), ["page"]);

    const result = runOp(session, "place_shape", {
      id: "cloud",
      type: "cloud",
      at: [400, 400],
    });

    expect(result.isError).toBeUndefined();
    // The model never sees {type:"icon", icon}; the folded name is what the
    // summary reports, both directions of the mapping agreeing.
    expect(result.text).toContain("APPLIED · place_shape cloud cloud 400,400 120×120");
    expect(session.draft.objects.find((object) => object.id === "cloud")).toMatchObject({
      type: "icon",
      icon: "cloud",
      geometry: { x: 400, y: 400, width: 120, height: 120 },
    });
  });

  test("a place gesture onto a taken id costs nothing", () => {
    const session = makeTestSession(boardWith(box("step", 200, 200)), ["page"]);
    const draftBefore = session.draft;

    const result = runOp(session, "place_shape", {
      id: "step",
      type: "process",
      at: [400, 400],
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('id "step" is already on the board');
    expect(session.draft).toBe(draftBefore);
    expect(session.events).toEqual([]);
  });
});

describe("clone", () => {
  const source = {
    ...box("source", 100, 100, 240, 160, "chevron"),
    text: "Source",
    color: "teal" as const,
    direction: "left" as const,
    style: { shape: "chevron" as const, strokeWidth: 6 },
  };

  test("copies kind, size, color, direction and style, and lands at the paste offset", () => {
    const session = makeTestSession(boardWith(source), ["page"]);

    const result = runOp(session, "clone", { sourceId: "source", id: "copy" });

    expect(result.isError).toBeUndefined();
    // The UI pastes at +24/+24; on the agent grid that is +20/+20.
    expect(result.text).toContain("APPLIED · clone copy from source 120,120 240×160");
    expect(session.draft.objects.find((object) => object.id === "copy")).toMatchObject({
      type: "chevron",
      text: "Source",
      color: "teal",
      direction: "left",
      style: { shape: "chevron", strokeWidth: 6 },
      geometry: { x: 120, y: 120, width: 240, height: 160 },
    });
  });

  test("carries a glyph, and `text` relabels the copy without touching the source", () => {
    const icon = {
      ...box("db", 300, 300, 120, 120, "icon"),
      text: "Store",
      icon: "database" as const,
    };
    const session = makeTestSession(boardWith(icon), ["page"]);

    const result = runOp(session, "clone", {
      sourceId: "db",
      id: "db-2",
      at: [641, 299],
      text: "Cache",
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · clone db-2 from db 640,300 120×120");
    expect(session.draft.objects.find((object) => object.id === "db-2")).toMatchObject({
      type: "icon",
      icon: "database",
      text: "Cache",
    });
    expect(session.draft.objects.find((object) => object.id === "db")?.text).toBe("Store");
  });

  test("`by` is a delta and snaps as one", () => {
    const session = makeTestSession(boardWith(source), ["page"]);

    const result = runOp(session, "clone", { sourceId: "source", id: "copy", by: [313, -7] });

    expect(result.isError).toBeUndefined();
    // 313 → 320, -7 → 0, applied to the source's own corner.
    expect(result.text).toContain("APPLIED · clone copy from source 420,100 240×160");
  });

  test("a cloned section arrives as the frame alone, and says so", () => {
    const frame = { ...box("frame", 200, 200, 400, 320, "section"), text: "Frame" };
    const child = { ...box("child", 240, 260), parentId: "frame" };
    const session = makeTestSession(makeDocument([frame, child]), ["frame"]);

    const result = runOp(session, "clone", { sourceId: "frame", id: "frame-2" });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · clone frame-2 from frame 220,220 400×320");
    expect(result.text).toContain("the frame copied without its 1 descendant");
    // Nothing but the frame: cloning descendants without cloning the edges
    // between them would half-copy the structure.
    expect(session.draft.objects.filter((object) => object.parentId === "frame-2"))
      .toHaveLength(0);
  });

  test("a lock is never copied", () => {
    const locked = {
      ...box("frame", 200, 200, 400, 320, "section"),
      text: "Frame",
      locked: "all" as const,
    };
    const session = makeTestSession(makeDocument([locked]), ["frame"]);

    const result = runOp(session, "clone", { sourceId: "frame", id: "frame-2" });

    expect(result.isError).toBeUndefined();
    expect(session.draft.objects.find((object) => object.id === "frame-2")?.locked)
      .toBeUndefined();
  });

  test("at and by together, a missing source, and an edge source are all refused", () => {
    const baseline = makeDocument(
      [box("page", 0, 0, 1200, 900, "section"), box("a", 100, 100), box("b", 500, 100)],
      [connect("a-b", "a", "b")],
    );
    const session = makeTestSession(baseline, ["page"]);
    const draftBefore = session.draft;

    const both = runOp(session, "clone", {
      sourceId: "a",
      id: "copy",
      at: [13, 47],
      by: [-9, 31],
      text: "A copy",
    });
    expect(both.isError).toBe(true);
    expect(both.text).toBe(
      'ERROR · clone — one position source per call: send clone {"sourceId":"a","id":"copy","at":[13,47],"text":"A copy"} '
      + 'to set the copy\'s absolute corner, or clone {"sourceId":"a","id":"copy","by":[-9,31],"text":"A copy"} '
      + "to offset it from the source — never both; omit both for the paste offset.",
    );

    const missing = runOp(session, "clone", { sourceId: "ghost", id: "copy" });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain('sourceId "ghost" is not on the board.');

    const edge = runOp(session, "clone", { sourceId: "a-b", id: "copy" });
    expect(edge.isError).toBe(true);
    expect(edge.text).toContain("edges are not cloned; draw the new one with connect.");

    expect(session.draft).toBe(draftBefore);
    expect(session.events).toEqual([]);
  });
});

describe("connect", () => {
  const baseline = makeDocument([
    box("page", 0, 0, 1200, 900, "section"),
    box("a", 100, 100),
    box("b", 600, 100),
  ]);

  test("routes an edge and names both ends", () => {
    const session = makeTestSession(baseline, ["page"]);

    const result = runOp(session, "connect", {
      id: "a-b",
      from: { objectId: "a" },
      to: { objectId: "b", anchor: "left" },
      label: "then",
      arrow: "forward",
      style: "dashed",
      color: "blue",
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · connect a-b a→b");
    expect(session.draft.connections).toHaveLength(1);
    expect(session.draft.connections[0]).toMatchObject({
      id: "a-b",
      from: { objectId: "a" },
      to: { objectId: "b", anchor: "left" },
      label: "then",
      arrow: "forward",
      style: "dashed",
      color: "blue",
    });
  });

  test("a second edge over the same pair applies with the duplicate warning", () => {
    const session = makeTestSession(baseline, ["page"]);

    runOp(session, "connect", { id: "a-b", from: { objectId: "a" }, to: { objectId: "b" } });
    const second = runOp(session, "connect", {
      id: "a-b-2",
      from: { objectId: "a" },
      to: { objectId: "b" },
    });

    expect(second.isError).toBeUndefined();
    expect(second.text).toContain("APPLIED · connect a-b-2 a→b");
    expect(second.text).toContain("possible duplicate of a-b");
    expect(session.draft.connections).toHaveLength(2);
  });

  test("a self-loop is refused, and the refusal names something buildable", () => {
    const session = makeTestSession(baseline, ["page"]);
    const draftBefore = session.draft;

    const result = runOp(session, "connect", {
      id: "loop",
      from: { objectId: "a" },
      to: { objectId: "a" },
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("self-loops are not supported by the connector router");
    // A "badge" is not an object this canvas has; the alternatives named must
    // be things the surface can actually place.
    expect(result.text).not.toContain("badge");
    expect(result.text).toContain("the node's own text");
    expect(result.text).toContain("sticky");
    expect(session.draft).toBe(draftBefore);
  });

  test("an endpoint that is not on the board is refused", () => {
    const session = makeTestSession(baseline, ["page"]);

    const result = runOp(session, "connect", {
      id: "a-ghost",
      from: { objectId: "a" },
      to: { objectId: "ghost" },
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('to.objectId "ghost" is not on the board.');
    expect(session.draft.connections).toEqual([]);
  });
});

describe("section gestures", () => {
  const frame = {
    ...box("frame", 100, 100, 400, 320, "section"),
    text: "Frame",
    style: { shape: "section" as const },
  };

  test("change_section_border restrokes the frame and keeps the rest of the style bag", () => {
    const session = makeTestSession(makeDocument([frame]), ["frame"]);

    const result = runOp(session, "change_section_border", { id: "frame", border: "dashed" });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · change_section_border frame dashed");
    expect(session.draft.objects.find((object) => object.id === "frame")?.style)
      .toEqual({ shape: "section", strokeStyle: "dashed" });
  });

  test("the border survives the diff and a commit replay through applyAgentPatch", () => {
    const baseline = makeDocument([frame]);
    const session = makeTestSession(baseline, ["frame"]);

    runOp(session, "change_section_border", { id: "frame", border: "none" });

    // The proposal is the baseline→draft diff, and the studio replays it
    // through the live reducer. `style` has to survive both hops or the change
    // dies between the tool result and the committed board.
    const operations = diffDocuments(baseline, session.draft);
    expect(operations).toContainEqual({
      type: "updateObject",
      objectId: "frame",
      patch: { style: { shape: "section", strokeStyle: "none" } },
    });

    const next = handleApplyAgentPatch(createInteractiveCanvasState(baseline), {
      type: "canvas.applyAgentPatch",
      operations,
    });
    expect(next.document.objects.find((object) => object.id === "frame")?.style)
      .toEqual({ shape: "section", strokeStyle: "none" });
  });

  test("lock and unlock write and clear the section's lock", () => {
    const session = makeTestSession(makeDocument([frame]), ["frame"]);

    const locked = runOp(session, "lock", { id: "frame", mode: "background" });
    expect(locked.isError).toBeUndefined();
    expect(locked.text).toContain("APPLIED · lock frame background");
    expect(session.draft.objects.find((object) => object.id === "frame")?.locked)
      .toBe("background");

    const released = runOp(session, "unlock", { id: "frame" });
    expect(released.isError).toBeUndefined();
    expect(released.text).toContain("APPLIED · unlock frame");
    expect(session.draft.objects.find((object) => object.id === "frame")?.locked)
      .toBeUndefined();
  });

  test("unlocking an unlocked frame is a no-op, not an error", () => {
    const session = makeTestSession(makeDocument([frame]), ["frame"]);
    const draftBefore = session.draft;

    const result = runOp(session, "unlock", { id: "frame" });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("NO-OP · unlock frame");
    expect(session.draft).toBe(draftBefore);
    expect(session.events).toEqual([]);
  });

  test("locking a shape is refused — the agent-side gate is the real one", () => {
    // The document schema and the studio validator both accept `locked` on any
    // object, so nothing below this boundary would stop it.
    const session = makeTestSession(boardWith(box("step", 200, 200)), ["page"]);
    const draftBefore = session.draft;

    const result = runOp(session, "lock", { id: "step", mode: "all" });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("ERROR · lock");
    expect(result.text).toContain('id "step" is a rectangle, not a frame');
    // The redirect names the gestures that DO act on a frame, and the one that
    // opens a new one — never a retired CRUD tool.
    expect(result.text).toContain("place_section opens one");
    expect(session.draft).toBe(draftBefore);
    expect(session.events).toEqual([]);
  });

  test("change_section_border is refused on a shape too", () => {
    const session = makeTestSession(boardWith(box("step", 200, 200)), ["page"]);

    const result = runOp(session, "change_section_border", { id: "step", border: "dashed" });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("ERROR · change_section_border");
  });
});

describe("delete", () => {
  test("deleting an object takes every edge attached to it", () => {
    const baseline = makeDocument(
      [
        box("page", 0, 0, 1200, 900, "section"),
        box("a", 100, 100),
        box("b", 600, 100),
        box("c", 100, 500),
      ],
      [connect("a-b", "a", "b"), connect("c-a", "c", "a"), connect("b-c", "b", "c")],
    );
    const session = makeTestSession(baseline, ["page"]);

    const result = runOp(session, "delete", { id: "a" });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · delete a (shape)");
    expect(result.text).toContain("attached edges removed with it: a-b, c-a");
    expect(session.draft.objects.some((object) => object.id === "a")).toBe(false);
    // The edge that never touched it stays.
    expect(session.draft.connections.map((connection) => connection.id)).toEqual(["b-c"]);
  });

  test("deleting a section takes its descendants and their edges", () => {
    const baseline = makeDocument(
      [
        box("page", 0, 0, 1200, 900, "section"),
        { ...box("frame", 100, 100, 400, 320, "section"), parentId: "page" },
        { ...box("inside", 140, 160), parentId: "frame" },
        { ...box("outside", 700, 100), parentId: "page" },
      ],
      [connect("in-out", "inside", "outside")],
    );
    const session = makeTestSession(baseline, ["page"]);

    const result = runOp(session, "delete", { id: "frame" });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · delete frame (section + 1 inside)");
    expect(session.draft.objects.map((object) => object.id)).toEqual(["page", "outside"]);
    expect(session.draft.connections).toEqual([]);
  });

  test("deleting an edge leaves the objects it joined", () => {
    const baseline = makeDocument(
      [box("page", 0, 0, 1200, 900, "section"), box("a", 100, 100), box("b", 600, 100)],
      [connect("a-b", "a", "b")],
    );
    const session = makeTestSession(baseline, ["page"]);

    const result = runOp(session, "delete", { id: "a-b" });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · delete a-b (connection)");
    expect(session.draft.connections).toEqual([]);
    expect(session.draft.objects.map((object) => object.id)).toEqual(["page", "a", "b"]);
  });

  test("the board's last section is refused, and an unknown id costs nothing", () => {
    const session = makeTestSession(boardWith(box("step", 200, 200)), ["page"]);
    const draftBefore = session.draft;

    const last = runOp(session, "delete", { id: "page" });
    expect(last.isError).toBe(true);
    expect(last.text).toContain("is the board's only section");

    const ghost = runOp(session, "delete", { id: "ghost" });
    expect(ghost.isError).toBe(true);
    expect(ghost.text).toBe('ERROR · delete — id "ghost" is not on the board.');

    expect(session.draft).toBe(draftBefore);
    expect(session.events).toEqual([]);
  });
});
