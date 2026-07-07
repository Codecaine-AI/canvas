import { describe, expect, it } from "bun:test";
import {
  estimateSectionTitleChipWidthPx,
  SECTION_GEOMETRY,
  sectionDef,
  sectionTitleMaxWidthPx,
  sectionTitleScale,
} from "../def";

describe("section title chip scale", () => {
  it("keeps natural size at zoom 1 and when zoomed in", () => {
    expect(sectionTitleScale(1)).toBe(1);
    expect(sectionTitleScale(2)).toBe(1);
  });

  it("grows sub-linearly with the inverse zoom when zoomed out", () => {
    const { zoomOutGrowth } = SECTION_GEOMETRY.titleChip;
    expect(sectionTitleScale(0.25)).toBeCloseTo(4 ** zoomOutGrowth, 5);
    // Sub-linear: grows past natural size but stays below full 1/zoom.
    expect(sectionTitleScale(0.25)).toBeGreaterThan(1);
    expect(sectionTitleScale(0.25)).toBeLessThan(4);
  });

  it("is uniform across sections and capped at maxZoomOutScale", () => {
    expect(sectionTitleScale(0.001)).toBe(SECTION_GEOMETRY.titleChip.maxZoomOutScale);
  });

  it("budgets the scaled chip width to the section's inner width", () => {
    const inset = SECTION_GEOMETRY.titleChip.insetFromSectionCornerPx;
    expect(sectionTitleMaxWidthPx(400, 4)).toBeCloseTo((400 - inset * 2) / 4, 5);
    expect(sectionTitleMaxWidthPx(0, 4)).toBe(0);
  });

  it("estimates chip width with a floor for short titles", () => {
    expect(estimateSectionTitleChipWidthPx("")).toBe(72);
    expect(estimateSectionTitleChipWidthPx("Narrow section")).toBeGreaterThan(72);
  });

  it("declares bold section title chips that truncate with an ellipsis", () => {
    expect(sectionDef.css).toContain("font-weight: 700");
    expect(sectionDef.css).toContain("text-overflow: ellipsis");
  });
});
