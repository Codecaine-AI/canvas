/**
 * The three sticky operation descriptors behind the session runtime —
 * add_sticky (posts a note), update_sticky (rewrites, recolors, or moves
 * one), and remove_sticky (deletes it with attached edges) — built through
 * the shared operation pipeline.
 *
 * Each descriptor keeps state checks and mutation deliberately narrow.
 * Containment is reconciled by the shared pipeline after insertion or
 * movement, while deletion uses the shared object-removal path.
 */
import { defineOperationTool } from "../operation-tool";
import { Id, StickyPatch, StickyPayload } from "../schemas";

export const addSticky = defineOperationTool({
  name: "add_sticky",
  description:
    "Post a note. Containment is reconciled from geometry — a note outside every frame belongs to no section.",
  fields: { sticky: StickyPayload },
  validate: (ctx, p) => ctx.requireFreeId(p.sticky.id),
  apply: (ctx, p) => ctx.insertSticky(p.sticky),
});

export const updateSticky = defineOperationTool({
  name: "update_sticky",
  description:
    "Rewrite, recolor, or move a note. Moving it across a frame's edge changes which section owns it.",
  fields: { stickyId: Id, patch: StickyPatch },
  validate: (ctx, p) => ctx.requireSticky(p.stickyId),
  apply: (ctx, p) => ctx.mergeObject(p.stickyId, p.patch),
});

export const removeSticky = defineOperationTool({
  name: "remove_sticky",
  description: "Delete a note, along with every edge attached to it.",
  fields: { stickyId: Id },
  validate: (ctx, p) => ctx.requireSticky(p.stickyId),
  apply: (ctx, p) => ctx.removeObject(p.stickyId),
});
