"use client";

import { createObjectId, snapGeometry } from "../geometry";
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../schema";
import { FIRST_USE_COLORS, objectTypeLabel } from "../schema/object-defaults";
import { nextId } from "./helpers";
import { withHistory } from "./history";
import type { CanvasAction, InteractiveCanvasState } from "./types";

export function hasValidConnectionAnchor(anchor: unknown): boolean {
  return (
    anchor === undefined ||
    anchor === "top" ||
    anchor === "right" ||
    anchor === "bottom" ||
    anchor === "left" ||
    anchor === "center"
  );
}

export function hasValidEndpoint(
  document: InteractiveCanvasDocument,
  endpoint: InteractiveCanvasConnection["from"] | undefined,
): boolean {
  if (!endpoint) return true;
  return (
    document.objects.some((object) => object.id === endpoint.objectId) &&
    hasValidConnectionAnchor(endpoint.anchor)
  );
}

function sameEndpointPosition(
  a: InteractiveCanvasConnection["from"]["position"],
  b: InteractiveCanvasConnection["from"]["position"],
): boolean {
  if (!a || !b) return !a && !b;
  return a[0] === b[0] && a[1] === b[1];
}

function endpointChanged(
  previous: InteractiveCanvasConnection["from"],
  next: InteractiveCanvasConnection["from"],
): boolean {
  return (
    next.objectId !== previous.objectId ||
    next.anchor !== previous.anchor ||
    !sameEndpointPosition(next.position, previous.position)
  );
}

export function removeConnection(
  document: InteractiveCanvasDocument,
  connectionId: string,
): InteractiveCanvasDocument {
  return {
    ...document,
    connections: document.connections.filter((connection) => connection.id !== connectionId),
    annotations: document.annotations?.filter((annotation) => {
      return !(
        annotation.target.kind === "connection" &&
        annotation.target.connectionId === connectionId
      );
    }),
  };
}

function duplicateSourceObjectForQuickConnect(
  source: InteractiveCanvasObject,
  id: string,
  point: { x: number; y: number },
): InteractiveCanvasObject {
  const { width, height } = source.geometry;
  return {
    id,
    type: source.type,
    text: "",
    ...(source.color ? { color: source.color } : {}),
    parentId: source.parentId ?? null,
    geometry: snapGeometry({
      x: point.x - width / 2,
      y: point.y - height / 2,
      width,
      height,
    }),
    ...(source.style ? { style: { ...source.style } } : {}),
    ...(source.layout ? { layout: { ...source.layout } } : {}),
    ...(source.direction ? { direction: source.direction } : {}),
    ...(typeof source.language === "string" ? { language: source.language } : {}),
    ...(typeof source.author === "string" ? { author: source.author } : {}),
    ...(source.icon ? { icon: source.icon } : {}),
  };
}

export function handleAddConnection(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.addConnection" }>,
): InteractiveCanvasState {
  const id = nextId(
    "connection",
    state.document.connections.map((connection) => connection.id),
  );
  const connection: InteractiveCanvasConnection = {
    id,
    from: { objectId: action.fromObjectId, anchor: action.fromAnchor },
    to: {
      objectId: action.toObjectId,
      anchor: action.toAnchor,
      ...(action.toPosition ? { position: action.toPosition } : {}),
    },
    label: action.label,
    style: action.style ?? "solid",
    arrow: action.arrow ?? "forward",
    color: FIRST_USE_COLORS.connector,
  };
  return withHistory(
    {
      ...state,
      selection: { kind: "connection", connectionId: id },
    },
    {
      ...state.document,
      connections: [...state.document.connections, connection],
    },
    {
      source: "human",
      summary: "Added connector",
      changedObjectIds: [],
      changedConnectionIds: [id],
      changedAnnotationIds: [],
    },
  );
}

