import { describe, expect, it } from "bun:test";
import {
  IDLE_INTERACTION_STATE,
  MIN_DIRECT_RESIZE_SIZE,
  RESIZE_HANDLES,
  applyResizeHandle,
  cancelInteraction,
  stepInteraction,
  type CanvasAction,
  type CanvasPointerEvent,
  type CanvasSelection,
  type InteractionContext,
  type InteractionState,
  type InteractiveCanvasConnection,
  type InteractiveCanvasDocument,
  type InteractiveCanvasObject,
  type ResizeHandle,
} from "../../../../../index";

/** Selection slice gesture routing and drag-select coverage. */
function makeObject(overrides: Partial<InteractiveCanvasObject> & { id: string }): InteractiveCanvasObject {
  return {
    type: "process",
    text: overrides.id,
    geometry: { x: 0, y: 0, width: 100, height: 100 },
    ...overrides,
  };
}

function makeDocument(
  objects: InteractiveCanvasObject[],
  connections: InteractiveCanvasConnection[] = [],
): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "test-doc",
    mode: "diagram",
    objects,
    connections,
  };
}

function makeConnection(
  overrides: Partial<InteractiveCanvasConnection> & { id: string; from: InteractiveCanvasConnection["from"]; to: InteractiveCanvasConnection["to"] },
): InteractiveCanvasConnection {
  return { ...overrides };
}

function makeContext(
  document: InteractiveCanvasDocument,
  overrides: Partial<InteractionContext> = {},
): InteractionContext {
  return {
    document,
    selection: { kind: "none" },
    tool: "select",
    viewport: { x: 0, y: 0, zoom: 1 },
    ...overrides,
  };
}

function pointerEvent(overrides: Partial<CanvasPointerEvent> & { type: CanvasPointerEvent["type"] }): CanvasPointerEvent {
  return {
    world: { x: 0, y: 0 },
    screen: { x: 0, y: 0 },
    button: 0,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    hit: { kind: "canvas" },
    ...overrides,
  };
}

function down(world: { x: number; y: number }, hit: CanvasPointerEvent["hit"], shiftKey = false): CanvasPointerEvent {
  return pointerEvent({ type: "down", world, screen: world, hit, shiftKey });
}

function move(world: { x: number; y: number }, hit: CanvasPointerEvent["hit"] = { kind: "canvas" }): CanvasPointerEvent {
  return pointerEvent({ type: "move", world, screen: world, hit });
}

function up(world: { x: number; y: number }, hit: CanvasPointerEvent["hit"] = { kind: "canvas" }, shiftKey = false): CanvasPointerEvent {
  return pointerEvent({ type: "up", world, screen: world, hit, shiftKey });
}

function updateGeometriesActions(actions: CanvasAction[]) {
  return actions.filter(
    (action): action is Extract<CanvasAction, { type: "canvas.updateObjectGeometries" }> =>
      action.type === "canvas.updateObjectGeometries",
  );
}

function reconcileSectionActions(actions: CanvasAction[]) {
  return actions.filter(
    (action): action is Extract<CanvasAction, { type: "canvas.reconcileSectionMembership" }> =>
      action.type === "canvas.reconcileSectionMembership",
  );
}

