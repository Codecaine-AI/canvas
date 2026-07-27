/**
 * The document differ: baseline vs draft → the ordered internal
 * CanvasAgentPatchOperation list that becomes the committed proposal
 * (`toolFinalize` in service/session/tools.ts is the consumer; the BOARD
 * DIFF block renders the same ops per apply, and studio replays them
 * through `canvas.applyAgentPatch` on accept).
 *
 * Commit always takes this document path. Comparison is order-independent
 * structural equality, so a field written back to an identical value
 * produces no op.
 *
 * Channel policy: the document description, connection `waypoints`, and
 * annotation threads are compared and emitted; `parentId` is omitted because
 * it is derived from geometry and re-derived on accept.
 */
import type { CanvasAgentPatchOperation } from "@codecaine-ai/canvas/actions";
import type {
  InteractiveCanvasAnnotation,
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

function cloneWaypoints(
  waypoints: NonNullable<InteractiveCanvasConnection["waypoints"]>,
): NonNullable<InteractiveCanvasConnection["waypoints"]> {
  return waypoints.map(([x, y]): [number, number] => [x, y]);
}

/**
 * Waypoints are stored agent steering — `updateConnection` accepts them and
 * the live reducer applies them verbatim — so an added connection carries
 * them like any other authored channel. Endpoints and waypoints are
 * deep-copied so later draft mutation cannot reach into an emitted op.
 */
function cloneConnection(
  connection: InteractiveCanvasConnection,
): InteractiveCanvasConnection {
  return {
    ...connection,
    from: cloneEndpoint(connection.from),
    to: cloneEndpoint(connection.to),
    ...(connection.waypoints ? { waypoints: cloneWaypoints(connection.waypoints) } : {}),
  };
}

/** Deep-copied so a later draft mutation cannot reach into an emitted op. */
function cloneAnnotation(
  annotation: InteractiveCanvasAnnotation,
): InteractiveCanvasAnnotation {
  return {
    ...annotation,
    target: { ...annotation.target },
    replies: annotation.replies.map((reply) => ({ ...reply })),
  };
}

/**
 * The annotation channel: threads opened on the draft, replies appended to an
 * existing thread (matched by reply id, oldest first), and status moves. A
 * thread the draft dropped emits nothing — it disappeared with its target, and
 * the live reducer cascades it away from the same removal op.
 */
function annotationOperations(
  baseline: InteractiveCanvasDocument,
  draft: InteractiveCanvasDocument,
): CanvasAgentPatchOperation[] {
  const baselineAnnotations = new Map(
    (baseline.annotations ?? []).map((annotation) => [annotation.id, annotation]),
  );
  const operations: CanvasAgentPatchOperation[] = [];
  for (const annotation of draft.annotations ?? []) {
    const before = baselineAnnotations.get(annotation.id);
    if (!before) {
      operations.push({ type: "addAnnotation", annotation: cloneAnnotation(annotation) });
      continue;
    }
    const beforeReplyIds = new Set(before.replies.map((reply) => reply.id));
    for (const reply of annotation.replies) {
      if (beforeReplyIds.has(reply.id)) continue;
      operations.push({
        type: "appendAnnotationReply",
        annotationId: annotation.id,
        reply: { ...reply },
      });
    }
    if (before.status !== annotation.status) {
      operations.push({
        type: "setAnnotationStatus",
        annotationId: annotation.id,
        status: annotation.status,
      });
    }
  }
  return operations;
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
  // Waypoints are stored agent steering, so they diff like any other channel.
  // A draft that drops them emits an explicit `waypoints: undefined` own
  // property — the reducer merges patches by spread, so that clears the
  // stored steering.
  if (!structurallyEqual(baseline.waypoints, draft.waypoints)) {
    patch.waypoints = draft.waypoints ? cloneWaypoints(draft.waypoints) : undefined;
  }

  return patch;
}

/**
 * Document-level differ used for ops-authored drafts. It preserves every
 * agent-editable document channel named by the harness contract — including
 * connection `waypoints`, which are stored steering, and annotation threads —
 * while omitting derived section membership (`parentId`) so the live reducer
 * can re-derive the geometry-owned fields.
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
  const descriptionOps: CanvasAgentPatchOperation[] = [];
  if ((baseline.description ?? "") !== (draft.description ?? "")) {
    descriptionOps.push({ type: "updateDescription", description: draft.description ?? "" });
  }

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
        connection: cloneConnection(connection),
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

  // Annotation ops come last: a thread anchors to an object or connection, so
  // every target the draft still carries already exists by the time they apply.
  return [
    ...descriptionOps,
    ...addObjectOps,
    ...updateObjectOps,
    ...updateConnectionOps,
    ...removeConnectionOps,
    ...removeObjectOps,
    ...addConnectionOps,
    ...annotationOperations(baseline, draft),
  ];
}
