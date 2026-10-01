import { describe, expect, test } from "bun:test";

import { textFitReport } from "../src/board/text-fit";
import { renderDocumentToSvg } from "../../canvas/src/render/static-svg.ts";
import { canvasThemePreset, DEFAULT_CANVAS_STYLE } from "@codecaine-ai/canvas/style";
import type { InteractiveCanvasObject } from "@codecaine-ai/canvas/schema";
import { FIGJAM_CANVAS_STYLE } from "./helpers";

/**
 * Section header fit reads the one shared chip layout the renderers paint and
 * hit-test with (objects/section/title-chip-layout.ts): a header that paints
 * whole fits, one that paints an ellipsis does not — empty title or not.
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
  test("a figjam header the renderer paints whole fits (measured, not the char-count estimate)", () => {
    const cli = section({ detail: "cli.ts" });
    expect(paint(cli, FIGJAM_CANVAS_STYLE)).toContain(">cli.ts</text>");
    const report = textFitReport(cli, { width: 100, height: 300 }, "CLI", FIGJAM_CANVAS_STYLE);
    expect(report.fits).toBe(true);
    expect(report.detailLine).toMatchObject({ shown: true, truncated: false, painted: "cli.ts" });
  });

  test("an empty title does not skip the detail's fit check", () => {
    const detailOnly = section({ text: "", detail: "Detail line long enough to be cut", geometry: { x: 0, y: 0, width: 80, height: 300 } });
    expect(paint(detailOnly, canvasThemePreset("schematic-light"))).toContain("…</text>");
    const report = textFitReport(detailOnly, { width: 80, height: 300 }, "", canvasThemePreset("schematic-light"));
    expect(report.fits).toBe(false);
    expect(report.slot).toBe("section-title");
    expect(report.detailLine?.truncated).toBe(true);
    expect(report.neededSize!.width).toBeGreaterThan(80);
  });

  test("a section header with nothing in it has nothing to fit", () => {
    expect(textFitReport(section({ text: "" }), { width: 80, height: 300 }, "").slot).toBe("none");
  });
});
