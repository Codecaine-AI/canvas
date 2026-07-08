import { describe, expect, it } from "bun:test";
import {
  IDLE_INTERACTION_STATE,
  stepInteraction,
  type CanvasPointerEvent,
  type InteractionContext,
} from "../interaction";
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../state/schema";

/**
 * W3b: the connector create/endpoint-drag gestures resolve their hover
 * candidate through the ported AFFiNE connection cascade
 * (connection-overlay.ts resolveConnectionCascade) — anchor snap within 8
 * VIEW px, outline snap within 8 WORLD px, inside fallback — and off-anchor
 * drops store the exact relative `position` on the endpoint.
 */

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
    id: "cascade-test-doc",
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

function move(world: { x: number; y: number }): CanvasPointerEvent {
  return pointerEvent({ type: "move", world, screen: world });
}

function up(world: { x: number; y: number }): CanvasPointerEvent {
  return pointerEvent({ type: "up", world, screen: world });
}

// a=[0,100]^2; b=[300,400]x[0,100]; c=[300,400]x[300,400]
function cascadeDoc() {
  return makeDocument(
    [
      makeObject({ id: "a" }),
      makeObject({ id: "b", geometry: { x: 300, y: 0, width: 100, height: 100 } }),
      makeObject({ id: "c", geometry: { x: 300, y: 300, width: 100, height: 100 } }),
    ],
    [{ id: "c1", from: { objectId: "a" }, to: { objectId: "b" } }],
  );
}

const PORT_HIT = { kind: "port" as const, objectId: "a", anchor: "right" as const };
const ENDPOINT_HIT = { kind: "endpoint" as const, connectionId: "c1", end: "to" as const };

describe("connector-create: cascade snapping (W3b)", () => {
  it("anchor snap: releasing within 8 view px of a cardinal anchor commits that anchor with NO position", () => {
    const ctx = makeContext(cascadeDoc());
    // b's left anchor is at (300, 50); release 3px away.
    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 100, y: 50 }, PORT_HIT), ctx);
    result = stepInteraction(result.state, move({ x: 303, y: 50 }), ctx);
    result = stepInteraction(result.state, up({ x: 303, y: 50 }), ctx);
    expect(result.dispatch).toEqual([
      {
        type: "canvas.addConnection",
        fromObjectId: "a",
        toObjectId: "b",
        fromAnchor: "right",
        toAnchor: "left",
      },
    ]);
  });

  it("anchor-snap candidate carries the exact outline point + snapKind for the overlay", () => {
    const ctx = makeContext(cascadeDoc());
    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 100, y: 50 }, PORT_HIT), ctx);
    result = stepInteraction(result.state, move({ x: 303, y: 50 }), ctx);
    const candidate = result.overlay.connectorDrag?.candidate;
    expect(candidate?.objectId).toBe("b");
    expect(candidate?.anchor).toBe("left");
    expect(candidate?.snapKind).toBe("anchor");
    expect(candidate?.point).toEqual({ x: 300, y: 50 });
    // Plain bbox anchor: no position stored (pre-W3b commit parity).
    expect(candidate?.position).toBeUndefined();
  });

  it("off-anchor outline drop: stores toPosition [0..1, 0..1] on the created connection", () => {
    const ctx = makeContext(cascadeDoc());
    // (380, 2) is 2 world px from b's top edge at (380, 0), ~30px from the top anchor.
    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 100, y: 50 }, PORT_HIT), ctx);
    result = stepInteraction(result.state, move({ x: 380, y: 2 }), ctx);
    result = stepInteraction(result.state, up({ x: 380, y: 2 }), ctx);
    expect(result.dispatch).toHaveLength(1);
    const action = result.dispatch[0]!;
    if (action.type !== "canvas.addConnection") throw new Error("expected addConnection");
    expect(action.toObjectId).toBe("b");
    expect(action.toPosition?.[0]).toBeCloseTo(0.8, 5);
    expect(action.toPosition?.[1]).toBeCloseTo(0, 5);
  });

  it("inside drop (beyond both snap radii): commits the coarse nearest anchor only — pre-W3b parity", () => {
    const ctx = makeContext(cascadeDoc());
    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 100, y: 50 }, PORT_HIT), ctx);
    result = stepInteraction(result.state, move({ x: 320, y: 50 }), ctx);
    result = stepInteraction(result.state, up({ x: 320, y: 50 }), ctx);
    expect(result.dispatch).toEqual([
      {
        type: "canvas.addConnection",
        fromObjectId: "a",
        toObjectId: "b",
        fromAnchor: "right",
        toAnchor: "left",
      },
    ]);
  });

  it("uses shared paint order when a shape overlaps a later-in-array section", () => {
    const shape = makeObject({
      id: "shape-target",
      geometry: { x: 300, y: 0, width: 100, height: 100 },
    });
    const laterSection = makeObject({
      id: "section-target",
      type: "section",
      text: "Section",
      geometry: { x: 280, y: -20, width: 180, height: 160 },
    });
    const ctx = makeContext(makeDocument([makeObject({ id: "a" }), shape, laterSection]));

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 100, y: 50 }, PORT_HIT), ctx);
    result = stepInteraction(result.state, move({ x: 350, y: 50 }), ctx);

    expect(result.overlay.connectorDrag?.candidate?.objectId).toBe("shape-target");

    result = stepInteraction(result.state, up({ x: 350, y: 50 }), ctx);
    expect(result.dispatch).toEqual([
      {
        type: "canvas.addConnection",
        fromObjectId: "a",
        toObjectId: "shape-target",
        fromAnchor: "right",
        toAnchor: "top",
      },
    ]);
  });

  it("anchor snap on a true-outline shape (arrow-shape): stores the exact outline position, not the bbox midpoint", () => {
    // Arrow-shape 200x100 at (300, 0), direction right: the top-anchor ray
    // from the center crosses the chevron BODY top edge at y = bodyInset
    // (20 with ARROW_SHAPE_GEOMETRY.bodyHeightRatio = 0.60 — Wave B1's
    // blockier arrow; bodyInset = (1 - 0.60) / 2 * height), not y = 0.
    const documentWithArrow = makeDocument([
      makeObject({ id: "a" }),
      makeObject({
        id: "arrow",
        type: "arrow-shape",
        geometry: { x: 300, y: 0, width: 200, height: 100 },
        direction: "right",
      }),
    ]);
    const ctx = makeContext(documentWithArrow);
    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 100, y: 50 }, PORT_HIT), ctx);
    result = stepInteraction(result.state, move({ x: 400, y: 25 }), ctx);
    result = stepInteraction(result.state, up({ x: 400, y: 25 }), ctx);
    expect(result.dispatch).toHaveLength(1);
    const action = result.dispatch[0]!;
    if (action.type !== "canvas.addConnection") throw new Error("expected addConnection");
    expect(action.toObjectId).toBe("arrow");
    expect(action.toAnchor).toBe("top");
    // The exact outline attach point is preserved: [0.5, bodyInset/height].
    expect(action.toPosition?.[0]).toBeCloseTo(0.5, 5);
    expect(action.toPosition?.[1]).toBeCloseTo(0.2, 3);
  });
});

