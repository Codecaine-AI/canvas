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
 *
 * A KIND GATE OWES A REDIRECT. When a gesture is refused because the id names
 * the wrong kind, the diagnostic names the gesture that WOULD do the comparable
 * thing to that kind — a frame is restroked with `change_section_border`, a note
 * is rewritten with `update_text` — so a refusal costs one turn instead of a
 * hunt through the roster. Every name in these messages must be a tool that is
 * actually on the roster (operations/index.ts).
 *
 * A LOCK GATE OWES ITS RELEASE. The lock gates below are the second family of
 * refusal, and they name both the lock that stopped the gesture and the one
 * call that lifts it (`unlock`), because a lock is a person's mark on a region
 * and the model has to decide whether the request really requires editing
 * there — see `requireUnlocked` for the full rule.
 */
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import type { AgentPatchOperation } from "../../../../protocol";

import {
  applyOperationToDraft,
  resolveFitSection,
} from "../../apply-ops";
import { entityKindOf } from "../../perception/op-surface";
import type {
  ConnectionPatch,
  Endpoint,
  ObjectPatch,
} from "../schemas";

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
  /**
   * Require an id that names ANY board entity — an object (section, sticky, or
   * shape) or a connection. The kind-agnostic content gestures
   * (`update_text`, `change_color`) write the same channel on every kind, so
   * they gate on existence alone and dispatch on kind inside their `apply`.
   * There is no redirect message to give: this is the tool for all of them.
   */
  requireBoardEntity(id: string): string[];
  /**
   * Require an id that names something with a BOX — an object or a section,
   * but not a connection. This is `requireBoardEntity` minus edges, and it is
   * the gate for the arrange gestures (`move_to`, `move_by`, `resize`,
   * `match_size`, `align`, `space_out`): a wire has no position or size of its
   * own, it is derived from the two boxes it joins, so the redirect points at
   * those.
   *
   * `field` names the parameter in the diagnostic, since these gestures take
   * ids under several names (`id`, `ids`, `like`).
   */
  requirePositionable(id: string, field?: string): string[];
  /**
   * Require a section — the gate for the Sections group (`fit_section`,
   * `change_section_border`, `lock`, `unlock`), all four of which act on a
   * frame AS a frame. Other kinds are redirected to the gesture that does the
   * comparable thing to them, or to `place_section` when what was wanted was a
   * frame there is none of.
   *
   * `field` names the parameter in the diagnostic. All four take a plain `id`,
   * so the default is almost always right; the parameter stays because the
   * arrange gestures reach for the same wording under other names.
   */
  requireSection(id: string, field?: string): string[];
  /**
   * Require a shape — the gate for `change_shape` alone, since a section is not
   * a diamond and a sticky is not a cylinder. The redirects name what those two
   * kinds CAN be restyled with.
   */
  requireShape(id: string): string[];
  requireConnection(id: string): string[];
  /** Validate a supplied endpoint; an omitted endpoint is valid. */
  requireEndpoint(field: "from" | "to", endpoint?: Endpoint): string[];
  /** Compare supplied endpoints only when both sides of a patch are present. */
  requireDistinctEndpoints(from?: Endpoint, to?: Endpoint): string[];
  requireNotLastSection(id: string): string[];

  // ── Lock gates ───────────────────────────────────────────────────────────

  /**
   * Require that this box is not under a lock — the gate EVERY mutating
   * gesture that writes an existing object runs, because a lock gates what
   * every other tool may do to the frame and its descendants
   * (docs/30-agent-layout/50-tool-surface/10-gestures §Sections, lock matrix).
   *
   * The rule mirrors the UI's own `isLockedForManipulation`
   * (packages/canvas/src/stage/editor/pipeline/core.ts), so a gesture the
   * pointer cannot perform is a gesture the agent cannot perform either:
   *
   *   a. the object carries ANY `locked` value — including "background", which
   *      pins the frame itself while leaving what is inside it editable, so a
   *      background-locked frame refuses its OWN mutation; or
   *   b. any ancestor section (walking `parentId`) carries `locked: "all"`,
   *      which freezes the frame and every descendant.
   *
   * An ancestor's "background" lock gates nothing below it — that is the whole
   * difference between the two modes.
   */
  requireUnlocked(id: string, field?: string): string[];
  /**
   * The lock gate for an EDGE, keyed on the region its ends sit in rather than
   * on the edge itself (a connection carries no `locked` field of its own).
   *
   * An edge is gated when either endpoint object is inside a locked-ALL
   * closure — the object itself locked "all", or an ancestor section locked
   * "all". A wire into a protected region is part of that region, so restyling
   * or rerouting it is editing there.
   *
   * A "background" lock does NOT gate edges: it pins one frame's own box and
   * says nothing about the wires between the children it holds, which stay
   * editable by the same rule that leaves those children editable.
   */
  requireUnlockedEdge(id: string, field?: string): string[];
  /**
   * The same locked-all closure rule applied to an endpoint a gesture is about
   * to ATTACH to (`connect`, and `change_connection`'s repoint targets), so a
   * wire cannot be drawn into a frozen region. An omitted endpoint is valid,
   * matching `requireEndpoint`.
   */
  requireUnlockedEndpoint(field: "from" | "to", endpoint?: Endpoint): string[];

  // ── Mutation ─────────────────────────────────────────────────────────────
  //
  // Every mutator here takes the summary the model will read, because a gesture
  // cannot borrow a CRUD verb: a place summary reports the APPLIED, post-snap
  // geometry, `clone` names its source, `delete` is one verb over three
  // cascades, and `update_text` writes an object's `text` or an edge's `label`
  // under the same name. The descriptor builds the mutation and the sentence
  // together; the draft applier stays the only thing that touches a document,
  // which is the invariant this module exists to hold.

  /** Merge a patch onto a section, sticky, or shape. */
  mergeObject(
    id: string,
    patch: ObjectPatch,
    summary: string,
    notes?: readonly string[],
  ): OpOutcome;
  /** Merge a patch onto an edge. */
  mergeConnection(
    id: string,
    patch: ConnectionPatch,
    summary: string,
    notes?: readonly string[],
  ): OpOutcome;
  /**
   * Fit a section to its children; a childless frame is a no-op. The one
   * mutator that owns its own summary, because it owns its own no-op: the
   * geometry it writes is resolved from the draft rather than supplied.
   */
  fitSection(id: string): OpOutcome;
  /**
   * Lower one validated gesture onto the draft under the gesture's own summary.
   * The general door: `mergeObject` and `mergeConnection` are this call with
   * the patch operation spelled for you.
   */
  applyLowered(
    operation: AgentPatchOperation,
    summary: string,
    notes?: readonly string[],
  ): OpOutcome;
}

