import type { ToolbarSpec } from "../object-def";

/**
 * The ONE shared shape-family selection toolbar (step 5): fill color, a text
 * button that opens the inline text editor, then shape-swap. Controls read
 * left-to-right by expected usage frequency: the universal Color + Text pair
 * comes first adjacent/never separated; type-specific modifiers next; state
 * controls (Lock) last where present; dividerAfter marks group boundaries, not
 * individual items. No text-formatting controls: one font/one size is a
 * product decision, and objects get one color pick. DATA-ONLY since the co-
 * location alignment: the flyout components these controls open live in
 * editor/features/selection-toolbar/flyouts/ (keyed by def kind + action id).
 * Attached by shapes/base.tsx to every shape-family def and explicitly by
 * icon defs (their type resolved to the "shape" toolbar variant before the
 * registry migration).
 */
export const SHAPE_TOOLBAR: ToolbarSpec = {
  controls: [
    { action: "color", label: "Fill color", hasFlyout: true },
    { action: "text", label: "Edit text", dividerAfter: true },
    { action: "shape-swap", label: "Change shape", hasFlyout: true },
  ],
};
