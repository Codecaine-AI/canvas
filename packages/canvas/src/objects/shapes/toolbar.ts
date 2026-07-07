import type { ToolbarSpec } from "../object-def";

/**
 * The ONE shared shape-family selection toolbar (step 5): control list moved
 * verbatim from chrome's CONTEXT_TOOLBAR_REGISTRY["shape"] (minus the Icon
 * field — icons are resolved by the editor host). DATA-ONLY since the
 * co-location alignment: the flyout components these controls open live in
 * editor/features/selection-toolbar/flyouts/ (keyed by def kind + action id).
 * Attached by shapes/base.tsx to every shape-family def and explicitly by the
 * source-node/icon/code-block defs (their types resolved to the "shape"
 * toolbar variant before the registry migration).
 */
export const SHAPE_TOOLBAR: ToolbarSpec = {
  controls: [
    { action: "shape-swap", label: "Change shape", hasFlyout: true },
    { action: "color", label: "Fill color", hasFlyout: true },
    { action: "align", label: "Alignment", hasFlyout: true },
    { action: "font-style", label: "Font style", hasFlyout: true },
    { action: "size", label: "Text size", hasFlyout: true, text: "Medium" },
    { action: "bold", label: "Bold" },
    { action: "strikethrough", label: "Strikethrough" },
    { action: "link", label: "Link" },
    { action: "bullets", label: "Bullet list" },
    { action: "paragraph-align", label: "Paragraph alignment", hasFlyout: true },
  ],
};
