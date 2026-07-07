"use client";

import { ColorPalettePopover } from "../../../components/ColorPalettePopover";
import { CONNECTOR_COLORS, CONNECTOR_DEFAULT_COLOR } from "../../../../objects/connector/def";
import { FlyoutMenuButton, FlyoutPanel } from "./FlyoutPanel";
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
    <div className="absolute bottom-full left-0 z-50 mb-2">
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
    <div className="absolute bottom-full left-0 z-50 mb-2">
      <FlyoutPanel style={{ display: "grid", gap: 4 }}>
        {(["solid", "dotted"] as const).map((value) => (
          <FlyoutMenuButton
            key={value}
            active={selectedConnection.style === value}
            onClick={() => {
              dispatch({
                type: "canvas.updateConnection",
                connectionId: selectedConnection.id,
                patch: { style: value },
              });
              close();
            }}
          >
            {capitalize(value)}
          </FlyoutMenuButton>
        ))}
      </FlyoutPanel>
    </div>
  );
}

function ConnectorRoutingFlyout({ selectedConnection, dispatch, close }: ToolbarFlyoutProps) {
  if (!selectedConnection) return null;
  return (
    <div className="absolute bottom-full left-0 z-50 mb-2">
      <FlyoutPanel style={{ display: "grid", gap: 4 }}>
        {(["elbow", "smooth"] as const).map((value) => (
          <FlyoutMenuButton
            key={value}
            active={selectedConnection.style === value}
            onClick={() => {
              dispatch({
                type: "canvas.updateConnection",
                connectionId: selectedConnection.id,
                patch: { style: value },
              });
              close();
            }}
          >
            {capitalize(value)}
          </FlyoutMenuButton>
        ))}
      </FlyoutPanel>
    </div>
  );
}

function ConnectorArrowheadFlyout({ selectedConnection, dispatch, close }: ToolbarFlyoutProps) {
  if (!selectedConnection) return null;
  return (
    <div className="absolute bottom-full left-0 z-50 mb-2">
      <FlyoutPanel style={{ display: "grid", gap: 4 }}>
        {(["none", "forward", "back", "both"] as const).map((value) => (
          <FlyoutMenuButton
            key={value}
            active={(selectedConnection.arrow ?? "forward") === value}
            onClick={() => {
              dispatch({
                type: "canvas.updateConnection",
                connectionId: selectedConnection.id,
                patch: { arrow: value },
              });
              close();
            }}
          >
            {capitalize(value)}
          </FlyoutMenuButton>
        ))}
      </FlyoutPanel>
    </div>
  );
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

export const CONNECTOR_FLYOUTS: ToolbarFlyoutTable = {
  color: ConnectorColorFlyout,
  dash: ConnectorDashFlyout,
  routing: ConnectorRoutingFlyout,
  arrowhead: ConnectorArrowheadFlyout,
};
