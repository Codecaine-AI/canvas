"use client";

import type { InteractiveCanvasAnnotation } from "../schema";
import { nextId } from "./helpers";
import { withHistory } from "./history";
import type { CanvasAction, InteractiveCanvasState } from "./types";

export function handleAddAnnotation(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.addAnnotation" }>,
): InteractiveCanvasState {
  const id = nextId(
    "annotation",
    state.document.annotations?.map((annotation) => annotation.id) ?? [],
  );
  const annotation: InteractiveCanvasAnnotation = {
    id,
    target: action.target,
    intent: action.intent ?? "note",
    body: action.body,
    status: "open",
    createdBy: action.createdBy ?? "human",
    createdAt: new Date().toISOString(),
    replies: [],
  };
  return withHistory(
    {
      ...state,
      selection: { kind: "annotation", annotationId: id },
    },
    {
      ...state.document,
      annotations: [...(state.document.annotations ?? []), annotation],
    },
    {
      source: "human",
      summary: "Added annotation",
      changedObjectIds: [],
      changedConnectionIds: [],
      changedAnnotationIds: [id],
    },
  );
}

export function handleAppendAnnotationReply(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.appendAnnotationReply" }>,
): InteractiveCanvasState {
  const annotation = state.document.annotations?.find(
    (candidate) => candidate.id === action.annotationId,
  );
  const body = action.body.trim();
  if (!annotation || !body) return state;

  const reply = {
    id: nextId(
      "reply",
      annotation.replies.map((candidate) => candidate.id),
    ),
    author: action.author,
    body,
    createdAt: new Date().toISOString(),
  };

  return withHistory(
    state,
    {
      ...state.document,
      annotations: state.document.annotations?.map((candidate) =>
        candidate.id === action.annotationId
          ? { ...candidate, replies: [...candidate.replies, reply] }
          : candidate,
      ),
    },
    {
      source: "human",
      summary: "Replied to annotation",
      changedObjectIds: [],
      changedConnectionIds: [],
      changedAnnotationIds: [action.annotationId],
    },
  );
}

export function handleSetAnnotationStatus(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.setAnnotationStatus" }>,
): InteractiveCanvasState {
  const annotation = state.document.annotations?.find(
    (candidate) => candidate.id === action.annotationId,
  );
  if (!annotation || annotation.status === action.status) return state;

  return withHistory(
    state,
    {
      ...state.document,
      annotations: state.document.annotations?.map((candidate) =>
        candidate.id === action.annotationId
          ? { ...candidate, status: action.status }
          : candidate,
      ),
    },
    {
      source: "human",
      summary: "Updated annotation status",
      changedObjectIds: [],
      changedConnectionIds: [],
      changedAnnotationIds: [action.annotationId],
    },
  );
}

export function handleRemoveAnnotation(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.removeAnnotation" }>,
): InteractiveCanvasState {
  if (!state.document.annotations?.some((annotation) => annotation.id === action.annotationId)) {
    return state;
  }
  return withHistory(
    state.selection.kind === "annotation" && state.selection.annotationId === action.annotationId
      ? { ...state, selection: { kind: "none" } }
      : state,
    {
      ...state.document,
      annotations: state.document.annotations.filter(
        (annotation) => annotation.id !== action.annotationId,
      ),
    },
    {
      source: "human",
      summary: "Removed note",
      changedObjectIds: [],
      changedConnectionIds: [],
      changedAnnotationIds: [action.annotationId],
    },
  );
}
