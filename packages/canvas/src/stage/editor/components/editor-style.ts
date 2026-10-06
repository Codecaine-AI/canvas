import { cssVar } from "@codecaine-ai/design-system";

/**
 * EDITOR_STYLE — the editor interface style constants (renamed from
 * theme/tokens.ts's TRIM in the theme dispersal: editor trim styling
 * co-locates with the editor components that consume it).
 *
 * Geometry sampled from FigJam reference exports: `*Px` values are LOGICAL px
 * numbers (sizes and offsets with no equal design-system step). Everything
 * else is a `@codecaine-ai/design-system` token (`var(--ds-*)`): colors,
 * radii, shadows and the spacing that has an exactly equal step. The light
 * pieces (dock, zoom pill) follow the app theme; the dark pieces (selection
 * toolbar, its flyouts, the color picker, the shape search popover) put
 * `data-theme="dark"` on their root, so the same tokens resolve dark there.
 *
 * Two former TRIM values now live in stage/ instead (stage core must not
 * import stage/editor/): the select-tool cursor (CanvasStage) and the selection
 * outline blue (Connector/ConnectorDragPreview, SelectionBox et al.'s
 * #0D99FF).
 */

export const EDITOR_STYLE = {
  bottomToolbarBg: cssVar("color.surface.panel"),
  dockHeightPx: 53,
  dockRadius: cssVar("radius.base"),
  dockPaddingXPx: 10,
  dockButtonSize: cssVar("space.10"),
  dockButtonRadius: cssVar("radius.base"),
  dockIconSize: cssVar("space.6"),
  dockStickyIconSizePx: 30,
  dockNucleoIconStrokeWidthPx: 1.1,
  dockStickyIconStrokeWidthPx: 0.8,
  dockSectionIconStrokeWidthPx: 7,
  dockGroupGapPx: 5,
  dockDividerWidthPx: 1.5,
  dockDividerHeight: cssVar("space.8"),
  dockDividerMarginXPx: 10,
  dockDividerColor: cssVar("color.border.default"),
  dockGlyphColor: cssVar("color.text.body"),
  dockHoverBg: cssVar("color.fill.hover"),
  dockShadow: cssVar("shadow.glass"),
  selectionToolbarBg: cssVar("color.surface.panel"),
  selectionToolbarHeight: cssVar("space.12"),
  selectionToolbarRadius: cssVar("radius.base"),
  selectionToolbarPaddingXPx: 10,
  selectionToolbarGap: cssVar("space.1-5"),
  selectionToolbarButtonHeightPx: 36,
  selectionToolbarButtonRadius: cssVar("radius.base"),
  selectionToolbarSwatch: cssVar("space.7"),
  selectionToolbarShadow: cssVar("shadow.glass"),
  flyoutRadius: cssVar("radius.base"),
  flyoutPadding: cssVar("space.3"),
  flyoutShadow: cssVar("shadow.glass"),
  flyoutItemHeightPx: 36,
  flyoutItemRadius: cssVar("radius.base"),
  colorPopoverSwatchPx: 30,
  colorPopoverGap: cssVar("space.3"),
  colorPopoverPaddingPx: 14,
  colorPopoverRadius: cssVar("radius.base"),
  /**
   * Armed / active / selected control: the dock's armed tool, a locked toolbar
   * control, a flyout's current option. A solid accent tile under the on-solid
   * glyph (FigJam's solid purple tile, in tokens), so the armed state reads at
   * >= 3:1 against the panel (WCAG 1.4.11): accent on panel 4.16:1 light,
   * 5.59:1 dark; the glyph on the accent 4.42:1 light, 6.11:1 dark.
   */
  activeBg: cssVar("color.accent"),
  activeGlyph: cssVar("color.text.on-solid"),
  /** Selected outline (the color picker's current-pick ring). */
  selectedOutline: cssVar("color.accent"),
} as const;
