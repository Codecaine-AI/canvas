"use client";

import { ConnectorDashedLineIcon, ConnectorSolidLineIcon, LockIcon, UnlockIcon } from "../../../../ui/icons";
import { ColorPickerFlyout } from "./color-flyout";
import { FlyoutMenuButton, FlyoutPanel } from "./FlyoutPanel";
import type { ToolbarFlyoutProps, ToolbarFlyoutTable } from "./types";

/**
 * Section toolbar flyouts: editor interface JSX resolved by def kind + action
 * id (see ./index.ts). Section color opens the shared 10-pick ColorPickerFlyout
 * (P1, D12) — one pick drives the tint fill AND the chip/border family
 * through the palette's section role cells.
 */

function SectionBorderStyleFlyout({
  primaryObject,
  applySectionBorderStyleToSelection,
  close,
}: ToolbarFlyoutProps) {
  if (primaryObject?.type !== "section") return null;
  const currentStyle = primaryObject.style?.strokeStyle ?? "solid";
  return (
    <FlyoutPanel data-toolbar-flyout="section-border" style={{ display: "flex", gap: 4 }}>
      {(
        [
          ["solid", "Solid", ConnectorSolidLineIcon],
          ["dashed", "Dashed", ConnectorDashedLineIcon],
        ] as const
      ).map(([value, label, Icon]) => (
        <FlyoutMenuButton
          key={value}
          active={currentStyle === value}
          aria-label={label}
          aria-pressed={currentStyle === value}
          title={label}
          data-section-border-style={value}
          leadingIcon={<Icon className="h-5 w-5" />}
          onClick={() => {
            applySectionBorderStyleToSelection(value);
            close();
          }}
          style={{ width: 36, justifyContent: "center", padding: 0 }}
        />
      ))}
    </FlyoutPanel>
  );
}

function SectionLockFlyout({ primaryObject, setLockForSelection, close }: ToolbarFlyoutProps) {
  const locked = primaryObject?.locked;
  return (
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
  );
}

export const SECTION_FLYOUTS: ToolbarFlyoutTable = {
  color: ColorPickerFlyout,
  "section-border-style": SectionBorderStyleFlyout,
  lock: SectionLockFlyout,
};
