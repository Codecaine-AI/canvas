/**
 * Connector definition metadata for selection toolbar controls, color role,
 * and routed-label editing.
 */
import type { ConnectorDef, ToolbarSpec } from "../objects/object-def";

// ---------------------------------------------------------------------------
// Connector style constants (moved from theme/tokens.ts in the theme
// dispersal — per-kind constants co-locate with their def). Values sampled
// from FigJam reference exports; px figures are LOGICAL px.
// ---------------------------------------------------------------------------

// (The old CONNECTOR_COLORS hex set + CONNECTOR_DEFAULT_COLOR died in the P1
// color cutover: connector strokes resolve from `connection.color` through
// palette.ts's resolveConnectorStroke, defaulting to the "gray" pick.)

/** Dash pattern, logical px: 19px dash / 7px gap. */
export const CONNECTOR_DASH_PATTERN_PX: readonly [number, number] = [19, 7];

/**
 * The connector selection toolbar reads left-to-right by expected usage
 * frequency: the universal Color + Text pair comes first (adjacent, never
 * separated), type-specific modifiers follow, state controls such as Lock
 * belong last when present, and dividerAfter marks group boundaries rather
 * than individual items. Style controls are flyout-backed, while Text opens
 * the routed-midpoint label editor directly. DATA-ONLY since the co-location
 * alignment: the flyout components live in
 * stage/editor/features/selection-toolbar/flyouts/connector-flyouts.tsx (keyed by
 * def kind + action id).
 */
const CONNECTOR_TOOLBAR: ToolbarSpec = {
  controls: [
    { action: "color", label: "Line color", hasFlyout: true },
    { action: "text", label: "Text", dividerAfter: true },
    { action: "dash", label: "Line style", hasFlyout: true },
    { action: "arrowhead", label: "Arrowhead style", hasFlyout: true },
  ],
};

/**
 * The connector def (D19) — a ConnectorDef, NOT an ObjectDef: connections
 * aren't objects (no render dispatch, no geometry defaults, no text slot, no
 * outline), so since P4 this carries exactly what connectors have — the
 * selection toolbar, the "connector" palette role their `connection.color`
 * resolves through (connector render components + resolveConnectorStroke), and the
 * routed-midpoint label contract (labels render and edit at
 * routeConnection().labelPoint — use-text-editing.ts's connection path).
 * It is deliberately absent from OBJECT_DEFS.
 */
export const connectorDef: ConnectorDef = {
  kind: "connector",
  toolbar: CONNECTOR_TOOLBAR,
  colorRole: "connector",
  labelEditing: "routed-midpoint",
};