describe("interaction: click selection (sub-threshold press+release)", () => {
  it("keeps hand mode as pure pan for synthetic object clicks and drags", () => {
    const document = makeDocument([
      makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } }),
      makeObject({ id: "b", geometry: { x: 150, y: 0, width: 100, height: 100 } }),
    ]);
    const ctx = makeContext(document, {
      tool: "hand",
      selection: { kind: "objects", objectIds: ["b"] },
    });

    let result = stepInteraction(
      IDLE_INTERACTION_STATE,
      down({ x: 50, y: 50 }, { kind: "object", objectId: "a" }),
      ctx,
    );
    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toEqual([]);

    result = stepInteraction(result.state, up({ x: 50, y: 50 }, { kind: "object", objectId: "a" }), ctx);
    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toEqual([]);

    result = stepInteraction(
      IDLE_INTERACTION_STATE,
      down({ x: 50, y: 50 }, { kind: "object", objectId: "a" }),
      ctx,
    );
    result = stepInteraction(result.state, move({ x: 90, y: 90 }, { kind: "object", objectId: "a" }), ctx);
    expect(result.state.kind).toBe("idle");
    expect(updateGeometriesActions(result.dispatch)).toEqual([]);
  });

  it("ignores synthetic hand-mode handles, connector endpoints, ports, and double-clicks", () => {
    const document = makeDocument(
      [
        makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } }),
        makeObject({ id: "b", geometry: { x: 200, y: 0, width: 100, height: 100 } }),
      ],
      [
        makeConnection({
          id: "c1",
          from: { objectId: "a", anchor: "right" },
          to: { objectId: "b", anchor: "left" },
        }),
      ],
    );
    const ctx = makeContext(document, {
      tool: "hand",
      selection: { kind: "objects", objectIds: ["a"] },
    });
    const hits: CanvasPointerEvent["hit"][] = [
      { kind: "handle", objectId: "a", handle: "se" },
      { kind: "endpoint", connectionId: "c1", end: "from" },
      { kind: "port", objectId: "a", anchor: "right" },
      { kind: "connection", connectionId: "c1" },
      { kind: "canvas" },
    ];

    for (const hit of hits) {
      const result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 10, y: 10 }, hit), ctx);
      expect(result.state.kind).toBe("idle");
      expect(result.dispatch).toEqual([]);
      expect(result.overlay).toEqual({});
    }

    const doubleResult = stepInteraction(
      IDLE_INTERACTION_STATE,
      pointerEvent({
        type: "double",
        world: { x: 10, y: 10 },
        screen: { x: 10, y: 10 },
        hit: { kind: "object", objectId: "a" },
      }),
      ctx,
    );
    expect(doubleResult.state.kind).toBe("idle");
    expect(doubleResult.dispatch).toEqual([]);
    expect(doubleResult.overlay).toEqual({});
  });

  it("selects an object on a sub-threshold press+release (no drag)", () => {
    const document = makeDocument([makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } })]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "a" };

    const afterDown = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 50, y: 50 }, hit), ctx);
    // Immediate pre-selection dispatch on down.
    expect(afterDown.dispatch).toEqual([
      { type: "canvas.select", selection: { kind: "objects", objectIds: ["a"] } },
    ]);

    const afterUp = stepInteraction(afterDown.state, up({ x: 51, y: 51 }, hit), ctx);
    expect(afterUp.state.kind).toBe("idle");
    // No further move dispatches occurred since we stayed under threshold.
  });

  it("clears selection on a sub-threshold press+release on empty canvas", () => {
    const document = makeDocument([makeObject({ id: "a" })]);
    const ctx = makeContext(document, { selection: { kind: "objects", objectIds: ["a"] } });

    const afterDown = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 500, y: 500 }, { kind: "canvas" }), ctx);
    expect(afterDown.dispatch).toEqual([]);

    const afterUp = stepInteraction(afterDown.state, up({ x: 500, y: 500 }, { kind: "canvas" }), ctx);
    expect(afterUp.dispatch).toEqual([{ type: "canvas.select", selection: { kind: "none" } }]);
    expect(afterUp.state.kind).toBe("idle");
  });

  it("toggles (deferred) shift-click on an already-selected object at release", () => {
    const document = makeDocument([
      makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } }),
      makeObject({ id: "b", geometry: { x: 200, y: 0, width: 100, height: 100 } }),
    ]);
    const ctx = makeContext(document, { selection: { kind: "objects", objectIds: ["a", "b"] } });
    const hit = { kind: "object" as const, objectId: "a" };

    const afterDown = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 50, y: 50 }, hit, true), ctx);
    // Deferred: shift-clicking an already-selected object doesn't dispatch on down.
    expect(afterDown.dispatch).toEqual([]);

    const afterUp = stepInteraction(afterDown.state, up({ x: 51, y: 51 }, hit, true), ctx);
    expect(afterUp.dispatch).toEqual([
      { type: "canvas.select", selection: { kind: "objects", objectIds: ["b"] } },
    ]);
  });

  it("shift-clicking a not-yet-selected object selects it immediately at down and does not re-toggle on release", () => {
    const document = makeDocument([
      makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } }),
      makeObject({ id: "b", geometry: { x: 200, y: 0, width: 100, height: 100 } }),
    ]);
    const ctx = makeContext(document, { selection: { kind: "objects", objectIds: ["a"] } });
    const hit = { kind: "object" as const, objectId: "b" };

    const afterDown = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 250, y: 50 }, hit, true), ctx);
    // Down dispatches immediately for the not-yet-selected case (drag-together
    // semantics only apply to already-selected multi-selections).
    expect(afterDown.dispatch).toEqual([
      { type: "canvas.select", selection: { kind: "objects", objectIds: ["b"] } },
    ]);

    // A sub-threshold release must NOT dispatch a second (deferred) toggle —
    // that would double-toggle "b" back off. Context reflects the selection
    // as it would be after the down-dispatch already applied ("a", "b").
    const ctxAfterDown = makeContext(document, { selection: { kind: "objects", objectIds: ["a", "b"] } });
    const afterUp = stepInteraction(afterDown.state, up({ x: 251, y: 51 }, hit, true), ctxAfterDown);
    expect(afterUp.dispatch).toEqual([]);
    expect(afterUp.state.kind).toBe("idle");
  });
});

