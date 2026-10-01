/**
 * The object `detail` line and the section header `icon` (schematic theme
 * contract §1) at the two places a field can be silently lost:
 *
 *  - the load boundary — validateInteractiveCanvasDocument re-builds every
 *    object field by field, so a field missing from that whitelist is eaten
 *    on every load no matter what the type declares;
 *  - the reducer write paths — human updateObject / addObject / shape-swap
 *    and the agent patch path, which must agree on what "cleared" means.
 */
import { describe, expect, it } from "bun:test";

import {
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
  type InteractiveCanvasState,
} from "../actions";
import { validateInteractiveCanvasDocument, type InteractiveCanvasObject } from "../schema";

const GEOMETRY = { x: 0, y: 0, width: 160, height: 96 };

function load(objects: Record<string, unknown>[]) {
  return validateInteractiveCanvasDocument({
    schemaVersion: 1,
    id: "detail-doc",
    mode: "diagram",
    objects,
    connections: [],
  });
}

function loadOne(object: Record<string, unknown>) {
  const result = load([{ id: "o", geometry: GEOMETRY, ...object }]);
  if (!result.ok) throw new Error(`document unexpectedly rejected: ${JSON.stringify(result.issues)}`);
  return { object: result.document.objects[0]!, warnings: result.warnings ?? [] };
}

describe("schema — object detail", () => {
  it.each([
    ["process", { type: "process", text: "API" }],
    ["icon", { type: "icon", text: "Store", icon: "memory" }],
    ["section", { type: "section", text: "Backend" }],
  ])("survives the object whitelist re-builder on a %s (trimmed)", (_kind, object) => {
    const { object: loaded, warnings } = loadOne({ ...object, detail: "  :8080  " });
    expect(loaded.detail).toBe(":8080");
    expect(warnings).toEqual([]);
  });

  it("omits an empty or whitespace-only detail instead of storing it", () => {
    for (const detail of ["", "   ", "\n"]) {
      const { object, warnings } = loadOne({ type: "process", text: "API", detail });
      expect("detail" in object).toBe(false);
      expect(warnings).toEqual([]);
    }
  });

  it("drops a detail on a sticky, warning only when it had content", () => {
    const withContent = loadOne({ type: "sticky", text: "note", detail: "port 80" });
    expect("detail" in withContent.object).toBe(false);
    expect(withContent.warnings.map((warning) => warning.path)).toEqual(["$.objects[0].detail"]);

    expect(loadOne({ type: "sticky", text: "note", detail: "" }).warnings).toEqual([]);
  });

  it("drops a non-string detail with a warning and keeps the document", () => {
    const { object, warnings } = loadOne({ type: "process", text: "API", detail: 8080 });
    expect("detail" in object).toBe(false);
    expect(warnings.map((warning) => warning.path)).toEqual(["$.objects[0].detail"]);
  });
});

describe("schema — section header icon", () => {
  it("keeps a known glyph on a section", () => {
    const { object, warnings } = loadOne({ type: "section", text: "Data", icon: "memory" });
    expect(object.icon).toBe("memory");
    expect(warnings).toEqual([]);
  });

  it("drops an unknown glyph on a section with a warning (the section still loads)", () => {
    const { object, warnings } = loadOne({ type: "section", text: "Data", icon: "not-a-glyph" });
    expect(object.icon).toBeUndefined();
    expect(warnings.map((warning) => warning.path)).toEqual(["$.objects[0].icon"]);
  });

  it("still rejects an icon object whose glyph is unknown", () => {
    const result = load([{ id: "o", type: "icon", text: "?", icon: "not-a-glyph", geometry: GEOMETRY }]);
    expect(result.ok).toBe(false);
  });
});

function stateWith(objects: InteractiveCanvasObject[]): InteractiveCanvasState {
  return createInteractiveCanvasState({
    schemaVersion: 1,
    id: "detail-actions",
    mode: "diagram",
    objects,
    connections: [],
  });
}

function objectById(state: InteractiveCanvasState, id: string): InteractiveCanvasObject {
  const object = state.document.objects.find((candidate) => candidate.id === id);
  if (!object) throw new Error(`missing object ${id}`);
  return object;
}

describe("actions — detail write paths", () => {
  const base: InteractiveCanvasObject = { id: "api", type: "process", text: "API", geometry: GEOMETRY };

  it("canvas.updateObject sets a detail, and an empty or undefined patch clears the key", () => {
    let state = stateWith([base]);
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObject",
      objectId: "api",
      patch: { detail: "Bun · :8080" },
    });
    expect(objectById(state, "api").detail).toBe("Bun · :8080");

    for (const detail of ["", "  ", undefined]) {
      const cleared = reduceInteractiveCanvasState(state, {
        type: "canvas.updateObject",
        objectId: "api",
        patch: { detail },
      });
      expect("detail" in objectById(cleared, "api")).toBe(false);
    }
  });

  it("the agent patch path follows the same rule for updateObject and addObject", () => {
    const state = reduceInteractiveCanvasState(stateWith([{ ...base, detail: "old" }]), {
      type: "canvas.applyAgentPatch",
      operations: [
        { type: "updateObject", objectId: "api", patch: { detail: "" } },
        {
          type: "addObject",
          object: { id: "db", type: "process", text: "DB", detail: "postgres 16", geometry: GEOMETRY },
        },
        {
          type: "addObject",
          object: { id: "cache", type: "process", text: "Cache", detail: " ", geometry: GEOMETRY },
        },
        {
          type: "addObject",
          object: { id: "note", type: "sticky", text: "hi", detail: "nope", geometry: GEOMETRY },
        },
      ],
    });
    expect("detail" in objectById(state, "api")).toBe(false);
    expect(objectById(state, "db").detail).toBe("postgres 16");
    expect("detail" in objectById(state, "cache")).toBe(false);
    expect("detail" in objectById(state, "note")).toBe(false);
  });

  it("canvas.addObject seeds a trimmed detail and a section icon; stickies take no detail", () => {
    let state = stateWith([]);
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.addObject",
      objectType: "section",
      text: "Data",
      detail: " us-east-1 ",
      icon: "memory",
    });
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.addObject",
      objectType: "sticky",
      detail: "ignored",
    });
    const [section, sticky] = state.document.objects;
    expect(section).toMatchObject({ type: "section", detail: "us-east-1", icon: "memory" });
    expect(sticky?.type).toBe("sticky");
    expect("detail" in sticky!).toBe(false);
  });

  it("shape-swap carries the detail between shapes and drops it on a sticky", () => {
    let state = stateWith([{ ...base, detail: ":8080" }]);
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.setObjectType",
      objectId: "api",
      objectType: "ellipse",
    });
    expect(objectById(state, "api").detail).toBe(":8080");
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.setObjectType",
      objectId: "api",
      objectType: "sticky",
    });
    expect("detail" in objectById(state, "api")).toBe(false);
  });

  it("canvas.updateObject sets and clears a section's header icon", () => {
    const section: InteractiveCanvasObject = {
      id: "sec",
      type: "section",
      text: "Data",
      geometry: { x: 0, y: 0, width: 480, height: 360 },
    };
    let state = reduceInteractiveCanvasState(stateWith([section]), {
      type: "canvas.updateObject",
      objectId: "sec",
      patch: { icon: "server" },
    });
    expect(objectById(state, "sec").icon).toBe("server");
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObject",
      objectId: "sec",
      patch: { icon: undefined },
    });
    expect(objectById(state, "sec").icon).toBeUndefined();
  });
});
