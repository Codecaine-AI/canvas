"use client";

import { createObjectId, snapGeometry } from "../geometry";
import type { InteractiveCanvasConnection, InteractiveCanvasObject } from "../schema";
import { removeConnection } from "./connections";
import { defaultGeometryFor, objectTypeLabel, shapeForType, toneForType } from "./defaults";
import { nextId, selectedObjectIds } from "./helpers";
import { withHistory } from "./history";
import type { CanvasAction, InteractiveCanvasState } from "./types";

export function handleAddObject(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.addObject" }>,
): InteractiveCanvasState {
  const label = action.label ?? objectTypeLabel(action.objectType);
  const id = createObjectId(state.document, label);
  const object: InteractiveCanvasObject = {
    id,
    type: action.objectType,
    label,
    parentId: action.parentId ?? null,
    geometry: snapGeometry(action.geometry ?? defaultGeometryFor(action.objectType)),
    style: {
      tone: action.tone ?? toneForType(action.objectType),
      shape: shapeForType(action.objectType),
    },
    // W2 — sections carry their visible title in `title`/`tint`, not the
    // generic tone/shape style bag; default to a neutral "gray" family so a
    // freshly-placed section is immediately valid per validateInteractiveCanvasDocument.
    ...(action.objectType === "section" ? { title: label, tint: "gray" as const } : null),
  };
  return withHistory(
    {
      ...state,
      selection: { kind: "objects", objectIds: [id] },
    },
    { ...state.document, objects: [...state.document.objects, object] },
    {
      source: "human",
      summary: `Added ${label}`,
      changedObjectIds: [id],
      changedConnectionIds: [],
      changedAnnotationIds: [],
    },
  );
}

export function handleDuplicateSelection(
  state: InteractiveCanvasState,
): InteractiveCanvasState {
  const ids = selectedObjectIds(state.selection);
  if (ids.length === 0) return state;

  let document = state.document;
  const selectedIds = new Set(ids);
  const oldIdToNewId = new Map<string, string>();
  const originals = state.document.objects.filter((object) => selectedIds.has(object.id));
  if (originals.length === 0) return state;

  for (const object of originals) {
    const id = createObjectId(document, object.label);
    oldIdToNewId.set(object.id, id);
    document = {
      ...document,
      objects: [
        ...document.objects,
        {
          ...object,
          id,
          geometry: {
            ...object.geometry,
            x: object.geometry.x + 24,
            y: object.geometry.y + 24,
          },
        },
      ],
    };
  }

  const newObjects = originals.map((object) => {
    const id = oldIdToNewId.get(object.id)!;
    return {
      ...object,
      id,
      parentId: oldIdToNewId.get(object.parentId ?? "") ?? object.parentId ?? null,
      geometry: {
        ...object.geometry,
        x: object.geometry.x + 24,
        y: object.geometry.y + 24,
      },
    };
  });

  const connectionIds = new Set(document.connections.map((connection) => connection.id));
  const newConnections: InteractiveCanvasConnection[] = [];
  for (const connection of state.document.connections) {
    if (!selectedIds.has(connection.from.objectId) || !selectedIds.has(connection.to.objectId)) {
      continue;
    }
    const id = nextId("connection", connectionIds);
    connectionIds.add(id);
    newConnections.push({
      ...connection,
      id,
      from: {
        ...connection.from,
        objectId: oldIdToNewId.get(connection.from.objectId) ?? connection.from.objectId,
      },
      to: {
        ...connection.to,
        objectId: oldIdToNewId.get(connection.to.objectId) ?? connection.to.objectId,
      },
      // W4 — explicit waypoints are absolute world coords: ride the same
      // +24/+24 offset the duplicated objects get so cloned fans stay intact.
      waypoints: connection.waypoints?.map(([x, y]) => [x + 24, y + 24] as [number, number]),
    });
  }

  const newObjectIds = newObjects.map((object) => object.id);
  const newConnectionIds = newConnections.map((connection) => connection.id);
  document = {
    ...state.document,
    objects: [...state.document.objects, ...newObjects],
    connections: [...state.document.connections, ...newConnections],
  };
  return withHistory(
    {
      ...state,
      selection: { kind: "objects", objectIds: newObjectIds },
    },
    document,
    {
      source: "human",
      summary: "Duplicated selection",
      changedObjectIds: newObjectIds,
      changedConnectionIds: newConnectionIds,
      changedAnnotationIds: [],
    },
  );
}

