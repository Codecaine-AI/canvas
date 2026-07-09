"use client";

import { ShapeSearchPopover } from "../../../components/ShapeSearchPopover";
import { ColorPickerFlyout } from "./color-flyout";
import type { ToolbarFlyoutProps, ToolbarFlyoutTable } from "./types";

/**
 * Flyouts of the ONE shared shape-family toolbar (co-location alignment):
 * flyouts are editor interface JSX, so they live with the selection-toolbar
 * feature and are resolved by def kind + action id (see ./index.ts) —
 * ObjectDefs keep only the data-only control lists. The color action opens
 * the shared 10-pick ColorPickerFlyout (P1, D12 — identical for every kind).
 */

function ShapeSwapFlyout({ swapSelectedShape }: ToolbarFlyoutProps) {
  return <ShapeSearchPopover onPick={swapSelectedShape} />;
}

export const SHAPE_FLYOUTS: ToolbarFlyoutTable = {
  "shape-swap": ShapeSwapFlyout,
  color: ColorPickerFlyout,
};
