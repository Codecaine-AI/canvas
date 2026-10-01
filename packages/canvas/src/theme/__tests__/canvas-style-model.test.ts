/**
 * The theme model (theme/canvas-style.ts): presets, the persisted settings
 * format (incl. the pre-theme flat file), resolution, the overrides diff,
 * validation fallbacks, and the controls metadata the Studio rail is
 * generated from.
 */
import { describe, expect, it } from "bun:test";
import { CANVAS_COLORS } from "../../state/schema/colors";
import { normalizeColor } from "../color-math";
import {
  CANVAS_STYLE_CONTROLS,
  CANVAS_STYLE_GROUP_LABELS,
  CANVAS_THEME_IDS,
  CANVAS_THEME_PRESETS,
  DEFAULT_CANVAS_STYLE,
  DEFAULT_CANVAS_THEME_ID,
  FIGJAM_CANVAS_STYLE,
  canvasStyleOverrides,
  canvasThemePreset,
  normalizeCanvasStyle,
  normalizeCanvasStyleSettings,
  resolveCanvasStyle,
  type CanvasStyle,
} from "../canvas-style";

const STYLE_KEYS = Object.keys(DEFAULT_CANVAS_STYLE).sort();

describe("theme presets", () => {
  it.each([...CANVAS_THEME_IDS])("%s is complete, canonical, and in range", (id) => {
    const preset = CANVAS_THEME_PRESETS[id];
    expect(preset.theme).toBe(id);
    expect(Object.keys(preset).sort()).toEqual(STYLE_KEYS);
    expect(Object.keys(preset.palette)).toEqual([...CANVAS_COLORS]);
    for (const ink of Object.values(preset.palette)) expect(normalizeColor(ink)).toBe(ink);
    // Normalizing changes nothing (each scalar value is checked against its control below).
    expect(normalizeCanvasStyle(preset)).toEqual({ ...preset, palette: { ...preset.palette } });
  });

  it("the default is the schematic-light preset", () => {
    expect(DEFAULT_CANVAS_THEME_ID).toBe("schematic-light");
    expect(DEFAULT_CANVAS_STYLE).toBe(CANVAS_THEME_PRESETS["schematic-light"]);
    expect(canvasThemePreset()).toEqual(canvasThemePreset("schematic-light"));
  });

  it("FIGJAM_CANVAS_STYLE is the figjam preset, carrying the renderers' long-standing constants", () => {
    expect(FIGJAM_CANVAS_STYLE).toBe(CANVAS_THEME_PRESETS.figjam);
    expect(FIGJAM_CANVAS_STYLE).toEqual({
      theme: "figjam",
      // The 9 geometry values the workspace style shipped with.
      shapeCornerRadiusPx: 2,
      shapeBorderWidthPx: 2,
      sectionCornerRadiusPx: 2,
      sectionBorderWidthPx: 1.5,
      titleChipCornerRadiusPx: 2,
      titleChipBorderWidthPx: 1.5,
      labelChipCornerRadiusPx: 2,
      connectorStrokeWidthPx: 4,
      connectorCornerRadiusPx: 21.5,
      // The rounded-rect render shape's radius (process/rectangle), same as the shape radius here.
      processCornerRadiusPx: 2,
      // stage/CanvasStage.tsx CANVAS_BG / GRID_DOT_COLOR; connector label chip border.
      boardBackground: "#F5F5F5",
      gridDotColor: "rgba(0, 0, 0, 0.25)",
      hairlineColor: "#D9D9D9",
      // objects/text-slots.ts OBJECT_TEXT_COLOR + the bold shape/chip text weight.
      textColor: "#000000",
      textFontWeight: 700,
      // SHAPE_TEXT_TYPOGRAPHY / BELOW_TEXT_FONT_SIZE_PX: names at 15px.
      textFontSizePx: 15,
      detailColor: "#5C5C5C",
      detailFont: "sans",
      detailFontSizePx: 13,
      shapeFill: "tint",
      cardFill: "#FFFFFF",
      sectionFill: "flat",
      sectionTintBase: 0.07,
      sectionTintStep: 0.035,
      sectionTintMax: 0.16,
      sectionTintMixBase: "#FFFFFF",
      sectionBorderOpacity: 1,
      // TITLE_CHIP: floating chip, Inter 16px.
      headerPlacement: "floating",
      headerFont: "sans",
      headerUppercase: false,
      headerFontSizePx: 16,
      headerChipMix: 0.16,
      iconPack: "nucleo",
      iconStyle: "glyph",
      iconTileGlyphColor: "#FFFFFF",
      // Tile style only (ignored by figjam's bare glyphs).
      iconTileFill: "auto",
      iconTileSolidMaxPx: 152,
      iconTileMaxPx: 240,
      // connectors/Connector.tsx CONNECTION_LABEL_* (16px text on a 30px #F5F5F5 chip).
      connectorLabelFont: "sans",
      connectorLabelFontSizePx: 16,
      connectorLabelHeightPx: 30,
      connectorLabelBackground: "#F5F5F5",
      connectorLabelTextColor: "#000000",
      stickyStyle: "paper",
      // The palette.ts inks (connector strokes / shape borders).
      palette: {
        gray: "#757575",
        red: "#D5322F",
        orange: "#EB7500",
        yellow: "#E8A302",
        green: "#019142",
        teal: "#369E94",
        blue: "#1A5CDF",
        violet: "#9747FF",
        pink: "#B74D85",
        white: "#757980",
      },
    });
  });

  it("canvasThemePreset hands out mutable copies, never the frozen preset", () => {
    const copy = canvasThemePreset("schematic-dark");
    copy.palette.teal = "#000000";
    copy.boardBackground = "#000000";
    expect(CANVAS_THEME_PRESETS["schematic-dark"].palette.teal).toBe("#5DE4C7");
    expect(CANVAS_THEME_PRESETS["schematic-dark"].boardBackground).toBe("#14171F");
  });
});

