"use client";

import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

/**
 * Rectangle — the plain-rect successor to the removed "container" type. A
 * dumb shape with the standard rounded-rect chrome (label + body spans, edge
 * ports) and NO children/containment behavior: solid hit-test, no drag
 * capture. Sections are the only grouping object. Keeps the old container's
 * large default footprint.
 *
 * Render dispatch: like process, its effective render shape is "rounded-rect",
 * so rectangle objects flow through the render-shape table's rounded-rect
 * entry (identical view); this def is registered for BEHAVIOR + defaults.
 */
export const rectangleShapeDef: ShapeDef = {
  type: "rectangle",
  shape: "rounded-rect",
  silhouette: {},
  catalog: { label: "Rectangle", keywords: ["rectangle", "square", "box", "rect"] },
};

export const rectangleDef = shapeObjectDef(rectangleShapeDef);
