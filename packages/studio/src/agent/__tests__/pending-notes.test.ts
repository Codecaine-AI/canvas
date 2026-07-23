/// <reference types="bun" />

import { describe, expect, it } from "bun:test";
import type {
  CanvasSelection,
  InteractiveCanvasAnnotation,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas";

import { pendingNotes, targetLabelForSelection } from "../pending-notes";

function object(
  id: string,
  type: InteractiveCanvasObject["type"],
  text: string,
): InteractiveCanvasObject {
  return {
    id,
    type,
    text,
    parentId: null,
    geometry: { x: 0, y: 0, width: 100, height: 80 },
  };
}

function annotation(
  id: string,
  objectId: string,
  overrides: Partial<InteractiveCanvasAnnotation> = {},
): InteractiveCanvasAnnotation {
  return {
    id,
    body: `Body for ${id}`,
    target: { kind: "object", objectId },
    intent: "agent-request",
    status: "open",
    createdBy: "human",
    ...overrides,
  };
}

const document: InteractiveCanvasDocument = {
  schemaVersion: 1,
  id: "pending-notes",
  mode: "diagram",
  objects: [
    object("card", "process", "Token card"),
    object("section", "section", "Billing"),
    object("empty", "database", "  "),
  ],
  connections: [],
  annotations: [
    annotation("open-card", "card"),
    annotation("open-section", "section"),
    annotation("empty-text", "empty"),
    annotation("ordinary-note", "card", { intent: "note" }),
    annotation("resolved", "card", { status: "resolved" }),
    annotation("applied", "card", { status: "applied" }),
  ],
};

describe("pendingNotes", () => {
  it("returns only open agent requests in document order", () => {
    expect(pendingNotes(document).map(({ id }) => id)).toEqual([
      "open-card",
      "open-section",
      "empty-text",
    ]);
  });

  it("labels objects by text, sections by name, and empty objects by type", () => {
    expect(pendingNotes(document)).toEqual([
      {
        id: "open-card",
        body: "Body for open-card",
        target: { kind: "object", objectId: "card" },
        targetLabel: "Token card",
      },
      {
        id: "open-section",
        body: "Body for open-section",
        target: { kind: "object", objectId: "section" },
        targetLabel: 'Section "Billing"',
      },
      {
        id: "empty-text",
        body: "Body for empty-text",
        target: { kind: "object", objectId: "empty" },
        targetLabel: "Database",
      },
    ]);
  });

  it("handles documents without annotations", () => {
    expect(pendingNotes({ ...document, annotations: undefined })).toEqual([]);
  });
});

describe("targetLabelForSelection", () => {
  it("labels the selected object using the annotation target labels", () => {
    expect(
      targetLabelForSelection(document, { kind: "objects", objectIds: ["card"] }),
    ).toBe("Token card");
    expect(
      targetLabelForSelection(document, { kind: "objects", objectIds: ["section"] }),
    ).toBe('Section "Billing"');
    expect(
      targetLabelForSelection(document, { kind: "objects", objectIds: ["empty"] }),
    ).toBe("Database");
  });

  it.each([
    { kind: "none" },
    { kind: "objects", objectIds: [] },
    { kind: "objects", objectIds: ["missing"] },
    { kind: "connection", connectionId: "missing" },
  ] satisfies CanvasSelection[])("has no object target for %o", (selection) => {
    expect(targetLabelForSelection(document, selection)).toBeNull();
  });
});
