/**
 * The four section operation descriptors behind the layout runtime —
 * add_section opens a frame, update_section changes one, remove_section
 * deletes one and its descendants, and fit_section lives here as a section
 * operation — with their section-specific schemas, validation, and mutations.
 *
 * The shared operation factory owns the execution pipeline around these thin
 * descriptors, including containment reconciliation, diffing, linting,
 * rendering, and event emission.
 */
import { defineOperationTool } from "../operation-tool";
import { Id, SectionPatch, SectionPayload } from "../schemas";

export const addSection = defineOperationTool({
  name: "add_section",
  description:
    "Open a new frame. Membership is reconciled from geometry, so a frame "
    + "drawn over existing shapes adopts them, and the frame keeps exactly "
    + "the size you give it.",
  fields: { section: SectionPayload },
  validate: (ctx, p) => ctx.requireFreeId(p.section.id),
  apply: (ctx, p) => ctx.insertSection(p.section),
});

export const updateSection = defineOperationTool({
  name: "update_section",
  description:
    "Resize or restyle a frame. Membership is reconciled from geometry, so "
    + "growing or shrinking a frame adopts or releases whatever its edges "
    + "now cover, and the frame keeps exactly the size you give it.",
  fields: { sectionId: Id, patch: SectionPatch },
  validate: (ctx, p) => ctx.requireSection(p.sectionId),
  apply: (ctx, p) => ctx.mergeObject(p.sectionId, p.patch),
});

export const removeSection = defineOperationTool({
  name: "remove_section",
  description: "Delete a section and every descendant inside it.",
  fields: { sectionId: Id },
  validate: (ctx, p) => [
    ...ctx.requireSection(p.sectionId),
    ...ctx.requireNotLastSection(p.sectionId),
  ],
  apply: (ctx, p) => ctx.removeObject(p.sectionId),
});

export const fitSection = defineOperationTool({
  name: "fit_section",
  description:
    "Close a section around the children already inside it. Fits only the "
    + "named section — ancestors keep their slack until you fit them too.",
  fields: { sectionId: Id },
  validate: (ctx, p) => ctx.requireSection(p.sectionId),
  apply: (ctx, p) => ctx.fitSection(p.sectionId),
});
