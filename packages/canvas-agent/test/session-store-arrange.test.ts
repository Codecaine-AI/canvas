import { describe, expect, test } from "bun:test";

import {
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
} from "@codecaine-ai/canvas/actions";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import { diffDocuments } from "../src/board/doc-diff";
import { findOperationTool } from "../src/service/session/tools/operations";
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

describe("arrange · move_to", () => {
  test("puts the top-left where asked, on the grid, and reports what landed", () => {
    const session = makeTestSession(makeDocument([box("alpha", 0, 0, 160, 100)]), ["alpha"]);

    const result = runOp(session, "move_to", { id: "alpha", x: 241, y: 477 });

    expect(result.isError).toBeUndefined();
    // The APPLIED line reports the POST-SNAP geometry, not the request.
    expect(result.text).toContain("APPLIED · move_to alpha → (240, 480)");
    expect(objectOf(session.draft, "alpha").geometry).toEqual({
      x: 240,
      y: 480,
      width: 160,
      height: 100,
    });
  });

  test("a section carries its contents, and containment is unchanged", () => {
    const session = makeTestSession(framedBoard(), ["frame"]);

    const result = runOp(session, "move_to", { id: "frame", x: 200, y: 100 });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · move_to frame → (200, 100) (carrying 2)");
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

    const result = runOp(session, "move_to", { id: "a-b", x: 100, y: 100 });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("ERROR · move_to");
    expect(result.text).toContain('id "a-b" is an edge');
    expect(result.text).toContain("re-routes itself");
    expect(session.draft).toBe(draftBefore);
  });
});

