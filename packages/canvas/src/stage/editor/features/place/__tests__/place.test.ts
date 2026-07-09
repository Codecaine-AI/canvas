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

/** Place slice armed-tool creation gesture coverage. */
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
