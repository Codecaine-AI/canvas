"use client";

import type {
  CanvasObjectStyle,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
} from "../state/schema";
import type { LocalRect } from "./text-slots";
import { CENTER_TEXT_INSET_PX } from "./text-slot-constants";
import {
  OFF_PAGE_CONNECTOR_GEOMETRY,
  MANUAL_INPUT_GEOMETRY,
  PARALLELOGRAM_SKEW_RATIO,
  TRAPEZOID_TOP_INSET_RATIO,
} from "./shape-geometry-constants";

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

function pillTextRect(object: InteractiveCanvasObject): LocalRect {
  const { width, height } = object.geometry;
  const xInset = Math.max(CENTER_TEXT_INSET_PX.x, height / 2);
  return {
    x: xInset,
    y: CENTER_TEXT_INSET_PX.y,
    width: Math.max(0, width - xInset * 2),
    height: Math.max(0, height - CENTER_TEXT_INSET_PX.y * 2),
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
  pill: pillTextRect,
  "predefined-process": (object) => {
    const { width, height } = object.geometry;
    const xInset = width * 0.047 + 10;
    return rectFromRanges(xInset, width - xInset, 12, height - 12);
  },
  star: (object) => {
    const { width, height } = object.geometry;
    return rectFromRanges(width * 0.27, width * 0.73, height * 0.42, height * 0.72);
  },
  database: (object) => {
    const { width, height } = object.geometry;
    return rectFromRanges(width * 0.06, width * 0.94, height * 0.34, height * 0.8);
  },
  document: (object) => {
    const { width, height } = object.geometry;
    return rectFromRanges(width * 0.09, width * 0.91, height * 0.06, height * 0.78);
  },
  "document-stack": (object) => {
    const { width, height } = object.geometry;
    return rectFromRanges(width * 0.1, width * 0.96, height * 0.1, height * 0.78);
  },
  folder: (object) => {
    const { width, height } = object.geometry;
    return rectFromRanges(width * 0.06, width * 0.94, height * 0.3, height * 0.92);
  },
  "cylinder-horizontal": (object) => {
    const { width, height } = object.geometry;
    return rectFromRanges(width * 0.2, width * 0.8, height * 0.12, height * 0.88);
  },
  "page-corner": (object) => {
    const { width, height } = object.geometry;
    return rectFromRanges(width * 0.05, width * 0.94, height * 0.26, height * 0.94);
  },
  "internal-storage": (object) => {
    const { width, height } = object.geometry;
    return rectFromRanges(width * 0.15 + 8, width * 0.94, height * 0.15 + 8, height * 0.92);
  },
  parallelogram: (object) => {
    const { width, height } = object.geometry;
    return rectFromRanges(
      width * PARALLELOGRAM_SKEW_RATIO + 8,
      width * (1 - PARALLELOGRAM_SKEW_RATIO) - 8,
      height * 0.06,
      height * 0.94,
    );
  },
  trapezoid: (object) => {
    const { width, height } = object.geometry;
    return rectFromRanges(
      width * TRAPEZOID_TOP_INSET_RATIO + 8,
      width * (1 - TRAPEZOID_TOP_INSET_RATIO) - 8,
      height * 0.14,
      height * 0.92,
    );
  },
  hexagon: (object) => {
    const { width, height } = object.geometry;
    return rectFromRanges(width * 0.22 + 8, width * 0.78 - 8, height * 0.1, height * 0.9);
  },
  "off-page-connector": (object) => {
    const { width, height } = object.geometry;
    return rectFromRanges(
      width * 0.08,
      width * 0.92,
      height * 0.06,
      height * (OFF_PAGE_CONNECTOR_GEOMETRY.shoulderRatio - 0.02),
    );
  },
  "manual-input": (object) => {
    const { width, height } = object.geometry;
    return rectFromRanges(
      width * 0.08,
      width * 0.92,
      height * MANUAL_INPUT_GEOMETRY.dropRatio + 8,
      height * 0.92,
    );
  },
  "annotation-marker": (object) => {
    const { width, height } = object.geometry;
    return rectFromRanges(width * 0.15, width * 0.85, height * 0.15, height * 0.85);
  },
  pentagon: (object) => {
    const { width, height } = object.geometry;
    return rectFromRanges(width * 0.22, width * 0.78, height * 0.24, height * 0.88);
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
  pill: pillTextRect,
};

/**
 * Closed-form, object-local text rect for shapes whose visual silhouette needs
 * a smaller safe center band. Null means callers should use the legacy center
 * inset exactly.
 */
export function inscribedTextRect(object: InteractiveCanvasObject): LocalRect | null {
  if (object.type === "pill") return pillTextRect(object);

  const styleShape = object.style?.shape;
  const styleResolver =
    styleShape === undefined ? undefined : INSCRIBED_TEXT_RECTS_BY_STYLE_SHAPE[styleShape];
  if (styleResolver) return styleResolver(object);

  return INSCRIBED_TEXT_RECTS_BY_TYPE[object.type]?.(object) ?? null;
}
