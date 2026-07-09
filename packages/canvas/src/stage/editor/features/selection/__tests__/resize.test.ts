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

/** Selection slice resize-handle math and gesture coverage. */
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
