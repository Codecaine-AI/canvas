import { describe, expect, it } from "bun:test";
import { createInteractiveCanvasState, reduceInteractiveCanvasState } from "../actions";
import type { InteractiveCanvasDocument } from "../schema";

function makeState() {
  const document: InteractiveCanvasDocument = {
    schemaVersion: 1,
    id: "annotation-test",
    mode: "diagram",
    objects: [],
    connections: [],
    annotations: [
      {
        id: "note-1",
        target: { kind: "region", region: { x: 0, y: 0, width: 96, height: 64 } },
        intent: "agent-request",
        body: "Move this area",
        status: "open",
        createdBy: "human",
      },
    ],
  };
  return createInteractiveCanvasState(document);
}

describe("canvas.removeAnnotation", () => {
  it("removes an annotation in one undoable history entry", () => {
    const state = makeState();
    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.removeAnnotation",
      annotationId: "note-1",
    });

    expect(next.document.annotations).toEqual([]);
    expect(next.history.past).toHaveLength(state.history.past.length + 1);
    expect(next.lastChange?.summary).toBe("Removed note");
    expect(next.lastChange?.changedAnnotationIds).toEqual(["note-1"]);

    const undone = reduceInteractiveCanvasState(next, { type: "canvas.undo" });
    expect(undone.document.annotations).toEqual(state.document.annotations);
  });

  it("returns state unchanged when the annotation does not exist", () => {
    const state = makeState();
    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.removeAnnotation",
      annotationId: "missing-note",
    });

    expect(next).toBe(state);
    expect(next.history.past).toHaveLength(0);
  });

  it("clears selection when removing the selected annotation", () => {
    let state = makeState();
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.select",
      selection: { kind: "annotation", annotationId: "note-1" },
    });

    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.removeAnnotation",
      annotationId: "note-1",
    });

    expect(next.selection).toEqual({ kind: "none" });
  });
});
