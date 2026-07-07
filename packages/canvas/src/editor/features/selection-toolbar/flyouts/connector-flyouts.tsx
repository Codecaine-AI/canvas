"use client";

import { ColorPalettePopover } from "../../../components/ColorPalettePopover";
import { CONNECTOR_COLORS, CONNECTOR_DEFAULT_COLOR } from "../../../../objects/connector/def";
import type { ToolbarFlyoutProps, ToolbarFlyoutTable } from "./types";

/**
 * Connector toolbar flyouts, moved verbatim from objects/connector/def.tsx
 * (co-location alignment): flyouts are editor interface JSX, resolved by def
 * kind + action id (see ./index.ts). The connector def keeps only the
 * data-only control list.
 */

/**
 * Connector color flyout (W3b/W4): the sampled FigJam connector stroke set
 * (CONNECTOR_COLORS), patched onto the selected connection as `color`.
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

export const CONNECTOR_FLYOUTS: ToolbarFlyoutTable = {
  color: ConnectorColorFlyout,
  dash: ConnectorDashFlyout,
  routing: ConnectorRoutingFlyout,
  arrowhead: ConnectorArrowheadFlyout,
};
