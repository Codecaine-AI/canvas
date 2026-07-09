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

/** Move slice drag, section-carry, and drop-target coverage. */
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
