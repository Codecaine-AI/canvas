import { describe, expect, test } from "bun:test";

import {
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
} from "../../state/actions";
import type { InteractiveCanvasDocument } from "../../state/schema";

import { diffDocuments } from "../../board/doc-diff";
import { textFitReport } from "../../board/text-fit";
import { findOperationTool } from "../tools/operations";
import { makeTestSession, runOp } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

function objectOf(document: InteractiveCanvasDocument, id: string) {
  return document.objects.find((object) => object.id === id)!;
}

function connectionOf(document: InteractiveCanvasDocument, id: string) {
  return document.connections.find((connection) => connection.id === id)!;
}

/**
 * The D6 acceptance shape: replay the committed proposal through the live
 * reducer and the connection state has to match what the tool result already
 * reported. The reducer's own waypoint reconcile runs on that replay, so this
 * is what catches a draft the commit would silently re-route (or re-translate).
 */
function expectReplayMatchesDraft(session: ReturnType<typeof makeTestSession>): void {
  const operations = diffDocuments(session.baseline, session.draft);
  const replayed = reduceInteractiveCanvasState(
    createInteractiveCanvasState(session.baseline),
    { type: "canvas.applyAgentPatch", operations, summary: "arrange" },
  );
  expect(replayed.document.connections).toEqual(session.draft.connections);
}

/** A frame with two children and a wire between them, all on the 20 grid. */
function framedBoard(): InteractiveCanvasDocument {
  return makeDocument(
    [
      { ...box("frame", 0, 0, 600, 400, "section"), text: "Frame" },
      { ...box("a", 40, 60, 160, 100), parentId: "frame" },
      { ...box("b", 380, 60, 160, 100), parentId: "frame" },
    ],
    [connect("a-b", "a", "b")],
  );
}

describe("arrange · move to", () => {
  test("puts the top-left where asked, on the grid, and reports what landed", () => {
    const session = makeTestSession(makeDocument([box("alpha", 0, 0, 160, 100)]), ["alpha"]);

    const result = runOp(session, "move", { id: "alpha", to: { x: 241, y: 477 } });

    expect(result.isError).toBeUndefined();
    // The APPLIED line reports the POST-SNAP geometry, not the request.
    expect(result.text).toContain("APPLIED · move alpha → (240, 480)");
    expect(objectOf(session.draft, "alpha").geometry).toEqual({
      x: 240,
      y: 480,
      width: 160,
      height: 100,
    });
  });

  test("a section carries its contents, and containment is unchanged", () => {
    const session = makeTestSession(framedBoard(), ["frame"]);

    const result = runOp(session, "move", { id: "frame", to: { x: 200, y: 100 } });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · move frame → (200, 100) (carrying 2)");
    // Every member of the closed set moved by the same delta …
    expect(objectOf(session.draft, "frame").geometry).toMatchObject({ x: 200, y: 100 });
    expect(objectOf(session.draft, "a").geometry).toMatchObject({ x: 240, y: 160 });
    expect(objectOf(session.draft, "b").geometry).toMatchObject({ x: 580, y: 160 });
    // … which is exactly why a rigid move cannot change what a frame holds.
    expect(objectOf(session.draft, "a").parentId).toBe("frame");
    expect(objectOf(session.draft, "b").parentId).toBe("frame");
  });

  test("an edge id is refused with the re-route redirect", () => {
    const session = makeTestSession(framedBoard(), ["frame"]);
    const draftBefore = session.draft;

    const result = runOp(session, "move", { id: "a-b", to: { x: 100, y: 100 } });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("ERROR · move");
    expect(result.text).toContain('id "a-b" is an edge');
    expect(result.text).toContain("re-routes itself");
    expect(session.draft).toBe(draftBefore);
  });
});

describe("arrange · move by", () => {
  test("nudges by a snapped delta and reports where the box ended up", () => {
    const session = makeTestSession(makeDocument([box("alpha", 100, 100, 160, 100)]), ["alpha"]);

    const result = runOp(session, "move", { id: "alpha", by: { dx: 17, dy: -33 } });

    // 17 → 20 and -33 → -40: deltas snap the same way absolutes do, so a chain
    // of nudges never accumulates off-grid drift.
    expect(result.text).toContain("APPLIED · move alpha +20,-40 → (120, 60)");
    expect(objectOf(session.draft, "alpha").geometry).toMatchObject({ x: 120, y: 60 });
  });

  test("a section nudge carries its contents too", () => {
    const session = makeTestSession(framedBoard(), ["frame"]);

    runOp(session, "move", { id: "frame", by: { dx: 20, dy: 20 } });

    expect(objectOf(session.draft, "a").geometry).toMatchObject({ x: 60, y: 80 });
    expect(objectOf(session.draft, "b").geometry).toMatchObject({ x: 400, y: 80 });
  });
});

