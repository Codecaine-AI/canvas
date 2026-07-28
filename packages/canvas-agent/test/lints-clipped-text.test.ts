import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasObject } from "@codecaine-ai/canvas/schema";

import { runDiagnostics } from "../src/board/lints/run";
import { rule as clippedText } from "../src/board/lints/rules/clipped-text";
import { box, connect, makeDocument } from "./synthetic";

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
      suggestion: "grow shape-clipped to ≥160×114 or shorten the text",
    });
    expect(findings[0]!.message).toStartWith("shape-clipped: label clips at 160×96");
    expect(clippedText.check(makeDocument([fitting]))).toEqual([]);
  });

  test("a section title that ellipsizes at its width warns", () => {
    const section = {
      ...box("narrow-section", 20, 40, 200, 360, "section"),
      text: LONG_SECTION_TITLE,
    };
    const findings = clippedText.check(makeDocument([section]));

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      at: ["narrow-section"],
      where: section.geometry,
      suggestion: "grow narrow-section to ≥348×360 or shorten the text",
    });
    expect(findings[0]!.message).toContain("section title ellipsizes");
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
