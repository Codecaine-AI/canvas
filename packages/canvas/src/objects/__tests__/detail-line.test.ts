import { describe, expect, it } from "bun:test";
import { canvasThemePreset, FIGJAM_CANVAS_STYLE } from "../../theme/canvas-style";
import { CANVAS_MONO_FONT_STACK, CANVAS_SANS_FONT_STACK } from "../../theme/fonts";
import { resolveIconPaint, resolveShapePaint } from "../../theme/palette";
import type { InteractiveCanvasObject } from "../../state/schema";
import {
  BELOW_BAND_GAP_PX,
  BELOW_TEXT_LINE_HEIGHT_PX,
  BELOW_TEXT_SLOT,
  CENTER_TEXT_INSET_PX,
  CENTER_TEXT_SLOT,
  DETAIL_LINE_GAP_PX,
  INSET_BODY_TEXT_SLOT,
  OBJECT_TEXT_COLOR,
  SHAPE_TEXT_TYPOGRAPHY,
  TITLE_CHIP_TEXT_SLOT,
  belowBandSize,
  belowExtendedBoundsPx,
  collapseDetailText,
  detailTypography,
  estimateDetailWidthPx,
  resolveSlotTypography,
  resolveTextSlot,
  slotDetailText,
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

describe("detail line typography", () => {
  it("figjam paints Inter 400 at 13px in the muted detail color, line-height 1.3", () => {
    const typography = detailTypography(FIGJAM_CANVAS_STYLE);
    expect(typography).toEqual({
      font: "sans",
      fontFamily: CANVAS_SANS_FONT_STACK,
      fontSizePx: 13,
      fontWeight: 400,
      lineHeightPx: 13 * 1.3,
      color: "#5C5C5C",
    });
  });

  it("the schematic themes paint IBM Plex Mono 500 at 14px", () => {
    expect(detailTypography(LIGHT)).toEqual({
      font: "mono",
      fontFamily: CANVAS_MONO_FONT_STACK,
      fontSizePx: 14,
      fontWeight: 500,
      lineHeightPx: 14 * 1.3,
      color: "#5B6578",
    });
    expect(detailTypography(DARK).color).toBe("#8B93B5");
  });

  it("budgets mono runs at the exact 0.6em cell and sans runs at the 0.62em heuristic", () => {
    expect(estimateDetailWidthPx(":4820", detailTypography(LIGHT))).toBe(5 * 0.6 * 14);
    expect(estimateDetailWidthPx(":4820", detailTypography(FIGJAM_CANVAS_STYLE))).toBeCloseTo(5 * 0.62 * 13, 10);
  });
});

describe("detail text", () => {
  it("collapses newlines and whitespace runs to single spaces and trims", () => {
    expect(collapseDetailText("  line one\nline two\n\t line three  ")).toBe("line one line two line three");
    expect(collapseDetailText("   ")).toBe("");
    expect(collapseDetailText(undefined)).toBe("");
  });

  it("is never painted by a sticky's or a section's text slot", () => {
    expect(slotDetailText(shape({ detail: ":4820" }))).toBe(":4820");
    expect(slotDetailText(shape({ type: "sticky", detail: ":4820" }))).toBe("");
    expect(slotDetailText(shape({ type: "section", detail: ":4820" }))).toBe("");
  });
});

describe("resolveTextSlot — detail line in a center slot", () => {
  it("resolves the collapsed detail with the style's typography and the 3px gap", () => {
    const resolved = resolveTextSlot(CENTER_TEXT_SLOT, shape({ detail: "Function\nCalling LLM" }), 1, {
      canvasStyle: LIGHT,
    });
    expect(resolved.detail).toEqual({
      text: "Function Calling LLM",
      typography: detailTypography(LIGHT),
      gapPx: DETAIL_LINE_GAP_PX,
    });
  });

  it("has no detail line when the object has none (or only whitespace)", () => {
    expect(resolveTextSlot(CENTER_TEXT_SLOT, shape()).detail).toBeNull();
    expect(resolveTextSlot(CENTER_TEXT_SLOT, shape({ detail: " \n " })).detail).toBeNull();
  });

  it("the name gives up lines to keep the detail", () => {
    // 240×80 process: 56px tall slot → 2 name lines (21px) alone; with a
    // 14px mono detail the reserve is 3 + 18.2, leaving 1.
    const plain = resolveTextSlot(CENTER_TEXT_SLOT, shape(), 1, { canvasStyle: LIGHT });
    const withDetail = resolveTextSlot(CENTER_TEXT_SLOT, shape({ detail: ":4820" }), 1, { canvasStyle: LIGHT });
    expect(plain.rect.height).toBe(80 - CENTER_TEXT_INSET_PX.y * 2);
    expect(slotNameLineCapacity(plain)).toBe(textSlotClampLineCount(56, NAME_LINE_PX));
    expect(slotNameLineCapacity(plain)).toBe(2);
    expect(slotNameLineCapacity(withDetail)).toBe(Math.floor((56 - 3 - 18.2) / NAME_LINE_PX));
    expect(slotNameLineCapacity(withDetail)).toBe(1);
  });

  it("drops the detail (the name keeps the slot) when one name line plus the detail does not fit", () => {
    // 40px tall rectangle → 16px slot: shorter than a name line + 3 + 18.2.
    const short = shape({ detail: ":4820", geometry: { x: 0, y: 0, width: 200, height: 40 } });
    const resolved = resolveTextSlot(CENTER_TEXT_SLOT, short, 1, { canvasStyle: LIGHT });
    expect(resolved.detail).toBeNull();
    expect(slotNameLineCapacity(resolved)).toBe(1);
    // Exactly tall enough: one name line + gap + detail.
    const exact = shape({ detail: ":4820", geometry: { x: 0, y: 0, width: 200, height: 24 + NAME_LINE_PX + 3 + 18.2 } });
    expect(resolveTextSlot(CENTER_TEXT_SLOT, exact, 1, { canvasStyle: LIGHT }).detail).not.toBeNull();
  });

  it("a detail-only shape reserves no name line: the detail alone needs only its own line", () => {
    // 200×50 process → 26px slot: shorter than 18 + 3 + 18.2, but with no
    // name the detail needs just its 18.2px line.
    const detailOnly = shape({ text: "", detail: "port: 5432", geometry: { x: 0, y: 0, width: 200, height: 50 } });
    const resolved = resolveTextSlot(CENTER_TEXT_SLOT, detailOnly, 1, { canvasStyle: LIGHT });
    expect(resolved.rect.height).toBe(26);
    expect(resolved.detail?.text).toBe("port: 5432");
    // Shorter than the detail line itself, it still drops.
    const tooShort = shape({ text: "", detail: "port: 5432", geometry: { x: 0, y: 0, width: 200, height: 24 + 16 } });
    expect(resolveTextSlot(CENTER_TEXT_SLOT, tooShort, 1, { canvasStyle: LIGHT }).detail).toBeNull();
    // The in-place name editor always holds a name line (its textarea), so mid-edit the name keeps the slot.
    expect(resolveTextSlot(CENTER_TEXT_SLOT, detailOnly, 1, { canvasStyle: LIGHT, draftText: "" }).detail).toBeNull();
  });

  it("never resolves a detail in a sticky body or a section title chip", () => {
    const sticky = shape({ type: "sticky", style: { shape: "note" }, detail: ":4820", geometry: { x: 0, y: 0, width: 300, height: 300 } });
    expect(resolveTextSlot(INSET_BODY_TEXT_SLOT, sticky, 1, { canvasStyle: LIGHT }).detail).toBeNull();
    const section = shape({ type: "section", style: { shape: "section" }, detail: ":4820" });
    expect(resolveTextSlot(TITLE_CHIP_TEXT_SLOT, section, 1, { canvasStyle: LIGHT }).detail).toBeNull();
  });
});

describe("resolveTextSlot — detail line in the below band", () => {
  it("grows the band by the gap and one detail line, widened to the detail", () => {
    const plain = icon();
    // 19 mono cells at 14px = 159.6px: wider than the name, under the 200px max width.
    const detailed = icon({ detail: "postgres 16 · db.t3" });
    const nameBand = belowBandSize(plain.text, plain, LIGHT);
    const band = belowBandSize(detailed.text, detailed, LIGHT);
    const detailWidth = estimateDetailWidthPx("postgres 16 · db.t3", detailTypography(LIGHT));
    expect(detailWidth).toBeGreaterThan(nameBand.widthPx);
    expect(band).toEqual({
      lines: 1,
      widthPx: Math.max(nameBand.widthPx, detailWidth),
      heightPx: NAME_LINE_PX + DETAIL_LINE_GAP_PX + 14 * 1.3,
    });
    const resolved = resolveTextSlot(BELOW_TEXT_SLOT, detailed, 1, { canvasStyle: LIGHT });
    // The band hangs under the tile: 56px (iconTileMaxPx) centered in the 64px box → bottom 60.
    expect(resolved.rect).toEqual({
      x: (64 - band.widthPx) / 2,
      y: 4 + 56 + BELOW_BAND_GAP_PX,
      width: band.widthPx,
      height: NAME_LINE_PX + DETAIL_LINE_GAP_PX + 14 * 1.3,
    });
    expect(resolved.detail?.text).toBe("postgres 16 · db.t3");
  });

  it("caps the band at its max width (where the detail ellipsizes)", () => {
    const detailed = icon({ detail: "s3://customer-data/normalized/2026/records.parquet" });
    expect(belowBandSize(detailed.text, detailed, LIGHT).widthPx).toBe(200);
  });

  it("sizes a detail-only caption without a gap", () => {
    const detailOnly = icon({ text: "", detail: "detail only" });
    expect(belowBandSize("", detailOnly, LIGHT)).toEqual({
      lines: 0,
      widthPx: estimateDetailWidthPx("detail only", detailTypography(LIGHT)),
      heightPx: 14 * 1.3,
    });
  });

  it("extends the object's bounds (hit-testing, routing, painted extents) by the detail line", () => {
    const plain = icon();
    const detailed = icon({ detail: ":4820" });
    expect(belowExtendedBoundsPx(detailed, LIGHT).height).toBe(
      belowExtendedBoundsPx(plain, LIGHT).height + DETAIL_LINE_GAP_PX + 14 * 1.3,
    );
    // The figjam style sizes the line in the figjam detail font.
    expect(belowExtendedBoundsPx(detailed, FIGJAM_CANVAS_STYLE).height).toBe(
      belowExtendedBoundsPx(plain, FIGJAM_CANVAS_STYLE).height + DETAIL_LINE_GAP_PX + 13 * 1.3,
    );
    // A detail-only icon still has a caption band (under the 56px tile).
    expect(belowExtendedBoundsPx(icon({ text: "", detail: ":4820" }), LIGHT).height).toBe(
      56 + BELOW_BAND_GAP_PX + 14 * 1.3,
    );
  });

  it("leaves objects without a detail exactly as before", () => {
    const plain = icon();
    expect(belowBandSize(plain.text, plain, LIGHT)).toEqual(belowBandSize(plain.text, plain));
    expect(resolveTextSlot(BELOW_TEXT_SLOT, plain).rect.height).toBe(NAME_LINE_PX);
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
    expect(body.color).toBe("#E4E6F2");
    const caption = resolveSlotTypography(BELOW_TEXT_SLOT, icon({ color: "teal" }), LIGHT);
    expect(caption.color).toBe(resolveIconPaint("teal", LIGHT).label);
    expect(caption.fontWeight).toBe(600);
    expect(caption.fontSizePx).toBe(LIGHT.textFontSizePx);
  });

  it("gives a card sticky the style's text color and leaves title chips alone", () => {
    expect(resolveSlotTypography(INSET_BODY_TEXT_SLOT, shape({ type: "sticky", color: "yellow" }), LIGHT).color).toBe(
      "#0F1E36",
    );
    expect(resolveSlotTypography(TITLE_CHIP_TEXT_SLOT, shape({ type: "section" }), LIGHT)).toBe(
      TITLE_CHIP_TEXT_SLOT.typography,
    );
  });
});
