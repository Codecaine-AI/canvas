/**
 * Draft mutation primitives for layout-session operations.
 *
 * Lower-level document edits apply the internal patch grammar directly to a
 * draft. The one implicit resize is section auto-grow (state/section-grow.ts),
 * which the operation pipeline runs after each edit. A tighter fit is still
 * fit_section's job, and either lands as an ordinary geometry update.
 * Membership reconciliation and fit geometry both come from
 * the canvas package, so this draft applier and studio's accept-time reducer
 * produce identical documents.
 */
import type { CanvasAgentPatchOperation } from "../state/actions";
import {
  type CanvasAnnotationReply,
  type InteractiveCanvasAnnotation,
  type InteractiveCanvasConnection,
  type InteractiveCanvasDocument,
  type InteractiveCanvasObject,
} from "../state/schema";
import { sectionDescendantIds } from "../state/geometry";
import { SECTION_AUTO_GROW_FIT } from "../state/section-grow";
import { clearsAsUndefined } from "../state/actions/agent-patch";
import { nextId } from "../state/actions/helpers";
import { mergeObjectPatch, withoutDetail } from "../state/actions/objects";

import type { AgentPatchOperation } from "./protocol";

/** Describe an internal patch operation for human-readable summaries. */
export function describePatchOperation(operation: CanvasAgentPatchOperation): string {
  switch (operation.type) {
    case "updateTitle":
      return `updateTitle ${JSON.stringify(operation.title)}`;
    case "updateDescription":
      return operation.description.trim() === ""
        ? "updateDescription (cleared)"
        : `updateDescription (${operation.description.length} chars)`;
    case "addObject": return `addObject ${operation.object.id}`;
    case "updateObject":
      return `updateObject ${operation.objectId} (${Object.keys(operation.patch).join(", ")})`;
    case "removeObject": return `removeObject ${operation.objectId}`;
    case "addConnection": return `addConnection ${operation.connection.id}`;
    case "updateConnection":
      return `updateConnection ${operation.connectionId} (${Object.keys(operation.patch).join(", ")})`;
    case "removeConnection": return `removeConnection ${operation.connectionId}`;
    case "addAnnotation": return `addAnnotation ${operation.annotation.id}`;
    case "appendAnnotationReply":
      return `appendAnnotationReply ${operation.annotationId} (${operation.reply.author})`;
    case "setAnnotationStatus":
      return `setAnnotationStatus ${operation.annotationId} (${operation.status})`;
  }
}

/** The id a thread anchors to, in the queue's target grammar. */
function annotationTargetText(annotation: InteractiveCanvasAnnotation): string {
  switch (annotation.target.kind) {
    case "object": return `object:${annotation.target.objectId}`;
    case "connection": return `connection:${annotation.target.connectionId}`;
    case "region": return "region";
  }
}

/**
 * Apply one internal operation to the draft document. `label` is the op name
 * used in the APPLIED summary line — callers applying a lowered model-facing
 * op pass its model-facing name so the notes speak the model's grammar.
 */