describe("arrange · move modes", () => {
  test("a call with neither to nor by, or with both, is refused and moves nothing", () => {
    const session = makeTestSession(makeDocument([box("alpha", 100, 100, 160, 100)]), ["alpha"]);
    const draftBefore = session.draft;

    const neither = runOp(session, "move", { id: "alpha" });
    const nulls = runOp(session, "move", { id: "alpha", to: null, by: null });
    const both = runOp(session, "move", { id: "alpha", to: { x: 0, y: 0 }, by: { dx: 20, dy: 0 } });

    expect(neither.text).toBe(
      "ERROR · move — send exactly one of to or by — to puts the top-left corner at a point,"
      + " by nudges the box by an offset.",
    );
    expect(nulls.text).toBe(neither.text);
    expect(both.text).toBe("ERROR · move — send exactly one of to or by, not both.");
    expect(session.draft).toBe(draftBefore);
    expect(session.events).toEqual([]);
  });

  test("a null mode counts as absent, so the other mode runs", () => {
    const session = makeTestSession(makeDocument([box("alpha", 100, 100, 160, 100)]), ["alpha"]);

    const nudged = runOp(session, "move", { id: "alpha", to: null, by: { dx: 20, dy: 0 } });
    expect(nudged.text).toContain("APPLIED · move alpha +20,+0 → (120, 100)");

    const placed = runOp(session, "move", { id: "alpha", to: { x: 400, y: 200 }, by: null });
    expect(placed.text).toContain("APPLIED · move alpha → (400, 200)");
  });

  test("a move to where the box already is names the box in its no-op", () => {
    const session = makeTestSession(makeDocument([box("alpha", 100, 100, 160, 100)]), ["alpha"]);

    const result = runOp(session, "move", { to: { x: 100, y: 100 }, id: "alpha" });

    expect(result.isError).toBeUndefined();
    expect(result.text).toBe("NO-OP · move alpha — the board already matches this, so nothing changed.");
  });
});

