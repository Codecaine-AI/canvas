"use client";

import { useEffect } from "react";
import { SelectionToolbar, type SelectionToolbarActionId, type ToolbarControlState } from "./SelectionToolbar";
import { resolveConnectorControlState } from "./connector-control-state";
import { colorKindForType, FIRST_USE_COLORS, type CanvasAction } from "../../../state/actions";
import { resolveSectionColors, resolveSwatchPreview } from "../../../palette";
import type { SelectionToolbarApi } from "./use-selection-toolbar";
import type { InteractiveCanvasConnection } from "../../../state/schema";

export interface SelectionToolbarLayerProps {
  toolbar: SelectionToolbarApi;
  selectedConnection: InteractiveCanvasConnection | undefined;
  dispatch: (action: CanvasAction) => void;
  /**
   * Drag-in-progress suppression — the toolbar unmounts during selection drags
   * and remounts on drop, which replays the FigJam entrance animation.
   */
  hidden?: boolean;
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
  hidden = false,
}: SelectionToolbarLayerProps) {
  const {
    selectionToolbarRef,
    selectionToolbarVariant,
    selectionToolbarVariantLabel,
    selectionToolbarControls,
    selectionToolbarFlyouts,
    selectionSignature,
    selectionToolbarPosition,
    openFlyout,
    setOpenFlyout,
    primarySelectedObject,
    primarySectionFitted,
    handleSelectionToolbarAction,
    applyColorToSelection,
    setLockForSelection,
    applySectionBorderStyleToSelection,
    swapSelectedShape,
  } = toolbar;

  useEffect(() => {
    if (hidden) setOpenFlyout(null);
  }, [hidden, setOpenFlyout]);

  if (hidden || !selectionToolbarVariant || !selectionToolbarPosition || !selectionToolbarControls) return null;
  const FlyoutComponent = openFlyout ? selectionToolbarFlyouts?.[openFlyout] : undefined;
  const controlState: Partial<Record<SelectionToolbarActionId, ToolbarControlState>> = {};
  // P1/D12 — the toolbar's current-color swatch shows the PICK's preview hex
  // (identical for every kind), not the kind-specific rendering.
  if (primarySelectedObject?.type === "section") {
    const currentPick = primarySelectedObject.color ?? FIRST_USE_COLORS.section;
    controlState.color = {
      color: resolveSwatchPreview(currentPick),
    };
    controlState["section-border-style"] = {
      variant: primarySelectedObject.style?.strokeStyle ?? "solid",
      // The section frame border IS the chip fill (§3.2).
      color: resolveSectionColors(currentPick).chip.fill,
    };
    if (primarySectionFitted) {
      controlState["fit-children"] = { disabled: true };
    }
  } else if (primarySelectedObject) {
    controlState.color = {
      color: resolveSwatchPreview(
        primarySelectedObject.color ?? FIRST_USE_COLORS[colorKindForType(primarySelectedObject.type)],
      ),
    };
  } else if (selectedConnection) {
    controlState.color = {
      color: resolveSwatchPreview(selectedConnection.color ?? FIRST_USE_COLORS.connector),
    };
    Object.assign(controlState, resolveConnectorControlState([selectedConnection]));
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
        key={selectionSignature}
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
          applyColorToSelection={applyColorToSelection}
          applySectionBorderStyleToSelection={applySectionBorderStyleToSelection}
          setLockForSelection={setLockForSelection}
          swapSelectedShape={swapSelectedShape}
        />
      ) : null}
    </div>
  );
}
