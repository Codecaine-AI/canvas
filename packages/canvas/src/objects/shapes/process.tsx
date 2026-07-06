"use client";

import { shapeObjectDef } from "./base";
import type { ShapeDef } from "./shape-def";

/**
 * Process — the plain rounded-rect default shape. Its entire outline is the
 * base `interactive-canvas-object` chrome (2px border, 8px radius), so it
 * declares no extra className, no silhouette, and no CSS of its own.
 *
 * Registered under the effective render shape "rounded-rect": any object
 * without an explicit `style.shape` (except standalone text) rendered
 * through this exact path before the registry, and keeps doing so.
 */
export const processShapeDef: ShapeDef = {
  type: "process",
  shape: "rounded-rect",
  outline: {},
  text: { kind: "label" },
  defaultSize: { width: 184, height: 96 },
  defaultTone: "process",
  catalog: { label: "Process", keywords: ["process", "step", "rectangle", "rounded"] },
};

export const processDef = shapeObjectDef(processShapeDef);
