import { describe, expect, test } from "bun:test";

import {
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
} from "@codecaine-ai/canvas/actions";
import { snapGeometry } from "@codecaine-ai/canvas/geometry";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import {
  diffPrograms,
  expandSketch,
  fitScope,
  formatDeltaReport,
  parseSketch,
  routeSketchEdges,
} from "../src/pipeline";
import { loadCanvasBoards } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

describe("diffPrograms", () => {
  test("a pure move emits a single geometry-only updateObject", () => {
    const baseline = makeDocument([box("a", 0, 0), box("b", 0, 160)]);
    const draft = makeDocument([box("a", 0, 0), { ...box("b", 96, 160) }]);
    const { operations, delta } = diffPrograms(baseline, draft);

    expect(operations).toEqual([
      { type: "updateObject", objectId: "b", patch: { geometry: { x: 96, y: 160, width: 160, height: 96 } } },
    ]);
    // Geometry ONLY — never parentId, never waypoints.
    const patch = (operations[0] as { patch: object }).patch;
    expect(Object.keys(patch)).toEqual(["geometry"]);
    expect(delta.moved).toHaveLength(1);
    expect(delta.moved[0]!.movement).toContain("east");
    expect(delta.deleted).toHaveLength(0);
    expect(formatDeltaReport(delta)).toContain("Moved 1 object");
  });

  test("omission is deletion, surfaced loudly, cascades covered", () => {
    const baseline = makeDocument(
      [box("a", 0, 0), box("b", 0, 160), box("c", 0, 320)],
      [connect("connection-1", "a", "b"), connect("connection-2", "b", "c")],
    );
    const draft = makeDocument([box("a", 0, 0), box("c", 0, 320)], []);
    const { operations, delta } = diffPrograms(baseline, draft);

    expect(operations).toEqual([{ type: "removeObject", objectId: "b" }]);
    // No removeConnection ops: both connections cascade with b.
    expect(delta.deleted).toEqual([{ id: "b", type: "rectangle", text: "b" }]);
    expect(delta.deletedConnections).toHaveLength(2);
    const report = formatDeltaReport(delta);
    expect(report).toContain("1 object DELETED");
    expect(report.startsWith("***")).toBe(true);
  });

  test("a dropped connection between kept objects emits removeConnection", () => {
    const baseline = makeDocument(
      [box("a", 0, 0), box("b", 0, 160)],
      [connect("connection-1", "a", "b")],
    );
    const draft = makeDocument([box("a", 0, 0), box("b", 0, 160)], []);
    const { operations, delta } = diffPrograms(baseline, draft);
    expect(operations).toEqual([{ type: "removeConnection", connectionId: "connection-1" }]);
    expect(delta.deletedConnections).toEqual([{ id: "connection-1", from: "a", to: "b" }]);
    expect(formatDeltaReport(delta)).toContain("1 connection DELETED");
  });

  test("new objects mint non-colliding ids and connections remap to them", () => {
    const baseline = makeDocument(
      [box("a", 0, 0), box("new-thing", 0, 160)],
      [connect("connection-1", "a", "new-thing")],
    );
    const draft = makeDocument(
      [
        box("a", 0, 0),
        box("new-thing", 0, 160),
        { ...box("New thing", 300, 0), text: "New thing" },
      ],
      [connect("connection-1", "a", "new-thing"), connect("draft-edge", "New thing", "a")],
    );
    const { operations, delta } = diffPrograms(baseline, draft);

    const add = operations.find((op) => op.type === "addObject");
    expect(add).toBeDefined();
    // Slug of "New thing" is "new-thing", which collides → "-2" suffix.
    expect((add as { object: { id: string } }).object.id).toBe("new-thing-2");
    expect((add as { object: { parentId: null } }).object.parentId).toBeNull();

    const addConnection = operations.find((op) => op.type === "addConnection");
    expect(addConnection).toBeDefined();
    const connection = (addConnection as { connection: { id: string; from: { objectId: string }; to: { objectId: string } } }).connection;
    expect(connection.id).toBe("connection-2");
    expect(connection.from.objectId).toBe("new-thing-2");
    expect(connection.to.objectId).toBe("a");
    expect(delta.created).toEqual([
      { id: "new-thing-2", type: "rectangle", text: "New thing" },
    ]);
    expect(formatDeltaReport(delta)).toContain("Created 1 object");
  });

  test("a connection whose endpoints moved produces NO ops for the connection", () => {
    const baseline = makeDocument(
      [box("a", 0, 0), box("b", 0, 160)],
      [connect("connection-1", "a", "b", )],
    );
    baseline.connections[0]!.waypoints = [[80, 120]];
    const draft = makeDocument(
      [box("a", 480, 0), box("b", 0, 160)],
      [connect("connection-1", "a", "b")],
    );
    const { operations } = diffPrograms(baseline, draft);
    expect(operations).toEqual([
      { type: "updateObject", objectId: "a", patch: { geometry: { x: 480, y: 0, width: 160, height: 96 } } },
    ]);
    // No waypoint ops, no parentId writes anywhere in the patch stream.
    const serialized = JSON.stringify(operations);
    expect(serialized).not.toContain("waypoint");
    expect(serialized).not.toContain("parentId");
  });

  test("made-room ids are reported as their own delta group", () => {
    const baseline = makeDocument([box("a", 0, 0), box("n", 400, 0)]);
    const draft = makeDocument([box("a", 0, 0), box("n", 496, 0)]);
    const { delta } = diffPrograms(baseline, draft, { madeRoomIds: ["n"] });
    expect(delta.madeRoom).toEqual([
      { id: "n", text: "n", movement: expect.stringContaining("east") },
    ]);
    expect(formatDeltaReport(delta)).toContain("Made room by shifting 1 object");
  });
});

