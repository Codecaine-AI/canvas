"use client";

/**
 * Pure pointer-interaction state machine for the interactive canvas (PD2).
 *
 * Mirrors term-draw's draw-state.ts architecture: a thin DOM adapter (living in
 * InteractiveCanvasEditor.tsx) converts native pointer events into normalized,
 * world-space `CanvasPointerEvent`s; the machine is the pure coordinator that
 * consumes them and emits typed `CanvasAction`s plus ephemeral overlay state
 * (marquee rect, snap guides, spacing hints, drop target). No DOM access —
 * everything is testable with plain objects.
 *
 * This module is the stable entry point (barrel) for the machine; the
 * implementation is split across:
 *  - ./types           — state union, pointer event/hit model, overlay,
 *                        context/result types, shared thresholds
 *  - ./core            — stepInteraction dispatcher + idle/press-pending
 *                        routers + cancelInteraction
 *  - ./gestures/*      — move, resize, marquee, place, connectors steppers
 *  - ./hit-testing     — document hit-tests + snap-candidate gathering
 *  - ./frame-coalescer — rAF coalescing utility for host adapters
 * The export surface here is unchanged from the pre-split single-file module;
 * consumers (editor/, render/, tests) keep importing from this path.
 */
export { cancelInteraction, stepInteraction } from "./core";
export {
  IDLE_INTERACTION_STATE,
  RESIZE_HANDLES,
  type CanvasHit,
  type CanvasPointerEvent,
  type CanvasPointerEventType,
  type ConnectorAnchorCandidate,
  type ConnectorDragOverlay,
  type InteractionContext,
  type InteractionOverlay,
  type InteractionResult,
  type InteractionState,
  type ResizeHandle,
} from "./types";
export { hitTestDropTarget, hitTestObjects, selectionBounds } from "./hit-testing";
export { MIN_DIRECT_RESIZE_SIZE, applyResizeHandle, resizeCursorFor } from "./gestures/resize";
export { defaultGeometryForPlacement } from "./gestures/place";
export { createFrameCoalescer, type FrameCoalescer, type FrameScheduler } from "./frame-coalescer";
// SnapGuide/SpacingHint are defined in snapping.ts (the pure computation module);
// re-exported here so callers of the interaction machine don't need a second import.
export type { SnapGuide, SpacingHint } from "./snapping";
