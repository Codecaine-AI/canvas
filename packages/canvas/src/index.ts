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
} from "./palette";
export type { SectionChipColors, SectionColors, ShapeColors, Swatch } from "./palette";
export * from "./render/CanvasStage";
export * from "./interaction/clipboard";
export * from "./theme";
export * from "./state/geometry";
export * from "./interaction/interaction";
export * from "./routing/routing";
export * from "./interaction/snapping";
export * from "./editor/InteractiveCanvasEditor";
export * from "./editor/InteractiveCanvasViewer";
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
export * from "./editor/use-canvas-viewport";
export * from "./render/viewport";
