/**
 * type-defaults — the P4 defaults-consolidation cross-check.
 *
 * Locks three invariants of the defaults wiring (OBJECT-DEF-OVERHAUL.md §6
 * P4 / RESTRUCTURE step 6):
 *
 *  1. VALUE FREEZE — the schema-vocabulary table
 *     (state/schema/object-defaults.ts) produces byte-identical values to the
 *     four deleted switches from state/actions/defaults.ts (the EXPECTED
 *     literals below are those switches' outputs, captured verbatim before
 *     deletion), so every draft/placement path (draftPlacedObject,
 *     quickConnect, setObjectType) behaves exactly as before.
 *
 *  2. STAMP IDENTITY — every registered def's `defaults` IS the table's row
 *     object (reference equality), so def-derived and reducer-derived
 *     defaults can never drift.
 *
 *  3. ROLE AGREEMENT — colorKindForType (the reducer's last-picked-memory
 *     bucket) matches every def's declared `colorRole` (the same 3-value
 *     space for object types; "connector" is the connection bucket).
 */

import { describe, expect, it } from "bun:test";
import type { CanvasGeometry, InteractiveCanvasObjectType } from "../../state/schema";
import {
  colorKindForType,
  defaultGeometryFor,
  defaultTextFor,
  draftPlacedObject,
  FIRST_USE_COLORS,
  OBJECT_TYPE_DEFAULTS,
  objectTypeDefaults,
  objectTypeLabel,
  shapeForType,
} from "../../state/schema/object-defaults";
import {
  BELOW_TEXT_TYPES,
} from "../text-slots";
import { ALL_OBJECT_TYPES } from "../../zz-dom-fixtures";
import { OBJECT_DEFS, objectDefForType } from "../object-def";

/**
 * The pre-P4 switch outputs, VERBATIM (defaultGeometryFor / objectTypeLabel /
 * shapeForType from the deleted state/actions/defaults.ts at bb78af8). Do not
 * "fix" these to match code — they are the frozen behavioral contract.
 */
const EXPECTED: Record<
  InteractiveCanvasObjectType,
  { geometry: CanvasGeometry; label: string; shape: string }
> = {
  rectangle: { geometry: { x: 80, y: 80, width: 360, height: 240 }, label: "Rectangle", shape: "rounded-rect" },
  process: { geometry: { x: 160, y: 160, width: 184, height: 96 }, label: "Process", shape: "rounded-rect" },
  decision: { geometry: { x: 160, y: 160, width: 160, height: 112 }, label: "Decision", shape: "diamond" },
  sticky: { geometry: { x: 180, y: 180, width: 176, height: 128 }, label: "Sticky", shape: "note" },
  "annotation-marker": { geometry: { x: 220, y: 220, width: 40, height: 40 }, label: "Annotation", shape: "marker" },
  document: { geometry: { x: 160, y: 160, width: 160, height: 120 }, label: "Document", shape: "document" },
  database: { geometry: { x: 160, y: 160, width: 140, height: 120 }, label: "Database", shape: "database" },
  section: { geometry: { x: 80, y: 80, width: 480, height: 360 }, label: "Section", shape: "section" },
  pill: { geometry: { x: 160, y: 160, width: 200, height: 64 }, label: "Pill", shape: "pill" },
  "arrow-shape": { geometry: { x: 160, y: 160, width: 361, height: 100 }, label: "Arrow", shape: "arrow-shape" },
  "predefined-process": { geometry: { x: 160, y: 160, width: 200, height: 100 }, label: "Predefined Process", shape: "predefined-process" },
  ellipse: { geometry: { x: 160, y: 160, width: 160, height: 120 }, label: "Ellipse", shape: "ellipse" },
  triangle: { geometry: { x: 160, y: 160, width: 140, height: 120 }, label: "Triangle", shape: "triangle" },
  parallelogram: { geometry: { x: 160, y: 160, width: 160, height: 100 }, label: "Parallelogram", shape: "parallelogram" },
  pentagon: { geometry: { x: 160, y: 160, width: 140, height: 140 }, label: "Pentagon", shape: "pentagon" },
  octagon: { geometry: { x: 160, y: 160, width: 140, height: 140 }, label: "Octagon", shape: "octagon" },
  star: { geometry: { x: 160, y: 160, width: 140, height: 140 }, label: "Star", shape: "star" },
  plus: { geometry: { x: 160, y: 160, width: 120, height: 120 }, label: "Plus", shape: "plus" },
  chevron: { geometry: { x: 160, y: 160, width: 160, height: 120 }, label: "Chevron", shape: "chevron" },
  folder: { geometry: { x: 160, y: 160, width: 140, height: 110 }, label: "Folder", shape: "folder" },
  "document-stack": { geometry: { x: 160, y: 160, width: 160, height: 120 }, label: "Document Stack", shape: "document-stack" },
  "off-page-connector": { geometry: { x: 160, y: 160, width: 120, height: 100 }, label: "Off-page Connector", shape: "off-page-connector" },
  trapezoid: { geometry: { x: 160, y: 160, width: 150, height: 100 }, label: "Trapezoid", shape: "trapezoid" },
  "manual-input": { geometry: { x: 160, y: 160, width: 150, height: 100 }, label: "Manual Input", shape: "manual-input" },
  hexagon: { geometry: { x: 160, y: 160, width: 150, height: 100 }, label: "Hexagon", shape: "hexagon" },
  "internal-storage": { geometry: { x: 160, y: 160, width: 150, height: 110 }, label: "Internal Storage", shape: "internal-storage" },
  "or-junction": { geometry: { x: 160, y: 160, width: 100, height: 100 }, label: "Or Junction", shape: "or-junction" },
  "summing-junction": { geometry: { x: 160, y: 160, width: 100, height: 100 }, label: "Summing Junction", shape: "summing-junction" },
  "cylinder-horizontal": { geometry: { x: 160, y: 160, width: 150, height: 100 }, label: "Cylinder (Horizontal)", shape: "cylinder-horizontal" },
  "page-corner": { geometry: { x: 160, y: 160, width: 160, height: 120 }, label: "Page Corner", shape: "page-corner" },
  icon: { geometry: { x: 160, y: 160, width: 120, height: 120 }, label: "Icon", shape: "icon" },
};

