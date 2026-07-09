import { describe, expect, it } from "bun:test";
import type { CanvasAction, CanvasSelection } from "../../state/actions";
import { cancelInteraction, stepInteraction } from "../../stage/editor/pipeline/core";
import {
  applyResizeHandle,
  hitTestObjects,
  IDLE_INTERACTION_STATE,
  MIN_DIRECT_RESIZE_SIZE,
  RESIZE_HANDLES,
  selectionBounds,
  type CanvasPointerEvent,
  type InteractionContext,
  type InteractionState,
  type ResizeHandle,
} from "../interaction";
import { SELECTION_DRAG_KINDS } from "../../stage/editor/pipeline/use-interaction-pipeline";
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../state/schema";
import { connectionBoundsForObject } from "../../objects/geometry";
import { routeConnection } from "../../connectors/routing";

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

function expectOrthogonalPolyline(points: ReadonlyArray<{ x: number; y: number }>) {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const dx = Math.abs(current.x - previous.x);
    const dy = Math.abs(current.y - previous.y);
    expect(dx <= 0.01 || dy <= 0.01).toBe(true);
  }
}

function reconcileSectionActions(actions: CanvasAction[]) {
  return actions.filter(
    (action): action is Extract<CanvasAction, { type: "canvas.reconcileSectionMembership" }> =>
      action.type === "canvas.reconcileSectionMembership",
  );
}

describe("interaction pipeline: selection drag activity", () => {
  it("flags only gestures that manipulate the current selection's geometry", () => {
    expect([...SELECTION_DRAG_KINDS].sort()).toEqual(
      [
        "connector-bend-drag",
        "connector-create",
        "connector-endpoint-drag",
        "move",
        "resize",
      ].sort(),
    );

    for (const kind of [
      "move",
      "resize",
      "connector-endpoint-drag",
      "connector-bend-drag",
      "connector-create",
    ]) {
      expect(SELECTION_DRAG_KINDS.has(kind)).toBe(true);
    }
    for (const kind of ["idle", "pressing", "marquee", "place"]) {
      expect(SELECTION_DRAG_KINDS.has(kind)).toBe(false);
    }
  });
});

describe("interaction: hitTestObjects", () => {
  it("hits the topmost object at a point when objects overlap", () => {
    const document = makeDocument([
      makeObject({ id: "back", geometry: { x: 0, y: 0, width: 200, height: 200 } }),
      makeObject({ id: "front", geometry: { x: 50, y: 50, width: 100, height: 100 } }),
    ]);
    const hit = hitTestObjects(document, { x: 75, y: 75 });
    expect(hit?.id).toBe("front");
  });

  it("returns null when the point misses everything", () => {
    const document = makeDocument([makeObject({ id: "a", geometry: { x: 0, y: 0, width: 10, height: 10 } })]);
    expect(hitTestObjects(document, { x: 500, y: 500 })).toBeNull();
  });

  it("hits a member object rendered above its section", () => {
    const document = makeDocument([
      makeObject({ id: "section", type: "section", text: "S", color: "gray", geometry: { x: 0, y: 0, width: 300, height: 300 } }),
      makeObject({ id: "child", parentId: "section", geometry: { x: 100, y: 100, width: 50, height: 50 } }),
    ]);
    // Point is inside both the section and the child; the child renders on
    // top (later in document order) so it wins.
    const hit = hitTestObjects(document, { x: 120, y: 120 });
    expect(hit?.id).toBe("child");
  });

  it("hits a shape above a section even when the section is later in the raw array", () => {
    const document = makeDocument([
      makeObject({ id: "shape", geometry: { x: 100, y: 100, width: 50, height: 50 } }),
      makeObject({ id: "section", type: "section", text: "S", color: "gray", geometry: { x: 0, y: 0, width: 300, height: 300 } }),
    ]);
    const hit = hitTestObjects(document, { x: 120, y: 120 });
    expect(hit?.id).toBe("shape");
  });

  it("hits the smaller top-painted section when equal-depth sections overlap", () => {
    const document = makeDocument([
      makeObject({ id: "small", type: "section", text: "Small", color: "blue", geometry: { x: 50, y: 50, width: 100, height: 100 } }),
      makeObject({ id: "large", type: "section", text: "Large", color: "gray", geometry: { x: 0, y: 0, width: 300, height: 300 } }),
    ]);
    const hit = hitTestObjects(document, { x: 75, y: 75 });
    expect(hit?.id).toBe("small");
  });

  it("hits the section itself when the point is inside it but outside its members", () => {
    const document = makeDocument([
      makeObject({ id: "section", type: "section", text: "S", color: "gray", geometry: { x: 0, y: 0, width: 300, height: 300 } }),
      makeObject({ id: "child", parentId: "section", geometry: { x: 100, y: 100, width: 50, height: 50 } }),
    ]);
    const hit = hitTestObjects(document, { x: 5, y: 5 });
    expect(hit?.id).toBe("section");
  });

  it("hits a rectangle anywhere in its interior — rectangles are solid shapes, not see-through containers", () => {
    const document = makeDocument([
      makeObject({ id: "rect", type: "rectangle", geometry: { x: 0, y: 0, width: 300, height: 300 } }),
    ]);
    const hit = hitTestObjects(document, { x: 150, y: 150 });
    expect(hit?.id).toBe("rect");
  });
});

describe("interaction: selectionBounds", () => {
  it("reuses boundsForGeometries to compute a union bounds", () => {
    const document = makeDocument([
      makeObject({ id: "a", geometry: { x: 0, y: 0, width: 10, height: 10 } }),
      makeObject({ id: "b", geometry: { x: 20, y: 20, width: 10, height: 10 } }),
    ]);
    const bounds = selectionBounds(document, ["a", "b"]);
    expect(bounds).toEqual({ x: 0, y: 0, width: 30, height: 30 });
  });

  it("returns null for an empty selection", () => {
    const document = makeDocument([makeObject({ id: "a" })]);
    expect(selectionBounds(document, [])).toBeNull();
  });
});

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

