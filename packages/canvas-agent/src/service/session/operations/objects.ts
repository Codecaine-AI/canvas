/**
 * The three shape operation descriptors behind the layout runtime —
 * add_object places a shape, update_object restyles or moves one, and
 * remove_object deletes it with attached edges — with their shape-specific
 * schemas, validation, and mutations.
 *
 * The shared operation factory owns the execution pipeline around these thin
 * descriptors, including containment reconciliation, diffing, linting,
 * rendering, and event emission.
 */
import { defineOperationTool } from "../operation-tool";
import { Id, ObjectPatch, ObjectPayload } from "../schemas";

export const addObject = defineOperationTool({
  name: "add_object",
  description:
    "Place a shape. Containment is reconciled from geometry — a shape outside every frame belongs to no section.",
  fields: { object: ObjectPayload },
  validate: (ctx, p) => ctx.requireFreeId(p.object.id),
  apply: (ctx, p) => ctx.insertObject(p.object),
});

export const updateObject = defineOperationTool({
  name: "update_object",
  description:
    "Restyle or move a shape. Moving it across a frame's edge changes which section owns it, and every edge attached to it re-routes to follow.",
  fields: { objectId: Id, patch: ObjectPatch },
  validate: (ctx, p) => ctx.requireShape(p.objectId),
  apply: (ctx, p) => ctx.mergeObject(p.objectId, p.patch),
});

export const removeObject = defineOperationTool({
  name: "remove_object",
  description: "Delete a shape, along with every edge attached to it.",
  fields: { objectId: Id },
  validate: (ctx, p) => ctx.requireShape(p.objectId),
  apply: (ctx, p) => ctx.removeObject(p.objectId),
});
