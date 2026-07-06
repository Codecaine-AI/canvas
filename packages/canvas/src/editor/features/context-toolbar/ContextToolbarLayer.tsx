"use client";

import { LockIcon, UnlockIcon } from "lucide-react";
import {
  ColorPalettePopover,
  type ColorPalettePopoverProps,
} from "../../../chrome/ColorPalettePopover";
import { ContextToolbar } from "../../../chrome/ContextToolbar";
import { ShapeSearchPopover } from "../../../chrome/ShapeSearchPopover";
import { DashIcon, NoStrokeIcon, StrokeIcon } from "../../../chrome/toolbar-icons";
import type { CanvasAction } from "../../../model/actions";
import { CONNECTOR_COLORS, CONNECTOR_DEFAULT_COLOR } from "../../../render/figjam-tokens";
import { paletteTokenStyle, resolveSectionColors } from "../../../render/theme";
import { nearestPaletteToken, type ContextToolbarApi } from "./use-context-toolbar";
import type {
  CanvasSectionTint,
  InteractiveCanvasConnection,
} from "../../../model/schema";

export interface ContextToolbarLayerProps {
  toolbar: ContextToolbarApi;
  selectedConnection: InteractiveCanvasConnection | undefined;
  dispatch: (action: CanvasAction) => void;
}

/**
 * Floating ContextToolbar + its flyouts (color/tint/border/shape-swap/lock/
 * connector pickers), extracted verbatim from InteractiveCanvasEditor.tsx.
 * Renders nothing until the selection derives a variant and the measured
 * position resolves; the flyout branches keep their current inline shape —
 * they migrate into the object registry in a later restructure step
 * (RESTRUCTURE.md step 5).
 */