describe("interaction: drag/move gesture", () => {
  it("emits updateObjectGeometries with recordHistory true only on the first emission per gesture", () => {
    const document = makeDocument([makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } })]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "a" };

    let state: InteractionState = IDLE_INTERACTION_STATE;
    let result = stepInteraction(state, down({ x: 10, y: 10 }, hit), ctx);
    state = result.state;

    // Cross the 3px world drag threshold.
    result = stepInteraction(state, move({ x: 20, y: 20 }, hit), ctx);
    state = result.state;
    expect(state.kind).toBe("move");
    let geometryActions = updateGeometriesActions(result.dispatch);
    expect(geometryActions).toHaveLength(1);
    expect(geometryActions[0]!.recordHistory).toBe(true);
    expect(geometryActions[0]!.snap).toBe(false);
    expect(geometryActions[0]!.geometries.a).toEqual({ x: 10, y: 10, width: 100, height: 100 });

    // Second move in the same gesture: recordHistory must be false.
    result = stepInteraction(state, move({ x: 25, y: 30 }, hit), ctx);
    state = result.state;
    geometryActions = updateGeometriesActions(result.dispatch);
    expect(geometryActions).toHaveLength(1);
    expect(geometryActions[0]!.recordHistory).toBe(false);
    expect(geometryActions[0]!.geometries.a).toEqual({ x: 15, y: 20, width: 100, height: 100 });

    // Release ends the gesture without further geometry dispatch, then asks
    // the reducer to reconcile membership inside the same undo entry.
    result = stepInteraction(state, up({ x: 25, y: 30 }, hit), ctx);
    expect(result.state.kind).toBe("idle");
    expect(updateGeometriesActions(result.dispatch)).toHaveLength(0);
    expect(reconcileSectionActions(result.dispatch)).toEqual([
      { type: "canvas.reconcileSectionMembership", recordHistory: false },
    ]);
  });

  it("moves a dragged section and its recorded parentId descendants exactly once", () => {
    // Membership is the persisted parentId chain (sections nest via parentId);
    // no geometric recapture happens at drag start, so "outside" stays put even
    // though it isn't far from the section.
    const document = makeDocument([
      makeObject({
        id: "outer",
        type: "section",
        text: "Outer",
        color: "gray",
        geometry: { x: 80, y: 80, width: 320, height: 220 },
      }),
      makeObject({
        id: "inner",
        type: "section",
        text: "Inner",
        color: "gray",
        parentId: "outer",
        geometry: { x: 120, y: 120, width: 120, height: 80 },
      }),
      makeObject({
        id: "leaf",
        parentId: "inner",
        geometry: { x: 140, y: 140, width: 60, height: 30 },
      }),
      makeObject({ id: "outside", geometry: { x: 500, y: 500, width: 80, height: 40 } }),
    ]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "outer" };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 90, y: 90 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 130, y: 110 }, hit), ctx);

    expect(result.state.kind).toBe("move");
    const geometryActions = updateGeometriesActions(result.dispatch);
    expect(geometryActions).toHaveLength(1);
    expect(geometryActions[0]!.geometries).toEqual({
      outer: { x: 120, y: 100, width: 320, height: 220 },
      inner: { x: 160, y: 140, width: 120, height: 80 },
      leaf: { x: 180, y: 160, width: 60, height: 30 },
    });
    expect(geometryActions[0]!.geometries.outside).toBeUndefined();
  });

  it("does not drag descendants along with a plain rectangle (rectangles are dumb shapes)", () => {
    // Geometric overlap no longer captures anything — only sections have
    // dragCapture: "descendants", and rectangles are plain shapes.
    const document = makeDocument([
      makeObject({ id: "rect", type: "rectangle", geometry: { x: 80, y: 80, width: 320, height: 220 } }),
      makeObject({ id: "overlapping", geometry: { x: 120, y: 120, width: 80, height: 40 } }),
    ]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "rect" };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 90, y: 90 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 130, y: 110 }, hit), ctx);

    expect(result.state.kind).toBe("move");
    const geometryActions = updateGeometriesActions(result.dispatch);
    expect(geometryActions).toHaveLength(1);
    expect(Object.keys(geometryActions[0]!.geometries)).toEqual(["rect"]);
  });

  it("does not start a move gesture until the 3px world threshold is crossed", () => {
    const document = makeDocument([makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } })]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "a" };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 10, y: 10 }, hit), ctx);
    // 2px movement: below threshold, stays "pressing", no geometry dispatch.
    result = stepInteraction(result.state, move({ x: 11, y: 11 }, hit), ctx);
    expect(result.state.kind).toBe("pressing");
    expect(updateGeometriesActions(result.dispatch)).toHaveLength(0);
  });

  it("does not move a locked section", () => {
    const document = makeDocument([
      makeObject({
        id: "section-a",
        type: "section",
        text: "A",
        color: "gray",
        locked: "background",
        geometry: { x: 0, y: 0, width: 200, height: 120 },
      }),
    ]);
    const ctx = makeContext(document, { selection: { kind: "objects", objectIds: ["section-a"] } });
    const hit = { kind: "object" as const, objectId: "section-a" };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 10, y: 10 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 40, y: 40 }, hit), ctx);

    expect(result.state.kind).toBe("idle");
    expect(updateGeometriesActions(result.dispatch)).toHaveLength(0);
  });

  it("does not move a child of an all-locked section", () => {
    const document = makeDocument([
      makeObject({
        id: "section-a",
        type: "section",
        text: "A",
        color: "gray",
        locked: "all",
        geometry: { x: 0, y: 0, width: 240, height: 180 },
      }),
      makeObject({
        id: "child",
        parentId: "section-a",
        geometry: { x: 50, y: 50, width: 80, height: 60 },
      }),
    ]);
    const ctx = makeContext(document, { selection: { kind: "objects", objectIds: ["child"] } });
    const hit = { kind: "object" as const, objectId: "child" };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 60, y: 60 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 100, y: 90 }, hit), ctx);

    expect(result.state.kind).toBe("idle");
    expect(updateGeometriesActions(result.dispatch)).toHaveLength(0);
  });

  it("moves a child of a background-locked section", () => {
    const document = makeDocument([
      makeObject({
        id: "section-a",
        type: "section",
        text: "A",
        color: "gray",
        locked: "background",
        geometry: { x: 0, y: 0, width: 240, height: 180 },
      }),
      makeObject({
        id: "child",
        parentId: "section-a",
        geometry: { x: 50, y: 50, width: 80, height: 60 },
      }),
    ]);
    const ctx = makeContext(document, { selection: { kind: "objects", objectIds: ["child"] } });
    const hit = { kind: "object" as const, objectId: "child" };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 60, y: 60 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 100, y: 90 }, hit), ctx);

    expect(result.state.kind).toBe("move");
    const geometryActions = updateGeometriesActions(result.dispatch);
    expect(geometryActions).toHaveLength(1);
    expect(geometryActions[0]!.geometries.child).toEqual({ x: 90, y: 80, width: 80, height: 60 });
  });

  it("restores start geometries (recordHistory: false) when the gesture is cancelled via Escape", () => {
    const document = makeDocument([makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } })]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "a" };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 10, y: 10 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 40, y: 40 }, hit), ctx);
    expect(result.state.kind).toBe("move");

    const cancelResult = cancelInteraction(result.state);
    expect(cancelResult.state.kind).toBe("idle");
    const geometryActions = updateGeometriesActions(cancelResult.dispatch);
    expect(geometryActions).toHaveLength(1);
    expect(geometryActions[0]!.recordHistory).toBe(false);
    expect(geometryActions[0]!.geometries.a).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it("restores start geometries when a pointercancel event arrives mid-drag", () => {
    const document = makeDocument([makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } })]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "a" };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 10, y: 10 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 40, y: 40 }, hit), ctx);
    result = stepInteraction(result.state, pointerEvent({ type: "cancel", world: { x: 40, y: 40 }, hit }), ctx);
    expect(result.state.kind).toBe("idle");
    const geometryActions = updateGeometriesActions(result.dispatch);
    expect(geometryActions[0]!.recordHistory).toBe(false);
    expect(geometryActions[0]!.geometries.a).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });
});

describe("interaction: marquee selection", () => {
  it("enters a marquee gesture (not immediate clear) on canvas-down with select tool", () => {
    const document = makeDocument([makeObject({ id: "a" })]);
    const ctx = makeContext(document);

    const afterDown = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 500, y: 500 }, { kind: "canvas" }), ctx);
    expect(afterDown.state.kind).toBe("pressing");
    expect(afterDown.dispatch).toEqual([]);

    const afterMove = stepInteraction(afterDown.state, move({ x: 520, y: 520 }, { kind: "canvas" }), ctx);
    expect(afterMove.state.kind).toBe("marquee");
    expect(afterMove.overlay.marquee).toBeTruthy();
  });

  it("selects intersecting objects on release", () => {
    const document = makeDocument([
      makeObject({ id: "inside", geometry: { x: 10, y: 10, width: 20, height: 20 } }),
      makeObject({ id: "outside", geometry: { x: 500, y: 500, width: 20, height: 20 } }),
    ]);
    const ctx = makeContext(document);

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 0, y: 0 }, { kind: "canvas" }), ctx);
    result = stepInteraction(result.state, move({ x: 100, y: 100 }, { kind: "canvas" }), ctx);
    expect(result.state.kind).toBe("marquee");

    result = stepInteraction(result.state, up({ x: 100, y: 100 }, { kind: "canvas" }), ctx);
    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toEqual([
      { type: "canvas.select", selection: { kind: "objects", objectIds: ["inside"] } },
    ]);
  });

  it("keeps below-slot external text out of marquee membership", () => {
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
      makeObject({ id: "newly-marqueed", geometry: { x: 10, y: 10, width: 20, height: 20 } }),
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
      expect(new Set(selection.objectIds)).toEqual(new Set(["already-selected", "newly-marqueed"]));
    }
  });

  it("clears selection when the marquee doesn't intersect anything and isn't additive", () => {
    const document = makeDocument([makeObject({ id: "far-away", geometry: { x: 900, y: 900, width: 20, height: 20 } })]);
    const ctx = makeContext(document, { selection: { kind: "objects", objectIds: ["far-away"] } });

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 0, y: 0 }, { kind: "canvas" }), ctx);
    result = stepInteraction(result.state, move({ x: 50, y: 50 }, { kind: "canvas" }), ctx);
    result = stepInteraction(result.state, up({ x: 50, y: 50 }, { kind: "canvas" }), ctx);

    expect(result.dispatch).toEqual([{ type: "canvas.select", selection: { kind: "none" } }]);
  });

  it("preserves the existing selection (no clear dispatch) when an additive marquee finds nothing", () => {
    const document = makeDocument([makeObject({ id: "far-away", geometry: { x: 900, y: 900, width: 20, height: 20 } })]);
    const ctx = makeContext(document, { selection: { kind: "objects", objectIds: ["far-away"] } });

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 0, y: 0 }, { kind: "canvas" }, true), ctx);
    result = stepInteraction(result.state, move({ x: 50, y: 50 }, { kind: "canvas" }), ctx);
    result = stepInteraction(result.state, up({ x: 50, y: 50 }, { kind: "canvas" }, true), ctx);

    expect(result.dispatch).toEqual([]);
  });
});

