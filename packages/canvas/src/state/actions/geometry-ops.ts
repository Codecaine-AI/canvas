"use client";

import {
  alignObjects,
  distributeObjects,
  fitSectionToChildren,
  SECTION_CAPTURE_OVERLAP_THRESHOLD,
  sectionCaptureMembers,
  snapGeometry,
} from "../geometry";
import { reconcileSectionMembership } from "../section-membership";
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

export function handleReconcileSectionMembership(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.reconcileSectionMembership" }>,
): InteractiveCanvasState {
  const document = reconcileSectionMembership(state.document);
  if (document === state.document) return state;

  const previousParentById = new Map(
    state.document.objects.map((object) => [object.id, object.parentId ?? null]),
  );
  const changedObjectIds = document.objects
    .filter((object) => (previousParentById.get(object.id) ?? null) !== (object.parentId ?? null))
    .map((object) => object.id);
  const lastChange = {
    source: "human" as const,
    summary: "Reconciled section membership",
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
  if (action.parentId && parent?.type !== "section") return state;
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
    summary: parent ? `Moved into ${parent.text}` : "Moved out of section",
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

export function handleFitSectionToChildren(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.fitSectionToChildren" }>,
): InteractiveCanvasState {
  return withHistory(
    state,
    fitSectionToChildren(state.document, action.sectionId, action.padding),
    {
      source: "human",
      summary: "Fit section",
      changedObjectIds: [action.sectionId],
      changedConnectionIds: [],
      changedAnnotationIds: [],
    },
  );
}

export function handleCaptureSectionContents(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.captureSectionContents" }>,
): InteractiveCanvasState {
  const section = state.document.objects.find((object) => object.id === action.sectionId);
  if (section?.type !== "section") return state;
  const captured = sectionCaptureMembers(
    state.document,
    action.sectionId,
    SECTION_CAPTURE_OVERLAP_THRESHOLD,
  );
  // Geometric capture can claim the section's own (root) ancestor when their
  // bounds overlap enough; adopting it would create a parentId cycle, so the
  // ancestor chain is excluded (mirrors handleSetParent's guard).
  const objectById = new Map(state.document.objects.map((object) => [object.id, object]));
  const ancestorIds = new Set<string>();
  let ancestorId = section.parentId ?? null;
  while (ancestorId && !ancestorIds.has(ancestorId)) {
    ancestorIds.add(ancestorId);
    ancestorId = objectById.get(ancestorId)?.parentId ?? null;
  }
  // A geometrically-captured object is adopted when it's unparented OR
  // parented to a STRICT ANCESTOR of this section — the latter repairs legacy
  // flat docs where every object hangs off an outer ancestor section. Never
  // adopted: the section's own ancestors (the cycle guard above), objects
  // parented to any non-ancestor section (no stealing laterally from sibling
  // or unrelated sections), objects parented to this section's own
  // descendants (already transitively inside; reparenting would flatten), and
  // the section itself (recursive geometric capture can claim it back through
  // a large child section, and adopting it would self-cycle).
  const changedObjectIds = state.document.objects
    .filter(
      (object) =>
        object.id !== action.sectionId &&
        captured.has(object.id) &&
        !ancestorIds.has(object.id) &&
        (!object.parentId || ancestorIds.has(object.parentId)),
    )
    .map((object) => object.id);
  if (changedObjectIds.length === 0) return state;
  const changedIdSet = new Set(changedObjectIds);
  const document = {
    ...state.document,
    objects: state.document.objects.map((object) =>
      changedIdSet.has(object.id) ? { ...object, parentId: action.sectionId } : object,
    ),
  };
  return withHistory(state, document, {
    source: "human",
    summary: `Captured into ${section.text}`,
    changedObjectIds,
    changedConnectionIds: [],
    changedAnnotationIds: [],
  });
}
