/**
 * The model-facing operation grammar: entity-kind steering, schema-owned
 * shape constraints, lowering through the operation seam, classification of
 * the internal six-kind grammar, and target-id coverage for all thirteen
 * mutation kinds.
 */
import { describe, expect, test } from "bun:test";

import { CANVAS_COLORS } from "@codecaine-ai/canvas/schema";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import { diffDocuments } from "../src/board/doc-diff";
import {
  MODEL_OPERATION_KINDS,
  classifyOperation,
  operationTargetId,
  type ModelOperation,
} from "../src/service/session/op-surface";
import {
  addObject,
  addSection,
  addSticky,
  fitSection,
  removeSection,
  type OperationTool,
  updateConnection,
  updateObject,
  updateSection,
  updateSticky,
} from "../src/service/session/operations";
import { makeTestSession, runOp, type OperationToolName } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

interface SchemaNode {
  type?: string;
  enum?: string[];
  pattern?: string;
  required?: string[];
  properties?: Record<string, SchemaNode>;
  additionalProperties?: boolean;
  minProperties?: number;
}

/** One of each entity kind, two sections, an isolated shape, and a connection. */
function referenceDocument(): InteractiveCanvasDocument {
  return makeDocument([
    { ...box("page-frame", 0, 0, 1200, 720, "section"), locked: "background" as const },
    { ...box("home", 64, 64, 480, 320, "section"), text: "Home" },
    { ...box("note", 600, 64, 176, 128, "sticky"), text: "Remember" },
    box("alpha", 96, 128),
    box("beta", 320, 128),
    box("orphan", 960, 64),
  ], [connect("alpha-beta", "alpha", "beta")]);
}

function schemaOf(tool: OperationTool): SchemaNode {
  return tool.parameters as unknown as SchemaNode;
}

function fieldOf(tool: OperationTool, field: string): SchemaNode {
  const schema = schemaOf(tool).properties?.[field];
  if (!schema) throw new Error(`${tool.name} has no ${field} schema`);
  return schema;
}

function nestedField(schema: SchemaNode, field: string): SchemaNode {
  const nested = schema.properties?.[field];
  if (!nested) throw new Error(`schema has no ${field} field`);
  return nested;
}

function stateError(
  tool: OperationToolName,
  params: Record<string, unknown>,
  document: InteractiveCanvasDocument = referenceDocument(),
): string {
  const session = makeTestSession(document, document.objects.map(({ id }) => id));
  const draftBefore = session.draft;
  const result = runOp(session, tool, params);
  expect(result.isError).toBe(true);
  expect(session.draft).toBe(draftBefore);
  expect(session.events).toEqual([]);
  return result.text;
}

function applyModelOperation(
  document: InteractiveCanvasDocument,
  operation: ModelOperation,
) {
  const session = makeTestSession(document, document.objects.map(({ id }) => id));
  let result: ReturnType<typeof runOp>;
  switch (operation.type) {
    case "addSection":
      result = runOp(session, "add_section", { section: operation.section });
      break;
    case "updateSection":
      result = runOp(session, "update_section", {
        sectionId: operation.sectionId,
        patch: operation.patch,
      });
      break;
    case "removeSection":
      result = runOp(session, "remove_section", { sectionId: operation.sectionId });
      break;
    case "fitSection":
      result = runOp(session, "fit_section", { sectionId: operation.sectionId });
      break;
    case "addSticky":
      result = runOp(session, "add_sticky", { sticky: operation.sticky });
      break;
    case "updateSticky":
      result = runOp(session, "update_sticky", {
        stickyId: operation.stickyId,
        patch: operation.patch,
      });
      break;
    case "removeSticky":
      result = runOp(session, "remove_sticky", { stickyId: operation.stickyId });
      break;
    case "addObject":
      result = runOp(session, "add_object", { object: operation.object });
      break;
    case "updateObject":
      result = runOp(session, "update_object", {
        objectId: operation.objectId,
        patch: operation.patch,
      });
      break;
    case "removeObject":
      result = runOp(session, "remove_object", { objectId: operation.objectId });
      break;
    case "addConnection":
      result = runOp(session, "add_connection", { connection: operation.connection });
      break;
    case "updateConnection":
      result = runOp(session, "update_connection", {
        connectionId: operation.connectionId,
        patch: operation.patch,
      });
      break;
    case "removeConnection":
      result = runOp(session, "remove_connection", {
        connectionId: operation.connectionId,
      });
      break;
    default: {
      const unreachable: never = operation;
      throw new Error(`Unknown model operation: ${String(unreachable)}`);
    }
  }
  expect(result.isError).toBeUndefined();
  return {
    result,
    session,
    internal: diffDocuments(document, session.draft),
  };
}