describe("interaction: applyResizeHandle", () => {
  const start = { x: 100, y: 100, width: 200, height: 150 };

  it("se: grows width/height, anchors nw corner", () => {
    const result = applyResizeHandle(start, "se", 50, 30);
    expect(result).toEqual({ x: 100, y: 100, width: 250, height: 180 });
  });

  it("nw: moves x/y, anchors se corner", () => {
    const result = applyResizeHandle(start, "nw", -50, -30);
    expect(result).toEqual({ x: 50, y: 70, width: 250, height: 180 });
  });

  it("ne: moves y and grows width, anchors sw corner", () => {
    const result = applyResizeHandle(start, "ne", 50, -30);
    expect(result).toEqual({ x: 100, y: 70, width: 250, height: 180 });
  });

  it("sw: moves x and grows height, anchors ne corner", () => {
    const result = applyResizeHandle(start, "sw", -50, 30);
    expect(result).toEqual({ x: 50, y: 100, width: 250, height: 180 });
  });

  it("n: moves y and shrinks height from the top, anchors bottom edge", () => {
    const result = applyResizeHandle(start, "n", 0, 30);
    expect(result).toEqual({ x: 100, y: 130, width: 200, height: 120 });
  });

  it("s: grows height from the bottom, anchors top edge", () => {
    const result = applyResizeHandle(start, "s", 0, 30);
    expect(result).toEqual({ x: 100, y: 100, width: 200, height: 180 });
  });

  it("e: grows width from the right, anchors left edge", () => {
    const result = applyResizeHandle(start, "e", 40, 0);
    expect(result).toEqual({ x: 100, y: 100, width: 240, height: 150 });
  });

  it("w: moves x and grows width from the left, anchors right edge", () => {
    const result = applyResizeHandle(start, "w", -40, 0);
    expect(result).toEqual({ x: 60, y: 100, width: 240, height: 150 });
  });

  it("clamps to MIN_DIRECT_RESIZE_SIZE when dragging past the opposite edge", () => {
    const result = applyResizeHandle(start, "se", -1000, -1000);
    expect(result.width).toBe(MIN_DIRECT_RESIZE_SIZE);
    expect(result.height).toBe(MIN_DIRECT_RESIZE_SIZE);
    // Anchored corner (nw, i.e. x/y) must not move.
    expect(result.x).toBe(100);
    expect(result.y).toBe(100);
  });

  it("clamps nw resize so the anchored se corner does not move", () => {
    const result = applyResizeHandle(start, "nw", 1000, 1000);
    expect(result.width).toBe(MIN_DIRECT_RESIZE_SIZE);
    expect(result.height).toBe(MIN_DIRECT_RESIZE_SIZE);
    expect(result.x + result.width).toBe(start.x + start.width);
    expect(result.y + result.height).toBe(start.y + start.height);
  });

  it("covers all 8 documented resize handles", () => {
    expect(RESIZE_HANDLES).toHaveLength(8);
    for (const handle of RESIZE_HANDLES) {
      const result = applyResizeHandle(start, handle as ResizeHandle, 5, 5);
      expect(result.width).toBeGreaterThanOrEqual(MIN_DIRECT_RESIZE_SIZE);
      expect(result.height).toBeGreaterThanOrEqual(MIN_DIRECT_RESIZE_SIZE);
    }
  });
});

describe("interaction: resize gesture via stepInteraction", () => {
  it("emits updateObjectGeometries with recordHistory true once, then false, for a handle drag", () => {
    const document = makeDocument([makeObject({ id: "a", geometry: { x: 100, y: 100, width: 200, height: 150 } })]);
    const ctx = makeContext(document, { selection: { kind: "objects", objectIds: ["a"] } });
    const handleHit = { kind: "handle" as const, objectId: "a", handle: "se" as ResizeHandle };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 300, y: 250 }, handleHit), ctx);
    expect(result.state.kind).toBe("resize");

    result = stepInteraction(result.state, move({ x: 350, y: 280 }, handleHit), ctx);
    let geometryActions = updateGeometriesActions(result.dispatch);
    expect(geometryActions).toHaveLength(1);
    expect(geometryActions[0]!.recordHistory).toBe(true);
    expect(geometryActions[0]!.geometries.a).toEqual({ x: 100, y: 100, width: 250, height: 180 });

    result = stepInteraction(result.state, move({ x: 360, y: 290 }, handleHit), ctx);
    geometryActions = updateGeometriesActions(result.dispatch);
    expect(geometryActions[0]!.recordHistory).toBe(false);

    result = stepInteraction(result.state, up({ x: 360, y: 290 }, handleHit), ctx);
    expect(result.state.kind).toBe("idle");
    expect(reconcileSectionActions(result.dispatch)).toEqual([
      { type: "canvas.reconcileSectionMembership", recordHistory: false },
    ]);
  });

  it("restores the start geometry on Escape/cancel mid-resize", () => {
    const document = makeDocument([makeObject({ id: "a", geometry: { x: 100, y: 100, width: 200, height: 150 } })]);
    const ctx = makeContext(document, { selection: { kind: "objects", objectIds: ["a"] } });
    const handleHit = { kind: "handle" as const, objectId: "a", handle: "se" as ResizeHandle };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 300, y: 250 }, handleHit), ctx);
    result = stepInteraction(result.state, move({ x: 350, y: 280 }, handleHit), ctx);
    expect(result.state.kind).toBe("resize");

    const cancelResult = cancelInteraction(result.state);
    expect(cancelResult.state.kind).toBe("idle");
    const geometryActions = updateGeometriesActions(cancelResult.dispatch);
    expect(geometryActions[0]!.recordHistory).toBe(false);
    expect(geometryActions[0]!.geometries.a).toEqual({ x: 100, y: 100, width: 200, height: 150 });
  });

  it("does not resize a locked section", () => {
    const document = makeDocument([
      makeObject({
        id: "section-a",
        type: "section",
        text: "A",
        color: "gray",
        locked: "background",
        geometry: { x: 100, y: 100, width: 200, height: 150 },
      }),
    ]);
    const ctx = makeContext(document, { selection: { kind: "objects", objectIds: ["section-a"] } });
    const handleHit = { kind: "handle" as const, objectId: "section-a", handle: "se" as ResizeHandle };

    const result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 300, y: 250 }, handleHit), ctx);

    expect(result.state.kind).toBe("idle");
    expect(updateGeometriesActions(result.dispatch)).toHaveLength(0);
  });

  it("does not resize a child of an all-locked section", () => {
    const document = makeDocument([
      makeObject({
        id: "section-a",
        type: "section",
        text: "A",
        color: "gray",
        locked: "all",
        geometry: { x: 0, y: 0, width: 260, height: 220 },
      }),
      makeObject({
        id: "child",
        parentId: "section-a",
        geometry: { x: 50, y: 50, width: 100, height: 80 },
      }),
    ]);
    const ctx = makeContext(document, { selection: { kind: "objects", objectIds: ["child"] } });
    const handleHit = { kind: "handle" as const, objectId: "child", handle: "se" as ResizeHandle };

    const result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 150, y: 130 }, handleHit), ctx);

    expect(result.state.kind).toBe("idle");
    expect(updateGeometriesActions(result.dispatch)).toHaveLength(0);
  });
});

