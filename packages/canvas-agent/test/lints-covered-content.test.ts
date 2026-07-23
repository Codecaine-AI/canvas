import { describe, expect, test } from "bun:test";

import { buildBoardModel } from "../src/digest/board-model";
import { rule as coveredContent } from "../src/lints/covered-content";
import { box, connect, makeDocument } from "./synthetic";

describe("covered-content lint", () => {
  test("declares its faces", () => {
    expect(coveredContent.id).toBe("covered-content");
    expect(coveredContent.tier).toBe("error");
    expect(coveredContent.guidance).toContain("exempt");
    expect(coveredContent.quickfix).toBeUndefined();
  });

  // --- box-on-box (ported from rules-overlap) ---

  test("an overlap past 25% of the smaller box is an error", () => {
    // Same-size boxes offset 80px: intersection 80×96 = 50% of either.
    const findings = coveredContent.check(buildBoardModel(makeDocument([
      box("a", 0, 0),
      box("b", 80, 0),
    ])));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "covered-content",
      severity: "error",
      at: ["a", "b"],
      where: { x: 80, y: 0, width: 80, height: 96 },
    });
    expect(findings[0]!.message).toContain("50%");
  });

  test("a small overlap that covers a box's text center is still an error", () => {
    // Thin 900×20 bar across a's middle: 12% of a, but over its text center.
    const findings = coveredContent.check(buildBoardModel(makeDocument([
      box("a", 0, 0),
      box("bar", 70, 38, 900, 20),
    ])));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("covers the text center of a");
  });

  test("clean boards, exempt kinds, and cross-parent pairs carry no finding", () => {
    const findings = coveredContent.check(buildBoardModel(makeDocument([
      box("a", 0, 0),
      box("b", 224, 0),                              // apart
      box("wrap", 0, 0, 480, 320, "section"),        // sections exempt
      box("note", 40, 40, 160, 96, "sticky"),        // stickies exempt
      box("pin", 60, 60, 24, 24, "annotation-marker"),
      { ...box("other", 8, 8), parentId: "wrap" },   // overlaps a, different parent
    ])));
    expect(findings).toHaveLength(0);
  });

  test("exactly 25% with the text center on the seam is clean; a hair more is not", () => {
    const atThreshold = coveredContent.check(buildBoardModel(makeDocument([
      box("a", 0, 0),
      box("b", 80, 48),
    ])));
    expect(atThreshold).toHaveLength(0);

    const pastThreshold = coveredContent.check(buildBoardModel(makeDocument([
      box("a", 0, 0),
      box("b", 79, 48),  // intersection 81×48 = 25.3% of the smaller
    ])));
    expect(pastThreshold).toHaveLength(1);
    expect(pastThreshold[0]!.message).toContain("25%");
  });

  // --- chip vs box (ported from rules-label-clearance, + clearance margin) ---

  test("a label chip landing on a third box is an error", () => {
    // Waypoints pin the route straight across "mid": polyline (80,48)→(480,48)
    // →(880,48), arc midpoint (480,48); label "X" chip is 32×28 at x 464..496
    // — inside "mid" (400..560 × 0..96).
    const findings = coveredContent.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("mid", 400, 0), box("b", 800, 0)],
      [{ ...connect("e", "a", "b"), label: "X", waypoints: [[480, 48]] }],
    )));
    const errors = findings.filter((finding) => finding.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      rule: "covered-content",
      at: ["e", "mid"],
      where: { x: 464, y: 34, width: 32, height: 28 },
    });
    expect(errors[0]!.message).toContain('label "X" chip on e covers mid');
  });

  test("chips ignore their own endpoints; unlabeled edges carry no chip", () => {
    const findings = coveredContent.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("b", 224, 0), box("far", 1200, 600), box("far2", 1600, 600)],
      [
        { ...connect("labeled", "a", "b"), label: "connect()" },  // chip pokes into a and b only
        connect("bare", "far", "far2"),
      ],
    )));
    expect(findings).toHaveLength(0);
  });

  test("waypointed edges hang the chip at the routed path's arc midpoint", () => {
    // Polyline (80,48)→(80,300)→(880,48): total ≈1090.8px, so the arc
    // midpoint sits on the second segment near (360,212) — over "w";
    // the straight a→b midpoint (480,48) would not be.
    const findings = coveredContent.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("w", 320, 180), box("b", 800, 0)],
      [{ ...connect("e", "a", "b"), label: "X", waypoints: [[80, 300]] }],
    )));
    const errors = findings.filter((finding) => finding.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ at: ["e", "w"] });
  });

  test("a chip kissing a box is a clearance warning; one px inside is an error", () => {
    // Chip "X" spans x 464..496; a box starting at 496 touches it — v4 read
    // that clean, v5 flags the contact (nested-arch R1) as a warning.
    const touching = coveredContent.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("t", 496, 0), box("b", 800, 0)],
      [{ ...connect("e", "a", "b"), label: "X" }],
    )));
    expect(touching).toHaveLength(1);
    expect(touching[0]).toMatchObject({ severity: "warning", at: ["e", "t"] });
    expect(touching[0]!.message).toContain("sits within 16px of t");

    const overlapping = coveredContent.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("t", 495, 0), box("b", 800, 0)],
      [{ ...connect("e", "a", "b"), label: "X" }],
    )));
    const errors = overlapping.filter((finding) => finding.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("covers t");
  });

  test("clearance margin edge: contact at 16px warns, 17px is clean", () => {
    // Chip "X" right edge at 496; inflated (+16) reaches 512.
    const atMargin = coveredContent.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("t", 511, 0), box("b", 800, 0)],
      [{ ...connect("e", "a", "b"), label: "X" }],
    )));
    expect(atMargin.filter((finding) => finding.at.includes("t"))).toHaveLength(1);
    expect(atMargin[0]!.severity).toBe("warning");

    const clear = coveredContent.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("t", 513, 0), box("b", 800, 0)],
      [{ ...connect("e", "a", "b"), label: "X" }],
    )));
    expect(clear.filter((finding) => finding.at.includes("t"))).toHaveLength(0);
  });

  // --- chip vs chip (ported, + clearance margin) ---

  test("two chips over each other are an error (plus wire-contact warnings)", () => {
    // Waypoint-pinned horizontal runs at y=48 and y=68: chips 464..496 at
    // y 34..62 and 54..82 overlap; each chip also sits within clearance of
    // the other edge's wire. Box columns staggered so no box-on-box fires.
    const findings = coveredContent.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("b", 800, 0), box("c", 200, 20), box("d", 600, 20)],
      [
        { ...connect("e1", "a", "b"), label: "X", waypoints: [[480, 48]] },
        { ...connect("e2", "c", "d"), label: "Y", waypoints: [[480, 68]] },
      ],
    )));
    const errors = findings.filter((finding) => finding.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ at: ["e1", "e2"] });
    expect(errors[0]!.message).toContain("overlaps label");
  });

  test("two chips 16px-close but not overlapping are a clearance warning", () => {
    // Runs pinned at y=48 and y=90: chip rects y 34..62 and 76..104 sit
    // 14px apart — inside the 16px clearance, outside true overlap.
    const near = coveredContent.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("b", 800, 0), box("c", 200, 42), box("d", 600, 42)],
      [
        { ...connect("e1", "a", "b"), label: "X", waypoints: [[480, 48]] },
        { ...connect("e2", "c", "d"), label: "Y", waypoints: [[480, 90]] },
      ],
    )));
    const chipChip = near.filter((finding) =>
      finding.at.includes("e1") && finding.at.includes("e2")
      && finding.message.includes("chip"));
    expect(chipChip.length).toBeGreaterThanOrEqual(1);
    expect(chipChip.every((finding) => finding.severity === "warning")).toBe(true);
    expect(chipChip.some((finding) => finding.message.includes("sits within 16px of label"))).toBe(true);
  });

  // --- chip vs another edge's routed polyline (NEW — flowchart R1 blind spot) ---

  test("a chip lying on another edge's path is an error", () => {
    // e's chip sits at (480,48), rect 464..496 × 34..62. f runs vertically
    // at x=480 straight through it (28px of run inside the chip).
    const findings = coveredContent.check(buildBoardModel(makeDocument(
      [
        box("a", 0, 0), box("b", 800, 0),
        box("c", 400, 300), box("d", 400, -396),
      ],
      [
        { ...connect("e", "a", "b"), label: "X" },
        { ...connect("f", "c", "d") },
      ],
    )));
    const errors = findings.filter((finding) => finding.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ at: ["e", "f"] });
    expect(errors[0]!.message).toContain("lies on f's path for 28px");
  });

  test("another edge within the 16px clearance of a chip is a warning", () => {
    // f's vertical run at x=512 — 16px right of the chip's edge at 496.
    const near = coveredContent.check(buildBoardModel(makeDocument(
      [
        box("a", 0, 0), box("b", 800, 0),
        box("c", 432, 300), box("d", 432, -396),
      ],
      [
        { ...connect("e", "a", "b"), label: "X" },
        { ...connect("f", "c", "d") },
      ],
    )));
    const chipEdge = near.filter((finding) => finding.at.includes("f"));
    expect(chipEdge).toHaveLength(1);
    expect(chipEdge[0]!.severity).toBe("warning");
    expect(chipEdge[0]!.message).toContain("sits within 16px of f's path");

    // One px further out the wire is clear.
    const clear = coveredContent.check(buildBoardModel(makeDocument(
      [
        box("a", 0, 0), box("b", 800, 0),
        box("c", 433, 300), box("d", 433, -396),
      ],
      [
        { ...connect("e", "a", "b"), label: "X" },
        { ...connect("f", "c", "d") },
      ],
    )));
    expect(clear.filter((finding) => finding.at.includes("f"))).toHaveLength(0);
  });

  test("run-length edge: ≤8px of path inside the chip is not an error", () => {
    // f's waypointed route clips the chip's top-left corner: horizontal leg
    // y=36 entering at x=464, turning up at the waypoint, exiting at y=34.
    // Turn at x=468 → 4+2 = 6px of run (≤8, no error); turn at x=471 →
    // 7+2 = 9px (>8, error).
    const objects = [
      box("a", 0, 0), box("b", 800, 0),
      box("c", -360, -12), box("d", 388, -396),
    ];
    const under = coveredContent.check(buildBoardModel(makeDocument(objects, [
      { ...connect("e", "a", "b"), label: "X" },
      { ...connect("f", "c", "d"), waypoints: [[468, 36]] },
    ])));
    expect(under.filter((finding) => finding.severity === "error")).toHaveLength(0);

    const over = coveredContent.check(buildBoardModel(makeDocument(objects, [
      { ...connect("e", "a", "b"), label: "X" },
      { ...connect("f", "c", "d"), waypoints: [[471, 36]] },
    ])));
    const errors = over.filter((finding) => finding.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("lies on f's path for 9px");
  });
});
