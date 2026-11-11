/**
 * fit_section (gesture-surface S2.4), plus the `resize` `like` size lookup.
 * The fit closes a frame around what its children paint with the same air on
 * both sides, evens the gaps of a row, and never stretches a box or the frame.
 */
import { describe, expect, test } from "bun:test";

import { routedPolyline } from "../../board/lints/geometry";
import { paintedRects } from "../../connectors/label-placement";
import type { CanvasGeometry, InteractiveCanvasObject } from "../../state/schema";

import { resolveSizeLike } from "../apply-ops";
import { resolveFitSection } from "../section-fit";
import { AGENT_GRID, snapRectOutward } from "../tools/grid";
import { makeTestSession, runOp } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

function frame(id: string, x: number, y: number, width: number, height: number) {
  return { ...box(id, x, y, width, height, "section"), text: id } as InteractiveCanvasObject;
}

function fittedGeometry(
  objects: InteractiveCanvasObject[],
  sectionId: string,
): CanvasGeometry {
  const resolved = resolveFitSection(makeDocument(objects), sectionId);
  if ("note" in resolved) throw new Error(`expected a fit, got: ${resolved.note}`);
  return resolved.moves.at(-1)!.geometry;
}

/** A node inside "frame". */
function node(id: string, x: number, y = 200): InteractiveCanvasObject {
  return { ...box(id, x, y, 160, 80), parentId: "frame" };
}

/** Run fit_section on "frame" and read the board back. */
function fit(objects: InteractiveCanvasObject[], connections = [] as ReturnType<typeof connect>[], width = 1400) {
  const session = makeTestSession(makeDocument([frame("frame", 0, 0, width, 700), ...objects], connections), ["frame"]);
  const result = runOp(session, "fit_section", { id: "frame" });
  expect(result.isError).toBeUndefined();
  const geometry = (id: string) => session.draft.objects.find((object) => object.id === id)!.geometry;
  const gap = (left: string, right: string) => geometry(right).x - (geometry(left).x + geometry(left).width);
  return { session, text: result.text, geometry, gap };
}

describe("fit_section pads its frame", () => {
  test("a frame fitted around 20-grid children is all multiples of 20", () => {
    const geometry = fittedGeometry(
      [
        frame("frame", 0, 0, 1000, 600),
        box("kid-a", 200, 200, 300, 60),
        box("kid-b", 560, 320, 180, 100),
      ],
      "frame",
    );

    expect(geometry).toEqual({ x: 160, y: 120, width: 620, height: 340 });
    for (const value of [geometry.x, geometry.y, geometry.width, geometry.height]) {
      expect(value % AGENT_GRID).toBe(0);
    }
    // 40 of body air on the left/right/bottom, 40 + 40 above the first child
    // (the title chip's band on top of the body rung).
    expect(200 - geometry.x).toBe(40);
    expect(200 - geometry.y).toBe(80);
    expect(geometry.x + geometry.width - (560 + 180)).toBe(40);
    expect(geometry.y + geometry.height - (320 + 100)).toBe(40);
  });

  test("the top gap keeps the spacing the old flat 48 padding produced", () => {
    // 40 body + 40 title clearance = 80 against the old 48 + 30 = 78: fitted
    // frames look the same, they are just on grid now.
    const geometry = fittedGeometry(
      [frame("frame", 0, 0, 800, 600), box("kid", 300, 300, 200, 100)],
      "frame",
    );
    expect(300 - geometry.y).toBe(80);
  });

  test("children drawn off the grid get the same air on both sides", () => {
    const geometry = fittedGeometry(
      [frame("frame", 0, 0, 1000, 600), box("kid-a", 203, 207, 301, 63), box("kid-b", 517, 141, 97, 219)],
      "frame",
    );

    const left = 203 - geometry.x;
    const right = geometry.x + geometry.width - (517 + 97);
    const top = 141 - geometry.y - 40;
    const bottom = geometry.y + geometry.height - (141 + 219);
    for (const air of [left, right, top, bottom]) {
      expect(air).toBeGreaterThanOrEqual(40);
      expect(air).toBeLessThan(44);
    }
  });

  test("nothing to fit still reports the same notes", () => {
    const empty = resolveFitSection(makeDocument([frame("frame", 0, 0, 400, 300)]), "frame");
    expect(empty).toHaveProperty("note");
    expect((empty as { note: string }).note).toContain("empty");

    const missing = resolveFitSection(makeDocument([box("plain", 0, 0)]), "plain");
    expect((missing as { note: string }).note).toContain("no section");
  });
});

