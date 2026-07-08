"use client";

export type InteractiveCanvasObjectType =
  // W6 — "rectangle" replaces the legacy "container" type: a dumb rounded-rect
  // shape with no children. Sections are the only grouping object now.
  | "rectangle"
  | "process"
  | "decision"
  | "sticky"
  | "annotation-marker"
  // D16 — expanded vocabulary for the reference diagrams (checkpoint 5):
  | "document"
  | "database"
  // W2 — FigJam sections + V2 Flow shape vocabulary:
  | "section"
  | "pill"
  | "arrow-shape"
  | "predefined-process"
  | "code-block"
  // W5 — FigJam parity shape set (Wave A): 19 native Basic/Flowchart primitives
  // plus the icon-glyph family, per docs/10-system-design/20-figjam-parity's
  // "Missing shape specs" and the Wave A implementation brief.
  | "ellipse"
  | "triangle"
  | "parallelogram"
  | "pentagon"
  | "octagon"
  | "star"
  | "plus"
  | "chevron"
  | "folder"
  | "document-stack"
  | "off-page-connector"
  | "trapezoid"
  | "manual-input"
  | "hexagon"
  | "internal-storage"
  | "or-junction"
  | "summing-junction"
  | "cylinder-horizontal"
  | "page-corner"
  | "icon";

// (The legacy color enums — InteractiveCanvasTone, CanvasPaletteToken,
// CanvasSectionTint — died in the P1 color cutover, OBJECT-DEF-OVERHAUL.md
// D1/D10: color is now the single `color?: CanvasColor` pick, see
// state/schema/colors.ts.)

/**
 * Directional field shared by every direction-aware shape (W5). Individual
 * types only accept a subset of these 4 values — see `direction` on
 * `InteractiveCanvasObject` and the per-type soft-default validation in
 * `validateInteractiveCanvasDocument` (arrow-shape/parallelogram/chevron:
 * "left" | "right", default "right"; triangle: "up" | "down", default "up").
 */
export type CanvasShapeDirection = "left" | "right" | "up" | "down";

/**
 * Chevron/arrow-shape pointing direction (W2). Kept as a back-compat alias of
 * the generalized `CanvasShapeDirection` (W5) for any external reference to
 * this name; arrow-shape's own accepted values are still just left|right.
 */
export type CanvasArrowShapeDirection = CanvasShapeDirection;

/**
 * Icon glyph selector for `type: "icon"` (W5) — the Advanced-tier FigJam
 * component family, 26 stroke-outline glyphs rendered in a 24x24 viewBox
 * with the label below. Exact ids per the Wave A
 * implementation brief; Wave B2 owns the actual glyph-path registry.
 */
export type CanvasIconGlyph =
  | "activity"
  | "archive"
  | "key"
  | "chat"
  | "cloud"
  | "cpu"
  | "database"
  | "display"
  | "mail"
  | "file"
  | "code"
  | "bolt"
  | "pin"
  | "phone"
  | "package"
  | "coin"
  | "shield"
  | "send"
  | "server"
  | "cube"
  | "gear"
  | "drive"
  | "terminal"
  | "person"
  | "wallet"
  | "globe";
