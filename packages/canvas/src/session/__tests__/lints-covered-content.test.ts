import { describe, expect, test } from "bun:test";

import { rule as coveredContent } from "../../board/lints/rules/covered-content";
import { box, connect, makeDocument } from "./synthetic";
import { FIGJAM_CONTEXT } from "./helpers";
import { chipFor, chipWidth } from "../../board/lints/geometry";
import { FIGJAM_CANVAS_STYLE } from "../../theme/canvas-style";

/** Chip findings only (box-on-box excluded). */
const chipFindings = (findings: ReturnType<typeof coveredContent.check>) =>
  findings.filter((finding) => finding.message.startsWith("label "));

// Chip geometry here is figjam's (30px sans chip), so every check measures in
// the figjam theme explicitly.

describe("covered-content lint", () => {
  test("declares its faces", () => {
    expect(coveredContent.id).toBe("covered-content");
    expect(coveredContent.tier).toBe("error");
    expect(coveredContent.guidance).toContain("exempt");
  });

  // --- box-on-box (ported from rules-overlap) ---

  test("an overlap past 25% of the smaller box is an error", () => {
    // Same-size boxes offset 80px: intersection 80×96 = 50% of either.
    const findings = coveredContent.check(makeDocument([
      box("a", 0, 0),
      box("b", 80, 0),
    ]), FIGJAM_CONTEXT);
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
    ]), FIGJAM_CONTEXT);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("covers the text center of a");
  });

  test("clean boards, exempt kinds, and cross-parent pairs carry no finding", () => {
    const findings = coveredContent.check(makeDocument([
      box("a", 0, 0),
      box("b", 224, 0),                              // apart
      box("wrap", 0, 0, 480, 320, "section"),        // sections exempt
      box("note", 40, 40, 160, 96, "sticky"),        // stickies exempt
      { ...box("other", 8, 8), parentId: "wrap" },   // overlaps a, different parent
    ]), FIGJAM_CONTEXT);
    expect(findings).toHaveLength(0);
  });

  test("exactly 25% with the text center on the seam is clean; a hair more is not", () => {
    const atThreshold = coveredContent.check(makeDocument([
      box("a", 0, 0),
      box("b", 80, 48),
    ]), FIGJAM_CONTEXT);
    expect(atThreshold).toHaveLength(0);

    const pastThreshold = coveredContent.check(makeDocument([
      box("a", 0, 0),
      box("b", 79, 48),  // intersection 81×48 = 25.3% of the smaller
    ]), FIGJAM_CONTEXT);
    expect(pastThreshold).toHaveLength(1);
    expect(pastThreshold[0]!.message).toContain("25%");
  });

  test("icon boxes are judged by what they paint: apart tiles and captions are clean, touching tiles are not", () => {
    // Default (tile) style: a 300x120 icon paints a centered tile and its
    // caption (56px tile at x 122 and 272 here), not the empty sides of its box.
    const icon = (id: string, x: number) => ({ ...box(id, x, 0, 300, 120, "icon"), text: id, icon: "database" });
    expect(coveredContent.check(makeDocument([icon("db", 0), icon("api", 150)]))).toEqual([]);

    const findings = coveredContent.check(makeDocument([icon("db", 0), icon("api", 20)]));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "error", at: ["db", "api"] });
  });

  // --- chip vs box (ported from rules-label-clearance, + clearance margin) ---

  test("a wire through a third box carries its chip clear of the box", () => {
    // Waypoints pin the route straight through "mid"; its arc midpoint
    // (480,48) is inside "mid" (400..560 × 0..96). The renderer places the
    // chip on a clear stretch of the wire instead (connectors/label-placement.ts).
    const document = makeDocument(
      [box("a", 0, 0), box("mid", 400, 0), box("b", 800, 0)],
      [{ ...connect("e", "a", "b"), label: "X", waypoints: [[480, 48]] }],
    );
    const chip = chipFor(document.connections[0]!, document, FIGJAM_CANVAS_STYLE)!;
    expect(chip.rect.x + chip.rect.width <= 400 || chip.rect.x >= 560).toBe(true);
    expect(chipFindings(coveredContent.check(document, FIGJAM_CONTEXT))).toEqual([]);
  });

  test("a chip on its own endpoint box is an error; unlabeled edges carry no chip", () => {
    // a and b sit 64px apart, so the "connect()" chip pokes into both.
    const findings = coveredContent.check(makeDocument(
      [box("a", 0, 0), box("b", 224, 0), box("far", 1200, 600), box("far2", 1600, 600)],
      [
        { ...connect("labeled", "a", "b"), label: "connect()" },
        connect("bare", "far", "far2"),
      ],
    ), FIGJAM_CONTEXT);
    expect(findings.map((finding) => [finding.severity, ...finding.at])).toEqual([
      ["error", "labeled", "a"],
      ["error", "labeled", "b"],
    ]);
    expect(findings[0]!.message).toContain('label "connect()" chip on labeled covers its endpoint a');
  });

  test("a chip over the empty side of an icon's box is clean: only its tile and caption paint", () => {
    // The icon paints a 56px tile at x 172..228 and its caption under it; the
    // "call" chip at x 300..348 sits inside the 400px box but on neither.
    const icon = { ...box("svc", 0, 0, 400, 120, "icon"), text: "Service", detail: "one fact" };
    const findings = coveredContent.check(makeDocument(
      [icon, box("b", 420, 12)],
      [{ ...connect("e", "svc", "b"), label: "call" }],
    ));
    expect(findings).toEqual([]);
  });

  test("a chip with room between its own endpoints is clean", () => {
    const findings = coveredContent.check(makeDocument(
      [box("a", 0, 0), box("b", 600, 0)],
      [{ ...connect("labeled", "a", "b"), label: "connect()" }],
    ), FIGJAM_CONTEXT);
    expect(findings).toEqual([]);
  });

  test("a waypointed edge's chip leaves a box under its arc midpoint", () => {
    // The route runs (160,48)→(160,300)→(800,300)→(800,48); its arc midpoint
    // (480,300) is over "w", so the chip moves along the wire, clear of it.
    const findings = coveredContent.check(makeDocument(
      [box("a", 0, 0), box("w", 400, 252), box("b", 800, 0)],
      [{
        ...connect("e", "a", "b"),
        label: "X",
        waypoints: [[160, 300], [800, 300]],
      }],
    ), FIGJAM_CONTEXT);
    expect(chipFindings(findings)).toEqual([]);
  });

  test("a chip touching a box is clean, and one that would sit inside it moves clear", () => {
    // The midpoint "X" chip spans x 459.5..500.5; a box starting at 501 sits
    // clear of the chip — contact is not a finding.
    const document = (left: number) => makeDocument(
      [box("a", 0, 0), box("t", left, 0), box("b", 800, 0)],
      [{
        ...connect("e", "a", "b"),
        label: "X",
        waypoints: [[160, 48], [800, 48]],
      }],
    );
    expect(coveredContent.check(document(501), FIGJAM_CONTEXT)).toEqual([]);

    // At 500 (or a measuring-band hair inside the chip's edge) the midpoint
    // chip would overlap t, so the renderer slides it along the wire.
    const right = 480 + chipWidth("X", FIGJAM_CANVAS_STYLE) / 2;
    for (const left of [500, right - 0.25]) {
      expect(chipFindings(coveredContent.check(document(left), FIGJAM_CONTEXT))).toEqual([]);
    }
  });

  // --- chip vs chip ---

  test("two chips that would overlap are placed apart", () => {
    // Runs pinned at y=48 and y=68: midpoint chips 459.5..500.5 at y 33..63
    // and 53..83 would overlap; the second placed chip moves along its wire.
    const findings = coveredContent.check(makeDocument(
      [box("a", 0, 0), box("b", 800, 0), box("c", 200, 20), box("d", 600, 20)],
      [
        { ...connect("e1", "a", "b"), label: "X", waypoints: [[480, 48]] },
        { ...connect("e2", "c", "d"), label: "Y", waypoints: [[480, 68]] },
      ],
    ), FIGJAM_CONTEXT);
    expect(findings.filter((finding) => finding.message.includes("overlaps label"))).toEqual([]);
  });

  test("two chips close but not overlapping are clean", () => {
    // Runs pinned at y=48 and y=90: chip rects y 33..63 and 75..105 sit
    // 12px apart.
    const near = coveredContent.check(makeDocument(
      [box("a", 0, 0), box("b", 800, 0), box("c", 200, 42), box("d", 600, 42)],
      [
        { ...connect("e1", "a", "b"), label: "X", waypoints: [[480, 48]] },
        { ...connect("e2", "c", "d"), label: "Y", waypoints: [[480, 90]] },
      ],
    ), FIGJAM_CONTEXT);
    expect(near.filter((finding) => finding.at.includes("e1") && finding.at.includes("e2"))).toEqual([]);
  });

  // --- chip vs another edge's routed polyline ---

  test("a chip moves off another edge that crosses its midpoint", () => {
    // f runs vertically at x=480 straight through e's midpoint chip
    // (459.5..500.5 × 33..63); the chip moves along e, clear of f.
    const findings = coveredContent.check(makeDocument(
      [
        box("a", 0, 0), box("b", 800, 0),
        box("c", 400, 300), box("d", 400, -396),
      ],
      [
        { ...connect("e", "a", "b"), label: "X" },
        { ...connect("f", "c", "d") },
      ],
    ), FIGJAM_CONTEXT);
    expect(chipFindings(findings)).toEqual([]);
  });

  test("a chip with no clear stretch is still judged where it is drawn", () => {
    // a and b sit 64px apart and f crosses the gap at x=192: every spot on
    // e's wire covers an endpoint, so the least-bad chip stays mid-gap, on f.
    const findings = coveredContent.check(makeDocument(
      [box("a", 0, 0), box("b", 224, 0), box("c", 112, 300), box("d", 112, -396)],
      [
        { ...connect("e", "a", "b"), label: "connect()" },
        { ...connect("f", "c", "d") },
      ],
    ), FIGJAM_CONTEXT);
    expect(findings.map((finding) => [finding.severity, ...finding.at])).toEqual([
      ["error", "e", "a"],
      ["error", "e", "b"],
      ["error", "e", "f"],
    ]);
    expect(findings[2]!.message).toContain("lies on f's path for 30px");
  });

  test("another edge passing near a chip is clean", () => {
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
    ), FIGJAM_CONTEXT);
    expect(near.filter((finding) => finding.at.includes("f"))).toEqual([]);
  });

  test("run-length edge: ≤8px of path inside the chip is not an error; more moves the chip", () => {
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
    const under = coveredContent.check(makeDocument(objectsFor(464), edgesFor(464)), FIGJAM_CONTEXT);
    expect(under.filter((finding) => finding.severity === "error")).toHaveLength(0);

    // 9.5px of run at the midpoint: the renderer moves the chip clear.
    const over = coveredContent.check(makeDocument(objectsFor(466), edgesFor(466)), FIGJAM_CONTEXT);
    expect(chipFindings(over)).toEqual([]);
  });
  test.each(["go", "🚀"])("a chip whose midpoint is inside a box moves clear whatever its label's fallback width (%s)", (label) => {
    // The label point (480,48) lies inside t; the placed chip sits clear of t.
    const document = makeDocument(
      [box("a", 0, 0), box("t", 450, 20, 60, 60), box("b", 800, 0)],
      [{ ...connect("e", "a", "b"), label, waypoints: [[160, 48], [800, 48]] }],
    );
    const chip = chipFor(document.connections[0]!, document, FIGJAM_CANVAS_STYLE)!;
    expect(chip.rect.x + chip.rect.width <= 450 || chip.rect.x >= 510).toBe(true);
    const findings = coveredContent.check(document, FIGJAM_CONTEXT);
    expect(findings.some((finding) => finding.at.includes("t"))).toBe(false);
  });
});