describe("operation state steering", () => {
  test("steers generic object operations off sections and stickies", () => {
    expect(stateError("update_object", {
      objectId: "home",
      patch: { text: "x" },
    })).toBe(
      'ERROR · update_object — objectId "home" is a section — use the section tools '
      + "(add_section, update_section, remove_section, fit_section).",
    );
    expect(stateError("remove_object", { objectId: "home" })).toBe(
      'ERROR · remove_object — objectId "home" is a section — use the section tools '
      + "(add_section, update_section, remove_section, fit_section).",
    );
    expect(stateError("update_object", {
      objectId: "note",
      patch: { text: "x" },
    })).toBe(
      'ERROR · update_object — objectId "note" is a sticky — use the sticky tools '
      + "(add_sticky, update_sticky, remove_sticky).",
    );
    expect(stateError("remove_object", { objectId: "note" })).toBe(
      'ERROR · remove_object — objectId "note" is a sticky — use the sticky tools '
      + "(add_sticky, update_sticky, remove_sticky).",
    );
  });

  test("steers section and sticky operations off the wrong kinds", () => {
    expect(stateError("update_section", {
      sectionId: "alpha",
      patch: { text: "x" },
    })).toBe(
      'ERROR · update_section — sectionId "alpha" is a rectangle — use the object tools '
      + "(add_object, update_object, remove_object).",
    );
    expect(stateError("remove_section", { sectionId: "note" })).toBe(
      'ERROR · remove_section — sectionId "note" is a sticky — use the sticky tools '
      + "(add_sticky, update_sticky, remove_sticky).",
    );
    expect(stateError("update_sticky", {
      stickyId: "home",
      patch: { text: "x" },
    })).toBe(
      'ERROR · update_sticky — stickyId "home" is a section — use the section tools '
      + "(add_section, update_section, remove_section, fit_section).",
    );
    expect(stateError("remove_sticky", { stickyId: "alpha" })).toBe(
      'ERROR · remove_sticky — stickyId "alpha" is a rectangle — use the object tools '
      + "(add_object, update_object, remove_object).",
    );
  });

  test("fit_section accepts only a section on the draft", () => {
    const document = referenceDocument();
    const session = makeTestSession(document, ["home"]);
    const result = runOp(session, "fit_section", { sectionId: "home" });
    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · fit_section home");

    expect(stateError("fit_section", { sectionId: "note" })).toBe(
      'ERROR · fit_section — sectionId "note" is a sticky — use the sticky tools '
      + "(add_sticky, update_sticky, remove_sticky).",
    );
    expect(stateError("fit_section", { sectionId: "alpha" })).toBe(
      'ERROR · fit_section — sectionId "alpha" is a rectangle — use the object tools '
      + "(add_object, update_object, remove_object).",
    );
    expect(stateError("fit_section", { sectionId: "ghost" })).toBe(
      'ERROR · fit_section — sectionId "ghost" is not on the board.',
    );
  });

  test("remove_section keeps at least one section on the board", () => {
    const document = referenceDocument();
    const session = makeTestSession(document, ["page-frame"]);
    const removed = runOp(session, "remove_section", { sectionId: "page-frame" });
    expect(removed.isError).toBeUndefined();
    expect(removed.text).toContain("APPLIED · remove_section page-frame");

    const singleSection = makeDocument([
      { ...box("page-frame", 0, 0, 1200, 720, "section"), text: "Board" },
      box("alpha", 96, 128),
    ]);
    expect(stateError(
      "remove_section",
      { sectionId: "page-frame" },
      singleSection,
    )).toBe(
      'ERROR · remove_section — sectionId "page-frame" is the board\'s only section '
      + "— every board keeps at least one; add its replacement first.",
    );
  });
});

