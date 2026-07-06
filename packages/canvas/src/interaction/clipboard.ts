"use client";

import type { CanvasSelection } from "../state/actions";
import { boundsForGeometries, type CanvasPoint } from "../state/geometry";
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../state/schema";

export type CanvasClipboardPayload = {
  objects: InteractiveCanvasObject[];
  connections: InteractiveCanvasConnection[];
  /** Bounds-derived anchor point (e.g. top-left or center of the copied selection) used to compute paste offset when no target point is given. */
  sourcePoint: CanvasPoint;
};

let clipboardMemory: CanvasClipboardPayload | null = null;

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function collectDescendantIds(
  document: InteractiveCanvasDocument,
  rootIds: Set<string>,
): Set<string> {
  const children = new Map<string, string[]>();
  for (const object of document.objects) {
    if (!object.parentId) continue;
    const list = children.get(object.parentId) ?? [];
    list.push(object.id);
    children.set(object.parentId, list);
  }
  const result = new Set<string>();
  const stack = Array.from(rootIds).flatMap((id) => children.get(id) ?? []);
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return result;
}

export function setClipboardMemory(payload: CanvasClipboardPayload | null): void {
  clipboardMemory = payload;
}

export function getClipboardMemory(): CanvasClipboardPayload | null {
  return clipboardMemory;
}

export function copySelection(
  document: InteractiveCanvasDocument,
  selection: CanvasSelection,
): CanvasClipboardPayload | null {
  if (selection.kind !== "objects" || selection.objectIds.length === 0) return null;

  const selectedIds = new Set(selection.objectIds);
  const capturedIds = new Set([...selectedIds, ...collectDescendantIds(document, selectedIds)]);
  const capturedObjects = document.objects.filter((object) => capturedIds.has(object.id));
  if (capturedObjects.length === 0) return null;

  const bounds = boundsForGeometries(capturedObjects.map((object) => object.geometry));
  if (!bounds) return null;

  const connections = document.connections.filter(
    (connection) =>
      capturedIds.has(connection.from.objectId) && capturedIds.has(connection.to.objectId),
  );

  return {
    objects: cloneValue(capturedObjects),
    connections: cloneValue(connections),
    sourcePoint: {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    },
  };
}

export function buildPastePayload(
  clipboard: CanvasClipboardPayload,
  targetPoint?: CanvasPoint,
): { objects: InteractiveCanvasObject[]; connections: InteractiveCanvasConnection[] } {
  const dx = targetPoint ? targetPoint.x - clipboard.sourcePoint.x : 24;
  const dy = targetPoint ? targetPoint.y - clipboard.sourcePoint.y : 24;
  const objects = cloneValue(clipboard.objects).map((object) => ({
    ...object,
    geometry: {
      ...object.geometry,
      x: object.geometry.x + dx,
      y: object.geometry.y + dy,
    },
  }));

  // W4 — explicit connection waypoints are absolute world coords: translate
  // them by the same paste offset as the objects so fans paste intact.
  const connections = cloneValue(clipboard.connections).map((connection) => ({
    ...connection,
    waypoints: connection.waypoints?.map(([x, y]) => [x + dx, y + dy] as [number, number]),
  }));

  return {
    objects,
    connections,
  };
}
