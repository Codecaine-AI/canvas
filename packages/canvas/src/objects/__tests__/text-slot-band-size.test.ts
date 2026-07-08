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
  estimateSlotLineCount,
  estimateWrappedText,
  resolveTextSlot,
  slotLineHeightPx,
  textPlacementName,
  type TextSlot,
} from "../text-slots";
import type { InteractiveCanvasObject } from "../../state/schema";

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
  it("resolves a one-line icon band outside the glyph box", () => {
    const object = makeObject({
      id: "person-one-line",
      type: "icon",
      icon: "person",
      geometry: { x: 10, y: 20, width: 120, height: 140 },
      style: { shape: "icon" },
    });
    const slot = textSlotFor(object);
    const expectedWidth = "Hello text".length * 15 * 0.62;

    expect(estimateSlotLineCount("Hello text", BELOW_BAND_MIN_WIDTH_PX, slot.typography)).toBe(1);
    expect(slotLineHeightPx(slot.typography)).toBe(18);
    expect(belowBandSize(object.text, object)).toEqual({
      lines: 1,
      widthPx: expectedWidth,
      heightPx: BELOW_TEXT_LINE_HEIGHT_PX,
    });
    expect(resolveTextSlot(slot, object).rect).toEqual({
      x: (120 - expectedWidth) / 2,
      y: 140 + BELOW_BAND_GAP_PX,
      width: expectedWidth,
      height: 18,
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
    const estimate = estimateWrappedText(object.text, BELOW_BAND_MIN_WIDTH_PX);
    const size = belowBandSize(object.text, object);

    expect(belowBandMaxWidthPx(object)).toBe(BELOW_BAND_MIN_WIDTH_PX);
    expect(size.lines).toBe(2);
    expect(size.widthPx).toBe(estimate.longestLineWidthPx);
    expect(size.widthPx).toBeGreaterThan(object.geometry.width);
    expect(size.widthPx).toBeLessThanOrEqual(BELOW_BAND_MIN_WIDTH_PX);
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
    expect(size.widthPx).toBe(260);
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
      widthPx: "Hello text".length * 15 * 0.62,
      heightPx: BELOW_TEXT_LINE_HEIGHT_PX,
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
    const band = belowBandSize(object.text, object);

    expect(belowExtendedBoundsPx(object)).toEqual({
      x: Math.min(0, (object.geometry.width - band.widthPx) / 2),
      y: 0,
      width: Math.max(object.geometry.width, band.widthPx),
      height: object.geometry.height + BELOW_BAND_GAP_PX + band.heightPx,
    });
    expect(belowExtendedBoundsPx({ ...object, text: "" })).toEqual({
      x: 0,
      y: 0,
      width: object.geometry.width,
      height: object.geometry.height,
    });
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