describe("interaction: drag-select selection", () => {
  it("enters a drag-select gesture (not immediate clear) on canvas-down with select tool", () => {
    const document = makeDocument([makeObject({ id: "a" })]);
    const ctx = makeContext(document);

    const afterDown = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 500, y: 500 }, { kind: "canvas" }), ctx);
    expect(afterDown.state.kind).toBe("pressing");
    expect(afterDown.dispatch).toEqual([]);

    const afterMove = stepInteraction(afterDown.state, move({ x: 520, y: 520 }, { kind: "canvas" }), ctx);
    expect(afterMove.state.kind).toBe("drag-select");
    expect(afterMove.overlay.dragSelect).toBeTruthy();
  });

  it("selects intersecting objects on release", () => {
    const document = makeDocument([
      makeObject({ id: "inside", geometry: { x: 10, y: 10, width: 20, height: 20 } }),
      makeObject({ id: "outside", geometry: { x: 500, y: 500, width: 20, height: 20 } }),
    ]);
    const ctx = makeContext(document);

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 0, y: 0 }, { kind: "canvas" }), ctx);
    result = stepInteraction(result.state, move({ x: 100, y: 100 }, { kind: "canvas" }), ctx);
    expect(result.state.kind).toBe("drag-select");

    result = stepInteraction(result.state, up({ x: 100, y: 100 }, { kind: "canvas" }), ctx);
    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toEqual([
      { type: "canvas.select", selection: { kind: "objects", objectIds: ["inside"] } },
    ]);
  });

  it("keeps below-slot external text out of drag-select membership", () => {
    const document = makeDocument([
      makeObject({
        id: "person",
        type: "icon",
        icon: "person",
        text: "Adapt Question Based on Interview History",
        geometry: { x: 100, y: 100, width: 120, height: 140 },
        style: { shape: "icon" },
      }),
    ]);
    const ctx = makeContext(document);

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 80, y: 246 }, { kind: "canvas" }), ctx);
    result = stepInteraction(result.state, move({ x: 240, y: 286 }, { kind: "canvas" }), ctx);
    result = stepInteraction(result.state, up({ x: 240, y: 286 }, { kind: "canvas" }), ctx);

    expect(result.dispatch).toEqual([{ type: "canvas.select", selection: { kind: "none" } }]);
  });

  it("is additive with shift held, unioning with the existing selection", () => {
    const document = makeDocument([
      makeObject({ id: "already-selected", geometry: { x: 900, y: 900, width: 20, height: 20 } }),
      makeObject({ id: "newly-drag-selected", geometry: { x: 10, y: 10, width: 20, height: 20 } }),
    ]);
    const ctx = makeContext(document, { selection: { kind: "objects", objectIds: ["already-selected"] } });

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 0, y: 0 }, { kind: "canvas" }, true), ctx);
    result = stepInteraction(result.state, move({ x: 100, y: 100 }, { kind: "canvas" }), ctx);
    result = stepInteraction(result.state, up({ x: 100, y: 100 }, { kind: "canvas" }, true), ctx);

    expect(result.dispatch).toHaveLength(1);
    const action = result.dispatch[0]!;
    expect(action.type).toBe("canvas.select");
    if (action.type === "canvas.select") {
      const selection = action.selection as Extract<CanvasSelection, { kind: "objects" }>;
      expect(new Set(selection.objectIds)).toEqual(new Set(["already-selected", "newly-drag-selected"]));
    }
  });

  it("clears selection when the drag-select doesn't intersect anything and isn't additive", () => {
    const document = makeDocument([makeObject({ id: "far-away", geometry: { x: 900, y: 900, width: 20, height: 20 } })]);
    const ctx = makeContext(document, { selection: { kind: "objects", objectIds: ["far-away"] } });

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 0, y: 0 }, { kind: "canvas" }), ctx);
    result = stepInteraction(result.state, move({ x: 50, y: 50 }, { kind: "canvas" }), ctx);
    result = stepInteraction(result.state, up({ x: 50, y: 50 }, { kind: "canvas" }), ctx);

    expect(result.dispatch).toEqual([{ type: "canvas.select", selection: { kind: "none" } }]);
  });

  it("preserves the existing selection (no clear dispatch) when an additive drag-select finds nothing", () => {
    const document = makeDocument([makeObject({ id: "far-away", geometry: { x: 900, y: 900, width: 20, height: 20 } })]);
    const ctx = makeContext(document, { selection: { kind: "objects", objectIds: ["far-away"] } });

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 0, y: 0 }, { kind: "canvas" }, true), ctx);
    result = stepInteraction(result.state, move({ x: 50, y: 50 }, { kind: "canvas" }), ctx);
    result = stepInteraction(result.state, up({ x: 50, y: 50 }, { kind: "canvas" }, true), ctx);

    expect(result.dispatch).toEqual([]);
  });
});