describe("operation schemas", () => {
  test("payload schemas require kind-specific fields and keep object text optional", () => {
    const section = fieldOf(addSection, "section");
    const sticky = fieldOf(addSticky, "sticky");
    const object = fieldOf(addObject, "object");

    expect(section.required).toEqual(["id", "text", "geometry"]);
    expect(sticky.required).toEqual(["id", "text", "geometry"]);
    expect(object.required).toEqual(["id", "type", "geometry"]);
    expect(nestedField(section, "text").type).toBe("string");
    expect(nestedField(sticky, "text").type).toBe("string");
    expect(nestedField(object, "text").type).toBe("string");
    expect(object.required).not.toContain("text");
  });

  test("payload and patch schemas keep entity kinds in their own tools", () => {
    const section = fieldOf(addSection, "section");
    const sticky = fieldOf(addSticky, "sticky");
    const object = fieldOf(addObject, "object");
    const sectionPatch = fieldOf(updateSection, "patch");
    const stickyPatch = fieldOf(updateSticky, "patch");
    const objectType = nestedField(object, "type");
    const objectPatchType = nestedField(fieldOf(updateObject, "patch"), "type");

    expect(section.additionalProperties).toBe(false);
    expect(sticky.additionalProperties).toBe(false);
    expect(section.properties).not.toHaveProperty("type");
    expect(sticky.properties).not.toHaveProperty("type");
    expect(sectionPatch.properties).not.toHaveProperty("type");
    expect(stickyPatch.properties).not.toHaveProperty("type");
    expect(objectType.enum).toContain("decision");
    expect(objectPatchType.enum).toContain("decision");
    for (const type of ["section", "sticky", "banana"]) {
      expect(objectType.enum).not.toContain(type);
      expect(objectPatchType.enum).not.toContain(type);
    }
  });

  test("schemas pin the id grammar and the complete color roster", () => {
    expect(nestedField(fieldOf(addSection, "section"), "id").pattern).toBe(
      "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,96}$",
    );
    expect(schemaOf(fitSection).required).toEqual(["sectionId"]);
    expect(fieldOf(fitSection, "sectionId").pattern).toBe(
      "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,96}$",
    );
    expect(nestedField(fieldOf(addObject, "object"), "color").enum).toEqual(
      [...CANVAS_COLORS],
    );
    expect(nestedField(fieldOf(updateConnection, "patch"), "color").enum).toEqual(
      [...CANVAS_COLORS],
    );
  });

  test("geometry and update schemas require complete, nonempty patches", () => {
    const payloads = [
      fieldOf(addSection, "section"),
      fieldOf(addSticky, "sticky"),
      fieldOf(addObject, "object"),
    ];
    for (const payload of payloads) {
      const geometry = nestedField(payload, "geometry");
      expect(geometry.required).toEqual(["x", "y", "width", "height"]);
      expect(geometry.additionalProperties).toBe(false);
      for (const field of geometry.required!) {
        expect(nestedField(geometry, field).type).toBe("number");
      }
    }

    for (const tool of [updateSection, updateSticky, updateObject, updateConnection]) {
      const patch = fieldOf(tool, "patch");
      expect(patch.minProperties).toBe(1);
      expect(patch.additionalProperties).toBe(false);
      const geometry = patch.properties?.geometry;
      if (geometry) {
        expect(geometry.required).toEqual(["x", "y", "width", "height"]);
      }
    }
  });
});

