import { describe, expect, it } from "bun:test";
import { OBJECT_DEFS, objectDefFor } from "../object-def";
import {
  BELOW_BAND_GAP_PX,
  BELOW_BAND_MIN_WIDTH_PX,
  BELOW_TEXT_LINE_HEIGHT_PX,
  BELOW_TEXT_TYPE_CONFIG,
  BELOW_TEXT_TYPES,
  belowBandMaxWidthPx,
  belowBandSize,
  belowTextSlot,
  belowExtendedBoundsPx,
  iconTileRectPx,
  resolveTextSlot,
  slotLineHeightPx,
  textPlacementName,
  type TextSlot,
} from "../text-slots";
import type { InteractiveCanvasObject } from "../../state/schema";
import { measureWidth, wrapText } from "../../theme/text-measure";
import { DEFAULT_CANVAS_STYLE, FIGJAM_CANVAS_STYLE, canvasThemePreset, type CanvasStyle } from "../../theme/canvas-style";
import { wrapTextLines } from "../../render/static-svg";

/** The default style's name size and line box (17.5px × 1.2 = 21px); figjam's is 15 / 18. */
const NAME_PX = DEFAULT_CANVAS_STYLE.textFontSizePx;
const NAME_LINE_PX = NAME_PX * 1.2;

/** The name font a style paints captions in: the stage's Inter stack at the style's size and weight. */
function nameFont(style: CanvasStyle = DEFAULT_CANVAS_STYLE) {
  return { family: "Inter", size: style.textFontSizePx, weight: style.textFontWeight };
}

function makeObject(
  partial: Partial<InteractiveCanvasObject> & Pick<InteractiveCanvasObject, "id" | "type">,
): InteractiveCanvasObject {
  return {
    text: "Hello text",
    parentId: null,
    geometry: { x: 10, y: 20, width: 120, height: 140 },
    style: { shape: partial.type },
    ...partial,
  } as InteractiveCanvasObject;
}

function textSlotFor(object: InteractiveCanvasObject): TextSlot {
  const slot = objectDefFor(object)?.textSlot;
  if (!slot) throw new Error(`missing text slot for ${object.type}`);
  return slot;
}

