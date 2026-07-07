"use client";

/**
 * Pure, DOM-free hit-testing and geometry-gathering helpers shared by the
 * interaction state machine (interaction.ts) and its gesture steppers. No
 * gesture state lives here — everything is a straight function of the
 * document + a world point/bounds, so it's independently unit-testable.
 */
import { boundsForGeometries, boundsIntersect, type CanvasBounds, type CanvasPoint } from "../state/geometry";
import type { CanvasGeometry, InteractiveCanvasDocument, InteractiveCanvasObject } from "../state/schema";

export function objectGeometryMap(
  document: InteractiveCanvasDocument,
  objectIds: string[],
): Record<string, CanvasGeometry> {
  const ids = new Set(objectIds);
  const result: Record<string, CanvasGeometry> = {};
  for (const object of document.objects) {
    if (ids.has(object.id)) result[object.id] = object.geometry;
  }
  return result;
}

/**
 * Returns descendants (transitively) of `containerId`, not including itself.
 */
export function descendantIds(document: InteractiveCanvasDocument, containerId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const object of document.objects) {
    if (!object.parentId) continue;
    const list = children.get(object.parentId) ?? [];
    list.push(object.id);
    children.set(object.parentId, list);
  }
  const result = new Set<string>();
  const stack = [...(children.get(containerId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === containerId) continue;
    if (result.has(id)) continue;
    result.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return result;
}

/**
 * Hit-tests world point against document objects, topmost-first (later objects in
 * the array render on top, mirroring CanvasStage's render order).
 */
export function hitTestObjects(
  document: InteractiveCanvasDocument,
  worldPoint: CanvasPoint,
): InteractiveCanvasObject | null {
  for (let index = document.objects.length - 1; index >= 0; index -= 1) {
    const object = document.objects[index]!;
    const { x, y, width, height } = object.geometry;
    const inside =
      worldPoint.x >= x && worldPoint.x <= x + width && worldPoint.y >= y && worldPoint.y <= y + height;
    if (inside) return object;
  }
  return null;
}

/** Reuses boundsForGeometries to compute the union bounds of a selection. */
export function selectionBounds(
  document: InteractiveCanvasDocument,
  objectIds: string[],
): CanvasBounds | null {
  const geometries = document.objects
    .filter((object) => objectIds.includes(object.id))
    .map((object) => object.geometry);
  return boundsForGeometries(geometries);
}

/**
 * Candidate bounds for live snap guides while dragging `objectIds`: siblings
 * sharing the dragged set's parent, plus every section (sections act as
 * alignment targets regardless of nesting level), excluding the dragged
 * objects themselves.
 */
export function gatherSnapCandidates(
  document: InteractiveCanvasDocument,
  objectIds: string[],
): CanvasBounds[] {
  const draggedIds = new Set(objectIds);
  const parentIds = new Set(
    document.objects
      .filter((object) => draggedIds.has(object.id))
      .map((object) => object.parentId ?? null),
  );
  const candidates = new Map<string, CanvasBounds>();
  for (const object of document.objects) {
    if (draggedIds.has(object.id)) continue;
    const isSibling = parentIds.has(object.parentId ?? null);
    const isSection = object.type === "section";
    if (!isSibling && !isSection) continue;
    candidates.set(object.id, object.geometry);
  }
  return Array.from(candidates.values());
}

/**
 * Hit-tests world point against section objects only (used for drop targeting
 * during a move gesture), excluding `excludeIds` (the dragged objects and
 * their descendants) so a section can't be dropped into itself or into one of
 * its own children. Topmost-first, matching hitTestObjects ordering.
 */
export function hitTestDropTarget(
  document: InteractiveCanvasDocument,
  worldPoint: CanvasPoint,
  excludeIds: Set<string>,
): InteractiveCanvasObject | null {
  for (let index = document.objects.length - 1; index >= 0; index -= 1) {
    const object = document.objects[index]!;
    if (object.type !== "section") continue;
    if (excludeIds.has(object.id)) continue;
    const { x, y, width, height } = object.geometry;
    const inside =
      worldPoint.x >= x && worldPoint.x <= x + width && worldPoint.y >= y && worldPoint.y <= y + height;
    if (inside) return object;
  }
  return null;
}

export function objectsIntersectingBounds(
  document: InteractiveCanvasDocument,
  bounds: CanvasBounds,
): string[] {
  return document.objects
    .filter((object) => boundsIntersect(object.geometry, bounds))
    .map((object) => object.id);
}
