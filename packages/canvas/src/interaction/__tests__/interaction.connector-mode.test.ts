import { describe, expect, it } from "bun:test";
import type { CanvasAction, CanvasSelection } from "../../state/actions";
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../state/schema";
import {
  cancelInteraction,
  IDLE_INTERACTION_STATE,
  stepInteraction,
  type CanvasPointerEvent,
  type InteractionContext,
  type InteractionResult,
} from "../interaction";

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
    id: "connector-mode-test-doc",
    mode: "diagram",
    objects,
    connections,
  };
}

function makeContext(
  document: InteractiveCanvasDocument,
  overrides: Partial<InteractionContext> = {},
): InteractionContext {
  return {
    document,
    selection: { kind: "none" },
    tool: "connector",
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

function double(world: { x: number; y: number }, hit: CanvasPointerEvent["hit"]): CanvasPointerEvent {
  return pointerEvent({ type: "double", world, screen: world, hit });
}

function cancel(world: { x: number; y: number } = { x: 0, y: 0 }): CanvasPointerEvent {
  return pointerEvent({ type: "cancel", world, screen: world });
}

function connectorDoc(): InteractiveCanvasDocument {
  return makeDocument(
    [
      makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } }),
      makeObject({ id: "b", geometry: { x: 300, y: 0, width: 100, height: 100 } }),
    ],
    [
      {
        id: "c1",
        from: { objectId: "a", anchor: "right" },
        to: { objectId: "b", anchor: "left" },
      },
    ],
  );
}

function objectHit(objectId = "a"): CanvasPointerEvent["hit"] {
  return { kind: "object", objectId };
}

