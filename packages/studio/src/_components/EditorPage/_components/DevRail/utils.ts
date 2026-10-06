import type {
  CanvasGeometry,
  CanvasSelection,
  InteractiveCanvasAnnotation,
  InteractiveCanvasDocument,
} from "@codecaine-ai/canvas";
import type { Rect } from "./types";

export function toRect(geometry: CanvasGeometry): Rect {
  return {
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
  };
}

export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

export function selectedObjectIds(selection: CanvasSelection): string[] {
  return selection.kind === "objects" ? selection.objectIds : [];
}

/**
 * World rect an annotation occupies, for the "inside the selection bbox"
 * check: object targets use the object's geometry, region targets their
 * region, connection targets the union of their endpoint objects' bounds.
 */
export function annotationRect(
  annotation: InteractiveCanvasAnnotation,
  document: InteractiveCanvasDocument,
): Rect | null {
  const target = annotation.target;
  if (target.kind === "region") return toRect(target.region);
  if (target.kind === "object") {
    const object = document.objects.find((candidate) => candidate.id === target.objectId);
    return object ? toRect(object.geometry) : null;
  }
  const connection = document.connections.find(
    (candidate) => candidate.id === target.connectionId,
  );
  if (!connection) return null;
  const endpointRects: Rect[] = [];
  for (const endpoint of [connection.from, connection.to]) {
    const object = document.objects.find((candidate) => candidate.id === endpoint.objectId);
    if (object) endpointRects.push(toRect(object.geometry));
  }
  return unionRects(endpointRects);
}

export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
