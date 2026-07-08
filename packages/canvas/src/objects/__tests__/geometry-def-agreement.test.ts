/**
 * geometry-def-agreement — the def ⇄ geometry-table cross-check (P3, D4):
 * every registered def's declared `outline` must be the IDENTICAL spec
 * object the geometry dispatch (objects/geometry.ts outlineSpecFor) resolves
 * for that type, and every OUTLINES_BY_TYPE key must have a registered def
 * carrying that exact spec. Identity (not structural) equality is the point:
 * a def and the dispatch tables can never drift apart, because they must
 * literally share the one exported spec object.
 */

import { describe, expect, it } from "bun:test";
import { shapeForType } from "../../state/schema/object-defaults";
import type { InteractiveCanvasObject, InteractiveCanvasObjectType } from "../../state/schema";
import { ALL_OBJECT_TYPES } from "../../zz-dom-fixtures";
import { outlineSpecFor, OUTLINES_BY_TYPE } from "../geometry";
import { objectDefForType } from "../object-def";

function minimalObject(type: InteractiveCanvasObjectType): InteractiveCanvasObject {
  return {
    id: `agreement-${type}`,
    type,
    text: type,
    geometry: { x: 0, y: 0, width: 100, height: 100 },
    // The default style.shape the placement path stamps for this type.
    style: { shape: shapeForType(type) },
  };
}

describe("geometry-def-agreement", () => {
  it("every type-keyed def declares the exact spec object outlineSpecFor resolves (identity)", () => {
    for (const type of ALL_OBJECT_TYPES) {
      const def = objectDefForType(type);
      expect(def, `no registered def for type "${type}"`).toBeDefined();
      const resolved = outlineSpecFor(minimalObject(type));
      expect(
        def!.outline === resolved,
        `def "${type}" declares a different outline spec than outlineSpecFor resolves`,
      ).toBe(true);
    }
  });

  it("every OUTLINES_BY_TYPE key has a registered def carrying that exact spec (identity)", () => {
    const entries = Object.entries(OUTLINES_BY_TYPE) as Array<
      [InteractiveCanvasObjectType, (typeof OUTLINES_BY_TYPE)[InteractiveCanvasObjectType]]
    >;
    expect(entries.length).toBe(16);
    for (const [type, spec] of entries) {
      const def = objectDefForType(type);
      expect(def, `OUTLINES_BY_TYPE key "${type}" has no registered def`).toBeDefined();
      expect(
        def!.outline === spec,
        `def "${type}" does not carry the OUTLINES_BY_TYPE spec object`,
      ).toBe(true);
    }
  });
});
