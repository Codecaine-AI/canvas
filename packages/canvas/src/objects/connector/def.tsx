"use client";

import { ColorPalettePopover } from "../../chrome/ColorPalettePopover";
import { CONNECTOR_COLORS, CONNECTOR_DEFAULT_COLOR } from "../../tokens/figjam-tokens";
import type { ObjectDef, ToolbarFlyoutProps, ToolbarSpec } from "../object-def";

/**
 * Connector def (step 5) — a SELECTION-KIND def, not an object type:
 * connections aren't objects, so `objectDefForType` never resolves to it and
 * its `render` is never dispatched (connections draw through
 * render/connectors/*). It exists to carry the connector context toolbar:
 * control list moved verbatim from chrome's CONTEXT_TOOLBAR_REGISTRY
 * ["connector"] (minus the Icon field), flyout JSX moved verbatim from
 * editor/features/context-toolbar/ContextToolbarLayer.tsx.
 */

/**
 * Connector color flyout (W3b/W4): the sampled FigJam connector stroke set
 * (figjam-tokens.ts CONNECTOR_COLORS), patched onto the selected connection
 * as `color`.
 */
function ConnectorColorFlyout({ selectedConnection, dispatch, close }: ToolbarFlyoutProps) {
  if (!selectedConnection) return null;
  return (
    <div className="absolute left-0 top-full z-50 mt-2">
      <ColorPalettePopover
        currentColor={selectedConnection.color ?? CONNECTOR_DEFAULT_COLOR}
        swatches={[Object.values(CONNECTOR_COLORS)]}
        onPick={(color: string) => {
          dispatch({
            type: "canvas.updateConnection",
            connectionId: selectedConnection.id,
            patch: { color },
          });
          close();
        }}
      />
    </div>
  );
}

function ConnectorDashFlyout({ selectedConnection, dispatch, close }: ToolbarFlyoutProps) {
  if (!selectedConnection) return null;
  return (
    <div className="absolute left-0 top-full z-50 mt-2 grid gap-1 rounded-md bg-[#1D1D1D] p-1 shadow-xl">
      {(["solid", "dotted"] as const).map((value) => (
        <button
          key={value}
          type="button"
          role="menuitem"
          className="rounded px-2 py-1.5 text-left text-sm capitalize text-white hover:bg-white/10"
          onClick={() => {
            dispatch({
              type: "canvas.updateConnection",
              connectionId: selectedConnection.id,
              patch: { style: value },
            });
            close();
          }}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

function ConnectorRoutingFlyout({ selectedConnection, dispatch, close }: ToolbarFlyoutProps) {
  if (!selectedConnection) return null;
  return (
    <div className="absolute left-0 top-full z-50 mt-2 grid gap-1 rounded-md bg-[#1D1D1D] p-1 shadow-xl">
      {(["elbow", "smooth"] as const).map((value) => (
        <button
          key={value}
          type="button"
          role="menuitem"
          className="rounded px-2 py-1.5 text-left text-sm capitalize text-white hover:bg-white/10"
          onClick={() => {
            dispatch({
              type: "canvas.updateConnection",
              connectionId: selectedConnection.id,
              patch: { style: value },
            });
            close();
          }}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

function ConnectorArrowheadFlyout({ selectedConnection, dispatch, close }: ToolbarFlyoutProps) {
  if (!selectedConnection) return null;
  return (
    <div className="absolute left-0 top-full z-50 mt-2 grid gap-1 rounded-md bg-[#1D1D1D] p-1 shadow-xl">
      {(["none", "forward", "back", "both"] as const).map((value) => (
        <button
          key={value}
          type="button"
          role="menuitem"
          className="rounded px-2 py-1.5 text-left text-sm capitalize text-white hover:bg-white/10"
          onClick={() => {
            dispatch({
              type: "canvas.updateConnection",
              connectionId: selectedConnection.id,
              patch: { arrow: value },
            });
            close();
          }}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

const CONNECTOR_TOOLBAR: ToolbarSpec = {
  controls: [
    { action: "color", label: "Line color", hasFlyout: true },
    { action: "stroke", label: "Stroke", hasFlyout: true },
    { action: "dash", label: "Line style", hasFlyout: true },
    { action: "routing", label: "Corner style", hasFlyout: true },
    { action: "arrowhead", label: "Arrowhead style", hasFlyout: true },
    { action: "label-align", label: "Label alignment", hasFlyout: true },
  ],
  flyouts: {
    color: ConnectorColorFlyout,
    dash: ConnectorDashFlyout,
    routing: ConnectorRoutingFlyout,
    arrowhead: ConnectorArrowheadFlyout,
  },
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
