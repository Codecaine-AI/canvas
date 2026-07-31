/**
 * The document differ: baseline vs draft → the ordered internal
 * CanvasAgentPatchOperation list that becomes the committed proposal
 * (`toolFinalize` in service/session/tools/workflow/finalize.ts is the
 * consumer; the BOARD DIFF block renders the same ops per apply, and studio
 * replays them through `canvas.applyAgentPatch` on accept).
 *
 * Commit always takes this document path. Comparison is order-independent
 * structural equality, so a field written back to an identical value
 * produces no op.
 *
 * Channel policy: the document description, connection `waypoints`, and
 * annotation threads are compared and emitted; `parentId` is omitted because
 * it is derived from geometry and re-derived on accept.
 *
 * The one exception to "emit every changed channel" is `waypoints`, and it is
 * there for the same reason `parentId` is omitted: the reducer DERIVES it.
 * `reconcileConnectionWaypoints` is an always-on choke point in
 * `reduceInteractiveCanvasState`, so on replay it re-runs over whatever this
 * patch produces — translating the polyline on a rigid endpoint move, dropping
 * it on an asymmetric one. Emitting a value the reducer is about to transform
 * again is how a carried section's waypoints would land TWICE the delta the
 * draft reported. So the channel is emitted only when the reducer's own
 * reconcile would not already produce the draft's value; see
 * `reducerReconciledWaypoints`.
 */
import type { CanvasAgentPatchOperation } from "@codecaine-ai/canvas/actions";
import { reconcileConnectionWaypoints } from "../../../canvas/src/state/actions/waypoints";
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
    ...(connection.labelPosition ? { labelPosition: { ...connection.labelPosition } } : {}),
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

/**
 * The op is what the REDUCER applies, so it names document channels — `type`
 * and `icon` travel separately here, as the document holds them. That split is
 * internal: the model-facing rendering of these ops folds the two into one
 * word (session/perception.ts, BOARD DIFF), the way every model-facing
 * formatter folds them (session/tools/placeable-types.ts).
 */
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

/**
 * What the live reducer's own waypoint reconcile will produce for each
 * connection if this diff says nothing about waypoints at all.
 *
 * The document it reasons over is the one the reducer holds between applying
 * the patch and running its post-reduce choke points: the draft's objects and
 * connections, but with each surviving connection's BASELINE waypoints, since
 * that is what an omitted channel leaves in place. A connection the draft adds
 * carries its own waypoints through `addConnection` verbatim.
 */
function reducerReconciledWaypoints(
  baseline: InteractiveCanvasDocument,
  draft: InteractiveCanvasDocument,
): Map<string, InteractiveCanvasConnection["waypoints"]> {
  const baselineById = new Map(
    baseline.connections.map((connection) => [connection.id, connection]),
  );
  const preReconcile: InteractiveCanvasDocument = {
    ...draft,
    connections: draft.connections.map((connection) => {
      const before = baselineById.get(connection.id);
      return before ? { ...connection, waypoints: before.waypoints } : connection;
    }),
  };
  return new Map(
    reconcileConnectionWaypoints(baseline, preReconcile).connections.map(
      (connection) => [connection.id, connection.waypoints],
    ),
  );
}

function connectionPatch(
  baseline: InteractiveCanvasConnection,
  draft: InteractiveCanvasConnection,
  reducerWaypoints: InteractiveCanvasConnection["waypoints"],
): Partial<Omit<InteractiveCanvasConnection, "id">> {
  const patch: Partial<Omit<InteractiveCanvasConnection, "id">> = {};

  if (baseline.label !== draft.label) patch.label = draft.label;
  if (baseline.style !== draft.style) patch.style = draft.style;
  if (baseline.color !== draft.color) patch.color = draft.color;
  if (baseline.arrow !== draft.arrow) patch.arrow = draft.arrow;
  if (!structurallyEqual(baseline.from, draft.from)) patch.from = cloneEndpoint(draft.from);
  if (!structurallyEqual(baseline.to, draft.to)) patch.to = cloneEndpoint(draft.to);
  // Waypoints are stored agent steering, but the reducer re-derives them from
  // endpoint movement on every replay (see the module doc). Emit the channel
  // only when that derivation would NOT already land on the draft's value: a
  // draft that dropped them emits an explicit `waypoints: undefined` own
  // property (the reducer merges patches by spread, so that clears the stored
  // steering), while a rigid translation the reducer will redo itself is left
  // to the reducer rather than written twice.
  if (
    !structurallyEqual(baseline.waypoints, draft.waypoints)
    && !structurallyEqual(reducerWaypoints, draft.waypoints)
  ) {
    patch.waypoints = draft.waypoints ? cloneWaypoints(draft.waypoints) : undefined;
  }
  // The label-chip pin is authored steering too: a draft that clears it emits
  // an explicit `labelPosition: undefined`, which the spread-merging reducer
  // reads as "back to the routed midpoint".
  if (!structurallyEqual(baseline.labelPosition, draft.labelPosition)) {
    patch.labelPosition = draft.labelPosition ? { ...draft.labelPosition } : undefined;
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
  const reducerWaypoints = reducerReconciledWaypoints(baseline, draft);
  const addObjectOps: CanvasAgentPatchOperation[] = [];
  const updateObjectOps: CanvasAgentPatchOperation[] = [];
  const updateConnectionOps: CanvasAgentPatchOperation[] = [];
  const removeConnectionOps: CanvasAgentPatchOperation[] = [];
  const removeObjectOps: CanvasAgentPatchOperation[] = [];
  const addConnectionOps: CanvasAgentPatchOperation[] = [];
  const titleOps: CanvasAgentPatchOperation[] = [];
  // The board's name is a document channel like its description. The live
  // reducer refuses to rename a board to nothing, so a draft that somehow
  // emptied its title emits no op rather than one that would be dropped.
  if ((baseline.title ?? "") !== (draft.title ?? "") && (draft.title ?? "").trim() !== "") {
    titleOps.push({ type: "updateTitle", title: draft.title ?? "" });
  }
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
    const patch = connectionPatch(
      before,
      connection,
      reducerWaypoints.get(connection.id),
    );
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
    ...titleOps,
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
