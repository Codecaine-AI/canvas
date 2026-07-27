/**
 * Node-safe render surface: the static SVG renderer, painted-extent
 * measurement, and the named views. Browser-only file export lives in
 * ./download and is deliberately NOT re-exported here.
 */

export { connectionLabelChipRect, renderDocumentToSvg, renderSceneToSvg } from "./static-svg";
export type { RenderScene } from "./static-svg";
export {
  connectionPaintedBounds,
  objectPaintedBounds,
  paintedBounds,
  rectsIntersect,
  unionRects,
} from "./painted-bounds";
export type { Rect } from "./painted-bounds";
export { renderBoardView, renderSectionView } from "./views";
export type { RenderedView, RenderViewOptions } from "./views";
export type {
  RenderDocumentToSvg,
  RenderedSvg,
  RenderStaticSvgOptions,
} from "./types";
