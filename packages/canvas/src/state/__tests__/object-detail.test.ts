/**
 * The stored object `detail` (older boards keep it readable, though it never
 * renders: a node shows its name only) and the section header `icon`
 * (schematic theme contract §1) at the two places a field can be silently
 * lost:
 *
 *  - the load boundary — validateInteractiveCanvasDocument re-builds every
 *    object field by field, so a field missing from that whitelist is eaten
 *    on every load no matter what the type declares;
 *  - the write paths — human update / add / paste / duplicate / shape-swap,
 *    the agent patch path and the session draft: none adds, changes or
 *    copies a detail, and a legacy one rides through every edit untouched.
 */
import { describe, expect, it } from "bun:test";

import {
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
  type InteractiveCanvasState,
} from "../actions";
import { validateInteractiveCanvasDocument, type InteractiveCanvasObject } from "../schema";
import { diffDocuments } from "../../board/doc-diff";
import { applyOperationToDraft } from "../../session/apply-ops";

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

  // A node shows its name only: no write path adds, changes or copies a
  // detail. Each case below failed before the shared write path blocked it.
  const legacy: InteractiveCanvasObject = { ...base, detail: "legacy :8080" };

  it("a Studio update (canvas.updateObject) neither adds, changes nor clears a detail", () => {
    const added = reduceInteractiveCanvasState(stateWith([base]), {
      type: "canvas.updateObject",
      objectId: "api",
      patch: { detail: "new detail" },
    });
    expect("detail" in objectById(added, "api")).toBe(false);

    for (const detail of ["changed", "", undefined]) {
      const edited = reduceInteractiveCanvasState(stateWith([legacy]), {
        type: "canvas.updateObject",
        objectId: "api",
        patch: { detail, text: "API v2" },
      });
      expect(objectById(edited, "api")).toMatchObject({ text: "API v2", detail: "legacy :8080" });
    }
  });

  it("an agent patch updateObject neither adds, changes nor clears a detail", () => {
    const state = reduceInteractiveCanvasState(stateWith([base, { ...legacy, id: "db", text: "DB" }]), {
      type: "canvas.applyAgentPatch",
      operations: [
        { type: "updateObject", objectId: "api", patch: { detail: "new agent detail" } },
        { type: "updateObject", objectId: "db", patch: { detail: "changed", text: "DB v2" } },
      ],
    });
    expect("detail" in objectById(state, "api")).toBe(false);
    expect(objectById(state, "db")).toMatchObject({ text: "DB v2", detail: "legacy :8080" });
  });

  it("an agent patch addObject creates the node without its detail", () => {
    const state = reduceInteractiveCanvasState(stateWith([]), {
      type: "canvas.applyAgentPatch",
      operations: [
        { type: "addObject", object: { ...base, detail: "agent-created detail" } },
        { type: "addObject", object: { id: "note", type: "sticky", text: "hi", detail: "nope", geometry: GEOMETRY } },
      ],
    });
    expect(objectById(state, "api").text).toBe("API");
    expect("detail" in objectById(state, "api")).toBe(false);
    expect("detail" in objectById(state, "note")).toBe(false);
  });

  it("a session draft addObject and updateObject write no detail", () => {
    const empty = stateWith([]).document;
    const added = applyOperationToDraft(empty, { type: "addObject", object: { ...base, detail: "draft detail" } });
    expect("detail" in added.document.objects[0]!).toBe(false);
    const updated = applyOperationToDraft(stateWith([legacy]).document, {
      type: "updateObject",
      objectId: "api",
      patch: { detail: "changed" },
    });
    expect(updated.document.objects[0]!.detail).toBe("legacy :8080");
  });

  it("a paste (canvas.addObjects) drops the pasted detail", () => {
    const state = reduceInteractiveCanvasState(stateWith([]), {
      type: "canvas.addObjects",
      objects: [{ ...base, detail: "pasted detail" }],
    });
    expect(objectById(state, "api").text).toBe("API");
    expect("detail" in objectById(state, "api")).toBe(false);
  });

  it("a duplicate copies the node without its detail and leaves the original's", () => {
    let state = stateWith([legacy]);
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.select",
      selection: { kind: "objects", objectIds: ["api"] },
    });
    state = reduceInteractiveCanvasState(state, { type: "canvas.duplicateSelection" });
    const [original, copy] = state.document.objects;
    expect(original!.detail).toBe("legacy :8080");
    expect(copy!.id).not.toBe("api");
    expect(copy!.text).toBe("API");
    expect("detail" in copy!).toBe(false);
  });

  it("a legacy detail round-trips byte-for-byte through unrelated edits and the file save path", () => {
    const loaded = load([
      { id: "api", type: "process", text: "API", detail: "legacy :8080", geometry: GEOMETRY },
      { id: "sec", type: "section", text: "Backend", detail: "old header", geometry: { x: 0, y: 200, width: 400, height: 300 } },
    ]);
    if (!loaded.ok) throw new Error("legacy board rejected");
    const onDisk = loaded.document;

    // Human edits: a move, a rename, a color pick, a shape swap.
    let state = createInteractiveCanvasState(onDisk);
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObject",
      objectId: "api",
      patch: { geometry: { ...GEOMETRY, x: 40 }, text: "API v2", color: "blue" },
    });
    state = reduceInteractiveCanvasState(state, { type: "canvas.setObjectType", objectId: "api", objectType: "ellipse" });
    state = reduceInteractiveCanvasState(state, { type: "canvas.updateObject", objectId: "sec", patch: { text: "Server" } });
    expect(objectById(state, "api").detail).toBe("legacy :8080");
    expect(objectById(state, "sec").detail).toBe("old header");

    // The toolkit save: diff the draft against disk, replay it as an agent
    // patch, validate, serialize, and load again — what persistCanvasFile does.
    const replayed = reduceInteractiveCanvasState(createInteractiveCanvasState(onDisk), {
      type: "canvas.applyAgentPatch",
      operations: diffDocuments(onDisk, state.document),
    }).document;
    const saved = validateInteractiveCanvasDocument(JSON.parse(JSON.stringify(replayed)));
    if (!saved.ok) throw new Error("saved board rejected");
    const find = (doc: typeof onDisk, id: string) => doc.objects.find((object) => object.id === id)!;
    expect(find(saved.document, "api").detail).toBe("legacy :8080");
    // The untouched-but-renamed section keeps its exact key set and order.
    expect(Object.keys(find(saved.document, "sec"))).toEqual(Object.keys(find(onDisk, "sec")));
    expect(find(saved.document, "sec").detail).toBe("old header");
  });

  it("canvas.addObject seeds a section icon, and no new object carries a detail", () => {
    let state = stateWith([]);
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.addObject",
      objectType: "section",
      text: "Data",
      icon: "memory",
    });
    state = reduceInteractiveCanvasState(state, { type: "canvas.addObject", objectType: "process", text: "API" });
    const [section, shape] = state.document.objects;
    expect(section).toMatchObject({ type: "section", icon: "memory" });
    expect("detail" in section!).toBe(false);
    expect("detail" in shape!).toBe(false);
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
