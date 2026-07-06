"use client";

import {
  boundsForGeometries,
  documentBounds,
  type CanvasBounds,
  type CanvasPoint,
} from "../state/geometry";
import type { InteractiveCanvasDocument } from "../state/schema";

/**
 * Viewport coordinate convention:
 * `(x, y)` is the world point shown at screen origin `(0, 0)`.
 *
 * screenPoint = (worldPoint - { x, y }) * zoom
 * worldPoint = screenPoint / zoom + { x, y }
 */
export type ViewportState = {
  x: number;
  y: number;
  zoom: number;
};

export type ScreenSize = {
  width: number;
  height: number;
};

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

const EPSILON = 0.000001;

export function worldToScreen(viewport: ViewportState, point: CanvasPoint): CanvasPoint {
  return {
    x: (point.x - viewport.x) * viewport.zoom,
    y: (point.y - viewport.y) * viewport.zoom,
  };
}

export function screenToWorld(viewport: ViewportState, point: CanvasPoint): CanvasPoint {
  return {
    x: point.x / viewport.zoom + viewport.x,
    y: point.y / viewport.zoom + viewport.y,
  };
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function zoomAtPoint(
  viewport: ViewportState,
  screenPoint: CanvasPoint,
  nextZoom: number,
): ViewportState {
  const zoom = clampZoom(nextZoom);
  const worldPoint = screenToWorld(viewport, screenPoint);
  return {
    x: worldPoint.x - screenPoint.x / zoom,
    y: worldPoint.y - screenPoint.y / zoom,
    zoom,
  };
}

export function panBy(
  viewport: ViewportState,
  screenDx: number,
  screenDy: number,
): ViewportState {
  return {
    ...viewport,
    x: viewport.x + screenDx / viewport.zoom,
    y: viewport.y + screenDy / viewport.zoom,
  };
}

export function fitBounds(
  bounds: CanvasBounds,
  screen: ScreenSize,
  padding = 48,
): ViewportState {
  const paddedWidth = bounds.width + padding * 2;
  const paddedHeight = bounds.height + padding * 2;
  const canScale =
    screen.width > EPSILON &&
    screen.height > EPSILON &&
    paddedWidth > EPSILON &&
    paddedHeight > EPSILON;
  const zoom = canScale
    ? clampZoom(Math.min(screen.width / paddedWidth, screen.height / paddedHeight, 1))
    : 1;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  return {
    x: centerX - screen.width / zoom / 2,
    y: centerY - screen.height / zoom / 2,
    zoom,
  };
}

export function fitDocument(
  document: InteractiveCanvasDocument,
  screen: ScreenSize,
  padding = 48,
): ViewportState {
  // Avoid double padding: documentBounds(document, 0) gives raw document/object extent.
  return fitBounds(documentBounds(document, 0), screen, padding);
}

export function containerViewBounds(
  document: InteractiveCanvasDocument,
  containerId: string,
  padding = 32,
): CanvasBounds | null {
  const container = document.objects.find(
    (object) => object.id === containerId && object.type === "container",
  );
  if (!container) return null;

  const objectById = new Map(document.objects.map((object) => [object.id, object]));
  const isDescendantOfContainer = (objectId: string): boolean => {
    let parentId = objectById.get(objectId)?.parentId ?? null;
    const visited = new Set<string>();

    while (parentId) {
      if (parentId === containerId) return true;
      if (visited.has(parentId)) return false;
      visited.add(parentId);
      parentId = objectById.get(parentId)?.parentId ?? null;
    }

    return false;
  };
  const geometries = document.objects
    .filter((object) => object.id === containerId || isDescendantOfContainer(object.id))
    .map((object) => object.geometry);

  return boundsForGeometries(geometries, padding);
}
