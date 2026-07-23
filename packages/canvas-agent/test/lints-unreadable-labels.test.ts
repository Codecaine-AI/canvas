import { describe, expect, test } from "bun:test";

import { runDiagnostics } from "../src/board/lints/run";
import { rule as unreadableLabels } from "../src/board/lints/rules/unreadable-labels";
import { box, connect, makeDocument } from "./synthetic";

/**
 * The rule's claim is "the rendered chip does not fit where it renders" —
 * the true chip rect (renderer metrics, router labelPoint), inflated by the
 * 16px breathing margin, must not intersect either ENDPOINT box of its own
 * edge. No taste floor, no pair/window scan; chips hitting OTHER
 * boxes/chips/wires are covered-content's job.
 */
describe("unreadable-labels lint", () => {
  test("declares its faces", () => {
    expect(unreadableLabels.id).toBe("unreadable-labels");
    expect(unreadableLabels.tier).toBe("warning");
    expect(unreadableLabels.guidance).toContain("breathing margin");
    expect(typeof unreadableLabels.quickfix).toBe("function");
  });

  test("a chip that fits with its margins is clean — no generosity floor", () => {
    // Gap 120: the "X" chip is 41px wide and needs 41+32 = 73px, so it fits
    // with room to spare. Clean — generosity beyond the fit is style, not lint.
    const findings = unreadableLabels.check(makeDocument(
      [box("a", 0, 0), box("b", 280, 0)],
      [{ ...connect("e", "a", "b"), label: "X" }],
    ));
    expect(findings).toHaveLength(0);
  });

  test("a chip bleeding onto its endpoint boxes warns with the true numbers", () => {
    // Gap 44: the 41×30 chip sits centered at the route midpoint (x 161.5..
    // 202.5) and its 16px margin reaches into both alpha (..160) and beta
    // (204..). Needed = 41 + 2×16 = 73.
    const findings = unreadableLabels.check(makeDocument(
      [box("alpha", 0, 0), box("beta", 204, 0)],
      [{ ...connect("edge", "alpha", "beta"), label: "X" }],
    ));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "unreadable-labels",
      severity: "warning",
      at: ["edge", "alpha", "beta"],
      where: { x: 161.5, y: 33, width: 41, height: 30 },
    });
    expect(findings[0]!.message).toContain('label "X" chip on edge (41×30px)');
    expect(findings[0]!.message).toContain("bleeds onto alpha and beta");
    expect(findings[0]!.message).toContain("44px of corridor where the chip needs 73px");
    expect(findings[0]!.suggestion).toContain("≥73px");
    expect(findings[0]!.suggestion).toContain("16px margins");
  });

  test("fit threshold is physical: 74px gap fits the 41px chip, 72px does not", () => {
    // Needed = 73. Chip centered: at gap 74 each side clears the margin by
    // 0.5px; at gap 72 it falls 0.5px short on each side.
    const fits = unreadableLabels.check(makeDocument(
      [box("a", 0, 0), box("b", 234, 0)],
      [{ ...connect("e", "a", "b"), label: "X" }],
    ));
    expect(fits).toHaveLength(0);

    const tight = unreadableLabels.check(makeDocument(
      [box("a", 0, 0), box("b", 232, 0)],
      [{ ...connect("e", "a", "b"), label: "X" }],
    ));
    expect(tight).toHaveLength(1);
    expect(tight[0]!.message).toContain("72px of corridor where the chip needs 73px");
  });

  test("no distance window: a long chip fires wherever it physically cannot fit", () => {
    // A wide gap is no exemption: the 27-char chip is 27×9.6+24 = 283.2px
    // wide — it physically cannot fit in 240px, so the rule fires.
    const findings = unreadableLabels.check(makeDocument(
      [box("a", 0, 0), box("b", 400, 0)],
      [{ ...connect("e", "a", "b"), label: "a-very-long-edge-label-here" }],
    ));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("240px of corridor where the chip needs 316px");
  });

  test("a chip rendering AWAY from the corridor is clean regardless of gap", () => {
    // Waypoints route the wire down and across: the chip renders on the far
    // horizontal leg at y=300, nowhere near either endpoint box, so the 44px
    // corridor between them carries no finding — the chip fits where it
    // actually renders.
    const findings = unreadableLabels.check(makeDocument(
      [box("a", 0, 0), box("b", 204, 0)],
      [{
        ...connect("e", "a", "b"),
        from: { objectId: "a", anchor: "bottom" },
        to: { objectId: "b", anchor: "bottom" },
        label: "X",
        waypoints: [[80, 300], [284, 300]],
      }],
    ));
    expect(findings).toHaveLength(0);
  });

  test("unlabeled and whitespace-labeled edges never fire (no chip renders)", () => {
    const findings = unreadableLabels.check(makeDocument(
      [box("a", 0, 0), box("b", 204, 0), box("c", 0, 300), box("d", 204, 300)],
      [
        connect("bare", "a", "b"),
        { ...connect("blank", "c", "d"), label: "   " },
      ],
    ));
    expect(findings).toHaveLength(0);
  });

  test("section endpoints are exempt; node endpoints on the same edge still count", () => {
    // Two section frames 20px apart: the chip bleeds onto both, but section
    // frames are background — no finding.
    const sectionPair = unreadableLabels.check(makeDocument(
      [
        box("wrap1", 0, 0, 480, 320, "section"),
        box("wrap2", 500, 0, 480, 320, "section"),
      ],
      [{ ...connect("e", "wrap1", "wrap2"), label: "X" }],
    ));
    expect(sectionPair).toHaveLength(0);

    // Section → node, 44px apart: the chip bleeds onto both endpoints but
    // only the node side is a finding.
    const mixed = unreadableLabels.check(makeDocument(
      [box("wrap", 0, 0, 480, 320, "section"), box("b", 524, 112)],
      [{ ...connect("e", "wrap", "b"), label: "X" }],
    ));
    expect(mixed).toHaveLength(1);
    expect(mixed[0]!.at).toEqual(["e", "b"]);
    expect(mixed[0]!.message).toContain("bleeds onto b");
  });

  test("quickfix widens by the true deficit, landing on the 16px grid", () => {
    // Gap 44, needed 73 → deficit 29 → beta 204+29 = 233, snapped UP to the
    // absolute 16px grid (the canvas snaps every patched geometry there):
    // beta moves 204 → 240 and the chip fits with both margins (gap 80 ≥ 73).
    const document = makeDocument(
      [box("alpha", 0, 0), box("beta", 204, 0)],
      [{ ...connect("edge", "alpha", "beta"), label: "X" }],
    );
    const diagnostic = runDiagnostics(document).find((entry) => entry.rule === "unreadable-labels")!;
    expect(diagnostic.quickfixAvailable).toBe(true);

    const operations = unreadableLabels.quickfix!(document, diagnostic);
    expect(operations).toEqual([{
      type: "updateObject",
      objectId: "beta",
      patch: { geometry: { x: 240, y: 0, width: 160, height: 96 } },
    }]);

    const fixed = makeDocument(
      [box("alpha", 0, 0), box("beta", 240, 0)],
      [{ ...connect("edge", "alpha", "beta"), label: "X" }],
    );
    expect(unreadableLabels.check(fixed)).toHaveLength(0);
  });

  test("quickfix widens vertical runs along y, moving the later endpoint", () => {
    // Stacked pair, gap 44 along y: the chip is 30 tall, needed 30+32 = 62,
    // deficit 18 → bottom 140+18 = 158, snapped up → 160 (gap 64 ≥ 62).
    const document = makeDocument(
      [box("top", 0, 0), box("bottom", 0, 140)],
      [{ ...connect("edge", "top", "bottom"), label: "X" }],
    );
    const diagnostic = runDiagnostics(document).find((entry) => entry.rule === "unreadable-labels")!;
    const operations = unreadableLabels.quickfix!(document, diagnostic);
    expect(operations).toEqual([{
      type: "updateObject",
      objectId: "bottom",
      patch: { geometry: { x: 0, y: 160, width: 160, height: 96 } },
    }]);

    const fixed = makeDocument(
      [box("top", 0, 0), box("bottom", 0, 160)],
      [{ ...connect("edge", "top", "bottom"), label: "X" }],
    );
    expect(unreadableLabels.check(fixed)).toHaveLength(0);
  });

  test("quickfix returns no ops when the finding no longer applies", () => {
    const stale = {
      id: "W1",
      rule: "unreadable-labels",
      severity: "warning" as const,
      at: ["e", "a", "b"],
      message: 'label "X" chip on e (41×30px) bleeds onto a and b: 44px of corridor where the chip needs 73px',
      quickfixAvailable: true,
    };
    const cleanDocument = makeDocument(
      [box("a", 0, 0), box("b", 320, 0)],
      [{ ...connect("e", "a", "b"), label: "X" }],
    );
    expect(unreadableLabels.quickfix!(cleanDocument, stale)).toEqual([]);
  });
});
