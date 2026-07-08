"use client";

import type { CanvasAction } from "../../../state/actions";
import { sectionFitGeometry } from "../../../state/geometry";
import type { CanvasGeometry, InteractiveCanvasDocument } from "../../../state/schema";

const SECTION_FIT_ANIMATION_MS = 180;

type CanvasDispatch = (action: CanvasAction) => void;

type ActiveSectionFitAnimation = {
  dispatch: CanvasDispatch;
  frameId: number | null;
  originalGeometry: CanvasGeometry;
  sectionId: string;
};

export type AnimateSectionFitArgs = {
  document?: InteractiveCanvasDocument;
  getDocument?: () => InteractiveCanvasDocument;
  dispatch: CanvasDispatch;
  sectionId: string;
  padding?: number;
  durationMs?: number;
};

const activeAnimations = new Map<string, ActiveSectionFitAnimation>();

function geometryEquals(a: CanvasGeometry, b: CanvasGeometry): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function hasSectionFitChange(
  geometry: CanvasGeometry,
  targetGeometry: CanvasGeometry | null,
): targetGeometry is CanvasGeometry {
  return targetGeometry !== null && !geometryEquals(geometry, targetGeometry);
}

function resolveSectionFit(
  document: InteractiveCanvasDocument,
  sectionId: string,
  padding?: number,
) {
  const section = document.objects.find((object) => object.id === sectionId);
  if (!section || section.type !== "section") return null;
  return {
    section,
    targetGeometry: sectionFitGeometry(document, sectionId, padding),
  };
}

export function isSectionFitted(document: InteractiveCanvasDocument, sectionId: string): boolean {
  const fit = resolveSectionFit(document, sectionId);
  return fit !== null && !hasSectionFitChange(fit.section.geometry, fit.targetGeometry);
}

function geometryIsFinite(geometry: CanvasGeometry): boolean {
  return (
    Number.isFinite(geometry.x) &&
    Number.isFinite(geometry.y) &&
    Number.isFinite(geometry.width) &&
    Number.isFinite(geometry.height)
  );
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function interpolateGeometry(
  from: CanvasGeometry,
  to: CanvasGeometry,
  progress: number,
): CanvasGeometry {
  const t = easeOutCubic(progress);
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    width: from.width + (to.width - from.width) * t,
    height: from.height + (to.height - from.height) * t,
  };
}

function prefersReducedMotion(): boolean {
  const matchMedia =
    (globalThis as { matchMedia?: Window["matchMedia"] }).matchMedia ??
    (typeof window !== "undefined" ? window.matchMedia : undefined);
  if (typeof matchMedia !== "function") return false;
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function frameApi():
  | {
      request: (callback: FrameRequestCallback) => number;
      cancel: (handle: number) => void;
    }
  | null {
  const request =
    (globalThis as { requestAnimationFrame?: Window["requestAnimationFrame"] })
      .requestAnimationFrame ??
    (typeof window !== "undefined" ? window.requestAnimationFrame : undefined);
  const cancel =
    (globalThis as { cancelAnimationFrame?: Window["cancelAnimationFrame"] })
      .cancelAnimationFrame ??
    (typeof window !== "undefined" ? window.cancelAnimationFrame : undefined);
  if (typeof request !== "function" || typeof cancel !== "function") return null;
  return {
    request: request.bind(globalThis),
    cancel: cancel.bind(globalThis),
  };
}

function dispatchSectionGeometryFrame(
  dispatch: CanvasDispatch,
  sectionId: string,
  geometry: CanvasGeometry,
): void {
  dispatch({
    type: "canvas.updateObjectGeometries",
    geometries: { [sectionId]: geometry },
    recordHistory: false,
    snap: false,
    summary: "Fit section",
  });
}

function dispatchFitCommit(
  dispatch: CanvasDispatch,
  sectionId: string,
  padding: number | undefined,
): void {
  if (padding === undefined) {
    dispatch({ type: "canvas.fitSectionToChildren", sectionId });
    return;
  }
  dispatch({ type: "canvas.fitSectionToChildren", sectionId, padding });
}

function cancelActiveSectionFit(sectionId: string): CanvasGeometry | null {
  const active = activeAnimations.get(sectionId);
  if (!active) return null;
  const api = frameApi();
  if (api && active.frameId !== null) api.cancel(active.frameId);
  activeAnimations.delete(sectionId);
  dispatchSectionGeometryFrame(active.dispatch, sectionId, active.originalGeometry);
  return active.originalGeometry;
}

/**
 * FigJam-style section fit: live frames are non-history geometry updates, while
 * the final fit action remains the single undoable commit.
 */
export function animateSectionFitToChildren({
  document,
  getDocument,
  dispatch,
  sectionId,
  padding,
  durationMs = SECTION_FIT_ANIMATION_MS,
}: AnimateSectionFitArgs): boolean {
  const sourceDocument = getDocument?.() ?? document;
  if (!sourceDocument) return false;

  const cancelledOriginalGeometry = cancelActiveSectionFit(sectionId);
  const fit = resolveSectionFit(sourceDocument, sectionId, padding);
  if (!fit) return false;

  const originalGeometry = cancelledOriginalGeometry ?? fit.section.geometry;
  if (!hasSectionFitChange(originalGeometry, fit.targetGeometry)) return false;
  const targetGeometry = fit.targetGeometry;

  const api = frameApi();
  if (
    !api ||
    durationMs <= 0 ||
    !geometryIsFinite(originalGeometry) ||
    !geometryIsFinite(targetGeometry) ||
    prefersReducedMotion()
  ) {
    dispatchFitCommit(dispatch, sectionId, padding);
    return true;
  }

  const animation: ActiveSectionFitAnimation = {
    dispatch,
    frameId: null,
    originalGeometry,
    sectionId,
  };
  activeAnimations.set(sectionId, animation);

  let startTime: number | null = null;
  const step: FrameRequestCallback = (timestamp) => {
    if (activeAnimations.get(sectionId) !== animation) return;
    if (startTime === null) startTime = timestamp;
    const progress = Math.min(1, Math.max(0, (timestamp - startTime) / durationMs));

    if (progress < 1) {
      dispatchSectionGeometryFrame(
        dispatch,
        sectionId,
        interpolateGeometry(originalGeometry, targetGeometry, progress),
      );
      animation.frameId = api.request(step);
      return;
    }

    activeAnimations.delete(sectionId);
    dispatchSectionGeometryFrame(dispatch, sectionId, originalGeometry);
    dispatchFitCommit(dispatch, sectionId, padding);
  };

  try {
    animation.frameId = api.request(step);
  } catch {
    activeAnimations.delete(sectionId);
    dispatchFitCommit(dispatch, sectionId, padding);
  }
  return true;
}
