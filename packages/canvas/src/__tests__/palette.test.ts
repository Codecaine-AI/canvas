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
  red: { swatch: "#F24822", shapeFill: "#FFC7C2", sticky: "#FFAFA3", wash: "#FFF5F5", ink: "#F24822", chipFill: "#FFC7C2", chipBorder: "#F24822" },
  orange: { swatch: "#EB7500", shapeFill: "#FFE0C2", sticky: "#FFE0C2", wash: "#FFF7F0", ink: "#EB7500", chipFill: "#FFE0C2", chipBorder: "#EB7500" },
  yellow: { swatch: "#E8A302", shapeFill: "#FFECBD", sticky: "#FFE299", wash: "#FFFBF0", ink: "#E8A302", chipFill: "#FFECBD", chipBorder: "#E8A302" },
  green: { swatch: "#14AE5C", shapeFill: "#DDF8E2", sticky: "#DDF8E2", wash: "#EBFFEE", ink: "#14AE5C", chipFill: "#DDF8E2", chipBorder: "#14AE5C" },
  teal: { swatch: "#369E94", shapeFill: "#C6FAF6", sticky: "#C6FAF6", wash: "#EAFDFB", ink: "#369E94", chipFill: "#C6FAF6", chipBorder: "#369E94" },
  blue: { swatch: "#0D99FF", shapeFill: "#C2E5FF", sticky: "#A8DAFF", wash: "#F5FBFF", ink: "#0D99FF", chipFill: "#C2E5FF", chipBorder: "#0D99FF" },
  violet: { swatch: "#9747FF", shapeFill: "#DCCCFF", sticky: "#DCCCFF", wash: "#F8F5FF", ink: "#9747FF", chipFill: "#DCCCFF", chipBorder: "#9747FF" },
  pink: { swatch: "#F849C1", shapeFill: "#FFC2EC", sticky: "#FFC2EC", wash: "#FFF0FA", ink: "#F849C1", chipFill: "#FFC2EC", chipBorder: "#F849C1" },
  white: { swatch: "#FFFFFF", shapeFill: "#FFFFFF", sticky: "#FFFFFF", wash: "#FFFFFF", ink: "#757575", chipFill: "#E6E6E6", chipBorder: "#C4C4C4" },
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