describe("text slot below band sizing", () => {
  it("resolves a one-line icon band outside the glyph box, exactly as wide as the measured name", () => {
    const object = makeObject({
      id: "person-one-line",
      type: "icon",
      icon: "person",
      geometry: { x: 10, y: 20, width: 120, height: 140 },
      style: { shape: "icon" },
    });
    const slot = textSlotFor(object);
    const expectedWidth = measureWidth("Hello text", nameFont());
    const figjamWidth = measureWidth("Hello text", nameFont(FIGJAM_CANVAS_STYLE));
    // Measured in Chromium layout units (1/64 px), Inter SemiBold 17.5 / Bold 15.
    expect(expectedWidth * 64).toBe(Math.round(expectedWidth * 64));
    expect(expectedWidth).toBe(80.734375);
    expect(figjamWidth).toBe(70.015625);

    expect(slotLineHeightPx(slot.typography)).toBe(18);
    expect(belowBandSize(object.text, object)).toEqual({
      lines: 1,
      widthPx: expectedWidth,
      heightPx: NAME_LINE_PX,
    });
    // Default (schematic) tile style: the glyph box is the 56px tile centered in the 120×140 box
    // (y 42..98); the band hangs BELOW_BAND_GAP_PX under it, centered on it.
    expect(resolveTextSlot(slot, object).rect).toEqual({
      x: (120 - expectedWidth) / 2,
      y: 42 + 56 + BELOW_BAND_GAP_PX,
      width: expectedWidth,
      height: NAME_LINE_PX,
    });
    // Glyph style (figjam): the glyph box is the whole object box; names at 15px in 18px lines.
    expect(resolveTextSlot(slot, object, 1, { canvasStyle: FIGJAM_CANVAS_STYLE }).rect).toEqual({
      x: (120 - figjamWidth) / 2,
      y: 140 + BELOW_BAND_GAP_PX,
      width: figjamWidth,
      height: BELOW_TEXT_LINE_HEIGHT_PX,
    });
  });

  it("wraps below text against at least the 200px band width, wider than a narrow glyph", () => {
    const object = makeObject({
      id: "chat-long",
      type: "icon",
      icon: "chat",
      text: "Adapt Question Based on Interview History",
      geometry: { x: 10, y: 20, width: 120, height: 110 },
      style: { shape: "icon" },
    });
    const size = belowBandSize(object.text, object);
    const wrapped = wrapText(object.text, nameFont(), {
      maxWidth: BELOW_BAND_MIN_WIDTH_PX,
      lineHeight: NAME_LINE_PX,
      whiteSpace: "pre-wrap",
    });

    expect(belowBandMaxWidthPx(object)).toBe(BELOW_BAND_MIN_WIDTH_PX);
    // Two lines at figjam's 15px and at the default 17.5px — what both
    // painters draw; the old 0.62em estimate sized the default band for
    // three, 21px taller than the text.
    expect(belowBandSize(object.text, object, FIGJAM_CANVAS_STYLE).lines).toBe(2);
    expect(size.lines).toBe(2);
    expect(wrapped.lines.map((line) => line.text.trimEnd())).toEqual(["Adapt Question Based", "on Interview History"]);
    expect(size.widthPx).toBe(wrapped.maxLineWidth);
    expect(size.heightPx).toBe(2 * NAME_LINE_PX);
    expect(size.widthPx).toBeGreaterThan(object.geometry.width);
    expect(size.widthPx).toBeLessThanOrEqual(BELOW_BAND_MIN_WIDTH_PX);
  });

  it("sizes the band to the measured line, so a short word of wide glyphs never breaks", () => {
    // 0.62em per character ran narrow for these: 4 × 9.3 = 37.2px, but "Code"
    // measures ~39px in Inter Bold — the band used to split it "Cod / e".
    for (const style of [canvasThemePreset("figjam"), canvasThemePreset("schematic-light")]) {
      for (const text of ["Code", "Bun", "Web App"]) {
        const object = makeObject({ id: "short", type: "icon", icon: "code", text, geometry: { x: 0, y: 0, width: 64, height: 64 } });
        const resolved = resolveTextSlot(textSlotFor(object), object, 1, { canvasStyle: style });
        expect(resolved.rect.width).toBe(measureWidth(text, nameFont(style)));
        expect(resolved.rect.x).toBeCloseTo((64 - resolved.rect.width) / 2, 10);
        // The static renderer wraps inside this width at the same advances.
        expect(wrapTextLines(text, resolved.rect.width, resolved.typography)).toEqual([text]);
        expect(belowBandSize(text, object, style).lines).toBe(1);
      }
    }
  });

  it("re-wraps every caption into the same lines inside its own band (the stage wraps at the band width)", () => {
    const texts = [
      "Adapt Question Based on Interview History",
      "Orders DB",
      "Checkout service → payments",
      "WWWWWWWWWWWWWWWWWW",
      "Supercalifragilisticexpialidocious recovery",
      "two\nexplicit lines",
      "well-known long-running job-scheduler",
    ];
    for (const style of [canvasThemePreset("figjam"), canvasThemePreset("schematic-light")]) {
      for (const text of texts) {
        const object = makeObject({ id: "caption", type: "icon", icon: "code", text, geometry: { x: 0, y: 0, width: 64, height: 64 } });
        const resolved = resolveTextSlot(textSlotFor(object), object, 1, { canvasStyle: style });
        const atMax = wrapTextLines(text, belowBandMaxWidthPx(object), resolved.typography);
        expect(wrapTextLines(text, resolved.rect.width, resolved.typography)).toEqual(atMax);
        expect(belowBandSize(text, object, style).lines).toBe(atMax.length);
        expect(resolved.rect.height).toBe(atMax.length * slotLineHeightPx(resolved.typography));
      }
    }
  });

  it("follows the stage's pre-wrap: a trailing newline adds no line, a blank line does", () => {
    const object = (text: string) =>
      makeObject({ id: "caption", type: "icon", icon: "code", text, geometry: { x: 0, y: 0, width: 64, height: 64 } });
    expect(belowBandSize("Orders\n", object("Orders\n")).lines).toBe(1);
    expect(belowBandSize("Orders\n\nDB", object("Orders\n\nDB")).lines).toBe(3);
  });

  it("caps below band width at the object width when the glyph is wider than 200px", () => {
    const object = makeObject({
      id: "icon-wide",
      type: "icon",
      text: "Supercalifragilisticexpialidocious ".repeat(4).trim(),
      geometry: { x: 0, y: 0, width: 260, height: 120 },
      style: { shape: "icon" },
    });
    const size = belowBandSize(object.text, object);

    expect(belowBandMaxWidthPx(object)).toBe(260);
    expect(size.widthPx).toBeLessThanOrEqual(260);
    expect(size.widthPx).toBeGreaterThan(200);
    expect(size.lines).toBeGreaterThan(1);
  });

  it("reserves no below band for empty text but renders icon text at compact heights", () => {
    const empty = makeObject({
      id: "person-empty",
      type: "icon",
      icon: "person",
      text: "",
      geometry: { x: 10, y: 20, width: 120, height: 140 },
      style: { shape: "icon" },
    });
    const compact = makeObject({
      id: "person-compact",
      type: "icon",
      icon: "person",
      geometry: { x: 10, y: 20, width: 120, height: 90 },
      style: { shape: "icon" },
    });
    const slot = textSlotFor(compact);

    expect(belowBandSize(empty.text, empty)).toEqual({ lines: 0, widthPx: 0, heightPx: 0 });
    expect(belowBandSize(compact.text, compact)).toEqual({
      lines: 1,
      widthPx: measureWidth("Hello text", nameFont()),
      heightPx: NAME_LINE_PX,
    });
    expect(resolveTextSlot(slot, compact).hidden).toBe(false);
  });

  it("keeps hand-built compact below slots hidden under their threshold", () => {
    const object = makeObject({
      id: "synthetic-compact",
      type: "rectangle",
      geometry: { x: 10, y: 20, width: 120, height: 90 },
      style: { shape: "rectangle" },
    });
    const slot = belowTextSlot({ compactBelowHeightPx: 100 });

    expect(resolveTextSlot(slot, object).hidden).toBe(true);
  });

  it("returns the glyph+band union in object-local coordinates", () => {
    const object = makeObject({
      id: "person-bounds",
      type: "icon",
      icon: "person",
      geometry: { x: 10, y: 20, width: 120, height: 140 },
      style: { shape: "icon" },
    });
    // Glyph style (figjam): the glyph box is the whole object box.
    const figjamBand = belowBandSize(object.text, object, FIGJAM_CANVAS_STYLE);
    expect(belowExtendedBoundsPx(object, FIGJAM_CANVAS_STYLE)).toEqual({
      x: Math.min(0, (object.geometry.width - figjamBand.widthPx) / 2),
      y: 0,
      width: Math.max(object.geometry.width, figjamBand.widthPx),
      height: object.geometry.height + BELOW_BAND_GAP_PX + figjamBand.heightPx,
    });
    expect(belowExtendedBoundsPx({ ...object, text: "" }, FIGJAM_CANVAS_STYLE)).toEqual({
      x: 0,
      y: 0,
      width: object.geometry.width,
      height: object.geometry.height,
    });

    // Tile style (the schematic default): the tile is capped at iconTileMaxPx and centered both
    // ways; the union starts at the tile top and the band sits under the tile, centered on it.
    const tile = iconTileRectPx(120, 140, DEFAULT_CANVAS_STYLE.iconTileMaxPx);
    expect(tile).toEqual({ x: 32, y: 42, width: 56, height: 56 });
    const band = belowBandSize(object.text, object);
    const bandX = tile.x + (tile.width - band.widthPx) / 2;
    expect(belowExtendedBoundsPx(object)).toEqual({
      x: Math.min(tile.x, bandX),
      y: tile.y,
      width: Math.max(tile.x + tile.width, bandX + band.widthPx) - Math.min(tile.x, bandX),
      height: tile.height + BELOW_BAND_GAP_PX + band.heightPx,
    });
    expect(belowExtendedBoundsPx({ ...object, text: "" })).toEqual(tile);
  });

  it("keeps the object def below-slot table in sync with schema below types", () => {
    const belowTypes = new Set<string>(BELOW_TEXT_TYPES);

    for (const def of OBJECT_DEFS) {
      const placement = def.textSlot ? textPlacementName(def.textSlot.placement) : undefined;
      expect(placement === "below").toBe(belowTypes.has(def.kind));
      if (belowTypes.has(def.kind)) {
        expect(def.textSlot?.compactBelowHeightPx).toBe(
          BELOW_TEXT_TYPE_CONFIG[def.kind as keyof typeof BELOW_TEXT_TYPE_CONFIG]
            .compactBelowHeightPx,
        );
      }
    }
  });
});