export function applyOperationToDraft(
  document: InteractiveCanvasDocument,
  operation: AgentPatchOperation,
  label: string = operation.type,
): { document: InteractiveCanvasDocument; summary: string; touched: string[] } {
  switch (operation.type) {
    case "updateTitle": {
      // Trim-and-keep, exactly as the live reducer does (agent-patch.ts,
      // canvas.updateDocumentTitle): a board is never renamed to nothing, so
      // an empty title leaves the document alone.
      const title = operation.title.trim();
      return {
        document: title === "" ? document : { ...document, title },
        summary: title === "" ? `${label}: skipped (empty title)` : label,
        touched: [],
      };
    }
    case "updateDescription":
      return {
        document: {
          ...document,
          description: operation.description.trim() === ""
            ? undefined
            : operation.description,
        },
        summary: label,
        touched: [],
      };
    case "addObject": {
      const object = operation.object as unknown as InteractiveCanvasObject;
      if (document.objects.some((candidate) => candidate.id === object.id)) {
        return {
          document,
          summary: `${label} ${object.id}: skipped (id already exists)`,
          touched: [object.id],
        };
      }
      // A new object carries no `detail`, the reducer's add rule
      // (agent-patch.ts), so the draft and an accepted replay never disagree.
      return {
        document: {
          ...document,
          objects: [...document.objects, withoutDetail({ ...object, parentId: null })],
        },
        summary: `${label} ${object.id}`,
        touched: [object.id],
      };
    }
    case "updateObject": {
      // A `null` is a clear in its wire spelling; it merges exactly as the
      // reducer merges it (agent-patch.ts, clearsAsUndefined).
      const { parentId: _ignored, ...patch } = clearsAsUndefined(operation.patch);
      return {
        document: {
          ...document,
          objects: document.objects.map((object) => object.id === operation.objectId
            ? mergeObjectPatch(object, patch as Partial<Omit<InteractiveCanvasObject, "id">>)
            : object),
        },
        summary: `${label} ${operation.objectId}`,
        touched: [operation.objectId],
      };
    }
    case "removeObject": {
      const existing = document.objects.find((object) => object.id === operation.objectId)!;
      const removedIds = new Set([operation.objectId]);
      if (existing.type === "section") {
        sectionDescendantIds(document, operation.objectId).forEach((id) => removedIds.add(id));
      }
      const removedConnectionIds = new Set(document.connections
        .filter((connection) => removedIds.has(connection.from.objectId)
          || removedIds.has(connection.to.objectId))
        .map((connection) => connection.id));
      return {
        document: {
          ...document,
          objects: document.objects.filter((object) => !removedIds.has(object.id)),
          connections: document.connections.filter(
            (connection) => !removedConnectionIds.has(connection.id),
          ),
          annotations: document.annotations?.filter((annotation) => {
            if (annotation.target.kind === "object") {
              return !removedIds.has(annotation.target.objectId);
            }
            if (annotation.target.kind === "connection") {
              return !removedConnectionIds.has(annotation.target.connectionId);
            }
            return true;
          }),
        },
        summary: `${label} ${operation.objectId}`,
        touched: [...removedIds],
      };
    }
    case "addConnection": {
      const requested = operation.connection as unknown as InteractiveCanvasConnection;
      if (requested.from.objectId === requested.to.objectId) {
        return {
          document,
          // Same rewrite as op-context's requireDistinctEndpoints: point at
          // buildable alternatives. There is no "badge" object on this canvas.
          summary: `${label} ${requested.id}: skipped — self-loops are not supported by the connector router; `
            + "say the loop in the node's own text, or place a sticky beside it, or leave it out and say so",
          touched: [requested.from.objectId],
        };
      }
      const valid = document.objects.some((object) => object.id === requested.from.objectId)
        && document.objects.some((object) => object.id === requested.to.objectId);
      if (!valid) {
        return {
          document,
          summary: `${label} ${requested.id}: skipped (endpoints unavailable after earlier ops)`,
          touched: [requested.from.objectId, requested.to.objectId],
        };
      }
      const id = document.connections.some((connection) => connection.id === requested.id)
        ? nextId("connection", document.connections.map((connection) => connection.id))
        : requested.id;
      const duplicateOf = document.connections.find((connection) =>
        connection.from.objectId === requested.from.objectId
        && connection.to.objectId === requested.to.objectId);
      return {
        document: { ...document, connections: [...document.connections, { ...requested, id }] },
        summary: duplicateOf
          ? `${label} ${id} — WARNING: possible duplicate of ${duplicateOf.id}; use style_edge to restyle an existing edge`
          : `${label} ${id}`,
        touched: [requested.from.objectId, requested.to.objectId],
      };
    }
    case "updateConnection": {
      const existing = document.connections.find(
        (connection) => connection.id === operation.connectionId,
      )!;
      const updated = {
        ...existing,
        ...clearsAsUndefined(operation.patch),
      } as InteractiveCanvasConnection;
      return {
        document: {
          ...document,
          connections: document.connections.map((connection) =>
            connection.id === operation.connectionId ? updated : connection),
        },
        summary: `${label} ${operation.connectionId}`,
        touched: [
          existing.from.objectId,
          existing.to.objectId,
          updated.from.objectId,
          updated.to.objectId,
        ],
      };
    }
    case "removeConnection": {
      const existing = document.connections.find(
        (connection) => connection.id === operation.connectionId,
      );
      return {
        document: {
          ...document,
          connections: document.connections.filter(
            (connection) => connection.id !== operation.connectionId,
          ),
          annotations: document.annotations?.filter((annotation) =>
            annotation.target.kind !== "connection"
            || annotation.target.connectionId !== operation.connectionId),
        },
        summary: `${label} ${operation.connectionId}`,
        touched: existing ? [existing.from.objectId, existing.to.objectId] : [],
      };
    }
    case "addAnnotation": {
      const annotation = operation.annotation as unknown as InteractiveCanvasAnnotation;
      if (document.annotations?.some((candidate) => candidate.id === annotation.id)) {
        return {
          document,
          summary: `${label} ${annotation.id}: skipped (id already exists)`,
          touched: [],
        };
      }
      const thread: InteractiveCanvasAnnotation = { ...annotation, replies: annotation.replies ?? [] };
      return {
        document: {
          ...document,
          annotations: [...(document.annotations ?? []), thread],
        },
        summary: `${label} ${thread.id} on ${annotationTargetText(thread)}`,
        touched: thread.target.kind === "object" ? [thread.target.objectId] : [],
      };
    }
    case "appendAnnotationReply": {
      const reply = operation.reply as unknown as CanvasAnnotationReply;
      const existing = document.annotations?.find(
        (annotation) => annotation.id === operation.annotationId,
      );
      if (!existing || existing.replies.some((candidate) => candidate.id === reply.id)) {
        return {
          document,
          summary: `${label} ${operation.annotationId}: skipped (no such thread, or the reply is already in it)`,
          touched: [],
        };
      }
      return {
        document: {
          ...document,
          annotations: document.annotations?.map((annotation) =>
            annotation.id === operation.annotationId
              ? { ...annotation, replies: [...annotation.replies, reply] }
              : annotation),
        },
        summary: `${label} ${operation.annotationId} (${reply.author})`,
        touched: existing.target.kind === "object" ? [existing.target.objectId] : [],
      };
    }
    case "setAnnotationStatus": {
      const existing = document.annotations?.find(
        (annotation) => annotation.id === operation.annotationId,
      );
      if (!existing) {
        return {
          document,
          summary: `${label} ${operation.annotationId}: skipped (no such thread)`,
          touched: [],
        };
      }
      return {
        document: {
          ...document,
          annotations: document.annotations?.map((annotation) =>
            annotation.id === operation.annotationId
              ? { ...annotation, status: operation.status }
              : annotation),
        },
        summary: `${label} ${operation.annotationId} (${operation.status})`,
        touched: existing.target.kind === "object" ? [existing.target.objectId] : [],
      };
    }
  }
}

