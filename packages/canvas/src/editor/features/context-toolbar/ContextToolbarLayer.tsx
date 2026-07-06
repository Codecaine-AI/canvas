"use client";

import { ContextToolbar } from "../../../chrome/ContextToolbar";
import type { CanvasAction } from "../../../model/actions";
import { CONNECTOR_DEFAULT_COLOR } from "../../../tokens/figjam-tokens";
import { paletteTokenStyle, resolveSectionColors } from "../../../tokens/theme";
import type { ContextToolbarApi } from "./use-context-toolbar";
import type { InteractiveCanvasConnection } from "../../../model/schema";

export interface ContextToolbarLayerProps {
  toolbar: ContextToolbarApi;
  selectedConnection: InteractiveCanvasConnection | undefined;
  dispatch: (action: CanvasAction) => void;
}

/**
 * Floating ContextToolbar host (RESTRUCTURE.md step 5): renders the chrome
 * pill with the registry-resolved control specs, plus whichever flyout
 * component the resolved def declares for the currently open action. The
 * flyout JSX itself lives on the ObjectDefs (objects/section/toolbar.tsx,
 * objects/shapes/toolbar.tsx, objects/connector/def.tsx, ...); only the
 * presentational current-color/section-state plumbing stays here. Renders
 * nothing until the selection resolves a toolbar and the measured position
 * resolves.
 */
export function ContextToolbarLayer({
  toolbar,
  selectedConnection,
  dispatch,
}: ContextToolbarLayerProps) {
  const {
    contextToolbarRef,
    contextToolbarVariant,
    contextToolbarVariantLabel,
    contextToolbarControls,
    contextToolbarFlyouts,
    contextToolbarPosition,
    openFlyout,
    setOpenFlyout,
    primarySelectedObject,
    handleContextToolbarAction,
    applyPaletteTokenToSelection,
    applySectionFillToSelection,
    applySectionStrokeToSelection,
    toggleLockForSelection,
    applyTintToSelection,
    applySectionBorderStyleToSelection,
    swapSelectedShape,
  } = toolbar;
  if (!contextToolbarVariant || !contextToolbarPosition || !contextToolbarControls) return null;
  const FlyoutComponent = openFlyout ? contextToolbarFlyouts?.[openFlyout] : undefined;
  return (
    <div
      ref={contextToolbarRef}
      className="pointer-events-auto absolute z-40"
      style={{ left: contextToolbarPosition.x, top: contextToolbarPosition.y }}
    >
      <ContextToolbar
        controls={contextToolbarControls}
        variantLabel={contextToolbarVariantLabel ?? contextToolbarVariant}
        onAction={handleContextToolbarAction}
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
