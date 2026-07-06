"use client";

/**
 * Interactive canvas document schema — public entry point.
 *
 * This path is a FROZEN export target: package.json maps
 * `@codecaine-ai/canvas/schema` here and 13+ external consumers import from
 * it, so it stays a pure barrel whose export surface is unchanged from the
 * pre-split single-file module. The implementation lives in ./schema/:
 *  - ./schema/object-types — object-type union + tone/palette/tint/
 *                            direction/icon-glyph enums
 *  - ./schema/style        — CanvasObjectStyle + its shape/stroke unions
 *  - ./schema/objects      — CanvasGeometry + the base InteractiveCanvasObject
 *  - ./schema/connections  — endpoints, connections, connector style/arrow
 *  - ./schema/annotations  — annotation targets/intents/statuses
 *  - ./schema/links        — doc/source links (SpectreRef targets)
 *  - ./schema/document     — the InteractiveCanvasDocument envelope
 *  - ./schema/validate     — validation layer (validate/assert + issue types)
 */
export type {
  CanvasArrowShapeDirection,
  CanvasIconGlyph,
  CanvasPaletteToken,
  CanvasSectionTint,
  CanvasShapeDirection,
  InteractiveCanvasObjectType,
  InteractiveCanvasTone,
} from "./schema/object-types";
export type { CanvasObjectStyle, CanvasSectionStrokeStyle } from "./schema/style";
export type { CanvasGeometry, InteractiveCanvasObject } from "./schema/objects";
export type {
  CanvasArrowDirection,
  CanvasConnectionEndpoint,
  CanvasConnectionStyle,
  InteractiveCanvasConnection,
} from "./schema/connections";
export type {
  CanvasAnnotationIntent,
  CanvasAnnotationStatus,
  CanvasAnnotationTarget,
  InteractiveCanvasAnnotation,
} from "./schema/annotations";
export type { CanvasLinkStatus, InteractiveCanvasLink } from "./schema/links";
export type {
  CanvasViewport,
  InteractiveCanvasDocument,
  InteractiveCanvasMode,
} from "./schema/document";
// Explicit .ts extension: this is the barrel's ONE value re-export, so it is
// the one specifier Node's type-stripping loader must resolve when a Node
// process loads this module directly (packages/studio/vite.config.ts imports
// validateInteractiveCanvasDocument from @codecaine-ai/canvas/schema). The
// type-only re-exports above are erased before resolution and stay
// extensionless.
export {
  assertInteractiveCanvasDocument,
  validateInteractiveCanvasDocument,
  type CanvasValidationIssue,
  type CanvasValidationResult,
} from "./schema/validate.ts";
