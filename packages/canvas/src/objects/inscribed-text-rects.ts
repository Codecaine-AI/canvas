"use client";

import type {
  CanvasObjectStyle,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
} from "../state/schema";
import type { LocalRect } from "./text-slots";

export type InscribedTextRectResolver = (object: InteractiveCanvasObject) => LocalRect;

function centeredRect(object: InteractiveCanvasObject, width: number, height: number): LocalRect {
  const rectWidth = Math.max(0, width);
  const rectHeight = Math.max(0, height);
  return {
    x: (object.geometry.width - rectWidth) / 2,
    y: (object.geometry.height - rectHeight) / 2,
    width: rectWidth,
    height: rectHeight,
  };
}

function ellipseTextRect(object: InteractiveCanvasObject): LocalRect {
  return centeredRect(object, object.geometry.width * 0.68, object.geometry.height * 0.68);
}

function diamondTextRect(object: InteractiveCanvasObject): LocalRect {
  return centeredRect(
    object,
    object.geometry.width * 0.5 - 12,
    object.geometry.height * 0.5 - 12,
  );
}

function triangleTextRect(object: InteractiveCanvasObject): LocalRect {
  const { width, height } = object.geometry;
  const y1 = object.direction === "down" ? height * 0.1 : height * 0.52;
  const y2 = object.direction === "down" ? height * 0.48 : height * 0.9;
  return {
    x: width * 0.25,
    y: y1,
    width: width * 0.5,
    height: Math.max(0, y2 - y1),
  };
}

function rectFromRanges(x1: number, x2: number, y1: number, y2: number): LocalRect {
  return {
    x: x1,
    y: y1,
    width: Math.max(0, x2 - x1),
    height: Math.max(0, y2 - y1),
  };
}

const INSCRIBED_TEXT_RECTS_BY_TYPE: Partial<
  Record<InteractiveCanvasObjectType, InscribedTextRectResolver>
> = {
  decision: diamondTextRect,
  ellipse: ellipseTextRect,
  triangle: triangleTextRect,
  "predefined-process": (object) => {
    const { width, height } = object.geometry;
    const xInset = width * 0.047 + 10;
    return rectFromRanges(xInset, width - xInset, 12, height - 12);
  },
  octagon: (object) => {
    const { width, height } = object.geometry;
    return rectFromRanges(width * 0.19, width * 0.81, height * 0.19, height * 0.81);
  },
};

const INSCRIBED_TEXT_RECTS_BY_STYLE_SHAPE: Partial<
  Record<NonNullable<CanvasObjectStyle["shape"]>, InscribedTextRectResolver>
> = {
  diamond: diamondTextRect,
  ellipse: ellipseTextRect,
  triangle: triangleTextRect,
};

/**
 * Closed-form, object-local text rect for shapes whose visual silhouette needs
 * a smaller safe center band. Null means callers should use the legacy center
 * inset exactly.
 */
export function inscribedTextRect(object: InteractiveCanvasObject): LocalRect | null {
  const styleShape = object.style?.shape;
  const styleResolver =
    styleShape === undefined ? undefined : INSCRIBED_TEXT_RECTS_BY_STYLE_SHAPE[styleShape];
  if (styleResolver) return styleResolver(object);

  return INSCRIBED_TEXT_RECTS_BY_TYPE[object.type]?.(object) ?? null;
}
