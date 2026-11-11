/**
 * The folded `type` vocabulary. The model-facing roster is the
 * object-preference registry's names — shapes first, then glyphs — and the
 * document model's `{ type: "icon", icon }` split never crosses the tool
 * boundary: every placeable name round-trips through the mapping, and the
 * glyph and shape rosters are disjoint so a bare name always means exactly
 * one drawing.
 */
import { describe, expect, test } from "bun:test";

import { CANVAS_ICON_GLYPHS } from "../../state/schema";

import { OBJECT_PREFERENCES } from "../../objects/registry";
import { SHAPE_OBJECT_TYPES } from "../perception/op-surface";
import {
  PLACEABLE_GLYPH_TYPES,
  PLACEABLE_SHAPE_TYPES,
  PLACEABLE_TYPES,
  PlaceableType,
  fromDocumentFields,
  glyphForPlaceableType,
  isPlaceableType,
  toDocumentFields,
} from "../tools/placeable-types";

const GLYPHS: readonly string[] = CANVAS_ICON_GLYPHS;

describe("the registry-driven roster", () => {
  test("is exactly the registry's names, shapes first, then glyphs, no duplicates", () => {
    expect(PLACEABLE_TYPES).toEqual([...PLACEABLE_SHAPE_TYPES, ...PLACEABLE_GLYPH_TYPES]);
    expect(new Set(PLACEABLE_TYPES).size).toBe(PLACEABLE_TYPES.length);
    expect(([...PLACEABLE_TYPES] as string[]).sort()).toEqual(
      OBJECT_PREFERENCES.map((entry) => entry.name).sort(),
    );
  });

  test("covers every glyph and every placeable shape type", () => {
    expect(([...PLACEABLE_GLYPH_TYPES] as string[]).sort()).toEqual([...GLYPHS].sort());
    expect(([...PLACEABLE_SHAPE_TYPES] as string[]).sort()).toEqual(
      [...SHAPE_OBJECT_TYPES].filter((type) => type !== "icon").sort(),
    );
  });

  test("the glyph and shape rosters are disjoint — one string, one drawing", () => {
    expect(GLYPHS.filter((glyph) => SHAPE_OBJECT_TYPES.has(glyph))).toEqual([]);
  });

  test("never offers the document model's carrier type or kind names", () => {
    for (const name of ["icon", "section", "sticky"]) {
      expect(isPlaceableType(name), name).toBe(false);
    }
  });

  test("the tool schema publishes the roster as one enum, and the brand catalog as a pattern instead of a list", () => {
    const schema = PlaceableType as unknown as { anyOf: [{ type: string; enum: string[] }, { type: string; pattern: string }] };
    expect(schema.anyOf).toHaveLength(2);
    expect(schema.anyOf[0].type).toBe("string");
    expect(schema.anyOf[0].enum).toEqual([...PLACEABLE_TYPES]);
    expect(schema.anyOf[1]).toMatchObject({ type: "string", pattern: "^brand-[a-z0-9]+(-[a-z0-9]+)*$" });
    // The catalog's brands beyond the core roster are reachable, not listed.
    expect(schema.anyOf[0].enum).not.toContain("brand-clickhouse");
    expect(isPlaceableType("brand-clickhouse")).toBe(true);
    expect(isPlaceableType("brand-clickhous")).toBe(false);
  });
});

describe("bidirectional mapping", () => {
  test("round-trips every placeable name", () => {
    for (const name of PLACEABLE_TYPES) {
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

  test("glyphForPlaceableType names the drawing only for glyphs", () => {
    for (const name of PLACEABLE_GLYPH_TYPES) {
      expect(glyphForPlaceableType(name), name).toBe(name);
    }
    for (const name of PLACEABLE_SHAPE_TYPES) {
      expect(glyphForPlaceableType(name), name).toBeUndefined();
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
