/**
 * The lock gate across the whole gesture roster
 * (docs/30-agent-layout/50-tool-surface/10-gestures §Sections: "A lock gates
 * what every other tool may do to the frame and its descendants").
 *
 * A lock is stored as one field on a section, but it is enforced everywhere:
 * these cases pin the two modes apart ("background" pins the frame alone,
 * "all" freezes the frame and everything under it), pin the two exemptions
 * (`lock` and `unlock` are lock MANAGEMENT, not edits under a lock), and pin
 * the regional rule edges are judged by — an edge into a locked-all closure is
 * part of that closure, while a background lock never gates the wires between
 * the children it holds.
 */
import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import { makeTestSession, runOp } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

/** "ops" is frozen whole; "free"/"free-2" sit outside it on the same page. */
function lockedBoard(): InteractiveCanvasDocument {
  return makeDocument(
    [
      { ...box("page", 0, 0, 1200, 900, "section"), text: "Page" },
      {
        ...box("ops", 100, 100, 600, 400, "section"),
        text: "Ops",
        parentId: "page",
        locked: "all" as const,
      },
      { ...box("inside", 140, 180, 160, 100), parentId: "ops" },
      { ...box("inside-2", 420, 180, 160, 100), parentId: "ops" },
      { ...box("free", 800, 100, 160, 100), parentId: "page" },
      { ...box("free-2", 800, 400, 160, 100), parentId: "page" },
    ],
    [connect("in-edge", "inside", "inside-2"), connect("free-edge", "free", "free-2")],
  );
}

/** The page-frame shape every real board arrives with: pinned, contents live. */
function backgroundBoard(): InteractiveCanvasDocument {
  return makeDocument(
    [
      {
        ...box("page", 0, 0, 1200, 900, "section"),
        text: "Page",
        locked: "background" as const,
      },
      { ...box("child", 100, 100, 160, 100), parentId: "page" },
      { ...box("child-2", 500, 100, 160, 100), parentId: "page" },
    ],
    [connect("kids", "child", "child-2")],
  );
}

function lockedSession() {
  return makeTestSession(lockedBoard(), ["page"]);
}

/** Every refusal names the lock that stopped it and the call that lifts it. */
function expectLockRefusal(
  result: { isError?: boolean; text: string },
  clause: string,
): void {
  expect(result.isError).toBe(true);
  expect(result.text).toContain(clause);
  expect(result.text).toContain(
    "a lock is a don't-touch signal; unlock it first if the request requires editing here",
  );
}

describe("the reviewer's three repro cases", () => {
  test("move_by on a child of a locked-all section is refused", () => {
    const session = lockedSession();
    const draftBefore = session.draft;

    const result = runOp(session, "move_by", { id: "inside", dx: 20, dy: 0 });

    expectLockRefusal(result, 'id "inside" is inside "ops" (locked all)');
    expect(session.draft).toBe(draftBefore);
    expect(session.events).toEqual([]);
  });

  test("update_text on a child of a locked-all section is refused", () => {
    const session = lockedSession();
    const draftBefore = session.draft;

    const result = runOp(session, "update_text", { id: "inside", text: "Renamed" });

    expectLockRefusal(result, 'id "inside" is inside "ops" (locked all)');
    expect(session.draft).toBe(draftBefore);
  });

  test("move_by on the locked frame itself is refused", () => {
    const session = lockedSession();
    const draftBefore = session.draft;

    const result = runOp(session, "move_by", { id: "ops", dx: 20, dy: 20 });

    expectLockRefusal(result, 'id "ops" is locked (all)');
    expect(session.draft).toBe(draftBefore);
  });
});

describe("background pins the frame and nothing else", () => {
  test("the frame refuses its own mutation", () => {
    const session = makeTestSession(backgroundBoard(), ["page"]);

    const moved = runOp(session, "move_by", { id: "page", dx: 20, dy: 20 });
    expectLockRefusal(moved, 'id "page" is locked (background)');

    const resized = runOp(session, "resize", { id: "page", width: 800 });
    expectLockRefusal(resized, 'id "page" is locked (background)');

    const retitled = runOp(session, "update_text", { id: "page", text: "New page" });
    expectLockRefusal(retitled, 'id "page" is locked (background)');

    const restroked = runOp(session, "change_section_border", { id: "page", border: "dashed" });
    expectLockRefusal(restroked, 'id "page" is locked (background)');
  });

  test("what the frame holds stays editable — boxes, text, and the wires between them", () => {
    const session = makeTestSession(backgroundBoard(), ["page"]);

    const moved = runOp(session, "move_by", { id: "child", dx: 20, dy: 0 });
    expect(moved.isError).toBeUndefined();
    expect(session.draft.objects.find((object) => object.id === "child")?.geometry)
      .toMatchObject({ x: 120, y: 100 });

    const written = runOp(session, "update_text", { id: "child", text: "Renamed" });
    expect(written.isError).toBeUndefined();

    // A background lock says nothing about how its children are wired.
    const styled = runOp(session, "style_edge", { id: "kids", patch: { style: "dashed" } });
    expect(styled.isError).toBeUndefined();

    const drawn = runOp(session, "connect", {
      id: "kids-2",
      from: { objectId: "child-2" },
      to: { objectId: "child" },
    });
    expect(drawn.isError).toBeUndefined();
  });
});

