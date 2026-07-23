import { describe, expect, test } from "bun:test";

import { buildBoardModel } from "../src/digest/board-model";
import { runDiagnostics } from "../src/diagnostics/run";
import { rule as hubBalance } from "../src/rules/hub-balance";
import { box, connect, makeDocument } from "./synthetic";

/**
 * Tilted-fan fixture: three children strictly below the hub, x-center span
 * 80..720 (midpoint 400); the hub's x-center sits at 560 — 160px right.
 * Edge direction is mixed and one edge is duplicated to exercise deduping.
 */
function tiltedFan() {
  return makeDocument([
    box("hub", 480, 0),
    box("c1", 0, 320),
    box("c2", 320, 320),
    box("c3", 640, 320),
  ], [
    connect("e1", "hub", "c1"),
    connect("e1b", "hub", "c1"),   // duplicate target — counted once
    connect("e2", "hub", "c2"),
    connect("e3", "c3", "hub"),    // incoming edges count too
  ]);
}

describe("hub-balance rule", () => {
  test("declares its two faces", () => {
    expect(hubBalance.id).toBe("hub-balance");
    expect(hubBalance.tier).toBe("warning");
    expect(hubBalance.guidance).toContain("midpoint");
    expect(hubBalance.guidance).toContain("64px");
    expect(typeof hubBalance.quickfix).toBe("function");
  });

  test("a hub off its fan's midpoint is flagged with the measured offset", () => {
    const findings = hubBalance.check(buildBoardModel(tiltedFan()));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "hub-balance",
      severity: "warning",
      at: ["hub", "c1", "c2", "c3"],
      suggestion: "center over the fan (x-center 400)",
      where: { x: 0, y: 0, width: 800, height: 416 },
    });
    expect(findings[0]!.message).toContain("160px right of its 3 neighbors' midpoint (side S)");
  });

  test("a centered hub is clean; offset exactly 32px is tolerated", () => {
    const centered = buildBoardModel(makeDocument([
      box("hub", 320, 0), box("c1", 0, 320), box("c2", 320, 320), box("c3", 640, 320),
    ], [connect("e1", "hub", "c1"), connect("e2", "hub", "c2"), connect("e3", "hub", "c3")]));
    expect(hubBalance.check(centered)).toHaveLength(0);

    const edge = buildBoardModel(makeDocument([
      box("hub", 352, 0), box("c1", 0, 320), box("c2", 320, 320), box("c3", 640, 320),
    ], [connect("e1", "hub", "c1"), connect("e2", "hub", "c2"), connect("e3", "hub", "c3")]));
    expect(hubBalance.check(edge)).toHaveLength(0);
  });

  test("fewer than three same-side neighbors is not a fan", () => {
    // Two below, one above: no side reaches three.
    const findings = hubBalance.check(buildBoardModel(makeDocument([
      box("hub", 480, 320), box("c1", 0, 640), box("c2", 320, 640), box("c3", 640, 0),
    ], [connect("e1", "hub", "c1"), connect("e2", "hub", "c2"), connect("e3", "hub", "c3")])));
    expect(findings).toHaveLength(0);
  });

  test("a wide fan's outer children still read as same-side (below), not east/west", () => {
    // c1 is far left of the hub (|dx| >> |dy|) but strictly below — side S.
    const findings = hubBalance.check(buildBoardModel(makeDocument([
      box("hub", 1280, 0), box("c1", 0, 224), box("c2", 640, 224), box("c3", 1280, 224),
    ], [connect("e1", "hub", "c1"), connect("e2", "hub", "c2"), connect("e3", "hub", "c3")])));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("side S");
    // span 80..1360 → midpoint 720; hub center 1360 → 640px right.
    expect(findings[0]!.message).toContain("640px right");
  });

  test("quickfix slides the hub onto the fan midpoint", () => {
    const board = buildBoardModel(tiltedFan());
    // v5: hub-balance is demoted from the live registry — run the rule explicitly.
    const diagnostic = runDiagnostics(board, [hubBalance]).find((entry) => entry.rule === "hub-balance")!;
    expect(diagnostic.quickfixAvailable).toBe(true);

    const operations = hubBalance.quickfix!(board, diagnostic);
    expect(operations).toEqual([{
      type: "updateObject",
      objectId: "hub",
      patch: { geometry: { x: 320, y: 0, width: 160, height: 96 } },
    }]);

    const fixed = buildBoardModel(makeDocument([
      box("hub", 320, 0), box("c1", 0, 320), box("c2", 320, 320), box("c3", 640, 320),
    ], [connect("e1", "hub", "c1"), connect("e2", "hub", "c2"), connect("e3", "hub", "c3")]));
    expect(hubBalance.check(fixed)).toHaveLength(0);
  });

  test("quickfix returns no ops when the finding no longer applies", () => {
    const stale = {
      id: "W1",
      rule: "hub-balance",
      severity: "warning" as const,
      at: ["hub", "c1", "c2", "c3"],
      message: "hub sits 160px right of its 3 neighbors' midpoint (side S)",
      quickfixAvailable: true,
    };
    const centered = buildBoardModel(makeDocument([
      box("hub", 320, 0), box("c1", 0, 320), box("c2", 320, 320), box("c3", 640, 320),
    ], [connect("e1", "hub", "c1"), connect("e2", "hub", "c2"), connect("e3", "hub", "c3")]));
    expect(hubBalance.quickfix!(centered, stale)).toEqual([]);
  });
});
