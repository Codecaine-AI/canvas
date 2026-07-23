/**
 * EDITOR_STYLE — the editor interface style constants (renamed from
 * theme/tokens.ts's TRIM in the theme dispersal: editor trim styling
 * co-locates with the editor components that consume it). Values sampled
 * from FigJam reference exports; `*Px` values are LOGICAL px.
 *
 * Two former TRIM values now live in stage/ instead (stage core must not
 * import stage/editor/): the select-tool cursor (CanvasStage) and the selection
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
  dockStickyIconSizePx: 30,
  dockNucleoIconStrokeWidthPx: 1.1,
  dockStickyIconStrokeWidthPx: 0.8,
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
  selectionToolbarHeightPx: 48,
  selectionToolbarRadiusPx: 14,
  selectionToolbarPaddingXPx: 10,
  selectionToolbarGapPx: 6,
  selectionToolbarButtonHeightPx: 36,
  selectionToolbarButtonRadiusPx: 8,
  selectionToolbarSwatchPx: 28,
  // FigJam-measured recipe (ring / key / ambient) from board-design-reference/analysis/figjam-popup-animation.html.
  selectionToolbarShadow:
    "0 0 0 0.5px rgba(0, 0, 0, 0.22), 0 2px 5px rgba(0, 0, 0, 0.14), 0 6px 18px rgba(0, 0, 0, 0.12)",
  flyoutRadiusPx: 16,
  flyoutPaddingPx: 12,
  flyoutShadow:
    "0 0 0 0.5px rgba(0, 0, 0, 0.22), 0 4px 10px rgba(0, 0, 0, 0.18), 0 8px 24px rgba(0, 0, 0, 0.16)",
  flyoutItemHeightPx: 36,
  flyoutItemRadiusPx: 8,
  colorPopoverSwatchPx: 30,
  colorPopoverGapPx: 12,
  colorPopoverPaddingPx: 14,
  colorPopoverRadiusPx: 16,
  accentPurple: "#8C2EF2",
} as const;