describe("lock management is exempt from the lock", () => {
  test("unlock releases a locked frame", () => {
    const session = lockedSession();

    const released = runOp(session, "unlock", { id: "ops" });

    expect(released.isError).toBeUndefined();
    expect(released.text).toContain("APPLIED · unlock ops");
    expect(session.draft.objects.find((object) => object.id === "ops")?.locked)
      .toBeUndefined();
    // And the region it protected is editable again, in the same turn.
    const moved = runOp(session, "move_by", { id: "inside", dx: 20, dy: 0 });
    expect(moved.isError).toBeUndefined();
  });

  test("lock changes the mode of a lock that is already there", () => {
    const session = lockedSession();

    const result = runOp(session, "lock", { id: "ops", mode: "background" });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · lock ops background");
    expect(session.draft.objects.find((object) => object.id === "ops")?.locked)
      .toBe("background");
  });

  test("a frame inside a locked-all region can still be locked further", () => {
    const nested = makeDocument([
      { ...box("page", 0, 0, 1200, 900, "section"), text: "Page" },
      {
        ...box("ops", 100, 100, 600, 400, "section"),
        text: "Ops",
        parentId: "page",
        locked: "all" as const,
      },
      { ...box("bay", 140, 160, 300, 200, "section"), text: "Bay", parentId: "ops" },
    ]);
    const session = makeTestSession(nested, ["page"]);

    const result = runOp(session, "lock", { id: "bay", mode: "all" });

    expect(result.isError).toBeUndefined();
    expect(session.draft.objects.find((object) => object.id === "bay")?.locked).toBe("all");
  });
});

describe("edges are gated by the region their ends sit in", () => {
  test("an edge into a locked-all region is refused every way it can be edited", () => {
    const session = lockedSession();
    const draftBefore = session.draft;

    expectLockRefusal(
      runOp(session, "style_edge", { id: "in-edge", patch: { style: "dashed" } }),
      'id "in-edge" meets "inside", which is inside "ops" (locked all)',
    );
    expectLockRefusal(
      runOp(session, "reroute", { id: "in-edge", points: [[300, 240]] }),
      'is inside "ops" (locked all)',
    );
    expectLockRefusal(
      runOp(session, "reset_route", { id: "in-edge" }),
      'is inside "ops" (locked all)',
    );
    expectLockRefusal(
      runOp(session, "move_label", { id: "in-edge", along: 0.25 }),
      'is inside "ops" (locked all)',
    );
    expectLockRefusal(
      runOp(session, "update_text", { id: "in-edge", text: "hands off" }),
      'is inside "ops" (locked all)',
    );
    expectLockRefusal(
      runOp(session, "delete", { id: "in-edge" }),
      'is inside "ops" (locked all)',
    );
    expect(session.draft).toBe(draftBefore);
  });

  test("connect refuses a new wire into the protected region, from either end", () => {
    const session = lockedSession();

    expectLockRefusal(
      runOp(session, "connect", {
        id: "new-edge",
        from: { objectId: "free" },
        to: { objectId: "inside" },
      }),
      'to.objectId "inside" is inside "ops" (locked all)',
    );
    expectLockRefusal(
      runOp(session, "connect", {
        id: "new-edge",
        from: { objectId: "ops" },
        to: { objectId: "free" },
      }),
      'from.objectId "ops" is locked (all)',
    );
  });

  test("an edge between two free objects is untouched by the lock", () => {
    const session = lockedSession();

    const styled = runOp(session, "style_edge", { id: "free-edge", patch: { style: "dashed" } });
    expect(styled.isError).toBeUndefined();

    const drawn = runOp(session, "connect", {
      id: "new-edge",
      from: { objectId: "free-2" },
      to: { objectId: "free" },
    });
    expect(drawn.isError).toBeUndefined();
  });

  test("change_connection is gated on both the wire's region and the one it is pulled into", () => {
    const session = lockedSession();

    expectLockRefusal(
      runOp(session, "change_connection", {
        id: "free-edge",
        patch: { to: { objectId: "inside" } },
      }),
      'to.objectId "inside" is inside "ops" (locked all)',
    );
    expectLockRefusal(
      runOp(session, "change_connection", {
        id: "in-edge",
        patch: { to: { objectId: "free" } },
      }),
      'id "in-edge" meets "inside", which is inside "ops" (locked all)',
    );
  });
});

