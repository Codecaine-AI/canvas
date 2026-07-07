import { describe, expect, it } from "bun:test";
import { ICON_GLYPH_IDS } from "../shapes/icon/icon-glyphs";
import {
  isShapeEntryEnabled,
  SHAPE_CATALOG,
  SHAPE_CATALOG_ENTRIES,
  SHAPE_SEARCH_ENTRIES,
} from "../catalog";

// Wave C: restructured to exactly 3 sections (Basic/Flowchart/Advanced),
// mirroring FigJam's actual picker model — see docs/10-system-design/
// 20-figjam-parity/doc.json. Recents/Connections/"Other libraries" (the
// pre-schema placeholder scaffolding) are gone; connectors remain a
// dock-only tool, never a Shapes-panel entry.
describe("shape-catalog data shape", () => {
  it("defines exactly the 3 sectioned categories, in order: Basic, Flowchart, Advanced", () => {
    const ids = SHAPE_CATALOG.map((c) => c.id);
    expect(ids).toEqual(["basic", "flowchart", "advanced"]);
    expect(SHAPE_CATALOG.map((c) => c.label)).toEqual(["Basic", "Flowchart", "Advanced"]);
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
  // editor/components/__tests__/shape-previews.test.tsx.
  it("every entry is component-free data with a non-empty label", () => {
    for (const entry of SHAPE_CATALOG_ENTRIES) {
      expect("Icon" in entry).toBe(false);
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  it("Basic has exactly the 14 entries from the brief, in order, with correct directions", () => {
    const basic = SHAPE_CATALOG.find((c) => c.id === "basic")!;
    expect(basic.entries.map((e) => e.id)).toEqual([
      "basic-square",
      "basic-ellipse",
      "basic-decision-diamond",
      "basic-triangle-up",
      "basic-triangle-down",
      "basic-rounded-rect",
      "basic-pentagon",
      "basic-octagon",
      "basic-plus",
      "basic-arrow-left",
      "basic-arrow-right",
      "basic-chevron",
      "basic-star",
      "basic-chat",
    ]);
    expect(basic.entries.find((e) => e.id === "basic-triangle-up")?.direction).toBe("up");
    expect(basic.entries.find((e) => e.id === "basic-triangle-down")?.direction).toBe("down");
    expect(basic.entries.find((e) => e.id === "basic-arrow-left")?.direction).toBe("left");
    expect(basic.entries.find((e) => e.id === "basic-arrow-right")?.direction).toBe("right");
    expect(basic.entries.find((e) => e.id === "basic-chevron")?.direction).toBe("right");
  });

  it("Flowchart has exactly the 16 entries from the brief, in order, with correct directions", () => {
    const flowchart = SHAPE_CATALOG.find((c) => c.id === "flowchart")!;
    expect(flowchart.entries.map((e) => e.id)).toEqual([
      "flow-parallelogram-right",
      "flow-parallelogram-left",
      "flow-database",
      "flow-cylinder-horizontal",
      "flow-page-corner",
      "flow-folder",
      "flow-document",
      "flow-document-stack",
      "flow-predefined-process",
      "flow-off-page-connector",
      "flow-trapezoid",
      "flow-manual-input",
      "flow-hexagon",
      "flow-internal-storage",
      "flow-or-junction",
      "flow-summing-junction",
    ]);
    expect(flowchart.entries.find((e) => e.id === "flow-parallelogram-right")?.direction).toBe("right");
    expect(flowchart.entries.find((e) => e.id === "flow-parallelogram-left")?.direction).toBe("left");
  });

  it("Advanced has exactly the 26 icon glyphs, each inserting type: 'icon' with the matching glyph id and its display name as the label", () => {
    const advanced = SHAPE_CATALOG.find((c) => c.id === "advanced")!;
    expect(advanced.entries.length).toBe(26);
    expect(advanced.entries.length).toBe(ICON_GLYPH_IDS.length);
    for (const glyphId of ICON_GLYPH_IDS) {
      const entry = advanced.entries.find((e) => e.icon === glyphId);
      expect(entry).toBeTruthy();
      expect(entry!.objectType).toBe("icon");
      expect(entry!.label.length).toBeGreaterThan(0);
    }
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
