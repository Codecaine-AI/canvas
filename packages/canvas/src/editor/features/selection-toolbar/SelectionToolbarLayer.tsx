"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SelectionToolbar, type SelectionToolbarActionId, type ToolbarControlState } from "./SelectionToolbar";
import { resolveConnectorControlState } from "./connector-control-state";
import { colorKindForType, FIRST_USE_COLORS, type CanvasAction, type CanvasTool } from "../../../state/actions";
import { resolveSwatchPreview } from "../../../palette";
import { positionFlyoutCenteredOnTrigger, type Rect } from "./position";
import type { SelectionToolbarApi } from "./use-selection-toolbar";
import type { InteractiveCanvasConnection } from "../../../state/schema";

export interface SelectionToolbarLayerProps {
  toolbar: SelectionToolbarApi;
  selectedConnection: InteractiveCanvasConnection | undefined;
  dispatch: (action: CanvasAction) => void;
  /** Current canvas tool; connector mode suppresses select-mode toolbar chrome without clearing selection state. */
  activeTool?: CanvasTool;
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
  activeTool,
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
  const flyoutPositionerRef = useRef<HTMLDivElement | null>(null);
  const [flyoutLeft, setFlyoutLeft] = useState(0);
  const toolbarHidden = hidden || activeTool === "connector";

  useEffect(() => {
    if (toolbarHidden) setOpenFlyout(null);
  }, [toolbarHidden, setOpenFlyout]);

  useLayoutEffect(() => {
    if (toolbarHidden || !openFlyout) {
      setFlyoutLeft(0);
      return;
    }

    const toolbarElement = selectionToolbarRef.current;
    const flyoutElement = flyoutPositionerRef.current;
    if (!toolbarElement || !flyoutElement) {
      setFlyoutLeft(0);
      return;
    }

    let animationFrame: number | null = null;
    const measure = () => {
      animationFrame = null;
      const triggerElement = findToolbarActionElement(toolbarElement, openFlyout);
      if (!triggerElement) {
        setFlyoutLeft(0);
        return;
      }

      const triggerRect = rectFromDOMRect(triggerElement.getBoundingClientRect());
      const toolbarRect = rectFromDOMRect(toolbarElement.getBoundingClientRect());
      const flyoutWidth = flyoutElement.getBoundingClientRect().width;
      const viewportWidth = getViewportWidth();

      if (triggerRect.width <= 0 || toolbarRect.width <= 0 || flyoutWidth <= 0 || viewportWidth <= 0) {
        setFlyoutLeft(0);
        return;
      }

      const nextLeft = positionFlyoutCenteredOnTrigger(triggerRect, flyoutWidth, toolbarRect, viewportWidth);
      setFlyoutLeft((currentLeft) => (Math.abs(currentLeft - nextLeft) < 0.5 ? currentLeft : nextLeft));
    };
    const scheduleMeasure = () => {
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
        animationFrame = window.requestAnimationFrame(measure);
      } else {
        measure();
      }
    };

    measure();

    if (typeof window !== "undefined") {
      window.addEventListener("resize", scheduleMeasure);
    }

    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(scheduleMeasure);
      resizeObserver.observe(toolbarElement);
      resizeObserver.observe(flyoutElement);
    }

    return () => {
      if (animationFrame !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(animationFrame);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", scheduleMeasure);
      }
      resizeObserver?.disconnect();
    };
  }, [
    toolbarHidden,
    openFlyout,
    selectionSignature,
    selectionToolbarPosition?.x,
    selectionToolbarPosition?.y,
    selectionToolbarRef,
  ]);

  if (toolbarHidden || !selectionToolbarVariant || !selectionToolbarPosition || !selectionToolbarControls) return null;
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
        <div ref={flyoutPositionerRef} className="absolute bottom-full z-50 mb-2" style={{ left: flyoutLeft }}>
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
        </div>
      ) : null}
    </div>
  );
}

function rectFromDOMRect(rect: DOMRect): Rect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function getViewportWidth(): number {
  if (typeof window === "undefined") return 0;
  return window.innerWidth || window.document.documentElement.clientWidth || 0;
}

function findToolbarActionElement(
  toolbarElement: HTMLDivElement,
  action: SelectionToolbarActionId,
): HTMLElement | null {
  const escapedAction = escapeAttributeSelectorValue(action);
  return toolbarElement.querySelector<HTMLElement>(`[data-toolbar-action="${escapedAction}"]`);
}

function escapeAttributeSelectorValue(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}
