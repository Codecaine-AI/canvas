"use client";

import { SelectionToolbar, type SelectionToolbarActionId, type ToolbarControlState } from "./SelectionToolbar";
import type { CanvasAction } from "../../../state/actions";
import { CONNECTOR_DEFAULT_COLOR } from "../../../objects/connector/def";
import { paletteTokenStyle, resolveSectionColors } from "../../../theme";
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
 * component the editor-side flyout registry (./flyouts, keyed by def kind +
 * action id) declares for the currently open action. ObjectDefs carry only
 * data-only control lists; the presentational current-color/section-state
 * plumbing stays here. Renders nothing until the selection resolves a toolbar
 * and the measured position resolves.
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
    setLockForSelection,
    applyTintToSelection,
    applySectionBorderStyleToSelection,
    swapSelectedShape,
  } = toolbar;
  if (!selectionToolbarVariant || !selectionToolbarPosition || !selectionToolbarControls) return null;
  const FlyoutComponent = openFlyout ? selectionToolbarFlyouts?.[openFlyout] : undefined;
  const controlState: Partial<Record<SelectionToolbarActionId, ToolbarControlState>> = {};
  if (primarySelectedObject?.type === "section") {
    const sectionColors = resolveSectionColors(primarySelectedObject.tint);
    controlState.color = {
      color: primarySelectedObject.style?.fill ?? sectionColors.tint,
    };
    controlState["section-border-style"] = {
      variant: primarySelectedObject.style?.strokeStyle ?? "solid",
      color: primarySelectedObject.style?.stroke ?? sectionColors.chipBorder ?? "transparent",
    };
    controlState.visibility = primarySelectedObject.contentHidden
      ? { variant: "hidden", label: "Show contents" }
      : { label: "Hide contents" };
  } else if (primarySelectedObject) {
    controlState.color = {
      color: paletteTokenStyle(primarySelectedObject.style?.paletteToken ?? "note").accent,
    };
  } else if (selectedConnection) {
    controlState.color = {
      color: selectedConnection.color ?? CONNECTOR_DEFAULT_COLOR,
    };
  }
  if (primarySelectedObject) {
    controlState.lock = primarySelectedObject.locked
      ? { active: true, label: "Unlock" }
      : { label: "Lock" };
  }
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
        controlState={controlState}
        activeFlyout={openFlyout}
      />
      {FlyoutComponent ? (
        <FlyoutComponent
          primaryObject={primarySelectedObject}
          selectedConnection={selectedConnection}
          dispatch={dispatch}
          close={() => setOpenFlyout(null)}
          applyPaletteTokenToSelection={applyPaletteTokenToSelection}
          applySectionBorderStyleToSelection={applySectionBorderStyleToSelection}
          applyTintToSelection={applyTintToSelection}
          setLockForSelection={setLockForSelection}
          swapSelectedShape={swapSelectedShape}
        />
      ) : null}
    </div>
  );
}