export function handleQuickConnect(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.quickConnect" }>,
): InteractiveCanvasState {
  const fromObject = state.document.objects.find((object) => object.id === action.fromObjectId);
  if (!fromObject) return state;

  const connectionId = nextId(
    "connection",
    state.document.connections.map((connection) => connection.id),
  );

  const drop = action.drop;
  if ("objectId" in drop) {
    // Connect to an existing object.
    if (drop.objectId === action.fromObjectId) return state;
    const toObject = state.document.objects.find((object) => object.id === drop.objectId);
    if (!toObject) return state;
    const connection: InteractiveCanvasConnection = {
      id: connectionId,
      from: { objectId: action.fromObjectId, anchor: action.fromAnchor },
      to: { objectId: drop.objectId, anchor: drop.anchor },
      style: "solid",
      arrow: "forward",
      color: FIRST_USE_COLORS.connector,
    };
    return withHistory(
      { ...state, selection: { kind: "connection", connectionId } },
      { ...state.document, connections: [...state.document.connections, connection] },
      {
        source: "human",
        summary: "Connected to object",
        changedObjectIds: [],
        changedConnectionIds: [connectionId],
        changedAnnotationIds: [],
      },
    );
  }

  // Create-and-connect: drop on empty canvas duplicates the source object
  // centered at the drop point, then connects to it — one history entry.
  const point = drop.point;
  const newObjectId = createObjectId(
    state.document,
    fromObject.text.trim() || objectTypeLabel(fromObject.type),
  );
  const newObject = duplicateSourceObjectForQuickConnect(fromObject, newObjectId, point);
  const connection: InteractiveCanvasConnection = {
    id: connectionId,
    from: { objectId: action.fromObjectId, anchor: action.fromAnchor },
    to: { objectId: newObjectId },
    style: "solid",
    arrow: "forward",
    color: FIRST_USE_COLORS.connector,
  };
  return withHistory(
    { ...state, selection: { kind: "objects", objectIds: [newObjectId] } },
    {
      ...state.document,
      objects: [...state.document.objects, newObject],
      connections: [...state.document.connections, connection],
    },
    {
      source: "human",
      summary: `Added connected ${objectTypeLabel(fromObject.type)}`,
      changedObjectIds: [newObjectId],
      changedConnectionIds: [connectionId],
      changedAnnotationIds: [],
    },
  );
}

export function handleUpdateConnection(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.updateConnection" }>,
): InteractiveCanvasState {
  const existing = state.document.connections.find(
    (connection) => connection.id === action.connectionId,
  );
  if (!existing) return state;
  if (!hasValidEndpoint(state.document, action.patch.from)) return state;
  if (!hasValidEndpoint(state.document, action.patch.to)) return state;

  const mergedFrom = action.patch.from ?? existing.from;
  const mergedTo = action.patch.to ?? existing.to;
  if (mergedFrom.objectId === mergedTo.objectId) return state;

  const endpointsChanged =
    endpointChanged(existing.from, mergedFrom) ||
    endpointChanged(existing.to, mergedTo);
  const patch =
    endpointsChanged &&
    (existing.waypoints !== undefined || action.patch.waypoints !== undefined)
      ? { ...action.patch, waypoints: undefined }
      : action.patch;
  const updatedConnection: InteractiveCanvasConnection = {
    ...existing,
    ...patch,
    from: mergedFrom,
    to: mergedTo,
  };
  const patchKeys = Object.keys(action.patch);
  const labelOnlyChanged = patchKeys.length === 1 && patchKeys[0] === "label";
  const document = {
    ...state.document,
    connections: state.document.connections.map((connection) =>
      connection.id === action.connectionId ? updatedConnection : connection,
    ),
  };
  return withHistory(state, document, {
    source: "human",
    summary: endpointsChanged
      ? "Reconnected connector"
      : labelOnlyChanged
        ? "Edited connector label"
        : "Updated connector",
    changedObjectIds: [],
    changedConnectionIds: [action.connectionId],
    changedAnnotationIds: [],
  });
}

export function handleDeleteConnection(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.deleteConnection" }>,
): InteractiveCanvasState {
  if (!state.document.connections.some((connection) => connection.id === action.connectionId)) {
    return state;
  }
  const shouldClearSelection =
    state.selection.kind === "connection" &&
    state.selection.connectionId === action.connectionId;
  return withHistory(
    shouldClearSelection ? { ...state, selection: { kind: "none" } } : state,
    removeConnection(state.document, action.connectionId),
    {
      source: "human",
      summary: "Deleted connector",
      changedObjectIds: [],
      changedConnectionIds: [action.connectionId],
      changedAnnotationIds: [],
    },
  );
}
