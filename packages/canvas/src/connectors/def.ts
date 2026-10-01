/**
 * Connector definition metadata for selection toolbar controls, color role,
 * and routed-label editing.
 */
import type { ConnectorDef, ToolbarSpec } from "../objects/object-def";
import type { CanvasStyle } from "../theme/canvas-style";

// ---------------------------------------------------------------------------
// Connector style constants (moved from theme/tokens.ts in the theme
// dispersal — per-kind constants co-locate with their def). Values sampled
// from FigJam reference exports; px figures are LOGICAL px.
// ---------------------------------------------------------------------------

// (The old CONNECTOR_COLORS hex set + CONNECTOR_DEFAULT_COLOR died in the P1
// color cutover: connector strokes resolve from `connection.color` through
// palette.ts's resolveConnectorStroke, defaulting to the "gray" pick.)

/** Dash pattern, logical px: 19px dash / 7px gap — FigJam's, sampled on its 4px connector line. */
export const CONNECTOR_DASH_PATTERN_PX: readonly [number, number] = [19, 7];

/** The connector line width CONNECTOR_DASH_PATTERN_PX was sampled at. */
const DASH_PATTERN_LINE_WIDTH_PX = 4;

/**
 * The dash pattern under a canvas style, as an SVG `stroke-dasharray`:
 * FigJam's 19/7 scaled with the style's connector line width, so a thin
 * schematic line gets proportionally short dashes (1.5px → 7.13 / 2.63)
 * instead of long FigJam strokes. Dashed connectors and dashed section
 * frames share it. The default style draws exactly "19 7".
 */
export function connectorDashArray(canvasStyle: Pick<CanvasStyle, "connectorStrokeWidthPx">): string {
  const scale = canvasStyle.connectorStrokeWidthPx / DASH_PATTERN_LINE_WIDTH_PX;
  return CONNECTOR_DASH_PATTERN_PX.map((length) => Math.round(length * scale * 100) / 100).join(" ");
}

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
