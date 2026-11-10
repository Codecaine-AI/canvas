/**
 * Fixed-aspect shapes: the object types whose silhouette keeps its natural
 * width / height ratio instead of stretching to the object box. Pure, with
 * type imports only (geometry.ts and inscribed-text-rects.ts both read it, and
 * text-slots.ts sits between them).
 */
import type { InteractiveCanvasObject, InteractiveCanvasObjectType } from "../state/schema";

type Rect = { x: number; y: number; width: number; height: number };

/**
 * Object types drawn at a fixed natural aspect ratio (width / height): the
 * octagon is a stop sign, and a stretched stop sign reads as a mistake.
 * The silhouette draws at that ratio, centered in whatever box the object
 * has (naturalAspectRect); autosize and resize keep the box at the ratio.
 * Ellipses, triangles and every rect-family shape stretch on purpose.
 */
export const NATURAL_ASPECT_BY_TYPE: Partial<Record<InteractiveCanvasObjectType, number>> = {
  octagon: 1,
};

/** The fixed width / height ratio `object` draws at, or null when it stretches to its box. */
export function naturalAspectOf(object: Pick<InteractiveCanvasObject, "type">): number | null {
  return NATURAL_ASPECT_BY_TYPE[object.type] ?? null;
}

/** The largest `aspect` (width / height) rect inside `bounds`, centered both ways. */
export function naturalAspectRect(bounds: Rect, aspect: number): Rect {
  const width = Math.min(bounds.width, bounds.height * aspect);
  const height = width / aspect;
  return {
    x: bounds.x + (bounds.width - width) / 2,
    y: bounds.y + (bounds.height - height) / 2,
    width,
    height,
  };
}

/**
 * `size` grown to `aspect` on its longer side: the box a fixed-aspect shape
 * takes when a gesture sizes it, so nothing the gesture asked for shrinks.
 */
export function grownToAspect(size: { width: number; height: number }, aspect: number): { width: number; height: number } {
  return size.width / size.height >= aspect
    ? { width: size.width, height: size.width / aspect }
    : { width: size.height * aspect, height: size.height };
}
