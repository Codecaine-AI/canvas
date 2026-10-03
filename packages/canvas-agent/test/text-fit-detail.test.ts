import { describe, expect, test } from "bun:test";

import { canvasThemePreset, normalizeCanvasStyle, type CanvasStyle } from "@codecaine-ai/canvas/style";
import type { InteractiveCanvasObject } from "@codecaine-ai/canvas/schema";

import { textFitReport } from "../src/board/text-fit";
import { rule as clippedText } from "../src/board/lints/rules/clipped-text";
import { renderDocumentToSvg } from "../../canvas/src/render/static-svg.ts";
import { makeDocument } from "./synthetic";
import { FIGJAM_CANVAS_STYLE } from "./helpers";
import { measureWidth } from "../../canvas/src/theme/text-measure.ts";

/**
 * text-fit counts the one-line `detail` under a name (contract §4/§5): the
 * name gives up lines to keep the detail, a box too short for a name line
 * plus the detail hides the detail, and a detail wider than its slot
 * ellipsizes — each a "does not render whole" verdict pinned to what the
 * static renderer actually paints, in the active style (IBM Plex Mono
 * measured at its fixed advance under the schematic themes).
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

function svgOf(object: InteractiveCanvasObject, canvasStyle?: CanvasStyle): string {
  return renderDocumentToSvg(makeDocument([object]), canvasStyle ? { canvasStyle } : {}).svg;
}

/** The painted detail line (the last <text> of a single-object render). */
function paintedDetail(object: InteractiveCanvasObject, canvasStyle?: CanvasStyle): string {
  const bodies = [...svgOf(object, canvasStyle).matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);
  return bodies.at(-1) ?? "";
}

const LONG_DETAIL = "s3://customer-data/normalized/2026/records.parquet";

describe("text-fit — a detail that fits", () => {
  test("fits, and reports the line it paints", () => {
    for (const style of [FIGJAM, LIGHT, DARK]) {
      const object = shape({ detail: "Function Calling LLM" });
      const report = textFitReport(object, object.geometry, object.text, style);
      expect(report.fits).toBe(true);
      expect(report.nameFits).toBe(true);
      expect(report.detailLine).toEqual({
        text: "Function Calling LLM",
        shown: true,
        truncated: false,
        painted: "Function Calling LLM",
        fittingChars: 20,
        totalChars: 20,
      });
    }
  });

  test("a blank detail is no detail", () => {
    const report = textFitReport(shape({ detail: "  " }), shape().geometry, "Run Executor LLM", LIGHT);
    expect(report.detailLine).toBeUndefined();
    expect(report.fits).toBe(true);
  });
});

describe("text-fit — a truncated detail", () => {
  test("fails the fit, names the cut, and the renderer paints the same ellipsis", () => {
    const object = shape({ detail: LONG_DETAIL });
    const report = textFitReport(object, object.geometry, object.text, LIGHT);
    expect(report.fits).toBe(false);
    expect(report.nameFits).toBe(true);
    expect(report.detailLine!.truncated).toBe(true);
    // 212px slot / 8.4px mono cells (14px × 0.6) = 25 whole characters; the cut line keeps 24 + "…".
    expect(report.detailLine!.fittingChars).toBe(25);
    expect(report.detailLine!.totalChars).toBe(LONG_DETAIL.length);
    expect(report.detailLine!.painted).toBe(paintedDetail(object, LIGHT));
    expect(report.detail).toBe(
      `detail cut to 25 of ${LONG_DETAIL.length} chars at 240×80 — needs ${report.neededSize!.width}×80`,
    );
    expect(report.detail.length).toBeLessThanOrEqual(100);
  });

  test("the needed width surely fits; inside the 1px band the verdict is borderline, past it the renderer cuts", () => {
    const object = shape({ detail: LONG_DETAIL });
    const needed = textFitReport(object, object.geometry, object.text, LIGHT).neededSize!;
    const at = (width: number) => shape({ detail: LONG_DETAIL, geometry: { x: 0, y: 0, width, height: needed.height } });
    const verdict = (width: number) => {
      const probe = at(width);
      return textFitReport(probe, probe.geometry, probe.text, LIGHT).verdict;
    };
    // 50 Plex Mono cells = 420px: the slot (width − 28) holds it whole from 448 up.
    expect(needed.width).toBe(449);
    expect(verdict(449)).toBe("fits");
    expect(paintedDetail(at(449), LIGHT)).toBe(LONG_DETAIL);
    // One pixel narrower the renderer still paints it whole — with no margin, so it is borderline…
    expect(verdict(448)).toBe("borderline");
    expect(paintedDetail(at(448), LIGHT)).toBe(LONG_DETAIL);
    // …one more and the renderer cuts it, still inside the band…
    expect(verdict(447)).toBe("borderline");
    expect(paintedDetail(at(447), LIGHT).endsWith("…")).toBe(true);
    // …and past the band the verdict is a clear overflow.
    expect(verdict(446)).toBe("overflows");
  });

  test("measures the active style: the figjam sans detail is narrower than the schematic mono one", () => {
    const object = shape({ detail: "postgres 16 · db.t3.micro · east" });
    expect(textFitReport(object, object.geometry, object.text, FIGJAM).fits).toBe(true);
    expect(textFitReport(object, object.geometry, object.text, LIGHT).fits).toBe(false);
  });

  test("an icon caption's detail ellipsizes at the band's max width", () => {
    const object = icon({ detail: LONG_DETAIL });
    const report = textFitReport(object, object.geometry, object.text, LIGHT);
    expect(report.fits).toBe(false);
    expect(report.detailLine!.truncated).toBe(true);
    expect(report.detailLine!.painted).toBe(paintedDetail(object, LIGHT));
    // The band widens with the icon past its 200px floor; it sizes itself to
    // the detail, so the detail is judged against that cap (420px + 1).
    expect(report.neededSize!.width).toBe(421);
    const grown = icon({ detail: LONG_DETAIL, geometry: { x: 0, y: 0, width: report.neededSize!.width, height: 64 } });
    expect(textFitReport(grown, grown.geometry, grown.text, LIGHT).fits).toBe(true);
    expect(paintedDetail(grown, LIGHT)).toBe(LONG_DETAIL);
  });
});

