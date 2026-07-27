import { describe, expect, it } from "bun:test";
import { createInteractiveCanvasState, reduceInteractiveCanvasState } from "../actions";
import {
  validateInteractiveCanvasDocument,
  type InteractiveCanvasDocument,
} from "../schema";

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
        replies: [],
      },
    ],
  };
  return createInteractiveCanvasState(document);
}

function annotationDocument(annotation: Record<string, unknown>) {
  return {
    schemaVersion: 1,
    id: "annotation-validation-test",
    mode: "diagram",
    objects: [],
    connections: [],
    annotations: [annotation],
  };
}

describe("annotation schema normalization", () => {
  it("migrates a flat annotation to a thread with no replies", () => {
    const validation = validateInteractiveCanvasDocument(
      annotationDocument({
        id: "note-1",
        target: { kind: "region", region: { x: 0, y: 0, width: 96, height: 64 } },
        intent: "note",
        body: "Opening post",
        status: "open",
        createdBy: "human",
      }),
    );

    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.document.annotations?.[0]?.replies).toEqual([]);
    }
  });

  it("normalizes reply authors and drops malformed or duplicate replies", () => {
    const validation = validateInteractiveCanvasDocument(
      annotationDocument({
        id: "note-1",
        target: { kind: "region", region: { x: 0, y: 0, width: 96, height: 64 } },
        intent: "agent-request",
        body: "Opening post",
        status: "open",
        createdBy: "human",
        replies: [
          {
            id: "reply-1",
            author: "agent",
            body: "First reply",
            createdAt: "2026-07-25T12:00:00.000Z",
          },
          { id: "reply-2", author: "system", body: "Second reply", createdAt: 42 },
          { id: "reply-3", author: "operator", body: "Third reply" },
          { id: "", author: "agent", body: "Missing id" },
          { id: "reply-4", author: "agent" },
          "not-a-reply",
          { id: "reply-1", author: "human", body: "Duplicate" },
        ],
      }),
    );

    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.document.annotations?.[0]?.replies).toEqual([
        {
          id: "reply-1",
          author: "agent",
          body: "First reply",
          createdAt: "2026-07-25T12:00:00.000Z",
        },
        {
          id: "reply-2",
          author: "system",
          body: "Second reply",
          createdAt: undefined,
        },
        {
          id: "reply-3",
          author: "human",
          body: "Third reply",
          createdAt: undefined,
        },
      ]);
    }
  });
});

describe("canvas.addAnnotation", () => {
  it("honors createdBy and defaults to human", () => {
    const state = createInteractiveCanvasState({
      schemaVersion: 1,
      id: "annotation-add-test",
      mode: "diagram",
      objects: [],
      connections: [],
    });
    const agentAuthored = reduceInteractiveCanvasState(state, {
      type: "canvas.addAnnotation",
      target: { kind: "region", region: { x: 0, y: 0, width: 96, height: 64 } },
      body: "Agent question",
      createdBy: "agent",
    });
    const humanAuthored = reduceInteractiveCanvasState(agentAuthored, {
      type: "canvas.addAnnotation",
      target: { kind: "region", region: { x: 96, y: 0, width: 96, height: 64 } },
      body: "Human note",
    });

    expect(agentAuthored.document.annotations?.[0]).toMatchObject({
      createdBy: "agent",
      replies: [],
    });
    expect(humanAuthored.document.annotations?.[1]).toMatchObject({
      createdBy: "human",
      replies: [],
    });
  });
});

