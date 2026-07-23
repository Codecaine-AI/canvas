import { describe, expect, it } from "bun:test";
import {
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
  type CanvasAgentPatchOperation,
  type InteractiveCanvasState,
} from "../actions";
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../schema";

function makeObject(
  overrides: Partial<InteractiveCanvasObject> & { id: string },
): InteractiveCanvasObject {
  return {
    type: "process",
    text: overrides.id,
    geometry: { x: 0, y: 0, width: 96, height: 64 },
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

/**
 * Baseline board (all grid-aligned, 16px grid):
 *  - sec-1: large empty-ish section at (480, 0) 320x320
 *  - a (0,0), b (192,0): connected by conn-ab (with waypoints)
 *  - c (0,192): connected to a by conn-ca
 */
function makeState(): InteractiveCanvasState {
  const document: InteractiveCanvasDocument = {
    schemaVersion: 1,
    id: "agent-patch-test",
    mode: "diagram",
    objects: [
      makeObject({
        id: "sec-1",
        type: "section",
        geometry: { x: 480, y: 0, width: 320, height: 320 },
      }),
      makeObject({ id: "a", geometry: { x: 0, y: 0, width: 96, height: 64 } }),
      makeObject({ id: "b", geometry: { x: 192, y: 0, width: 96, height: 64 } }),
      makeObject({ id: "c", geometry: { x: 0, y: 192, width: 96, height: 64 } }),
    ],
    connections: [
      makeConnection({
        id: "conn-ab",
        from: { objectId: "a" },
        to: { objectId: "b" },
        waypoints: [
          [144, 32],
          [144, 96],
        ],
      }),
      makeConnection({ id: "conn-ca", from: { objectId: "c" }, to: { objectId: "a" } }),
    ],
  };
  return createInteractiveCanvasState(document);
}

function apply(
  state: InteractiveCanvasState,
  operations: CanvasAgentPatchOperation[],
  summary?: string,
): InteractiveCanvasState {
  return reduceInteractiveCanvasState(state, {
    type: "canvas.applyAgentPatch",
    operations,
    summary,
  });
}

describe("canvas.applyAgentPatch", () => {
  it("applies all operations as ONE history entry, and one undo restores the pre-patch document exactly", () => {
    const state = makeState();
    const baseline = state.document;
    const next = apply(state, [
      {
        type: "addObject",
        object: makeObject({ id: "d", geometry: { x: 0, y: 320, width: 96, height: 64 } }),
      },
      {
        type: "updateObject",
        objectId: "b",
        patch: { geometry: { x: 320, y: 0, width: 96, height: 64 } },
      },
      { type: "removeConnection", connectionId: "conn-ca" },
    ]);

    expect(next.history.past).toHaveLength(state.history.past.length + 1);
    expect(next.history.future).toHaveLength(0);
    expect(next.document.objects.map((object) => object.id)).toContain("d");

    const undone = reduceInteractiveCanvasState(next, { type: "canvas.undo" });
    expect(undone.document).toBe(baseline);
  });

  it("stamps lastChange source:'agent' with changedObjectIds/changedConnectionIds covering every touched id", () => {
    const state = makeState();
    const next = apply(
      state,
      [
        {
          type: "addObject",
          object: makeObject({ id: "d", geometry: { x: 0, y: 320, width: 96, height: 64 } }),
        },
        {
          type: "updateObject",
          objectId: "b",
          patch: { geometry: { x: 320, y: 0, width: 96, height: 64 } },
        },
        { type: "removeObject", objectId: "c" },
        { type: "removeConnection", connectionId: "conn-ab" },
      ],
      "Rearranged flow",
    );

    expect(next.lastChange?.source).toBe("agent");
    expect(next.lastChange?.summary).toBe("Rearranged flow");
    expect(next.lastChange?.changedObjectIds.sort()).toEqual(["b", "c", "d"]);
    // conn-ca cascades away with c; conn-ab removed explicitly.
    expect(next.lastChange?.changedConnectionIds.sort()).toEqual(["conn-ab", "conn-ca"]);
  });

  it("removeObject drops the object AND its connections (delete cascade)", () => {
    const state = makeState();
    const next = apply(state, [{ type: "removeObject", objectId: "a" }]);

    expect(next.document.objects.some((object) => object.id === "a")).toBe(false);
    // Both connections touch "a" — both cascade away.
    expect(next.document.connections).toHaveLength(0);
    expect(next.lastChange?.changedObjectIds).toEqual(["a"]);
    expect(next.lastChange?.changedConnectionIds.sort()).toEqual(["conn-ab", "conn-ca"]);
  });

  it("skips operations referencing unknown ids but applies the rest", () => {
    const state = makeState();
    const next = apply(state, [
      { type: "removeObject", objectId: "nope" },
      { type: "updateObject", objectId: "ghost", patch: { text: "boo" } },
      { type: "removeConnection", connectionId: "conn-ab" },
    ]);

    expect(next.document.objects).toHaveLength(state.document.objects.length);
    expect(next.document.connections.map((connection) => connection.id)).toEqual(["conn-ca"]);
    expect(next.lastChange?.changedConnectionIds).toEqual(["conn-ab"]);
  });

  it("returns state unchanged (no history entry) when every operation skips", () => {
    const state = makeState();
    const next = apply(state, [
      { type: "removeObject", objectId: "nope" },
      { type: "removeConnection", connectionId: "nada" },
    ]);
    expect(next).toBe(state);
  });

  it("re-derives section membership after a geometry-moving patch (parentId via reconcile, never from the op)", () => {
    const state = makeState();
    // Move c inside sec-1's bounds — the op writes geometry only.
    const next = apply(state, [
      {
        type: "updateObject",
        objectId: "c",
        patch: { geometry: { x: 512, y: 96, width: 96, height: 64 } },
      },
    ]);
    const c = next.document.objects.find((object) => object.id === "c");
    expect(c?.parentId).toBe("sec-1");
  });

  it("ignores parentId written directly in patch ops (membership stays geometry-derived)", () => {
    const state = makeState();
    // c stays far outside sec-1 — a direct parentId write must not stick.
    const next = apply(state, [
      { type: "updateObject", objectId: "c", patch: { parentId: "sec-1", text: "c2" } },
      {
        type: "addObject",
        object: makeObject({
          id: "e",
          parentId: "sec-1",
          geometry: { x: 0, y: 480, width: 96, height: 64 },
        }),
      },
    ]);
    expect(next.document.objects.find((object) => object.id === "c")?.parentId ?? null).toBe(null);
    expect(next.document.objects.find((object) => object.id === "c")?.text).toBe("c2");
    expect(next.document.objects.find((object) => object.id === "e")?.parentId ?? null).toBe(null);
  });

  it("clears waypoints on connectors whose endpoint moved (post-reduce reconcile runs for this action)", () => {
    const state = makeState();
    expect(
      state.document.connections.find((connection) => connection.id === "conn-ab")?.waypoints,
    ).toBeDefined();
    // Move only "a" — asymmetric endpoint move → waypoints drop for re-route.
    const next = apply(state, [
      {
        type: "updateObject",
        objectId: "a",
        patch: { geometry: { x: 0, y: 96, width: 96, height: 64 } },
      },
    ]);
    expect(
      next.document.connections.find((connection) => connection.id === "conn-ab")?.waypoints,
    ).toBeUndefined();
  });

  it("addConnection validates endpoints against the patched document (same-patch addObject counts)", () => {
    const state = makeState();
    const next = apply(state, [
      {
        type: "addObject",
        object: makeObject({ id: "d", geometry: { x: 192, y: 192, width: 96, height: 64 } }),
      },
      {
        type: "addConnection",
        connection: makeConnection({
          id: "conn-bd",
          from: { objectId: "b" },
          to: { objectId: "d" },
        }),
      },
      {
        // Dangling endpoint → skipped.
        type: "addConnection",
        connection: makeConnection({
          id: "conn-bad",
          from: { objectId: "b" },
          to: { objectId: "missing" },
        }),
      },
    ]);
    expect(next.document.connections.map((connection) => connection.id)).toContain("conn-bd");
    expect(next.document.connections.map((connection) => connection.id)).not.toContain("conn-bad");
  });

  it("prunes removed objects from the selection", () => {
    let state = makeState();
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.select",
      selection: { kind: "objects", objectIds: ["a", "b"] },
    });
    const next = apply(state, [{ type: "removeObject", objectId: "a" }]);
    expect(next.selection).toEqual({ kind: "objects", objectIds: ["b"] });
  });

  it("grows a section when an object is added inside it", () => {
    const state = createInteractiveCanvasState({
      schemaVersion: 1,
      id: "auto-fit-add",
      mode: "diagram",
      objects: [
        makeObject({
          id: "section",
          type: "section",
          geometry: { x: 496, y: 16, width: 144, height: 144 },
        }),
        makeObject({
          id: "first",
          geometry: { x: 512, y: 64, width: 96, height: 64 },
        }),
      ],
      connections: [],
    });

    const next = apply(state, [
      {
        type: "addObject",
        object: makeObject({
          id: "second",
          geometry: { x: 576, y: 64, width: 96, height: 64 },
        }),
      },
    ]);

    expect(next.document.objects.find((object) => object.id === "second")?.parentId).toBe(
      "section",
    );
    expect(next.document.objects.find((object) => object.id === "section")?.geometry).toEqual({
      x: 496,
      y: 16,
      width: 208,
      height: 144,
    });
    expect(next.lastChange?.changedObjectIds.sort()).toEqual(["second", "section"]);
  });

  it("shrinks a section when an object moves out", () => {
    const state = createInteractiveCanvasState({
      schemaVersion: 1,
      id: "auto-fit-move-out",
      mode: "diagram",
      objects: [
        makeObject({
          id: "section",
          type: "section",
          geometry: { x: 496, y: 16, width: 208, height: 144 },
        }),
        makeObject({ id: "first", geometry: { x: 512, y: 64, width: 96, height: 64 } }),
        makeObject({ id: "second", geometry: { x: 576, y: 64, width: 96, height: 64 } }),
      ],
      connections: [],
    });

    const next = apply(state, [
      {
        type: "updateObject",
        objectId: "second",
        patch: { geometry: { x: 0, y: 0, width: 96, height: 64 } },
      },
    ]);

    expect(next.document.objects.find((object) => object.id === "second")?.parentId ?? null).toBe(
      null,
    );
    expect(next.document.objects.find((object) => object.id === "section")?.geometry).toEqual({
      x: 496,
      y: 16,
      width: 144,
      height: 144,
    });
  });

  it("fits nested sections innermost-first so geometry cascades outward", () => {
    const state = createInteractiveCanvasState({
      schemaVersion: 1,
      id: "auto-fit-nested",
      mode: "diagram",
      objects: [
        makeObject({
          id: "outer",
          type: "section",
          geometry: { x: 480, y: 64, width: 192, height: 224 },
        }),
        makeObject({
          id: "inner",
          type: "section",
          geometry: { x: 496, y: 112, width: 144, height: 144 },
        }),
        makeObject({ id: "first", geometry: { x: 512, y: 160, width: 96, height: 64 } }),
      ],
      connections: [],
    });

    const next = apply(state, [
      {
        type: "addObject",
        object: makeObject({
          id: "second",
          geometry: { x: 576, y: 160, width: 96, height: 64 },
        }),
      },
    ]);

    expect(next.document.objects.find((object) => object.id === "inner")?.geometry).toEqual({
      x: 496,
      y: 112,
      width: 208,
      height: 144,
    });
    expect(next.document.objects.find((object) => object.id === "outer")?.geometry).toEqual({
      x: 480,
      y: 64,
      width: 256,
      height: 224,
    });
    expect(next.lastChange?.changedObjectIds.sort()).toEqual(["inner", "outer", "second"]);
  });

  it("never auto-fits a background-locked page frame", () => {
    const frameGeometry = { x: 0, y: 0, width: 800, height: 600 };
    const state = createInteractiveCanvasState({
      schemaVersion: 1,
      id: "auto-fit-frame",
      mode: "diagram",
      objects: [
        makeObject({
          id: "frame",
          type: "section",
          locked: "background",
          geometry: frameGeometry,
        }),
      ],
      connections: [],
    });

    const next = apply(state, [
      {
        type: "addObject",
        object: makeObject({ id: "inside", geometry: { x: 96, y: 96, width: 96, height: 64 } }),
      },
    ]);

    expect(next.document.objects.find((object) => object.id === "inside")?.parentId).toBe("frame");
    expect(next.document.objects.find((object) => object.id === "frame")?.geometry).toEqual(
      frameGeometry,
    );
    expect(next.lastChange?.changedObjectIds).toEqual(["inside"]);
  });

  it("lets an explicit in-batch section resize win over auto-fit", () => {
    const explicitGeometry = { x: 496, y: 16, width: 320, height: 256 };
    const state = createInteractiveCanvasState({
      schemaVersion: 1,
      id: "auto-fit-explicit-resize",
      mode: "diagram",
      objects: [
        makeObject({
          id: "section",
          type: "section",
          geometry: { x: 496, y: 16, width: 144, height: 144 },
        }),
        makeObject({ id: "child", geometry: { x: 512, y: 64, width: 96, height: 64 } }),
      ],
      connections: [],
    });

    const next = apply(state, [
      {
        type: "updateObject",
        objectId: "child",
        patch: { geometry: { x: 576, y: 64, width: 96, height: 64 } },
      },
      {
        type: "updateObject",
        objectId: "section",
        patch: { geometry: explicitGeometry },
      },
    ]);

    expect(next.document.objects.find((object) => object.id === "section")?.geometry).toEqual(
      explicitGeometry,
    );
    expect(next.history.past).toHaveLength(1);
  });
});