function portHit(objectId = "a", anchor: "top" | "right" | "bottom" | "left" = "right"): CanvasPointerEvent["hit"] {
  return { kind: "port", objectId, anchor };
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function expectNoSetTool(actions: CanvasAction[]) {
  expect(actions.some((action) => action.type === "canvas.setTool")).toBe(false);
}

function expectNoSelectionOrMove(actions: CanvasAction[]) {
  expect(actions.some((action) => action.type === "canvas.select")).toBe(false);
  expect(actions.some((action) => action.type === "canvas.updateObjectGeometries")).toBe(false);
}

describe("interaction: connector mode", () => {
  it("body press + drag + release on another object dispatches addConnection without fromAnchor", () => {
    const document = connectorDoc();
    const ctx = makeContext(document);

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 50, y: 50 }, objectHit()), ctx);
    result = stepInteraction(result.state, move({ x: 320, y: 50 }), ctx);
    result = stepInteraction(result.state, up({ x: 320, y: 50 }), ctx);

    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toHaveLength(1);
    const action = result.dispatch[0];
    expect(action).toMatchObject({
      type: "canvas.addConnection",
      fromObjectId: "a",
      toObjectId: "b",
      toAnchor: expect.any(String),
    });
    expect(hasOwn(action, "fromAnchor")).toBe(false);
  });

  it("body press + sub-threshold release is a no-op and returns idle", () => {
    const document = connectorDoc();
    const ctx = makeContext(document);

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 50, y: 50 }, objectHit()), ctx);
    result = stepInteraction(result.state, up({ x: 51, y: 51 }), ctx);

    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toEqual([]);
  });

  it("port press + drag + release on another object keeps the pinned fromAnchor", () => {
    const document = connectorDoc();
    const ctx = makeContext(document);

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 100, y: 50 }, portHit()), ctx);
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

  it("port press + sub-threshold release still quick-connects from the pinned anchor", () => {
    const document = connectorDoc();
    const ctx = makeContext(document);

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 100, y: 50 }, portHit()), ctx);
    result = stepInteraction(result.state, up({ x: 101, y: 51 }), ctx);

    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toEqual([
      {
        type: "canvas.quickConnect",
        fromObjectId: "a",
        fromAnchor: "right",
        drop: { point: { x: 210, y: 50 } },
      },
    ]);
  });

  it("body press + drag + release on empty canvas quick-connects without fromAnchor", () => {
    const document = connectorDoc();
    const ctx = makeContext(document);

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 50, y: 50 }, objectHit()), ctx);
    result = stepInteraction(result.state, move({ x: 1000, y: 1000 }), ctx);
    result = stepInteraction(result.state, up({ x: 1000, y: 1000 }), ctx);

    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toHaveLength(1);
    const action = result.dispatch[0];
    expect(action).toMatchObject({
      type: "canvas.quickConnect",
      fromObjectId: "a",
      drop: { point: { x: 1000, y: 1000 } },
    });
    expect(hasOwn(action, "fromAnchor")).toBe(false);
  });

  it("keeps non-connector-create hits inert in connector mode", () => {
    const document = connectorDoc();
    const ctx = makeContext(document, {
      selection: { kind: "objects", objectIds: ["a"] } satisfies CanvasSelection,
    });

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 50, y: 50 }, objectHit()), ctx);
    expect(result.state.kind).toBe("connector-create");
    expectNoSelectionOrMove(result.dispatch);
    result = stepInteraction(result.state, move({ x: 80, y: 80 }), ctx);
    expect(result.state.kind).toBe("connector-create");
    expectNoSelectionOrMove(result.dispatch);

    result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 500, y: 500 }, { kind: "canvas" }), ctx);
    expect(result.state.kind).toBe("idle");
    result = stepInteraction(result.state, move({ x: 560, y: 560 }), ctx);
    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toEqual([]);

    for (const hit of [
      { kind: "handle" as const, objectId: "a", handle: "se" as const },
      { kind: "endpoint" as const, connectionId: "c1", end: "to" as const },
      { kind: "bend-segment" as const, connectionId: "c1", segmentIndex: 1 },
      { kind: "connection" as const, connectionId: "c1" },
    ]) {
      const inert = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 50, y: 50 }, hit), ctx);
      expect(inert.state.kind).toBe("idle");
      expect(inert.dispatch).toEqual([]);
    }
  });

  it("double-click in connector mode does not request text editing", () => {
    const document = connectorDoc();
    const ctx = makeContext(document);

    const result = stepInteraction(IDLE_INTERACTION_STATE, double({ x: 50, y: 50 }, objectHit()), ctx);

    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toEqual([]);
    expect(result.overlay.editObjectTextId).toBeUndefined();
  });

  it("connector-create release and cancel paths never dispatch canvas.setTool", () => {
    const document = connectorDoc();
    const ctx = makeContext(document);
    const completions: InteractionResult[] = [];

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 100, y: 50 }, portHit()), ctx);
    completions.push(stepInteraction(result.state, up({ x: 101, y: 51 }), ctx));

    result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 100, y: 50 }, portHit()), ctx);
    result = stepInteraction(result.state, move({ x: 320, y: 50 }), ctx);
    completions.push(stepInteraction(result.state, up({ x: 320, y: 50 }), ctx));

    result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 100, y: 50 }, portHit()), ctx);
    result = stepInteraction(result.state, move({ x: 1000, y: 1000 }), ctx);
    completions.push(stepInteraction(result.state, up({ x: 1000, y: 1000 }), ctx));

    result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 50, y: 50 }, objectHit()), ctx);
    completions.push(stepInteraction(result.state, up({ x: 51, y: 51 }), ctx));

    result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 50, y: 50 }, objectHit()), ctx);
    result = stepInteraction(result.state, move({ x: 320, y: 50 }), ctx);
    completions.push(stepInteraction(result.state, up({ x: 320, y: 50 }), ctx));

    result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 50, y: 50 }, objectHit()), ctx);
    result = stepInteraction(result.state, move({ x: 1000, y: 1000 }), ctx);
    completions.push(stepInteraction(result.state, up({ x: 1000, y: 1000 }), ctx));
    completions.push(stepInteraction(result.state, cancel({ x: 1000, y: 1000 }), ctx));
    completions.push(cancelInteraction(result.state));

    for (const completion of completions) {
      expect(completion.state.kind).toBe("idle");
      expectNoSetTool(completion.dispatch);
    }
  });

  it("cancel mid-drag returns idle with no dispatch", () => {
    const document = connectorDoc();
    const ctx = makeContext(document);

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 50, y: 50 }, objectHit()), ctx);
    result = stepInteraction(result.state, move({ x: 320, y: 50 }), ctx);
    result = stepInteraction(result.state, cancel({ x: 320, y: 50 }), ctx);

    expect(result.state.kind).toBe("idle");
    expect(result.dispatch).toEqual([]);
  });
});
