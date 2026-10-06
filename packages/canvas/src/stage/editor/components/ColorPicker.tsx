"use client";

import { cssVar } from "@codecaine-ai/design-system";
import { resolveSwatchPreview, type CanvasColor } from "../../../theme/palette";
import { CANVAS_COLORS } from "../../../state/schema";
import { EDITOR_STYLE } from "./editor-style";

/**
 * ColorPicker — THE one color picker (P1, OBJECT-DEF-OVERHAUL.md D12/D17):
 * a single row of 10 hue picks, identical for every kind (shapes, stickies,
 * sections, connectors). Every swatch renders its `swatch` preview hex
 * regardless of the kind it will color; the kind's role table decides how the
 * pick maps to ink/fill/wash. The current pick wears a floating 2px
 * accent rounded-square outline, FigJam-style, and there is no custom
 * color, ever.
 *
 * Replaces ColorPalettePopover + the section-tint flyout + the connector
 * swatch flyout. Panel styling (dark popover, swatch metrics) comes from
 * editor-style.ts; the popover is dark in both app themes (its root sets
 * `data-theme="dark"`). The swatch fills are board colors, not chrome.
 */

export type ColorPickerProps = {
  /** The current pick — rendered with a floating 2px accent outline. */
  current?: CanvasColor;
  onPick?: (color: CanvasColor) => void;
  className?: string;
  style?: React.CSSProperties;
};

const SWATCH_DIAMETER_PX = EDITOR_STYLE.colorPopoverSwatchPx;
const SWATCH_GAP = EDITOR_STYLE.colorPopoverGap;
const POPOVER_BG = EDITOR_STYLE.selectionToolbarBg;
const SWATCH_RING = `inset 0 0 0 ${cssVar("border.width.hairline")} ${cssVar("color.border.default")}`;
const SWATCH_CONTRAST_RING = `inset 0 0 0 ${cssVar("border.width.hairline")} ${cssVar("color.border.strong")}`;

/** Near-white swatches get a stronger ring so they read against the dark panel. */
function needsContrastRing(hex: string): boolean {
  return /^#F/i.test(hex);
}

function Swatch({
  color,
  isCurrent,
  onPick,
}: {
  color: CanvasColor;
  isCurrent: boolean;
  onPick?: (color: CanvasColor) => void;
}) {
  const hex = resolveSwatchPreview(color);
  return (
    <button
      type="button"
      data-swatch=""
      data-canvas-color={color}
      data-current={isCurrent ? "true" : undefined}
      aria-label={isCurrent ? `Current color ${color}` : `Color ${color}`}
      aria-pressed={isCurrent}
      onClick={() => onPick?.(color)}
      style={{
        width: SWATCH_DIAMETER_PX,
        height: SWATCH_DIAMETER_PX,
        borderRadius: cssVar("radius.pill"),
        border: "none",
        background: hex,
        padding: 0,
        cursor: "pointer",
        boxShadow: needsContrastRing(hex) ? SWATCH_CONTRAST_RING : SWATCH_RING,
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {isCurrent ? (
        <span
          data-current-ring=""
          style={{
            position: "absolute",
            inset: -5,
            borderWidth: "2px",
            borderStyle: "solid",
            borderColor: EDITOR_STYLE.selectedOutline,
            borderRadius: cssVar("radius.base"),
            pointerEvents: "none",
          }}
        />
      ) : null}
    </button>
  );
}

export function ColorPicker({ current, onPick, className, style }: ColorPickerProps) {
  return (
    <div
      role="dialog"
      aria-label="Color picker"
      data-canvas-color-picker=""
      data-theme="dark"
      className={className}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: SWATCH_GAP,
        background: POPOVER_BG,
        borderRadius: EDITOR_STYLE.colorPopoverRadius,
        padding: EDITOR_STYLE.colorPopoverPaddingPx,
        boxSizing: "border-box",
        ...style,
      }}
    >
      <div style={{ display: "flex", gap: SWATCH_GAP }} data-swatch-row={1}>
        {CANVAS_COLORS.map((color) => (
          <Swatch key={color} color={color} isCurrent={color === current} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}
