/**
 * Theme-aware paint resolvers (theme/palette.ts). Under figjam they must
 * reproduce the long-standing role tables exactly (the default theme renders
 * unchanged); under the schematic themes they follow the contract's
 * layer-cake / tile / card rules.
 */
import { describe, expect, it } from "bun:test";
import { CANVAS_COLORS } from "../../state/schema/colors";
import { FIGJAM_CANVAS_STYLE, canvasThemePreset } from "../canvas-style";
import { contrastRatio, mixColors, oklabDistance, oklabLightness } from "../color-math";
import {
  resolveConnectorPaint,
  resolveConnectorStroke,
  resolveIconPaint,
  resolveInk,
  resolveSectionColors,
  resolveSectionPaint,
  resolveShapeColors,
  resolveShapePaint,
  resolveStickyFill,
  resolveStickyPaint,
} from "../palette";

const LIGHT = canvasThemePreset("schematic-light");
const DARK = canvasThemePreset("schematic-dark");

describe("figjam paints equal the role tables", () => {
  it.each([...CANVAS_COLORS])("%s", (color) => {
    const shape = resolveShapeColors(color);
    const section = resolveSectionColors(color);
    expect(resolveInk(color, FIGJAM_CANVAS_STYLE)).toBe(resolveConnectorStroke(color));
    expect(resolveShapePaint(color, FIGJAM_CANVAS_STYLE)).toEqual({
      fill: shape.fill,
      border: shape.border,
      text: "#000000",
    });
    expect(resolveConnectorPaint(color, FIGJAM_CANVAS_STYLE)).toEqual({ stroke: resolveConnectorStroke(color) });
    // Paper sticky body text: INSET_BODY_TEXT_SLOT's rgba(0, 0, 0, 0.8).
    expect(resolveStickyPaint(color, FIGJAM_CANVAS_STYLE)).toEqual({
      fill: resolveStickyFill(color),
      border: null,
      rule: null,
      text: "rgba(0, 0, 0, 0.8)",
      shadow: true,
    });
    // Glyph icons: ink stroke, shape-fill interiors, no tile (IconShapeBody / static-svg).
    expect(resolveIconPaint(color, FIGJAM_CANVAS_STYLE)).toEqual({
      tileFill: null,
      tileBorder: null,
      glyph: shape.border,
      glyphFill: shape.fill,
      label: "#000000",
    });
    // Flat sections: the frame border IS the chip fill; depth changes nothing.
    for (const depth of [1, 2, 5]) {
      expect(resolveSectionPaint(color, depth, FIGJAM_CANVAS_STYLE)).toMatchObject({
        fill: section.tint,
        border: section.chip.fill,
        chipFill: section.chip.fill,
        chipBorder: section.chip.border,
        headerText: "#000000",
      });
    }
  });

  it("a palette override recolors the figjam inks", () => {
    const style = { ...FIGJAM_CANVAS_STYLE, palette: { ...FIGJAM_CANVAS_STYLE.palette, teal: "#00AA88" } };
    expect(resolveShapePaint("teal", style).border).toBe("#00AA88");
    expect(resolveConnectorPaint("teal", style).stroke).toBe("#00AA88");
    expect(resolveSectionPaint("teal", 1, style).chipBorder).toBe("#00AA88");
  });
});