describe("operation lowering and classification", () => {
  const document = referenceDocument();

  const MODEL_OPS: Record<(typeof MODEL_OPERATION_KINDS)[number], ModelOperation> = {
    addSection: { type: "addSection", section: { id: "s2", text: "New", color: "blue", geometry: { x: 700, y: 400, width: 480, height: 320 } } },
    updateSection: { type: "updateSection", sectionId: "home", patch: { text: "Renamed" } },
    removeSection: { type: "removeSection", sectionId: "home" },
    fitSection: { type: "fitSection", sectionId: "home" },
    addSticky: { type: "addSticky", sticky: { id: "n2", text: "note", geometry: { x: 900, y: 240, width: 176, height: 128 } } },
    updateSticky: { type: "updateSticky", stickyId: "note", patch: { color: "yellow" } },
    removeSticky: { type: "removeSticky", stickyId: "note" },
    addObject: { type: "addObject", object: { id: "gamma", type: "process", text: "Step", geometry: { x: 600, y: 320, width: 184, height: 96 } } },
    updateObject: { type: "updateObject", objectId: "alpha", patch: { color: "blue" } },
    removeObject: { type: "removeObject", objectId: "orphan" },
    addConnection: { type: "addConnection", connection: { id: "e2", from: { objectId: "alpha" }, to: { objectId: "beta" } } },
    updateConnection: { type: "updateConnection", connectionId: "alpha-beta", patch: { label: "next" } },
    removeConnection: { type: "removeConnection", connectionId: "alpha-beta" },
  };

  for (const kind of MODEL_OPERATION_KINDS) {
    if (kind === "fitSection") continue;
    test(`${kind}: the lowered internal operation classifies back to the model-facing form`, () => {
      const model = MODEL_OPS[kind];
      const { internal } = applyModelOperation(document, model);
      expect(internal).toHaveLength(1);
      expect(classifyOperation(internal[0]!, document)).toEqual(model);
    });
  }

  test("fit_section lowers to a plain section geometry patch", () => {
    const { session, internal } = applyModelOperation(document, MODEL_OPS.fitSection);
    const geometry = session.draft.objects.find(({ id }) => id === "home")!.geometry;
    expect(internal).toEqual([{
      type: "updateObject",
      objectId: "home",
      patch: { geometry },
    }]);
    expect(classifyOperation(internal[0]!, document)).toEqual({
      type: "updateSection",
      sectionId: "home",
      patch: { geometry },
    });
  });

  test("lowering carries implied entity kinds onto internal object operations", () => {
    expect(applyModelOperation(document, MODEL_OPS.addSection).internal).toEqual([{
      type: "addObject",
      object: {
        id: "s2",
        text: "New",
        color: "blue",
        geometry: { x: 700, y: 400, width: 480, height: 320 },
        type: "section",
      },
    }]);
    expect(applyModelOperation(document, MODEL_OPS.removeSticky).internal).toEqual([{
      type: "removeObject",
      objectId: "note",
    }]);
  });

  test("classification is total for an unknown update target", () => {
    expect(classifyOperation(
      { type: "updateObject", objectId: "ghost", patch: { text: "x" } },
      document,
    )).toEqual({ type: "updateObject", objectId: "ghost", patch: { text: "x" } });
  });

  test("operationTargetId names the created or targeted id for every kind", () => {
    expect(MODEL_OPERATION_KINDS.map((kind) => operationTargetId(MODEL_OPS[kind]))).toEqual([
      "s2", "home", "home", "home", "n2", "note", "note",
      "gamma", "alpha", "orphan", "e2", "alpha-beta", "alpha-beta",
    ]);
  });
});
