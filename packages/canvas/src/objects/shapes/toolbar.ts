import type { ToolbarSpec } from "../object-def";

/**
 * The ONE shared shape-family selection toolbar (step 5): shape-swap, fill
 * color, and a text button that opens the inline text editor. No text-
 * formatting controls: one font/one size is a product decision, and objects
 * get one color pick. DATA-ONLY since the co-location alignment: the flyout
 * components these controls open live in
 * editor/features/selection-toolbar/flyouts/ (keyed by def kind + action id).
 * Attached by shapes/base.tsx to every shape-family def and explicitly by
 * icon/code-block defs (their types resolved to the "shape" toolbar variant
 * before the registry migration).
 */
export const SHAPE_TOOLBAR: ToolbarSpec = {
  controls: [
    { action: "shape-swap", label: "Change shape", hasFlyout: true },
    { action: "color", label: "Fill color", hasFlyout: true },
    { action: "text", label: "Edit text" },
  ],
};
