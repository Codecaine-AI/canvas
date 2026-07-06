"use client";

/**
 * Interactive canvas action model — public entry point.
 *
 * This path is a FROZEN export target: package.json maps
 * `@codecaine-ai/canvas/actions` here, so it stays a pure barrel whose
 * export surface is unchanged from the pre-split single-file module. The
 * implementation lives in ./actions/:
 *  - ./actions/types        — CanvasAction union, selection/tool/state types
 *  - ./actions/defaults     — per-type defaults (geometry/tone/shape/label)
 *  - ./actions/history      — withHistory (80-entry cap) + undo/redo
 *  - ./actions/waypoints    — stale-waypoint reconciliation (post-reduce
 *                             choke point; undo/redo/reset exempt)
 *  - ./actions/objects      — add/update/duplicate/delete/set-type handlers
 *  - ./actions/geometry-ops — move/resize/geometries/parent/fit/align/distribute
 *  - ./actions/connections  — connector handlers + endpoint validators
 *  - ./actions/annotations  — annotation + link-status handlers
 *  - ./actions/reducer      — state factory, thin action switch, entry point
 *  - ./actions/helpers      — nextId/selectedObjectIds shared across domains
 */
export type {
  CanvasAction,
  CanvasAgentPatchOperation,
  CanvasChangeSummary,
  CanvasSelection,
  CanvasTool,
  InteractiveCanvasState,
} from "./actions/types";
export { defaultGeometryFor, objectTypeLabel } from "./actions/defaults";
export { resolveCanvasLinkStatuses } from "./actions/annotations";
export {
  buildSelectionContext,
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
} from "./actions/reducer";