describe("normalizeCanvasStyle", () => {
  it("starts from the named theme's preset and applies known keys over it", () => {
    expect(normalizeCanvasStyle({ theme: "schematic-dark" })).toEqual(canvasThemePreset("schematic-dark"));
    expect(normalizeCanvasStyle({ theme: "schematic-light", connectorStrokeWidthPx: 2.5 })).toEqual({
      ...canvasThemePreset("schematic-light"),
      connectorStrokeWidthPx: 2.5,
    });
    // No theme and an unknown theme both mean the default theme; figjam only when named.
    expect(normalizeCanvasStyle(undefined)).toEqual(canvasThemePreset("schematic-light"));
    expect(normalizeCanvasStyle({ shapeCornerRadiusPx: 6 })).toEqual({
      ...canvasThemePreset("schematic-light"),
      shapeCornerRadiusPx: 6,
    });
    expect(normalizeCanvasStyle({ theme: "neon" })).toEqual(canvasThemePreset("schematic-light"));
    expect(normalizeCanvasStyle({ theme: "figjam" })).toEqual(canvasThemePreset("figjam"));
  });

  it("merges palette inks one by one", () => {
    const style = normalizeCanvasStyle({ theme: "schematic-light", palette: { teal: "#00aa88" } });
    expect(style.palette).toEqual({ ...CANVAS_THEME_PRESETS["schematic-light"].palette, teal: "#00AA88" });
  });

  it("falls back to the preset value for every invalid token", () => {
    const style = normalizeCanvasStyle({
      theme: "schematic-light",
      boardBackground: "#FFF", // short hex
      gridDotColor: "rgb(0, 0, 0)", // rgb() is not a token syntax
      textFontWeight: "600", // not a number
      detailFont: "serif", // not an option
      headerUppercase: "true", // not a boolean
      sectionTintBase: Number.NaN,
      palette: { teal: "teal", gray: 7, bogus: "#000000" },
      bogusKey: 1,
    });
    expect(style).toEqual(canvasThemePreset("schematic-light"));
    expect("bogusKey" in style).toBe(false);
  });

  it("clamps numbers to their control range", () => {
    const style = normalizeCanvasStyle({ sectionBorderOpacity: 4, headerChipMix: -1, connectorLabelHeightPx: 999 });
    expect(style.sectionBorderOpacity).toBe(1);
    expect(style.headerChipMix).toBe(0);
    expect(style.connectorLabelHeightPx).toBe(48);
  });

  it("resolves a whole settings document to its active theme", () => {
    const settings = { theme: "schematic-dark", themes: { "schematic-dark": { cardFill: "#303030" } } };
    expect(normalizeCanvasStyle(settings)).toEqual({ ...canvasThemePreset("schematic-dark"), cardFill: "#303030" });
  });
});

