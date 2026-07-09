import { describe, expect, it } from "bun:test";
import { cancelInteraction, stepInteraction } from "../../stage/editor/pipeline/core";
import {
  IDLE_INTERACTION_STATE,
  type InteractionContext,
} from "../../stage/editor/pipeline/state";
import {
  hitTestObjects,
  selectionBounds,
  type CanvasPointerEvent,
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

function expectOrthogonalPolyline(points: ReadonlyArray<{ x: number; y: number }>) {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const dx = Math.abs(current.x - previous.x);
    const dy = Math.abs(current.y - previous.y);
    expect(dx <= 0.01 || dy <= 0.01).toBe(true);
  }
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
    for (const kind of ["idle", "pressing", "drag-select", "place"]) {
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
