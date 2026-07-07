"use client";

import { EDITOR_STYLE } from "../../../components/editor-style";
import { DashIcon, LockIcon, NoStrokeIcon, StrokeIcon, UnlockIcon } from "../../../../ui/icons";
import { resolveSectionColors } from "../../../../theme";
import type { CanvasSectionTint } from "../../../../state/schema";
import { FlyoutMenuButton, FlyoutPanel } from "./FlyoutPanel";
import type { ToolbarFlyoutProps, ToolbarFlyoutTable } from "./types";

const SECTION_TINTS: readonly CanvasSectionTint[] = [
  "green",
  "purple",
  "orange",
  "yellow",
  "gray",
  "white",
  "pink",
  "red",
  "blue",
  "teal",
];

/**
 * Section toolbar flyouts: editor interface JSX resolved by def kind + action
 * id (see ./index.ts). Section color is tint-based so one pick updates the
 * fill and border family together.
 */

function SectionColorFlyout({ primaryObject, applyTintToSelection, close }: ToolbarFlyoutProps) {
  if (primaryObject?.type !== "section") return null;
  const currentTint = primaryObject.tint ?? "gray";
  return (
    <div className="absolute bottom-full left-0 z-50 mb-2">
      <FlyoutPanel style={{ display: "flex", gap: 10 }}>
        {SECTION_TINTS.map((tint) => {
          const colors = resolveSectionColors(tint);
          const active = currentTint === tint;
          return (
            <button
              key={tint}
              type="button"
              aria-label={`Section color ${tint}`}
              data-section-tint={tint}
              onClick={() => {
                applyTintToSelection(tint);
                close();
              }}
              style={{
                width: EDITOR_STYLE.colorPopoverSwatchPx,
                height: EDITOR_STYLE.colorPopoverSwatchPx,
                borderRadius: "50%",
                border: active ? "none" : "1px solid rgba(255,255,255,0.2)",
                background: active ? EDITOR_STYLE.rainbowRingGradient : colors.tint,
                padding: active ? 2 : 0,
                cursor: "pointer",
                boxSizing: "border-box",
              }}
            >
              {active ? (
                <span
                  style={{
                    display: "block",
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: colors.tint,
                    boxSizing: "border-box",
                  }}
                />
              ) : null}
            </button>
          );
        })}
      </FlyoutPanel>
    </div>
  );
}

function SectionBorderStyleFlyout({
  primaryObject,
  applySectionBorderStyleToSelection,
  close,
}: ToolbarFlyoutProps) {
  if (primaryObject?.type !== "section") return null;
  const currentStyle = primaryObject.style?.strokeStyle ?? "solid";
  return (
    <div className="absolute bottom-full left-0 z-50 mb-2" data-toolbar-flyout="section-border">
      <FlyoutPanel style={{ display: "grid", gap: 4 }}>
        {(
          [
            ["solid", "Solid", StrokeIcon],
            ["dashed", "Dashed", DashIcon],
            ["none", "None", NoStrokeIcon],
          ] as const
        ).map(([value, label, Icon]) => (
          <FlyoutMenuButton
            key={value}
            active={currentStyle === value}
            aria-label={label}
            data-section-border-style={value}
            leadingIcon={<Icon className="h-5 w-5" />}
            onClick={() => {
              applySectionBorderStyleToSelection(value);
              close();
            }}
            style={{ width: "100%" }}
          >
            {label}
          </FlyoutMenuButton>
        ))}
      </FlyoutPanel>
    </div>
  );
}

function SectionLockFlyout({ primaryObject, setLockForSelection, close }: ToolbarFlyoutProps) {
  const locked = primaryObject?.locked;
  return (
    <div className="absolute bottom-full left-0 z-50 mb-2">
      <FlyoutPanel style={{ display: "grid", gap: 4 }}>
        {locked ? (
          <FlyoutMenuButton
            aria-label="Unlock"
            leadingIcon={<UnlockIcon className="h-5 w-5" />}
            onClick={() => {
              setLockForSelection(undefined);
              close();
            }}
            style={{ width: "100%" }}
          >
            Unlock
          </FlyoutMenuButton>
        ) : (
          <>
            <FlyoutMenuButton
              aria-label="Lock all"
              leadingIcon={<LockIcon className="h-5 w-5" />}
              onClick={() => {
                setLockForSelection("all");
                close();
              }}
              style={{ width: "100%" }}
            >
              Lock all
            </FlyoutMenuButton>
            <FlyoutMenuButton
              aria-label="Lock background only"
              leadingIcon={<LockIcon className="h-5 w-5" />}
              onClick={() => {
                setLockForSelection("background");
                close();
              }}
              style={{ width: "100%" }}
            >
              Lock background only
            </FlyoutMenuButton>
          </>
        )}
      </FlyoutPanel>
    </div>
  );
}

export const SECTION_FLYOUTS: ToolbarFlyoutTable = {
  color: SectionColorFlyout,
  "section-border-style": SectionBorderStyleFlyout,
  lock: SectionLockFlyout,
};
