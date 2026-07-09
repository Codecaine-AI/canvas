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

/** Snapping slice live move-guide coverage through the editor pipeline. */
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
