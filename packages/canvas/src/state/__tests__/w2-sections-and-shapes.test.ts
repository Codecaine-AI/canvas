import { describe, expect, it } from "bun:test";
import v2FlowElementsDocumentJson from "../../../../../canvases/v2-flow-elements.canvas.json";
import {
  IDLE_INTERACTION_STATE,
  cancelInteraction,
  stepInteraction,
  type CanvasPointerEvent,
  type InteractionContext,
  type InteractionState,
} from "../../interaction/interaction";
import { renderOrderedObjects } from "../../render/CanvasStage";
import {
  SECTION_CAPTURE_OVERLAP_THRESHOLD,
  SECTION_TITLE_CLEARANCE_PX,
  sectionCaptureMembers,
  sectionFitGeometry,
} from "../geometry";
import { tokenizeCodeBlock, tokenizeCodeLine } from "../../render/code-tokenizer";
import { validateInteractiveCanvasDocument } from "../schema";
import { createInteractiveCanvasState, reduceInteractiveCanvasState } from "../actions";
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../schema";

const v2FlowElementsDocument = v2FlowElementsDocumentJson as InteractiveCanvasDocument;

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
    id: "w2-test-doc",
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

function pointerEvent(
  overrides: Partial<CanvasPointerEvent> & { type: CanvasPointerEvent["type"] },
): CanvasPointerEvent {
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

function up(world: { x: number; y: number }, hit: CanvasPointerEvent["hit"]): CanvasPointerEvent {
  return pointerEvent({ type: "up", world, screen: world, hit });
}

function updateGeometriesActions(actions: ReturnType<typeof stepInteraction>["dispatch"]) {
  return actions.filter(
    (action): action is Extract<typeof action, { type: "canvas.updateObjectGeometries" }> =>
      action.type === "canvas.updateObjectGeometries",
  );
}

describe("schema: W2 object types round-trip", () => {
  it("validates the v2-flow-elements canvas JSON end to end", () => {
    const validation = validateInteractiveCanvasDocument(v2FlowElementsDocument);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const types = new Set(validation.document.objects.map((object) => object.type));
    expect(types.has("section")).toBe(true);
    expect(types.has("pill")).toBe(true);
    expect(types.has("arrow-shape")).toBe(true);
    expect(types.has("predefined-process")).toBe(true);
    expect(types.has("code-block")).toBe(true);
    expect(types.has("icon")).toBe(true);
    expect(validation.document.objects.some((object) => object.type === "icon" && object.icon === "cpu")).toBe(true);
    expect(validation.warnings).toBeUndefined();
  });

  it("preserves each new type's dedicated props through validation", () => {
    const validation = validateInteractiveCanvasDocument(v2FlowElementsDocument);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const byId = new Map(validation.document.objects.map((object) => [object.id, object]));

    expect(byId.get("outer-section")?.text).toBe("Memory pipeline");
    expect(byId.get("outer-section")?.color).toBe("gray");
    expect(byId.get("inner-section")?.color).toBe("blue");
    expect(byId.get("outside-arrow")?.direction).toBe("right");
    expect(byId.get("outside-arrow-left")?.direction).toBe("left");
    expect(byId.get("captured-code-block")?.language).toBe("python");
    expect(byId.get("json-code-block")?.language).toBe("json");
    expect(byId.get("partial-overlap-note")?.author).toBe("Ford");
  });

  it("rejects an object with missing text as a hard validation error", () => {
    const document = makeDocument([
      {
        id: "s1",
        type: "section",
        color: "gray",
        geometry: { x: 0, y: 0, width: 100, height: 100 },
      } as unknown as InteractiveCanvasObject,
    ]);
    const validation = validateInteractiveCanvasDocument(document);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.issues).toContainEqual({
      path: "$.objects[0].text",
      message: "Object text is required (a string; may be empty).",
    });
  });

  it("drops a section's unknown color id with a warning (P1 — tint is gone, color is soft-validated)", () => {
    const document = makeDocument([
      {
        ...makeObject({ id: "s1" }),
        type: "section",
        text: "Untitled",
        color: "chartreuse",
      } as unknown as InteractiveCanvasObject,
    ]);
    const validation = validateInteractiveCanvasDocument(document);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.document.objects[0]?.color).toBeUndefined();
    expect((validation.warnings ?? []).map((warning) => warning.message).join(" ")).toContain("chartreuse");
  });

  it("drops legacy soft color ids with the same invalid-color warning path", () => {
    const document = {
      ...makeDocument([
        {
          ...makeObject({ id: "o1" }),
          color: "blue-soft",
        } as unknown as InteractiveCanvasObject,
      ]),
      connections: [
        {
          id: "c1",
          from: { objectId: "o1" },
          to: { objectId: "o1" },
          color: "orange-soft",
        },
      ],
    };
    const validation = validateInteractiveCanvasDocument(document);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.document.objects[0]?.color).toBeUndefined();
    expect(validation.document.connections[0]?.color).toBeUndefined();
    expect(validation.warnings).toContainEqual({
      path: "$.objects[0].color",
      message: 'Unknown color "blue-soft" was dropped.',
    });
    expect(validation.warnings).toContainEqual({
      path: "$.connections[0].color",
      message: 'Unknown color "orange-soft" was dropped.',
    });
  });

  it("defaults an arrow-shape's direction to right when omitted", () => {
    const document = makeDocument([
      { ...makeObject({ id: "a1" }), type: "arrow-shape" } as InteractiveCanvasObject,
    ]);
    const validation = validateInteractiveCanvasDocument(document);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.document.objects[0]?.direction).toBe("right");
  });

  // P1 — color pick + strokeWidth on the slimmed style bag.
  it("preserves valid color/strokeWidth through validation", () => {
    const document = makeDocument([
      makeObject({
        id: "styled",
        color: "white",
        style: { shape: "pill", strokeWidth: 8 },
      }),
    ]);
    const validation = validateInteractiveCanvasDocument(document);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.warnings).toBeUndefined();
    expect(validation.document.objects[0]?.color).toBe("white");
    expect(validation.document.objects[0]?.style?.strokeWidth).toBe(8);
  });

  it("preserves section strokeStyle through validation", () => {
    const doc = makeDocument([
      {
        ...makeObject({ id: "section-a" }),
        type: "section",
        text: "A",
        color: "gray",
        style: { shape: "section", strokeStyle: "dashed" },
      },
    ]);

    const validation = validateInteractiveCanvasDocument(doc);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.document.objects[0]?.style?.strokeStyle).toBe("dashed");
  });

  it("preserves section lock flags through validation", () => {
    const doc = {
      schemaVersion: 1,
      id: "w2-test-doc",
      mode: "diagram",
      objects: [
        {
          ...makeObject({ id: "section-a" }),
          type: "section",
          text: "A",
          color: "gray",
          locked: true,
          style: { shape: "section" },
        },
      ],
      connections: [],
    };

    const validation = validateInteractiveCanvasDocument(doc);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.document.objects[0]?.locked).toBe("background");

    const validateLock = (locked: unknown) => {
      const lockValidation = validateInteractiveCanvasDocument({
        ...doc,
        objects: [{ ...doc.objects[0]!, locked }],
      });
      expect(lockValidation.ok).toBe(true);
      if (!lockValidation.ok) return undefined;
      return lockValidation.document.objects[0]?.locked;
    };
    expect(validateLock("all")).toBe("all");
    expect(validateLock("background")).toBe("background");
    expect(validateLock(false)).toBeUndefined();
    expect(validateLock("nope")).toBeUndefined();
  });

  it("updates a section color through the undoable object reducer path", () => {
    const doc = makeDocument([
      {
        ...makeObject({ id: "section-a" }),
        type: "section",
        text: "A",
        color: "gray",
        style: { shape: "section" },
      },
    ]);
    const state = createInteractiveCanvasState(doc);

    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObject",
      objectId: "section-a",
      patch: { color: "blue" },
    });

    expect(next.document.objects[0]?.color).toBe("blue");
    expect(next.history.past.length).toBe(1);
  });

  it("drops an invalid strokeWidth with a warning, not a hard error", () => {
    const document = makeDocument([
      makeObject({
        id: "badly-styled",
        style: {
          shape: "pill",
          strokeWidth: -3,
        } as unknown as InteractiveCanvasObject["style"],
      }),
    ]);
    const validation = validateInteractiveCanvasDocument(document);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const warningPaths = (validation.warnings ?? []).map((warning) => warning.path).join(" ");
    expect(warningPaths).toContain("style.strokeWidth");
    expect(validation.document.objects[0]?.style?.strokeWidth).toBeUndefined();
  });
});