describe("interaction: live snap guides during move", () => {
  it("applies a snap correction when dragging near an aligned sibling and exposes a guide", () => {
    // "anchor" sits with its left edge at x=204. Dragging "a" (starts at x=0)
    // to the right should snap its left edge onto x=204 once within threshold.
    const document = makeDocument([
      makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } }),
      makeObject({ id: "anchor", geometry: { x: 204, y: 0, width: 100, height: 300 } }),
    ]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "a" };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 10, y: 10 }, hit), ctx);
    // Cross the drag threshold first (small move, no snap candidates in range yet).
    result = stepInteraction(result.state, move({ x: 20, y: 10 }, hit), ctx);
    expect(result.state.kind).toBe("move");

    // Move so "a"'s left edge (raw) lands at x=202 — within the 6px world
    // threshold (zoom is 1) of anchor's left edge at x=204.
    result = stepInteraction(result.state, move({ x: 212, y: 10 }, hit), ctx);
    const geometryActions = updateGeometriesActions(result.dispatch);
    expect(geometryActions).toHaveLength(1);
    // The correction snaps the raw x=202 to the guide position x=204.
    expect(geometryActions[0]!.geometries.a!.x).toBe(204);
    expect(result.overlay.guides).toBeTruthy();
    expect(result.overlay.guides!.some((guide) => guide.axis === "x" && guide.position === 204)).toBe(true);
  });

  it("does not snap when no candidate is within threshold", () => {
    const document = makeDocument([
      makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } }),
      makeObject({ id: "far", geometry: { x: 5000, y: 5000, width: 100, height: 100 } }),
    ]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "a" };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 10, y: 10 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 30, y: 30 }, hit), ctx);
    const geometryActions = updateGeometriesActions(result.dispatch);
    expect(geometryActions[0]!.geometries.a).toEqual({ x: 20, y: 20, width: 100, height: 100 });
    expect(result.overlay.guides ?? []).toHaveLength(0);
  });

  it("scales the snap threshold by viewport zoom (6 screen px / zoom)", () => {
    // At zoom=2, the 6 screen-px threshold is 3 world units, so an 8-unit-away
    // sibling should NOT snap even though it would at zoom=1. Vertical extents
    // are offset (anchor at y=900) so no axis aligns "for free".
    const document = makeDocument([
      makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } }),
      makeObject({ id: "anchor", geometry: { x: 108, y: 900, width: 100, height: 300 } }),
    ]);
    const ctx = makeContext(document, { viewport: { x: 0, y: 0, zoom: 2 } });
    const hit = { kind: "object" as const, objectId: "a" };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 10, y: 10 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 110, y: 10 }, hit), ctx); // raw x = 100, 8 away from 108
    const geometryActions = updateGeometriesActions(result.dispatch);
    expect(geometryActions[0]!.geometries.a!.x).toBe(100);
    expect(result.overlay.guides ?? []).toHaveLength(0);
  });

  it("clears guides once the gesture ends (release)", () => {
    const document = makeDocument([
      makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } }),
      makeObject({ id: "anchor", geometry: { x: 204, y: 0, width: 100, height: 300 } }),
    ]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "a" };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 10, y: 10 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 212, y: 10 }, hit), ctx);
    expect(result.overlay.guides!.length).toBeGreaterThan(0);

    result = stepInteraction(result.state, up({ x: 212, y: 10 }, hit), ctx);
    expect(result.state.kind).toBe("idle");
    expect(result.overlay.guides ?? []).toHaveLength(0);
    expect(result.overlay.dropTargetId ?? null).toBeNull();
  });
});

describe("interaction: section drop-in/out during move", () => {
  function makeSection(overrides: Partial<InteractiveCanvasObject> & { id: string }): InteractiveCanvasObject {
    return makeObject({ type: "section", text: overrides.id, color: "gray", ...overrides });
  }

  it("sets overlay.dropTargetId when the dragged object has enough projected overlap with a section", () => {
    const document = makeDocument([
      makeSection({ id: "section", geometry: { x: 300, y: 0, width: 300, height: 300 } }),
      makeObject({ id: "a", geometry: { x: 0, y: 0, width: 50, height: 50 } }),
    ]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "a" };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 10, y: 10 }, hit), ctx);
    // Drag "a" so its projected bounds are fully inside the section.
    result = stepInteraction(result.state, move({ x: 460, y: 150 }, hit), ctx);
    expect(result.state.kind).toBe("move");
    expect(result.overlay.dropTargetId).toBe("section");
  });

  it("requires 60 percent projected overlap even when the pointer and center are inside", () => {
    const document = makeDocument([
      makeSection({ id: "section", geometry: { x: 300, y: 0, width: 300, height: 300 } }),
      makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } }),
    ]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "a" };

    // Pointer and center are inside the section, but only 55% of the object
    // overlaps it, below the authoritative section-membership threshold.
    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 95, y: 50 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 350, y: 50 }, hit), ctx);
    expect(result.overlay.dropTargetId).toBeNull();

    result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 95, y: 50 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 360, y: 50 }, hit), ctx);
    expect(result.overlay.dropTargetId).toBe("section");
  });

  it("dispatches a no-history section reconcile on release", () => {
    const document = makeDocument([
      makeSection({ id: "section", geometry: { x: 300, y: 0, width: 300, height: 300 } }),
      makeObject({ id: "a", geometry: { x: 0, y: 0, width: 50, height: 50 } }),
    ]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "a" };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 10, y: 10 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 460, y: 150 }, hit), ctx);
    expect(result.overlay.dropTargetId).toBe("section");

    result = stepInteraction(result.state, up({ x: 460, y: 150 }, hit), ctx);
    expect(result.dispatch).toEqual([
      { type: "canvas.reconcileSectionMembership", recordHistory: false },
    ]);
  });

  it("still commits through section reconcile when the drop target matches the current parent", () => {
    const document = makeDocument([
      makeSection({ id: "section", geometry: { x: 0, y: 0, width: 300, height: 300 } }),
      makeObject({ id: "a", parentId: "section", geometry: { x: 20, y: 20, width: 50, height: 50 } }),
    ]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "a" };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 45, y: 45 }, hit), ctx);
    // Small move that stays inside the same section.
    result = stepInteraction(result.state, move({ x: 60, y: 60 }, hit), ctx);
    expect(result.overlay.dropTargetId).toBe("section");

    result = stepInteraction(result.state, up({ x: 60, y: 60 }, hit), ctx);
    expect(updateGeometriesActions(result.dispatch)).toHaveLength(0);
    expect(result.dispatch).toEqual([
      { type: "canvas.reconcileSectionMembership", recordHistory: false },
    ]);
  });

  it("commits through section reconcile when dropped on open canvas from inside a section", () => {
    const document = makeDocument([
      makeSection({ id: "section", geometry: { x: 0, y: 0, width: 200, height: 200 } }),
      makeObject({ id: "a", parentId: "section", geometry: { x: 20, y: 20, width: 50, height: 50 } }),
    ]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "a" };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 45, y: 45 }, hit), ctx);
    // Drag far outside the section onto open canvas.
    result = stepInteraction(result.state, move({ x: 1000, y: 1000 }, hit), ctx);
    expect(result.overlay.dropTargetId).toBeNull();

    result = stepInteraction(result.state, up({ x: 1000, y: 1000 }, hit), ctx);
    expect(result.dispatch).toEqual([
      { type: "canvas.reconcileSectionMembership", recordHistory: false },
    ]);
  });

  it("a rectangle is never a drop target — only sections are", () => {
    const document = makeDocument([
      makeObject({ id: "rect", type: "rectangle", geometry: { x: 300, y: 0, width: 300, height: 300 } }),
      makeObject({ id: "a", geometry: { x: 0, y: 0, width: 50, height: 50 } }),
    ]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "a" };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 10, y: 10 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 460, y: 150 }, hit), ctx);
    expect(result.state.kind).toBe("move");
    expect(result.overlay.dropTargetId).toBeNull();

    result = stepInteraction(result.state, up({ x: 460, y: 150 }, hit), ctx);
    expect(result.dispatch.some((action) => action.type === "canvas.setParent")).toBe(false);
    expect(reconcileSectionActions(result.dispatch)).toHaveLength(1);
  });

  it("previews the dragged section's geometric parent while carried descendants keep their own candidates excluded", () => {
    const document = makeDocument([
      makeSection({ id: "target", geometry: { x: 600, y: 0, width: 500, height: 500 } }),
      makeSection({ id: "dragged", geometry: { x: 0, y: 0, width: 200, height: 200 } }),
      makeSection({ id: "nested", parentId: "dragged", geometry: { x: 20, y: 20, width: 100, height: 100 } }),
      makeObject({ id: "leaf", parentId: "nested", geometry: { x: 40, y: 40, width: 40, height: 40 } }),
    ]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "dragged" };

    // Drag "dragged" (which carries "nested" and "leaf") so its bounds land
    // inside "target"; the commit is a doc-wide reducer reconcile.
    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 10, y: 10 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 700, y: 100 }, hit), ctx);
    expect(result.overlay.dropTargetId).toBe("target");

    result = stepInteraction(result.state, up({ x: 700, y: 100 }, hit), ctx);
    expect(result.dispatch).toEqual([
      { type: "canvas.reconcileSectionMembership", recordHistory: false },
    ]);
  });

  it("commits through section reconcile for a no-op section drag within its existing parent", () => {
    const document = makeDocument([
      makeSection({ id: "outer", geometry: { x: 0, y: 0, width: 500, height: 500 } }),
      makeSection({ id: "inner", parentId: "outer", geometry: { x: 20, y: 20, width: 200, height: 200 } }),
      makeObject({ id: "child", parentId: "inner", geometry: { x: 40, y: 40, width: 30, height: 30 } }),
    ]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "inner" };

    // The expanded drag set has mixed parents ("inner" -> outer, "child" ->
    // inner); the preview should still identify the enclosing parent.
    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 30, y: 30 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 60, y: 60 }, hit), ctx);
    expect(result.overlay.dropTargetId).toBe("outer");

    result = stepInteraction(result.state, up({ x: 60, y: 60 }, hit), ctx);
    expect(result.dispatch.some((action) => action.type === "canvas.setParent")).toBe(false);
    expect(reconcileSectionActions(result.dispatch)).toHaveLength(1);
  });

  it("excludes the dragged section and its descendants from drop-target hit-testing", () => {
    const document = makeDocument([
      makeSection({ id: "outer", geometry: { x: 0, y: 0, width: 500, height: 500 } }),
      makeSection({
        id: "inner",
        parentId: "outer",
        geometry: { x: 20, y: 20, width: 200, height: 200 },
      }),
      makeObject({ id: "child", parentId: "inner", geometry: { x: 40, y: 40, width: 30, height: 30 } }),
    ]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "inner" };

    // Drag "inner" (and its recorded descendant "child") around within
    // "outer" — dragging onto itself/descendants must never be selected as
    // the drop target; the enclosing "outer" is the only legal candidate.
    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 30, y: 30 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 300, y: 300 }, hit), ctx);
    expect(result.state.kind).toBe("move");
    expect(result.overlay.dropTargetId).toBe("outer");
  });
});

