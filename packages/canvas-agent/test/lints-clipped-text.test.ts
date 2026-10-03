import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasObject } from "@codecaine-ai/canvas/schema";
import { normalizeCanvasStyle } from "@codecaine-ai/canvas/style";

import { runDiagnostics } from "../src/board/lints/run";
import { rule as clippedText } from "../src/board/lints/rules/clipped-text";
import { textFitReport } from "../src/board/text-fit";
import { box, connect, makeDocument } from "./synthetic";
import { FIGJAM_CONTEXT } from "./helpers";

/**
 * Clipped text is a rendered fact: a shape label or sticky body loses lines
 * behind an ellipsis, or a section title chip ellipsizes at the frame width.
 * Connections are absent from the scan because their label chips grow and
 * unreadable-labels owns the space around them.
 */

const LONG_SHAPE_LABEL =
  "Normalize and deduplicate every inbound customer record before scoring";
const LONG_STICKY = "- one\n- two\n- three\n- four\n- five";
const LONG_SECTION_TITLE = "Discovery and framing workstream";

function sticky(id: string, width: number, height: number, text: string): InteractiveCanvasObject {
  return {
    ...box(id, 0, 0, width, height, "sticky"),
    text,
    style: { shape: "note" },
  };
}

describe("clipped-text lint", () => {
  test("declares its warning face and physical readability guidance", () => {
    expect(clippedText.id).toBe("clipped-text");
    expect(clippedText.title).toBe("Clipped text");
    expect(clippedText.tier).toBe("warning");
    expect(clippedText.guidance).toContain("physically cannot read");
  });

  test("a sticky whose body overflows warns and names its measured remedy", () => {
    const document = makeDocument([sticky("sticky-overflow", 176, 128, LONG_STICKY)]);
    const findings = clippedText.check(document);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "clipped-text",
      severity: "warning",
      at: ["sticky-overflow"],
      where: { x: 0, y: 0, width: 176, height: 128 },
      suggestion: "grow sticky-overflow to ≥176×229 or shorten the text",
    });
    expect(findings[0]!.message).toStartWith("sticky-overflow: sticky body clips at 176×128");
  });

  test("the default diagnostics roster catches a sticky born with clipped text", () => {
    const document = makeDocument([sticky("born-clipped", 176, 128, LONG_STICKY)]);
    const findings = runDiagnostics(document);

    expect(findings).toContainEqual(expect.objectContaining({
      id: "W1",
      rule: "clipped-text",
      at: ["born-clipped"],
    }));
  });

  test("the same sticky is clean once its body fits", () => {
    expect(
      clippedText.check(makeDocument([sticky("sticky-fit", 176, 256, LONG_STICKY)])),
    ).toEqual([]);
  });

  test("a clipped shape label warns while the same label in a larger box fits", () => {
    const clipped = { ...box("shape-clipped", 0, 0, 160, 96), text: LONG_SHAPE_LABEL };
    const fitting = { ...box("shape-fit", 0, 0, 240, 120), text: LONG_SHAPE_LABEL };

    const findings = clippedText.check(makeDocument([clipped]));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      at: ["shape-clipped"],
      where: clipped.geometry,
      // Default (schematic) names: 17.5px in 21px lines.
      suggestion: "grow shape-clipped to ≥160×150 or shorten the text",
    });
    expect(findings[0]!.message).toStartWith("shape-clipped: label clips at 160×96");
    expect(clippedText.check(makeDocument([fitting]))).toEqual([]);
  });

  test("a schematic name measures in SemiBold, so a name that Bold would wrap stays whole", () => {
    // A decision's name slot is half its width less 12px. At the default
    // 17.5px, "Exact match?" is 114.4px in Inter SemiBold (600, the weight the
    // schematic themes paint names in) and 116.0px in Bold (115.9px kerned).
    const decision = (width: number, height: number, text = "Exact match?"): InteractiveCanvasObject => ({
      ...box("exact-match", 0, 0, width, height, "decision"),
      text,
      style: { shape: "diamond" },
    });
    // The gc-decomp-harness board's 256×112 decision (116px slot): one line, as Studio paints it.
    const board = textFitReport(decision(256, 112), { width: 256, height: 112 }, "Exact match?");
    expect(board.verdict).toBe("fits");
    expect(board.detail).toContain(": 1 wrapped line(s)");
    // A 254×100 decision: a 115px slot holding a single 114.3px line. Still
    // whole, so no warning — but by under a pixel, so only a non-blocking note.
    const tight = clippedText.check(makeDocument([decision(254, 100)]));
    expect(tight.map((finding) => finding.severity)).toEqual(["note"]);
    expect(tight[0]!.message).toContain("can't promise");
    // A longer name puts the weights 2.9px apart (241.8px SemiBold, 244.7px
    // Bold): a 243px slot holds the SemiBold line with room to spare…
    const retry = decision(510, 100, "Retry the webhook delivery?");
    expect(clippedText.check(makeDocument([retry]))).toEqual([]);
    // …while the same name painted in Bold wraps to two lines and clips.
    const bold = { canvasStyle: normalizeCanvasStyle({ theme: "schematic-light", textFontWeight: 700 }) };
    const clipped = clippedText.check(makeDocument([retry]), bold);
    expect(clipped.map((finding) => finding.severity)).toEqual(["warning"]);
  });

  test("a section title that ellipsizes at its width warns", () => {
    const section = {
      ...box("narrow-section", 20, 40, 200, 360, "section"),
      text: LONG_SECTION_TITLE,
    };
    // Measured in figjam: its floating title chip and 1.5px chip border.
    const findings = clippedText.check(makeDocument([section]), FIGJAM_CONTEXT);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      at: ["narrow-section"],
      where: section.geometry,
      // The chip at the default 1.5px title-chip border: the title measured in
      // Inter Bold 16 (~273px; the old 0.62em estimate said 317px) + 23px of
      // paddings and borders, the 3px insets, and the 1px measuring band.
      suggestion: "grow narrow-section to ≥304×360 or shorten the text",
    });
    expect(findings[0]!.message).toContain("section title ellipsizes");

    // The workspace style's chip border is part of the measured width: 2.5px
    // more border a side asks for 5px more frame.
    const styled = clippedText.check(makeDocument([section]), {
      canvasStyle: normalizeCanvasStyle({ theme: "figjam", titleChipBorderWidthPx: 4 }),
    });
    expect(styled[0]!.suggestion).toBe("grow narrow-section to ≥309×360 or shorten the text");
  });

  test("an overflow that holds even with the missing glyphs at zero width warns", () => {
    // Emoji and CJK paint in per-machine fallback fonts, but this name clips
    // even if they took no room at all: the overflow is definite.
    const estimated = { ...box("estimated", 0, 0, 160, 96), text: `${LONG_SHAPE_LABEL} 🚀 春` };
    const findings = clippedText.check(makeDocument([estimated]));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("warning");
    expect(findings[0]!.message).toContain('it clips even if "🚀" "春" paint at no width');
  });

  test("an overflow that hangs on a missing glyph's width is reported as an estimate, never a warning", () => {
    // Without the rockets the name fits its three lines; their fallback width decides.
    const estimated = { ...box("estimated", 0, 0, 160, 96), text: "Normalize and deduplicate every inbound 🚀🚀🚀" };
    const findings = clippedText.check(makeDocument([estimated]));
    expect(findings.map((finding) => finding.severity)).toEqual(["note"]);
    expect(findings[0]!.message).toContain('the bundled fonts lack "🚀"');
    // A short one that fits is still reported, so the operator knows it is an estimate.
    const short = { ...box("short", 0, 0, 240, 96), text: "Ship it 🚀" };
    expect(clippedText.check(makeDocument([short])).map((finding) => finding.severity)).toEqual(["note"]);
  });

  test.each(["five", "five 🚀"])("forced sticky rows warn whatever the last row holds (%s)", (last) => {
    // 128px holds two 36px rows: five forced lines never fit, whatever the rocket's width.
    const note = sticky("note", 176, 128, `one\ntwo\nthree\nfour\n${last}`);
    expect(clippedText.check(makeDocument([note])).map((finding) => finding.severity)).toEqual(["warning"]);
  });

  test("a long edge label is excluded from clipped-text", () => {
    const document = makeDocument(
      [box("left", 0, 0), box("right", 204, 0)],
      [{ ...connect("edge", "left", "right"), label: "a very long edge label chip" }],
    );

    expect(clippedText.check(document)).toEqual([]);
    expect(runDiagnostics(document).filter((finding) => finding.rule === "clipped-text")).toEqual([]);
  });

  test("empty object text produces no finding", () => {
    const empty = { ...box("empty", 0, 0, 1, 1), text: "" };
    expect(clippedText.check(makeDocument([empty]))).toEqual([]);
  });
});
