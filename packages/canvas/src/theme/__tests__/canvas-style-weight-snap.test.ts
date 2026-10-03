/**
 * The name weight snaps to a whole hundred wherever a style is validated
 * (canvas-style.json, Studio's rail, the MCP's STYLE line): resvg, the agent
 * camera, paints the regular face for any other weight, while browsers paint
 * a neighbouring face, so a weight such as 650 would make the camera and the
 * stage disagree. Every other number control keeps its clamped value.
 */
import { describe, expect, it } from "bun:test";
import {
  CANVAS_STYLE_CONTROLS,
  CANVAS_THEME_IDS,
  CANVAS_THEME_PRESETS,
  canvasThemePreset,
  normalizeCanvasStyle,
  normalizeCanvasStyleSettings,
  resolveCanvasStyle,
  snapToControlStep,
  type CanvasStyle,
} from "../canvas-style";

const weightControl = CANVAS_STYLE_CONTROLS.find((control) => control.key === "textFontWeight")!;

describe("textFontWeight snaps to a whole hundred", () => {
  it.each([
    [450, 500],
    [550, 600],
    [650, 700],
    [640, 600],
    [449, 400],
    [301, 300],
    [250, 300],
    [975, 900],
  ])("%d is stored as %d", (input, stored) => {
    expect(normalizeCanvasStyle({ theme: "figjam", textFontWeight: input }).textFontWeight).toBe(stored);
  });

  it("snapToControlStep snaps the weight control and passes any other control's value through", () => {
    expect(snapToControlStep(weightControl, 650)).toBe(700);
    const sizeControl = CANVAS_STYLE_CONTROLS.find((control) => control.key === "textFontSizePx")!;
    expect(snapToControlStep(sizeControl, 13.3)).toBe(13.3);
  });

  it("settings and overrides keep the snapped weight, and a weight that snaps onto the preset is no override", () => {
    const settings = normalizeCanvasStyleSettings({
      theme: "schematic-light",
      themes: { "schematic-light": { textFontWeight: 650 } },
    });
    expect(settings.themes["schematic-light"]).toEqual({ textFontWeight: 700 });
    expect(resolveCanvasStyle(settings).textFontWeight).toBe(700);

    const preset = canvasThemePreset("schematic-light").textFontWeight;
    expect(
      normalizeCanvasStyleSettings({
        theme: "schematic-light",
        themes: { "schematic-light": { textFontWeight: preset - 20 } },
      }),
    ).toEqual({ theme: "schematic-light", themes: {} });
  });

  it("leaves every other number control unsnapped", () => {
    const style = normalizeCanvasStyle({ theme: "figjam", textFontSizePx: 13.3, sectionTintBase: 0.123 });
    expect(style.textFontSizePx).toBe(13.3);
    expect(style.sectionTintBase).toBe(0.123);
    const snapping = CANVAS_STYLE_CONTROLS.filter((control) => control.snap).map((control) => control.key);
    expect(snapping).toEqual(["textFontWeight"]);
  });

  it("puts a snapping control's range and every preset value on its step grid", () => {
    for (const control of CANVAS_STYLE_CONTROLS.filter((candidate) => candidate.snap)) {
      const step = control.step!;
      expect(control.kind).toBe("number");
      expect(control.min! % step).toBe(0);
      expect(control.max! % step).toBe(0);
      for (const id of CANVAS_THEME_IDS) {
        expect((CANVAS_THEME_PRESETS[id][control.key as keyof CanvasStyle] as number) % step).toBe(0);
      }
    }
  });
});
