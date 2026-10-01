"use client";

import type { InteractiveCanvasObject } from "./schema";

/**
 * Nesting depth per object: 1 + the number of SECTION ancestors on its
 * `parentId` chain. A top-level section is depth 1, a section inside it depth
 * 2, and so on — the `depth` the layer-cake section fill deepens with
 * (theme/palette.ts resolveSectionPaint). Non-section objects get the same
 * count (a shape directly inside a top-level section is depth 2).
 *
 * Pure and cycle-safe: a broken chain (unknown parent, or a parent cycle in a
 * hand-edited document) simply stops the walk.
 */
export function sectionDepthMap(
  objects: readonly Pick<InteractiveCanvasObject, "id" | "type" | "parentId">[],
): Map<string, number> {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const depths = new Map<string, number>();
  for (const object of objects) {
    let depth = 1;
    const visited = new Set<string>([object.id]);
    let parentId = object.parentId ?? null;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      if (parent.type === "section") depth += 1;
      parentId = parent.parentId ?? null;
    }
    depths.set(object.id, depth);
  }
  return depths;
}