describe("fit_section centres what the frame holds", () => {
  test("two icons sit with equal air left and right, and above and below", () => {
    const icon = (id: string, x: number): InteractiveCanvasObject =>
      ({ id, type: "icon", icon: "agent", text: id, parentId: "frame", geometry: { x, y: 220, width: 300, height: 120 } });
    const { session, geometry } = fit([icon("greptile", 120), icon("coderabbit", 520)]);

    const painted = session.draft.objects.filter((object) => object.type === "icon")
      .flatMap((object) => paintedRects(object));
    const edge = (pick: (rect: (typeof painted)[number]) => number, most: typeof Math.max) => most(...painted.map(pick));
    const box = geometry("frame");
    const left = edge((rect) => rect.x, Math.min) - box.x;
    const right = box.x + box.width - edge((rect) => rect.x + rect.width, Math.max);
    const top = edge((rect) => rect.y, Math.min) - box.y - 40;
    const bottom = box.y + box.height - edge((rect) => rect.y + rect.height, Math.max);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(4);
    expect(Math.abs(top - bottom)).toBeLessThanOrEqual(4);
  });

  test("a wire that loops around the boxes stays inside the frame", () => {
    const top: [number, number] = [0.5, 0];
    const loop = {
      id: "back",
      from: { objectId: "b", position: top },
      to: { objectId: "a", position: top },
      waypoints: [[880, 100], [280, 100]] as [number, number][],
    };
    const { geometry } = fit([node("a", 200), node("b", 800)], [loop]);

    // The loop runs 100px above the boxes. Without it the frame top sits at 120.
    expect(geometry("frame").y).toBeLessThanOrEqual(60);
  });
});

describe("fit_section evens a row", () => {
  test("a loop wire that moves with its nodes stays inside the frame", () => {
    const loop = {
      id: "loop",
      from: { objectId: "b", position: [0.5, 0] as [number, number] },
      to: { objectId: "under-b", position: [1, 0.5] as [number, number] },
      waypoints: [[860, 100], [1600, 100], [1600, 440]] as [number, number][],
    };
    const { session, geometry } = fit(
      [node("a", 600), node("b", 780), node("c", 1120), node("under-b", 780, 400)],
      [loop],
      2000,
    );

    expect(geometry("b").x).toBe(860);
    const frame = geometry("frame");
    const reach = Math.max(...routedPolyline(session.draft.connections[0]!, session.draft).map((point) => point.x));
    expect(reach).toBe(1680);
    expect(frame.x + frame.width).toBeGreaterThanOrEqual(reach + 20);
  });

  test("a row of three gets equal gaps between its end nodes, and a second fit changes nothing", () => {
    const { session, text, geometry, gap } = fit([node("a", 200), node("b", 380), node("c", 720)]);

    expect(text).toContain("evened a, b, c");
    expect(geometry("a").x).toBe(200);
    expect(geometry("c").x).toBe(720);
    expect(gap("a", "b")).toBe(100);
    expect(gap("b", "c")).toBe(100);
    expect(geometry("b").width).toBe(160);
    expect(runOp(session, "fit_section", { id: "frame" }).text).toContain("NO-OP");
  });

  test("a row keeps its gaps, with the reason, when evening would squeeze a wire label", () => {
    const wire = { ...connect("w", "a", "b"), label: "returns the parsed findings list" };
    const { session, text, gap } = fit([node("a", 400), node("b", 760), node("c", 940)], [wire]);

    // Unlabelled, the 200px gap would shrink to the average, 110px.
    const reason = "row a, b, c keeps uneven gaps: a wire label would lose its room";
    expect(text).toContain(reason);
    expect(gap("a", "b")).toBe(200);
    const again = runOp(session, "fit_section", { id: "frame" }).text;
    expect(again).toContain("NO-OP");
    expect(again).toContain(reason);
  });

  test("a label in the row under a moved node keeps its room too", () => {
    const wire = { ...connect("w", "e", "f"), label: "returns the parsed findings list" };
    const nodes = [
      node("a", 200), node("b", 380), node("c", 720),
      node("d", 200, 400), node("e", 380, 400), node("f", 800, 400),
    ];
    const { text, geometry } = fit(nodes, [wire]);

    // Evening a, b, c alone would carry e 80px toward f.
    expect(text).toContain("row a, b, c keeps uneven gaps: a wire label would lose its room");
    expect(geometry("e").x).toBe(380);
  });

  test("two rows that share their end centerlines are both evened in one call", () => {
    const { session, gap } = fit([
      node("a", 200), node("b", 380), node("c", 720),
      node("d", 200, 400), node("e", 540, 400), node("f", 720, 400),
    ]);

    for (const [left, right] of [["a", "b"], ["b", "c"], ["d", "e"], ["e", "f"]]) expect(gap(left!, right!)).toBe(100);
    expect(runOp(session, "fit_section", { id: "frame" }).text).toContain("NO-OP");
  });

  test("the end nodes of a long row hold to the pixel", () => {
    const { geometry, gap } = fit([node("a", 200), node("b", 380), node("c", 720), node("d", 1000)]);

    expect(geometry("a").x).toBe(200);
    expect(geometry("d").x).toBe(1000);
    const gaps = [gap("a", "b"), gap("b", "c"), gap("c", "d")];
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(4);
  });

  test("a node under a moved node keeps its centre line", () => {
    const { geometry } = fit([node("a", 200), node("b", 380), node("c", 720), node("under-b", 380, 400)]);

    expect(geometry("b").x).toBe(460);
    expect(geometry("under-b").x).toBe(460);
  });

  test("a row stays as it is, with the reason, when evening it would spoil the row under it", () => {
    const nodes = [
      node("a", 200), node("b", 380), node("c", 720),
      node("d", 120, 400), node("e", 380, 400), node("f", 640, 400),
    ];
    const { text, geometry } = fit(nodes);

    expect(text).toContain("row a, b, c keeps uneven gaps: another row would get less even");
    for (const kept of nodes) expect(geometry(kept.id)).toEqual(kept.geometry);
  });

  test("a note and a locked box are not spread", () => {
    const note = { ...box("note", 380, 200, 160, 80, "sticky"), parentId: "frame" };
    const locked = { ...node("locked", 560), locked: "position" as const };
    const { text, geometry } = fit([node("a", 200), note, locked, node("c", 1000)]);

    expect(text).not.toContain("evened");
    expect(geometry("note").x).toBe(380);
    expect(geometry("locked").x).toBe(560);
  });
});