describe("schema: W5 FigJam parity shape set (Wave A)", () => {
  const NEW_TYPES = [
    "ellipse",
    "triangle",
    "parallelogram",
    "pentagon",
    "octagon",
    "star",
    "plus",
    "chevron",
    "folder",
    "document-stack",
    "off-page-connector",
    "trapezoid",
    "manual-input",
    "hexagon",
    "internal-storage",
    "or-junction",
    "summing-junction",
    "cylinder-horizontal",
    "page-corner",
  ] as const;

  it("validates every new native type (19 total, not counting icon)", () => {
    expect(NEW_TYPES.length).toBe(19);
    const objects = NEW_TYPES.map((type, index) =>
      ({ ...makeObject({ id: `shape-${index}` }), type }) as InteractiveCanvasObject,
    );
    const validation = validateInteractiveCanvasDocument(makeDocument(objects));
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const types = new Set(validation.document.objects.map((object) => object.type));
    for (const type of NEW_TYPES) {
      expect(types.has(type)).toBe(true);
    }
  });

  it("validates a type: 'icon' object with a known glyph", () => {
    const document = makeDocument([
      { ...makeObject({ id: "icon-a" }), type: "icon", icon: "database" } as InteractiveCanvasObject,
    ]);
    const validation = validateInteractiveCanvasDocument(document);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.document.objects[0]?.icon).toBe("database");
  });

  it("rejects an icon object with a missing glyph as a hard validation error", () => {
    const document = makeDocument([
      { ...makeObject({ id: "icon-a" }), type: "icon" } as InteractiveCanvasObject,
    ]);
    const validation = validateInteractiveCanvasDocument(document);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.issues.map((issue) => issue.message).join(" ")).toContain("glyph");
  });

  it("rejects an icon object with an unknown glyph id as a hard validation error", () => {
    const document = makeDocument([
      {
        ...makeObject({ id: "icon-a" }),
        type: "icon",
        icon: "not-a-real-glyph",
      } as unknown as InteractiveCanvasObject,
    ]);
    const validation = validateInteractiveCanvasDocument(document);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.issues.map((issue) => issue.message).join(" ")).toContain("glyph");
  });

  it("defaults triangle direction to 'up' when omitted, and preserves 'down' when set", () => {
    const document = makeDocument([
      { ...makeObject({ id: "tri-default" }), type: "triangle" } as InteractiveCanvasObject,
      {
        ...makeObject({ id: "tri-down" }),
        type: "triangle",
        direction: "down",
      } as InteractiveCanvasObject,
    ]);
    const validation = validateInteractiveCanvasDocument(document);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const byId = new Map(validation.document.objects.map((object) => [object.id, object]));
    expect(byId.get("tri-default")?.direction).toBe("up");
    expect(byId.get("tri-down")?.direction).toBe("down");
  });

  it("ignores an invalid triangle direction and soft-defaults to 'up'", () => {
    const document = makeDocument([
      {
        ...makeObject({ id: "tri-bad" }),
        type: "triangle",
        direction: "left",
      } as InteractiveCanvasObject,
    ]);
    const validation = validateInteractiveCanvasDocument(document);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.document.objects[0]?.direction).toBe("up");
  });

  it("defaults parallelogram and chevron direction to 'right' when omitted", () => {
    const document = makeDocument([
      { ...makeObject({ id: "para" }), type: "parallelogram" } as InteractiveCanvasObject,
      { ...makeObject({ id: "chev" }), type: "chevron" } as InteractiveCanvasObject,
      {
        ...makeObject({ id: "para-left" }),
        type: "parallelogram",
        direction: "left",
      } as InteractiveCanvasObject,
    ]);
    const validation = validateInteractiveCanvasDocument(document);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const byId = new Map(validation.document.objects.map((object) => [object.id, object]));
    expect(byId.get("para")?.direction).toBe("right");
    expect(byId.get("chev")?.direction).toBe("right");
    expect(byId.get("para-left")?.direction).toBe("left");
  });

  it("leaves direction undefined for a type that doesn't use it (e.g. pentagon)", () => {
    const document = makeDocument([
      { ...makeObject({ id: "pent" }), type: "pentagon" } as InteractiveCanvasObject,
    ]);
    const validation = validateInteractiveCanvasDocument(document);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.document.objects[0]?.direction).toBeUndefined();
  });

  it("addObject applies the brief's default geometry/color/shape for each new native type", () => {
    const state = createInteractiveCanvasState(makeDocument([makeObject({ id: "seed" })]));
    const cases: Array<{ type: InteractiveCanvasObject["type"]; width: number; height: number }> = [
      { type: "ellipse", width: 160, height: 128 },
      { type: "triangle", width: 144, height: 128 }, // snapped to 16px grid
      { type: "parallelogram", width: 160, height: 96 },
      { type: "pentagon", width: 144, height: 144 },
      { type: "octagon", width: 144, height: 144 },
      { type: "star", width: 144, height: 144 },
      { type: "plus", width: 128, height: 128 },
      { type: "chevron", width: 160, height: 128 },
      { type: "folder", width: 144, height: 112 },
      { type: "document-stack", width: 160, height: 128 },
      { type: "off-page-connector", width: 128, height: 96 },
      { type: "trapezoid", width: 144, height: 96 },
      { type: "manual-input", width: 144, height: 96 },
      { type: "hexagon", width: 144, height: 96 },
      { type: "internal-storage", width: 144, height: 112 },
      { type: "or-junction", width: 96, height: 96 },
      { type: "summing-junction", width: 96, height: 96 },
      { type: "cylinder-horizontal", width: 144, height: 96 },
      { type: "page-corner", width: 160, height: 128 },
      { type: "icon", width: 128, height: 128 },
    ];

    for (const testCase of cases) {
      const next = reduceInteractiveCanvasState(state, {
        type: "canvas.addObject",
        objectType: testCase.type,
      });
      const added = next.document.objects.at(-1);
      expect(added?.type).toBe(testCase.type);
      expect(added?.style?.shape).toBe(testCase.type);
      expect(added?.color).toBe("gray");
      expect(added?.geometry.width).toBe(testCase.width);
      expect(added?.geometry.height).toBe(testCase.height);
    }
  });
});

