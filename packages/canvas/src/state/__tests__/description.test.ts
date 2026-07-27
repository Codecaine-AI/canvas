import { describe, expect, it } from "bun:test";
import { createInteractiveCanvasState, reduceInteractiveCanvasState } from "../actions";
import type { InteractiveCanvasDocument } from "../schema";
import { validateInteractiveCanvasDocument } from "../schema";

function makeDocument(description?: string): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "description-test",
    description,
    mode: "diagram",
    objects: [],
    connections: [],
  };
}

describe("interactive canvas description", () => {
  it("keeps string descriptions during validation", () => {
    const result = validateInteractiveCanvasDocument({
      ...makeDocument(),
      description: "# System map\n\nRequests flow through the gateway.",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.description).toBe(
        "# System map\n\nRequests flow through the gateway.",
      );
    }
  });

  it("drops non-string descriptions without a warning", () => {
    const result = validateInteractiveCanvasDocument({
      ...makeDocument(),
      description: { markdown: "# System map" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.description).toBeUndefined();
      expect(result.warnings).toBeUndefined();
    }
  });

  it("leaves an absent description absent during validation", () => {
    const { description: _description, ...document } = makeDocument();
    const result = validateInteractiveCanvasDocument(document);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.description).toBeUndefined();
    }
  });

  it("sets a trimmed description as one human history entry", () => {
    const state = createInteractiveCanvasState(makeDocument());
    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.setDocumentDescription",
      description: "  # System map  ",
    });

    expect(next.document.description).toBe("# System map");
    expect(next.history.past).toEqual([state.document]);
    expect(next.lastChange).toEqual({
      source: "human",
      summary: "Updated description",
      changedObjectIds: [],
      changedConnectionIds: [],
      changedAnnotationIds: [],
    });
  });

  it("clears the description when the replacement trims to empty", () => {
    const state = createInteractiveCanvasState(makeDocument("# System map"));
    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.setDocumentDescription",
      description: " \n ",
    });

    expect(next.document.description).toBeUndefined();
    expect(next.history.past).toEqual([state.document]);
  });

  it("returns the same state when the stored description already matches", () => {
    const state = createInteractiveCanvasState(makeDocument("# System map"));
    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.setDocumentDescription",
      description: "  # System map  ",
    });

    expect(next).toBe(state);
  });

  it("applies an agent description patch without changed entity ids", () => {
    const state = createInteractiveCanvasState(makeDocument());
    const description = "# System map\n\nRequests flow clockwise.\n";
    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.applyAgentPatch",
      operations: [{ type: "updateDescription", description }],
    });

    expect(next.document.description).toBe(description);
    expect(next.history.past).toEqual([state.document]);
    expect(next.lastChange).toEqual({
      source: "agent",
      summary: "Agent edit",
      changedObjectIds: [],
      changedConnectionIds: [],
      changedAnnotationIds: [],
    });
  });
});
