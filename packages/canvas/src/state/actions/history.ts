"use client";

import type { InteractiveCanvasDocument } from "../schema";
import type { CanvasChangeSummary, InteractiveCanvasState } from "./types";

export function withHistory(
  state: InteractiveCanvasState,
  document: InteractiveCanvasDocument,
  lastChange?: CanvasChangeSummary,
): InteractiveCanvasState {
  return {
    ...state,
    document,
    history: {
      past: [...state.history.past, state.document].slice(-80),
      future: [],
    },
    lastChange,
  };
}

export function handleUndo(state: InteractiveCanvasState): InteractiveCanvasState {
  const previous = state.history.past.at(-1);
  if (!previous) return state;
  return {
    ...state,
    document: previous,
    history: {
      past: state.history.past.slice(0, -1),
      future: [state.document, ...state.history.future],
    },
    lastChange: {
      source: "human",
      summary: "Undo",
      changedObjectIds: [],
      changedConnectionIds: [],
      changedAnnotationIds: [],
    },
  };
}

export function handleRedo(state: InteractiveCanvasState): InteractiveCanvasState {
  const next = state.history.future[0];
  if (!next) return state;
  return {
    ...state,
    document: next,
    history: {
      past: [...state.history.past, state.document],
      future: state.history.future.slice(1),
    },
    lastChange: {
      source: "human",
      summary: "Redo",
      changedObjectIds: [],
      changedConnectionIds: [],
      changedAnnotationIds: [],
    },
  };
}