describe("arrange · resize", () => {
  test("holds the top-left corner and snaps the dimensions", () => {
    const session = makeTestSession(makeDocument([box("alpha", 120, 80, 160, 100)]), ["alpha"]);

    const result = runOp(session, "resize", { id: "alpha", width: 187, height: 63 });

    expect(result.text).toContain("APPLIED · resize alpha → 180×60");
    expect(objectOf(session.draft, "alpha").geometry).toEqual({
      x: 120,
      y: 80,
      width: 180,
      height: 60,
    });
  });

  test("width-only snaps the width and leaves the height byte-identical", () => {
    // 96 is a 16-grid height a UI drag would have produced; a width-only
    // resize must not drag it onto the agent's 20 grid behind the model's back.
    const session = makeTestSession(makeDocument([box("alpha", 0, 0, 160, 96)]), ["alpha"]);

    runOp(session, "resize", { id: "alpha", width: 307 });

    expect(objectOf(session.draft, "alpha").geometry).toMatchObject({ width: 300, height: 96 });
  });

  test("height-only snaps the height and leaves the width byte-identical", () => {
    // The same partial-write rule holds on the other axis.
    const session = makeTestSession(makeDocument([box("alpha", 0, 0, 176, 100)]), ["alpha"]);

    runOp(session, "resize", { id: "alpha", height: 153 });

    expect(objectOf(session.draft, "alpha").geometry).toMatchObject({ width: 176, height: 160 });
  });

  test("omitting both dimensions is refused as a request for no change", () => {
    const session = makeTestSession(
      makeDocument([box("alpha", 0, 0), box("beta", 400, 0)]),
      ["alpha"],
    );
    const draftBefore = session.draft;
    const neither = runOp(session, "resize", { id: "alpha" });
    expect(neither.isError).toBe(true);
    expect(neither.text).toContain("asks for no change");
    expect(session.draft).toBe(draftBefore);
  });

  test("shrinking below what the text needs lands at the needed size, top-left held", () => {
    const wordy = {
      ...box("alpha", 0, 0, 400, 200),
      text: "A deliberately long label that only reads in a generous box",
    };
    const session = makeTestSession(makeDocument([wordy]), ["alpha"]);

    const result = runOp(session, "resize", { id: "alpha", width: 80, height: 40 });

    expect(result.isError).toBeUndefined();
    const landed = objectOf(session.draft, "alpha").geometry;
    // Never clipped: the box is the smallest grid box that shows the label.
    expect(textFitReport(objectOf(session.draft, "alpha"), landed, wordy.text).fits).toBe(true);
    expect(landed.x).toBe(0);
    expect(landed.y).toBe(0);
    expect(landed.width).toBeLessThan(400);
    expect(landed.width % 20).toBe(0);
    expect(landed.height % 20).toBe(0);
    expect(result.text).toContain(`APPLIED · resize alpha → ${landed.width}×${landed.height}`);
    expect(result.text).toContain(`grew alpha to ${landed.width}×${landed.height} so its text shows whole`);
  });

  test("a frame's new edges decide what it holds: shrinking releases an outsider", () => {
    const session = makeTestSession(
      makeDocument([
        { ...box("frame", 0, 0, 600, 400, "section"), text: "Frame" },
        { ...box("inside", 40, 60, 160, 100), parentId: "frame" },
        { ...box("outsider", 380, 240, 160, 100), parentId: "frame" },
      ]),
      ["frame"],
    );

    runOp(session, "resize", { id: "frame", width: 300, height: 200 });

    // Membership is derived from geometry by the factory's reconcile stage —
    // resize is the one arrange gesture where it is not an identity.
    expect(objectOf(session.draft, "inside").parentId).toBe("frame");
    expect(objectOf(session.draft, "outsider").parentId).toBeNull();
  });
});

