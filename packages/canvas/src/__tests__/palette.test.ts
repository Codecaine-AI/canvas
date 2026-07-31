import { describe, expect, it } from "bun:test";
import {
  CANVAS_COLORS,
  CANVAS_HUES,
  isCanvasColor,
} from "../state/schema/colors";
import {
  CANVAS_PALETTE,
  resolveConnectorStroke,
  resolveSectionColors,
  resolveShapeColors,
  resolveStickyFill,
  resolveSwatchPreview,
} from "../theme/palette";
import type { CanvasColor } from "../theme/palette";

const HEX_RE = /^#[0-9A-F]{6}$/i;

const EXPECTED: Record<
  CanvasColor,
  {
    swatch: string;
    shapeFill: string;
    sticky: string;
    wash: string;
    ink: string;
    chipFill: string;
    chipBorder: string;
  }
> = {
  gray: { swatch: "#757575", shapeFill: "#E6E6E6", sticky: "#E6E6E6", wash: "#F9F9F9", ink: "#757575", chipFill: "#E6E6E6", chipBorder: "#757575" },
  red: { swatch: "#D5322F", shapeFill: "#FFD2CC", sticky: "#FFBFB7", wash: "#FEF3F1", ink: "#D5322F", chipFill: "#FFD2CC", chipBorder: "#D5322F" },
  orange: { swatch: "#EB7500", shapeFill: "#FFE0C2", sticky: "#FFE0C2", wash: "#FFF7F0", ink: "#EB7500", chipFill: "#FFE0C2", chipBorder: "#EB7500" },
  yellow: { swatch: "#E8A302", shapeFill: "#FFECBD", sticky: "#FFE299", wash: "#FFFBF0", ink: "#E8A302", chipFill: "#FFECBD", chipBorder: "#E8A302" },
  green: { swatch: "#019142", shapeFill: "#C5E9CB", sticky: "#C5E9CB", wash: "#F0F8F2", ink: "#019142", chipFill: "#C5E9CB", chipBorder: "#019142" },
  teal: { swatch: "#369E94", shapeFill: "#C6FAF6", sticky: "#C6FAF6", wash: "#EAFDFB", ink: "#369E94", chipFill: "#C6FAF6", chipBorder: "#369E94" },
  blue: { swatch: "#1A5CDF", shapeFill: "#CDDFFF", sticky: "#B9D2FF", wash: "#F1F6FE", ink: "#1A5CDF", chipFill: "#CDDFFF", chipBorder: "#1A5CDF" },
  violet: { swatch: "#9747FF", shapeFill: "#DCCCFF", sticky: "#DCCCFF", wash: "#F8F5FF", ink: "#9747FF", chipFill: "#DCCCFF", chipBorder: "#9747FF" },
  pink: { swatch: "#B74D85", shapeFill: "#F9D1E3", sticky: "#F9D1E3", wash: "#FDF3F7", ink: "#B74D85", chipFill: "#F9D1E3", chipBorder: "#B74D85" },
  white: { swatch: "#FFFFFF", shapeFill: "#FFFFFF", sticky: "#FFFFFF", wash: "#FFFFFF", ink: "#757980", chipFill: "#DBDEE3", chipBorder: "#C1C4CB" },
};

describe("state/schema/colors — the 10-id CanvasColor vocabulary", () => {
  it("keeps the 10 hue ids in picker order", () => {
    expect(CANVAS_HUES).toEqual([
      "gray",
      "red",
      "orange",
      "yellow",
      "green",
      "teal",
      "blue",
      "violet",
      "pink",
      "white",
    ]);
    expect(CANVAS_COLORS).toEqual(CANVAS_HUES);
    expect(new Set(CANVAS_COLORS).size).toBe(10);
  });

  it("accepts only bare hue ids", () => {
    for (const id of CANVAS_COLORS) {
      expect(isCanvasColor(id)).toBe(true);
    }
    expect(isCanvasColor("blue-soft")).toBe(false);
    for (const bad of ["black", "red-bold", "Red", "", "gray-Soft", 42, null, undefined, {}]) {
      expect(isCanvasColor(bad)).toBe(false);
    }
  });
});

describe("palette.ts — CANVAS_PALETTE table completeness", () => {
  it("has an entry for every one of the 10 CanvasColor ids", () => {
    for (const id of CANVAS_COLORS) {
      expect(CANVAS_PALETTE[id]).toBeDefined();
    }
    expect(Object.keys(CANVAS_PALETTE).sort()).toEqual([...CANVAS_COLORS].sort());
  });

  it("matches the authoritative ink/fill/wash table", () => {
    for (const id of CANVAS_COLORS) {
      const swatch = CANVAS_PALETTE[id];
      const expected = EXPECTED[id];
      expect(swatch.swatch).toBe(expected.swatch);
      expect(swatch.shape).toEqual({ fill: expected.shapeFill, border: expected.ink });
      expect(swatch.sticky).toBe(expected.sticky);
      expect(swatch.connector).toBe(expected.ink);
      expect(swatch.section).toEqual({
        tint: expected.wash,
        chip: { fill: expected.chipFill, border: expected.chipBorder },
      });
    }
  });

  it("every hex cell is a valid 6-digit hex string and every shape border is present", () => {
    for (const id of CANVAS_COLORS) {
      const swatch = CANVAS_PALETTE[id];
      expect(swatch.swatch).toMatch(HEX_RE);
      expect(swatch.shape.fill).toMatch(HEX_RE);
      expect(swatch.shape.border).toMatch(HEX_RE);
      expect(swatch.section.tint).toMatch(HEX_RE);
      expect(swatch.section.chip.fill).toMatch(HEX_RE);
      expect(swatch.section.chip.border).toMatch(HEX_RE);
      expect(swatch.sticky).toMatch(HEX_RE);
      expect(swatch.connector).toMatch(HEX_RE);
    }
  });
});

describe("palette.ts — role resolvers", () => {
  it("resolveShapeColors / resolveSectionColors / resolveStickyFill / resolveConnectorStroke / resolveSwatchPreview agree with CANVAS_PALETTE", () => {
    for (const id of CANVAS_COLORS) {
      const swatch = CANVAS_PALETTE[id];
      expect(resolveShapeColors(id)).toEqual(swatch.shape);
      expect(resolveSectionColors(id)).toEqual(swatch.section);
      expect(resolveStickyFill(id)).toBe(swatch.sticky);
      expect(resolveConnectorStroke(id)).toBe(swatch.connector);
      expect(resolveSwatchPreview(id)).toBe(swatch.swatch);
    }
  });
});
