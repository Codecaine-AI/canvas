/// <reference types="bun" />

import { describe, expect, it } from "bun:test";
import type {
  CanvasAnnotationTarget,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas";

import { scopeForNotes, scopeForWholeBoard } from "../scope";

function object(
  id: string,
  type: InteractiveCanvasObject["type"] = "process",
  parentId: string | null = null,
): InteractiveCanvasObject {
  return {
    id,
    type,
    text: id,
    parentId,
    geometry: { x: 0, y: 0, width: 100, height: 80 },
  };
}

function note(target: CanvasAnnotationTarget): { target: CanvasAnnotationTarget } {
  return { target };
}

const document: InteractiveCanvasDocument = {
  schemaVersion: 1,
  id: "scope",
  mode: "diagram",
  objects: [
    object("outer", "section"),
    object("inner", "section", "outer"),
    object("deep-card", "process", "inner"),
    object("outer-card", "process", "outer"),
    object("other-section", "section"),
    object("other-card", "process", "other-section"),
    object("orphan"),
  ],
  connections: [],
};

describe("scopeForNotes", () => {
  it("walks nested parentId chains to the enclosing top-level section", () => {
    expect(scopeForNotes(document, [
      note({ kind: "object", objectId: "deep-card" }),
      note({ kind: "object", objectId: "outer-card" }),
      note({ kind: "object", objectId: "other-card" }),
    ])).toEqual({ scopeObjectIds: ["outer", "other-section"] });
  });

  it("keeps section pins at that section and orphan pins at the object", () => {
    expect(scopeForNotes(document, [
      note({ kind: "object", objectId: "inner" }),
      note({ kind: "object", objectId: "orphan" }),
    ])).toEqual({ scopeObjectIds: ["inner", "orphan"] });
  });

  it("deduplicates contributions and ignores non-object targets", () => {
    expect(scopeForNotes(document, [
      note({ kind: "object", objectId: "deep-card" }),
      note({ kind: "object", objectId: "outer-card" }),
      note({ kind: "region", region: { x: 0, y: 0, width: 10, height: 10 } }),
      note({ kind: "connection", connectionId: "missing" }),
      note({ kind: "object", objectId: "missing" }),
    ])).toEqual({ scopeObjectIds: ["outer"] });
  });
});

describe("scopeForWholeBoard", () => {
  it("returns every top-level section and orphan object, not their members", () => {
    expect(scopeForWholeBoard(document)).toEqual({
      scopeObjectIds: ["outer", "other-section", "orphan"],
    });
  });
});