describe("interaction: section drop-target preview uses bounds-based membership", () => {
  function makeSection(overrides: Partial<InteractiveCanvasObject> & { id: string }): InteractiveCanvasObject {
    return makeObject({ type: "section", text: overrides.id, color: "gray", ...overrides });
  }

  it("returns the smallest qualifying section even when it precedes its ancestor in the array", () => {
    const document = makeDocument([
      makeSection({ id: "inner", parentId: "outer", geometry: { x: 50, y: 50, width: 100, height: 100 } }),
      makeSection({ id: "outer", geometry: { x: 0, y: 0, width: 400, height: 400 } }),
      makeObject({ id: "dragged", geometry: { x: 500, y: 500, width: 50, height: 50 } }),
    ]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "dragged" };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 510, y: 510 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 85, y: 85 }, hit), ctx);
    expect(result.overlay.dropTargetId).toBe("inner");
  });

  it("still respects excludeIds, falling back to the next-deepest containing section", () => {
    const document = makeDocument([
      makeSection({ id: "inner", parentId: "outer", geometry: { x: 50, y: 50, width: 100, height: 100 } }),
      makeSection({ id: "outer", geometry: { x: 0, y: 0, width: 400, height: 400 } }),
      makeObject({ id: "leaf", parentId: "inner", geometry: { x: 70, y: 70, width: 20, height: 20 } }),
    ]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "inner" };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 60, y: 60 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 100, y: 100 }, hit), ctx);
    expect(result.overlay.dropTargetId).toBe("outer");
  });
});

describe("interaction: connection click-selection (3.1.2)", () => {
  it("selects the connection immediately on pointer-down over its hit path", () => {
    const document = makeDocument(
      [makeObject({ id: "a" }), makeObject({ id: "b", geometry: { x: 300, y: 0, width: 100, height: 100 } })],
      [makeConnection({ id: "c1", from: { objectId: "a" }, to: { objectId: "b" } })],
    );
    const ctx = makeContext(document);
    const hit = { kind: "connection" as const, connectionId: "c1" };

    const result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 200, y: 50 }, hit), ctx);
    expect(result.dispatch).toEqual([
      { type: "canvas.select", selection: { kind: "connection", connectionId: "c1" } },
    ]);
    expect(result.state.kind).toBe("pressing");
  });

  it("resolves as a click (no extra dispatch) when released without crossing the drag threshold", () => {
    const document = makeDocument(
      [makeObject({ id: "a" }), makeObject({ id: "b", geometry: { x: 300, y: 0, width: 100, height: 100 } })],
      [makeConnection({ id: "c1", from: { objectId: "a" }, to: { objectId: "b" } })],
    );
    const ctx = makeContext(document);
    const hit = { kind: "connection" as const, connectionId: "c1" };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 200, y: 50 }, hit), ctx);
    result = stepInteraction(result.state, up({ x: 201, y: 50 }, hit), ctx);
    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toEqual([]);
  });
});