describe("canvas.appendAnnotationReply", () => {
  it("appends a trimmed reply in order and is undoable in one history entry", () => {
    const state = makeState();
    const annotation = state.document.annotations?.[0];
    if (!annotation) throw new Error("annotation fixture missing");
    const threadedState = createInteractiveCanvasState({
      ...state.document,
      annotations: [
        {
          ...annotation,
          replies: [{ id: "reply-1", author: "human", body: "First" }],
        },
      ],
    });

    const next = reduceInteractiveCanvasState(threadedState, {
      type: "canvas.appendAnnotationReply",
      annotationId: "note-1",
      author: "agent",
      body: "  Second  ",
    });

    expect(next.document.annotations?.[0]?.replies).toHaveLength(2);
    expect(next.document.annotations?.[0]?.replies[1]).toMatchObject({
      id: "reply-2",
      author: "agent",
      body: "Second",
    });
    expect(next.document.annotations?.[0]?.replies[1]?.createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
    expect(next.history.past).toHaveLength(threadedState.history.past.length + 1);
    expect(next.lastChange).toMatchObject({
      source: "human",
      summary: "Replied to annotation",
      changedObjectIds: [],
      changedConnectionIds: [],
      changedAnnotationIds: ["note-1"],
    });

    const undone = reduceInteractiveCanvasState(next, { type: "canvas.undo" });
    expect(undone.document).toBe(threadedState.document);
  });

  it("returns state unchanged for an unknown annotation or blank body", () => {
    const state = makeState();
    const unknown = reduceInteractiveCanvasState(state, {
      type: "canvas.appendAnnotationReply",
      annotationId: "missing-note",
      author: "human",
      body: "Reply",
    });
    const blank = reduceInteractiveCanvasState(state, {
      type: "canvas.appendAnnotationReply",
      annotationId: "note-1",
      author: "human",
      body: "   ",
    });

    expect(unknown).toBe(state);
    expect(blank).toBe(state);
  });
});

describe("canvas.setAnnotationStatus", () => {
  it("sets the status and is undoable", () => {
    const state = makeState();
    const next = reduceInteractiveCanvasState(state, {
      type: "canvas.setAnnotationStatus",
      annotationId: "note-1",
      status: "resolved",
    });

    expect(next.document.annotations?.[0]?.status).toBe("resolved");
    expect(next.history.past).toHaveLength(state.history.past.length + 1);
    expect(next.lastChange).toMatchObject({
      source: "human",
      summary: "Updated annotation status",
      changedAnnotationIds: ["note-1"],
    });

    const undone = reduceInteractiveCanvasState(next, { type: "canvas.undo" });
    expect(undone.document.annotations?.[0]?.status).toBe("open");
  });

  it("returns state unchanged for an unknown annotation or matching status", () => {
    const state = makeState();
    const unknown = reduceInteractiveCanvasState(state, {
      type: "canvas.setAnnotationStatus",
      annotationId: "missing-note",
      status: "resolved",
    });
    const unchanged = reduceInteractiveCanvasState(state, {
      type: "canvas.setAnnotationStatus",
      annotationId: "note-1",
      status: "open",
    });

    expect(unknown).toBe(state);
    expect(unchanged).toBe(state);
  });
});

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

describe("thread cascade on target deletion", () => {
  function stateWithThreadOnObject() {
    return createInteractiveCanvasState({
      schemaVersion: 1,
      id: "annotation-cascade-test",
      mode: "diagram",
      objects: [
        {
          id: "task",
          type: "process",
          text: "Task",
          parentId: null,
          geometry: { x: 0, y: 0, width: 184, height: 96 },
        },
      ],
      connections: [],
      annotations: [
        {
          id: "note-1",
          target: { kind: "object", objectId: "task" },
          intent: "agent-request",
          body: "Split this into two steps",
          status: "open",
          createdBy: "human",
          replies: [{ id: "reply-1", author: "agent", body: "prep and run" }],
        },
      ],
    });
  }

  it("removes the whole thread when the human deletes its target", () => {
    let state = stateWithThreadOnObject();
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.select",
      selection: { kind: "objects", objectIds: ["task"] },
    });

    const next = reduceInteractiveCanvasState(state, { type: "canvas.deleteSelection" });

    expect(next.document.objects).toEqual([]);
    expect(next.document.annotations).toEqual([]);
  });

  it("removes the whole thread when an agent patch removes its target", () => {
    const next = reduceInteractiveCanvasState(stateWithThreadOnObject(), {
      type: "canvas.applyAgentPatch",
      operations: [{ type: "removeObject", objectId: "task" }],
    });

    expect(next.document.annotations).toEqual([]);
  });
});
