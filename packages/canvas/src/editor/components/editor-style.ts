/**
 * EDITOR_STYLE — the editor interface style constants (renamed from
 * theme/tokens.ts's CHROME in the theme dispersal: editor chrome styling
 * co-locates with the editor components that consume it). Values sampled
 * from FigJam reference exports; `*Px` values are LOGICAL px.
 *
 * Two former CHROME values now live in render/ instead (render must not
 * import editor/): the select-tool cursor (CanvasStage) and the selection
 * outline blue (Connector/ConnectorDragPreview, SelectionBox et al.'s
 * #0D99FF).
 */

export const EDITOR_STYLE = {
  topBarBg: "#E6E6E6",
  topBarBorderBottom: "#DFDFDF",
  bottomToolbarBg: "#FFFFFF",
  dockHeightPx: 53,
  dockRadiusPx: 15,
  dockPaddingXPx: 10,
  dockButtonSizePx: 40,
  dockButtonRadiusPx: 11,
  dockIconSizePx: 24,
  dockStickyIconSizePx: 28,
  dockNucleoIconStrokeWidthPx: 1.1,
  dockStickyIconStrokeWidthPx: 0.95,
  dockSectionIconStrokeWidthPx: 7,
  dockGroupGapPx: 5,
  dockDividerWidthPx: 1.5,
  dockDividerHeightPx: 32,
  dockDividerMarginXPx: 10,
  dockDividerColor: "rgba(0, 0, 0, 0.18)",
  dockGlyphColor: "#333333",
  dockHoverBg: "#F0F0F0",
  dockShadow: "0 2px 10px rgba(0, 0, 0, 0.12), 0 0 0 0.5px rgba(0, 0, 0, 0.06)",
  selectionToolbarBg: "#1D1D1D",
  selectionToolbarSwatchPx: 22,
  colorPopoverSwatchPx: 32,
  colorPopoverGapPx: 10,
  colorPopoverPaddingPx: 18,
  colorPopoverRadiusPx: 20,
  accentPurple: "#8C2EF2",
  /**
   * Rainbow/conic gradient ring drawn around the color popover's
   * "current color" swatch.
   */
  rainbowRingGradient:
    "conic-gradient(from 0deg, #FF3B30, #FF9500, #FFCC00, #34C759, #30B0C7, #0D99FF, #9747FF, #FF2D95, #FF3B30)",
} as const;
