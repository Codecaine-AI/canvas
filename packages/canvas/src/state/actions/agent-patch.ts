"use client";

/**
 * canvas.applyAgentPatch — the agent apply path (KERNEL-PROPOSAL §2.3–2.4).
 *
 * Folds a CanvasAgentPatchOperation[] onto the document by reusing the same
 * per-domain logic the human actions use, then commits the result as ONE
 * withHistory entry stamped `source: "agent"` — a single ⌘Z reverts the
 * whole patch, and `lastChange` carries changed-id sets for objects,
 * connections, and annotations.
 * A description-only patch touches no changed-id set but still produces that
 * one history entry.
 *
 * Error policy: this is a reducer, so it cannot log or throw usefully — an
 * operation referencing an unknown objectId/connectionId/annotationId (or an
 * addObject/addConnection/addAnnotation whose id, endpoints, or target are
 * invalid) is SKIPPED and the remaining operations still apply. Callers who
 * need strict validation should pre-validate against the document before
 * dispatching.
 *
 * parentId is NEVER written from patch ops: an added object's parentId is
 * nulled and updateObject patches have parentId stripped. After the whole
 * batch, membership is re-derived from geometry via
 * reconcileSectionMembership. No section is ever resized implicitly: a frame
 * keeps exactly the geometry the patch gives it, and a fit is an explicit
 * geometry update like any other. Waypoints of connectors whose endpoint
 * owners moved are likewise handled downstream by the always-on
 * reconcileConnectionWaypoints choke point — nothing here duplicates it.
 */
import { sectionDescendantIds } from "../geometry";
import { reconcileSectionMembership } from "../section-membership";
import type { InteractiveCanvasDocument } from "../schema";
import { hasValidEndpoint, removeConnection } from "./connections";
import { nextId } from "./helpers";
import { withHistory } from "./history";
import { mergeObjectPatch } from "./objects";
import type {
  CanvasAction,
  CanvasAgentPatchOperation,
  CanvasSelection,
  InteractiveCanvasState,
} from "./types";

type PatchAccumulator = {
  document: InteractiveCanvasDocument;
  changedObjectIds: Set<string>;
  changedConnectionIds: Set<string>;
  changedAnnotationIds: Set<string>;
};

