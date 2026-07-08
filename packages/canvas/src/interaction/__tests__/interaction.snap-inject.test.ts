import { describe, expect, it } from "bun:test";
import {
  cancelInteraction,
  IDLE_INTERACTION_STATE,
  stepInteraction,
  type CanvasPointerEvent,
  type InteractionContext,
  type InteractionState,
} from "../interaction";
import type { SnapCorrection } from "../snapping";
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../state/schema";

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

function down(world: { x: number; y: number }, hit: CanvasPointerEvent["hit"]): CanvasPointerEvent {
  return pointerEvent({ type: "down", world, screen: world, hit });
}

function move(world: { x: number; y: number }, hit: CanvasPointerEvent["hit"]): CanvasPointerEvent {
  return pointerEvent({ type: "move", world, screen: world, hit });
}

function updateGeometriesActions(result: ReturnType<typeof stepInteraction>) {
  return result.dispatch.filter(
    (action): action is Extract<typeof action, { type: "canvas.updateObjectGeometries" }> =>
      action.type === "canvas.updateObjectGeometries",
  );
}

describe("interaction: snapResolver injection (T1.2.2)", () => {
  it("applies the host-supplied snap correction to the committed drag geometry", () => {
    const document = makeDocument([makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } })]);
    const hit = { kind: "object" as const, objectId: "a" };

    // A resolver that always snaps by a fixed, distinctive offset so we can
    // unambiguously tell it (rather than the local computeSnapGuides fallback,
    // which would see no other objects and return {dx:0, dy:0}) fired.
    const snapCorrection: SnapCorrection = {
      dx: 7,
      dy: -3,
      guides: [{ axis: "x", position: 42, span: { start: 0, end: 10 } }],
    };
    let resolverCalls = 0;
    const ctx = makeContext(document, {
      snapResolver: () => {
        resolverCalls++;
        return snapCorrection;
      },
    });

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 10, y: 10 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 40, y: 40 }, hit), ctx);

    expect(resolverCalls).toBeGreaterThan(0);
    expect(result.state.kind).toBe("move");

    const geometryActions = updateGeometriesActions(result);
    expect(geometryActions).toHaveLength(1);
    // Raw drag delta is (30, 30) -> object would land at (30,30); the injected
    // snap correction (+7, -3) must be applied on top of that.
    expect(geometryActions[0]!.geometries.a).toEqual({ x: 37, y: 27, width: 100, height: 100 });
    expect(result.overlay.guides).toEqual(snapCorrection.guides);
  });

  it("applies the closest-wins snap correction to committed geometry with NO resolver in the context (the live editor path)", () => {
    // InteractiveCanvasEditor.runInteraction builds its InteractionContext
    // without a snapResolver — this asserts that in that exact shape, the
    // local computeSnapGuides fallback still applies its correction to the
    // COMMITTED geometry (not just the overlay guides), i.e. snapping is live
    // in the editor today without any extra wiring.
    const document = makeDocument([
      makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } }),
      makeObject({ id: "b", geometry: { x: 0, y: 500, width: 100, height: 100 } }),
    ]);
    const hit = { kind: "object" as const, objectId: "a" };
    const ctx = makeContext(document); // no snapResolver — exactly what the editor passes

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 10, y: 10 }, hit), ctx);
    // Raw drag would land "a" at x=2 — within the 6px/zoom threshold of b's
    // left edge at x=0, so the fallback must pull the committed x back to 0.
    result = stepInteraction(result.state, move({ x: 12, y: 40 }, hit), ctx);

    const geometryActions = updateGeometriesActions(result);
    expect(geometryActions).toHaveLength(1);
    expect(geometryActions[0]!.geometries.a!.x).toBe(0);
    expect(result.overlay.guides?.length ?? 0).toBeGreaterThan(0);
  });

  it("falls back to local computeSnapGuides when snapResolver returns null", () => {
    const document = makeDocument([
      makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } }),
      // Aligned with "a"'s left edge (x=0) once "a" is dragged near x=0 again;
      // placed far away so only an explicit local snap would catch it.
      makeObject({ id: "b", geometry: { x: 0, y: 500, width: 100, height: 100 } }),
    ]);
    const hit = { kind: "object" as const, objectId: "a" };
    const ctx = makeContext(document, { snapResolver: () => null });

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 10, y: 10 }, hit), ctx);
    // Drag "a" so its raw (unsnapped) x would be 2 (i.e. within the snap
    // threshold of b's x=0 left edge), letting local computeSnapGuides pull it
    // back to exactly 0.
    result = stepInteraction(result.state, move({ x: 12, y: 40 }, hit), ctx);

    const geometryActions = updateGeometriesActions(result);
    expect(geometryActions).toHaveLength(1);
    expect(geometryActions[0]!.geometries.a!.x).toBe(0);
  });

  it("Escape-restore reverts to true pre-drag geometry, unaffected by any snap correction", () => {
    const document = makeDocument([makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } })]);
    const hit = { kind: "object" as const, objectId: "a" };

    const ctx = makeContext(document, {
      snapResolver: () => ({ dx: 25, dy: 25, guides: [] }),
    });

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 10, y: 10 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 40, y: 40 }, hit), ctx);
    expect(result.state.kind).toBe("move");

    // Sanity: the snap correction did land in the live (committed) geometry.
    const liveActions = updateGeometriesActions(result);
    expect(liveActions[0]!.geometries.a).toEqual({ x: 55, y: 55, width: 100, height: 100 });

    const cancelResult = cancelInteraction(result.state);
    expect(cancelResult.state.kind).toBe("idle");
    const restoreActions = cancelResult.dispatch.filter(
      (action): action is Extract<typeof action, { type: "canvas.updateObjectGeometries" }> =>
        action.type === "canvas.updateObjectGeometries",
    );
    expect(restoreActions).toHaveLength(1);
    expect(restoreActions[0]!.recordHistory).toBe(false);
    // Must equal the ORIGINAL pre-drag geometry, not the snapped position.
    expect(restoreActions[0]!.geometries.a).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it("pointercancel mid-drag also restores true pre-drag geometry, unaffected by snap", () => {
    const document = makeDocument([makeObject({ id: "a", geometry: { x: 0, y: 0, width: 100, height: 100 } })]);
    const hit = { kind: "object" as const, objectId: "a" };

    const ctx = makeContext(document, {
      snapResolver: () => ({ dx: -10, dy: 5, guides: [] }),
    });

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 10, y: 10 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 40, y: 40 }, hit), ctx);
    result = stepInteraction(result.state, pointerEvent({ type: "cancel", world: { x: 40, y: 40 }, hit }), ctx);

    expect(result.state.kind).toBe("idle");
    const geometryActions = updateGeometriesActions(result);
    expect(geometryActions[0]!.recordHistory).toBe(false);
    expect(geometryActions[0]!.geometries.a).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });
});
