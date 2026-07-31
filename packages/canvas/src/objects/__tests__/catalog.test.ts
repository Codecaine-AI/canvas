import { describe, expect, it } from "bun:test";
import { ICON_GLYPH_IDS } from "../shapes/icon/icon-glyphs";
import {
  isShapeEntryEnabled,
  SHAPE_CATALOG,
  SHAPE_CATALOG_ENTRIES,
  SHAPE_SEARCH_ENTRIES,
} from "../catalog";

// Operational-maps surface trim: the picker's default face is the icon grid
// (the 30-glyph semantic vocabulary, registry order) with the eight
// universal shapes as a compact utility group. Connectors remain a dock-only
// tool, never a Shapes-panel entry.
describe("shape-catalog data shape", () => {
  it("defines exactly the 2 sectioned categories, in order: Icons, Shapes", () => {
    const ids = SHAPE_CATALOG.map((c) => c.id);
    expect(ids).toEqual(["icons", "shapes"]);
    expect(SHAPE_CATALOG.map((c) => c.label)).toEqual(["Icons", "Shapes"]);
  });

  it("every category has at least one entry, and every entry has a unique id", () => {
    for (const category of SHAPE_CATALOG) {
      expect(category.entries.length).toBeGreaterThan(0);
    }
    const ids = SHAPE_CATALOG_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("flattens all category entries into SHAPE_CATALOG_ENTRIES", () => {
    const total = SHAPE_CATALOG.reduce((sum, c) => sum + c.entries.length, 0);
    expect(SHAPE_CATALOG_ENTRIES.length).toBe(total);
  });

  // Entries are pure data since the co-location alignment — the preview
  // components live editor-side; their coverage is asserted in
  // stage/editor/components/__tests__/shape-previews.test.tsx.
  it("every entry is component-free data with a non-empty label", () => {
    for (const entry of SHAPE_CATALOG_ENTRIES) {
      expect("Icon" in entry).toBe(false);
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  it("Icons has all 30 glyphs in registry order, each inserting type: 'icon' with the matching glyph id and its display name as the label", () => {
    const icons = SHAPE_CATALOG.find((c) => c.id === "icons")!;
    expect(icons.entries.length).toBe(30);
    expect(icons.entries.length).toBe(ICON_GLYPH_IDS.length);
    expect(icons.entries.map((e) => e.icon)).toEqual([...ICON_GLYPH_IDS]);
    for (const [index, glyphId] of ICON_GLYPH_IDS.entries()) {
      const entry = icons.entries[index]!;
      expect(entry.icon).toBe(glyphId);
      expect(entry.objectType).toBe("icon");
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  it("Shapes has exactly the 10 entries of the universal core (direction variants fanned out), in order, with correct directions", () => {
    const shapes = SHAPE_CATALOG.find((c) => c.id === "shapes")!;
    expect(shapes.entries.map((e) => e.id)).toEqual([
      "shape-square",
      "shape-rounded-rect",
      "shape-predefined-process",
      "shape-decision-diamond",
      "shape-triangle-up",
      "shape-triangle-down",
      "shape-ellipse",
      "shape-arrow-left",
      "shape-arrow-right",
      "shape-octagon",
    ]);
    expect(shapes.entries.find((e) => e.id === "shape-triangle-up")?.direction).toBe("up");
    expect(shapes.entries.find((e) => e.id === "shape-triangle-down")?.direction).toBe("down");
    expect(shapes.entries.find((e) => e.id === "shape-arrow-left")?.direction).toBe("left");
    expect(shapes.entries.find((e) => e.id === "shape-arrow-right")?.direction).toBe("right");
    expect(shapes.entries.every((e) => e.objectType !== "icon")).toBe(true);
  });

  it("no entry maps to a connector-family type — connectors are dock-only, never a Shapes-panel entry", () => {
    for (const entry of SHAPE_CATALOG_ENTRIES) {
      expect(entry.objectType).not.toBe("connector");
    }
    expect(SHAPE_CATALOG.some((c) => c.id === "connections" || c.label.toLowerCase().includes("connector"))).toBe(false);
  });

  it("defines the compact search popover's entry set, all mapped to real schema types", () => {
    expect(SHAPE_SEARCH_ENTRIES.length).toBeGreaterThanOrEqual(5);
    for (const entry of SHAPE_SEARCH_ENTRIES) {
      expect(isShapeEntryEnabled(entry)).toBe(true);
    }
  });
});

describe("shape-catalog / schema-vocabulary coordination", () => {
  it("every catalog entry maps to a live InteractiveCanvasObjectType — nothing is 'coming soon' anymore", () => {
    for (const entry of SHAPE_CATALOG_ENTRIES) {
      expect(isShapeEntryEnabled(entry)).toBe(true);
    }
  });
});
