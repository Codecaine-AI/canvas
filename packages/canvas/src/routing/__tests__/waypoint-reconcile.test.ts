import { describe, expect, it } from "bun:test";
import {
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
  type InteractiveCanvasState,
} from "../../state/actions";
import { buildPastePayload, type CanvasClipboardPayload } from "../../interaction/clipboard";
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../state/schema";

function makeObject(overrides: Partial<InteractiveCanvasObject> & { id: string }): InteractiveCanvasObject {
  return {
    type: "process",
    label: overrides.id,
    geometry: { x: 0, y: 0, width: 100, height: 60 },
    ...overrides,
  };
}

function makeConnection(
  overrides: Partial<InteractiveCanvasConnection> & { id: string },
): InteractiveCanvasConnection {
  return {
    from: { objectId: "a" },
    to: { objectId: "b" },
    ...overrides,
  };
}

const WAYPOINTS: Array<[number, number]> = [
  [150, 200],
  [150, 30],
];

function makeState(): InteractiveCanvasState {
  const document: InteractiveCanvasDocument = {
    schemaVersion: 1,
    id: "waypoint-test",
    mode: "diagram",
    objects: [
      makeObject({ id: "a", geometry: { x: 0, y: 170, width: 100, height: 60 } }),
      makeObject({ id: "b", geometry: { x: 300, y: 0, width: 100, height: 60 } }),
    ],
    connections: [makeConnection({ id: "conn-1", waypoints: WAYPOINTS })],
  };
  return createInteractiveCanvasState(document);
}

function connectionOf(state: InteractiveCanvasState, id = "conn-1"): InteractiveCanvasConnection {
  const connection = state.document.connections.find((candidate) => candidate.id === id);
  if (!connection) throw new Error(`connection ${id} missing`);
  return connection;
}

describe("stale-waypoint reconciliation (W4)", () => {
  it("translates waypoints rigidly when BOTH endpoint owners move by the same delta (section-carry)", () => {
    const state = makeState();
    // Section-carry / multi-drag commits arrive as one updateObjectGeometries
    // with every carried member offset by the same delta.
    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObjectGeometries",
      geometries: {
        a: { x: 40, y: 195, width: 100, height: 60 },
        b: { x: 340, y: 25, width: 100, height: 60 },
      },
      snap: false,
      summary: "Dragged selection",
    });
    expect(connectionOf(next).waypoints).toEqual([
      [190, 225],
      [190, 55],
    ]);
  });

  it("drops waypoints when only one endpoint owner moves (asymmetric drag -> auto-route)", () => {
    const state = makeState();
    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObjectGeometries",
      geometries: { a: { x: 500, y: 500, width: 100, height: 60 } },
      snap: false,
      summary: "Dragged selection",
    });
    expect(connectionOf(next).waypoints).toBeUndefined();
  });

  it("drops waypoints when both owners move but by different deltas", () => {
    const state = makeState();
    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObjectGeometries",
      geometries: {
        a: { x: 10, y: 170, width: 100, height: 60 },
        b: { x: 340, y: 80, width: 100, height: 60 },
      },
      snap: false,
      summary: "Dragged selection",
    });
    expect(connectionOf(next).waypoints).toBeUndefined();
  });

  it("drops waypoints when an endpoint owner is resized", () => {
    const state = makeState();
    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.resizeObject",
      objectId: "a",
      width: 220,
      height: 90,
      snap: false,
    });
    expect(connectionOf(next).waypoints).toBeUndefined();
  });

  it("translates waypoints on a nudge of both owners (canvas.moveSelection)", () => {
    let state = makeState();
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.select",
      selection: { kind: "objects", objectIds: ["a", "b"] },
    });
    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.moveSelection",
      dx: 16,
      dy: -8,
      snap: false,
    });
    expect(connectionOf(next).waypoints).toEqual([
      [166, 192],
      [166, 22],
    ]);
  });

  it("keeps waypoints untouched when neither owner moves", () => {
    const state = makeState();
    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObject",
      objectId: "a",
      patch: { label: "renamed" },
    });
    expect(connectionOf(next).waypoints).toEqual(WAYPOINTS);
  });

  it("one undo restores both geometry and the original waypoints", () => {
    const state = makeState();
    const moved = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObjectGeometries",
      geometries: { a: { x: 500, y: 500, width: 100, height: 60 } },
      snap: false,
      summary: "Dragged selection",
    });
    expect(connectionOf(moved).waypoints).toBeUndefined();
    const undone = reduceInteractiveCanvasState(moved, { type: "canvas.undo" });
    expect(undone.document.objects.find((o) => o.id === "a")?.geometry.x).toBe(0);
    expect(connectionOf(undone).waypoints).toEqual(WAYPOINTS);
  });

  it("live-preview (recordHistory: false) frames also reconcile waypoints", () => {
    const state = makeState();
    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObjectGeometries",
      geometries: {
        a: { x: 8, y: 178, width: 100, height: 60 },
        b: { x: 308, y: 8, width: 100, height: 60 },
      },
      snap: false,
      recordHistory: false,
      summary: "Dragged selection",
    });
    expect(connectionOf(next).waypoints).toEqual([
      [158, 208],
      [158, 38],
    ]);
  });

  it("duplicateSelection translates the cloned connection's waypoints by the +24 offset", () => {
    let state = makeState();
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.select",
      selection: { kind: "objects", objectIds: ["a", "b"] },
    });
    const next = reduceInteractiveCanvasState(state, { type: "canvas.duplicateSelection" });
    const cloned = next.document.connections.find((connection) => connection.id !== "conn-1");
    expect(cloned).toBeDefined();
    expect(cloned?.waypoints).toEqual([
      [174, 224],
      [174, 54],
    ]);
    // The original connection is untouched.
    expect(connectionOf(next).waypoints).toEqual(WAYPOINTS);
  });

  it("buildPastePayload translates waypoints by the paste offset", () => {
    const clipboard: CanvasClipboardPayload = {
      objects: [
        makeObject({ id: "a", geometry: { x: 0, y: 170, width: 100, height: 60 } }),
        makeObject({ id: "b", geometry: { x: 300, y: 0, width: 100, height: 60 } }),
      ],
      connections: [makeConnection({ id: "conn-1", waypoints: WAYPOINTS })],
      sourcePoint: { x: 200, y: 115 },
    };
    const payload = buildPastePayload(clipboard, { x: 300, y: 215 });
    expect(payload.connections[0]?.waypoints).toEqual([
      [250, 300],
      [250, 130],
    ]);
    // Default offset (no target point) is +24/+24.
    const defaultPayload = buildPastePayload(clipboard);
    expect(defaultPayload.connections[0]?.waypoints).toEqual([
      [174, 224],
      [174, 54],
    ]);
  });
});
