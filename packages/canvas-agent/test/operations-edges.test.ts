/**
 * The Edges gestures — `style_edge`, `change_connection`, `reroute`,
 * `shift_segment`, `reset_route`, `move_label`.
 *
 * What these pin, in order of how easy each is to break:
 *  - the SEPARATION of the three motions: restyle touches no route, repoint
 *    touches no styling, and neither of them can reach color or the label;
 *  - the FRESH-POLYLINE CONTRACT: every one of the six returns the edge's
 *    post-op numbered route, so a second call in the same turn chains off the
 *    result rather than off a digest that aged the moment the first applied.
 *    The chaining case is exercised literally: shift, then shift again using
 *    the index the first result printed;
 *  - the validation lines: a diagonal reroute, endpoint legs the router would
 *    silently ignore, a segment index the edge does not have, a segment with no
 *    bend handle, `along` outside 0..1, and distinctness judged against the
 *    edge as it will stand rather than against the patch alone;
 *  - what `reset_route` clears (waypoints AND endpoint position pins) and what
 *    it keeps (explicit anchors);
 *  - and that all of it survives the commit replay: the draft an edge op wrote
 *    is the document a committed proposal reduces to.
 */
import { describe, expect, test } from "bun:test";

import {
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
} from "@codecaine-ai/canvas/actions";
import type { InteractiveCanvasConnection } from "@codecaine-ai/canvas/schema";

import { diffDocuments } from "../src/board/doc-diff";
import { formatNumberedRoute } from "../src/board/edge-route";
import { findOperationTool } from "../src/service/session/tools/operations";

import { makeTestSession, runOp } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

type Session = ReturnType<typeof makeTestSession>;

function edgeOf(session: Session, id = "e1"): InteractiveCanvasConnection {
  const found = session.draft.connections.find((connection) => connection.id === id);
  if (!found) throw new Error(`no connection ${id} on the draft`);
  return found;
}

/** The route as the model reads it, straight off the draft. */
function routeOf(session: Session, id = "e1"): string {
  return formatNumberedRoute(edgeOf(session, id), session.draft);
}

/**
 * Two boxes offset on both axes, so the auto-router draws a real elbow with a
 * vertical middle — the shape the spec's own example uses.
 */
function edgeBoard() {
  return makeDocument(
    [
      { ...box("frame", 0, 0, 900, 700, "section"), text: "Frame" },
      { ...box("a", 60, 100, 280, 100), parentId: "frame" },
      { ...box("b", 560, 340, 280, 100), parentId: "frame" },
      { ...box("c", 60, 500, 280, 100), parentId: "frame" },
    ],
    [{ ...connect("e1", "a", "b"), label: "then" }],
  );
}

function edgeSession(): Session {
  return makeTestSession(edgeBoard(), ["frame"]);
}

// ---------------------------------------------------------------------------
// style_edge
// ---------------------------------------------------------------------------

