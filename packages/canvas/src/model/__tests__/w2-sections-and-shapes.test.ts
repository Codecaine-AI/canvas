import { describe, expect, it } from "bun:test";
import {
  IDLE_INTERACTION_STATE,
  cancelInteraction,
  stepInteraction,
  type CanvasPointerEvent,
  type InteractionContext,
  type InteractionState,
} from "../../interaction/interaction";
import { sectionCaptureMembers } from "../geometry";
import { renderOrderedObjects } from "../../render/CanvasStage";
import { SECTION_CAPTURE_OVERLAP_THRESHOLD } from "../../render/figjam-tokens";
import { tokenizeCodeBlock, tokenizeCodeLine } from "../../render/code-tokenizer";
import { v2FlowElementsCanvas } from "../../fixtures/v2-flow-elements";
import { validateInteractiveCanvasDocument } from "../schema";
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../schema";

function makeObject(overrides: Partial<InteractiveCanvasObject> & { id: string }): InteractiveCanvasObject {
  return {
    type: "process",
    label: overrides.id,
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
  it("validates the v2-flow-elements fixture end to end", () => {
    const validation = validateInteractiveCanvasDocument(v2FlowElementsCanvas);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const types = new Set(validation.document.objects.map((object) => object.type));
    expect(types.has("section")).toBe(true);
    expect(types.has("pill")).toBe(true);
    expect(types.has("arrow-shape")).toBe(true);
    expect(types.has("predefined-process")).toBe(true);
    expect(types.has("code-block")).toBe(true);
    expect(types.has("chip-icon")).toBe(true);
    expect(validation.warnings).toBeUndefined();
  });

  it("preserves each new type's dedicated props through validation", () => {
    const validation = validateInteractiveCanvasDocument(v2FlowElementsCanvas);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const byId = new Map(validation.document.objects.map((object) => [object.id, object]));

    expect(byId.get("outer-section")?.title).toBe("Memory pipeline");
    expect(byId.get("outer-section")?.tint).toBe("gray");
    expect(byId.get("inner-section")?.tint).toBe("blue");
    expect(byId.get("outside-arrow")?.direction).toBe("right");
    expect(byId.get("outside-arrow-left")?.direction).toBe("left");
    expect(byId.get("captured-code-block")?.language).toBe("python");
    expect(byId.get("json-code-block")?.language).toBe("json");
    expect(byId.get("partial-overlap-note")?.author).toBe("Ford");
  });

  it("rejects a section with no title as a hard validation error", () => {
    const document = makeDocument([
      { ...makeObject({ id: "s1" }), type: "section", tint: "gray", title: "" } as InteractiveCanvasObject,
    ]);
    const validation = validateInteractiveCanvasDocument(document);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.issues.map((issue) => issue.message).join(" ")).toContain("title");
  });

  it("rejects a section with an unknown tint family as a hard validation error", () => {
    const document = makeDocument([
      {
        ...makeObject({ id: "s1" }),
        type: "section",
        title: "Untitled",
        tint: "chartreuse",
      } as unknown as InteractiveCanvasObject,
    ]);
    const validation = validateInteractiveCanvasDocument(document);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.issues.map((issue) => issue.message).join(" ")).toContain("tint");
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

  // W4 — explicit fill/stroke/strokeWidth on CanvasObjectStyle.
  it("preserves valid style.fill/stroke/strokeWidth through validation", () => {
    const document = makeDocument([
      makeObject({
        id: "styled",
        style: { shape: "pill", fill: "#FFFFFF", stroke: "#757575", strokeWidth: 8 },
      }),
    ]);
    const validation = validateInteractiveCanvasDocument(document);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.warnings).toBeUndefined();
    const style = validation.document.objects[0]?.style;
    expect(style?.fill).toBe("#FFFFFF");
    expect(style?.stroke).toBe("#757575");
    expect(style?.strokeWidth).toBe(8);
  });

  it("drops invalid style.fill/stroke/strokeWidth with warnings, not hard errors", () => {
    const document = makeDocument([
      makeObject({
        id: "badly-styled",
        style: {
          shape: "pill",
          fill: "",
          stroke: 42,
          strokeWidth: -3,
        } as unknown as InteractiveCanvasObject["style"],
      }),
    ]);
    const validation = validateInteractiveCanvasDocument(document);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const warningPaths = (validation.warnings ?? []).map((warning) => warning.path).join(" ");
    expect(warningPaths).toContain("style.fill");
    expect(warningPaths).toContain("style.stroke");
    expect(warningPaths).toContain("style.strokeWidth");
    const style = validation.document.objects[0]?.style;
    expect(style?.fill).toBeUndefined();
    expect(style?.stroke).toBeUndefined();
    expect(style?.strokeWidth).toBeUndefined();
  });
});