/**
 * The half-sentence every lock refusal ends with. It has to carry two things:
 * that the lock is a person's don't-touch mark (not an accident of state), and
 * the one call that lifts it, so the model can weigh unlocking against the
 * request instead of hunting for a way around the refusal.
 */
const LOCK_RELEASE =
  "a lock is a don't-touch signal; unlock it first if the request requires editing here";

/** What a lock gate found: the frame holding the lock, its mode, and whose it is. */
interface LockHold {
  /** The object carrying the `locked` value — the id `unlock` takes. */
  holderId: string;
  mode: "all" | "background";
  /** True when the gated object IS the holder (its own lock, either mode). */
  own: boolean;
}

/**
 * The lock covering `id`, or null when it is free to edit.
 *
 * A transcription of the UI's `isLockedForManipulation` (stage/editor/pipeline/
 * core.ts) — the object's own lock in either mode, else the nearest ancestor
 * section locked "all" — including its two loop guards, because `parentId` is
 * ordinary document data and a hand-edited file can describe a cycle.
 *
 * `mode` narrows the walk: "all" asks the closure question alone (an edge's
 * endpoint), so an object's own "background" lock and a background-locked
 * ancestor both read as free.
 */
function lockHolding(
  document: InteractiveCanvasDocument,
  id: string,
  scope: "any" | "all" = "any",
): LockHold | null {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const object = byId.get(id);
  if (!object) return null;
  if (object.locked !== undefined && (scope === "any" || object.locked === "all")) {
    return { holderId: id, mode: object.locked, own: true };
  }

  const visited = new Set<string>([id]);
  let parentId = object.parentId ?? undefined;
  let remaining = document.objects.length;
  while (parentId && remaining > 0) {
    if (visited.has(parentId)) return null;
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) return null;
    if (parent.locked === "all") return { holderId: parentId, mode: "all", own: false };
    parentId = parent.parentId ?? undefined;
    remaining -= 1;
  }
  return null;
}

/** How a gated box is described: its own lock, or the frame that covers it. */
function lockClause(hold: LockHold): string {
  return hold.own
    ? `is locked (${hold.mode})`
    : `is inside "${hold.holderId}" (locked all)`;
}

