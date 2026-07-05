import { describe, expect, it } from "bun:test";
import {
  EXISTING_SCHEMA_OBJECT_TYPES,
  isShapeEntryEnabled,
  OTHER_LIBRARIES,
  SHAPE_CATALOG,
  SHAPE_CATALOG_ENTRIES,
  SHAPE_SEARCH_ENTRIES,
} from "../shape-catalog";

describe("shape-catalog data shape", () => {
  it("defines the 5 sectioned categories from the catalog (Recents/Connections/Basic/Flowchart/Advanced)", () => {
    const ids = SHAPE_CATALOG.map((c) => c.id);
    expect(ids).toEqual(["recents", "connections", "basic", "flowchart", "advanced"]);
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

  it("every entry has a callable icon component and a non-empty label", () => {
    for (const entry of SHAPE_CATALOG_ENTRIES) {
      expect(typeof entry.icon).toBe("function");
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  it("defines the compact search popover's technical/object icon set, distinct in kind from Basic's geometric shapes", () => {
    expect(SHAPE_SEARCH_ENTRIES.length).toBeGreaterThanOrEqual(5);
    const basicLabels = new Set(
      SHAPE_CATALOG.find((c) => c.id === "basic")!.entries.map((e) => e.label),
    );
    for (const entry of SHAPE_SEARCH_ENTRIES) {
      expect(basicLabels.has(entry.label)).toBe(false);
    }
  });

  it("lists the 3 'Other libraries' footer rows with their measured shape counts", () => {
    expect(OTHER_LIBRARIES).toEqual([
      { id: "aws", label: "AWS", shapeCount: 805 },
      { id: "azure", label: "Azure", shapeCount: 637 },
      { id: "cisco", label: "Cisco", shapeCount: 292 },
    ]);
  });
});

describe("shape-catalog / schema-vocabulary coordination", () => {
  // W3: the parallel schema worker landed the W2-model types (section/pill/
  // arrow-shape/predefined-process/code-block/chip-icon) in schema.ts, so
  // EXISTING_SCHEMA_OBJECT_TYPES now includes them and every catalog entry
  // targeting them is enabled — this test was written against the
  // "not yet landed" state and is updated here to assert the current,
  // fully-unlocked vocabulary instead.
  it("includes the W2-model types in the existing schema vocabulary, and enables their catalog entries", () => {
    const w2Types = ["section", "pill", "arrow-shape", "predefined-process", "code-block", "chip-icon"];
    for (const t of w2Types) {
      expect(EXISTING_SCHEMA_OBJECT_TYPES.has(t as never)).toBe(true);
    }

    const w2Entries = SHAPE_CATALOG_ENTRIES.filter((e) => w2Types.includes(e.objectType));
    expect(w2Entries.length).toBeGreaterThan(0);
    for (const entry of w2Entries) {
      expect(isShapeEntryEnabled(entry)).toBe(true);
    }
  });

  it("marks entries mapping to existing schema types as enabled", () => {
    const enabledEntries = SHAPE_CATALOG_ENTRIES.filter((e) =>
      EXISTING_SCHEMA_OBJECT_TYPES.has(e.objectType),
    );
    expect(enabledEntries.length).toBeGreaterThan(0);
    for (const entry of enabledEntries) {
      expect(isShapeEntryEnabled(entry)).toBe(true);
    }
  });

  it("includes at least one catalog entry for each of the 6 new W2-model types (coordinated naming)", () => {
    const newTypes = ["section", "pill", "arrow-shape", "predefined-process", "code-block", "chip-icon"];
    for (const t of newTypes) {
      const found = SHAPE_CATALOG_ENTRIES.some((e) => e.objectType === t);
      expect(found).toBe(true);
    }
  });
});