describe("interaction: connector-endpoint-drag (3.2.2)", () => {
  function endpointDoc() {
    return makeDocument(
      [
        makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } }),
        makeObject({ id: "b", geometry: { x: 300, y: 0, width: 100, height: 100 } }),
        makeObject({ id: "c", geometry: { x: 300, y: 300, width: 100, height: 100 } }),
      ],
      [makeConnection({ id: "c1", from: { objectId: "a" }, to: { objectId: "b" } })],
    );
  }

  it("commits immediately to connector-endpoint-drag on an endpoint hit (no pressing stage)", () => {
    const document = endpointDoc();
    const ctx = makeContext(document);
    const hit = { kind: "endpoint" as const, connectionId: "c1", end: "to" as const };

    const result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 300, y: 50 }, hit), ctx);
    expect(result.state.kind).toBe("connector-endpoint-drag");
    expect(result.overlay.connectorDrag).toBeTruthy();
    expect(result.overlay.connectorDrag?.connectionId).toBe("c1");
    expect(result.overlay.connectorDrag?.end).toBe("to");
  });

  it("computes the nearest-anchor candidate on move, excluding the other (unmoved) endpoint", () => {
    const document = endpointDoc();
    const ctx = makeContext(document);
    const hit = { kind: "endpoint" as const, connectionId: "c1", end: "to" as const };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 300, y: 50 }, hit), ctx);
    // Move over object "c" — should become the candidate, never "a" (the other/unmoved endpoint).
    result = stepInteraction(result.state, move({ x: 350, y: 350 }), ctx);
    expect(result.overlay.connectorDrag?.candidate?.objectId).toBe("c");
  });

  it("dispatches canvas.updateConnection with the candidate anchor on release", () => {
    const document = endpointDoc();
    const ctx = makeContext(document);
    const hit = { kind: "endpoint" as const, connectionId: "c1", end: "to" as const };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 300, y: 50 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 350, y: 350 }), ctx);
    result = stepInteraction(result.state, up({ x: 350, y: 350 }), ctx);
    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toEqual([
      {
        type: "canvas.updateConnection",
        connectionId: "c1",
        patch: { to: { objectId: "c", anchor: expect.any(String) } },
      },
    ]);
  });

  it("clears stored waypoints when releasing a waypointed endpoint onto a different object", () => {
    const baseDocument = endpointDoc();
    const document = {
      ...baseDocument,
      connections: [
        {
          ...baseDocument.connections[0]!,
          waypoints: [
            [200, 50],
            [200, 240],
          ],
        },
      ],
    };
    const ctx = makeContext(document);
    const hit = { kind: "endpoint" as const, connectionId: "c1", end: "to" as const };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 300, y: 50 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 350, y: 350 }), ctx);
    result = stepInteraction(result.state, up({ x: 350, y: 350 }), ctx);

    expect(result.dispatch).toEqual([
      {
        type: "canvas.updateConnection",
        connectionId: "c1",
        patch: { to: { objectId: "c", anchor: expect.any(String) }, waypoints: undefined },
      },
    ]);
  });

  it("reverts silently (no dispatch) when released over empty space", () => {
    const document = endpointDoc();
    const ctx = makeContext(document);
    const hit = { kind: "endpoint" as const, connectionId: "c1", end: "to" as const };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 300, y: 50 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 1000, y: 1000 }), ctx);
    result = stepInteraction(result.state, up({ x: 1000, y: 1000 }), ctx);
    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toEqual([]);
  });

  it("Escape cancels the drag back to idle with no dispatch", () => {
    const document = endpointDoc();
    const ctx = makeContext(document);
    const hit = { kind: "endpoint" as const, connectionId: "c1", end: "to" as const };

    const dragging = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 300, y: 50 }, hit), ctx);
    const cancelled = cancelInteraction(dragging.state);
    expect(cancelled.state.kind).toBe("idle");
    expect(cancelled.dispatch).toEqual([]);
  });
});

describe("interaction: connector-bend-drag", () => {
  function bendDoc() {
    return makeDocument(
      [
        makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } }),
        makeObject({ id: "b", geometry: { x: 300, y: 0, width: 100, height: 100 } }),
      ],
      [
        makeConnection({
          id: "c1",
          from: { objectId: "a", anchor: "right" },
          to: { objectId: "b", anchor: "left" },
          waypoints: [
            [150, 50],
            [150, 160],
            [300, 160],
          ],
        }),
      ],
    );
  }

  function straightBendDoc(waypoints?: Array<[number, number]>) {
    return makeDocument(
      [
        makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } }),
        makeObject({ id: "b", geometry: { x: 300, y: 0, width: 100, height: 100 } }),
      ],
      [
        makeConnection({
          id: "c1",
          from: { objectId: "a", anchor: "right" },
          to: { objectId: "b", anchor: "left" },
          ...(waypoints ? { waypoints } : {}),
        }),
      ],
    );
  }

  function slidStraightBendDoc() {
    return makeDocument(
      [
        makeObject({ id: "a", geometry: { x: 0, y: 230, width: 100, height: 60 } }),
        makeObject({ id: "b", geometry: { x: 240, y: 234, width: 100, height: 60 } }),
      ],
      [
        makeConnection({
          id: "c1",
          from: { objectId: "a" },
          to: { objectId: "b" },
        }),
      ],
    );
  }

  function offAxisElbowBendDoc() {
    return makeDocument(
      [
        makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } }),
        makeObject({ id: "b", geometry: { x: 300, y: 20, width: 100, height: 100 } }),
      ],
      [
        makeConnection({
          id: "c1",
          from: { objectId: "a", anchor: "right" },
          to: { objectId: "b", anchor: "left" },
        }),
      ],
    );
  }

  it("commits immediately to connector-bend-drag on a segment pill hit", () => {
    const document = bendDoc();
    const ctx = makeContext(document);
    const hit = { kind: "bend-segment" as const, connectionId: "c1", segmentIndex: 1 };

    const result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 150, y: 100 }, hit), ctx);
    expect(result.state.kind).toBe("connector-bend-drag");
    expect(result.overlay.connectorDrag?.connectionId).toBe("c1");
    expect(result.overlay.connectorDrag?.bendSegmentIndex).toBe(1);
  });

  it("previews perpendicular segment movement and commits waypoints on release", () => {
    const document = bendDoc();
    const ctx = makeContext(document);
    const hit = { kind: "bend-segment" as const, connectionId: "c1", segmentIndex: 1 };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 150, y: 100 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 180, y: 240 }), ctx);
    expect(result.dispatch).toEqual([]);
    expect(result.overlay.connectorDrag?.points).toEqual([
      { x: 100, y: 50 },
      { x: 180, y: 50 },
      { x: 180, y: 160 },
      { x: 300, y: 160 },
      { x: 300, y: 50 },
    ]);

    result = stepInteraction(result.state, up({ x: 180, y: 240 }), ctx);
    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toEqual([
      {
        type: "canvas.updateConnection",
        connectionId: "c1",
        patch: {
          waypoints: [
            [180, 50],
            [180, 160],
            [300, 160],
          ],
        },
      },
    ]);
  });

  it("drags a straight connector's only bend segment into persisted waypoints", () => {
    const document = straightBendDoc();
    const ctx = makeContext(document);
    const hit = { kind: "bend-segment" as const, connectionId: "c1", segmentIndex: 0 };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 200, y: 50 }, hit), ctx);
    expect(result.state.kind).toBe("connector-bend-drag");

    result = stepInteraction(result.state, move({ x: 200, y: 90 }), ctx);
    expect(result.dispatch).toEqual([]);
    expect(result.overlay.connectorDrag?.points).toEqual([
      { x: 100, y: 50 },
      { x: 100, y: 90 },
      { x: 300, y: 90 },
      { x: 300, y: 50 },
    ]);

    result = stepInteraction(result.state, up({ x: 200, y: 90 }), ctx);
    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toEqual([
      {
        type: "canvas.updateConnection",
        connectionId: "c1",
        patch: {
          waypoints: [
            [100, 90],
            [300, 90],
          ],
        },
      },
    ]);
  });

  it("persists endpoint contacts when bending a slid straight connector", () => {
    const document = slidStraightBendDoc();
    const ctx = makeContext(document);
    const hit = { kind: "bend-segment" as const, connectionId: "c1", segmentIndex: 0 };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 170, y: 262 }, hit), ctx);
    expect(result.state.kind).toBe("connector-bend-drag");

    result = stepInteraction(result.state, move({ x: 170, y: 302 }), ctx);
    const draggedPoints = [
      { x: 100, y: 262 },
      { x: 100, y: 302 },
      { x: 240, y: 302 },
      { x: 240, y: 262 },
    ];
    expect(result.dispatch).toEqual([]);
    expect(result.overlay.connectorDrag?.points).toEqual(draggedPoints);

    result = stepInteraction(result.state, up({ x: 170, y: 302 }), ctx);
    expect(result.state.kind).toBe("idle");
    const action = result.dispatch[0];
    expect(action?.type).toBe("canvas.updateConnection");
    if (action?.type !== "canvas.updateConnection") throw new Error("expected updateConnection");

    expect(action.patch.waypoints).toEqual([
      [100, 302],
      [240, 302],
    ]);
    expect(action.patch.from?.position?.[0]).toBeCloseTo(1, 6);
    expect(action.patch.from?.position?.[1]).toBeCloseTo(32 / 60, 6);
    expect(action.patch.to?.position?.[0]).toBeCloseTo(0, 6);
    expect(action.patch.to?.position?.[1]).toBeCloseTo(28 / 60, 6);

    const connection = document.connections[0]!;
    const committedConnection: InteractiveCanvasConnection = {
      ...connection,
      ...action.patch,
      from: action.patch.from ?? connection.from,
      to: action.patch.to ?? connection.to,
    };
    const routed = routeConnection(
      document.objects[0]!,
      document.objects[1]!,
      committedConnection,
      document.objects,
    );
    expect(routed.points).toEqual(draggedPoints);
  });

  it("honors a committed bend on an auto elbow with collinear neighbor segments", () => {
    const document = offAxisElbowBendDoc();
    const ctx = makeContext(document);
    const connection = document.connections[0]!;
    const fromObject = document.objects[0]!;
    const toObject = document.objects[1]!;
    const initial = routeConnection(fromObject, toObject, connection, document.objects);
    const initialPoints = [
      { x: 100, y: 50 },
      { x: 124, y: 50 },
      { x: 200, y: 50 },
      { x: 200, y: 70 },
      { x: 276, y: 70 },
      { x: 300, y: 70 },
    ];
    expect(initial.points).toEqual(initialPoints);

    const hit = { kind: "bend-segment" as const, connectionId: "c1", segmentIndex: 1 };
    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 162, y: 50 }, hit), ctx);
    expect(result.state.kind).toBe("connector-bend-drag");

    result = stepInteraction(result.state, move({ x: 162, y: 121 }), ctx);
    const draggedPoints = [
      { x: 100, y: 50 },
      { x: 124, y: 50 },
      { x: 124, y: 121 },
      { x: 200, y: 121 },
      { x: 200, y: 70 },
      { x: 276, y: 70 },
      { x: 300, y: 70 },
    ];
    expect(result.dispatch).toEqual([]);
    expect(result.overlay.connectorDrag?.points).toEqual(draggedPoints);
    expectOrthogonalPolyline(draggedPoints);

    result = stepInteraction(result.state, up({ x: 162, y: 121 }), ctx);
    expect(result.state.kind).toBe("idle");
    const action = result.dispatch[0];
    expect(action?.type).toBe("canvas.updateConnection");
    if (action?.type !== "canvas.updateConnection") throw new Error("expected updateConnection");

    expect(action.patch.waypoints).toEqual([
      [124, 50],
      [124, 121],
      [200, 121],
      [200, 70],
    ]);

    const committedConnection: InteractiveCanvasConnection = {
      ...connection,
      ...action.patch,
      from: action.patch.from ?? connection.from,
      to: action.patch.to ?? connection.to,
    };
    const routed = routeConnection(fromObject, toObject, committedConnection, document.objects);
    expect(routed.points).toEqual([
      { x: 100, y: 50 },
      { x: 124, y: 50 },
      { x: 124, y: 121 },
      { x: 200, y: 121 },
      { x: 200, y: 70 },
      { x: 300, y: 70 },
    ]);
    expect(routed.points).not.toEqual(initialPoints);
    expectOrthogonalPolyline(routed.points ?? []);
  });

  it("snaps a bent straight connector back within tolerance and clears waypoints", () => {
    const document = straightBendDoc([
      [100, 90],
      [300, 90],
    ]);
    const ctx = makeContext(document);
    const hit = { kind: "bend-segment" as const, connectionId: "c1", segmentIndex: 1 };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 200, y: 90 }, hit), ctx);
    expect(result.state.kind).toBe("connector-bend-drag");

    result = stepInteraction(result.state, move({ x: 200, y: 56 }), ctx);
    expect(result.overlay.connectorDrag?.points).toEqual([
      { x: 100, y: 50 },
      { x: 300, y: 50 },
    ]);

    result = stepInteraction(result.state, up({ x: 200, y: 56 }), ctx);
    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toEqual([
      {
        type: "canvas.updateConnection",
        connectionId: "c1",
        patch: { waypoints: undefined },
      },
    ]);
  });

  it("Escape cancels the bend drag back to idle with no dispatch", () => {
    const document = bendDoc();
    const ctx = makeContext(document);
    const hit = { kind: "bend-segment" as const, connectionId: "c1", segmentIndex: 1 };

    const dragging = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 150, y: 100 }, hit), ctx);
    const cancelled = cancelInteraction(dragging.state);
    expect(cancelled.state.kind).toBe("idle");
    expect(cancelled.dispatch).toEqual([]);
  });
});

