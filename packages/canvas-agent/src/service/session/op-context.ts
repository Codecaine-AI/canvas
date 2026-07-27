/**
 * State-aware validation and mutation for one model-facing canvas operation.
 *
 * This module owns the entity gates and the lowering of validated intent onto
 * the internal patch grammar. Validation helpers return `string[]`, where an
 * empty array means valid, and never mutate the draft. Mutation helpers return
 * `OpOutcome`, assume validation has passed, and never repeat those checks.
 * Validation errors are bare detail lines because the operation factory prints
 * the headline that identifies the tool. Together these contracts keep
 * operation specs declarative and document mutation centralized in the draft
 * applier.
 */
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import {
  applyOperationToDraft,
  resolveFitSection,
} from "./apply-ops";
import { entityKindOf } from "./op-surface";
import type {
  ConnectionPatch,
  ConnectionPayload,
  Endpoint,
  ObjectPatch,
  ObjectPayload,
  SectionPayload,
  StickyPayload,
} from "./schemas";

/** The result of applying one well-formed, state-valid operation. */
export type OpOutcome =
  /** A completed mutation; `summary` is the APPLIED line without its prefix. */
  | {
      status: "applied";
      draft: InteractiveCanvasDocument;
      summary: string;
      notes?: string[];
    }
  /** A well-formed, legal operation with nothing to do; this is not an error. */
  | { status: "noop"; note: string };

/** State checks and document mutations available to an operation spec. */
export interface OpContext {
  readonly draft: InteractiveCanvasDocument;

  // ── Validation ───────────────────────────────────────────────────────────

  /** Require an id unused by either an object or a connection. */
  requireFreeId(id: string): string[];
  /** Require a section, redirecting other kinds to their tool family. */
  requireSection(id: string): string[];
  /** Require a sticky, redirecting other kinds to their tool family. */
  requireSticky(id: string): string[];
  /** Require a shape, redirecting other kinds to their tool family. */
  requireShape(id: string): string[];
  requireConnection(id: string): string[];
  /** Validate a supplied endpoint; an omitted endpoint is valid. */
  requireEndpoint(field: "from" | "to", endpoint?: Endpoint): string[];
  /** Compare supplied endpoints only when both sides of a patch are present. */
  requireDistinctEndpoints(from?: Endpoint, to?: Endpoint): string[];
  requireNotLastSection(id: string): string[];

  // ── Mutation ─────────────────────────────────────────────────────────────

  /** Insert a section and set the discriminator the model does not supply. */
  insertSection(payload: SectionPayload): OpOutcome;
  /** Insert a sticky and set the discriminator the model does not supply. */
  insertSticky(payload: StickyPayload): OpOutcome;
  insertObject(payload: ObjectPayload): OpOutcome;
  /** Merge a section, sticky, or shape and name its kind in the summary. */
  mergeObject(id: string, patch: ObjectPatch): OpOutcome;
  /** Remove a section, sticky, or shape and name its kind in the summary. */
  removeObject(id: string): OpOutcome;
  /** Insert an edge; a matching from→to edge applies with a duplicate note. */
  insertConnection(payload: ConnectionPayload): OpOutcome;
  mergeConnection(id: string, patch: ConnectionPatch): OpOutcome;
  removeConnection(id: string): OpOutcome;
  /** Fit a section to its children; a childless frame is a no-op. */
  fitSection(id: string): OpOutcome;
}

