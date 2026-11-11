"use client";

import { CANVAS_BRAND_ICONS } from "./brand-icons.generated";

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
 * The core glyph roster for `type: "icon"` (and a section's header icon), in
 * roster order: the 30 operational-map glyphs, then the generic additions,
 * then the featured `brand-*` logos. Every core id has an object-preferences
 * registry row, so it is a name in place_shape's `type` enum and a row of the
 * visual vocabulary. The brand catalog (CANVAS_BRAND_ICONS, generated from
 * tools/dev-icons/manifest.json) holds every brand, these included: a catalog
 * id is a legal icon too, found with find_icon rather than listed.
 * objects/shapes/icon/icon-glyphs.ts holds the glyph registry (labels,
 * categories, per-pack geometry) beside the icon object def. Generic ids draw
 * an outline glyph (Nucleo or Tabler per the theme's icon pack); brand ids
 * draw a filled Simple Icons logo, or a generic glyph when Simple Icons has
 * none. Ids are persisted in documents: add freely, never rename or remove.
 */
export const CANVAS_ICON_GLYPHS = [
  // The operational-map corpus (Nucleo glyphs in the default pack).
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
  // Generic additions (Tabler outline glyphs in both packs).
  "database",
  "brain",
  "function",
  "container",
  "cloud",
  "network",
  "globe",
  "webhook",
  "branch",
  "pull-request",
  "merge",
  "commit",
  "cache",
  "schedule",
  "code-file",
  "folder",
  "users",
  "browser",
  "desktop",
  "laptop",
  "mobile",
  "plug",
  "dashboard",
  "chart",
  "gauge",
  "bell",
  "mail",
  "loop",
  "code",
  "bug",
  "cpu",
  "layers",
  "table",
  "link",
  "route",
  "filter",
  // Brand logos (Simple Icons, filled).
  "brand-postgres",
  "brand-sqlite",
  "brand-redis",
  "brand-mongodb",
  "brand-docker",
  "brand-kubernetes",
  "brand-github",
  "brand-git",
  "brand-anthropic",
  "brand-claude",
  "brand-huggingface",
  "brand-ollama",
  "brand-bun",
  "brand-node",
  "brand-typescript",
  "brand-python",
  "brand-go",
  "brand-rust",
  "brand-react",
  "brand-nextjs",
  "brand-vite",
  "brand-electron",
  "brand-vercel",
  "brand-cloudflare",
  "brand-supabase",
  "brand-terraform",
  "brand-kafka",
  "brand-linear",
  "brand-figma",
] as const;

/** A core roster id: one with a registry row, listed in place_shape's `type` enum. */
export type CanvasCoreIconGlyph = (typeof CANVAS_ICON_GLYPHS)[number];

/** A brand catalog id (tools/dev-icons/manifest.json). */
export type CanvasBrandIcon = (typeof CANVAS_BRAND_ICONS)[number];

/** Every icon id a document may hold: the core roster and the brand catalog. */
export type CanvasIconGlyph = CanvasCoreIconGlyph | CanvasBrandIcon;

/** Every icon id, in roster order: the core roster, then the catalog brands it does not hold, sorted. */
export const CANVAS_ICON_IDS: readonly CanvasIconGlyph[] = [
  ...CANVAS_ICON_GLYPHS,
  ...CANVAS_BRAND_ICONS.filter((id) => !(CANVAS_ICON_GLYPHS as readonly string[]).includes(id)),
];
