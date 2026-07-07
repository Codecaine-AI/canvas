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
    createdBy: "human",
    createdAt: new Date().toISOString(),
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