describe("geometry: sectionFitGeometry", () => {
  it("returns null for empty sections and non-sections", () => {
    const document = makeDocument([
      { ...makeObject({ id: "section-a" }), type: "section", text: "A", color: "gray" },
      makeObject({ id: "process-a" }),
    ]);

    expect(sectionFitGeometry(document, "section-a")).toBeNull();
    expect(sectionFitGeometry(document, "process-a")).toBeNull();
    expect(sectionFitGeometry(document, "missing")).toBeNull();
  });

  it("adds title clearance above direct children while using base padding elsewhere", () => {
    const padding = 24;
    const document = makeDocument([
      { ...makeObject({ id: "section-a" }), type: "section", text: "A", color: "gray" },
      makeObject({
        id: "child-a",
        parentId: "section-a",
        geometry: { x: 56, y: 118, width: 80, height: 64 },
      }),
      makeObject({
        id: "child-b",
        parentId: "section-a",
        geometry: { x: 168, y: 152, width: 80, height: 80 },
      }),
      makeObject({
        id: "nested-child",
        parentId: "child-a",
        geometry: { x: -400, y: -400, width: 80, height: 80 },
      }),
    ]);

    const geometry = sectionFitGeometry(document, "section-a", padding);

    expect(geometry).not.toBeNull();
    if (!geometry) return;
    expect(geometry).toEqual({ x: 32, y: 64, width: 240, height: 192 });
    expect(56 - geometry.x).toBe(padding);
    expect(118 - geometry.y).toBe(padding + SECTION_TITLE_CLEARANCE_PX);
    expect(geometry.x + geometry.width - (168 + 80)).toBe(padding);
    expect(geometry.y + geometry.height - (152 + 80)).toBe(padding);
  });
});

