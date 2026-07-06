"use client";

import { SelectionToolbar } from "./SelectionToolbar";
import type { CanvasAction } from "../../../state/actions";
import { CONNECTOR_DEFAULT_COLOR } from "../../../theme/tokens";
import { paletteTokenStyle, resolveSectionColors } from "../../../theme/resolve";
import type { SelectionToolbarApi } from "./use-selection-toolbar";
import type { InteractiveCanvasConnection } from "../../../state/schema";

export interface SelectionToolbarLayerProps {
  toolbar: SelectionToolbarApi;
  selectedConnection: InteractiveCanvasConnection | undefined;
  dispatch: (action: CanvasAction) => void;
}

/**
 * Floating SelectionToolbar host (RESTRUCTURE.md step 5): renders the chrome
 * pill with the registry-resolved control specs, plus whichever flyout
 * component the resolved def declares for the currently open action. The
 * flyout JSX itself lives on the ObjectDefs (objects/section/toolbar.tsx,
 * objects/shapes/toolbar.tsx, objects/connector/def.tsx, ...); only the
 * presentational current-color/section-state plumbing stays here. Renders
 * nothing until the selection resolves a toolbar and the measured position
 * resolves.
 */
export function SelectionToolbarLayer({
  toolbar,
  selectedConnection,
  dispatch,
}: SelectionToolbarLayerProps) {
  const {
    selectionToolbarRef,
    selectionToolbarVariant,
    selectionToolbarVariantLabel,
    selectionToolbarControls,
    selectionToolbarFlyouts,
    selectionToolbarPosition,
    openFlyout,
    setOpenFlyout,
    primarySelectedObject,
    handleSelectionToolbarAction,
    applyPaletteTokenToSelection,
    applySectionFillToSelection,
    applySectionStrokeToSelection,
    toggleLockForSelection,
    applyTintToSelection,
    applySectionBorderStyleToSelection,
    swapSelectedShape,
  } = toolbar;
  if (!selectionToolbarVariant || !selectionToolbarPosition || !selectionToolbarControls) return null;
  const FlyoutComponent = openFlyout ? selectionToolbarFlyouts?.[openFlyout] : undefined;
  return (
    <div
      ref={selectionToolbarRef}
      className="pointer-events-auto absolute z-40"
      style={{ left: selectionToolbarPosition.x, top: selectionToolbarPosition.y }}
    >
      <SelectionToolbar
        controls={selectionToolbarControls}
        variantLabel={selectionToolbarVariantLabel ?? selectionToolbarVariant}
        onAction={handleSelectionToolbarAction}
        currentColor={
          primarySelectedObject?.type === "section"
            ? primarySelectedObject.style?.fill ?? resolveSectionColors(primarySelectedObject.tint).tint
            : primarySelectedObject
              ? paletteTokenStyle(primarySelectedObject.style?.paletteToken ?? "note").accent
              : selectedConnection?.color ?? CONNECTOR_DEFAULT_COLOR
        }
        currentSectionBorderStyle={
          primarySelectedObject?.type === "section" ? (primarySelectedObject.style?.strokeStyle ?? "solid") : undefined
        }
        currentSectionStroke={
          primarySelectedObject?.type === "section"
            ? primarySelectedObject.style?.stroke ?? resolveSectionColors(primarySelectedObject.tint).chipBorder ?? "transparent"
            : undefined
        }
        activeFlyout={openFlyout}
        sectionContentHidden={primarySelectedObject?.type === "section" ? primarySelectedObject.contentHidden : undefined}
        sectionLocked={primarySelectedObject?.type === "section" ? primarySelectedObject.locked : undefined}
      />
      {FlyoutComponent ? (
        <FlyoutComponent
          primaryObject={primarySelectedObject}
          selectedConnection={selectedConnection}
          dispatch={dispatch}
          close={() => setOpenFlyout(null)}
          applyPaletteTokenToSelection={applyPaletteTokenToSelection}
          applySectionFillToSelection={applySectionFillToSelection}
          applySectionStrokeToSelection={applySectionStrokeToSelection}
          applySectionBorderStyleToSelection={applySectionBorderStyleToSelection}
          applyTintToSelection={applyTintToSelection}
          toggleLockForSelection={toggleLockForSelection}
          swapSelectedShape={swapSelectedShape}
        />
      ) : null}
    </div>
  );
}
