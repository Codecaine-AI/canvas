"use client";

/**
 * Tiny cross-domain helpers shared by the action handler modules (objects,
 * geometry-ops, connections, annotations) and the reducer. Intra-actions
 * only — not part of the public "./actions" barrel surface.
 */
import type { CanvasSelection } from "./types";

export function selectedObjectIds(selection: CanvasSelection): string[] {
  return selection.kind === "objects" ? selection.objectIds : [];
}

export function nextId(prefix: string, ids: Iterable<string>): string {
  const used = new Set(ids);
  let index = 1;
  while (used.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}