describe("connector-endpoint-drag: cascade snapping (W3b)", () => {
  it("anchor snap: releasing near a cardinal anchor patches that anchor with NO position", () => {
    const ctx = makeContext(cascadeDoc());
    // c's top anchor is at (350, 300); release 3px above it (outside the shape).
    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 300, y: 50 }, ENDPOINT_HIT), ctx);
    result = stepInteraction(result.state, move({ x: 350, y: 297 }), ctx);
    result = stepInteraction(result.state, up({ x: 350, y: 297 }), ctx);
    expect(result.dispatch).toEqual([
      {
        type: "canvas.updateConnection",
        connectionId: "c1",
        patch: { to: { objectId: "c", anchor: "top" } },
      },
    ]);
  });

  it("off-anchor outline drop: patches the endpoint with the exact relative position", () => {
    const ctx = makeContext(cascadeDoc());
    // (390, 302) is 2 world px inside c's top edge, ~40px from the top anchor.
    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 300, y: 50 }, ENDPOINT_HIT), ctx);
    result = stepInteraction(result.state, move({ x: 390, y: 302 }), ctx);
    result = stepInteraction(result.state, up({ x: 390, y: 302 }), ctx);
    expect(result.dispatch).toHaveLength(1);
    const action = result.dispatch[0]!;
    if (action.type !== "canvas.updateConnection") throw new Error("expected updateConnection");
    const endpoint = action.patch.to!;
    expect(endpoint.objectId).toBe("c");
    expect(endpoint.anchor).toBe("top");
    expect(endpoint.position?.[0]).toBeCloseTo(0.9, 5);
    expect(endpoint.position?.[1]).toBeCloseTo(0, 5);
  });

  it("anchor snap radius scales with zoom (8 VIEW px / zoom): a 3-world-px gap stops anchor-snapping at zoom 4", () => {
    // At zoom 1, (350, 297) anchor-snaps to c's top anchor (3 < 8/1).
    // At zoom 4 the world-space anchor radius is 8/4 = 2, so the same point
    // falls through to the outline snap (still 8 WORLD px) and stores the
    // nearest-outline position instead.
    const ctx = makeContext(cascadeDoc(), { viewport: { x: 0, y: 0, zoom: 4 } });
    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 300, y: 50 }, ENDPOINT_HIT), ctx);
    result = stepInteraction(result.state, move({ x: 350, y: 297 }), ctx);
    const candidate = result.overlay.connectorDrag?.candidate;
    expect(candidate?.snapKind).toBe("outline");
    result = stepInteraction(result.state, up({ x: 350, y: 297 }), ctx);
    const action = result.dispatch[0]!;
    if (action.type !== "canvas.updateConnection") throw new Error("expected updateConnection");
    expect(action.patch.to!.position?.[0]).toBeCloseTo(0.5, 5);
    expect(action.patch.to!.position?.[1]).toBeCloseTo(0, 5);
  });

  it("still excludes the other (unmoved) endpoint's object from candidates", () => {
    const ctx = makeContext(cascadeDoc());
    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 300, y: 50 }, ENDPOINT_HIT), ctx);
    // Dead center of "a" (the connection's from-object): excluded, no candidate.
    result = stepInteraction(result.state, move({ x: 50, y: 50 }), ctx);
    expect(result.overlay.connectorDrag?.candidate).toBeUndefined();
  });
});
