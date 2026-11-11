/**
 * The straighten pass: an edit that leaves a wire with a small jog between
 * two boxes a little off one axis ends with one of them on the axis, and the
 * result names the move.
 */
import { describe, expect, test } from "bun:test";

import { routedPolyline } from "../../board/lints/geometry";
import { crossingPairs, routeAll } from "../tools/tighten-wires";
import type { InteractiveCanvasConnection, InteractiveCanvasObject } from "../../state/schema";
import { makeTestSession, runOp } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

type Session = ReturnType<typeof makeTestSession>;

/** A page that holds every box given no other parent. */
function board(objects: InteractiveCanvasObject[], connections: InteractiveCanvasConnection[] = []): Session {
  const page = { ...box("page", 0, 0, 2400, 1400, "section"), text: "Page" };
  const held = objects.map((object) => ({ ...object, parentId: object.parentId ?? "page" }));
  return makeTestSession(makeDocument([page, ...held], connections), ["page"]);
}

function at(session: Session, id: string) {
  return session.draft.objects.find((object) => object.id === id)!.geometry;
}

function wire(session: Session, id: string) {
  return session.draft.connections.find((edge) => edge.id === id)!;
}

/** Whether the wire as drawn is one run: every point on one x or on one y. */
function straight(session: Session, id: string): boolean {
  const points = routedPolyline(wire(session, id), session.draft, session.canvasStyle);
  return points.every((point) => Math.abs(point.x - points[0]!.x) < 0.5)
    || points.every((point) => Math.abs(point.y - points[0]!.y) < 0.5);
}

/** Two boxes side by side on one axis, wired. */
function pair(): Session {
  return board([box("a", 200, 300, 280, 100), box("b", 800, 300, 280, 100)], [connect("a-b", "a", "b")]);
}