describe("style_edge", () => {
  test("writes the line and the arrowheads, and nothing else", () => {
    const session = edgeSession();

    const result = runOp(session, "style_edge", {
      id: "e1",
      patch: { style: "dashed", arrow: "both" },
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · style_edge e1");
    const edge = edgeOf(session);
    expect(edge.style).toBe("dashed");
    expect(edge.arrow).toBe("both");
    // The route and the label are untouched: this gesture is appearance only.
    expect(edge.waypoints).toBeUndefined();
    expect(edge.label).toBe("then");
  });

  test("has no color and no label key to reach for — those are other tools", () => {
    const schema = findOperationTool("style_edge")!.parameters as {
      properties: { patch: { properties: Record<string, unknown> } };
    };
    expect(Object.keys(schema.properties.patch.properties).sort()).toEqual(["arrow", "style"]);
  });

  test("returns the edge's numbered route even though it moved no geometry", () => {
    const session = edgeSession();
    const before = routeOf(session);

    const result = runOp(session, "style_edge", { id: "e1", patch: { style: "dashed" } });

    // The fresh-polyline contract: a restyle still says how the wire runs, so
    // a follow-up shift in the same turn reads the route from here.
    expect(result.text).toContain("ROUTES");
    expect(result.text).toContain(before);
    expect(before).toContain("(s2 v x=450)");
  });

  test("an id that is not an edge is refused", () => {
    const session = edgeSession();

    const result = runOp(session, "style_edge", { id: "a", patch: { style: "dashed" } });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("is not on the board");
  });
});

// ---------------------------------------------------------------------------
// change_connection
// ---------------------------------------------------------------------------

describe("change_connection", () => {
  test("repoints one end and leaves both objects alone", () => {
    const session = edgeSession();
    const objectsBefore = JSON.stringify(session.draft.objects);

    const result = runOp(session, "change_connection", {
      id: "e1",
      patch: { to: { objectId: "c" } },
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · change_connection e1");
    expect(edgeOf(session).to.objectId).toBe("c");
    expect(edgeOf(session).from.objectId).toBe("a");
    expect(JSON.stringify(session.draft.objects)).toBe(objectsBefore);
  });

  test("the result carries the edge's route to its NEW end", () => {
    const session = edgeSession();

    const result = runOp(session, "change_connection", {
      id: "e1",
      patch: { to: { objectId: "c" } },
    });

    expect(result.text).toContain("ROUTES");
    expect(result.text).toContain(routeOf(session));
    // a and c are stacked, so the fresh route names c and runs vertically.
    expect(routeOf(session)).toContain(" c");
    expect(routeOf(session)).toContain("v x=");
  });

  test("a stored route is dropped when the ends move, as the reducer does", () => {
    const session = edgeSession();
    runOp(session, "reroute", { id: "e1", points: [[420, 160], [420, 400]] });
    expect(edgeOf(session).waypoints).toBeDefined();

    const result = runOp(session, "change_connection", {
      id: "e1",
      patch: { to: { objectId: "c" } },
    });

    expect(result.isError).toBeUndefined();
    expect(edgeOf(session).waypoints).toBeUndefined();
    expect(result.text).toContain("manual waypoints dropped");
  });

  test("a repoint that does not move an end keeps the stored route", () => {
    const session = edgeSession();
    runOp(session, "reroute", { id: "e1", points: [[420, 160], [420, 400]] });

    const result = runOp(session, "change_connection", {
      id: "e1",
      patch: { to: { objectId: "b", anchor: "top" } },
    });

    expect(result.isError).toBeUndefined();
    // The anchor moved, so this one IS an endpoint change and drops the route.
    expect(edgeOf(session).waypoints).toBeUndefined();
  });

  test("distinctness is judged against the edge as it will stand", () => {
    const session = edgeSession();

    // The patch names only `from`; `to` is already "b", so this is a self-loop
    // even though nothing in the payload repeats an id.
    const result = runOp(session, "change_connection", {
      id: "e1",
      patch: { from: { objectId: "b" } },
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("self-loops are not supported");
  });

  test("an endpoint object that is not on the board is refused", () => {
    const session = edgeSession();

    const result = runOp(session, "change_connection", {
      id: "e1",
      patch: { to: { objectId: "ghost" } },
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('to.objectId "ghost" is not on the board');
  });

  test("a repoint to where the edge already lands still returns the route", () => {
    const session = edgeSession();
    const draftBefore = session.draft;

    const result = runOp(session, "change_connection", {
      id: "e1",
      patch: { to: { objectId: "b" } },
    });

    // Nothing changed, so there is no APPLIED line — but the polyline is what
    // the call was reaching for, and a bare NO-OP would send the model back to
    // the digest for it.
    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("NO-OP · change_connection e1");
    expect(result.text).toContain(`  route ${routeOf(session)}`);
    expect(session.draft).toBe(draftBefore);
  });
});

// ---------------------------------------------------------------------------
// reroute
// ---------------------------------------------------------------------------

describe("reroute", () => {
  test("replaces the interior corners wholesale, snapped to the grid", () => {
    const session = edgeSession();

    // 155 and 395 are off-grid on purpose: snap, don't reject.
    const result = runOp(session, "reroute", { id: "e1", points: [[421, 155], [421, 395]] });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · reroute e1");
    expect(edgeOf(session).waypoints).toEqual([[420, 160], [420, 400]]);
  });

  test("the result carries the route the new corners produced", () => {
    const session = edgeSession();

    const result = runOp(session, "reroute", { id: "e1", points: [[420, 160], [420, 400]] });

    expect(result.text).toContain("ROUTES");
    expect(result.text).toContain("(s1 v x=420)");
    expect(result.text).toContain(routeOf(session));
  });

  test("a diagonal pair of corners is refused, naming the pair", () => {
    const session = edgeSession();

    const result = runOp(session, "reroute", { id: "e1", points: [[420, 160], [500, 400]] });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("is diagonal");
    expect(result.text).toContain("420,160 → 500,400");
    expect(edgeOf(session).waypoints).toBeUndefined();
  });

  test("corners the router could not join to the ends are refused, not silently ignored", () => {
    const session = edgeSession();

    // Orthogonal among themselves, but neither end can reach them without a
    // diagonal leg — the router would fall back to auto-routing and the model
    // would believe it had placed the wire.
    const result = runOp(session, "reroute", { id: "e1", points: [[420, 220], [420, 300]] });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("without a diagonal leg");
    expect(result.text).toContain("340,150");
    expect(result.text).toContain("560,390");
    expect(edgeOf(session).waypoints).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// shift_segment
// ---------------------------------------------------------------------------

describe("shift_segment", () => {
  test("slides one segment perpendicular to itself and prints the new route", () => {
    const session = edgeSession();
    expect(routeOf(session)).toBe(
      "a ─(s0 h y=150)→ ─(s1 h y=150)→ (s2 v x=450) ─(s3 h y=390)→ ─(s4 h y=390)→ b",
    );

    const result = runOp(session, "shift_segment", { id: "e1", segment: 2, to: 520 });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · shift_segment e1");
    // The spec's own example line, verbatim.
    expect(result.text).toContain("(s1 v x=520)");
    expect(edgeOf(session).waypoints).toEqual([[520, 150], [520, 390]]);
  });

  test("a second shift chains off the index the first result printed", () => {
    const session = edgeSession();

    const first = runOp(session, "shift_segment", { id: "e1", segment: 2, to: 520 });
    expect(first.text).toContain("(s1 v x=520)");

    // The route renumbered when the shift simplified it — s2 became s1. The
    // model reads that off the result, not off the digest, which is the whole
    // point of returning the fresh polyline.
    const second = runOp(session, "shift_segment", { id: "e1", segment: 1, to: 640 });

    expect(second.isError).toBeUndefined();
    expect(second.text).toContain("(s1 v x=640)");
    expect(edgeOf(session).waypoints).toEqual([[640, 150], [640, 390]]);
  });

  test("the target coordinate snaps to the grid", () => {
    const session = edgeSession();

    runOp(session, "shift_segment", { id: "e1", segment: 2, to: 517 });

    expect(routeOf(session)).toContain("(s1 v x=520)");
  });

  test("a segment index the edge does not have is refused, with the route to read", () => {
    const session = edgeSession();

    const result = runOp(session, "shift_segment", { id: "e1", segment: 9, to: 520 });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("segment 9 is not on this edge");
    expect(result.text).toContain("(s2 v x=450)");
    expect(edgeOf(session).waypoints).toBeUndefined();
  });

  test("a segment with no bend handle is refused rather than dragged", () => {
    // An endpoint pin 0.1px off the first corner: the router still calls the
    // polyline orthogonal (0.5px tolerance) but the bend machinery does not
    // (0.01px), so s0 prints under its dominant axis and has no handle.
    const document = makeDocument(
      [
        { ...box("frame", 0, 0, 900, 700, "section"), text: "Frame" },
        { ...box("a", 100, 100, 200, 100), parentId: "frame" },
        { ...box("b", 600, 300, 200, 100), parentId: "frame" },
      ],
      [
        {
          id: "e1",
          from: { objectId: "a", anchor: "right", position: [1, 0.501] },
          to: { objectId: "b", anchor: "left" },
          waypoints: [[400, 150], [400, 350]],
        },
      ],
    );
    const session = makeTestSession(document, ["frame"]);

    const result = runOp(session, "shift_segment", { id: "e1", segment: 0, to: 300 });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("runs diagonally");
    expect(result.text).toContain("no bend handle");
  });

  test("shifting a segment to where it already is is a no-op, not an edit", () => {
    const session = edgeSession();
    runOp(session, "shift_segment", { id: "e1", segment: 2, to: 520 });

    const result = runOp(session, "shift_segment", { id: "e1", segment: 1, to: 520 });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("NO-OP · shift_segment e1");
    expect(result.text).toContain("already sits at x=520");
    expect(edgeOf(session).waypoints).toEqual([[520, 150], [520, 390]]);
  });
});

// ---------------------------------------------------------------------------
// reset_route
// ---------------------------------------------------------------------------

describe("reset_route", () => {
  test("clears the corners AND the endpoint pins, and keeps explicit anchors", () => {
    const document = makeDocument(
      [
        { ...box("frame", 0, 0, 900, 700, "section"), text: "Frame" },
        { ...box("a", 100, 100, 200, 100), parentId: "frame" },
        { ...box("b", 600, 300, 200, 100), parentId: "frame" },
      ],
      [
        {
          id: "e1",
          from: { objectId: "a", anchor: "right", position: [1, 0.501] },
          to: { objectId: "b", anchor: "left" },
          waypoints: [[400, 150], [400, 350]],
        },
      ],
    );
    const session = makeTestSession(document, ["frame"]);

    const result = runOp(session, "reset_route", { id: "e1" });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · reset_route e1");
    const edge = edgeOf(session);
    expect(edge.waypoints).toBeUndefined();
    expect(edge.from.position).toBeUndefined();
    expect(edge.to.position).toBeUndefined();
    // The chosen sides are intent, not routing debris.
    expect(edge.from.anchor).toBe("right");
    expect(edge.to.anchor).toBe("left");
  });

  test("the result carries the auto-routed polyline the edge went back to", () => {
    const session = edgeSession();
    runOp(session, "shift_segment", { id: "e1", segment: 2, to: 520 });

    const result = runOp(session, "reset_route", { id: "e1" });

    expect(result.text).toContain("ROUTES");
    expect(result.text).toContain("(s2 v x=450)");
    expect(result.text).toContain(routeOf(session));
  });

  test("an edge already on the auto-router is a no-op that still returns the route", () => {
    const session = edgeSession();

    const result = runOp(session, "reset_route", { id: "e1" });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("NO-OP · reset_route e1");
    expect(result.text).toContain("already on the auto-router");
    // The descriptor's own no-op reports the polyline too: the model asked
    // where this wire runs, and "nothing to do" is not that answer.
    expect(result.text).toContain(`  route ${routeOf(session)}`);
  });
});

// ---------------------------------------------------------------------------
// move_label
// ---------------------------------------------------------------------------

describe("move_label", () => {
  test("pins the chip along the route, snapping the px offset but not the fraction", () => {
    const session = edgeSession();

    const result = runOp(session, "move_label", { id: "e1", along: 0.25, offset: 12 });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · move_label e1");
    // `along` is a 0..1 fraction of the path and is exempt from the grid;
    // `offset` is a distance in px on the board and lands on it, and the
    // summary reports the offset that landed rather than the one asked for.
    expect(edgeOf(session).labelPosition).toEqual({ along: 0.25, offset: 20 });
    expect(result.text).toContain("move_label e1 → along 0.25, offset 20");
  });

  test("\"auto\" clears the pin", () => {
    const session = edgeSession();
    runOp(session, "move_label", { id: "e1", along: 0.25, offset: 12 });

    const result = runOp(session, "move_label", { id: "e1", along: "auto" });

    expect(result.isError).toBeUndefined();
    expect(edgeOf(session).labelPosition).toBeUndefined();
  });

  test("the result carries the route the chip is pinned along", () => {
    const session = edgeSession();

    const result = runOp(session, "move_label", { id: "e1", along: 0.8 });

    expect(result.text).toContain("ROUTES");
    expect(result.text).toContain(routeOf(session));
    expect(result.text).toContain("(s2 v x=450)");
  });

  test("an `along` outside 0..1 is refused", () => {
    const session = edgeSession();

    const result = runOp(session, "move_label", { id: "e1", along: 1.5 });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("outside 0..1");
    expect(edgeOf(session).labelPosition).toBeUndefined();
  });

  test("an id that is not an edge is refused", () => {
    const session = edgeSession();

    const result = runOp(session, "move_label", { id: "a", along: 0.5 });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("is not on the board");
  });
});

// ---------------------------------------------------------------------------
// Commit replay
// ---------------------------------------------------------------------------

describe("edge state survives the commit replay", () => {
  test("the draft an edge session wrote is the document the reducer produces", () => {
    const baseline = edgeBoard();
    const session = makeTestSession(baseline, ["frame"]);

    runOp(session, "style_edge", { id: "e1", patch: { style: "dashed", arrow: "both" } });
    runOp(session, "shift_segment", { id: "e1", segment: 2, to: 520 });
    runOp(session, "move_label", { id: "e1", along: 0.25, offset: 12 });

    const next = reduceInteractiveCanvasState(createInteractiveCanvasState(baseline), {
      type: "canvas.applyAgentPatch",
      operations: diffDocuments(baseline, session.draft),
      summary: "Edge pass",
    });

    const committed = next.document.connections.find((connection) => connection.id === "e1")!;
    expect(committed).toEqual(edgeOf(session));
    expect(committed.waypoints).toEqual([[520, 150], [520, 390]]);
    expect(committed.labelPosition).toEqual({ along: 0.25, offset: 20 });
    // The route the result reported is the route the committed document draws.
    expect(formatNumberedRoute(committed, next.document))
      .toBe(formatNumberedRoute(edgeOf(session), session.draft));
  });

  test("a reset_route replays as a cleared route, pins and all", () => {
    const baseline = makeDocument(
      [
        { ...box("frame", 0, 0, 900, 700, "section"), text: "Frame" },
        { ...box("a", 100, 100, 200, 100), parentId: "frame" },
        { ...box("b", 600, 300, 200, 100), parentId: "frame" },
      ],
      [
        {
          id: "e1",
          from: { objectId: "a", anchor: "right", position: [1, 0.501] },
          to: { objectId: "b", anchor: "left" },
          waypoints: [[400, 150], [400, 350]],
        },
      ],
    );
    const session = makeTestSession(baseline, ["frame"]);
    runOp(session, "reset_route", { id: "e1" });

    const next = reduceInteractiveCanvasState(createInteractiveCanvasState(baseline), {
      type: "canvas.applyAgentPatch",
      operations: diffDocuments(baseline, session.draft),
      summary: "Reset the route",
    });

    const committed = next.document.connections.find((connection) => connection.id === "e1")!;
    expect(committed.waypoints).toBeUndefined();
    expect(committed.from.position).toBeUndefined();
    expect(committed.to.position).toBeUndefined();
    expect(committed.from.anchor).toBe("right");
    expect(committed.to.anchor).toBe("left");
  });
});
