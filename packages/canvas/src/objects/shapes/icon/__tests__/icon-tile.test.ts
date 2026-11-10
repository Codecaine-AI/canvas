import { describe, expect, it } from "bun:test";
import { canvasThemePreset, FIGJAM_CANVAS_STYLE } from "../../../../theme/canvas-style";
import { contrastRatio, mixColors } from "../../../../theme/color-math";
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
    // The cap binds from 93.3px (93.3 × 0.6 = 56) up.
    expect(iconTileLayout(94, 94).glyph.width).toBeCloseTo(56, 10);
    expect(iconTileLayout(93, 93).glyph.width).toBeLessThan(56);
  });

  it("strokes tile glyphs at a fixed weight in their own units, bare glyphs at the size-normalized weight", () => {
    // Referenced to a 56px box (was 64): about 2 units on Tabler's 24-unit grid.
    expect(iconTileGlyphStrokeWidth(24)).toBeCloseTo(2.01, 2);
    expect(iconTileGlyphStrokeWidth(18)).toBeCloseTo(1.51, 2);
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

  it("solid tiles are the hue's text step under the tile glyph color, with no edge", () => {
    // Main's solid ink tiles, which Ford picked over the node-paint tiles (stage C round 3).
    const tiles = {
      light: { violet: "#6940A5", yellow: "#805F01", orange: "#9D530D", red: "#C62121", gray: "#666562" },
      dark: { violet: "#AB7DF8", yellow: "#D29922", orange: "#DD7330", red: "#F85B53", gray: "#9198A1" },
    } as const;
    for (const [style, tone] of [[LIGHT, "light"], [DARK, "dark"]] as const) {
      for (const color of ["violet", "yellow", "orange", "red", "gray"] as const) {
        const tile = resolveIconTilePaint(color, style, 64);
        expect(tile).toEqual({
          ...resolveIconPaint(color, style),
          tileFill: tiles[tone][color],
          tileBorder: null,
          glyph: style.iconTileGlyphColor,
          tileMode: "solid",
          tileBorderWidthPx: 0,
        });
        expect(contrastRatio(tile.glyph, tile.tileFill!)).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(LIGHT.iconTileGlyphColor).toBe("#FFFFFF");
    expect(DARK.iconTileGlyphColor).toBe(DARK.boardBackground);
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

  it("white: an outlined card tile on a light board (1px solid, 2px tinted), the solid white ink on a dark one", () => {
    expect(resolveIconTilePaint("white", LIGHT, 48)).toMatchObject({
      tileFill: LIGHT.cardFill,
      tileBorder: LIGHT.palette.white,
      glyph: LIGHT.palette.white,
      tileBorderWidthPx: 1,
    });
    expect(resolveIconTilePaint("white", LIGHT, 160)).toMatchObject({
      tileFill: LIGHT.cardFill,
      tileBorder: LIGHT.palette.white,
      glyph: LIGHT.palette.white,
      tileBorderWidthPx: 2,
    });
    expect(resolveIconTilePaint("white", DARK, 48)).toMatchObject({ tileFill: DARK.palette.white, tileBorder: null, glyph: DARK.boardBackground });
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
