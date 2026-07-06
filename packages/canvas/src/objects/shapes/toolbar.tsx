"use client";

import { ColorPalettePopover } from "../../ui/ColorPalettePopover";
import { ShapeSearchPopover } from "../catalog/ShapeSearchPopover";
import { paletteTokenStyle } from "../../theme/resolve";
import type { ToolbarFlyoutProps, ToolbarSpec } from "../object-def";
import { nearestPaletteToken } from "../palette";

/**
 * The ONE shared shape-family selection toolbar (step 5): control list moved
 * verbatim from chrome's CONTEXT_TOOLBAR_REGISTRY["shape"] (minus the Icon
 * field — icons are resolved by the chrome host), flyout JSX moved verbatim
 * from editor/features/selection-toolbar/SelectionToolbarLayer.tsx. Attached by
 * shapes/base.tsx to every shape-family def and explicitly by the
 * container/source-node/icon/code-block defs (their types resolved to the
 * "shape" toolbar variant before the registry migration).
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
    <div className="absolute left-0 top-full z-50 mt-2">
      <ColorPalettePopover
        currentColor={
          primaryObject.type === "section"
            ? primaryObject.style?.fill ?? paletteTokenStyle("note").fill
            : paletteTokenStyle(primaryObject.style?.paletteToken ?? "note").accent
        }
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
    <div className="absolute left-0 top-full z-50 mt-2">
      <ShapeSearchPopover onPick={swapSelectedShape} />
    </div>
  );
}

export const SHAPE_TOOLBAR: ToolbarSpec = {
  controls: [
    { action: "shape-swap", label: "Change shape", hasFlyout: true },
    { action: "color", label: "Fill color", hasFlyout: true },
    { action: "align", label: "Alignment", hasFlyout: true },
    { action: "font-style", label: "Font style", hasFlyout: true },
    { action: "size", label: "Text size", hasFlyout: true, text: "Medium" },
    { action: "bold", label: "Bold" },
    { action: "strikethrough", label: "Strikethrough" },
    { action: "link", label: "Link" },
    { action: "bullets", label: "Bullet list" },
    { action: "paragraph-align", label: "Paragraph alignment", hasFlyout: true },
  ],
  flyouts: {
    "shape-swap": ShapeSwapFlyout,
    color: PaletteColorFlyout,
  },
};
