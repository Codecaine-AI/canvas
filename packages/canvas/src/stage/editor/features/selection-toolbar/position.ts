/**
 * positionSelectionToolbar — pure geometry helper for floating the dark
 * selection toolbar above a selection, clamped fully inside the viewport.
 *
 * Ground truth: figjam-trim-catalog.md section 2 describes the toolbar as
 * floating "above the current selection"; figjam-style-tokens.json/spec
 * don't give an exact gap figure for the *toolbar* (only the color popover's
 * ~9px gap above the toolbar is measured), so we started from the brief's
 * 27px above-selection figure and deliberately raised it so the toolbar
 * clears connector creation dots. If the selection is near the top of the
 * viewport such that the toolbar would clip above y=0, we flip to floating
 * BELOW the selection instead (a reasonable default; not directly observed
 * in the source recording — flagged as an extrapolation for W3 to confirm
 * against live FigJam).
 */

export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

export type PositionSelectionToolbarResult = {
  x: number;
  y: number;
  /** Which side of the selection the toolbar ended up on, post-clamp. */
  placement: "above" | "below";
};

// Mirrors AnchorDots ANCHOR_DOT_OFFSET_PX + HIT_TARGET_PX / 2 + 6px margin.
const ANCHOR_DOT_HIT_ZONE_CLEARANCE_PX = 20 + 28 / 2 + 6;
const GAP_ABOVE_SELECTION_PX = ANCHOR_DOT_HIT_ZONE_CLEARANCE_PX;
const GAP_BELOW_SELECTION_PX = ANCHOR_DOT_HIT_ZONE_CLEARANCE_PX;
/** Minimum breathing room kept between the toolbar and any viewport edge. */
const VIEWPORT_MARGIN_PX = 8;

export function positionSelectionToolbar(
  selectionRect: Rect,
  toolbarSize: Size,
  viewport: Size,
): PositionSelectionToolbarResult {
  const selectionCenterX = selectionRect.x + selectionRect.width / 2;

  // Horizontal: center on the selection, then clamp fully inside the viewport.
  let x = selectionCenterX - toolbarSize.width / 2;
  const minX = VIEWPORT_MARGIN_PX;
  const maxX = viewport.width - toolbarSize.width - VIEWPORT_MARGIN_PX;
  if (maxX < minX) {
    // Toolbar wider than the viewport minus margins — center it as a fallback.
    x = (viewport.width - toolbarSize.width) / 2;
  } else {
    x = Math.min(Math.max(x, minX), maxX);
  }

  // Vertical: prefer floating above the selection.
  const aboveY = selectionRect.y - GAP_ABOVE_SELECTION_PX - toolbarSize.height;
  let y: number;
  let placement: "above" | "below";

  if (aboveY >= VIEWPORT_MARGIN_PX) {
    y = aboveY;
    placement = "above";
  } else {
    // Not enough room above — flip below the selection.
    const belowY = selectionRect.y + selectionRect.height + GAP_BELOW_SELECTION_PX;
    y = belowY;
    placement = "below";
  }

  // Final vertical clamp fully inside the viewport regardless of placement.
  const minY = VIEWPORT_MARGIN_PX;
  const maxY = viewport.height - toolbarSize.height - VIEWPORT_MARGIN_PX;
  if (maxY < minY) {
    y = (viewport.height - toolbarSize.height) / 2;
  } else {
    y = Math.min(Math.max(y, minY), maxY);
  }

  return { x, y, placement };
}

/**
 * positionFlyoutCenteredOnTrigger — returns the left offset, relative to the
 * toolbar layer origin, for a flyout centered above its trigger button and
 * clamped inside the viewport.
 */
export function positionFlyoutCenteredOnTrigger(
  triggerRect: Rect,
  flyoutWidth: number,
  toolbarRect: Rect,
  viewportWidth: number,
  margin = VIEWPORT_MARGIN_PX,
): number {
  const triggerCenterX = triggerRect.x + triggerRect.width / 2;

  let viewportX = triggerCenterX - flyoutWidth / 2;
  const minX = margin;
  const maxX = viewportWidth - flyoutWidth - margin;
  if (maxX < minX) {
    // Flyout wider than the viewport minus margins — center it as a fallback.
    viewportX = (viewportWidth - flyoutWidth) / 2;
  } else {
    viewportX = Math.min(Math.max(viewportX, minX), maxX);
  }

  return viewportX - toolbarRect.x;
}