describe("interaction: connector-create from edge ports (3.3.2)", () => {
  function portDoc() {
    return makeDocument([
      makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } }),
      makeObject({ id: "b", geometry: { x: 300, y: 0, width: 100, height: 100 } }),
    ]);
  }

  it("commits immediately to connector-create on a port hit", () => {
    const document = portDoc();
    const ctx = makeContext(document);
    const hit = { kind: "port" as const, objectId: "a", anchor: "right" as const };

    const result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 100, y: 50 }, hit), ctx);
    expect(result.state.kind).toBe("connector-create");
    expect(result.overlay.connectorDrag?.fromObjectId).toBe("a");
    expect(result.overlay.connectorDrag?.fromAnchor).toBe("right");
  });

  it("dispatches canvas.addConnection with anchors when released on another object", () => {
    const document = portDoc();
    const ctx = makeContext(document);
    const hit = { kind: "port" as const, objectId: "a", anchor: "right" as const };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 100, y: 50 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 320, y: 50 }), ctx);
    result = stepInteraction(result.state, up({ x: 320, y: 50 }), ctx);
    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toEqual([
      {
        type: "canvas.addConnection",
        fromObjectId: "a",
        toObjectId: "b",
        fromAnchor: "right",
        toAnchor: expect.any(String),
      },
    ]);
  });

  it("dispatches canvas.quickConnect when released on empty canvas", () => {
    const document = portDoc();
    const ctx = makeContext(document);
    const hit = { kind: "port" as const, objectId: "a", anchor: "right" as const };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 100, y: 50 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 1000, y: 1000 }), ctx);
    result = stepInteraction(result.state, up({ x: 1000, y: 1000 }), ctx);
    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toEqual([
      {
        type: "canvas.quickConnect",
        fromObjectId: "a",
        fromAnchor: "right",
        drop: { point: { x: 1000, y: 1000 } },
      },
    ]);
  });

  it("clicking a port quick-connects half a source-width gap away in the port direction", () => {
    const document = portDoc();
    const ctx = makeContext(document);
    const hit = { kind: "port" as const, objectId: "a", anchor: "right" as const };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 100, y: 50 }, hit), ctx);
    result = stepInteraction(result.state, up({ x: 101, y: 51 }), ctx);
    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toEqual([
      {
        type: "canvas.quickConnect",
        fromObjectId: "a",
        fromAnchor: "right",
        // gap = max(width, 120) / 2 = 60 → x = 0 + 100 + 60 + 50.
        drop: { point: { x: 210, y: 50 } },
      },
    ]);
    expect(result.overlay).toEqual({ editObjectTextId: "a-2", editObjectTextSeed: "" });
  });

  it("clicking a below-label bottom port measures the spawn point from visual bounds", () => {
    const icon = makeObject({
      id: "icon-a",
      type: "icon",
      icon: "person",
      text: "Interviewee Response",
      geometry: { x: 10, y: 20, width: 87, height: 87 },
    });
    const document = makeDocument([icon]);
    const ctx = makeContext(document);
    const hit = { kind: "port" as const, objectId: "icon-a", anchor: "bottom" as const };
    const visualBounds = connectionBoundsForObject(icon);
    const expectedGap = Math.max(visualBounds.width, 120) / 2;

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 53.5, y: 127 }, hit), ctx);
    result = stepInteraction(result.state, up({ x: 54, y: 128 }), ctx);

    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toEqual([
      {
        type: "canvas.quickConnect",
        fromObjectId: "icon-a",
        fromAnchor: "bottom",
        drop: {
          point: {
            x: visualBounds.x + visualBounds.width / 2,
            y: visualBounds.y + visualBounds.height + expectedGap + visualBounds.height / 2,
          },
        },
      },
    ]);
  });

  it("Escape cancels the create-drag back to idle with no dispatch", () => {
    const document = portDoc();
    const ctx = makeContext(document);
    const hit = { kind: "port" as const, objectId: "a", anchor: "right" as const };

    const dragging = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 100, y: 50 }, hit), ctx);
    const cancelled = cancelInteraction(dragging.state);
    expect(cancelled.state.kind).toBe("idle");
    expect(cancelled.dispatch).toEqual([]);
  });
});

