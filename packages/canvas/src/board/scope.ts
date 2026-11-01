/**
 * Session-start scope resolution: the operator's selected object ids →
 * everything the session may edit. Selected sections expand to their stored
 * descendants; the result is the padded-to-1px bounding frame, the full
 * in-scope id set, and a count of connections crossing the scope edge.
 *
 * One consumer: `createSession` in service/session/store.ts, which feeds the
 * frame/ids into <editor_state> and the edit gate. These three values are
 * the session's entire scope model (characterized in
 * test/scope-resolve.test.ts).
 */
import type {
  CanvasGeometry,
  InteractiveCanvasDocument,
} from "@codecaine-ai/canvas/schema";

import {
  boundsForGeometries,
  sectionDescendantIds,
} from "../../../canvas/src/state/geometry";

export interface ScopeResolution {
  frame: CanvasGeometry;
  scopeObjectIds: string[];
  boundaryArrowCount: number;
}

export function resolveScope(
  document: InteractiveCanvasDocument,
  requestedObjectIds: readonly string[],
): ScopeResolution {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const unknown = requestedObjectIds.filter((id) => !byId.has(id));
  if (unknown.length > 0) {
    throw new Error(`resolveScope: unknown object id(s): ${unknown.join(", ")}.`);
  }
  if (requestedObjectIds.length === 0) {
    throw new Error("resolveScope: the scope must contain at least one object.");
  }

  const resolvedIds = new Set(requestedObjectIds);
  for (const id of requestedObjectIds) {
    if (byId.get(id)?.type !== "section") continue;
    for (const descendantId of sectionDescendantIds(document, id)) {
      resolvedIds.add(descendantId);
    }
  }

  const scopedObjects = document.objects.filter((object) => resolvedIds.has(object.id));
  const bounds = boundsForGeometries(
    scopedObjects.map((object) => object.geometry),
    0,
  );
  if (!bounds) {
    throw new Error("resolveScope: the scope has no geometry.");
  }

  const scopeObjectIds = scopedObjects.map((object) => object.id);
  const boundaryArrowCount = document.connections.filter((connection) => (
    resolvedIds.has(connection.from.objectId) !== resolvedIds.has(connection.to.objectId)
  )).length;

  return {
    frame: {
      x: bounds.x,
      y: bounds.y,
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height),
    },
    scopeObjectIds,
    boundaryArrowCount,
  };
}
