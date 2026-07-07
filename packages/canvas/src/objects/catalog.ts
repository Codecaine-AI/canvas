/**
 * catalog.ts — the shape catalog as PURE DATA (co-location alignment).
 *
 * Formerly objects/catalog/shape-catalog.tsx, which also carried inline JSX
 * preview components. Per Ford's layering principles objects/ holds catalog
 * DATA only: each entry is (id, label, objectType, direction?, icon?,
 * keywords?). The preview SVGs those entries render as in the picker UIs live
 * in editor/components/shape-previews.tsx (interface JSX belongs to the
 * editor), which maps entries -> preview components by entry id / glyph id.
 *
 * Wave C structure preserved: exactly 3 sections (Basic / Flowchart /
 * Advanced) mirroring FigJam's actual picker model per
 * docs/10-system-design/20-figjam-parity/doc.json — no Recents/Connections/
 * "Other libraries" (connectors are a dock-only tool — see CanvasDock.tsx's
 * `"connector"` ToolId — not a Shapes-panel concept). `objectType` maps to
 * the REAL `InteractiveCanvasObjectType` from ../state/schema (all 19 W5
 * native types + "icon" are live), so every entry is enabled — there is no
 * "coming soon" disabled state.
 */

import type { CanvasIconGlyph, CanvasShapeDirection, InteractiveCanvasObjectType } from "../state/schema";
import { ICON_GLYPHS, type IconGlyphId } from "./shapes/icon/icon-glyphs";

export type ShapeCatalogEntry = {
  id: string;
  label: string;
  objectType: InteractiveCanvasObjectType;
  /** Direction/orientation field for direction-aware shapes (triangle up|down; parallelogram/chevron/arrow-shape left|right). Passed straight through to the inserted object's `direction`. */
  direction?: CanvasShapeDirection;
  /** REQUIRED when objectType === "icon" — selects which of the 26 Advanced-tier glyphs to insert. */
  icon?: CanvasIconGlyph;
  /** Extra search terms beyond the label. Unpopulated today (search matches labels only); reserved for the ShapeDef.catalog keyword migration. */
  keywords?: readonly string[];
};

export type ShapeCatalogCategory = {
  id: string;
  label: string;
  entries: ShapeCatalogEntry[];
};

// ---------------------------------------------------------------------------
// Advanced tier: all 26 icon glyphs, each an insertable `type: "icon"` entry.
// Labels come from the glyph registry's own display names (the same DATA
// module IconShapeBody renders on-canvas — no components imported here).
// ---------------------------------------------------------------------------

function advancedEntry(glyphId: IconGlyphId): ShapeCatalogEntry {
  return {
    id: `adv-${glyphId}`,
    label: ICON_GLYPHS[glyphId].label,
    objectType: "icon",
    icon: glyphId,
  };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const SHAPE_CATALOG: ShapeCatalogCategory[] = [
  {
    id: "basic",
    label: "Basic",
    entries: [
      { id: "basic-square", label: "Square", objectType: "rectangle" },
      { id: "basic-ellipse", label: "Ellipse", objectType: "ellipse" },
      { id: "basic-decision-diamond", label: "Decision", objectType: "decision" },
      { id: "basic-triangle-up", label: "Triangle up", objectType: "triangle", direction: "up" },
      { id: "basic-triangle-down", label: "Triangle down", objectType: "triangle", direction: "down" },
      { id: "basic-rounded-rect", label: "Rounded rectangle", objectType: "process" },
      { id: "basic-pentagon", label: "Pentagon", objectType: "pentagon" },
      { id: "basic-octagon", label: "Octagon", objectType: "octagon" },
      { id: "basic-plus", label: "Plus", objectType: "plus" },
      { id: "basic-arrow-left", label: "Left arrow", objectType: "arrow-shape", direction: "left" },
      { id: "basic-arrow-right", label: "Right arrow", objectType: "arrow-shape", direction: "right" },
      { id: "basic-chevron", label: "Chevron", objectType: "chevron", direction: "right" },
      { id: "basic-star", label: "Star", objectType: "star" },
      { id: "basic-chat", label: "Chat", objectType: "chat" },
    ],
  },
  {
    id: "flowchart",
    label: "Flowchart",
    entries: [
      { id: "flow-parallelogram-right", label: "Parallelogram right", objectType: "parallelogram", direction: "right" },
      { id: "flow-parallelogram-left", label: "Parallelogram left", objectType: "parallelogram", direction: "left" },
      { id: "flow-database", label: "Database", objectType: "database" },
      { id: "flow-cylinder-horizontal", label: "Cylinder (horizontal)", objectType: "cylinder-horizontal" },
      { id: "flow-page-corner", label: "Page corner", objectType: "page-corner" },
      { id: "flow-folder", label: "Folder", objectType: "folder" },
      { id: "flow-document", label: "Document", objectType: "document" },
      { id: "flow-document-stack", label: "Document stack", objectType: "document-stack" },
      { id: "flow-predefined-process", label: "Predefined process", objectType: "predefined-process" },
      { id: "flow-off-page-connector", label: "Off-page connector", objectType: "off-page-connector" },
      { id: "flow-trapezoid", label: "Trapezoid", objectType: "trapezoid" },
      { id: "flow-manual-input", label: "Manual input", objectType: "manual-input" },
      { id: "flow-hexagon", label: "Hexagon", objectType: "hexagon" },
      { id: "flow-internal-storage", label: "Internal storage", objectType: "internal-storage" },
      { id: "flow-or-junction", label: "Or junction", objectType: "or-junction" },
      { id: "flow-summing-junction", label: "Summing junction", objectType: "summing-junction" },
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

/** Panel A's compact "Search for a shape" set (ShapeSearchPopover) — technical/object glyphs for swapping an already-selected object's shape. Reuses a representative slice of the Advanced tier plus a few Basic/Flowchart entries, now that both are real schema types. */
export const SHAPE_SEARCH_ENTRIES: ShapeCatalogEntry[] = [
  SHAPE_CATALOG_ENTRIES.find((e) => e.id === "adv-cpu"),
  SHAPE_CATALOG_ENTRIES.find((e) => e.id === "flow-database"),
  SHAPE_CATALOG_ENTRIES.find((e) => e.id === "adv-display"),
  SHAPE_CATALOG_ENTRIES.find((e) => e.id === "adv-mail"),
  SHAPE_CATALOG_ENTRIES.find((e) => e.id === "flow-document"),
  SHAPE_CATALOG_ENTRIES.find((e) => e.id === "adv-code"),
  SHAPE_CATALOG_ENTRIES.find((e) => e.id === "adv-bolt"),
  SHAPE_CATALOG_ENTRIES.find((e) => e.id === "adv-terminal"),
  SHAPE_CATALOG_ENTRIES.find((e) => e.id === "adv-person"),
  SHAPE_CATALOG_ENTRIES.find((e) => e.id === "adv-globe"),
].filter((entry): entry is ShapeCatalogEntry => entry !== undefined);

/** Every entry in this catalog maps to a live schema type — there is no more "coming soon" disabled state (Wave C: all 19 W5 native types + "icon" are real). Kept as a function (not a boolean literal) so call sites don't need to change. */
export function isShapeEntryEnabled(_entry: ShapeCatalogEntry): boolean {
  return true;
}
