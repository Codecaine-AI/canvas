/**
 * The model-facing operation roster and classification boundary for canvas
 * edits. This module owns the thirteen operation kinds and maps internal
 * object operations into section, sticky, or shape operations using payload
 * discriminators and document targets.
 */
import type { CanvasAgentPatchOperation } from "@codecaine-ai/canvas/actions";
import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";
import { OBJECT_TYPE_DEFAULTS } from "../../../../canvas/src/state/schema/object-defaults";

import type { AgentPatchOperation } from "../../protocol";

/** The thirteen model-facing operation names, in reference order. */
export const MODEL_OPERATION_KINDS = [
  "addSection", "updateSection", "removeSection", "fitSection",
  "addSticky", "updateSticky", "removeSticky",
  "addObject", "updateObject", "removeObject",
  "addConnection", "updateConnection", "removeConnection",
] as const;

/** A model-facing operation discriminator. */
export type ModelOperationKind = (typeof MODEL_OPERATION_KINDS)[number];

/** One model-facing canvas operation. */
export type ModelOperation =
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

/** The model-facing entity family for a canvas object. */
export type EntityKind = "section" | "sticky" | "shape";

/** Classify a canvas object by its model-facing operation family. */
export function entityKindOf(object: InteractiveCanvasObject): EntityKind {
  if (object.type === "section") return "section";
  if (object.type === "sticky") return "sticky";
  return "shape";
}

// ---------------------------------------------------------------------------
// Classification (internal → model-facing)
// ---------------------------------------------------------------------------

function targetKind(document: InteractiveCanvasDocument, objectId: string): EntityKind {
  const target = document.objects.find((object) => object.id === objectId);
  return target ? entityKindOf(target) : "shape";
}

/**
 * Classify one internal operation into the model-facing grammar, resolving
 * the target's kind against the document it lives in (the payload for adds;
 * the given document for updates and removes — pass the document the target
 * id resolves in, e.g. the baseline for base→draft diff ops). Total: an
 * unknown target falls back to the object form.
 */
export function classifyOperation(
  operation: AgentPatchOperation | CanvasAgentPatchOperation,
  document: InteractiveCanvasDocument,
): ModelOperation {
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
      return operation as ModelOperation;
  }
}

/** The id a model-facing operation targets or creates. */
export function operationTargetId(operation: ModelOperation): string {
  switch (operation.type) {
    case "addSection": return String(operation.section.id);
    case "updateSection":
    case "removeSection":
    case "fitSection": return operation.sectionId;
    case "addSticky": return String(operation.sticky.id);
    case "updateSticky":
    case "removeSticky": return operation.stickyId;
    case "addObject": return String(operation.object.id);
    case "updateObject":
    case "removeObject": return operation.objectId;
    case "addConnection": return String(operation.connection.id);
    case "updateConnection":
    case "removeConnection": return operation.connectionId;
  }
}
