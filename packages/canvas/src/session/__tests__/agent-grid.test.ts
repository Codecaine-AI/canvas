import { describe, expect, test } from "bun:test";

import {
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
} from "@codecaine-ai/canvas/actions";

import {
  AGENT_GRID,
  snapCoordinate,
  snapGap,
  snapPoint,
  snapSize,
} from "../src/service/session/tools/grid";
import { makeTestSession, runOp } from "./helpers";
import { box, makeDocument } from "./synthetic";

describe("agent grid quantizer", () => {
  test("the grid is 20 and every helper rounds to the nearest multiple", () => {
    expect(AGENT_GRID).toBe(20);
    expect(snapCoordinate(241)).toBe(240);
    expect(snapCoordinate(477)).toBe(480);
    expect(snapCoordinate(-31)).toBe(-40);
    expect(snapCoordinate(0)).toBe(0);
    expect(snapPoint([241, 477])).toEqual([240, 480]);
    expect(snapSize({ width: 187, height: 63 })).toEqual({ width: 180, height: 60 });
    expect(snapGap(97)).toBe(100);
  });

  test("values already on the grid are identities", () => {
    for (const value of [0, 20, 100, 240, 300, 480, 900]) {
      expect(snapCoordinate(value)).toBe(value);
    }
    expect(snapPoint([240, 480])).toEqual([240, 480]);
    expect(snapSize({ width: 300, height: 100 })).toEqual({ width: 300, height: 100 });
    expect(snapGap(120)).toBe(120);
  });

  test("snaps rather than rejects: no input throws, and degenerate input resolves", () => {
    // Sizes never collapse below one grid unit; gaps clamp at 0 (flush is a
    // real gesture, a negative gap is not).
    expect(snapSize({ width: 1, height: 0 })).toEqual({ width: 20, height: 20 });
    expect(snapSize({ width: -400, height: -400 })).toEqual({ width: 20, height: 20 });
    expect(snapGap(-100)).toBe(0);
    expect(snapGap(4)).toBe(0);
    expect(() => snapCoordinate(Number.NaN)).not.toThrow();
    expect(snapCoordinate(Number.NaN)).toBe(0);
    expect(snapCoordinate(Number.POSITIVE_INFINITY)).toBe(0);
    expect(snapSize({ width: Number.NaN, height: Number.NaN })).toEqual({
      width: 20,
      height: 20,
    });
  });
});

/**
 * The round-trip that motivates the whole grid split: a committed proposal
 * replays through the reducer, so 20-grid geometry has to survive
 * canvas.applyAgentPatch -> handleUpdateObject -> mergeObjectPatch untouched.
 * Under the old 16-px normalization snap, 300x100 at (500, 340) came back as
 * 304x96 at (496, 336).
 */
describe("20-grid geometry survives the agent-patch reducer path", () => {
  test("an applyAgentPatch geometry update lands exactly as written", () => {
    const document = makeDocument([
      { ...box("frame", 0, 0, 900, 700, "section"), text: "Frame" },
      box("a", 60, 100, 280, 100),
      box("b", 60, 340, 280, 100),
    ]);
    const state = createInteractiveCanvasState(document);

    const targets: Record<string, { x: number; y: number; width: number; height: number }> = {
      // Every number is a 20-multiple that is NOT a 16-multiple.
      a: { x: 500, y: 100, width: 300, height: 60 },
      b: { x: 500, y: 340, width: 300, height: 60 },
    };

    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.applyAgentPatch",
      operations: Object.entries(targets).map(([objectId, geometry]) => ({
        type: "updateObject" as const,
        objectId,
        patch: { geometry },
      })),
      summary: "Re-pitched the column",
    });

    for (const [id, geometry] of Object.entries(targets)) {
      const object = next.document.objects.find((candidate) => candidate.id === id);
      expect(object?.geometry).toEqual(geometry);
      for (const value of Object.values(object!.geometry)) {
        expect(value % AGENT_GRID).toBe(0);
      }
    }
  });

  test("snapped tool arguments are what lands, end to end", () => {
    const state = createInteractiveCanvasState(makeDocument([box("a", 0, 0, 280, 100)]));

    // What a gesture descriptor does: quantize, then lower.
    const [x, y] = snapPoint([241, 477]);
    const size = snapSize({ width: 187, height: 63 });

    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.applyAgentPatch",
      operations: [
        { type: "updateObject", objectId: "a", patch: { geometry: { x, y, ...size } } },
      ],
    });

    expect(next.document.objects[0]?.geometry).toEqual({
      x: 240,
      y: 480,
      width: 180,
      height: 60,
    });
  });
});

