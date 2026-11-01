/**
 * The DELTA VOCABULARY: the neutral verbs a document diff is allowed to speak,
 * and the classification boundary that translates internal object operations
 * into them using payload discriminators and document targets.
 *
 * This is deliberately NOT the model-facing tool roster — that lives in
 * ./operations (`operationTools`), and the capabilities block keys off it. A
 * diff cannot recover a gesture: `move_to`, `move_by`, `align`, and
 * `space_out` all land in the document as the same geometry change, so asking
 * a diff to name the tool would mean guessing. What a diff CAN say is what
 * this file says — added / changed / removed, per entity kind, plus the one
 * section-fit shape the resolver produces — and that is the whole vocabulary.
 *
 * The ledger (catalog/layout-editor/state/rules/operations.ts) carries
 * the gesture verbs, this file carries the delta verbs, and the two disagreeing
 * is the signal, not a bug: `<ops>` says what was attempted, `<diff>` says what
 * actually changed.
 */
import type { CanvasAgentPatchOperation } from "@codecaine-ai/canvas/actions";
import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";
import { OBJECT_TYPE_DEFAULTS } from "../../../../../canvas/src/state/schema/object-defaults";

import type { AgentPatchOperation } from "../../../protocol";

/**
 * The thirteen delta verbs, in reference order: add / change / remove for each
 * of the four entity kinds, plus `fitSection`, the one delta a resolver
 * produces that has no plain add/change/remove reading.
 */
export const DELTA_KINDS = [
  "addSection", "updateSection", "removeSection", "fitSection",
  "addSticky", "updateSticky", "removeSticky",
  "addObject", "updateObject", "removeObject",
  "addConnection", "updateConnection", "removeConnection",
] as const;

/** A delta discriminator. */
export type DeltaKind = (typeof DELTA_KINDS)[number];

/** One classified document delta. */
export type BoardDelta =
  | { type: "addSection"; section: Record<string, unknown> }
  | { type: "updateSection"; sectionId: string; patch: Record<string, unknown> }
  | { type: "removeSection"; sectionId: string }
  | { type: "fitSection"; sectionId: string }
  | { type: "addSticky"; sticky: Record<string, unknown> }
  | { type: "updateSticky"; stickyId: string; patch: Record<string, unknown> }
  | { type: "removeSticky"; stickyId: string }
  | { type: "addObject"; object: Record<string, unknown> }
  | { type: "updateObject"; objectId: string; patch: Record<string, unknown> }
  | { type: "removeObject"; objectId: string }
  | { type: "addConnection"; connection: Record<string, unknown> }
  | { type: "updateConnection"; connectionId: string; patch: Record<string, unknown> }
  | { type: "removeConnection"; connectionId: string };

/** Shape/node types: the full object roster minus the kinds with their own ops. */
export const SHAPE_OBJECT_TYPES: ReadonlySet<string> = new Set(
  Object.keys(OBJECT_TYPE_DEFAULTS).filter((type) => type !== "section" && type !== "sticky"),
);

/** The entity family a delta verb is chosen from, for a canvas object. */
export type EntityKind = "section" | "sticky" | "shape";

/** Classify a canvas object into the entity family whose delta verbs it takes. */
export function entityKindOf(object: InteractiveCanvasObject): EntityKind {
  if (object.type === "section") return "section";
  if (object.type === "sticky") return "sticky";
  return "shape";
}

// ---------------------------------------------------------------------------
// Classification (internal patch op → delta verb)
// ---------------------------------------------------------------------------

function targetKind(document: InteractiveCanvasDocument, objectId: string): EntityKind {
  const target = document.objects.find((object) => object.id === objectId);
  return target ? entityKindOf(target) : "shape";
}

/**
 * Classify one internal patch operation into a delta verb, resolving the
 * target's kind against the document it lives in (the payload for adds; the
 * given document for updates and removes — pass the document the target id
 * resolves in, e.g. the baseline for base→draft diff ops). Total: an unknown
 * target falls back to the object form.
 */
export function classifyDelta(
  operation: AgentPatchOperation | CanvasAgentPatchOperation,
  document: InteractiveCanvasDocument,
): BoardDelta {
  switch (operation.type) {
    case "addObject": {
      const { type, ...rest } = operation.object as Record<string, unknown>;
      if (type === "section") return { type: "addSection", section: rest };
      if (type === "sticky") return { type: "addSticky", sticky: rest };
      return { type: "addObject", object: operation.object as Record<string, unknown> };
    }
    case "updateObject": {
      const patch = operation.patch as Record<string, unknown>;
      const kind = targetKind(document, operation.objectId);
      if (kind === "section") {
        return { type: "updateSection", sectionId: operation.objectId, patch };
      }
      if (kind === "sticky") {
        return { type: "updateSticky", stickyId: operation.objectId, patch };
      }
      return { type: "updateObject", objectId: operation.objectId, patch };
    }
    case "removeObject": {
      const kind = targetKind(document, operation.objectId);
      if (kind === "section") {
        return { type: "removeSection", sectionId: operation.objectId };
      }
      if (kind === "sticky") {
        return { type: "removeSticky", stickyId: operation.objectId };
      }
      return { type: "removeObject", objectId: operation.objectId };
    }
    default:
      return operation as BoardDelta;
  }
}

/** The id a delta targets or creates. */
export function deltaTargetId(delta: BoardDelta): string {
  switch (delta.type) {
    case "addSection": return String(delta.section.id);
    case "updateSection":
    case "removeSection":
    case "fitSection": return delta.sectionId;
    case "addSticky": return String(delta.sticky.id);
    case "updateSticky":
    case "removeSticky": return delta.stickyId;
    case "addObject": return String(delta.object.id);
    case "updateObject":
    case "removeObject": return delta.objectId;
    case "addConnection": return String(delta.connection.id);
    case "updateConnection":
    case "removeConnection": return delta.connectionId;
  }
}
