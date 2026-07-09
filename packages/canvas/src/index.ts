export * from "./state/actions";
// Explicit list (not `export *`): palette.ts re-exports CANVAS_COLORS and the
// CanvasColor/CanvasHue types that ./state/schema below also exports — a
// star-export collision would silently drop those names from this barrel.
export {
  CANVAS_PALETTE,
  resolveConnectorStroke,
  resolveSectionColors,
  resolveShapeColors,
  resolveStickyFill,
  resolveSwatchPreview,
} from "./theme/palette";
export type { SectionChipColors, SectionColors, ShapeColors, Swatch } from "./theme/palette";
export * from "./stage/CanvasStage";
export * from "./interaction/clipboard";
export * from "./theme/tokens";
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
export * from "./stage/editor/use-canvas-viewport";
export * from "./stage/viewport";
