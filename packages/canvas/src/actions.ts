"use client";

import {
  alignObjects,
  createObjectId,
  distributeObjects,
  fitContainerToChildren,
  snapGeometry,
} from "./geometry";
import type { Anchor } from "./routing";
import type {
  CanvasAnnotationTarget,
  CanvasArrowDirection,
  CanvasConnectionStyle,
  CanvasGeometry,
  CanvasLinkStatus,
  CanvasObjectStyle,
  InteractiveCanvasAnnotation,
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
  InteractiveCanvasTone,
} from "./schema";

export type CanvasTool =
  | "select"
  | "hand"
  | "container"
  | "process"
  | "decision"
  | "text"
  | "sticky"
  | "source-node"
  | "annotation-marker"
  | "annotation"
  // D16 — expanded vocabulary (checkpoint 5):
  | "document"
  | "person"
  | "database"
  | "chat"
  // W2 — FigJam sections + V2 Flow shape vocabulary:
  | "section"
  | "pill"
  | "arrow-shape"
  | "predefined-process"
  | "code-block"
  | "chip-icon";

export type CanvasSelection =
  | { kind: "none" }
  | { kind: "objects"; objectIds: string[] }
  | { kind: "connection"; connectionId: string }
  | { kind: "annotation"; annotationId: string }
  | { kind: "region"; region: CanvasGeometry };

export type CanvasAgentPatchOperation =
  | {
      type: "addObject";
      object: InteractiveCanvasObject;
    }
  | {
      type: "updateObject";
      objectId: string;
      patch: Partial<Omit<InteractiveCanvasObject, "id">>;
    }
  | {
      type: "addConnection";
      connection: InteractiveCanvasConnection;
    }
  | {
      type: "addAnnotation";
      annotation: InteractiveCanvasAnnotation;
    }
  | {
      type: "fitContainerToChildren";
      containerId: string;
      padding?: number;
    };

export type CanvasAction =
  | { type: "canvas.select"; selection: CanvasSelection }
  | { type: "canvas.setTool"; tool: CanvasTool }
  | {
      type: "canvas.addObject";
      objectType: InteractiveCanvasObjectType;
      label?: string;
      parentId?: string | null;
      geometry?: CanvasGeometry;
      tone?: InteractiveCanvasTone;
    }
  | { type: "canvas.duplicateSelection" }
  | {
      type: "canvas.addObjects";
      objects: InteractiveCanvasObject[];
      connections?: InteractiveCanvasConnection[];
      select?: boolean;
    }
  | {
      type: "canvas.updateObject";
      objectId: string;
      patch: Partial<Omit<InteractiveCanvasObject, "id">>;
    }
  | {
      type: "canvas.setObjectType";
      objectId: string;
      objectType: InteractiveCanvasObjectType;
    }
  | { type: "canvas.deleteSelection" }
  | {
      type: "canvas.moveSelection";
      dx: number;
      dy: number;
      snap?: boolean;
    }
  | {
      type: "canvas.resizeObject";
      objectId: string;
      width: number;
      height: number;
      snap?: boolean;
    }
  | {
      type: "canvas.updateObjectGeometries";
      geometries: Record<string, CanvasGeometry>;
      recordHistory?: boolean;
      snap?: boolean;
      summary?: string;
    }
  | {
      type: "canvas.setParent";
      objectIds: string[];
      parentId: string | null;
    }
  | {
      type: "canvas.addConnection";
      fromObjectId: string;
      toObjectId: string;
      label?: string;
      style?: CanvasConnectionStyle;
      arrow?: CanvasArrowDirection;
      fromAnchor?: Anchor;
      toAnchor?: Anchor;
      /**
       * Exact relative attach point on the `to` object's bounds, [0..1, 0..1]
       * (W3b): stored as the endpoint's `position` when a connector-create
       * drop snapped to the shape's outline off-anchor (or to a true-outline
       * anchor that isn't the bbox side midpoint). Routing honors it over the
       * coarse `toAnchor` side.
       */
      toPosition?: [number, number];
    }
  | {
      type: "canvas.updateConnection";
      connectionId: string;
      patch: Partial<Omit<InteractiveCanvasConnection, "id">>;
    }
  | {
      type: "canvas.deleteConnection";
      connectionId: string;
    }
  | {
      type: "canvas.quickConnect";
      fromObjectId: string;
      fromAnchor: Anchor;
      drop:
        | { objectId: string; anchor: Anchor }
        | { point: { x: number; y: number } };
    }
  | {
      type: "canvas.addAnnotation";
      target: CanvasAnnotationTarget;
      body: string;
      intent?: "note" | "agent-request";
    }
  | {
      type: "canvas.alignSelection";
      axis: "left" | "center-x" | "right" | "top" | "center-y" | "bottom";
    }
  | { type: "canvas.distributeSelection"; axis: "horizontal" | "vertical" }
  | { type: "canvas.fitContainerToChildren"; containerId: string; padding?: number }
  | {
      type: "canvas.resolveLinkStatuses";
      knownPaths: string[];
      stalePaths?: string[];
      checkedAt?: string;
    }
  | { type: "canvas.undo" }
  | { type: "canvas.redo" }
  | { type: "canvas.reset"; document: InteractiveCanvasDocument };

