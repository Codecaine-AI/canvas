import { describe, expect, test } from "bun:test";

import { textFitReport } from "../../board/text-fit";
import { renderDocumentToSvg } from "../../render/static-svg.ts";
import { titleChipLayout } from "../../objects/section/title-chip-layout";
import { canvasThemePreset, DEFAULT_CANVAS_STYLE } from "../../theme/canvas-style";
import type { InteractiveCanvasObject } from "../../state/schema";
import { FIGJAM_CANVAS_STYLE } from "./helpers";

/**
 * Section header fit reads the one shared chip layout the renderers paint and
 * hit-test with (objects/section/title-chip-layout.ts): a header that paints
 * whole fits, one that paints an ellipsis does not. A stored section detail
 * never paints, so it never enters the fit.
 */

function section(partial: Partial<InteractiveCanvasObject> = {}): InteractiveCanvasObject {
  return {
    id: "zone",
    type: "section",
    text: "CLI",
    color: "teal",
    parentId: null,
    geometry: { x: 0, y: 0, width: 100, height: 300 },
    style: { shape: "section" },
    ...partial,
  } as InteractiveCanvasObject;
}

function paint(object: InteractiveCanvasObject, style = DEFAULT_CANVAS_STYLE): string {
  return renderDocumentToSvg(
    { schemaVersion: 1, id: "fit", mode: "diagram", objects: [object], connections: [] },
    { canvasStyle: style },
  ).svg;
}

describe("section header text-fit", () => {
  test("a figjam header the renderer paints whole is measured, and within a pixel of the frame it is borderline", () => {
    const natural = titleChipLayout(section({ text: "Command line" }), FIGJAM_CANVAS_STYLE).naturalWidthPx;
    // The budget is the section width less the 3px inset a side. Within a
    // pixel the chip paints whole, but the browser may cut it, so no promise.
    const width = natural + 6 + 0.5;
    const cli = section({ text: "Command line", geometry: { x: 0, y: 0, width, height: 300 } });
    expect(paint(cli, FIGJAM_CANVAS_STYLE)).toContain(">Command line</text>");
    const tight = textFitReport(cli, { width, height: 300 }, "Command line", FIGJAM_CANVAS_STYLE);
    expect(tight.verdict).toBe("borderline");
    expect(tight.fits).toBe(false);
    expect(tight.detail).toContain("can't promise");
    // Two pixels wider it surely fits.
    const roomy = textFitReport(cli, { width: width + 2, height: 300 }, "Command line", FIGJAM_CANVAS_STYLE);
    expect(roomy.verdict).toBe("fits");
    expect(roomy.fits).toBe(true);
  });

  test("a stored section detail never paints and adds nothing to the fit", () => {
    const withDetail = section({ detail: "Detail line long enough to be cut", geometry: { x: 0, y: 0, width: 80, height: 300 } });
    const light = canvasThemePreset("schematic-light");
    expect(paint(withDetail, light)).not.toContain("Detail line");
    const report = textFitReport(withDetail, { width: 80, height: 300 }, "CLI", light);
    expect(report).toEqual(textFitReport(section({ geometry: withDetail.geometry }), { width: 80, height: 300 }, "CLI", light));
    expect(report.fits).toBe(true);
    expect(report.detailLine).toBeUndefined();
    // An empty title with only a detail has no header at all.
    expect(textFitReport(withDetail, { width: 80, height: 300 }, "", light).slot).toBe("none");
  });

  test("a section header with nothing in it has nothing to fit", () => {
    expect(textFitReport(section({ text: "" }), { width: 80, height: 300 }, "").slot).toBe("none");
  });
});