describe("arrange · move_by", () => {
  test("nudges by a snapped delta and reports where the box ended up", () => {
    const session = makeTestSession(makeDocument([box("alpha", 100, 100, 160, 100)]), ["alpha"]);

    const result = runOp(session, "move_by", { id: "alpha", dx: 17, dy: -33 });

    // 17 → 20 and -33 → -40: deltas snap the same way absolutes do, so a chain
    // of nudges never accumulates off-grid drift.
    expect(result.text).toContain("APPLIED · move_by alpha +20,-40 → (120, 60)");
    expect(objectOf(session.draft, "alpha").geometry).toMatchObject({ x: 120, y: 60 });
  });

  test("a section nudge carries its contents too", () => {
    const session = makeTestSession(framedBoard(), ["frame"]);

    runOp(session, "move_by", { id: "frame", dx: 20, dy: 20 });

    expect(objectOf(session.draft, "a").geometry).toMatchObject({ x: 60, y: 80 });
    expect(objectOf(session.draft, "b").geometry).toMatchObject({ x: 400, y: 80 });
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

  test("shrinking below what the text needs applies, with a warning note", () => {
    const wordy = {
      ...box("alpha", 0, 0, 400, 200),
      text: "A deliberately long label that only reads in a generous box",
    };
    const session = makeTestSession(makeDocument([wordy]), ["alpha"]);

    const result = runOp(session, "resize", { id: "alpha", width: 80, height: 40 });

    // Report-only, the same philosophy as the unreadable-labels lint.
    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · resize alpha → 80×40");
    expect(objectOf(session.draft, "alpha").geometry).toMatchObject({ width: 80, height: 40 });
    // The note names a size, which is what makes the warning actionable.
    expect(result.text).toMatch(/\n {2}.*\d+×\d+/);
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

describe("arrange · match_size", () => {
  test("copies both dimensions from another box and reports the match", () => {
    const session = makeTestSession(
      makeDocument([box("alpha", 0, 0, 160, 100), box("beta", 400, 0, 300, 160)]),
      ["alpha"],
    );

    const result = runOp(session, "match_size", { id: "alpha", like: "beta" });

    expect(result.text).toContain("APPLIED · match_size alpha → 300×160 (matching beta)");
    expect(objectOf(session.draft, "alpha").geometry).toMatchObject({ width: 300, height: 160 });
  });

  test("a box cannot be its own size source", () => {
    const session = makeTestSession(makeDocument([box("alpha", 0, 0, 160, 100)]), ["alpha"]);
    const draftBefore = session.draft;

    const result = runOp(session, "match_size", { id: "alpha", like: "alpha" });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("cannot be its own size source");
    expect(result.text).toContain("resize");
    expect(session.draft).toBe(draftBefore);
  });

  test("the size source must be a box that is on the board", () => {
    const session = makeTestSession(framedBoard(), ["frame"]);

    const edge = runOp(session, "match_size", { id: "a", like: "a-b" });
    expect(edge.isError).toBe(true);
    expect(edge.text).toContain('like "a-b" is an edge');

    const missing = runOp(session, "match_size", { id: "a", like: "ghost" });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain('like "ghost" is not on the board');
  });

  test("matching a small source still applies with the text-fit warning", () => {
    const wordy = {
      ...box("alpha", 0, 0, 400, 200),
      text: "A deliberately long label that only reads in a generous box",
    };
    const session = makeTestSession(
      makeDocument([wordy, box("small", 600, 0, 80, 40)]),
      ["alpha"],
    );

    const result = runOp(session, "match_size", { id: "alpha", like: "small" });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · match_size alpha → 80×40 (matching small)");
    expect(result.text).toMatch(/\n {2}.*\d+×\d+/);
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

    runOp(session, "match_size", { id: "frame", like: "small" });
    expect(objectOf(session.draft, "inside").parentId).toBe("frame");
    expect(objectOf(session.draft, "outer").parentId).toBeNull();

    runOp(session, "match_size", { id: "frame", like: "large" });
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

    const result = runOp(session, "align", { ids: ["a", "b", "c"], edge: "left" });

    expect(result.text).toContain("APPLIED · align left · a, b, c → left edges at x=40");
    for (const id of ["a", "b", "c"]) {
      expect(objectOf(session.draft, id).geometry.x).toBe(40);
    }
  });

  test("center_h aligns horizontal centers", () => {
    const session = makeTestSession(
      makeDocument([box("a", 0, 0, 100, 100), box("b", 0, 200, 300, 100)]),
      ["a"],
    );

    runOp(session, "align", { ids: ["a", "b"], edge: "center_h" });

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

    const result = runOp(session, "align", { ids: ["frame", "solo"], edge: "left" });

    expect(result.text).toContain("(carrying 1)");
    expect(objectOf(session.draft, "frame").geometry.x).toBe(40);
    // The child kept its offset inside the frame, so containment is unchanged.
    expect(objectOf(session.draft, "kid").geometry.x).toBe(80);
    expect(objectOf(session.draft, "kid").parentId).toBe("frame");
  });

  test("edge ids are refused, and so is a selection with nothing to align against", () => {
    const session = makeTestSession(framedBoard(), ["frame"]);

    const edge = runOp(session, "align", { ids: ["a", "a-b"], edge: "left" });
    expect(edge.isError).toBe(true);
    expect(edge.text).toContain('ids "a-b" is an edge');

    // Schema-level: the model never gets to send one id.
    const ids = (findOperationTool("align")!.parameters as {
      properties: { ids: { minItems: number } };
    }).properties.ids;
    expect(ids.minItems).toBe(2);

    // State-level: two ids that collapse to one mover say so rather than
    // silently doing nothing.
    const collapsed = runOp(session, "align", { ids: ["frame", "a"], edge: "left" });
    expect(collapsed.isError).toBe(true);
    expect(collapsed.text).toContain("align needs at least two boxes that move independently");

    const single = runOp(session, "align", { ids: ["a"], edge: "left" });
    expect(single.isError).toBe(true);
    expect(single.text).toContain("one box has nothing to arrange against");
  });
});

describe("arrange · space_out", () => {
  test("re-pitches to a snapped clear gap, first box holding", () => {
    const session = makeTestSession(
      makeDocument([
        box("a", 0, 0, 160, 100),
        box("b", 170, 0, 160, 100),
        box("c", 340, 0, 160, 100),
      ]),
      ["a"],
    );

    const result = runOp(session, "space_out", {
      ids: ["a", "b", "c"],
      axis: "horizontal",
      gap: 117,
    });

    // 117 snaps to 120; a holds at 0, b starts at 160 + 120, c at 440 + 120.
    expect(result.text).toContain(
      "APPLIED · space_out horizontal gap 120 · a x=0, b x=280, c x=560",
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

    const result = runOp(session, "space_out", {
      ids: ["above", "frame"],
      axis: "vertical",
      gap: 40,
    });

    // `above` holds at y=40; the frame slides up to 140 + 40 and takes its
    // child with it, so the child's offset inside the frame is unchanged.
    expect(result.text).toContain("APPLIED · space_out vertical gap 40 · above y=40, frame y=180");
    expect(result.text).toContain("(carrying 1)");
    expect(objectOf(session.draft, "frame").geometry.y).toBe(180);
    expect(objectOf(session.draft, "kid").geometry.y).toBe(220);
    expect(objectOf(session.draft, "kid").parentId).toBe("frame");
  });

  test("edge ids are refused", () => {
    const session = makeTestSession(framedBoard(), ["frame"]);

    const result = runOp(session, "space_out", {
      ids: ["a", "a-b"],
      axis: "horizontal",
      gap: 40,
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
    const result = runOp(session, "move_to", { id: "frame", x: 100, y: 200 });

    expect(result.isError).toBeUndefined();
    expect(connectionOf(session.draft, "a-b").waypoints).toEqual([[340, 500], [440, 500]]);
    expect(result.text).toContain("ROUTES");
    expectReplayMatchesDraft(session);
  });

  test("moving one endpoint owner drops the waypoints and ROUTES shows the re-route", () => {
    const session = makeTestSession(waypointedBoard(), ["frame"]);

    const result = runOp(session, "move_to", { id: "b", x: 380, y: 300 });

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
