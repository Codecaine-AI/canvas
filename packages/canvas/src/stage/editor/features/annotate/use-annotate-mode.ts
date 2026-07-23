"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { CanvasAction } from "../../../../state/actions";
import type { CanvasPoint } from "../../../../state/geometry";
import type { InteractiveCanvasDocument } from "../../../../state/schema";
import { resolveHit } from "../../pipeline/use-interaction-pipeline";
import { stageScreenPointFromClient } from "../../pipeline/stage-dom";

const EMPTY_CANVAS_HINT = "Click an object to pin a note";
const HINT_DURATION_MS = 1_600;

export type AnnotationPopupState = {
  objectId: string;
  /** Stage-relative screen coordinates, suitable for the screen-overlay slot. */
  anchor: CanvasPoint;
};

export type AnnotationHintState = {
  anchor: CanvasPoint;
  message: typeof EMPTY_CANVAS_HINT;
};

export interface UseAnnotateModeArgs {
  document: InteractiveCanvasDocument;
  enabled: boolean;
  dispatch: (action: CanvasAction) => void;
  screenToWorld: (point: CanvasPoint) => CanvasPoint;
  zoom?: number;
}

export interface AnnotateModeApi {
  popup: AnnotationPopupState | null;
  hint: AnnotationHintState | null;
  hoveredObjectId: string | null;
  isPopupOpen: () => boolean;
  handleStagePointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  handleStagePointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  handleStagePointerLeave: () => void;
  saveAnnotation: (body: string) => void;
  cancelPopup: () => void;
}

/**
 * Interaction state for the annotation-authoring tool. Hit resolution goes
 * through the editor pipeline's resolveHit helper, so title chips, true-shape
 * outlines, and paint ordering stay identical to selection and context-menu
 * targeting.
 */
export function useAnnotateMode({
  document,
  enabled,
  dispatch,
  screenToWorld,
  zoom = 1,
}: UseAnnotateModeArgs): AnnotateModeApi {
  const [popup, setPopup] = useState<AnnotationPopupState | null>(null);
  const [hint, setHint] = useState<AnnotationHintState | null>(null);
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null);
  const popupRef = useRef(popup);
  popupRef.current = popup;
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHint = useCallback(() => {
    if (hintTimerRef.current !== null) {
      clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
    setHint(null);
  }, []);

  const showEmptyCanvasHint = useCallback((anchor: CanvasPoint) => {
    if (hintTimerRef.current !== null) clearTimeout(hintTimerRef.current);
    setHint({ anchor, message: EMPTY_CANVAS_HINT });
    hintTimerRef.current = setTimeout(() => {
      hintTimerRef.current = null;
      setHint(null);
    }, HINT_DURATION_MS);
  }, []);

  const cancelPopup = useCallback(() => setPopup(null), []);
  const isPopupOpen = useCallback(() => popupRef.current !== null, []);

  const saveAnnotation = useCallback(
    (value: string) => {
      const body = value.trim();
      const currentPopup = popupRef.current;
      if (!currentPopup || !body) return;
      dispatch({
        type: "canvas.addAnnotation",
        target: { kind: "object", objectId: currentPopup.objectId },
        body,
        intent: "agent-request",
      });
      // canvas.addAnnotation selects the new annotation by default. Annotate
      // authoring keeps the clicked object as the visible/panel target.
      dispatch({
        type: "canvas.select",
        selection: { kind: "objects", objectIds: [currentPopup.objectId] },
      });
      setPopup(null);
    },
    [dispatch],
  );

  const handleStagePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0) return;
      const stage = event.currentTarget;
      const target = event.target instanceof Element ? event.target : stage;
      // Interactive annotation trim lives inside CanvasStage's overlay
      // slots. Its own handlers stop propagation, and this guard also keeps
      // synthetic/test events from opening a second popup behind the trim.
      if (target.closest("[data-annotation-popup], [data-annotation-pin]")) return;

      event.preventDefault();
      event.stopPropagation();
      const anchor = stageScreenPointFromClient(event.nativeEvent, stage);
      const world = screenToWorld(anchor);
      const hit = resolveHit(target, document, world, { zoom });
      setHoveredObjectId(null);
      if (hit.kind !== "object") {
        dispatch({ type: "canvas.select", selection: { kind: "none" } });
        setPopup(null);
        showEmptyCanvasHint(anchor);
        return;
      }

      clearHint();
      dispatch({
        type: "canvas.select",
        selection: { kind: "objects", objectIds: [hit.objectId] },
      });
      setPopup({ objectId: hit.objectId, anchor });
    },
    [clearHint, dispatch, document, enabled, screenToWorld, showEmptyCanvasHint, zoom],
  );

  const handleStagePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return;
      const stage = event.currentTarget;
      const target = event.target instanceof Element ? event.target : stage;
      if (target.closest("[data-annotation-popup], [data-annotation-pin]")) return;
      const screen = stageScreenPointFromClient(event.nativeEvent, stage);
      const world = screenToWorld(screen);
      const hit = resolveHit(target, document, world, { zoom });
      setHoveredObjectId(hit.kind === "object" ? hit.objectId : null);
    },
    [document, enabled, screenToWorld, zoom],
  );

  const handleStagePointerLeave = useCallback(() => setHoveredObjectId(null), []);

  useEffect(() => {
    if (enabled) return;
    setPopup(null);
    setHoveredObjectId(null);
    clearHint();
  }, [clearHint, enabled]);

  useEffect(() => {
    const targetId = popup?.objectId;
    if (!targetId) return;
    if (!document.objects.some((object) => object.id === targetId)) setPopup(null);
  }, [document.objects, popup?.objectId]);

  useEffect(
    () => () => {
      if (hintTimerRef.current !== null) clearTimeout(hintTimerRef.current);
    },
    [],
  );

  return {
    popup,
    hint,
    hoveredObjectId,
    isPopupOpen,
    handleStagePointerDown,
    handleStagePointerMove,
    handleStagePointerLeave,
    saveAnnotation,
    cancelPopup,
  };
}