describe("type-defaults: value freeze (old switches === leaf table)", () => {
  it("covers the whole closed type union, nothing more", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...ALL_OBJECT_TYPES].sort());
    expect(Object.keys(OBJECT_TYPE_DEFAULTS).sort()).toEqual([...ALL_OBJECT_TYPES].sort());
  });

  it.each(ALL_OBJECT_TYPES.map((type) => [type] as const))(
    "%s: defaultGeometryFor / objectTypeLabel / shapeForType match the deleted switches",
    (type) => {
      expect(defaultGeometryFor(type)).toEqual(EXPECTED[type].geometry);
      expect(objectTypeLabel(type)).toBe(EXPECTED[type].label);
      expect(shapeForType(type)).toBe(EXPECTED[type].shape);
    },
  );

  it("defaultGeometryFor returns a fresh copy (documents must never alias the table rows)", () => {
    const a = defaultGeometryFor("process");
    expect(a).not.toBe(OBJECT_TYPE_DEFAULTS.process.geometry);
    a.x = -1;
    expect(OBJECT_TYPE_DEFAULTS.process.geometry.x).toBe(160);
  });

  it("defaultTextFor: sticky starts empty, everything else starts with the type label", () => {
    for (const type of ALL_OBJECT_TYPES) {
      expect(defaultTextFor(type)).toBe(
        type === "sticky" ? "" : EXPECTED[type].label,
      );
    }
  });

  it("draftPlacedObject stamps the frozen shape + per-kind first-use color for every type", () => {
    expect(BELOW_TEXT_TYPES).toEqual(["icon"]);
    for (const type of ALL_OBJECT_TYPES) {
      const draft = draftPlacedObject(type, { x: 1, y: 2, width: 30, height: 40 });
      expect(draft.style?.shape).toBe(EXPECTED[type].shape as NonNullable<typeof draft.style>["shape"]);
      expect(draft.text).toBe(defaultTextFor(type));
      expect(draft.color).toBe(FIRST_USE_COLORS[colorKindForType(type)]);
      expect(draft.geometry).toEqual({ x: 1, y: 2, width: 30, height: 40 });
    }
  });
});

describe("type-defaults: registry stamp identity", () => {
  it("every type-keyed def's `defaults` IS the table row (reference equality)", () => {
    for (const type of ALL_OBJECT_TYPES) {
      const def = objectDefForType(type);
      expect(def, `no registered def for type "${type}"`).toBeDefined();
      expect(
        def!.defaults === objectTypeDefaults(type),
        `def "${type}" carries a defaults object that is not the schema table's row`,
      ).toBe(true);
    }
  });

  it("every registered def is type-keyed and its defaults.shape matches shapeForType", () => {
    expect(OBJECT_DEFS.length).toBe(ALL_OBJECT_TYPES.length);
    for (const def of OBJECT_DEFS) {
      expect(ALL_OBJECT_TYPES).toContain(def.kind as InteractiveCanvasObjectType);
      expect(def.defaults.shape).toBe(shapeForType(def.kind as InteractiveCanvasObjectType)!);
    }
  });
});

describe("type-defaults: color-kind / color-role agreement (D17)", () => {
  it("colorKindForType matches every def's declared colorRole", () => {
    for (const type of ALL_OBJECT_TYPES) {
      expect(colorKindForType(type)).toBe(objectDefForType(type)!.colorRole);
    }
  });
});
