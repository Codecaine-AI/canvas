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
  resolveIconTilePaint,
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
      codeText: null,
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
    // The lightness is the mix's at t(d); the chroma is set per level (see below).
    for (const [depth, weight] of [[1, 0.02], [2, 0.065], [3, 0.11], [4, 0.15], [9, 0.15]] as const) {
      const fill = resolveSectionPaint("teal", depth, LIGHT).fill;
      const mix = mixColors("#0D7164", "#FDFDFD", weight);
      expect(Math.abs(oklabLightness(fill) - oklabLightness(mix))).toBeLessThan(0.002);
    }
    expect(resolveSectionPaint("teal", 2, LIGHT).fill).toBe("#E4F7F4");
  });

  it("light preset: a section never outweighs its nodes, at top level chroma 0.02 (yellow 0.038), growing with the ink weight", () => {
    for (const color of CANVAS_COLORS.filter((candidate) => candidate !== "white" && candidate !== "gray")) {
      // Yellow at 0.03 read cream and tan (stage A round 9: opus on 'Ledger' and 'Messaging').
      const top = color === "yellow" ? 0.038 : 0.02;
      for (const [depth, weight] of [[2, 0.065], [3, 0.11], [4, 0.15]] as const) {
        const chroma = oklabChroma(resolveSectionPaint(color, depth, LIGHT).fill);
        // Set, not only capped: blue, green, teal and violet mixed to 0.008 at top level and told siblings apart by the frame alone.
        expect(Math.abs(chroma - top * (weight / 0.065) ** 0.75)).toBeLessThan(0.0025);
        // A top-level field stays 0.02 less colorful than its hue's node. Deeper
        // levels are small nested groups: the stage C node (chroma 0.043 to 0.07,
        // Ford's "Lighter" pick from mockup2) no longer clears them by 0.02, and a
        // node in a section of its own hue paints the white card there.
        if (depth === 2) expect(chroma).toBeLessThan(oklabChroma(resolveShapePaint(color, LIGHT).fill) - 0.02);
      }
    }
    // The butter field on board 12 (chroma 0.076) is now a pale yellow.
    expect(resolveSectionPaint("yellow", 2, LIGHT).fill).toBe("#FAF5D8");
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
    ["schematic-light", LIGHT, "#F7F7F6"],
    ["schematic-dark", DARK, "#1A1F25"],
  ] as const)("gray is one flat off-gray at every depth, with a neutral tab 0.045 L under it (%s)", (_id, style, fill) => {
    // Ford, stage C round 2: "Every gray section is #F7F7F6 at any depth."
    // The dark board keeps its old top gray at every depth.
    for (const depth of [1, 2, 3, 4, 7]) {
      const paint = resolveSectionPaint("gray", depth, style);
      expect(paint.fill).toBe(fill);
      if (style === LIGHT) {
        expect(oklabLightness(paint.fill) - oklabLightness(paint.chipFill)).toBeCloseTo(0.045, 2);
        expect(oklabChroma(paint.chipFill)).toBeLessThan(0.002);
      }
    }
    // Chromatic hues keep stepping.
    expect(resolveSectionPaint("blue", 4, style).fill).not.toBe(resolveSectionPaint("blue", 2, style).fill);
  });

  it("light preset: gray reads apart from the white base and a white section, under the near-white gray node", () => {
    const gray = oklabLightness(resolveSectionPaint("gray", 2, LIGHT).fill);
    expect(resolveSectionPaint("white", 1, LIGHT).fill).toBe("#FDFDFD");
    expect(oklabLightness(resolveSectionPaint("white", 1, LIGHT).fill) - gray).toBeGreaterThanOrEqual(0.015);
    expect(oklabLightness(resolveSectionPaint("white", 2, LIGHT).fill) - gray).toBeGreaterThanOrEqual(0.015);
    // The gray node (#F6F9FE) stays a cool card a shade above the gray
    // section; its ink edge carries it there (Ford: "Gray nodes keep #F6F9FE").
    const node = resolveShapePaint("gray", LIGHT);
    expect(oklabLightness(node.fill) - gray).toBeGreaterThanOrEqual(0.004);
    expect(contrastRatio(node.border, resolveSectionPaint("gray", 2, LIGHT).fill)).toBeGreaterThanOrEqual(3);
  });

  it("light preset: red and pink washes stand apart in hue at every level (round 4: a red child read as its pink parent)", () => {
    const hue = (color: string) => (Math.atan2(oklab(color).b, oklab(color).a) * 180) / Math.PI;
    for (const depth of [2, 3, 4]) {
      const red = hue(resolveSectionPaint("red", depth, LIGHT).fill);
      const pink = hue(resolveSectionPaint("pink", depth, LIGHT).fill) - 360;
      expect(red - pink).toBeGreaterThanOrEqual(45);
    }
  });

  it("derives border and chip border from the ink, and the chip one clear step under its fill", () => {
    const paint = resolveSectionPaint("teal", 1, LIGHT);
    expect(paint.border).toBe("rgba(13, 113, 100, 0.9)");
    // Beside ink-card nodes the chip is its fill 0.045 L deeper at chroma 0.035 in OKLCH, a light
    // tab (stage C: Ford picked mockup2's "Lighter" step; the 0.095 step read as a heavy band).
    for (const color of ["teal", "yellow", "red"] as const) {
      for (const depth of [2, 3, 4]) {
        const { fill, chipFill } = resolveSectionPaint(color, depth, LIGHT);
        expect(Math.abs(oklabLightness(fill) - oklabLightness(chipFill) - 0.045)).toBeLessThan(0.004);
        expect(Math.abs(oklabChroma(chipFill) - 0.035)).toBeLessThan(0.004);
      }
    }
    // A gray chip takes the same 0.045 L step as a neutral (stage B round 4: the
    // mid-gray tab read heavy, astra on 01, 06, 09 and 14); its ink edge frames it.
    for (const depth of [2, 3, 4]) {
      const gray = resolveSectionPaint("gray", depth, LIGHT);
      expect(Math.abs(oklabLightness(gray.fill) - oklabLightness(gray.chipFill) - 0.045)).toBeLessThan(0.004);
      expect(oklabChroma(gray.chipFill)).toBeLessThan(0.002);
    }
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
    expect(LIGHT.sectionTintBase).toBe(0.02);
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
      const mix = mixColors(LIGHT.palette[color], "#FDFDFD", 0.02);
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
      // A faint warm paper, not pure white, which matched the page and read
      // as a hole in a hued parent (stage A round 9: opus), with a neutral chip 0.045 L under it (was
      // 0.095: the mid-gray tab read heavy, stage B round 3: astra on 01, 06, 09 and 14; 0.05 until
      // stage C, Ford's "Lighter" pick from mockup2).
      expect(paint.fill).toBe("#FFFDF9");
      expect(oklabChroma(paint.fill)).toBeLessThan(0.008);
      expect(Math.abs(oklabLightness(paint.fill) - oklabLightness(paint.chipFill) - 0.045)).toBeLessThan(0.004);
      expect(paint.chipBorder).toBe(resolveSectionPaint("gray", depth, LIGHT).chipBorder);
      expect(contrastRatio(paint.border, resolveSectionPaint("gray", 2, LIGHT).fill)).toBeGreaterThanOrEqual(2);
      expect(contrastRatio(paint.headerText, paint.chipFill)).toBeGreaterThanOrEqual(4.5);
    }
    for (const depth of [1, 2, 3]) {
      expect(resolveSectionPaint("white", depth, DARK)).toEqual(resolveSectionPaint("gray", depth, DARK));
    }
  });

  it("header icon: the bare glyph on the chip, in its ink held at 7:1 in the tile style", () => {
    // The header draws no tile: an 11px glyph on a 16px tile read as a smudge at 1:1 (stage B round
    // 0: fable on 11 and 13). The glyph keeps its section's hue at the title's contrast.
    for (const style of [LIGHT, DARK]) {
      for (const color of CANVAS_COLORS) {
        for (const depth of [1, 2, 3, 4]) {
          const paint = resolveSectionPaint(color, depth, style);
          expect(contrastRatio(paint.iconGlyph, paint.chipFill)).toBeGreaterThanOrEqual(7);
        }
      }
    }
    expect(oklabChroma(resolveSectionPaint("teal", 2, LIGHT).iconGlyph)).toBeGreaterThan(0.05);
    // Glyph mode: the icon objects' glyph ink.
    const glyphMode = { ...LIGHT, iconStyle: "glyph" as const };
    expect(resolveSectionPaint("teal", 1, glyphMode).iconGlyph).toBe("#0D7164");
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
      // Yellow edges in its own amber gold (the next test), every other hue in its ink.
      if (color !== "yellow") expect(paint.border).toBe(resolveInk(color, LIGHT));
      // Stage C (Ford picked mockup2's "Lighter" step): every hued node at L 0.915,
      // chroma 0.05; yellow 0.03 lighter and 0.02 more colorful, since under
      // L 0.93 it turns khaki. Red, blue and violet take what sRGB holds (0.043 to 0.047).
      expect(Math.abs(oklabLightness(paint.fill) - (color === "yellow" ? 0.945 : 0.915))).toBeLessThan(0.003);
      expect(chroma(paint.fill)).toBeGreaterThanOrEqual(color === "yellow" ? 0.068 : 0.042);
      expect(chroma(paint.fill)).toBeLessThan(color === "yellow" ? 0.072 : 0.052);
      expect(Math.abs(hue(paint.fill) - hue(LIGHT.palette[color]))).toBeLessThan(0.12);
    }
    // Green and teal (and teal and blue) were 0.003 / 0.005 apart at the 0.08 mix.
    // At the lighter stage C fill neighbors sit 0.024 apart, over the 0.02 just-visible step.
    for (const [a, b] of [["green", "teal"], ["teal", "blue"], ["red", "orange"], ["violet", "pink"]] as const) {
      expect(oklabDistance(resolveShapePaint(a, LIGHT).fill, resolveShapePaint(b, LIGHT).fill)).toBeGreaterThan(0.02);
    }
  });

  it("light yellow: a gold stroke at 3:1 on its node, and fills at the text step's lightness that stay yellow", () => {
    // The anchor is the yellow solid; the olive text step is only the lightness reference.
    const textStep = ensureContrast(LIGHT.palette.yellow, LIGHT.boardBackground, 4.5);
    const node = resolveShapePaint("yellow", LIGHT);
    // The node edge is an amber gold, warmer than the olive-leaning ink, at 3:1 on its node (stage A round 11).
    expect(contrastRatio(node.border, node.fill)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(resolveInk("yellow", LIGHT), resolveShapePaint("yellow", LIGHT).fill)).toBeGreaterThanOrEqual(3);
    // Lighter than the olive yellow.text (#805F01, L 0.51), though the stronger node fill pushes it darker than round 3's gold.
    expect(oklabLightness(node.border)).toBeGreaterThan(oklabLightness("#805F01") + 0.04);
    const chroma = (color: string) => Math.hypot(oklab(color).a, oklab(color).b);
    const paints: [string, string][] = [2, 3, 4].map((depth): [string, string] => [
      resolveSectionPaint("yellow", depth, LIGHT).fill,
      mixColors(textStep, LIGHT.boardBackground, Math.min(0.15, 0.02 + 0.045 * (depth - 1))),
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
    // Every hued node, as it paints in each section (the white card in its own
    // hue), stands at least 0.02 OKLab (one just-visible step) off every
    // section level, and its ink edge (3:1) carries it. Stage C lightened the
    // nodes to L 0.915 (Ford picked mockup2's "Lighter" step), so they are no
    // longer the darker field by 0.045 L and 0.055 OKLab (round 3 had nodes
    // lighter than their sections; the edge and the hue now tell them apart).
    const sectionColors = CANVAS_COLORS;
    for (const nodeColor of CANVAS_COLORS.filter((color) => color !== "white" && color !== "gray")) {
      for (const sectionColor of sectionColors) {
        const node = resolveShapePaint(nodeColor, LIGHT, sectionColor);
        for (const depth of [2, 3, 4, 5]) {
          const section = resolveSectionPaint(sectionColor, depth, LIGHT).fill;
          expect(oklabDistance(node.fill, section)).toBeGreaterThanOrEqual(0.02);
          expect(contrastRatio(node.border, section)).toBeGreaterThanOrEqual(3);
        }
      }
    }
    // A gray node is a near-white card with a firm ink edge (stage B round 4:
    // the mid slate under every section read as disabled, fable on 13
    // boards). It sits lighter than every colored or gray section, 0.014 L
    // and 0.018 OKLab from each (the sections stay light, after Ford), and
    // its 2px border (5.5:1) carries it there, as the white node's does.
    // Gray sections are the one exception: Ford picked the flat #F7F7F6
    // under the #F6F9FE gray node (stage C round 2), so there the node's cool
    // cast and its edge alone tell it apart (see the gray tests above).
    const gray = resolveShapePaint("gray", LIGHT);
    for (const sectionColor of sectionColors.filter((color) => color !== "white" && color !== "gray")) {
      for (const depth of [2, 3, 4, 5]) {
        const section = resolveSectionPaint(sectionColor, depth, LIGHT).fill;
        expect(oklabLightness(gray.fill) - oklabLightness(section)).toBeGreaterThanOrEqual(0.014);
        expect(oklabDistance(gray.fill, section)).toBeGreaterThanOrEqual(0.018);
      }
    }
    expect(contrastRatio(gray.border, gray.fill)).toBeGreaterThanOrEqual(3);
    // A white node is the board surface: lighter than every colored or gray
    // section, at least 0.035 from any colored one and 0.015 from the flat
    // off-gray (Ford, stage C round 2: gray "still reads apart from the white
    // base"). On a white section
    // (pure white, so it sits a clear tone above gray: stage A round 4) both
    // are the uncolored pick, under 0.01 apart, and the node's full-ink
    // border carries it, as it did at round 4's 0.015.
    const white = resolveShapePaint("white", LIGHT);
    for (const sectionColor of CANVAS_COLORS) {
      for (const depth of [2, 3, 4]) {
        const section = resolveSectionPaint(sectionColor, depth, LIGHT).fill;
        if (sectionColor === "white") expect(oklabDistance(white.fill, section)).toBeLessThan(0.01);
        else expect(oklabLightness(white.fill)).toBeGreaterThan(oklabLightness(section));
        if (sectionColor !== "white") expect(oklabDistance(white.fill, section)).toBeGreaterThanOrEqual(sectionColor === "gray" ? 0.015 : 0.035);
      }
    }
    // The white node edges in the gray ink (stage A round 9: its near-black
    // edge outweighed every tinted border), which still holds 4.5:1 on its
    // own fill, so a white node on a white section keeps a clear edge.
    expect(white.border).toBe(resolveInk("gray", LIGHT));
    expect(contrastRatio(white.border, white.fill)).toBeGreaterThanOrEqual(4.5);
  });

  it("light preset: a node, tile or note in a section of its own hue is the white card edged in its own ink", () => {
    // A hued node on a tint of its own hue read as a darker patch of the
    // section (stage B round 0: fable on 01, 03, 04, 06 and 14).
    const white = resolveShapePaint("white", LIGHT);
    for (const color of CANVAS_COLORS.filter((candidate) => candidate !== "white" && candidate !== "gray")) {
      const own = resolveShapePaint(color, LIGHT, color);
      expect(own).toEqual({ fill: white.fill, border: resolveShapePaint(color, LIGHT).border, text: LIGHT.textColor });
      expect(contrastRatio(own.border, own.fill)).toBeGreaterThanOrEqual(3);
      const tile = resolveIconTilePaint(color, LIGHT, 56, null, color);
      expect(tile.tileFill).toBe(white.fill);
      expect(contrastRatio(tile.glyph, white.fill)).toBeGreaterThanOrEqual(4.5);
      // Any other section, and no section, keeps the hued node.
      expect(resolveShapePaint(color, LIGHT, color === "blue" ? "teal" : "blue")).toEqual(resolveShapePaint(color, LIGHT));
    }
    // A note in a section of its own color is the white card, with its own edge and rule
    // (stage B round 0: a yellow note melted into its yellow section on 12). Its code chip
    // is the white card's: the chip is a white wash of the fill the note paints (stage C).
    const whiteNote = resolveStickyPaint("white", LIGHT);
    for (const color of CANVAS_COLORS.filter((candidate) => candidate !== "white")) {
      const own = resolveStickyPaint(color, LIGHT, color);
      expect(own).toEqual({ ...resolveStickyPaint(color, LIGHT), fill: whiteNote.fill, codeChip: whiteNote.codeChip });
      expect(contrastRatio(own.text, own.fill)).toBeGreaterThanOrEqual(7);
    }
    expect(resolveStickyPaint("yellow", LIGHT, "gray")).toEqual(resolveStickyPaint("yellow", LIGHT));
    expect(resolveStickyPaint("yellow", DARK, "yellow")).toEqual(resolveStickyPaint("yellow", DARK));
    // Gray and white keep their own paint; the dark preset's card nodes ignore the section.
    expect(resolveShapePaint("gray", LIGHT, "gray")).toEqual(resolveShapePaint("gray", LIGHT));
    expect(resolveShapePaint("violet", DARK, "violet")).toEqual(resolveShapePaint("violet", DARK));
  });

  it("light ink-card shapes: gray is a near-white cool card, white the board surface", () => {
    // The neutral #DCDCDC read dull beside the clear hues, so gray took a
    // faint cool slate (stage A round 11), then the hued nodes' depth
    // (#CBD1D5, stage B round 1). There it still read as a disabled panel on
    // gray sections (stage B round 1: fable on 13 boards, "give the neutral
    // kind a white or light fill with a firm border"), so it is now a
    // near-white card with a cool cast, a shade lighter than the flat gray
    // section (stage C round 2) and still apart from the plain white node.
    const gray = resolveShapePaint("gray", LIGHT);
    expect(gray).toEqual({ fill: "#F6F9FE", border: "#666562", text: "#1F1F1F" });
    expect(Math.hypot(oklab(gray.fill).a, oklab(gray.fill).b)).toBeLessThan(0.01);
    expect(oklabDistance(gray.fill, resolveShapePaint("white", LIGHT).fill)).toBeGreaterThanOrEqual(0.014);
    for (const depth of [2, 3, 4, 5]) {
      expect(oklabDistance(gray.fill, resolveSectionPaint("gray", depth, LIGHT).fill)).toBeGreaterThanOrEqual(0.01);
    }
    expect(resolveShapePaint("white", LIGHT)).toEqual({ fill: "#FDFDFD", border: "#666562", text: "#1F1F1F" });
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
      // Inline code is the docs viewer's typed chip on a white wash of the note
      // (stage C: Ford picked "B. White wash" from mockup2). The chip sits in the
      // note's own family, never darker than the note, and every kind's text
      // reads on it at the chip-text floor; untyped code is the body text.
      expect(oklabLightness(paint.codeChip!)).toBeGreaterThanOrEqual(oklabLightness(paint.fill));
      expect(paint.codeText?.other).toBe(paint.text);
      for (const text of Object.values(paint.codeText!)) expect(contrastRatio(text, paint.codeChip!)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(paint.text, paint.codeChip!)).toBeGreaterThanOrEqual(7);
      // The edge is a soft in-hue boundary, not an outline: the wash and the rule carry the note (stage A round 1).
      expect(contrastRatio(paint.border!, paint.fill)).toBeGreaterThanOrEqual(1.2);
      if (color !== "gray" && color !== "white") expect(oklabChroma(paint.border!)).toBeGreaterThan(0.04);
      expect(parseColor(paint.cardShadow!)!.a).toBeLessThanOrEqual(0.08);
    }
    expect(fills.size).toBe(CANVAS_COLORS.length);
    expect(resolveStickyPaint("yellow", DARK)).toMatchObject({ fill: "#32363E", border: "#3D444D", rule: "#9198A1", cardShadow: null, codeText: null });
  });

  it("light preset: a note reads off the page and off every top-level section, and stays lighter than every hued node", () => {
    // Round 4: the note was the page's own color and a shade above a gray
    // section, so it read as a borderless box (UI climb round 4).
    const note = resolveStickyPaint("yellow", LIGHT);
    // The note as it paints in each top-level section: in its own hue that is the white card.
    for (const sectionColor of CANVAS_COLORS) {
      const painted = resolveStickyPaint("yellow", LIGHT, sectionColor);
      expect(oklabDistance(painted.fill, resolveSectionPaint(sectionColor, 2, LIGHT).fill)).toBeGreaterThanOrEqual(0.023);
    }
    // Stage C (Ford: "can we also make the sticky note background slightly
    // lighter") lifts every note wash 0.015 L at 80% chroma: yellow at L 0.977,
    // the others at 0.967. The nodes went lighter too (L 0.915, yellow 0.945),
    // so the yellow note keeps 0.03 over the yellow node, and 0.04 OKLab off the
    // near-white gray node card (stage B round 4) by its wash's hue.
    expect(oklabDistance(note.fill, resolveShapePaint("gray", LIGHT).fill)).toBeGreaterThanOrEqual(0.04);
    for (const nodeColor of CANVAS_COLORS.filter((color) => color !== "white" && color !== "gray")) {
      expect(oklabLightness(note.fill) - oklabLightness(resolveShapePaint(nodeColor, LIGHT).fill)).toBeGreaterThanOrEqual(0.03);
    }
    expect(contrastRatio(note.text, note.fill)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(note.border, note.fill)).toBeGreaterThanOrEqual(1.2);
  });

  it("the gray wire steps off the gray ink, away from the board", () => {
    // Darker than the gray borders on light, lighter on dark (Ford, stage C round 3).
    expect(resolveConnectorPaint("gray", LIGHT)).toEqual({ stroke: "#4F4E4B" });
    expect(resolveConnectorPaint("gray", DARK)).toEqual({ stroke: "#ABB2BB" });
    expect(resolveShapePaint("gray", LIGHT).border).toBe("#666562");
    expect(resolveShapePaint("gray", DARK).border).toBe("#9198A1");
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