describe("geometry: sectionCaptureMembers (drag-start capture math)", () => {
  it("captures an object fully inside a section", () => {
    const document = makeDocument([
      { ...makeObject({ id: "section-a" }), type: "section", text: "A", color: "gray", geometry: { x: 0, y: 0, width: 400, height: 400 } },
      makeObject({ id: "inside", geometry: { x: 50, y: 50, width: 100, height: 100 } }),
    ]);
    const members = sectionCaptureMembers(document, "section-a", SECTION_CAPTURE_OVERLAP_THRESHOLD);
    expect(members.has("inside")).toBe(true);
  });

  it("does not capture an object overlapping just under the 0.6 threshold", () => {
    const document = makeDocument([
      { ...makeObject({ id: "section-a" }), type: "section", text: "A", color: "gray", geometry: { x: 0, y: 0, width: 100, height: 100 } },
      // 100x100 object positioned so only ~50% overlaps the section (under threshold).
      makeObject({ id: "half-in", geometry: { x: 50, y: 0, width: 100, height: 100 } }),
    ]);
    const members = sectionCaptureMembers(document, "section-a", SECTION_CAPTURE_OVERLAP_THRESHOLD);
    expect(members.has("half-in")).toBe(false);
  });

  it("captures an object right at/above the 0.6 threshold", () => {
    const document = makeDocument([
      { ...makeObject({ id: "section-a" }), type: "section", text: "A", color: "gray", geometry: { x: 0, y: 0, width: 100, height: 100 } },
      // 100x100 object with 65% overlap (65 of its own width inside the section).
      makeObject({ id: "mostly-in", geometry: { x: 35, y: 0, width: 100, height: 100 } }),
    ]);
    const members = sectionCaptureMembers(document, "section-a", SECTION_CAPTURE_OVERLAP_THRESHOLD);
    expect(members.has("mostly-in")).toBe(true);
  });

  it("recursively captures a nested section's own members", () => {
    const document = makeDocument([
      { ...makeObject({ id: "outer" }), type: "section", text: "Outer", color: "gray", geometry: { x: 0, y: 0, width: 600, height: 600 } },
      { ...makeObject({ id: "inner" }), type: "section", text: "Inner", color: "blue", geometry: { x: 50, y: 50, width: 300, height: 300 } },
      makeObject({ id: "grandchild", geometry: { x: 80, y: 80, width: 100, height: 100 } }),
    ]);
    const members = sectionCaptureMembers(document, "outer", SECTION_CAPTURE_OVERLAP_THRESHOLD);
    expect(members.has("inner")).toBe(true);
    expect(members.has("grandchild")).toBe(true);
  });

  it("captures every object and nested section from the v2-flow-elements canvas JSON when dragging outer-section", () => {
    const members = sectionCaptureMembers(
      v2FlowElementsDocument,
      "outer-section",
      SECTION_CAPTURE_OVERLAP_THRESHOLD,
    );
    expect(members.has("inner-section")).toBe(true);
    expect(members.has("captured-pill")).toBe(true);
    expect(members.has("captured-code-block")).toBe(true);
    expect(members.has("partial-overlap-note")).toBe(false);
    expect(members.has("outside-arrow")).toBe(false);
  });
});

