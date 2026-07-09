"use client";

import { ColorPicker } from "../../../components/ColorPicker";
import { colorKindForType, FIRST_USE_COLORS } from "../../../../state/actions";
import type { CanvasColor } from "../../../../state/schema";
import type { ToolbarFlyoutProps } from "./types";

/**
 * THE one shared color flyout (P1, OBJECT-DEF-OVERHAUL.md D12/D17): every
 * kind — shapes, stickies, sections, connectors — opens the same 10-pick
 * ColorPicker with identical swatch previews. Object selections dispatch
 * `color` patches across the whole selection (via applyColorToSelection,
 * which also feeds the per-kind last-picked memory in the reducer);
 * connector selections patch the connection's `color`.
 *
 * Replaces the old PaletteColorFlyout (nearest-token bridging),
 * SectionColorFlyout (tint circles), and ConnectorColorFlyout (hex row).
 */
export function ColorPickerFlyout({
  primaryObject,
  selectedConnection,
  dispatch,
  applyColorToSelection,
  close,
}: ToolbarFlyoutProps) {
  let current: CanvasColor;
  let onPick: (color: CanvasColor) => void;
  if (selectedConnection) {
    current = selectedConnection.color ?? FIRST_USE_COLORS.connector;
    onPick = (color) => {
      dispatch({
        type: "canvas.updateConnection",
        connectionId: selectedConnection.id,
        patch: { color },
      });
      close();
    };
  } else if (primaryObject) {
    current = primaryObject.color ?? FIRST_USE_COLORS[colorKindForType(primaryObject.type)];
    onPick = (color) => {
      applyColorToSelection(color);
      close();
    };
  } else {
    return null;
  }
  return <ColorPicker current={current} onPick={onPick} />;
}