describe("straighten · on every edit", () => {
  test("a box moved a little off its neighbour's axis stays, and the neighbour comes onto its axis", () => {
    const session = pair();

    const result = runOp(session, "move", { id: "b", by: { dx: 100, dy: 20 } });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("straightened a-b: moved a 20px down");
    expect(at(session, "b")).toMatchObject({ x: 900, y: 320 });
    expect(at(session, "a")).toMatchObject({ x: 200, y: 320 });
    expect(straight(session, "a-b")).toBe(true);
  });

  test("a new wire between boxes 12px off one axis goes straight", () => {
    const session = board([box("a", 200, 300, 280, 100), box("b", 800, 312, 280, 100)]);

    const result = runOp(session, "connect", { id: "a-b", from: { objectId: "a" }, to: { objectId: "b" } });

    expect(result.text).toMatch(/straightened a-b: moved (a 12px down|b 12px up)/);
    expect(at(session, "a").y).toBe(at(session, "b").y);
    expect(straight(session, "a-b")).toBe(true);
  });

  test("an offset of 40px is an elbow the drawer chose: nothing moves", () => {
    const session = pair();

    const result = runOp(session, "move", { id: "b", by: { dx: 0, dy: 40 } });

    expect(result.text).not.toContain("straightened");
    expect(at(session, "a")).toMatchObject({ x: 200, y: 300 });
    expect(at(session, "b")).toMatchObject({ x: 800, y: 340 });
  });

  test("a decision whose centre is 2px off the box under it grows 4px: no slide on the grid lines them up", () => {
    const session = board([box("pick", 200, 200, 280, 120, "decision"), box("ok", 192, 500, 300, 140, "octagon")]);

    const result = runOp(session, "connect", { id: "pick-ok", from: { objectId: "pick" }, to: { objectId: "ok" } });

    expect(result.text).toContain("straightened pick-ok: made pick 4px wider");
    expect(at(session, "pick")).toEqual({ x: 200, y: 200, width: 284, height: 120 });
    expect(at(session, "ok")).toEqual({ x: 192, y: 500, width: 300, height: 140 });
    expect(straight(session, "pick-ok")).toBe(true);
  });

  test("a decision on a straight wire grows with the box that wire joins to it, so both wires end straight", () => {
    // The locked base holds ok on its axis, 2px off the axis of top and pick.
    const session = board(
      [
        box("top", 200, 100, 280, 140, "octagon"),
        box("pick", 200, 400, 280, 120, "decision"),
        box("ok", 192, 700, 300, 140, "octagon"),
        { ...box("base", 200, 1000, 284, 120, "decision"), locked: "all" as const },
      ],
      [connect("top-pick", "top", "pick"), connect("ok-base", "ok", "base")],
    );

    const result = runOp(session, "connect", { id: "pick-ok", from: { objectId: "pick" }, to: { objectId: "ok" } });

    expect(result.text).toContain("straightened pick-ok: made pick 4px wider, which also moved or grew top");
    expect(at(session, "top")).toEqual({ x: 200, y: 100, width: 284, height: 140 });
    expect(at(session, "pick")).toEqual({ x: 200, y: 400, width: 284, height: 120 });
    for (const id of ["top-pick", "pick-ok", "ok-base"]) expect(straight(session, id)).toBe(true);
  });

  test("a locked neighbour stays: the moved box takes its axis", () => {
    const session = board(
      [{ ...box("a", 200, 300, 280, 100), locked: "all" }, box("b", 800, 300, 280, 100)],
      [connect("a-b", "a", "b")],
    );

    const result = runOp(session, "move", { id: "b", by: { dx: 100, dy: 20 } });

    expect(result.text).toContain("straightened a-b: moved b 20px up");
    expect(at(session, "a")).toMatchObject({ x: 200, y: 300 });
    expect(at(session, "b")).toMatchObject({ x: 900, y: 300 });
  });

  test("the pass never undoes a resize: the size the drawer set stays", () => {
    const session = board(
      [box("pick", 200, 200, 284, 120, "decision"), { ...box("stop", 192, 500, 300, 140, "octagon"), locked: "all" }],
      [connect("pick-stop", "pick", "stop")],
    );

    runOp(session, "resize", { id: "pick", width: 280 });

    expect(at(session, "pick").width).toBe(280);
  });

  test("the pass never undoes the edit: a move it could only take back keeps its jog", () => {
    const session = board(
      [{ ...box("a", 200, 300, 280, 100), locked: "all" }, box("b", 800, 300, 280, 100)],
      [connect("a-b", "a", "b")],
    );

    const result = runOp(session, "move", { id: "b", by: { dx: 0, dy: 20 } });

    expect(result.text).toContain("APPLIED · move b");
    expect(result.text).not.toContain("straightened");
    expect(at(session, "b")).toMatchObject({ x: 800, y: 320 });
  });

  test("a move back with a grid step of growth also takes the edit back: the box stays", () => {
    // The octagon's centre is 2px under or over the decision's, so the way back also grows the decision 4px.
    for (const height of [104, 96]) {
      const session = board(
        [{ ...box("ok", 200, 300, 300, height, "octagon"), locked: "all" }, box("pick", 800, 300, 280, 100, "decision")],
        [connect("ok-pick", "ok", "pick")],
      );

      const result = runOp(session, "move", { id: "pick", by: { dx: 0, dy: 20 } });

      expect(result.text).not.toContain("straightened");
      expect(at(session, "pick")).toEqual({ x: 800, y: 320, width: 280, height: 100 });
    }
  });

  test("two moves that each grow the box do not add up to the way back", () => {
    // stop holds a. pick can come 12px up to a's axis. 8px more, to b's axis, is where it stood.
    const session = board(
      [
        box("a", 100, 308, 300, 104, "octagon"),
        box("pick", 800, 300, 280, 100, "decision"),
        { ...box("b", 1500, 304, 300, 100, "octagon"), locked: "all" as const },
        { ...box("stop", 100, 452, 300, 100), locked: "all" as const },
      ],
      [connect("a-p", "a", "pick"), connect("p-b", "pick", "b")],
    );

    const result = runOp(session, "move", { id: "pick", by: { dx: 0, dy: 20 } });

    expect(result.text).toContain("straightened a-p: moved pick 12px up and made pick 4px taller");
    expect(result.text).not.toContain("straightened p-b");
    expect(at(session, "pick")).toEqual({ x: 800, y: 308, width: 280, height: 104 });
  });

  /** Two straight pairs, w-a and b-x, 12px off one axis. */
  function twoPairs(lock: readonly string[] = []): Session {
    return board(
      [box("w", 100, 300, 280, 100), box("a", 500, 300, 280, 100), box("b", 1000, 312, 280, 100), box("x", 1400, 312, 280, 100)]
        .map((object) => (lock.includes(object.id) ? { ...object, locked: "all" as const } : object)),
      [connect("w-a", "w", "a"), connect("b-x", "b", "x")],
    );
  }

  test("an end with a straight wire moves with the box on that wire, so the wire stays straight", () => {
    const session = twoPairs();

    const result = runOp(session, "connect", { id: "a-b", from: { objectId: "a" }, to: { objectId: "b" } });

    expect(result.text).toMatch(/straightened a-b: moved (a 12px down, which also moved or grew w|b 12px up, which also moved or grew x)/);
    expect(new Set(["w", "a", "b", "x"].map((id) => at(session, id).y)).size).toBe(1);
    expect(["w-a", "a-b", "b-x"].every((id) => straight(session, id))).toBe(true);
  });

  test("a jog stays when the only moves would bend a straight wire: it would only change wires", () => {
    const session = twoPairs(["w", "x"]);
    const before = session.draft.objects;

    const result = runOp(session, "connect", { id: "a-b", from: { objectId: "a" }, to: { objectId: "b" } });

    expect(result.text).not.toContain("straightened");
    expect(session.draft.objects).toEqual(before);
    expect(straight(session, "w-a")).toBe(true);
    expect(straight(session, "b-x")).toBe(true);
  });

  test("a box the edit placed never goes back where it stood, also when the edit placed others", () => {
    const session = board(
      [
        { ...box("w", 200, 320, 280, 100), locked: "all" },
        box("a", 800, 320, 280, 100),
        box("b", 1400, 340, 280, 100),
        box("ref", 2000, 300, 280, 100),
      ],
      [connect("w-a", "w", "a")],
    );

    const result = runOp(session, "arrange", { ids: ["a", "b", "ref"], align: "top" });

    expect(result.text).toContain("APPLIED · arrange align top");
    expect(result.text).not.toContain("straightened");
    expect(["a", "b", "ref"].map((id) => at(session, id).y)).toEqual([300, 300, 300]);
  });

  test("a box with a new shape has its wires looked at", () => {
    const session = board([box("a", 200, 300, 280, 280), box("b", 800, 304, 280, 280)], [connect("a-b", "a", "b")]);
    expect(straight(session, "a-b")).toBe(true);

    const result = runOp(session, "change_shape", { id: "a", patch: { type: "octagon" } });

    expect(result.text).toMatch(/straightened a-b: moved (a 4px down|b 4px up)/);
    expect(straight(session, "a-b")).toBe(true);
  });

  test("no move makes two wires cross that did not cross, also when another crossing goes", () => {
    // Moved 20px up, b would take a-b off c-d and push c-d across e-f.
    const session = board(
      ([["a", 600, 700], ["b", 1200, 720], ["obstacle", 1400, 700], ["c", 400, 120], ["d", 1320, 1380], ["e", 160, 600], ["f", 760, 940]] as const)
        .map(([id, x, y]) => box(id, x, y, 160, 96)),
      [connect("c-d", "c", "d"), connect("e-f", "e", "f")],
    );
    const crossings = () => crossingPairs(routeAll(session.draft, session.canvasStyle));

    runOp(session, "connect", { id: "a-b", from: { objectId: "a" }, to: { objectId: "b" } });

    expect(at(session, "b")).toMatchObject({ x: 1200, y: 720 });
    expect([...crossings()]).toEqual(["a-b × c-d"]);
  });

  test("a jog stays when either move would crowd a neighbour", () => {
    const session = board([
      box("a", 200, 300, 280, 100), box("over-a", 200, 160, 280, 100), box("under-a", 200, 440, 280, 100),
      box("b", 800, 312, 280, 100), box("over-b", 800, 172, 280, 100), box("under-b", 800, 452, 280, 100),
    ]);
    const before = session.draft.objects;

    const result = runOp(session, "connect", { id: "a-b", from: { objectId: "a" }, to: { objectId: "b" } });

    expect(result.text).not.toContain("straightened");
    expect(session.draft.objects).toEqual(before);
  });

  test("a jog stays when the only move would take a row into its frame's padding", () => {
    // w is locked and w-a holds a, 20px from the frame's border. Only the row b, x can move: 36px down, to that border.
    const session = board(
      [
        { ...box("frame", 100, 100, 1700, 236, "section"), text: "Frame" },
        ...[{ ...box("w", 140, 216, 280, 100), locked: "all" as const }, box("a", 560, 216, 280, 100), box("b", 980, 180, 280, 100), box("x", 1400, 180, 280, 100)]
          .map((object) => ({ ...object, parentId: "frame" })),
      ],
      [connect("w-a", "w", "a"), connect("b-x", "b", "x")],
    );
    const before = session.draft.objects;

    const result = runOp(session, "connect", { id: "a-b", from: { objectId: "a" }, to: { objectId: "b" } });

    expect(result.text).not.toContain("straightened");
    expect(session.draft.objects).toEqual(before);
  });

  test("a frame moves with its box, so the box keeps its place in the frame", () => {
    const session = board(
      [
        box("exec", 600, 200, 280, 100),
        box("other", 600, 400, 280, 100),
        { ...box("db", 1160, 100, 360, 240, "section"), text: "Database" },
        { ...box("events", 1200, 180, 280, 100), parentId: "db" },
      ],
      [connect("exec-other", "exec", "other")],
    );

    const result = runOp(session, "connect", { id: "exec-events", from: { objectId: "exec" }, to: { objectId: "events" } });

    expect(result.text).toContain("straightened exec-events: moved db 20px down");
    expect(at(session, "db")).toEqual({ x: 1160, y: 120, width: 360, height: 240 });
    expect(at(session, "events")).toMatchObject({ x: 1200, y: 200 });
    expect(at(session, "exec")).toMatchObject({ x: 600, y: 200 });
    expect(straight(session, "exec-events")).toBe(true);
  });

  test("arrange_section ends with the wire into the section straight", () => {
    const session = board(
      [
        box("src", 100, 208, 280, 100),
        { ...box("frame", 600, 100, 800, 500, "section"), text: "Frame" },
        { ...box("p", 700, 380, 280, 100), parentId: "frame" },
        { ...box("q", 1040, 180, 280, 100), parentId: "frame" },
      ],
      [connect("src-p", "src", "p")],
    );

    const result = runOp(session, "arrange_section", { section: "frame", rows: [["p", "q"]] });

    expect(result.text).toContain("APPLIED · arrange_section frame");
    expect(result.text).toMatch(/straightened src-p: moved src \d+px up/);
    // The row keeps the place arrange_section gave it.
    expect(at(session, "p").y).toBe(at(session, "q").y);
    expect(at(session, "src").y).toBe(at(session, "p").y);
    expect(straight(session, "src-p")).toBe(true);
  });
});