describe("interaction: dragging a section carries its recorded parentId members", () => {
  it("moves the section and every recorded member together, with one history entry", () => {
    const document = makeDocument([
      { ...makeObject({ id: "section-a" }), type: "section", text: "A", color: "gray", geometry: { x: 0, y: 0, width: 300, height: 300 } },
      makeObject({ id: "member-a", parentId: "section-a", geometry: { x: 40, y: 40, width: 60, height: 60 } }),
      // Geometrically inside the section but with no recorded membership —
      // drags no longer recapture by overlap, so it must stay put.
      makeObject({ id: "squatter", geometry: { x: 150, y: 150, width: 60, height: 60 } }),
      makeObject({ id: "outsider", geometry: { x: 1000, y: 1000, width: 60, height: 60 } }),
    ]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "section-a" };

    let state: InteractionState = IDLE_INTERACTION_STATE;
    let result = stepInteraction(state, down({ x: 10, y: 10 }, hit), ctx);
    state = result.state;
    result = stepInteraction(state, move({ x: 30, y: 30 }, hit), ctx);
    state = result.state;

    expect(state.kind).toBe("move");
    let geometryActions = updateGeometriesActions(result.dispatch);
    expect(geometryActions).toHaveLength(1);
    expect(geometryActions[0]!.recordHistory).toBe(true);
    // dx = 20, dy = 20 for both the section and its recorded member.
    expect(geometryActions[0]!.geometries["section-a"]).toEqual({ x: 20, y: 20, width: 300, height: 300 });
    expect(geometryActions[0]!.geometries["member-a"]).toEqual({ x: 60, y: 60, width: 60, height: 60 });
    expect(geometryActions[0]!.geometries["squatter"]).toBeUndefined();
    expect(geometryActions[0]!.geometries["outsider"]).toBeUndefined();

    // Second move in the same gesture: still a single history entry (recordHistory false).
    result = stepInteraction(state, move({ x: 40, y: 40 }, hit), ctx);
    state = result.state;
    geometryActions = updateGeometriesActions(result.dispatch);
    expect(geometryActions[0]!.recordHistory).toBe(false);

    result = stepInteraction(state, up({ x: 40, y: 40 }, hit), ctx);
    expect(result.state.kind).toBe("idle");
    expect(updateGeometriesActions(result.dispatch)).toHaveLength(0);
  });

  it("restores the section and all carried members on Escape", () => {
    const document = makeDocument([
      { ...makeObject({ id: "section-a" }), type: "section", text: "A", color: "gray", geometry: { x: 0, y: 0, width: 300, height: 300 } },
      makeObject({ id: "member-a", parentId: "section-a", geometry: { x: 40, y: 40, width: 60, height: 60 } }),
    ]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "section-a" };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 10, y: 10 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 60, y: 60 }, hit), ctx);
    expect(result.state.kind).toBe("move");

    const cancelResult = cancelInteraction(result.state);
    expect(cancelResult.state.kind).toBe("idle");
    const geometryActions = updateGeometriesActions(cancelResult.dispatch);
    expect(geometryActions).toHaveLength(1);
    expect(geometryActions[0]!.recordHistory).toBe(false);
    expect(geometryActions[0]!.geometries["section-a"]).toEqual({ x: 0, y: 0, width: 300, height: 300 });
    expect(geometryActions[0]!.geometries["member-a"]).toEqual({ x: 40, y: 40, width: 60, height: 60 });
  });

  it("recursively carries a nested section and its own members when dragging the outer section", () => {
    const document = makeDocument([
      { ...makeObject({ id: "outer" }), type: "section", text: "Outer", color: "gray", geometry: { x: 0, y: 0, width: 600, height: 600 } },
      { ...makeObject({ id: "inner" }), type: "section", text: "Inner", color: "blue", parentId: "outer", geometry: { x: 50, y: 50, width: 300, height: 300 } },
      makeObject({ id: "grandchild", parentId: "inner", geometry: { x: 80, y: 80, width: 100, height: 100 } }),
    ]);
    const ctx = makeContext(document);
    const hit = { kind: "object" as const, objectId: "outer" };

    let result = stepInteraction(IDLE_INTERACTION_STATE, down({ x: 10, y: 10 }, hit), ctx);
    result = stepInteraction(result.state, move({ x: 30, y: 30 }, hit), ctx);

    const geometryActions = updateGeometriesActions(result.dispatch);
    expect(geometryActions).toHaveLength(1);
    expect(geometryActions[0]!.geometries["inner"]).toBeDefined();
    expect(geometryActions[0]!.geometries["grandchild"]).toBeDefined();
  });
});

