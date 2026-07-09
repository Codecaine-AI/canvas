"use client";

import { resolveSwatchPreview, type CanvasColor } from "../../palette";
import { CANVAS_COLORS } from "../../state/schema";
import { EDITOR_STYLE } from "./editor-style";

/**
 * ColorPicker — THE one color picker (P1, OBJECT-DEF-OVERHAUL.md D12/D17):
 * a single row of 10 hue picks, identical for every kind (shapes, stickies,
 * sections, connectors). Every swatch renders its `swatch` preview hex
 * regardless of the kind it will color; the kind's role table decides how the
 * pick maps to ink/fill/wash. The current pick wears a floating 2px
 * accent-purple rounded-square outline, FigJam-style, and there is no custom
 * color, ever.
 *
 * Replaces ColorPalettePopover + the section-tint flyout + the connector
 * swatch flyout. Panel styling (dark pill, swatch metrics) carries over from
 * the sampled FigJam popover chrome (editor-style.ts).
 */

export type ColorPickerProps = {
  /** The current pick — rendered with a floating 2px accent-purple outline. */
  current?: CanvasColor;
  onPick?: (color: CanvasColor) => void;
  className?: string;
  style?: React.CSSProperties;
};

const SWATCH_DIAMETER_PX = EDITOR_STYLE.colorPopoverSwatchPx;
const SWATCH_GAP_PX = EDITOR_STYLE.colorPopoverGapPx;
const POPOVER_BG = "#1D1D1D";

/** Near-white swatches get a faint ring so they read against the dark panel. */
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
        borderRadius: "50%",
        border: "none",
        background: hex,
        padding: 0,
        cursor: "pointer",
        boxShadow:
          needsContrastRing(hex)
            ? "inset 0 0 0 1px rgba(255,255,255,0.3)"
            : "inset 0 0 0 1px rgba(255,255,255,0.14)",
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
            border: `2px solid ${EDITOR_STYLE.accentPurple}`,
            borderRadius: 9,
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
      className={className}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: SWATCH_GAP_PX,
        background: POPOVER_BG,
        borderRadius: EDITOR_STYLE.colorPopoverRadiusPx,
        padding: EDITOR_STYLE.colorPopoverPaddingPx,
        boxSizing: "border-box",
        ...style,
      }}
    >
      <div style={{ display: "flex", gap: SWATCH_GAP_PX }} data-swatch-row={1}>
        {CANVAS_COLORS.map((color) => (
          <Swatch key={color} color={color} isCurrent={color === current} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}
