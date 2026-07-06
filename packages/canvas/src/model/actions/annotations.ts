"use client";

import type {
  CanvasLinkStatus,
  InteractiveCanvasAnnotation,
  InteractiveCanvasDocument,
} from "../schema";
import { nextId } from "./helpers";
import { withHistory } from "./history";
import type { CanvasAction, InteractiveCanvasState } from "./types";

export function resolveCanvasLinkStatuses(
  document: InteractiveCanvasDocument,
  input: {
    knownPaths: Iterable<string>;
    stalePaths?: Iterable<string>;
    checkedAt?: string;
  },
): InteractiveCanvasDocument {
  const knownPaths = new Set(Array.from(input.knownPaths, (path) => path.trim()).filter(Boolean));
  const stalePaths = new Set(
    Array.from(input.stalePaths ?? [], (path) => path.trim()).filter(Boolean),
  );
  if (!document.links || document.links.length === 0) return document;

  return {
    ...document,
    links: document.links.map((link) => {
      let status: CanvasLinkStatus = "unresolved";
      if (knownPaths.has(link.target.path)) {
        status = stalePaths.has(link.target.path) ? "stale" : "resolved";
      } else if (knownPaths.size > 0) {
        status = "missing";
      }
      return {
        ...link,
        status,
        checkedAt: input.checkedAt ?? link.checkedAt,
      };
    }),
  };
}

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

export function handleResolveLinkStatuses(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.resolveLinkStatuses" }>,
): InteractiveCanvasState {
  const document = resolveCanvasLinkStatuses(state.document, {
    knownPaths: action.knownPaths,
    stalePaths: action.stalePaths,
    checkedAt: action.checkedAt,
  });
  if (document === state.document) return state;
  return withHistory(state, document, {
    source: "human",
    summary: "Resolved link statuses",
    changedObjectIds: document.links?.map((link) => link.objectId) ?? [],
    changedConnectionIds: [],
    changedAnnotationIds: [],
  });
}