describe("snapRectOutward", () => {
  test("is an identity on grid multiples", () => {
    const rect = { x: 160, y: 120, width: 620, height: 340 };
    expect(snapRectOutward(rect)).toEqual(rect);
  });

  test("grows: the snapped rect always contains the input", () => {
    const rect = { x: 163, y: 127, width: 381, height: 183 };
    const snapped = snapRectOutward(rect);
    expect(snapped).toEqual({ x: 160, y: 120, width: 400, height: 200 });
    expect(snapped.x).toBeLessThanOrEqual(rect.x);
    expect(snapped.y).toBeLessThanOrEqual(rect.y);
    expect(snapped.x + snapped.width).toBeGreaterThanOrEqual(rect.x + rect.width);
    expect(snapped.y + snapped.height).toBeGreaterThanOrEqual(rect.y + rect.height);
  });

  test("handles negative coordinates and degenerate input", () => {
    expect(snapRectOutward({ x: -31, y: -1, width: 2, height: 2 })).toEqual({
      x: -40,
      y: -20,
      width: 20,
      height: 40,
    });
    expect(snapRectOutward({ x: Number.NaN, y: 0, width: 10, height: 10 })).toEqual({
      x: 0,
      y: 0,
      width: 20,
      height: 20,
    });
  });
});

describe("resize like lookup", () => {
  test("reads the source object's size, and null for an unknown id", () => {
    const document = makeDocument([box("model", 0, 0, 300, 60), box("peer", 400, 0, 180, 40)]);
    expect(resolveSizeLike(document, "model")).toEqual({ width: 300, height: 60 });
    expect(resolveSizeLike(document, "peer")).toEqual({ width: 180, height: 40 });
    expect(resolveSizeLike(document, "connection-1")).toBeNull();
  });

  test("returns the raw size — the descriptor is what quantizes it", () => {
    const document = makeDocument([box("hand-drawn", 0, 0, 187, 63)]);
    expect(resolveSizeLike(document, "hand-drawn")).toEqual({ width: 187, height: 63 });
  });
});
