export * from "./state/actions";
// Explicit list (not `export *`): palette.ts re-exports CANVAS_COLORS and the
// CanvasColor/CanvasHue types that ./state/schema below also exports — a
// star-export collision would silently drop those names from this barrel.
export {
  CANVAS_PALETTE,
  resolveConnectorPaint,
  resolveConnectorStroke,
  resolveIconPaint,
  resolveInk,
  resolveSectionColors,
  resolveSectionPaint,
  resolveShapeColors,
  resolveShapePaint,
  resolveStickyFill,
  resolveStickyPaint,
  resolveSwatchPreview,
} from "./theme/palette";
export type {
  ConnectorPaint,
  IconPaint,
  SectionChipColors,
  SectionColors,
  SectionPaint,
  ShapeColors,
  ShapePaint,
  StickyPaint,
  Swatch,
} from "./theme/palette";
// The style tokens' color syntax (`#RRGGBB` / `rgba(r, g, b, a)`), for hosts that edit tokens.
export { formatColor, formatHex, normalizeColor, parseColor } from "./theme/color-math";
export type { RgbaColor } from "./theme/color-math";
export * from "./stage/CanvasStage";
export {
  exportDocumentAsPng,
  exportDocumentAsSvg,
  exportFilenameFor,
  sanitizeExportFilename,
} from "./render/download";
export type { ExportPngOptions, ExportSvgOptions } from "./render/download";
export * from "./interaction/clipboard";
export * from "./theme/tokens";
export * from "./theme/canvas-style";
export {
  CanvasStyleProvider,
  useCanvasStyle,
  useResolvedCanvasStyle,
  canvasStyleCssVariables,
} from "./theme/canvas-style-context";
export type { CanvasStyleProviderProps } from "./theme/canvas-style-context";
export * from "./state/geometry";
export * from "./interaction/interaction";
export {
  IDLE_INTERACTION_STATE,
  emptyOverlay,
  toIdle,
} from "./stage/editor/pipeline/state";
export type {
  InteractionContext,
  InteractionOverlay,
  InteractionResult,
  InteractionState,
} from "./stage/editor/pipeline/state";
export { cancelInteraction, stepInteraction } from "./stage/editor/pipeline/core";
export {
  MIN_DIRECT_RESIZE_SIZE,
  applyResizeHandle,
  resizeCursorFor,
} from "./stage/editor/features/selection/resize";
export { SelectionBox } from "./stage/editor/features/selection/SelectionBox";
export {
  defaultGeometryForPlacement,
  objectTypeForTool,
  placePreviewColorFor,
  placePreviewOverlayFor,
  PLACE_PREVIEW_GHOST_ID,
} from "./stage/editor/features/place/place";
export type { ArmedShapeVariant } from "./stage/editor/features/place/place";
export type {
  ConnectorAnchorCandidate,
  ConnectorBendDragGesture,
  ConnectorDragOverlay,
} from "./connectors/types";
export * from "./connectors/routing";
export * from "./stage/editor/features/snapping/snapping";
export * from "./stage/editor/InteractiveCanvasEditor";
export * from "./stage/viewer/InteractiveCanvasViewer";
export * from "./state/schema";
export { OBJECT_TYPE_DEFAULTS, objectTypeDefaults } from "./state/schema/object-defaults";
export { objectDefForType } from "./objects/object-def";
export {
  BELOW_BAND_GAP_PX,
  BELOW_BAND_MIN_WIDTH_PX,
  belowBandMaxWidthPx,
  belowBandSize,
  belowExtendedBoundsPx,
  textPlacementName,
} from "./objects/text-slots";
export type { TextPlacement } from "./objects/text-slots";
export * from "./navigation/use-canvas-viewport";
export * from "./stage/viewport";
export { renderDocumentToSvg } from "./render/static-svg";
export {
  connectionPaintedBounds,
  objectPaintedBounds,
  paintedBounds,
} from "./render/painted-bounds";
export type { Rect } from "./render/painted-bounds";
export { renderBoardView, renderSectionView } from "./render/views";
export type { RenderedView, RenderViewOptions } from "./render/views";
export type {
  RenderDocumentToSvg,
  RenderedSvg,
  RenderStaticSvgOptions,
} from "./render/types";
