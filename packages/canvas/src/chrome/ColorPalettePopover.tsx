"use client";

import { useState } from "react";
import { CHROME, PALETTE_POPOVER_SWATCHES } from "../render/figjam-tokens";

/**
 * ColorPalettePopover — the dark 2x11 swatch grid with a rainbow-ring
 * "current color" indicator, per figjam-chrome-catalog.md section 3.
 *
 * Ground truth (fj-030, the only frame this popover appears in):
 *   - 2 rows x 11 swatches, dark (~RGB 20-29) pill-ended panel.
 *   - Row 2's final swatch is NOT a distinct "+"/custom-color button — it's
 *     the CURRENT color, ringed with a thin conic/rainbow gradient border.
 *   - No hex input, no separate add-custom-color button (explicit negative
 *     finding in the catalog).
 *   - Anchored ~9px above the toolbar's fill-color swatch button (this
 *     component does not self-position — see the floating-ui usage note
 *     below; W3 wires the actual anchor).
 *
 * Token note: figjam-tokens.ts's PALETTE_POPOVER_SWATCHES ships 11 + 9 = 20
 * entries (its own doc comment flags this as a derived/extrapolated list,
 * not a directly-sampled 22-swatch array). To hit the catalog's exact 2x11
 * = 22 layout without editing the shared tokens file, we pad row 2 with the
 * rainbow-ringed "current color" swatch as swatch #22 — which matches the
 * catalog's description of that slot exactly by construction, not as a
 * workaround.
 */

export type ColorPalettePopoverProps = {
  /** The object's current fill color — rendered as the final rainbow-ringed swatch. */
  currentColor: string;
  onPick?: (color: string) => void;
  /**
   * Optional swatch rows overriding the default 2x11 object-fill grid (W3b):
   * used by the connector color flyout to show the sampled FigJam connector
   * stroke set (figjam-tokens.ts CONNECTOR_COLORS) instead. The rainbow-
   * ringed current-color swatch is still appended to the last row.
   */
  swatches?: string[][];
  header?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

const SWATCH_DIAMETER_PX = CHROME.colorPopoverSwatchPx;
const SWATCH_GAP_PX = CHROME.colorPopoverGapPx;
const POPOVER_BG = "#1D1D1D";

// W3: promoted to figjam-tokens.ts's CHROME.rainbowRingGradient (shared with
// the editor's color-swap wiring).
const RAINBOW_RING_GRADIENT = CHROME.rainbowRingGradient;

function Swatch({
  color,
  isCurrent,
  onPick,
}: {
  color: string;
  isCurrent?: boolean;
  onPick?: (color: string) => void;
}) {
  return (
    <button
      type="button"
      data-swatch=""
      data-color={color}
      aria-label={isCurrent ? `Current color ${color}` : `Color ${color}`}
      onClick={() => onPick?.(color)}
      style={{
        width: SWATCH_DIAMETER_PX,
        height: SWATCH_DIAMETER_PX,
        borderRadius: "50%",
        border: color === "#FFFFFF" || color === "#ffffff" ? "1px solid rgba(255,255,255,0.3)" : "none",
        background: isCurrent ? RAINBOW_RING_GRADIENT : color,
        padding: isCurrent ? 2 : 0,
        cursor: "pointer",
        backgroundClip: isCurrent ? "border-box" : undefined,
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {isCurrent ? (
        <span
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            background: color,
          }}
        />
      ) : null}
    </button>
  );
}

export function ColorPalettePopover({ currentColor, onPick, swatches, header, className, style }: ColorPalettePopoverProps) {
  const [row1, row2Base] = PALETTE_POPOVER_SWATCHES;
  // figjam-tokens.ts ships row 2 as 9 entries (8 saturated + pink); the
  // catalog's measured layout wants 10 direct swatches + 1 rainbow-current
  // swatch = 11 in row 2. Pad the shortfall by repeating from the front of
  // row 1 (gray, gray2) rather than fabricating new colors — keeps every
  // rendered swatch traceable to a real sampled token.
  const row2Direct = [...row2Base, ...row1].slice(0, 10);
  const rows: ReadonlyArray<ReadonlyArray<string>> =
    swatches && swatches.length > 0 ? swatches : [row1, row2Direct];
  const lastRowIndex = rows.length - 1;

  return (
    <div
      role="dialog"
      aria-label="Color palette"
      data-color-palette-popover=""
      className={className}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: SWATCH_GAP_PX,
        background: POPOVER_BG,
        borderRadius: CHROME.colorPopoverRadiusPx,
        padding: CHROME.colorPopoverPaddingPx,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {header}
      {rows.map((row, rowIndex) => (
        <div key={`row-${rowIndex}`} style={{ display: "flex", gap: SWATCH_GAP_PX }} data-swatch-row={rowIndex + 1}>
          {row.map((color, i) => (
            <Swatch key={`row${rowIndex}-${i}-${color}`} color={color} onPick={onPick} />
          ))}
          {rowIndex === lastRowIndex && <Swatch color={currentColor} isCurrent onPick={onPick} />}
        </div>
      ))}
    </div>
  );
}

export const COLOR_PALETTE_SWATCH_DIAMETER_PX = SWATCH_DIAMETER_PX;
export const COLOR_PALETTE_SWATCH_GAP_PX = SWATCH_GAP_PX;
/** Recommended gap between this popover's bottom edge and its anchor button (catalog: ~9px measured). */
export const COLOR_PALETTE_ANCHOR_GAP_PX = 9;
