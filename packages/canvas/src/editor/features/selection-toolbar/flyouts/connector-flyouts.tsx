"use client";

import { ColorPickerFlyout } from "./color-flyout";
import { FlyoutMenuButton, FlyoutPanel } from "./FlyoutPanel";
import type { ToolbarFlyoutProps, ToolbarFlyoutTable } from "./types";
import {
  ConnectorArrowLeftIcon,
  ConnectorArrowRightIcon,
  ConnectorArrowsBothIcon,
  ConnectorDashedLineIcon,
  ConnectorNoArrowheadsIcon,
  ConnectorSolidLineIcon,
  type IconProps,
} from "../../../../ui/icons";
import type { CanvasArrowDirection, CanvasConnectionStyle } from "../../../../state/schema";

/**
 * Connector toolbar flyouts, moved verbatim from objects/connector/def.tsx
 * (co-location alignment): flyouts are editor interface JSX, resolved by def
 * kind + action id (see ./index.ts). The connector def keeps only the
 * data-only control list. Color opens the shared 10-pick ColorPickerFlyout
 * (P1, D12 — identical swatch previews for every kind).
 */

function ConnectorDashFlyout({ selectedConnection, dispatch, close }: ToolbarFlyoutProps) {
  if (!selectedConnection) return null;
  const currentStyle = selectedConnection.style ?? "solid";
  return (
    <div className="absolute bottom-full left-0 z-50 mb-2" data-toolbar-flyout="connector-dash">
      <FlyoutPanel style={{ display: "flex", gap: 4 }}>
        {CONNECTOR_DASH_OPTIONS.map(({ value, label, Icon }) => (
          <FlyoutMenuButton
            key={value}
            active={currentStyle === value}
            aria-label={label}
            aria-pressed={currentStyle === value}
            title={label}
            data-connector-line-style={value}
            leadingIcon={<Icon className="h-5 w-5" />}
            onClick={() => {
              dispatch({
                type: "canvas.updateConnection",
                connectionId: selectedConnection.id,
                patch: { style: value },
              });
              close();
            }}
            style={{ width: 36, justifyContent: "center", padding: 0 }}
          />
        ))}
      </FlyoutPanel>
    </div>
  );
}

function ConnectorArrowheadFlyout({ selectedConnection, dispatch, close }: ToolbarFlyoutProps) {
  if (!selectedConnection) return null;
  const currentArrow = selectedConnection.arrow ?? "forward";
  return (
    <div className="absolute bottom-full left-0 z-50 mb-2" data-toolbar-flyout="connector-arrowhead">
      <FlyoutPanel style={{ display: "flex", gap: 4 }}>
        {CONNECTOR_ARROWHEAD_OPTIONS.map(({ value, label, Icon }) => (
          <FlyoutMenuButton
            key={value}
            active={currentArrow === value}
            aria-label={label}
            aria-pressed={currentArrow === value}
            title={label}
            data-connector-arrowhead={value}
            leadingIcon={<Icon className="h-5 w-5" />}
            onClick={() => {
              dispatch({
                type: "canvas.updateConnection",
                connectionId: selectedConnection.id,
                patch: { arrow: value },
              });
              close();
            }}
            style={{ width: 36, justifyContent: "center", padding: 0 }}
          />
        ))}
      </FlyoutPanel>
    </div>
  );
}

const CONNECTOR_DASH_OPTIONS: ReadonlyArray<{
  value: CanvasConnectionStyle;
  label: string;
  Icon: (props: IconProps) => React.JSX.Element;
}> = [
  { value: "solid", label: "Solid", Icon: ConnectorSolidLineIcon },
  { value: "dashed", label: "Dashed", Icon: ConnectorDashedLineIcon },
];

const CONNECTOR_ARROWHEAD_OPTIONS: ReadonlyArray<{
  value: CanvasArrowDirection;
  label: string;
  Icon: (props: IconProps) => React.JSX.Element;
}> = [
  { value: "none", label: "No arrowheads", Icon: ConnectorNoArrowheadsIcon },
  { value: "forward", label: "Arrow right", Icon: ConnectorArrowRightIcon },
  { value: "back", label: "Arrow left", Icon: ConnectorArrowLeftIcon },
  { value: "both", label: "Arrows both ends", Icon: ConnectorArrowsBothIcon },
];

export const CONNECTOR_FLYOUTS: ToolbarFlyoutTable = {
  color: ColorPickerFlyout,
  dash: ConnectorDashFlyout,
  arrowhead: ConnectorArrowheadFlyout,
};
