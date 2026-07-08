"use client";

import {
  SECTION_CAPTURE_OVERLAP_THRESHOLD,
  type CanvasBounds,
} from "./geometry";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "./schema";

function boundsArea(bounds: CanvasBounds): number {
  return bounds.width * bounds.height;
}

function overlapArea(a: CanvasBounds, b: CanvasBounds): number {
  const overlapWidth = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapHeight = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (overlapWidth <= 0 || overlapHeight <= 0) return 0;
  return overlapWidth * overlapHeight;
}

function sectionCanParent(section: InteractiveCanvasObject, object: InteractiveCanvasObject): boolean {
  if (section.type !== "section") return false;
  if (section.id === (object.parentId ?? null)) return true;
  return section.locked !== "all";
}

export function resolveSectionParent(
  object: InteractiveCanvasObject,
  document: InteractiveCanvasDocument,
  excludeIds?: ReadonlySet<string>,
): string | null {
  const objectArea = boundsArea(object.geometry);
  if (objectArea <= 0) return null;

  let bestSectionId: string | null = null;
  let bestSectionArea = Number.POSITIVE_INFINITY;

  for (const section of document.objects) {
    if (section.id === object.id || !sectionCanParent(section, object)) continue;
    if (excludeIds?.has(section.id)) continue;

    const sectionArea = boundsArea(section.geometry);
    if (sectionArea <= objectArea || sectionArea >= bestSectionArea) continue;

    const overlapFraction = overlapArea(object.geometry, section.geometry) / objectArea;
    if (overlapFraction < SECTION_CAPTURE_OVERLAP_THRESHOLD) continue;

    bestSectionId = section.id;
    bestSectionArea = sectionArea;
  }

  return bestSectionId;
}

export function reconcileSectionMembership(
  document: InteractiveCanvasDocument,
): InteractiveCanvasDocument {
  let changed = false;

  const objects = document.objects.map((object) => {
    const parentId = resolveSectionParent(object, document);
    if ((object.parentId ?? null) === parentId && object.parentId === parentId) {
      return object;
    }
    changed = true;
    return { ...object, parentId };
  });

  if (!changed) return document;
  return { ...document, objects };
}