/**
 * The least air a fitted frame keeps around what its children paint on the
 * agent path (section-fit.ts adds more when a stored box or an inner wire
 * needs it). Both numbers are multiples of the agent grid, so a frame fitted
 * around 20-grid children lands on the 20 grid.
 *
 * The two numbers are not the same kind of air: `padding` is the body air on
 * the left/right/bottom, and `titleClearance` is the extra band above the first
 * child that the title chip occupies. The canvas package defaults are 24 + 30
 * (the chip is 3px inset + 27px tall — objects/text-slots.ts TITLE_CHIP), and
 * both numbers here are >= the UI's, so an agent fit is never tighter than the
 * interactive one.
 */
export const SECTION_FIT_PADDING = SECTION_AUTO_GROW_FIT;

/**
 * `resize(..., like: id)` — the size of the object being matched.
 *
 * The whole gesture is "make peers match" without hand-copied numbers, so the
 * resolution is exactly this lookup; the descriptor owns the rest of the
 * contract: the returned size runs through the agent quantizer (snapSize)
 * before it is lowered, and the readability check runs on the snapped result.
 * Returns null when the id names nothing on the board — the descriptor's
 * positionable gate prevents resizing to a guess.
 */
export function resolveSizeLike(
  document: InteractiveCanvasDocument,
  sourceId: string,
): { width: number; height: number } | null {
  const source = document.objects.find((object) => object.id === sourceId);
  if (!source) return null;
  return { width: source.geometry.width, height: source.geometry.height };
}
