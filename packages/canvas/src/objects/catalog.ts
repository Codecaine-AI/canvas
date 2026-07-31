/**
 * catalog.ts — the Shapes-panel ARRANGEMENT of defs (P4, O7).
 *
 * Since the P4 catalog unification the def is the single source of per-shape
 * picker identity: every entry's `label` and `keywords` derive from the
 * registered def's `catalog` metadata (ObjectCatalogMeta — declared on the
 * ShapeDef, stamped onto the ObjectDef by shapeObjectDef). What legitimately
 * stays HERE is arrangement only: the category grouping (Icons / Shapes),
 * entry ordering, and the per-entry placement VARIANTS a single def fans out
 * into — direction variants ("Triangle up"/"Triangle down", left/right
 * arrows) and the 30 icon-glyph entries (one `type: "icon"` def × the glyph
 * registry). Variant entries carry a label override because their display
 * string is a property of the variant, not the def; everything else reads
 * the def's label verbatim.
 *
 * Entries are pure data (no JSX): the preview SVGs live in
 * stage/editor/components/shape-previews.tsx (interface JSX belongs to the editor),
 * mapped by entry id / glyph id.
 *
 * The picker's default face is the icon grid — icons carry the semantic
 * vocabulary (the operational-map glyph corpus, registry order) — and the
 * eight universal shapes render as a compact utility group. Every entry maps
 * to a live `InteractiveCanvasObjectType`, so there is no "coming soon"
 * disabled state.
 */

import type { CanvasIconGlyph, CanvasShapeDirection, InteractiveCanvasObjectType } from "../state/schema";
import { objectDefForType } from "./object-def";
import { ICON_GLYPHS, ICON_GLYPH_IDS, type IconGlyphId } from "./shapes/icon/icon-glyphs";

export type ShapeCatalogEntry = {
  id: string;
  /** Display label — the def's catalog label unless the entry is a direction variant with its own phrasing. */
  label: string;
  objectType: InteractiveCanvasObjectType;
  /** Direction/orientation field for direction-aware shapes (triangle up|down; arrow-shape left|right). Passed straight through to the inserted object's `direction`. */
  direction?: CanvasShapeDirection;
  /** REQUIRED when objectType === "icon" — selects which of the 30 roster glyphs to insert. */
  icon?: CanvasIconGlyph;
  /** Extra search terms beyond the label — the def's catalog keywords. */
  keywords?: readonly string[];
};

export type ShapeCatalogCategory = {
  id: string;
  label: string;
  entries: ShapeCatalogEntry[];
};

// ---------------------------------------------------------------------------
// Entry builders
// ---------------------------------------------------------------------------

/**
 * One picker entry for `objectType`, identity derived from its registered
 * def's catalog metadata. `options.label` overrides ONLY for direction/
 * arrangement variants whose display string isn't the def's own (e.g.
 * "Triangle up", "Left arrow", FigJam's "Square"/"Rounded rectangle"
 * picker phrasings).
 */
function entry(
  id: string,
  objectType: InteractiveCanvasObjectType,
  options?: { label?: string; direction?: CanvasShapeDirection },
): ShapeCatalogEntry {
  const meta = objectDefForType(objectType)?.catalog;
  if (!meta) {
    throw new Error(`shape catalog: type "${objectType}" has no def catalog metadata`);
  }
  return {
    id,
    objectType,
    label: options?.label ?? meta.label,
    keywords: meta.keywords,
    ...(options?.direction ? { direction: options.direction } : null),
  };
}

/**
 * The icon face: all 30 glyphs in registry (roster) order, each an
 * insertable `type: "icon"` entry. Labels come from the glyph registry's own
 * display names (the same DATA module IconShapeBody renders on-canvas — the
 * glyph registry IS the icon def's variant source, so identity still traces
 * to the def's data).
 */
function iconEntry(glyphId: IconGlyphId): ShapeCatalogEntry {
  return {
    id: `icon-${glyphId}`,
    label: ICON_GLYPHS[glyphId].label,
    objectType: "icon",
    icon: glyphId,
  };
}

// ---------------------------------------------------------------------------
// Categories (arrangement: grouping + ordering + variant fan-out)
// ---------------------------------------------------------------------------

export const SHAPE_CATALOG: ShapeCatalogCategory[] = [
  {
    id: "icons",
    label: "Icons",
    entries: ICON_GLYPH_IDS.map(iconEntry),
  },
  {
    id: "shapes",
    label: "Shapes",
    entries: [
      // FigJam picker phrasing: the rectangle def's picker cell reads
      // "Square", process's reads "Rounded rectangle" (both deliberate
      // arrangement-level overrides — type labels stay "Rectangle"/"Process").
      entry("shape-square", "rectangle", { label: "Square" }),
      entry("shape-rounded-rect", "process", { label: "Rounded rectangle" }),
      entry("shape-predefined-process", "predefined-process"),
      entry("shape-decision-diamond", "decision"),
      entry("shape-triangle-up", "triangle", { label: "Triangle up", direction: "up" }),
      entry("shape-triangle-down", "triangle", { label: "Triangle down", direction: "down" }),
      entry("shape-ellipse", "ellipse"),
      entry("shape-arrow-left", "arrow-shape", { label: "Left arrow", direction: "left" }),
      entry("shape-arrow-right", "arrow-shape", { label: "Right arrow", direction: "right" }),
      entry("shape-octagon", "octagon"),
    ],
  },
];

/** Flattened list of every entry across all categories, for search. */
export const SHAPE_CATALOG_ENTRIES: ShapeCatalogEntry[] = SHAPE_CATALOG.flatMap((c) => c.entries);

/** ShapeSearchPopover's shape-swap entry set: swappable geometric shapes, in catalog order. Icon glyphs are excluded because swap changes an existing object's type. */
export const SHAPE_SEARCH_ENTRIES: ShapeCatalogEntry[] = SHAPE_CATALOG_ENTRIES.filter((e) => e.objectType !== "icon");

/** Every entry in this catalog maps to a live schema type — there is no "coming soon" disabled state. Kept as a function (not a boolean literal) so call sites don't need to change. */
export function isShapeEntryEnabled(_entry: ShapeCatalogEntry): boolean {
  return true;
}