/** Build the context for one operation over the session's current draft. */
export function createOpContext(draft: InteractiveCanvasDocument): OpContext {
  return {
    draft,

    // ── Validation ─────────────────────────────────────────────────────────

    requireFreeId(id) {
      const occupied = draft.objects.some((object) => object.id === id)
        || draft.connections.some((connection) => connection.id === id);
      return occupied
        ? [`id "${id}" is already on the board — pick a free id, or update the existing entity instead.`]
        : [];
    },

    requireSection(id) {
      const target = draft.objects.find((object) => object.id === id);
      if (!target) return [`sectionId "${id}" is not on the board.`];
      const kind = entityKindOf(target);
      if (kind === "section") return [];
      if (kind === "sticky") {
        return [
          `sectionId "${id}" is a sticky — use the sticky tools (add_sticky, update_sticky, remove_sticky).`,
        ];
      }
      return [
        `sectionId "${id}" is a ${target.type} — use the object tools (add_object, update_object, remove_object).`,
      ];
    },

    requireSticky(id) {
      const target = draft.objects.find((object) => object.id === id);
      if (!target) return [`stickyId "${id}" is not on the board.`];
      const kind = entityKindOf(target);
      if (kind === "sticky") return [];
      if (kind === "section") {
        return [
          `stickyId "${id}" is a section — use the section tools (add_section, update_section, remove_section, fit_section).`,
        ];
      }
      return [
        `stickyId "${id}" is a ${target.type} — use the object tools (add_object, update_object, remove_object).`,
      ];
    },

    requireShape(id) {
      const target = draft.objects.find((object) => object.id === id);
      if (!target) return [`objectId "${id}" is not on the board.`];
      const kind = entityKindOf(target);
      if (kind === "shape") return [];
      if (kind === "section") {
        return [
          `objectId "${id}" is a section — use the section tools (add_section, update_section, remove_section, fit_section).`,
        ];
      }
      return [
        `objectId "${id}" is a sticky — use the sticky tools (add_sticky, update_sticky, remove_sticky).`,
      ];
    },

    requireConnection(id) {
      return draft.connections.some((connection) => connection.id === id)
        ? []
        : [`connectionId "${id}" is not on the board.`];
    },

    requireEndpoint(field, endpoint) {
      if (endpoint === undefined) return [];
      return draft.objects.some((object) => object.id === endpoint.objectId)
        ? []
        : [`${field}.objectId "${endpoint.objectId}" is not on the board.`];
    },

    requireDistinctEndpoints(from, to) {
      if (from === undefined || to === undefined || from.objectId !== to.objectId) {
        return [];
      }
      return [
        `from and to are both "${from.objectId}" — self-loops are not supported by the connector router; represent the loop another way (e.g. a labeled badge or sticky on the state) or leave it out and say so.`,
      ];
    },

    requireNotLastSection(id) {
      const target = draft.objects.find((object) => object.id === id);
      // The kind gate owns the diagnostic when this id does not name a section.
      if (!target || entityKindOf(target) !== "section") return [];
      const hasOtherSection = draft.objects.some(
        (object) => object.id !== id && object.type === "section",
      );
      return hasOtherSection
        ? []
        : [
            `sectionId "${id}" is the board's only section — every board keeps at least one; add its replacement first.`,
          ];
    },

    // ── Mutation ───────────────────────────────────────────────────────────
    // Keep only the applier's document and build model-facing summaries here.

    insertSection(payload) {
      const applied = applyOperationToDraft(draft, {
        type: "addObject",
        object: { ...payload, type: "section" },
      });
      return {
        status: "applied",
        draft: applied.document,
        summary: `add_section ${payload.id}`,
      };
    },

    insertSticky(payload) {
      const applied = applyOperationToDraft(draft, {
        type: "addObject",
        object: { ...payload, type: "sticky" },
      });
      return {
        status: "applied",
        draft: applied.document,
        summary: `add_sticky ${payload.id}`,
      };
    },

    insertObject(payload) {
      const applied = applyOperationToDraft(draft, {
        type: "addObject",
        object: payload,
      });
      return {
        status: "applied",
        draft: applied.document,
        summary: `add_object ${payload.id}`,
      };
    },

    mergeObject(id, patch) {
      const target = draft.objects.find((object) => object.id === id);
      const kind = target ? entityKindOf(target) : "shape";
      const verb = kind === "section"
        ? "update_section"
        : kind === "sticky" ? "update_sticky" : "update_object";
      const applied = applyOperationToDraft(draft, {
        type: "updateObject",
        objectId: id,
        patch,
      });
      return {
        status: "applied",
        draft: applied.document,
        summary: `${verb} ${id}`,
      };
    },

    removeObject(id) {
      const target = draft.objects.find((object) => object.id === id);
      const kind = target ? entityKindOf(target) : "shape";
      const verb = kind === "section"
        ? "remove_section"
        : kind === "sticky" ? "remove_sticky" : "remove_object";
      const applied = applyOperationToDraft(draft, {
        type: "removeObject",
        objectId: id,
      });
      return {
        status: "applied",
        draft: applied.document,
        summary: `${verb} ${id}`,
      };
    },

    insertConnection(payload) {
      const duplicate = draft.connections.find((connection) =>
        connection.from.objectId === payload.from.objectId
        && connection.to.objectId === payload.to.objectId);
      const applied = applyOperationToDraft(draft, {
        type: "addConnection",
        connection: payload,
      });
      return {
        status: "applied",
        draft: applied.document,
        summary: `add_connection ${payload.id}`,
        ...(duplicate
          ? {
              notes: [
                `possible duplicate of ${duplicate.id} — use update_connection to restyle an existing edge`,
              ],
            }
          : {}),
      };
    },

    mergeConnection(id, patch) {
      const applied = applyOperationToDraft(draft, {
        type: "updateConnection",
        connectionId: id,
        patch,
      });
      return {
        status: "applied",
        draft: applied.document,
        summary: `update_connection ${id}`,
      };
    },

    removeConnection(id) {
      const applied = applyOperationToDraft(draft, {
        type: "removeConnection",
        connectionId: id,
      });
      return {
        status: "applied",
        draft: applied.document,
        summary: `remove_connection ${id}`,
      };
    },

    fitSection(id) {
      const resolved = resolveFitSection(draft, id);
      if ("note" in resolved) {
        return { status: "noop", note: resolved.note };
      }
      const applied = applyOperationToDraft(draft, resolved.internal);
      return {
        status: "applied",
        draft: applied.document,
        summary: `fit_section ${id}`,
      };
    },
  };
}
