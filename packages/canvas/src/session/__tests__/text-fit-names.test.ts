import { describe, expect, test } from "bun:test";

import { canvasThemePreset } from "../../theme/canvas-style";
import type { InteractiveCanvasObject } from "../../state/schema";

import { textFitReport } from "../../board/text-fit";
import { FIGJAM_CANVAS_STYLE } from "./helpers";
import { measureWidth } from "../../theme/text-measure.ts";

/**
 * text-fit judges a node's name only. A stored `detail` (older boards) never
 * paints, so it never enters a fit: the report on a node that holds one is
 * the report on the same node without it, in every style. Edge-label chips
 * measure at the style's chip size.
 */

const LIGHT = canvasThemePreset("schematic-light");
const DARK = canvasThemePreset("schematic-dark");
const FIGJAM = FIGJAM_CANVAS_STYLE;

function shape(partial: Partial<InteractiveCanvasObject> = {}): InteractiveCanvasObject {
  return {
    id: "shape",
    type: "rectangle",
    text: "Run Executor LLM",
    parentId: null,
    geometry: { x: 0, y: 0, width: 240, height: 80 },
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

const LONG_DETAIL = "s3://customer-data/normalized/2026/records.parquet";

describe("text-fit — a stored detail never enters the fit", () => {
  test("a shape or icon with a long detail gets the report of the same node without it", () => {
    for (const style of [LIGHT, DARK, FIGJAM]) {
      for (const [stored, plain] of [
        [shape({ detail: LONG_DETAIL }), shape()],
        [shape({ detail: LONG_DETAIL, geometry: { x: 0, y: 0, width: 200, height: 40 } }), shape({ geometry: { x: 0, y: 0, width: 200, height: 40 } })],
        [icon({ detail: LONG_DETAIL }), icon()],
      ] as const) {
        const report = textFitReport(stored, stored.geometry, stored.text, style);
        expect(report).toEqual(textFitReport(plain, plain.geometry, plain.text, style));
        expect(report.fits).toBe(true);
        expect(report.detail).not.toContain("detail");
      }
    }
  });

  test("a detail-only node has nothing to fit", () => {
    expect(textFitReport(shape({ text: "", detail: LONG_DETAIL }), shape().geometry, "", LIGHT).slot).toBe("none");
  });
});

describe("text-fit — edge-label chips at the style's size", () => {
  const EDGE = { id: "e", from: { objectId: "a" }, to: { objectId: "b" } };

  test("the schematic themes measure the 26px mono chip, figjam the 30px sans chip", () => {
    const roomy = { width: 10000, height: 10000 };
    const figjam = textFitReport(EDGE, { width: 40, height: 40 }, "read/write", FIGJAM);
    const light = textFitReport(EDGE, { width: 40, height: 40 }, "read/write", LIGHT);
    // Needed = the measured chip + 16px clearance a side + the 1px measuring band.
    const bold16 = measureWidth("read/write", { family: "Inter", size: 16, weight: 700 });
    expect(figjam.neededSize).toEqual({ width: Math.ceil(bold16 + 24 + 32 + 1), height: 30 + 32 });
    expect(light.neededSize).toEqual({ width: Math.ceil(10 * 0.6 * 14 + 14 + 32 + 1), height: 26 + 32 });
    expect(textFitReport(EDGE, roomy, "read/write", LIGHT).fits).toBe(true);
    // A corridor that holds the smaller mono chip (~130×58) but not the figjam one (~30px taller chip, 62 high).
    const corridor = { width: 200, height: 60 };
    expect(textFitReport(EDGE, corridor, "read/write", LIGHT).fits).toBe(true);
    expect(textFitReport(EDGE, corridor, "read/write", FIGJAM).fits).toBe(false);
  });
});
