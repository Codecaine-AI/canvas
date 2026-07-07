"use client";

import type { InteractiveCanvasDocument } from "../schema";
import { handleAddAnnotation, handleResolveLinkStatuses } from "./annotations";
import {
  handleAddConnection,
  handleDeleteConnection,
  handleQuickConnect,
  handleUpdateConnection,
} from "./connections";
import {
  handleAlignSelection,
  handleCaptureSectionContents,
  handleDistributeSelection,
  handleFitSectionToChildren,
  handleMoveSelection,
  handleResizeObject,
  handleSetParent,
  handleUpdateObjectGeometries,
} from "./geometry-ops";
import { selectedObjectIds } from "./helpers";
import { handleRedo, handleUndo, withHistory } from "./history";
import {
  handleAddObject,
  handleAddObjects,
  handleDeleteSelection,
  handleDuplicateSelection,
  handleSetObjectType,
  handleUpdateObject,
} from "./objects";
import type { CanvasAction, CanvasSelection, InteractiveCanvasState } from "./types";
import { reconcileConnectionWaypoints } from "./waypoints";

export function createInteractiveCanvasState(
  document: InteractiveCanvasDocument,
): InteractiveCanvasState {
  return {
    document,
    selection: { kind: "none" },
    tool: "select",
    history: { past: [], future: [] },
  };
}

/**
 * Reducer entry point. Wraps the action switch (reduceCanvasAction) with the
 * stale-waypoint choke point: every action that commits geometry changes —
 * drag/section-carry commits (canvas.updateObjectGeometries, both the history
 * and live-preview branches), nudges (canvas.moveSelection), resize, align/
 * distribute, fit-section, inspector geometry patches (canvas.updateObject)
 * — flows through here, so waypoints are reconciled exactly once per action.
 * undo/redo/reset restore stored documents verbatim and are exempt.
 */
export function reduceInteractiveCanvasState(
  state: InteractiveCanvasState,
  action: CanvasAction,
): InteractiveCanvasState {
  const next = reduceCanvasAction(state, action);
  if (next === state) return next;
  if (action.type === "canvas.undo" || action.type === "canvas.redo" || action.type === "canvas.reset") {
    return next;
  }
  if (next.document === state.document) return next;
  const reconciled = reconcileConnectionWaypoints(state.document, next.document);
  if (reconciled === next.document) return next;
  return { ...next, document: reconciled };
}

/**
 * Thin action switch — every case delegates to a named handler in its domain
 * module (./objects, ./geometry-ops, ./connections, ./annotations, ./history).
 * Only the trivial cases with no domain home (select/setTool/title/reset)
 * stay inline.
 */
function reduceCanvasAction(
  state: InteractiveCanvasState,
  action: CanvasAction,
): InteractiveCanvasState {
  if (action.type === "canvas.select") {
    return { ...state, selection: action.selection };
  }
  if (action.type === "canvas.setTool") {
    return { ...state, tool: action.tool };
  }
  if (action.type === "canvas.updateDocumentTitle") {
    const title = action.title.trim();
    if (!title || state.document.title === title) return state;
    return withHistory(state, { ...state.document, title }, {
      source: "human",
      summary: "Renamed board",
      changedObjectIds: [],
      changedConnectionIds: [],
      changedAnnotationIds: [],
    });
  }
  if (action.type === "canvas.reset") {
    return createInteractiveCanvasState(action.document);
  }
  if (action.type === "canvas.undo") {
    return handleUndo(state);
  }
  if (action.type === "canvas.redo") {
    return handleRedo(state);
  }

  if (action.type === "canvas.addObject") {
    return handleAddObject(state, action);
  }

  if (action.type === "canvas.duplicateSelection") {
    return handleDuplicateSelection(state);
  }

  if (action.type === "canvas.addObjects") {
    return handleAddObjects(state, action);
  }

  if (action.type === "canvas.updateObject") {
    return handleUpdateObject(state, action);
  }

  if (action.type === "canvas.setObjectType") {
    return handleSetObjectType(state, action);
  }

  if (action.type === "canvas.moveSelection") {
    return handleMoveSelection(state, action);
  }

  if (action.type === "canvas.resizeObject") {
    return handleResizeObject(state, action);
  }

  if (action.type === "canvas.updateObjectGeometries") {
    return handleUpdateObjectGeometries(state, action);
  }

  if (action.type === "canvas.setParent") {
    return handleSetParent(state, action);
  }

  if (action.type === "canvas.addConnection") {
    return handleAddConnection(state, action);
  }

  if (action.type === "canvas.quickConnect") {
    return handleQuickConnect(state, action);
  }

  if (action.type === "canvas.updateConnection") {
    return handleUpdateConnection(state, action);
  }

  if (action.type === "canvas.deleteConnection") {
    return handleDeleteConnection(state, action);
  }

  if (action.type === "canvas.addAnnotation") {
    return handleAddAnnotation(state, action);
  }

  if (action.type === "canvas.deleteSelection") {
    return handleDeleteSelection(state);
  }

  if (action.type === "canvas.alignSelection") {
    return handleAlignSelection(state, action);
  }

  if (action.type === "canvas.distributeSelection") {
    return handleDistributeSelection(state, action);
  }

  if (action.type === "canvas.fitSectionToChildren") {
    return handleFitSectionToChildren(state, action);
  }

  if (action.type === "canvas.captureSectionContents") {
    return handleCaptureSectionContents(state, action);
  }

  if (action.type === "canvas.resolveLinkStatuses") {
    return handleResolveLinkStatuses(state, action);
  }

  return state;
}

export function buildSelectionContext(
  document: InteractiveCanvasDocument,
  selection: CanvasSelection,
) {
  const objectIds = selectedObjectIds(selection);
  const objects = document.objects.filter((object) => objectIds.includes(object.id));
  const parentIds = new Set(objects.map((object) => object.parentId).filter(Boolean));
  const nearby = document.objects.filter((object) => {
    return !objectIds.includes(object.id) && (object.parentId ? parentIds.has(object.parentId) : false);
  });
  return {
    documentId: document.id,
    selection,
    objects,
    nearby,
    connections: document.connections.filter((connection) => {
      return (
        objectIds.includes(connection.from.objectId) ||
        objectIds.includes(connection.to.objectId)
      );
    }),
    links: document.links?.filter((link) => objectIds.includes(link.objectId)) ?? [],
    annotations:
      document.annotations?.filter((annotation) => {
        return annotation.target.kind === "object" && objectIds.includes(annotation.target.objectId);
      }) ?? [],
  };
}