describe("straighten · wires routed by hand", () => {
  test("a jog the drawer routed stays until tighten_wires, which takes it out with its corners", () => {
    const session = board([box("a", 200, 300, 280, 100), box("b", 620, 320, 280, 100)], [connect("a-b", "a", "b")]);
    const before = session.draft.objects;

    const routed = runOp(session, "route", { id: "a-b", points: [[540, 360], [540, 380]] });

    expect(routed.text).toContain("APPLIED · route a-b");
    expect(routed.text).not.toContain("straightened");
    expect(wire(session, "a-b").waypoints).toEqual([[540, 360], [540, 380]]);
    expect(session.draft.objects).toEqual(before);

    const tightened = runOp(session, "tighten_wires", {});

    expect(tightened.text).toMatch(/straightened a-b: moved (a 20px down|b 20px up)/);
    expect(wire(session, "a-b").waypoints ?? []).toEqual([]);
    expect(straight(session, "a-b")).toBe(true);
  });

  /** w is locked and w-a holds a on its axis, so only b can move for the new wire a-b; b-c is routed by hand. */
  function handRouted(c: InteractiveCanvasObject, points: [number, number][]): Session {
    const session = board(
      [{ ...box("w", 100, 300, 280, 100), locked: "all" }, box("a", 500, 300, 280, 100), box("b", 1000, 320, 280, 100), c],
      [connect("w-a", "w", "a"), connect("b-c", "b", "c")],
    );
    expect(runOp(session, "route", { id: "b-c", points }).text).toContain("APPLIED · route b-c");
    return session;
  }

  test("a box slides along the hand-routed run that leaves it, and that wire keeps its corners", () => {
    // b-c leaves b's bottom edge: b moves up and down along that run.
    const session = handRouted(box("c", 1300, 700, 280, 100), [[1140, 600], [1440, 600]]);

    const result = runOp(session, "connect", { id: "a-b", from: { objectId: "a" }, to: { objectId: "b" } });

    expect(result.text).toContain("straightened a-b: moved b 20px up");
    expect(wire(session, "b-c").waypoints).toEqual([[1140, 600], [1440, 600]]);
    expect(straight(session, "a-b")).toBe(true);
  });

  test("a box stays when the move would cost another wire its hand route", () => {
    // b-c leaves b's right edge: a move up or down breaks its first run.
    const session = handRouted(box("c", 1500, 500, 280, 100), [[1400, 360], [1400, 560]]);
    const before = session.draft.objects;

    const result = runOp(session, "connect", { id: "a-b", from: { objectId: "a" }, to: { objectId: "b" } });

    expect(result.text).not.toContain("straightened");
    expect(session.draft.objects).toEqual(before);
    expect(wire(session, "b-c").waypoints).toEqual([[1400, 360], [1400, 560]]);
  });
});

describe("straighten · at the end of tighten_wires", () => {
  test("a board the slide leaves alone still loses a 2px jog", () => {
    const session = board(
      [box("pick", 200, 200, 280, 120, "decision"), box("ok", 192, 500, 300, 140, "octagon")],
      [connect("pick-ok", "pick", "ok")],
    );
    expect(straight(session, "pick-ok")).toBe(false);

    const result = runOp(session, "tighten_wires", {});

    expect(result.text).toMatch(/APPLIED · tighten_wires · 1 box moved · wire \d+px → \d+px \(−\d+%\) · corners 2 → 0/);
    expect(result.text).toContain("straightened pick-ok: made pick 4px wider");
    expect(straight(session, "pick-ok")).toBe(true);
    expect(runOp(session, "tighten_wires", {}).text).toContain("NO-OP · tighten_wires");
  });
});