export function handleAddObjects(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.addObjects" }>,
): InteractiveCanvasState {
  if (action.objects.length === 0) return state;

  let objectDocument = state.document;
  const oldIdToNewId = new Map<string, string>();
  const newObjects: InteractiveCanvasObject[] = [];

  for (const object of action.objects) {
    const collides = objectDocument.objects.some((candidate) => candidate.id === object.id);
    const id = collides ? createObjectId(objectDocument, object.label) : object.id;
    oldIdToNewId.set(object.id, id);
    const newObject = { ...object, id };
    newObjects.push(newObject);
    objectDocument = { ...objectDocument, objects: [...objectDocument.objects, newObject] };
  }

  const remappedObjects = newObjects.map((object) => ({
    ...object,
    parentId: oldIdToNewId.get(object.parentId ?? "") ?? object.parentId ?? null,
  }));

  const connectionIds = new Set(state.document.connections.map((connection) => connection.id));
  const newConnections: InteractiveCanvasConnection[] = [];
  for (const connection of action.connections ?? []) {
    const id = connectionIds.has(connection.id)
      ? nextId("connection", connectionIds)
      : connection.id;
    connectionIds.add(id);
    newConnections.push({
      ...connection,
      id,
      from: {
        ...connection.from,
        objectId: oldIdToNewId.get(connection.from.objectId) ?? connection.from.objectId,
      },
      to: {
        ...connection.to,
        objectId: oldIdToNewId.get(connection.to.objectId) ?? connection.to.objectId,
      },
    });
  }

  const newObjectIds = remappedObjects.map((object) => object.id);
  const newConnectionIds = newConnections.map((connection) => connection.id);
  const document = {
    ...state.document,
    objects: [...state.document.objects, ...remappedObjects],
    connections: [...state.document.connections, ...newConnections],
  };

  return withHistory(
    action.select !== false
      ? {
          ...state,
          selection: { kind: "objects", objectIds: newObjectIds },
        }
      : state,
    document,
    {
      source: "human",
      summary: "Pasted",
      changedObjectIds: newObjectIds,
      changedConnectionIds: newConnectionIds,
      changedAnnotationIds: [],
    },
  );
}

export function handleUpdateObject(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.updateObject" }>,
): InteractiveCanvasState {
  const document = {
    ...state.document,
    objects: state.document.objects.map((object) =>
      object.id === action.objectId
        ? {
            ...object,
            ...action.patch,
            geometry: action.patch.geometry
              ? snapGeometry(action.patch.geometry)
              : object.geometry,
            style: action.patch.style ? { ...object.style, ...action.patch.style } : object.style,
          }
        : object,
    ),
  };
  return withHistory(state, document, {
    source: "human",
    summary: "Updated object",
    changedObjectIds: [action.objectId],
    changedConnectionIds: [],
    changedAnnotationIds: [],
  });
}

export function handleSetObjectType(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.setObjectType" }>,
): InteractiveCanvasState {
  const existing = state.document.objects.find((object) => object.id === action.objectId);
  if (!existing || existing.type === action.objectType) return state;
  // Shape-swap (selection-toolbar "shape-swap" action, W3): preserves
  // geometry/label/parentId/body — only `type` + the derived `style.shape`
  // change, plus the section-only title/tint fields, which are seeded (on
  // swap-into-section) or cleared (on swap-away-from-section) since every
  // other type's renderer ignores them anyway.
  const becomingSection = action.objectType === "section";
  const wasSection = existing.type === "section";
  const document = {
    ...state.document,
    objects: state.document.objects.map((object) =>
      object.id === action.objectId
        ? {
            ...object,
            type: action.objectType,
            style: { ...object.style, shape: shapeForType(action.objectType) },
            title: becomingSection ? object.title ?? object.label : wasSection ? undefined : object.title,
            tint: becomingSection ? object.tint ?? "gray" : wasSection ? undefined : object.tint,
          }
        : object,
    ),
  };
  return withHistory(state, document, {
    source: "human",
    summary: `Changed shape to ${objectTypeLabel(action.objectType)}`,
    changedObjectIds: [action.objectId],
    changedConnectionIds: [],
    changedAnnotationIds: [],
  });
}

export function handleDeleteSelection(
  state: InteractiveCanvasState,
): InteractiveCanvasState {
  if (state.selection.kind === "connection") {
    const connectionId = state.selection.connectionId;
    if (!state.document.connections.some((connection) => connection.id === connectionId)) {
      return state;
    }
    return withHistory(
      { ...state, selection: { kind: "none" } },
      removeConnection(state.document, connectionId),
      {
        source: "human",
        summary: "Deleted connector",
        changedObjectIds: [],
        changedConnectionIds: [connectionId],
        changedAnnotationIds: [],
      },
    );
  }
  const ids = selectedObjectIds(state.selection);
  if (ids.length === 0) return state;
  const idSet = new Set(ids);
  const document = {
    ...state.document,
    objects: state.document.objects.filter((object) => !idSet.has(object.id)),
    connections: state.document.connections.filter(
      (connection) =>
        !idSet.has(connection.from.objectId) && !idSet.has(connection.to.objectId),
    ),
    links: state.document.links?.filter((link) => !idSet.has(link.objectId)),
    annotations: state.document.annotations?.filter((annotation) => {
      return !(annotation.target.kind === "object" && idSet.has(annotation.target.objectId));
    }),
  };
  return withHistory({ ...state, selection: { kind: "none" } }, document, {
    source: "human",
    summary: "Deleted selection",
    changedObjectIds: ids,
    changedConnectionIds: [],
    changedAnnotationIds: [],
  });
}
