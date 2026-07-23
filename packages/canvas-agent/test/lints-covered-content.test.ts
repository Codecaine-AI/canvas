import { describe, expect, test } from "bun:test";

import { rule as coveredContent } from "../src/board/lints/rules/covered-content";
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
    const findings = coveredContent.check(makeDocument([
      box("a", 0, 0),
      box("b", 80, 0),
    ]));
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
    const findings = coveredContent.check(makeDocument([
      box("a", 0, 0),
      box("bar", 70, 38, 900, 20),
    ]));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("covers the text center of a");
  });

  test("clean boards, exempt kinds, and cross-parent pairs carry no finding", () => {
    const findings = coveredContent.check(makeDocument([
      box("a", 0, 0),
      box("b", 224, 0),                              // apart
      box("wrap", 0, 0, 480, 320, "section"),        // sections exempt
      box("note", 40, 40, 160, 96, "sticky"),        // stickies exempt
      box("pin", 60, 60, 24, 24, "annotation-marker"),
      { ...box("other", 8, 8), parentId: "wrap" },   // overlaps a, different parent
    ]));
    expect(findings).toHaveLength(0);
  });

  test("exactly 25% with the text center on the seam is clean; a hair more is not", () => {
    const atThreshold = coveredContent.check(makeDocument([
      box("a", 0, 0),
      box("b", 80, 48),
    ]));
    expect(atThreshold).toHaveLength(0);

    const pastThreshold = coveredContent.check(makeDocument([
      box("a", 0, 0),
      box("b", 79, 48),  // intersection 81×48 = 25.3% of the smaller
    ]));
    expect(pastThreshold).toHaveLength(1);
    expect(pastThreshold[0]!.message).toContain("25%");
  });

  // --- chip vs box (ported from rules-label-clearance, + clearance margin) ---

  test("a label chip landing on a third box is an error", () => {
    // Waypoints pin the route straight through "mid", label point (480,48);
    // the true "X" chip is 41×30 (renderer min width) at x 459.5..500.5 —
    // inside "mid" (400..560 × 0..96).
    const findings = coveredContent.check(makeDocument(
      [box("a", 0, 0), box("mid", 400, 0), box("b", 800, 0)],
      [{ ...connect("e", "a", "b"), label: "X", waypoints: [[480, 48]] }],
    ));
    const errors = findings.filter((finding) => finding.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      rule: "covered-content",
      at: ["e", "mid"],
      where: { x: 459.5, y: 33, width: 41, height: 30 },
    });
    expect(errors[0]!.message).toContain('label "X" chip on e covers mid');
  });

  test("chips ignore their own endpoints; unlabeled edges carry no chip", () => {
    const findings = coveredContent.check(makeDocument(
      [box("a", 0, 0), box("b", 224, 0), box("far", 1200, 600), box("far2", 1600, 600)],
      [
        { ...connect("labeled", "a", "b"), label: "connect()" },  // chip pokes into a and b only
        connect("bare", "far", "far2"),
      ],
    ));
    expect(findings).toHaveLength(0);
  });

  test("waypointed edges hang the chip at the routed path's arc midpoint", () => {
    // A valid orthogonal renderer route runs (160,48)→(160,300)→
    // (800,300)→(800,48), so its arc midpoint is (480,300), over "w";
    // the straight a→b midpoint (480,48) would not be.
    const findings = coveredContent.check(makeDocument(
      [box("a", 0, 0), box("w", 400, 252), box("b", 800, 0)],
      [{
        ...connect("e", "a", "b"),
        label: "X",
        waypoints: [[160, 300], [800, 300]],
      }],
    ));
    const errors = findings.filter((finding) => finding.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ at: ["e", "w"] });
  });

  test("a chip kissing a box is a clearance warning; inside is an error", () => {
    // The true "X" chip spans x 459.5..500.5; a box starting at 501 sits
    // clear of the chip but inside its 16px margin — contact reads as
    // merged, so it warns even without true overlap.
    const touching = coveredContent.check(makeDocument(
      [box("a", 0, 0), box("t", 501, 0), box("b", 800, 0)],
      [{
        ...connect("e", "a", "b"),
        label: "X",
        waypoints: [[160, 48], [800, 48]],
      }],
    ));
    expect(touching).toHaveLength(1);
    expect(touching[0]).toMatchObject({ severity: "warning", at: ["e", "t"] });
    expect(touching[0]!.message).toContain("sits within 16px of t");

    // At 500 the box takes the chip's last half pixel — true overlap, error.
    const overlapping = coveredContent.check(makeDocument(
      [box("a", 0, 0), box("t", 500, 0), box("b", 800, 0)],
      [{
        ...connect("e", "a", "b"),
        label: "X",
        waypoints: [[160, 48], [800, 48]],
      }],
    ));
    const errors = overlapping.filter((finding) => finding.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("covers t");
  });

  test("clearance margin edge: contact inside 16px warns, past it is clean", () => {
    // The auto route detours around "t", but the chip (right edge 500.5,
    // inflated to 516.5) still reaches t's face at x 516 — warning.
    const atMargin = coveredContent.check(makeDocument(
      [box("a", 0, 0), box("t", 516, 0), box("b", 800, 0)],
      [{ ...connect("e", "a", "b"), label: "X" }],
    ));
    expect(atMargin.filter((finding) => finding.at.includes("t"))).toHaveLength(1);
    expect(atMargin[0]!.severity).toBe("warning");

    // One px further the inflated chip no longer touches t.
    const clear = coveredContent.check(makeDocument(
      [box("a", 0, 0), box("t", 517, 0), box("b", 800, 0)],
      [{ ...connect("e", "a", "b"), label: "X" }],
    ));
    expect(clear.filter((finding) => finding.at.includes("t"))).toHaveLength(0);
  });

  // --- chip vs chip (ported, + clearance margin) ---

  test("two chips over each other are an error (plus wire-contact warnings)", () => {
    // Waypoint-pinned horizontal runs at y=48 and y=68: chips 459.5..500.5
    // at y 33..63 and 53..83 overlap; each chip also sits within clearance
    // of the other edge's wire. Box columns staggered so no box-on-box fires.
    const findings = coveredContent.check(makeDocument(
      [box("a", 0, 0), box("b", 800, 0), box("c", 200, 20), box("d", 600, 20)],
      [
        { ...connect("e1", "a", "b"), label: "X", waypoints: [[480, 48]] },
        { ...connect("e2", "c", "d"), label: "Y", waypoints: [[480, 68]] },
      ],
    ));
    const errors = findings.filter((finding) => finding.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ at: ["e1", "e2"] });
    expect(errors[0]!.message).toContain("overlaps label");
  });

  test("two chips 16px-close but not overlapping are a clearance warning", () => {
    // Runs pinned at y=48 and y=90: chip rects y 33..63 and 75..105 sit
    // 12px apart — inside the 16px clearance, outside true overlap.
    const near = coveredContent.check(makeDocument(
      [box("a", 0, 0), box("b", 800, 0), box("c", 200, 42), box("d", 600, 42)],
      [
        { ...connect("e1", "a", "b"), label: "X", waypoints: [[480, 48]] },
        { ...connect("e2", "c", "d"), label: "Y", waypoints: [[480, 90]] },
      ],
    ));
    const chipChip = near.filter((finding) =>
      finding.at.includes("e1") && finding.at.includes("e2")
      && finding.message.includes("chip"));
    expect(chipChip.length).toBeGreaterThanOrEqual(1);
    expect(chipChip.every((finding) => finding.severity === "warning")).toBe(true);
    expect(chipChip.some((finding) => finding.message.includes("sits within 16px of label"))).toBe(true);
  });

  // --- chip vs another edge's routed polyline (NEW — flowchart R1 blind spot) ---

  test("a chip lying on another edge's path is an error", () => {
    // e's chip sits at (480,48), rect 459.5..500.5 × 33..63. f runs
    // vertically at x=480 straight through it (30px of run inside the chip
    // — the full renderer chip height).
    const findings = coveredContent.check(makeDocument(
      [
        box("a", 0, 0), box("b", 800, 0),
        box("c", 400, 300), box("d", 400, -396),
      ],
      [
        { ...connect("e", "a", "b"), label: "X" },
        { ...connect("f", "c", "d") },
      ],
    ));
    const errors = findings.filter((finding) => finding.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ at: ["e", "f"] });
    expect(errors[0]!.message).toContain("lies on f's path for 30px");
  });

  test("another edge within the 16px clearance of a chip is a warning", () => {
    // f's vertical run at x=516 — 15.5px right of the chip's edge at 500.5.
    const near = coveredContent.check(makeDocument(
      [
        box("a", 0, 0), box("b", 800, 0),
        box("c", 436, 300), box("d", 436, -396),
      ],
      [
        { ...connect("e", "a", "b"), label: "X" },
        { ...connect("f", "c", "d") },
      ],
    ));
    const chipEdge = near.filter((finding) => finding.at.includes("f"));
    expect(chipEdge).toHaveLength(1);
    expect(chipEdge[0]!.severity).toBe("warning");
    expect(chipEdge[0]!.message).toContain("sits within 16px of f's path");

    // One px further out (x=517, 16.5px away) the wire is clear.
    const clear = coveredContent.check(makeDocument(
      [
        box("a", 0, 0), box("b", 800, 0),
        box("c", 437, 300), box("d", 437, -396),
      ],
      [
        { ...connect("e", "a", "b"), label: "X" },
        { ...connect("f", "c", "d") },
      ],
    ));
    expect(clear.filter((finding) => finding.at.includes("f"))).toHaveLength(0);
  });

  test("run-length edge: ≤8px of path inside the chip is not an error", () => {
    // f's waypointed route clips the chip's top-left corner (chip 459.5..
    // 500.5 × 33..63): horizontal leg at y=36 entering at x=459.5, turning
    // up at the waypoint, exiting through the chip top at y=33. Turn at
    // x=464 → 4.5+3 = 7.5px of run (≤8, no error); turn at x=466 →
    // 6.5+3 = 9.5px (>8, error). d tracks the turn so the final leg stays
    // a straight vertical drop into its bottom anchor.
    const objectsFor = (turnX: number) => [
      box("a", 0, 0), box("b", 800, 0),
      box("c", -360, -12), box("d", turnX - 80, -396),
    ];
    const edgesFor = (turnX: number) => [
      { ...connect("e", "a", "b"), label: "X" },
      {
        ...connect("f", "c", "d"),
        from: { objectId: "c", anchor: "right" as const },
        to: { objectId: "d", anchor: "bottom" as const },
        waypoints: [[turnX, 36]] as Array<[number, number]>,
      },
    ];
    const under = coveredContent.check(makeDocument(objectsFor(464), edgesFor(464)));
    expect(under.filter((finding) => finding.severity === "error")).toHaveLength(0);

    const over = coveredContent.check(makeDocument(objectsFor(466), edgesFor(466)));
    const errors = over.filter((finding) => finding.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("lies on f's path for 9px");
  });
});
