import type { ToolbarSpec } from "../object-def";

/**
 * Section selection toolbar (step 5): control list moved verbatim from
 * trim's CONTEXT_TOOLBAR_REGISTRY["section"] (minus the Icon field).
 * Controls read left-to-right by expected usage frequency; universal Color +
 * Text pair comes first adjacent/never separated where present; type-specific
 * modifiers next; state controls (Lock) last; dividerAfter marks group
 * boundaries, not individual items.
 *
 * DATA-ONLY since the co-location alignment: the flyout components these
 * controls open live in stage/editor/features/selection-toolbar/flyouts/
 * section-flyouts.tsx (keyed by def kind + action id).
 */
export const SECTION_TOOLBAR: ToolbarSpec = {
  controls: [
    { action: "color", label: "Color", hasFlyout: true },
    { action: "rename", label: "Rename", dividerAfter: true },
    { action: "fit-children", label: "Fit to content" },
    { action: "section-border-style", label: "Border style", hasFlyout: true, dividerAfter: true },
    { action: "lock", label: "Lock", hasFlyout: true },
  ],
};