describe("arrange · resize like", () => {
  test("copies both dimensions from another box and reports the match", () => {
    const session = makeTestSession(
      makeDocument([box("alpha", 0, 0, 160, 100), box("beta", 400, 0, 300, 160)]),
      ["alpha"],
    );

    const result = runOp(session, "resize", { id: "alpha", like: "beta" });

    expect(result.text).toContain("APPLIED · resize alpha → 300×160 (matching beta)");
    expect(objectOf(session.draft, "alpha").geometry).toMatchObject({ width: 300, height: 160 });
  });

  test("a box cannot be its own size source", () => {
    const session = makeTestSession(makeDocument([box("alpha", 0, 0, 160, 100)]), ["alpha"]);
    const draftBefore = session.draft;

    const result = runOp(session, "resize", { id: "alpha", like: "alpha" });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("cannot be its own size source");
    expect(result.text).toContain("resize");
    expect(session.draft).toBe(draftBefore);
  });

  test("the size source must be a box that is on the board", () => {
    const session = makeTestSession(framedBoard(), ["frame"]);

    const edge = runOp(session, "resize", { id: "a", like: "a-b" });
    expect(edge.isError).toBe(true);
    expect(edge.text).toContain('like "a-b" is an edge');

    const missing = runOp(session, "resize", { id: "a", like: "ghost" });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain('like "ghost" is not on the board');
  });

  test("like together with width or height is refused, and nothing resizes", () => {
    const session = makeTestSession(
      makeDocument([box("alpha", 0, 0, 160, 100), box("beta", 400, 0, 300, 160)]),
      ["alpha"],
    );
    const draftBefore = session.draft;

    const withWidth = runOp(session, "resize", { id: "alpha", like: "beta", width: 200 });
    const withHeight = runOp(session, "resize", { id: "alpha", like: "beta", height: 200 });

    expect(withWidth.text).toBe(
      "ERROR · resize — like copies both dimensions, so send it without width or height.",
    );
    expect(withHeight.text).toBe(withWidth.text);
    expect(session.draft).toBe(draftBefore);
  });

  test("a null like, width or height counts as absent", () => {
    const session = makeTestSession(
      makeDocument([box("alpha", 0, 0, 160, 100), box("beta", 400, 0, 300, 160)]),
      ["alpha"],
    );

    const matched = runOp(session, "resize", { id: "alpha", like: "beta", width: null, height: null });
    expect(matched.text).toContain("APPLIED · resize alpha → 300×160 (matching beta)");

    const widened = runOp(session, "resize", { id: "alpha", like: null, width: 400, height: null });
    expect(widened.text).toContain("APPLIED · resize alpha → 400×160");

    const nothing = runOp(session, "resize", { id: "alpha", like: null, width: null, height: null });
    expect(nothing.text).toBe(
      "ERROR · resize — resize needs a width, a height or like — as written it asks for no change.",
    );
  });

  test("a no-op names the resized box, not the like source that came first", () => {
    const session = makeTestSession(
      makeDocument([box("alpha", 0, 0, 300, 160), box("beta", 400, 0, 300, 160)]),
      ["alpha"],
    );

    const result = runOp(session, "resize", { like: "beta", id: "alpha" });

    expect(result.isError).toBeUndefined();
    expect(result.text).toBe("NO-OP · resize alpha — the board already matches this, so nothing changed.");
  });

  test("matching a source too small for the text lands at the needed size", () => {
    const wordy = {
      ...box("alpha", 0, 0, 400, 200),
      text: "A deliberately long label that only reads in a generous box",
    };
    const session = makeTestSession(
      makeDocument([wordy, box("small", 600, 0, 80, 40)]),
      ["alpha"],
    );

    const result = runOp(session, "resize", { id: "alpha", like: "small" });

    expect(result.isError).toBeUndefined();
    const landed = objectOf(session.draft, "alpha").geometry;
    expect(textFitReport(objectOf(session.draft, "alpha"), landed, wordy.text).fits).toBe(true);
    expect(result.text).toContain(`APPLIED · resize alpha → ${landed.width}×${landed.height} (matching small)`);
    expect(result.text).toContain("grew alpha to");
  });

  test("a matched section's new edges release and adopt members", () => {
    const session = makeTestSession(
      makeDocument([
        { ...box("frame", 0, 0, 600, 400, "section"), text: "Frame" },
        { ...box("inside", 40, 60, 160, 100), parentId: "frame" },
        { ...box("outer", 380, 240, 160, 100), parentId: "frame" },
        box("small", 800, 0, 300, 200),
        box("large", 800, 300, 600, 400),
      ]),
      ["frame"],
    );

    runOp(session, "resize", { id: "frame", like: "small" });
    expect(objectOf(session.draft, "inside").parentId).toBe("frame");
    expect(objectOf(session.draft, "outer").parentId).toBeNull();

    runOp(session, "resize", { id: "frame", like: "large" });
    expect(objectOf(session.draft, "outer").parentId).toBe("frame");
  });
});

describe("arrange · align", () => {
  test("puts the listed boxes on one edge and reports the shared coordinate", () => {
    const session = makeTestSession(
      makeDocument([
        box("a", 100, 0, 160, 100),
        box("b", 40, 200, 200, 100),
        box("c", 260, 400, 120, 100),
      ]),
      ["a"],
    );

    const result = runOp(session, "arrange", { ids: ["a", "b", "c"], align: "left" });

    expect(result.text).toContain("APPLIED · arrange align left · a, b, c → left edges at x=40");
    for (const id of ["a", "b", "c"]) {
      expect(objectOf(session.draft, id).geometry.x).toBe(40);
    }
  });

  test("center_h aligns horizontal centers", () => {
    const session = makeTestSession(
      makeDocument([box("a", 0, 0, 100, 100), box("b", 0, 200, 300, 100)]),
      ["a"],
    );

    runOp(session, "arrange", { ids: ["a", "b"], align: "center_h" });

    const a = objectOf(session.draft, "a").geometry;
    const b = objectOf(session.draft, "b").geometry;
    expect(a.x + a.width / 2).toBe(b.x + b.width / 2);
  });

  test("a listed section aligns by its own frame and carries its contents", () => {
    const session = makeTestSession(
      makeDocument([
        { ...box("frame", 200, 0, 400, 300, "section"), text: "Frame" },
        { ...box("kid", 240, 40, 160, 100), parentId: "frame" },
        box("solo", 40, 400, 160, 100),
      ]),
      ["frame"],
    );

    const result = runOp(session, "arrange", { ids: ["frame", "solo"], align: "left" });

    expect(result.text).toContain("(carrying 1)");
    expect(objectOf(session.draft, "frame").geometry.x).toBe(40);
    // The child kept its offset inside the frame, so containment is unchanged.
    expect(objectOf(session.draft, "kid").geometry.x).toBe(80);
    expect(objectOf(session.draft, "kid").parentId).toBe("frame");
  });

  test("edge ids are refused, and so is a selection with nothing to align against", () => {
    const session = makeTestSession(framedBoard(), ["frame"]);

    const edge = runOp(session, "arrange", { ids: ["a", "a-b"], align: "left" });
    expect(edge.isError).toBe(true);
    expect(edge.text).toContain('ids "a-b" is an edge');

    // Schema-level: the model never gets to send one id.
    const ids = (findOperationTool("arrange")!.parameters as {
      properties: { ids: { minItems: number } };
    }).properties.ids;
    expect(ids.minItems).toBe(2);

    // State-level: two ids that collapse to one mover say so rather than
    // silently doing nothing.
    const collapsed = runOp(session, "arrange", { ids: ["frame", "a"], align: "left" });
    expect(collapsed.isError).toBe(true);
    expect(collapsed.text).toContain("arrange needs at least two boxes that move independently");

    const single = runOp(session, "arrange", { ids: ["a"], align: "left" });
    expect(single.isError).toBe(true);
    expect(single.text).toContain("one box has nothing to arrange against");
  });
});