describe("geometry: sectionCaptureMembers (drag-start capture math)", () => {
  it("captures an object fully inside a section", () => {
    const document = makeDocument([
      { ...makeObject({ id: "section-a" }), type: "section", title: "A", tint: "gray", geometry: { x: 0, y: 0, width: 400, height: 400 } },
      makeObject({ id: "inside", geometry: { x: 50, y: 50, width: 100, height: 100 } }),
    ]);
    const members = sectionCaptureMembers(document, "section-a", SECTION_CAPTURE_OVERLAP_THRESHOLD);
    expect(members.has("inside")).toBe(true);
  });

  it("does not capture an object overlapping just under the 0.6 threshold", () => {
    const document = makeDocument([
      { ...makeObject({ id: "section-a" }), type: "section", title: "A", tint: "gray", geometry: { x: 0, y: 0, width: 100, height: 100 } },
      // 100x100 object positioned so only ~50% overlaps the section (under threshold).
      makeObject({ id: "half-in", geometry: { x: 50, y: 0, width: 100, height: 100 } }),
    ]);
    const members = sectionCaptureMembers(document, "section-a", SECTION_CAPTURE_OVERLAP_THRESHOLD);
    expect(members.has("half-in")).toBe(false);
  });

  it("captures an object right at/above the 0.6 threshold", () => {
    const document = makeDocument([
      { ...makeObject({ id: "section-a" }), type: "section", title: "A", tint: "gray", geometry: { x: 0, y: 0, width: 100, height: 100 } },
      // 100x100 object with 65% overlap (65 of its own width inside the section).
      makeObject({ id: "mostly-in", geometry: { x: 35, y: 0, width: 100, height: 100 } }),
    ]);
    const members = sectionCaptureMembers(document, "section-a", SECTION_CAPTURE_OVERLAP_THRESHOLD);
    expect(members.has("mostly-in")).toBe(true);
  });

  it("recursively captures a nested section's own members", () => {
    const document = makeDocument([
      { ...makeObject({ id: "outer" }), type: "section", title: "Outer", tint: "gray", geometry: { x: 0, y: 0, width: 600, height: 600 } },
      { ...makeObject({ id: "inner" }), type: "section", title: "Inner", tint: "blue", geometry: { x: 50, y: 50, width: 300, height: 300 } },
      makeObject({ id: "grandchild", geometry: { x: 80, y: 80, width: 100, height: 100 } }),
    ]);
    const members = sectionCaptureMembers(document, "outer", SECTION_CAPTURE_OVERLAP_THRESHOLD);
    expect(members.has("inner")).toBe(true);
    expect(members.has("grandchild")).toBe(true);
  });

  it("captures every object and nested section from the v2-flow-elements fixture when dragging outer-section", () => {
    const members = sectionCaptureMembers(
      v2FlowElementsCanvas,
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

describe("interaction: dragging a section carries its captured members", () => {
  it("moves the section and every captured member together, with one history entry", () => {
    const document = makeDocument([
      { ...makeObject({ id: "section-a" }), type: "section", title: "A", tint: "gray", geometry: { x: 0, y: 0, width: 300, height: 300 } },
      makeObject({ id: "member-a", geometry: { x: 40, y: 40, width: 60, height: 60 } }),
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
    // dx = 20, dy = 20 for both the section and its captured member.
    expect(geometryActions[0]!.geometries["section-a"]).toEqual({ x: 20, y: 20, width: 300, height: 300 });
    expect(geometryActions[0]!.geometries["member-a"]).toEqual({ x: 60, y: 60, width: 60, height: 60 });
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

  it("restores the section and all captured members on Escape", () => {
    const document = makeDocument([
      { ...makeObject({ id: "section-a" }), type: "section", title: "A", tint: "gray", geometry: { x: 0, y: 0, width: 300, height: 300 } },
      makeObject({ id: "member-a", geometry: { x: 40, y: 40, width: 60, height: 60 } }),
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
      { ...makeObject({ id: "outer" }), type: "section", title: "Outer", tint: "gray", geometry: { x: 0, y: 0, width: 600, height: 600 } },
      { ...makeObject({ id: "inner" }), type: "section", title: "Inner", tint: "blue", geometry: { x: 50, y: 50, width: 300, height: 300 } },
      makeObject({ id: "grandchild", geometry: { x: 80, y: 80, width: 100, height: 100 } }),
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
      { ...makeObject({ id: "section-a" }), type: "section", title: "A", tint: "gray" },
      { ...makeObject({ id: "shape-b" }), type: "process" },
    ];
    const ordered = renderOrderedObjects(objects);
    const sectionIndex = ordered.findIndex((object) => object.id === "section-a");
    const shapeAIndex = ordered.findIndex((object) => object.id === "shape-a");
    const shapeBIndex = ordered.findIndex((object) => object.id === "shape-b");
    expect(sectionIndex).toBeLessThan(shapeAIndex);
    expect(sectionIndex).toBeLessThan(shapeBIndex);
  });

  it("renders a nested section above its geometric parent section", () => {
    const objects: InteractiveCanvasObject[] = [
      { ...makeObject({ id: "inner" }), type: "section", title: "Inner", tint: "blue", geometry: { x: 50, y: 50, width: 100, height: 100 } },
      { ...makeObject({ id: "outer" }), type: "section", title: "Outer", tint: "gray", geometry: { x: 0, y: 0, width: 400, height: 400 } },
    ];
    const ordered = renderOrderedObjects(objects);
    const outerIndex = ordered.findIndex((object) => object.id === "outer");
    const innerIndex = ordered.findIndex((object) => object.id === "inner");
    expect(outerIndex).toBeLessThan(innerIndex);
  });

  it("preserves schema order for non-sections and sibling sections (stable sort)", () => {
    const objects: InteractiveCanvasObject[] = [
      { ...makeObject({ id: "shape-a" }), type: "process" },
      { ...makeObject({ id: "shape-b" }), type: "process" },
    ];
    expect(renderOrderedObjects(objects).map((object) => object.id)).toEqual(["shape-a", "shape-b"]);
  });

  it("returns the original array reference-order unchanged when there are no sections", () => {
    const objects: InteractiveCanvasObject[] = [makeObject({ id: "only" })];
    expect(renderOrderedObjects(objects)).toEqual(objects);
  });
});

describe("code-tokenizer: tokenizeCodeBlock integration with the fixture bodies", () => {
  it("tokenizes the python code-block body from the fixture without dropping characters", () => {
    const codeBlock = v2FlowElementsCanvas.objects.find((object) => object.id === "captured-code-block");
    expect(codeBlock?.body).toBeDefined();
    const lines = tokenizeCodeBlock(codeBlock!.body!, codeBlock!.language);
    const rejoined = lines.map((line) => line.map((token) => token.text).join("")).join("\n");
    expect(rejoined).toBe(codeBlock!.body);
  });

  it("tokenizes the JSON code-block body from the fixture without dropping characters", () => {
    const codeBlock = v2FlowElementsCanvas.objects.find((object) => object.id === "json-code-block");
    expect(codeBlock?.body).toBeDefined();
    const lines = tokenizeCodeBlock(codeBlock!.body!, codeBlock!.language);
    const rejoined = lines.map((line) => line.map((token) => token.text).join("")).join("\n");
    expect(rejoined).toBe(codeBlock!.body);
  });

  it("colors the fixture's python class/def line as expected", () => {
    const tokens = tokenizeCodeLine("class Agent(BaseModel):", "python");
    expect(tokens.some((token) => token.text === "class")).toBe(true);
    expect(tokens.some((token) => token.text === "Agent")).toBe(true);
  });
});