/**
 * The grid rule is about what LANDS, not about what was asked for. Every case
 * here starts from geometry drawn on the UI's own 16 grid — the hand-drawn
 * board an agent inherits — and asserts two things at once: the value the
 * document holds is a 20-multiple, and the value the tool result REPORTS is
 * that same number. (A number that lands off the agent grid is re-rounded by
 * the write path's grid-4 normalization afterwards, which is how a summary
 * that says 13 used to sit over a board that holds 12.)
 */
describe("every geometry a gesture writes lands on the grid", () => {
  /** Two boxes on the 16 grid, inside a frame that is not the subject. */
  function offGridBoard() {
    return makeDocument([
      { ...box("frame", 0, 0, 1200, 900, "section"), text: "Frame" },
      { ...box("a", 16, 16, 176, 128), parentId: "frame" },
      { ...box("b", 400, 16, 176, 128), parentId: "frame" },
    ]);
  }

  function offGridSession() {
    return makeTestSession(offGridBoard(), ["frame"]);
  }

  function geometryOf(session: ReturnType<typeof makeTestSession>, id: string) {
    return session.draft.objects.find((object) => object.id === id)!.geometry;
  }

  function expectOnGrid(geometry: Record<string, number>, fields: string[]): void {
    for (const field of fields) {
      expect(geometry[field]! % AGENT_GRID).toBe(0);
    }
  }

  test("move_by snaps the corner it lands on, not the nudge it was given", () => {
    const session = offGridSession();

    const result = runOp(session, "move_by", { id: "a", dx: 20, dy: 20 });

    // 16 + 20 = 36, which is not on the grid; the box lands at 40 and the
    // summary reports the delta that was actually applied.
    expect(geometryOf(session, "a")).toMatchObject({ x: 40, y: 40 });
    expect(result.text).toContain("APPLIED · move_by a +24,+24 → (40, 40)");
    expectOnGrid(geometryOf(session, "a"), ["x", "y"]);
  });

  test("align snaps the shared coordinate the row agrees on", () => {
    const session = offGridSession();

    const result = runOp(session, "align", { ids: ["a", "b"], edge: "left" });

    expect(geometryOf(session, "a").x).toBe(20);
    expect(geometryOf(session, "b").x).toBe(20);
    // Report == landed: the number in the summary is the number in the board.
    expect(result.text).toContain(`left edges at x=${geometryOf(session, "a").x}`);
    expect(result.text).toContain("left edges at x=20");
  });

  test("align keeps the shared edge exactly shared while snapping it", () => {
    const session = offGridSession();

    const result = runOp(session, "align", { ids: ["a", "b"], edge: "right" });

    const a = geometryOf(session, "a");
    const b = geometryOf(session, "b");
    expect(a.x + a.width).toBe(b.x + b.width);
    expect((a.x + a.width) % AGENT_GRID).toBe(0);
    expect(result.text).toContain(`right edges at x=${a.x + a.width}`);
  });

  test("space_out snaps each position it computes", () => {
    const session = offGridSession();

    const result = runOp(session, "space_out", {
      ids: ["a", "b"],
      axis: "horizontal",
      gap: 40,
    });

    // The first box holds where it was drawn — nothing writes it — and the
    // second takes the snapped coordinate one gap past it (16 + 176 + 40 =
    // 232 → 240), so the clear gap is approximate and the position is exact.
    expect(geometryOf(session, "a").x).toBe(16);
    expect(geometryOf(session, "b").x).toBe(240);
    expect(result.text).toContain(`b x=${geometryOf(session, "b").x}`);
    expect(result.text).toContain("b x=240");
  });

  test("clone snaps the corner it lands on and the size it copies", () => {
    const session = offGridSession();

    const result = runOp(session, "clone", { sourceId: "a", id: "copy" });

    // 16 + the paste offset is off-grid, and the source's own 176×128 is too.
    expect(geometryOf(session, "copy")).toMatchObject({
      x: 40,
      y: 40,
      width: 180,
      height: 120,
    });
    expect(result.text).toContain("APPLIED · clone copy from a 40,40 180×120");
    expectOnGrid(geometryOf(session, "copy"), ["x", "y", "width", "height"]);
  });

  test("match_size snaps both dimensions measured from an off-grid source", () => {
    const session = offGridSession();

    const result = runOp(session, "match_size", { id: "b", like: "a" });

    expect(geometryOf(session, "b")).toMatchObject({ width: 180, height: 120 });
    expect(result.text).toContain("APPLIED · match_size b → 180×120 (matching a)");
  });

  test("move_to and the placements land on the grid from off-grid arguments", () => {
    const session = offGridSession();

    const moved = runOp(session, "move_to", { id: "a", x: 241, y: 477 });
    expect(geometryOf(session, "a")).toMatchObject({ x: 240, y: 480 });
    expect(moved.text).toContain("APPLIED · move_to a → (240, 480)");

    const placed = runOp(session, "place_sticky", { id: "note", text: "n", at: [313, 47] });
    expect(geometryOf(session, "note")).toMatchObject({ x: 320, y: 40 });
    expectOnGrid(geometryOf(session, "note"), ["x", "y", "width", "height"]);
    expect(placed.text).toContain("place_sticky note 320,40");
  });

  test("what a summary reports is what the document holds, off-grid input included", () => {
    // 13 and 157 are on nobody's grid — not the agent's 20, not the write
    // path's own 4 — so this is the case where a descriptor that reported its
    // own arithmetic would print a number the board does not hold.
    const session = makeTestSession(
      makeDocument([
        { ...box("frame", 0, 0, 1200, 900, "section"), text: "Frame" },
        { ...box("odd", 13, 13, 157, 157), parentId: "frame" },
      ]),
      ["frame"],
    );

    const resized = runOp(session, "resize", { id: "odd", width: 213 });
    const sized = geometryOf(session, "odd");
    // The width is written and lands on 20; the height is not written and is
    // left where it was, give or take the write path's own normalization.
    expect(sized.width).toBe(220);
    expect(resized.text).toContain(`resize odd → ${sized.width}×${sized.height}`);

    const moved = runOp(session, "move_to", { id: "odd", x: 13, y: 13 });
    const placed = geometryOf(session, "odd");
    expect(placed).toMatchObject({ x: 20, y: 20 });
    expect(moved.text).toContain(`move_to odd → (${placed.x}, ${placed.y})`);
  });

  test("a carried descendant travels by its root's snapped delta, relative geometry intact", () => {
    const session = makeTestSession(
      makeDocument([
        { ...box("frame", 16, 16, 600, 400, "section"), text: "Frame" },
        { ...box("child", 48, 64, 176, 128), parentId: "frame" },
      ]),
      ["frame"],
    );

    runOp(session, "move_by", { id: "frame", dx: 20, dy: 20 });

    // The frame's own corner is written, so it lands on the grid …
    expect(geometryOf(session, "frame")).toMatchObject({ x: 40, y: 40 });
    // … and the child moves by that same delta, keeping the exact offset it
    // was drawn with rather than being dragged onto the grid behind the
    // model's back.
    expect(geometryOf(session, "child")).toMatchObject({ x: 72, y: 88 });
  });
});
