"use client";

import { fitSectionToChildren } from "./geometry";
import type {
  CanvasGeometry,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "./schema";
import { reconcileSectionMembership } from "./section-membership";

export type AgentPatchAutoFitResult = {
  document: InteractiveCanvasDocument;
  /** Sections whose geometry actually changed, in innermost-first fit order. */
  fittedSectionIds: string[];
};

function geometriesEqual(a: CanvasGeometry, b: CanvasGeometry): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function directChildrenBySection(
  document: InteractiveCanvasDocument,
): Map<string, Map<string, InteractiveCanvasObject>> {
  const sectionIds = new Set(
    document.objects.filter((object) => object.type === "section").map((object) => object.id),
  );
  const children = new Map<string, Map<string, InteractiveCanvasObject>>();
  for (const sectionId of sectionIds) children.set(sectionId, new Map());
  for (const object of document.objects) {
    if (!object.parentId || !sectionIds.has(object.parentId)) continue;
    children.get(object.parentId)?.set(object.id, object);
  }
  return children;
}

function childSetOrGeometryChanged(
  previousChildren: ReadonlyMap<string, InteractiveCanvasObject> | undefined,
  nextChildren: ReadonlyMap<string, InteractiveCanvasObject> | undefined,
): boolean {
  if ((previousChildren?.size ?? 0) !== (nextChildren?.size ?? 0)) return true;
  for (const [id, nextChild] of nextChildren ?? []) {
    const previousChild = previousChildren?.get(id);
    if (!previousChild || !geometriesEqual(previousChild.geometry, nextChild.geometry)) return true;
  }
  return false;
}

function sectionDepth(
  sectionId: string,
  objectsById: ReadonlyMap<string, InteractiveCanvasObject>,
): number {
  let depth = 0;
  let current = objectsById.get(sectionId);
  const visited = new Set([sectionId]);
  while (current?.parentId && !visited.has(current.parentId)) {
    const parent = objectsById.get(current.parentId);
    if (!parent || parent.type !== "section") break;
    depth += 1;
    visited.add(parent.id);
    current = parent;
  }
  return depth;
}

/**
 * Reconciles geometry-derived membership, then automatically fits every
 * section whose direct child set or a direct child's geometry changed in an
 * agent batch. Fits run deepest-first so a nested section's new bounds feed
 * its ancestors in the same pass.
 *
 * Background-locked page frames and sections explicitly resized by the batch
 * are never fitted. Call this exactly once, after all batch mutations.
 */
export function autoFitSectionsAfterAgentPatch(
  previousDocument: InteractiveCanvasDocument,
  patchedDocument: InteractiveCanvasDocument,
  explicitlyResizedSectionIds: ReadonlySet<string> = new Set(),
): AgentPatchAutoFitResult {
  const previous = reconcileSectionMembership(previousDocument);
  let document = reconcileSectionMembership(patchedDocument);
  const previousChildren = directChildrenBySection(previous);
  const nextChildren = directChildrenBySection(document);
  const objectsById = new Map(document.objects.map((object) => [object.id, object]));

  const directlyAffected = new Set<string>();
  for (const object of document.objects) {
    if (object.type !== "section") continue;
    if (
      childSetOrGeometryChanged(previousChildren.get(object.id), nextChildren.get(object.id))
    ) {
      directlyAffected.add(object.id);
    }
  }

  // Only an eligible section will be fitted; each of its ancestors must be
  // considered too because an inner fit may change an ancestor's child bounds.
  const affected = new Set<string>();
  for (const sectionId of directlyAffected) {
    const section = objectsById.get(sectionId);
    if (
      !section ||
      section.locked === "background" ||
      explicitlyResizedSectionIds.has(sectionId)
    ) {
      continue;
    }
    let current: InteractiveCanvasObject | undefined = section;
    const visited = new Set<string>();
    while (current?.type === "section" && !visited.has(current.id)) {
      affected.add(current.id);
      visited.add(current.id);
      current = current.parentId ? objectsById.get(current.parentId) : undefined;
    }
  }

  const fitOrder = [...affected].sort((a, b) => {
    const depthDifference = sectionDepth(b, objectsById) - sectionDepth(a, objectsById);
    if (depthDifference !== 0) return depthDifference;
    return a.localeCompare(b);
  });
  const fittedSectionIds: string[] = [];
  for (const sectionId of fitOrder) {
    const section = objectsById.get(sectionId);
    if (
      !section ||
      section.locked === "background" ||
      explicitlyResizedSectionIds.has(sectionId)
    ) {
      continue;
    }
    const fitted = fitSectionToChildren(document, sectionId);
    const fittedSection = fitted.objects.find((object) => object.id === sectionId);
    if (!fittedSection || geometriesEqual(section.geometry, fittedSection.geometry)) continue;
    document = fitted;
    objectsById.set(sectionId, fittedSection);
    fittedSectionIds.push(sectionId);
  }

  return { document, fittedSectionIds };
}
