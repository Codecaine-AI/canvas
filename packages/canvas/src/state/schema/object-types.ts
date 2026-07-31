"use client";

export type InteractiveCanvasObjectType =
  // W6 — "rectangle" replaces the legacy "container" type: a dumb rounded-rect
  // shape with no children. Sections are the only grouping object now.
  | "rectangle"
  | "process"
  | "decision"
  | "sticky"
  // W2 — FigJam sections + V2 Flow shape vocabulary:
  | "section"
  | "arrow-shape"
  | "predefined-process"
  // The universal shape core (operational-maps surface trim): eight placeable
  // marks readable without a legend, plus section/sticky/icon. Icons carry the
  // semantic vocabulary (objects/shapes/icon/icon-glyphs.ts roster).
  | "ellipse"
  | "triangle"
  | "octagon"
  | "icon";

// (The legacy color enums — InteractiveCanvasTone, CanvasPaletteToken,
// CanvasSectionTint — died in the P1 color cutover, OBJECT-DEF-OVERHAUL.md
// D1/D10: color is now the single `color?: CanvasColor` pick, see
// state/schema/colors.ts.)

/**
 * Directional field shared by every direction-aware shape (W5). Individual
 * types only accept a subset of these 4 values — see `direction` on
 * `InteractiveCanvasObject` and the per-type soft-default validation in
 * `validateInteractiveCanvasDocument` (arrow-shape: "left" | "right",
 * default "right"; triangle: "up" | "down", default "up").
 */
export type CanvasShapeDirection = "left" | "right" | "up" | "down";

/**
 * Arrow-shape pointing direction (W2). Kept as a back-compat alias of the
 * generalized `CanvasShapeDirection` (W5) for any external reference to
 * this name; arrow-shape's own accepted values are still just left|right.
 */
export type CanvasArrowShapeDirection = CanvasShapeDirection;

/**
 * Icon glyph selector for `type: "icon"` — the operational-map glyph corpus,
 * 30 stroke-outline glyphs rendered with the label below. Ids mirror
 * ICON_GLYPH_IDS in objects/shapes/icon/icon-glyphs.ts (roster order);
 * the glyph-path registry lives beside the icon object def.
 */
export const CANVAS_ICON_GLYPHS = [
  "agent",
  "model",
  "human",
  "orchestrator",
  "memory",
  "knowledge",
  "queue",
  "server",
  "terminal",
  "config",
  "api",
  "message",
  "send",
  "event",
  "guardrail",
  "monitor",
  "judge",
  "document",
  "documents",
  "activity",
  "archive",
  "key",
  "coin",
  "package",
  "voice",
  "search",
  "tool",
  "wait",
  "lock",
  "eval",
] as const;

export type CanvasIconGlyph = (typeof CANVAS_ICON_GLYPHS)[number];