describe("CanvasStage: renderOrderedObjects (z-order)", () => {
  it("renders sections below every non-section object regardless of schema order", () => {
    const objects: InteractiveCanvasObject[] = [
      { ...makeObject({ id: "shape-a" }), type: "process" },
      { ...makeObject({ id: "section-a" }), type: "section", text: "A", color: "gray" },
      { ...makeObject({ id: "shape-b" }), type: "process" },
    ];
    const ordered = renderOrderedObjects(objects);
    const sectionIndex = ordered.findIndex((object) => object.id === "section-a");
    const shapeAIndex = ordered.findIndex((object) => object.id === "shape-a");
    const shapeBIndex = ordered.findIndex((object) => object.id === "shape-b");
    expect(sectionIndex).toBeLessThan(shapeAIndex);
    expect(sectionIndex).toBeLessThan(shapeBIndex);
  });

  it("renders a nested section above its parentId ancestor sections", () => {
    const objects: InteractiveCanvasObject[] = [
      { ...makeObject({ id: "inner" }), type: "section", text: "Inner", color: "blue", parentId: "outer", geometry: { x: 50, y: 50, width: 100, height: 100 } },
      { ...makeObject({ id: "innermost" }), type: "section", text: "Innermost", color: "green", parentId: "inner", geometry: { x: 60, y: 60, width: 40, height: 40 } },
      { ...makeObject({ id: "outer" }), type: "section", text: "Outer", color: "gray", geometry: { x: 0, y: 0, width: 400, height: 400 } },
    ];
    const ordered = renderOrderedObjects(objects);
    const outerIndex = ordered.findIndex((object) => object.id === "outer");
    const innerIndex = ordered.findIndex((object) => object.id === "inner");
    const innermostIndex = ordered.findIndex((object) => object.id === "innermost");
    expect(outerIndex).toBeLessThan(innerIndex);
    expect(innerIndex).toBeLessThan(innermostIndex);
  });

  it("orders equal-depth sections by area descending, then stable original index", () => {
    const objects: InteractiveCanvasObject[] = [
      { ...makeObject({ id: "small" }), type: "section", text: "Small", color: "green", geometry: { x: 80, y: 80, width: 100, height: 100 } },
      { ...makeObject({ id: "medium-a" }), type: "section", text: "Medium A", color: "blue", geometry: { x: 40, y: 40, width: 150, height: 100 } },
      { ...makeObject({ id: "large" }), type: "section", text: "Large", color: "gray", geometry: { x: 0, y: 0, width: 300, height: 200 } },
      { ...makeObject({ id: "medium-b" }), type: "section", text: "Medium B", color: "yellow", geometry: { x: 60, y: 60, width: 150, height: 100 } },
    ];
    expect(renderOrderedObjects(objects).map((object) => object.id)).toEqual([
      "large",
      "medium-a",
      "medium-b",
      "small",
    ]);
  });

  it("buries a later equal-depth section below a smaller section it fully covers", () => {
    const objects: InteractiveCanvasObject[] = [
      { ...makeObject({ id: "small" }), type: "section", text: "Small", color: "blue", geometry: { x: 50, y: 50, width: 100, height: 100 } },
      { ...makeObject({ id: "large" }), type: "section", text: "Large", color: "gray", geometry: { x: 0, y: 0, width: 300, height: 300 } },
    ];
    expect(renderOrderedObjects(objects).map((object) => object.id)).toEqual(["large", "small"]);
  });

  it("ignores geometric containment for section depth when no parentId is recorded", () => {
    // "inner" sits geometrically inside "outer" but has no recorded parent,
    // so both are root sections; area ordering paints the larger one behind
    // the smaller one rather than treating containment as nesting.
    const objects: InteractiveCanvasObject[] = [
      { ...makeObject({ id: "inner" }), type: "section", text: "Inner", color: "blue", geometry: { x: 50, y: 50, width: 100, height: 100 } },
      { ...makeObject({ id: "outer" }), type: "section", text: "Outer", color: "gray", geometry: { x: 0, y: 0, width: 400, height: 400 } },
    ];
    const ordered = renderOrderedObjects(objects);
    expect(ordered.map((object) => object.id)).toEqual(["outer", "inner"]);
  });

  it("preserves schema order for non-sections and equal-area sibling sections", () => {
    const objects: InteractiveCanvasObject[] = [
      { ...makeObject({ id: "shape-a" }), type: "process" },
      { ...makeObject({ id: "section-a" }), type: "section", text: "A", color: "gray", geometry: { x: 0, y: 0, width: 100, height: 100 } },
      { ...makeObject({ id: "section-b" }), type: "section", text: "B", color: "blue", geometry: { x: 200, y: 0, width: 100, height: 100 } },
      { ...makeObject({ id: "shape-b" }), type: "process" },
    ];
    expect(renderOrderedObjects(objects).map((object) => object.id)).toEqual([
      "section-a",
      "section-b",
      "shape-a",
      "shape-b",
    ]);
  });

  it("returns the original array reference-order unchanged when there are no sections", () => {
    const objects: InteractiveCanvasObject[] = [makeObject({ id: "only" })];
    expect(renderOrderedObjects(objects)).toEqual(objects);
  });
});

