"use client";

export type InteractiveCanvasObjectType =
  | "container"
  | "process"
  | "decision"
  | "text"
  | "sticky"
  | "source-node"
  | "annotation-marker"
  // D16 — expanded vocabulary for the reference diagrams (checkpoint 5):
  | "document"
  | "person"
  | "database"
  | "chat"
  // W2 — FigJam sections + V2 Flow shape vocabulary:
  | "section"
  | "pill"
  | "arrow-shape"
  | "predefined-process"
  | "code-block"
  | "chip-icon"
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

export type InteractiveCanvasTone =
  | "neutral"
  | "input"
  | "process"
  | "decision"
  | "memory"
  | "agent"
  | "warning"
  | "annotation";

/**
 * Semantic color-as-meaning presets (D16, design doc §4.4): when present on an
 * object's style, this wins over `tone` for color resolution (see
 * theme.ts#resolveObjectColors) — process=blue (actions), input=green
 * (user/input/confirmed), hot=orange/red (generation/errors/loops),
 * memory=purple (documents/intents/memory), note=yellow (notes/decisions/cautions).
 */
export type CanvasPaletteToken = "process" | "input" | "hot" | "memory" | "note";

/**
 * FigJam section tint family (W2) — keys mirror figjam-tokens.ts's
 * SECTION_FAMILIES record exactly (that file is the source of truth for the
 * actual color values). Note: the W2 brief's prose used "cream" for the warm
 * neutral family; figjam-style-tokens.json's sampled key for that same tint is
 * "orange" — we use "orange" here to stay in lockstep with figjam-tokens.ts
 * rather than introduce a duplicate/aliased key.
 */
export type CanvasSectionTint =
  | "green"
  | "purple"
  | "orange"
  | "yellow"
  | "gray"
  | "white"
  | "pink"
  | "red"
  | "blue"
  | "teal";

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
 * with the label below (chip-icon precedent). Exact ids per the Wave A
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
