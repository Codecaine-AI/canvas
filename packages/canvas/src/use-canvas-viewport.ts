"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFrameCoalescer } from "./interaction";
import {
  clampZoom,
  fitDocument,
  panBy,
  screenToWorld as screenToWorldPure,
  zoomAtPoint,
  type ScreenSize,
  type ViewportState,
} from "./viewport";
import type { CanvasPoint } from "./geometry";
import type { InteractiveCanvasDocument } from "./schema";

const ZOOM_STEP = 1.2;

export type UseCanvasViewportArgs = {
  document: InteractiveCanvasDocument;
  stageRef: React.RefObject<HTMLElement | null>;
  enabled?: boolean;
  /** Pan on plain left-drag (hand tool). Space/middle-mouse pan always works. */
  panOnPlainDrag?: boolean;
};

export type CanvasViewportControls = {
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomTo100: () => void;
};

export type UseCanvasViewportResult = {
  viewport: ViewportState;
  setViewport: (updater: ViewportState | ((viewport: ViewportState) => ViewportState)) => void;
  isPanning: boolean;
  controls: CanvasViewportControls;
  screenToWorld: (point: CanvasPoint) => CanvasPoint;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function stageScreenSize(stage: HTMLElement | null): ScreenSize | null {
  if (!stage) return null;
  const rect = stage.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { width: rect.width, height: rect.height };
}

function stagePointFromClient(
  stage: HTMLElement,
  clientX: number,
  clientY: number,
): CanvasPoint {
  const rect = stage.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

/**
 * Owns ViewportState for the interactive editor: fit-on-mount, wheel pan/zoom,
 * space-drag / middle-mouse pan, and zoom controls (fit / +/- / 100%).
 *
 * Mirrors term-draw's use-pointer-adapter.ts pattern: refs hold the latest
 * callback-relevant values so listeners can be attached once and stay live.
 */
export function useCanvasViewport({
  document,
  stageRef,
  enabled = true,
  panOnPlainDrag = false,
}: UseCanvasViewportArgs): UseCanvasViewportResult {
  const [viewport, setViewportState] = useState<ViewportState>({ x: 0, y: 0, zoom: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const hasFitRef = useRef(false);

  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const documentRef = useRef(document);
  documentRef.current = document;

  const panOnPlainDragRef = useRef(panOnPlainDrag);
  panOnPlainDragRef.current = panOnPlainDrag;

  const setViewport = useCallback(
    (updater: ViewportState | ((viewport: ViewportState) => ViewportState)) => {
      setViewportState((previous) =>
        typeof updater === "function"
          ? (updater as (viewport: ViewportState) => ViewportState)(previous)
          : updater,
      );
    },
    [],
  );

  const fit = useCallback(() => {
    const stage = stageRef.current;
    const screen = stageScreenSize(stage);
    if (!screen) return;
    setViewportState(fitDocument(documentRef.current, screen));
  }, [stageRef]);

  const zoomAroundCenter = useCallback(
    (nextZoom: number) => {
      const stage = stageRef.current;
      const screen = stageScreenSize(stage);
      const center = screen
        ? { x: screen.width / 2, y: screen.height / 2 }
        : { x: 0, y: 0 };
      setViewportState((previous) => zoomAtPoint(previous, center, nextZoom));
    },
    [stageRef],
  );

  const zoomIn = useCallback(() => {
    zoomAroundCenter(clampZoom(viewportRef.current.zoom * ZOOM_STEP));
  }, [zoomAroundCenter]);

  const zoomOut = useCallback(() => {
    zoomAroundCenter(clampZoom(viewportRef.current.zoom / ZOOM_STEP));
  }, [zoomAroundCenter]);

  const zoomTo100 = useCallback(() => {
    zoomAroundCenter(1);
  }, [zoomAroundCenter]);

  const controls = useMemo<CanvasViewportControls>(
    () => ({ fit, zoomIn, zoomOut, zoomTo100 }),
    [fit, zoomIn, zoomOut, zoomTo100],
  );

  const screenToWorld = useCallback((point: CanvasPoint): CanvasPoint => {
    return screenToWorldPure(viewportRef.current, point);
  }, []);

  // Fit-to-content on mount, once the stage is measurable.
  useEffect(() => {
    if (!enabled || hasFitRef.current) return;
    const stage = stageRef.current;
    const screen = stageScreenSize(stage);
    if (!screen) return;
    hasFitRef.current = true;
    setViewportState(fitDocument(documentRef.current, screen));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, stageRef.current]);

  // Wheel: plain pan, ctrl/meta = zoom toward cursor (trackpad pinch also
  // fires as a ctrlKey wheel event in browsers). Rapid wheel events (a fast
  // trackpad pinch or mouse wheel can fire many events within one frame) are
  // rAF-coalesced into a single viewport commit per frame (T1.1.2): each
  // event only accumulates into a pending "frame" of pan deltas + a
  // multiplicative zoom factor, and the coalescer commits (at most) once per
  // animation frame using the *latest* cursor screen point, so the point
  // under the cursor stays exactly fixed even though several wheel deltas
  // were merged. screenToWorld/zoomAtPoint (viewport.ts, pure) still do the
  // actual math — this effect only decides *when* to apply it.
  useEffect(() => {
    if (!enabled) return;
    const stage = stageRef.current;
    if (!stage) return;

    type PendingWheelFrame = {
      panDx: number;
      panDy: number;
      /** Multiplicative — successive zoom events within one frame compound (factorA * factorB). */
      zoomFactor: number;
      zoomPoint: CanvasPoint | null;
    };

    const emptyFrame = (): PendingWheelFrame => ({ panDx: 0, panDy: 0, zoomFactor: 1, zoomPoint: null });
    let pendingFrame = emptyFrame();

    // createFrameCoalescer's own "latest push wins" semantics would drop
    // earlier deltas within the same frame, so wheel accumulation happens in
    // `pendingFrame` (mutated in place, merging every event since the last
    // commit) and the coalescer is only used as the "run at most once per
    // rAF" trigger — it always re-pushes the same accumulator reference.
    const coalescer = createFrameCoalescer<PendingWheelFrame>((frame) => {
      pendingFrame = emptyFrame();
      setViewportState((previous) => {
        const panned =
          frame.panDx !== 0 || frame.panDy !== 0
            ? panBy(previous, frame.panDx, frame.panDy)
            : previous;
        if (frame.zoomFactor === 1 || !frame.zoomPoint) return panned;
        return zoomAtPoint(panned, frame.zoomPoint, clampZoom(panned.zoom * frame.zoomFactor));
      });
    });

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const point = stagePointFromClient(stage, event.clientX, event.clientY);
        const zoomFactor = Math.exp(-event.deltaY * 0.01);
        pendingFrame.zoomFactor *= zoomFactor;
        pendingFrame.zoomPoint = point;
      } else {
        pendingFrame.panDx += event.deltaX;
        pendingFrame.panDy += event.deltaY;
      }
      coalescer.push(pendingFrame);
    };

    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      stage.removeEventListener("wheel", onWheel);
      coalescer.cancel();
    };
  }, [enabled, stageRef]);

  // Space-held tracking + space/middle-mouse drag pan.
  useEffect(() => {
    if (!enabled) return;
    const stage = stageRef.current;
    if (!stage) return;

    let spaceHeld = false;
    let panState: { pointerId: number; lastX: number; lastY: number } | null = null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isEditableTarget(event.target)) return;
      spaceHeld = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      spaceHeld = false;
    };

    const onPointerDown = (event: PointerEvent) => {
      const shouldPan =
        event.button === 1 ||
        (event.button === 0 && (spaceHeld || panOnPlainDragRef.current));
      if (!shouldPan) return;
      event.preventDefault();
      // Claim the pointer before React's root-delegated handlers run so an
      // object drag can't start alongside the pan gesture.
      event.stopPropagation();
      stage.setPointerCapture?.(event.pointerId);
      panState = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
      setIsPanning(true);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!panState || panState.pointerId !== event.pointerId) return;
      const dx = panState.lastX - event.clientX;
      const dy = panState.lastY - event.clientY;
      panState.lastX = event.clientX;
      panState.lastY = event.clientY;
      setViewportState((previous) => panBy(previous, dx, dy));
    };

    const endPan = (event: PointerEvent) => {
      if (!panState || panState.pointerId !== event.pointerId) return;
      panState = null;
      setIsPanning(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    stage.addEventListener("pointerdown", onPointerDown);
    stage.addEventListener("pointermove", onPointerMove);
    stage.addEventListener("pointerup", endPan);
    stage.addEventListener("pointercancel", endPan);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      stage.removeEventListener("pointerdown", onPointerDown);
      stage.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerup", endPan);
      stage.removeEventListener("pointercancel", endPan);
    };
  }, [enabled, stageRef]);

  return { viewport, setViewport, isPanning, controls, screenToWorld };
}