export function ContextToolbarLayer({
  toolbar,
  selectedConnection,
  dispatch,
}: ContextToolbarLayerProps) {
  const {
    contextToolbarRef,
    contextToolbarVariant,
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
  if (!contextToolbarVariant || !contextToolbarPosition) return null;
  return (
    <div
      ref={contextToolbarRef}
      className="pointer-events-auto absolute z-40"
      style={{ left: contextToolbarPosition.x, top: contextToolbarPosition.y }}
    >
      <ContextToolbar
        variant={contextToolbarVariant}
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
      {openFlyout === "color" && primarySelectedObject?.type === "section" && contextToolbarVariant === "section" && (
        <div className="absolute left-0 top-full z-50 mt-2">
          <ColorPalettePopover
            currentColor={primarySelectedObject.style?.fill ?? resolveSectionColors(primarySelectedObject.tint).tint}
            onPick={(color: string) => {
              applySectionFillToSelection(color);
              setOpenFlyout(null);
            }}
          />
        </div>
      )}
      {openFlyout === "section-border-style" && primarySelectedObject?.type === "section" && contextToolbarVariant === "section" && (
        <div className="absolute left-0 top-full z-50 mt-2">
          <ColorPalettePopover
            currentColor={primarySelectedObject.style?.stroke ?? resolveSectionColors(primarySelectedObject.tint).chipBorder ?? "transparent"}
            onPick={(color: string) => {
              applySectionStrokeToSelection(color);
              setOpenFlyout(null);
            }}
            header={
              <div data-toolbar-flyout="section-border" style={{ display: "grid", gap: 12 }}>
                <div role="menu" aria-label="Border style" style={{ display: "flex", gap: 8 }}>
                  {(
                    [
                      ["solid", "Solid", StrokeIcon],
                      ["dashed", "Dashed", DashIcon],
                      ["none", "None", NoStrokeIcon],
                    ] as const
                  ).map(([value, label, Icon]) => {
                    const active = (primarySelectedObject.style?.strokeStyle ?? "solid") === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="menuitem"
                        aria-label={label}
                        data-section-border-style={value}
                        onClick={(event) => {
                          event.stopPropagation();
                          applySectionBorderStyleToSelection(value);
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          height: 30,
                          padding: "0 10px",
                          border: "none",
                          borderRadius: 8,
                          background: active ? "#8C2EF2" : "rgba(255,255,255,0.08)",
                          color: "#FFFFFF",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                        title={label}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ height: 1, background: "rgba(255,255,255,0.14)" }} />
              </div>
            }
          />
        </div>
      )}
      {openFlyout === "color" && primarySelectedObject && contextToolbarVariant !== "connector" && contextToolbarVariant !== "section" && (
        <div className="absolute left-0 top-full z-50 mt-2">
          <ColorPalettePopover
            currentColor={
              primarySelectedObject.type === "section"
                ? primarySelectedObject.style?.fill ?? paletteTokenStyle("note").fill
                : paletteTokenStyle(primarySelectedObject.style?.paletteToken ?? "note").accent
            }
            onPick={(color: Parameters<NonNullable<ColorPalettePopoverProps["onPick"]>>[0]) => {
              applyPaletteTokenToSelection(nearestPaletteToken(color));
              setOpenFlyout(null);
            }}
          />
        </div>
      )}
      {openFlyout === "color" && contextToolbarVariant === "connector" && selectedConnection && (
        <div className="absolute left-0 top-full z-50 mt-2">
          {/* Connector color flyout (W3b/W4): the sampled FigJam connector
              stroke set (figjam-tokens.ts CONNECTOR_COLORS), patched onto
              the selected connection as `color`. */}
          <ColorPalettePopover
            currentColor={selectedConnection.color ?? CONNECTOR_DEFAULT_COLOR}
            swatches={[Object.values(CONNECTOR_COLORS)]}
            onPick={(color: string) => {
              dispatch({
                type: "canvas.updateConnection",
                connectionId: selectedConnection.id,
                patch: { color },
              });
              setOpenFlyout(null);
            }}
          />
        </div>
      )}
      {openFlyout === "tint" && (
        <div className="absolute left-0 top-full z-50 mt-2 flex gap-1 rounded-full bg-[#1D1D1D] p-2 shadow-xl">
          {(
            [
              "green", "purple", "orange", "yellow", "gray",
              "white", "pink", "red", "blue", "teal",
            ] as CanvasSectionTint[]
          ).map((tint) => (
            <button
              key={tint}
              type="button"
              aria-label={`Section color ${tint}`}
              data-section-tint={tint}
              className="h-5 w-5 rounded-full border border-white/20"
              style={{ background: `var(--canvas-section-${tint}, ${tint})` }}
              onClick={() => {
                applyTintToSelection(tint);
                setOpenFlyout(null);
              }}
            />
          ))}
        </div>
      )}
      {openFlyout === "shape-swap" && (
        <div className="absolute left-0 top-full z-50 mt-2">
          <ShapeSearchPopover onPick={swapSelectedShape} />
        </div>
      )}
      {openFlyout === "lock" && (
        <div className="absolute left-0 top-full z-50 mt-2 rounded-md bg-[#1D1D1D] p-1 shadow-xl">
          <button
            type="button"
            role="menuitem"
            className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-white hover:bg-white/10"
            onClick={() => {
              toggleLockForSelection();
              setOpenFlyout(null);
            }}
          >
            {primarySelectedObject?.locked ? (
              <UnlockIcon className="h-4 w-4" />
            ) : (
              <LockIcon className="h-4 w-4" />
            )}
            {primarySelectedObject?.locked ? "Unlock section" : "Lock section"}
          </button>
        </div>
      )}
      {(openFlyout === "dash" || openFlyout === "routing" || openFlyout === "arrowhead") &&
        selectedConnection && (
          <div className="absolute left-0 top-full z-50 mt-2 grid gap-1 rounded-md bg-[#1D1D1D] p-1 shadow-xl">
            {openFlyout === "dash" &&
              (["solid", "dotted"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="menuitem"
                  className="rounded px-2 py-1.5 text-left text-sm capitalize text-white hover:bg-white/10"
                  onClick={() => {
                    dispatch({
                      type: "canvas.updateConnection",
                      connectionId: selectedConnection.id,
                      patch: { style: value },
                    });
                    setOpenFlyout(null);
                  }}
                >
                  {value}
                </button>
              ))}
            {openFlyout === "routing" &&
              (["elbow", "smooth"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="menuitem"
                  className="rounded px-2 py-1.5 text-left text-sm capitalize text-white hover:bg-white/10"
                  onClick={() => {
                    dispatch({
                      type: "canvas.updateConnection",
                      connectionId: selectedConnection.id,
                      patch: { style: value },
                    });
                    setOpenFlyout(null);
                  }}
                >
                  {value}
                </button>
              ))}
            {openFlyout === "arrowhead" &&
              (["none", "forward", "back", "both"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="menuitem"
                  className="rounded px-2 py-1.5 text-left text-sm capitalize text-white hover:bg-white/10"
                  onClick={() => {
                    dispatch({
                      type: "canvas.updateConnection",
                      connectionId: selectedConnection.id,
                      patch: { arrow: value },
                    });
                    setOpenFlyout(null);
                  }}
                >
                  {value}
                </button>
              ))}
          </div>
        )}
    </div>
  );
}
