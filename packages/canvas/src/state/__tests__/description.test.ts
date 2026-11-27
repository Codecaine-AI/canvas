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

    // A non-string description is dropped without a warning.
    const nonString = validateInteractiveCanvasDocument({
      ...makeDocument(),
      description: { markdown: "# System map" },
    });
    expect(nonString.ok).toBe(true);
    if (nonString.ok) {
      expect(nonString.document.description).toBeUndefined();
      expect(nonString.warnings).toBeUndefined();
    }

    // An absent description stays absent.
    const { description: _description, ...withoutKey } = makeDocument();
    const absent = validateInteractiveCanvasDocument(withoutKey);
    expect(absent.ok).toBe(true);
    if (absent.ok) {
      expect(absent.document.description).toBeUndefined();
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

    // A replacement that trims to empty clears the description, still as one entry.
    const stored = createInteractiveCanvasState(makeDocument("# System map"));
    const cleared = reduceInteractiveCanvasState(stored, {
      type: "canvas.setDocumentDescription",
      description: " \n ",
    });
    expect(cleared.document.description).toBeUndefined();
    expect(cleared.history.past).toEqual([stored.document]);
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
