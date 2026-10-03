import { describe, expect, test } from "bun:test";

import { textFitReport } from "../src/board/text-fit";
import {
  clampLines,
  renderDocumentToSvg,
  textSlotForObject,
  wrapTextLines,
} from "../../canvas/src/render/static-svg.ts";
import { resolveTextSlot, slotLineHeightPx } from "../../canvas/src/objects/text-slots.ts";
import { makeDocument } from "./synthetic";
import { canvasThemePreset, normalizeCanvasStyle } from "@codecaine-ai/canvas/style";

import type { InteractiveCanvasObject } from "@codecaine-ai/canvas/schema";

/**
 * The fit warning IS the renderer's clipping decision. Same philosophy as
 * test/lints-chip-parity.test.ts: a verdict the agent reports must be the
 * verdict the pixels show. Two levels are pinned here —
 *  1. against the exported wrap/clamp primitives (`wrapTextLines` /
 *     `clampLines`), the functions renderSlotTextBlock itself calls;
 *  2. against a real `renderDocumentToSvg` render, where a clipped slot paints
 *     an ellipsis and a fitting one does not.
 * A `fits` verdict always renders whole and an `overflows` verdict always
 * clips; `borderline` (within 1px of the edge) promises neither.
 */

const LONG_LABEL = "Normalize and deduplicate every inbound customer record before scoring";
const LONG_TITLE = "Discovery and framing workstream";
const LONG_STICKY = "- one\n- two\n- three\n- four\n- five";

function shape(text: string, width: number, height: number): InteractiveCanvasObject {
  return {
    id: "shape",
    type: "rectangle",
    text,
    parentId: null,
    geometry: { x: 0, y: 0, width, height },
  };
}

function sticky(text: string, width: number, height: number): InteractiveCanvasObject {
  return {
    id: "sticky",
    type: "sticky",
    text,
    parentId: null,
    style: { shape: "note" },
    geometry: { x: 0, y: 0, width, height },
  };
}

function section(text: string, width: number, height: number): InteractiveCanvasObject {
  return {
    id: "section",
    type: "section",
    text,
    parentId: null,
    geometry: { x: 0, y: 0, width, height },
  };
}

/** What renderSlotTextBlock would actually paint for this object's slot. */
function paintedLines(object: InteractiveCanvasObject): {
  wrapped: string[];
  painted: string[];
} {
  const slot = textSlotForObject(object)!;
  const { rect, typography } = resolveTextSlot(slot, object);
  const wrapped = wrapTextLines(object.text, rect.width, typography);
  const maxLines = Math.max(1, Math.floor(rect.height / slotLineHeightPx(typography)));
  const painted = clampLines(wrapped, maxLines, rect.width, typography);
  return { wrapped, painted };
}

function svgOf(object: InteractiveCanvasObject): string {
  return renderDocumentToSvg(makeDocument([object])).svg;
}

describe("text-fit / renderer parity — shape labels", () => {
  test("a report of `clips` means the renderer drops lines and ellipsizes", () => {
    const object = shape(LONG_LABEL, 160, 96);
    const report = textFitReport(object, object.geometry, object.text);
    expect(report.fits).toBe(false);
    expect(report.verdict).toBe("overflows");

    const { wrapped, painted } = paintedLines(object);
    expect(painted.length).toBeLessThan(wrapped.length);
    expect(painted[painted.length - 1]!.endsWith("…")).toBe(true);
    expect(svgOf(object)).toContain("…");
  });

  test("a report of `fits` means the renderer paints every wrapped line, no ellipsis", () => {
    const object = shape(LONG_LABEL, 240, 120);
    const report = textFitReport(object, object.geometry, object.text);
    expect(report.fits).toBe(true);
    expect(report.verdict).toBe("fits");

    const { wrapped, painted } = paintedLines(object);
    expect(painted).toEqual(wrapped);
    expect(painted.some((line) => line.endsWith("…"))).toBe(false);
    expect(svgOf(object)).not.toContain("…");
  });

  test("the reported neededSize is the smallest box that surely renders whole", () => {
    const object = shape(LONG_LABEL, 160, 96);
    const needed = textFitReport(object, object.geometry, object.text).neededSize!;

    const grown = shape(LONG_LABEL, needed.width, needed.height);
    expect(textFitReport(grown, grown.geometry, grown.text).verdict).toBe("fits");
    expect(paintedLines(grown).painted).toEqual(paintedLines(grown).wrapped);
    expect(svgOf(grown)).not.toContain("…");

    // One pixel shorter is no longer a sure fit — "smallest" means smallest.
    const shy = shape(LONG_LABEL, needed.width, needed.height - 1);
    expect(textFitReport(shy, shy.geometry, shy.text).fits).toBe(false);
  });
});

