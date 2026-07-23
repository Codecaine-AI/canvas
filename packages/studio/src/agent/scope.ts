import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "@codecaine-ai/canvas";

import type { PendingNote } from "./pending-notes";

function scopeContribution(
  object: InteractiveCanvasObject,
  objectsById: ReadonlyMap<string, InteractiveCanvasObject>,
): string {
  if (object.type === "section" || !object.parentId) return object.id;

  let section = objectsById.get(object.parentId);
  if (section?.type !== "section") return object.id;

  const visited = new Set([object.id]);
  while (section.parentId && !visited.has(section.id)) {
    visited.add(section.id);
    const parent = objectsById.get(section.parentId);
    if (parent?.type !== "section") break;
    section = parent;
  }
  return section.id;
}

export function scopeForNotes(
  document: InteractiveCanvasDocument,
  notes: readonly Pick<PendingNote, "target">[],
): { scopeObjectIds: string[] } {
  const objectsById = new Map(document.objects.map((object) => [object.id, object]));
  const scopeObjectIds = new Set<string>();

  for (const note of notes) {
    if (note.target.kind !== "object") continue;
    const object = objectsById.get(note.target.objectId);
    if (object) scopeObjectIds.add(scopeContribution(object, objectsById));
  }

  return { scopeObjectIds: [...scopeObjectIds] };
}

export function scopeForWholeBoard(
  document: InteractiveCanvasDocument,
): { scopeObjectIds: string[] } {
  return {
    scopeObjectIds: document.objects
      .filter((object) => !object.parentId)
      .map((object) => object.id),
  };
}
