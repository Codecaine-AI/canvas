"use client";

import { ColorPalettePopover } from "../../../components/ColorPalettePopover";
import { ShapeSearchPopover } from "../../../components/ShapeSearchPopover";
import { paletteTokenStyle } from "../../../../theme";
import { nearestPaletteToken } from "../../../../objects/palette";
import type { ToolbarFlyoutProps, ToolbarFlyoutTable } from "./types";

/**
 * Flyouts of the ONE shared shape-family toolbar, moved verbatim from
 * objects/shapes/toolbar.tsx (co-location alignment): flyouts are editor
 * interface JSX, so they live with the selection-toolbar feature and are
 * resolved by def kind + action id (see ./index.ts) — ObjectDefs keep only
 * the data-only control lists.
 */

/**
 * Generic object color flyout: FigJam hex swatches bridged onto the schema's
 * semantic palette via nearestPaletteToken. Shared by the shape, sticky, and
 * text toolbars (their pre-migration variants all opened this same flyout).
 */
export function PaletteColorFlyout({
  primaryObject,
  applyPaletteTokenToSelection,
  close,
}: ToolbarFlyoutProps) {
  if (!primaryObject) return null;
  return (
    <div className="absolute bottom-full left-0 z-50 mb-2">
      <ColorPalettePopover
        currentColor={paletteTokenStyle(primaryObject.style?.paletteToken ?? "note").accent}
        onPick={(color: string) => {
          applyPaletteTokenToSelection(nearestPaletteToken(color));
          close();
        }}
      />
    </div>
  );
}

function ShapeSwapFlyout({ swapSelectedShape }: ToolbarFlyoutProps) {
  return (
    <div className="absolute bottom-full left-0 z-50 mb-2">
      <ShapeSearchPopover onPick={swapSelectedShape} />
    </div>
  );
}

export const SHAPE_FLYOUTS: ToolbarFlyoutTable = {
  "shape-swap": ShapeSwapFlyout,
  color: PaletteColorFlyout,
};