describe("interaction: armed-tool object creation (4.2.2)", () => {
  it("a sub-threshold click with an armed tool creates a default-size object centered at the point and reverts to select", () => {
    const document = makeDocument([]);
    const ctx = makeContext(document, { tool: "process" });

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 500, y: 500 }, { kind: "canvas" }), ctx);
    expect(result.state.kind).toBe("place");
    expect(result.overlay.placePreview).toEqual({ x: 500 - 184 / 2, y: 500 - 96 / 2, width: 184, height: 96 });

    result = stepInteraction(result.state, up({ x: 500, y: 500 }), ctx);
    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toEqual([
      {
        type: "canvas.addObject",
        objectType: "process",
        geometry: { x: 500 - 184 / 2, y: 500 - 96 / 2, width: 184, height: 96 },
      },
      { type: "canvas.setTool", tool: "select" },
    ]);
  });

  it("a drag with an armed tool creates an object sized to the normalized dragged rect", () => {
    const document = makeDocument([]);
    const ctx = makeContext(document, { tool: "rectangle" });

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 100, y: 100 }, { kind: "canvas" }), ctx);
    result = stepInteraction(result.state, move({ x: 300, y: 220 }), ctx);
    expect(result.state.kind).toBe("place");
    expect(result.overlay.placePreview).toEqual({ x: 100, y: 100, width: 200, height: 120 });

    result = stepInteraction(result.state, up({ x: 300, y: 220 }), ctx);
    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toEqual([
      {
        type: "canvas.addObject",
        objectType: "rectangle",
        geometry: { x: 100, y: 100, width: 200, height: 120 },
      },
      { type: "canvas.setTool", tool: "select" },
    ]);
  });

  it("clamps a tiny drag to the minimum place size instead of creating a sliver", () => {
    const document = makeDocument([]);
    const ctx = makeContext(document, { tool: "sticky" });

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 50, y: 50 }, { kind: "canvas" }), ctx);
    result = stepInteraction(result.state, move({ x: 55, y: 58 }), ctx);
    result = stepInteraction(result.state, up({ x: 55, y: 58 }), ctx);
    const addAction = result.dispatch.find((action) => action.type === "canvas.addObject");
    expect(addAction?.type).toBe("canvas.addObject");
    if (addAction?.type === "canvas.addObject") {
      expect(addAction.geometry?.width).toBeGreaterThanOrEqual(24);
      expect(addAction.geometry?.height).toBeGreaterThanOrEqual(24);
    }
  });

  it("lets the reducer assign parentId from the placed object's final geometry", () => {
    const document = makeDocument([
      makeObject({ id: "group", type: "section", text: "Group", color: "gray", geometry: { x: 0, y: 0, width: 400, height: 400 } }),
    ]);
    const ctx = makeContext(document, { tool: "sticky" });

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 200, y: 200 }, { kind: "canvas" }), ctx);
    result = stepInteraction(result.state, up({ x: 200, y: 200 }), ctx);
    expect(result.dispatch).toEqual([
      {
        type: "canvas.addObject",
        objectType: "sticky",
        geometry: expect.any(Object),
      },
      { type: "canvas.setTool", tool: "select" },
    ]);
  });

  it("an armed click that lands on an existing object still places a new object rather than selecting it", () => {
    const document = makeDocument([makeObject({ id: "existing", geometry: { x: 0, y: 0, width: 100, height: 100 } })]);
    const ctx = makeContext(document, { tool: "decision" });
    const hit = { kind: "object" as const, objectId: "existing" };

    const result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 50, y: 50 }, hit), ctx);
    expect(result.state.kind).toBe("place");
    expect(result.dispatch).toEqual([]);
  });

  it("Escape cancels an in-progress place gesture back to idle with no dispatch", () => {
    const document = makeDocument([]);
    const ctx = makeContext(document, { tool: "process" });

    const placing = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 10, y: 10 }, { kind: "canvas" }), ctx);
    const cancelled = cancelInteraction(placing.state);
    expect(cancelled.state.kind).toBe("idle");
    expect(cancelled.dispatch).toEqual([]);
  });

  it("stickyPlacement (Shapes panel repeat mode) keeps the tool armed after placing instead of reverting to select", () => {
    const document = makeDocument([]);
    const ctx = makeContext(document, { tool: "process", stickyPlacement: true });

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 500, y: 500 }, { kind: "canvas" }), ctx);
    result = stepInteraction(result.state, up({ x: 500, y: 500 }), ctx);
    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toEqual([
      {
        type: "canvas.addObject",
        objectType: "process",
        geometry: { x: 500 - 184 / 2, y: 500 - 96 / 2, width: 184, height: 96 },
      },
      // No canvas.setTool — the armed tool survives so the next click places another.
    ]);

    // The very next pointer-down starts a fresh place gesture with the same tool.
    const again = stepInteraction(result.state, down({ x: 700, y: 300 }, { kind: "canvas" }), ctx);
    expect(again.state.kind).toBe("place");
  });

  it("W5 shape tools (ellipse/triangle/star/…) start a place gesture — the panel's full vocabulary is placeable", () => {
    const document = makeDocument([]);
    for (const tool of ["ellipse", "triangle", "pentagon", "star", "chevron", "icon"] as const) {
      const ctx = makeContext(document, { tool });
      const result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 100, y: 100 }, { kind: "canvas" }), ctx);
      expect(result.state.kind).toBe("place");
    }
  });

  it("ctx.armedShape (catalog-entry variant) rides through the ghost draft and into canvas.addObject", () => {
    const document = makeDocument([]);
    const ctx = makeContext(document, {
      tool: "icon",
      armedShape: { icon: "database", text: "Database" },
    });

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 300, y: 300 }, { kind: "canvas" }), ctx);
    // The ghost overlay carries the FULL draft object (type + glyph + text),
    // so the stage can render the real shape instead of a dashed box.
    expect(result.overlay.placePreviewObject).toMatchObject({
      type: "icon",
      icon: "database",
      text: "Database",
    });

    result = stepInteraction(result.state, up({ x: 300, y: 300 }), ctx);
    const addAction = result.dispatch.find((action) => action.type === "canvas.addObject");
    expect(addAction).toMatchObject({ objectType: "icon", icon: "database", text: "Database" });
  });

  it("a direction variant (triangle down) rides through the same path", () => {
    const document = makeDocument([]);
    const ctx = makeContext(document, { tool: "triangle", armedShape: { direction: "down" } });

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 300, y: 300 }, { kind: "canvas" }), ctx);
    expect(result.overlay.placePreviewObject).toMatchObject({ type: "triangle", direction: "down" });

    result = stepInteraction(result.state, up({ x: 300, y: 300 }), ctx);
    const addAction = result.dispatch.find((action) => action.type === "canvas.addObject");
    expect(addAction).toMatchObject({ objectType: "triangle", direction: "down" });
  });

  it("without an armed variant the addObject action stays byte-identical to the legacy shape (no stray keys)", () => {
    const document = makeDocument([]);
    const ctx = makeContext(document, { tool: "process" });

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 500, y: 500 }, { kind: "canvas" }), ctx);
    result = stepInteraction(result.state, up({ x: 500, y: 500 }), ctx);
    expect(result.dispatch[0]).toEqual({
      type: "canvas.addObject",
      objectType: "process",
      geometry: { x: 500 - 184 / 2, y: 500 - 96 / 2, width: 184, height: 96 },
    });
  });
});
