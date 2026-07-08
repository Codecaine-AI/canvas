"use client";

/**
 * Interactive canvas action model — public entry point.
 *
 * This path is a FROZEN export target: package.json maps
 * `@codecaine-ai/canvas/actions` here, so it stays a pure barrel whose
 * export surface is unchanged from the pre-split single-file module. The
 * implementation lives in ./actions/:
 *  - ./actions/types        — CanvasAction union, selection/tool/state types
 *  - ./actions/history      — withHistory (80-entry cap) + undo/redo
 *  - ./actions/waypoints    — stale-waypoint reconciliation (post-reduce
 *                             choke point; undo/redo/reset exempt)
 *  - ./actions/objects      — add/update/duplicate/delete/set-type handlers
 *  - ./actions/geometry-ops — move/resize/geometries/parent/fit/align/distribute
 *  - ./actions/connections  — connector handlers + endpoint validators
 *  - ./actions/annotations  — annotation handlers
 *  - ./actions/reducer      — state factory, thin action switch, entry point
 *  - ./actions/helpers      — nextId/selectedObjectIds shared across domains
 *
 * Per-type defaults (geometry/shape/label/color) live in ../schema/
 * object-defaults — schema vocabulary the reducer reads directly and the
 * object registry stamps its def.defaults from (P4); re-exported below so
 * this barrel's public surface is unchanged.
 */
export type {
  CanvasAction,
  CanvasAgentPatchOperation,
  CanvasChangeSummary,
  CanvasSelection,
  CanvasTool,
  InteractiveCanvasState,
} from "./actions/types";
export {
  colorKindForType,
  defaultGeometryFor,
  draftPlacedObject,
  FIRST_USE_COLORS,
  objectTypeLabel,
} from "./schema/object-defaults";
export type { CanvasColorKind } from "./schema/object-defaults";
export {
  buildSelectionContext,
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
} from "./actions/reducer";
