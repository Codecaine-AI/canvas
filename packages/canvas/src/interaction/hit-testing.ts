"use client";

/**
 * Pure, DOM-free hit-testing and geometry-gathering helpers shared by the
 * interaction state machine (interaction.ts) and its gesture steppers. No
 * gesture state lives here — everything is a straight function of the
 * document + a world point/bounds, so it's independently unit-testable.
 */
import { connectionBoundsForObject, outlineContainsPoint } from "../objects/geometry";
import { boundsForGeometries, boundsIntersect, type CanvasBounds, type CanvasPoint } from "../state/geometry";
import type { CanvasGeometry, InteractiveCanvasDocument, InteractiveCanvasObject } from "../state/schema";
import { paintOrderedObjects } from "../state/z-order";

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
 * Hit-tests world point against document objects, topmost-first by the same
 * paint order used by CanvasStage.
 *
 * D16 (P3): hits respect each object's def-declared outline
 * (objects/geometry.ts outlineContainsPoint) — a diamond's empty corners fall
 * through to whatever is behind. The bbox check doubles as the fast reject
 * AND keeps bbox-outline kinds byte-identical to the pre-D16 behavior (their
 * outline IS the bbox).
 */
export function hitTestObjects(
  document: InteractiveCanvasDocument,
  worldPoint: CanvasPoint,
): InteractiveCanvasObject | null {
  const objects = paintOrderedObjects(document);
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const object = objects[index]!;
    // Below-slot text lives outside stored geometry but remains part of the
    // clickable object footprint.
    const { x, y, width, height } = connectionBoundsForObject(object);
    const inside =
      worldPoint.x >= x && worldPoint.x <= x + width && worldPoint.y >= y && worldPoint.y <= y + height;
    if (!inside) continue;
    if (!outlineContainsPoint(object, worldPoint)) continue;
    return object;
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
 *
 * Deliberately axis-aligned. Below-slot objects contribute their extended
 * glyph+text footprint so snap guides account for visible labels.
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
    candidates.set(object.id, connectionBoundsForObject(object));
  }
  return Array.from(candidates.values());
}

/** Marquee membership. Deliberately stored-geometry intersection: the FigJam selection box for below-slot objects wraps the glyph, not the external text band. */
export function objectsIntersectingBounds(
  document: InteractiveCanvasDocument,
  bounds: CanvasBounds,
): string[] {
  return document.objects
    .filter((object) => boundsIntersect(object.geometry, bounds))
    .map((object) => object.id);
}
