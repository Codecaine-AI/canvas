"use client";

/**
 * Pure pointer-interaction state machine for the interactive canvas (PD2).
 *
 * Mirrors term-draw's draw-state.ts architecture: a thin DOM adapter (living in
 * InteractiveCanvasEditor.tsx) converts native pointer events into normalized,
 * world-space `CanvasPointerEvent`s; the machine is the pure coordinator that
 * consumes them and emits typed `CanvasAction`s plus ephemeral overlay state
 * (drag-select rect, snap guides, spacing hints, drop target). No DOM access —
 * everything is testable with plain objects.
 *
 * This module is the stable entry point (barrel) for shared interaction
 * kernel vocabulary and helpers; the editor pipeline owns the dispatcher
 * assembly and feature slices own gesture logic/visuals. The implementation
 * is split across:
 *  - ./types           — pointer event/hit model, resize handles, thresholds
 *  - ../stage/editor/pipeline/core
 *                      — stepInteraction dispatcher + state contracts
 *  - ../stage/editor/features/*
 *                      — move, resize, drag-select, place, snapping slices
 *  - ./hit-testing     — document hit-tests + snap-candidate gathering
 *  - ./frame-coalescer — rAF coalescing utility for host adapters
 */
export {
  RESIZE_HANDLES,
  type CanvasHit,
  type CanvasPointerEvent,
  type CanvasPointerEventType,
  type ResizeHandle,
} from "./types";
export { hitTestObjects, selectionBounds } from "./hit-testing";
export { createFrameCoalescer, type FrameCoalescer, type FrameScheduler } from "./frame-coalescer";
