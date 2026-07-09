import { describe, expect, it } from "bun:test";
import type {
  CanvasShapeDirection,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
} from "../../state/schema";
import { draftPlacedObject } from "../../state/schema/object-defaults";
import { outlinePolygon, pointInPolygon } from "../geometry";
import { OBJECT_DEFS, objectDefFor, objectDefForType, type ObjectDef } from "../object-def";
import { resolveTextSlot, textPlacementName, type LocalRect } from "../text-slots";

const SIZE_CASES = [
  { name: "default", scale: 1 },
  { name: "small", scale: 0.5 },
  { name: "large", scale: 2 },
] as const;

const SKIPPED_TEXT_SILHOUETTE_TYPES = new Set<string>([
  // Pure glyphs: no rendered object text.
  "plus",
  "or-junction",
  "summing-junction",
  // Below-slot text sits outside the glyph silhouette by design.
  "icon",
  // Non-shape text placements.
  "sticky",
  "section",
]);

const DIRECTION_CASES: Partial<
  Record<InteractiveCanvasObjectType, readonly CanvasShapeDirection[]>
> = {
  triangle: ["up", "down"],
  "arrow-shape": ["left", "right"],
  chevron: ["left", "right"],
  parallelogram: ["left", "right"],
};

type RectCorner = {
  name: "top-left" | "top-right" | "bottom-right" | "bottom-left";
  x: number;
  y: number;
};

type TextRectCase = {
  def: ObjectDef;
  sizeName: (typeof SIZE_CASES)[number]["name"];
  scale: number;
  direction?: CanvasShapeDirection;
};

function rectCorners(rect: LocalRect): RectCorner[] {
  return [
    { name: "top-left", x: rect.x, y: rect.y },
    { name: "top-right", x: rect.x + rect.width, y: rect.y },
    { name: "bottom-right", x: rect.x + rect.width, y: rect.y + rect.height },
    { name: "bottom-left", x: rect.x, y: rect.y + rect.height },
  ];
}

function buildObject(testCase: TextRectCase): InteractiveCanvasObject {
  const { def, scale, direction } = testCase;
  const type = def.kind as InteractiveCanvasObjectType;
  const defaults = def.defaults.geometry;
  return draftPlacedObject(
    type,
    {
      x: 0,
      y: 0,
      width: defaults.width * scale,
      height: defaults.height * scale,
    },
    {
      id: `${type}-${direction ?? "none"}-${testCase.sizeName}`,
      text: "",
      ...(direction ? { direction } : null),
    },
  );
}

function textRectCases(): TextRectCase[] {
  const cases: TextRectCase[] = [];

  for (const def of OBJECT_DEFS) {
    if (!def.catalog || SKIPPED_TEXT_SILHOUETTE_TYPES.has(def.kind) || !def.textSlot) {
      continue;
    }

    const placement = textPlacementName(def.textSlot.placement);
    if (placement !== "center" && placement !== "rect") continue;

    const directions = DIRECTION_CASES[def.kind as InteractiveCanvasObjectType] ?? [undefined];
    for (const direction of directions) {
      for (const sizeCase of SIZE_CASES) {
        cases.push({
          def,
          direction,
          sizeName: sizeCase.name,
          scale: sizeCase.scale,
        });
      }
    }
  }

  return cases;
}

function caseName(testCase: TextRectCase): string {
  return [
    testCase.def.kind,
    testCase.direction ? `direction=${testCase.direction}` : "direction=none",
    `${testCase.sizeName}=${testCase.scale}x`,
  ].join(" ");
}

function expectedLegacyCenterRect(object: InteractiveCanvasObject): LocalRect {
  return {
    x: 14,
    y: 12,
    width: Math.max(0, object.geometry.width - 28),
    height: Math.max(0, object.geometry.height - 24),
  };
}

describe("inscribed text rect silhouette containment", () => {
  it.each(textRectCases().map((testCase) => [caseName(testCase), testCase] as const))(
    "%s",
    (_name, testCase) => {
      const object = buildObject(testCase);
      const slot = objectDefFor(object)?.textSlot;
      if (!slot) throw new Error(`missing renderer text slot for ${testCase.def.kind}`);

      const rect = resolveTextSlot(slot, object).rect;
      const polygon = outlinePolygon(object);

      for (const corner of rectCorners(rect)) {
        expect(
          pointInPolygon(corner, polygon),
          [
            `${testCase.def.kind} ${testCase.sizeName}`,
            testCase.direction ? `direction=${testCase.direction}` : "direction=none",
            `${corner.name} corner escaped its silhouette`,
            `corner=${JSON.stringify(corner)}`,
            `rect=${JSON.stringify(rect)}`,
            `polygon=${JSON.stringify(polygon)}`,
          ].join("; "),
        ).toBe(true);
      }
    },
  );

  it("keeps rectangle and process on the legacy center bbox inset", () => {
    for (const type of ["rectangle", "process"] as const) {
      const def = objectDefForType(type);
      if (!def?.textSlot) throw new Error(`missing text slot for ${type}`);

      for (const sizeCase of SIZE_CASES) {
        const object = buildObject({
          def,
          sizeName: sizeCase.name,
          scale: sizeCase.scale,
        });

        expect(resolveTextSlot(def.textSlot, object).rect).toEqual(
          expectedLegacyCenterRect(object),
        );
      }
    }
  });
});
