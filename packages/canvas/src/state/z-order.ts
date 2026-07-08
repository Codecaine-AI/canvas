"use client";

import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "./schema";

type PaintOrderInput = InteractiveCanvasDocument | InteractiveCanvasObject[];

function inputObjects(input: PaintOrderInput): InteractiveCanvasObject[] {
  return Array.isArray(input) ? input : input.objects;
}

function sectionArea(section: InteractiveCanvasObject): number {
  return section.geometry.width * section.geometry.height;
}

/**
 * Returns canvas objects in DOM/paint order.
 *
 * Sections form the backdrop layer: shallower sections paint first, then
 * larger same-depth sections paint behind smaller ones. Non-sections always
 * paint above every section and keep schema order.
 */
export function paintOrderedObjects(input: PaintOrderInput): InteractiveCanvasObject[] {
  const objects = inputObjects(input);
  const entries = objects.map((object, index) => ({ object, index }));
  const sections = entries.filter(({ object }) => object.type === "section");
  if (sections.length === 0) return objects;

  const byId = new Map(objects.map((object) => [object.id, object]));

  function sectionDepth(section: InteractiveCanvasObject): number {
    let depth = 0;
    const visited = new Set<string>([section.id]);
    let parentId = section.parentId ?? null;
    while (parentId && !visited.has(parentId)) {
      const parent = byId.get(parentId);
      if (!parent) break;
      visited.add(parent.id);
      depth += 1;
      parentId = parent.parentId ?? null;
    }
    return depth;
  }

  const sectionDepths = new Map(sections.map(({ object }) => [object.id, sectionDepth(object)]));
  const orderedSections = [...sections].sort((a, b) => {
    const depthDelta = (sectionDepths.get(a.object.id) ?? 0) - (sectionDepths.get(b.object.id) ?? 0);
    if (depthDelta !== 0) return depthDelta;

    const areaDelta = sectionArea(b.object) - sectionArea(a.object);
    if (areaDelta !== 0) return areaDelta;

    return a.index - b.index;
  });
  const nonSections = entries.filter(({ object }) => object.type !== "section");

  return [...orderedSections, ...nonSections].map(({ object }) => object);
}
