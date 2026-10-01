import { describe, expect, it } from "bun:test";
import { canvasThemePreset, FIGJAM_CANVAS_STYLE } from "../../../../theme/canvas-style";
import { mixColors } from "../../../../theme/color-math";
import { iconTileModeFor, resolveIconPaint, resolveIconTilePaint } from "../../../../theme/palette";
import { iconGlyphStrokeWidthForViewBox } from "../icon-glyphs";
import { ICON_TILE, iconBareGlyphStrokeWidth, iconTileGlyphStrokeWidth, iconTileLayout } from "../icon-tile";

const LIGHT = canvasThemePreset("schematic-light");
const DARK = canvasThemePreset("schematic-dark");

describe("icon tile layout", () => {
  it("fills the glyph box (the smaller side, centered) and centers the glyph inset 22% on it", () => {
    const layout = iconTileLayout(100, 64);
    expect(layout.tile).toEqual({ x: 18, y: 0, width: 64, height: 64 });
    const glyph = 64 * (1 - ICON_TILE.glyphInsetRatio * 2);
    expect(layout.glyph.width).toBeCloseTo(glyph, 10);
    expect(layout.glyph.x).toBeCloseTo(18 + (64 - glyph) / 2, 10);
    expect(layout.glyph.y).toBeCloseTo((64 - glyph) / 2, 10);
  });

  it("caps the glyph at 56px on a large tile, centered", () => {
    const layout = iconTileLayout(192, 160);
    expect(layout.tile).toEqual({ x: 16, y: 0, width: 160, height: 160 });
    expect(layout.glyph).toEqual({ x: 16 + 52, y: 52, width: ICON_TILE.maxGlyphPx, height: ICON_TILE.maxGlyphPx });
    // The cap binds from 100px (100 × 0.56 = 56) up.
    expect(iconTileLayout(100, 100).glyph.width).toBeCloseTo(56, 10);
    expect(iconTileLayout(99, 99).glyph.width).toBeLessThan(56);
  });

  it("strokes tile glyphs at a fixed weight in their own units, bare glyphs at the size-normalized weight", () => {
    expect(iconTileGlyphStrokeWidth(24)).toBeCloseTo(1.76, 2);
    expect(iconTileGlyphStrokeWidth(18)).toBeCloseTo(1.32, 2);
    expect(iconBareGlyphStrokeWidth(120, { viewBoxSize: 24 })).toBe(iconGlyphStrokeWidthForViewBox(120, 24));
    expect(iconBareGlyphStrokeWidth(120, undefined)).toBe(iconGlyphStrokeWidthForViewBox(120, 18));
  });
});

describe("icon tile paint by size", () => {
  it("auto: solid up to iconTileSolidMaxPx (inclusive), tinted above", () => {
    expect(LIGHT.iconTileFill).toBe("auto");
    expect(LIGHT.iconTileSolidMaxPx).toBe(152);
    expect(DARK.iconTileSolidMaxPx).toBe(152);
    expect(iconTileModeFor(LIGHT, 152)).toBe("solid");
    expect(iconTileModeFor(LIGHT, 152.5)).toBe("tint");
    expect(iconTileModeFor({ ...LIGHT, iconTileFill: "solid" }, 500)).toBe("solid");
    expect(iconTileModeFor({ ...LIGHT, iconTileFill: "tint" }, 10)).toBe("tint");
  });

  it("solid tiles are resolveIconPaint's: the ink tile under the tile glyph color", () => {
    for (const style of [LIGHT, DARK]) {
      expect(resolveIconTilePaint("violet", style, 64)).toEqual({
        ...resolveIconPaint("violet", style),
        tileMode: "solid",
        tileBorderWidthPx: 0,
      });
    }
  });

  it("tinted tiles: 16% ink over the card fill, an ink border at the shape border width, an ink glyph", () => {
    for (const style of [LIGHT, DARK]) {
      const ink = style.palette.violet;
      expect(resolveIconTilePaint("violet", style, 200)).toEqual({
        tileFill: mixColors(ink, style.cardFill, 0.16),
        tileBorder: ink,
        glyph: ink,
        glyphFill: null,
        label: style.textColor,
        tileMode: "tint",
        tileBorderWidthPx: style.shapeBorderWidthPx,
      });
    }
  });

  it("white on a light board keeps its outlined tile at every size; dark boards tint the white ink", () => {
    for (const size of [48, 160]) {
      expect(resolveIconTilePaint("white", LIGHT, size)).toMatchObject({
        tileFill: LIGHT.cardFill,
        tileBorder: LIGHT.palette.white,
        glyph: LIGHT.palette.white,
        tileBorderWidthPx: 1,
      });
    }
    expect(resolveIconTilePaint("white", DARK, 160).tileFill).toBe(mixColors(DARK.palette.white, DARK.cardFill, 0.16));
  });

  it("glyph style ignores the size", () => {
    expect(resolveIconTilePaint("red", FIGJAM_CANVAS_STYLE, 500)).toEqual({
      ...resolveIconPaint("red", FIGJAM_CANVAS_STYLE),
      tileMode: null,
      tileBorderWidthPx: 0,
    });
  });
});