describe("code-tokenizer: tokenizeCodeBlock integration with the canvas JSON text", () => {
  it("tokenizes the python code-block text from the canvas JSON without dropping characters", () => {
    const codeBlock = v2FlowElementsDocument.objects.find((object) => object.id === "captured-code-block");
    expect(codeBlock?.text).toBeDefined();
    const lines = tokenizeCodeBlock(codeBlock!.text, codeBlock!.language);
    const rejoined = lines.map((line) => line.map((token) => token.text).join("")).join("\n");
    expect(rejoined).toBe(codeBlock!.text);
  });

  it("tokenizes the JSON code-block text from the canvas JSON without dropping characters", () => {
    const codeBlock = v2FlowElementsDocument.objects.find((object) => object.id === "json-code-block");
    expect(codeBlock?.text).toBeDefined();
    const lines = tokenizeCodeBlock(codeBlock!.text, codeBlock!.language);
    const rejoined = lines.map((line) => line.map((token) => token.text).join("")).join("\n");
    expect(rejoined).toBe(codeBlock!.text);
  });

  it("colors the canvas JSON's python class/def line as expected", () => {
    const tokens = tokenizeCodeLine("class Agent(BaseModel):", "python");
    expect(tokens.some((token) => token.text === "class")).toBe(true);
    expect(tokens.some((token) => token.text === "Agent")).toBe(true);
  });
});
