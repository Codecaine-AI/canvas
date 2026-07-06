"use client";

import { LockIcon, UnlockIcon } from "lucide-react";
import { ColorPalettePopover } from "../../ui/ColorPalettePopover";
import { DashIcon, NoStrokeIcon, StrokeIcon } from "../../ui/icons/toolbar-icons";
import { resolveSectionColors } from "../../theme/resolve";
import type { ToolbarFlyoutProps, ToolbarSpec } from "../object-def";
import type { CanvasSectionTint } from "../../state/schema";

/**
 * Section selection toolbar (step 5): control list moved verbatim from chrome's
 * CONTEXT_TOOLBAR_REGISTRY["section"] (minus the Icon field), flyout JSX
 * moved verbatim from editor/features/selection-toolbar/SelectionToolbarLayer.tsx.
 * The "tint" flyout has no toolbar control — it is opened via the editor's
 * context menu — but lives here so the flyout table stays complete.
 */

/** Section fill palette — the section variant's "color" control. */
function SectionFillFlyout({ primaryObject, applySectionFillToSelection, close }: ToolbarFlyoutProps) {
  if (primaryObject?.type !== "section") return null;
  return (
    <div className="absolute left-0 top-full z-50 mt-2">
      <ColorPalettePopover
        currentColor={primaryObject.style?.fill ?? resolveSectionColors(primaryObject.tint).tint}
        onPick={(color: string) => {
          applySectionFillToSelection(color);
          close();
        }}
      />
    </div>
  );
}

/** Border palette + solid/dashed/none border-style header row. */
function SectionBorderStyleFlyout({
  primaryObject,
  applySectionStrokeToSelection,
  applySectionBorderStyleToSelection,
  close,
}: ToolbarFlyoutProps) {
  if (primaryObject?.type !== "section") return null;
  return (
    <div className="absolute left-0 top-full z-50 mt-2">
      <ColorPalettePopover
        currentColor={
          primaryObject.style?.stroke ?? resolveSectionColors(primaryObject.tint).chipBorder ?? "transparent"
        }
        onPick={(color: string) => {
          applySectionStrokeToSelection(color);
          close();
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
                const active = (primaryObject.style?.strokeStyle ?? "solid") === value;
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
  );
}

/** The 10-chip section tint row (context-menu-opened; no toolbar control). */
function SectionTintFlyout({ applyTintToSelection, close }: ToolbarFlyoutProps) {
  return (
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
            close();
          }}
        />
      ))}
    </div>
  );
}

/** Lock/unlock single-item menu. */
function SectionLockFlyout({ primaryObject, toggleLockForSelection, close }: ToolbarFlyoutProps) {
  return (
    <div className="absolute left-0 top-full z-50 mt-2 rounded-md bg-[#1D1D1D] p-1 shadow-xl">
      <button
        type="button"
        role="menuitem"
        className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-white hover:bg-white/10"
        onClick={() => {
          toggleLockForSelection();
          close();
        }}
      >
        {primaryObject?.locked ? (
          <UnlockIcon className="h-4 w-4" />
        ) : (
          <LockIcon className="h-4 w-4" />
        )}
        {primaryObject?.locked ? "Unlock section" : "Lock section"}
      </button>
    </div>
  );
}

export const SECTION_TOOLBAR: ToolbarSpec = {
  controls: [
    { action: "color", label: "Color", hasFlyout: true },
    { action: "section-border-style", label: "Border style", hasFlyout: true },
    { action: "rename", label: "Rename", dividerAfter: true },
    { action: "visibility", label: "Hide contents" },
    { action: "lock", label: "Lock", hasFlyout: true },
  ],
  flyouts: {
    color: SectionFillFlyout,
    "section-border-style": SectionBorderStyleFlyout,
    tint: SectionTintFlyout,
    lock: SectionLockFlyout,
  },
};
