/**
 * catalog.ts — the Shapes-panel ARRANGEMENT of defs (P4, O7).
 *
 * Since the P4 catalog unification the def is the single source of per-shape
 * picker identity: every entry's `label` and `keywords` derive from the
 * registered def's `catalog` metadata (ObjectCatalogMeta — declared on the
 * ShapeDef, stamped onto the ObjectDef by shapeObjectDef). What legitimately
 * stays HERE is arrangement only: the category grouping (Basic / Flowchart /
 * Advanced), entry ordering, and the per-entry placement VARIANTS a single
 * def fans out into — direction variants ("Triangle up"/"Triangle down",
 * left/right arrows and parallelograms) and the 26 Advanced icon-glyph
 * entries (one `type: "icon"` def × the glyph registry). Variant entries
 * carry a label override because their display string is a property of the
 * variant, not the def; everything else reads the def's label verbatim.
 *
 * Entries are pure data (no JSX): the preview SVGs live in
 * stage/editor/components/shape-previews.tsx (interface JSX belongs to the editor),
 * mapped by entry id / glyph id.
 *
 * Wave C structure preserved: exactly 3 sections mirroring FigJam's actual
 * picker model per docs/10-system-design/20-figjam-parity/doc.json — no
 * Recents/Connections/"Other libraries" (connectors are a dock-only tool —
 * see CanvasDock.tsx's `"connector"` ToolId — not a Shapes-panel concept).
 * Every entry maps to a live `InteractiveCanvasObjectType`, so there is no
 * "coming soon" disabled state.
 */

import type { CanvasIconGlyph, CanvasShapeDirection, InteractiveCanvasObjectType } from "../state/schema";
import { objectDefForType } from "./object-def";
import { ICON_GLYPHS, type IconGlyphId } from "./shapes/icon/icon-glyphs";

export type ShapeCatalogEntry = {
  id: string;
  /** Display label — the def's catalog label unless the entry is a direction variant with its own phrasing. */
  label: string;
  objectType: InteractiveCanvasObjectType;
  /** Direction/orientation field for direction-aware shapes (triangle up|down; parallelogram/chevron/arrow-shape left|right). Passed straight through to the inserted object's `direction`. */
  direction?: CanvasShapeDirection;
  /** REQUIRED when objectType === "icon" — selects which of the 26 Advanced-tier glyphs to insert. */
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
 * Advanced tier: all 26 icon glyphs, each an insertable `type: "icon"` entry.
 * Labels come from the glyph registry's own display names (the same DATA
 * module IconShapeBody renders on-canvas — the glyph registry IS the icon
 * def's variant source, so identity still traces to the def's data).
 */
function advancedEntry(glyphId: IconGlyphId): ShapeCatalogEntry {
  return {
    id: `adv-${glyphId}`,
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
    id: "basic",
    label: "Basic",
    entries: [
      // FigJam picker phrasing: the rectangle def's picker cell reads
      // "Square", process's reads "Rounded rectangle" (both deliberate
      // arrangement-level overrides — type labels stay "Rectangle"/"Process").
      entry("basic-square", "rectangle", { label: "Square" }),
      entry("basic-ellipse", "ellipse"),
      entry("basic-decision-diamond", "decision"),
      entry("basic-triangle-up", "triangle", { label: "Triangle up", direction: "up" }),
      entry("basic-triangle-down", "triangle", { label: "Triangle down", direction: "down" }),
      entry("basic-rounded-rect", "process", { label: "Rounded rectangle" }),
      entry("basic-pentagon", "pentagon"),
      entry("basic-octagon", "octagon"),
      entry("basic-plus", "plus"),
      entry("basic-arrow-left", "arrow-shape", { label: "Left arrow", direction: "left" }),
      entry("basic-arrow-right", "arrow-shape", { label: "Right arrow", direction: "right" }),
      entry("basic-chevron", "chevron", { direction: "right" }),
      entry("basic-star", "star"),
    ],
  },
  {
    id: "flowchart",
    label: "Flowchart",
    entries: [
      entry("flow-parallelogram-right", "parallelogram", { label: "Parallelogram right", direction: "right" }),
      entry("flow-parallelogram-left", "parallelogram", { label: "Parallelogram left", direction: "left" }),
      entry("flow-database", "database"),
      entry("flow-cylinder-horizontal", "cylinder-horizontal"),
      entry("flow-page-corner", "page-corner"),
      entry("flow-folder", "folder"),
      entry("flow-document", "document"),
      entry("flow-document-stack", "document-stack"),
      entry("flow-predefined-process", "predefined-process"),
      entry("flow-off-page-connector", "off-page-connector"),
      entry("flow-trapezoid", "trapezoid"),
      entry("flow-manual-input", "manual-input"),
      entry("flow-hexagon", "hexagon"),
      entry("flow-internal-storage", "internal-storage"),
      entry("flow-or-junction", "or-junction"),
      entry("flow-summing-junction", "summing-junction"),
    ],
  },
  {
    id: "advanced",
    label: "Advanced",
    entries: (Object.keys(ICON_GLYPHS) as IconGlyphId[]).map(advancedEntry),
  },
];

/** Flattened list of every entry across all categories, for search. */
export const SHAPE_CATALOG_ENTRIES: ShapeCatalogEntry[] = SHAPE_CATALOG.flatMap((c) => c.entries);

/** ShapeSearchPopover's shape-swap entry set: swappable geometric Basic + Flowchart shapes, in catalog order. Icon glyphs are excluded because swap changes an existing object's type. */
export const SHAPE_SEARCH_ENTRIES: ShapeCatalogEntry[] = SHAPE_CATALOG_ENTRIES.filter((e) => e.objectType !== "icon");

/** Every entry in this catalog maps to a live schema type — there is no more "coming soon" disabled state (Wave C: all 19 W5 native types + "icon" are real). Kept as a function (not a boolean literal) so call sites don't need to change. */
export function isShapeEntryEnabled(_entry: ShapeCatalogEntry): boolean {
  return true;
}