describe("layer-cake sections", () => {
  it("mixes the ink into the base by depth: t0, t0 + step, …, capped at tmax", () => {
    expect(resolveSectionPaint("teal", 1, LIGHT).fill).toBe("#EEF7F6"); // mix(#0F8A7A, #FFFFFF, .07)
    expect(resolveSectionPaint("teal", 2, LIGHT).fill).toBe(mixColors("#0F8A7A", "#FFFFFF", 0.105));
    expect(resolveSectionPaint("teal", 3, LIGHT).fill).toBe(mixColors("#0F8A7A", "#FFFFFF", 0.14));
    expect(resolveSectionPaint("teal", 4, LIGHT).fill).toBe(mixColors("#0F8A7A", "#FFFFFF", 0.16));
    expect(resolveSectionPaint("teal", 9, LIGHT).fill).toBe(mixColors("#0F8A7A", "#FFFFFF", 0.16));
  });

  it("derives border, chip, and chip border from the ink", () => {
    const paint = resolveSectionPaint("teal", 1, LIGHT);
    expect(paint.border).toBe("rgba(15, 138, 122, 0.5)");
    expect(paint.chipFill).toBe(mixColors("#0F8A7A", paint.fill, 0.16));
    expect(paint.chipBorder).toBe("rgba(15, 138, 122, 0.5)");
    expect(paint.headerText).toBe("#0F1E36");
    expect(resolveSectionPaint("teal", 1, DARK).chipFill).toBe(
      mixColors("#5DE4C7", resolveSectionPaint("teal", 1, DARK).fill, 0.2),
    );
  });

  it.each([
    ["schematic-light", LIGHT],
    ["schematic-dark", DARK],
  ] as const)("keeps the header detail at ≥ 3:1 on its chip for every color (%s)", (_id, style) => {
    for (const color of CANVAS_COLORS) {
      for (const depth of [1, 2, 3]) {
        const paint = resolveSectionPaint(color, depth, style);
        expect(contrastRatio(paint.headerDetail, paint.chipFill)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("dark preset: every level's fill stands clear of the cards and nested levels stay distinct", () => {
    for (const color of CANVAS_COLORS) {
      const fills = [1, 2, 3, 4].map((depth) => resolveSectionPaint(color, depth, DARK).fill);
      for (const fill of fills) expect(oklabDistance(fill, DARK.cardFill)).toBeGreaterThanOrEqual(0.03);
      const lightness = fills.map((fill) => oklabLightness(fill));
      // d1 → d2 → d3 step by a visible amount; d3 → d4 is the short step into the cap.
      expect(lightness[1]! - lightness[0]!).toBeGreaterThanOrEqual(0.015);
      expect(lightness[2]! - lightness[1]!).toBeGreaterThanOrEqual(0.015);
      expect(lightness[3]!).toBeGreaterThan(lightness[2]!);
      // Past the cap every level is the cap level.
      expect(resolveSectionPaint(color, 7, DARK).fill).toBe(resolveSectionPaint(color, 4, DARK).fill);
    }
    // Top-level sections keep their natural hue: no level-1 fill needs the guard.
    for (const color of CANVAS_COLORS.filter((candidate) => candidate !== "white")) {
      expect(resolveSectionPaint(color, 1, DARK).fill).toBe(mixColors(DARK.palette[color], "#14171F", 0.1));
    }
    // The gray chain (white takes it on dark boards) sits below the raised cards at every depth.
    for (const depth of [1, 2, 3, 4]) {
      expect(oklabLightness(resolveSectionPaint("gray", depth, DARK).fill)).toBeLessThan(
        oklabLightness(DARK.cardFill) - 0.03,
      );
    }
  });

  it("dark guard: a fill on the cards moves to the nearest clear weight, either way, never folding onto its parent", () => {
    const teal = (weight: number) => mixColors("#5DE4C7", "#14171F", weight);
    // Cards dressed in teal's natural top-level fill: the nearest clear weight
    // is below it (t 0.06 is 0.04 away; above, t 0.145 is 0.045 away) …
    const onTop = { ...DARK, cardFill: teal(0.1) };
    const down = resolveSectionPaint("teal", 1, onTop).fill;
    expect(down).toBe(teal(0.06));
    expect(oklabDistance(down, onTop.cardFill)).toBeGreaterThanOrEqual(0.03);
    // … and the next level still reads as its own layer above the moved one.
    const next = resolveSectionPaint("teal", 2, onTop).fill;
    expect(oklabLightness(next) - oklabLightness(down)).toBeGreaterThanOrEqual(0.015);
    // Cards just under the top level: stepping down only approaches them
    // (and t0 / 2 stops it), so the level moves up instead.
    const below = { ...DARK, cardFill: teal(0.07) };
    const up = resolveSectionPaint("teal", 1, below).fill;
    expect(oklabLightness(up)).toBeGreaterThan(oklabLightness(teal(0.1)));
    expect(oklabDistance(up, below.cardFill)).toBeGreaterThanOrEqual(0.03);
    // With no clear weight in [t0 / 2, tmax] the level keeps its own t(d):
    // capped at t0, and every step down only nears cards sitting at t 0.075.
    const boxedIn = { ...DARK, sectionTintMax: 0.1, cardFill: teal(0.075) };
    expect(resolveSectionPaint("teal", 1, boxedIn).fill).toBe(teal(0.1));
  });

  it("dark guard: a failed search never reuses a parent that moved past the level's own t(d)", () => {
    // Cards at red's t 0.145 fill: level 2 (t 0.15) can only clear them by
    // moving up to t 0.20 — level 3's own t(d). No weight above that is both a
    // distinct layer and clear of the cards, so level 3's search fails; it must
    // still deepen past its parent (to the cap) instead of repeating it.
    const style = { ...DARK, cardFill: "#36282F" };
    const red = (weight: number) => mixColors(DARK.palette.red, "#14171F", weight);
    const fills = [1, 2, 3, 4].map((depth) => resolveSectionPaint("red", depth, style).fill);
    expect(fills.slice(0, 3)).toEqual([red(0.095), red(0.2), red(0.22)]);
    expect(new Set(fills.slice(0, 3)).size).toBe(3);
    const lightness = fills.map((fill) => oklabLightness(fill));
    expect(lightness[1]!).toBeGreaterThan(lightness[0]!);
    expect(lightness[2]!).toBeGreaterThan(lightness[1]!);
    // Level 4's own t(d) is the cap, where level 3 already sits: past the cap levels share it.
    expect(fills[3]).toBe(fills[2]);
  });

  it("with no tint step every level keeps the top level's (guarded) fill", () => {
    const flatStep = { ...DARK, sectionTintStep: 0 };
    for (const color of CANVAS_COLORS) {
      const top = resolveSectionPaint(color, 1, flatStep).fill;
      expect([2, 3, 6].map((depth) => resolveSectionPaint(color, depth, flatStep).fill)).toEqual([top, top, top]);
    }
  });

  it("the light theme never applies the guard (base and card are both white)", () => {
    for (const color of CANVAS_COLORS.filter((candidate) => candidate !== "white")) {
      expect(resolveSectionPaint(color, 1, LIGHT).fill).toBe(mixColors(LIGHT.palette[color], "#FFFFFF", 0.07));
    }
  });

  it("white: a card-colored section on light boards, the gray rule on dark ones", () => {
    expect(resolveSectionPaint("white", 2, LIGHT)).toMatchObject({
      fill: "#FFFFFF",
      border: "#D5DBE3",
      chipFill: "#EAEDF1", // mix(hairline, card, .5)
      chipBorder: "#D5DBE3",
      headerText: "#0F1E36",
    });
    for (const depth of [1, 2, 3]) {
      expect(resolveSectionPaint("white", depth, DARK)).toEqual(resolveSectionPaint("gray", depth, DARK));
    }
  });

  it("header icon: tile = ink with the tile glyph color; the white tile is outlined on light boards", () => {
    expect(resolveSectionPaint("teal", 1, LIGHT)).toMatchObject({
      iconTile: "#0F8A7A",
      iconTileBorder: null,
      iconGlyph: "#FFFFFF",
    });
    expect(resolveSectionPaint("white", 1, LIGHT)).toMatchObject({
      iconTile: "#FFFFFF",
      iconTileBorder: "#0F1E36",
      iconGlyph: "#0F1E36",
    });
    // Glyph mode has no tile: the "tile" is the chip itself.
    const glyphMode = { ...LIGHT, iconStyle: "glyph" as const };
    const paint = resolveSectionPaint("teal", 1, glyphMode);
    expect(paint).toMatchObject({ iconTile: paint.chipFill, iconTileBorder: null, iconGlyph: "#0F8A7A" });
  });
});

describe("schematic shapes, icons, stickies, connectors", () => {
  it("card shapes: card fill, ink border, theme text", () => {
    expect(resolveShapePaint("blue", LIGHT)).toEqual({ fill: "#FFFFFF", border: "#2F5BD3", text: "#0F1E36" });
    expect(resolveShapePaint("blue", DARK)).toEqual({ fill: "#32363E", border: "#82AAFF", text: "#E4E6F2" });
  });

  it("tile icons: ink tile and the theme's tile glyph color", () => {
    expect(resolveIconPaint("green", LIGHT)).toEqual({
      tileFill: "#2F8A3E",
      tileBorder: null,
      glyph: "#FFFFFF",
      glyphFill: null,
      label: "#0F1E36",
    });
    expect(resolveIconPaint("green", DARK)).toMatchObject({ tileFill: "#85E89D", glyph: "#14171F" });
    // White: outlined on light boards, a solid light tile on dark ones.
    expect(resolveIconPaint("white", LIGHT)).toMatchObject({
      tileFill: "#FFFFFF",
      tileBorder: "#0F1E36",
      glyph: "#0F1E36",
    });
    expect(resolveIconPaint("white", DARK)).toMatchObject({ tileFill: "#E4E6F2", tileBorder: null, glyph: "#14171F" });
  });

  it("card stickies: card + hairline border + ink left rule, no shadow", () => {
    expect(resolveStickyPaint("yellow", LIGHT)).toEqual({
      fill: "#FFFFFF",
      border: "#D5DBE3",
      rule: "#A87A00",
      text: "#0F1E36",
      shadow: false,
    });
    expect(resolveStickyPaint("yellow", DARK)).toMatchObject({ fill: "#32363E", border: "#2E3342", rule: "#FFD580" });
  });

  it("connectors stroke with the ink", () => {
    expect(resolveConnectorPaint("gray", LIGHT)).toEqual({ stroke: "#5B6578" });
    expect(resolveConnectorPaint("gray", DARK)).toEqual({ stroke: "#6B7394" });
  });

  it("figjam-mode text stays readable when a dark theme borrows tint shapes or paper stickies", () => {
    const borrowed = { ...DARK, shapeFill: "tint" as const, stickyStyle: "paper" as const };
    const shape = resolveShapePaint("blue", borrowed);
    const sticky = resolveStickyPaint("blue", borrowed);
    expect(contrastRatio(shape.text, shape.fill)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(sticky.text, sticky.fill)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("paint cache", () => {
  it("resolves each paint once per style object and hands back the same frozen value", () => {
    const style = { ...DARK };
    const first = resolveSectionPaint("teal", 4, style);
    expect(resolveSectionPaint("teal", 4, style)).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(resolveShapePaint("teal", FIGJAM_CANVAS_STYLE)).toBe(resolveShapePaint("teal", FIGJAM_CANVAS_STYLE));
    // A different style object (an edited setting) resolves afresh.
    const edited = { ...DARK, cardFill: "#36282F" };
    expect(resolveSectionPaint("red", 3, edited)).not.toEqual(resolveSectionPaint("red", 3, style));
    // Flat (figjam) section paints ignore depth: one entry serves every level.
    expect(resolveSectionPaint("blue", 5, FIGJAM_CANVAS_STYLE)).toBe(resolveSectionPaint("blue", 1, FIGJAM_CANVAS_STYLE));
  });
});
