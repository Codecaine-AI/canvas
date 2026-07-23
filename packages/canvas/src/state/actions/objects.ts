"use client";

import { createObjectId, sectionDescendantIds, snapGeometry } from "../geometry";
import type { CanvasObjectStyle, InteractiveCanvasConnection, InteractiveCanvasObject } from "../schema";
import { removeConnection } from "./connections";
import {
  colorKindForType,
  defaultGeometryFor,
  draftPlacedObject,
  objectTypeLabel,
  shapeForType,
} from "../schema/object-defaults";
import { nextId, selectedObjectIds } from "./helpers";
import { withHistory } from "./history";
import type { CanvasAction, InteractiveCanvasState } from "./types";

/**
 * Merge an object patch the way canvas.updateObject does: geometry snaps to
 * the grid, style patches merge per-key (undefined deletes). Shared with the
 * agent apply path (./agent-patch.ts) so agent updates behave exactly like
 * human ones.
 */
export function mergeObjectPatch(
  object: InteractiveCanvasObject,
  patch: Partial<Omit<InteractiveCanvasObject, "id">>,
): InteractiveCanvasObject {
  const geometry = patch.geometry
    ? snapGeometry(patch.geometry)
      : object.geometry;
  const merged: InteractiveCanvasObject = {
    ...object,
    ...patch,
    geometry,
    // undefined in a style patch deletes the key.
    style: patch.style
      ? (Object.fromEntries(
          Object.entries({ ...object.style, ...patch.style }).filter(([, value]) => value !== undefined),
        ) as CanvasObjectStyle)
      : object.style,
  };
  return merged;
}

export function handleAddObject(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.addObject" }>,
): InteractiveCanvasState {
  // Display name for the id slug + history summary: the seeded text when
  // non-empty, the type label otherwise (fresh stickies/code blocks start
  // with empty text — see defaultTextFor).
  const displayName = action.text?.trim() ? action.text : objectTypeLabel(action.objectType);
  const id = createObjectId(state.document, displayName);
  const rememberedColor = state.lastPickedColor[colorKindForType(action.objectType)];
  // draftPlacedObject is the same builder the armed-tool ghost preview renders,
  // so the placed object matches the preview exactly (id/parent/snap aside).
  const object: InteractiveCanvasObject = draftPlacedObject(
    action.objectType,
    snapGeometry(action.geometry ?? defaultGeometryFor(action.objectType)),
    {
      id,
      text: action.text,
      parentId: action.parentId ?? null,
      // D17 — new objects take the last-picked color for their kind unless
      // the action pins one explicitly.
      color: action.color ?? rememberedColor,
      direction: action.direction,
      icon: action.icon,
    },
  );
  return withHistory(
    {
      ...state,
      selection: { kind: "objects", objectIds: [id] },
    },
    { ...state.document, objects: [...state.document.objects, object] },
    {
      source: "human",
      summary: `Added ${displayName}`,
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
    const id = createObjectId(document, object.text.trim() || objectTypeLabel(object.type));
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
    const id = collides
      ? createObjectId(objectDocument, object.text.trim() || objectTypeLabel(object.type))
      : object.id;
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
      object.id === action.objectId ? mergeObjectPatch(object, action.patch) : object,
    ),
  };
  // D17 — a color patch IS a pick: remember it in the patched object's
  // per-kind memory bucket so the next created object of that kind takes it.
  const patchedObject = state.document.objects.find((object) => object.id === action.objectId);
  const nextState =
    typeof action.patch.color === "string" && patchedObject
      ? {
          ...state,
          lastPickedColor: {
            ...state.lastPickedColor,
            [colorKindForType(patchedObject.type)]: action.patch.color,
          },
        }
      : state;
  return withHistory(nextState, document, {
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
  // geometry/text/color/parentId — only `type` + the derived `style.shape`
  // change (a color pick is a direction, D12: the new kind's role table
  // decides how the carried-over pick renders). The unified `text` field
  // carries over unchanged.
  const document = {
    ...state.document,
    objects: state.document.objects.map((object) =>
      object.id === action.objectId
        ? {
            ...object,
            type: action.objectType,
            style: { ...object.style, shape: shapeForType(action.objectType) },
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
  // W6 — deleting a section deletes its recorded members too: fold in the
  // transitive parentId-descendants of every selected section, so the
  // existing connection/annotation cascades below cover them as well.
  for (const id of ids) {
    const object = state.document.objects.find((candidate) => candidate.id === id);
    if (object?.type !== "section") continue;
    for (const descendantId of sectionDescendantIds(state.document, id)) {
      idSet.add(descendantId);
    }
  }
  const deletedIds = [...idSet];
  const document = {
    ...state.document,
    objects: state.document.objects.filter((object) => !idSet.has(object.id)),
    connections: state.document.connections.filter(
      (connection) =>
        !idSet.has(connection.from.objectId) && !idSet.has(connection.to.objectId),
    ),
    annotations: state.document.annotations?.filter((annotation) => {
      return !(annotation.target.kind === "object" && idSet.has(annotation.target.objectId));
    }),
  };
  return withHistory({ ...state, selection: { kind: "none" } }, document, {
    source: "human",
    summary: "Deleted selection",
    changedObjectIds: deletedIds,
    changedConnectionIds: [],
    changedAnnotationIds: [],
  });
}