export type CanvasChangeSummary = {
  source: "human" | "agent";
  summary: string;
  changedObjectIds: string[];
  changedConnectionIds: string[];
  changedAnnotationIds: string[];
};

export type InteractiveCanvasState = {
  document: InteractiveCanvasDocument;
  selection: CanvasSelection;
  tool: CanvasTool;
  history: {
    past: InteractiveCanvasDocument[];
    future: InteractiveCanvasDocument[];
  };
  lastChange?: CanvasChangeSummary;
};

export function defaultGeometryFor(type: InteractiveCanvasObjectType): CanvasGeometry {
  if (type === "container") return { x: 80, y: 80, width: 360, height: 240 };
  if (type === "decision") return { x: 160, y: 160, width: 160, height: 112 };
  if (type === "sticky") return { x: 180, y: 180, width: 176, height: 128 };
  if (type === "annotation-marker") return { x: 220, y: 220, width: 40, height: 40 };
  if (type === "document") return { x: 160, y: 160, width: 160, height: 120 };
  if (type === "person") return { x: 160, y: 160, width: 120, height: 140 };
  if (type === "database") return { x: 160, y: 160, width: 140, height: 120 };
  if (type === "chat") return { x: 160, y: 160, width: 180, height: 110 };
  // W2 — sections default large (they're meant to wrap other objects, so a
  // container-like footprint reads better than a shape-sized default).
  if (type === "section") return { x: 80, y: 80, width: 480, height: 360 };
  if (type === "pill") return { x: 160, y: 160, width: 200, height: 64 };
  // W2 — arrow-shape default matches the reference proportions (361x100
  // logical) at a comfortable placement size.
  if (type === "arrow-shape") return { x: 160, y: 160, width: 361, height: 100 };
  if (type === "predefined-process") return { x: 160, y: 160, width: 200, height: 100 };
  if (type === "code-block") return { x: 160, y: 160, width: 320, height: 200 };
  if (type === "chip-icon") return { x: 160, y: 160, width: 120, height: 140 };
  return { x: 160, y: 160, width: 184, height: 96 };
}

export function objectTypeLabel(type: InteractiveCanvasObjectType): string {
  if (type === "container") return "Container";
  if (type === "process") return "Process";
  if (type === "decision") return "Decision";
  if (type === "text") return "Text";
  if (type === "sticky") return "Sticky";
  if (type === "source-node") return "Source Node";
  if (type === "document") return "Document";
  if (type === "person") return "Person";
  if (type === "database") return "Database";
  if (type === "chat") return "Chat";
  if (type === "section") return "Section";
  if (type === "pill") return "Pill";
  if (type === "arrow-shape") return "Arrow";
  if (type === "predefined-process") return "Predefined Process";
  if (type === "code-block") return "Code Block";
  if (type === "chip-icon") return "Chip";
  return "Annotation";
}

function toneForType(type: InteractiveCanvasObjectType): InteractiveCanvasTone {
  if (type === "container") return "neutral";
  if (type === "decision") return "decision";
  if (type === "sticky") return "warning";
  if (type === "source-node") return "agent";
  if (type === "annotation-marker") return "annotation";
  if (type === "document") return "memory";
  if (type === "person") return "input";
  if (type === "database") return "memory";
  if (type === "chat") return "process";
  // W2 — new shapes resolve their fill/stroke from figjam-tokens (pastel
  // pairs / fixed tokens) via theme.ts, not the tone system; "neutral" here
  // is an inert fallback that's never actually read for these types.
  if (type === "section") return "neutral";
  if (type === "pill") return "input";
  if (type === "arrow-shape") return "process";
  if (type === "predefined-process") return "memory";
  if (type === "code-block") return "neutral";
  if (type === "chip-icon") return "neutral";
  return "process";
}

/** Shape name for a given object type, used by canvas.addObject to set style.shape. */
function shapeForType(type: InteractiveCanvasObjectType): CanvasObjectStyle["shape"] {
  if (type === "decision") return "diamond";
  if (type === "sticky") return "note";
  if (type === "annotation-marker") return "marker";
  if (type === "document") return "document";
  if (type === "person") return "person";
  if (type === "database") return "database";
  if (type === "chat") return "chat";
  if (type === "section") return "section";
  if (type === "pill") return "pill";
  if (type === "arrow-shape") return "arrow-shape";
  if (type === "predefined-process") return "predefined-process";
  if (type === "code-block") return "code-block";
  if (type === "chip-icon") return "chip-icon";
  return "rounded-rect";
}