describe("settings: normalize, resolve, and diff", () => {
  it("reads the pre-theme flat numeric file as figjam overrides", () => {
    const legacy = { shapeCornerRadiusPx: 6, connectorStrokeWidthPx: 2, bogus: true };
    expect(normalizeCanvasStyleSettings(legacy)).toEqual({
      theme: "figjam",
      themes: { figjam: { shapeCornerRadiusPx: 6, connectorStrokeWidthPx: 2 } },
    });
    expect(resolveCanvasStyle(legacy)).toEqual({
      ...canvasThemePreset("figjam"),
      shapeCornerRadiusPx: 6,
      connectorStrokeWidthPx: 2,
    });
  });

  it("treats missing, empty, and garbage files as schematic-light (the default) with no overrides", () => {
    for (const raw of [undefined, null, "x", [1, 2], {}, { bogus: 1 }, { themes: {} }]) {
      expect(normalizeCanvasStyleSettings(raw)).toEqual({ theme: "schematic-light", themes: {} });
      expect(resolveCanvasStyle(raw)).toEqual(canvasThemePreset("schematic-light"));
    }
  });

  it("keeps an explicit figjam theme, with or without overrides", () => {
    for (const raw of [{ theme: "figjam" }, { theme: "figjam", themes: {} }]) {
      expect(normalizeCanvasStyleSettings(raw)).toEqual({ theme: "figjam", themes: {} });
      expect(resolveCanvasStyle(raw)).toEqual(canvasThemePreset("figjam"));
    }
    // A settings document without `theme` is not a pre-theme file: its active theme is the default.
    expect(normalizeCanvasStyleSettings({ themes: { figjam: { shapeCornerRadiusPx: 6 } } })).toEqual({
      theme: "schematic-light",
      themes: { figjam: { shapeCornerRadiusPx: 6 } },
    });
  });

  it("validates each theme's overrides against that theme's own preset and keeps only real differences", () => {
    const settings = normalizeCanvasStyleSettings({
      theme: "schematic-light",
      themes: {
        figjam: { shapeCornerRadiusPx: 2 }, // equals the figjam preset → dropped
        "schematic-light": {
          headerPlacement: "floating",
          connectorStrokeWidthPx: 2, // equals the preset → dropped
          palette: { teal: "#0F8A7A", red: "#aa0000" }, // teal equals the preset → dropped
          theme: "schematic-dark", // not an override
        },
        "schematic-dark": "nope",
        neon: { shapeCornerRadiusPx: 4 },
      },
    });
    expect(settings).toEqual({
      theme: "schematic-light",
      themes: { "schematic-light": { headerPlacement: "floating", palette: { red: "#AA0000" } } },
    });
  });

  it("round-trips: resolve the active theme, then diff back to the same overrides (palette included)", () => {
    const overrides = {
      boardBackground: "#101010",
      sectionFill: "flat",
      headerUppercase: false,
      sectionTintMax: 0.3,
      palette: { violet: "#AA88FF" },
    } as const;
    const settings = { theme: "schematic-dark", themes: { "schematic-dark": overrides, figjam: { shapeBorderWidthPx: 3 } } };
    const style = resolveCanvasStyle(settings);
    expect(style.theme).toBe("schematic-dark");
    expect(style.palette.violet).toBe("#AA88FF");
    expect(style.palette.teal).toBe("#5DE4C7");
    expect(canvasStyleOverrides(style)).toEqual(overrides);
    // The inactive theme's overrides don't leak into the active style …
    expect(style.shapeBorderWidthPx).toBe(2);
    // … and come back when that theme is active again.
    expect(resolveCanvasStyle({ ...settings, theme: "figjam" }).shapeBorderWidthPx).toBe(3);
  });

  it("an untouched preset has no overrides", () => {
    for (const id of CANVAS_THEME_IDS) {
      expect(canvasStyleOverrides(canvasThemePreset(id))).toEqual({});
    }
  });
});

describe("CANVAS_STYLE_CONTROLS", () => {
  const scalarControls = CANVAS_STYLE_CONTROLS.filter((control) => control.key !== "palette");
  const paletteRows = CANVAS_STYLE_CONTROLS.filter((control) => control.key === "palette");

  it("covers every style token exactly once, plus one palette row per roster color", () => {
    expect(scalarControls.map((control): string => control.key).sort()).toEqual(
      STYLE_KEYS.filter((key) => key !== "palette"),
    );
    expect(paletteRows.map((control) => control.paletteColor)).toEqual([...CANVAS_COLORS]);
    expect(paletteRows.every((control) => control.kind === "color" && control.group === "palette")).toBe(true);
  });

  it("labels every group", () => {
    const groups = new Set<string>(CANVAS_STYLE_CONTROLS.map((control) => control.group));
    expect([...groups].sort()).toEqual(Object.keys(CANVAS_STYLE_GROUP_LABELS).sort());
  });

  it("gives every control metadata that admits each preset's value", () => {
    for (const control of scalarControls) {
      const values = CANVAS_THEME_IDS.map((id) => CANVAS_THEME_PRESETS[id][control.key as keyof CanvasStyle]);
      switch (control.kind) {
        case "number":
          expect(control.min).toBeLessThan(control.max!);
          expect(control.step).toBeGreaterThan(0);
          for (const value of values) {
            expect(typeof value).toBe("number");
            expect(value as number).toBeGreaterThanOrEqual(control.min!);
            expect(value as number).toBeLessThanOrEqual(control.max!);
          }
          break;
        case "select": {
          const options = (control.options ?? []).map((option) => option.value);
          expect(options.length).toBeGreaterThanOrEqual(2);
          for (const value of values) expect(options).toContain(value as string);
          break;
        }
        case "boolean":
          for (const value of values) expect(typeof value).toBe("boolean");
          break;
        case "color":
          // Valid and already in canonical spelling.
          for (const value of values) expect(normalizeColor(value)).toBe(value as string);
          break;
      }
    }
  });

  it("conditions visibility only on select values that exist", () => {
    for (const control of CANVAS_STYLE_CONTROLS) {
      if (!control.visibleWhen) continue;
      const target = CANVAS_STYLE_CONTROLS.find((candidate) => candidate.key === control.visibleWhen!.key);
      expect(target?.kind).toBe("select");
      expect(target?.options?.map((option) => option.value)).toContain(control.visibleWhen.equals as string);
    }
  });
});
