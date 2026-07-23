"use client";

import type { InteractiveCanvasDocument } from "../schema";
import { reconcileSectionMembership } from "../section-membership";
import { handleApplyAgentPatch } from "./agent-patch";
import { handleAddAnnotation, handleRemoveAnnotation } from "./annotations";
import { FIRST_USE_COLORS } from "../schema/object-defaults";
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
  handleReconcileSectionMembership,
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
  const reconciledDocument = reconcileSectionMembership(document);
  return {
    document: reconciledDocument,
    selection: { kind: "none" },
    tool: "select",
    history: { past: [], future: [] },
    // D17 — per-kind color memory starts at the first-use fallbacks.
    lastPickedColor: { ...FIRST_USE_COLORS },
  };
}

/**
 * Reducer entry point. Wraps the action switch (reduceCanvasAction) with the
 * post-reduce geometry choke points. Waypoints are reconciled for every
 * document-changing action, while section membership is reconciled for
 * discrete geometry commits only. undo/redo/reset restore stored documents
 * verbatim and are exempt.
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
  const waypointsReconciledDocument = reconcileConnectionWaypoints(state.document, next.document);
  const shouldReconcileSections = shouldReconcileSectionMembership(action);
  const sectionReconciledDocument = shouldReconcileSections
    ? reconcileSectionMembership(waypointsReconciledDocument)
    : waypointsReconciledDocument;
  if (shouldReconcileSections && process.env.NODE_ENV !== "production") {
    const invariantDocument = reconcileSectionMembership(sectionReconciledDocument);
    if (invariantDocument !== sectionReconciledDocument) {
      console.error("Section membership invariant violation after", action.type);
    }
  }
  if (sectionReconciledDocument === next.document) return next;
  return { ...next, document: sectionReconciledDocument };
}

function shouldReconcileSectionMembership(action: CanvasAction): boolean {
  switch (action.type) {
    case "canvas.addObject":
    case "canvas.addObjects":
    case "canvas.duplicateSelection":
    case "canvas.deleteSelection":
    case "canvas.quickConnect":
    case "canvas.moveSelection":
    case "canvas.resizeObject":
    case "canvas.alignSelection":
    case "canvas.distributeSelection":
    case "canvas.fitSectionToChildren":
    case "canvas.setObjectType":
    // Agent patches write geometry (add/update) and auto-fit affected sections — membership must
    // re-derive; patch ops never write parentId themselves (agent-patch.ts).
    case "canvas.applyAgentPatch":
      return true;
    case "canvas.updateObject":
      return objectPatchTouchesSectionMembership(action.patch);
    default:
      return false;
  }
}

function objectPatchTouchesSectionMembership(
  patch: Extract<CanvasAction, { type: "canvas.updateObject" }>["patch"],
): boolean {
  return ["geometry", "type", "locked", "parentId"].some((key) =>
    Object.prototype.hasOwnProperty.call(patch, key),
  );
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

  if (action.type === "canvas.reconcileSectionMembership") {
    return handleReconcileSectionMembership(state, action);
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

  if (action.type === "canvas.removeAnnotation") {
    return handleRemoveAnnotation(state, action);
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

  if (action.type === "canvas.applyAgentPatch") {
    return handleApplyAgentPatch(state, action);
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
    annotations:
      document.annotations?.filter((annotation) => {
        return annotation.target.kind === "object" && objectIds.includes(annotation.target.objectId);
      }) ?? [],
  };
}