function withHistory(
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

function selectedObjectIds(selection: CanvasSelection): string[] {
  return selection.kind === "objects" ? selection.objectIds : [];
}

function hasValidConnectionAnchor(anchor: unknown): boolean {
  return (
    anchor === undefined ||
    anchor === "top" ||
    anchor === "right" ||
    anchor === "bottom" ||
    anchor === "left" ||
    anchor === "center"
  );
}

function hasValidEndpoint(
  document: InteractiveCanvasDocument,
  endpoint: InteractiveCanvasConnection["from"] | undefined,
): boolean {
  if (!endpoint) return true;
  return (
    document.objects.some((object) => object.id === endpoint.objectId) &&
    hasValidConnectionAnchor(endpoint.anchor)
  );
}

function removeConnection(
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

function nextId(prefix: string, ids: Iterable<string>): string {
  const used = new Set(ids);
  let index = 1;
  while (used.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

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

/** Float tolerance for comparing endpoint-owner movement deltas (world px). */
const WAYPOINT_DELTA_EPSILON = 0.01;

/**
 * W4 stale-waypoint reconciliation — explicit `connection.waypoints` are
 * absolute world coordinates, so any action that moves objects must keep them
 * coherent. Compares each waypointed connection's endpoint owners between the
 * pre- and post-action documents:
 *
 *  - BOTH owners translated by the SAME delta (rigid case — e.g. both riding a
 *    carried section, a multi-select drag, or a nudge) → translate every
 *    waypoint by that delta, preserving trunk-and-branch fan shapes.
 *  - Only one owner moved, deltas differ, or either owner resized → DROP the
 *    waypoints (undefined) so the connector falls back to auto-routing rather
 *    than sweeping through stale space (FigJam's re-route-on-asymmetric-move).
 *
 * Runs inside the reducer choke point (see reduceInteractiveCanvasState), so
 * the waypoint change shares the action's history entry — one undo restores
 * both geometry and waypoints.
 */
function reconcileConnectionWaypoints(
  previous: InteractiveCanvasDocument,
  next: InteractiveCanvasDocument,
): InteractiveCanvasDocument {
  if (!next.connections.some((connection) => connection.waypoints?.length)) return next;

  const previousById = new Map(previous.objects.map((object) => [object.id, object]));
  const nextById = new Map(next.objects.map((object) => [object.id, object]));

  type OwnerMove = { dx: number; dy: number; resized: boolean } | null;
  const ownerMove = (objectId: string): OwnerMove => {
    const before = previousById.get(objectId);
    const after = nextById.get(objectId);
    // Newly-created or deleted owners have no movement to reconcile against
    // (duplicate/paste translate their cloned waypoints at creation time).
    if (!before || !after) return null;
    return {
      dx: after.geometry.x - before.geometry.x,
      dy: after.geometry.y - before.geometry.y,
      resized:
        Math.abs(after.geometry.width - before.geometry.width) > WAYPOINT_DELTA_EPSILON ||
        Math.abs(after.geometry.height - before.geometry.height) > WAYPOINT_DELTA_EPSILON,
    };
  };

  let changed = false;
  const connections = next.connections.map((connection) => {
    if (!connection.waypoints || connection.waypoints.length === 0) return connection;
    const fromMove = ownerMove(connection.from.objectId);
    const toMove = ownerMove(connection.to.objectId);
    if (!fromMove || !toMove) return connection;

    const moved =
      Math.abs(fromMove.dx) > WAYPOINT_DELTA_EPSILON ||
      Math.abs(fromMove.dy) > WAYPOINT_DELTA_EPSILON ||
      Math.abs(toMove.dx) > WAYPOINT_DELTA_EPSILON ||
      Math.abs(toMove.dy) > WAYPOINT_DELTA_EPSILON ||
      fromMove.resized ||
      toMove.resized;
    if (!moved) return connection;

    const rigid =
      !fromMove.resized &&
      !toMove.resized &&
      Math.abs(fromMove.dx - toMove.dx) < WAYPOINT_DELTA_EPSILON &&
      Math.abs(fromMove.dy - toMove.dy) < WAYPOINT_DELTA_EPSILON;

    changed = true;
    if (rigid) {
      return {
        ...connection,
        waypoints: connection.waypoints.map(
          ([x, y]) => [x + fromMove.dx, y + fromMove.dy] as [number, number],
        ),
      };
    }
    return { ...connection, waypoints: undefined };
  });

  if (!changed) return next;
  return { ...next, connections };
}

/**
 * Reducer entry point. Wraps the action switch (reduceCanvasAction) with the
 * stale-waypoint choke point: every action that commits geometry changes —
 * drag/section-carry commits (canvas.updateObjectGeometries, both the history
 * and live-preview branches), nudges (canvas.moveSelection), resize, align/
 * distribute, fit-container, inspector geometry patches (canvas.updateObject)
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
  if (action.type === "canvas.reset") {
    return createInteractiveCanvasState(action.document);
  }
  if (action.type === "canvas.undo") {
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
  if (action.type === "canvas.redo") {
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

  if (action.type === "canvas.addObject") {
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

  if (action.type === "canvas.duplicateSelection") {
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

  if (action.type === "canvas.addObjects") {
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

  if (action.type === "canvas.updateObject") {
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

  if (action.type === "canvas.setObjectType") {
    const existing = state.document.objects.find((object) => object.id === action.objectId);
    if (!existing || existing.type === action.objectType) return state;
    // Shape-swap (context-toolbar "shape-swap" action, W3): preserves
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

  if (action.type === "canvas.moveSelection") {
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

  if (action.type === "canvas.resizeObject") {
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

  if (action.type === "canvas.updateObjectGeometries") {
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

  if (action.type === "canvas.setParent") {
    const objectIdSet = new Set(action.objectIds);
    const objectById = new Map(state.document.objects.map((object) => [object.id, object]));
    const parent = action.parentId ? objectById.get(action.parentId) : null;
    if (action.parentId && parent?.type !== "container") return state;
    if (action.parentId && objectIdSet.has(action.parentId)) return state;

    let ancestorId = parent?.parentId ?? null;
    while (ancestorId) {
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

  if (action.type === "canvas.addConnection") {
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

  if (action.type === "canvas.quickConnect") {
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

    // Create-and-connect: drop on empty canvas creates a new process object
    // centered at the drop point, then connects to it — one history entry.
    const point = drop.point;
    const size = defaultGeometryFor("process");
    const label = objectTypeLabel("process");
    const newObjectId = createObjectId(state.document, label);
    const newObject: InteractiveCanvasObject = {
      id: newObjectId,
      type: "process",
      label,
      parentId: fromObject.parentId ?? null,
      geometry: snapGeometry({
        x: point.x - size.width / 2,
        y: point.y - size.height / 2,
        width: size.width,
        height: size.height,
      }),
      style: { tone: toneForType("process"), shape: "rounded-rect" },
    };
    const connection: InteractiveCanvasConnection = {
      id: connectionId,
      from: { objectId: action.fromObjectId, anchor: action.fromAnchor },
      to: { objectId: newObjectId },
      style: "solid",
      arrow: "forward",
    };
    return withHistory(
      { ...state, selection: { kind: "connection", connectionId } },
      {
        ...state.document,
        objects: [...state.document.objects, newObject],
        connections: [...state.document.connections, connection],
      },
      {
        source: "human",
        summary: "Added connected process",
        changedObjectIds: [newObjectId],
        changedConnectionIds: [connectionId],
        changedAnnotationIds: [],
      },
    );
  }

  if (action.type === "canvas.updateConnection") {
    const existing = state.document.connections.find(
      (connection) => connection.id === action.connectionId,
    );
    if (!existing) return state;
    if (!hasValidEndpoint(state.document, action.patch.from)) return state;
    if (!hasValidEndpoint(state.document, action.patch.to)) return state;

    const mergedFrom = action.patch.from ?? existing.from;
    const mergedTo = action.patch.to ?? existing.to;
    if (mergedFrom.objectId === mergedTo.objectId) return state;

    const updatedConnection: InteractiveCanvasConnection = {
      ...existing,
      ...action.patch,
      from: mergedFrom,
      to: mergedTo,
    };
    const endpointsChanged =
      mergedFrom.objectId !== existing.from.objectId ||
      mergedFrom.anchor !== existing.from.anchor ||
      mergedTo.objectId !== existing.to.objectId ||
      mergedTo.anchor !== existing.to.anchor;
    const document = {
      ...state.document,
      connections: state.document.connections.map((connection) =>
        connection.id === action.connectionId ? updatedConnection : connection,
      ),
    };
    return withHistory(state, document, {
      source: "human",
      summary: endpointsChanged ? "Reconnected connector" : "Updated connector",
      changedObjectIds: [],
      changedConnectionIds: [action.connectionId],
      changedAnnotationIds: [],
    });
  }

  if (action.type === "canvas.deleteConnection") {
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

  if (action.type === "canvas.addAnnotation") {
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

  if (action.type === "canvas.deleteSelection") {
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

  if (action.type === "canvas.alignSelection") {
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

  if (action.type === "canvas.distributeSelection") {
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

  if (action.type === "canvas.fitContainerToChildren") {
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

  if (action.type === "canvas.resolveLinkStatuses") {
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