describe("text-fit — the name gives up lines to the detail", () => {
  const NAME = "Normalize and deduplicate every inbound record";

  test("a name that fits alone clips once a detail joins it, and the needed height holds both", () => {
    // 66px slot: the name's 3 lines (3 × 21px at 17.5px) fit alone, not with the 21.2px detail reserve.
    const alone = shape({ text: NAME, geometry: { x: 0, y: 0, width: 200, height: 90 } });
    expect(textFitReport(alone, alone.geometry, NAME, LIGHT).fits).toBe(true);
    const withDetail = { ...alone, detail: ":4820" };
    const report = textFitReport(withDetail, withDetail.geometry, NAME, LIGHT);
    expect(report.fits).toBe(false);
    expect(report.nameFits).toBe(false);
    expect(report.detailLine!.shown).toBe(true);
    expect(report.detail).toStartWith("label clips at 200×90:");
    const grown = { ...withDetail, geometry: { ...withDetail.geometry, height: report.neededSize!.height } };
    expect(textFitReport(grown, grown.geometry, NAME, LIGHT).fits).toBe(true);
    expect(svgOf(grown, LIGHT)).not.toContain("…");
  });

  test("a box too short for a name line plus the detail hides the detail", () => {
    const object = shape({ detail: ":4820", geometry: { x: 0, y: 0, width: 200, height: 40 } });
    const report = textFitReport(object, object.geometry, object.text, LIGHT);
    expect(report.fits).toBe(false);
    expect(report.nameFits).toBe(true);
    expect(report.detailLine).toMatchObject({ shown: false, painted: "" });
    expect(svgOf(object, LIGHT)).not.toContain(":4820");
    expect(report.detail).toBe(`detail line hidden (no room under the name) at 200×40 — needs 200×${report.neededSize!.height}`);
    const grown = { ...object, geometry: { ...object.geometry, height: report.neededSize!.height } };
    expect(textFitReport(grown, grown.geometry, grown.text, LIGHT).fits).toBe(true);
    expect(svgOf(grown, LIGHT)).toContain(":4820");
  });

  test("a detail-only shape is still a fit question", () => {
    const object = shape({ text: "", detail: LONG_DETAIL });
    expect(textFitReport(object, object.geometry, "", LIGHT).fits).toBe(false);
    expect(textFitReport(shape({ text: "" }), shape().geometry, "", LIGHT).slot).toBe("none");
  });
});

describe("clipped-text — detail findings", () => {
  test("a truncated detail warns with a concrete shorten-or-widen remedy", () => {
    const object = shape({ id: "llm", detail: LONG_DETAIL });
    const findings = clippedText.check(makeDocument([object]), { canvasStyle: normalizeCanvasStyle(LIGHT) } as never);
    expect(findings).toHaveLength(1);
    const report = textFitReport(object, object.geometry, object.text, LIGHT);
    expect(findings[0]).toMatchObject({
      rule: "clipped-text",
      at: ["llm"],
      message: `llm: ${report.detail}`,
      suggestion: `shorten llm's detail to ≤25 chars (it has ${LONG_DETAIL.length}) or widen llm to ≥${report.neededSize!.width}`,
    });
  });

  test("a hidden detail warns with the box that shows it", () => {
    const object = shape({ id: "short", detail: ":4820", geometry: { x: 0, y: 0, width: 200, height: 40 } });
    const [finding] = clippedText.check(makeDocument([object]), { canvasStyle: LIGHT } as never);
    const needed = textFitReport(object, object.geometry, object.text, LIGHT).neededSize!;
    expect(finding!.suggestion).toBe(
      `grow short to ≥${needed.width}×${needed.height} so the detail line fits under the name, or clear the detail`,
    );
  });

  test("a fitting detail stays quiet, and a detail-only icon is still checked", () => {
    expect(clippedText.check(makeDocument([shape({ detail: ":4820" })]), { canvasStyle: LIGHT } as never)).toEqual([]);
    const findings = clippedText.check(
      makeDocument([icon({ id: "glyph", text: "", detail: LONG_DETAIL })]),
      { canvasStyle: LIGHT } as never,
    );
    expect(findings.map((finding) => finding.at[0])).toEqual(["glyph"]);
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
