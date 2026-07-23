/**
 * The document differ: baseline vs draft → the ordered six-op
 * CanvasAgentPatchOperation list that becomes the committed proposal
 * (`toolCommit` in service/session/tools.ts is the consumer; studio replays
 * the ops through `canvas.applyAgentPatch` on accept).
 *
 * Commit always takes this document path. Comparison is order-independent
 * structural equality, so a field written back to an identical value
 * produces no op.
 */
import type { CanvasAgentPatchOperation } from "@codecaine-ai/canvas/actions";
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";

/**
 * Compare two JSON-shaped canvas values without depending on insertion order
 * for object keys. Canvas schema values are acyclic, so recursive structural
 * equality is sufficient here.
 */
function structurallyEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, index) => structurallyEqual(value, b[index]));
  }

  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(aRecord), ...Object.keys(bRecord)]);
  for (const key of keys) {
    // Missing optional properties and explicitly undefined properties have
    // the same canvas-schema meaning.
    if (!structurallyEqual(aRecord[key], bRecord[key])) return false;
  }
  return true;
}

function cloneObject(object: InteractiveCanvasObject): InteractiveCanvasObject {
  const { parentId: _ignored, ...rest } = object;
  return {
    ...rest,
    geometry: { ...object.geometry },
    ...(object.style ? { style: { ...object.style } } : {}),
    ...(object.layout ? { layout: { ...object.layout } } : {}),
  };
}

function cloneEndpoint(
  endpoint: InteractiveCanvasConnection["from"],
): InteractiveCanvasConnection["from"] {
  return {
    ...endpoint,
    ...(endpoint.position ? { position: [...endpoint.position] } : {}),
  };
}

/**
 * Connector routes are owned by the live router. This applies to newly added
 * connections as well as updates, so document patches never persist a stale
 * set of draft waypoints.
 */
function cloneConnectionWithoutWaypoints(
  connection: InteractiveCanvasConnection,
): InteractiveCanvasConnection {
  const { waypoints: _ignored, ...rest } = connection;
  return {
    ...rest,
    from: cloneEndpoint(connection.from),
    to: cloneEndpoint(connection.to),
  };
}

function objectPatch(
  baseline: InteractiveCanvasObject,
  draft: InteractiveCanvasObject,
): Partial<Omit<InteractiveCanvasObject, "id">> {
  const patch: Partial<Omit<InteractiveCanvasObject, "id">> = {};

  if (!structurallyEqual(baseline.geometry, draft.geometry)) {
    patch.geometry = { ...draft.geometry };
  }
  if (baseline.type !== draft.type) patch.type = draft.type;
  if (baseline.text !== draft.text) patch.text = draft.text;
  if (baseline.color !== draft.color) patch.color = draft.color;
  if (!structurallyEqual(baseline.style, draft.style)) {
    patch.style = draft.style ? { ...draft.style } : undefined;
  }
  if (baseline.direction !== draft.direction) patch.direction = draft.direction;
  if (baseline.icon !== draft.icon) patch.icon = draft.icon;
  if (baseline.author !== draft.author) patch.author = draft.author;
  if (!structurallyEqual(baseline.layout, draft.layout)) {
    patch.layout = draft.layout ? { ...draft.layout } : undefined;
  }
  if (baseline.locked !== draft.locked) patch.locked = draft.locked;

  return patch;
}

function connectionPatch(
  baseline: InteractiveCanvasConnection,
  draft: InteractiveCanvasConnection,
): Partial<Omit<InteractiveCanvasConnection, "id">> {
  const patch: Partial<Omit<InteractiveCanvasConnection, "id">> = {};

  if (baseline.label !== draft.label) patch.label = draft.label;
  if (baseline.style !== draft.style) patch.style = draft.style;
  if (baseline.color !== draft.color) patch.color = draft.color;
  if (baseline.arrow !== draft.arrow) patch.arrow = draft.arrow;
  if (!structurallyEqual(baseline.from, draft.from)) patch.from = cloneEndpoint(draft.from);
  if (!structurallyEqual(baseline.to, draft.to)) patch.to = cloneEndpoint(draft.to);
  if (baseline.role !== draft.role) patch.role = draft.role;

  // waypoints are intentionally neither compared nor emitted.
  return patch;
}

/**
 * Document-level differ used for ops-authored drafts. It preserves every
 * agent-editable document channel named by the harness contract while
 * omitting read-only annotations, derived section membership (`parentId`),
 * and connector routing (`waypoints`) so the live reducer can re-derive the
 * geometry-owned fields.
 */
export function diffDocuments(
  baseline: InteractiveCanvasDocument,
  draft: InteractiveCanvasDocument,
): CanvasAgentPatchOperation[] {
  const baselineObjects = new Map(baseline.objects.map((object) => [object.id, object]));
  const draftObjects = new Map(draft.objects.map((object) => [object.id, object]));
  const baselineConnections = new Map(
    baseline.connections.map((connection) => [connection.id, connection]),
  );
  const draftConnections = new Map(
    draft.connections.map((connection) => [connection.id, connection]),
  );
  const addObjectOps: CanvasAgentPatchOperation[] = [];
  const updateObjectOps: CanvasAgentPatchOperation[] = [];
  const updateConnectionOps: CanvasAgentPatchOperation[] = [];
  const removeConnectionOps: CanvasAgentPatchOperation[] = [];
  const removeObjectOps: CanvasAgentPatchOperation[] = [];
  const addConnectionOps: CanvasAgentPatchOperation[] = [];

  // Draft order determines deterministic adds and updates.
  for (const object of draft.objects) {
    const before = baselineObjects.get(object.id);
    if (!before) {
      addObjectOps.push({ type: "addObject", object: cloneObject(object) });
      continue;
    }
    const patch = objectPatch(before, object);
    if (Object.keys(patch).length > 0) {
      updateObjectOps.push({ type: "updateObject", objectId: object.id, patch });
    }
  }
  for (const object of baseline.objects) {
    if (!draftObjects.has(object.id)) {
      removeObjectOps.push({ type: "removeObject", objectId: object.id });
    }
  }

  for (const connection of draft.connections) {
    const before = baselineConnections.get(connection.id);
    if (!before) {
      addConnectionOps.push({
        type: "addConnection",
        connection: cloneConnectionWithoutWaypoints(connection),
      });
      continue;
    }
    const patch = connectionPatch(before, connection);
    if (Object.keys(patch).length > 0) {
      updateConnectionOps.push({
        type: "updateConnection",
        connectionId: connection.id,
        patch,
      });
    }
  }
  for (const connection of baseline.connections) {
    if (!draftConnections.has(connection.id)) {
      removeConnectionOps.push({
        type: "removeConnection",
        connectionId: connection.id,
      });
    }
  }

  return [
    ...addObjectOps,
    ...updateObjectOps,
    ...updateConnectionOps,
    ...removeConnectionOps,
    ...removeObjectOps,
    ...addConnectionOps,
  ];
}