describe("end-to-end: fitScope → mutate → expand → diff → apply", () => {
  const { document } = loadCanvasBoards()
    .find((board) => board.file === "agent-flows-2.canvas.json")!;

  test("the whole pure loop applies cleanly through the reducer", () => {
    const scopeIds = document.objects
      .filter((object) => object.type !== "section")
      .slice(0, 8)
      .map((object) => object.id);
    const scope = fitScope(document, scopeIds);

    // Mutate the program text programmatically: flip the first compass slot.
    const flipped: Record<string, string> = { N: "S", S: "N", E: "W", W: "E", C: "NE" };
    const mutated = scope.program.replace(
      / at=(NW|NE|SW|SE|N|S|E|W|C)\b/,
      (full, compass: string) => ` at=${flipped[compass] ?? "C"}`,
    );
    expect(mutated).not.toBe(scope.program);

    // Solve into the scope frame, then rebuild the draft document.
    const expanded = expandSketch(parseSketch(mutated), {
      width: Math.round(scope.frame.width),
      height: Math.round(scope.frame.height),
    });
    const routed = routeSketchEdges(expanded, "corridors");
    const solvedById = new Map(expanded.objects.map((object) => [object.id, object]));
    const draft: InteractiveCanvasDocument = {
      ...document,
      objects: document.objects.map((object) => {
        const solved = solvedById.get(object.id);
        if (!solved) return object;
        return {
          ...object,
          geometry: {
            x: solved.geometry.x + scope.frame.x,
            y: solved.geometry.y + scope.frame.y,
            width: solved.geometry.width,
            height: solved.geometry.height,
          },
        };
      }),
    };

    const { operations, delta } = diffPrograms(document, draft, {
      frame: scope.frame,
      scopeObjectIds: scope.scopeObjectIds,
      routedEdges: routed,
    });
    expect(operations.length).toBeGreaterThan(0);
    expect(operations.every((op) => op.type === "updateObject")).toBe(true);
    expect(delta.deleted).toHaveLength(0);
    expect(formatDeltaReport(delta)).toContain("Moved");

    // Apply through the real reducer: one history entry, agent-stamped, and
    // every changed object lands exactly on its draft geometry.
    const state = createInteractiveCanvasState(document);
    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.applyAgentPatch",
      operations,
      summary: "e2e test",
    });
    expect(next.history.past).toHaveLength(1);
    expect(next.lastChange?.source).toBe("agent");
    // The applier snaps updateObject geometry to the canvas grid exactly the
    // way human edits do (mergeObjectPatch → snapGeometry).
    const draftById = new Map(draft.objects.map((object) => [object.id, object]));
    for (const operation of operations) {
      const objectId = (operation as { objectId: string }).objectId;
      const applied = next.document.objects.find((object) => object.id === objectId)!;
      expect(applied.geometry).toEqual(snapGeometry(draftById.get(objectId)!.geometry));
    }
  });
});
