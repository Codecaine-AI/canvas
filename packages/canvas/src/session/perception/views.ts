/**
 * The two model-facing cameras: the full-board view used by state assembly,
 * look, and session spawn, and the section close-up returned when look names a
 * `view` section.
 *
 * This module is the harness's single seam over the canvas package's named
 * views — nothing else in the harness knows how the views are produced. The
 * package's cameras frame painted extents (routed connection polylines,
 * label chips, zoom-scaled section title chips), so nothing drawn on the
 * board ever crosses the viewBox edge.
 */
export {
  renderBoardView,
  renderSectionView,
  type RenderedView,
  type RenderViewOptions,
} from "@codecaine-ai/canvas/render";

/** Raster width in px of the full-board view. */
export const BOARD_VIEW_WIDTH = 1600;
/** Raster width in px of the section close-up view. */
export const SECTION_VIEW_WIDTH = 1400;
/**
 * Raster width in px of a framed union close-up (`look view:` over one or
 * more ids). Same width as the section close-up: a union frame is the same
 * kind of look at a region the model chose the contents of, so it should
 * arrive at the same scale.
 */
export const CROP_VIEW_WIDTH = SECTION_VIEW_WIDTH;