/** Build the context for one operation over the session's current draft. */
export function createOpContext(draft: InteractiveCanvasDocument): OpContext {
  /** The single lowering path; every mutator below is a spelling of this. */
  const lower = (
    operation: AgentPatchOperation,
    summary: string,
    notes?: readonly string[],
  ): OpOutcome => {
    const applied = applyOperationToDraft(draft, operation);
    return {
      status: "applied",
      draft: applied.document,
      summary,
      ...(notes && notes.length > 0 ? { notes: [...notes] } : {}),
    };
  };

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

    requireBoardEntity(id) {
      const known = draft.objects.some((object) => object.id === id)
        || draft.connections.some((connection) => connection.id === id);
      return known
        ? []
        : [`id "${id}" is not on the board — it names neither an object nor an edge.`];
    },

    requirePositionable(id, field = "id") {
      if (draft.objects.some((object) => object.id === id)) return [];
      if (draft.connections.some((connection) => connection.id === id)) {
        return [
          `${field} "${id}" is an edge, and an edge has no box to arrange — it re-routes itself`
          + " from the two boxes it joins, so move or resize those instead.",
        ];
      }
      return [`${field} "${id}" is not on the board.`];
    },

    requireSection(id, field = "id") {
      const target = draft.objects.find((object) => object.id === id);
      if (!target) {
        return draft.connections.some((connection) => connection.id === id)
          ? [
              `${field} "${id}" is an edge, not a frame — a section gesture needs a box`
              + " that owns a region of the board.",
            ]
          : [`${field} "${id}" is not on the board.`];
      }
      const kind = entityKindOf(target);
      if (kind === "section") return [];
      return [
        `${field} "${id}" is ${kind === "sticky" ? "a sticky" : `a ${target.type}`},`
        + " not a frame — fit_section, change_section_border, lock and unlock act on"
        + " sections; place_section opens one.",
      ];
    },

    requireShape(id) {
      const target = draft.objects.find((object) => object.id === id);
      if (!target) {
        return draft.connections.some((connection) => connection.id === id)
          ? [
              `id "${id}" is an edge — an edge has no shape to swap; style_edge sets`
              + " its line and its arrowheads.",
            ]
          : [`id "${id}" is not on the board.`];
      }
      const kind = entityKindOf(target);
      if (kind === "shape") return [];
      if (kind === "section") {
        return [
          `id "${id}" is a section — a frame is not a shape; restroke it with`
          + " change_section_border, or re-size it with resize.",
        ];
      }
      return [
        `id "${id}" is a sticky — a note is always a note; recolor it with change_color`
        + " or rewrite it with update_text.",
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
        // The alternatives named here have to be things this surface can
        // actually build. A "badge" is not one of them — no such object exists
        // in the document model — so the redirect points at the two that do:
        // the node's own text field, and a sticky placed beside it.
        `from and to are both "${from.objectId}" — self-loops are not supported by the connector router; say the loop in the node's own text ("repeats until…"), or place a sticky beside it, or leave it out and say so.`,
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
            `id "${id}" is the board's only section — every board keeps at least one; place its replacement first.`,
          ];
    },

    // ── Lock gates ─────────────────────────────────────────────────────────

    requireUnlocked(id, field = "id") {
      const hold = lockHolding(draft, id);
      return hold === null
        ? []
        : [`${field} "${id}" ${lockClause(hold)} — ${LOCK_RELEASE}.`];
    },

    requireUnlockedEdge(id, field = "id") {
      const connection = draft.connections.find((candidate) => candidate.id === id);
      if (!connection) return [];
      for (const end of [connection.from, connection.to]) {
        const hold = lockHolding(draft, end.objectId, "all");
        if (hold === null) continue;
        return [
          `${field} "${id}" meets "${end.objectId}", which ${lockClause(hold)}`
          + ` — an edge into a protected region is part of it; ${LOCK_RELEASE}.`,
        ];
      }
      return [];
    },

    requireUnlockedEndpoint(field, endpoint) {
      if (endpoint === undefined) return [];
      const hold = lockHolding(draft, endpoint.objectId, "all");
      return hold === null
        ? []
        : [
            `${field}.objectId "${endpoint.objectId}" ${lockClause(hold)}`
            + ` — an edge into a protected region is part of it; ${LOCK_RELEASE}.`,
          ];
    },

    // ── Mutation ───────────────────────────────────────────────────────────
    // Keep only the applier's document; the summary comes in with the call.

    mergeObject(id, patch, summary, notes) {
      return lower({ type: "updateObject", objectId: id, patch }, summary, notes);
    },

    mergeConnection(id, patch, summary, notes) {
      return lower({ type: "updateConnection", connectionId: id, patch }, summary, notes);
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

    applyLowered: lower,
  };
}
