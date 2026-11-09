/**
 * Theme-aware paint resolvers (theme/palette.ts). Under figjam they must
 * reproduce the long-standing role tables exactly (the default theme renders
 * unchanged); under the schematic themes they follow the contract's
 * layer-cake / tile / card rules.
 */
import { describe, expect, it } from "bun:test";
import { CANVAS_COLORS } from "../../state/schema/colors";
import { FIGJAM_CANVAS_STYLE, canvasThemePreset } from "../canvas-style";
import {
  contrastRatio,
  ensureContrast,
  formatHex,
  mixColors,
  oklab,
  oklabChroma,
  oklabDistance,
  oklabLightness,
  parseColor,
} from "../color-math";
import {
  resolveConnectorPaint,
  resolveConnectorStroke,
  resolveIconPaint,
  resolveInk,
  resolveLabelChipBorder,
  resolveSectionColors,
  resolveSectionPaint,
  resolveShapeColors,
  resolveShapePaint,
  resolveStickyFill,
  resolveStickyPaint,
} from "../palette";

const LIGHT = canvasThemePreset("schematic-light");

/** An rgba() paint composited over an opaque fill, as the frame edge renders. */
function overFill(paint: string, fill: string): string {
  const top = parseColor(paint)!;
  const base = parseColor(fill)!;
  const mix = (a: number, b: number) => a * top.a + b * (1 - top.a);
  return formatHex({ r: mix(top.r, base.r), g: mix(top.g, base.g), b: mix(top.b, base.b), a: 1 });
}
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
      cardShadow: null,
      codeChip: null,
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
    // The lightness is the mix's at t(d); the chroma is the mix's, cut to the section cap.
    for (const [depth, weight] of [[1, 0.04], [2, 0.08], [3, 0.12], [4, 0.16], [9, 0.16]] as const) {
      const fill = resolveSectionPaint("teal", depth, LIGHT).fill;
      const mix = mixColors("#0D7164", "#FDFDFD", weight);
      expect(Math.abs(oklabLightness(fill) - oklabLightness(mix))).toBeLessThan(0.002);
      expect(oklabChroma(fill)).toBeLessThanOrEqual(oklabChroma(mix) + 0.001);
    }
    expect(resolveSectionPaint("teal", 2, LIGHT).fill).toBe("#EAF2F1");
  });

  it("light preset: a section never outweighs its nodes, at top level chroma 0.02 (yellow 0.04), growing with the ink weight", () => {
    for (const color of CANVAS_COLORS.filter((candidate) => candidate !== "white" && candidate !== "gray")) {
      const cap = color === "yellow" ? 0.04 : 0.02;
      for (const [depth, weight] of [[2, 0.08], [3, 0.12], [4, 0.16]] as const) {
        expect(oklabChroma(resolveSectionPaint(color, depth, LIGHT).fill)).toBeLessThanOrEqual((cap * weight) / 0.08 + 0.0015);
      }
      expect(oklabChroma(resolveSectionPaint(color, 2, LIGHT).fill)).toBeLessThanOrEqual(oklabChroma(resolveShapePaint(color, LIGHT).fill) + 0.001);
    }
    // The butter field on board 12 (chroma 0.076) is now a pale cream.
    expect(resolveSectionPaint("yellow", 2, LIGHT).fill).toBe("#F9F1DA");
    // Dark boards (card shapes) keep the uncapped mix.
    expect(oklabChroma(resolveSectionPaint("violet", 3, DARK).fill)).toBeGreaterThan(0.045);
  });

  it("light preset: sections are light zones, and each nested level still steps and keeps a visible edge", () => {
    // Top-level sections are depth 2 (the page is depth 1). Every level stays
    // at OKLab L 0.9 or above (round 3: 0.83 at depth 4, 0.89 at top level).
    for (const color of CANVAS_COLORS.filter((candidate) => candidate !== "white")) {
      expect(oklabLightness(resolveSectionPaint(color, 2, LIGHT).fill)).toBeGreaterThanOrEqual(0.945);
      for (const depth of [2, 3, 4, 5]) {
        const paint = resolveSectionPaint(color, depth, LIGHT);
        expect(oklabLightness(paint.fill)).toBeGreaterThanOrEqual(0.895);
        // The tint steps are small (about 0.02 L), so the frame edge marks
        // where a group ends: the ink at 0.75 over the fill, at least 2.5:1.
        expect(contrastRatio(overFill(paint.border, paint.fill), paint.fill)).toBeGreaterThanOrEqual(2.5);
      }
    }
    // A nested level still deepens from its parent, in its own hue or another.
    for (const color of CANVAS_COLORS.filter((candidate) => candidate !== "white" && candidate !== "gray")) {
      for (const depth of [3, 4]) {
        const step = oklabLightness(resolveSectionPaint(color, depth - 1, LIGHT).fill) - oklabLightness(resolveSectionPaint(color, depth, LIGHT).fill);
        expect(step).toBeGreaterThanOrEqual(0.013);
      }
    }
    expect(oklabDistance(resolveSectionPaint("blue", 3, LIGHT).fill, resolveSectionPaint("teal", 4, LIGHT).fill)).toBeGreaterThanOrEqual(0.02);
  });

  it.each([
    ["schematic-light", LIGHT],
    ["schematic-dark", DARK],
  ] as const)("gray stops deepening at the top-level tone, so a deep gray never reads as a disabled slab (%s)", (_id, style) => {
    const top = resolveSectionPaint("gray", 2, style).fill;
    expect(resolveSectionPaint("gray", 1, style).fill).not.toBe(top);
    for (const depth of [3, 4, 7]) expect(resolveSectionPaint("gray", depth, style).fill).toBe(top);
    // Chromatic hues keep stepping.
    expect(resolveSectionPaint("blue", 4, style).fill).not.toBe(resolveSectionPaint("blue", 2, style).fill);
  });

  it("derives border, chip, and chip border from the ink", () => {
    const paint = resolveSectionPaint("teal", 1, LIGHT);
    expect(paint.border).toBe("rgba(13, 113, 100, 0.75)");
    expect(paint.chipFill).toBe(mixColors("#0D7164", paint.fill, 0.16));
    expect(paint.chipBorder).toBe("rgba(13, 113, 100, 0.5)");
    expect(paint.headerText).toBe("#1F1F1F");
    expect(resolveSectionPaint("teal", 1, DARK).chipFill).toBe(
      mixColors("#39C5CF", resolveSectionPaint("teal", 1, DARK).fill, 0.2),
    );
  });

  it.each([
    ["schematic-light", LIGHT],
    ["schematic-dark", DARK],
  ] as const)("keeps the header title at ≥ 4.5:1 on its chip for every color (%s)", (_id, style) => {
    for (const color of CANVAS_COLORS) {
      for (const depth of [1, 2, 3, 4]) {
        const paint = resolveSectionPaint(color, depth, style);
        expect(contrastRatio(paint.headerText, paint.chipFill)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("light preset: a top-level section shows its hue, and the dark preset keeps its own tint", () => {
    for (const color of CANVAS_COLORS.filter((candidate) => candidate !== "white" && candidate !== "gray")) {
      expect(oklabDistance(resolveSectionPaint(color, 2, LIGHT).fill, LIGHT.boardBackground)).toBeGreaterThanOrEqual(0.035);
    }
    expect(LIGHT.sectionTintBase).toBe(0.04);
    expect(DARK.sectionTintBase).toBe(0.1);
  });

  it("dark preset: every level's fill stands clear of the cards and nested levels stay distinct", () => {
    // The gray chain (white shares it on dark boards) stops at depth 2: see the gray test above.
    for (const color of CANVAS_COLORS.filter((candidate) => candidate !== "white" && candidate !== "gray")) {
      const fills = [1, 2, 3, 4].map((depth) => resolveSectionPaint(color, depth, DARK).fill);
      fills.forEach((fill) => expect(oklabDistance(fill, DARK.cardFill)).toBeGreaterThanOrEqual(0.03));
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
      expect(resolveSectionPaint(color, 1, DARK).fill).toBe(mixColors(DARK.palette[color], "#0D1117", 0.1));
    }
    // The gray chain (white takes it on dark boards) sits below the raised cards at every depth.
    for (const depth of [1, 2, 3, 4]) {
      expect(oklabLightness(resolveSectionPaint("gray", depth, DARK).fill)).toBeLessThan(oklabLightness(DARK.cardFill) - 0.03);
      expect(resolveSectionPaint("white", depth, DARK)).toEqual(resolveSectionPaint("gray", depth, DARK));
    }
  });

  it("dark guard: a fill on the cards moves to the nearest clear weight, either way, never folding onto its parent", () => {
    const teal = (weight: number) => mixColors("#39C5CF", "#0D1117", weight);
    // Cards dressed in teal just past its natural top-level fill (t 0.1): the
    // nearest clear weight is below it (t 0.06 is 0.04 away; above, t 0.15 is
    // 0.05 away) …
    const onTop = { ...DARK, cardFill: teal(0.105) };
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
    const style = { ...DARK, cardFill: "#2F1C20" };
    const red = (weight: number) => mixColors(DARK.palette.red, "#0D1117", weight);
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

  it("the light theme never applies the guard (base and card are both near-white)", () => {
    // Yellow's and orange's anchors are not text steps: their fills follow their own rule (see "light yellow" below).
    for (const color of CANVAS_COLORS.filter((candidate) => !["white", "gray", "yellow", "orange"].includes(candidate))) {
      const mix = mixColors(LIGHT.palette[color], "#FDFDFD", 0.04);
      expect(Math.abs(oklabLightness(resolveSectionPaint(color, 1, LIGHT).fill) - oklabLightness(mix))).toBeLessThan(0.002);
    }
  });

  it("white: a light page and nested groups with a visible edge, the gray rule on dark boards", () => {
    expect(resolveSectionPaint("white", 1, LIGHT)).toMatchObject({
      fill: LIGHT.boardBackground,
      border: LIGHT.hairlineColor,
      chipBorder: LIGHT.hairlineColor,
      headerText: LIGHT.textColor,
    });
    for (const depth of [2, 3, 4]) {
      const paint = resolveSectionPaint("white", depth, LIGHT);
      expect(paint.fill).toBe(LIGHT.cardFill);
      expect(contrastRatio(paint.border, resolveSectionPaint("gray", 2, LIGHT).fill)).toBeGreaterThanOrEqual(2);
      expect(contrastRatio(paint.headerText, paint.chipFill)).toBeGreaterThanOrEqual(4.5);
    }
    for (const depth of [1, 2, 3]) {
      expect(resolveSectionPaint("white", depth, DARK)).toEqual(resolveSectionPaint("gray", depth, DARK));
    }
  });

  it("header icon: tile = ink with the tile glyph color; the white tile is outlined on light boards", () => {
    expect(resolveSectionPaint("teal", 1, LIGHT)).toMatchObject({
      iconTile: "#0D7164",
      iconTileBorder: null,
      iconGlyph: "#FFFFFF",
    });
    expect(resolveSectionPaint("white", 1, LIGHT)).toMatchObject({
      iconTile: "#F8F8F7",
      iconTileBorder: "#1F1F1F",
      iconGlyph: "#1F1F1F",
    });
    // Glyph mode has no tile: the "tile" is the chip itself.
    const glyphMode = { ...LIGHT, iconStyle: "glyph" as const };
    const paint = resolveSectionPaint("teal", 1, glyphMode);
    expect(paint).toMatchObject({ iconTile: paint.chipFill, iconTileBorder: null, iconGlyph: "#0D7164" });
  });
});

describe("schematic shapes, icons, stickies, connectors", () => {
  it("light ink-card shapes: one lightness and chroma in the ink's hue, ink border, theme text", () => {
    expect(LIGHT.shapeFill).toBe("ink-card");
    expect(resolveShapePaint("blue", LIGHT)).toMatchObject({ border: LIGHT.palette.blue, text: LIGHT.textColor });
    const chroma = (color: string) => Math.hypot(oklab(color).a, oklab(color).b);
    const hue = (color: string) => Math.atan2(oklab(color).b, oklab(color).a);
    const hues = CANVAS_COLORS.filter((candidate) => !["white", "gray"].includes(candidate));
    for (const color of hues) {
      const paint = resolveShapePaint(color, LIGHT);
      expect(paint.border).toBe(resolveInk(color, LIGHT));
      expect(Math.abs(oklabLightness(paint.fill) - (oklabLightness(LIGHT.cardFill) - 0.12))).toBeLessThan(0.003);
      // The kind reads from the fill, not only the border: chroma 0.08 (yellow 0.11, orange the most sRGB holds).
      expect(chroma(paint.fill)).toBeGreaterThanOrEqual(color === "blue" ? 0.06 : 0.075);
      if (color === "blue") expect(chroma(paint.fill)).toBeLessThan(0.07);
      expect(chroma(paint.fill)).toBeLessThan(color === "yellow" ? 0.113 : 0.091);
      expect(Math.abs(hue(paint.fill) - hue(LIGHT.palette[color]))).toBeLessThan(0.12);
    }
    // Green and teal (and teal and blue) were 0.003 / 0.005 apart at the 0.08 mix.
    for (const [a, b] of [["green", "teal"], ["teal", "blue"], ["red", "orange"], ["violet", "pink"]] as const) {
      expect(oklabDistance(resolveShapePaint(a, LIGHT).fill, resolveShapePaint(b, LIGHT).fill)).toBeGreaterThan(0.025);
    }
  });

  it("light yellow: a gold stroke at 3:1 on its node, and fills at the text step's lightness that stay yellow", () => {
    // The anchor is the yellow solid; the olive text step is only the lightness reference.
    const textStep = ensureContrast(LIGHT.palette.yellow, LIGHT.boardBackground, 4.5);
    const node = resolveShapePaint("yellow", LIGHT);
    expect(node.border).toBe(resolveInk("yellow", LIGHT));
    expect(contrastRatio(node.border, node.fill)).toBeGreaterThanOrEqual(3);
    // Lighter than the olive yellow.text (#805F01, L 0.51), though the stronger node fill pushes it darker than round 3's gold.
    expect(oklabLightness(node.border)).toBeGreaterThan(oklabLightness("#805F01") + 0.04);
    const chroma = (color: string) => Math.hypot(oklab(color).a, oklab(color).b);
    const paints: [string, string][] = [2, 3, 4].map((depth): [string, string] => [
      resolveSectionPaint("yellow", depth, LIGHT).fill,
      mixColors(textStep, LIGHT.boardBackground, Math.min(0.16, 0.04 + 0.04 * (depth - 1))),
    ]);
    for (const [fill, olive] of paints) {
      expect(Math.abs(oklabLightness(fill) - oklabLightness(olive))).toBeLessThan(0.002);
      // Yellow, not khaki: well above the olive mix, though capped as a section (0.04 at top level).
      expect(chroma(fill)).toBeGreaterThan(1.3 * chroma(olive));
    }
    // A tile glyph on the yellow solid tile is the dark text color, as the design system's yellow.on-solid.
    const tile = resolveIconPaint("yellow", LIGHT);
    expect(tile.glyph).toBe(LIGHT.textColor);
    expect(contrastRatio(LIGHT.textColor, tile.tileFill!)).toBeGreaterThanOrEqual(4.5);
  });

  it("light yellow and orange: tiles are the design-system solid under a dark glyph, strokes the solid at 3:1", () => {
    for (const [color, solid] of [["yellow", "#DFAB01"], ["orange", "#D9730D"]] as const) {
      expect(LIGHT.palette[color]).toBe(solid);
      const tile = resolveIconPaint(color, LIGHT);
      expect(tile).toMatchObject({ tileFill: solid, tileBorder: null, glyph: LIGHT.textColor });
      expect(contrastRatio(tile.glyph, solid)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(resolveInk(color, LIGHT), resolveShapePaint(color, LIGHT).fill)).toBeGreaterThanOrEqual(3);
    }
    // Orange no longer strokes the brown text step (#9D530D, L 0.52).
    expect(oklabLightness(resolveInk("orange", LIGHT))).toBeGreaterThan(oklabLightness("#9D530D") + 0.04);
    // Text-step hues keep the ink tile.
    expect(resolveIconPaint("teal", LIGHT).tileFill).toBe(resolveInk("teal", LIGHT));
  });

  it("label chip edge: figjam keeps the hairline; schematic edges take the wire's hue and read at least 1.6:1 on the chip", () => {
    const figjamStroke = resolveConnectorPaint("red", FIGJAM_CANVAS_STYLE).stroke;
    expect(resolveLabelChipBorder(FIGJAM_CANVAS_STYLE, figjamStroke)).toBe(FIGJAM_CANVAS_STYLE.hairlineColor);
    const hue = (value: string) => Math.atan2(oklab(value).b, oklab(value).a);
    for (const style of [LIGHT, DARK]) {
      for (const color of CANVAS_COLORS) {
        const stroke = resolveConnectorPaint(color, style).stroke;
        const edge = resolveLabelChipBorder(style, stroke);
        expect(contrastRatio(edge, style.connectorLabelBackground)).toBeGreaterThanOrEqual(1.6);
        expect(contrastRatio(edge, style.connectorLabelBackground)).toBeGreaterThan(contrastRatio(style.hairlineColor, style.connectorLabelBackground));
        if (oklabChroma(stroke) > 0.05) expect(Math.abs(hue(edge) - hue(stroke))).toBeLessThan(0.35);
      }
    }
  });

  it("light red and pink ink retain their hue while matching the quieter families", () => {
    for (const color of ["red", "pink"] as const) {
      const ink = resolveInk(color, LIGHT);
      const anchor = LIGHT.palette[color];
      const hue = (value: string) => Math.atan2(oklab(value).b, oklab(value).a);
      expect(Math.abs(hue(ink) - hue(anchor))).toBeLessThan(0.03);
      expect(oklabChroma(ink)).toBeLessThanOrEqual(0.162);
      expect(oklabChroma(ink)).toBeLessThan(oklabChroma(anchor));
      expect(contrastRatio(ink, resolveShapePaint(color, LIGHT).fill)).toBeGreaterThanOrEqual(3);
    }
  });

  it("text-step anchors stroke in the palette color itself", () => {
    for (const color of CANVAS_COLORS.filter((candidate) => !["yellow", "orange", "red", "pink"].includes(candidate))) {
      expect(resolveInk(color, LIGHT)).toBe(LIGHT.palette[color]);
    }
    for (const color of CANVAS_COLORS.filter((candidate) => candidate !== "yellow")) {
      expect(resolveInk(color, DARK)).toBe(DARK.palette[color]);
    }
    expect(resolveInk("yellow", FIGJAM_CANVAS_STYLE)).toBe(FIGJAM_CANVAS_STYLE.palette.yellow);
  });

  it("light preset: a node never reads as the color of the section it sits in, its own hue included", () => {
    // Every hued node is the darker, stronger field: at least 0.045 L
    // and 0.055 OKLab from any section level, and 0.065 from a section of its
    // own hue (round 3: 0.03 to 0.05 L, nodes lighter than their sections).
    const sectionColors = CANVAS_COLORS;
    for (const nodeColor of CANVAS_COLORS.filter((color) => color !== "white" && color !== "gray")) {
      const node = resolveShapePaint(nodeColor, LIGHT).fill;
      for (const sectionColor of sectionColors) {
        for (const depth of [2, 3, 4, 5]) {
          const section = resolveSectionPaint(sectionColor, depth, LIGHT).fill;
          expect(oklabLightness(section) - oklabLightness(node)).toBeGreaterThanOrEqual(0.045);
          expect(oklabDistance(node, section)).toBeGreaterThanOrEqual(sectionColor === nodeColor ? 0.065 : 0.055);
        }
      }
    }
    // A gray node sits lighter than the hued nodes, where a neutral matches
    // their weight, yet stays darker than every section: 0.055 L under a gray
    // section, 0.03 under any depth-3 level (where gray nodes sit on the climb
    // boards), and 0.01 under the deepest tint, where its ink border carries it.
    const gray = resolveShapePaint("gray", LIGHT);
    for (const sectionColor of sectionColors) {
      for (const [depth, floor] of [[2, 0.05], [3, 0.03], [4, 0.01], [5, 0.01]] as const) {
        const section = resolveSectionPaint(sectionColor, depth, LIGHT).fill;
        expect(oklabLightness(section) - oklabLightness(gray.fill)).toBeGreaterThanOrEqual(floor);
      }
    }
    expect(oklabLightness(resolveSectionPaint("gray", 2, LIGHT).fill) - oklabLightness(gray.fill)).toBeGreaterThanOrEqual(0.07);
    expect(contrastRatio(gray.border, gray.fill)).toBeGreaterThanOrEqual(3);
    // A white node is the board surface: lighter than every section, and at
    // least 0.035 from any colored one. On a white section (the card) both
    // are the uncolored pick, 0.015 apart, and the node's full-ink border
    // carries it.
    const white = resolveShapePaint("white", LIGHT);
    for (const sectionColor of CANVAS_COLORS) {
      for (const depth of [2, 3, 4]) {
        const section = resolveSectionPaint(sectionColor, depth, LIGHT).fill;
        expect(oklabLightness(white.fill)).toBeGreaterThan(oklabLightness(section));
        if (sectionColor !== "white") expect(oklabDistance(white.fill, section)).toBeGreaterThanOrEqual(sectionColor === "gray" ? 0.025 : 0.035);
      }
    }
    expect(contrastRatio(white.border, white.fill)).toBeGreaterThanOrEqual(10);
  });

  it("light ink-card shapes: gray is a neutral lighter than the hued nodes, white the board surface", () => {
    // Round 4's #D0D0D0 at the hued node lightness read as the heaviest fill (UI climb round 4).
    expect(resolveShapePaint("gray", LIGHT)).toEqual({ fill: "#DCDCDC", border: "#666562", text: "#1F1F1F" });
    for (const color of CANVAS_COLORS.filter((candidate) => candidate !== "white" && candidate !== "gray")) {
      expect(oklabLightness("#DCDCDC") - oklabLightness(resolveShapePaint(color, LIGHT).fill)).toBeGreaterThanOrEqual(0.03);
    }
    expect(resolveShapePaint("white", LIGHT)).toEqual({ fill: "#FDFDFD", border: "#1F1F1F", text: "#1F1F1F" });
  });

  it.each([
    ["schematic-light", LIGHT],
    ["schematic-dark", DARK],
  ] as const)("shape name and detail text read at ≥ 4.5:1 on every shape fill (%s)", (_id, style) => {
    for (const color of CANVAS_COLORS) {
      const paint = resolveShapePaint(color, style);
      expect(contrastRatio(paint.text, paint.fill)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(style.detailColor, paint.fill)).toBeGreaterThanOrEqual(4.5);
      // The ink border is a non-text mark: 3:1 against its own fill.
      expect(contrastRatio(paint.border, paint.fill)).toBeGreaterThanOrEqual(3);
    }
  });

  it("dark card shapes: card fill, ink border, theme text", () => {
    expect(DARK.shapeFill).toBe("card");
    expect(resolveShapePaint("blue", DARK)).toEqual({ fill: "#32363E", border: "#4493F8", text: "#F0F6FC" });
  });

  it("tile icons: ink tile and the theme's tile glyph color", () => {
    expect(resolveIconPaint("green", LIGHT)).toEqual({
      tileFill: "#26744F",
      tileBorder: null,
      glyph: "#FFFFFF",
      glyphFill: null,
      label: "#1F1F1F",
    });
    expect(resolveIconPaint("green", DARK)).toMatchObject({ tileFill: "#3FB950", glyph: "#0D1117" });
    // White: outlined on light boards, a solid light tile on dark ones.
    expect(resolveIconPaint("white", LIGHT)).toMatchObject({
      tileFill: "#F8F8F7",
      tileBorder: "#1F1F1F",
      glyph: "#1F1F1F",
    });
    expect(resolveIconPaint("white", DARK)).toMatchObject({ tileFill: "#F0F6FC", tileBorder: null, glyph: "#0D1117" });
  });

  it("card stickies: a tinted callout per color pick beside ink-card nodes, the card with a gray left rule on dark boards", () => {
    const fills = new Set<string>();
    for (const color of CANVAS_COLORS) {
      const paint = resolveStickyPaint(color, LIGHT);
      expect(paint).toMatchObject({ text: LIGHT.textColor, shadow: false });
      fills.add(paint.fill);
      expect(paint.rule).not.toBeNull();
      expect(paint.border).not.toBeNull();
      expect(paint.codeChip).not.toBeNull();
      expect(contrastRatio(paint.text, paint.fill)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(paint.text, paint.codeChip!)).toBeGreaterThanOrEqual(7);
      // Inline code sits a clear step below the note body.
      expect(oklabLightness(paint.fill) - oklabLightness(paint.codeChip!)).toBeGreaterThanOrEqual(0.04);
      // The edge is a soft in-hue boundary, not an outline: the wash and the rule carry the note (stage A round 1).
      expect(contrastRatio(paint.border!, paint.fill)).toBeGreaterThanOrEqual(1.2);
      if (color !== "gray" && color !== "white") expect(oklabChroma(paint.border!)).toBeGreaterThan(0.04);
      expect(parseColor(paint.cardShadow!)!.a).toBeLessThanOrEqual(0.08);
    }
    expect(fills.size).toBe(CANVAS_COLORS.length);
    expect(resolveStickyPaint("yellow", DARK)).toMatchObject({ fill: "#32363E", border: "#3D444D", rule: "#9198A1", cardShadow: null });
  });

  it("light preset: a note reads off the page and off every top-level section, and stays lighter than every node", () => {
    // Round 4: the note was the page's own color and a shade above a gray
    // section, so it read as a borderless box (UI climb round 4).
    const note = resolveStickyPaint("yellow", LIGHT);
    for (const sectionColor of CANVAS_COLORS) {
      const minimum = sectionColor === "yellow" ? 0.018 : 0.023;
      expect(oklabDistance(note.fill, resolveSectionPaint(sectionColor, 2, LIGHT).fill)).toBeGreaterThanOrEqual(minimum);
    }
    for (const nodeColor of CANVAS_COLORS.filter((color) => color !== "white")) {
      expect(oklabLightness(note.fill) - oklabLightness(resolveShapePaint(nodeColor, LIGHT).fill)).toBeGreaterThanOrEqual(0.08);
    }
    expect(contrastRatio(note.text, note.fill)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(note.border, note.fill)).toBeGreaterThanOrEqual(1.2);
  });

  it("connectors stroke with the ink", () => {
    expect(resolveConnectorPaint("gray", LIGHT)).toEqual({ stroke: "#666562" });
    expect(resolveConnectorPaint("gray", DARK)).toEqual({ stroke: "#9198A1" });
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
    const edited = { ...DARK, cardFill: "#2F1C20" };
    expect(resolveSectionPaint("red", 3, edited)).not.toEqual(resolveSectionPaint("red", 3, style));
    // Flat (figjam) section paints ignore depth: one entry serves every level.
    expect(resolveSectionPaint("blue", 5, FIGJAM_CANVAS_STYLE)).toBe(resolveSectionPaint("blue", 1, FIGJAM_CANVAS_STYLE));
  });
});
