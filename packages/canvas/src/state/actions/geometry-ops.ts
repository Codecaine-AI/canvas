"use client";

import {
  alignObjects,
  distributeObjects,
  fitContainerToChildren,
  snapGeometry,
} from "../geometry";
import { selectedObjectIds } from "./helpers";
import { withHistory } from "./history";
import type { CanvasAction, InteractiveCanvasState } from "./types";

export function handleMoveSelection(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.moveSelection" }>,
): InteractiveCanvasState {
  const ids = selectedObjectIds(state.selection);
  if (ids.length === 0) return state;
  const document = {
    ...state.document,
    objects: state.document.objects.map((object) => {
      if (!ids.includes(object.id)) return object;
      const geometry = {
        ...object.geometry,
        x: object.geometry.x + action.dx,
        y: object.geometry.y + action.dy,
      };
      return {
        ...object,
        geometry: action.snap === false ? geometry : snapGeometry(geometry),
      };
    }),
  };
  return withHistory(state, document, {
    source: "human",
    summary: "Moved selection",
    changedObjectIds: ids,
    changedConnectionIds: [],
    changedAnnotationIds: [],
  });
}

export function handleResizeObject(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.resizeObject" }>,
): InteractiveCanvasState {
  const geometry = snapGeometry({
    x: 0,
    y: 0,
    width: action.width,
    height: action.height,
  });
  const document = {
    ...state.document,
    objects: state.document.objects.map((object) =>
      object.id === action.objectId
        ? {
            ...object,
            geometry: {
              ...object.geometry,
              width: action.snap === false ? action.width : geometry.width,
              height: action.snap === false ? action.height : geometry.height,
            },
          }
        : object,
    ),
  };
  return withHistory(state, document, {
    source: "human",
    summary: "Resized object",
    changedObjectIds: [action.objectId],
    changedConnectionIds: [],
    changedAnnotationIds: [],
  });
}

export function handleUpdateObjectGeometries(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.updateObjectGeometries" }>,
): InteractiveCanvasState {
  const geometryById = new Map(Object.entries(action.geometries));
  const changedObjectIds = state.document.objects
    .filter((object) => geometryById.has(object.id))
    .map((object) => object.id);
  if (changedObjectIds.length === 0) return state;
  const document = {
    ...state.document,
    objects: state.document.objects.map((object) => {
      const geometry = geometryById.get(object.id);
      if (!geometry) return object;
      return {
        ...object,
        geometry: action.snap === false ? geometry : snapGeometry(geometry),
      };
    }),
  };
  const lastChange = {
    source: "human" as const,
    summary: action.summary ?? "Updated geometry",
    changedObjectIds,
    changedConnectionIds: [],
    changedAnnotationIds: [],
  };
  if (action.recordHistory === false) {
    return {
      ...state,
      document,
      lastChange,
    };
  }
  return withHistory(state, document, lastChange);
}

export function handleSetParent(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.setParent" }>,
): InteractiveCanvasState {
  const objectIdSet = new Set(action.objectIds);
  const objectById = new Map(state.document.objects.map((object) => [object.id, object]));
  const parent = action.parentId ? objectById.get(action.parentId) : null;
  if (action.parentId && parent?.type !== "container") return state;
  if (action.parentId && objectIdSet.has(action.parentId)) return state;

  let ancestorId = parent?.parentId ?? null;
  const visitedAncestorIds = new Set<string>();
  while (ancestorId) {
    if (visitedAncestorIds.has(ancestorId)) return state;
    visitedAncestorIds.add(ancestorId);
    if (objectIdSet.has(ancestorId)) return state;
    ancestorId = objectById.get(ancestorId)?.parentId ?? null;
  }

  const changedObjectIds = state.document.objects
    .filter((object) => objectIdSet.has(object.id))
    .map((object) => object.id);
  if (changedObjectIds.length === 0) return state;

  const document = {
    ...state.document,
    objects: state.document.objects.map((object) =>
      objectIdSet.has(object.id)
        ? {
            ...object,
            parentId: action.parentId,
          }
        : object,
    ),
  };
  return withHistory(state, document, {
    source: "human",
    summary: parent ? `Moved into ${parent.label}` : "Moved out of container",
    changedObjectIds,
    changedConnectionIds: [],
    changedAnnotationIds: [],
  });
}

export function handleAlignSelection(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.alignSelection" }>,
): InteractiveCanvasState {
  const ids = selectedObjectIds(state.selection);
  const document = alignObjects(state.document, ids, action.axis);
  return withHistory(state, document, {
    source: "human",
    summary: "Aligned selection",
    changedObjectIds: ids,
    changedConnectionIds: [],
    changedAnnotationIds: [],
  });
}

export function handleDistributeSelection(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.distributeSelection" }>,
): InteractiveCanvasState {
  const ids = selectedObjectIds(state.selection);
  const document = distributeObjects(state.document, ids, action.axis);
  return withHistory(state, document, {
    source: "human",
    summary: "Distributed selection",
    changedObjectIds: ids,
    changedConnectionIds: [],
    changedAnnotationIds: [],
  });
}

export function handleFitContainerToChildren(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.fitContainerToChildren" }>,
): InteractiveCanvasState {
  return withHistory(
    state,
    fitContainerToChildren(state.document, action.containerId, action.padding),
    {
      source: "human",
      summary: "Fit container",
      changedObjectIds: [action.containerId],
      changedConnectionIds: [],
      changedAnnotationIds: [],
    },
  );
}
