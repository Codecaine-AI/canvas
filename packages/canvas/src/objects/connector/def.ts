import type { ObjectDef, ToolbarSpec } from "../object-def";

// ---------------------------------------------------------------------------
// Connector style constants (moved from theme/tokens.ts in the theme
// dispersal — per-kind constants co-locate with their def). Values sampled
// from FigJam reference exports; px figures are LOGICAL px.
// ---------------------------------------------------------------------------

/** Named connector stroke colors. */
export const CONNECTOR_COLORS = {
  gray: "#757575",
  orange: "#EB7500",
  green: "#3E9B4B",
  red: "#F24822",
  purple: "#9747FF",
  darkYellow: "#E8A302",
} as const;

/** Default connector color when none is specified — neutral gray. */
export const CONNECTOR_DEFAULT_COLOR = CONNECTOR_COLORS.gray;

/** Dash pattern, logical px: 19px dash / 7px gap. */
export const CONNECTOR_DASH_PATTERN_PX: readonly [number, number] = [19, 7];

/**
 * Connector def (step 5) — a SELECTION-KIND def, not an object type:
 * connections aren't objects, so `objectDefForType` never resolves to it and
 * its `render` is never dispatched (connections draw through
 * render/connectors/*). It exists to carry the connector selection toolbar:
 * control list moved verbatim from chrome's CONTEXT_TOOLBAR_REGISTRY
 * ["connector"] (minus the Icon field). DATA-ONLY since the co-location
 * alignment: the flyout components live in editor/features/selection-toolbar/
 * flyouts/connector-flyouts.tsx (keyed by def kind + action id).
 */
const CONNECTOR_TOOLBAR: ToolbarSpec = {
  controls: [
    { action: "color", label: "Line color", hasFlyout: true },
    { action: "stroke", label: "Stroke", hasFlyout: true },
    { action: "dash", label: "Line style", hasFlyout: true },
    { action: "routing", label: "Corner style", hasFlyout: true },
    { action: "arrowhead", label: "Arrowhead style", hasFlyout: true },
    { action: "label-align", label: "Label alignment", hasFlyout: true },
  ],
};

export const connectorDef: ObjectDef = {
  kind: "connector",
  // Never dispatched: connections render via render/connectors, not through
  // the object registry's render path.
  render: () => null,
  css: "",
  // Placeholder defaults — connections have no object geometry/tone; nothing
  // reads these (defaults lookups key on InteractiveCanvasObjectType).
  defaults: {
    geometry: { x: 0, y: 0, width: 0, height: 0 },
    tone: "neutral",
    label: "Connector",
  },
  handles: "none",
  hitTest: "solid",
  dragCapture: "none",
  labelEditing: { target: "none" },
  toolbar: CONNECTOR_TOOLBAR,
};