describe("text-fit / renderer parity — sticky bodies and section titles", () => {
  test("a clipping sticky body renders an ellipsis; the grown one does not", () => {
    const tight = sticky(LONG_STICKY, 176, 128);
    const report = textFitReport(tight, tight.geometry, tight.text);
    expect(report.fits).toBe(false);
    expect(svgOf(tight)).toContain("…");

    const grown = sticky(LONG_STICKY, report.neededSize!.width, report.neededSize!.height);
    expect(textFitReport(grown, grown.geometry, grown.text).fits).toBe(true);
    expect(svgOf(grown)).not.toContain("…");
  });

  test("a clipping section title renders an ellipsized chip; the widened one does not", () => {
    const tight = section(LONG_TITLE, 200, 360);
    const report = textFitReport(tight, tight.geometry, tight.text);
    expect(report.fits).toBe(false);
    expect(svgOf(tight)).toContain("…");

    const grown = section(LONG_TITLE, report.neededSize!.width, report.neededSize!.height);
    expect(textFitReport(grown, grown.geometry, grown.text).fits).toBe(true);
    expect(svgOf(grown)).not.toContain("…");
  });

  test("a workspace title-chip border moves the title's fit threshold exactly as the renderer does", () => {
    const style = normalizeCanvasStyle({ titleChipBorderWidthPx: 4 });
    const styledSvg = (object: InteractiveCanvasObject) =>
      renderDocumentToSvg(makeDocument([object]), { canvasStyle: style }).svg;
    const verdict = (width: number, canvasStyle?: typeof style) => {
      const probe = section(LONG_TITLE, width, 360);
      return textFitReport(probe, probe.geometry, probe.text, canvasStyle).verdict;
    };
    const probe = section(LONG_TITLE, 200, 360);
    const needed = textFitReport(probe, probe.geometry, probe.text, style).neededSize!;

    // The sure fit under the style renders whole…
    expect(verdict(needed.width, style)).toBe("fits");
    expect(styledSvg(section(LONG_TITLE, needed.width, 360))).not.toContain("…");
    // …three pixels narrower the styled chip clearly clips, in the report and in
    // the pixels — yet the thinner default border (2.5px less chip) still holds it.
    const shy = section(LONG_TITLE, needed.width - 3, 360);
    expect(verdict(needed.width - 3, style)).toBe("overflows");
    expect(styledSvg(shy)).toContain("…");
    expect(verdict(needed.width - 3)).not.toBe("overflows");
  });
});

describe("text-fit / renderer parity — the schematic themes", () => {
  // The schematic name weight (600) measures with Inter's bold advances, and
  // the detail line paints IBM Plex Mono — the verdict must still be exactly
  // the clipping the styled render shows.
  for (const theme of ["schematic-light", "schematic-dark"] as const) {
    const style = canvasThemePreset(theme);
    const styledSvg = (object: InteractiveCanvasObject) =>
      renderDocumentToSvg(makeDocument([object]), { canvasStyle: style }).svg;

    test(`${theme}: a clipping label renders an ellipsis; the reported needed size does not`, () => {
      const tight = shape(LONG_LABEL, 160, 96);
      const report = textFitReport(tight, tight.geometry, tight.text, style);
      expect(report.verdict).toBe("overflows");
      expect(styledSvg(tight)).toContain("…");
      const grown = shape(LONG_LABEL, report.neededSize!.width, report.neededSize!.height);
      expect(textFitReport(grown, grown.geometry, grown.text, style).verdict).toBe("fits");
      expect(styledSvg(grown)).not.toContain("…");
      const shy = shape(LONG_LABEL, report.neededSize!.width, report.neededSize!.height - 1);
      expect(textFitReport(shy, shy.geometry, shy.text, style).fits).toBe(false);
    });

    test(`${theme}: with a detail line the needed size holds the name AND the detail whole`, () => {
      const tight = { ...shape(LONG_LABEL, 200, 96), detail: "postgres 16 · db.t3.micro" };
      const report = textFitReport(tight, tight.geometry, tight.text, style);
      expect(report.fits).toBe(false);
      const grown = { ...tight, geometry: { ...tight.geometry, ...report.neededSize! } };
      expect(textFitReport(grown, grown.geometry, grown.text, style).fits).toBe(true);
      const svg = styledSvg(grown);
      expect(svg).not.toContain("…");
      expect(svg).toContain(">postgres 16 · db.t3.micro</text>");
    });
  }
});
