/**
 * The operation consequences embedded in the four kind sections of the
 * <capabilities> context block. Each tool's parameter schema carries its
 * fields; these entries carry only consequences.
 *
 * OP_REFERENCE is keyed by the model-facing op-kind union, so adding an
 * operation to the surface without documenting it here is a compile error.
 * OP_KIND_GROUPS assigns every operation to its entity section, and the
 * assembly guard rejects missing or duplicate assignments. Behavioral truth
 * comes from service/session/operations.
 */
import {
  MODEL_OPERATION_KINDS,
  type ModelOperationKind,
} from "../../../../../service/session/op-surface";

interface OpReferenceEntry {
  /** Short `→` consequence lines: effects, guards, and what returns. */
  consequences: readonly string[];
}

export type CapabilityKind = "sections" | "stickies" | "objects" | "connections";

export const OP_REFERENCE: Record<ModelOperationKind, OpReferenceEntry> = {
  addSection: {
    consequences: [
      "creates a titled container; place geometry on the 16px grid",
    ],
  },
  updateSection: {
    consequences: [
      "the patch merges onto the section",
      "geometry is taken exactly as written — a frame never resizes itself, so the space you give it is the space it keeps",
    ],
  },
  removeSection: {
    consequences: [
      "cascades to all descendants and their connections; removing the board's last section is rejected — every board keeps at least one",
    ],
  },
  fitSection: {
    consequences: [
      "resizes the frame to hug its current children with padding, nothing else moves — the only operation that measures content for you",
      "fits that one section: ancestors keep their geometry, so fit them yourself afterwards, innermost first",
      "an empty section has nothing to fit around — the call is a no-op with a note; use update_section to size it",
    ],
  },
  addSticky: {
    consequences: [
      "creates a note",
    ],
  },
  updateSticky: {
    consequences: [
      "the patch merges onto the sticky",
    ],
  },
  removeSticky: {
    consequences: [
      "removes the note and every connection that ends on it",
    ],
  },
  addObject: {
    consequences: [
      "type comes from the roster below — sections and stickies have their own add tools",
      "containment is reconciled from geometry — a shape outside every frame belongs to no section",
    ],
  },
  updateObject: {
    consequences: [
      "shapes and nodes only — a section or sticky target is rejected toward update_section/update_sticky",
      "the patch merges; geometry replaces the whole rectangle and snaps to the 16px grid",
    ],
  },
  removeObject: {
    consequences: [
      "removes one node and every connection that ends on it; sections and stickies are rejected toward remove_section/remove_sticky",
    ],
  },
  addConnection: {
    consequences: [
      "both endpoints must already be on the board, and they must differ",
      "a second edge over an existing from→to pair warns as a possible duplicate — restyle the existing edge with update_connection instead",
    ],
  },
  updateConnection: {
    consequences: [
      "each patch field replaces its previous value wholesale",
      "an endpoint you supply must be on the board, and the two must differ",
    ],
  },
  removeConnection: {
    consequences: [
      "removes the wire; the endpoint objects stay",
    ],
  },
};

export const OP_KIND_GROUPS = {
  sections: ["addSection", "updateSection", "removeSection", "fitSection"],
  stickies: ["addSticky", "updateSticky", "removeSticky"],
  objects: ["addObject", "updateObject", "removeObject"],
  connections: ["addConnection", "updateConnection", "removeConnection"],
} as const satisfies Record<CapabilityKind, readonly ModelOperationKind[]>;

function assertCompleteKindGroups(): void {
  const grouped = Object.values(OP_KIND_GROUPS).flat() as ModelOperationKind[];
  const groupedKinds = new Set<ModelOperationKind>(grouped);
  if (
    grouped.length !== MODEL_OPERATION_KINDS.length
    || groupedKinds.size !== MODEL_OPERATION_KINDS.length
    || MODEL_OPERATION_KINDS.some((kind) => !groupedKinds.has(kind))
  ) {
    throw new Error("Every model operation kind must appear in exactly one capability kind section");
  }
}

assertCompleteKindGroups();

/**
 * The flush-left <ops> fragment body for one entity-kind section: each
 * tool-name heading followed by its indented `→` consequence lines. The
 * assembly wraps it in the tag and indents the whole block.
 */
export function formatOpReference(kind: CapabilityKind): string {
  const lines: string[] = [];
  for (const opKind of OP_KIND_GROUPS[kind]) {
    const entry = OP_REFERENCE[opKind];
    lines.push(opKind.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`));
    for (const consequence of entry.consequences) {
      lines.push(`    → ${consequence}`);
    }
  }
  return lines.join("\n");
}
