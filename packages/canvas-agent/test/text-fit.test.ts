import { describe, expect, test } from "bun:test";

import { textFitReport } from "../src/board/text-fit";

import type {
  InteractiveCanvasConnection,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";

/**
 * Unit cases for the resize/update_text readability warning (S0.5): one
 * known-fitting and one known-clipping case per rendering path, plus the
 * invariant that `neededSize` is actually big enough.
 */

function shape(width: number, height: number): InteractiveCanvasObject {
  return {
    id: "shape",
    type: "rectangle",
    text: "",
    parentId: null,
    geometry: { x: 0, y: 0, width, height },
  };
}

function ellipse(width: number, height: number): InteractiveCanvasObject {
  return {
    id: "ellipse",
    type: "ellipse",
    text: "",
    parentId: null,
    geometry: { x: 0, y: 0, width, height },
  };
}

function sticky(width: number, height: number): InteractiveCanvasObject {
  return {
    id: "sticky",
    type: "sticky",
    text: "",
    parentId: null,
    style: { shape: "note" },
    geometry: { x: 0, y: 0, width, height },
  };
}

function section(width: number, height: number): InteractiveCanvasObject {
  return {
    id: "section",
    type: "section",
    text: "",
    parentId: null,
    geometry: { x: 0, y: 0, width, height },
  };
}

const EDGE: InteractiveCanvasConnection = {
  id: "edge",
  from: { objectId: "a" },
  to: { objectId: "b" },
};

const LONG_LABEL = "Normalize and deduplicate every inbound customer record before scoring";
const LONG_WORD = "Supercalifragilisticexpialidocious";

/** Re-asking at `neededSize` must come back fitting — that is what it means. */
function expectNeededSizeFits(
  object: InteractiveCanvasObject,
  needed: { width: number; height: number },
  text: string,
  build: (width: number, height: number) => InteractiveCanvasObject,
): void {
  const report = textFitReport(build(needed.width, needed.height), needed, text);
  expect(report.fits).toBe(true);
}

describe("textFitReport — shape labels", () => {
  test("a short label in a default node box fits", () => {
    const report = textFitReport(shape(160, 96), { width: 160, height: 96 }, "Ingest");
    expect(report.fits).toBe(true);
    expect(report.slot).toBe("shape-label");
    expect(report.neededSize).toBeUndefined();
  });

  test("a long label in the same box clips, and needs more height", () => {
    const report = textFitReport(shape(160, 96), { width: 160, height: 96 }, LONG_LABEL);
    expect(report.fits).toBe(false);
    expect(report.slot).toBe("shape-label");
    expect(report.neededSize).toBeDefined();
    // Height-only growth at the given width (the simple aspect rule).
    expect(report.neededSize!.width).toBe(160);
    expect(report.neededSize!.height).toBeGreaterThan(96);
    expect(report.detail).toContain("clips at 160×96");
    expectNeededSizeFits(shape(160, 96), report.neededSize!, LONG_LABEL, shape);
  });

  test("a word too wide to wrap grows the WIDTH, not just the height", () => {
    const report = textFitReport(shape(60, 40), { width: 60, height: 40 }, LONG_WORD);
    expect(report.fits).toBe(false);
    expect(report.neededSize!.width).toBeGreaterThan(60);
    expectNeededSizeFits(shape(60, 40), report.neededSize!, LONG_WORD, shape);
  });

  test("inscribed shapes are judged on their inscribed rect, not the bounding box", () => {
    // The same text and box: a rectangle uses the full inset rect, an ellipse
    // only its inscribed band, so the ellipse clips where the rectangle does not.
    const size = { width: 220, height: 120 };
    expect(textFitReport(shape(220, 120), size, LONG_LABEL).fits).toBe(true);
    const oval = textFitReport(ellipse(220, 120), size, LONG_LABEL);
    expect(oval.fits).toBe(false);
    expectNeededSizeFits(ellipse(220, 120), oval.neededSize!, LONG_LABEL, ellipse);
  });

  test("empty text always fits", () => {
    const report = textFitReport(shape(20, 20), { width: 20, height: 20 }, "");
    expect(report.fits).toBe(true);
    expect(report.slot).toBe("none");
  });

  test("icon labels render a self-sizing band, so they never truncate", () => {
    const icon: InteractiveCanvasObject = {
      id: "icon",
      type: "icon",
      text: "",
      parentId: null,
      geometry: { x: 0, y: 0, width: 80, height: 80 },
    };
    expect(textFitReport(icon, { width: 80, height: 80 }, LONG_LABEL).fits).toBe(true);
  });
});

describe("textFitReport — sticky bodies", () => {
  test("a one-line note fits the default sticky", () => {
    const report = textFitReport(sticky(176, 128), { width: 176, height: 128 }, "Ship it");
    expect(report.fits).toBe(true);
    expect(report.slot).toBe("sticky-body");
  });

  test("a five-bullet list does not — the 36px pitch only leaves two rows", () => {
    const text = "- one\n- two\n- three\n- four\n- five";
    const report = textFitReport(sticky(176, 128), { width: 176, height: 128 }, text);
    expect(report.fits).toBe(false);
    expect(report.slot).toBe("sticky-body");
    expect(report.neededSize!.height).toBeGreaterThan(128);
    expect(report.detail).toContain("sticky body clips");
    expectNeededSizeFits(sticky(176, 128), report.neededSize!, text, sticky);
  });
});

describe("textFitReport — section titles (chip, not body slot)", () => {
  test("a short title fits its frame's inner width", () => {
    const report = textFitReport(section(480, 360), { width: 480, height: 360 }, "Discovery");
    expect(report.fits).toBe(true);
    expect(report.slot).toBe("section-title");
  });

  test("a title wider than the frame ellipsizes, and needs a wider frame", () => {
    const text = "Discovery and framing workstream";
    const report = textFitReport(section(200, 360), { width: 200, height: 360 }, text);
    expect(report.fits).toBe(false);
    expect(report.slot).toBe("section-title");
    expect(report.neededSize!.width).toBeGreaterThan(200);
    // Height is never the constraint for a 27px chip.
    expect(report.neededSize!.height).toBe(360);
    expect(report.detail).toContain("ellipsizes");
    expectNeededSizeFits(section(200, 360), report.neededSize!, text, section);
  });
});

describe("textFitReport — edge labels (chip against its corridor)", () => {
  test("a short label fits a wide corridor", () => {
    const report = textFitReport(EDGE, { width: 400, height: 200 }, "calls");
    expect(report.fits).toBe(true);
    expect(report.slot).toBe("edge-label");
  });

  test("a long label in a tight corridor crowds it, and reports the chip's demand", () => {
    const report = textFitReport(EDGE, { width: 100, height: 200 }, "publishes an event");
    expect(report.fits).toBe(false);
    expect(report.slot).toBe("edge-label");
    expect(report.neededSize!.width).toBeGreaterThan(100);
    expect(report.detail).toContain("edge label");
  });

  test("a blank label is not a fit question", () => {
    expect(textFitReport(EDGE, { width: 10, height: 10 }, "   ").slot).toBe("none");
  });
});

describe("textFitReport — detail prose", () => {
  test("stays a single short line, fit for an OpOutcome.notes entry", () => {
    const reports = [
      textFitReport(shape(160, 96), { width: 160, height: 96 }, LONG_LABEL),
      textFitReport(sticky(176, 128), { width: 176, height: 128 }, "- a\n- b\n- c\n- d"),
      textFitReport(section(200, 360), { width: 200, height: 360 }, "A very long section title"),
      textFitReport(EDGE, { width: 60, height: 60 }, "publishes an event"),
    ];
    for (const report of reports) {
      expect(report.detail).not.toContain("\n");
      expect(report.detail.length).toBeLessThanOrEqual(100);
    }
  });
});
