import { describe, expect, it } from "bun:test";
import {
  estimateTitleChipWidthPx,
  resolveTextSlot,
  TITLE_CHIP,
  TITLE_CHIP_TEXT_SLOT,
  titleChipMaxWidthPx,
  titleChipScale,
} from "../../text-slots";
import type { InteractiveCanvasObject } from "../../../state/schema";
import { sectionDef } from "../def";

function makeSection(overrides: Partial<InteractiveCanvasObject> = {}): InteractiveCanvasObject {
  return {
    id: "section-title-scale",
    type: "section",
    text: "Section",
    color: "gray",
    geometry: { x: 0, y: 0, width: 480, height: 360 },
    style: { shape: "section" },
    ...overrides,
  } as InteractiveCanvasObject;
}

describe("section title chip scale", () => {
  it("keeps natural size at zoom 1 and when zoomed in", () => {
    expect(titleChipScale(1)).toBe(1);
    expect(titleChipScale(2)).toBe(1);
  });

  it("grows sub-linearly with the inverse zoom when zoomed out", () => {
    const { zoomOutGrowth } = TITLE_CHIP;
    expect(titleChipScale(0.25)).toBeCloseTo(4 ** zoomOutGrowth, 5);
    // Sub-linear: grows past natural size but stays below full 1/zoom.
    expect(titleChipScale(0.25)).toBeGreaterThan(1);
    expect(titleChipScale(0.25)).toBeLessThan(4);
  });

  it("is uniform across sections and capped at maxZoomOutScale", () => {
    expect(titleChipScale(0.001)).toBe(TITLE_CHIP.maxZoomOutScale);
  });

  it("budgets the scaled chip width to the section's inner width", () => {
    const inset = TITLE_CHIP.insetFromSectionCornerPx;
    expect(titleChipMaxWidthPx(400, 1)).toBe(400 - inset * 2);
    expect(titleChipMaxWidthPx(400, 4)).toBeCloseTo((400 - inset * 2) / 4, 5);
    expect(titleChipMaxWidthPx(0, 4)).toBe(0);
  });

  it("caps the resolved title chip rect to the section's inner width at every zoom", () => {
    const object = makeSection({
      text: "A very long section title that must ellipsize instead of spilling",
      geometry: { x: 0, y: 0, width: 120, height: 90 },
    });
    expect(estimateTitleChipWidthPx(object.text)).toBeGreaterThan(
      titleChipMaxWidthPx(object.geometry.width, 1),
    );

    for (const zoom of [2, 1, 0.25]) {
      const resolved = resolveTextSlot(TITLE_CHIP_TEXT_SLOT, object, zoom);
      const maxWidth = titleChipMaxWidthPx(object.geometry.width, resolved.scale);
      expect(resolved.rect.width).toBeCloseTo(maxWidth, 5);
      expect(resolved.rect.width * resolved.scale).toBeLessThanOrEqual(
        object.geometry.width - TITLE_CHIP.insetFromSectionCornerPx * 2,
      );
    }
  });

  it("estimates chip width with a floor for short titles", () => {
    expect(estimateTitleChipWidthPx("")).toBe(72);
    expect(estimateTitleChipWidthPx("Narrow section")).toBeGreaterThan(72);
  });

  it("declares bold section title chips that truncate with an ellipsis", () => {
    expect(sectionDef.css).toContain("font-weight: 700");
    expect(sectionDef.css).toContain("text-overflow: ellipsis");
  });
});