describe("the rest of the roster under a locked-all frame", () => {
  test("every gesture that writes the frame or its contents is refused", () => {
    const session = lockedSession();
    const draftBefore = session.draft;

    expectLockRefusal(
      runOp(session, "move_to", { id: "inside", x: 200, y: 200 }),
      'id "inside" is inside "ops" (locked all)',
    );
    expectLockRefusal(
      runOp(session, "resize", { id: "inside", width: 200 }),
      'id "inside" is inside "ops" (locked all)',
    );
    expectLockRefusal(
      runOp(session, "match_size", { id: "inside", like: "free" }),
      'id "inside" is inside "ops" (locked all)',
    );
    expectLockRefusal(
      runOp(session, "align", { ids: ["inside", "inside-2"], edge: "top" }),
      'ids "inside" is inside "ops" (locked all)',
    );
    expectLockRefusal(
      runOp(session, "space_out", { ids: ["inside", "inside-2"], axis: "horizontal", gap: 40 }),
      'ids "inside" is inside "ops" (locked all)',
    );
    expectLockRefusal(
      runOp(session, "change_color", { id: "inside", color: "teal" }),
      'id "inside" is inside "ops" (locked all)',
    );
    expectLockRefusal(
      runOp(session, "change_shape", { id: "inside", patch: { type: "diamond" } }),
      'id "inside" is inside "ops" (locked all)',
    );
    expectLockRefusal(
      runOp(session, "delete", { id: "inside" }),
      'id "inside" is inside "ops" (locked all)',
    );
    expectLockRefusal(runOp(session, "fit_section", { id: "ops" }), 'id "ops" is locked (all)');
    expectLockRefusal(
      runOp(session, "change_section_border", { id: "ops", border: "none" }),
      'id "ops" is locked (all)',
    );
    expectLockRefusal(runOp(session, "delete", { id: "ops" }), 'id "ops" is locked (all)');
    expect(session.draft).toBe(draftBefore);
  });

  test("one locked box refuses a whole multi-id arrangement", () => {
    const session = lockedSession();
    const draftBefore = session.draft;

    const result = runOp(session, "align", { ids: ["free", "inside"], edge: "left" });

    expectLockRefusal(result, 'ids "inside" is inside "ops" (locked all)');
    expect(session.draft).toBe(draftBefore);
  });

  test("a locked box can still be read: cloned, and used as a match_size source", () => {
    const document = lockedBoard();
    const source = document.objects.find((object) => object.id === "inside")!;
    source.geometry = { ...source.geometry, width: 240, height: 140 };
    const session = makeTestSession(document, ["page"]);

    // Nothing is written to the source, so nothing is protected by refusing it.
    const copy = runOp(session, "clone", { sourceId: "inside", id: "copy", at: [800, 700] });
    expect(copy.isError).toBeUndefined();
    expect(session.draft.objects.find((object) => object.id === "copy")?.locked)
      .toBeUndefined();

    const matched = runOp(session, "match_size", { id: "free", like: "inside" });
    expect(matched.isError).toBeUndefined();
    expect(matched.text).toContain("APPLIED · match_size free → 240×140 (matching inside)");
    expect(session.draft.objects.find((object) => object.id === "free")?.geometry)
      .toMatchObject({ width: 240, height: 140 });
  });

  test("a placement inside a locked-all frame lands on the board, not in the frame", () => {
    // Placements are ungated on purpose: the id is new, so no lock covers it,
    // and the membership reconcile already refuses to adopt anything into a
    // section locked "all" (sectionCanParent, canvas/state/section-membership).
    const session = lockedSession();

    const result = runOp(session, "place_sticky", {
      id: "note",
      text: "Inside?",
      at: [200, 220],
    });

    expect(result.isError).toBeUndefined();
    expect(session.draft.objects.find((object) => object.id === "note")?.parentId)
      .toBe("page");
  });
});
