/**
 * The folded `type` vocabulary. The model-facing roster is the shape roster
 * with the glyph roster folded in, and the document model's
 * `{ type: "icon", icon }` split never crosses the tool boundary: every
 * placeable name round-trips through the mapping, the collision audit is the
 * one the module records, and each side of a collision is either placeable or
 * explicitly read-only — never both, never neither.
 */
import { describe, expect, test } from "bun:test";

import { CANVAS_ICON_GLYPHS } from "@codecaine-ai/canvas/schema";

import { SHAPE_OBJECT_TYPES } from "../src/service/session/perception/op-surface";
import {
  GLYPH_COLLISIONS,
  PLACEABLE_GLYPH_TYPES,
  PLACEABLE_SHAPE_TYPES,
  PLACEABLE_TYPES,
  PlaceableType,
  READ_ONLY_TYPE_NAMES,
  fromDocumentFields,
  glyphForPlaceableType,
  isPlaceableType,
  toDocumentFields,
} from "../src/service/session/tools/placeable-types";

const GLYPHS: readonly string[] = CANVAS_ICON_GLYPHS;

describe("collision audit", () => {
  test("the recorded table is exactly the ids the two rosters share", () => {
    const collide = GLYPHS.filter((glyph) => SHAPE_OBJECT_TYPES.has(glyph));
    expect(collide).toEqual(["database"]);
    expect(GLYPH_COLLISIONS.map((entry) => entry.glyph)).toEqual(["database"]);
  });

  test("database is the GLYPH, per the spec's own placing-a-database example", () => {
    expect(GLYPH_COLLISIONS[0]!.decision).toBe("glyph-wins");
    expect(toDocumentFields("database")).toEqual({ type: "icon", icon: "database" });
    expect(isPlaceableType("database")).toBe(true);
    // The suffixed glyph name is gone: the glyph owns the bare one.
    expect(isPlaceableType("database-icon")).toBe(false);
    expect(PLACEABLE_TYPES).not.toContain("database-icon" as never);
  });

  test("the flowchart shape it outranked is read-only, not placeable", () => {
    expect(READ_ONLY_TYPE_NAMES).toEqual(["database-shape"]);
    expect(isPlaceableType("database-shape")).toBe(false);
    expect(PLACEABLE_TYPES).not.toContain("database-shape" as never);
    expect(PLACEABLE_SHAPE_TYPES).not.toContain("database" as never);
    // A board that already holds one still reads and re-lowers losslessly.
    expect(fromDocumentFields({ type: "database" })).toBe("database-shape");
    expect(toDocumentFields("database-shape")).toEqual({ type: "database" });
  });

  test("every collision records a reason", () => {
    for (const collision of GLYPH_COLLISIONS) {
      expect(collision.reason.length, collision.glyph).toBeGreaterThan(20);
    }
  });

  test("every glyph reaches the model under exactly one folded name", () => {
    const reachable = new Set(
      PLACEABLE_GLYPH_TYPES.map((name) => glyphForPlaceableType(name) as string),
    );
    for (const glyph of GLYPHS) {
      expect(reachable.has(glyph), glyph).toBe(true);
    }
    expect(reachable.size).toBe(GLYPHS.length);
  });

  test("no folded name is both placeable and read-only", () => {
    for (const name of READ_ONLY_TYPE_NAMES) {
      expect(PLACEABLE_TYPES, name).not.toContain(name as never);
    }
  });
});

describe("the folded roster", () => {
  test("is the shape roster plus the reachable glyphs, with no duplicates", () => {
    expect(PLACEABLE_TYPES).toEqual([...PLACEABLE_SHAPE_TYPES, ...PLACEABLE_GLYPH_TYPES]);
    expect(new Set(PLACEABLE_TYPES).size).toBe(PLACEABLE_TYPES.length);
    // 28 shape types minus the `icon` carrier and minus the one type a glyph
    // outranked, plus all 26 glyphs. A move here means a roster changed —
    // check the audit.
    expect(PLACEABLE_SHAPE_TYPES.length).toBe(
      SHAPE_OBJECT_TYPES.size - 1 - READ_ONLY_TYPE_NAMES.length,
    );
    expect(PLACEABLE_GLYPH_TYPES.length).toBe(GLYPHS.length);
    expect(PLACEABLE_TYPES.length).toBe(52);
  });

  test("never offers the document model's carrier type or kind names", () => {
    for (const name of ["icon", "section", "sticky"]) {
      expect(isPlaceableType(name), name).toBe(false);
    }
  });

  test("the tool schema publishes exactly the roster as one enum", () => {
    const schema = PlaceableType as unknown as { type: string; enum: string[] };
    expect(schema.type).toBe("string");
    expect(schema.enum).toEqual([...PLACEABLE_TYPES]);
    // StringEnum, not a union of consts — one `enum` on the wire.
    expect(JSON.stringify(PlaceableType)).not.toContain("anyOf");
  });
});

describe("bidirectional mapping", () => {
  test("round-trips every placeable name", () => {
    for (const name of PLACEABLE_TYPES) {
      expect(fromDocumentFields(toDocumentFields(name)), name).toBe(name);
    }
  });

  test("round-trips the read-only names too, so documents render losslessly", () => {
    for (const name of READ_ONLY_TYPE_NAMES) {
      expect(toDocumentFields(name).icon, name).toBeUndefined();
      expect(fromDocumentFields(toDocumentFields(name)), name).toBe(name);
    }
  });

  test("shapes lower without an icon field, glyphs lower with one", () => {
    for (const name of PLACEABLE_SHAPE_TYPES) {
      const fields = toDocumentFields(name);
      expect(fields, name).toEqual({ type: name });
      expect(fields.icon, name).toBeUndefined();
    }
    for (const name of PLACEABLE_GLYPH_TYPES) {
      const fields = toDocumentFields(name);
      expect(fields.type, name).toBe("icon");
      expect(GLYPHS, name).toContain(fields.icon!);
    }
  });

  test("a name outside the mapping throws rather than lowering to junk", () => {
    expect(() => toDocumentFields("cylinder" as never)).toThrow(/Unknown placeable type/);
  });

  test("kinds with their own gestures pass through outbound", () => {
    expect(fromDocumentFields({ type: "sticky" })).toBe("sticky");
    expect(fromDocumentFields({ type: "section" })).toBe("section");
  });

  test("a malformed icon object degrades instead of throwing", () => {
    expect(fromDocumentFields({ type: "icon" })).toBe("icon");
    expect(fromDocumentFields({ type: "icon", icon: "unicorn" })).toBe("icon");
  });
});