describe("arrange · space", () => {
  test("re-pitches to a snapped clear gap, first box holding", () => {
    const session = makeTestSession(
      makeDocument([
        box("a", 0, 0, 160, 100),
        box("b", 170, 0, 160, 100),
        box("c", 340, 0, 160, 100),
      ]),
      ["a"],
    );

    const result = runOp(session, "arrange", {
      ids: ["a", "b", "c"],
      space: { axis: "horizontal", gap: 117 },
    });

    // 117 snaps to 120; a holds at 0, b starts at 160 + 120, c at 440 + 120.
    expect(result.text).toContain(
      "APPLIED · arrange space horizontal gap 120 · a x=0, b x=280, c x=560",
    );
    expect(objectOf(session.draft, "b").geometry.x).toBe(280);
    expect(objectOf(session.draft, "c").geometry.x).toBe(560);
    // The cross axis is untouched — align owns it.
    expect(objectOf(session.draft, "c").geometry.y).toBe(0);
  });

  test("vertical re-pitch and section carrying", () => {
    const session = makeTestSession(
      makeDocument([
        { ...box("page", 0, 0, 900, 900, "section"), text: "Page" },
        { ...box("above", 40, 40, 160, 100), parentId: "page" },
        { ...box("frame", 40, 400, 400, 200, "section"), text: "Frame", parentId: "page" },
        { ...box("kid", 80, 440, 160, 100), parentId: "frame" },
      ]),
      ["page"],
    );

    const result = runOp(session, "arrange", {
      ids: ["above", "frame"],
      space: { axis: "vertical", gap: 40 },
    });

    // `above` holds at y=40; the frame slides up to 140 + 40 and takes its
    // child with it, so the child's offset inside the frame is unchanged.
    expect(result.text).toContain("APPLIED · arrange space vertical gap 40 · above y=40, frame y=180");
    expect(result.text).toContain("(carrying 1)");
    expect(objectOf(session.draft, "frame").geometry.y).toBe(180);
    expect(objectOf(session.draft, "kid").geometry.y).toBe(220);
    expect(objectOf(session.draft, "kid").parentId).toBe("frame");
  });

  test("edge ids are refused", () => {
    const session = makeTestSession(framedBoard(), ["frame"]);

    const result = runOp(session, "arrange", {
      ids: ["a", "a-b"],
      space: { axis: "horizontal", gap: 40 },
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('ids "a-b" is an edge');
  });
});

/**
 * D6 — the draft pipeline runs the reducer's own waypoint reconcile after
 * apply, so a result's ROUTES block is the routing a committed proposal will
 * actually produce rather than a draft-only fiction.
 */
describe("arrange · modes", () => {
  function row() {
    return makeTestSession(
      makeDocument([box("a", 0, 0, 160, 100), box("b", 300, 40, 160, 100)]),
      ["a"],
    );
  }

  test("a call with neither align nor space, or with both, is refused and moves nothing", () => {
    const session = row();
    const draftBefore = session.draft;

    const neither = runOp(session, "arrange", { ids: ["a", "b"] });
    const nulls = runOp(session, "arrange", { ids: ["a", "b"], align: null, space: null });
    const both = runOp(session, "arrange", {
      ids: ["a", "b"],
      align: "top",
      space: { axis: "horizontal", gap: 40 },
    });

    expect(neither.text).toBe(
      "ERROR · arrange — send exactly one of align or space — align puts the boxes on one"
      + " shared edge, space sets one clear gap between them.",
    );
    expect(nulls.text).toBe(neither.text);
    expect(both.text).toBe("ERROR · arrange — send exactly one of align or space, not both.");
    expect(session.draft).toBe(draftBefore);
  });

  test("a null mode counts as absent, so the other mode runs", () => {
    const session = row();

    const aligned = runOp(session, "arrange", { ids: ["a", "b"], align: "top", space: null });
    expect(aligned.text).toContain("APPLIED · arrange align top · a, b → top edges at y=0");

    const spaced = runOp(session, "arrange", {
      ids: ["a", "b"],
      align: null,
      space: { axis: "horizontal", gap: 40 },
    });
    expect(spaced.text).toContain("APPLIED · arrange space horizontal gap 40 · a x=0, b x=200");
  });

  test("a no-op names the align edge or the space axis", () => {
    const session = makeTestSession(
      makeDocument([box("a", 0, 0, 160, 100), box("b", 200, 0, 160, 100)]),
      ["a"],
    );

    const aligned = runOp(session, "arrange", { ids: ["a", "b"], align: "top" });
    const spaced = runOp(session, "arrange", { ids: ["a", "b"], space: { axis: "horizontal", gap: 40 } });

    expect(aligned.text).toBe("NO-OP · arrange top — the board already matches this, so nothing changed.");
    expect(spaced.text).toBe("NO-OP · arrange horizontal — the board already matches this, so nothing changed.");
  });
});

describe("arrange · D6 waypoint reconciliation", () => {
  function waypointedBoard(): InteractiveCanvasDocument {
    const document = framedBoard();
    document.connections = [
      { ...connect("a-b", "a", "b"), waypoints: [[240, 300], [340, 300]] },
    ];
    return document;
  }

  test("a rigid move translates the waypoints with the boxes", () => {
    const session = makeTestSession(waypointedBoard(), ["frame"]);

    // Both endpoint owners ride the frame, so the move is rigid: the fan shape
    // the human drew is preserved rather than thrown away.
    const result = runOp(session, "move", { id: "frame", to: { x: 100, y: 200 } });

    expect(result.isError).toBeUndefined();
    expect(connectionOf(session.draft, "a-b").waypoints).toEqual([[340, 500], [440, 500]]);
    expect(result.text).toContain("ROUTES");
    expectReplayMatchesDraft(session);
  });

  test("moving one endpoint owner drops the waypoints and ROUTES shows the re-route", () => {
    const session = makeTestSession(waypointedBoard(), ["frame"]);

    const result = runOp(session, "move", { id: "b", to: { x: 380, y: 300 } });

    expect(result.isError).toBeUndefined();
    // Asymmetric: the stored polyline would sweep through stale space, so it
    // goes and the connector falls back to auto-routing.
    expect(connectionOf(session.draft, "a-b").waypoints).toBeUndefined();
    const routes = result.text.slice(result.text.indexOf("ROUTES"));
    expect(routes).toContain("a-b");
    // The auto-route runs between the boxes, not through the dropped bend at y=300.
    expect(routes).not.toContain("(240, 300)");
  });

  test("a resize drops them, and a commit replay produces the identical edge", () => {
    const session = makeTestSession(waypointedBoard(), ["frame"]);

    const result = runOp(session, "resize", { id: "a", width: 300, height: 200 });

    expect(result.isError).toBeUndefined();
    expect(connectionOf(session.draft, "a-b").waypoints).toBeUndefined();
    expect(result.text).toContain("ROUTES");

    // The whole point of D6: replay the accepted proposal through the live
    // reducer and the connection state matches what the tool result reported.
    expectReplayMatchesDraft(session);
  });
});
