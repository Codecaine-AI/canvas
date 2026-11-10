import { describe, expect, it } from "bun:test";
import { canvasThemePreset, FIGJAM_CANVAS_STYLE } from "../../theme/canvas-style";
import { resolveIconPaint, resolveShapePaint } from "../../theme/palette";
import type { InteractiveCanvasObject } from "../../state/schema";
import {
  BELOW_TEXT_LINE_HEIGHT_PX,
  BELOW_TEXT_SLOT,
  CENTER_TEXT_SLOT,
  INSET_BODY_TEXT_SLOT,
  OBJECT_TEXT_COLOR,
  SHAPE_TEXT_TYPOGRAPHY,
  TITLE_CHIP_TEXT_SLOT,
  belowBandSize,
  belowExtendedBoundsPx,
  resolveSlotTypography,
  resolveTextSlot,
  slotNameLineCapacity,
  textSlotClampLineCount,
} from "../text-slots";

const LIGHT = canvasThemePreset("schematic-light");
const DARK = canvasThemePreset("schematic-dark");
/** The schematic name line box: textFontSizePx × 1.2 (21px at 17.5px). */
const NAME_LINE_PX = LIGHT.textFontSizePx * 1.2;

function shape(partial: Partial<InteractiveCanvasObject> = {}): InteractiveCanvasObject {
  return {
    id: "shape",
    type: "process",
    text: "Run Executor LLM",
    parentId: null,
    geometry: { x: 0, y: 0, width: 240, height: 80 },
    style: { shape: "rounded-rect" },
    ...partial,
  } as InteractiveCanvasObject;
}

function icon(partial: Partial<InteractiveCanvasObject> = {}): InteractiveCanvasObject {
  return {
    id: "icon",
    type: "icon",
    icon: "database",
    text: "Orders DB",
    parentId: null,
    geometry: { x: 0, y: 0, width: 64, height: 64 },
    style: { shape: "icon" },
    ...partial,
  } as InteractiveCanvasObject;
}

/**
 * A node shows its name only. Older boards still store a one-line `detail`
 * under the name; the slot resolver, the below band and the bounds built on
 * it read past it, so such a board lays out as if the field were absent.
 */
describe("a stored detail never takes room in a text slot", () => {
  it("a center slot resolves and clamps exactly as without the detail", () => {
    const stored = shape({ detail: "db.t3.micro:5432", geometry: { x: 0, y: 0, width: 240, height: 56 } });
    const plain = shape({ geometry: stored.geometry });
    const resolved = resolveTextSlot(CENTER_TEXT_SLOT, stored, 1, { canvasStyle: LIGHT });
    expect(resolved).toEqual(resolveTextSlot(CENTER_TEXT_SLOT, plain, 1, { canvasStyle: LIGHT }));
    expect("detail" in resolved).toBe(false);
    expect(slotNameLineCapacity(resolved)).toBe(textSlotClampLineCount(resolved.rect.height, NAME_LINE_PX));
  });

  it("an icon's caption band, slot and bounds ignore it, and a detail-only caption is empty", () => {
    const stored = icon({ detail: "s3://customer-data/normalized/2026/records.parquet" });
    const plain = icon();
    expect(belowBandSize(stored.text, stored, LIGHT)).toEqual(belowBandSize(plain.text, plain, LIGHT));
    expect(resolveTextSlot(BELOW_TEXT_SLOT, stored, 1, { canvasStyle: LIGHT }).rect.height).toBe(NAME_LINE_PX);
    expect(belowExtendedBoundsPx(stored, LIGHT)).toEqual(belowExtendedBoundsPx(plain, LIGHT));
    const detailOnly = icon({ text: "", detail: ":4820" });
    expect(belowBandSize("", detailOnly, LIGHT)).toEqual({ lines: 0, widthPx: 0, heightPx: 0 });
    expect(resolveTextSlot(BELOW_TEXT_SLOT, plain, 1, { canvasStyle: FIGJAM_CANVAS_STYLE }).rect.height).toBe(
      BELOW_TEXT_LINE_HEIGHT_PX,
    );
  });
});

describe("resolveSlotTypography", () => {
  it("returns the preset itself under the figjam style (figjam renders unchanged)", () => {
    expect(resolveSlotTypography(CENTER_TEXT_SLOT, shape(), FIGJAM_CANVAS_STYLE)).toBe(SHAPE_TEXT_TYPOGRAPHY);
    expect(resolveSlotTypography(BELOW_TEXT_SLOT, icon(), FIGJAM_CANVAS_STYLE)).toBe(SHAPE_TEXT_TYPOGRAPHY);
    expect(resolveSlotTypography(INSET_BODY_TEXT_SLOT, shape({ type: "sticky" }), FIGJAM_CANVAS_STYLE)).toBe(
      INSET_BODY_TEXT_SLOT.typography,
    );
    expect(SHAPE_TEXT_TYPOGRAPHY.color).toBe(OBJECT_TEXT_COLOR);
    expect(OBJECT_TEXT_COLOR).toBe(FIGJAM_CANVAS_STYLE.textColor);
    expect(SHAPE_TEXT_TYPOGRAPHY.fontWeight).toBe(FIGJAM_CANVAS_STYLE.textFontWeight);
  });

  it("takes the style's name color, weight, and size for shapes and icon captions", () => {
    const body = resolveSlotTypography(CENTER_TEXT_SLOT, shape({ color: "blue" }), DARK);
    expect(body).toEqual({
      ...SHAPE_TEXT_TYPOGRAPHY,
      color: resolveShapePaint("blue", DARK).text,
      fontWeight: 600,
      fontSizePx: 17.5,
    });
    expect(body.color).toBe("#F0F6FC");
    const caption = resolveSlotTypography(BELOW_TEXT_SLOT, icon({ color: "teal" }), LIGHT);
    expect(caption.color).toBe(resolveIconPaint("teal", LIGHT).label);
    expect(caption.fontWeight).toBe(600);
    expect(caption.fontSizePx).toBe(LIGHT.textFontSizePx);
  });

  it("gives a card sticky the style's text color and leaves title chips alone", () => {
    expect(resolveSlotTypography(INSET_BODY_TEXT_SLOT, shape({ type: "sticky", color: "yellow" }), LIGHT).color).toBe(
      "#1F1F1F",
    );
    expect(resolveSlotTypography(TITLE_CHIP_TEXT_SLOT, shape({ type: "section" }), LIGHT)).toBe(
      TITLE_CHIP_TEXT_SLOT.typography,
    );
  });
});
