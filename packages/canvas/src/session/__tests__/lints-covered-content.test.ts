import { describe, expect, test } from "bun:test";

import { rule as coveredContent } from "../../board/lints/rules/covered-content";
import { box, connect, makeDocument } from "./synthetic";
import { FIGJAM_CONTEXT } from "./helpers";
import { chipFor, chipWidth } from "../../board/lints/geometry";
import { FIGJAM_CANVAS_STYLE } from "../../theme/canvas-style";

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

  test("a label chip landing on a third box is an error", () => {
    // Waypoints pin the route straight past "mid", label point (480,48);
    // the true "X" chip is 41×30 (renderer min width) at x 459.5..500.5 ×
    // 33..63 — its lower half inside "mid" (400..560 × 50..146), whose top
    // sits 2px under the wire (the router draws no wire through a box).
    const findings = coveredContent.check(makeDocument(
      [box("a", 0, 0), box("mid", 400, 50), box("b", 800, 0)],
      [{ ...connect("e", "a", "b"), label: "X", waypoints: [[480, 48]] }],
    ), FIGJAM_CONTEXT);
    const errors = findings.filter((finding) => finding.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      rule: "covered-content",
      at: ["e", "mid"],
      where: { x: 459.5, y: 33, width: 41, height: 30 },
    });
    expect(errors[0]!.message).toContain('label "X" chip on e covers mid');
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

  test("waypointed edges hang the chip at the routed path's arc midpoint", () => {
    // A valid orthogonal renderer route runs (160,48)→(160,300)→
    // (800,300)→(800,48), so its arc midpoint is (480,300) and the chip
    // (y 285..315) reaches into "w" just under the wire; the straight a→b
    // midpoint (480,48) would not.
    const findings = coveredContent.check(makeDocument(
      [box("a", 0, 0), box("w", 400, 302), box("b", 800, 0)],
      [{
        ...connect("e", "a", "b"),
        label: "X",
        waypoints: [[160, 300], [800, 300]],
      }],
    ), FIGJAM_CONTEXT);
    const errors = findings.filter((finding) => finding.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ at: ["e", "w"] });
  });

  test("a chip touching a box is clean; inside is an error", () => {
    // The true "X" chip spans x 459.5..500.5 × 33..63; a box starting at
    // 501 (its top 2px under the wire) sits clear of the chip — contact is
    // not a finding.
    const touching = coveredContent.check(makeDocument(
      [box("a", 0, 0), box("t", 501, 50), box("b", 800, 0)],
      [{
        ...connect("e", "a", "b"),
        label: "X",
        waypoints: [[160, 48], [800, 48]],
      }],
    ), FIGJAM_CONTEXT);
    expect(touching).toEqual([]);

    // At 500 the box takes the chip's last half pixel — true overlap, error.
    const overlapping = coveredContent.check(makeDocument(
      [box("a", 0, 0), box("t", 500, 50), box("b", 800, 0)],
      [{
        ...connect("e", "a", "b"),
        label: "X",
        waypoints: [[160, 48], [800, 48]],
      }],
    ), FIGJAM_CONTEXT);
    const errors = overlapping.filter((finding) => finding.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("covers t");
  });

  test("an overlap inside the 1px measuring band is a note, never an error", () => {
    // "go live" sizes its chip from the measured label: centered at x 480, its
    // right edge is 480 + w/2. A box 0.25px inside that edge overlaps the
    // measured chip only — the browser's chip may be a hair narrower.
    const right = 480 + chipWidth("go live", FIGJAM_CANVAS_STYLE) / 2;
    const findings = coveredContent.check(makeDocument(
      [box("a", 0, 0), box("t", right - 0.25, 50), box("b", 800, 0)],
      [{
        ...connect("e", "a", "b"),
        label: "go live",
        waypoints: [[160, 48], [800, 48]],
      }],
    ), FIGJAM_CONTEXT);
    expect(findings.map((finding) => finding.severity)).toEqual(["note"]);
    expect(findings[0]!.message).toContain("covers t");
  });

  // --- chip vs chip ---

  test("two chips over each other are an error (plus wire-contact warnings)", () => {
    // Waypoint-pinned horizontal runs at y=48 and y=68: chips 459.5..500.5
    // at y 33..63 and 53..83 overlap; each chip also sits within clearance
    // of the other edge's wire. c and d are thin bars under the y=48 wire, so
    // neither wire crosses a box and no box-on-box fires.
    const findings = coveredContent.check(makeDocument(
      [box("a", 0, 0), box("b", 800, 0), box("c", 200, 60, 100, 16), box("d", 660, 60, 100, 16)],
      [
        { ...connect("e1", "a", "b"), label: "X", waypoints: [[480, 48]] },
        { ...connect("e2", "c", "d"), label: "Y", waypoints: [[480, 68]] },
      ],
    ), FIGJAM_CONTEXT);
    const errors = findings.filter((finding) => finding.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ at: ["e1", "e2"] });
    expect(errors[0]!.message).toContain("overlaps label");
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
    ), FIGJAM_CONTEXT);
    const errors = findings.filter((finding) => finding.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ at: ["e", "f"] });
    expect(errors[0]!.message).toContain("lies on f's path for 30px");
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

  test("run-length edge: ≤8px of path inside the chip is not an error", () => {
    // f's waypointed route clips the chip's top-left corner (chip 459.5..
    // 500.5 × 33..63): horizontal leg at y=36 entering at x=459.5, turning
    // up at the waypoint, exiting through the chip top at y=33. Turn at
    // x=464 → 4.5+3 = 7.5px of run (≤8, no error); turn at x=466 →
    // 6.5+3 = 9.5px (>8, error). c is a thin bar above e's wire, so f
    // crosses no box; d tracks the turn so the final leg stays a straight
    // vertical drop into its bottom anchor.
    const objectsFor = (turnX: number) => [
      box("a", 0, 0), box("b", 800, 0),
      box("c", 240, 28, 100, 16), box("d", turnX - 80, -396),
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

    const over = coveredContent.check(makeDocument(objectsFor(466), edgesFor(466)), FIGJAM_CONTEXT);
    const errors = over.filter((finding) => finding.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("lies on f's path for 10px"); // 9.5px, rounded
  });
  test.each(["go", "🚀"])("a chip centered on a box is an error whatever its label's fallback width (%s)", (label) => {
    // The chip, pinned 42px under its wire to (480,90), is centered inside t
    // (y 60..120, clear of the wire): even its guaranteed footprint covers t.
    const document = makeDocument(
      [box("a", 0, 0), box("t", 450, 60, 60, 60), box("b", 800, 0)],
      [{
        ...connect("e", "a", "b"),
        label,
        waypoints: [[160, 48], [800, 48]],
        labelPosition: { along: 0.5, offset: -42 },
      }],
    );
    const chip = chipFor(document.connections[0]!, document, FIGJAM_CANVAS_STYLE)!;
    expect(chip.rect.x + chip.rect.width / 2).toBe(480);
    const findings = coveredContent.check(document, FIGJAM_CONTEXT);
    expect(findings.some((finding) => finding.severity === "error" && finding.at.includes("t"))).toBe(true);
  });
});