function applyOperation(
  accumulator: PatchAccumulator,
  operation: CanvasAgentPatchOperation,
): void {
  const { document } = accumulator;

  switch (operation.type) {
    case "updateDescription": {
      const description = operation.description.trim() ? operation.description : undefined;
      if (document.description === description) return;
      accumulator.document = { ...document, description };
      return;
    }
    case "addObject": {
      // Colliding id → skip (agent ids are minted upstream against the
      // baseline document; a collision means the op is stale).
      if (document.objects.some((object) => object.id === operation.object.id)) return;
      accumulator.document = {
        ...document,
        // parentId is derived, never written — see module doc.
        objects: [...document.objects, { ...operation.object, parentId: null }],
      };
      accumulator.changedObjectIds.add(operation.object.id);
      return;
    }
    case "updateObject": {
      const existing = document.objects.find((object) => object.id === operation.objectId);
      if (!existing) return; // unknown id → skip
      // Strip parentId — membership is derived from geometry downstream.
      const { parentId: _ignored, ...patch } = operation.patch;
      accumulator.document = {
        ...document,
        objects: document.objects.map((object) =>
          object.id === operation.objectId ? mergeObjectPatch(object, patch) : object,
        ),
      };
      accumulator.changedObjectIds.add(operation.objectId);
      return;
    }
    case "addConnection": {
      const { connection } = operation;
      // Endpoints must resolve against the document as patched so far (an
      // object added by an earlier op in the same patch counts).
      if (!hasValidEndpoint(document, connection.from)) return;
      if (!hasValidEndpoint(document, connection.to)) return;
      if (connection.from.objectId === connection.to.objectId) return;
      const id = document.connections.some((candidate) => candidate.id === connection.id)
        ? nextId(
            "connection",
            document.connections.map((candidate) => candidate.id),
          )
        : connection.id;
      accumulator.document = {
        ...document,
        connections: [...document.connections, { ...connection, id }],
      };
      accumulator.changedConnectionIds.add(id);
      return;
    }
    case "updateConnection": {
      const existing = document.connections.find(
        (connection) => connection.id === operation.connectionId,
      );
      if (!existing) return; // unknown id → skip
      // Waypoints apply verbatim — they are part of the agent's routing
      // steering surface; post-reduce reconcile still clears them when an
      // endpoint object later moves asymmetrically.
      accumulator.document = {
        ...document,
        connections: document.connections.map((connection) =>
          connection.id === operation.connectionId
            ? { ...connection, ...operation.patch }
            : connection,
        ),
      };
      accumulator.changedConnectionIds.add(operation.connectionId);
      return;
    }
    case "addAnnotation": {
      const annotations = document.annotations ?? [];
      if (annotations.some((annotation) => annotation.id === operation.annotation.id)) return;
      const { target } = operation.annotation;
      if (
        target.kind === "object" &&
        !document.objects.some((object) => object.id === target.objectId)
      ) {
        return;
      }
      if (
        target.kind === "connection" &&
        !document.connections.some((connection) => connection.id === target.connectionId)
      ) {
        return;
      }
      accumulator.document = {
        ...document,
        annotations: [
          ...annotations,
          { ...operation.annotation, replies: operation.annotation.replies ?? [] },
        ],
      };
      accumulator.changedAnnotationIds.add(operation.annotation.id);
      return;
    }
    case "appendAnnotationReply": {
      const annotations = document.annotations ?? [];
      const existing = annotations.find(
        (annotation) => annotation.id === operation.annotationId,
      );
      if (!existing) return;
      if (existing.replies.some((reply) => reply.id === operation.reply.id)) return;
      accumulator.document = {
        ...document,
        annotations: annotations.map((annotation) =>
          annotation.id === operation.annotationId
            ? { ...annotation, replies: [...annotation.replies, operation.reply] }
            : annotation,
        ),
      };
      accumulator.changedAnnotationIds.add(operation.annotationId);
      return;
    }
    case "setAnnotationStatus": {
      const annotations = document.annotations ?? [];
      const existing = annotations.find(
        (annotation) => annotation.id === operation.annotationId,
      );
      if (!existing || existing.status === operation.status) return;
      accumulator.document = {
        ...document,
        annotations: annotations.map((annotation) =>
          annotation.id === operation.annotationId
            ? { ...annotation, status: operation.status }
            : annotation,
        ),
      };
      accumulator.changedAnnotationIds.add(operation.annotationId);
      return;
    }
    case "removeObject": {
      const existing = document.objects.find((object) => object.id === operation.objectId);
      if (!existing) return; // unknown id → skip
      // Mirror handleDeleteSelection: deleting a section deletes its recorded
      // descendants, and connections touching any removed object cascade away.
      const idSet = new Set([operation.objectId]);
      if (existing.type === "section") {
        for (const descendantId of sectionDescendantIds(document, operation.objectId)) {
          idSet.add(descendantId);
        }
      }
      const removedConnectionIds = new Set(
        document.connections
          .filter(
            (connection) =>
              idSet.has(connection.from.objectId) || idSet.has(connection.to.objectId),
          )
          .map((connection) => connection.id),
      );
      accumulator.document = {
        ...document,
        objects: document.objects.filter((object) => !idSet.has(object.id)),
        connections: document.connections.filter(
          (connection) => !removedConnectionIds.has(connection.id),
        ),
        // Human delete drops object-target annotations; annotations on the
        // cascaded connections are dropped too so no annotation is left
        // pointing at a connection this same patch removed.
        annotations: document.annotations?.filter((annotation) => {
          if (annotation.target.kind === "object") return !idSet.has(annotation.target.objectId);
          if (annotation.target.kind === "connection") {
            return !removedConnectionIds.has(annotation.target.connectionId);
          }
          return true;
        }),
      };
      for (const id of idSet) accumulator.changedObjectIds.add(id);
      for (const id of removedConnectionIds) accumulator.changedConnectionIds.add(id);
      return;
    }
    case "removeConnection": {
      if (!document.connections.some((connection) => connection.id === operation.connectionId)) {
        return; // unknown id → skip
      }
      accumulator.document = removeConnection(document, operation.connectionId);
      accumulator.changedConnectionIds.add(operation.connectionId);
      return;
    }
  }
}

/** Drop dead ids from the selection after removals (removed object/connection/annotation). */
function pruneSelection(
  selection: CanvasSelection,
  document: InteractiveCanvasDocument,
): CanvasSelection {
  if (selection.kind === "objects") {
    const alive = selection.objectIds.filter((id) =>
      document.objects.some((object) => object.id === id),
    );
    if (alive.length === selection.objectIds.length) return selection;
    return alive.length > 0 ? { kind: "objects", objectIds: alive } : { kind: "none" };
  }
  if (selection.kind === "connection") {
    return document.connections.some((connection) => connection.id === selection.connectionId)
      ? selection
      : { kind: "none" };
  }
  if (selection.kind === "annotation") {
    return (document.annotations ?? []).some(
      (annotation) => annotation.id === selection.annotationId,
    )
      ? selection
      : { kind: "none" };
  }
  return selection;
}

export function handleApplyAgentPatch(
  state: InteractiveCanvasState,
  action: Extract<CanvasAction, { type: "canvas.applyAgentPatch" }>,
): InteractiveCanvasState {
  const accumulator: PatchAccumulator = {
    document: state.document,
    changedObjectIds: new Set(),
    changedConnectionIds: new Set(),
    changedAnnotationIds: new Set(),
  };
  for (const operation of action.operations) {
    applyOperation(accumulator, operation);
  }
  // Every operation skipped / no-op'd → no history entry, no halo.
  if (accumulator.document === state.document) return state;

  // Membership reconciles from geometry after every batch; nothing else is
  // derived, so every section keeps the size the patch gave it.
  accumulator.document = reconcileSectionMembership(accumulator.document);

  return withHistory(
    { ...state, selection: pruneSelection(state.selection, accumulator.document) },
    accumulator.document,
    {
      source: "agent",
      summary: action.summary ?? "Agent edit",
      changedObjectIds: [...accumulator.changedObjectIds],
      changedConnectionIds: [...accumulator.changedConnectionIds],
      changedAnnotationIds: [...accumulator.changedAnnotationIds],
    },
  );
}
