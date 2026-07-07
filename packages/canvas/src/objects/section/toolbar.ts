import type { ToolbarSpec } from "../object-def";

/**
 * Section selection toolbar (step 5): control list moved verbatim from
 * chrome's CONTEXT_TOOLBAR_REGISTRY["section"] (minus the Icon field).
 * DATA-ONLY since the co-location alignment: the flyout components these
 * controls open — including the context-menu-opened "tint" flyout, which has
 * no backing control here — live in editor/features/selection-toolbar/
 * flyouts/section-flyouts.tsx (keyed by def kind + action id).
 */
export const SECTION_TOOLBAR: ToolbarSpec = {
  controls: [
    { action: "color", label: "Color", hasFlyout: true },
    { action: "section-border-style", label: "Border style", hasFlyout: true },
    { action: "rename", label: "Rename", dividerAfter: true },
    { action: "visibility", label: "Hide contents" },
    { action: "lock", label: "Lock", hasFlyout: true },
  ],
};
